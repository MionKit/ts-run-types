package typefns

import (
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// jsonWireSupports is the ONE supported-kind set for every JSON-wire
// family — prepareForJson, restoreFromJson, stringifyJson, and the
// compact / prepare-safe / compact-restore variants that already
// delegated. The families share the set by definition (they are stages
// of the same wire format), so a kind gaining JSON support lands here
// once and covers all of them.
//
// Per-kind notes (family-specific behavior lives in each family's Emit):
//   - KindNever / KindPromise / SubKindNonSerializable are SUPPORTED so
//     the renderer compiles the entry and each family's Emit surfaces
//     its own runtime-throwing factory (ref: nodes/atomic/never.ts,
//     nodes/native/promise.ts).
//   - KindArray gates on a non-nil child — a malformed KindArray with
//     Child=nil would reach Emit and panic.
//   - KindUnion gates on members; the families encode/decode the
//     `[memberIndex, transformedValue]` envelope per-member (see
//     json_prepare.go / json_restore.go union arms).
//   - KindIntersection is resolved by tsgo at the checker layer
//     (`A & B` → merged object literal); supported as a defensive noop
//     in case a resolution path produces an unresolved intersection.
//   - KindTemplateLiteral is string-flavoured at runtime — noop.
//   - Function-ish kinds emit a noop body at top level; object-property
//     children of these kinds are filtered out by the object emits.
//   - KindClass: Date is atomic (its own toJSON); user classes
//     (SubKindNone) use the object emit; Map/Set materialise into
//     JSON-encodable arrays; Temporal types are atomic leaves.
func jsonWireSupports(rt *protocol.RunType) bool {
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
	case protocol.KindTemplateLiteral:
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
		return protocol.IsTemporalSubKind(rt.SubKind)
	case protocol.KindPromise:
		return true
	}
	return false
}

// emitElementLoop compiles child under the subscript accessor `v[i]`
// and wraps its statement-shaped code in a `for` loop from start to
// v.length — the shared in-place traversal the mutating JSON families
// (prepare / restore / compact-restore) use for arrays and rest tuple
// tails. Empty child code collapses the loop to a noop; a CodeNS child
// propagates so the walker latches the unsupported leaf and the
// renderer emits alwaysThrow keyed off the child's kind.
func emitElementLoop(child *protocol.RunType, ctx *EmitContext, v, start string) RTCode {
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (let " + iVar + " = " + start + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}
