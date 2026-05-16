package typeid

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// collapsedIntersectionID mirrors the serialize-side collapse so two
// structurally-equivalent post-collapse types share the same structural
// id (and therefore the same wire hash). The classification logic must
// stay in sync with internal/serialize/intersection_collapse.go.
//
// Rules:
//   - `A & B` where the result is an object literal (the TS checker
//     already provides the merged property set on the intersection
//     type) → id is the object literal's id.
//   - `string & {__brand}` → id is "<primitive-id>&{<sorted decorator ids>}"
//     so brand order doesn't matter (A & B == B & A) but the brand
//     content does (different brand → different id).
//   - `string & number` (or any incompatible primitive pair) → "never".
//   - everything-any → "unknown".
func (computer *Computer) collapsedIntersectionID(tsType *checker.Type) string {
	members := tsType.AsUnionOrIntersectionType().Types()

	var (
		primitiveMember *checker.Type
		literalMember   *checker.Type
		objectMembers   []*checker.Type
		hasNever        bool
		hasIncompat     bool
	)

	for _, member := range members {
		memberFlags := member.Flags()
		switch {
		case memberFlags&checker.TypeFlagsNever != 0:
			hasNever = true
		case memberFlags&checker.TypeFlagsAny != 0,
			memberFlags&checker.TypeFlagsUnknown != 0:
			// identity under &
		case isLiteralFlags(memberFlags):
			if literalMember == nil {
				literalMember = member
				continue
			}
			if literalMember != member {
				hasIncompat = true
			}
		case isPrimitiveBaseFlags(memberFlags):
			if primitiveMember == nil {
				primitiveMember = member
				continue
			}
			if !samePrimitiveBaseFlags(primitiveMember.Flags(), member.Flags()) {
				hasIncompat = true
			}
		case memberFlags&checker.TypeFlagsObject != 0:
			objectMembers = append(objectMembers, member)
		}
	}

	if hasNever || hasIncompat {
		return strconv.Itoa(int(protocol.KindNever))
	}

	if literalMember != nil && primitiveMember != nil {
		if !literalExtendsPrimitiveFlags(literalMember.Flags(), primitiveMember.Flags()) {
			return strconv.Itoa(int(protocol.KindNever))
		}
		primitiveMember = nil
	}

	primary := primitiveMember
	if literalMember != nil {
		primary = literalMember
	}

	if primary != nil && len(objectMembers) > 0 {
		primaryID := computer.Compute(primary)
		brandIDs := make([]string, 0, len(objectMembers))
		for _, objectMember := range objectMembers {
			brandIDs = append(brandIDs, computer.Compute(objectMember))
		}
		sort.Strings(brandIDs)
		return primaryID + "&{" + strings.Join(brandIDs, ",") + "}"
	}

	if primary != nil {
		return computer.Compute(primary)
	}

	if len(objectMembers) > 0 {
		// Object × object — the TS checker already merged properties on
		// the intersection type. Hash the merged members directly rather
		// than routing through objectID: the intersection isn't a Reference
		// or TupleType, and objectID's array/promise/class branches call
		// GetTypeArguments unconditionally which crashes on intersection
		// types in tsgo.
		ids := computer.memberIDs(tsType, false)
		return collectionID(int(protocol.KindObjectLiteral), ids, false)
	}

	return strconv.Itoa(int(protocol.KindUnknown))
}

func isLiteralFlags(flags checker.TypeFlags) bool {
	return flags&checker.TypeFlagsStringLiteral != 0 ||
		flags&checker.TypeFlagsNumberLiteral != 0 ||
		flags&checker.TypeFlagsBooleanLiteral != 0 ||
		flags&checker.TypeFlagsBigIntLiteral != 0
}

func isPrimitiveBaseFlags(flags checker.TypeFlags) bool {
	if isLiteralFlags(flags) {
		return false
	}
	return flags&checker.TypeFlagsString != 0 ||
		flags&checker.TypeFlagsNumber != 0 ||
		flags&checker.TypeFlagsBoolean != 0 ||
		flags&checker.TypeFlagsBigInt != 0 ||
		flags&checker.TypeFlagsESSymbol != 0
}

func samePrimitiveBaseFlags(a, b checker.TypeFlags) bool {
	mask := checker.TypeFlagsString | checker.TypeFlagsNumber | checker.TypeFlagsBoolean |
		checker.TypeFlagsBigInt | checker.TypeFlagsESSymbol
	return (a & mask) == (b & mask)
}

func literalExtendsPrimitiveFlags(literal, primitive checker.TypeFlags) bool {
	switch {
	case literal&checker.TypeFlagsStringLiteral != 0:
		return primitive&checker.TypeFlagsString != 0
	case literal&checker.TypeFlagsNumberLiteral != 0:
		return primitive&checker.TypeFlagsNumber != 0
	case literal&checker.TypeFlagsBooleanLiteral != 0:
		return primitive&checker.TypeFlagsBoolean != 0
	case literal&checker.TypeFlagsBigIntLiteral != 0:
		return primitive&checker.TypeFlagsBigInt != 0
	}
	return false
}
