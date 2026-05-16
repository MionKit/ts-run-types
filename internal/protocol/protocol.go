// Package protocol defines the wire types exchanged between the ts-go-run-types
// resolver and its callers. The shape is the canonical mion runtypes reflection
// `RunType` discriminated union so the user's runtypes JIT — which already
// understands this runtime shape — can consume our cache directly.
//
// Because JSON cannot carry cycles or live references, child RunType slots in
// the JSON wire format are ref sentinels: `{kind: -1, id: "<hash>"}`. Two
// consumption paths exist:
//
//  1. The generated `.ts` runtime artifact resolves cycles via direct const
//     assignment — consumers `import { __runtypes }` and call `Map.get(hash)` to
//     obtain a fully-knotted reflection RunType object.
//  2. JSON-only consumers walk `Dump.RunTypes` themselves to re-knot.
//
// IDs are short alphanumeric hash strings (default 6 chars, configurable). The
// hash is derived from the type's structural id (mirroring mion's
// `_createTypeId` algorithm) — two structurally-equal types share the same
// hash regardless of declaration order or alias name.
package protocol

import "encoding/json"

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

// ReflectionKind enumerates the discriminator values for every reflection
// `RunType` variant. New values must be appended in declaration order so the
// integer values stay stable across releases.
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
// in the table". Not a reflection kind — the value -1 is reserved for refs.
const KindRef ReflectionKind = -1

// RunType is a JSON-friendly union of every reflection RunType variant. Optional
// fields are gated by `omitempty`. A given RunType uses only the fields relevant
// to its Kind; the rest stay zero/nil.
//
// Child RunType slots (e.g. TypePropertySignature.child) are *RunType so we can
// emit sentinels (`{kind: -1, id: "<hash>"}`) without inlining the referenced
// node.
type RunType struct {
	// TypeAnnotations.
	// ID is always emitted (even empty) because the renderer needs an
	// unambiguous handle for every type.
	ID            string         `json:"id"`
	Kind          ReflectionKind `json:"kind"`
	TypeName      string         `json:"typeName,omitempty"`
	TypeArguments []*RunType     `json:"typeArguments,omitempty"`
	Inlined       bool           `json:"inlined,omitempty"`

	// TypeLiteral
	Literal any `json:"literal,omitempty"`

	// TypeNumber.brand — number brand subtype (integer / int8 / …). v1: never set.
	Brand *int `json:"brand,omitempty"`

	// TypeProperty / TypePropertySignature / TypeMethod / TypeMethodSignature
	// / TypeParameter / TypeEnumMember — name is `string | number | symbol` in
	// the reflection model; we only emit string. Symbol-named props get a
	// synthetic "@@<name>" string and Flags=["symbol"].
	Name string `json:"name,omitempty"`

	// TypeProperty / TypePropertySignature / TypeParameter etc.
	Optional bool `json:"optional,omitempty"`
	Readonly bool `json:"readonly,omitempty"`

	// TypeProperty / TypeMethod
	Visibility *int `json:"visibility,omitempty"`
	Abstract   bool `json:"abstract,omitempty"`
	Static     bool `json:"static,omitempty"`

	// IsSafePropName — true when Name is a valid JS identifier and the
	// consumer can emit `obj.<name>` dot access; false (omitted) means
	// bracket notation is required. Mirrors mion's isSafePropName helper
	// at runtype level so downstream codegen need not re-run the regex.
	// Populated only on TypeProperty / TypePropertySignature / TypeMethod /
	// TypeMethodSignature.
	IsSafePropName bool `json:"isSafePropName,omitempty"`

	// Position — 0-based slot index in the parent (function parameter list
	// or tuple). Pointer so position 0 ships explicitly (`position: 0` is
	// not stripped by omitempty). Nil for kinds that aren't positional.
	// Populated only on TypeParameter and TypeTupleMember.
	Position *int `json:"position,omitempty"`

	// Default — literal-only; non-literal defaults are omitted with a Flags
	// marker. Function/expression defaults are recorded in Flags as
	// "nonLiteralDefault".
	Default any `json:"default,omitempty"`

	// TypeFunction / TypeMethod / TypeMethodSignature / TypeCallSignature
	Parameters []*RunType `json:"parameters,omitempty"`
	Return     *RunType   `json:"return,omitempty"`

	// TypeArray / TypePromise / TypeRest / TypeIndexSignature.child
	// / TypeTupleMember.child / TypePropertySignature.child / TypeProperty.child
	// / TypeParameter.child
	Child *RunType `json:"child,omitempty"`

	// TypeIndexSignature
	Index *RunType `json:"index,omitempty"`

	// TypeUnion / TypeIntersection / TypeTuple / TypeObjectLiteral / TypeClass
	// — all use `children: []` of whichever child variants are legal.
	Children []*RunType `json:"children,omitempty"`

	// TypeUnion only — safe order computed at serialize time. Each entry
	// is a ref pointing at the same canonical child as Children, but
	// reordered so more-specific (superset) members precede their subset
	// equivalents. Prevents unreachable union members at validate time.
	// Empty for unions that don't need reordering (≤1 object member).
	SafeUnionChildren []*RunType `json:"safeUnionChildren,omitempty"`

	// TypeUnion only — set by the serialize-time discriminator detection
	// pass. Parallel to SafeUnionChildren: entry i is a ref to the
	// discriminator property within SafeUnionChildren[i]. Consumer reads
	// entry.Name for the property key and entry.Child for the expected
	// type. Slots for non-object members (simple / any) are nil. When
	// detection finds no usable discriminator, the field is empty.
	// Mirrors mion's FlattenedProp[] output (minus the codegen-local
	// compiledName) and lives on the union itself so the relationship
	// is correctly scoped — the same canonical property node may be a
	// discriminator in one parent union but not in another.
	UnionDiscriminators []*RunType `json:"unionDiscriminators,omitempty"`

	// Decorators — surviving object-literal types from a collapsed
	// intersection that combined a primitive with one or more brand
	// objects (e.g. `string & {__brand: "Email"}`). Each entry is a
	// ref to an objectLiteral RunType. Mirrors deepkit's
	// TypeAnnotations.decorators field. Order is the declaration order
	// of the object-literal members in the original intersection.
	Decorators []*RunType `json:"decorators,omitempty"`

	// TypeEnum
	Enum   map[string]any `json:"enum,omitempty"`
	Values []any          `json:"values,omitempty"`
	IndexT *RunType       `json:"indexType,omitempty"`

	// TypeClass
	ExtendsArguments []*RunType `json:"extendsArguments,omitempty"`
	Implements       []*RunType `json:"implements,omitempty"`
	Arguments        []*RunType `json:"arguments,omitempty"`
	// Extends — TypeObjectLiteral (interface form) only — the direct
	// parent interface types this declaration extends. Each entry is a
	// ref to the parent's RunType. Properties inherited from these
	// parents are ALSO included in Children (the TS checker merges them
	// via GetPropertiesOfType), so the runtime path stays simple while
	// codegen can walk the inheritance tree explicitly via Extends.
	// Empty for anonymous object literals and `type` aliases.
	Extends []*RunType `json:"extends,omitempty"`
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

// NewRef returns a sentinel RunType pointing at id. The TS artifact emitter
// resolves these into direct const references.
func NewRef(id string) *RunType {
	return &RunType{Kind: KindRef, ID: id}
}

// Op constants for the wire protocol. Stable string values — the TS side
// references the same names.
const (
	// OpScanFiles walks every CallExpression in each requested file and
	// returns one Site per call whose resolved signature opts into
	// transformer injection (trailing `RuntypeId<T>` parameter with a
	// concretely-bound T). When Request.IncludeRunTypes or
	// IncludeCacheSource is set, the response also carries a projection
	// scoped to Request.Files only — NOT to the cache's session-wide
	// contents. Callers that want the full in-memory cache use OpDump.
	OpScanFiles = "scanFiles"
	// OpDump returns the full cache contents: every RunType the resolver has
	// projected so far + every Site recorded. Used at end-of-build.
	OpDump = "dump"
	// OpSetSources replaces the resolver's in-memory source overlay AND
	// rebuilds the inferred Program against it. Sites are reset (their
	// byte offsets are tied to the previous source text). The structural
	// type cache survives across calls — same shape, same id — unless
	// reset is explicitly invoked.
	OpSetSources = "setSources"
	// OpReset wipes ALL resolver state: cache, sites, Program, checker,
	// and the in-memory overlay. Equivalent to throwing the Resolver away
	// and replacing it with a fresh one — the connection stays open. A
	// subsequent setSources is required before scanFiles will work.
	OpReset = "reset"
	// OpResolveID returns the canonical full RunType for a given hash id.
	// Child slots inside the returned RunType stay as KindRef sentinels — the
	// caller re-issues OpResolveID per id to drill in. Lets consumers walk
	// member-type child refs without dumping the whole cache.
	OpResolveID = "resolveId"
)

// Request is the union of all query operations (see resolver/dispatch).
//
// Files carries the scanFiles op's input — every file the caller wants
// scanned in this request. The response's Sites carries entries for
// every listed file (each tagged with .File), and IncludeRunTypes /
// IncludeCacheSource scope their payload to **this request's Files
// only**, not to any session-wide accumulation. Callers that want the
// whole in-memory cache call OpDump.
type Request struct {
	Op                 string            `json:"op"`
	Files              []string          `json:"files,omitempty"`
	ID                 string            `json:"id,omitempty"`
	Sources            map[string]string `json:"sources,omitempty"`
	IncludeRunTypes    bool              `json:"includeRunTypes,omitempty"`
	IncludeCacheSource bool              `json:"includeCacheSource,omitempty"`
}

// Response is returned per request. ID is the hash key into the shared
// dedup table. To distinguish "no id" from an empty string without polluting
// every payload, callers omit the field via HasID=false; we serialise via
// MarshalJSON below so JSON consumers see the field only when it's set.
//
// OK is a simple acknowledgement for ops that don't return data
// (setSources / resetCache). Emitted only when set so other ops stay tidy.
type Response struct {
	ID          string     `json:"-"`
	HasID       bool       `json:"-"`
	OK          bool       `json:"-"`
	Added       []*RunType `json:"added,omitempty"`
	Sites       []Site     `json:"sites,omitempty"`
	RunTypes    []*RunType `json:"runTypes,omitempty"`
	CacheSource string     `json:"cacheSource,omitempty"`
	Error       string     `json:"error,omitempty"`
}

// Site records one transformer-injection point. Pos is the byte offset of
// the closing `)` of the call expression — the patcher inserts at that
// offset. ParamIndex is the 0-based slot the injected id occupies in the
// call's argument list; the runtime helper reads from that slot. ArgsCount
// is the number of arguments the user already wrote — when it's less than
// ParamIndex the patcher pads with `undefined` so the id lands in the
// right slot.
type Site struct {
	File       string `json:"file"`
	Pos        int    `json:"pos"`
	ID         string `json:"id"`
	ParamIndex int    `json:"paramIndex,omitempty"`
	ArgsCount  int    `json:"argsCount,omitempty"`
}

// Dump is the build-end manifest written to runtypes-cache.json.
type Dump struct {
	RunTypes []*RunType `json:"runTypes"`
	Sites    []Site     `json:"sites"`
}

// MarshalJSON serialises Response. ID is emitted only when HasID is true so
// dump responses (which don't resolve a single id) don't carry a misleading "".
func (response Response) MarshalJSON() ([]byte, error) {
	out := make(map[string]any, 6)
	if response.HasID {
		out["id"] = response.ID
	}
	if response.OK {
		out["ok"] = true
	}
	if len(response.Added) > 0 {
		out["added"] = response.Added
	}
	if len(response.Sites) > 0 {
		out["sites"] = response.Sites
	}
	if len(response.RunTypes) > 0 {
		out["runTypes"] = response.RunTypes
	}
	if response.CacheSource != "" {
		out["cacheSource"] = response.CacheSource
	}
	if response.Error != "" {
		out["error"] = response.Error
	}
	return jsonMarshal(out)
}
