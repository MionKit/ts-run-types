package typefns

import (
	"strconv"
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

func AnyStripUnknownKeysSupported(runTypes []*protocol.RunType) bool {
	emitter := StripUnknownKeysEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
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
			return emitNativeIterableStripUnknownKeys(rt, ctx, ctx.Vλl)
		}
		return RTCode{Code: "", Type: CodeS}
	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyStripUnknownKeys(rt, ctx)
	case protocol.KindArray:
		return emitArrayStripUnknownKeys(rt, ctx)
	case protocol.KindTuple:
		return emitTupleStripUnknownKeys(rt, ctx)
	case protocol.KindTupleMember:
		return emitTupleMemberStripUnknownKeys(rt, ctx)
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

func emitPropertyStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved.IsStatic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// Always wrap in a defined check for safety — mion's property emit
	// for strip wraps in `if (accessor !== undefined) { … }` only for
	// optional properties, but the same wrap is safe (and necessary on
	// undefined receivers) so we apply it universally where possible
	// for consistency. To match mion's exact semantics, only wrap when
	// the property is optional.
	if rt.Optional {
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

func emitArrayStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

func emitTupleStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			continue
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

func emitTupleMemberStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
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

// emitNativeIterableStripUnknownKeys mirrors mion's
// IterableRunType.emitStripUnknownKeys (nodes/native/Iterable.ts:122-136).
// For each entry in the Map/Set, runs the wrapped child's
// stripUnknownKeys statements; the child mutates its accessor in place.
// When every wrapped child compiles to a noop, the entire iteration is
// elided (atomic-noop element types — Set<string>, Map<string, number>
// — don't carry extras to strip).
func emitNativeIterableStripUnknownKeys(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
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
		childRT := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childCodes = append(childCodes, childRT.Code)
		}
	}

	if len(childCodes) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}

	body := "if (!(" + v + " instanceof " + ctorName + ")) return;" +
		"for (const " + entryVar + " of " + v + ") {" +
		strings.Join(childCodes, ";") +
		"}"
	return RTCode{Code: body, Type: CodeS}
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
