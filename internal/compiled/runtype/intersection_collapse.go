package runtype

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype/typeid"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// collapseIntersection projects a TS intersection type into a single
// non-intersection RunType, following the rules in
// /root/.claude/plans/intersection-zesty-spindle.md.
//
// The TypeScript checker eagerly collapses many intersections before we see
// them (`string & number` → never; `string & "x"` → "x"; same-shape object
// merges) so the cases reaching this function are typically:
//
//   - pure object×object (delegate to projectObjectLiteral — the checker
//     already merges property lists);
//   - primitive×brand object (`string & {__brand: "X"}`) — keep primitive,
//     attach the object literals as decorators;
//   - more exotic combinations the checker couldn't reduce.
func (cache *Cache) collapseIntersection(tsType *checker.Type, node *protocol.RunType) {
	members := tsType.AsUnionOrIntersectionType().Types()

	var (
		primitiveMember *checker.Type
		literalMember   *checker.Type
		objectMembers   []*checker.Type
		hasNever        bool
		// hasIncompatiblePrimitives surfaces `string & number`-style cases
		// that survived past the checker's own collapse.
		hasIncompatiblePrimitives bool
	)

	for _, member := range members {
		memberFlags := member.Flags()
		switch {
		case memberFlags&checker.TypeFlagsNever != 0:
			hasNever = true
		case memberFlags&checker.TypeFlagsAny != 0,
			memberFlags&checker.TypeFlagsUnknown != 0:
			// Identity under intersection — skip.
		case isLiteralFlags(memberFlags):
			if literalMember == nil {
				literalMember = member
				continue
			}
			// Two literal members — incompatible if the new one differs from
			// the kept one. Same literal repeated would already have been
			// deduped by the checker.
			if !sameLiteral(literalMember, member, cache.typeChecker) {
				hasIncompatiblePrimitives = true
			}
		case isPrimitiveBaseFlags(memberFlags):
			if primitiveMember == nil {
				primitiveMember = member
				continue
			}
			// Two different primitive base members — `string & number`.
			if !samePrimitiveBase(primitiveMember, member) {
				hasIncompatiblePrimitives = true
			}
		case memberFlags&checker.TypeFlagsObject != 0:
			objectMembers = append(objectMembers, member)
		}
	}

	if hasNever || hasIncompatiblePrimitives {
		node.Kind = protocol.KindNever
		return
	}

	// Primitive narrowing: `string & "x"` should already be reduced by the
	// checker, but if both kinds survive we keep the literal — the literal
	// only survives the loop above when it's compatible with the primitive.
	if literalMember != nil && primitiveMember != nil {
		if !literalExtendsPrimitive(literalMember, primitiveMember) {
			node.Kind = protocol.KindNever
			return
		}
		// Drop the primitive — the literal is the narrowed form.
		primitiveMember = nil
	}

	// Primitive (or literal) × object literals: brand case. Keep the
	// primitive, attach each object literal as a decorator — unless the
	// object literal is recognised as a TypeFormat brand, in which case
	// it is lifted onto node.FormatAnnotation and skipped from the
	// TypeMeta array. Recognition is structural (presence of the two
	// sentinel properties); see typeid.FormatAnnotationFromType.
	primary := primitiveMember
	if literalMember != nil {
		primary = literalMember
	}
	if primary != nil && len(objectMembers) > 0 {
		cache.projectPrimitiveInto(primary, node)
		for _, objectMember := range objectMembers {
			if annotation := typeid.FormatAnnotationFromType(cache.typeChecker, objectMember); annotation != nil {
				node.FormatAnnotation = annotation
				continue
			}
			node.TypeMeta = append(node.TypeMeta, cache.Serialize(objectMember))
		}
		return
	}

	// Primitive alone (every object member ended up being any/unknown).
	if primary != nil {
		cache.projectPrimitiveInto(primary, node)
		return
	}

	// Builtin-class × brand: `FormatDate<P>` lowers to `Date & {brand}`,
	// which the checker keeps as a real intersection of two object members
	// (the Date interface + the sentinel-bearing brand object). Neither is
	// a primitive, so without this branch it would fall through to the
	// object×object merge below and lose BOTH the Date class identity
	// (SubKindDate, classType wiring) AND the format brand. Detect a
	// recognised builtin-class member alongside a brand member, project the
	// class, and lift the annotation — the same shape a bare `Date` node
	// gets, plus the FormatAnnotation a string format gets.
	if classMember, annotation := splitBuiltinClassBrand(cache.typeChecker, objectMembers); classMember != nil && annotation != nil {
		// Reuse the standalone-Date class projector so SubKind / ClassRef /
		// classType wiring stay identical, then lift the brand on top.
		cache.projectClass(classMember, node)
		node.FormatAnnotation = annotation
		return
	}

	// Object × object — surface the merged shape as an objectLiteral.
	// We DON'T route through projectObjectType because its
	// IsArrayLikeType / Promise / class branches call GetTypeArguments
	// unconditionally, which tsgo crashes on for intersection types.
	// projectMembersInto only calls GetPropertiesOfType + GetIndexInfos
	// + GetSignaturesOfType, all of which are safe on intersections —
	// the TS checker has already merged property sets across members.
	if len(objectMembers) > 0 {
		node.Kind = protocol.KindObjectLiteral
		properties := cache.typeChecker.GetPropertiesOfType(tsType)
		callSignatures := cache.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
		cache.projectMembersInto(tsType, node, properties, callSignatures, false)
		return
	}

	// Fully reduced to any/unknown — pick unknown as a safe fallback.
	node.Kind = protocol.KindUnknown
}

// projectPrimitiveInto fills `node` with the kind+literal data for a
// primitive or literal member. Mirrors the relevant arms of projectType's
// switch, but writes into an already-allocated node so the caller can keep
// the original id + add decorators on top.
func (cache *Cache) projectPrimitiveInto(tsType *checker.Type, node *protocol.RunType) {
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsStringLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = tsType.AsLiteralType().Value()
	case flags&checker.TypeFlagsNumberLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = parseNumberLiteral(cache.typeChecker.TypeToString(tsType))
	case flags&checker.TypeFlagsBooleanLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = cache.typeChecker.TypeToString(tsType) == "true"
	case flags&checker.TypeFlagsBigIntLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = fmt.Sprintf("%v", tsType.AsLiteralType().Value())
		node.Flags = append(node.Flags, "bigint")
	case flags&checker.TypeFlagsString != 0:
		node.Kind = protocol.KindString
	case flags&checker.TypeFlagsNumber != 0:
		node.Kind = protocol.KindNumber
	case flags&checker.TypeFlagsBoolean != 0:
		node.Kind = protocol.KindBoolean
	case flags&checker.TypeFlagsBigInt != 0:
		node.Kind = protocol.KindBigInt
	case flags&checker.TypeFlagsESSymbol != 0:
		node.Kind = protocol.KindSymbol
	default:
		node.Kind = typeid.KindOf(cache.typeChecker, tsType)
	}
}

// builtinClassNames are the lib.d.ts interfaces mion treats as classes
// (mirrors the switch in projectClass / projectObjectType). A member with
// one of these symbol names is the "base" of a `Builtin & {brand}`
// intersection — currently only Date carries a format family, but the set
// matches the class projector so future builtin formats slot in.
var builtinClassNames = map[string]bool{"Date": true, "Map": true, "Set": true, "RegExp": true}

// splitBuiltinClassBrand inspects the object members of an intersection
// for the `Builtin & {brand}` shape: exactly one member is a recognised
// builtin class (by symbol name) and exactly one carries a TypeFormat
// brand. Returns (classMember, annotation) when both are present, else
// (nil, nil) so the caller falls back to the normal object merge.
func splitBuiltinClassBrand(typeChecker *checker.Checker, objectMembers []*checker.Type) (*checker.Type, *protocol.FormatAnnotation) {
	var classMember *checker.Type
	var annotation *protocol.FormatAnnotation
	for _, member := range objectMembers {
		if found := typeid.FormatAnnotationFromType(typeChecker, member); found != nil {
			if annotation != nil {
				return nil, nil // two brands — not the shape we handle
			}
			annotation = found
			continue
		}
		if symbol := member.Symbol(); symbol != nil && builtinClassNames[symbol.Name] {
			if classMember != nil {
				return nil, nil // two builtin classes — ambiguous
			}
			classMember = member
		}
	}
	return classMember, annotation
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

// samePrimitiveBase reports whether a and b are the same primitive base
// (both string, both number, etc). Used to short-circuit `string & string`
// without firing the incompatible-primitive path.
func samePrimitiveBase(a, b *checker.Type) bool {
	mask := checker.TypeFlagsString | checker.TypeFlagsNumber | checker.TypeFlagsBoolean |
		checker.TypeFlagsBigInt | checker.TypeFlagsESSymbol
	return (a.Flags() & mask) == (b.Flags() & mask)
}

func sameLiteral(a, b *checker.Type, typeChecker *checker.Checker) bool {
	if a == b {
		return true
	}
	return typeChecker.TypeToString(a) == typeChecker.TypeToString(b)
}

func literalExtendsPrimitive(literal, primitive *checker.Type) bool {
	literalFlags := literal.Flags()
	primitiveFlags := primitive.Flags()
	switch {
	case literalFlags&checker.TypeFlagsStringLiteral != 0:
		return primitiveFlags&checker.TypeFlagsString != 0
	case literalFlags&checker.TypeFlagsNumberLiteral != 0:
		return primitiveFlags&checker.TypeFlagsNumber != 0
	case literalFlags&checker.TypeFlagsBooleanLiteral != 0:
		return primitiveFlags&checker.TypeFlagsBoolean != 0
	case literalFlags&checker.TypeFlagsBigIntLiteral != 0:
		return primitiveFlags&checker.TypeFlagsBigInt != 0
	}
	return false
}
