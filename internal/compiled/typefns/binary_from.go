package typefns

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// FromBinaryEmitter implements the `fromBinary` jit function —
// reconstructs a runtime value from bytes in a DataViewDeserializer
// instance. Paired with ToBinaryEmitter for the round-trip
// `fromBinary(toBinary(v, ser).getBuffer(), des) ⟶ v`.
//
// Mirrors mion's mega-switch at
// mion/packages/run-types/src/jitCompilers/binary/fromBinary.ts.
//
// Args mirror mion's `jitBinaryDeserializerArgs = {vλl: 'ret', dεs:
// 'Des'}` (constants.functions.ts:54). The first arg `ret` starts
// `undefined` at call time — the body assigns the decoded value to it
// and returns it. The second arg `Des` is the deserializer instance.
//
// The walker's "first arg is the base value accessor" contract means
// `ret` is what every Emit's body references via ctx.Vλl. For compound
// kinds we initialize `ret` to a new container (e.g. `ret = {}`) before
// populating children.
type FromBinaryEmitter struct{}

func (FromBinaryEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "ret", Default: ""},
		{Key: "dεs", Name: "Des", Default: ""},
	}
}

func (FromBinaryEmitter) Supports(rt *protocol.RunType) bool {
	// Mirror ToBinaryEmitter.Supports — every kind the encode side
	// handles has a decode arm.
	return ToBinaryEmitter{}.Supports(rt)
}

// AnyFromBinarySupported reports whether at least one runtype in the
// slice is supported.
func AnyFromBinarySupported(runTypes []*protocol.RunType) bool {
	emitter := FromBinaryEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (FromBinaryEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// ReturnName is `ret` — the decoded value.
func (FromBinaryEmitter) ReturnName() string {
	return "ret"
}

func (FromBinaryEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	ret := ctx.Vλl
	des := ctx.ArgName("dεs")
	switch rt.Kind {

	// ###################### ATOMIC TYPES ######################
	case protocol.KindAny, protocol.KindUnknown, protocol.KindObject:
		// mion:binary/fromBinary.ts — `ret = JSON.parse(desString())`.
		return JitCode{Code: ret + " = JSON.parse(" + des + ".desString())", Type: CodeS}

	case protocol.KindNull:
		// Encoder wrote a 0 byte sentinel; decoder consumes it and
		// returns null. Comma-expression folds the `index++` advance
		// into the assignment RHS — mion uses the same trick
		// (binary/fromBinary.ts:55) to keep the emit as a single
		// expression-shaped statement instead of two consecutive
		// statements.
		return JitCode{Code: ret + " = (" + des + ".index++, null)", Type: CodeS}

	case protocol.KindBoolean:
		return JitCode{Code: ret + " = !!" + des + ".view.getUint8(" + des + ".index++)", Type: CodeS}

	case protocol.KindNumber:
		// Comma-expression trick — `getFloat64` is variadic-tolerant; the
		// 3rd positional slot is ignored at runtime but its side-effect
		// (`index += 8`) still runs as part of the call's argument
		// evaluation. Mirrors mion's binary/fromBinary.ts:59 emit.
		// Equivalent to `ret = getFloat64(des.index, 1); des.index += 8`
		// but one statement instead of two.
		return JitCode{Code: ret + " = " + des + ".view.getFloat64(" + des + ".index, 1, (" + des + ".index += 8))", Type: CodeS}

	case protocol.KindString, protocol.KindTemplateLiteral:
		return JitCode{Code: ret + " = " + des + ".desString()", Type: CodeS}

	case protocol.KindBigInt:
		return JitCode{Code: ret + " = BigInt(" + des + ".desString())", Type: CodeS}

	case protocol.KindUndefined, protocol.KindVoid:
		// Same comma-expression pattern as KindNull — mion
		// binary/fromBinary.ts:69.
		return JitCode{Code: ret + " = (" + des + ".index++, undefined)", Type: CodeS}

	case protocol.KindSymbol:
		// Unsupported — see docs/UNSUPPORTED-KINDS.md FAQ.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindRegexp:
		// Encoder wrote source then flags as two strings.
		return JitCode{Code: ret + " = new RegExp(" + des + ".desString(), " + des + ".desString())", Type: CodeS}

	case protocol.KindEnum:
		return JitCode{Code: ret + " = " + des + ".desEnum()", Type: CodeS}

	case protocol.KindNever:
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindLiteral:
		return emitLiteralFromBinary(rt, ret, des)

	// ###################### MEMBER TYPES ######################
	case protocol.KindArray:
		return emitArrayFromBinary(rt, ctx, ret, des)

	case protocol.KindIndexSignature:
		return emitIndexSignatureFromBinary(rt, ctx, ret, des)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyFromBinary(rt, ctx, ret, des)

	case protocol.KindTupleMember:
		return emitTupleMemberFromBinary(rt, ctx, ret, des)

	// ###################### COLLECTION TYPES ######################
	case protocol.KindObjectLiteral, protocol.KindIntersection:
		return emitObjectFromBinary(rt, ctx, ret, des)

	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate:
			// Same comma-expression trick as KindNumber: the 3rd arg slot
			// of getFloat64 carries the `index += 8` side-effect while
			// the read result is wrapped in `new Date(…)`.
			return JitCode{Code: ret + " = new Date(" + des + ".view.getFloat64(" + des + ".index, 1, (" + des + ".index += 8)))", Type: CodeS}
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableFromBinary(rt, ctx, ret, des)
		case protocol.SubKindNonSerializable:
			return JitCode{Code: "", Type: CodeNS}
		case protocol.SubKindNone:
			return emitObjectFromBinary(rt, ctx, ret, des)
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindTuple:
		return emitTupleFromBinary(rt, ctx, ret, des)

	case protocol.KindUnion:
		return emitUnionFromBinaryFlat(rt, ctx, ret, des)
	}
	return JitCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall passes the value slot + deserializer through. The
// inner function returns the decoded value; the caller assigns it back
// onto its accessor.
//
// Shape: `<accessor> = <hash>.fn(<accessor>, Des)` so the child's
// reassignment of `ret` propagates back to the parent's frame.
func (FromBinaryEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	des := ctx.ArgName("dεs")
	args := ctx.Vλl + ", " + des
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

// Finalize — empty bodies collapse to `return ret` + noop flag.
func (FromBinaryEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return ret" {
		return "return ret", true
	}
	return code, false
}

func emitLiteralFromBinary(rt *protocol.RunType, ret, des string) JitCode {
	_ = des
	// Mion's binary/fromBinary.ts treats literals as compile-time noops
	// because the JIT body that REFERENCES the literal already has the
	// value statically. For us, the JIT body is shared across consumers
	// and the decoded value must be a usable object — so we restore the
	// literal value at the accessor. Encoder writes no bytes (the
	// discriminator from the surrounding union arm is the only signal);
	// decoder assigns the literal value.
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	literal := rt.Literal
	if flagSet["bigint"] {
		decimal, ok := literal.(string)
		if !ok {
			return JitCode{Code: "", Type: CodeS}
		}
		return JitCode{Code: ret + " = " + decimal + "n", Type: CodeS}
	}
	if flagSet["symbol"] {
		entry, ok := literal.(map[string]any)
		if !ok {
			return JitCode{Code: "", Type: CodeS}
		}
		name, _ := entry["symbol"].(string)
		return JitCode{Code: ret + " = Symbol(" + quoteJS(name) + ")", Type: CodeS}
	}
	if entry, isMap := literal.(map[string]any); isMap {
		if regexpEntry, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			source, _ := regexpEntry["source"].(string)
			regFlags, _ := regexpEntry["flags"].(string)
			return JitCode{Code: ret + " = new RegExp(" + quoteJS(source) + ", " + quoteJS(regFlags) + ")", Type: CodeS}
		}
	}
	lit, err := jsLiteralFromAny(literal)
	if err != nil {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: ret + " = " + lit, Type: CodeS}
}

func emitArrayFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved != nil && isNonSerializableElementKind(resolved.Kind) {
		return JitCode{Code: "", Type: CodeNS}
	}
	lenVar := ctx.NextLocalVar("alen")
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(ret + "[" + iVar + "]")
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	readLen := "const " + lenVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4"
	body := readLen + ";" + ret + " = new Array(" + lenVar + ")"
	if childJit.Code != "" {
		body += ";for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" + childJit.Code + "}"
	}
	return JitCode{Code: body, Type: CodeS}
}

func emitIndexSignatureFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return JitCode{Code: "", Type: CodeS}
	}
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(ret + "[" + keyVar + "]")
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	lenVar := ctx.NextLocalVar("cnt")
	iVar := ctx.NextLocalVar("i")

	numericKey := false
	if rt.Index != nil {
		idxResolved := ctx.ResolveRef(rt.Index)
		if idxResolved != nil && idxResolved.Kind == protocol.KindNumber {
			numericKey = true
		}
	}
	var keyRead string
	if numericKey {
		keyRead = "const " + keyVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4"
	} else {
		keyRead = "const " + keyVar + " = " + des + ".desSafePropName()"
	}
	body := ret + " = {};const " + lenVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4;" +
		"for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" + keyRead + ";" + childJit.Code + "}"
	return JitCode{Code: body, Type: CodeS}
}

func emitPropertyFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
	_ = des
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, "property "+rt.Name+" has function-typed value and is excluded from fromBinary")
		return JitCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(ret, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		// Absorb at property — see docs/UNSUPPORTED-KINDS.md.
		if leafCode := ctx.DiagCodeForLeaf(ctx.walker.UnsupportedLeaf); leafCode != "" {
			ctx.walker.EmitDiagnostic(leafCode, "property "+rt.Name+" has unsupported type and is excluded from fromBinary")
		}
		ctx.walker.AbsorbUnsupported()
		return JitCode{Code: "", Type: CodeS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return childJit
}

func emitObjectFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
	// IndexSignature children take over the whole object.
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			return emitIndexSignatureFromBinary(resolved, ctx, ret, des)
		}
	}

	var required, optional []*protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, "static member "+memberLabel(resolved)+" is excluded from fromBinary")
			continue
		}
		if resolved.Kind != protocol.KindProperty && resolved.Kind != protocol.KindPropertySignature {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		childResolved := ctx.ResolveRef(resolved.Child)
		if childResolved == nil {
			continue
		}
		if isFunctionLikeKind(childResolved.Kind) {
			ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, "property "+resolved.Name+" has function-typed value and is excluded from fromBinary")
			continue
		}
		if resolved.Optional {
			optional = append(optional, child)
		} else {
			required = append(required, child)
		}
	}

	// `ret = {};` — explicit `;` because addFullStop in walker.go would
	// treat the trailing `}` of `{}` as already-terminated and skip the
	// separator, producing `ret = {} return ret` (syntax error).
	parts := []string{ret + " = {};"}

	for _, child := range required {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			parts = append(parts, childJit.Code)
		}
	}

	if len(optional) > 0 {
		bitmapLength := (len(optional) + 7) / 8
		bitmapVar := ctx.NextLocalVar("bmI")
		var bitmapInit string
		if bitmapLength > 1 {
			bitmapInit = "const " + bitmapVar + " = " + des + ".index;" + des + ".index += " + strconv.Itoa(bitmapLength)
		} else {
			bitmapInit = "const " + bitmapVar + " = " + des + ".index++"
		}
		parts = append(parts, bitmapInit)
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			accessor := propertyAccessor(ret, resolved.Name, resolved.IsSafeName)
			ctx.SetChildAccessor(accessor)
			childGrand := resolved.Child
			innerJit := JitCode{Code: "", Type: CodeS}
			if childGrand != nil {
				innerJit = ctx.CompileChild(childGrand, CodeS)
			}
			ctx.SetChildAccessor("")
			if innerJit.Type == CodeNS {
				return JitCode{Code: "", Type: CodeNS}
			}
			byteOffset := i / 8
			bitIdx := i & 7
			bitCheck := "(" + des + ".view.getUint8(" + bitmapVar + " + " + strconv.Itoa(byteOffset) + ") & " + strconv.Itoa(1<<bitIdx) + ")"
			body := innerJit.Code
			if body == "" {
				body = ""
			}
			parts = append(parts, "if ("+bitCheck+") {"+body+"}")
		}
	}

	return JitCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

func emitTupleFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
	if len(rt.Children) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	var required, optional, rest []*protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			rest = append(rest, child)
		} else if resolved.Optional {
			optional = append(optional, child)
		} else {
			required = append(required, child)
		}
	}

	parts := []string{ret + " = [];"}
	for _, child := range required {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			parts = append(parts, childJit.Code)
		}
	}

	if len(optional) > 0 {
		bitmapLength := (len(optional) + 7) / 8
		bitmapVar := ctx.NextLocalVar("tbmI")
		var bitmapInit string
		if bitmapLength > 1 {
			bitmapInit = "const " + bitmapVar + " = " + des + ".index;" + des + ".index += " + strconv.Itoa(bitmapLength)
		} else {
			bitmapInit = "const " + bitmapVar + " = " + des + ".index++"
		}
		parts = append(parts, bitmapInit)
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			pos := positionStr(resolved)
			accessor := ret + "[" + pos + "]"
			ctx.SetChildAccessor(accessor)
			childGrand := resolved.Child
			innerJit := JitCode{Code: "", Type: CodeS}
			if childGrand != nil {
				innerJit = ctx.CompileChild(childGrand, CodeS)
			}
			ctx.SetChildAccessor("")
			if innerJit.Type == CodeNS {
				return JitCode{Code: "", Type: CodeNS}
			}
			byteOffset := i / 8
			bitIdx := i & 7
			bitCheck := "(" + des + ".view.getUint8(" + bitmapVar + " + " + strconv.Itoa(byteOffset) + ") & " + strconv.Itoa(1<<bitIdx) + ")"
			parts = append(parts, "if ("+bitCheck+") {"+innerJit.Code+"}")
		}
	}

	for _, child := range rest {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			parts = append(parts, childJit.Code)
		}
	}

	return JitCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

func emitTupleMemberFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
	_ = des
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return JitCode{Code: "", Type: CodeS}
	}
	if isRestTupleMember(rt) {
		// Rest tuple member: read uint32 length, then loop.
		lenVar := ctx.NextLocalVar("rln")
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(ret + "[" + iVar + "]")
		childJit := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			return JitCode{Code: "", Type: CodeS}
		}
		body := "const " + lenVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4;" +
			"for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + positionStr(rt) + " + " + lenVar + "; " + iVar + "++) {" + childJit.Code + "}"
		return JitCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := ret + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	return childJit
}

func emitNativeIterableFromBinary(rt *protocol.RunType, ctx *EmitContext, ret, des string) JitCode {
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

	lenVar := ctx.NextLocalVar("mlen")
	iVar := ctx.NextLocalVar("i")

	if isMap {
		// Read each pair as [key, value] into a temp array then construct
		// the Map from the array.
		arrVar := ctx.NextLocalVar("mar")
		keyTmp := ctx.NextLocalVar("mk")
		valTmp := ctx.NextLocalVar("mv")

		ctx.SetChildAccessor(keyTmp)
		keyJit := JitCode{Code: "", Type: CodeS}
		if innerTypes[0] != nil {
			keyJit = ctx.CompileChild(innerTypes[0], CodeS)
		}
		ctx.SetChildAccessor("")
		ctx.SetChildAccessor(valTmp)
		valJit := JitCode{Code: "", Type: CodeS}
		if len(innerTypes) > 1 && innerTypes[1] != nil {
			valJit = ctx.CompileChild(innerTypes[1], CodeS)
		}
		ctx.SetChildAccessor("")
		if keyJit.Type == CodeNS || valJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}

		body := "const " + lenVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4;" +
			"const " + arrVar + " = [];" +
			"for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" +
			"let " + keyTmp + ", " + valTmp + ";" + keyJit.Code + ";" + valJit.Code + ";" +
			arrVar + ".push([" + keyTmp + ", " + valTmp + "]);}" +
			ret + " = new Map(" + arrVar + ")"
		return JitCode{Code: body, Type: CodeS}
	}

	// Set
	arrVar := ctx.NextLocalVar("sar")
	itemTmp := ctx.NextLocalVar("si")
	ctx.SetChildAccessor(itemTmp)
	itemJit := JitCode{Code: "", Type: CodeS}
	if len(innerTypes) > 0 && innerTypes[0] != nil {
		itemJit = ctx.CompileChild(innerTypes[0], CodeS)
	}
	ctx.SetChildAccessor("")
	if itemJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	body := "const " + lenVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4;" +
		"const " + arrVar + " = [];" +
		"for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" +
		"let " + itemTmp + ";" + itemJit.Code + ";" + arrVar + ".push(" + itemTmp + ");}" +
		ret + " = new " + ctorName + "(" + arrVar + ")"
	return JitCode{Code: body, Type: CodeS}
}
