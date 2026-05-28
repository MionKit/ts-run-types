// Wire types mirroring internal/protocol/protocol.go. Hand-maintained rather
// than code-generated to keep the plugin dep-free.
//
// The shape is the canonical mion runtypes reflection `RunType` discriminated
// union. Child RunType slots in the JSON wire format are sentinels
// (`{kind: -1, id: N}`); consumers either re-knot themselves (raw JSON) or
// import the generated runtypes-cache.ts module which contains a fully-knotted
// graph.

export enum ReflectionKind {
  never = 0,
  any = 1,
  unknown = 2,
  void = 3,
  object = 4,
  string = 5,
  number = 6,
  boolean = 7,
  symbol = 8,
  bigint = 9,
  null = 10,
  undefined = 11,
  regexp = 12,
  literal = 13,
  templateLiteral = 14,
  property = 15,
  method = 16,
  function = 17,
  parameter = 18,
  promise = 19,
  class = 20,
  typeParameter = 21,
  enum = 22,
  union = 23,
  intersection = 24,
  array = 25,
  tuple = 26,
  tupleMember = 27,
  enumMember = 28,
  rest = 29,
  objectLiteral = 30,
  indexSignature = 31,
  propertySignature = 32,
  methodSignature = 33,
  infer = 34,
  callSignature = 35,
}

// kindRef is our sentinel — not a reflection kind. Used in JSON to point at
// another type by id without inlining the referenced node.
export const KIND_REF = -1;

// Re-export the cache-module settings generated from
// internal/constants/constants.go so callers have a single place to import
// the prefix from. Single source of truth lives in Go; the .generated.ts
// file is rebuilt via `pnpm run gen:ts-constants`.
export {
  CACHE_MODULES,
  RUNTYPES_VAR_PREFIX,
  RUNTYPES_MODULE_NAME,
  ISTYPE_VAR_PREFIX,
  ISTYPE_MODULE_NAME,
  type CacheModuleSettings,
} from './runtypes-constants.generated.ts';

export interface ClassRef {
  // builtin: "Date" | "Map" | "Set" | "RegExp" — footer wires
  // `t.classType = globalThis.<builtin>`.
  builtin?: string;
  // user-class export name + originating module path (v2 lazy import).
  name?: string;
  module?: string;
}

// RunType is a JSON-friendly union of every reflection RunType variant.
// Optional fields are populated only when relevant to the discriminator
// `kind`.
//
// IDs are short alphanumeric hash strings (default 6 chars). Two
// structurally-equal types share the same id.
export interface RunType {
  id?: string;
  kind: ReflectionKind | typeof KIND_REF;

  // TypeAnnotations
  typeName?: string;
  typeArguments?: RunType[];
  inlined?: true;

  // TypeLiteral
  literal?: unknown;

  // TypeNumber.brand (v2)
  brand?: number;

  // shared
  name?: string;
  optional?: true;
  readonly?: true;
  visibility?: number;
  isAbstract?: true;
  isStatic?: true;
  // isSafeName — property / method nodes only. True when `name` is a
  // valid JS identifier (or all digits) and consumers can emit dot access
  // (obj.foo). False/missing means bracket notation is required.
  isSafeName?: true;
  // position — parameter / tupleMember nodes only. 0-based slot index in
  // the parent. Number, not boolean, because zero is a valid slot.
  position?: number;
  defaultVal?: unknown;
  description?: string;
  flags?: string[];

  // function-like
  parameters?: RunType[];
  return?: RunType;

  // single-typed containers (array/promise/tupleMember/property/parameter)
  child?: RunType;
  index?: RunType;

  // multi-typed containers (objectLiteral/class/tuple/union/intersection/enum)
  children?: RunType[];

  // union only — children reordered so superset shapes precede their
  // subset equivalents (prevents unreachable union members at validate
  // time). Same ref objects as `children`, just rearranged.
  safeUnionChildren?: RunType[];

  // union only — set by the serialize-time discriminator detection
  // pass. Parallel to `safeUnionChildren`: entry i is a ref to the
  // discriminator property within `safeUnionChildren[i]`. Consumer
  // reads entry.name for the property key and entry.child for the
  // expected type. Slots for non-object members (simple / any) are
  // null/undefined. Absent when neither detection pass finds a
  // usable discriminator. Lives on the union (not the property node)
  // so the relationship is correctly scoped — the same canonical
  // property node may be a discriminator in one parent union but not
  // in another.
  //
  // Wire-format equivalent of mion's FlattenedProp[] output
  // (mion-run-types: packages/run-types/src/nodes/collection/unionDiscriminator.ts).
  // Only the strictly-new field (the property ref) lives on the wire;
  // the other FlattenedProp fields are reconstructible. Consumers
  // call `flattenUnionDiscriminators` from @mionjs/ts-go-run-types
  // to materialise the full per-member struct in one pass.
  unionDiscriminators?: (RunType | null | undefined)[];

  // surviving object-literal types from an intersection-collapse of a
  // primitive with one or more brand objects (e.g. `string & {__brand}`).
  // Each entry is a ref to an objectLiteral RunType. Mirrors deepkit's
  // TypeAnnotations.decorators.
  decorators?: RunType[];

  // populated when a primitive is branded with a TypeFormat<Base, Name,
  // Params, ...> marker from `@mionjs/ts-go-type-formats`. Sibling of
  // mion's FormatAnnotation (packages/run-types/src/lib/formats.ts) —
  // the name + params pair that drives format-aware emit. The
  // structural id folds name + canonicalised params in, so two
  // distinct param sets produce two distinct cache entries while
  // equivalent param sets (regardless of object-literal key order)
  // collapse to one.
  formatAnnotation?: FormatAnnotation;

  // enum
  enumVal?: Record<string, unknown>;
  values?: unknown[];
  indexType?: RunType;

  // class
  extendsArguments?: RunType[];
  implements?: RunType[];
  arguments?: RunType[];
  classRef?: ClassRef;

  // objectLiteral (interface form) — direct parent interface types
  // this declaration extends. Each entry is a ref to the parent's
  // RunType. Properties inherited from these parents are ALSO
  // included in `children` (the TS checker merges them via
  // GetPropertiesOfType), so the runtime path stays simple while
  // codegen can walk the inheritance tree explicitly. Empty for
  // anonymous object literals and `type` aliases.
  extends?: RunType[];

  // runtime-only — wired by the cache emitter, never present in wire JSON.
  // `classType` is a live constructor reference (e.g. globalThis.Date for
  // KindClass builtins).
  classType?: unknown;
}

// Site records one transformer-injection point. `pos` is the byte offset of
// the closing `)` of the call expression — the patcher inserts at that
// offset. `paramIndex` is the 0-based slot the injected id occupies in the
// call's argument list. `argsCount` is the number of arguments the user
// already wrote; when less than `paramIndex` the patcher pads with
// `undefined` so the id lands in the right slot.
export interface Site {
  file: string;
  pos: number;
  id: string;
  paramIndex?: number;
  argsCount?: number;
}

// Replacement is a byte-range rewrite on a source file: replace
// [start, end) with text. Used by the pure-fn extractor to null out
// the factory argument of every `registerPureFnFactory(ns, fn,
// factory)` call so the canonical fn body lives only in the emitted
// pureFns cache module.
export interface Replacement {
  file: string;
  start: number;
  end: number;
  text: string;
}

// FormatAnnotation carries the (name, params) pair extracted from a
// TypeFormat<Base, Name, Params, ...> brand. Wire-mirror of the Go-side
// protocol.FormatAnnotation. Params is the JSON-serialisable literal
// payload — sorted/canonicalised before participating in the cache
// key so two ordering variants of the same params object share one ID.
export interface FormatAnnotation {
  name: string;
  params?: Record<string, unknown>;
}

// CacheKind enumerates the rendered cache-module bodies callers can opt
// into on a scanFiles request via Request.includeCacheSources. Mirrors
// the Go-side protocol.CacheKind. `'all'` is a forward-compatible
// shortcut: when present every other kind is treated as requested.
export type CacheKind =
  | 'runType'
  | 'isType'
  | 'typeErrors'
  | 'prepareForJson'
  | 'restoreFromJson'
  | 'stringifyJson'
  | 'prepareForJsonSafe'
  | 'prepareForJsonSafePreserve'
  | 'hasUnknownKeys'
  | 'stripUnknownKeys'
  | 'unknownKeyErrors'
  | 'unknownKeysToUndefined'
  | 'unknownKeysToUndefinedWire'
  | 'toBinary'
  | 'fromBinary'
  | 'format'
  | 'pureFns'
  | 'all';

export interface Request {
  op: 'scanFiles' | 'dump' | 'setSources' | 'reset' | 'resolveId' | 'tsCompile';
  // scanFiles only — the files to scan in this request. The response's
  // sites cover every listed file (each tagged with .file); when the
  // include* flags are set, runTypes / runTypeCacheSource are projected
  // over these files only (NOT the cache's session-wide contents — use
  // dump for that).
  files?: string[];
  // resolveId only — hash id of the RunType to look up in the cache.
  id?: string;
  // setSources only — { relpath: source-text }.
  sources?: Record<string, string>;
  // scanFiles only — when set, the response includes a runTypes slice
  // covering the request's files.
  includeRunTypes?: boolean;
  // scanFiles only — the rendered cache-module bodies the caller wants
  // populated in the response, scoped to the request's files. Per-kind
  // opt-in lets callers pay only for what they need; `'all'` is the
  // shortcut for every kind.
  includeCacheSources?: CacheKind[];
}

export interface Response {
  id?: string;
  // Acknowledgement for ops that don't return data (setSources / resetCache).
  ok?: true;
  added?: RunType[];
  // Per-cache "did this scan change anything?" signals consumed by the
  // Vite plugin's handleHotUpdate. `addedRunTypes` is true when this
  // scan interned new RunTypes; `addedIsType` when at least one of
  // those is supported by the IsType emitter; `addedPureFns` when
  // any pure-fn entry's bodyHash flipped or appeared.
  addedRunTypes?: boolean;
  addedIsType?: boolean;
  // Sibling of addedIsType — true when at least one newly-interned
  // RunType has a supported emitTypeErrors arm, so the typeErrors
  // cache module needs invalidating.
  addedTypeErrors?: boolean;
  // Sibling of addedIsType for the JSON serializer pair. Set when at
  // least one newly-interned RunType has a supported emit arm in the
  // matching emitter — the Vite plugin invalidates each cache module
  // independently based on its own flag.
  addedPrepareForJson?: boolean;
  addedRestoreFromJson?: boolean;
  addedStringifyJson?: boolean;
  addedPrepareForJsonSafe?: boolean;
  addedPrepareForJsonSafePreserve?: boolean;
  // Siblings of addedIsType for the unknown-keys family ported from
  // mion's emitHasUnknownKeys et al. Set when at least one newly-interned
  // RunType has a supported emit arm in the matching emitter.
  addedHasUnknownKeys?: boolean;
  addedStripUnknownKeys?: boolean;
  addedUnknownKeyErrors?: boolean;
  addedUnknownKeysToUndefined?: boolean;
  addedUnknownKeysToUndefinedWire?: boolean;
  // Siblings of addedIsType for the binary serializer pair. Set when at
  // least one newly-interned RunType has a supported emit arm in the
  // matching emitter.
  addedToBinary?: boolean;
  addedFromBinary?: boolean;
  // Sibling of addedIsType for the `format` transform family — true when
  // a newly-interned RunType carries a value-transforming format.
  addedFormat?: boolean;
  addedPureFns?: boolean;
  sites?: Site[];
  // Replacements is the byte-range rewrite list the Vite plugin
  // applies alongside Sites in `rewrite.ts`. The pure-fn extractor
  // emits one entry per accepted `registerPureFnFactory(ns, fn,
  // factory)` call: replace the factory argument with `null` so the
  // canonical fn body lives only in the emitted pureFns cache module
  // (no duplication in the user bundle).
  replacements?: Replacement[];
  runTypes?: RunType[];
  // Always populated by `dump`; populated by `scanFiles` when the request
  // opts into `'runType'` (or `'all'`) via includeCacheSources. The body
  // is a JS module exporting one `export const <RUNTYPES_VAR_PREFIX><hash>
  // = {…}` per cached RunType; consumers `import * as cache from
  // 'virtual:runtypes-cache'` and look entries up by
  // `cache[RUNTYPES_VAR_PREFIX + id]`.
  runTypeCacheSource?: string;
  // Sibling of `runTypeCacheSource` carrying the precompiled isType
  // validator factories. Body shape:
  //   export function get_isType_<hash>(utl){…}
  // Consumers import the factory and invoke it themselves with whatever
  // `utl` they want bound into the closure — the module never
  // pre-invokes a factory. Populated by `dump` and on `scanFiles` when
  // the caller opts into `'isType'` (or `'all'`).
  isTypeCacheSource?: string;
  // Sibling of `isTypeCacheSource` carrying the precompiled typeErrors
  // validator factories. Body shape:
  //   export function get_typeErrors_<hash>(utl){…}
  // Same consumer pattern as isTypeCacheSource — populated by `dump`
  // and on `scanFiles` when the caller opts into `'typeErrors'`
  // (or `'all'`).
  typeErrorsCacheSource?: string;
  // Siblings of `isTypeCacheSource` for the JSON serializer pair. Same
  // factory shape, same consumer pattern — populated by `dump` and on
  // `scanFiles` when the caller opts into the matching cache kind
  // (or `'all'`).
  prepareForJsonCacheSource?: string;
  restoreFromJsonCacheSource?: string;
  stringifyJsonCacheSource?: string;
  prepareForJsonSafeCacheSource?: string;
  prepareForJsonSafePreserveCacheSource?: string;
  // Siblings of `isTypeCacheSource` for the unknown-keys family —
  // bodies of the four cache modules emitted by the matching emitters.
  // Same factory shape, same consumer pattern — populated by `dump` and
  // on `scanFiles` when the caller opts into the matching cache kind
  // (or `'all'`).
  hasUnknownKeysCacheSource?: string;
  stripUnknownKeysCacheSource?: string;
  unknownKeyErrorsCacheSource?: string;
  unknownKeysToUndefinedCacheSource?: string;
  unknownKeysToUndefinedWireCacheSource?: string;
  // Siblings of isTypeCacheSource for the binary serializer pair —
  // bodies of the toBinary / fromBinary cache modules. Same factory
  // shape, same consumer pattern.
  toBinaryCacheSource?: string;
  fromBinaryCacheSource?: string;
  // Sibling of isTypeCacheSource for the `format` transform family
  // (createFormat<T>). Same factory shape, same consumer pattern.
  formatCacheSource?: string;
  // Sibling of `runTypeCacheSource` carrying the pure-fn cache the Go
  // binary extracted from every `registerPureFnFactory(<ns>, <fnName>,
  // <factory>)` call. Body is a sequence of `factory(key, bodyHash,
  // paramNames, code, pureFnDependencies, createPureFn)` calls — the
  // `createPureFn` argument is an inline function literal templated
  // from the same `code` string, so the cache module is the canonical
  // runtime home of every pure-fn body. Populated by `dump` and on
  // `scanFiles` when the caller opts into `'pureFns'` (or `'all'`).
  pureFnsCacheSource?: string;
  // Diagnostics carries every non-fatal diagnostic the Go binary emits —
  // pure-fn extractor (PFE9xxx), marker scanner (MKRxxx), RT compiler
  // (IT/TE/PJ/…/FB). The Family discriminator on each entry tells the
  // consumer which subsystem produced it. The Vite plugin re-emits each
  // via `this.warn(formatTscDiagnostic(d))` so VS Code's $tsc problem
  // matcher picks them up; the build never fails on these.
  diagnostics?: Diagnostic[];
  // tsCompile only — wall-time (ms) of the embedded tsgo's bind +
  // typecheck + emit pass on the current source overlay. Bench
  // orchestrators record this alongside scanFiles latency to show the
  // pure-TypeScript compile cost next to ts-go-run-types' own work.
  tsCompileMs?: number;
  error?: string;
}

// Severity classifies a Diagnostic's impact. Numeric on the wire to
// match the Go-side encoding; mirror the `as const` literal-union enum
// shape so consumers can `switch (d.severity)` against the named values.
export const Severity = {
  Error: 1,
  Warning: 2,
  Info: 3,
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

// Family classifies a Diagnostic by which subsystem produced it. Same
// numeric-on-the-wire scheme as Severity.
export const Family = {
  PureFn: 1,
  Marker: 2,
  RunType: 3,
} as const;
export type Family = (typeof Family)[keyof typeof Family];

// DiagnosticSite is a 1-based source location. `endLine` / `endCol` are
// optional — runtype-family diagnostics (where the site is the marker
// call rather than a type declaration) leave them zero.
export interface DiagnosticSite {
  filePath: string;
  startLine: number;
  startCol: number;
  endLine?: number;
  endCol?: number;
}

export interface DiagnosticRelated extends DiagnosticSite {
  message: string;
}

// Diagnostic mirrors the Go-side diag.Diagnostic. The Family
// discriminator tells the consumer which subsystem produced it (purefn
// extractor, marker scanner, runtype RT compiler); the Code is the
// stable identifier (PFE9004, CTA001, PFN001, IT010, SJ001, …) and Severity
// classifies impact.
//
// The user-facing message is NOT carried on the wire. Per-code message
// templates live in `packages/ts-go-run-types/src/runtypes/diagnosticCatalog.ts`
// (alongside the runtime alwaysThrow catalog) and resolve at format time
// against `args` — typically 0–2 positional substitution values (a
// property name, a kind label, etc.). The Vite plugin renders the final
// tsc-style line by looking up Code+Args in the catalog.
export interface Diagnostic {
  code: string;
  family: Family;
  severity: Severity;
  args?: string[];
  site: DiagnosticSite;
  related?: DiagnosticRelated[];
}

export interface Dump {
  runTypes: RunType[];
  sites: Site[];
}
