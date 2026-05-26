package jitfn

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// union_flat_binary.go owns the toBinary / fromBinary emits for KindUnion.
// Mirrors union_flat.go's JSON-side wire shape, but writes / reads bytes
// instead of building a `[idx, value]` JS literal. The wire shape stays
// flat-prop:
//
//   - Atomic union members keep `[memberIndex, valueBytes]` — first the
//     discriminator byte (uint8, or uint16 when total members > 255),
//     then the member's serialized bytes.
//   - Object/class union members are MERGED into one envelope with
//     discriminator value `-1` (encoded as `0xFF` in uint8 mode, or
//     `0xFFFF` in uint16 mode). The merged object is encoded as a
//     bitmap of present merged-props + the values for present props.
//
// This file relies on the FlatLayout struct + buildFlatLayout helper
// in union_flat_layout.go (shared with the JSON family).

// discriminatorWidth returns ("Uint8", 1) or ("Uint16", 2) depending on
// the total number of members in the union. Mion uses the same trick at
// binary/toBinary.ts:376-380 — uint8 when index fits, uint16 otherwise.
// The `-1` sentinel for the merged-object branch is encoded as the
// max value (0xFF / 0xFFFF) so the decoder special-cases it.
func discriminatorWidth(memberCount int) (string, int) {
	if memberCount > 255 {
		return "Uint16", 2
	}
	return "Uint8", 1
}

// sentinelLiteral returns the JS literal for the merged-object branch's
// discriminator value, given the width. uint8 → 0xFF, uint16 → 0xFFFF.
func sentinelLiteral(width string) string {
	if width == "Uint16" {
		return "65535"
	}
	return "255"
}

// writeDiscriminator returns the JS statement that writes `index` at
// the current serializer position and advances `index`. For uint8 we
// use `setUint8(index++, value)`; for uint16 we use
// `setUint16(index, value, 1, (index += 2))`.
func writeDiscriminator(ser, width string, value int) string {
	if width == "Uint16" {
		return ser + ".view.setUint16(" + ser + ".index, " + strconv.Itoa(value) + ", 1, (" + ser + ".index += 2))"
	}
	return ser + ".view.setUint8(" + ser + ".index++, " + strconv.Itoa(value) + ")"
}

// readDiscriminator returns the JS expression that reads the next
// discriminator value. The advance is fused in via the `index +=` arg.
func readDiscriminator(des, width string) string {
	if width == "Uint16" {
		return "(" + des + ".view.getUint16(" + des + ".index, 1) + (" + des + ".index += 2, 0))"
	}
	return des + ".view.getUint8(" + des + ".index++)"
}

// emitUnionToBinaryFlat — encode-side of the flat-union binary wire
// shape. Mirrors emitUnionPrepareForJsonFlat in union_flat.go:74-143
// but writes bytes instead of building `[idx, v]` literals.
//
// The width of the discriminator is chosen by the TOTAL member count
// (atomic + object members), and the merged-object branch always uses
// the sentinel value (0xFF or 0xFFFF). Note: this means a union with
// >255 atomic members but no objects still encodes as uint16 if any
// originalIndex spills past 255 — handled identically here.
func emitUnionToBinaryFlat(rt *protocol.RunType, ctx *EmitContext, v, ser string) JitCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	totalMembers := len(layout.AtomicMembers) + len(layout.ObjectMembers)
	width, _ := discriminatorWidth(totalMembers)
	sentinel := sentinelLiteral(width)

	var clauses []string

	// Atomic members — `if (isType) { writeDiscriminator(idx); encode; }`.
	for _, m := range layout.AtomicMembers {
		childJit := ctx.CompileChild(m.Ref, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		isTypeExpr := unionMemberIsTypeCheck(m.Resolved, ctx, v)
		guard := isTypeExpr
		if isObjectLikeKind(m.Resolved.Kind) {
			guard = "(typeof " + v + " === 'object' && " + v + " !== null && " + isTypeExpr + ")"
		}
		body := writeDiscriminator(ser, width, m.OriginalIndex)
		if childJit.Code != "" {
			body += ";" + strings.TrimSpace(childJit.Code)
		}
		clause := "if (" + guard + ") {" + body + "}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	// Object branch — write sentinel discriminator + merged bitmap +
	// merged prop values.
	if len(layout.ObjectMembers) > 0 {
		sentinelWrite := sentinelLiteral(width)
		if width == "Uint16" {
			sentinelWrite = ser + ".view.setUint16(" + ser + ".index, " + sentinel + ", 1, (" + ser + ".index += 2))"
		} else {
			sentinelWrite = ser + ".view.setUint8(" + ser + ".index++, " + sentinel + ")"
		}

		// Separate required vs optional merged props. Required props skip
		// the bitmap entirely. Optional props share a bitmap (1 bit per
		// optional prop, 8 per byte).
		var requiredProps, optionalProps []FlatMergedProp
		for _, mp := range layout.MergedProps {
			if mp.Required {
				requiredProps = append(requiredProps, mp)
			} else {
				optionalProps = append(optionalProps, mp)
			}
		}

		parts := []string{sentinelWrite}

		// Required merged props.
		for _, mp := range requiredProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propCode, ok := emitMergedPropToBinary(mp, accessor, ctx, ser)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			if propCode != "" {
				parts = append(parts, propCode)
			}
		}

		// Optional merged props with shared bitmap.
		if len(optionalProps) > 0 {
			bitmapInit, bitmapVar := emitOptionalBitmapInit(ctx, ser, len(optionalProps), false)
			parts = append(parts, bitmapInit)
			for i, mp := range optionalProps {
				accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
				propCode, ok := emitMergedPropToBinary(mp, accessor, ctx, ser)
				if !ok {
					return JitCode{Code: "", Type: CodeNS}
				}
				bitIdx := strconv.Itoa(i & 7)
				setMask := ser + ".setBitMask(" + bitmapVar + ", " + bitIdx + ")"
				body := setMask
				if propCode != "" {
					body = propCode + ";" + setMask
				}
				guarded := "if (" + accessor + " !== undefined) {" + body + "}"
				modIndex := i + 1
				if modIndex%8 == 0 && modIndex < len(optionalProps) {
					guarded += ";" + bitmapVar + "++"
				}
				parts = append(parts, guarded)
			}
		}

		objClause := "if (typeof " + v + " === 'object' && " + v + " !== null) {" + strings.Join(parts, ";") + "}"
		if len(clauses) > 0 {
			objClause = " else " + objClause
		}
		clauses = append(clauses, objClause)
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return JitCode{Code: strings.Join(clauses, ""), Type: CodeS}
}

// emitMergedPropToBinary mirrors emitMergedPropPrepare for the binary
// wire shape. Single-candidate: delegate to the candidate's toBinary.
// Multi-candidate: write a sub-discriminator (always uint8 since per-
// prop candidate counts are small) + candidate bytes, gated by isType.
func emitMergedPropToBinary(mp FlatMergedProp, accessor string, ctx *EmitContext, ser string) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	// Multi-candidate — always wrap with sub-discriminator. Width is
	// uint8 (per-prop candidate counts effectively bounded by union
	// width, but practically <=255).
	var arms []string
	for i, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		isTypeExpr := unionMemberIsTypeCheck(cand.Resolved, ctx, accessor)
		guard := isTypeExpr
		if isObjectLikeKind(cand.Resolved.Kind) {
			guard = "(typeof " + accessor + " === 'object' && " + accessor + " !== null && " + isTypeExpr + ")"
		}
		body := ser + ".view.setUint8(" + ser + ".index++, " + strconv.Itoa(i) + ")"
		if jc.Code != "" {
			body += ";" + strings.TrimSpace(jc.Code)
		}
		arm := "if (" + guard + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	return strings.Join(arms, ""), true
}

// emitUnionFromBinaryFlat — decode-side of the flat-union binary wire
// shape. Reads the discriminator, then either dispatches to the
// atomic-member's decode OR (when sentinel) reads the merged bitmap +
// merged prop values.
func emitUnionFromBinaryFlat(rt *protocol.RunType, ctx *EmitContext, v, des string) JitCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	totalMembers := len(layout.AtomicMembers) + len(layout.ObjectMembers)
	width, _ := discriminatorWidth(totalMembers)
	sentinel := sentinelLiteral(width)

	decVar := ctx.NextLocalVar("dec")
	readDec := "const " + decVar + " = " + readDiscriminator(des, width)
	var arms []string

	// Object branch — read merged bitmap + decode each merged prop.
	if len(layout.ObjectMembers) > 0 {
		var requiredProps, optionalProps []FlatMergedProp
		for _, mp := range layout.MergedProps {
			if mp.Required {
				requiredProps = append(requiredProps, mp)
			} else {
				optionalProps = append(optionalProps, mp)
			}
		}

		parts := []string{v + " = {}"}

		// Required merged props.
		for _, mp := range requiredProps {
			accessor := v + "." + mp.Name
			if !mp.IsSafeName {
				accessor = v + "[" + quoteJS(mp.Name) + "]"
			}
			propCode, ok := emitMergedPropFromBinary(mp, accessor, ctx, des)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			// Always initialize the prop slot then run the decode.
			initSlot := accessor + " = undefined"
			if propCode != "" {
				parts = append(parts, initSlot+";"+propCode)
			} else {
				parts = append(parts, initSlot)
			}
		}

		// Optional merged props — read bitmap, then decode set bits.
		if len(optionalProps) > 0 {
			bitmapLength := (len(optionalProps) + 7) / 8
			bitmapVar := ctx.NextLocalVar("bmI")
			var bitmapInit string
			if bitmapLength > 1 {
				zeroVar := ctx.NextLocalVar("iBm")
				bitmapInit = "const " + bitmapVar + " = " + des + ".index;" + des + ".index += " + strconv.Itoa(bitmapLength) +
					"; void " + zeroVar
			} else {
				bitmapInit = "const " + bitmapVar + " = " + des + ".index++"
			}
			parts = append(parts, bitmapInit)
			for i, mp := range optionalProps {
				accessor := v + "." + mp.Name
				if !mp.IsSafeName {
					accessor = v + "[" + quoteJS(mp.Name) + "]"
				}
				byteOffset := i / 8
				bitIdx := i & 7
				bitCheck := "(" + des + ".view.getUint8(" + bitmapVar + " + " + strconv.Itoa(byteOffset) + ") & " + strconv.Itoa(1<<bitIdx) + ")"
				propCode, ok := emitMergedPropFromBinary(mp, accessor, ctx, des)
				if !ok {
					return JitCode{Code: "", Type: CodeNS}
				}
				body := accessor + " = undefined"
				if propCode != "" {
					body = body + ";" + propCode
				}
				parts = append(parts, "if ("+bitCheck+") {"+body+"}")
			}
		}

		arm := "if (" + decVar + " === " + sentinel + ") {" + strings.Join(parts, ";") + "}"
		arms = append(arms, arm)
	}

	// Atomic arms — read each member's bytes when discriminator matches
	// its originalIndex.
	for _, m := range layout.AtomicMembers {
		childJit := ctx.CompileChild(m.Ref, CodeS)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(childJit.Code)
		arm := "if (" + decVar + " === " + strconv.Itoa(m.OriginalIndex) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}

	if len(arms) == 0 {
		return JitCode{Code: readDec, Type: CodeS}
	}

	errVar := flatUnionDecodeErrorVar(ctx)
	inner := strings.Join(arms, "") + " else { throw new Error(" + errVar + ") }"
	return JitCode{Code: readDec + ";" + inner, Type: CodeS}
}

// emitMergedPropFromBinary mirrors emitMergedPropRestore for the binary
// wire shape. Single-candidate: delegate. Multi-candidate: read the
// sub-discriminator, then dispatch.
func emitMergedPropFromBinary(mp FlatMergedProp, accessor string, ctx *EmitContext, des string) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	subDecVar := ctx.NextLocalVar("sub")
	readSub := "const " + subDecVar + " = " + des + ".view.getUint8(" + des + ".index++)"
	var arms []string
	for i, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		arm := "if (" + subDecVar + " === " + strconv.Itoa(i) + ") {" + strings.TrimSpace(jc.Code) + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	errVar := flatUnionDecodeErrorVar(ctx)
	return readSub + ";" + strings.Join(arms, "") + " else { throw new Error(" + errVar + ") }", true
}
