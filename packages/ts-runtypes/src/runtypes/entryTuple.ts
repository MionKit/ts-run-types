// Entry-tuple consumer — the runtime half of the per-entry virtual modules.
//
// ⚠️  SYNC BOUNDARY — MUST STAY ALIGNED WITH THE GO EMITTER
// ----------------------------------------------------------------------------
// The Go binary emits one ES module per cache entry (`virtual:rt/<key>.js`),
// exporting a positional tuple under the entry's binding name (`__rt_<key>`,
// identifier-escaped — the same name every importer binds). Tuples are typed
// here as RECORD interfaces (`RunTypeBundleRecord` / `FnTypeRecord` /
// `PureFnRecord` / …) whose payload fields are Pick'd from the canonical
// cache-entry types in `types.ts` (`RunType`, `CompiledTypeFn`,
// `CompiledPureFunction`), so the wire shapes can never drift from the
// registry shapes. The positional tuple types are DERIVED from the records
// through the `*_TUPLE_KEYS` arrays — the single source of slot order,
// mirrored by the emitters in internal/compiler/virtualmodules and
// internal/cachegen/{runtype,typefunctions,purefunctions}. Any layout change
// MUST touch the matching keys array here and the Go emitter together.
//
// Every tuple shares the same fixed head: slot 0 discriminates the layout
// (the numeric kinds below, or the QUOTED family tag string for type-fn
// entries), slot 1 is a lazy thunk returning the entry's DIRECT dependency
// tuples (leaves-first by level; never self — dep-less entries carry
// undefined instead of a thunk), slot 2 is the runtype footer
// initializer (or undefined), slot 3 is always the cache key. The remaining
// slots mirror the pre-migration `init(…)` / `factory(…)` call interiors
// byte-for-byte; the Go side trims trailing-undefined slots, which the
// derived tuple types model as optional tails.
//
// Runtype nodes are special-cased for density: every reflection-demanded
// node rides as one headless ROW of THE single data-bundle module
// (`virtual:rt/runtypes.js`, kind 4 — rows in slot 4, a parallel `rels` array
// in slot 5 wiring each node's ref slots by ROW INDEX, content-hash key in
// slot 3, and a residual ini in slot 2 for the rare expression-specials only),
// and each reflection root gets a tiny facade module
// (`virtual:rt/<rootId>.js`, kind 5) that imports the bundle and carries the
// root id in its key slot. Each node exists exactly once app-wide; facades
// keep the rewrite's binding-only injection working unchanged.
//
// `initFromTuple` registers a tuple's whole closure in two phases: walk the
// deps() thunks recursively (post-order with a processed-keys guard, so
// children register before parents and cycles terminate), then wire each
// newly-registered bundle's `rels` by index and run any residual `ini`. Ref
// slots therefore always resolve against registered entries, and fn-factory
// materialisation stays lazy (materializeRTFn on first getRT), so cycles keep
// working exactly as before.

import {getRTUtils} from './rtUtils.ts';
import type {RTUtils} from './rtUtils.ts';
import type {AnyFn, CompiledFnArgs, CompiledFnData, CompiledPureFunction, CompiledTypeFn, RunType} from './types.ts';
import {CircularReferenceError, isRejectCircularRefsEnabled, typeGraphIsCircular} from './circular.ts';
import type {FindCycleFn} from './circular-pure-fns.ts';

// Numeric slot-0 kinds (Go: constants.TupleKind*). Type-fn entries carry their
// family tag string instead. Runtype nodes normally ride as headless ROWS of
// the single data bundle (kind 4), aliased per reflection root by facade
// modules (kind 5); kind 0 is the standalone per-node module form emitted
// only under `moduleMode: 'allModules'`.
const KIND_RUN_TYPE = 0;
const KIND_PURE_FN = 2;
const KIND_MISSING = 3;
const KIND_RUN_TYPE_BUNDLE = 4;
const KIND_RUN_TYPE_FACADE = 5;

/** Fixed character length of every fnHash (Go: operations.FnHashLen). Used to
 *  split `<fnHash>_<typeId>` keys when a value-first schema overrides the
 *  type id at a createX call site. **/
export const FN_HASH_LEN = 3;

/** Lazy dependency thunk — slot 1 of every tuple. Returns the entry's DIRECT
 *  dependency tuples (never itself — every consumer already holds the tuple);
 *  lazy so module-level import cycles never hit TDZ. Dep-less entries carry
 *  undefined in the slot instead of a thunk. The transitive closure is
 *  reached by walking the dep tuples' own thunks (see initFromTuple). **/
export type EntryDepsThunk = () => readonly EntryTuple[];

/** Runtype footer initializer — slot 2 of runtype tuples. Patches the
 *  entry's ref slots through the registry once the whole closure is
 *  registered. **/
export type RunTypeIni = (rtu: RTUtils) => void;

// =============================================================================
// Entry records — named views of each tuple layout.
// =============================================================================

// The scalar identification fields a runtype bundle ROW carries, in WIRE
// ORDER. Pick'd from the canonical RunType so the record reuses its field
// types; the ref-bearing slots (child / children / …) are NOT here — they
// start undefined on the registered entry and are patched by the bundle's
// combined ini.
const RUN_TYPE_FIELD_KEYS = [
  'id',
  'kind',
  'subKind',
  'typeName',
  'name',
  'literal',
  'optional',
  'readonly',
  'isAbstract',
  'isStatic',
  'visibility',
  'isSafeName',
  'position',
  'isCircular',
  'flags',
  'description',
  'defaultVal',
  'enumVal',
  'values',
  'notSupported',
  'nonEnumerable',
] as const;

/** Named view of one runtype ROW inside the data bundle: RunType's scalar
 *  identification fields in wire order (same names, same types — see
 *  RUN_TYPE_FIELD_KEYS). Rows carry no tuple head — the bundle module hosts
 *  the shared deps thunk and the single combined ini. **/
export type RunTypeRowRecord = Pick<RunType, (typeof RUN_TYPE_FIELD_KEYS)[number]>;

// The ref-bearing RunType fields, in the wire order of a bundle `rels` row.
// ⚠️ MUST match Go's runtype.renderRelations (internal/cachegen/runtype/module.go).
// child/children lead — the most common fields — so the typical relRow is one
// or two slots long. Each node's ref slots are patched from these by index at
// registration (wireBundleRelations); the fields NOT here (classType, literal,
// formatAnnotation) are JS expressions handled by the residual bundle ini.
const RUN_TYPE_REL_KEYS = [
  'child',
  'children',
  'index',
  'return',
  'indexType',
  'parameters',
  'safeUnionChildren',
  'unionDiscriminators',
  'typeMeta',
  'typeArguments',
  'arguments',
  'extendsArguments',
  'implements',
  'extends',
] as const;

// Parallel to RUN_TYPE_REL_KEYS: true = the slot holds an ARRAY of relation
// targets, false = a single target. Single-ref slots (child/index/return/
// indexType) lead the array-ref ones per RUN_TYPE_REL_KEYS.
const RUN_TYPE_REL_IS_ARRAY = [
  false, // child
  true, // children
  false, // index
  false, // return
  false, // indexType
  true, // parameters
  true, // safeUnionChildren
  true, // unionDiscriminators
  true, // typeMeta
  true, // typeArguments
  true, // arguments
  true, // extendsArguments
  true, // implements
  true, // extends
] as const;

/** One relation target inside a bundle `rels` row: a row INDEX (number), a
 *  foreign id (string — a ref whose target is not a bundle row, resolved via
 *  useRunType), or an inline non-ref RunType (object). **/
type RunTypeRel = number | string | object;

/** A bundle `rels` row — parallel by index to `rows`. Each slot is a single
 *  relation (single-ref field), an array of relations (array field), or
 *  undefined (a hole: that slot carries no relation). See RUN_TYPE_REL_KEYS /
 *  RUN_TYPE_REL_IS_ARRAY; a whole row is undefined for a leaf node. **/
export type RunTypeRelRow = readonly (RunTypeRel | readonly RunTypeRel[] | undefined)[];

/** Named view of a standalone per-node runtype module (kind 0 — emitted only
 *  under `moduleMode: 'allModules'`): the shared head plus the same scalar
 *  identification fields a bundle row carries; the per-entry ini patches this
 *  one node's ref slots. **/
export interface RunTypeRecord extends RunTypeRowRecord {
  entryKind: typeof KIND_RUN_TYPE;
  deps: EntryDepsThunk | undefined;
  ini: RunTypeIni | undefined;
}

/** Named view of THE runtype data-bundle module (`virtual:rt/runtypes.js`):
 *  every reflection-demanded node as one headless row (`rows`), a parallel
 *  `rels` array wiring each node's ref-bearing slots by ROW INDEX (see
 *  wireBundleRelations), and a residual `ini` carrying only the rare
 *  expression-specials (classType / bigint-symbol literal / formatAnnotation).
 *  `key` is a CONTENT hash over the row ids — it changes exactly when the
 *  bundle evolves, so the processed-keys guard re-registers new rows after an
 *  HMR reload of the (mutable) bundle module. **/
export interface RunTypeBundleRecord {
  entryKind: typeof KIND_RUN_TYPE_BUNDLE;
  deps: EntryDepsThunk | undefined;
  ini: RunTypeIni | undefined;
  key: string;
  rows: readonly RunTypeRow[];
  rels: readonly RunTypeRelRow[];
}

/** Named view of a per-reflection-root facade module
 *  (`virtual:rt/<rootId>.js`): registers nothing — it carries the root id in
 *  the key slot and the bundle in its deps thunk, so the rewrite's
 *  binding-only injection keeps deriving ids from the tuple. **/
export interface RunTypeFacadeRecord {
  entryKind: typeof KIND_RUN_TYPE_FACADE;
  deps: EntryDepsThunk | undefined;
  ini: undefined;
  key: string;
}

/** Named view of a type-fn entry tuple: the shared head (slot 0 is the family
 *  tag string) plus the CompiledTypeFn fields the wire carries. `code` is
 *  widened to `| undefined` — noop and alwaysThrow rows ship without one (the
 *  register path resolves the family identity / throwing factory instead). **/
export interface FnTypeRecord extends Pick<
  CompiledTypeFn,
  'rtFnHash' | 'typeName' | 'isNoop' | 'rtDependencies' | 'pureFnDependencies' | 'createRTFn' | 'alwaysThrowMessage'
> {
  familyTag: string;
  deps: EntryDepsThunk | undefined;
  ini: undefined;
  code: CompiledFnData['code'] | undefined;
  // `tb` (binary-encoder) entries only: the compile-time cold-start buffer-size
  // estimate (bytes). Trailing slot; absent on every other family. Read by
  // createBinaryEncoder's `dynamic` strategy to seed the buffer (see
  // binarySizeEstimateFromTuple).
  binarySizeEstimate?: number;
}

/** Named view of a pure-fn entry tuple: the shared head plus the
 *  CompiledPureFunction fields the wire carries. `key` is the composite
 *  `<ns>::<fn>` cache key (split into namespace/fnName at register time). **/
export interface PureFnRecord extends Pick<
  CompiledPureFunction,
  'bodyHash' | 'paramNames' | 'code' | 'pureFnDependencies' | 'createPureFn'
> {
  entryKind: typeof KIND_PURE_FN;
  deps: EntryDepsThunk | undefined;
  ini: undefined;
  key: string;
}

/** Named view of a KindMissing stub — emitted for demanded entries the build
 *  dropped (unsupported kinds / dangling deps); registers nothing, consumers
 *  degrade to their family identity fallback. **/
export interface MissingRecord {
  entryKind: typeof KIND_MISSING;
  deps: undefined;
  ini: undefined;
  key: string;
}

// =============================================================================
// Tuple types — derived from the records via the ordered key arrays.
// =============================================================================

// TupleFrom maps an ordered key list onto its record's field types, producing
// the positional tuple type. The SAME arrays drive the runtime tuple→record
// conversion (tupleToRecord), so slot order has exactly one source of truth.
type TupleFrom<R, K extends readonly (keyof R)[]> = {[I in keyof K]: R[K[I]]};

const ENTRY_HEAD_KEYS = ['entryKind', 'deps', 'ini'] as const;

// Go's emitters render every default-valued slot as a JS array HOLE (empty
// between commas) and drop the trailing run of holes: runtype rows always
// carry at least (id, kind); fn tuples at least (rtFnHash, typeName, code) —
// a production entry with no deps ends at `code` (isNoop false, dep lists,
// createRTFn all re-derived at registration), while the noop short form still
// ends (…, code=hole, isNoop=true). When a LATER slot is non-default (the live
// factory in `functions`/`both` mode, the alwaysThrowMessage, or the tb size
// estimate) the interior defaults stay as holes in place rather than being
// dropped — index-based access reads them back as undefined either way. Pure-fn
// tuples trim ONE trailing slot — `createPureFn` is dropped in `code` mode (the
// runtime rebuilds it from `code` + `paramNames`), and `code` holes out in place
// in `functions` mode (createPureFn follows); bundle, facade and missing tuples
// are never trimmed. The REQUIRED/TRIMMED splits below mirror that, so the
// derived tuple types accept the short forms (every trimmable slot is optional,
// and `code` is widened to `| undefined`).
type RunTypeRowRequiredKeys = readonly ['id', 'kind'];
type RunTypeRowTrimmedKeys = typeof RUN_TYPE_FIELD_KEYS extends readonly [unknown, unknown, ...infer Rest] ? Rest : never;

export const RUN_TYPE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, ...RUN_TYPE_FIELD_KEYS] as const;
export const RUN_TYPE_BUNDLE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key', 'rows', 'rels'] as const;
export const RUN_TYPE_FACADE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key'] as const;

const FN_TYPE_REQUIRED_KEYS = ['familyTag', 'deps', 'ini', 'rtFnHash', 'typeName', 'code'] as const;
const FN_TYPE_TRIMMED_KEYS = [
  'isNoop',
  'rtDependencies',
  'pureFnDependencies',
  'createRTFn',
  'alwaysThrowMessage',
  'binarySizeEstimate',
] as const;
export const FN_TYPE_TUPLE_KEYS = [...FN_TYPE_REQUIRED_KEYS, ...FN_TYPE_TRIMMED_KEYS] as const;

/** Slot index of the `tb` cold-start estimate within an fn-type tuple (11).
 *  Derived from the keys array so it tracks any layout edit. **/
const FN_TYPE_ESTIMATE_SLOT = FN_TYPE_TUPLE_KEYS.indexOf('binarySizeEstimate');

const PURE_FN_REQUIRED_KEYS = [...ENTRY_HEAD_KEYS, 'key', 'bodyHash', 'paramNames', 'code', 'pureFnDependencies'] as const;
// createPureFn is the sole trimmable tail: dropped in `code` mode (rebuilt at
// runtime from code + paramNames), present in `functions`/`both`.
const PURE_FN_TRIMMED_KEYS = ['createPureFn'] as const;
export const PURE_FN_TUPLE_KEYS = [...PURE_FN_REQUIRED_KEYS, ...PURE_FN_TRIMMED_KEYS] as const;

const MISSING_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key'] as const;

/** Positional row of the runtype data bundle — derived from RunTypeRowRecord
 *  (headless: id at slot 0, kind at slot 1, trailing-undefined slots trimmed). **/
export type RunTypeRow = readonly [
  ...TupleFrom<RunTypeRowRecord, RunTypeRowRequiredKeys>,
  ...Partial<TupleFrom<RunTypeRowRecord, RunTypeRowTrimmedKeys>>,
];

/** Positional tuple of a standalone per-node runtype module (allModules
 *  mode) — the head plus the row fields, trailing-undefined slots trimmed. **/
export type RunTypeTuple = readonly [
  ...TupleFrom<RunTypeRecord, readonly [...typeof ENTRY_HEAD_KEYS, ...RunTypeRowRequiredKeys]>,
  ...Partial<TupleFrom<RunTypeRecord, RunTypeRowTrimmedKeys>>,
];

/** Positional tuple of the runtype data-bundle module — derived from
 *  RunTypeBundleRecord. **/
export type RunTypeBundleTuple = readonly [...TupleFrom<RunTypeBundleRecord, typeof RUN_TYPE_BUNDLE_TUPLE_KEYS>];

/** Positional tuple of a per-root facade module — derived from
 *  RunTypeFacadeRecord. **/
export type RunTypeFacadeTuple = readonly [...TupleFrom<RunTypeFacadeRecord, typeof RUN_TYPE_FACADE_TUPLE_KEYS>];

/** Positional tuple of a type-fn entry module — derived from FnTypeRecord. **/
export type FnTypeTuple = readonly [
  ...TupleFrom<FnTypeRecord, typeof FN_TYPE_REQUIRED_KEYS>,
  ...Partial<TupleFrom<FnTypeRecord, typeof FN_TYPE_TRIMMED_KEYS>>,
];

/** Positional tuple of a pure-fn entry module — derived from PureFnRecord. The
 *  trailing `createPureFn` is optional (dropped in `code` mode), and `code` is
 *  `| undefined` (holed out in `functions` mode). **/
export type PureFnTuple = readonly [
  ...TupleFrom<PureFnRecord, typeof PURE_FN_REQUIRED_KEYS>,
  ...Partial<TupleFrom<PureFnRecord, typeof PURE_FN_TRIMMED_KEYS>>,
];

/** Positional tuple of a KindMissing stub module — derived from MissingRecord. **/
export type MissingTuple = readonly [...TupleFrom<MissingRecord, typeof MISSING_TUPLE_KEYS>];

/** One emitted entry-module tuple — the union every consumer handles. **/
export type EntryTuple = RunTypeTuple | RunTypeBundleTuple | RunTypeFacadeTuple | FnTypeTuple | PureFnTuple | MissingTuple;

// Fixed-head slot indexes, pinned at compile time against every keys array so
// a layout edit that moves a head slot fails the build here, not at runtime.
const SLOT_KIND = 0;
const SLOT_DEPS = 1;
const SLOT_KEY = 3;
const SLOT_ROWS = 4;
const SLOT_RELS = 5;
const _pinBundleRels: 'rels' = RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_RELS];
void _pinBundleRels;
const _pinBundleHead: ['entryKind', 'deps', 'ini', 'key', 'rows'] = [
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_KIND],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_DEPS],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[2],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_KEY],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_ROWS],
];
const _pinFacadeHead: ['entryKind', 'deps', 'ini', 'key'] = [
  RUN_TYPE_FACADE_TUPLE_KEYS[SLOT_KIND],
  RUN_TYPE_FACADE_TUPLE_KEYS[SLOT_DEPS],
  RUN_TYPE_FACADE_TUPLE_KEYS[2],
  RUN_TYPE_FACADE_TUPLE_KEYS[SLOT_KEY],
];
const _pinFnTypeHead: ['familyTag', 'deps', 'ini', 'rtFnHash'] = [
  FN_TYPE_TUPLE_KEYS[SLOT_KIND],
  FN_TYPE_TUPLE_KEYS[SLOT_DEPS],
  FN_TYPE_TUPLE_KEYS[2],
  FN_TYPE_TUPLE_KEYS[SLOT_KEY],
];
const _pinPureFnHead: ['entryKind', 'deps', 'ini', 'key'] = [
  PURE_FN_TUPLE_KEYS[SLOT_KIND],
  PURE_FN_TUPLE_KEYS[SLOT_DEPS],
  PURE_FN_TUPLE_KEYS[2],
  PURE_FN_TUPLE_KEYS[SLOT_KEY],
];
const _pinMissingHead: ['entryKind', 'deps', 'ini', 'key'] = [
  MISSING_TUPLE_KEYS[SLOT_KIND],
  MISSING_TUPLE_KEYS[SLOT_DEPS],
  MISSING_TUPLE_KEYS[2],
  MISSING_TUPLE_KEYS[SLOT_KEY],
];
void _pinBundleHead;
void _pinFacadeHead;
void _pinFnTypeHead;
void _pinPureFnHead;
void _pinMissingHead;

// tupleToRecord zips an ordered keys array over a tuple's slots — the runtime
// counterpart of TupleFrom. Trimmed (absent) slots land as explicit undefined
// values, matching what the pre-migration skeleton consumers received.
function tupleToRecord<R extends object>(keys: readonly (keyof R)[], tuple: readonly unknown[]): R {
  const record = {} as Record<keyof R, unknown>;
  for (let index = 0; index < keys.length; index++) {
    record[keys[index]] = tuple[index];
  }
  return record as R;
}

/** Runtime guard for an injected entry tuple (vs a value-first schema, a
 *  legacy string id, or undefined). The deps slot is a thunk or undefined
 *  (dep-less entries carry no thunk), so the key slot's string check is the
 *  discriminating signal alongside the array shape. **/
export function isEntryTuple(value: unknown): value is EntryTuple {
  if (isMissingTuple(value)) return true;
  if (!Array.isArray(value) || value.length <= SLOT_KEY) return false;
  const deps = value[SLOT_DEPS];
  return (typeof deps === 'function' || deps === undefined) && typeof value[SLOT_KEY] === 'string';
}

/** The cache key an entry tuple registers under (slot 3 — `id` for runtype
 *  tuples, `rtFnHash` for fn tuples, `key` for pure-fn / missing tuples). **/
export function entryTupleKey(tuple: EntryTuple): string {
  return tuple[SLOT_KEY] as string;
}

/** The compile-time cold-start size estimate (bytes) a `tb` (binary-encoder)
 *  entry tuple carries at its trailing slot, or undefined when absent — every
 *  non-`tb` family, or a build without the estimate. createBinaryEncoder's
 *  `dynamic` strategy uses it to seed the buffer so a cold encode is sized to
 *  the type instead of the flat `defaultBufferSize` fallback. **/
export function binarySizeEstimateFromTuple(injected: unknown): number | undefined {
  if (!isEntryTuple(injected)) return undefined;
  const slot = (injected as readonly unknown[])[FN_TYPE_ESTIMATE_SLOT];
  return typeof slot === 'number' ? slot : undefined;
}

/** True for the KindMissing stub the Go side emits for demanded entries that
 *  were dropped (unsupported kinds / dangling deps). Stubs register nothing;
 *  consumers degrade to their family identity fallback — the same semantics a
 *  cache miss had pre-migration. **/
export function isMissingTuple(value: unknown): boolean {
  return Array.isArray(value) && value[SLOT_KIND] === KIND_MISSING;
}

// =============================================================================
// Per-family entry metadata — what each cache skeleton's `init()` hardcoded.
// =============================================================================

interface FamilyMeta {
  fnID: string;
  args: () => CompiledFnArgs;
  defaultParamValues: () => CompiledFnArgs;
  noop: AnyFn;
}

const noopTrue = () => true;
const noopFalse = () => false;
const noopIdentity = (v: unknown) => v;
const noopErrors = (_v: unknown, _pth: unknown, er: unknown) => er || [];
const noopStringify = (v: unknown) => JSON.stringify(v);
const noopParse = (s: unknown) => JSON.parse(s as string);
const noopToBinary = (_v: unknown, Ser: unknown) => Ser;
const noopFromBinary = (ret: unknown) => ret;

const valueArgs = () => ({vλl: 'v'}) as CompiledFnArgs;
const valueDefaults = () => ({vλl: undefined}) as unknown as CompiledFnArgs;
const errorArgs = () => ({vλl: 'v', pλth: 'pth', εrr: 'er'}) as CompiledFnArgs;
const errorDefaults = () => ({vλl: undefined, pλth: [], εrr: []}) as unknown as CompiledFnArgs;

const valueShaped = (fnID: string, noop: AnyFn): FamilyMeta => ({fnID, args: valueArgs, defaultParamValues: valueDefaults, noop});
const errorShaped = (fnID: string): FamilyMeta => ({fnID, args: errorArgs, defaultParamValues: errorDefaults, noop: noopErrors});

// Keyed by the tuple's slot-0 family tag. The seven JSON-composite tags borrow
// the metadata of the family whose module hosted them pre-migration (encoder
// strategies rode prepareForJson, decoder strategies restoreFromJson) — Go:
// constants.JsonCompositeHostTags — EXCEPT the noop fn: a composite's identity
// is native JSON, not the host primitive's value identity. A noop composite
// tuple (every primitive binding elided AND no wrapRoot envelope — see
// collectJsonCompositeEntry) must register the fn its full body would have
// been: JSON.stringify for the encoder tags, JSON.parse for the decoder tags.
// noopIdentity here would silently return the raw value / unparsed string.
// The compact strategy also adds its own two type-walking primitive families
// (cj / cjr) which carry value-shaped identity metadata like pj / rj.
const familyMeta: Record<string, FamilyMeta> = {
  val: valueShaped('val', noopTrue),
  verr: errorShaped('verr'),
  pj: valueShaped('pj', noopIdentity),
  rj: valueShaped('rj', noopIdentity),
  sj: valueShaped('sj', noopStringify),
  pjs: valueShaped('pjs', noopIdentity),
  // compact strategy walking primitives: cj builds the positional array, cjr
  // rebuilds the keyed object — both value-shaped identity like pj / rj.
  cj: valueShaped('cj', noopIdentity),
  cjr: valueShaped('cjr', noopIdentity),
  huk: {
    fnID: 'huk',
    args: () => ({vλl: 'v', θpts: 'opts'}) as CompiledFnArgs,
    defaultParamValues: () => ({vλl: undefined, θpts: {}}) as unknown as CompiledFnArgs,
    noop: noopFalse,
  },
  ces: valueShaped('ces', noopIdentity),
  uke: errorShaped('uke'),
  ukuw: valueShaped('ukuw', noopIdentity),
  tb: {
    fnID: 'tb',
    args: () => ({vλl: 'v', sεr: 'Ser'}) as CompiledFnArgs,
    defaultParamValues: () => ({vλl: undefined, sεr: undefined}) as unknown as CompiledFnArgs,
    noop: noopToBinary,
  },
  fb: {
    fnID: 'fb',
    args: () => ({vλl: 'ret', dεs: 'Des'}) as CompiledFnArgs,
    defaultParamValues: () => ({vλl: undefined, dεs: undefined}) as unknown as CompiledFnArgs,
    noop: noopFromBinary,
  },
  fmt: valueShaped('fmt', noopIdentity),
  // JSON composites — encoder tags host on pj metadata, decoder tags on rj,
  // but their noop is NATIVE JSON (see the comment above): an all-elided
  // encoder body is `return JSON.stringify(v)`, an all-elided decoder body is
  // `return JSON.parse(s)`.
  jeCL: valueShaped('pj', noopStringify),
  jeMU: valueShaped('pj', noopStringify),
  jeDI: valueShaped('pj', noopStringify),
  jeCO: valueShaped('pj', noopStringify),
  jdST: valueShaped('rj', noopParse),
  jdPR: valueShaped('rj', noopParse),
  jdCO: valueShaped('rj', noopParse),
};

// =============================================================================
// Tuple registration
// =============================================================================

// Keys whose subtree already registered — prunes the recursive walk both
// within a call (cycle guard) and across calls (overlapping closures).
const processedKeys = new Set<string>();

/** Registers `root`'s full dependency closure into rtUtils (children first,
 *  via the recursive deps() walk), then runs each newly-registered runtype
 *  tuple's footer initializer. Idempotent per key; safe across overlapping
 *  closures (processed subtrees are skipped without re-walking). **/
export function initFromTuple(root: EntryTuple): void {
  if (isMissingTuple(root)) return;
  if (!isEntryTuple(root)) return;
  const utils = getRTUtils();
  const fresh: EntryTuple[] = [];
  collectClosure(root, utils, fresh);
  // Phase 2: wire each freshly-registered entry's ref slots — every referenced
  // entry now exists, so index/`c(id)` lookups resolve, including cycles. Data
  // bundles patch their nodes from the parallel `rels` array (by row index);
  // then any residual ini (the rare expression-specials, or a per-node
  // allModules footer) runs its `c(id)` assignments.
  for (const tuple of fresh) {
    if (tuple[SLOT_KIND] === KIND_RUN_TYPE_BUNDLE) wireBundleRelations(utils, tuple as RunTypeBundleTuple);
    const ini = tuple[2] as RunTypeIni | undefined;
    if (typeof ini === 'function') ini(utils);
  }
}

// wireBundleRelations patches every bundle node's ref-bearing slots from the
// parallel `rels` array (slot 5). Runs in phase 2 — after registerRunTypeBundle
// added every row — so a relation target always resolves against a registered
// entry, cycles included (index refs have no TDZ, unlike direct const refs).
// Each relation is a row INDEX (number → the sibling RunType), a foreign id
// (string → a registry lookup, matching the old `c(id)` miss behavior), or an
// inline non-ref RunType (object → used verbatim). rels shorter than rows means
// the tail rows are leaves with no relations.
function wireBundleRelations(utils: RTUtils, tuple: RunTypeBundleTuple): void {
  const rows = (tuple[SLOT_ROWS] ?? []) as readonly RunTypeRow[];
  const rels = (tuple[SLOT_RELS] ?? []) as readonly (RunTypeRelRow | undefined)[];
  if (rels.length === 0) return;
  const byIndex = rows.map((row) => utils.getRunType(row[0] as string));
  const resolve = (rel: unknown): unknown =>
    typeof rel === 'number' ? byIndex[rel] : typeof rel === 'string' ? utils.getRunType(rel) : rel;
  for (let i = 0; i < rels.length; i++) {
    const relRow = rels[i];
    if (!relRow) continue; // leaf row: no relations
    const runType = byIndex[i];
    if (!runType) continue;
    const target = runType as unknown as Record<string, unknown>;
    for (let slot = 0; slot < RUN_TYPE_REL_KEYS.length; slot++) {
      const value = relRow[slot];
      if (value === undefined) continue;
      target[RUN_TYPE_REL_KEYS[slot]] = RUN_TYPE_REL_IS_ARRAY[slot] ? (value as readonly unknown[]).map(resolve) : resolve(value);
    }
  }
}

// collectClosure walks a tuple's deps() thunks post-order: deps register
// before their dependents, the processed-keys guard terminates cycles (and
// skips subtrees an earlier root already registered), and every newly
// registered tuple lands in `fresh` for the caller's phase-2 ini pass.
// Dep-less entries carry undefined in the slot and skip straight to
// registration.
function collectClosure(tuple: unknown, utils: RTUtils, fresh: EntryTuple[]): void {
  if (!isEntryTuple(tuple) || isMissingTuple(tuple)) return;
  const key = entryTupleKey(tuple);
  if (processedKeys.has(key)) return;
  processedKeys.add(key);
  const deps = tuple[SLOT_DEPS] as EntryDepsThunk | undefined;
  if (deps) for (const dep of deps()) collectClosure(dep, utils, fresh);
  if (registerTuple(utils, tuple)) fresh.push(tuple);
}

/** Registers a single tuple in the cache matching its kind. Returns true when
 *  at least one entry was newly added (drives the phase-2 ini pass). **/
function registerTuple(utils: RTUtils, tuple: EntryTuple): boolean {
  const slot0 = tuple[SLOT_KIND];
  if (typeof slot0 === 'string') return registerTypeFnTuple(utils, tuple as FnTypeTuple);
  if (slot0 === KIND_RUN_TYPE_BUNDLE) return registerRunTypeBundle(utils, tuple as RunTypeBundleTuple);
  if (slot0 === KIND_RUN_TYPE) return registerRunTypeTuple(utils, tuple as RunTypeTuple);
  if (slot0 === KIND_PURE_FN) return registerPureFnTuple(utils, tuple as PureFnTuple);
  // A facade only carries its root id — the data arrived through its bundle
  // dep. Missing stubs and unknown future kinds register nothing either.
  if (slot0 === KIND_RUN_TYPE_FACADE) return false;
  return false;
}

// runTypeEntryFromRecord builds the registered RunType from its wire-carried
// identification fields: every ref-bearing slot starts undefined and is
// patched by the matching ini (the bundle's combined footer, or the per-node
// module's own ini in allModules mode).
function runTypeEntryFromRecord(record: RunTypeRowRecord): RunType {
  return {
    ...record,
    child: undefined,
    index: undefined,
    return: undefined,
    indexType: undefined,
    parameters: undefined,
    children: undefined,
    safeUnionChildren: undefined,
    unionDiscriminators: undefined,
    typeMeta: undefined,
    typeArguments: undefined,
    arguments: undefined,
    extendsArguments: undefined,
    implements: undefined,
    extends: undefined,
    classType: undefined,
  };
}

// registerRunTypeTuple registers one standalone per-node runtype module
// (kind 0 — allModules mode): the record's identification fields ride the
// tuple after the head; the node's ini patches its ref slots in phase 2.
// Re-registration is skipped so footer-patched entries are never reset.
function registerRunTypeTuple(utils: RTUtils, tuple: RunTypeTuple): boolean {
  const record = tupleToRecord<RunTypeRecord>(RUN_TYPE_TUPLE_KEYS, tuple);
  if (utils.hasRunType(record.id)) return false;
  utils.addRunType(record.id, runTypeEntryFromRecord(record));
  return true;
}

// registerRunTypeBundle registers every headless row of the data bundle —
// the RunTypes the runTypesCache skeleton's `rt(…)` factory used to construct
// one call at a time: identification fields zipped from wire order plus every
// ref slot pre-set to undefined, patched later by the bundle's single
// combined ini. Rows an earlier bundle generation already registered are
// skipped (footer-patched entries are never reset while in use); the combined
// ini re-runs over them anyway, which is safe — footer assignments are
// deterministic constants.
function registerRunTypeBundle(utils: RTUtils, tuple: RunTypeBundleTuple): boolean {
  const rows = (tuple[SLOT_ROWS] ?? []) as readonly RunTypeRow[];
  let added = false;
  for (const row of rows) {
    const record = tupleToRecord<RunTypeRowRecord>(RUN_TYPE_FIELD_KEYS, row);
    if (utils.hasRunType(record.id)) continue;
    utils.addRunType(record.id, runTypeEntryFromRecord(record));
    added = true;
  }
  return added;
}

// registerTypeFnTuple builds the CompiledTypeFn the per-family cache
// skeletons' `init(…)` consumers used to construct: the record's wire fields
// plus the family metadata (fnID / args / defaultParamValues / noop identity)
// keyed by the tuple's family tag.
function registerTypeFnTuple(utils: RTUtils, tuple: FnTypeTuple): boolean {
  const record = tupleToRecord<FnTypeRecord>(FN_TYPE_TUPLE_KEYS, tuple);
  if (utils.hasRTFn(record.rtFnHash)) return false;
  const meta = familyMeta[record.familyTag];
  if (!meta) return false; // unknown future family — leave to the identity fallback
  const isNoop = record.isNoop === true;
  const entry: CompiledTypeFn = {
    rtFnHash: record.rtFnHash,
    fnID: meta.fnID,
    familyTag: record.familyTag,
    typeName: record.typeName,
    args: meta.args(),
    defaultParamValues: meta.defaultParamValues(),
    // undefined in `functions` mode — entryCode derives it lazily from createRTFn.
    code: record.code,
    isNoop,
    rtDependencies: record.rtDependencies,
    pureFnDependencies: record.pureFnDependencies,
    createRTFn:
      record.alwaysThrowMessage !== undefined
        ? (utils.alwaysThrowFactory(record.alwaysThrowMessage) as CompiledTypeFn['createRTFn'])
        : record.createRTFn,
    fn: isNoop ? (meta.noop as CompiledTypeFn['fn']) : undefined,
    alwaysThrowMessage: record.alwaysThrowMessage,
  };
  utils.addToRTCache(entry);
  return true;
}

// registerPureFnTuple builds the CompiledPureFunction the pureFnsCache
// skeleton's `factory(…)` consumer used to construct, splitting the composite
// `<ns>::<fn>` key into its namespace/fnName halves. The `code` and
// `createPureFn` slots vary by emit mode: in `code` mode createPureFn is absent
// (initPureFunction rebuilds it from code + paramNames); in `functions` mode
// code is absent (the live createPureFn ships instead).
function registerPureFnTuple(utils: RTUtils, tuple: PureFnTuple): boolean {
  const record = tupleToRecord<PureFnRecord>(PURE_FN_TUPLE_KEYS, tuple);
  if (utils.hasPureFn(record.key)) return false;
  const separator = record.key.indexOf('::');
  const entry: CompiledPureFunction = {
    namespace: separator >= 0 ? record.key.slice(0, separator) : '',
    fnName: separator >= 0 ? record.key.slice(separator + 2) : record.key,
    bodyHash: record.bodyHash,
    paramNames: record.paramNames,
    // undefined in `functions` mode — nobody reads a pure fn's code at runtime.
    code: record.code,
    pureFnDependencies: record.pureFnDependencies,
    // undefined in `code` mode — initPureFunction reconstructs via new Function.
    createPureFn: record.createPureFn,
    fn: undefined,
  };
  utils.addPureFn(record.key, entry);
  return true;
}

// =============================================================================
// createX-side resolution
// =============================================================================

/** Resolves the compiled fn a createX factory dispatches to from its injected
 *  entry tuple. Registers the tuple's closure first, then looks the entry up:
 *
 *  - value-first SCHEMA form: the schema's runtime `.id` overrides the
 *    injected type id — the family fnHash is recovered from the tuple key by
 *    fixed-length split (FN_HASH_LEN) and recombined.
 *  - missing-stub tuple (or a key miss on a registered runtype): the family
 *    identity fallback, preserving the pre-migration silent-degrade semantics.
 *  - no tuple at all: the plugin is inactive — throw with the actionable hint.
 */
export function resolveEntryTupleFn<F extends AnyFn>(
  fnName: string,
  identityFn: F,
  schemaId: string | undefined,
  injected: unknown,
  rejectCircularRefs?: boolean
): F {
  const utils = getRTUtils();
  if (isMissingTuple(injected)) return identityFn;
  if (!isEntryTuple(injected)) {
    if (schemaId === undefined) {
      throw new Error(
        `${fnName}(): no id injected. ts-runtypes-devtools must be active for ${fnName} to dispatch to a precompiled factory.`
      );
    }
    // Schema-form without an injected tuple (plugin inactive): the schema
    // still names a runtype; degrade to the identity fallback if registered.
    if (utils.hasRunType(schemaId)) return identityFn;
    throw new Error(`${fnName}(): no RTCompiledFn entry for schema id "${schemaId}" in rtUtils.`);
  }
  initFromTuple(injected);
  let key = entryTupleKey(injected);
  if (schemaId !== undefined) key = key.slice(0, FN_HASH_LEN) + '_' + schemaId;
  const typeId = key.slice(FN_HASH_LEN + 1);
  const entry = utils.getRT(key);
  if (entry) {
    const fn = entry.fn as F;
    // Per-call `{rejectCircularRefs}` overrides the global flag; undefined falls
    // back to it. Disarmed is the hot path — skip the RunType lookup entirely.
    const armed = rejectCircularRefs ?? isRejectCircularRefsEnabled();
    return armed ? maybeGuardCircular(fnName, fn, utils.getRunType(typeId), utils) : fn;
  }
  if (utils.hasRunType(typeId)) return identityFn;
  throw new Error(
    `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

// =============================================================================
// Circular-reference guard
// =============================================================================

// Per-family guard wrappers, keyed by the createX factory's fnName. Only the
// four live-object families guard; each applies its own policy — validate
// stays total (returns false), getValidationErrors records a diagnostic, and
// the encoders throw (matching JSON.stringify). Decoders and the
// huk/ces/uke/fmt leaf families are absent and never wrap.
const circularGuards: Record<string, (fn: AnyFn, rt: RunType, findCycle: FindCycleFn) => AnyFn> = {
  createValidate: (fn, rt, findCycle) => (value: unknown) => (findCycle(value, rt) ? false : fn(value)),
  createGetValidationErrors: (fn, rt, findCycle) => (value: unknown, pth?: unknown, errs?: unknown) => {
    const cycle = findCycle(value, rt);
    // A cycle short-circuits: record it and STOP — descending into the base
    // validator would recurse forever on the same cyclic value.
    if (cycle) {
      const out = Array.isArray(errs) ? (errs as unknown[]) : [];
      out.push({path: Array.isArray(pth) ? [...(pth as unknown[]), ...cycle] : cycle, expected: 'circular'});
      return out;
    }
    return fn(value, pth, errs);
  },
  createJsonEncoder: encoderCircularGuard,
  createBinaryEncoder: encoderCircularGuard,
};

// Shared encoder policy: a cycle throws CircularReferenceError before the base
// encoder runs; trailing args (e.g. the binary serializer) flow through.
function encoderCircularGuard(fn: AnyFn, rt: RunType, findCycle: FindCycleFn): AnyFn {
  return (value: unknown, ...rest: unknown[]) => {
    const cycle = findCycle(value, rt);
    if (cycle) throw new CircularReferenceError(cycle);
    return fn(value, ...rest);
  };
}

/** Wraps `fn` with its family's circular-reference guard when `rt`'s type graph
 *  can actually cycle. Callers gate on the armed flag (global or per-call) first;
 *  this returns `fn` untouched for non-guarded families, a missing RunType, or
 *  an acyclic type — all no-op for free.
 *
 *  The walker itself (`rt::findCycle`) is a demand-delivered built-in pure fn, not
 *  a static import — the resolver wires it into a cyclable guarded entry's deps
 *  (wireCircularRunTypeDeps), so it is registered whenever the gate below passes.
 *  The `!findCycle` branch is a defensive fail-open (guard disabled), never the
 *  normal path. **/
function maybeGuardCircular<F extends AnyFn>(fnName: string, fn: F, rt: RunType | undefined, utils: RTUtils): F {
  if (!rt) return fn;
  const guard = circularGuards[fnName];
  if (!guard || !typeGraphIsCircular(rt)) return fn;
  const findCycle = utils.getPureFn('rt::findCycle') as FindCycleFn | undefined;
  if (!findCycle) return fn;
  return guard(fn, rt, findCycle) as F;
}
