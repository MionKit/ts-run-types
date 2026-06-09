// Package protocol defines the wire types exchanged between the ts-go-run-types
// resolver and its callers. The shape is the canonical mion runtypes reflection
// `RunType` discriminated union so the user's runtypes RT — which already
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

import (
	"encoding/json"
	"io"

	"github.com/mionkit/ts-run-types/internal/diag"
)

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
	ID   string         `json:"id"`
	Kind ReflectionKind `json:"kind"`
	// SubKind disambiguates kinds that map to more than one runtime shape —
	// `Date` / `Map` / `Set` / non-serialisable classes share KindClass but
	// each carry their own SubKind, and Map/Set parameter slots carry the
	// mapKey/mapValue/setItem subkinds. See internal/protocol/subkind.go.
	// Zero (SubKindNone) is "not applicable"; only set on nodes that need it.
	SubKind ReflectionSubKind `json:"subKind,omitempty"`
	// Family classifies the runtype into Atomic/Collection/Member/Function
	// per mion's RunTypeFamily (run-types/src/types.ts:41). Derived from
	// Kind via FamilyOf in family.go; populated by PopulateFamily at
	// cache-exit time (Cache.Dump / Cache.Added / Cache.NodesForIDs).
	// Refs (Kind=KindRef) and reserved kinds get FamilyUnknown (the empty
	// string), which omitempty strips. The RT compiler uses this to
	// decide whether to inline a node or emit a dependency call.
	Family        Family     `json:"family,omitempty"`
	TypeName      string     `json:"typeName,omitempty"`
	TypeArguments []*RunType `json:"typeArguments,omitempty"`
	// IsCircular flags a RunType that appears inside its own subtree
	// (e.g. `type CA = CA[]`). Mirrors mion's `isCircular` flag on
	// BaseRunType (run-types/src/lib/baseRunTypes.ts) — the RT compiler
	// uses it to force a self-recursive dependency call instead of
	// inlining the body. Auto-set by the serializer's projection pass
	// (runtype/serialize.go assignID: a back-edge to an in-progress id
	// marks the node circular) and rendered into the cache at the
	// `isCircular` slot so consumers can read it directly. Note:
	// composite kinds (Array/Object/Class/Tuple/Union) are still
	// non-inlined unconditionally in typefns/inlining.go — flipping them
	// to "inline unless circular or named" additionally needs TypeName
	// population on anonymous declarations (deferred).
	IsCircular bool `json:"isCircular,omitempty"`

	// NotSupported flags a "non-data" node — the kinds the type-function
	// emitters ignore (function / method / methodSignature / callSignature /
	// symbol / never / non-serialisable class). These nodes are KEPT in the
	// reflected tree so reflection stays complete, but the validators and
	// serializers drop them at property positions and throw at propagating
	// ones (unchanged — see docs/UNSUPPORTED-KINDS.md). Set on the node
	// itself only (never its children) by PopulateFamily at cache-exit,
	// using the same Kind classification the emitters apply. Reflection
	// consumers read it to know which members the type functions skip.
	NotSupported bool `json:"notSupported,omitempty"`

	// TypeLiteral
	Literal any `json:"literal,omitempty"`

	// TypeProperty / TypePropertySignature / TypeMethod / TypeMethodSignature
	// / TypeParameter / TypeEnumMember — name is `string | number | symbol` in
	// the reflection model; we only emit string. Symbol-named props get a
	// synthetic "@@<name>" string and Flags=["symbol"].
	Name string `json:"name,omitempty"`

	// TypeProperty / TypePropertySignature / TypeParameter etc.
	Optional bool `json:"optional,omitempty"`
	Readonly bool `json:"readonly,omitempty"`

	// TypeProperty / TypeMethod. Both flags use `is`-prefixed names so the
	// emitted JS mirror lands on plain identifiers (not reserved words),
	// which lets the cache-module factory bind them without aliasing.
	Visibility *int `json:"visibility,omitempty"`
	IsAbstract bool `json:"isAbstract,omitempty"`
	IsStatic   bool `json:"isStatic,omitempty"`

	// IsSafeName — true when Name is a valid JS identifier and the
	// consumer can emit `obj.<name>` dot access; false (omitted) means
	// bracket notation is required. Mirrors mion's isSafeName helper
	// at runtype level so downstream codegen need not re-run the regex.
	// Populated only on TypeProperty / TypePropertySignature / TypeMethod /
	// TypeMethodSignature.
	IsSafeName bool `json:"isSafeName,omitempty"`

	// Position — 0-based slot index in the parent (function parameter list
	// or tuple). Pointer so position 0 ships explicitly (`position: 0` is
	// not stripped by omitempty). Nil for kinds that aren't positional.
	// Populated only on TypeParameter and TypeTupleMember.
	Position *int `json:"position,omitempty"`

	// DefaultVal — literal-only; non-literal defaults are omitted with a
	// Flags marker. Function/expression defaults are recorded in Flags as
	// "nonLiteralDefault". Named with the `Val` suffix so the JS mirror
	// (`defaultVal`) avoids the `default` reserved word.
	DefaultVal any `json:"defaultVal,omitempty"`

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
	//
	// Lives on the union itself so the relationship is correctly scoped —
	// the same canonical property node may be a discriminator in one
	// parent union but not in another.
	//
	// Wire-format equivalent of mion's FlattenedProp[] output
	// (packages/run-types/src/nodes/collection/unionDiscriminator.ts).
	// We carry only the strictly-new field (a ref to the property);
	// the other FlattenedProp fields are reconstructible from the
	// surrounding context. JS-side consumers use
	// `flattenUnionDiscriminators` from @mionjs/ts-go-run-types to
	// materialise the full per-member struct.
	UnionDiscriminators []*RunType `json:"unionDiscriminators,omitempty"`

	// TypeMeta — opaque type-level metadata: the object-literal members
	// that survive a collapsed intersection of a primitive with one or
	// more metadata objects (e.g. `string & {__brand: "Email"}` or
	// `number & {currency: "USD"}`). Any `atomic & { obj }` qualifies —
	// no brand marker is required. Each entry is a ref to an objectLiteral
	// RunType, passed through untouched for consumers to read. This is the
	// generic form of deepkit's "type decorators" (TypeAnnotations.decorators),
	// renamed from `decorators` to avoid confusion with JS `@decorator`s and
	// to subsume the former number `brand` field. Order is the declaration
	// order of the members in the original intersection. FormatAnnotation
	// (below) is the validating specialisation, lifted out of TypeMeta.
	TypeMeta []*RunType `json:"typeMeta,omitempty"`

	// FormatAnnotation — populated when a primitive is branded with a
	// TypeFormat<Base, Name, Params, ...> marker from
	// `@mionjs/ts-go-run-types/formats`. Mirrors mion's FormatAnnotation
	// (packages/run-types/src/lib/formats.ts) — the name + params pair
	// that drives format-aware emit for validate / validationErrors. The
	// structural id folds Name + canonicalised Params into the hash so
	// two distinct param sets produce two distinct cache entries;
	// equivalent param sets (regardless of key order) collapse to one.
	// Lifted into a dedicated field rather than living in TypeMeta
	// so the emit hook is a single pointer check, not a per-emit
	// decorator-array scan.
	FormatAnnotation *FormatAnnotation `json:"formatAnnotation,omitempty"`

	// TypeEnum. `EnumVal` uses the `Val` suffix so the JS mirror lands as
	// `enumVal`, sidestepping the `enum` reserved word.
	EnumVal map[string]any `json:"enumVal,omitempty"`
	Values  []any          `json:"values,omitempty"`
	IndexT  *RunType       `json:"indexType,omitempty"`

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
	// (e.g. "symbol" for symbol-keyed names, "nonLiteralDefault", "bigint").
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

// FormatAnnotation carries the (name, params) pair extracted from a
// TypeFormat<Base, Name, Params, ...> brand. Name identifies the
// format family ("uuid", "email", "stringFormat", …) — both the
// JS-side format registry and the Go-side format-emitter registry
// key on this. Params is the JSON-serialisable literal payload (e.g.
// `{"version": "4"}` for FormatUUIDv4, `{"maxLength": 10}` for a
// FormatString). The map is canonicalised (sorted keys, recursed
// into nested objects) before participating in the structural id.
type FormatAnnotation struct {
	Name   string         `json:"name"`
	Params map[string]any `json:"params,omitempty"`
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
	// transformer injection (trailing `InjectRunTypeId<T>` parameter with a
	// concretely-bound T). When Request.IncludeRunTypes or
	// IncludeCacheSources is set, the response also carries a projection
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
	// OpTsCompile runs the embedded tsgo through bind + typecheck + emit
	// on the resolver's current source overlay, returns the wall time in
	// the response's TsCompileMs field, and discards the emit output.
	// Does NOT walk markers, does NOT render any ts-go-run-types cache
	// modules — it's the pure-TypeScript baseline measurement used by
	// the bench orchestrators to show "what would tsc cost" next to the
	// existing scanFiles latency. Caller seeds sources via OpSetSources
	// first (same precondition as OpScanFiles).
	OpTsCompile = "tsCompile"
)

// CacheKind enumerates the rendered cache-module bodies callers can opt into
// on a scanFiles request via Request.IncludeCacheSources. New kinds are
// expected as the precompiler grows; CacheKindAll is the forward-compatible
// "give me everything" shortcut.
type CacheKind string

const (
	CacheKindRunType                    CacheKind = "runType"
	CacheKindValidate                   CacheKind = "validate"
	CacheKindValidationErrors           CacheKind = "validationErrors"
	CacheKindPrepareForJson             CacheKind = "prepareForJson"
	CacheKindRestoreFromJson            CacheKind = "restoreFromJson"
	CacheKindStringifyJson              CacheKind = "stringifyJson"
	CacheKindPrepareForJsonSafe         CacheKind = "prepareForJsonSafe"
	CacheKindHasUnknownKeys             CacheKind = "hasUnknownKeys"
	CacheKindStripUnknownKeys           CacheKind = "stripUnknownKeys"
	CacheKindUnknownKeyErrors           CacheKind = "unknownKeyErrors"
	CacheKindUnknownKeysToUndefined     CacheKind = "unknownKeysToUndefined"
	CacheKindUnknownKeysToUndefinedWire CacheKind = "unknownKeysToUndefinedWire"
	CacheKindToBinary                   CacheKind = "toBinary"
	CacheKindFromBinary                 CacheKind = "fromBinary"
	CacheKindFormatTransform            CacheKind = "formatTransform"
	CacheKindPureFns                    CacheKind = "pureFns"
	CacheKindAll                        CacheKind = "all"
)

// Request is the union of all query operations (see resolver/dispatch).
//
// Files carries the scanFiles op's input — every file the caller wants
// scanned in this request. The response's Sites carries entries for
// every listed file (each tagged with .File), and IncludeRunTypes /
// IncludeCacheSources scope their payload to **this request's Files
// only**, not to any session-wide accumulation. Callers that want the
// whole in-memory cache call OpDump.
type Request struct {
	Op                  string            `json:"op"`
	Files               []string          `json:"files,omitempty"`
	ID                  string            `json:"id,omitempty"`
	Sources             map[string]string `json:"sources,omitempty"`
	IncludeRunTypes     bool              `json:"includeRunTypes,omitempty"`
	IncludeCacheSources []CacheKind       `json:"includeCacheSources,omitempty"`
}

// Response is returned per request. ID is the hash key into the shared
// dedup table. To distinguish "no id" from an empty string without polluting
// every payload, callers omit the field via HasID=false; we serialise via
// MarshalJSON below so JSON consumers see the field only when it's set.
//
// OK is a simple acknowledgement for ops that don't return data
// (setSources / resetCache). Emitted only when set so other ops stay tidy.
type Response struct {
	ID    string     `json:"-"`
	HasID bool       `json:"-"`
	OK    bool       `json:"-"`
	Added []*RunType `json:"added,omitempty"`
	// AddedRunTypes is true when this scanFiles call interned at least one
	// new RunType into the cache. The Vite plugin reads it from
	// handleHotUpdate to decide whether the runTypes cache module needs
	// invalidating after a user-file change.
	AddedRunTypes bool `json:"addedRunTypes,omitempty"`
	// AddedValidate is true when at least one of the newly-interned RunTypes
	// is supported by the Validate emitter — i.e. the validate cache module
	// would render at least one new entry. Set independently of
	// AddedRunTypes so cache-by-cache invalidation stays surgical.
	AddedValidate bool `json:"addedValidate,omitempty"`
	// AddedValidationErrors mirrors AddedValidate but for the ValidationErrors emitter —
	// true when at least one newly-interned RunType has a supported
	// emitTypeErrors arm. Lets the Vite plugin's handleHotUpdate
	// invalidate the validationErrors cache module independently of the
	// validate / runTypes modules.
	AddedValidationErrors bool `json:"addedValidationErrors,omitempty"`
	// AddedPrepareForJson / AddedRestoreFromJson mirror AddedValidate for
	// the JSON serializer pair. True when at least one newly-interned
	// RunType has a supported emit arm in the corresponding emitter.
	AddedPrepareForJson  bool `json:"addedPrepareForJson,omitempty"`
	AddedRestoreFromJson bool `json:"addedRestoreFromJson,omitempty"`
	// AddedStringifyJson mirrors AddedPrepareForJson for the
	// stringifyJson emitter — single-pass JSON.stringify that walks
	// the type rather than `v`. Set per emitter so the Vite plugin
	// invalidates the stringifyJson cache module independently.
	AddedStringifyJson bool `json:"addedStringifyJson,omitempty"`
	// AddedPrepareForJsonSafe mirrors AddedPrepareForJson for the safe-encode
	// family — non-mutating sibling that strips undeclared properties and
	// returns a new value. Pairs with the existing RestoreFromJson decoder
	// (wire format identical to prepareForJson + JSON.stringify).
	AddedPrepareForJsonSafe bool `json:"addedPrepareForJsonSafe,omitempty"`
	// AddedHasUnknownKeys / AddedStripUnknownKeys / AddedUnknownKeyErrors
	// / AddedUnknownKeysToUndefined mirror AddedValidate for the
	// unknown-keys family ported from mion's
	// emitHasUnknownKeys / emitStripUnknownKeys / emitUnknownKeyErrors /
	// emitUnknownKeysToUndefined methods on InterfaceRunType. Set per
	// emitter so the Vite plugin invalidates each cache module
	// independently on user-file changes.
	AddedHasUnknownKeys         bool `json:"addedHasUnknownKeys,omitempty"`
	AddedStripUnknownKeys       bool `json:"addedStripUnknownKeys,omitempty"`
	AddedUnknownKeyErrors       bool `json:"addedUnknownKeyErrors,omitempty"`
	AddedUnknownKeysToUndefined bool `json:"addedUnknownKeysToUndefined,omitempty"`
	// AddedUnknownKeysToUndefinedWire — sibling of AddedUnknownKeysToUndefined
	// for the decoder-internal ukuWire family. Same Supports surface as
	// uku (every supported runtype yields a ukuw entry too).
	AddedUnknownKeysToUndefinedWire bool `json:"addedUnknownKeysToUndefinedWire,omitempty"`
	// AddedToBinary / AddedFromBinary mirror AddedPrepareForJson for the
	// binary serializer pair. True when at least one newly-interned
	// RunType has a supported emit arm in the corresponding emitter.
	AddedToBinary   bool `json:"addedToBinary,omitempty"`
	AddedFromBinary bool `json:"addedFromBinary,omitempty"`
	// AddedFormatTransform mirrors AddedValidate for the `format` transform emitter —
	// true when a newly-interned RunType carries a value-transforming
	// format (string transform / domain/ip/url lowercasing).
	AddedFormatTransform bool `json:"addedFormatTransform,omitempty"`
	// AddedPureFns is true when the scan introduced (or modified) at
	// least one pure-fn entry across the request's files — checked
	// against the resolver's session-wide bodyHash index.
	AddedPureFns       bool          `json:"addedPureFns,omitempty"`
	Sites              []Site        `json:"sites,omitempty"`
	Replacements       []Replacement `json:"replacements,omitempty"`
	RunTypes           []*RunType    `json:"runTypes,omitempty"`
	RunTypeCacheSource string        `json:"runTypeCacheSource,omitempty"`
	// ValidateCacheSource is the rendered body of the `virtual:runtypes-validate`
	// module — one `export function get_validate_<hash>(utl){…}` factory
	// per cached RunType the precompiler knows how to handle. Sibling of
	// RunTypeCacheSource: populated under the same projection (full cache
	// for OpDump, scoped to request files for OpScanFiles when the
	// caller opts into CacheKindValidate / CacheKindAll via
	// IncludeCacheSources).
	ValidateCacheSource string `json:"validateCacheSource,omitempty"`
	// ValidationErrorsCacheSource is the rendered body of the
	// `virtual:runtypes-validationErrors` module — one
	// `factory(rtFnHash, typeName, code, isNoop, deps, …)` call per
	// cached RunType the precompiler's ValidationErrorsEmitter knows how to
	// handle. Sibling of ValidateCacheSource, same projection semantics.
	ValidationErrorsCacheSource string `json:"validationErrorsCacheSource,omitempty"`
	// PrepareForJsonCacheSource / RestoreFromJsonCacheSource are the
	// rendered bodies of the JSON serializer/deserializer pair. Same
	// factory shape and projection semantics as ValidateCacheSource.
	PrepareForJsonCacheSource  string `json:"prepareForJsonCacheSource,omitempty"`
	RestoreFromJsonCacheSource string `json:"restoreFromJsonCacheSource,omitempty"`
	// StringifyJsonCacheSource is the rendered body of the
	// `virtual:runtypes-stringifyJson` module — single-pass RT that
	// walks the type and emits a JSON string directly. Sibling of
	// PrepareForJsonCacheSource; same factory shape and projection
	// semantics.
	StringifyJsonCacheSource string `json:"stringifyJsonCacheSource,omitempty"`
	// PrepareForJsonSafeCacheSource carries the rendered body of the
	// safe-encode family — non-mutating sibling of PrepareForJsonCacheSource.
	PrepareForJsonSafeCacheSource string `json:"prepareForJsonSafeCacheSource,omitempty"`
	// HasUnknownKeysCacheSource / StripUnknownKeysCacheSource /
	// UnknownKeyErrorsCacheSource / UnknownKeysToUndefinedCacheSource
	// are the rendered bodies of the unknown-keys family — the four
	// RT functions ported from mion's emitHasUnknownKeys et al. Same
	// factory shape and projection semantics as ValidateCacheSource.
	HasUnknownKeysCacheSource         string `json:"hasUnknownKeysCacheSource,omitempty"`
	StripUnknownKeysCacheSource       string `json:"stripUnknownKeysCacheSource,omitempty"`
	UnknownKeyErrorsCacheSource       string `json:"unknownKeyErrorsCacheSource,omitempty"`
	UnknownKeysToUndefinedCacheSource string `json:"unknownKeysToUndefinedCacheSource,omitempty"`
	// UnknownKeysToUndefinedWireCacheSource — rendered body of the
	// decoder-internal ukuWire family. Carries the wire-format-aware
	// emit (wrapper-peel + reach-into-v[1] for union nodes); identical
	// to UnknownKeysToUndefinedCacheSource for non-union runtypes.
	UnknownKeysToUndefinedWireCacheSource string `json:"unknownKeysToUndefinedWireCacheSource,omitempty"`
	// ToBinaryCacheSource / FromBinaryCacheSource — rendered bodies of
	// the binary serializer/deserializer pair. Same factory shape and
	// projection semantics as PrepareForJsonCacheSource.
	ToBinaryCacheSource   string `json:"toBinaryCacheSource,omitempty"`
	FromBinaryCacheSource string `json:"fromBinaryCacheSource,omitempty"`
	// FormatTransformCacheSource is the rendered body of the `virtual:runtypes-format`
	// module — the `format` transform RT family (createFormatTransform<T>). Same
	// factory shape and projection semantics as ValidateCacheSource.
	FormatTransformCacheSource string `json:"formatTransformCacheSource,omitempty"`
	// PureFnsCacheSource is the rendered body of the
	// `virtual:runtypes-pure-fns` module — one
	// `factory(key, bodyHash, paramNames, code, pureFnDependencies, createPureFn)`
	// call per registered pure function. The module is the canonical
	// runtime home of every pure-fn body; the Vite plugin separately
	// rewrites the user's `registerPureFnFactory(ns, fn, factory)` call
	// to pass `null` as the factory argument (see Replacements) so the
	// function body is not duplicated in the user bundle.
	// Populated on OpDump and on OpScanFiles when the caller opts into
	// CacheKindPureFns / CacheKindAll via IncludeCacheSources.
	PureFnsCacheSource string `json:"pureFnsCacheSource,omitempty"`
	// Diagnostics carries every non-fatal diagnostic the Go binary
	// emits — pure-fn extractor (PFE9xxx), marker scanner (MKRxxx),
	// RT compiler (IT/TE/PJ/…/FB) — through one wire channel. The
	// Family discriminator inside each entry tells the consumer which
	// subsystem produced it; the Code is the stable identifier and
	// Severity classifies impact. Vite plugin re-emits each via
	// `this.warn(diag.FormatTsc(d))` so VS Code's $tsc problem matcher
	// picks them up. Schema mirrors the LSP Diagnostic shape.
	Diagnostics []diag.Diagnostic `json:"diagnostics,omitempty"`
	// TsCompileMs is populated by OpTsCompile only. Wall time of the
	// tsgo bind + typecheck + Emit() pass on the resolver's current
	// source overlay, in milliseconds. Zero for every other op.
	TsCompileMs float64 `json:"tsCompileMs,omitempty"`
	Error       string  `json:"error,omitempty"`
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
	// FnId is the value the transformer injects as the 2nd tuple element for a
	// createX call site routed through the InjectTypeFnArgs<T, Fn> marker (the
	// readable family/variant token today; an opaque fn hash after the hashed-id
	// migration). Empty for reflection-only InjectRunTypeId sites (getRunTypeId /
	// reflectRunTypeId / builders), which inject the bare id string.
	FnId string `json:"fnId,omitempty"`
	// Demand is the structured set of cache entries this createX site requires,
	// computed by the scanner from the operation registry. The emitter renders
	// from this directly rather than reverse-parsing FnId — a hash isn't
	// reversible. One entry for a simple family / it-te variant; several for a
	// composite JSON strategy. Empty for reflection-only sites.
	Demand []SiteDemand `json:"demand,omitempty"`
}

// SiteDemand is one cache entry a createX site requires: the family + variant to
// render plus the fnHash that entry is keyed by. FamilyTag/VariantSuffix/Options
// drive the emitter's rendering; FnHash names the entry once the hashed-id
// migration lands (carried forward now).
type SiteDemand struct {
	FamilyTag     string   `json:"family"`
	VariantSuffix string   `json:"variant,omitempty"`
	Options       []string `json:"options,omitempty"`
	FnHash        string   `json:"fnHash,omitempty"`
}

// Replacement is a byte-range rewrite on a source file: replace the
// bytes [Start, End) with Text. Used by the pure-fn extractor to null
// out the factory argument of every `registerPureFnFactory(ns, fn,
// factory)` call so the canonical fn body lives only in the emitted
// pureFns cache module (no duplication in the user bundle).
type Replacement struct {
	File  string `json:"file"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	Text  string `json:"text"`
}

// Dump is the build-end manifest written to runtypes-cache.json.
type Dump struct {
	RunTypes []*RunType `json:"runTypes"`
	Sites    []Site     `json:"sites"`
}

// WriteJSON writes the dump as pretty-printed JSON. Refs in child slots
// stay as `{kind: -1, id: "<hash>"}` sentinels — the consumer is
// responsible for re-knotting if it doesn't use the generated TS module.
func (dump Dump) WriteJSON(writer io.Writer) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(dump)
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
	if response.AddedRunTypes {
		out["addedRunTypes"] = true
	}
	if response.AddedValidate {
		out["addedValidate"] = true
	}
	if response.AddedValidationErrors {
		out["addedValidationErrors"] = true
	}
	if response.AddedPrepareForJson {
		out["addedPrepareForJson"] = true
	}
	if response.AddedRestoreFromJson {
		out["addedRestoreFromJson"] = true
	}
	if response.AddedStringifyJson {
		out["addedStringifyJson"] = true
	}
	if response.AddedPrepareForJsonSafe {
		out["addedPrepareForJsonSafe"] = true
	}
	if response.AddedHasUnknownKeys {
		out["addedHasUnknownKeys"] = true
	}
	if response.AddedStripUnknownKeys {
		out["addedStripUnknownKeys"] = true
	}
	if response.AddedUnknownKeyErrors {
		out["addedUnknownKeyErrors"] = true
	}
	if response.AddedUnknownKeysToUndefined {
		out["addedUnknownKeysToUndefined"] = true
	}
	if response.AddedUnknownKeysToUndefinedWire {
		out["addedUnknownKeysToUndefinedWire"] = true
	}
	if response.AddedToBinary {
		out["addedToBinary"] = true
	}
	if response.AddedFromBinary {
		out["addedFromBinary"] = true
	}
	if response.AddedFormatTransform {
		out["addedFormatTransform"] = true
	}
	if response.AddedPureFns {
		out["addedPureFns"] = true
	}
	if len(response.Sites) > 0 {
		out["sites"] = response.Sites
	}
	if len(response.Replacements) > 0 {
		out["replacements"] = response.Replacements
	}
	if len(response.RunTypes) > 0 {
		out["runTypes"] = response.RunTypes
	}
	if response.RunTypeCacheSource != "" {
		out["runTypeCacheSource"] = response.RunTypeCacheSource
	}
	if response.ValidateCacheSource != "" {
		out["validateCacheSource"] = response.ValidateCacheSource
	}
	if response.ValidationErrorsCacheSource != "" {
		out["validationErrorsCacheSource"] = response.ValidationErrorsCacheSource
	}
	if response.PrepareForJsonCacheSource != "" {
		out["prepareForJsonCacheSource"] = response.PrepareForJsonCacheSource
	}
	if response.RestoreFromJsonCacheSource != "" {
		out["restoreFromJsonCacheSource"] = response.RestoreFromJsonCacheSource
	}
	if response.StringifyJsonCacheSource != "" {
		out["stringifyJsonCacheSource"] = response.StringifyJsonCacheSource
	}
	if response.PrepareForJsonSafeCacheSource != "" {
		out["prepareForJsonSafeCacheSource"] = response.PrepareForJsonSafeCacheSource
	}
	if response.HasUnknownKeysCacheSource != "" {
		out["hasUnknownKeysCacheSource"] = response.HasUnknownKeysCacheSource
	}
	if response.StripUnknownKeysCacheSource != "" {
		out["stripUnknownKeysCacheSource"] = response.StripUnknownKeysCacheSource
	}
	if response.UnknownKeyErrorsCacheSource != "" {
		out["unknownKeyErrorsCacheSource"] = response.UnknownKeyErrorsCacheSource
	}
	if response.UnknownKeysToUndefinedCacheSource != "" {
		out["unknownKeysToUndefinedCacheSource"] = response.UnknownKeysToUndefinedCacheSource
	}
	if response.UnknownKeysToUndefinedWireCacheSource != "" {
		out["unknownKeysToUndefinedWireCacheSource"] = response.UnknownKeysToUndefinedWireCacheSource
	}
	if response.ToBinaryCacheSource != "" {
		out["toBinaryCacheSource"] = response.ToBinaryCacheSource
	}
	if response.FromBinaryCacheSource != "" {
		out["fromBinaryCacheSource"] = response.FromBinaryCacheSource
	}
	if response.FormatTransformCacheSource != "" {
		out["formatTransformCacheSource"] = response.FormatTransformCacheSource
	}
	if response.PureFnsCacheSource != "" {
		out["pureFnsCacheSource"] = response.PureFnsCacheSource
	}
	if len(response.Diagnostics) > 0 {
		out["diagnostics"] = response.Diagnostics
	}
	if response.TsCompileMs > 0 {
		out["tsCompileMs"] = response.TsCompileMs
	}
	if response.Error != "" {
		out["error"] = response.Error
	}
	return jsonMarshal(out)
}

// PureFnDep identifies a pure-function dependency of a RT-compiled
// function. FilePath is the absolute path of the source file where
// registerPureFnFactory(<Namespace>, <FunctionName>, ...) is invoked.
// The walker uses FilePath at compile time to assert the dependency
// actually exists in source (Go-side AST integrity check); it does
// not reach the emitted JS — the wire shape stays the flat
// "namespace::fnName" string array that the JS-side rtUtils
// consumes today.
type PureFnDep struct {
	Namespace    string
	FunctionName string
	FilePath     string
}
