package resolver

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/runtype"
	"github.com/mionkit/ts-run-types/internal/compiled/typefns"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Per-entry module assembly (module mode).
//
// A module key names one cache entry: `<fnHash>_<typeId>` for fn entries and
// JSON composites, `<dataTag>_<typeId>` (today `t_<typeId>`) for RunType data
// nodes. The assembler renders each key's ES-module source and follows its
// dependency edges — same-family walker deps, cross-family edges, composite
// primitive refs, data-node ref slots — to build each call site's full
// flattened closure (Site.Deps, leafs-first, roots last). The plugin hoists
// one import per closure key and passes the imported entries through the
// injected tuple; the runtime registrar registers-then-links them on first
// use.
//
// Unrenderable keys (unsupported emitter root, Skip'd leaf, unknown hash)
// cascade their dependents out of the closure — the module-mode equivalent of
// the aggregate renderer's dangling-dep fixpoint — so a shipped module never
// holds a `getRT(...)` edge to an entry that cannot exist. Walker diagnostics
// still flow through opts.DiagSink, so the build log explains any resulting
// runtime "no precompiled entry" throw.

// runTypeDataFamilyTag is the SiteDemand family tag for RunType data-node
// demand (graph-consuming markers) and the data-module key prefix.
var runTypeDataFamilyTag = constants.CacheModules["runTypes"].Tag

// dataKeyPrefix is the module-key prefix for data nodes ("t_").
var dataKeyPrefix = runTypeDataFamilyTag + "_"

// moduleSession memoizes per-entry module renders for one dispatch.
type moduleSession struct {
	opts typefns.RenderOpts
	// modules holds the rendered source per key. Entries are removed again
	// by the failure cascade.
	modules map[string]string
	// deps holds each rendered key's direct dependency keys.
	deps map[string][]string
	// failed marks keys that could not render (or cascaded out).
	failed map[string]bool
}

func newModuleSession(opts typefns.RenderOpts) *moduleSession {
	return &moduleSession{
		opts:    opts,
		modules: map[string]string{},
		deps:    map[string][]string{},
		failed:  map[string]bool{},
	}
}

// AssembleSiteClosures renders every module reachable from the sites' demands,
// fills each site's Deps in place (ordered closure, leafs-first), and returns
// the union module map covering every key referenced by any site's Deps.
func (resolver *Resolver) AssembleSiteClosures(sites []protocol.Site, opts typefns.RenderOpts) map[string]string {
	session := newModuleSession(opts)
	// Pass 1: render the full reachable set so the failure cascade sees
	// every edge before any ordering decision.
	for _, site := range sites {
		for _, root := range siteRootKeys(site) {
			session.ensureTransitive(root)
		}
	}
	session.cascadeFailures()
	// Pass 2: per-site ordered closures over the surviving modules.
	used := map[string]bool{}
	for index := range sites {
		roots := siteRootKeys(sites[index])
		if len(roots) == 0 {
			continue
		}
		ordered := session.orderedClosure(roots)
		sites[index].Deps = ordered
		for _, key := range ordered {
			used[key] = true
		}
	}
	out := make(map[string]string, len(used))
	for key := range used {
		out[key] = session.modules[key]
	}
	return out
}

// ResolveModuleKeys renders the requested keys plus their transitive closures
// and returns every surviving module — the OpResolveModules body. Unknown or
// unrenderable keys are silently omitted; the plugin's load() hook owns the
// stale-module error message.
func (resolver *Resolver) ResolveModuleKeys(keys []string, opts typefns.RenderOpts) map[string]string {
	session := newModuleSession(opts)
	for _, key := range keys {
		session.ensureTransitive(key)
	}
	session.cascadeFailures()
	out := make(map[string]string, len(session.modules))
	for key, source := range session.modules {
		out[key] = source
	}
	return out
}

// siteRootKeys maps a site's structured demand to its root module keys: the
// data-family demand to `<dataTag>_<id>`, every fn demand to `<fnHash>_<id>`.
// Sorted for deterministic Deps ordering across runs.
func siteRootKeys(site protocol.Site) []string {
	if site.ID == "" || len(site.Demand) == 0 {
		return nil
	}
	roots := make([]string, 0, len(site.Demand))
	seen := map[string]bool{}
	for _, demand := range site.Demand {
		var key string
		switch {
		case demand.FamilyTag == runTypeDataFamilyTag:
			key = dataKeyPrefix + site.ID
		case demand.FnHash != "":
			key = demand.FnHash + "_" + site.ID
		default:
			continue
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		roots = append(roots, key)
	}
	sort.Strings(roots)
	return roots
}

// ensureTransitive renders key and everything reachable from it (memoized,
// cycle-safe via the modules/failed maps doubling as the visited set).
func (session *moduleSession) ensureTransitive(key string) {
	if session.failed[key] {
		return
	}
	if _, done := session.modules[key]; done {
		return
	}
	source, deps, ok := session.renderKey(key)
	if !ok {
		session.failed[key] = true
		return
	}
	session.modules[key] = source
	session.deps[key] = deps
	for _, dep := range deps {
		session.ensureTransitive(dep)
	}
}

// renderKey renders one module key into its ES-module source + direct deps.
func (session *moduleSession) renderKey(key string) (string, []string, bool) {
	refTable := session.opts.RefTable
	if refTable == nil {
		return "", nil, false
	}
	// Data node: `<dataTag>_<typeId>`.
	if strings.HasPrefix(key, dataKeyPrefix) {
		id := strings.TrimPrefix(key, dataKeyPrefix)
		node := refTable[id]
		if node == nil {
			return "", nil, false
		}
		refIDs := runtype.RefDeps(node)
		deps := make([]string, len(refIDs))
		for index, refID := range refIDs {
			deps[index] = dataKeyPrefix + refID
		}
		return runtype.RenderRunTypeEntryModule(node), deps, true
	}
	// Fn entry / JSON composite: `<fnHash>_<typeId>`.
	separator := strings.IndexByte(key, '_')
	if separator <= 0 || separator == len(key)-1 {
		return "", nil, false
	}
	fnHash, typeID := key[:separator], key[separator+1:]
	resolved, known := operations.ByFnHash(fnHash)
	if !known {
		return "", nil, false
	}
	node := refTable[typeID]
	if node == nil {
		return "", nil, false
	}
	if resolved.Op.Axis == operations.AxisJsonStrategy {
		tag, ok := constants.JsonCompositeTag(resolved.Op.Name, resolved.Strategy)
		if !ok {
			return "", nil, false
		}
		slots, ok := typefns.CompileJsonCompositeModule(node, tag, session.opts)
		if !ok {
			return "", nil, false
		}
		return typefns.WrapEntryModule(typefns.FormatEntryArray(slots)), slots.RTDeps, true
	}
	if !typefns.FamilyByKey(resolved.Op.Name).Emitter.Supports(node) {
		return "", nil, false
	}
	slots := typefns.CompileEntryModule(resolved.Op.Name, node, refTable, session.opts, resolved.VariantSuffix, resolved.OptionNames)
	if slots.Skip {
		return "", nil, false
	}
	deps := append(append([]string(nil), slots.RTDeps...), slots.CrossFamilyDeps...)
	return typefns.WrapEntryModule(typefns.FormatEntryArray(slots)), deps, true
}

// cascadeFailures drops every module holding an edge to a failed key, to
// fixpoint — the module-mode dangling-dep cascade. A dropped module's own
// dependents fall in later rounds.
func (session *moduleSession) cascadeFailures() {
	for {
		removed := 0
		for key := range session.modules {
			for _, dep := range session.deps[key] {
				if session.failed[dep] {
					session.failed[key] = true
					delete(session.modules, key)
					delete(session.deps, key)
					removed++
					break
				}
			}
		}
		if removed == 0 {
			return
		}
	}
}

// orderedClosure DFS post-orders the surviving modules reachable from roots:
// leafs first, roots last. Cycle-safe (the visited set is marked before
// descending); within a cycle the relative order is arbitrary, which the
// runtime's register-all-then-link two-pass makes irrelevant.
func (session *moduleSession) orderedClosure(roots []string) []string {
	visited := map[string]bool{}
	var order []string
	var visit func(key string)
	visit = func(key string) {
		if visited[key] {
			return
		}
		visited[key] = true
		if _, ok := session.modules[key]; !ok {
			return
		}
		for _, dep := range session.deps[key] {
			visit(dep)
		}
		order = append(order, key)
	}
	for _, root := range roots {
		visit(root)
	}
	return order
}
