package jitfn

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// RestoreFromJsonEmitter implements the `restoreFromJson` jit function —
// reconstructs the runtime shape from a value produced by JSON.parse
// (Dates from ISO strings, BigInts from decimal strings, Symbols from
// "Symbol:<desc>" strings, RegExps from "/source/flags" strings).
//
// Paired with PrepareForJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every valid sample.
//
// Mirrors mion's per-kind emitRestoreFromJson methods under
// mion/packages/run-types/src/nodes/**.
type RestoreFromJsonEmitter struct{}

// Args mirrors mion's `jitArgs.vλl = 'v'` — same single-arg shape as
// PrepareForJsonEmitter; restoreFromJson reassigns v to the
// reconstructed value.
func (RestoreFromJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors PrepareForJsonEmitter.Supports — every kind the
// prepare side handles has a corresponding restore arm.
func (RestoreFromJsonEmitter) Supports(rt *protocol.RunType) bool {
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
		return rt.Child != nil
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Top-level function types: noop body (caller's responsibility).
		return true
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone:
			return true
		}
		return false
	}
	return false
}

// AnyRestoreFromJsonSupported reports whether at least one runtype in
// the slice is supported by the RestoreFromJsonEmitter. Sibling of
// AnyPrepareForJsonSupported.
func AnyRestoreFromJsonSupported(runTypes []*protocol.RunType) bool {
	emitter := RestoreFromJsonEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined.
func (RestoreFromJsonEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// ReturnName is `v` — restoreFromJson mutates / rebinds v and returns
// the reconstructed value.
func (RestoreFromJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors mion's
// emitRestoreFromJson method for the corresponding kind. Non-noop
// atomics:
//   - date:    `v = new Date(v)` (rebuild from ISO string)
//   - bigint:  `v = BigInt(v)` (parse decimal string)
//   - symbol:  `v = Symbol(v.substring(7))` (strip "Symbol:" prefix)
//   - regexp:  `v = <parsed regex>` (split on /.../flags and rebuild)
//   - void / undefined: `v = undefined`
//
// Mion's bare expression form (e.g. `BigInt(v)`) becomes `v = BigInt(v)`
// on our side so the walker's expression-shape handling actually
// mutates v before the trailing `return v` lands.
func (RestoreFromJsonEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		// mion: AtomicRunType default — noop.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindUndefined:
		// mion:nodes/atomic/undefined.ts:20 — `undefined`.
		// JSON has no undefined, so the parsed input might be null or
		// missing; force-rebind to undefined.
		return JitCode{Code: v + " = undefined", Type: CodeE}

	case protocol.KindVoid:
		// mion:nodes/atomic/void.ts:23 — `v = undefined`.
		return JitCode{Code: v + " = undefined", Type: CodeE}

	case protocol.KindBigInt:
		// mion:nodes/atomic/bigInt.ts:23 — `BigInt(v)`.
		return JitCode{Code: v + " = BigInt(" + v + ")", Type: CodeE}

	case protocol.KindSymbol:
		// mion:nodes/atomic/symbol.ts:28 — `Symbol(v.substring(7))`.
		// "Symbol:" is 7 chars; strip it to recover the description.
		return JitCode{Code: v + " = Symbol(" + v + ".substring(7))", Type: CodeE}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:23 — IIFE that splits the
		// stringified form back into source + flags. Single-quoted to
		// fit our JS-source quoting convention.
		expr := "(function(){const parts = " + v + ".match(/\\/(.*)\\/(.*)?/);return new RegExp(parts[1], parts[2] || '');})()"
		return JitCode{Code: v + " = " + expr, Type: CodeE}

	case protocol.KindClass:
		// Date is reconstructed from its ISO string via `new Date(v)`.
		if rt.SubKind == protocol.SubKindDate {
			// mion:nodes/atomic/date.ts:23 — `new Date(v)`.
			return JitCode{Code: v + " = new Date(" + v + ")", Type: CodeE}
		}
		if rt.SubKind == protocol.SubKindNone {
			// User class — same emit body as KindObjectLiteral.
			return emitObjectRestoreFromJson(rt, ctx, v)
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindObjectLiteral:
		return emitObjectRestoreFromJson(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyRestoreFromJson(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignatureRestoreFromJson(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Non-serializable — noop body.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindLiteral:
		// mion:nodes/atomic/literal.ts:80 — defers to the underlying
		// kind's emit.
		return emitLiteralRestoreFromJson(rt, v)

	case protocol.KindArray:
		// mion:nodes/member/array.ts:emitRestoreFromJson — same body
		// shape as emitPrepareForJson. Each element gets the child's
		// restoreFromJson applied in place. Empty child code collapses
		// the whole loop to a noop.
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

// emitLiteralRestoreFromJson mirrors mion's literal.ts:80 — defers to
// the base kind's emit. Same flag-based dispatch as
// emitLiteralPrepareForJson.
func emitLiteralRestoreFromJson(rt *protocol.RunType, v string) JitCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	if flagSet["bigint"] {
		return JitCode{Code: v + " = BigInt(" + v + ")", Type: CodeE}
	}
	if flagSet["symbol"] {
		return JitCode{Code: v + " = Symbol(" + v + ".substring(7))", Type: CodeE}
	}
	if entry, isMap := rt.Literal.(map[string]any); isMap {
		if _, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			expr := "(function(){const parts = " + v + ".match(/\\/(.*)\\/(.*)?/);return new RegExp(parts[1], parts[2] || '');})()"
			return JitCode{Code: v + " = " + expr, Type: CodeE}
		}
	}
	// Primitive literal — noop.
	return JitCode{Code: "", Type: CodeS}
}

// emitObjectRestoreFromJson — sibling of emitObjectPrepareForJson
// (preparefjson.go). Mirrors mion's
// nodes/collection/interface.ts:emitRestoreFromJson.
func emitObjectRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
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

// emitPropertyRestoreFromJson — sibling of emitPropertyPrepareForJson.
func emitPropertyRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
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

// emitIndexSignatureRestoreFromJson — sibling of
// emitIndexSignaturePrepareForJson.
func emitIndexSignatureRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
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

// EmitDependencyCall mirrors PrepareForJsonEmitter's — the parent
// frame's `<vλl>` must capture the call's return so the
// `v = new Date(v)` style rebind inside the inner function propagates
// to the outer caller. See PrepareForJsonEmitter.EmitDependencyCall
// for the full rationale.
func (RestoreFromJsonEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
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

// Finalize collapses empty / identity bodies to `return v` + noop flag.
func (RestoreFromJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
