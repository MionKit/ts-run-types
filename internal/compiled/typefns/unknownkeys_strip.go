package typefns

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// StripUnknownKeysEmitter implements the `stripUnknownKeys` rt function —
// mutates the input value by removing any property not declared in the
// schema. Ported from mion's emitStripUnknownKeys methods.
//
// Arg shape: single value (`v`). The mutation is in place; returns v
// unchanged.
type StripUnknownKeysEmitter struct{}

func (StripUnknownKeysEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

func (StripUnknownKeysEmitter) Supports(rt *protocol.RunType) bool {
	return unknownKeysSupports(rt)
}

func (StripUnknownKeysEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

func (StripUnknownKeysEmitter) ReturnName() string {
	return "v"
}

func (StripUnknownKeysEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		return emitObjectStripUnknownKeys(rt, ctx)
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindNone:
			return emitObjectStripUnknownKeys(rt, ctx)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableUnknownKeys(rt, ctx, ctx.Vλl)
		}
		return RTCode{Code: "", Type: CodeS}
	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyUnknownKeys(rt, ctx, false)
	case protocol.KindArray:
		return emitArrayUnknownKeys(rt, ctx, false)
	case protocol.KindTuple:
		return emitTupleUnknownKeysRecurse(rt, ctx)
	case protocol.KindTupleMember:
		return emitTupleMemberUnknownKeys(rt, ctx, false)
	case protocol.KindIndexSignature:
		return emitIndexSignatureStripUnknownKeys(rt, ctx)
	case protocol.KindUnion:
		return emitUnionStripUnknownKeys(rt, ctx)
	}
	return RTCode{Code: "", Type: CodeS}
}

func (StripUnknownKeysEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize: empty body → noop ("return v", true).
func (StripUnknownKeysEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return v", true
	}
	return code, false
}

// emitObjectStripUnknownKeys ports mion's
// InterfaceRunType.emitStripUnknownKeys (interface.ts:173-187). Three
// pieces:
//
//  1. Get unknown-keys array via callCheckUnknownProperties (returnKeys=true).
//     Index-sig children skip this entirely (every key matching the
//     index pattern is "known").
//  2. Iterate the unknown-keys array and `delete v[key]` each.
//  3. Recurse into each non-skip child for its own strip emission.
func emitObjectStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	v := ctx.Vλl
	unknownVar := ctx.NextLocalVar("unk")
	keyVar := ctx.NextLocalVar("ky")
	var parentCode string
	if !hasIndex {
		unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true)
		if unknownValue != "" {
			parentCode = "const " + unknownVar + " = " + unknownValue + ";" +
				"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {delete " + v + "[" + keyVar + "]}}"
		}
	}
	childrenCode := unknownKeysChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: combined, Type: CodeS}
}

// emitIndexSignatureStripUnknownKeys ports mion's
// IndexSignatureRunType.emitStripUnknownKeys (indexProperty.ts:133-143).
func emitIndexSignatureStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
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
	// Atomic value with no key pattern → nothing to strip.
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
	patternStrip := ""
	if keyRegexVar != "" {
		patternStrip = "if (!" + keyRegexVar + ".test(" + prop + ")) {delete " + v + "[" + prop + "]; continue;}"
	}
	if patternStrip == "" && childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternStrip + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

func emitUnionStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, accessor, keyVar string) string {
			return "delete " + accessor + "[" + keyVar + "]"
		},
		CodeShape: CodeS,
	})
}

// joinSemicolons joins non-empty strings with `;`. Empty entries are
// dropped.
func joinSemicolons(parts ...string) string {
	var nonEmpty []string
	for _, part := range parts {
		if part != "" {
			nonEmpty = append(nonEmpty, part)
		}
	}
	return strings.Join(nonEmpty, ";")
}
