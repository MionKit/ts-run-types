package jitfn

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// IsTypeEmitter implements the `isType` jit function — produces a
// boolean validator per RunType. The factory shape it emits:
//
//	export function get_isType_<hash>(utl){
//	  'use strict';
//	  return function isType_<hash>(v){ <body> }
//	}
//
// One file owns every isType-specific concern: the args list, the
// per-kind switch in Emit, the noop detection in Finalize, and the
// per-emitter "is this kind supported yet?" predicate in Supports.
// Adding a new mion fn (typeErrors, prepareForJson, …) means one new
// file of this same shape — the Walker in walker.go stays untouched.
type IsTypeEmitter struct{}

// Args returns the single `v` parameter the inner isType function
// takes. Mirrors mion's `jitArgs.vλl = 'v'` + empty default in
// run-types/src/constants.functions.ts:45.
func (IsTypeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. Covers every atomic
// kind whose mion node ships an emitIsType, plus KindClass restricted
// to the Date subkind (mion's nodes/atomic/date.ts treats Date as
// atomic even though deepkit encodes it as a class).
//
// KindEnumMember is intentionally excluded: mion's enumMember.ts
// throws "Enum member operations are not supported" from emitIsType,
// so we never emit a factory for it. KindTemplateLiteral lives under
// nodes/collection/ in mion and is out of scope for the atomic port.
//
// Keep this set in lockstep with the `switch` in Emit — drift would
// silently emit broken JS (renderer thinks it's supported, Emit
// panics) or skip a valid kind.
func (IsTypeEmitter) Supports(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNever, protocol.KindVoid,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol,
		protocol.KindObject, protocol.KindRegexp,
		protocol.KindLiteral, protocol.KindEnum:
		return true
	case protocol.KindArray:
		// Gate on a non-nil child — a malformed RunType with Kind=KindArray
		// and Child=nil would otherwise reach Emit and panic.
		return rt.Child != nil
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindClass:
		// Date is treated as atomic (see KindClass arm in Emit); other
		// classes go through the same emit path as interfaces (Children
		// AND-chain) since ClassRunType extends InterfaceRunType in mion.
		// Map / Set get their own arms that validate element types via
		// `.entries()` / `.values()` iteration. NonSerializable remains
		// unsupported.
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone, protocol.SubKindMap, protocol.SubKindSet:
			return true
		}
		return false
	case protocol.KindPromise:
		// Mion treats Promise<T> as a thenable check at the isType
		// layer — the wrapped T isn't validated synchronously (the
		// promise hasn't resolved yet). Use `Awaited<P>` for the
		// resolved-value type.
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Function-flavoured kinds emit `typeof v === 'function'` at
		// top level. As children of an object, they're skipped from
		// the parent's AND chain via the per-property skip rule (see
		// emitObjectIsType in this file).
		return true
	case protocol.KindTuple:
		return true
	case protocol.KindTupleMember:
		return true
	case protocol.KindUnion:
		// Children must be non-empty for a meaningful union check —
		// an empty union resolves to `never` in mion's semantics.
		return len(rt.Children) > 0
	case protocol.KindTemplateLiteral:
		// Gate on a populated Literal payload — the serializer fills
		// it with the texts + placeholder spans; without it we'd
		// generate `new RegExp('^$')` which only matches the empty
		// string.
		return rt.Literal != nil
	}
	return false
}

// AnyIsTypeSupported reports whether at least one of `runTypes` is
// supported by the IsType emitter. Used by the resolver to set the
// AddedIsType wire signal independently of AddedRunTypes — a runtype
// can be added without the isType cache changing (unsupported kind).
func AnyIsTypeSupported(runTypes []*protocol.RunType) bool {
	emitter := IsTypeEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined. Mion's
// run-types/src/lib/baseRunTypes.ts:52 defines the predicate ONCE
// for every jit fn (no per-class overrides exist in the upstream
// runtype package), so the isType emitter inherits the shared
// behaviour: arrays and named collections become dependency calls,
// everything else inlines. Override here only if a concrete need
// surfaces — there isn't one today.
func (IsTypeEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// Emit is the single big switch over ReflectionKind. Each arm mirrors
// the body of the corresponding mion `emitIsType` method under
// mion-run-types:packages/run-types/src/nodes/atomic/<name>.ts —
// same pattern mion uses for stringifyJson in
// jitCompilers/json/stringifyJson.ts:37.
//
// Single-quoted JS string literals throughout to keep the JSON envelope's
// escape budget small (same rationale as the original KindString arm
// at line 95 and internal/emit/runtypes_module.go:quoteJS).
//
// Kinds NOT supported by IsTypeEmitter.Supports must not reach this
// switch from the renderer's top-level loop, but a parent emitter
// recursing into a child can still hit an unsupported kind — the
// final panic surfaces that as a compile-time-loud failure (per the
// "child kinds the dispatch doesn't handle should panic loudly"
// contract in emitter.go).
func (IsTypeEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	switch rt.Kind {
	case protocol.KindString:
		// mion:nodes/atomic/string.ts:14
		return JitCode{Code: "typeof " + v + " === 'string'", Type: CodeE}

	case protocol.KindNumber:
		// mion:nodes/atomic/number.ts:14. `Number.isFinite` rejects
		// Infinity / -Infinity / NaN and non-numbers without coercion —
		// this encodes the bug-flavor case from number.spec.ts.
		return JitCode{Code: "Number.isFinite(" + v + ")", Type: CodeE}

	case protocol.KindBoolean:
		// mion:nodes/atomic/boolean.ts:14
		return JitCode{Code: "typeof " + v + " === 'boolean'", Type: CodeE}

	case protocol.KindBigInt:
		// mion:nodes/atomic/bigInt.ts:14. Infinity / -Infinity rejection
		// from bigInt.spec.ts falls out of `typeof` automatically.
		return JitCode{Code: "typeof " + v + " === 'bigint'", Type: CodeE}

	case protocol.KindSymbol:
		// mion:nodes/atomic/symbol.ts:18
		return JitCode{Code: "typeof " + v + " === 'symbol'", Type: CodeE}

	case protocol.KindNull:
		// mion:nodes/atomic/null.ts:14
		return JitCode{Code: v + " === null", Type: CodeE}

	case protocol.KindUndefined:
		// mion:nodes/atomic/undefined.ts:14. Note `typeof === 'undefined'`
		// is used here while void uses `=== undefined` directly —
		// different emit text, same accepted value set.
		return JitCode{Code: "typeof " + v + " === 'undefined'", Type: CodeE}

	case protocol.KindVoid:
		// mion:nodes/atomic/void.ts:14. void accepts only undefined;
		// null is explicitly rejected (void.spec.ts).
		return JitCode{Code: v + " === undefined", Type: CodeE}

	case protocol.KindAny, protocol.KindUnknown:
		// mion:nodes/atomic/any.ts:13-15 (UnknownRunType extends AnyRunType).
		// At root nest level mion emits `undefined` (empty body); we emit
		// `true` and rely on Finalize to collapse the body to a noop. The
		// renderer then skips the factory entirely and consumers fall back
		// to a trivial `() => true`. Functionally equivalent.
		return JitCode{Code: "true", Type: CodeE}

	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:13
		return JitCode{Code: "false", Type: CodeE}

	case protocol.KindObject:
		// mion:nodes/atomic/object.ts:13. Explicit null rejection despite
		// JS `typeof null === 'object'` — bug-flavor case from object.spec.ts.
		return JitCode{Code: "(typeof " + v + " === 'object' && " + v + " !== null)", Type: CodeE}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:13
		return JitCode{Code: "(" + v + " instanceof RegExp)", Type: CodeE}

	case protocol.KindClass:
		// KindClass branches on SubKind — Date is the special atomic
		// path; SubKindNone (a plain user class) falls through to the
		// object-emit arm below (ClassRunType inherits InterfaceRunType
		// in mion). Map / Set / NonSerializable subkinds are not yet
		// supported and panic so the bug surfaces at compile time.
		if rt.SubKind == protocol.SubKindDate {
			// mion:nodes/atomic/date.ts:13. Rejects Invalid Date
			// (`new Date('xx')` whose getTime() is NaN).
			//
			// Date is encoded as `KindClass + SubKindDate` (no
			// dedicated KindDate enum value). The cache entry carries
			// every Date prototype method as a Child because the
			// underlying TS shape is a class; this isType emit
			// IGNORES those children and produces a single
			// instanceof+validity check. Future jit fns (typeErrors,
			// prepareForJson, mock) take the same shape — a
			// SubKindDate branch inside their KindClass arm — and
			// the renderer-level supportability check
			// (subtreeFullySupported in module.go) does NOT walk
			// Date's children. Class-encoding, atomic semantics; the
			// per-fn arms are the seam.
			return JitCode{
				Code: "(" + v + " instanceof Date && !isNaN(" + v + ".getTime()))",
				Type: CodeE,
			}
		}
		if rt.SubKind == protocol.SubKindMap {
			return emitMapIsType(rt, ctx, v)
		}
		if rt.SubKind == protocol.SubKindSet {
			return emitSetIsType(rt, ctx, v)
		}
		if rt.SubKind != protocol.SubKindNone {
			// Unsupported subkind (NonSerializable, etc.). Return the
			// CodeNS sentinel so the walker latches IsUnsupported and
			// the renderer skips this entry's factory. Mirrors mion's
			// "no validator available" via a silent skip instead of a
			// hard panic at render time.
			return JitCode{Code: "", Type: CodeNS}
		}
		// Plain user class — fall through to the shared object emit.
		return emitObjectIsType(rt, ctx, v)

	case protocol.KindPromise:
		// mion: Promise validation can only check thenable-ness at
		// runtime — the wrapped T isn't validated synchronously
		// because the promise hasn't resolved. Callers who want to
		// validate the resolved value use `Awaited<P>` (tsgo
		// resolves it to T directly).
		return JitCode{
			Code: "typeof " + v + " === 'object' && " + v + " !== null && typeof " + v + ".then === 'function'",
			Type: CodeE,
		}

	case protocol.KindEnum:
		// mion:nodes/atomic/enum.ts:14. Chain of `=== <value>` over
		// rt.Values — mixed enums carry mixed value types (numeric
		// reverse-mapped + string-enum values) so each entry is
		// formatted via jsLiteralFromAny.
		if len(rt.Values) == 0 {
			return JitCode{Code: "false", Type: CodeE}
		}
		parts := make([]string, 0, len(rt.Values))
		for _, item := range rt.Values {
			lit, err := jsLiteralFromAny(item)
			if err != nil {
				panic(fmt.Sprintf("jitfn: isType emit for KindEnum: %v", err))
			}
			parts = append(parts, v+" === "+lit)
		}
		return JitCode{Code: "(" + strings.Join(parts, " || ") + ")", Type: CodeE}

	case protocol.KindLiteral:
		// mion:nodes/atomic/literal.ts:70-71 (emitIsType) +
		// literal.ts:88-105 (compileIsLiteral).
		return emitLiteral(rt, v)

	case protocol.KindArray:
		// mion:nodes/member/array.ts:emitIsType. Allocates an index
		// counter + a result local, sets the child accessor on the
		// current frame so the child's pushStack adopts `v[i0]` as its
		// Vλl, then composes the canonical block:
		//
		//   if (!Array.isArray(v)) return false;
		//   for (let i0 = 0; i0 < v.length; i0++) {
		//     const res0 = <childCode>;
		//     if (!(res0)) return false;
		//   }
		//   return true;
		//
		// Two collapse paths mirror mion's emitIsType when the child
		// produces no validator code:
		//   - child empty + noIsArrayCheck → `""` (the whole check
		//     evaporates — mion `{code: undefined}`).
		//   - child empty + no noIsArrayCheck → bare `Array.isArray(v)`.
		// The non-serializable child guard (Symbol, Function) lives at
		// resolve time: such arrays never reach Emit because the kind
		// gate strips their child before serialization. If we ever do
		// see one here, the existing inner-kind dispatch panics — which
		// matches mion's runtime "Arrays can not have non serializable
		// types" error surface.
		if rt.Child == nil {
			return JitCode{Code: "", Type: CodeE}
		}
		// Non-serializable element type — mion throws at JIT-compile
		// time with "Arrays can not have non serializable types, ie:
		// Symbol[], Function[], etc." (nodes/member/array.ts:148).
		// We mirror the runtime-observable effect by emitting a
		// `return false` validator (always-invalid) — mion's throw
		// happens at createJitFunction time, but the net effect for
		// any caller is "this type cannot be validated"; emitting
		// always-false captures that without bringing a compile-time
		// throw path into the resolver.
		resolvedChild := ctx.ResolveRef(rt.Child)
		if resolvedChild != nil && isNonSerializableElementKind(resolvedChild.Kind) {
			return JitCode{Code: "return false", Type: CodeRB}
		}
		noIsArrayCheck := hasFlag(rt.Flags, "noIsArrayCheck")
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("res")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childJit := ctx.CompileChild(rt.Child, CodeE)
		// Reset the accessor so any later sibling-children pushes
		// (none today, but cheap to keep correct) start from the
		// parent's Vλl rather than the now-stale subscript.
		ctx.SetChildAccessor("")
		if childJit.Type == CodeNS {
			// Element type can't be validated → array can't be
			// validated → propagate upward.
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			if noIsArrayCheck {
				return JitCode{Code: "", Type: CodeE}
			}
			return JitCode{Code: "Array.isArray(" + v + ")", Type: CodeE}
		}
		var body strings.Builder
		if !noIsArrayCheck {
			body.WriteString("if (!Array.isArray(")
			body.WriteString(v)
			body.WriteString(")) return false;\n")
		}
		body.WriteString("for (let ")
		body.WriteString(iVar)
		body.WriteString(" = 0; ")
		body.WriteString(iVar)
		body.WriteString(" < ")
		body.WriteString(v)
		body.WriteString(".length; ")
		body.WriteString(iVar)
		body.WriteString("++) {\nconst ")
		body.WriteString(resVar)
		body.WriteString(" = ")
		body.WriteString(childJit.Code)
		body.WriteString(";\nif (!(")
		body.WriteString(resVar)
		body.WriteString(")) return false;\n}\nreturn true")
		return JitCode{Code: body.String(), Type: CodeRB}

	case protocol.KindObjectLiteral:
		// mion:nodes/collection/interface.ts:emitIsType. (KindClass
		// non-Date falls into the same function via the KindClass
		// arm above.)
		//
		// Shape:
		//   (typeof v === 'object' && v !== null
		//      && <child1Code> && <child2Code> && …)
		//
		// Children whose kind is method-shaped (MethodSignature /
		// Method / CallSignature) or whose IsStatic is true are
		// skipped — mion's getJitChildren() filters the same way.
		// Property / PropertySignature children whose wrapped value is
		// function-flavoured ALSO collapse to empty code inside their
		// own emit and are filtered from the AND chain here.
		return emitObjectIsType(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		// mion:nodes/member/property.ts:emitIsType (PropertySignature
		// shares the same shape via PropertyRunType). Skips entirely
		// when the wrapped child is function-flavoured (mion's
		// `getJitChild` returns undefined when member.skipJit() is
		// true; function kinds skipJit).
		return emitPropertyIsType(rt, ctx, v)

	case protocol.KindIndexSignature:
		// mion:nodes/member/indexProperty.ts:emitIsType.
		return emitIndexSignatureIsType(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:nodes/function/function.ts:emitIsType. Method /
		// MethodSignature / CallSignature all inherit FunctionRunType,
		// so they share the same emit. v1 ignores the param-count
		// arity guard (mion: `v.length >= minLength`) — almost no
		// real-world isType check relies on it, and our parameter
		// counting needs rest-handling that lands with the function-
		// signature port. Re-add when it surfaces in a test.
		return JitCode{Code: "typeof " + v + " === 'function'", Type: CodeE}

	case protocol.KindTuple:
		// mion:nodes/collection/tuple.ts:emitIsType. Composes into a
		// return-block (CodeRB) for clean composition with rest
		// elements and arbitrary child code shapes. Mion's emit
		// inlines as an expression and uses `(check1 && check2 && …)`
		// but mixing a for-loop (Rest) with an expression chain
		// produces invalid JS; CodeRB sidesteps the issue and lets
		// each member's emit stay in whatever shape is natural.
		return emitTupleIsType(rt, ctx, v)

	case protocol.KindTupleMember:
		// mion:nodes/member/tupleMember.ts:emitIsType. Reads
		// rt.Position to set the element accessor `v[<i>]`, recurses
		// into Child, optionally wraps with the `undefined ||` guard.
		return emitTupleMemberIsType(rt, ctx, v)

	case protocol.KindUnion:
		// mion:nodes/collection/union.ts:emitIsType. Walks the safe
		// children (SafeUnionChildren when present, else Children)
		// and OR-chains their checks. Objects share a single
		// `typeof === 'object' && !== null` guard so a null input
		// doesn't crash inside a property access.
		return emitUnionIsType(rt, ctx, v)

	case protocol.KindTemplateLiteral:
		// mion:nodes/collection/templateLiteral.ts:emitIsType.
		// Compiles the template literal type to an anchored regex at
		// JIT-build time, then runs `typeof v === 'string' &&
		// regex.test(v)` at validator-call time. The regex is hoisted
		// into the closure prologue as a context-item const so it's
		// built once per factory rather than per call.
		return emitTemplateLiteralIsType(rt, ctx, v)
	}
	// Unsupported kind. Return the CodeNS sentinel — the walker
	// latches IsUnsupported and the renderer skips this entry's
	// factory. Replaces the old hard panic: composite parents that
	// descend into this kind (Array.Child, Object.Children, etc.)
	// see CodeNS and propagate it up, so the whole top-level entry
	// gets silently skipped instead of crashing the renderer.
	return JitCode{Code: "", Type: CodeNS}
}

// emitTupleIsType handles KindTuple. Body shape (CodeRB):
//
//	if (!Array.isArray(v)) return false;
//	if (v.length > N) return false;   // only when no rest
//	const r0 = <member0Check>; if (!(r0)) return false;
//	for (let iK = K; iK < v.length; iK++) {  // rest member, if any
//	  const rK = <childCheck>; if (!(rK)) return false;
//	}
//	return true;
//
// Non-rest members emit as expressions (CodeE) and get wrapped in
// a result-var + bail-if-false pair. Rest members emit as
// statement blocks (CodeRB) that are embedded directly. Mirrors
// mion's TupleMember.emitIsType `if (this.isRest()) return childJit`
// branch + RestParamsRunType's ArrayRunType-shaped for-loop, without
// the mion quirk of mixing expression chains with statements.
func emitTupleIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if len(rt.Children) == 0 {
		// Empty tuple: `Array.isArray(v) && v.length === 0`. Mion
		// keeps this as an expression — we do the same since it's
		// noop-free.
		return JitCode{
			Code: "Array.isArray(" + v + ") && " + v + ".length === 0",
			Type: CodeE,
		}
	}
	var body strings.Builder
	body.WriteString("if (!Array.isArray(")
	body.WriteString(v)
	body.WriteString(")) return false;\n")
	if !tupleHasRest(rt, ctx) {
		body.WriteString("if (")
		body.WriteString(v)
		body.WriteString(".length > ")
		body.WriteString(strconv.Itoa(len(rt.Children)))
		body.WriteString(") return false;\n")
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		// Rest members emit a CodeRB for-loop; request RB so the
		// walker doesn't IIFE-wrap it (which would discard the
		// inner `return false`).
		expectedType := CodeE
		if isRestTupleMember(resolved) {
			expectedType = CodeRB
		}
		childJit := ctx.CompileChild(child, expectedType)
		if childJit.Type == CodeNS {
			// Unsupported member — the whole tuple is unvalidatable.
			// Walker has already latched IsUnsupported via compileNode;
			// propagating here keeps the parent's chain consistent.
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		if childJit.Type == CodeRB {
			// Rest member's for-loop. The trailing `return true` is
			// stripped so the block flows into the outer return rather
			// than short-circuiting the rest of the parent's checks.
			body.WriteString(stripTrailingReturnTrue(childJit.Code))
			body.WriteByte('\n')
			continue
		}
		resVar := ctx.NextLocalVar("r")
		body.WriteString("const ")
		body.WriteString(resVar)
		body.WriteString(" = ")
		body.WriteString(childJit.Code)
		body.WriteString(";\nif (!(")
		body.WriteString(resVar)
		body.WriteString(")) return false;\n")
	}
	body.WriteString("return true")
	return JitCode{Code: body.String(), Type: CodeRB}
}

// stripTrailingReturnTrue removes the closing `return true` line a
// CodeRB child emits when it stands alone (Array, IndexSignature,
// rest TupleMember). Embedded inside a parent block the inner
// `return true` would short-circuit the rest of the parent's
// checks — strip it so control falls through.
func stripTrailingReturnTrue(code string) string {
	const suffix = "return true"
	trimmed := strings.TrimRight(code, " \n\t;")
	if strings.HasSuffix(trimmed, suffix) {
		return trimmed[:len(trimmed)-len(suffix)]
	}
	return code
}

// tupleHasRest reports whether any tuple child is a rest element. Used
// to skip the upper-length-bound check (rest elements absorb extras).
func tupleHasRest(rt *protocol.RunType, ctx *EmitContext) bool {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			return true
		}
	}
	return false
}

// isRestTupleMember reports whether a resolved tuple-member RunType
// carries the "rest" flag mion's projection sets on rest elements
// (`[A, ...B[]]`). Mirrors mion's TupleMember.isRest() on the wire.
func isRestTupleMember(rt *protocol.RunType) bool {
	if rt == nil || rt.Kind != protocol.KindTupleMember {
		return false
	}
	return hasFlag(rt.Flags, "rest")
}

// emitTupleMemberIsType handles KindTupleMember. Sets the element
// accessor `v[<Position>]` on the current frame so the wrapped child
// emit sees that as its Vλl, then applies the optional guard if the
// member is optional.
//
// Rest members (Flags contains "rest") emit a for-loop iterating
// from the member's position to v.length, validating each element
// against the wrapped type. Returns CodeRB; the parent tuple emit
// embeds the block directly.
func emitTupleMemberIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		// Non-serializable child — mion emits `v[i] === undefined`.
		return JitCode{Code: v + "[" + positionStr(rt) + "] === undefined", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		// Function-typed tuple elements: mion treats them as non-
		// serializable and emits `=== undefined`. Mirror the runtime
		// behavior.
		return JitCode{Code: v + "[" + positionStr(rt) + "] === undefined", Type: CodeE}
	}
	if isRestTupleMember(rt) {
		// Rest member — emit for-loop from this position to v.length.
		// Mirrors mion's RestParamsRunType (extends ArrayRunType with
		// startIndex(comp) override pointing at the parent tuple's
		// position).
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("r")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childJit := ctx.CompileChild(rt.Child, CodeE)
		ctx.SetChildAccessor("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			// Non-validatable element type — accept any length without
			// per-element checks (mirrors mion's empty-emit behavior).
			return JitCode{Code: "", Type: CodeE}
		}
		var body strings.Builder
		body.WriteString("for (let ")
		body.WriteString(iVar)
		body.WriteString(" = ")
		body.WriteString(positionStr(rt))
		body.WriteString("; ")
		body.WriteString(iVar)
		body.WriteString(" < ")
		body.WriteString(v)
		body.WriteString(".length; ")
		body.WriteString(iVar)
		body.WriteString("++) {\nconst ")
		body.WriteString(resVar)
		body.WriteString(" = ")
		body.WriteString(childJit.Code)
		body.WriteString(";\nif (!(")
		body.WriteString(resVar)
		body.WriteString(")) return false;\n}\nreturn true")
		return JitCode{Code: body.String(), Type: CodeRB}
	}
	accessor := v + "[" + positionStr(rt) + "]"
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return JitCode{
			Code: "(" + accessor + " === undefined || (" + childJit.Code + "))",
			Type: CodeE,
		}
	}
	return JitCode{Code: "(" + childJit.Code + ")", Type: CodeE}
}

// positionStr returns the tuple element's index as a JS literal.
// Falls back to "0" when Position is nil (defensive — shouldn't
// happen for well-formed cache entries).
func positionStr(rt *protocol.RunType) string {
	if rt.Position == nil {
		return "0"
	}
	return strconv.Itoa(*rt.Position)
}

// emitUnionIsType handles KindUnion. Walks the safe-ordered children
// (SafeUnionChildren when populated, otherwise Children) and emits an
// OR-chain. Object-type checks share a single `typeof === 'object' &&
// !== null` guard so a null input doesn't crash inside a property
// access — mirrors mion's
// `(typeof v === 'object' && v !== null && (objCheck1 || objCheck2))`
// shape.
func emitUnionIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	var simpleChecks []string
	var objectChecks []string
	for _, child := range children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		childJit := ctx.CompileChild(child, CodeE)
		if childJit.Type == CodeNS {
			// Any unvalidatable union member fails the whole union —
			// there's no "drop union member" path that preserves the
			// union's exhaustiveness contract. Mion's stance is the
			// same.
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		if isObjectLikeKind(resolved.Kind) {
			objectChecks = append(objectChecks, childJit.Code)
		} else {
			simpleChecks = append(simpleChecks, childJit.Code)
		}
	}
	parts := simpleChecks
	if len(objectChecks) > 0 {
		// Strip the per-object `typeof === 'object' && !== null`
		// guard from each child — we add one shared guard outside.
		// Without this, each object member repeats the guard inside
		// the OR-chain (slower but still correct). Mion strips them
		// the same way; we do a textual strip because the object
		// emit always starts with `(typeof <v> === 'object' && <v> !== null`.
		objectGuard := "typeof " + v + " === 'object' && " + v + " !== null"
		objClauseParts := make([]string, 0, len(objectChecks))
		for _, oc := range objectChecks {
			objClauseParts = append(objClauseParts, oc)
		}
		objChain := strings.Join(objClauseParts, " || ")
		// Keep the children's inner guards in place — pre-mature
		// optimization to strip them is fragile against varying child
		// shapes (interface vs index sig vs class). Mion's actual
		// shape ends up with redundant guards in some cases too. The
		// shared outer guard short-circuits null input before any
		// child runs.
		parts = append(parts, "("+objectGuard+" && ("+objChain+"))")
	}
	if len(parts) == 0 {
		return JitCode{Code: "false", Type: CodeE}
	}
	return JitCode{Code: "(" + strings.Join(parts, " || ") + ")", Type: CodeE}
}

// emitMapIsType handles `Map<K, V>` (KindClass + SubKindMap). The
// serializer projects the type args as two KindParameter wrappers
// (SubKindMapKey / SubKindMapValue) each carrying the K/V child
// type. The emit reaches through the wrappers, generates element
// checks against the wrapper's Child types, and iterates
// `v.entries()` so each key/value pair gets validated.
//
// Body shape (CodeRB):
//
//	if (!(v instanceof Map)) return false;
//	for (const entry0 of v.entries()) {
//	  const k0 = entry0[0]; const val0 = entry0[1];
//	  const rk0 = <keyCheck>;   if (!(rk0))  return false;
//	  const rv0 = <valueCheck>; if (!(rv0))  return false;
//	}
//	return true
//
// If a key/value type has no validator (e.g. KindAny), that arm of
// the check collapses and only the surviving side runs.
func emitMapIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	keyType, valueType := mapKeyValueTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("entry")
	var body strings.Builder
	body.WriteString("if (!(")
	body.WriteString(v)
	body.WriteString(" instanceof Map)) return false;\n")
	body.WriteString("for (const ")
	body.WriteString(entryVar)
	body.WriteString(" of ")
	body.WriteString(v)
	body.WriteString(".entries()) {\n")
	if keyType != nil {
		keyVar := ctx.NextLocalVar("k")
		body.WriteString("const ")
		body.WriteString(keyVar)
		body.WriteString(" = ")
		body.WriteString(entryVar)
		body.WriteString("[0];\n")
		ctx.SetChildAccessor(keyVar)
		keyJit := ctx.CompileChild(keyType, CodeE)
		ctx.SetChildAccessor("")
		if keyJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if keyJit.Code != "" {
			resVar := ctx.NextLocalVar("rk")
			body.WriteString("const ")
			body.WriteString(resVar)
			body.WriteString(" = ")
			body.WriteString(keyJit.Code)
			body.WriteString(";\nif (!(")
			body.WriteString(resVar)
			body.WriteString(")) return false;\n")
		}
	}
	if valueType != nil {
		valVar := ctx.NextLocalVar("val")
		body.WriteString("const ")
		body.WriteString(valVar)
		body.WriteString(" = ")
		body.WriteString(entryVar)
		body.WriteString("[1];\n")
		ctx.SetChildAccessor(valVar)
		valJit := ctx.CompileChild(valueType, CodeE)
		ctx.SetChildAccessor("")
		if valJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if valJit.Code != "" {
			resVar := ctx.NextLocalVar("rv")
			body.WriteString("const ")
			body.WriteString(resVar)
			body.WriteString(" = ")
			body.WriteString(valJit.Code)
			body.WriteString(";\nif (!(")
			body.WriteString(resVar)
			body.WriteString(")) return false;\n")
		}
	}
	body.WriteString("}\nreturn true")
	return JitCode{Code: body.String(), Type: CodeRB}
}

// emitSetIsType handles `Set<T>` (KindClass + SubKindSet). Same
// pattern as Map but with a single Argument wrapper (SubKindSetItem)
// and `.values()` iteration.
func emitSetIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	itemType := setItemType(rt, ctx)
	itemVar := ctx.NextLocalVar("item")
	var body strings.Builder
	body.WriteString("if (!(")
	body.WriteString(v)
	body.WriteString(" instanceof Set)) return false;\n")
	body.WriteString("for (const ")
	body.WriteString(itemVar)
	body.WriteString(" of ")
	body.WriteString(v)
	body.WriteString(".values()) {\n")
	if itemType != nil {
		ctx.SetChildAccessor(itemVar)
		itemJit := ctx.CompileChild(itemType, CodeE)
		ctx.SetChildAccessor("")
		if itemJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if itemJit.Code != "" {
			resVar := ctx.NextLocalVar("ri")
			body.WriteString("const ")
			body.WriteString(resVar)
			body.WriteString(" = ")
			body.WriteString(itemJit.Code)
			body.WriteString(";\nif (!(")
			body.WriteString(resVar)
			body.WriteString(")) return false;\n")
		}
	}
	body.WriteString("}\nreturn true")
	return JitCode{Code: body.String(), Type: CodeRB}
}

// mapKeyValueTypes reaches through the synthetic KindParameter
// wrappers the serializer puts in Map.Arguments — entry [0] is the
// key wrapper (SubKindMapKey), entry [1] is the value wrapper
// (SubKindMapValue) — and returns the wrapped child types. Returns
// nil for missing slots so the caller can collapse the matching arm
// of the emit.
func mapKeyValueTypes(rt *protocol.RunType, ctx *EmitContext) (key, value *protocol.RunType) {
	if len(rt.Arguments) >= 1 {
		wrapper := ctx.ResolveRef(rt.Arguments[0])
		if wrapper != nil {
			key = wrapper.Child
		}
	}
	if len(rt.Arguments) >= 2 {
		wrapper := ctx.ResolveRef(rt.Arguments[1])
		if wrapper != nil {
			value = wrapper.Child
		}
	}
	return key, value
}

// setItemType reaches through the synthetic KindParameter wrapper
// (SubKindSetItem) the serializer puts in Set.Arguments to return
// the wrapped element type.
func setItemType(rt *protocol.RunType, ctx *EmitContext) *protocol.RunType {
	if len(rt.Arguments) == 0 {
		return nil
	}
	wrapper := ctx.ResolveRef(rt.Arguments[0])
	if wrapper == nil {
		return nil
	}
	return wrapper.Child
}

// isObjectLikeKind reports whether kind's isType emit needs the
// shared `typeof === 'object' && !== null` guard before it. Used by
// the union emit to lift the guard out of the per-child checks.
func isObjectLikeKind(kind protocol.ReflectionKind) bool {
	switch kind {
	case protocol.KindObjectLiteral, protocol.KindClass,
		protocol.KindIndexSignature, protocol.KindArray,
		protocol.KindTuple:
		return true
	}
	return false
}

// emitTemplateLiteralIsType handles KindTemplateLiteral. Mirrors
// mion's nodes/collection/templateLiteral.ts:emitIsType:
//
//	const reTL0 = new RegExp("^...$")  // context item, hoisted
//	return (typeof v === 'string' && reTL0.test(v))
//
// The regex source is built once at JIT-build time from the template
// literal's text segments + placeholder kinds; spanToRegex mirrors
// mion's pattern table verbatim (number → `-?(?:\d+\.?\d*|\.\d+)`,
// string/any/infer → `[\s\S]*`, literal → escaped verbatim).
func emitTemplateLiteralIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	regex, ok := buildTemplateLiteralRegex(rt)
	if !ok {
		// Malformed literal payload — fall back to a typeof-string
		// check so the validator is still useful (returns true for
		// any string). Better than panicking inside the renderer.
		return JitCode{Code: "typeof " + v + " === 'string'", Type: CodeE}
	}
	reVar := ctx.NextLocalVar("reTL")
	if !ctx.HasContextItem(reVar) {
		ctx.SetContextItem(reVar, "const "+reVar+" = new RegExp("+quoteJSDouble(regex)+")")
	}
	return JitCode{
		Code: "(typeof " + v + " === 'string' && " + reVar + ".test(" + v + "))",
		Type: CodeE,
	}
}

// buildTemplateLiteralRegex reconstructs the anchored regex source
// from the serializer's wire shape (rt.Literal carries
// `{templateLiteral: {texts: […], placeholders: [{kind, literal?}]}}`).
// Returns false when the payload is missing or malformed — the caller
// degrades gracefully to a plain typeof-string check.
func buildTemplateLiteralRegex(rt *protocol.RunType) (string, bool) {
	if rt.Literal == nil {
		return "", false
	}
	envelope, ok := rt.Literal.(map[string]any)
	if !ok {
		return "", false
	}
	inner, ok := envelope["templateLiteral"].(map[string]any)
	if !ok {
		return "", false
	}
	textsAny, _ := inner["texts"].([]any)
	placeholdersAny, _ := inner["placeholders"].([]any)
	if len(textsAny) == 0 {
		return "", false
	}
	var body strings.Builder
	body.WriteByte('^')
	for i, textAny := range textsAny {
		text, _ := textAny.(string)
		body.WriteString(escapeRegex(text))
		if i < len(placeholdersAny) {
			placeholder, _ := placeholdersAny[i].(map[string]any)
			body.WriteString(spanRegexPattern(placeholder))
		}
	}
	body.WriteByte('$')
	return body.String(), true
}

// spanRegexPattern returns the regex source for one template-literal
// placeholder span. Mirrors mion's spanToRegex (templateLiteral.ts):
//
//	literal  → escaped literal value verbatim
//	number   → -?(?:\d+\.?\d*|\.\d+)
//	bigint   → -?\d+
//	string / any / unknown / (default) → [\s\S]*
func spanRegexPattern(span map[string]any) string {
	if span == nil {
		return `[\s\S]*`
	}
	var kind int
	switch v := span["kind"].(type) {
	case int:
		kind = v
	case float64:
		kind = int(v)
	case int64:
		kind = int(v)
	}
	switch protocol.ReflectionKind(kind) {
	case protocol.KindLiteral:
		if lit, ok := span["literal"]; ok {
			return escapeRegex(stringifyLiteral(lit))
		}
		return `[\s\S]*`
	case protocol.KindNumber:
		return `-?(?:\d+\.?\d*|\.\d+)`
	case protocol.KindBigInt:
		return `-?\d+`
	case protocol.KindString, protocol.KindAny, protocol.KindUnknown:
		return `[\s\S]*`
	}
	return `[\s\S]*`
}

// stringifyLiteral converts a literal span value to its JS
// `String(v)` form for the regex literal embed. Numbers and booleans
// go through fmt; strings pass through verbatim.
func stringifyLiteral(value any) string {
	switch lit := value.(type) {
	case string:
		return lit
	case bool:
		if lit {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(lit)
	case int64:
		return strconv.FormatInt(lit, 10)
	case float64:
		return strconv.FormatFloat(lit, 'g', -1, 64)
	}
	return ""
}

// escapeRegex escapes regex metacharacters in a literal substring.
// Mirrors mion's escapeForRegex (templateLiteral.ts).
func escapeRegex(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|',
			'[', ']', '\\', '/':
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// quoteJSDouble produces a double-quoted JS string literal. Used for
// the regex-source string we pass to `new RegExp(...)` — double
// quotes avoid the escaping noise that single-quoting regex sources
// produces (regexes are dense with backslashes already).
func quoteJSDouble(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// emitObjectIsType emits the canonical object-shape AND-chain for
// KindObjectLiteral / KindClass. Mirrors mion's
// nodes/collection/interface.ts:emitIsType (without strictTypes /
// callable / allOptional special cases — those land with follow-up
// option plumbing and tests). Children are filtered the same way
// mion's getJitChildren filters: method-shaped kinds and static
// members are dropped, and a Property / PropertySignature whose
// wrapped child is function-flavoured returns empty from its own
// emit and is filtered out here too.
func emitObjectIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	// First-pass: detect a CallSignature child. Mion's
	// InterfaceRunType.emitIsType branches on `this.isCallable()` and
	// emits `(callSigCheck && propsCheck)` — a callable interface
	// requires the value to be a function (typeof === 'function')
	// with optional extra properties on top. Plain object check is
	// suppressed in that case (a function is typeof === 'function',
	// not 'object').
	var callSigChild *protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindCallSignature {
			callSigChild = child
			break
		}
	}
	var parts []string
	if callSigChild != nil {
		// Callable shape — use the call-sig's emit as the guard.
		// `typeof v === 'function'` plus property checks on the
		// function-as-object's extra props (functions can carry
		// properties in JS).
		parts = append(parts, "typeof "+v+" === 'function'")
	} else {
		parts = append(parts, "typeof "+v+" === 'object' && "+v+" !== null")
	}
	allOptional := true
	hasContributingChild := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			// Static members don't appear on instances — never
			// participate in isType validation.
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			// Method / MethodSignature / CallSignature directly on the
			// shape (not wrapped in a PropertySignature) — mion's
			// getJitChildren skips them; we match. For the callable
			// case the CallSignature is already represented by the
			// `typeof === 'function'` guard above.
			continue
		}
		childJit := ctx.CompileChild(child, CodeE)
		if childJit.Type == CodeNS {
			// A required (non-skippable) child can't be validated.
			// The whole object is unvalidatable — return CodeNS and
			// let the renderer skip this factory. Walker has already
			// latched IsUnsupported, so the remaining CompileChild
			// calls would short-circuit anyway; we exit early to skip
			// the unused work of iterating siblings.
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		hasContributingChild = true
		if !memberIsOptional(resolved) {
			allOptional = false
		}
		parts = append(parts, childJit.Code)
	}
	// All-optional / no-required-property objects pass the basic
	// `typeof === 'object' && !== null` for arrays too (arrays *are*
	// objects in JS), so we add mion's `allOptionalCode` guard to
	// explicitly reject arrays and other native objects (Date, Map,
	// Set, …). Mirrors interface.ts:allOptionalCode at
	// run-types/src/nodes/collection/interface.ts.
	//
	// IndexSignature children count as "non-optional" for this
	// purpose — `{[k: string]: T}` validates every own key, so arrays
	// would still fail the value check. Empty objects + all-optional
	// shapes need the explicit guard.
	//
	// Suppressed for callable shapes (callSigChild != nil) — the
	// value is a Function, not an Object, and the
	// `Object.prototype.toString.call(v)` check returns
	// '[object Function]' rather than '[object Object]' in that case.
	if callSigChild == nil && (!hasContributingChild || allOptional) {
		guard := "(!Array.isArray(" + v + ") && Object.prototype.toString.call(" + v + ") === '[object Object]')"
		// Insert AFTER the typeof guard so null/non-objects still
		// short-circuit first.
		parts = append(parts[:1], append([]string{guard}, parts[1:]...)...)
	}
	return JitCode{Code: "(" + joinAnd(parts) + ")", Type: CodeE}
}

// memberIsOptional reports whether a child of an object literal /
// class is "optional" for the purposes of mion's
// `areAllChildrenOptional` check. PropertySignature / Property
// honor their Optional flag; IndexSignature counts as non-optional
// because an index sig validates value types on every own key (so
// an array-input would fail the per-key check anyway when the value
// type isn't satisfied).
func memberIsOptional(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindProperty, protocol.KindPropertySignature:
		return rt.Optional
	case protocol.KindIndexSignature:
		return false
	}
	return rt.Optional
}

// emitPropertyIsType handles KindProperty / KindPropertySignature.
// Sets the child accessor on the current frame so the wrapped type's
// pushStack adopts `v.<name>` (or `v["name"]` for unsafe names) as
// its Vλl, then composes the optional guard if the property is
// optional. Returns empty code when the wrapped child is function-
// flavoured so the parent's AND chain drops the slot.
func emitPropertyIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		// mion: PropertySignature.getJitChild returns undefined when
		// member.skipJit() is true (function kinds skipJit). Empty code
		// is the parent's signal to drop this slot from the AND chain.
		return JitCode{Code: "", Type: CodeE}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		// Wrapped value type can't be validated → property can't be
		// validated → propagate upward.
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return JitCode{
			Code: "(" + accessor + " === undefined || " + childJit.Code + ")",
			Type: CodeE,
		}
	}
	return childJit
}

// emitIndexSignatureIsType handles KindIndexSignature. Mirrors mion's
// IndexSignatureRunType.emitIsType (indexProperty.ts). When the key
// type is a template literal (`{[key: `api/${string}`]: T}`), the
// emit also runs a per-key regex.test to enforce the key pattern,
// mirroring mion's `getKeyPatternVar` + the early-return key check
// inside the for-in body.
//
// The skip-named-props code (mion's `getSkipCode`) — which kicks in
// when an interface mixes named props + an index signature so the
// named props aren't double-checked by the index loop — is pending a
// follow-up; today the named-prop check + the index-key check run
// against the same key, which is correct for value-typed keys (the
// value check passes if the named prop's value matches the index's
// value type) but unnecessary work.
func emitIndexSignatureIsType(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return JitCode{Code: "", Type: CodeE}
	}
	// Optional key-pattern regex from a template-literal index key.
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
	childJit := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		// Value type can't be validated → index sig can't be
		// validated → propagate upward.
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" && keyRegexVar == "" {
		return JitCode{Code: "", Type: CodeE}
	}
	var body strings.Builder
	body.WriteString("for (const ")
	body.WriteString(keyVar)
	body.WriteString(" in ")
	body.WriteString(v)
	body.WriteString(") { ")
	if keyRegexVar != "" {
		body.WriteString("if (!")
		body.WriteString(keyRegexVar)
		body.WriteString(".test(")
		body.WriteString(keyVar)
		body.WriteString(")) return false; ")
	}
	if childJit.Code != "" {
		body.WriteString("if (!(")
		body.WriteString(childJit.Code)
		body.WriteString(")) return false; ")
	}
	body.WriteString("} return true")
	return JitCode{Code: body.String(), Type: CodeRB}
}

// joinAnd composes parts into a JS `a && b && c` chain, filtering
// empty entries the same way mion's `.filter(Boolean).join(' && ')`
// pattern does.
func joinAnd(parts []string) string {
	out := parts[:0]
	for _, part := range parts {
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return strings.Join(out, " && ")
}

// isFunctionLikeKind reports whether kind would emit a function-shape
// check (or be skipped entirely as a property's wrapped child). Used
// in two places: object-emit to drop method-shaped Children directly,
// and property-emit to skip when the wrapped value is function-typed.
func isFunctionLikeKind(kind protocol.ReflectionKind) bool {
	switch kind {
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		return true
	}
	return false
}

// isNonSerializableElementKind reports whether kind would trip
// mion's `child.skipJit(comp)` check inside an array's emitIsType
// (nodes/member/array.ts:148: "Arrays can not have non serializable
// types"). KindSymbol joins the function-flavoured kinds — mion's
// symbol.ts overrides skipJit to return true for the same reason
// (symbols can't be JSON-serialized or round-tripped through JIT).
func isNonSerializableElementKind(kind protocol.ReflectionKind) bool {
	if kind == protocol.KindSymbol {
		return true
	}
	return isFunctionLikeKind(kind)
}

// propertyAccessor builds the JS subscript expression for `parent.name`
// (safe identifier names) or `parent["name"]` (anything else). Mirrors
// mion's RunType `useArrayAccessor` / `getChildVarName` split applied
// to property names — protocol.IsSafeName captures the safe-name bit
// at resolver time so the emit doesn't repeat the regex.
func propertyAccessor(parent, name string, safe bool) string {
	if safe && name != "" {
		return parent + "." + name
	}
	return parent + "[" + quoteJS(name) + "]"
}

// hasFlag is a small membership helper for RunType.Flags. Inlined
// here rather than promoted to a shared util because it's the only
// caller today; promote when a second caller lands.
func hasFlag(flags []string, target string) bool {
	for _, flag := range flags {
		if flag == target {
			return true
		}
	}
	return false
}

// EmitDependencyCall returns the JS expression that invokes a
// pre-rendered child JIT entry from inside the parent's body, and
// registers the context-item declaration that resolves the child via
// the jitUtils singleton. Mirrors mion's BaseFnCompiler.callDependency
// (jitFnCompiler.ts:326): cross-function calls go through
// `<hash>.fn(args)`, self-recursive calls drop the `.fn` indirection
// and call the inner function declaration directly (mion's `isSelf`
// branch — the inner function name IS the call target since the body
// is the enclosing closure).
//
// The context-item line is the canonical mion shape:
//
//	const <hash> = utl.getJIT('<hash>')
//
// — registered once per hash thanks to the ordered-items set; sibling
// children in the same parent body see the same `const` declaration.
func (IsTypeEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	args := ctx.Vλl
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	if isSelf {
		// Self-recursion bottoms out by calling the inner function
		// declaration directly (its name is in scope inside its own
		// body). mion uses the full `isType_<hash>` identifier in its
		// callDependency; ours matches via walker.FnName.
		return ctx.walker.FnName + "(" + args + ")"
	}
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
	}
	return childID + ".fn(" + args + ")"
}

// emitLiteral mirrors mion's compileIsLiteral (literal.ts:88-105).
// Branches on the runtime shape of rt.Literal as encoded by the Go-side
// serializer (see internal/caches/runtype/serialize.go:402-428):
//
//   - Flags=["bigint"], Literal=decimal string         → `v === 123n`
//   - Flags=["symbol"], Literal={"symbol": "name"}     → typeof + .description
//   - Literal={"regexp": {"source","flags"}}           → instanceof + source/flags
//   - Literal: bool / int64 / float64 / string         → `v === <literal>`
//
// The regex form compares `.source` and `.flags` directly rather than
// String(v) === String(<regex literal>) (mion's exact phrasing), to
// avoid embedding a regex source literal in emitted JS. Same
// observable semantics — including the escaped-regex spec case
// /['"]\/ \\ \// which only differs in source-text, not in the
// compared .source/.flags strings.
func emitLiteral(rt *protocol.RunType, v string) JitCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	literal := rt.Literal

	if flagSet["bigint"] {
		decimal, ok := literal.(string)
		if !ok {
			panic(fmt.Sprintf("jitfn: bigint literal expected decimal string, got %T", literal))
		}
		return JitCode{Code: v + " === " + decimal + "n", Type: CodeE}
	}

	if flagSet["symbol"] {
		// mion:literal.ts:103 — `typeof v === 'symbol' && v.description === <name>`
		entry, ok := literal.(map[string]any)
		if !ok {
			panic(fmt.Sprintf("jitfn: symbol literal expected map encoding, got %T", literal))
		}
		name, _ := entry["symbol"].(string)
		return JitCode{
			Code: "typeof " + v + " === 'symbol' && " + v + ".description === " + quoteJS(name),
			Type: CodeE,
		}
	}

	if entry, isMap := literal.(map[string]any); isMap {
		if regexpEntry, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			// mion:literal.ts:90
			source, _ := regexpEntry["source"].(string)
			regFlags, _ := regexpEntry["flags"].(string)
			return JitCode{
				Code: v + " instanceof RegExp && " + v + ".source === " + quoteJS(source) +
					" && " + v + ".flags === " + quoteJS(regFlags),
				Type: CodeE,
			}
		}
	}

	lit, err := jsLiteralFromAny(literal)
	if err != nil {
		panic(fmt.Sprintf("jitfn: isType literal emit: %v", err))
	}
	return JitCode{Code: v + " === " + lit, Type: CodeE}
}

// jsLiteralFromAny mirrors the primitive subset of mion's
// run-types/src/lib/utils.ts toLiteral. BigInt / symbol / regexp
// literals are handled on their own paths in emitLiteral because
// their Go encoding carries extra envelope data (Flags markers or
// map shapes). Used by both KindLiteral and KindEnum.
func jsLiteralFromAny(value any) (string, error) {
	switch lit := value.(type) {
	case nil:
		return "null", nil
	case bool:
		if lit {
			return "true", nil
		}
		return "false", nil
	case int:
		return fmt.Sprintf("%d", lit), nil
	case int64:
		return fmt.Sprintf("%d", lit), nil
	case float64:
		// Go's %v drops the ".0" suffix on whole-number floats, matching
		// the JSON Number → JS Number round-trip mion gets via stringify.
		return fmt.Sprintf("%v", lit), nil
	case string:
		return quoteJS(lit), nil
	}
	return "", fmt.Errorf("jsLiteralFromAny: unsupported value type %T", value)
}

// Finalize matches mion's per-fn noop detection in
// handleFunctionReturn (jitFnCompiler.ts:420–423 for the isType case).
// An isType body that's empty, the bare expression `true`, or already
// `return true` is replaced by `return true` and marked noop so the
// renderer can skip emitting a factory whose validator always
// returns true (consumer can default to `() => true` for free).
func (IsTypeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "true" || code == "return true" {
		return "return true", true
	}
	return code, false
}
