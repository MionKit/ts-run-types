package typefns

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// ToBinaryEmitter implements the `toBinary` jit function — serializes a
// runtime value into a binary byte stream, mutating a DataViewSerializer
// instance passed via the second arg (`sεr`, conventionally `Ser`).
//
// Paired with FromBinaryEmitter — round-trip
// `fromBinary(toBinary(v, ser).getBuffer(), des) ⟶ v` must deep-equal v
// for every valid sample. Tests assert the round-trip; the half can't
// be verified independently.
//
// Mirrors mion's mega-switch at
// mion/packages/run-types/src/jitCompilers/binary/toBinary.ts (no
// per-kind files — single 437-line switch).
//
// Wire encoding (per mion's binarySPEC.md):
//   - null/undefined/void:    uint8 sentinel (0 / 1)
//   - boolean:                uint8 (0 / 1)
//   - number:                 float64 LE
//   - string/templateLiteral: [uint32 length, utf8 bytes] (serString)
//   - bigint:                 serString(v.toString(), true)
//   - any/unknown/object:     serString(JSON.stringify(v))
//   - regexp:                 serString(source); serString(flags)
//   - enum:                   serEnum(v)  [uint32 type, value]
//   - symbol:                 serString(v.description || '')
//   - array/rest:             [uint32 length, items...]
//   - indexSignature:         [uint32 count, (key, value)*]
//   - objectLiteral:          required props in order, then optional bitmap + values
//   - class(Date):            float64 of getTime()
//   - class(Map/Set):         [uint32 size, entries...]
//   - tuple:                  required, optional bitmap, rest
//   - union:                  flat-prop format — see union_flat_binary.go.
//
// Phase 1: every Supports check returns false; the renderer emits no
// entries. Subsequent phases enable kinds one bucket at a time.
type ToBinaryEmitter struct{}

// Args mirrors mion's `jitBinarySerializerArgs = {vλl: 'v', sεr: 'Ser'}`
// (mion-run-types:constants.functions.ts:51). Returns the serializer
// (`Ser`) so callers can chain `.getBuffer()`.
func (ToBinaryEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "sεr", Name: "Ser", Default: ""},
	}
}

// Supports gates the renderer's top-level loop. Phase 1: returns false
// for every kind so no factory is emitted. Phase 2+ flip kinds on
// incrementally — see the matching FromBinaryEmitter for the symmetric
// gate.
func (ToBinaryEmitter) Supports(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull, protocol.KindUndefined, protocol.KindVoid,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol,
		protocol.KindObject, protocol.KindRegexp,
		protocol.KindLiteral, protocol.KindEnum,
		protocol.KindTemplateLiteral:
		return true
	case protocol.KindNever:
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
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
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
		return true
	}
	return false
}

// AnyToBinarySupported reports whether at least one runtype in the slice
// is supported by the ToBinaryEmitter. Used by the resolver to set
// AddedToBinary independently of AddedRunTypes.
func AnyToBinarySupported(runTypes []*protocol.RunType) bool {
	emitter := ToBinaryEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined — same heuristics as
// every other JIT family.
func (ToBinaryEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// ReturnName is the serializer arg (`Ser`). Mion's
// `JitFunctions.toBinary.returnName = jitBinarySerializerArgs.sεr`
// (constants.functions.ts:111) — the inner fn returns the serializer
// instance so callers can chain `.getBuffer()`.
func (ToBinaryEmitter) ReturnName() string {
	return "Ser"
}

// Emit dispatches the per-kind switch. Each arm mirrors mion's
// emitToBinary switch (binary/toBinary.ts:35-405).
//
// Phase 1: every arm returns CodeNS so no entries get emitted. The
// renderer skips every supported kind silently — `Supports` was set
// to widen during early development; the actual emit lights up
// kind-by-kind in subsequent phases.
func (ToBinaryEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	ser := ctx.ArgName("sεr")
	switch rt.Kind {

	// ###################### ATOMIC TYPES ######################
	case protocol.KindAny, protocol.KindUnknown, protocol.KindObject:
		// mion:binary/toBinary.ts:47-49,73-75 —
		// `serString(JSON.stringify(v))`. Serialized as JSON string.
		return JitCode{Code: ser + ".serString(JSON.stringify(" + v + "))", Type: CodeS}

	case protocol.KindNull:
		// mion:binary/toBinary.ts:52 — `view.setUint8(index++, 0)`.
		return JitCode{Code: ser + ".view.setUint8(" + ser + ".index++, 0)", Type: CodeS}

	case protocol.KindBoolean:
		// mion:binary/toBinary.ts:54 — `view.setUint8(index++, !!v)`.
		return JitCode{Code: ser + ".view.setUint8(" + ser + ".index++, !!" + v + ")", Type: CodeS}

	case protocol.KindNumber:
		// mion:binary/toBinary.ts:56 —
		// `view.setFloat64(index, v, 1, (index += 8))`.
		return JitCode{Code: ser + ".view.setFloat64(" + ser + ".index, " + v + ", 1, (" + ser + ".index += 8))", Type: CodeS}

	case protocol.KindString, protocol.KindTemplateLiteral:
		// mion:binary/toBinary.ts:59,85 — `serString(v)`.
		return JitCode{Code: ser + ".serString(" + v + ")", Type: CodeS}

	case protocol.KindBigInt:
		// mion:binary/toBinary.ts:62 — `serString(v.toString(), true)`.
		// `true` flag bypasses the string cache (bigints rarely repeat).
		return JitCode{Code: ser + ".serString(" + v + ".toString(), true)", Type: CodeS}

	case protocol.KindUndefined, protocol.KindVoid:
		// mion:binary/toBinary.ts:66 — `view.setUint8(index++, 1)`.
		return JitCode{Code: ser + ".view.setUint8(" + ser + ".index++, 1)", Type: CodeS}

	case protocol.KindSymbol:
		// Unsupported — symbol identity does not round-trip through
		// serialisation. See docs/UNSUPPORTED-KINDS.md FAQ.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindRegexp:
		// mion:binary/toBinary.ts:71 —
		// `serString(v.source); serString(v.flags)`.
		return JitCode{Code: ser + ".serString(" + v + ".source);" + ser + ".serString(" + v + ".flags)", Type: CodeS}

	case protocol.KindEnum:
		// mion:binary/toBinary.ts:77 — `serEnum(v)`.
		return JitCode{Code: ser + ".serEnum(" + v + ")", Type: CodeS}

	case protocol.KindNever:
		// mion:binary/toBinary.ts:82 — throws "Never type cannot be
		// serialized to Binary".
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		// mion:binary/toBinary.ts:218 — throws
		// "Jit compilation disabled for Non Serializable types.".
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindLiteral:
		// mion:binary/toBinary.ts:86-106 — when opts.noLiterals, dispatch
		// to the underlying primitive's emit. Otherwise the literal is
		// restored from the RunType at decode time (no bytes written /
		// read), so emit is a noop.
		return emitLiteralToBinary(rt, v, ser)

	// ###################### MEMBER TYPES ######################
	case protocol.KindArray:
		return emitArrayToBinary(rt, ctx, v, ser)

	case protocol.KindIndexSignature:
		return emitIndexSignatureToBinary(rt, ctx, v, ser)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:binary/toBinary.ts:156-164 — top-level function types are
		// not directly serializable; mion exposes compileParams /
		// compileReturn for that. The Go side has no params subkind
		// (see protocol/subkind.go) so we always throw at top-level
		// function types.
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyToBinary(rt, ctx, v, ser)

	case protocol.KindTupleMember:
		return emitTupleMemberToBinary(rt, ctx, v, ser)

	// ###################### COLLECTION TYPES ######################
	case protocol.KindObjectLiteral, protocol.KindIntersection:
		return emitObjectToBinary(rt, ctx, v, ser)

	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate:
			// mion:binary/toBinary.ts:265 —
			// `view.setFloat64(index, v.getTime(), 1, (index += 8))`.
			return JitCode{Code: ser + ".view.setFloat64(" + ser + ".index, " + v + ".getTime(), 1, (" + ser + ".index += 8))", Type: CodeS}
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableToBinary(rt, ctx, v, ser)
		case protocol.SubKindNonSerializable:
			return JitCode{Code: "", Type: CodeNS}
		case protocol.SubKindNone:
			return emitObjectToBinary(rt, ctx, v, ser)
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindTuple:
		return emitTupleToBinary(rt, ctx, v, ser)

	case protocol.KindUnion:
		return emitUnionToBinaryFlat(rt, ctx, v, ser)
	}
	return JitCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall mirrors PrepareForJsonEmitter's pattern — pass the
// runtime value AND the serializer through the call. The inner function
// returns `Ser` so dependency-call sites that need to chain wouldn't
// need the return, but we keep the assignment shape symmetric with the
// other emitters.
//
// Shape: `<hash>.fn(v, Ser)` for cross-fn, `<hash>(v, Ser)` for self.
func (ToBinaryEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	ser := ctx.ArgName("sεr")
	args := ctx.Vλl + ", " + ser
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	if isSelf {
		return ctx.walker.FnName + "(" + args + ")"
	}
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
	}
	return childID + ".fn(" + args + ")"
}

// Finalize — empty bodies collapse to `return Ser` + noop flag. The
// renderer still emits the factory so dep-call chains resolve.
func (ToBinaryEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return Ser" {
		return "return Ser", true
	}
	return code, false
}

// emitLiteralToBinary mirrors mion's literal.ts emitToBinary —
// dispatches to the underlying primitive's emit when noLiterals is set.
// Without noLiterals the literal value is restored from the RunType
// definition at decode time, so no bytes are written.
//
// v1: we don't carry noLiterals on the protocol RunType yet, so always
// fall through to the "skip" branch. Future: surface the option via
// RunType.Flags.
func emitLiteralToBinary(rt *protocol.RunType, v string, ser string) JitCode {
	_ = rt
	_ = v
	_ = ser
	return JitCode{Code: "", Type: CodeS}
}

// emitArrayToBinary mirrors mion's binary/toBinary.ts:110-126.
//
// Wire shape: `[uint32 length, items...]`. The length prefix is written
// before the loop body so the decoder can preallocate.
func emitArrayToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}
	if childJit.Code == "" {
		// All-noop child — still need to emit the length so the decoder
		// knows the array's size.
		body := ser + ".view.setUint32(" + ser + ".index, " + v + ".length, 1);" + ser + ".index += 4"
		return JitCode{Code: body, Type: CodeS}
	}
	body := ser + ".view.setUint32(" + ser + ".index, " + v + ".length, 1);" + ser + ".index += 4;" +
		"for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
	return JitCode{Code: body, Type: CodeS}
}

// emitIndexSignatureToBinary mirrors mion's binary/toBinary.ts:127-154.
//
// Wire shape: `[uint32 count, (keyOrUint32, value)*]`. Count is
// back-patched after the loop so dynamic keysets are supported.
func emitIndexSignatureToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
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
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childJit := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return JitCode{Code: "", Type: CodeNS}
	}

	lenVar := ctx.NextLocalVar("cnt")
	idxVar := ctx.NextLocalVar("piI")
	// Determine key serialization: numeric index sig writes uint32,
	// string writes serString.
	numericKey := false
	if rt.Index != nil {
		idxResolved := ctx.ResolveRef(rt.Index)
		if idxResolved != nil && idxResolved.Kind == protocol.KindNumber {
			numericKey = true
		}
	}
	var keyCode string
	if numericKey {
		keyCode = ser + ".view.setUint32(" + ser + ".index, Number(" + keyVar + "), 1);" + ser + ".index += 4"
	} else {
		keyCode = ser + ".serString(" + keyVar + ")"
	}
	body := "let " + lenVar + " = 0; const " + idxVar + " = " + ser + ".index; " + ser + ".index += 4;" +
		"for (const " + keyVar + " in " + v + ") {" + keyCode + ";" + childJit.Code + ";" + lenVar + "++;}" +
		ser + ".view.setUint32(" + idxVar + ", " + lenVar + ", 1)"
	return JitCode{Code: body, Type: CodeS}
}

// emitPropertyToBinary mirrors mion's binary/toBinary.ts:181-195.
//
// Required properties: just emit child code (no header — order is
// determined by declaration). Optional properties: emit child code
// inside an `if (accessor !== undefined)` guard PLUS set the optional
// bitmap bit. The bitmap variable is set by the parent's
// emitObjectToBinary via context items.
func emitPropertyToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
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
	if rt.Optional {
		// The parent (emitObjectToBinary) wraps optional props with their
		// own bitmap handling — at the property level we just emit the
		// guarded code; the bitmap-set is appended by the parent.
		if childJit.Code == "" {
			return JitCode{Code: "if (" + accessor + " !== undefined) {}", Type: CodeS}
		}
		return JitCode{Code: "if (" + accessor + " !== undefined) {" + childJit.Code + "}", Type: CodeS}
	}
	if childJit.Code == "" {
		return JitCode{Code: "", Type: CodeS}
	}
	return childJit
}

// emitObjectToBinary mirrors mion's binary/toBinary.ts:222-261.
//
// Wire shape:
//   - required props in declaration order (no header)
//   - optional bitmap: ceil(N/8) bytes, 1 bit per optional prop
//   - optional props in order — only emitted when their bit is set
//
// Skips static / function-typed children. When the object carries an
// index signature, the index signature's emit handles the whole loop.
func emitObjectToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
	// If the object has an index signature, defer to its emit (which
	// covers every enumerable key).
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			return emitIndexSignatureToBinary(resolved, ctx, v, ser)
		}
	}

	// Split children into required vs optional. Static and function-typed
	// props are skipped entirely.
	var required, optional []*protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
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
			ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, resolved.Name)
			continue
		}
		if resolved.Optional {
			optional = append(optional, child)
		} else {
			required = append(required, child)
		}
	}

	var parts []string
	// Required props — straight concat in declared order.
	for _, child := range required {
		childJit := ctx.CompileChild(child, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		parts = append(parts, childJit.Code)
	}

	if len(optional) > 0 {
		bitmapInit, bitmapVar := emitOptionalBitmapInit(ctx, ser, len(optional), false)
		// Emit each optional prop with a bit-set when its accessor is
		// defined. We pre-record the bitmap var so the property emit can
		// reach it via context items.
		var optParts []string
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
			ctx.SetChildAccessor(accessor)
			innerJit := ctx.CompileChild(resolved.Child, CodeS)
			ctx.SetChildAccessor("")
			if innerJit.Type == CodeNS {
				return JitCode{Code: "", Type: CodeNS}
			}
			bitIdx := strconv.Itoa(i & 7)
			setMask := ser + ".setBitMask(" + bitmapVar + ", " + bitIdx + ")"
			body := setMask
			if innerJit.Code != "" {
				body = innerJit.Code + ";" + setMask
			}
			guarded := "if (" + accessor + " !== undefined) {" + body + "}"
			// Every 8 optional props we bump the bitmap byte index so
			// the next 8 bits land in a fresh byte.
			modIndex := i + 1
			if modIndex%8 == 0 && modIndex < len(optional) {
				guarded += ";" + bitmapVar + "++"
			}
			optParts = append(optParts, guarded)
		}
		parts = append(parts, bitmapInit)
		parts = append(parts, optParts...)
	}

	if len(parts) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitOptionalBitmapInit allocates a bitmap byte sequence at the
// current serializer index, zeroes the bytes, and returns the init
// code + the JS variable holding the bitmap's start index.
//
// `isTuple` flag exists for naming parity with mion (`tbmI` for tuple,
// `bmI` for object) so debug names are recognisable in stack traces.
func emitOptionalBitmapInit(ctx *EmitContext, ser string, optionalLength int, isTuple bool) (string, string) {
	prefix := ""
	if isTuple {
		prefix = "t"
	}
	bitmapVar := ctx.NextLocalVar(prefix + "bmI")
	bitmapLength := (optionalLength + 7) / 8
	var zeroLoop string
	if bitmapLength > 1 {
		zeroVar := ctx.NextLocalVar(prefix + "iBl")
		zeroLoop = "for (let " + zeroVar + " = 0; " + zeroVar + " < " + strconv.Itoa(bitmapLength) + "; " + zeroVar + "++) {" + ser + ".view.setUint8(" + ser + ".index++, 0)}"
	} else {
		zeroLoop = ser + ".view.setUint8(" + ser + ".index++, 0)"
	}
	decl := "const"
	if bitmapLength > 1 {
		decl = "let"
	}
	init := decl + " " + bitmapVar + " = " + ser + ".index;" + zeroLoop
	return init, bitmapVar
}

// emitTupleToBinary mirrors mion's binary/toBinary.ts:306-349.
//
// Wire shape: required, optional bitmap + values, rest. Function-param
// subkind: every non-rest param is treated as optional (binary protocol
// allows trailing params to be elided).
func emitTupleToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
	if len(rt.Children) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	// isFnParams stays false: ts-go-run-types intentionally does NOT
	// surface mion's SubKindParams on the protocol. Every other JIT
	// generator (isType / getTypeErrors / prepareForJson / restoreFromJson
	// / stringifyJson / …) treats `Parameters<typeof fn>` as a plain
	// tuple; adding the subkind for binary alone would create asymmetric
	// dispatch across the JIT family. See `docs/ROADMAP.md` →
	// "Binary serialization — function-params router conveniences" for
	// the full rationale and the migration path (caller-driven option
	// rather than protocol-level subkind) if we ever surface mion's
	// all-optional + paramsSlice behaviours.
	isFnParams := false

	var required, optional, rest []*protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			rest = append(rest, child)
		} else if isFnParams || resolved.Optional {
			optional = append(optional, child)
		} else {
			required = append(required, child)
		}
	}

	var parts []string
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
		bitmapInit, bitmapVar := emitOptionalBitmapInit(ctx, ser, len(optional), true)
		parts = append(parts, bitmapInit)
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			pos := positionStr(resolved)
			accessor := v + "[" + pos + "]"
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
			bitIdx := strconv.Itoa(i & 7)
			setMask := ser + ".setBitMask(" + bitmapVar + ", " + bitIdx + ")"
			body := setMask
			if innerJit.Code != "" {
				body = innerJit.Code + ";" + setMask
			}
			guarded := "if (" + accessor + " !== undefined) {" + body + "}"
			modIndex := i + 1
			if modIndex%8 == 0 && modIndex < len(optional) {
				guarded += ";" + bitmapVar + "++"
			}
			parts = append(parts, guarded)
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

	if len(parts) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitTupleMemberToBinary handles a single tuple element. Required
// non-rest: emit child code at v[pos]. Rest: loop from pos to length
// emitting child code. Optional handling lives at the tuple level (the
// bitmap is per-tuple, not per-member), so optional tupleMember just
// emits the value code without the guard — the parent wraps it.
func emitTupleMemberToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
	_ = ser
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS, the walker latches the leaf, and the
	// renderer surfaces an alwaysThrow.
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
		// Write the rest count (= v.length - position) as a uint32
		// before the items. Decoder reads this and loops
		// `i = position; i < position + count`. Without the length
		// prefix the decoder misaligns by 4 bytes and reads garbage.
		pos := positionStr(rt)
		restCount := v + ".length - " + pos
		body := ser + ".view.setUint32(" + ser + ".index, " + restCount + ", 1); " + ser + ".index += 4;" +
			"for (let " + iVar + " = " + pos + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childJit.Code + "}"
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
	return childJit
}

// emitNativeIterableToBinary handles Map / Set — mirrors mion's
// binary/toBinary.ts:269-285.
//
// Wire shape: `[uint32 size, entries...]`. Each entry is the wrapped
// child types' bytes (Map: key + value; Set: item).
func emitNativeIterableToBinary(rt *protocol.RunType, ctx *EmitContext, v string, ser string) JitCode {
	isMap := rt.SubKind == protocol.SubKindMap
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
		childJit := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code != "" {
			childCodes = append(childCodes, childJit.Code)
		}
	}

	setLen := ser + ".view.setUint32(" + ser + ".index, " + v + ".size, 1);" + ser + ".index += 4"
	if len(childCodes) == 0 {
		// No transforms — write just the size; decoder reconstructs
		// empty.
		return JitCode{Code: setLen, Type: CodeS}
	}
	body := setLen + ";for (const " + entryVar + " of " + v + ") {" + strings.Join(childCodes, ";") + "}"
	return JitCode{Code: body, Type: CodeS}
}
