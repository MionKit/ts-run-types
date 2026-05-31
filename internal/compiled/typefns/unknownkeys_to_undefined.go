package typefns

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// UnknownKeysToUndefinedEmitter implements the
// `unknownKeysToUndefined` rt function — mutates the input value by
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
		return protocol.IsTemporalSubKind(rt.SubKind)
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

func (UnknownKeysToUndefinedEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

func (UnknownKeysToUndefinedEmitter) ReturnName() string {
	return "v"
}

func (UnknownKeysToUndefinedEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		return emitObjectUnknownKeysToUndefined(rt, ctx)
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindNone:
			return emitObjectUnknownKeysToUndefined(rt, ctx)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableUnknownKeys(rt, ctx, ctx.Vλl)
		}
		return RTCode{Code: "", Type: CodeS}
	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyUnknownKeys(rt, ctx)
	case protocol.KindArray:
		return emitArrayUnknownKeys(rt, ctx)
	case protocol.KindTuple:
		return emitTupleUnknownKeysToUndefined(rt, ctx)
	case protocol.KindTupleMember:
		return emitTupleMemberUnknownKeys(rt, ctx)
	case protocol.KindIndexSignature:
		return emitIndexSignatureUnknownKeysToUndefined(rt, ctx)
	case protocol.KindUnion:
		return emitUnionUnknownKeysToUndefined(rt, ctx)
	}
	return RTCode{Code: "", Type: CodeS}
}

func (UnknownKeysToUndefinedEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
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
func emitObjectUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) RTCode {
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
	childrenCode := unknownKeysChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: combined, Type: CodeS}
}

func emitTupleUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) RTCode {
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
	return RTCode{Code: "", Type: CodeS}
}

// emitIndexSignatureUnknownKeysToUndefined ports mion's
// IndexSignatureRunType.emitUnknownKeysToUndefined (indexProperty.ts:144-154).
func emitIndexSignatureUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
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
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	prop := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + prop + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	patternUndef := ""
	if keyRegexVar != "" {
		// When the index sig's parent published a sibling-named-prop
		// set (see publishSiblingNamedKeysForIndexSig in
		// emitObjectUnknownKeysToUndefined), exempt those keys from
		// the regex-undefine sweep.
		siblingSet := siblingNamedKeysCtxKey(rt)
		guard := "!" + keyRegexVar + ".test(" + prop + ")"
		if ctx.HasContextItem(siblingSet) {
			guard = "!" + siblingSet + ".has(" + prop + ") && " + guard
		}
		patternUndef = "if (" + guard + ") {" + v + "[" + prop + "] = undefined; continue;}"
	}
	if patternUndef == "" && childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternUndef + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
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
func emitUnionUnknownKeysToUndefined(rt *protocol.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, accessor, keyVar string) string {
			return accessor + "[" + keyVar + "] = undefined"
		},
		CodeShape: CodeS,
	})
}
