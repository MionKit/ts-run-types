// Entry-tuple consumer — the runtime half of the per-entry virtual modules.
//
// ⚠️  SYNC BOUNDARY — MUST STAY ALIGNED WITH THE GO EMITTER
// ----------------------------------------------------------------------------
// The Go binary emits one ES module per cache entry (`virtual:rt/<key>.js`),
// exporting a positional tuple under the fixed export `e`. Tuples are typed
// here as RECORD interfaces (`RunTypeBundleRecord` / `FnTypeRecord` /
// `PureFnRecord` / …) whose payload fields are Pick'd from the canonical
// cache-entry types in `types.ts` (`RunType`, `CompiledTypeFn`,
// `CompiledPureFunction`), so the wire shapes can never drift from the
// registry shapes. The positional tuple types are DERIVED from the records
// through the `*_TUPLE_KEYS` arrays — the single source of slot order,
// mirrored by the emitters in internal/compiled/{entrymod,runtype,typefns,
// purefns}. Any layout change MUST touch the matching keys array here and
// the Go emitter together.
//
// Every tuple shares the same fixed head: slot 0 discriminates the layout
// (the numeric kinds below, or the QUOTED family tag string for type-fn
// entries), slot 1 is a lazy thunk returning the entry's DIRECT dependency
// tuples (leaves-first by level, self last), slot 2 is the runtype footer
// initializer (or undefined), slot 3 is always the cache key. The remaining
// slots mirror the pre-migration `init(…)` / `factory(…)` call interiors
// byte-for-byte; the Go side trims trailing-undefined slots, which the
// derived tuple types model as optional tails.
//
// Runtype nodes are special-cased for density: every reflection-demanded
// node rides as one headless ROW of THE single data-bundle module
// (`virtual:rt/runtypes.js`, kind 4 — rows in slot 4, ONE combined footer
// initializer in slot 2, content-hash key in slot 3), and each reflection
// root gets a tiny facade module (`virtual:rt/<rootId>.js`, kind 5) that
// imports the bundle and carries the root id in its key slot. Each node
// exists exactly once app-wide; facades keep the rewrite's binding-only
// injection working unchanged.
//
// `initFromTuple` registers a tuple's whole closure in two phases: walk the
// deps() thunks recursively (post-order with a processed-keys guard, so
// children register before parents and cycles terminate), then run each
// newly-registered tuple's `ini`. Ref slots therefore always resolve
// against registered entries, and fn-factory materialisation stays lazy
// (materializeRTFn on first getRT), so cycles keep working exactly as before.

import {getRTUtils} from './rtUtils.ts';
import type {RTUtils} from './rtUtils.ts';
import type {AnyFn, CompiledFnArgs, CompiledFnData, CompiledPureFunction, CompiledTypeFn, RunType} from './types.ts';

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
export const FN_HASH_LEN = 4;

/** Lazy dependency thunk — slot 1 of every tuple. Returns the entry's DIRECT
 *  dependency tuples plus itself (self last); lazy so module-level import
 *  cycles and the self-reference never hit TDZ. The transitive closure is
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
] as const;

/** Named view of one runtype ROW inside the data bundle: RunType's scalar
 *  identification fields in wire order (same names, same types — see
 *  RUN_TYPE_FIELD_KEYS). Rows carry no tuple head — the bundle module hosts
 *  the shared deps thunk and the single combined ini. **/
export type RunTypeRowRecord = Pick<RunType, (typeof RUN_TYPE_FIELD_KEYS)[number]>;

/** Named view of a standalone per-node runtype module (kind 0 — emitted only
 *  under `moduleMode: 'allModules'`): the shared head plus the same scalar
 *  identification fields a bundle row carries; the per-entry ini patches this
 *  one node's ref slots. **/
export interface RunTypeRecord extends RunTypeRowRecord {
  entryKind: typeof KIND_RUN_TYPE;
  deps: EntryDepsThunk;
  ini: RunTypeIni | undefined;
}

/** Named view of THE runtype data-bundle module (`virtual:rt/runtypes.js`):
 *  every reflection-demanded node as one headless row plus one combined
 *  footer initializer. `key` is a CONTENT hash over the row ids — it changes
 *  exactly when the bundle evolves, so the processed-keys guard re-registers
 *  new rows after an HMR reload of the (mutable) bundle module. **/
export interface RunTypeBundleRecord {
  entryKind: typeof KIND_RUN_TYPE_BUNDLE;
  deps: EntryDepsThunk;
  ini: RunTypeIni | undefined;
  key: string;
  rows: readonly RunTypeRow[];
}

/** Named view of a per-reflection-root facade module
 *  (`virtual:rt/<rootId>.js`): registers nothing — it carries the root id in
 *  the key slot and the bundle in its deps thunk, so the rewrite's
 *  binding-only injection keeps deriving ids from the tuple. **/
export interface RunTypeFacadeRecord {
  entryKind: typeof KIND_RUN_TYPE_FACADE;
  deps: EntryDepsThunk;
  ini: undefined;
  key: string;
}

/** Named view of a type-fn entry tuple: the shared head (slot 0 is the family
 *  tag string) plus the CompiledTypeFn fields the wire carries. `code` is
 *  widened to `| undefined` — noop and alwaysThrow rows ship without one (the
 *  register path resolves the family identity / throwing factory instead). **/
export interface FnTypeRecord extends Pick<
  CompiledTypeFn,
  | 'rtFnHash'
  | 'typeName'
  | 'isNoop'
  | 'rtDependencies'
  | 'pureFnDependencies'
  | 'createRTFn'
  | 'alwaysThrowCode'
  | 'alwaysThrowSite'
> {
  familyTag: string;
  deps: EntryDepsThunk;
  ini: undefined;
  code: CompiledFnData['code'] | undefined;
}

/** Named view of a pure-fn entry tuple: the shared head plus the
 *  CompiledPureFunction fields the wire carries. `key` is the composite
 *  `<ns>::<fn>` cache key (split into namespace/fnName at register time). **/
export interface PureFnRecord extends Pick<
  CompiledPureFunction,
  'bodyHash' | 'paramNames' | 'code' | 'pureFnDependencies' | 'createPureFn'
> {
  entryKind: typeof KIND_PURE_FN;
  deps: EntryDepsThunk;
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

// Go's emitters trim trailing-undefined slots: runtype rows always carry at
// least (id, kind); fn tuples at least the noop short form (…, code, isNoop);
// pure-fn, bundle, facade and missing tuples are never trimmed. The
// REQUIRED/TRIMMED splits below mirror that, so the derived tuple types
// accept the short forms.
type RunTypeRowRequiredKeys = readonly ['id', 'kind'];
type RunTypeRowTrimmedKeys = typeof RUN_TYPE_FIELD_KEYS extends readonly [unknown, unknown, ...infer Rest] ? Rest : never;

export const RUN_TYPE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, ...RUN_TYPE_FIELD_KEYS] as const;
export const RUN_TYPE_BUNDLE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key', 'rows'] as const;
export const RUN_TYPE_FACADE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key'] as const;

const FN_TYPE_REQUIRED_KEYS = ['familyTag', 'deps', 'ini', 'rtFnHash', 'typeName', 'code', 'isNoop'] as const;
const FN_TYPE_TRIMMED_KEYS = [
  'rtDependencies',
  'pureFnDependencies',
  'createRTFn',
  'alwaysThrowCode',
  'alwaysThrowSite',
] as const;
export const FN_TYPE_TUPLE_KEYS = [...FN_TYPE_REQUIRED_KEYS, ...FN_TYPE_TRIMMED_KEYS] as const;

export const PURE_FN_TUPLE_KEYS = [
  ...ENTRY_HEAD_KEYS,
  'key',
  'bodyHash',
  'paramNames',
  'code',
  'pureFnDependencies',
  'createPureFn',
] as const;

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

/** Positional tuple of a pure-fn entry module — derived from PureFnRecord. **/
export type PureFnTuple = readonly [...TupleFrom<PureFnRecord, typeof PURE_FN_TUPLE_KEYS>];

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
 *  legacy string id, or undefined). Missing stubs carry no deps thunk and are
 *  guarded separately via isMissingTuple. **/
export function isEntryTuple(value: unknown): value is EntryTuple {
  if (isMissingTuple(value)) return true;
  return Array.isArray(value) && typeof value[SLOT_DEPS] === 'function' && value.length > SLOT_KEY;
}

/** The cache key an entry tuple registers under (slot 3 — `id` for runtype
 *  tuples, `rtFnHash` for fn tuples, `key` for pure-fn / missing tuples). **/
export function entryTupleKey(tuple: EntryTuple): string {
  return tuple[SLOT_KEY] as string;
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
const noopToBinary = (_v: unknown, Ser: unknown) => Ser;
const noopFromBinary = (ret: unknown) => ret;

const valueArgs = () => ({vλl: 'v'}) as CompiledFnArgs;
const valueDefaults = () => ({vλl: undefined}) as unknown as CompiledFnArgs;
const errorArgs = () => ({vλl: 'v', pλth: 'pth', εrr: 'er'}) as CompiledFnArgs;
const errorDefaults = () => ({vλl: undefined, pλth: [], εrr: []}) as unknown as CompiledFnArgs;

const valueShaped = (fnID: string, noop: AnyFn): FamilyMeta => ({fnID, args: valueArgs, defaultParamValues: valueDefaults, noop});
const errorShaped = (fnID: string): FamilyMeta => ({fnID, args: errorArgs, defaultParamValues: errorDefaults, noop: noopErrors});

// Keyed by the tuple's slot-0 family tag. The five JSON-composite tags borrow
// the metadata of the family whose module hosted them pre-migration (encoder
// strategies rode prepareForJson, decoder strategies restoreFromJson) — Go:
// constants.JsonCompositeHostTags.
const familyMeta: Record<string, FamilyMeta> = {
  val: valueShaped('val', noopTrue),
  verr: errorShaped('verr'),
  pj: valueShaped('pj', noopIdentity),
  rj: valueShaped('rj', noopIdentity),
  sj: valueShaped('sj', noopStringify),
  pjs: valueShaped('pjs', noopIdentity),
  huk: {
    fnID: 'huk',
    args: () => ({vλl: 'v', θpts: 'opts'}) as CompiledFnArgs,
    defaultParamValues: () => ({vλl: undefined, θpts: {}}) as unknown as CompiledFnArgs,
    noop: noopFalse,
  },
  suk: valueShaped('suk', noopIdentity),
  uke: errorShaped('uke'),
  uku: valueShaped('uku', noopIdentity),
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
  // JSON composites — encoder tags host on pj metadata, decoder tags on rj.
  jeCL: valueShaped('pj', noopIdentity),
  jeMU: valueShaped('pj', noopIdentity),
  jeDI: valueShaped('pj', noopIdentity),
  jdST: valueShaped('rj', noopIdentity),
  jdPR: valueShaped('rj', noopIdentity),
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
  // Phase 2: footer initializers — every referenced entry now exists, so the
  // `c(id)` registry lookups inside each ini body resolve, including cycles.
  for (const tuple of fresh) {
    const ini = tuple[2] as RunTypeIni | undefined;
    if (typeof ini === 'function') ini(utils);
  }
}

// collectClosure walks a tuple's deps() thunks post-order: deps register
// before their dependents, the processed-keys guard terminates cycles (and
// skips subtrees an earlier root already registered), and every newly
// registered tuple lands in `fresh` for the caller's phase-2 ini pass.
function collectClosure(tuple: unknown, utils: RTUtils, fresh: EntryTuple[]): void {
  if (!isEntryTuple(tuple) || isMissingTuple(tuple)) return;
  const key = entryTupleKey(tuple);
  if (processedKeys.has(key)) return;
  processedKeys.add(key);
  for (const dep of (tuple[SLOT_DEPS] as EntryDepsThunk)()) {
    if (dep !== tuple) collectClosure(dep, utils, fresh);
  }
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
    typeName: record.typeName,
    args: meta.args(),
    defaultParamValues: meta.defaultParamValues(),
    code: record.code as string,
    isNoop,
    rtDependencies: record.rtDependencies,
    pureFnDependencies: record.pureFnDependencies,
    createRTFn:
      record.alwaysThrowCode !== undefined
        ? (utils.alwaysThrowFactory(record.alwaysThrowCode, record.alwaysThrowSite) as CompiledTypeFn['createRTFn'])
        : record.createRTFn,
    fn: isNoop ? (meta.noop as CompiledTypeFn['fn']) : undefined,
    alwaysThrowCode: record.alwaysThrowCode,
    alwaysThrowSite: record.alwaysThrowSite,
  };
  utils.addToRTCache(entry);
  return true;
}

// registerPureFnTuple builds the CompiledPureFunction the pureFnsCache
// skeleton's `factory(…)` consumer used to construct, splitting the composite
// `<ns>::<fn>` key into its namespace/fnName halves.
function registerPureFnTuple(utils: RTUtils, tuple: PureFnTuple): boolean {
  const record = tupleToRecord<PureFnRecord>(PURE_FN_TUPLE_KEYS, tuple);
  if (utils.hasPureFn(record.key)) return false;
  const separator = record.key.indexOf('::');
  const entry: CompiledPureFunction = {
    namespace: separator >= 0 ? record.key.slice(0, separator) : '',
    fnName: separator >= 0 ? record.key.slice(separator + 2) : record.key,
    bodyHash: record.bodyHash,
    paramNames: record.paramNames,
    code: record.code,
    pureFnDependencies: record.pureFnDependencies,
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
  injected: unknown
): F {
  const utils = getRTUtils();
  if (isMissingTuple(injected)) return identityFn;
  if (!isEntryTuple(injected)) {
    if (schemaId === undefined) {
      throw new Error(
        `${fnName}(): no id injected. vite-plugin-runtypes must be active for ${fnName} to dispatch to a precompiled factory.`
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
  const entry = utils.getRT(key);
  if (entry) return entry.fn as F;
  const typeId = key.slice(FN_HASH_LEN + 1);
  if (utils.hasRunType(typeId)) return identityFn;
  throw new Error(
    `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}
