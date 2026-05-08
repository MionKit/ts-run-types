// Package protocol defines the wire types exchanged between the ts-run-types
// resolver and its callers. The shape mirrors deepkit/type's `Type` discriminated
// union (see https://github.com/marcj/deepkit/blob/master/packages/type/src/reflection/type.ts)
// so the user's runtypes JIT — which already understands deepkit's runtime
// shape — can consume our cache directly.
//
// Because JSON cannot carry cycles or live references, child Type slots in the
// JSON wire format are ref sentinels: `{kind: -1, id: "<hash>"}`. Two consumption
// paths exist:
//
//  1. The generated `.ts` runtime artifact resolves cycles via direct const
//     assignment — consumers `import { __runtypes }` and call `Map.get(hash)` to
//     obtain a fully-knotted deepkit Type object.
//  2. JSON-only consumers walk `Dump.Types` themselves to re-knot.
//
// IDs are short alphanumeric hash strings (default 6 chars, configurable). The
// hash is derived from the type's structural id (mirroring mion's
// `_createTypeId` algorithm) — two structurally-equal types share the same
// hash regardless of declaration order or alias name.
package protocol

import "encoding/json"

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

// ReflectionKind matches deepkit/type's enum byte-for-byte. New values must
// follow the same declaration order as
// packages/type/src/reflection/type.ts.
type ReflectionKind int

const (
	KindNever ReflectionKind = iota
	KindAny
	KindUnknown
	KindVoid
	KindObject
	KindString
	KindNumber
	KindBoolean
	KindSymbol
	KindBigInt
	KindNull
	KindUndefined
	KindRegexp
	KindLiteral
	KindTemplateLiteral
	KindProperty
	KindMethod
	KindFunction
	KindParameter
	KindPromise
	KindClass
	KindTypeParameter
	KindEnum
	KindUnion
	KindIntersection
	KindArray
	KindTuple
	KindTupleMember
	KindEnumMember
	KindRest
	KindObjectLiteral
	KindIndexSignature
	KindPropertySignature
	KindMethodSignature
	KindInfer
	KindCallSignature
)

// KindRef is our sentinel for "this slot points at type id <hash>, look it up
// in the table". Not a deepkit kind — the value -1 is reserved for refs.
const KindRef ReflectionKind = -1

// Type is a JSON-friendly union of every deepkit Type variant. Optional
// fields are gated by `omitempty`. A given Type uses only the fields relevant
// to its Kind; the rest stay zero/nil.
//
// Child Type slots (e.g. TypePropertySignature.type) are *Type so we can
// emit sentinels (`{kind: -1, id: "<hash>"}`) without inlining the referenced
// node.
type Type struct {
	// TypeAnnotations.
	// ID is always emitted (even empty) because the renderer needs an
	// unambiguous handle for every type.
	ID            string         `json:"id"`
	Kind          ReflectionKind `json:"kind"`
	TypeName      string         `json:"typeName,omitempty"`
	TypeArguments []*Type        `json:"typeArguments,omitempty"`
	Inlined       bool           `json:"inlined,omitempty"`

	// TypeLiteral
	Literal any `json:"literal,omitempty"`

	// TypeNumber.brand — number brand subtype (integer / int8 / …). v1: never set.
	Brand *int `json:"brand,omitempty"`

	// TypeProperty / TypePropertySignature / TypeMethod / TypeMethodSignature
	// / TypeParameter / TypeEnumMember — name is `string | number | symbol` in
	// deepkit; we only emit string. Symbol-named props get a synthetic
	// "@@<name>" string and Flags=["symbol"].
	Name string `json:"name,omitempty"`

	// TypeProperty / TypePropertySignature / TypeParameter etc.
	Optional bool `json:"optional,omitempty"`
	Readonly bool `json:"readonly,omitempty"`

	// TypeProperty / TypeMethod
	Visibility *int `json:"visibility,omitempty"`
	Abstract   bool `json:"abstract,omitempty"`
	Static     bool `json:"static,omitempty"`

	// Default — literal-only; non-literal defaults are omitted with a Flags
	// marker. Function/expression defaults are recorded in Flags as
	// "nonLiteralDefault".
	Default any `json:"default,omitempty"`

	// TypeFunction / TypeMethod / TypeMethodSignature / TypeCallSignature
	Parameters []*Type `json:"parameters,omitempty"`
	Return     *Type   `json:"return,omitempty"`

	// TypeArray / TypePromise / TypeRest / TypeIndexSignature.type
	// / TypeTupleMember.type / TypePropertySignature.type / TypeProperty.type
	// / TypeParameter.type
	Type *Type `json:"type,omitempty"`

	// TypeIndexSignature
	Index *Type `json:"index,omitempty"`

	// TypeUnion / TypeIntersection / TypeTuple / TypeObjectLiteral / TypeClass
	// — all use `types: []` of whichever child variants are legal.
	Types []*Type `json:"types,omitempty"`

	// TypeEnum
	Enum   map[string]any `json:"enum,omitempty"`
	Values []any          `json:"values,omitempty"`
	IndexT *Type          `json:"indexType,omitempty"`

	// TypeClass
	ExtendsArguments []*Type `json:"extendsArguments,omitempty"`
	Implements       []*Type `json:"implements,omitempty"`
	Arguments        []*Type `json:"arguments,omitempty"`
	// classType is a runtime constructor reference — see workaround docs.
	// We emit the class's exported name + module path so a v2 footer can wire
	// up an `import { Class } from "..."`.
	ClassRef *ClassRef `json:"classRef,omitempty"`

	// TypeTemplateLiteral, TypeRegexp, TypeInfer — placeholder for v2.

	// Flags carries free-form markers for things we couldn't bridge cleanly
	// (e.g. "symbol" for symbol-keyed names, "nonLiteralDefault", "bigint",
	// "regexp" for the literal-regexp encoding).
	Flags []string `json:"flags,omitempty"`

	// Description — JSDoc-style per-member comment. v2.
	Description string `json:"description,omitempty"`
}

// ClassRef captures enough provenance for a v2 footer to wire up
// `t.classType = ImportedConstructor` in the generated `.ts` artifact.
//
// For built-in classes recognised by mion (Date, Map, Set, RegExp), Builtin
// is set to the constructor name and the footer emits
// `t.classType = globalThis.<Name>`. For user classes, Module is the
// originating module path and Name the exported symbol.
type ClassRef struct {
	Builtin string `json:"builtin,omitempty"` // "Date" | "Map" | "Set" | "RegExp"
	Name    string `json:"name,omitempty"`    // user-class export name
	Module  string `json:"module,omitempty"`  // originating module path
}

// NewRef returns a sentinel Type pointing at id. The TS artifact emitter
// resolves these into direct const references.
func NewRef(id string) *Type {
	return &Type{Kind: KindRef, ID: id}
}

// Request is the union of all query operations (see resolver/dispatch).
type Request struct {
	Op      string `json:"op"`
	File    string `json:"file,omitempty"`
	Pos     int    `json:"pos,omitempty"`
	CallPos int    `json:"callPos,omitempty"`
	Index   int    `json:"index,omitempty"`
}

// Response is returned per request. ID is the hash key into the shared
// dedup table. To distinguish "no id" from an empty string without polluting
// every payload, callers omit the field via HasID=false; we serialise via
// MarshalJSON below so JSON consumers see the field only when it's set.
type Response struct {
	ID    string  `json:"-"`
	HasID bool    `json:"-"`
	Added []*Type `json:"added,omitempty"`
	Sites []Site  `json:"sites,omitempty"`
	Types []*Type `json:"types,omitempty"`
	Error string  `json:"error,omitempty"`
}

type Site struct {
	File string `json:"file"`
	Pos  int    `json:"pos"`
	ID   string `json:"id"`
}

// Dump is the build-end manifest written to runtypes-cache.json.
type Dump struct {
	Types []*Type `json:"types"`
	Sites []Site  `json:"sites"`
}

// MarshalJSON serialises Response. ID is emitted only when HasID is true so
// dump responses (which don't resolve a single id) don't carry a misleading "".
func (r Response) MarshalJSON() ([]byte, error) {
	out := make(map[string]any, 5)
	if r.HasID {
		out["id"] = r.ID
	}
	if len(r.Added) > 0 {
		out["added"] = r.Added
	}
	if len(r.Sites) > 0 {
		out["sites"] = r.Sites
	}
	if len(r.Types) > 0 {
		out["types"] = r.Types
	}
	if r.Error != "" {
		out["error"] = r.Error
	}
	return jsonMarshal(out)
}
