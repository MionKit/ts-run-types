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
}

// CacheModuleGroup mirrors mion's JitFunctionsGroup pattern: a map of named
// entries, each carrying its own settings. Future emit modules add an entry
// here so each can have its own variable prefix without touching the renderer.
type CacheModuleGroup map[string]CacheModuleSettings

// CacheModules is the registry of every emitted cache-module shape.
var CacheModules = CacheModuleGroup{
	"runTypes": {
		Name:      "runTypesModule",
		VarPrefix: "t_",
	},
	// isType is a sibling virtual module of `runTypes`. Each entry is a
	// precompiled `get_isType_<hash>(utl)` factory — consumers import
	// the factory and invoke it themselves to materialise a fresh
	// validator. The VarPrefix matches the emitted JS export name's
	// prefix, so consumers can do `cache[ISTYPE_VAR_PREFIX + hash]` to
	// look up a factory. The `get_` prefix mirrors mion's printClosure
	// convention (jitFnCompiler.ts:732): outer "get_<fnName>" is the
	// factory, inner "<fnName>" is the validator the factory returns.
	"isType": {
		Name:      "isTypeModule",
		VarPrefix: "get_isType_",
	},
}
