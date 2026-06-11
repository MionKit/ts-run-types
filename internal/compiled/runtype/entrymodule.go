package runtype

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Per-node module renderer (module mode).
//
// One RunType data node — module key `t_<typeId>` — becomes one ES module
// exporting the node's `rt(…)` positional args plus, when the node has footer
// lines, a trailing gated `initEntry(rtUtils)` carrying them verbatim:
//
//	'use strict';
//	const u = undefined;
//	function initEntry(rtUtils) {
//	  const c = (id) => rtUtils.useRunType(id);
//	  const s = c('Lrjx');
//	  s.children = [c('n4Ku'), c('aD7w')];
//	  s.classType = globalThis.Date;
//	}
//	export const entry = ['Lrjx','t',21,u,'User',initEntry];
//
// Slot order: 0 = id, 1 = the runTypes family tag ('t', routing the runtime
// registrar to addRunType), 2..20 = the legacy rt(…) slots 1..19 verbatim
// (kind … notSupported, trailing-`u` trimmed), trailing slot = initEntry when
// present. The registrar registers every node of a deps closure FIRST and
// runs the initEntry passes after — the two-pass declare-then-link contract
// the aggregate module's footer section implements today, so `c('…')` always
// resolves (cycles included) by the time any initEntry runs.

// runTypesFamilyTag is the registrar routing tag for data nodes ("t").
var runTypesFamilyTag = constants.CacheModules["runTypes"].Tag

// RenderRunTypeEntryModule renders the full ES-module source for one node.
func RenderRunTypeEntryModule(node *protocol.RunType) string {
	args := renderFactoryArgs(node)
	full := make([]string, 0, len(args)+2)
	full = append(full, args[0], quoteJS(runTypesFamilyTag))
	full = append(full, args[1:]...)

	var footer strings.Builder
	writeFooterTo(&footer, node, "s")

	var out strings.Builder
	out.WriteString("'use strict';\nconst u = undefined;\n")
	if footer.Len() > 0 {
		out.WriteString("function initEntry(rtUtils) {\n")
		out.WriteString("const c = (id) => rtUtils.useRunType(id);\n")
		out.WriteString("const s = c(" + quoteJS(node.ID) + ");\n")
		out.WriteString(footer.String())
		out.WriteString("}\n")
		full = append(full, "initEntry")
	}
	out.WriteString("export const entry = [" + strings.Join(full, ",") + "];\n")
	return out.String()
}

// RefDeps returns the distinct node ids this node's ref slots point at —
// the same-tree dependency edges closure assembly follows to build a graph
// site's `t_` module list. Self-references are excluded (plain recursion;
// the registrar's register-before-link pass resolves them via the registry).
// Inline (non-ref) child nodes are recursed into defensively, mirroring
// derefExpr's inline branch.
func RefDeps(node *protocol.RunType) []string {
	if node == nil {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	var collect func(child *protocol.RunType)
	collect = func(child *protocol.RunType) {
		if child == nil {
			return
		}
		if child.Kind == protocol.KindRef {
			if child.ID != "" && child.ID != node.ID && !seen[child.ID] {
				seen[child.ID] = true
				out = append(out, child.ID)
			}
			return
		}
		forEachRefSlot(child, collect)
	}
	forEachRefSlot(node, collect)
	return out
}

// forEachRefSlot visits every reference-bearing child slot of a node — the
// exact slot list writeFooterTo assigns.
func forEachRefSlot(node *protocol.RunType, visit func(*protocol.RunType)) {
	visit(node.Child)
	visit(node.Index)
	visit(node.Return)
	visit(node.IndexT)
	for _, child := range node.Parameters {
		visit(child)
	}
	for _, child := range node.Children {
		visit(child)
	}
	for _, child := range node.SafeUnionChildren {
		visit(child)
	}
	for _, child := range node.UnionDiscriminators {
		visit(child)
	}
	for _, child := range node.TypeMeta {
		visit(child)
	}
	for _, child := range node.TypeArguments {
		visit(child)
	}
	for _, child := range node.Arguments {
		visit(child)
	}
	for _, child := range node.ExtendsArguments {
		visit(child)
	}
	for _, child := range node.Implements {
		visit(child)
	}
	for _, child := range node.Extends {
		visit(child)
	}
}
