// Package serialize projects tsgo's *checker.Type into a deepkit-shaped
// protocol.Type graph. Every resolved type is assigned a stable integer id;
// recursive types terminate at a `KindRef` sentinel pointing at the cached
// id, which the consumer (Go JSON emitter or TS module emitter) re-knots into
// real object references.
//
// The serializer is stateful across calls so multiple resolver queries share
// one deduplicated type table.
package serialize

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Cache holds the interned type table. Concurrency: not safe for concurrent
// use — the resolver holds a per-worker Cache.
type Cache struct {
	ids    map[*checker.Type]int
	nodes  []*protocol.Type // nodes[i].ID == i
	pending map[int]bool   // ids whose projection is in progress (cycle break)
}

func NewCache() *Cache {
	return &Cache{
		ids:     make(map[*checker.Type]int),
		nodes:   make([]*protocol.Type, 0, 64),
		pending: make(map[int]bool),
	}
}

func (c *Cache) Size() int { return len(c.nodes) }

// Dump returns every interned Type, in id order.
func (c *Cache) Dump() []*protocol.Type {
	out := make([]*protocol.Type, len(c.nodes))
	copy(out, c.nodes)
	return out
}

// Added returns the subset of the table inserted since `before`.
func (c *Cache) Added(before int) []*protocol.Type {
	if before >= len(c.nodes) {
		return nil
	}
	out := make([]*protocol.Type, len(c.nodes)-before)
	copy(out, c.nodes[before:])
	return out
}

// Serialize projects t into the cache and returns the canonical Type. For
// nested calls during projection the returned Type is a KindRef sentinel —
// only the outermost call sees a fully-projected node. This way every child
// slot in the deepkit shape ends up holding a ref to a top-level entry.
func (c *Cache) Serialize(tc *checker.Checker, t *checker.Type) *protocol.Type {
	if t == nil {
		id := c.reserve(nil)
		c.nodes[id] = &protocol.Type{ID: id, Kind: protocol.KindUnknown, Flags: []string{"nilType"}}
		return protocol.NewRef(id)
	}
	if id, ok := c.ids[t]; ok {
		return protocol.NewRef(id)
	}
	id := c.reserve(t)
	c.pending[id] = true
	node := c.projectType(tc, t, id)
	delete(c.pending, id)
	c.nodes[id] = node
	return protocol.NewRef(id)
}

// SerializeTopLevel returns the actual Type entry (not a ref) — used by the
// resolver to record the top of a query result. The caller still gets the id
// via Type.ID; child slots remain refs.
func (c *Cache) SerializeTopLevel(tc *checker.Checker, t *checker.Type) *protocol.Type {
	ref := c.Serialize(tc, t)
	return c.nodes[ref.ID]
}

func (c *Cache) reserve(t *checker.Type) int {
	id := len(c.nodes)
	c.nodes = append(c.nodes, &protocol.Type{ID: id, Kind: protocol.KindUnknown})
	if t != nil {
		c.ids[t] = id
	}
	return id
}

// ---------------------------------------------------------------------------
// projection
// ---------------------------------------------------------------------------

func (c *Cache) projectType(tc *checker.Checker, t *checker.Type, id int) *protocol.Type {
	n := &protocol.Type{ID: id}
	flags := t.Flags()

	// typeName from a user-declared type alias ("User" in `type User = {...}`).
	if alias := checker.Type_alias(t); alias != nil && alias.Symbol() != nil {
		n.TypeName = alias.Symbol().Name
		// typeArguments belong to the alias when present.
		if args := alias.TypeArguments(); len(args) > 0 {
			n.TypeArguments = make([]*protocol.Type, 0, len(args))
			for _, a := range args {
				n.TypeArguments = append(n.TypeArguments, c.Serialize(tc, a))
			}
		}
	}

	switch {
	case flags&checker.TypeFlagsAny != 0:
		n.Kind = protocol.KindAny

	case flags&checker.TypeFlagsUnknown != 0:
		n.Kind = protocol.KindUnknown

	case flags&checker.TypeFlagsNever != 0:
		n.Kind = protocol.KindNever

	case flags&checker.TypeFlagsVoid != 0:
		n.Kind = protocol.KindVoid

	case flags&checker.TypeFlagsUndefined != 0:
		n.Kind = protocol.KindUndefined

	case flags&checker.TypeFlagsNull != 0:
		n.Kind = protocol.KindNull

	case flags&checker.TypeFlagsStringLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Literal = t.AsLiteralType().Value()

	case flags&checker.TypeFlagsNumberLiteral != 0:
		n.Kind = protocol.KindLiteral
		// Use TypeToString so we get a canonical numeric form (handles
		// fractional, negative, exponent variants without locale issues).
		n.Literal = parseNumberLiteral(tc.TypeToString(t))

	case flags&checker.TypeFlagsBooleanLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Literal = tc.TypeToString(t) == "true"

	case flags&checker.TypeFlagsBigIntLiteral != 0:
		n.Kind = protocol.KindLiteral
		// JSON numbers can't carry arbitrary-precision bigint — emit as string
		// + flag so consumers parse with BigInt(...).
		n.Literal = fmt.Sprintf("%v", t.AsLiteralType().Value())
		n.Flags = append(n.Flags, "bigint")

	case flags&checker.TypeFlagsString != 0:
		n.Kind = protocol.KindString

	case flags&checker.TypeFlagsNumber != 0:
		n.Kind = protocol.KindNumber

	case flags&checker.TypeFlagsBoolean != 0:
		n.Kind = protocol.KindBoolean

	case flags&checker.TypeFlagsBigInt != 0:
		n.Kind = protocol.KindBigInt

	case flags&checker.TypeFlagsESSymbol != 0:
		n.Kind = protocol.KindSymbol

	case flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLiteral != 0:
		c.projectEnum(tc, t, n)

	case flags&checker.TypeFlagsUnion != 0:
		n.Kind = protocol.KindUnion
		for _, m := range t.Distributed() {
			n.Types = append(n.Types, c.Serialize(tc, m))
		}

	case flags&checker.TypeFlagsIntersection != 0:
		n.Kind = protocol.KindIntersection
		for _, m := range t.AsUnionOrIntersectionType().Types() {
			n.Types = append(n.Types, c.Serialize(tc, m))
		}

	case flags&checker.TypeFlagsObject != 0:
		c.projectObjectType(tc, t, n)

	default:
		n.Kind = protocol.KindUnknown
		n.TypeName = tc.TypeToString(t)
	}

	return n
}

// ---------------------------------------------------------------------------
// object-flavoured types: array / tuple / promise / function / class /
// objectLiteral / interface
// ---------------------------------------------------------------------------

func (c *Cache) projectObjectType(tc *checker.Checker, t *checker.Type, n *protocol.Type) {
	// Tuple — must be checked before Array since arrays' object-flag includes
	// tuples in the Reference variant.
	if checker.IsTupleType(t) {
		c.projectTuple(tc, t, n)
		return
	}

	// Array — `T[]`, `Array<T>`, `ReadonlyArray<T>`.
	if tc.IsArrayLikeType(t) {
		args := tc.GetTypeArguments(t)
		if len(args) > 0 {
			n.Kind = protocol.KindArray
			n.Type = c.Serialize(tc, args[0])
			return
		}
	}

	// Promise — symbol name detection. Generic args give us the resolved value type.
	if sym := t.Symbol(); sym != nil && sym.Name == "Promise" {
		args := tc.GetTypeArguments(t)
		if len(args) > 0 {
			n.Kind = protocol.KindPromise
			n.Type = c.Serialize(tc, args[0])
			return
		}
	}

	// Class vs anonymous object literal vs interface.
	objFlags := t.ObjectFlags()
	isClass := objFlags&checker.ObjectFlagsClass != 0
	// Reference types (e.g. `Foo<string>` of a generic class) carry the class
	// flag through their Target().
	if !isClass && objFlags&checker.ObjectFlagsReference != 0 {
		if target := t.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
			isClass = true
		}
	}

	if isClass {
		c.projectClass(tc, t, n)
		return
	}

	c.projectObjectLiteral(tc, t, n)
}

func (c *Cache) projectTuple(tc *checker.Checker, t *checker.Type, n *protocol.Type) {
	n.Kind = protocol.KindTuple
	// Tuple instances are TypeReferences pointing at a TupleType target;
	// `TargetTupleType()` walks through to the canonical tuple shape regardless.
	tt := t.TargetTupleType()
	infos := tt.ElementInfos()
	args := tc.GetTypeArguments(t)
	for i, info := range infos {
		var elemType *checker.Type
		if i < len(args) {
			elemType = args[i]
		}
		flags := info.TupleElementFlags()
		// In tsgo, optional tuple slots type as `T | undefined`. Deepkit
		// semantics keep the optional bit on the TupleMember itself and the
		// inner type stays `T` — so strip `undefined` from the union when the
		// element is optional.
		if flags&checker.ElementFlagsOptional != 0 && elemType != nil {
			elemType = stripUndefined(elemType)
		}
		member := &protocol.Type{
			Kind: protocol.KindTupleMember,
			Type: c.Serialize(tc, elemType),
		}
		if name := info.LabeledDeclaration(); name != nil {
			member.Name = name.Text()
		}
		if flags&checker.ElementFlagsOptional != 0 {
			member.Optional = true
		}
		if flags&checker.ElementFlagsRest != 0 {
			member.Flags = append(member.Flags, "rest")
		}
		if flags&checker.ElementFlagsVariadic != 0 {
			member.Flags = append(member.Flags, "variadic")
		}
		// TupleMember itself is interned so consumers can dedup.
		mid := len(c.nodes)
		c.nodes = append(c.nodes, member)
		member.ID = mid
		n.Types = append(n.Types, protocol.NewRef(mid))
	}
}

func (c *Cache) projectObjectLiteral(tc *checker.Checker, t *checker.Type, n *protocol.Type) {
	// Bare callable with no own properties — top-level function type.
	callSigs := tc.GetSignaturesOfType(t, checker.SignatureKindCall)
	props := tc.GetPropertiesOfType(t)
	if len(callSigs) > 0 && len(props) == 0 {
		n.Kind = protocol.KindFunction
		c.projectSignatureInto(tc, callSigs[0], n)
		return
	}

	n.Kind = protocol.KindObjectLiteral
	c.projectMembersInto(tc, t, n, props, callSigs, false)
}

func (c *Cache) projectClass(tc *checker.Checker, t *checker.Type, n *protocol.Type) {
	n.Kind = protocol.KindClass
	if sym := t.Symbol(); sym != nil {
		n.TypeName = sym.Name
		// Reserve a class-ref hint for v0.3 lazy-import workaround.
		n.ClassRef = &protocol.ClassRef{Name: sym.Name}
	}
	if args := tc.GetTypeArguments(t); len(args) > 0 {
		for _, a := range args {
			n.Arguments = append(n.Arguments, c.Serialize(tc, a))
		}
	}
	props := tc.GetPropertiesOfType(t)
	c.projectMembersInto(tc, t, n, props, nil, true)
}

// projectMembersInto fills n.Types with propertySignature / methodSignature /
// indexSignature / callSignature children. `asClass=true` switches between
// deepkit's class member kinds (`property` / `method`) and objectLiteral
// member kinds (`propertySignature` / `methodSignature`).
func (c *Cache) projectMembersInto(
	tc *checker.Checker,
	t *checker.Type,
	n *protocol.Type,
	props []*ast.Symbol,
	callSigs []*checker.Signature,
	asClass bool,
) {
	for _, sym := range props {
		c.appendProperty(tc, n, sym, asClass)
	}
	for _, info := range tc.GetIndexInfosOfType(t) {
		idx := &protocol.Type{
			Kind:  protocol.KindIndexSignature,
			Index: c.Serialize(tc, info.KeyType()),
			Type:  c.Serialize(tc, info.ValueType()),
		}
		if info.IsReadonly() {
			idx.Readonly = true
		}
		idxID := len(c.nodes)
		c.nodes = append(c.nodes, idx)
		idx.ID = idxID
		n.Types = append(n.Types, protocol.NewRef(idxID))
	}
	for _, sig := range callSigs {
		callNode := &protocol.Type{Kind: protocol.KindCallSignature}
		c.projectSignatureInto(tc, sig, callNode)
		callID := len(c.nodes)
		c.nodes = append(c.nodes, callNode)
		callNode.ID = callID
		n.Types = append(n.Types, protocol.NewRef(callID))
	}
}

func (c *Cache) appendProperty(tc *checker.Checker, parent *protocol.Type, sym *ast.Symbol, asClass bool) {
	propType := tc.GetTypeOfSymbol(sym)

	// Method-vs-property: a property whose type is a single-call-signature
	// function with no other members maps to deepkit's `method` /
	// `methodSignature` form.
	isMethod := false
	if propType != nil {
		sigs := tc.GetSignaturesOfType(propType, checker.SignatureKindCall)
		if len(sigs) > 0 && len(tc.GetPropertiesOfType(propType)) == 0 {
			isMethod = true
		}
	}

	member := &protocol.Type{Name: sym.Name}
	if sym.Flags&ast.SymbolFlagsOptional != 0 {
		member.Optional = true
	}

	if isMethod {
		if asClass {
			member.Kind = protocol.KindMethod
		} else {
			member.Kind = protocol.KindMethodSignature
		}
		sigs := tc.GetSignaturesOfType(propType, checker.SignatureKindCall)
		c.projectSignatureInto(tc, sigs[0], member)
	} else {
		if asClass {
			member.Kind = protocol.KindProperty
		} else {
			member.Kind = protocol.KindPropertySignature
		}
		member.Type = c.Serialize(tc, propType)
	}

	mid := len(c.nodes)
	c.nodes = append(c.nodes, member)
	member.ID = mid
	parent.Types = append(parent.Types, protocol.NewRef(mid))
}

func (c *Cache) projectSignatureInto(tc *checker.Checker, sig *checker.Signature, n *protocol.Type) {
	for _, p := range sig.Parameters() {
		paramType := tc.GetTypeOfSymbol(p)
		param := &protocol.Type{
			Kind: protocol.KindParameter,
			Name: p.Name,
			Type: c.Serialize(tc, paramType),
		}
		if p.Flags&ast.SymbolFlagsOptional != 0 {
			param.Optional = true
		}
		pid := len(c.nodes)
		c.nodes = append(c.nodes, param)
		param.ID = pid
		n.Parameters = append(n.Parameters, protocol.NewRef(pid))
	}
	n.Return = c.Serialize(tc, tc.GetReturnTypeOfSignature(sig))
}

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

func (c *Cache) projectEnum(tc *checker.Checker, t *checker.Type, n *protocol.Type) {
	n.Kind = protocol.KindEnum
	if sym := t.Symbol(); sym != nil {
		n.TypeName = sym.Name
	}
	// values + indexType: we don't currently walk the symbol table for member
	// values, so emit just the canonical name. v0.3 will populate Values from
	// the symbol's exports.
	n.IndexT = &protocol.Type{Kind: protocol.KindString, ID: -1}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// stripUndefined returns t with `undefined` removed from a top-level union.
// Used to match deepkit's tuple semantics for optional members.
func stripUndefined(t *checker.Type) *checker.Type {
	if t == nil || t.Flags()&checker.TypeFlagsUnion == 0 {
		return t
	}
	parts := t.Distributed()
	kept := make([]*checker.Type, 0, len(parts))
	for _, p := range parts {
		if p.Flags()&checker.TypeFlagsUndefined != 0 {
			continue
		}
		kept = append(kept, p)
	}
	if len(kept) == 1 {
		return kept[0]
	}
	// Multi-member union with undefined removed — return original. The caller
	// only cares about the simple T-vs-(T|undefined) case.
	return t
}

// parseNumberLiteral converts a tsgo TypeToString form ("42", "1.5", "-3") to
// a JSON number. We intentionally use the printed form because tsgo's
// jsnum.Number internal value is not directly assignable to `any` in a way
// JSON would emit cleanly.
func parseNumberLiteral(s string) any {
	// Try int first for canonical small-integer form.
	var i int64
	if _, err := fmt.Sscanf(s, "%d", &i); err == nil {
		// Make sure the round-trip matches — otherwise fall through to float.
		if fmt.Sprintf("%d", i) == s {
			return i
		}
	}
	var f float64
	if _, err := fmt.Sscanf(s, "%g", &f); err == nil {
		return f
	}
	return s
}
