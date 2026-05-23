package typefns

import (
	"strconv"
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
	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:23 — emitRestoreFromJson throws
		// "Never type cannot be decoded from JSON.". Supports returns
		// true so the renderer surfaces the throw via factory.
		return true
	case protocol.KindArray:
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
		// Decodes the `[memberIndex, encodedValue]` envelope produced
		// by prepareForJson — see json_prepare.go union case.
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		// Defensive noop — see json_prepare.go intersection case.
		return true
	case protocol.KindTemplateLiteral:
		// String-flavoured at runtime — noop.
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Top-level function types: noop body (caller's responsibility).
		return true
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone,
			protocol.SubKindMap, protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return true
		}
		return false
	case protocol.KindPromise:
		// Throws — same pattern as prepareForJson.
		return true
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

	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:23-24 —
		// `emitRestoreFromJson(): JitCode { throw new Error('Never
		// type cannot be decoded from JSON.'); }`.
		return JitCode{Code: "", Type: CodeNS}

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
		// Unsupported — symmetric with prepareForJson's symbol arm.
		// See docs/UNSUPPORTED-KINDS.md FAQ.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:23 — IIFE that splits the
		// stringified form back into source + flags. Single-quoted to
		// fit our JS-source quoting convention.
		expr := "(function(){const parts = " + v + ".match(/\\/(.*)\\/(.*)?/);return new RegExp(parts[1], parts[2] || '');})()"
		return JitCode{Code: v + " = " + expr, Type: CodeE}

	case protocol.KindClass:
		// Date is reconstructed from its ISO string via `new Date(v)`.
		switch rt.SubKind {
		case protocol.SubKindDate:
			return JitCode{Code: v + " = new Date(" + v + ")", Type: CodeE}
		case protocol.SubKindNone:
			return emitObjectRestoreFromJson(rt, ctx, v)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableRestoreFromJson(rt, ctx, v)
		case protocol.SubKindNonSerializable:
			// mion:nodes/native/nonSerializable.ts:27-28 —
			// `emitRestoreFromJson(): JitCode { throw new Error('Jit
			// compilation disabled for Non Serializable types.'); }`.
			return JitCode{Code: "", Type: CodeNS}
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		// mion:nodes/native/promise.ts:26-27 — emitRestoreFromJson
		// throws "Jit compilation disabled for Non Serializable
		// types.". Same throw-factory pattern as the prepare side.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindObjectLiteral:
		return emitObjectRestoreFromJson(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyRestoreFromJson(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignatureRestoreFromJson(rt, ctx, v)

	case protocol.KindTuple:
		return emitTupleRestoreFromJson(rt, ctx, v)

	case protocol.KindTupleMember:
		return emitTupleMemberRestoreFromJson(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:nodes/function/function.ts:86-88 —
		// `emitRestoreFromJson(): JitCode { throw new Error('Compile
		// function RestoreFromJson not supported, call compileParams
		// or compileReturn instead.'); }`.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindUnion:
		// Decodes the flat-union wire shape produced by
		// emitUnionPrepareForJsonFlat / emitUnionStringifyJsonFlat (see
		// union_flat.go). The non-flat decoder was retired with its
		// encoder.
		return emitUnionRestoreFromJsonFlat(rt, ctx, v)

	case protocol.KindIntersection:
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindTemplateLiteral:
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
			// Symmetric with emitPrepareForJson's array gate —
			// mion's nodes/member/array.ts:148 throws on
			// symbol[]/function[].
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
// (json_prepare.go). Mirrors mion's
// nodes/collection/interface.ts:emitRestoreFromJson.
func emitObjectRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	var parts []string
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
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
		ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, rt.Name)
		return JitCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		// Absorb at property — see docs/UNSUPPORTED-KINDS.md.
		if leafCode := ctx.DiagCodeForLeaf(ctx.walker.UnsupportedLeaf); leafCode != "" {
			ctx.walker.EmitDiagnostic(leafCode, rt.Name)
		}
		ctx.walker.AbsorbUnsupported()
		return JitCode{Code: "", Type: CodeS}
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
// emitIndexSignaturePrepareForJson. Skips symbol-keyed sigs per
// mion's IndexSignatureRunType.skipJit (indexProperty.ts:30-36); see
// the prepareForJson mirror for the full rationale.
func emitIndexSignatureRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
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

// emitTupleRestoreFromJson — sibling of emitTuplePrepareForJson.
func emitTupleRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
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

// emitTupleMemberRestoreFromJson — sibling of
// emitTupleMemberPrepareForJson. The inverse-of-pad-with-null logic
// restores `null` slots to `undefined` for optional members. Non-rest
// non-optional members pass child code through.
func emitTupleMemberRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		// Non-serializable element — set the slot to undefined on
		// restore (matches mion's behaviour).
		idxLit := positionStr(rt)
		return JitCode{Code: v + "[" + idxLit + "] = undefined", Type: CodeS}
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
		// Restore null sentinel back to undefined, then run the child
		// transform only when the slot has a present (non-undefined)
		// value.
		optionalCode := "if (" + accessor + " === null) {" + accessor + " = undefined}"
		if childJit.Code == "" {
			return JitCode{Code: optionalCode, Type: CodeS}
		}
		return JitCode{Code: optionalCode + " else if (" + accessor + " !== undefined) {" + childJit.Code + "}", Type: CodeS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return childJit
}

// emitNativeIterableRestoreFromJson mirrors mion's
// nodes/native/Iterable.ts:66-82 emitRestoreFromJson. Inverse of the
// prepare side: walk the array-form produced by JSON.parse, apply
// each wrapped child's restore code, then wrap the array back into
// a Map / Set via the constructor.
//
// Shape (with non-noop key, value, or element transforms):
//
//	for (let e0 = 0; e0 < v.length; e0++) {
//	  <key/element transform>; <value transform>;
//	}
//	v = new Map(v)        // or new Set(v) — pick by SubKind
//
// Note the loop counter (`e0`) is the INDEX here, not the entry — mion
// uses an index loop on restore because the array form has length-based
// access. Accessors:
//   - Set: v[e0] (the element)
//   - Map: v[e0][0] (key) and v[e0][1] (value)
//
// When every wrapped child compiles to empty, fall back to the no-loop
// `v = new Map(v)` / `v = new Set(v)` shape.
func emitNativeIterableRestoreFromJson(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	isMap := rt.SubKind == protocol.SubKindMap
	ctorName := "Map"
	if !isMap {
		ctorName = "Set"
	}

	var innerTypes []*protocol.RunType
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		innerTypes = []*protocol.RunType{keyType, valueType}
	} else {
		innerTypes = []*protocol.RunType{setItemType(rt, ctx)}
	}

	indexVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := v + "[" + indexVar + "]"
		if isMap {
			accessor = v + "[" + indexVar + "][" + strconv.Itoa(i) + "]"
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
		return JitCode{Code: v + " = new " + ctorName + "(" + v + ")", Type: CodeS}
	}

	body := "for (let " + indexVar + " = 0; " + indexVar + " < " + v + ".length; " + indexVar + "++) {" +
		strings.Join(childCodes, ";") + "} " +
		v + " = new " + ctorName + "(" + v + ")"
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

// Finalize — same shape as PrepareForJsonEmitter.Finalize. Mirrors
// mion's handleFunctionReturn for restoreFromJson: identity body for
// noops, factory still emitted so dep-call chains resolve. isNoop
// is set to true on identity bodies to match mion's
// `00JsonOnly.spec.ts` semantics (cache entry exists, but consumer
// knows it can short-circuit).
func (RestoreFromJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
