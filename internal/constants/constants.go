// Package constants defines values shared across the Go internal packages —
// and, via the `cmd/gen-ts-constants` codegen tool, mirrored to the TS side.
//
// Single source of truth: any cross-cutting constant (emit module settings,
// reserved identifiers, wire markers, …) lives here and is regenerated into
// the JS workspace so the two halves never drift.
package constants

// CacheModuleSettings configures one emitted JS cache module.
type CacheModuleSettings struct {
	Name      string // function/export identifier (e.g. "runTypesModule")
	VarPrefix string // identifier prefix for emitted `export const <prefix><hash>`
	Tag       string // short family tag for emitted inner-fn name + fnID (e.g. "te" → inner "te_<hash>", fnID "te")
}

// CacheModuleGroup mirrors mion's JitFunctionsGroup pattern: a map of named
// entries, each carrying its own settings. Future emit modules add an entry
// here so each can have its own variable prefix without touching the renderer.
type CacheModuleGroup map[string]CacheModuleSettings

// CacheModules is the registry of every emitted cache-module shape.
//
// `VarPrefix` is retained as the prefix the renderer uses for inner
// closure names inside the body of an isType validator (mion's
// printClosure convention — outer "get_<fnName>" wraps inner "<fnName>"
// at jitFnCompiler.ts:732). After the move to the splice-based emitter
// the prefix is NOT used to key cache entries any more: every cache is
// now `{ [rawId]: value }`, keyed by the canonical hash id directly.
var CacheModules = CacheModuleGroup{
	"runTypes": {
		Name:      "runTypesModule",
		VarPrefix: "t_",
		Tag:       "t",
	},
	"isType": {
		Name:      "isTypeModule",
		VarPrefix: "g_it_",
		Tag:       "it",
	},
	"typeErrors": {
		Name:      "typeErrorsModule",
		VarPrefix: "g_te_",
		Tag:       "te",
	},
	"pureFns": {
		Name:      "pureFnsModule",
		VarPrefix: "",
		Tag:       "",
	},
}
