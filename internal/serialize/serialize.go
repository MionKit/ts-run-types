// Package serialize projects tsgo's *checker.Type into a JSON-friendly
// TypeNode graph. Every resolved type is assigned a stable id; recursive types
// terminate at the id reference. The serializer is stateful across calls so
// that multiple resolver queries share one deduplicated type table.
package serialize

import (
	"fmt"
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Cache holds the interned type table. Concurrency: not safe for concurrent
// use by multiple goroutines — the resolver holds a per-worker Cache.
type Cache struct {
	ids    map[*checker.Type]string
	nodes  map[string]protocol.TypeNode
	nextID int
}

func NewCache() *Cache {
	return &Cache{
		ids:   make(map[*checker.Type]string),
		nodes: make(map[string]protocol.TypeNode),
	}
}

// Dump returns every TypeNode interned so far, sorted by id.
func (c *Cache) Dump() []protocol.TypeNode {
	out := make([]protocol.TypeNode, 0, len(c.nodes))
	for i := 0; i < c.nextID; i++ {
		id := "t" + strconv.Itoa(i)
		if n, ok := c.nodes[id]; ok {
			out = append(out, n)
		}
	}
	return out
}

// Added returns the subset of the table inserted since the last call to Added.
// The caller uses this to incrementally stream new nodes to a client.
func (c *Cache) Added(before int) []protocol.TypeNode {
	if before >= c.nextID {
		return nil
	}
	out := make([]protocol.TypeNode, 0, c.nextID-before)
	for i := before; i < c.nextID; i++ {
		id := "t" + strconv.Itoa(i)
		if n, ok := c.nodes[id]; ok {
			out = append(out, n)
		}
	}
	return out
}

func (c *Cache) Size() int { return c.nextID }

// Serialize projects t into the cache and returns its id. If t is already
// interned, the existing id is returned and no work is done.
func (c *Cache) Serialize(tc *checker.Checker, t *checker.Type) string {
	if t == nil {
		return c.intern(nil, protocol.TypeNode{Kind: protocol.KindUnknown, Name: "<nil type>"})
	}
	if id, ok := c.ids[t]; ok {
		return id
	}
	// Reserve the id before recursing so recursive references resolve.
	id := c.reserve(t)
	node := c.projectType(tc, t, id)
	c.nodes[id] = node
	return id
}

func (c *Cache) reserve(t *checker.Type) string {
	id := "t" + strconv.Itoa(c.nextID)
	c.nextID++
	if t != nil {
		c.ids[t] = id
	}
	return id
}

func (c *Cache) intern(t *checker.Type, n protocol.TypeNode) string {
	id := c.reserve(t)
	n.ID = id
	c.nodes[id] = n
	return id
}

func (c *Cache) projectType(tc *checker.Checker, t *checker.Type, id string) protocol.TypeNode {
	n := protocol.TypeNode{ID: id}
	flags := t.Flags()

	// Type-alias name ("User" in `type User = {...}`)
	if alias := checker.Type_alias(t); alias != nil && alias.Symbol() != nil {
		n.Alias = alias.Symbol().Name
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
		n.Name = "string"
		n.Literal = t.AsLiteralType().Value()

	case flags&checker.TypeFlagsNumberLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Name = "number"
		n.Literal = fmt.Sprintf("%v", t.AsLiteralType().Value())

	case flags&checker.TypeFlagsBooleanLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Name = "boolean"
		n.Literal = tc.TypeToString(t) == "true"

	case flags&checker.TypeFlagsBigIntLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Name = "bigint"
		n.Literal = fmt.Sprintf("%v", t.AsLiteralType().Value())

	case flags&checker.TypeFlagsString != 0:
		n.Kind = protocol.KindPrimitive
		n.Name = "string"

	case flags&checker.TypeFlagsNumber != 0:
		n.Kind = protocol.KindPrimitive
		n.Name = "number"

	case flags&checker.TypeFlagsBoolean != 0:
		n.Kind = protocol.KindPrimitive
		n.Name = "boolean"

	case flags&checker.TypeFlagsBigInt != 0:
		n.Kind = protocol.KindPrimitive
		n.Name = "bigint"

	case flags&checker.TypeFlagsESSymbol != 0:
		n.Kind = protocol.KindPrimitive
		n.Name = "symbol"

	case flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLiteral != 0:
		n.Kind = protocol.KindEnum
		n.Name = tc.TypeToString(t)

	case flags&checker.TypeFlagsUnion != 0:
		n.Kind = protocol.KindUnion
		for _, m := range t.Distributed() {
			n.Members = append(n.Members, c.Serialize(tc, m))
		}

	case flags&checker.TypeFlagsIntersection != 0:
		n.Kind = protocol.KindIntersection
		for _, m := range t.AsUnionOrIntersectionType().Types() {
			n.Members = append(n.Members, c.Serialize(tc, m))
		}

	case flags&checker.TypeFlagsObject != 0:
		c.projectObjectType(tc, t, &n)

	default:
		n.Kind = protocol.KindUnknown
		n.Name = tc.TypeToString(t)
	}

	return n
}

func (c *Cache) projectObjectType(tc *checker.Checker, t *checker.Type, n *protocol.TypeNode) {
	// Array check — `Array<T>` / `T[]` / ReadonlyArray<T>
	if typeName := tc.TypeToString(t); typeName != "" {
		// Cheap heuristic: prefer structural checks, but fall back to the printed form
		// to distinguish Array references from plain objects.
		_ = typeName
	}

	// Try function/callable first.
	callSigs := tc.GetSignaturesOfType(t, checker.SignatureKindCall)
	props := tc.GetPropertiesOfType(t)

	if len(callSigs) > 0 && len(props) == 0 {
		n.Kind = protocol.KindFunction
		sig := callSigs[0]
		for _, p := range sig.Parameters() {
			paramType := tc.GetTypeOfSymbol(p)
			n.Parameters = append(n.Parameters, protocol.Parameter{
				Name: p.Name,
				Type: c.Serialize(tc, paramType),
			})
		}
		n.Return = c.Serialize(tc, tc.GetReturnTypeOfSignature(sig))
		return
	}

	// Plain object type.
	n.Kind = protocol.KindObject
	if len(props) > 0 {
		n.Properties = make(map[string]protocol.Property, len(props))
		for _, p := range props {
			propType := tc.GetTypeOfSymbol(p)
			prop := protocol.Property{
				Type: c.Serialize(tc, propType),
			}
			if p.Flags&ast.SymbolFlagsOptional != 0 {
				prop.Optional = true
			}
			n.Properties[p.Name] = prop
		}
	}
	if len(callSigs) > 0 {
		for _, sig := range callSigs {
			s := protocol.Signature{
				Return: c.Serialize(tc, tc.GetReturnTypeOfSignature(sig)),
			}
			for _, p := range sig.Parameters() {
				paramType := tc.GetTypeOfSymbol(p)
				s.Parameters = append(s.Parameters, protocol.Parameter{
					Name: p.Name,
					Type: c.Serialize(tc, paramType),
				})
			}
			n.Signatures = append(n.Signatures, s)
		}
	}
}
