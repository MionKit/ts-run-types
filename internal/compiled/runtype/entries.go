package runtype

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/entrymod"
	"github.com/mionkit/ts-run-types/internal/hashid"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// bundleKeyLength sizes the bundle's content-hash key. The key only has to be
// unique within one runtime registry (vs every other entry key), and it
// changes whenever the row set changes — 10 dictionary chars is plenty.
const bundleKeyLength = 10

// CollectEntries builds the runtype side of the entry-module graph: ONE data
// bundle (`virtual:rt/runtypes.js`) carrying every reflection-demanded node
// as a headless tuple row with a single combined footer initializer, plus one
// facade module per reflection ROOT (`virtual:rt/<rootId>.js` — the module
// the rewrite's binding-only injection already imports at getRunTypeId /
// reflectRunTypeId / builder / mock sites). Function-family modules never
// import runtype modules, so the runtype graph is self-contained: the bundle
// imports nothing and each facade imports only the bundle. Every node row
// exists exactly once app-wide — no duplication across roots.
//
// Demand-driven: a dump with no reflection sites emits NO runtype modules
// (createX-only files pay zero reflection payload). Rows are the closure of
// every root over the ref-bearing slots (collectRefDeps), ordered
// alphabetically by id. The bundle's tuple KEY is a content hash over the row
// ids — ids embed shape and binary version, so the key changes exactly when
// the bundle content does and the runtime's processed-keys guard re-registers
// an evolved bundle after an HMR reload (the module NAME stays fixed; the
// Vite plugin invalidates it on addedRunTypes).
func CollectEntries(dump protocol.Dump) entrymod.Graph {
	graph := entrymod.Graph{}
	roots := reflectionRoots(dump.Sites)
	if len(roots) == 0 {
		return graph
	}

	nodes := make(map[string]*protocol.RunType, len(dump.RunTypes))
	for _, runType := range dump.RunTypes {
		if runType != nil && runType.ID != "" {
			nodes[runType.ID] = runType
		}
	}
	rows := closureRows(roots, nodes)

	var rowsText strings.Builder
	var footer strings.Builder
	for i, id := range rows {
		if i > 0 {
			rowsText.WriteByte(',')
		}
		rowsText.WriteByte('[')
		rowsText.WriteString(strings.Join(renderFactoryArgs(nodes[id]), ","))
		rowsText.WriteByte(']')
		writeFooter(&footer, nodes[id])
	}
	bundleKey := "rts_" + hashid.QuickHash(strings.Join(rows, ","), bundleKeyLength, "")
	graph.Add(&entrymod.Entry{
		Key:      bundleKey,
		Kind:     entrymod.KindRunTypeBundle,
		ArgsText: quoteJS(bundleKey) + ",[" + rowsText.String() + "]",
		InitBody: footer.String(),
	})
	// Facades are emitted for every demanded root — even one whose node never
	// made it into the dump (defensive): the injected import must resolve, and
	// the runtime degrades to a registry miss exactly as before.
	for _, root := range roots {
		graph.Add(&entrymod.Entry{
			Key:      root,
			Kind:     entrymod.KindRunTypeFacade,
			ArgsText: quoteJS(root),
			Deps:     []string{bundleKey},
		})
	}
	return graph
}

// CollectEntriesPerNode is the allModules-mode collector: one entrymod.Entry
// per cached RunType (the pre-bundle layout). Tuple args reuse
// renderFactoryArgs verbatim, the per-entry init body reuses writeFooter, and
// Deps collects the KindRef ids the footer references so the assembler
// imports each child's module. Every interned runtype gets an entry — demand
// scoping happens at the dump layer (scopedDump for scanFiles, full cache for
// dump). Measured slower than the bundle on dense reflection graphs (the
// reason the bundle replaced it) — kept as the allModules escape hatch.
func CollectEntriesPerNode(dump protocol.Dump) entrymod.Graph {
	graph := make(entrymod.Graph, len(dump.RunTypes))
	for _, runType := range dump.RunTypes {
		if runType == nil || runType.ID == "" {
			continue
		}
		var footer strings.Builder
		writeFooter(&footer, runType)
		graph.Add(&entrymod.Entry{
			Key:      runType.ID,
			Kind:     entrymod.KindRunType,
			ArgsText: strings.Join(renderFactoryArgs(runType), ","),
			InitBody: footer.String(),
			Deps:     collectRefDeps(runType),
		})
	}
	return graph
}

// reflectionRoots returns the deduped, sorted ids of every reflection-only
// site — sites injecting the bare id (FnId empty), i.e. getRunTypeId /
// reflectRunTypeId / value-first builders / createMockType. createX sites
// demand fn entries instead and never import runtype modules.
func reflectionRoots(sites []protocol.Site) []string {
	var roots []string
	seen := make(map[string]bool)
	for _, site := range sites {
		if site.ID == "" || site.FnId != "" || seen[site.ID] {
			continue
		}
		seen[site.ID] = true
		roots = append(roots, site.ID)
	}
	sort.Strings(roots)
	return roots
}

// closureRows walks the ref-bearing slots from every root over the dumped
// nodes and returns the reachable ids, sorted alphabetically (row order is
// registration order; footers only run after every row registered, so any
// deterministic order works). Refs to ids absent from the dump are skipped —
// the footer still references them and the runtime registry surfaces the
// miss, matching the pre-bundle behavior for un-dumped nodes.
func closureRows(roots []string, nodes map[string]*protocol.RunType) []string {
	visited := make(map[string]bool, len(nodes))
	queue := make([]string, 0, len(roots))
	for _, root := range roots {
		if nodes[root] != nil && !visited[root] {
			visited[root] = true
			queue = append(queue, root)
		}
	}
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		for _, dep := range collectRefDeps(nodes[id]) {
			if nodes[dep] != nil && !visited[dep] {
				visited[dep] = true
				queue = append(queue, dep)
			}
		}
	}
	rows := make([]string, 0, len(visited))
	for id := range visited {
		rows = append(rows, id)
	}
	sort.Strings(rows)
	return rows
}

// collectRefDeps gathers the distinct KindRef ids reachable from runType's
// ref-bearing slots — the same slots writeFooter patches (an inline non-ref
// child embeds as a JSON literal and contributes no row).
func collectRefDeps(runType *protocol.RunType) []string {
	var deps []string
	seen := make(map[string]bool)
	add := func(child *protocol.RunType) {
		if child == nil || child.Kind != protocol.KindRef || child.ID == "" || seen[child.ID] {
			return
		}
		seen[child.ID] = true
		deps = append(deps, child.ID)
	}
	addAll := func(children []*protocol.RunType) {
		for _, child := range children {
			add(child)
		}
	}
	add(runType.Child)
	add(runType.Index)
	add(runType.Return)
	add(runType.IndexT)
	addAll(runType.Parameters)
	addAll(runType.Children)
	addAll(runType.SafeUnionChildren)
	addAll(runType.UnionDiscriminators)
	addAll(runType.TypeMeta)
	addAll(runType.TypeArguments)
	addAll(runType.Arguments)
	addAll(runType.ExtendsArguments)
	addAll(runType.Implements)
	addAll(runType.Extends)
	return deps
}
