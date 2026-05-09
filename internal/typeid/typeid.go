// Package typeid computes mion's structural type id directly from a tsgo
// *checker.Type. The output mirrors `_createTypeId` in
// packages/run-types/src/lib/typeId.ts so two structurally-equal types
// (identical kind + identical children, regardless of alias name) produce the
// same string. Atomic kinds are just `String(kind)`; collections compose
// `${kind}{c1,c2,…}`; cycles emit a back-ref token `$<kind>_<i><name>`.
//
// Output is fed into `internal/hashid.Dict.Unique` to produce the short hash
// id that travels on the wire.
package typeid

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Computer is the stateful walker. Memoises results on *checker.Type pointer
// to avoid re-walking. Stack tracks the active recursion path for cycle
// detection (mirrors mion's `checkCircularAndGetRefId`).
type Computer struct {
	typeChecker *checker.Checker
	cache       map[*checker.Type]string
	stack       []*checker.Type
}

// New returns a fresh Computer bound to the supplied checker.
func New(typeChecker *checker.Checker) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string)}
}

// Compute returns the structural id of tsType. Safe to call repeatedly with
// the same Computer — results are cached.
func (computer *Computer) Compute(tsType *checker.Type) string {
	if tsType == nil {
		return strconv.Itoa(int(protocol.KindNever))
	}
	if cached, ok := computer.cache[tsType]; ok {
		return cached
	}
	// Cycle: emit back-ref before pushing onto the stack.
	if index := computer.stackIndex(tsType); index >= 0 {
		return computer.cycleRef(tsType, index)
	}
	computer.stack = append(computer.stack, tsType)
	id := computer.dispatch(tsType)
	computer.stack = computer.stack[:len(computer.stack)-1]
	computer.cache[tsType] = id
	return id
}

func (computer *Computer) stackIndex(tsType *checker.Type) int {
	for i := len(computer.stack) - 1; i >= 0; i-- {
		if computer.stack[i] == tsType {
			return i
		}
	}
	return -1
}

func (computer *Computer) cycleRef(tsType *checker.Type, index int) string {
	kind := KindOf(computer.typeChecker, tsType)
	name := aliasName(tsType)
	return "$" + strconv.Itoa(int(kind)) + "_" + strconv.Itoa(index) + name
}

func (computer *Computer) dispatch(tsType *checker.Type) string {
	kind := KindOf(computer.typeChecker, tsType)
	flags := tsType.Flags()

	// Literal kinds carry the literal value directly.
	if flags&checker.TypeFlagsStringLiteral != 0 ||
		flags&checker.TypeFlagsNumberLiteral != 0 ||
		flags&checker.TypeFlagsBooleanLiteral != 0 ||
		flags&checker.TypeFlagsBigIntLiteral != 0 {
		return strconv.Itoa(int(kind)) + ":" + literalString(tsType, computer.typeChecker)
	}

	// Unique symbol literal — also a literal kind in the reflection model,
	// but tsgo's flag is `UniqueESSymbol` not a `*Literal`.
	if flags&checker.TypeFlagsUniqueESSymbol != 0 {
		name := ""
		if symbol := tsType.Symbol(); symbol != nil {
			name = symbol.Name
		}
		return strconv.Itoa(int(kind)) + ":sym:" + name
	}

	// Atomic primitives — id is just the kind number.
	switch kind {
	case protocol.KindAny, protocol.KindUnknown, protocol.KindNever, protocol.KindVoid,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol, protocol.KindObject,
		protocol.KindRegexp:
		return strconv.Itoa(int(kind))
	}

	// Enum — mion's algorithm uses just `String(kind)` for enums, but that
	// causes all enums to collapse to the same id. We disambiguate by
	// appending the typeName + sorted member values so two different enum
	// declarations don't dedup at the cache level. (mion gets away with the
	// bare-kind id because each enum is handed a distinct Type object per
	// declaration at runtime — we have to dedup ourselves.)
	if flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0 || flags&checker.TypeFlagsEnumLiteral != 0 {
		return strconv.Itoa(int(protocol.KindEnum)) + ":" + enumDiscriminator(tsType, computer.typeChecker)
	}

	// Union / intersection — composition of distributed members.
	if flags&checker.TypeFlagsUnion != 0 {
		return collectionID(kind, computer.childIDs(tsType.Distributed()), false)
	}
	if flags&checker.TypeFlagsIntersection != 0 {
		members := tsType.AsUnionOrIntersectionType().Types()
		return collectionID(kind, computer.childIDs(members), false)
	}

	// Object-flavoured: tuple / array / promise / function / class / objectLiteral.
	if flags&checker.TypeFlagsObject != 0 {
		return computer.objectID(tsType, kind)
	}

	// Fallback — kind only.
	return strconv.Itoa(int(kind))
}

func (computer *Computer) objectID(tsType *checker.Type, kind protocol.ReflectionKind) string {
	if checker.IsTupleType(tsType) {
		// Tuple — bracket-delimited child list per mion's algorithm.
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		ids := make([]string, len(typeArguments))
		for i, typeArgument := range typeArguments {
			ids[i] = computer.Compute(typeArgument)
		}
		return collectionID(protocol.KindTuple, ids, true)
	}

	// Array.
	if computer.typeChecker.IsArrayLikeType(tsType) {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(protocol.KindArray, "0", false, child)
		}
	}

	// Promise.
	if symbol := tsType.Symbol(); symbol != nil && symbol.Name == "Promise" {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(protocol.KindPromise, "0", false, child)
		}
	}

	// Class (or built-in interface mion treats as class).
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Date":
			return strconv.Itoa(int(protocol.KindClass)) + ":Date"
		case "Map":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 2 {
					return strconv.Itoa(int(protocol.KindClass)) + ":Map{" +
						computer.Compute(typeArguments[0]) + "," + computer.Compute(typeArguments[1]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.KindClass)) + ":Map"
		case "Set":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 1 {
					return strconv.Itoa(int(protocol.KindClass)) + ":Set{" +
						computer.Compute(typeArguments[0]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.KindClass)) + ":Set"
		}
	}
	if isClass(tsType) {
		// Generic user class — composition of property ids (sorted for determinism).
		ids := computer.memberIDs(tsType, true)
		return collectionID(protocol.KindClass, ids, false)
	}

	// Free function — bare callable with no own properties.
	callSignatures := computer.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	if len(callSignatures) > 0 && len(properties) == 0 {
		return strconv.Itoa(int(protocol.KindFunction))
	}

	// objectLiteral — composition of property ids, sorted by name for stability.
	ids := computer.memberIDs(tsType, false)
	if len(callSignatures) > 0 {
		// Embed call signatures alongside members.
		for _, signature := range callSignatures {
			ids = append(ids, computer.signatureID(signature, protocol.KindCallSignature, ""))
		}
		sort.Strings(ids)
	}
	return collectionID(protocol.KindObjectLiteral, ids, false)
}

func (computer *Computer) memberIDs(tsType *checker.Type, asClass bool) []string {
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	out := make([]string, 0, len(properties))
	for _, propertySymbol := range properties {
		out = append(out, computer.memberID(propertySymbol, asClass))
	}
	for _, indexInfo := range computer.typeChecker.GetIndexInfosOfType(tsType) {
		keyID := computer.Compute(indexInfo.KeyType())
		valueID := computer.Compute(indexInfo.ValueType())
		out = append(out, strconv.Itoa(int(protocol.KindIndexSignature))+":"+keyID+":"+valueID)
	}
	sort.Strings(out)
	return out
}

func (computer *Computer) memberID(symbol *ast.Symbol, asClass bool) string {
	propertyType := computer.typeChecker.GetTypeOfSymbol(symbol)
	optional := symbol.Flags&ast.SymbolFlagsOptional != 0

	// Method vs property: a property whose type is a single-call-signature
	// function with no other members maps to the reflection `method` form.
	if propertyType != nil {
		signatures := computer.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(computer.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			kind := protocol.KindMethodSignature
			if asClass {
				kind = protocol.KindMethod
			}
			return computer.signatureID(signatures[0], kind, symbol.Name) + optBit(optional)
		}
	}

	kind := protocol.KindPropertySignature
	if asClass {
		kind = protocol.KindProperty
	}
	child := computer.Compute(propertyType)
	return memberID(kind, symbol.Name, optional, child)
}

func (computer *Computer) signatureID(signature *checker.Signature, kind protocol.ReflectionKind, name string) string {
	parts := make([]string, 0, len(signature.Parameters())+1)
	for _, paramSymbol := range signature.Parameters() {
		paramType := computer.typeChecker.GetTypeOfSymbol(paramSymbol)
		optional := paramSymbol.Flags&ast.SymbolFlagsOptional != 0
		parts = append(parts, memberID(protocol.KindParameter, paramSymbol.Name, optional, computer.Compute(paramType)))
	}
	parts = append(parts, "->"+computer.Compute(computer.typeChecker.GetReturnTypeOfSignature(signature)))
	body := "{" + strings.Join(parts, ",") + "}"
	if name != "" {
		return strconv.Itoa(int(kind)) + name + body
	}
	return strconv.Itoa(int(kind)) + body
}

func (computer *Computer) childIDs(types []*checker.Type) []string {
	out := make([]string, len(types))
	for i, tsType := range types {
		out[i] = computer.Compute(tsType)
	}
	return out
}

// ---------------------------------------------------------------------------
// helpers — pure functions, no Computer state
// ---------------------------------------------------------------------------

// KindOf returns the ReflectionKind that best classifies a tsgo type.
// Exported because the serializer needs the same classification logic to
// produce the protocol.RunType.
func KindOf(typeChecker *checker.Checker, tsType *checker.Type) protocol.ReflectionKind {
	if tsType == nil {
		return protocol.KindNever
	}
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsAny != 0:
		return protocol.KindAny
	case flags&checker.TypeFlagsUnknown != 0:
		return protocol.KindUnknown
	case flags&checker.TypeFlagsNever != 0:
		return protocol.KindNever
	case flags&checker.TypeFlagsVoid != 0:
		return protocol.KindVoid
	case flags&checker.TypeFlagsUndefined != 0:
		return protocol.KindUndefined
	case flags&checker.TypeFlagsNull != 0:
		return protocol.KindNull
	case flags&checker.TypeFlagsStringLiteral != 0,
		flags&checker.TypeFlagsNumberLiteral != 0,
		flags&checker.TypeFlagsBooleanLiteral != 0,
		flags&checker.TypeFlagsBigIntLiteral != 0,
		flags&checker.TypeFlagsUniqueESSymbol != 0:
		return protocol.KindLiteral
	case flags&checker.TypeFlagsString != 0:
		return protocol.KindString
	case flags&checker.TypeFlagsNumber != 0:
		return protocol.KindNumber
	case flags&checker.TypeFlagsBoolean != 0:
		return protocol.KindBoolean
	case flags&checker.TypeFlagsBigInt != 0:
		return protocol.KindBigInt
	case flags&checker.TypeFlagsESSymbol != 0:
		return protocol.KindSymbol
	case flags&checker.TypeFlagsEnum != 0,
		flags&checker.TypeFlagsEnumLike != 0,
		flags&checker.TypeFlagsEnumLiteral != 0:
		return protocol.KindEnum
	case flags&checker.TypeFlagsUnion != 0:
		return protocol.KindUnion
	case flags&checker.TypeFlagsIntersection != 0:
		return protocol.KindIntersection
	case flags&checker.TypeFlagsNonPrimitive != 0:
		return protocol.KindObject
	case flags&checker.TypeFlagsObject != 0:
		return objectKind(typeChecker, tsType)
	}
	return protocol.KindUnknown
}

func objectKind(typeChecker *checker.Checker, tsType *checker.Type) protocol.ReflectionKind {
	if checker.IsTupleType(tsType) {
		return protocol.KindTuple
	}
	if typeChecker.IsArrayLikeType(tsType) {
		return protocol.KindArray
	}
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Promise":
			return protocol.KindPromise
		case "RegExp":
			return protocol.KindRegexp
		case "Date", "Map", "Set":
			// Built-in interfaces from lib.d.ts that mion treats as classes
			// (dispatched through initClassRunType in createRunType.ts).
			return protocol.KindClass
		}
	}
	if isClass(tsType) {
		return protocol.KindClass
	}
	// Free callable with no own properties → reflection function kind.
	if len(typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)) > 0 &&
		len(typeChecker.GetPropertiesOfType(tsType)) == 0 {
		return protocol.KindFunction
	}
	return protocol.KindObjectLiteral
}

func isClass(tsType *checker.Type) bool {
	flags := tsType.ObjectFlags()
	if flags&checker.ObjectFlagsClass != 0 {
		return true
	}
	if flags&checker.ObjectFlagsReference != 0 {
		if target := tsType.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
			return true
		}
	}
	return false
}

func collectionID(kind protocol.ReflectionKind, children []string, brackets bool) string {
	if brackets {
		return strconv.Itoa(int(kind)) + "[" + strings.Join(children, ",") + "]"
	}
	return strconv.Itoa(int(kind)) + "{" + strings.Join(children, ",") + "}"
}

func memberID(kind protocol.ReflectionKind, name string, optional bool, child string) string {
	return strconv.Itoa(int(kind)) + ":" + name + optBit(optional) + ":" + child
}

func optBit(optional bool) string {
	if optional {
		return "?"
	}
	return ""
}

func aliasName(tsType *checker.Type) string {
	if alias := checker.Type_alias(tsType); alias != nil && alias.Symbol() != nil {
		return alias.Symbol().Name
	}
	return ""
}

// enumDiscriminator returns "<typeName>:<member1=value1>,…" (members sorted
// by name) so two enums with different shapes get different structural ids.
// Reads literal values directly to avoid TypeToString collapsing both
// numeric `0` and string `"red"` to the alias name `Color.Red`.
func enumDiscriminator(tsType *checker.Type, typeChecker *checker.Checker) string {
	name := ""
	if symbol := tsType.Symbol(); symbol != nil {
		name = symbol.Name
	}
	parts := []string{name}
	if symbol := tsType.Symbol(); symbol != nil && symbol.Exports != nil {
		members := make([]string, 0, len(symbol.Exports))
		for memberName, memberSymbol := range symbol.Exports {
			if memberSymbol == nil || memberSymbol.ValueDeclaration == nil {
				continue
			}
			value := "?"
			if memberType := typeChecker.GetTypeOfSymbol(memberSymbol); memberType != nil {
				if memberType.Flags()&checker.TypeFlagsLiteral != 0 {
					value = stringifyLiteralValue(memberType.AsLiteralType().Value())
				} else {
					value = typeChecker.TypeToString(memberType)
				}
			}
			members = append(members, memberName+"="+value)
		}
		sort.Strings(members)
		parts = append(parts, members...)
	}
	return strings.Join(parts, ",")
}

// stringifyLiteralValue gives a canonical form for a reflection literal value
// (string / number / bigint / bool). Used for structural id composition.
func stringifyLiteralValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strconv.Quote(typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", value)
	}
}

func literalString(tsType *checker.Type, typeChecker *checker.Checker) string {
	flags := tsType.Flags()
	if flags&checker.TypeFlagsBooleanLiteral != 0 {
		return typeChecker.TypeToString(tsType)
	}
	if flags&checker.TypeFlagsStringLiteral != 0 {
		if value, ok := tsType.AsLiteralType().Value().(string); ok {
			return value
		}
	}
	// Fall through: TypeToString gives a stable canonical form for
	// number, bigint, and any other literal value.
	return typeChecker.TypeToString(tsType)
}
