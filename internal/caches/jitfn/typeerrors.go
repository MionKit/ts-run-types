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
// kind-by-kind as the implementation phases roll out; the current
// scope is the atomic family.
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
	case protocol.KindClass:
		// Date is the only class kind in the atomic phase. Other
		// classes (non-Date), Map, Set land in later phases.
		return rt.SubKind == protocol.SubKindDate
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
		// Other class kinds land in later phases.
		return JitCode{Code: "", Type: CodeNS}
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
