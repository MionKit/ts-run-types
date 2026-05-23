package jitfn

import (
	"strings"

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
	case protocol.KindArray:
		// Gate on a non-nil child — a malformed RunType with KindArray
		// and Child=nil would reach Emit and panic.
		return rt.Child != nil
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Functions are non-serializable. Top-level support emits a
		// noop body (return v unchanged) — JSON.stringify already
		// drops function values. Object-property children of these
		// kinds are filtered out by the object emit.
		return true
	case protocol.KindClass:
		// Date is atomic in mion — its prepareForJson is a noop (Date
		// has its own toJSON()). User classes (SubKindNone) use the
		// object emit. Other subkinds (Map/Set/etc) land in later
		// phases.
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone:
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
		// User classes (SubKindNone) flow through the object emit —
		// mion's class.ts extends InterfaceRunType, same emit body.
		// Other subkinds (Map/Set/etc) land in later phases.
		if rt.SubKind == protocol.SubKindDate {
			return JitCode{Code: "", Type: CodeS}
		}
		if rt.SubKind == protocol.SubKindNone {
			return emitObjectPrepareForJson(rt, ctx, v)
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindObjectLiteral:
		return emitObjectPrepareForJson(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyPrepareForJson(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignaturePrepareForJson(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:nodes/function/function.ts — functions are non-serializable;
		// JSON.stringify drops function values. Top-level emit is a noop
		// (caller's responsibility to know functions don't round-trip).
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindLiteral:
		// mion:nodes/atomic/literal.ts:77 — defers to the underlying
		// kind's emit (`getRunTypeForLiteral(comp).emitPrepareForJson(comp)`).
		// Inline the dispatch here: bigint / symbol / regexp literals
		// behave like the bare kind; primitive literals are noops.
		return emitLiteralPrepareForJson(rt, v)

	case protocol.KindArray:
		// mion:nodes/member/array.ts:emitPrepareForJson. Allocates an
		// index counter, sets the child accessor (`v[i0]`) so the
		// element's CompileChild adopts the subscript, then composes:
		//
		//   for (let i0 = 0; i0 < v.length; i0++) {<childCode>}
		//
		// The child's emit is responsible for the per-element mutation
		// (e.g. bigint child returns `v[i0] = v[i0].toString()`). Empty
		// child code collapses the whole loop to a noop. Non-serializable
		// element kinds (Symbol[] / Function[]) emit CodeNS so the
		// whole factory is skipped — same stance as isType / typeErrors.
		if rt.Child == nil {
			return JitCode{Code: "", Type: CodeS}
		}
		resolvedChild := ctx.ResolveRef(rt.Child)
		if resolvedChild != nil && isNonSerializableElementKind(resolvedChild.Kind) {
			return JitCode{Code: "", Type: CodeNS}
		}
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childJit := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			return JitCode{Code: "", Type: CodeS}
		}
		body := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
		return JitCode{Code: body, Type: CodeS}
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

// emitObjectPrepareForJson mirrors mion's
// nodes/collection/interface.ts:emitPrepareForJson — iterate non-skip
// children, collect each child's emit, join with `;`. Children that
// are method-shaped or static are dropped (mion's getJitChildren).
// A child returning CodeNS propagates upward (unsupported descendant
// short-circuits the whole entry).
func emitObjectPrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	var parts []string
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		parts = append(parts, childJit.Code)
	}
	if len(parts) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitPropertyPrepareForJson mirrors mion's
// nodes/member/property.ts:emitPrepareForJson. Sets the child
// accessor (`v.<name>` / `v["name"]`), recurses, optionally wraps
// with the undefined-guard for optional properties.
func emitPropertyPrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		// mion: PropertySignature wrapping a function — skipped from
		// the parent's children chain.
		return JitCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return JitCode{
			Code: "if (" + accessor + " !== undefined) {" + childJit.Code + "}",
			Type: CodeS,
		}
	}
	return childJit
}

// emitIndexSignaturePrepareForJson mirrors mion's
// nodes/member/indexProperty.ts:emitPrepareForJson — for-in over keys
// invoking the child's emit on each. Template-literal key constraints
// add a per-key regex.test skip; without one, every key is processed.
func emitIndexSignaturePrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return JitCode{Code: "", Type: CodeS}
	}
	keyRegexVar := ""
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == protocol.KindTemplateLiteral {
			if regex, ok := buildTemplateLiteralRegex(indexResolved); ok {
				keyRegexVar = ctx.NextLocalVar("reIdx")
				if !ctx.HasContextItem(keyRegexVar) {
					ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
				}
			}
		}
	}
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	body := "for (const " + keyVar + " in " + v + ") {"
	if keyRegexVar != "" {
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body += childJit.Code + "}"
	return JitCode{Code: body, Type: CodeS}
}

// EmitDependencyCall mirrors IsTypeEmitter's, with one twist: a
// prepareForJson dependency call mutates v INSIDE the inner function
// (e.g. `return v = v.toString()`) so the outer caller must capture
// the return value to actually see the transformed shape — `v[i0]`
// in the parent's frame won't auto-update from the inner function's
// local rebind. We wrap the call site with the assignment:
//
//	<vλl> = <childHash>.fn(<vλl>)
//
// For nested compounds (Date[][] etc.) the inner function mutates its
// argument array in place AND returns the same reference, so the
// outer assignment is a same-ref no-op semantically — but it KEEPS
// the same shape as the atomic-leaf case (e.g. `v[i0] = childHash.fn(v[i0])`
// where the leaf emits `return v = new Date(v)`), which lets the
// array emit treat dependency-call children identically to inline
// atomic children. Self-recursive calls drop the `.fn` indirection.
func (PrepareForJsonEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	args := ctx.Vλl
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	var call string
	if isSelf {
		call = ctx.walker.FnName + "(" + args + ")"
	} else {
		if !ctx.HasContextItem(childID) {
			ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
		}
		call = childID + ".fn(" + args + ")"
	}
	return ctx.Vλl + " = " + call
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
