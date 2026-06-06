package resolver

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// recordFileIDs walks every RunType transitively reachable from `sites` and
// notes the visited wire ids against `file` in the per-file scope map. The
// resulting map drives the "scanned files" semantics for IncludeRunTypes /
// IncludeCacheSources — see scopedDump.
func (resolver *Resolver) recordFileIDs(file string, sites []protocol.Site) {
	if file == "" || len(sites) == 0 {
		return
	}
	visited := make(map[string]struct{})
	var walk func(id string)
	walk = func(id string) {
		if id == "" {
			return
		}
		if _, seen := visited[id]; seen {
			return
		}
		visited[id] = struct{}{}
		resolver.cache.RecordFileID(file, id)
		node := resolver.cache.NodeByID(id)
		if node == nil {
			return
		}
		// Walk every ref-carrying slot. Inline scalar RunTypes (no .ID) don't
		// reach further nodes, so following them is safe but pointless —
		// RecordFileID is a no-op for empty ids anyway.
		if node.Child != nil {
			walk(node.Child.ID)
		}
		if node.Index != nil {
			walk(node.Index.ID)
		}
		if node.Return != nil {
			walk(node.Return.ID)
		}
		if node.IndexT != nil {
			walk(node.IndexT.ID)
		}
		for _, child := range node.Children {
			if child != nil {
				walk(child.ID)
			}
		}
		for _, parameter := range node.Parameters {
			if parameter != nil {
				walk(parameter.ID)
			}
		}
		for _, typeArgument := range node.TypeArguments {
			if typeArgument != nil {
				walk(typeArgument.ID)
			}
		}
		for _, argument := range node.Arguments {
			if argument != nil {
				walk(argument.ID)
			}
		}
		for _, extendsArgument := range node.ExtendsArguments {
			if extendsArgument != nil {
				walk(extendsArgument.ID)
			}
		}
		for _, implement := range node.Implements {
			if implement != nil {
				walk(implement.ID)
			}
		}
		// Extends — interface parents. Properties are already flattened
		// into Children by the TS checker, but the parent refs are only
		// reachable through this slot, so the walker needs to follow them
		// explicitly or the parent interface disappears from the per-file
		// projection.
		for _, parent := range node.Extends {
			if parent != nil {
				walk(parent.ID)
			}
		}
		// TypeMeta — surviving object-literal types from a collapsed
		// `primitive & {brand}` intersection. Reachable from the
		// branded primitive node, not from any structural slot, so the
		// walker has to follow them explicitly or the brand object
		// disappears from the per-file projection.
		for _, decorator := range node.TypeMeta {
			if decorator != nil {
				walk(decorator.ID)
			}
		}
		// SafeUnionChildren — same ref objects as Children (already
		// walked), but follow explicitly for safety in case any future
		// pass surfaces nodes here that Children misses.
		for _, child := range node.SafeUnionChildren {
			if child != nil {
				walk(child.ID)
			}
		}
		// UnionDiscriminators — refs to the discriminator property
		// within each union member. The property nodes are also
		// reachable via the member's Children, but follow explicitly
		// in case any future pass surfaces nodes here that Children
		// misses.
		for _, disc := range node.UnionDiscriminators {
			if disc != nil {
				walk(disc.ID)
			}
		}
	}
	for _, site := range sites {
		walk(site.ID)
	}
}

// scopedDump builds a protocol.Dump covering only the supplied files —
// the request's per-call projection, not a session-wide accumulation.
// RunTypes are sorted by id (cache guarantees) and sites are filtered to
// the same file allowlist. Callers wanting the full in-memory cache use
// dispatchDump instead.
func (resolver *Resolver) scopedDump(files []string) protocol.Dump {
	ids := resolver.cache.IDsForUnion(files)
	allowed := make(map[string]struct{}, len(files))
	for _, file := range files {
		allowed[file] = struct{}{}
	}
	sites := make([]protocol.Site, 0, len(resolver.sites))
	for _, site := range resolver.sites {
		if _, ok := allowed[site.File]; ok {
			sites = append(sites, site)
		}
	}
	demands := make([]protocol.Demand, 0, len(resolver.demands))
	for _, demand := range resolver.demands {
		if _, ok := allowed[demand.File]; ok {
			demands = append(demands, demand)
		}
	}
	// Union the demanded ids into the projected id set so a type DEMANDED in
	// one of these files but BUILT in another file is still a render root
	// (its children resolve against the full-cache refTable). Without this a
	// cross-file schema-form validator would silently fall back to identity.
	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	for _, demand := range demands {
		if demand.ID == "" {
			continue
		}
		if _, ok := idSet[demand.ID]; !ok {
			idSet[demand.ID] = struct{}{}
			ids = append(ids, demand.ID)
		}
	}
	runTypes := resolver.cache.NodesForIDs(ids)
	return protocol.Dump{RunTypes: runTypes, Sites: sites, Demands: demands}
}
