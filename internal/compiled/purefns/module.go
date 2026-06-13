package purefns

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// CollectEntries builds one entrymod.Entry per extracted pure fn. The tuple
// args mirror the pre-migration `factory(<key>, <bodyHash>, <paramNames>,
// <code>, <pureFnDependencies>, <createPureFn>)` call interior.
//
// The createPureFn argument is an inline `function(utl){…}` literal
// whose body is the same `code` string templated in directly. The
// per-entry module is the canonical runtime home of every pure-fn body —
// the Vite plugin separately rewrites the user's
// `registerPureFnFactory(ns, fn, factory)` call so the factory argument
// becomes the imported entry binding (see Replacements), and the runtime
// registers the tuple at that call site.
//
// Deps carry the entry's pure-fn dependencies (the `utl.usePureFn(<key>)`
// lookups its body reaches) so importing one pure fn transitively loads the
// pure fns it calls.
func CollectEntries(entries []Entry) entrymod.Graph {
	graph := make(entrymod.Graph, len(entries))
	for _, entry := range entries {
		args := []string{
			jsquote.Single(entry.Key()),
			jsquote.Single(entry.BodyHash),
			paramNamesJS(entry.ParamNames),
			jsquote.Single(entry.Code),
			depKeysJS(entry.PureFnDependencies),
			createPureFnJS(entry.Code, entry.ParamNames),
		}
		// Pure-fn deps are SOFT: a dep outside the collected set stubs out
		// instead of cascading — its real registration happens at its own
		// registerPureFnFactory call site when the defining module loads.
		graph.Add(&entrymod.Entry{
			Key:      entry.Key(),
			Kind:     entrymod.KindPureFn,
			ArgsText: strings.Join(args, ","),
			SoftDeps: append([]string(nil), entry.PureFnDependencies...),
		})
	}
	return graph
}

// Replacements builds the wire-shaped byte-range rewrites that swap the third
// argument of every successfully-extracted `registerPureFnFactory(ns, fn,
// factory)` call for the pure fn's entry-module import binding. The Vite
// plugin applies these in `rewrite.ts` (adding the matching import via
// ImportFrom) so the user's source ends up as
// `registerPureFnFactory('mion','foo', __rt_pf$2Fmion$2Ffoo)` and the runtime
// registers the tuple at the call site — the body itself lives only in the
// entry module.
//
// Entries without FactoryArgStart/End populated (e.g. a synthetic
// Entry built by a test) are skipped — only real extraction
// results carry the byte offsets needed to rewrite source.
// Text doubles as the export name in BOTH layouts (see entrymod.ExportName);
// bundled selects allSingle module mode, where ImportFrom targets the `pf`
// bundle instead of the per-entry module.
func Replacements(entries []Entry, bundled bool) []protocol.Replacement {
	var out []protocol.Replacement
	for _, entry := range entries {
		if entry.FilePath == "" || entry.FactoryArgEnd <= entry.FactoryArgStart {
			continue
		}
		basename := entrymod.ModuleName(entry.Key(), entrymod.KindPureFn)
		replacement := protocol.Replacement{
			File:       entry.FilePath,
			Start:      entry.FactoryArgStart,
			End:        entry.FactoryArgEnd,
			Text:       entrymod.BindingName(basename),
			ImportFrom: entrymod.ImportSpecifier(basename),
		}
		if bundled {
			replacement.ImportFrom = entrymod.ImportSpecifier(constants.PureFnModuleDir)
		}
		out = append(out, replacement)
	}
	return out
}

// createPureFnJS templates the type-stripped factory body into a
// `function(<params>){<code>}` expression using the AUTHOR's parameter
// names — the body references the factory's own rtUtils binding (e.g.
// `jUtils.getPureFn(…)`), so the literal must redeclare exactly those
// params for the closure to resolve. The runtime invokes it with the
// rtUtils singleton as the single argument (initPureFunction).
func createPureFnJS(code string, paramNames []string) string {
	params := strings.Join(paramNames, ",")
	var b strings.Builder
	b.Grow(len(code) + len(params) + 20)
	b.WriteString("function(")
	b.WriteString(params)
	b.WriteString("){")
	b.WriteString(code)
	b.WriteByte('}')
	return b.String()
}

// depKeysJS renders a `["a::b","c::d"]` JS array literal of quoted dep
// keys. Empty/nil slices become `[]` so consumers can always treat the
// field as iterable.
func depKeysJS(keys []string) string {
	if len(keys) == 0 {
		return "[]"
	}
	parts := make([]string, len(keys))
	for i, key := range keys {
		parts[i] = jsquote.Single(key)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func paramNamesJS(names []string) string {
	if len(names) == 0 {
		return "[]"
	}
	parts := make([]string, len(names))
	for i, name := range names {
		parts[i] = jsquote.Single(name)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
