package runtype

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/entrymod"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// CollectEntries builds one entrymod.Entry per cached RunType in dump: the
// tuple args reuse renderFactoryArgs verbatim (slot 3+ of the emitted tuple ==
// the pre-migration `rt(…)` call interior), the per-entry init body reuses
// writeFooter (ref patches / classType / footer literals against `c(id)`), and
// Deps collects the KindRef ids the footer references so the module assembler
// can import each child's module.
//
// Every interned runtype gets an entry — reflection sites can demand any type,
// and an unimported module costs nothing at runtime. Demand scoping happens at
// the dump layer (scopedDump for scanFiles, full cache for dump), exactly as
// the single-module renderer scoped before.
func CollectEntries(dump protocol.Dump) entrymod.Graph {
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

// collectRefDeps gathers the distinct KindRef ids reachable from runType's
// ref-bearing slots — the same slots writeFooter patches (an inline non-ref
// child embeds as a JSON literal and contributes no module dep).
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
