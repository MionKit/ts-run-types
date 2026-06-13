package runtype

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/hashid"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// bundleKeyLength sizes the bundle's content-hash key. The key only has to be
// unique within one runtime registry (vs every other entry key), and it
// changes whenever the row set changes — 10 dictionary chars is plenty.
const bundleKeyLength = 10

// hoistMinRefs is the reference-count threshold above which a footer target id
// is hoisted into a `const dN=c('<id>')` local declared once at the top of the
// combined ini body and reused on each edge (instead of repeating the 7-char
// `c('<id>')` lookup inline). Tuned by measurement: hoisting only ids hit ≥3×
// captures the bulk of the savings — the long tail of twice-used ids costs
// more in declaration text than it saves. Cuts both bytes AND `useRunType`
// calls at init.
const hoistMinRefs = 3

// CollectEntries builds the runtype side of the entry-module graph: ONE data
// bundle (`virtual:rt/runtypes.js`) carrying every reflection-demanded node
// as a headless tuple row with a single combined footer initializer, plus one
// facade module per reflection ROOT (`virtual:rt/<rootId>.js` — the module
// the rewrite's binding-only injection already imports at getRunTypeId /
// builder / mock sites). Function-family modules never
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
	nodes := indexNodes(dump.RunTypes)
	// Facades are emitted for reflection-only roots; circular createX types
	// contribute their graph as bundle ROWS (so the circular-reference guard
	// can walk a value at runtime) but get no facade — their fn entry imports
	// the bundle directly via the dep wired in wireCircularRunTypeDeps.
	facadeRoots := reflectionRoots(dump.Sites)
	rowRoots := unionRoots(facadeRoots, circularGuardTypeIDs(dump.Sites, nodes))
	if len(rowRoots) == 0 {
		return graph
	}
	rows := closureRows(rowRoots, nodes)
	hoist := buildHoistTable(rows, nodes)

	var rowsText strings.Builder
	var footer strings.Builder
	footer.WriteString(renderHoistPreamble(hoist))
	for i, id := range rows {
		if i > 0 {
			// One row per line — the data array is otherwise a single
			// unreadable mega-line. Newlines in an array literal are inert,
			// and bundleKey hashes `rows` (the ids), not this text.
			rowsText.WriteString(",\n")
		}
		rowsText.WriteByte('[')
		rowsText.WriteString(strings.Join(renderFactoryArgs(nodes[id]), ","))
		rowsText.WriteByte(']')
		writeFooter(&footer, nodes[id], hoist)
	}
	bundleKey := "rts_" + hashid.QuickHash(strings.Join(rows, ","), bundleKeyLength, "")
	graph.Add(&entrymod.Entry{
		Key:      bundleKey,
		Kind:     entrymod.KindRunTypeBundle,
		ArgsText: quoteJS(bundleKey) + ",[" + rowsText.String() + "]",
		InitBody: footer.String(),
	})
	// Facades are emitted for every reflection root — even one whose node never
	// made it into the dump (defensive): the injected import must resolve, and
	// the runtime degrades to a registry miss exactly as before.
	for _, root := range facadeRoots {
		graph.Add(&entrymod.Entry{
			Key:      root,
			Kind:     entrymod.KindRunTypeFacade,
			ArgsText: quoteJS(root),
			Deps:     []string{bundleKey},
		})
	}
	return graph
}

// indexNodes maps every dumped RunType by its id, skipping nil / id-less nodes.
func indexNodes(runTypes []*protocol.RunType) map[string]*protocol.RunType {
	nodes := make(map[string]*protocol.RunType, len(runTypes))
	for _, runType := range runTypes {
		if runType != nil && runType.ID != "" {
			nodes[runType.ID] = runType
		}
	}
	return nodes
}

// unionRoots merges reflection facade roots with the circular createX type-id
// set into one deduped, sorted row-root list.
func unionRoots(facadeRoots []string, circular map[string]bool) []string {
	set := make(map[string]bool, len(facadeRoots)+len(circular))
	for _, root := range facadeRoots {
		set[root] = true
	}
	for id := range circular {
		set[id] = true
	}
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// CircularGuardTypeIDs returns the set of type ids referenced by a createX
// (function-cache) site whose reflected graph contains a circular node. These
// types get their RunType graph emitted into the data bundle AND (by the
// resolver) linked into the guarded fn entries' dep closure, so the runtime
// circular-reference guard can walk values of cyclic types. Single source of
// truth shared by CollectEntries (bundle rows) and the resolver's dep wiring.
func CircularGuardTypeIDs(dump protocol.Dump) map[string]bool {
	return circularGuardTypeIDs(dump.Sites, indexNodes(dump.RunTypes))
}

// circularGuardTypeIDs collects the createX (FnId-bearing) site type ids whose
// reflected closure contains at least one circular node. Reflection-only sites
// (FnId empty) are excluded — their graph already ships via reflectionRoots.
func circularGuardTypeIDs(sites []protocol.Site, nodes map[string]*protocol.RunType) map[string]bool {
	out := map[string]bool{}
	memo := map[string]bool{}
	for _, site := range sites {
		if site.ID == "" || site.FnId == "" || out[site.ID] {
			continue
		}
		if closureHasCircular(site.ID, nodes, memo) {
			out[site.ID] = true
		}
	}
	return out
}

// closureHasCircular reports whether any node reachable from rootID over the
// ref-bearing slots is flagged circular by the serializer (RunType.IsCircular).
// Memoised by root id across one collection pass.
func closureHasCircular(rootID string, nodes map[string]*protocol.RunType, memo map[string]bool) bool {
	if cached, ok := memo[rootID]; ok {
		return cached
	}
	visited := make(map[string]bool)
	queue := []string{rootID}
	found := false
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		if visited[id] {
			continue
		}
		visited[id] = true
		node := nodes[id]
		if node == nil {
			continue
		}
		if node.IsCircular {
			found = true
			break
		}
		for _, dep := range collectRefDeps(node) {
			if !visited[dep] {
				queue = append(queue, dep)
			}
		}
	}
	memo[rootID] = found
	return found
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
		// Per-node footers reference only the node's own direct children — far
		// too few to benefit from hoisting, so no preamble (nil table).
		writeFooter(&footer, runType, nil)
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
// value-first builders / createMockType. createX sites
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

// tallyRefTargets increments counts for every KindRef target in runType's
// ref-bearing slots — one increment per occurrence writeFooter would render
// as a `c('<id>')` lookup. Unlike collectRefDeps it does NOT dedup within a
// node, so an id referenced from two slots of the same node counts twice,
// matching the footer's actual emission count.
func tallyRefTargets(runType *protocol.RunType, counts map[string]int) {
	add := func(child *protocol.RunType) {
		if child != nil && child.Kind == protocol.KindRef && child.ID != "" {
			counts[child.ID]++
		}
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
}

// buildHoistTable maps each footer target id referenced ≥ hoistMinRefs times
// (and present as a row) to a short local name (`d1`, `d2`, …), hottest id
// first so the most-repeated edges get the shortest names. Returns nil when
// nothing clears the threshold (small bundles), leaving the footer unchanged.
func buildHoistTable(rows []string, nodes map[string]*protocol.RunType) map[string]string {
	counts := make(map[string]int)
	for _, id := range rows {
		tallyRefTargets(nodes[id], counts)
	}
	type idCount struct {
		id    string
		count int
	}
	hot := make([]idCount, 0, len(counts))
	for id, count := range counts {
		// Only hoist present ids: an absent ref stays inline (its `c('<id>')`
		// already surfaces the registry miss; a hoisted decl would force the
		// same eager lookup with no benefit).
		if count >= hoistMinRefs && nodes[id] != nil {
			hot = append(hot, idCount{id: id, count: count})
		}
	}
	if len(hot) == 0 {
		return nil
	}
	sort.Slice(hot, func(i, j int) bool {
		if hot[i].count != hot[j].count {
			return hot[i].count > hot[j].count
		}
		return hot[i].id < hot[j].id
	})
	table := make(map[string]string, len(hot))
	for i, entry := range hot {
		table[entry.id] = "d" + strconv.Itoa(i+1)
	}
	return table
}

// renderHoistPreamble emits the `const d1=c('<id1>'),d2=c('<id2>'),…;\n` line
// declaring every hoisted local, ordered by var index so output is stable.
// Empty string when the table is empty.
func renderHoistPreamble(table map[string]string) string {
	if len(table) == 0 {
		return ""
	}
	decls := make([]string, len(table))
	for id, name := range table {
		index, _ := strconv.Atoi(name[1:]) // "d12" → 12
		decls[index-1] = name + "=" + cacheRef(id)
	}
	return "const " + strings.Join(decls, ",") + ";\n"
}
