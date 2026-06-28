// Package typeid computes the structural type id directly from a tsgo
// *checker.Type. The output mirrors `_createTypeId` in
// (ref: packages/run-types/src/lib/typeId.ts) so two structurally-equal types
// (identical kind + identical children, regardless of alias name) produce the
// same string. Atomic kinds are just `String(kind)`; collections compose
// `${kind}{c1,c2,…}`; cycles emit a back-ref token `$<kind>_<i>:<structuralSig>`
// — anchored on the cycle target's STRUCTURE (not its declaration), so
// structurally-identical recursive types converge regardless of name/position.
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
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Computer is the stateful walker. Memoises results on *checker.Type pointer
// to avoid re-walking. Stack tracks the active recursion path for cycle
// detection (mirrors the `checkCircularAndGetRefId` algorithm).
type Computer struct {
	typeChecker *checker.Checker
	cache       map[*checker.Type]string
	stack       []*checker.Type
	// bareCycles makes cycleRef emit a name-free `$<kind>_<index>` token (no
	// structural anchor). Used only by the sub-walk that COMPUTES the structural
	// anchor, to terminate without infinite recursion.
	bareCycles bool
	// sigCache memoises structuralSignature per recursive type.
	sigCache map[*checker.Type]string
	// overrides folds `overrideX<T>(pureFn)` registrations into the structural
	// id. Keyed by a node's BASE structural key (children's overrides already
	// folded, this node's own NOT yet) → family op key → cfn body hash. When a
	// node's base key matches, OverrideStructuralKey's `|cfn:…` suffix is
	// appended, so an overridden type hashes differently from its twin and the
	// override propagates to every containing type. Nil = no folding (the plain
	// id path; unit tests / the early override-collection pass).
	overrides map[string]map[string]string
}

// New returns a fresh Computer bound to the supplied checker.
func New(typeChecker *checker.Checker) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string)}
}

// NewWithOverrides returns a Computer that folds the supplied override map (see
// the `overrides` field) into every structural id. Used by the main resolver
// pass once the early override-collection pass has built the map.
func NewWithOverrides(typeChecker *checker.Checker, overrides map[string]map[string]string) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string), overrides: overrides}
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
	base := computer.dispatch(tsType)
	computer.stack = computer.stack[:len(computer.stack)-1]
	// Fold this node's own override suffix AFTER dispatch: `base` already has
	// children's suffixes (composed via their Compute calls), and the override
	// map is keyed by exactly this base key. The cache stores the FINAL (folded)
	// key so parents compose it.
	id := base + computer.overrideSuffix(base)
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
	// Depth RELATIVE to the cycle target (frames from the target down to this
	// back-edge), NOT the absolute stack index. The absolute position depends on
	// the session walk order (where the recursive type is first reached), so a
	// type-first recursive type and an equivalent value-first `Recursive<Body>`
	// (distinct *checker.Type pointers first reached at different depths) used to
	// get different back-edge tokens and thus different ids. Relative depth is a
	// structural quantity, so the two authoring paths converge.
	relDepth := len(computer.stack) - index
	base := "$" + strconv.Itoa(int(kind)) + "_" + strconv.Itoa(relDepth)
	// The sub-walk that computes the structural anchor uses bare tokens to
	// terminate; everyone else anchors on the cycle target's STRUCTURE.
	if computer.bareCycles {
		return base
	}
	// Anchor the back-edge on the cycle target's STRUCTURE, not its declaration.
	// Two structurally-identical recursive types therefore share one id — correct
	// dedup (identical shape ⇒ identical validator) AND it lets a value-first
	// `circular((self) => …)` schema (an anonymous `Recursive<Body>`) converge with
	// the equivalent type-first recursive type. A purely undifferentiated token
	// (`$<kind>_<index>`) is NOT enough — distinct recursive shapes that share a
	// cycle position would then collide and the renderer would wire the wrong
	// child (the "shadowing" the tuple-slot case `[bigint, Foo?]` hit). The
	// structural signature keeps distinct shapes distinct while merging identical
	// ones.
	return base + ":" + computer.structuralSignature(tsType)
}

// structuralSignature returns a name-free hash of tsType's SHAPE, used as the
// cycle back-edge anchor. Computed by a fresh sub-walk with bare cycle tokens
// (so it terminates); memoised per type. Structurally-equal recursive types
// produce the same signature regardless of how/where they were declared.
func (computer *Computer) structuralSignature(tsType *checker.Type) string {
	if computer.sigCache == nil {
		computer.sigCache = make(map[*checker.Type]string)
	}
	if sig, ok := computer.sigCache[tsType]; ok {
		return sig
	}
	sub := &Computer{typeChecker: computer.typeChecker, cache: make(map[*checker.Type]string), bareCycles: true, overrides: computer.overrides}
	sig := sub.Compute(tsType)
	computer.sigCache[tsType] = sig
	return sig
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

	// Enum — the reference algorithm uses just `String(kind)` for enums, but
	// that causes all enums to collapse to the same id. We disambiguate by
	// appending the typeName + sorted member values so two different enum
	// declarations don't dedup at the cache level. (The reference gets away
	// with the bare-kind id because each enum is handed a distinct Type object
	// per declaration at runtime — we have to dedup ourselves.)
	if flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0 || flags&checker.TypeFlagsEnumLiteral != 0 {
		return strconv.Itoa(int(protocol.KindEnum)) + ":" + enumDiscriminator(tsType, computer.typeChecker)
	}

	// Template literal — id captures the literal text segments + the
	// placeholder span ids so two distinct patterns
	// (`` `api/${number}` `` vs `` `(${number})` ``) don't collide.
	if flags&checker.TypeFlagsTemplateLiteral != 0 {
		tpl := tsType.AsTemplateLiteralType()
		if tpl != nil {
			texts := tpl.Texts()
			spanIDs := computer.childIDs(tpl.Types())
			var b strings.Builder
			b.WriteString(strconv.Itoa(int(protocol.KindTemplateLiteral)))
			b.WriteString(":tl:")
			for i, text := range texts {
				if i > 0 {
					b.WriteByte('|')
				}
				b.WriteString(text)
			}
			b.WriteByte('#')
			for i, id := range spanIDs {
				if i > 0 {
					b.WriteByte(',')
				}
				b.WriteString(id)
			}
			return b.String()
		}
	}

	// Union / intersection — composition of distributed members.
	if flags&checker.TypeFlagsUnion != 0 {
		// Sort member ids so union member ORDER doesn't affect the structural id (a
		// union is order-independent; objects already sort their members in
		// memberIDs). This converges a value-first `union([...])` with the written
		// `A | B | …` even when tsgo computes the two in different member orders, and
		// dedups `A | B` with `B | A`. Runtime member precedence is unaffected — it's
		// driven by node.Children downstream (union_safeorder.go), not by this id.
		unionIDs := computer.childIDs(tsType.Distributed())
		sort.Strings(unionIDs)
		return collectionID(int(kind), unionIDs, false)
	}
	if flags&checker.TypeFlagsIntersection != 0 {
		return computer.collapsedIntersectionID(tsType)
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
		// Tuple — bracket-delimited child list per the reference algorithm, with
		// each element's variadic FLAGS (rest / variadic) folded into the id.
		// The reference RT-compiles per call so a rest tail and a fixed slot
		// never share a runtime Type; our AOT cache is project-global, so
		// without the flag a rest tuple `[number, ...string[]]` and a fixed
		// tuple `[number, string]` both reduce to `Tuple[<number>,<string>]`,
		// collide on a single cache slot, and the (nondeterministically chosen)
		// winner gives one of them the wrong validator. Mirrors the flag
		// handling in internal/compiled/runtype/serialize.go:projectTuple.
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		elementInfos := tsType.TargetTupleType().ElementInfos()
		ids := make([]string, 0, len(typeArguments))
		for i, typeArgument := range typeArguments {
			optional, rest, variadic := false, false, false
			if i < len(elementInfos) {
				elementFlags := elementInfos[i].TupleElementFlags()
				optional = elementFlags&checker.ElementFlagsOptional != 0
				rest = elementFlags&checker.ElementFlagsRest != 0
				variadic = elementFlags&checker.ElementFlagsVariadic != 0
			}
			// Optional tuple slots type as `T | undefined`; strip it so the slot id
			// matches the projected node (serialize.go projectTuple does the same).
			var child string
			if optional {
				child = computer.optionalChildID(typeArgument)
			} else {
				child = computer.Compute(typeArgument)
			}
			if rest {
				child += "#rest"
			}
			if variadic {
				child += "#variadic"
			}
			ids = append(ids, child)
		}
		return collectionID(int(protocol.KindTuple), ids, true)
	}

	// Array.
	if computer.typeChecker.IsArrayLikeType(tsType) {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(int(protocol.KindArray), "0", false, child)
		}
	}

	// Promise.
	if symbol := tsType.Symbol(); symbol != nil && symbol.Name == "Promise" {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(int(protocol.KindPromise), "0", false, child)
		}
	}

	// Builtin Temporal types (Temporal.PlainDate, …): their structural id is
	// the SubKind prefix, same scheme as Date. Namespace-qualified detection
	// keeps a user `PlainDate` distinct. Checked before the Date/Map/Set
	// switch since Temporal types are namespace members, not top-level.
	if info, ok := TemporalInfoForType(tsType); ok {
		return strconv.Itoa(int(info.SubKind))
	}

	// Built-in classes — Date / Map / Set — get their own subKind id, exactly
	// as `computeClassTypeId` does (ref: lib/typeId.ts:149). The numeric
	// prefix is the SubKind (2001 / 2002 / 2003), not KindClass.
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Date":
			return strconv.Itoa(int(protocol.SubKindDate))
		case "Map":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 2 {
					return strconv.Itoa(int(protocol.SubKindMap)) + "{" +
						strconv.Itoa(int(protocol.SubKindMapKey)) + ":" + computer.Compute(typeArguments[0]) + "," +
						strconv.Itoa(int(protocol.SubKindMapValue)) + ":" + computer.Compute(typeArguments[1]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.SubKindMap))
		case "Set":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 1 {
					return strconv.Itoa(int(protocol.SubKindSet)) + "{" +
						strconv.Itoa(int(protocol.SubKindSetItem)) + ":" + computer.Compute(typeArguments[0]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.SubKindSet))
		}
	}
	// Non-serialisable globals (Error, WeakMap, typed arrays, …) are tagged
	// with SubKindNonSerializable and use that as their structural prefix —
	// matches the `subKind || kind` rule.
	if symbol := tsType.Symbol(); symbol != nil && protocol.IsNonSerializableSymbol(symbol.Name) {
		ids := computer.memberIDs(tsType, true)
		return collectionID(int(protocol.SubKindNonSerializable), ids, false)
	}
	if isClass(tsType) {
		// Generic user class — composition of property ids (sorted for determinism).
		ids := computer.memberIDs(tsType, true)
		return collectionID(int(protocol.KindClass), ids, false)
	}

	// Free function — bare callable with no own properties. Encode the
	// full signature shape; otherwise every function in the program would
	// collide on a single structural id (which deduped to one cache entry).
	callSignatures := computer.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	if len(callSignatures) > 0 && len(properties) == 0 {
		return computer.signatureID(callSignatures[0], protocol.KindFunction, "")
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
	return collectionID(int(protocol.KindObjectLiteral), ids, false)
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
	memberName := stableMemberName(symbol.Name)
	optional := symbol.Flags&ast.SymbolFlagsOptional != 0
	// Readonly must be part of the structural id — `{a: string}` and
	// `{readonly a: string}` are different shapes and must not share
	// a cache slot. Mirrors the resolution rule in
	// internal/serialize/modifiers.go:applyMemberModifiers — trust
	// CheckFlagsReadonly for mapped/synthetic symbols (since the AST
	// declaration would lie); otherwise honor CheckFlags AND the AST
	// modifier together.
	const checkFlagsSynthOrMapped = ast.CheckFlagsMapped | ast.CheckFlagsSyntheticProperty | ast.CheckFlagsSyntheticMethod
	var readonly bool
	if symbol.CheckFlags&checkFlagsSynthOrMapped != 0 {
		readonly = symbol.CheckFlags&ast.CheckFlagsReadonly != 0
	} else {
		if symbol.CheckFlags&ast.CheckFlagsReadonly != 0 {
			readonly = true
		}
		if !readonly {
			for _, declaration := range symbol.Declarations {
				if declaration == nil {
					continue
				}
				if ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsReadonly != 0 {
					readonly = true
					break
				}
			}
		}
	}

	// Method vs property: a property whose type is a single-call-signature
	// function with no other members maps to the reflection `method` form.
	if propertyType != nil {
		signatures := computer.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(computer.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			kind := protocol.KindMethodSignature
			if asClass {
				kind = protocol.KindMethod
			}
			return computer.signatureID(signatures[0], kind, memberName) + optBit(optional) + readonlyBit(readonly)
		}
	}

	kind := protocol.KindPropertySignature
	if asClass {
		kind = protocol.KindProperty
	}
	// Optional properties carry `T | undefined` at the symbol-type layer; the
	// `optional` bit IS the "undefined-permitted" signal, so the union wrapper is
	// redundant. Resolve the child WITHOUT undefined before computing its id so a
	// RECURSIVE optional self/cross-reference closes on the inner type — not on a
	// wrapping union node — matching the serializer (serialize.go projects optional
	// members through the same typeid.ResolveOptionalChild). Without this the
	// structural id and the projected runtype node disagree on the optional child's
	// shape, and a recursive optional property's cycle back-edge binds inconsistently
	// ($23 `T | undefined` wrapper vs $30 object) between the type-first and
	// value-first authoring paths.
	child := computer.Compute(propertyType)
	if optional {
		child = computer.optionalChildID(propertyType)
	}
	return memberID(int(kind), memberName, optional, child) + readonlyBit(readonly)
}

// stableMemberName strips the checker-instance symbol id off a late-bound
// symbol-keyed member name ("\xFE@toPrimitive@5" → "\xFE@toPrimitive") so
// structural ids never embed which checker (or which session) materialized
// the member. Replicated from internal/compiled/runtype/serialize.go (the
// typeid subpackage can't import its parent without an import cycle) —
// keep them in sync.
func stableMemberName(name string) string {
	if len(name) < 2 || name[0] != 0xFE || name[1] != '@' {
		return name
	}
	at := strings.LastIndexByte(name, '@')
	if at <= 1 || at == len(name)-1 {
		return name
	}
	for i := at + 1; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return name
		}
	}
	return name[:at]
}

func readonlyBit(readonly bool) string {
	if readonly {
		return "#ro"
	}
	return ""
}

func (computer *Computer) signatureID(signature *checker.Signature, kind protocol.ReflectionKind, name string) string {
	params := signature.Parameters()
	parts := make([]string, 0, len(params)+1)
	position := 0
	// Param NAMES are dropped (replaced by position): function / method /
	// call-signature params are notSupported — skipped at validation, undefined at
	// serialization — so names never affect behaviour and would only over-specify
	// the id (a value-first builder also can't reproduce arbitrary source names).
	// A trailing FIXED rest-tuple param (`(...args: [A, B])`, the shape a value-first
	// `func([A, B], R)` brands) is expanded into positional element params so it
	// matches a written `(a: A, b: B)`. (The method/property NAME — separate from
	// param names — is preserved via the `name` argument below.)
	for i, paramSymbol := range params {
		paramType := computer.typeChecker.GetTypeOfSymbol(paramSymbol)
		if i == len(params)-1 && isRestParam(paramSymbol) && checker.IsTupleType(paramType) {
			if elementIDs, ok := computer.fixedTupleParamIDs(paramType); ok {
				for _, elementID := range elementIDs {
					parts = append(parts, memberID(int(protocol.KindParameter), strconv.Itoa(position), false, elementID))
					position++
				}
				continue
			}
		}
		optional := paramSymbol.Flags&ast.SymbolFlagsOptional != 0
		// Optional params type as `T | undefined`; strip it so the param id matches
		// the projected node (serialize.go projectSignature does the same).
		var child string
		if optional {
			child = computer.optionalChildID(paramType)
		} else {
			child = computer.Compute(paramType)
		}
		if isRestParam(paramSymbol) {
			child += "#rest"
		}
		parts = append(parts, memberID(int(protocol.KindParameter), strconv.Itoa(position), optional, child))
		position++
	}
	parts = append(parts, "->"+computer.Compute(computer.typeChecker.GetReturnTypeOfSignature(signature)))
	body := "{" + strings.Join(parts, ",") + "}"
	if name != "" {
		return strconv.Itoa(int(kind)) + name + body
	}
	return strconv.Itoa(int(kind)) + body
}

// fixedTupleParamIDs returns the element type ids of tupleType when it is a FIXED
// tuple (no rest / variadic element). Used to expand a trailing rest-tuple
// parameter into positional params. Returns ok=false for a tuple carrying a
// variadic-ish element (a genuine variadic signature), which is kept as a single
// `#rest` entry instead.
func (computer *Computer) fixedTupleParamIDs(tupleType *checker.Type) ([]string, bool) {
	typeArguments := computer.typeChecker.GetTypeArguments(tupleType)
	elementInfos := tupleType.TargetTupleType().ElementInfos()
	ids := make([]string, 0, len(typeArguments))
	for i, typeArgument := range typeArguments {
		if i < len(elementInfos) {
			flags := elementInfos[i].TupleElementFlags()
			if flags&checker.ElementFlagsRest != 0 || flags&checker.ElementFlagsVariadic != 0 {
				return nil, false
			}
		}
		ids = append(ids, computer.Compute(typeArgument))
	}
	return ids, true
}

// isRestParam reports whether a parameter symbol's declaration carries `...`.
// Replicated from internal/compiled/runtype/modifiers.go (the typeid subpackage
// can't import its parent without an import cycle).
func isRestParam(symbol *ast.Symbol) bool {
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil || declaration.Kind != ast.KindParameter {
		return false
	}
	return declaration.AsParameterDeclaration().DotDotDotToken != nil
}

func (computer *Computer) childIDs(types []*checker.Type) []string {
	out := make([]string, len(types))
	for i, tsType := range types {
		out[i] = computer.Compute(tsType)
	}
	return out
}

// OptionalChild is the resolved shape of an optional member's child type once
// the redundant `undefined` is removed. Exactly one field is set:
//   - Type: the child resolves to a single checker type (the common case —
//     `T | undefined` → T, `boolean | undefined` → boolean, `null | undefined` → null).
//   - Members: the survivors form a genuine multi-member union with no single
//     checker type we can hand back (notably `T | null | undefined`, which must
//     keep `null` but drop `undefined`); the caller synthesizes a union node /
//     structural id from these members.
type OptionalChild struct {
	Type    *checker.Type
	Members []*checker.Type
}

// ResolveOptionalChild strips the redundant `undefined` an optional member's type
// carries (the member's `optional` bit already signals absence), restores a
// de-normalized boolean (`true | false`) back to the `boolean` atomic, and
// PRESERVES every other member — including `null` (so `x?: string | null` stays
// `string | null`, and the `null | undefined` shape of `x?: null` collapses to the
// lone `null`). It never returns a type that still carries `undefined`.
//
// NOTE: a `getTypeWithFacts(t, checker.TypeFactsNEUndefined)` shim export would
// collapse this whole function to a single checker call — that is exactly what the
// checker uses for optional-property narrowing — but the tsgolint shim does not
// expose that method today, so we strip / restore-boolean / preserve-null here.
func ResolveOptionalChild(typeChecker *checker.Checker, childType *checker.Type) OptionalChild {
	if childType == nil || childType.Flags()&checker.TypeFlagsUnion == 0 {
		return OptionalChild{Type: childType}
	}
	parts := childType.Distributed()
	survivors := make([]*checker.Type, 0, len(parts))
	hasUndefined := false
	hasNull := false
	for _, part := range parts {
		if part.Flags()&checker.TypeFlagsUndefined != 0 {
			hasUndefined = true
			continue
		}
		if part.Flags()&checker.TypeFlagsNull != 0 {
			hasNull = true
		}
		survivors = append(survivors, part)
	}
	// No `undefined` to strip, or nothing survives (an `undefined`-only optional) —
	// leave the type untouched.
	if !hasUndefined || len(survivors) == 0 {
		return OptionalChild{Type: childType}
	}
	if len(survivors) == 1 {
		return OptionalChild{Type: survivors[0]}
	}
	// No `null` present: GetNonNullableType strips exactly `undefined` here (there is
	// no null to lose) and re-normalizes `true | false` back to the boolean atomic.
	if !hasNull {
		return OptionalChild{Type: checker.Checker_GetNonNullableType(typeChecker, childType)}
	}
	// `null` present: keep it, collapse a `{true, false}` pair back to boolean, and
	// synthesize a union from the survivors (no single checker type expresses
	// `T | null` without a union constructor the shim doesn't expose).
	members := collapseBooleanPair(typeChecker, survivors)
	if len(members) == 1 {
		return OptionalChild{Type: members[0]}
	}
	return OptionalChild{Members: members}
}

// collapseBooleanPair replaces a `{true, false}` boolean-literal pair among the
// members with the single `boolean` atomic. A union holds at most one of each
// boolean literal, so exactly two boolean-literal members means the whole boolean.
func collapseBooleanPair(typeChecker *checker.Checker, members []*checker.Type) []*checker.Type {
	boolLiterals := 0
	for _, member := range members {
		if member.Flags()&checker.TypeFlagsBooleanLiteral != 0 {
			boolLiterals++
		}
	}
	if boolLiterals != 2 {
		return members
	}
	out := make([]*checker.Type, 0, len(members)-1)
	for _, member := range members {
		if member.Flags()&checker.TypeFlagsBooleanLiteral != 0 {
			continue
		}
		out = append(out, member)
	}
	return append(out, checker.Checker_booleanType(typeChecker))
}

// SyntheticUnionStructural returns the structural id of a union synthesized from
// an explicit member list — used for an optional child that keeps `null` after
// `undefined` is stripped. Mirrors the union case in dispatch (sorted member ids)
// so a synthesized union and a real one with the same members converge on one id.
func SyntheticUnionStructural(computer *Computer, members []*checker.Type) string {
	ids := computer.childIDs(members)
	sort.Strings(ids)
	return collectionID(int(protocol.KindUnion), ids, false)
}

// optionalChildID returns the structural id of an optional member's child, with
// the redundant `undefined` stripped. Mirrors serialize.go's serializeOptionalChild
// so the structural id and the projected node agree on the child's shape (the
// recursion-safety contract described on memberID).
func (computer *Computer) optionalChildID(childType *checker.Type) string {
	child := ResolveOptionalChild(computer.typeChecker, childType)
	if child.Members == nil {
		return computer.Compute(child.Type)
	}
	return SyntheticUnionStructural(computer, child.Members)
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
	case flags&checker.TypeFlagsTemplateLiteral != 0:
		return protocol.KindTemplateLiteral
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
	// Builtin Temporal types are namespace-member interfaces tsgo reports as
	// object literals; standard, we treat them as classes (atomic builtins).
	if _, ok := TemporalInfoForType(tsType); ok {
		return protocol.KindClass
	}
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Promise":
			return protocol.KindPromise
		case "RegExp":
			return protocol.KindRegexp
		case "Date", "Map", "Set":
			// Built-in interfaces from lib.d.ts that we treat as classes
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

// collectionID composes a structural id with the given numeric prefix.
// Accepts a bare int because the prefix may be either a ReflectionKind
// (e.g. KindTuple) or a ReflectionSubKind (e.g. SubKindNonSerializable)
// per the `subKind || kind` rule.
func collectionID(prefix int, children []string, brackets bool) string {
	if brackets {
		return strconv.Itoa(prefix) + "[" + strings.Join(children, ",") + "]"
	}
	return strconv.Itoa(prefix) + "{" + strings.Join(children, ",") + "}"
}

func memberID(prefix int, name string, optional bool, child string) string {
	return strconv.Itoa(prefix) + ":" + name + optBit(optional) + ":" + child
}

func optBit(optional bool) string {
	if optional {
		return "?"
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
	// A numeric / bigint ENUM member's TypeToString is the member NAME
	// ("Color.Red"), not its value — read the underlying value so it shares the
	// structural id of the equivalent plain literal (both validate the same
	// number) and the value-first `RT.enum(MyEnum)` and `RT.enum({record})` forms
	// converge. (String enum members already returned above; the serialize-side
	// projector strips the name the same way — keep them in sync.)
	if flags&checker.TypeFlagsEnumLiteral != 0 {
		if value := tsType.AsLiteralType().Value(); value != nil {
			return fmt.Sprintf("%v", value)
		}
	}
	// Fall through: TypeToString gives a stable canonical form for
	// number, bigint, and any other literal value.
	return typeChecker.TypeToString(tsType)
}

// TemporalInfoForType returns the protocol.TemporalInfo for a *checker.Type
// that resolves to a builtin Temporal type (e.g. `Temporal.PlainDate`), or
// ok=false otherwise. Detection is namespace-qualified: the type's symbol
// name must match a registry entry AND the symbol's parent must be the
// `Temporal` namespace — so a user type named `PlainDate` (no Temporal
// parent) never matches. Shared by the serialize-side projector and the
// structural-id computer so both agree on what a Temporal type is.
func TemporalInfoForType(tsType *checker.Type) (protocol.TemporalInfo, bool) {
	if tsType == nil {
		return protocol.TemporalInfo{}, false
	}
	symbol := tsType.Symbol()
	if symbol == nil || symbol.Parent == nil || symbol.Parent.Name != protocol.TemporalNamespace {
		return protocol.TemporalInfo{}, false
	}
	return protocol.TemporalInfoByName(symbol.Name)
}
