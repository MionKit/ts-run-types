package jitfn

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TypeErrorsEmitter implements the `typeErrors` jit function — produces
// a validator that accumulates RunTypeError entries into the third arg
// `er` instead of returning a boolean. The factory shape it emits:
//
//	export function get_typeErrors_<hash>(utl){
//	  'use strict';
//	  const cpf_newRunTypeErr = utl.getPureFn('mion','newRunTypeErr');
//	  return function typeErrors_<hash>(v,pth=[],er=[]){ <body>; return er }
//	}
//
// Mirrors `IsTypeEmitter` (istype.go) but with the three-arg shape and
// a finalize that always returns `er`. Each arm of the kind switch
// mirrors the corresponding mion `emitTypeErrors` method under
// mion/packages/run-types/src/nodes/**.
type TypeErrorsEmitter struct{}

// typeErrorsPureFnFilePath is the source path the resolver expects for
// the `cpf_newRunTypeErr` pure-fn registration. The JS side registers
// the factory in run-types-pure-fns.ts (the same file isType uses for
// its own pure-fn deps), and the Go-side integrity check on
// PureFnDependencies resolves it through the same path.
const typeErrorsPureFnFilePath = "packages/ts-go-run-types/src/run-types-pure-fns.ts"

// Args returns the three parameters the inner typeErrors function takes.
// Mirrors mion's `jitErrorArgs` (run-types/src/constants.functions.ts:47):
// vλl=v (current value), pλth=pth (path accumulator, default []),
// εrr=er (error accumulator, default []).
func (TypeErrorsEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "pλth", Name: "pth", Default: "[]"},
		{Key: "εrr", Name: "er", Default: "[]"},
	}
}

// Supports mirrors IsTypeEmitter.Supports — every kind the isType
// emitter handles should have a typeErrors arm too. The set grows
// kind-by-kind as the implementation phases roll out; current scope
// is atomic + array + object/member + class (non-Date).
func (TypeErrorsEmitter) Supports(rt *protocol.RunType) bool {
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
		// and Child=nil would reach Emit and panic.
		return rt.Child != nil
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindClass:
		// Date, non-Date class instances (treated as interface),
		// and Map / Set / Promise variants. Other classes (NonSerializable)
		// land in later phases (Map/Set in phase 6).
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone:
			return true
		}
		return false
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Function-flavoured kinds emit `typeof v === 'function'` at
		// top level (same as mion's nodes/function/function.ts). As
		// children of an object they're skipped via the function-
		// property-dropped rule in emitObjectTypeErrors.
		return true
	case protocol.KindTuple:
		return true
	case protocol.KindTupleMember:
		return true
	}
	return false
}

// AnyTypeErrorsSupported reports whether at least one runtype in the
// slice is supported by the TypeErrors emitter. Used by the resolver
// to set the AddedTypeErrors wire signal alongside AddedIsType.
func AnyTypeErrorsSupported(runTypes []*protocol.RunType) bool {
	emitter := TypeErrorsEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined — same heuristics as
// isType (mion shares the predicate across all jit fns via
// BaseRunType.isJitInlined).
func (TypeErrorsEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// ReturnName is `er` — typeErrors accumulates errors into the third
// arg and returns it. Differs from isType which returns the first arg
// (`v`). See Walker.returnName for how this is consumed.
func (TypeErrorsEmitter) ReturnName() string {
	return "er"
}

// Emit dispatches the per-kind switch. Each arm emits CodeS
// statements that either check the value and append errors via
// callJitErr on mismatch, or recurse into children with the path
// segment threaded through via SetChildPathLiteral. Mirrors mion's
// emitTypeErrors per-node implementations.
//
// Unsupported kinds emit CodeNS — the walker latches the signal and
// the renderer drops the factory entirely. Same contract as
// IsTypeEmitter.
func (TypeErrorsEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindString:
		// mion:nodes/atomic/string.ts:emitTypeErrors
		return JitCode{
			Code: "if (typeof " + v + " !== 'string') " + callJitErr(ctx, "string", ""),
			Type: CodeS,
		}

	case protocol.KindNumber:
		// mion:nodes/atomic/number.ts:emitTypeErrors. Number.isFinite
		// rejects NaN / Infinity / -Infinity along with non-numbers.
		return JitCode{
			Code: "if (!(Number.isFinite(" + v + "))) " + callJitErr(ctx, "number", ""),
			Type: CodeS,
		}

	case protocol.KindBoolean:
		// mion:nodes/atomic/boolean.ts:emitTypeErrors
		return JitCode{
			Code: "if (typeof " + v + " !== 'boolean') " + callJitErr(ctx, "boolean", ""),
			Type: CodeS,
		}

	case protocol.KindBigInt:
		// mion:nodes/atomic/bigInt.ts:emitTypeErrors
		return JitCode{
			Code: "if (typeof " + v + " !== 'bigint') " + callJitErr(ctx, "bigint", ""),
			Type: CodeS,
		}

	case protocol.KindSymbol:
		// mion:nodes/atomic/symbol.ts:emitTypeErrors
		return JitCode{
			Code: "if (typeof " + v + " !== 'symbol') " + callJitErr(ctx, "symbol", ""),
			Type: CodeS,
		}

	case protocol.KindNull:
		// mion:nodes/atomic/null.ts:emitTypeErrors
		return JitCode{
			Code: "if (" + v + " !== null) " + callJitErr(ctx, "null", ""),
			Type: CodeS,
		}

	case protocol.KindUndefined:
		// mion:nodes/atomic/undefined.ts:emitTypeErrors. Uses
		// typeof to allow `var v` references that haven't been
		// assigned yet (matches mion's `typeof === 'undefined'` text).
		return JitCode{
			Code: "if (typeof " + v + " !== 'undefined') " + callJitErr(ctx, "undefined", ""),
			Type: CodeS,
		}

	case protocol.KindVoid:
		// mion:nodes/atomic/void.ts:emitTypeErrors — void accepts
		// only undefined; null is rejected (matches isType).
		return JitCode{
			Code: "if (" + v + " !== undefined) " + callJitErr(ctx, "void", ""),
			Type: CodeS,
		}

	case protocol.KindAny, protocol.KindUnknown:
		// mion:nodes/atomic/any.ts:emitTypeErrors returns a noop.
		// Finalize collapses empty bodies to `return er` and flags
		// the factory as a noop so the renderer skips emitting it;
		// consumers fall through to `() => []` on the JS side.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:emitTypeErrors — every value is
		// an error against `never`. No type check, just record the
		// error unconditionally.
		return JitCode{
			Code: callJitErr(ctx, "never", "") + ";",
			Type: CodeS,
		}

	case protocol.KindObject:
		// mion:nodes/atomic/object.ts — strict TS `object` type:
		// non-null and not a primitive. Same gate as isType.
		return JitCode{
			Code: "if (!(typeof " + v + " === 'object' && " + v + " !== null)) " + callJitErr(ctx, "objectLiteral", ""),
			Type: CodeS,
		}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:emitTypeErrors
		return JitCode{
			Code: "if (!(" + v + " instanceof RegExp)) " + callJitErr(ctx, "regexp", ""),
			Type: CodeS,
		}

	case protocol.KindLiteral:
		return emitLiteralTypeErrors(rt, ctx)

	case protocol.KindEnum:
		// mion:nodes/atomic/enum.ts:emitTypeErrors — OR-chain of
		// `v === val` checks; record an error if NONE match.
		if len(rt.Values) == 0 {
			return JitCode{
				Code: callJitErr(ctx, "enum", "") + ";",
				Type: CodeS,
			}
		}
		parts := make([]string, 0, len(rt.Values))
		for _, item := range rt.Values {
			lit, err := jsLiteralFromAny(item)
			if err != nil {
				panic(fmt.Sprintf("jitfn: typeErrors emit for KindEnum: %v", err))
			}
			parts = append(parts, v+" === "+lit)
		}
		return JitCode{
			Code: "if (!(" + strings.Join(parts, " || ") + ")) " + callJitErr(ctx, "enum", ""),
			Type: CodeS,
		}

	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindDate {
			// mion:nodes/atomic/date.ts:emitTypeErrors — Date instance
			// AND a valid date (rejects `new Date('not a date')`).
			return JitCode{
				Code: "if (!(" + v + " instanceof Date) || isNaN(" + v + ".getTime())) " + callJitErr(ctx, "date", ""),
				Type: CodeS,
			}
		}
		if rt.SubKind == protocol.SubKindNone {
			// Non-Date user classes — same emit as KindObjectLiteral
			// per mion's class.ts (extends InterfaceRunType).
			return emitObjectTypeErrors(rt, ctx, v)
		}
		// Map / Set / NonSerializable land in later phases.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindObjectLiteral:
		return emitObjectTypeErrors(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyTypeErrors(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignatureTypeErrors(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:nodes/function/function.ts:emitTypeErrors — `typeof v
		// === 'function'`. Children (params, return) aren't validated
		// here; treat the whole shape as opaque-callable.
		return JitCode{
			Code: "if (typeof " + v + " !== 'function') " + callJitErr(ctx, jitTypeNameForKind(rt.Kind), ""),
			Type: CodeS,
		}

	case protocol.KindTuple:
		return emitTupleTypeErrors(rt, ctx, v)

	case protocol.KindTupleMember:
		return emitTupleMemberTypeErrors(rt, ctx, v)

	case protocol.KindArray:
		// mion:nodes/member/array.ts:emitTypeErrors. Allocates a loop
		// counter, sets the child accessor (`v[i0]`) so the element's
		// CompileChild adopts the subscript, sets the path literal (the
		// counter var name) so element errors carry [..., i0] in their
		// access-path, then composes:
		//
		//   if (!Array.isArray(v)) {
		//     <callJitErr 'array'>
		//   } else {
		//     for (let i0 = 0; i0 < v.length; i0++) {
		//       <childCode>
		//     }
		//   }
		//
		// Two collapse paths mirror mion: child empty + noIsArrayCheck
		// → "" (whole check evaporates); child empty + no noIsArrayCheck
		// → bare `if (!Array.isArray(v)) <err>;` (array-only check).
		if rt.Child == nil {
			return JitCode{Code: "", Type: CodeS}
		}
		resolvedChild := ctx.ResolveRef(rt.Child)
		if resolvedChild != nil && isNonSerializableElementKind(resolvedChild.Kind) {
			// Symbol[] / Function[] cannot be validated — mion throws at
			// JIT-compile time. Emit an unconditional error so the
			// runtime call surfaces the rejection consistently with
			// `() => false` on the isType side.
			return JitCode{Code: callJitErr(ctx, "array", "") + ";", Type: CodeS}
		}
		noIsArrayCheck := hasFlag(rt.Flags, "noIsArrayCheck")
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		ctx.SetChildPathLiteral(iVar)
		childJit := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		// If the child contributes no body (e.g. KindAny element),
		// reduce to the bare array guard or a noop.
		if childJit.Code == "" {
			if noIsArrayCheck {
				return JitCode{Code: "", Type: CodeS}
			}
			return JitCode{
				Code: "if (!Array.isArray(" + v + ")) " + callJitErr(ctx, "array", ""),
				Type: CodeS,
			}
		}
		itemsCode := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
		if noIsArrayCheck {
			return JitCode{Code: itemsCode, Type: CodeS}
		}
		return JitCode{
			Code: "if (!Array.isArray(" + v + ")) {" + callJitErr(ctx, "array", "") + "} else {" + itemsCode + "}",
			Type: CodeS,
		}
	}
	return JitCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall returns the JS expression that invokes a
// pre-rendered child typeErrors entry. Wraps the call with a
// `pth.push(...) ; <call> ; pth.splice(-N)` envelope when the current
// static-path segments are non-empty so the child's errors carry the
// right access-path prefix. Mirrors mion's `BaseFnCompiler.callDependency`
// branch at jitFnCompiler.ts:388-397.
func (TypeErrorsEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := ctx.Vλl + "," + pthArg + "," + errArg
	var callCode string
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	if isSelf {
		callCode = ctx.walker.FnName + "(" + args + ")"
	} else {
		if !ctx.HasContextItem(childID) {
			ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
		}
		callCode = childID + ".fn(" + args + ")"
	}
	pathLit := ctx.AccessPathLiteral("")
	pathLen := ctx.AccessPathLength("")
	if pathLen == 0 {
		return callCode
	}
	// Push static segments onto the runtime path before calling, pop
	// them after via splice(-N). Returned as a comma-expression so the
	// caller can drop it into an expression slot (parent's CodeE arm)
	// or a statement slot (CodeS) without restructuring.
	pushArgs := pathLit[1 : len(pathLit)-1] // strip `[` … `]` for push(...args)
	return "(" + pthArg + ".push(" + pushArgs + ")," + callCode + "," + pthArg + ".splice(-" + strconv.Itoa(pathLen) + "))"
}

// Finalize wraps the raw body. Empty body → noop ("return er", true);
// otherwise the walker has already appended `return er` via the
// statement-shape handling in handleCodeInterpolation, so we just
// normalise whitespace and return.
func (TypeErrorsEmitter) Finalize(rawCode string) (string, bool) {
	code := normaliseWhitespace(rawCode)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return "return er", true
	}
	return code, false
}

// callJitErr builds the JS call to cpf_newRunTypeErr that appends one
// RunTypeError entry to the `er` array. Mirrors mion's
// JitErrorsFnCompiler.callJitErr / callJitErrWithPath
// (jitFnCompiler.ts:610-629).
//
// Args at the call site:
//   - pth (runtime path array)
//   - er  (error accumulator)
//   - expected (kindname string literal)
//   - accessPath? (static path segments collected from the walker stack)
//
// `extra` adds a trailing segment to the static path (used for
// "unknown key" / "map key" markers that aren't part of the runtime
// path but should appear in the error). Empty `extra` → no trailing
// segment, AccessPathLiteral handles the empty-array short-circuit.
func callJitErr(ctx *EmitContext, expected string, extra string) string {
	ctx.AddPureFnDependency("mion", "newRunTypeErr", typeErrorsPureFnFilePath)
	const key = "cpf_newRunTypeErr"
	if !ctx.HasContextItem(key) {
		// jitUtils.getPureFn takes a single composite key
		// `<namespace>::<fnName>` (see pureFnKey helper in
		// packages/ts-go-run-types/src/jit/jitUtils.ts:45).
		ctx.SetContextItem(key, "const "+key+" = utl.getPureFn('mion::newRunTypeErr')")
	}
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS(expected)}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitLiteralTypeErrors mirrors mion's compileTypeErrorsLiteral
// (nodes/atomic/literal.ts:107). Reuses emitLiteral's branching for
// the bigint / symbol / regexp / primitive cases — emitLiteral returns
// a JS boolean expression (the isType check); we wrap it in
// `if (!(<expr>)) <error>`.
func emitLiteralTypeErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
	isTypeExpr := emitLiteral(rt, ctx.Vλl)
	if isTypeExpr.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{
		Code: "if (!(" + isTypeExpr.Code + ")) " + callJitErr(ctx, "literal", ""),
		Type: CodeS,
	}
}

// emitObjectTypeErrors mirrors mion's
// nodes/collection/interface.ts:emitTypeErrors. Builds the canonical
// object-shape statement: a `typeof === 'object' && !== null` guard
// (or `typeof === 'function'` for callable interfaces) that emits an
// error on mismatch, otherwise runs each child's emitTypeErrors
// statement.
//
// Children are filtered the same way mion's getJitChildren filters
// (matching emitObjectIsType in istype.go): static + method-shaped
// kinds dropped; PropertySignature wrapping a function-typed value
// also dropped via its own empty emit.
func emitObjectTypeErrors(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	// Detect a CallSignature child for the callable-interface case.
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

	// Compile per-child error-accumulation code, filtering the same
	// way emitObjectIsType does.
	var childrenParts []string
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			// Method / MethodSignature / CallSignature on the shape —
			// skip from the children body (callable case is handled by
			// the typeof === 'function' guard below).
			continue
		}
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		childrenParts = append(childrenParts, childJit.Code)
	}
	childrenCode := strings.Join(childrenParts, ";")

	var objectCheck string
	if callSigChild != nil {
		objectCheck = "typeof " + v + " === 'function'"
	} else {
		objectCheck = "typeof " + v + " === 'object' && " + v + " !== null"
	}

	expected := "objectLiteral"
	if rt.Kind == protocol.KindClass {
		expected = "class"
	}
	if callSigChild != nil {
		expected = "function"
	}

	if childrenCode == "" {
		// No contributing children — emit only the shape guard.
		return JitCode{
			Code: "if (!(" + objectCheck + ")) " + callJitErr(ctx, expected, ""),
			Type: CodeS,
		}
	}
	return JitCode{
		Code: "if (!(" + objectCheck + ")) {" + callJitErr(ctx, expected, "") + "} else {" + childrenCode + "}",
		Type: CodeS,
	}
}

// emitPropertyTypeErrors handles KindProperty / KindPropertySignature.
// Sets the child accessor + child path literal (the property name as a
// JS string literal) before recursing, then wraps the child code in
// an optional guard if the property is optional. Mirrors mion's
// nodes/member/property.ts:emitTypeErrors.
func emitPropertyTypeErrors(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		// PropertySignature wrapping a function — skipped from the
		// parent's children chain (mion's getJitChild → undefined).
		return JitCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	ctx.SetChildPathLiteral(quoteJS(rt.Name))
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
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

// emitIndexSignatureTypeErrors handles KindIndexSignature. Loops
// `for (const k in v)` and runs each value's typeErrors with the key
// var as the path segment. Template-literal key constraints emit a
// per-key regex.test that records a 'never' error for keys that don't
// match the pattern. Mirrors mion's
// nodes/member/indexProperty.ts:emitTypeErrors.
func emitIndexSignatureTypeErrors(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
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
	// Template-literal key regex (`{[k: `api/${string}`]: T}`) lifted
	// into the closure prologue, same shape as the isType emit.
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
	ctx.SetChildPathLiteral(keyVar)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" && keyRegexVar == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	var body strings.Builder
	body.WriteString("for (const ")
	body.WriteString(keyVar)
	body.WriteString(" in ")
	body.WriteString(v)
	body.WriteString(") {")
	if keyRegexVar != "" {
		// Template-literal key failure → 'never' error at path
		// [..., keyVar]. Mirrors mion's callJitErrWithPath('never', keyVar).
		body.WriteString("if (!")
		body.WriteString(keyRegexVar)
		body.WriteString(".test(")
		body.WriteString(keyVar)
		body.WriteString(")) ")
		body.WriteString(callJitErr(ctx, "never", ""))
		body.WriteString("; else ")
	}
	if childJit.Code != "" {
		body.WriteString("{")
		body.WriteString(childJit.Code)
		body.WriteString("}")
	}
	body.WriteString("}")
	return JitCode{Code: body.String(), Type: CodeS}
}

// jitTypeNameForKind returns the kindname mion uses for the
// `expected` field on a RunTypeError record. Mirrors module.go's
// jitTypeName function but for the no-RunType callers — function-
// flavoured kinds map to their concrete name (function / method /
// methodSignature / callSignature).
func jitTypeNameForKind(kind protocol.ReflectionKind) string {
	switch kind {
	case protocol.KindFunction:
		return "function"
	case protocol.KindMethod:
		return "method"
	case protocol.KindMethodSignature:
		return "methodSignature"
	case protocol.KindCallSignature:
		return "callSignature"
	}
	return ""
}

// emitTupleTypeErrors mirrors mion's
// nodes/collection/tuple.ts:emitTypeErrors. Body shape (CodeS):
//
//	if (!Array.isArray(v) [|| v.length > N]) {
//	  <callJitErr 'tuple'>
//	} else {
//	  <member0Code>; <member1Code>; …
//	}
//
// Empty tuple gets the `Array.isArray && length === 0` shape (an
// empty array is the only valid value). Rest-bearing tuples skip the
// upper-length-bound check; rest-member emit handles the per-element
// loop and accumulates errors with the loop counter as the path.
func emitTupleTypeErrors(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if len(rt.Children) == 0 {
		// Empty tuple — only the empty array passes.
		return JitCode{
			Code: "if (!(Array.isArray(" + v + ") && " + v + ".length === 0)) " + callJitErr(ctx, "tuple", ""),
			Type: CodeS,
		}
	}
	// Build the per-member body.
	var bodyParts []string
	for _, child := range rt.Children {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			bodyParts = append(bodyParts, childJit.Code)
		}
	}
	body := strings.Join(bodyParts, ";")

	lengthCheck := ""
	if !tupleHasRest(rt, ctx) {
		lengthCheck = " || " + v + ".length > " + strconv.Itoa(len(rt.Children))
	}
	if body == "" {
		return JitCode{
			Code: "if (!Array.isArray(" + v + ")" + lengthCheck + ") " + callJitErr(ctx, "tuple", ""),
			Type: CodeS,
		}
	}
	return JitCode{
		Code: "if (!Array.isArray(" + v + ")" + lengthCheck + ") {" + callJitErr(ctx, "tuple", "") + "} else {" + body + "}",
		Type: CodeS,
	}
}

// emitTupleMemberTypeErrors mirrors mion's
// nodes/member/tupleMember.ts:emitTypeErrors. Sets the element
// accessor (`v[i]`) + path literal (the position index) before
// recursing into the wrapped child. Rest members produce a for-loop
// in their own emit; optional members get the undefined-guard wrap.
func emitTupleMemberTypeErrors(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		// Non-serializable element — mion: `if (v[i] !== undefined)
		// callJitErrWithPath('undefined', i)`. The slot must be
		// undefined.
		idxLit := positionStr(rt)
		accessor := v + "[" + idxLit + "]"
		// Use the extra path literal to thread the index through the
		// access path (callJitErr second arg).
		return JitCode{
			Code: "if (" + accessor + " !== undefined) " + callJitErr(ctx, "undefined", idxLit),
			Type: CodeS,
		}
	}
	if isRestTupleMember(rt) {
		// Rest member — for-loop iterating from position to v.length.
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		ctx.SetChildPathLiteral(iVar)
		childJit := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			return JitCode{Code: "", Type: CodeS}
		}
		return JitCode{
			Code: "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}",
			Type: CodeS,
		}
	}
	// Regular (possibly optional) member.
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	ctx.SetChildPathLiteral(idxLit)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
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
