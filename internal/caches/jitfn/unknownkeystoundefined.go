package jitfn

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// UnknownKeysToUndefinedEmitter implements the
// `unknownKeysToUndefined` jit function — mutates the input value by
// setting every unknown property to undefined (instead of removing it).
// Same shape as stripUnknownKeys but with assignment in place of
// delete.
type UnknownKeysToUndefinedEmitter struct{}

func (UnknownKeysToUndefinedEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

func (UnknownKeysToUndefinedEmitter) Supports(rt *protocol.RunType) bool {
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
		protocol.KindLiteral, protocol.KindEnum,
		protocol.KindNever, protocol.KindTemplateLiteral:
		return true
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone,
			protocol.SubKindMap, protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return true
		}
		return false
	case protocol.KindArray:
		return rt.Child != nil
	case protocol.KindTuple:
		return true
	case protocol.KindTupleMember:
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindUnion:
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		return true
	case protocol.KindPromise:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		return true
	}
	return false
}

func AnyUnknownKeysToUndefinedSupported(runTypes []*protocol.RunType) bool {
	emitter := UnknownKeysToUndefinedEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (UnknownKeysToUndefinedEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

func (UnknownKeysToUndefinedEmitter) ReturnName() string {
	return "v"
}

func (UnknownKeysToUndefinedEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		return emitObjectUnknownKeysToUndefined(rt, ctx)
	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindNone {
			return emitObjectUnknownKeysToUndefined(rt, ctx)
		}
		return JitCode{Code: "", Type: CodeS}
	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyUnknownKeysToUndefined(rt, ctx)
	case protocol.KindArray:
		return emitArrayUnknownKeysToUndefined(rt, ctx)
	case protocol.KindTuple:
		return emitTupleUnknownKeysToUndefined(rt, ctx)
	case protocol.KindTupleMember:
		return emitTupleMemberUnknownKeysToUndefined(rt, ctx)
	case protocol.KindIndexSignature:
		return emitIndexSignatureUnknownKeysToUndefined(rt, ctx)
	case protocol.KindUnion:
		return emitUnionUnknownKeysToUndefined(rt, ctx)
	}
	return JitCode{Code: "", Type: CodeS}
}

func (UnknownKeysToUndefinedEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	v := ctx.Vλl
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	if isSelf {
		return ctx.walker.FnName + "(" + v + ")"
	}
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
	}
	return childID + ".fn(" + v + ")"
}

func (UnknownKeysToUndefinedEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return v", true
	}
	return code, false
}

// emitObjectUnknownKeysToUndefined ports mion's
// InterfaceRunType.emitUnknownKeysToUndefined (interface.ts:188-202).
// Identical to strip except `v[key] = undefined` instead of
// `delete v[key]`.
func emitObjectUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	v := ctx.Vλl
	var parentCode string
	if !hasIndex {
		unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true)
		if unknownValue != "" {
			unknownVar := ctx.NextLocalVar("unk")
			keyVar := ctx.NextLocalVar("ky")
			parentCode = "const " + unknownVar + " = " + unknownValue + ";" +
				"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {" + v + "[" + keyVar + "] = undefined}}"
		}
	}
	// When the object has both named props AND an index signature,
	// publish the sibling-named-prop name list against each index
	// signature child's ID so the index-sig emit can keep those keys
	// out of the regex-undefine sweep. The context key is derived from
	// the index sig's own ID — it's the only canonical handle the
	// index-sig emit has on itself. (We can't store parent-relative
	// state on the index-sig RunType itself; see CLAUDE.md.)
	if hasIndex {
		publishSiblingNamedKeysForIndexSig(rt, ctx)
	}
	childrenCode := unknownKeysToUndefinedChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: combined, Type: CodeS}
}

// publishSiblingNamedKeysForIndexSig walks the object's children;
// for each IndexSignature child, registers a closure-prologue
// `const skip_<idxSigID> = new Set(['name1', 'name2'])` so the
// index-sig emit can guard `if (skip_X.has(prop) || regex.test(prop))`.
func publishSiblingNamedKeysForIndexSig(rt *protocol.RunType, ctx *EmitContext) {
	var siblingNames []string
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind == protocol.KindIndexSignature {
			continue
		}
		if resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if resolved.Name != "" {
			siblingNames = append(siblingNames, resolved.Name)
		}
	}
	if len(siblingNames) == 0 {
		return
	}
	siblingNames = dedupSortStrings(siblingNames)
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != protocol.KindIndexSignature {
			continue
		}
		ctxKey := "siblingNamed_" + resolved.ID
		if ctx.HasContextItem(ctxKey) {
			continue
		}
		ctx.SetContextItem(ctxKey, "const "+ctxKey+" = new Set("+arrayToJSLiteral(siblingNames)+")")
	}
}

func unknownKeysToUndefinedChildrenCode(rt *protocol.RunType, ctx *EmitContext) string {
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
			continue
		}
		if childJit.Code != "" {
			parts = append(parts, childJit.Code)
		}
	}
	return strings.Join(parts, ";")
}

func emitPropertyUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
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
	if resolved.IsStatic {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
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
		return JitCode{Code: "if (" + accessor + " !== undefined) {" + childJit.Code + "}", Type: CodeS}
	}
	return childJit
}

func emitArrayUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
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

func emitTupleUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
	// uku at a tuple node is a no-op. The per-position concat pattern
	// blindly recurses into every child slot, which breaks on circular
	// tuples (optional self-referential slot → unguarded `v[i].x` reads
	// against `undefined`/`null`) and is semantically suspect even
	// without recursion — for a tuple, "unknown key" would be an
	// element past the declared length, which the per-position emit
	// cannot detect. The safe encoder strips extras at encode time
	// (prepareForJsonSafe clones the declared shape only) so the safe
	// decode pipeline doesn't actually need this step to converge.
	_ = rt
	_ = ctx
	return JitCode{Code: "", Type: CodeS}
}

func emitTupleMemberUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
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
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return JitCode{Code: "if (" + accessor + " !== undefined) {" + childJit.Code + "}", Type: CodeS}
	}
	return childJit
}

// emitIndexSignatureUnknownKeysToUndefined ports mion's
// IndexSignatureRunType.emitUnknownKeysToUndefined (indexProperty.ts:144-154).
func emitIndexSignatureUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
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
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic && keyRegexVar == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	prop := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + prop + "]")
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	patternUndef := ""
	if keyRegexVar != "" {
		// When the index sig's parent published a sibling-named-prop
		// set (see publishSiblingNamedKeysForIndexSig in
		// emitObjectUnknownKeysToUndefined), exempt those keys from
		// the regex-undefine sweep.
		siblingSet := "siblingNamed_" + rt.ID
		guard := "!" + keyRegexVar + ".test(" + prop + ")"
		if ctx.HasContextItem(siblingSet) {
			guard = "!" + siblingSet + ".has(" + prop + ") && " + guard
		}
		patternUndef = "if (" + guard + ") {" + v + "[" + prop + "] = undefined; continue;}"
	}
	if patternUndef == "" && childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternUndef + childJit.Code + "}"
	return JitCode{Code: body, Type: CodeS}
}

// emitUnionUnknownKeysToUndefined — public uku family's union arm.
// Operates on runtime-shape input (raw object the user passed to
// createUnknownKeysToUndefined or to the mutate+strip encoder
// composition); walks the merged-allowlist via the shared helper.
//
// Safe to run the merged-allowlist strip directly on the user value
// now that the decoder's safe pipeline uses ukuWire (which handles
// the wire-format wrapper-peel separately) — uku no longer sees
// wire-shape arrays.
func emitUnionUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) JitCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, accessor, keyVar string) string {
			return accessor + "[" + keyVar + "] = undefined"
		},
		CodeShape: CodeS,
	})
}
