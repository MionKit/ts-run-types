// Entry-tuple consumer — the runtime half of the per-entry virtual modules.
//
// ⚠️  SYNC BOUNDARY — MUST STAY ALIGNED WITH THE GO EMITTER
// ----------------------------------------------------------------------------
// The Go binary emits one ES module per cache entry (`virtual:rt/<key>.js`),
// exporting a positional tuple under the fixed export `e`:
//
//   [ kindOrFamilyTag, depsThunk, iniOrUndefined, ...legacyPositionalArgs ]
//
// Slot 0 discriminates the layout: the numeric kinds below, or the QUOTED
// family tag string ('val', 'pj', 'jeCL', …) for type-fn entries. Slot 1 is a
// lazy thunk returning the entry's full transitive dep closure (leaves-first,
// self included). Slot 2 is the runtype footer initializer (or undefined).
// Slot 3 is always the cache key; the remaining args mirror the pre-migration
// `rt(…)` / `init(…)` / `factory(…)` call interiors byte-for-byte. Any change
// to these layouts MUST be matched in internal/compiled/entrymod (tuple head)
// and internal/compiled/{runtype,typefns,purefns} (args). The familyMeta table
// below mirrors what each per-family cache-skeleton `init()` hardcoded before
// the migration (fnID / args / defaultParamValues / noop identity).
//
// `initFromTuple` registers a tuple's whole closure in two phases: register
// every deps() tuple not yet present (children first — deps() is
// level-ordered), then run each newly-registered runtype tuple's `ini`. Ref
// slots therefore always resolve against registered entries, and fn-factory
// materialisation stays lazy (materializeRTFn on first getRT), so cycles keep
// working exactly as before.

import {getRTUtils} from './rtUtils.ts';
import type {RTUtils} from './rtUtils.ts';
import type {AnyFn, CompiledFnArgs, CompiledPureFunction, CompiledTypeFn, Mutable, RunType} from './types.ts';

// Slot indexes of the fixed tuple head (Go: internal/compiled/entrymod).
const SLOT_KIND = 0;
const SLOT_DEPS = 1;
const SLOT_INI = 2;
const SLOT_KEY = 3;

// Numeric slot-0 kinds (Go: constants.TupleKind*). Type-fn entries carry their
// family tag string instead.
const KIND_RUN_TYPE = 0;
const KIND_PURE_FN = 2;
const KIND_MISSING = 3;

/** Fixed character length of every fnHash (Go: operations.FnHashLen). Used to
 *  split `<fnHash>_<typeId>` keys when a value-first schema overrides the
 *  type id at a createX call site. **/
export const FN_HASH_LEN = 4;

/** One emitted entry-module tuple. Positionally typed loosely — the layouts
 *  are discriminated at runtime on slot 0 and validated by the paired Go/JS
 *  test suites, not by the type system. **/
export type EntryTuple = readonly unknown[] & {
  readonly __mionEntryTupleBrand?: never;
};

/** Runtime guard for an injected entry tuple (vs a value-first schema, a
 *  legacy string id, or undefined). **/
export function isEntryTuple(value: unknown): value is EntryTuple {
  return Array.isArray(value) && typeof value[SLOT_DEPS] === 'function' && value.length > SLOT_KEY;
}

/** The cache key an entry tuple registers under (slot 3). **/
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

// Roots whose closure already registered — the per-factory-call fast path.
const processedRoots = new Set<string>();

/** Registers `root`'s full dependency closure into rtUtils (children first),
 *  then runs each newly-registered runtype tuple's footer initializer.
 *  Idempotent per root key; safe across overlapping closures (per-entry
 *  registration is skipped when the key is already present). **/
export function initFromTuple(root: EntryTuple): void {
  if (isMissingTuple(root)) return;
  if (!isEntryTuple(root)) return;
  const rootKey = entryTupleKey(root);
  if (processedRoots.has(rootKey)) return;
  processedRoots.add(rootKey);

  const utils = getRTUtils();
  const deps = (root[SLOT_DEPS] as () => readonly unknown[])();
  const fresh: EntryTuple[] = [];
  for (const dep of deps) {
    if (!isEntryTuple(dep) || isMissingTuple(dep)) continue;
    if (registerTuple(utils, dep)) fresh.push(dep);
  }
  // Phase 2: footer initializers — every referenced entry now exists, so the
  // `c(id)` registry lookups inside each ini body resolve, including cycles.
  for (const tuple of fresh) {
    const ini = tuple[SLOT_INI] as ((rtu: RTUtils) => void) | undefined;
    if (typeof ini === 'function') ini(utils);
  }
}

/** Registers a single tuple in the cache matching its kind. Returns true when
 *  the entry was newly added (drives the phase-2 ini pass). **/
function registerTuple(utils: RTUtils, tuple: EntryTuple): boolean {
  const slot0 = tuple[SLOT_KIND];
  if (typeof slot0 === 'string') return registerTypeFnTuple(utils, slot0, tuple);
  if (slot0 === KIND_RUN_TYPE) return registerRunTypeTuple(utils, tuple);
  if (slot0 === KIND_PURE_FN) return registerPureFnTuple(utils, tuple);
  return false; // KIND_MISSING or unknown future kind — nothing to register.
}

// registerRunTypeTuple builds the 20-slot RunType record the runTypesCache
// skeleton's `rt(…)` factory used to construct: every ref slot pre-set to
// undefined, patched later by the tuple's ini. `addRunType` overwrites by id,
// but re-registration is skipped so footer-patched entries are never reset
// while in use.
function registerRunTypeTuple(utils: RTUtils, tuple: EntryTuple): boolean {
  const id = tuple[SLOT_KEY] as string;
  if (utils.hasRunType(id)) return false;
  const arg = (offset: number) => tuple[SLOT_KEY + offset];
  const entry = {
    id,
    kind: arg(1),
    subKind: arg(2),
    typeName: arg(3),
    name: arg(4),
    literal: arg(5),
    optional: arg(6),
    readonly: arg(7),
    isAbstract: arg(8),
    isStatic: arg(9),
    visibility: arg(10),
    isSafeName: arg(11),
    position: arg(12),
    isCircular: arg(13),
    flags: arg(14),
    description: arg(15),
    defaultVal: arg(16),
    enumVal: arg(17),
    values: arg(18),
    notSupported: arg(19),
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
  } as unknown as RunType;
  utils.addRunType(id, entry);
  return true;
}

// registerTypeFnTuple builds the CompiledTypeFn record the per-family cache
// skeletons' `init(…)` consumers used to construct. Args (slot 3 onward):
// rtFnHash, typeName, code, isNoop, rtDependencies, pureFnDependencies,
// createRTFn, alwaysThrowCode, alwaysThrowSite — trailing args may be absent
// (the Go side trims nothing here, but noop short-form stops after isNoop).
function registerTypeFnTuple(utils: RTUtils, familyTag: string, tuple: EntryTuple): boolean {
  const rtFnHash = tuple[SLOT_KEY] as string;
  if (utils.hasRTFn(rtFnHash)) return false;
  const meta = familyMeta[familyTag];
  if (!meta) return false; // unknown future family — leave to the identity fallback
  const arg = (offset: number) => tuple[SLOT_KEY + offset];
  const isNoop = arg(3) === true;
  const alwaysThrowCode = arg(7) as string | undefined;
  const createRTFn = arg(6) as CompiledTypeFn['createRTFn'];
  const entry: Mutable<CompiledTypeFn> = {
    rtFnHash,
    fnID: meta.fnID,
    typeName: arg(1) as string,
    args: meta.args(),
    defaultParamValues: meta.defaultParamValues(),
    code: arg(2) as string,
    isNoop,
    rtDependencies: arg(4) as string[] | undefined,
    pureFnDependencies: arg(5) as string[] | undefined,
    createRTFn:
      alwaysThrowCode !== undefined
        ? (utils.alwaysThrowFactory(alwaysThrowCode, arg(8) as string | undefined) as CompiledTypeFn['createRTFn'])
        : createRTFn,
    fn: isNoop ? (meta.noop as CompiledTypeFn['fn']) : undefined,
    alwaysThrowCode,
    alwaysThrowSite: arg(8) as string | undefined,
  };
  utils.addToRTCache(entry as CompiledTypeFn);
  return true;
}

// registerPureFnTuple builds the CompiledPureFunction record the pureFnsCache
// skeleton's `factory(…)` consumer used to construct. Args (slot 3 onward):
// key, bodyHash, paramNames, code, pureFnDependencies, createPureFn.
function registerPureFnTuple(utils: RTUtils, tuple: EntryTuple): boolean {
  const key = tuple[SLOT_KEY] as string;
  if (utils.hasPureFn(key)) return false;
  const arg = (offset: number) => tuple[SLOT_KEY + offset];
  const separator = key.indexOf('::');
  const entry: CompiledPureFunction = {
    namespace: separator >= 0 ? key.slice(0, separator) : '',
    fnName: separator >= 0 ? key.slice(separator + 2) : key,
    bodyHash: arg(1) as string,
    paramNames: arg(2) as string[],
    code: arg(3) as string,
    pureFnDependencies: arg(4) as string[],
    createPureFn: arg(5) as CompiledPureFunction['createPureFn'],
    fn: undefined,
  };
  utils.addPureFn(key, entry);
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
