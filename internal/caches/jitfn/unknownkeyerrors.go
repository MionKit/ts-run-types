package jitfn

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// UnknownKeyErrorsEmitter implements the `unknownKeyErrors` jit
// function — accumulator that records one RunTypeError of expected
// `'never'` per unknown key. Ported from mion's emitUnknownKeyErrors.
//
// Arg shape mirrors typeErrors: (v, pth=[], er=[]). Returns `er`.
type UnknownKeyErrorsEmitter struct{}

func (UnknownKeyErrorsEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "pλth", Name: "pth", Default: "[]"},
		{Key: "εrr", Name: "er", Default: "[]"},
	}
}

func (UnknownKeyErrorsEmitter) Supports(rt *protocol.RunType) bool {
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

func AnyUnknownKeyErrorsSupported(runTypes []*protocol.RunType) bool {
	emitter := UnknownKeyErrorsEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (UnknownKeyErrorsEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

func (UnknownKeyErrorsEmitter) ReturnName() string {
	return "er"
}

func (UnknownKeyErrorsEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		return emitObjectUnknownKeyErrors(rt, ctx)
	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindNone {
			return emitObjectUnknownKeyErrors(rt, ctx)
		}
		return JitCode{Code: "", Type: CodeS}
	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyUnknownKeyErrors(rt, ctx)
	case protocol.KindArray:
		return emitArrayUnknownKeyErrors(rt, ctx)
	case protocol.KindTuple:
		return emitTupleUnknownKeyErrors(rt, ctx)
	case protocol.KindTupleMember:
		return emitTupleMemberUnknownKeyErrors(rt, ctx)
	case protocol.KindIndexSignature:
		return emitIndexSignatureUnknownKeyErrors(rt, ctx)
	case protocol.KindUnion:
		return emitUnionUnknownKeyErrors(rt, ctx)
	}
	return JitCode{Code: "", Type: CodeS}
}

func (UnknownKeyErrorsEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
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
	pushArgs := pathLit[1 : len(pathLit)-1]
	return "(" + pthArg + ".push(" + pushArgs + ")," + callCode + "," + pthArg + ".splice(-" + strconv.Itoa(pathLen) + "))"
}

func (UnknownKeyErrorsEmitter) Finalize(rawCode string) (string, bool) {
	code := normaliseWhitespace(rawCode)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return "return er", true
	}
	return code, false
}

// callUnknownKeyErr builds the JS call to cpf_newRunTypeErr that
// appends a 'never' error for an unknown key. `extra` is the key
// variable (since the key is a runtime value, not a static name).
func callUnknownKeyErr(ctx *EmitContext, extra string) string {
	ctx.AddPureFnDependency("mion", "newRunTypeErr", typeErrorsPureFnFilePath)
	key := pureFnAlias("newRunTypeErr")
	if !ctx.HasContextItem(key) {
		ctx.SetContextItem(key, "const "+key+" = utl.getPureFn('mion::newRunTypeErr')")
	}
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS("never")}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitObjectUnknownKeyErrors ports mion's
// InterfaceRunType.emitUnknownKeyErrors (interface.ts:157-172).
func emitObjectUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	var parentCode string
	if !hasIndex {
		unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true)
		if unknownValue != "" {
			unknownVar := ctx.NextLocalVar("unk")
			keyVar := ctx.NextLocalVar("ky")
			parentCode = "const " + unknownVar + " = " + unknownValue + ";" +
				"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {" + callUnknownKeyErr(ctx, keyVar) + "}}"
		}
	}
	childrenCode := unknownKeyErrorsChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: combined, Type: CodeS}
}

func unknownKeyErrorsChildrenCode(rt *protocol.RunType, ctx *EmitContext) string {
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

func emitPropertyUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
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
		return JitCode{Code: "if (" + accessor + " !== undefined) {" + childJit.Code + "}", Type: CodeS}
	}
	return childJit
}

func emitArrayUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
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
	body := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
	return JitCode{Code: body, Type: CodeS}
}

func emitTupleUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
	if len(rt.Children) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	var parts []string
	for _, child := range rt.Children {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			continue
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

func emitTupleMemberUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
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
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
		return JitCode{Code: body, Type: CodeS}
	}
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
		return JitCode{Code: "if (" + accessor + " !== undefined) {" + childJit.Code + "}", Type: CodeS}
	}
	return childJit
}

// emitIndexSignatureUnknownKeyErrors ports mion's
// IndexSignatureRunType.emitUnknownKeyErrors (indexProperty.ts:122-132).
func emitIndexSignatureUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
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
	ctx.SetChildPathLiteral(prop)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	patternErr := ""
	if keyRegexVar != "" {
		patternErr = "if (!" + keyRegexVar + ".test(" + prop + ")) {" + callUnknownKeyErr(ctx, prop) + "; continue;}"
	}
	if patternErr == "" && childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternErr + childJit.Code + "}"
	return JitCode{Code: body, Type: CodeS}
}

func emitUnionUnknownKeyErrors(rt *protocol.RunType, ctx *EmitContext) JitCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(emitCtx *EmitContext, _ string, keyVar string) string {
			return callUnknownKeyErr(emitCtx, keyVar)
		},
		CodeShape: CodeS,
	})
}
