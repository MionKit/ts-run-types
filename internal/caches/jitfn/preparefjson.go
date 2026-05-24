package jitfn

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/constants"
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
	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:20 — emitPrepareForJson throws
		// "Never type cannot be encoded to JSON.". We surface that
		// via a throw-factory; Supports() returns true so the
		// renderer compiles the entry (and the compile produces the
		// throw via JitThrow in Emit).
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
	case protocol.KindTuple:
		return true
	case protocol.KindTupleMember:
		return true
	case protocol.KindUnion:
		// Unions encode as `[memberIndex, transformedValue]` per mion's
		// nodes/collection/union.ts — see emitUnionPrepareForJson below
		// for the full implementation. The wrapping is per-member: a
		// noop-on-both-sides member doesn't tuple-encode (the decode's
		// shape check distinguishes encoded vs raw values).
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		// Intersection types are resolved by tsgo at the type-checker
		// layer (`A & B` → merged object literal, `string & number` →
		// `never`). Mion throws if its IntersectionRunType is ever
		// invoked. We support it as a defensive noop in case some
		// resolution path produces an unresolved intersection.
		return true
	case protocol.KindTemplateLiteral:
		// Template literals validate at compile time against a regex
		// (handled by isType). The value is always a string at runtime,
		// so prepareForJson / restoreFromJson are atomic-string-like
		// (noop). Same emit shape as KindString.
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
		// object emit. Map / Set get their own arms that materialise
		// the iterable into an Array (JSON-encodable form).
		// NonSerializable IS supported so the renderer emits a
		// throw-factory (mion's NonSerializableRunType throws).
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone,
			protocol.SubKindMap, protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return true
		}
		return false
	case protocol.KindPromise:
		// mion:nodes/native/promise.ts:23 — emitPrepareForJson throws
		// "Jit compilation disabled for Non Serializable types.".
		// Supports() returns true so the renderer compiles and surfaces
		// the throw via a runtime-throwing factory.
		return true
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

	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:20-21 —
		// `emitPrepareForJson(): JitCode { throw new Error('Never
		// type cannot be encoded to JSON.'); }`. Surfaced as a
		// runtime-throwing factory via JitThrow.
		return JitThrow("Never type cannot be encoded to JSON.")

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
		// Map / Set materialise their iterable contents into an Array
		// so JSON.stringify has a serializable form. NonSerializable
		// (Int8Array, WeakMap, …) throws — mion's
		// NonSerializableRunType.emitPrepareForJson at
		// nodes/native/nonSerializable.ts:24 raises the same message.
		switch rt.SubKind {
		case protocol.SubKindDate:
			return JitCode{Code: "", Type: CodeS}
		case protocol.SubKindNone:
			return emitObjectPrepareForJson(rt, ctx, v)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterablePrepareForJson(rt, ctx, v)
		case protocol.SubKindNonSerializable:
			return JitThrow("Jit compilation disabled for Non Serializable types.")
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		// mion:nodes/native/promise.ts:23-24 — `emitPrepareForJson():
		// JitCode { throw new Error('Jit compilation disabled for
		// Non Serializable types.'); }`. Same throw-factory pattern.
		return JitThrow("Jit compilation disabled for Non Serializable types.")

	case protocol.KindObjectLiteral:
		return emitObjectPrepareForJson(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyPrepareForJson(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignaturePrepareForJson(rt, ctx, v)

	case protocol.KindTuple:
		return emitTuplePrepareForJson(rt, ctx, v)

	case protocol.KindTupleMember:
		return emitTupleMemberPrepareForJson(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:nodes/function/function.ts:83-85 —
		// `emitPrepareForJson(): JitCode { throw new Error('Compile
		// function PrepareForJson not supported, call compileParams
		// or compileReturn instead.'); }`. Functions as ROOT or as a
		// union member surface this throw; object/property children
		// of function type are filtered out by the parent emit (see
		// emitObjectPrepareForJson / emitPropertyPrepareForJson) and
		// never reach this arm. Tuple-member also filters via
		// isFunctionLikeKind.
		return JitThrow("Compile function PrepareForJson not supported, call compileParams or compileReturn instead.")

	case protocol.KindUnion:
		// mion:nodes/collection/union.ts:emitPrepareForJson — type-check
		// each member in safe-union order, transform via the member's
		// own prepareForJson, then wrap as `[memberIndex, value]` if
		// either half of the round-trip needs it.
		return emitUnionPrepareForJson(rt, ctx, v)

	case protocol.KindIntersection:
		// Defensive noop — intersections should be pre-resolved by the
		// type checker. See Supports's comment for details.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindTemplateLiteral:
		// String-flavoured at runtime — noop.
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
			// mion:nodes/member/array.ts:148 — `checkNonSkipTypes()`
			// throws "Arrays can not have non serializable types,
			// ie: Symbol[], Function[], etc." when the element's
			// skipJit returns true (Symbol, Function). We mirror via
			// a throw-factory.
			return JitThrow("Arrays can not have non serializable types, ie: Symbol[], Function[], etc.")
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
	// Mion's IndexSignatureRunType.skipJit (indexProperty.ts:30-36)
	// drops symbol-keyed sigs from every JIT fn except toJSCode.
	// for-in doesn't enumerate symbol keys anyway, so the loop body
	// would be dead, but matching mion's emit shape avoids
	// corrupting unrelated string/number keys when the symbol-keyed
	// value type is non-noop (e.g. `[k: symbol]: Date` running
	// `new Date(v[k])` over every enumerable key).
	if isSymbolKeyedIndexSig(rt, ctx) {
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

// emitTuplePrepareForJson mirrors mion's
// nodes/collection/tuple.ts:emitPrepareForJson — iterate tuple members,
// emit each one's code, join with `;`. Empty tuple → noop.
func emitTuplePrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if len(rt.Children) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	var parts []string
	for _, child := range rt.Children {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			parts = append(parts, childJit.Code)
		}
	}
	if len(parts) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitTupleMemberPrepareForJson mirrors mion's
// nodes/member/tupleMember.ts:emitPrepareForJson. Sets the element
// accessor `v[<position>]`, then composes:
//
//   - non-rest, non-optional: pass child code through unchanged
//   - non-rest, optional:
//     `if (v[i] === undefined) { if (v.length > i) v[i] = null } else { <childCode> }`
//     (replace undefined slots with null so the array survives JSON
//     without losing length — JSON.stringify renders [, , 1] as [null,
//     null, 1] in some engines and the inverse round-trip diverges)
//   - rest: for-loop iterating from position to v.length, applying
//     child emit on each element
func emitTupleMemberPrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		// Non-serializable element — leave it for the validator to flag;
		// no transformation here.
		return JitCode{Code: "", Type: CodeS}
	}
	if isRestTupleMember(rt) {
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
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
		return JitCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	if rt.Optional {
		optionalCode := "if (" + accessor + " === undefined) {if (" + v + ".length > " + idxLit + ") " + accessor + " = null}"
		if childJit.Code == "" {
			return JitCode{Code: optionalCode, Type: CodeS}
		}
		return JitCode{Code: optionalCode + " else {" + childJit.Code + "}", Type: CodeS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return childJit
}

// peekEmitterTag returns the short cache-key tag for the JSON-round-trip
// emitters used by union skip-encode decisions. Only PrepareForJsonEmitter
// and RestoreFromJsonEmitter are ever passed here — callers outside that
// set get an empty tag, which disables caching for that call.
func peekEmitterTag(emitter Emitter) string {
	switch emitter.(type) {
	case PrepareForJsonEmitter:
		return "pj"
	case RestoreFromJsonEmitter:
		return "rj"
	case PrepareForJsonFlatEmitter:
		return "pjf"
	case RestoreFromJsonFlatEmitter:
		return "rjf"
	}
	return ""
}

// peekMemberIsNoop compiles `member` against `emitter` on a throwaway
// walker and returns whether the result is a noop (or fully unsupported,
// which is also "no transformation"). Used by the union emit to decide
// per-member tuple-encoding: a member that's noop on BOTH halves
// (prepareForJson and restoreFromJson) doesn't need the `[index, value]`
// wrap — the decode's tuple-shape check distinguishes encoded from raw
// values, so noop members pass through identically.
//
// We inspect the raw body BEFORE Finalize runs — Finalize for the
// serializer pair rewrites `""` to `"return v"` and emits a real
// identity factory (so cross-fn dep calls don't reference missing
// factories), which would make the post-Finalize isNoop flag less
// useful here. The walker's pre-Finalize `Code` field is the source
// of truth for "did the dispatch produce any transformation?"
//
// Results are memoised on `ctx.walker.peekedNoops` keyed by
// `<emitterTag>:<member.ID>` so the three JSON-round-trip union emitters
// share the same per-member answer within a single Compile() pass. The
// throwaway peek walker keeps its own ContextItems / JitDependencies, so
// the caller's walker state stays untouched.
func peekMemberIsNoop(member *protocol.RunType, emitter Emitter, ctx *EmitContext) bool {
	tag := peekEmitterTag(emitter)
	cacheKey := ""
	if tag != "" && ctx != nil && ctx.walker != nil && ctx.walker.peekedNoops != nil {
		cacheKey = tag + ":" + member.ID
		if cached, ok := ctx.walker.peekedNoops[cacheKey]; ok {
			return cached
		}
	}
	var refTable map[string]*protocol.RunType
	if ctx != nil && ctx.walker != nil {
		refTable = ctx.walker.RefTable
	}
	walker := NewWalker(member, "_peek_"+member.ID, emitter)
	walker.RefTable = refTable
	walker.InnerPrefix = ""
	walker.compileNode(walker.RootType, CodeE)
	var result bool
	if walker.IsUnsupported {
		// JitThrow leaves ThrowMessage set — the member actively emits
		// a compile-time throw, which is NOT a noop transformation. The
		// parent union MUST wrap it (needsTuple=true) so the rj decode
		// arm calls CompileChild on the member and the CodeNS sentinel
		// propagates to the parent walker, making the whole union
		// compile to a throw-factory (matches the pj/sj behaviour, where
		// CompileChild is always called and CodeNS propagation is
		// automatic). Plain CodeNS without a message means the kind has
		// no emit at all → safe to treat as noop (identity passes).
		result = walker.ThrowMessage == ""
	} else {
		code := strings.TrimSpace(walker.Code)
		// handleCodeInterpolation wraps the root CodeE/CodeS into the
		// final body shape — for atomic noop emits the wrap is empty (no
		// code was generated) and Code stays "". For non-noop emits the
		// wrap leaves an actual transformation in Code.
		result = code == "" || code == "return v"
	}
	if cacheKey != "" {
		ctx.walker.peekedNoops[cacheKey] = result
	}
	return result
}

// unionMemberNeedsTuple is the single source of truth shared by all three
// JSON-round-trip union emitters (prepareForJson, stringifyJson,
// restoreFromJson) for the per-member `[memberIndex, value]` wrap decision.
// Mirrors mion's `needsTupleEncoding = !!encJit?.code || !!decJit?.code`
// (mion/jitCompilers/json/stringifyJson.ts:295-306) — a member skips the
// wrap iff BOTH prepareForJson and restoreFromJson would compile to a
// noop on it.
//
// Pure on (member, ctx.walker.RefTable). The active emitter on `ctx` is
// intentionally ignored — all three callers route through here so the
// wire shape stays identical between pj/sj encode and rj decode.
func unionMemberNeedsTuple(member *protocol.RunType, ctx *EmitContext) bool {
	pjNoop := peekMemberIsNoop(member, PrepareForJsonEmitter{}, ctx)
	rjNoop := peekMemberIsNoop(member, RestoreFromJsonEmitter{}, ctx)
	return !(pjNoop && rjNoop)
}

// unionMemberIsTypeCheck returns a JS expression that checks whether
// the current value (`v`) satisfies `member`'s type. Mirrors mion's
// `getChildIsTypeWithLooseCheck` (union.ts:56) — the union's dispatch
// runs each member's isType in declaration order (or safe order),
// taking the first match.
//
// Uses a cross-fn lookup into the isType cache via context-item
// declaration. The `?.fn(v) ?? true` fallback handles noop kinds
// (any / unknown) whose isType factories don't exist — their runtime
// semantic is "always passes".
//
// For all-optional object members (weak types in TS), the bare isType
// would match ANY object (no required props to fail on), so an input
// like `{c: 1n}` against union `... | {d?: string}` would incorrectly
// dispatch to the {d?} arm. Mirror mion's getChildIsTypeWithLooseCheck
// (union.ts:56-78) by appending a property-presence gate from
// looseCheckGate — TypeScript's actual weak-type semantic requires
// at least one of the member's own props to be present, or the value
// to be an empty object.
func unionMemberIsTypeCheck(member *protocol.RunType, ctx *EmitContext, v string) string {
	isTypeHash := constants.CacheModules["isType"].Tag + "_" + member.ID
	if !ctx.HasContextItem(isTypeHash) {
		ctx.SetContextItem(isTypeHash, "const "+isTypeHash+" = utl.getJIT("+quoteJS(isTypeHash)+")")
	}
	base := "(" + isTypeHash + "?.fn(" + v + ") ?? true)"
	gate := looseCheckGate(member, ctx, v)
	if gate == "" {
		return base
	}
	return "(" + base + " && " + gate + ")"
}

// looseCheckGate mirrors mion's getChildIsTypeWithLooseCheck
// (union.ts:56-78). Returns the additional property-presence gate
// when a union member is an all-optional object-like type with no
// index signature; returns "" when no gate is needed (member is not
// object-like, has at least one required prop, or carries an index
// signature). The gate shape is:
//
//	(("p1" in v) || ("p2" in v) || ... || Object.keys(v).length === 0)
//
// which encodes TS's weak-type rule: a value matches an all-optional
// shape only if at least one of its declared props is present OR the
// value is the empty object.
func looseCheckGate(member *protocol.RunType, ctx *EmitContext, v string) string {
	if member.Kind != protocol.KindObjectLiteral && member.Kind != protocol.KindClass {
		return ""
	}
	var propNames []string
	for _, childRef := range member.Children {
		child := ctx.ResolveRef(childRef)
		if child == nil {
			continue
		}
		// Index signatures absorb arbitrary keys — TS doesn't require
		// any specific prop to be present, so the loose-check doesn't
		// apply.
		if child.Kind == protocol.KindIndexSignature {
			return ""
		}
		if child.Kind != protocol.KindProperty && child.Kind != protocol.KindPropertySignature {
			continue
		}
		// One required prop means the bare isType already enforces
		// presence — no extra gate needed.
		if !child.Optional {
			return ""
		}
		propNames = append(propNames, child.Name)
	}
	if len(propNames) == 0 {
		return ""
	}
	parts := make([]string, 0, len(propNames)+1)
	for _, name := range propNames {
		parts = append(parts, "("+quoteJS(name)+" in "+v+")")
	}
	parts = append(parts, "Object.keys("+v+").length === 0")
	return "(" + strings.Join(parts, " || ") + ")"
}

// emitUnionPrepareForJson mirrors mion's
// nodes/collection/union.ts:emitPrepareForJson. For each member (in
// safe-union order when available, otherwise declaration order):
//
//   - Get the isType check expression — object-like kinds get an extra
//     `typeof v === 'object' && v !== null &&` null guard
//   - Compile the member's prepareForJson code via the walker (inline
//     or dep-call, depending on inlining)
//   - Wrap the result with `v = [memberIndex, v]` IFF either half of
//     the round-trip is non-noop. Members that are noop on both
//     halves pass through unwrapped; the decode's tuple-shape check
//     distinguishes them
//
// Final clause throws on unmatched value — same as mion. Returns empty
// CodeS when every member is noop on both halves (the whole union is
// identity).
func emitUnionPrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	if len(children) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	// Per-member tuple-wrap decision — mirrors mion's
	// `needsTupleEncoding = !!encJit?.code || !!decJit?.code`
	// (jitCompilers/json/stringifyJson.ts:295-306). A member that's
	// noop on BOTH prepareForJson AND restoreFromJson skips the
	// `[memberIndex, value]` envelope; the decode-side shape gate
	// (emitUnionRestoreFromJson) distinguishes wrapped vs raw at
	// runtime. unionMemberNeedsTuple is the single source of truth
	// shared by all three union emit families so the wire shape stays
	// identical between pj/sj encode and rj decode.
	needsTuple := make([]bool, len(children))
	for i, childRef := range children {
		member := ctx.ResolveRef(childRef)
		if member == nil {
			continue
		}
		needsTuple[i] = unionMemberNeedsTuple(member, ctx)
	}

	// Second pass: build the if/else chain.
	var clauses []string
	for i, childRef := range children {
		member := ctx.ResolveRef(childRef)
		if member == nil {
			continue
		}
		// Compile the member's prepare code (inline or dep-call).
		prepareJit := ctx.CompileChild(childRef, CodeS)
		// The isType discriminator.
		isTypeExpr := unionMemberIsTypeCheck(member, ctx, v)
		guard := isTypeExpr
		if isObjectLikeKind(member.Kind) {
			// Object-shape members need a null guard before the deeper
			// isType walk so a `null` input doesn't crash on property
			// access (mirrors mion's split between simpleItems and
			// objectTypes in getUnionChildren).
			guard = "(typeof " + v + " === 'object' && " + v + " !== null && " + isTypeExpr + ")"
		}

		body := prepareJit.Code
		if body != "" {
			body = strings.TrimSpace(body)
			if !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
				body += ";"
			}
		}
		if needsTuple[i] {
			body += v + " = [" + strconv.Itoa(i) + ", " + v + "]"
		}

		clause := "if (" + guard + ") {" + body + "}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	// Trailing throw for an unmatched input — every union sample MUST
	// satisfy at least one member, otherwise it's a contract violation.
	errVar := ctx.NextLocalVar("uErr")
	if !ctx.HasContextItem(errVar) {
		ctx.SetContextItem(errVar, "const "+errVar+" = 'Can not json encode union: item does not belong to the union'")
	}
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return JitCode{Code: strings.Join(clauses, ""), Type: CodeS}
}

// emitNativeIterablePrepareForJson handles Map / Set — mirrors mion's
// nodes/native/Iterable.ts:49-65 emitPrepareForJson. For each entry,
// the wrapped child types (KindParameter wrappers in rt.Arguments
// carrying SubKindMapKey / SubKindMapValue / SubKindSetItem) get
// their own transform applied. The collected per-entry result is
// staged into a fresh array and v is rebound at the end so
// JSON.stringify sees the array form.
//
// Shape (Map with non-noop value or key, or Set with non-noop element):
//
//	const ml0 = [];
//	for (let e0 of v) {
//	  <key/element transform>; <value transform>;
//	  ml0.push(e0);
//	}
//	v = ml0
//
// Accessors:
//   - Set: the loop binding e0 IS the element (mion's
//     SetKeyRunType.skipSettingAccessor() returns true)
//   - Map: e0 is the [k, v] tuple; accessors are e0[0] (key) and
//     e0[1] (value) — mirrors MapKeyRunType / MapValueRunType
//     useArrayAccessor with index 0 / 1
//
// When every wrapped child compiles to empty (atomic-noop elements
// like Set<string> / Map<string, number>), fall back to the original
// shape `v = Array.from(v)` so the no-loop fast path is preserved
// for already-passing tests.
func emitNativeIterablePrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	isMap := rt.SubKind == protocol.SubKindMap
	var innerTypes []*protocol.RunType
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		innerTypes = []*protocol.RunType{keyType, valueType}
	} else {
		innerTypes = []*protocol.RunType{setItemType(rt, ctx)}
	}

	entryVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childJit := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			childCodes = append(childCodes, childJit.Code)
		}
	}

	if len(childCodes) == 0 {
		return JitCode{Code: v + " = Array.from(" + v + ")", Type: CodeS}
	}

	resVar := ctx.NextLocalVar("ml")
	body := "const " + resVar + " = []; for (let " + entryVar + " of " + v + ") {" +
		strings.Join(childCodes, ";") + ";" + resVar + ".push(" + entryVar + ")} " +
		v + " = " + resVar
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

// Finalize matches mion's handleFunctionReturn for the
// prepareForJson / restoreFromJson family (jitFnCompiler.ts:435):
// empty / identity bodies are rewritten to `return v` and the
// isNoop flag is set to true, but the factory is STILL emitted
// (mion's createJitFunction wraps the body unconditionally). The
// renderer keeps every supported entry as a live factory so
// dep-call chains from parents resolve cleanly — a parent's
// `<childHash>.fn(v[i])` must hit a real fn, even when that fn is
// the identity. Payload cost is ~30 bytes per noop factory.
//
// Mion's `00JsonOnly.spec.ts` asserts `isNoop === true` for shapes
// where no JSON transformation is required (interfaces of primitive
// strings/numbers, tuples of the same, etc.). The flag is exposed
// to consumers on the JitCompiledFn entry so they can short-circuit
// dispatch when round-tripping a noop value.
func (PrepareForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
