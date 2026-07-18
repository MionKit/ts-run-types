package purefunctions

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// CollectEntries builds one entrymodules.Entry per extracted pure fn. The tuple
// args mirror the pre-migration `factory(<key>, <bodyHash>, <paramNames>,
// <code>, <pureFnDependencies>, <createPureFn>)` call interior.
//
// The `code` (slot 3, relative to the key) and `createPureFn` (slot 5) slots
// vary by emit mode, mirroring the type-fn precedent (typefunctions/module.go's
// codeArg/createRTFnArg):
//   - EmitCode (default): the `code` STRING, createPureFn dropped (a trailing
//     hole). The runtime rebuilds the factory from `code` + `paramNames` via
//     `new Function(...paramNames, code)` on first lookup (initPureFunction).
//   - EmitFunctions: `code` dropped (an in-place hole), the live
//     `function(<params>){<code>}` literal shipped. The runtime uses it directly.
//   - EmitBoth: both — the body twice — for runtimes that disallow `new Function`
//     (CSP) yet still read `.code`. This was the unconditional pre-option behavior.
//
// The createPureFn argument is an inline `function(<params>){…}` literal whose
// body is the same `code` string templated in directly. The per-entry module is
// the canonical runtime home of every pure-fn body — the Vite plugin separately
// rewrites the user's `registerPureFnFactory(pureFnId, factory)` call so the
// factory argument becomes the imported entry binding (see Replacements), and the
// runtime registers the tuple at that call site.
//
// Deps carry the entry's pure-fn dependencies (the `utl.usePureFn(<key>)`
// lookups its body reaches) so importing one pure fn transitively loads the
// pure fns it calls.
func CollectEntries(entries []Entry, emitMode constants.EmitMode) entrymodules.Graph {
	graph := make(entrymodules.Graph, len(entries))
	for _, entry := range entries {
		// Gate the code / createPureFn slots on the emit mode. An empty string is
		// a JS array hole; a trailing hole is trimmed (the common code-mode entry
		// ends at pureFnDependencies), while an interior hole (functions mode's
		// dropped `code`) stays in place because a later slot is populated.
		codeArg := ""
		if emitMode.EmitsCode() {
			codeArg = jsquote.Single(entry.Code)
		}
		createPureFnArg := ""
		if emitMode.EmitsFactory() {
			createPureFnArg = createPureFnJS(entry.Code, entry.ParamNames)
		}
		args := trimTrailingHoles([]string{
			jsquote.Single(entry.Key()),
			jsquote.Single(entry.BodyHash),
			paramNamesJS(entry.ParamNames),
			codeArg,
			depKeysJS(entry.PureFnDependencies),
			createPureFnArg,
		})
		// Pure-fn deps are SOFT: a dep outside the collected set stubs out
		// instead of cascading — its real registration happens at its own
		// registerPureFnFactory call site when the defining module loads.
		graph.Add(&entrymodules.Entry{
			Key:      entry.Key(),
			Kind:     entrymodules.KindPureFn,
			ArgsText: strings.Join(args, ","),
			SoftDeps: append([]string(nil), entry.PureFnDependencies...),
		})
	}
	return graph
}

// trimTrailingHoles drops the trailing run of empty-string (JS array hole) args
// so a mode that omits the last slot (code mode's dropped createPureFn) shortens
// the tuple instead of ending on a hole. Interior holes are preserved.
func trimTrailingHoles(args []string) []string {
	end := len(args)
	for end > 0 && args[end-1] == "" {
		end--
	}
	return args[:end]
}

// Replacements builds the wire-shaped byte-range rewrites that swap the
// factory (second) argument of every successfully-extracted
// `registerPureFnFactory(pureFnId, factory)` call for the pure fn's
// entry-module import binding. The Go transform applies these during
// OpTransform (adding the matching import via ImportFrom) so the user's
// source ends up as
// `registerPureFnFactory('rt::foo', __rt_pf$2Frt$2Ffoo)` and the runtime
// registers the tuple at the call site — the body itself lives only in the
// entry module.
//
// Entries without FactoryArgStart/End populated (e.g. a synthetic
// Entry built by a test) are skipped — only real extraction
// results carry the byte offsets needed to rewrite source.
// Text doubles as the export name in BOTH layouts (see entrymodules.ExportName);
// bundled selects allSingle module mode, where ImportFrom targets the `pf`
// bundle instead of the per-entry module.
func Replacements(entries []Entry, bundled bool) []protocol.Replacement {
	var out []protocol.Replacement
	for _, entry := range entries {
		if entry.FilePath == "" || entry.FactoryArgEnd <= entry.FactoryArgStart {
			continue
		}
		basename := entrymodules.ModuleName(entry.Key(), entrymodules.KindPureFn)
		replacement := protocol.Replacement{
			File:       entry.FilePath,
			Start:      entry.FactoryArgStart,
			End:        entry.FactoryArgEnd,
			Text:       entrymodules.BindingName(basename),
			ImportFrom: entrymodules.ImportSpecifier(basename),
		}
		if bundled {
			replacement.ImportFrom = entrymodules.ImportSpecifier(constants.PureFnModuleDir)
		}
		out = append(out, replacement)
		// Anonymous lane: splice the injected `"rt::<hash>"` id into the empty
		// trailing `hash?` slot (a point insertion at the call's closing `)`).
		// No ImportFrom — the injected value is a plain string literal, not an
		// entry binding.
		if entry.HashInjectText != "" {
			out = append(out, protocol.Replacement{
				File:  entry.FilePath,
				Start: entry.HashInjectPos,
				End:   entry.HashInjectPos,
				Text:  entry.HashInjectText,
			})
		}
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
