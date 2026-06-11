// Module-mode registrar — the runtime consumer of per-entry virtual modules.
//
// ⚠️  SYNC BOUNDARY — MUST STAY ALIGNED WITH THE GO EMITTERS
// ----------------------------------------------------------------------------
// Each virtual module exports `entry` as a positional array. The slot orders
// are owned by the Go side (internal/compiled/typefns/entrymodule.go for fn
// entries, internal/compiled/runtype/entrymodule.go for RunType data nodes)
// and decoded here. Drift surfaces as a runtime shape mismatch.
//
// Fn entry  — the legacy skeleton init() args with the family tag at slot 1:
//   [rtFnHash, familyTag, typeName, code, isNoop,
//    rtDependencies, pureFnDependencies, createRTFn, alwaysThrowCode, alwaysThrowSite]
// Data node — the legacy rt() args with the 't' tag at slot 1 and the footer
// (refs + runtime values) gated in a trailing `initEntry(rtUtils)` function:
//   [id, 't', kind, subKind, typeName, name, literal, optional, readonly,
//    isAbstract, isStatic, visibility, isSafeName, position, isCircular,
//    flags, description, defaultVal, enumVal, values, notSupported, initEntry?]
//
// `initDependencies` is the two-pass declare-then-link contract the aggregate
// runTypes module's footer implements today: pass 1 registers every entry of a
// closure (register-if-absent — structural, version-salted ids make skipping
// duplicates HMR-correct), pass 2 runs the fresh data nodes' initEntry so every
// `useRunType(id)` knot ref resolves, cycles included.

import type {RTUtils} from './rtUtils.ts';
import type {AnyFn, CompiledFnArgs, CompiledTypeFn, Mutable, RunType} from './types.ts';

/** Positional wire tuple for one fn-cache entry (validate/json/binary/… families). **/
export type FnEntryTuple = readonly [
  rtFnHash: string,
  familyTag: string,
  typeName?: string,
  code?: string,
  isNoop?: boolean,
  rtDependencies?: readonly string[],
  pureFnDependencies?: readonly string[],
  createRTFn?: (utl: RTUtils) => AnyFn,
  alwaysThrowCode?: string,
  alwaysThrowSite?: string,
];

/** Positional wire tuple for one RunType data node (`['<id>', 't', …rt slots, initEntry?]`). **/
export type RunTypeEntryTuple = readonly unknown[];

export type EntryTuple = FnEntryTuple | RunTypeEntryTuple;

/** Per-family fixed fields — what each aggregate skeleton's init() hardcoded. **/
interface FamilyRow {
  fnID: string;
  args: CompiledFnArgs;
  defaults: CompiledFnArgs;
  noop?: AnyFn;
}

const valueArgs: CompiledFnArgs = {vλl: 'v'};
const valueDefaults = {vλl: undefined} as unknown as CompiledFnArgs;
const errorsArgs: CompiledFnArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'};
const errorsDefaults = {vλl: undefined, pλth: [], εrr: []} as unknown as CompiledFnArgs;

const identityNoop = (v: unknown) => v;
const errorsNoop = ((_v: unknown, _pth: unknown, er: unknown[]) => er || []) as AnyFn;

function valueRow(fnID: string, noop: AnyFn): FamilyRow {
  return {fnID, args: valueArgs, defaults: valueDefaults, noop};
}

// One row per family tag — the registrar-side collapse of the 16 skeleton
// init() helpers. JSON composite tags (jeCL/…) never emit noop entries but
// need rows so their tag routes through the same registration.
const FAMILIES: Record<string, FamilyRow> = {
  val: valueRow('val', () => true),
  verr: {fnID: 'verr', args: errorsArgs, defaults: errorsDefaults, noop: errorsNoop},
  uke: {fnID: 'uke', args: errorsArgs, defaults: errorsDefaults, noop: errorsNoop},
  huk: {
    fnID: 'huk',
    args: {vλl: 'v', θpts: 'opts'},
    defaults: {vλl: undefined, θpts: {}} as unknown as CompiledFnArgs,
    noop: () => false,
  },
  suk: valueRow('suk', identityNoop),
  uku: valueRow('uku', identityNoop),
  ukuw: valueRow('ukuw', identityNoop),
  pj: valueRow('pj', identityNoop),
  pjs: valueRow('pjs', identityNoop),
  rj: valueRow('rj', identityNoop),
  fmt: valueRow('fmt', identityNoop),
  sj: valueRow('sj', (v: unknown) => JSON.stringify(v)),
  tb: {
    fnID: 'tb',
    args: {vλl: 'v', sεr: 'Ser'},
    defaults: {vλl: undefined, sεr: undefined} as unknown as CompiledFnArgs,
    noop: ((_v: unknown, Ser: unknown) => Ser) as AnyFn,
  },
  fb: {
    fnID: 'fb',
    args: {vλl: 'ret', dεs: 'Des'},
    defaults: {vλl: undefined, dεs: undefined} as unknown as CompiledFnArgs,
    noop: ((ret: unknown) => ret) as AnyFn,
  },
  jeCL: valueRow('jeCL', identityNoop),
  jeMU: valueRow('jeMU', identityNoop),
  jeDI: valueRow('jeDI', identityNoop),
  jdST: valueRow('jdST', identityNoop),
  jdPR: valueRow('jdPR', identityNoop),
};

/** Family tag routing RunType data nodes to the runtype registry (`addRunType`). **/
const RUNTYPE_DATA_TAG = 't';

/** Registers every unregistered entry of a deps closure, then links the fresh
 *  data nodes (two-pass declare-then-link — see the module banner). Idempotent
 *  per key; safe across call sites sharing closure subsets. **/
export function initDependencies(utl: RTUtils, deps: readonly EntryTuple[]): void {
  const freshDataNodes: RunTypeEntryTuple[] = [];
  for (const entry of deps) {
    const key = entry[0] as string;
    const tag = entry[1] as string;
    if (tag === RUNTYPE_DATA_TAG) {
      if (utl.hasRunType(key)) continue;
      registerRunTypeFromTuple(utl, entry as RunTypeEntryTuple);
      freshDataNodes.push(entry as RunTypeEntryTuple);
      continue;
    }
    if (utl.hasRTFn(key)) continue;
    registerFnFromTuple(utl, entry as FnEntryTuple, tag);
  }
  for (const entry of freshDataNodes) {
    const last = entry[entry.length - 1];
    if (typeof last === 'function') (last as (utl: RTUtils) => void)(utl);
  }
}

/** Builds + registers one fn-cache entry from its tuple — the skeleton init() body, table-driven. **/
function registerFnFromTuple(utl: RTUtils, entry: FnEntryTuple, tag: string): void {
  const [rtFnHash, , typeName, code, isNoop, rtDependencies, pureFnDependencies, createRTFn, alwaysThrowCode, alwaysThrowSite] =
    entry;
  const family = FAMILIES[tag];
  if (!family) throw new Error(`registrar: unknown family tag "${tag}" on entry "${rtFnHash}"`);
  const resolvedCreateRTFn =
    alwaysThrowCode !== undefined ? (utl.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) as unknown as (utl: RTUtils) => AnyFn) : createRTFn;
  const compiled: CompiledTypeFn = {
    rtFnHash,
    fnID: family.fnID,
    typeName: typeName ?? '',
    args: family.args,
    defaultParamValues: family.defaults,
    code: code as string,
    isNoop,
    rtDependencies: rtDependencies as string[] | undefined,
    pureFnDependencies: pureFnDependencies as string[] | undefined,
    createRTFn: resolvedCreateRTFn,
    fn: isNoop ? family.noop : undefined,
    alwaysThrowCode,
    alwaysThrowSite,
  };
  utl.addToRTCache(compiled);
}

/** Builds + registers one RunType node from its tuple — the skeleton rt() body
 *  (every ref slot pre-set undefined; the trailing initEntry patches them in
 *  pass 2). Positional slots are never functions (footer-special literals stay
 *  `u` and are patched by initEntry), so a trailing function IS the footer fn
 *  and is sliced off before the positional decode. **/
function registerRunTypeFromTuple(utl: RTUtils, entry: RunTypeEntryTuple): void {
  const hasInitEntry = typeof entry[entry.length - 1] === 'function';
  const slots = hasInitEntry ? entry.slice(0, -1) : entry;
  const node: Mutable<RunType> = {
    id: slots[0] as string,
    kind: slots[2],
    subKind: slots[3],
    typeName: slots[4],
    name: slots[5],
    literal: slots[6],
    optional: slots[7],
    readonly: slots[8],
    isAbstract: slots[9],
    isStatic: slots[10],
    visibility: slots[11],
    isSafeName: slots[12],
    position: slots[13],
    isCircular: slots[14] as boolean | undefined,
    flags: slots[15],
    description: slots[16],
    defaultVal: slots[17],
    enumVal: slots[18],
    values: slots[19],
    notSupported: slots[20] as boolean | undefined,
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
  utl.addRunType(node.id, node as RunType);
}

/** Shape guard for the graph-demand injected value: `[typeId, deps]`. Params
 *  objects, schema carriers, RunType nodes and member arrays never match. **/
export function isInjectedData(value: unknown): value is readonly [string, readonly EntryTuple[]] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Array.isArray(value[1]);
}

/** Unwraps a graph-demand injected value: registers its deps closure and
 *  returns the type id. Bare-string ids (aggregate mode / no deps) pass
 *  through; undefined stays undefined. **/
export function resolveInjectedData(utl: RTUtils, value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isInjectedData(value)) {
    initDependencies(utl, value[1]);
    return value[0];
  }
  return undefined;
}
