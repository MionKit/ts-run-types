package jitfn

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// PrepareForJsonEmitter implements the `prepareForJson` jit function —
// transforms a runtime value into a JSON-serializable form (BigInts
// become decimal strings, Symbols become "Symbol:<desc>" strings, RegExps
// become their toString() form, etc.). The downstream JSON.stringify
// handles Dates via their built-in toJSON() contract.
//
// Paired with RestoreFromJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every valid sample.
//
// Mirrors mion's per-kind emitPrepareForJson methods under
// mion/packages/run-types/src/nodes/**.
type PrepareForJsonEmitter struct{}

// Args mirrors mion's `jitArgs.vλl = 'v'` + empty default in
// run-types/src/constants.functions.ts:45. Same single-arg shape as
// isType — prepareForJson mutates v in place and returns it.
func (PrepareForJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. Phase 1 covers every
// atomic kind whose mion node ships an emitPrepareForJson. Subsequent
// phases extend the set kind by kind.
//
// Kinds that throw at JIT-compile time in mion (never, enumMember) are
// excluded — Supports false means no factory is emitted.
func (PrepareForJsonEmitter) Supports(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindVoid,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol,
		protocol.KindObject, protocol.KindRegexp,
		protocol.KindLiteral, protocol.KindEnum:
		return true
	case protocol.KindClass:
		// Date is atomic in mion — its prepareForJson is a noop (Date
		// has its own toJSON()). Other class subkinds land in future
		// phases (object/Map/Set/etc).
		if rt.SubKind == protocol.SubKindDate {
			return true
		}
		return false
	}
	return false
}

// AnyPrepareForJsonSupported reports whether at least one runtype in
// the slice is supported by the PrepareForJsonEmitter. Used by the
// resolver to set AddedPrepareForJson independently of AddedRunTypes.
func AnyPrepareForJsonSupported(runTypes []*protocol.RunType) bool {
	emitter := PrepareForJsonEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined — same heuristics as
// isType / typeErrors. Mion shares the predicate across all jit fns
// via BaseRunType.isJitInlined.
func (PrepareForJsonEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// ReturnName is `v` — prepareForJson mutates the input value (or
// rebinds via `v = …` for symbol/regexp/bigint), then returns it.
// Same as isType's return.
func (PrepareForJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors the body of
// the corresponding mion `emitPrepareForJson` method under
// mion/packages/run-types/src/nodes/atomic/<name>.ts.
//
// Most atomic kinds are noops (return CodeS with empty code). The
// non-noop atomics:
//   - bigint:  `v = v.toString()` (BigInt is not JSON-encodable; serialize as decimal string)
//   - symbol:  `v = 'Symbol:' + (v.description || '')` (preserve description tag)
//   - regexp:  `v = v.toString()` (serialize as /source/flags string)
//   - void:    `v = undefined` (force the output to undefined)
//
// All non-noop atomics return CodeE so the walker's
// expression-in-statement-context wrap appends `;` before the
// `return v` tail. Mion uses bare expression form for the same
// emits (e.g. `${comp.vλl}.toString()`); we adopt the
// `v = <expression>` form so the walker's expression-shape handling
// produces well-formed JS that actually mutates v before returning.
//
// Unsupported kinds emit CodeNS — the walker latches IsUnsupported
// and the renderer skips this entry's factory.
func (PrepareForJsonEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		// mion: AtomicRunType default `{code: undefined, type: 'S'}`.
		// Finalize collapses empty bodies to `return v` + noop flag.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindBigInt:
		// mion:nodes/atomic/bigInt.ts:20 — `v.toString()`.
		// Reassign so the mutated value is what gets returned.
		return JitCode{Code: v + " = " + v + ".toString()", Type: CodeE}

	case protocol.KindSymbol:
		// mion:nodes/atomic/symbol.ts:25 — `'Symbol:' + (v.description || '')`.
		return JitCode{Code: v + " = 'Symbol:' + (" + v + ".description || '')", Type: CodeE}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:20 — `v.toString()` (e.g. "/abc/i").
		return JitCode{Code: v + " = " + v + ".toString()", Type: CodeE}

	case protocol.KindVoid:
		// mion:nodes/atomic/void.ts:20 — `v = undefined`.
		return JitCode{Code: v + " = undefined", Type: CodeE}

	case protocol.KindClass:
		// Date prepareForJson is a noop (Date has its own toJSON()).
		// Other class subkinds (Map/Set/user classes) are in future
		// phases.
		if rt.SubKind == protocol.SubKindDate {
			return JitCode{Code: "", Type: CodeS}
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindLiteral:
		// mion:nodes/atomic/literal.ts:77 — defers to the underlying
		// kind's emit (`getRunTypeForLiteral(comp).emitPrepareForJson(comp)`).
		// Inline the dispatch here: bigint / symbol / regexp literals
		// behave like the bare kind; primitive literals are noops.
		return emitLiteralPrepareForJson(rt, v)
	}
	return JitCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJson mirrors mion's literal.ts:77 — defers to
// the base kind. The Go side knows the literal's primitive flavour via
// Flags ("bigint", "symbol") and Literal shape (regexp envelope vs
// primitive).
func emitLiteralPrepareForJson(rt *protocol.RunType, v string) JitCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	if flagSet["bigint"] {
		return JitCode{Code: v + " = " + v + ".toString()", Type: CodeE}
	}
	if flagSet["symbol"] {
		return JitCode{Code: v + " = 'Symbol:' + (" + v + ".description || '')", Type: CodeE}
	}
	if entry, isMap := rt.Literal.(map[string]any); isMap {
		if _, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			return JitCode{Code: v + " = " + v + ".toString()", Type: CodeE}
		}
	}
	// Primitive literal (number / string / boolean / null) — noop.
	return JitCode{Code: "", Type: CodeS}
}

// EmitDependencyCall mirrors IsTypeEmitter's. Self-recursive calls
// drop the `.fn` indirection; cross-fn calls register a context-item
// and invoke `<hash>.fn(args)`.
func (PrepareForJsonEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	args := ctx.Vλl
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	if isSelf {
		return ctx.walker.FnName + "(" + args + ")"
	}
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
	}
	return childID + ".fn(" + args + ")"
}

// Finalize collapses empty / noop bodies to `return v` + noop flag.
// Mion's noop pattern for prepareForJson is an empty body — `return v`
// is the identity transform.
func (PrepareForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
