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
	tc    *checker.Checker
	cache map[*checker.Type]string
	stack []*checker.Type
}

// New returns a fresh Computer bound to the supplied checker.
func New(tc *checker.Checker) *Computer {
	return &Computer{tc: tc, cache: make(map[*checker.Type]string)}
}

// Compute returns the structural id of t. Safe to call repeatedly with the
// same Computer — results are cached.
func (c *Computer) Compute(t *checker.Type) string {
	if t == nil {
		return strconv.Itoa(int(protocol.KindNever))
	}
	if hit, ok := c.cache[t]; ok {
		return hit
	}
	// Cycle: emit back-ref before pushing onto the stack.
	if i := c.stackIndex(t); i >= 0 {
		return c.cycleRef(t, i)
	}
	c.stack = append(c.stack, t)
	id := c.dispatch(t)
	c.stack = c.stack[:len(c.stack)-1]
	c.cache[t] = id
	return id
}

func (c *Computer) stackIndex(t *checker.Type) int {
	for i := len(c.stack) - 1; i >= 0; i-- {
		if c.stack[i] == t {
			return i
		}
	}
	return -1
}

func (c *Computer) cycleRef(t *checker.Type, idx int) string {
	kind := KindOf(c.tc, t)
	name := aliasName(t)
	return "$" + strconv.Itoa(int(kind)) + "_" + strconv.Itoa(idx) + name
}

func (c *Computer) dispatch(t *checker.Type) string {
	kind := KindOf(c.tc, t)
	flags := t.Flags()

	// Literal kinds carry the literal value directly.
	if flags&checker.TypeFlagsStringLiteral != 0 ||
		flags&checker.TypeFlagsNumberLiteral != 0 ||
		flags&checker.TypeFlagsBooleanLiteral != 0 ||
		flags&checker.TypeFlagsBigIntLiteral != 0 {
		return strconv.Itoa(int(kind)) + ":" + literalString(t, c.tc)
	}

	// Unique symbol literal — also a deepkit literal kind, but tsgo's flag
	// is `UniqueESSymbol` not a `*Literal`.
	if flags&checker.TypeFlagsUniqueESSymbol != 0 {
		name := ""
		if sym := t.Symbol(); sym != nil {
			name = sym.Name
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
	// declarations don't dedup at the cache level. (mion gets away with
	// the bare-kind id because deepkit hands it distinct Type objects per
	// enum at runtime — we have to dedup ourselves.)
	if flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0 || flags&checker.TypeFlagsEnumLiteral != 0 {
		return strconv.Itoa(int(protocol.KindEnum)) + ":" + enumDiscriminator(t, c.tc)
	}

	// Union / intersection — composition of distributed members.
	if flags&checker.TypeFlagsUnion != 0 {
		return collectionID(kind, c.childIDs(t.Distributed()), false)
	}
	if flags&checker.TypeFlagsIntersection != 0 {
		members := t.AsUnionOrIntersectionType().Types()
		return collectionID(kind, c.childIDs(members), false)
	}

	// Object-flavoured: tuple / array / promise / function / class / objectLiteral.
	if flags&checker.TypeFlagsObject != 0 {
		return c.objectID(t, kind)
	}

	// Fallback — kind only.
	return strconv.Itoa(int(kind))
}

func (c *Computer) objectID(t *checker.Type, kind protocol.ReflectionKind) string {
	if checker.IsTupleType(t) {
		// Tuple — bracket-delimited child list per mion's algorithm.
		args := c.tc.GetTypeArguments(t)
		ids := make([]string, len(args))
		for i, a := range args {
			ids[i] = c.Compute(a)
		}
		return collectionID(protocol.KindTuple, ids, true)
	}

	// Array.
	if c.tc.IsArrayLikeType(t) {
		args := c.tc.GetTypeArguments(t)
		if len(args) > 0 {
			child := c.Compute(args[0])
			return memberID(protocol.KindArray, "0", false, child)
		}
	}

	// Promise.
	if sym := t.Symbol(); sym != nil && sym.Name == "Promise" {
		args := c.tc.GetTypeArguments(t)
		if len(args) > 0 {
			child := c.Compute(args[0])
			return memberID(protocol.KindPromise, "0", false, child)
		}
	}

	// Class (or built-in interface mion treats as class).
	if sym := t.Symbol(); sym != nil {
		switch sym.Name {
		case "Date":
			return strconv.Itoa(int(protocol.KindClass)) + ":Date"
		case "Map":
			if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				args := c.tc.GetTypeArguments(t)
				if len(args) == 2 {
					return strconv.Itoa(int(protocol.KindClass)) + ":Map{" +
						c.Compute(args[0]) + "," + c.Compute(args[1]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.KindClass)) + ":Map"
		case "Set":
			if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				args := c.tc.GetTypeArguments(t)
				if len(args) == 1 {
					return strconv.Itoa(int(protocol.KindClass)) + ":Set{" +
						c.Compute(args[0]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.KindClass)) + ":Set"
		}
	}
	if isClass(t) {
		// Generic user class — composition of property ids (sorted for determinism).
		ids := c.memberIDs(t, true)
		return collectionID(protocol.KindClass, ids, false)
	}

	// Free function — bare callable with no own properties.
	callSigs := c.tc.GetSignaturesOfType(t, checker.SignatureKindCall)
	props := c.tc.GetPropertiesOfType(t)
	if len(callSigs) > 0 && len(props) == 0 {
		return strconv.Itoa(int(protocol.KindFunction))
	}

	// objectLiteral — composition of property ids, sorted by name for stability.
	ids := c.memberIDs(t, false)
	if len(callSigs) > 0 {
		// Embed call signatures alongside members.
		for _, sig := range callSigs {
			ids = append(ids, c.signatureID(sig, protocol.KindCallSignature, ""))
		}
		sort.Strings(ids)
	}
	return collectionID(protocol.KindObjectLiteral, ids, false)
}

func (c *Computer) memberIDs(t *checker.Type, asClass bool) []string {
	props := c.tc.GetPropertiesOfType(t)
	out := make([]string, 0, len(props))
	for _, sym := range props {
		out = append(out, c.memberID(sym, asClass))
	}
	for _, info := range c.tc.GetIndexInfosOfType(t) {
		key := c.Compute(info.KeyType())
		val := c.Compute(info.ValueType())
		out = append(out, strconv.Itoa(int(protocol.KindIndexSignature))+":"+key+":"+val)
	}
	sort.Strings(out)
	return out
}

func (c *Computer) memberID(sym *ast.Symbol, asClass bool) string {
	propType := c.tc.GetTypeOfSymbol(sym)
	isOpt := sym.Flags&ast.SymbolFlagsOptional != 0

	// Method vs property: a property whose type is a single-call-signature
	// function with no other members maps to deepkit's method form.
	if propType != nil {
		sigs := c.tc.GetSignaturesOfType(propType, checker.SignatureKindCall)
		if len(sigs) > 0 && len(c.tc.GetPropertiesOfType(propType)) == 0 {
			kind := protocol.KindMethodSignature
			if asClass {
				kind = protocol.KindMethod
			}
			return c.signatureID(sigs[0], kind, sym.Name) + optBit(isOpt)
		}
	}

	kind := protocol.KindPropertySignature
	if asClass {
		kind = protocol.KindProperty
	}
	child := c.Compute(propType)
	return memberID(kind, sym.Name, isOpt, child)
}

func (c *Computer) signatureID(sig *checker.Signature, kind protocol.ReflectionKind, name string) string {
	parts := make([]string, 0, len(sig.Parameters())+1)
	for _, p := range sig.Parameters() {
		paramType := c.tc.GetTypeOfSymbol(p)
		isOpt := p.Flags&ast.SymbolFlagsOptional != 0
		parts = append(parts, memberID(protocol.KindParameter, p.Name, isOpt, c.Compute(paramType)))
	}
	parts = append(parts, "->"+c.Compute(c.tc.GetReturnTypeOfSignature(sig)))
	body := "{" + strings.Join(parts, ",") + "}"
	if name != "" {
		return strconv.Itoa(int(kind)) + name + body
	}
	return strconv.Itoa(int(kind)) + body
}

func (c *Computer) childIDs(types []*checker.Type) []string {
	out := make([]string, len(types))
	for i, t := range types {
		out[i] = c.Compute(t)
	}
	return out
}

// ---------------------------------------------------------------------------
// helpers — pure functions, no Computer state
// ---------------------------------------------------------------------------

// KindOf returns the deepkit ReflectionKind that best classifies a tsgo type.
// Exported because the serializer needs the same classification logic to
// produce the protocol.Type.
func KindOf(tc *checker.Checker, t *checker.Type) protocol.ReflectionKind {
	if t == nil {
		return protocol.KindNever
	}
	flags := t.Flags()
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
		return objectKind(tc, t)
	}
	return protocol.KindUnknown
}

func objectKind(tc *checker.Checker, t *checker.Type) protocol.ReflectionKind {
	if checker.IsTupleType(t) {
		return protocol.KindTuple
	}
	if tc.IsArrayLikeType(t) {
		return protocol.KindArray
	}
	if sym := t.Symbol(); sym != nil {
		switch sym.Name {
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
	if isClass(t) {
		return protocol.KindClass
	}
	// Free callable with no own properties → deepkit function.
	if len(tc.GetSignaturesOfType(t, checker.SignatureKindCall)) > 0 &&
		len(tc.GetPropertiesOfType(t)) == 0 {
		return protocol.KindFunction
	}
	return protocol.KindObjectLiteral
}

func isClass(t *checker.Type) bool {
	flags := t.ObjectFlags()
	if flags&checker.ObjectFlagsClass != 0 {
		return true
	}
	if flags&checker.ObjectFlagsReference != 0 {
		if target := t.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
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

func optBit(b bool) string {
	if b {
		return "?"
	}
	return ""
}

func aliasName(t *checker.Type) string {
	if alias := checker.Type_alias(t); alias != nil && alias.Symbol() != nil {
		return alias.Symbol().Name
	}
	return ""
}

// enumDiscriminator returns "<typeName>:<member1=value1>,…" (members sorted
// by name) so two enums with different shapes get different structural ids.
// Reads literal values directly to avoid TypeToString collapsing both
// numeric `0` and string `"red"` to the alias name `Color.Red`.
func enumDiscriminator(t *checker.Type, tc *checker.Checker) string {
	name := ""
	if sym := t.Symbol(); sym != nil {
		name = sym.Name
	}
	parts := []string{name}
	if sym := t.Symbol(); sym != nil && sym.Exports != nil {
		members := make([]string, 0, len(sym.Exports))
		for memName, memSym := range sym.Exports {
			if memSym == nil || memSym.ValueDeclaration == nil {
				continue
			}
			val := "?"
			if memType := tc.GetTypeOfSymbol(memSym); memType != nil {
				if memType.Flags()&checker.TypeFlagsLiteral != 0 {
					val = stringifyLiteralValue(memType.AsLiteralType().Value())
				} else {
					val = tc.TypeToString(memType)
				}
			}
			members = append(members, memName+"="+val)
		}
		sort.Strings(members)
		parts = append(parts, members...)
	}
	return strings.Join(parts, ",")
}

// stringifyLiteralValue gives a canonical form for a deepkit literal value
// (string / number / bigint / bool). Used for structural id composition.
func stringifyLiteralValue(v any) string {
	switch x := v.(type) {
	case string:
		return strconv.Quote(x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", v)
	}
}

func literalString(t *checker.Type, tc *checker.Checker) string {
	flags := t.Flags()
	if flags&checker.TypeFlagsBooleanLiteral != 0 {
		return tc.TypeToString(t)
	}
	if flags&checker.TypeFlagsStringLiteral != 0 {
		if v, ok := t.AsLiteralType().Value().(string); ok {
			return v
		}
	}
	// Fall through: TypeToString gives a stable canonical form for
	// number, bigint, and any other literal value.
	return tc.TypeToString(t)
}
