// engine.ts — the framework-agnostic playground engine.
//
// Given a TypeScript snippet that defines `MyType` and a chosen build function,
// it drives the WASM resolver to RESOLVE the type, links the emitted
// entry-module code in-browser, and hands the resulting tuple to the matching
// public ts-runtypes factory to produce a LIVE function it then runs against
// input. This is the same pipeline the Vite plugin + runtime use at build/run
// time, here driven live from a single resolver dispatch.

import * as RT from 'ts-runtypes';
// Side effect: register the format pure fns (rtFormats::isUUID, …), regex
// patterns and format mock fns the generated validators / mock walker call at
// runtime. Without it a format like UUID / IP throws `pf_isUUID is not a function`.
import 'ts-runtypes/formats';
import {loadResolver, type Resolver, type ResolverOptions, type ResolverVersions} from './wasmLoader.ts';
import {ROOT_TYPE} from './markerDts.ts';
import {runtypesPackageSources} from './runtypesPackageSources.ts';
import {operationByKey, type Operation} from './operations.ts';

export type {Operation, OperationKind} from './operations.ts';
export type {Resolver, ResolverOptions, ResolverVersions} from './wasmLoader.ts';
export {OPERATIONS, operationByKey} from './operations.ts';
export {ROOT_TYPE} from './markerDts.ts';

const FILE = 'playground.ts';

const factories = RT as unknown as Record<string, (...args: unknown[]) => (...callArgs: unknown[]) => unknown>;

export type Diagnostic = Record<string, unknown>;

export interface RunTypeNode {
  id: string;
  kind: number;
  family?: string;
  typeName?: string;
  name?: string;
  [key: string]: unknown;
}

export type RunResult =
  | {op: Operation; kind: 'predicate'; value: boolean; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'errors'; value: unknown[]; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'encode'; value: unknown; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'jsonRoundtrip'; encoded: unknown; decoded: unknown; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'binaryEncode'; byteLength: number; hex: string; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'binaryRoundtrip'; byteLength: number; hex: string; decoded: unknown; diagnostics: Diagnostic[]}
  | {
      op: Operation;
      kind: 'graph';
      rootId: string | null;
      root: RunTypeNode | null;
      runTypes: RunTypeNode[];
      diagnostics: Diagnostic[];
    };

interface ScanResult {
  // fnId is absent for reflection call sites (getRunTypeId / createMockType),
  // which inject the facade tuple under `__rt_<id>` rather than `__rt_<fnId>_<id>`.
  site: {id: string; fnId?: string; [key: string]: unknown} | null;
  entryModules: Record<string, string>;
  runTypes: RunTypeNode[];
  diagnostics: Diagnostic[];
}

let resolverPromise: Promise<Resolver> | null = null;

export function getResolver(options?: ResolverOptions): Promise<Resolver> {
  if (!resolverPromise) resolverPromise = loadResolver(options);
  return resolverPromise;
}

// setResolver injects a prebuilt resolver, bypassing the WASM loader. Hosts that
// build the resolver their own way (a Node/SSR loader, a custom asset flow, the
// test suite) supply {versions, dispatch} directly; subsequent run()/versions()
// calls reuse it. Pass null to reset back to lazy WASM loading.
export function setResolver(resolver: Resolver | null): void {
  resolverPromise = resolver ? Promise.resolve(resolver) : null;
}

export async function versions(options?: ResolverOptions): Promise<ResolverVersions> {
  return (await getResolver(options)).versions;
}

// link the emitted entry modules into the root tuple. Each module is
// `export const __rt_X = [...]` possibly preceded by `import { __rt_dep } …`;
// deps ride lazy thunks (slot 1) so concatenating every const into one scope
// and returning the root binding is enough — no TDZ on the lazy references.
function linkRootTuple(entryModules: Record<string, string>, binding: string): unknown {
  const parts: string[] = [];
  for (const src of Object.values(entryModules)) {
    parts.push(src.replace(/^\s*import[^;]*;\s*$/gm, '').replace(/^\s*export\s+const/gm, 'const'));
  }
  parts.push(`\nreturn ${binding};`);
  return new Function(parts.join('\n'))();
}

// How the editor's snippet defines the type: a TS type `MyType` (the call site
// is `<factory><MyType>()`), or a value-first `const MyType = ...` schema built
// from ts-runtypes/schema + ts-runtypes/formats (the call site is `<factory>(MyType)`).
export type Mode = 'type' | 'schema';

// factoryImport renders the import line the playground shows around a snippet —
// the same `import { <factory> } from 'ts-runtypes'` the engine prepends before
// resolving (see `scan` below), surfaced verbatim so the type column can display
// the real surrounding code the user would write.
export function factoryImport(factory: string): string {
  return `import { ${factory} } from 'ts-runtypes';`;
}

// factoryCall renders the call line: `const <varName> = <factory><MyType>()` in
// type mode, `const <varName> = <factory>(MyType)` in schema mode. When
// `injectedArg` is given (a `__rt_<…>` binding), it is appended as the trailing
// argument — exactly how the build plugin rewrites the call site (a 0-arg
// `createValidate<T>()` becomes `createValidate<T>(__rt_…)`; the value-first
// `createValidate(MyType)` becomes `createValidate(MyType, __rt_…)`).
export function factoryCall(factory: string, varName: string, mode: Mode, injectedArg?: string | null): string {
  if (mode === 'schema') {
    const args = injectedArg ? `${ROOT_TYPE}, ${injectedArg}` : ROOT_TYPE;
    return `const ${varName} = ${factory}(${args});`;
  }
  return `const ${varName} = ${factory}<${ROOT_TYPE}>(${injectedArg ?? ''});`;
}

// pickFactorySite returns the site for the engine's appended factory call — the
// one with the highest source position. See the `site:` note in scan(): a
// value-first schema snippet emits an extra reflection site for its own
// `const MyType = RT.object(...)` builder that must not be mistaken for the
// factory call site.
function pickFactorySite(sites: ScanResult['site'][]): ScanResult['site'] {
  let best: ScanResult['site'] = null;
  for (const site of sites) {
    if (!site) continue;
    if (!best || Number(site.pos ?? 0) > Number(best.pos ?? 0)) best = site;
  }
  return best;
}

function scan(dispatch: Resolver['dispatch'], factory: string, userCode: string, mode: Mode = 'type'): ScanResult {
  // Only the factory import is injected; the user snippet writes its own
  // `import * as RT from 'ts-runtypes/schema'` / `import type { … } from
  // 'ts-runtypes/formats'`, so the imports read like real code (and aren't
  // duplicated).
  const call = mode === 'schema' ? `${factory}(${ROOT_TYPE});` : `${factory}<${ROOT_TYPE}>();`;
  const source = [`import { ${factory} } from 'ts-runtypes';`, userCode, call, ''].join('\n');
  dispatch({op: 'setSources', sources: {...runtypesPackageSources(), [FILE]: source}});
  const result = dispatch({op: 'scanFiles', files: [FILE], includeRunTypes: true, includeEntryModules: true});
  const sites = (result.sites as ScanResult['site'][]) ?? [];
  return {
    // The factory call is appended LAST, so its site has the highest source
    // position. Pick it, not sites[0]: in schema mode a value-first snippet's
    // own `const MyType = RT.object(...)` carries its OWN reflection marker
    // (the builder's InjectRunTypeId `id` param) and emits an earlier site — the
    // one we must NOT link against (it's the runtype facade, not the factory).
    site: pickFactorySite(sites),
    entryModules: (result.entryModules as Record<string, string>) ?? {},
    runTypes: (result.runTypes as RunTypeNode[]) ?? [],
    diagnostics: (result.diagnostics as Diagnostic[]) ?? [],
  };
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((d) =>
      `${String(d.severity ?? d.Severity ?? '').toUpperCase()} ${d.code ?? d.Code ?? ''}: ${d.message ?? d.Message ?? ''}`.trim()
    )
    .join('\n');
}

interface LinkedEntry {
  tuple: unknown[];
  diagnostics: Diagnostic[];
}

// linkEntry scans <factory><MyType>(), links the emitted entry modules, and
// returns the root tuple. The binding is `__rt_<fnId>_<id>` for type-fn families
// (validate / encoders / …) and `__rt_<id>` for reflection ones (createMockType /
// getRunTypeId), which inject a facade tuple with no fnId.
function linkEntry(dispatch: Resolver['dispatch'], factory: string, userCode: string, mode: Mode = 'type'): LinkedEntry {
  const {site, entryModules, diagnostics} = scan(dispatch, factory, userCode, mode);
  if (!site) {
    throw new Error(
      `${factory}<…>() produced no call site. Check that the snippet compiles and defines ${ROOT_TYPE}.` +
        (diagnostics.length ? `\n${formatDiagnostics(diagnostics)}` : '')
    );
  }
  const binding = site.fnId ? `__rt_${site.fnId}_${site.id}` : `__rt_${site.id}`;
  const tuple = linkRootTuple(entryModules, binding) as unknown[];
  return {tuple, diagnostics};
}

interface Materialized {
  fn: (...args: unknown[]) => unknown;
  diagnostics: Diagnostic[];
}

// materialize a live function by handing the linked root tuple to the public
// ts-runtypes factory. validate/encoders/mock all take the injected tuple in the
// trailing (3rd) arg slot — the runtime signature is (value, options, id).
function materialize(dispatch: Resolver['dispatch'], factory: string, userCode: string, mode: Mode = 'type'): Materialized {
  const {tuple, diagnostics} = linkEntry(dispatch, factory, userCode, mode);
  const fn = factories[factory](undefined, undefined, tuple) as Materialized['fn'];
  return {fn, diagnostics};
}

// transformedSource returns the file the build plugin actually produces for the
// selected factory: the resolver's real transform of `import … / <type> / const
// … = <factory>…()`. That is the injected `import { __rt_… } from 'virtual:rt/…'`
// block plus the call rewritten with its trailing `__rt_…` argument — shown
// verbatim in the type column's "after build" view so the edits the plugin makes
// on top of the generated code are visible. Falls back to the untransformed
// source when nothing resolves (e.g. the snippet does not compile yet).
export async function transformedSource(
  factory: string,
  varName: string,
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<string> {
  const {dispatch} = await getResolver(options);
  const source = [factoryImport(factory), '', userCode.trimEnd(), '', factoryCall(factory, varName, mode)].join('\n');
  dispatch({op: 'setSources', sources: {...runtypesPackageSources(), [FILE]: source}});
  const result = dispatch({op: 'transform', files: [FILE]});
  const code = (result.transformed as Record<string, {code?: string}> | undefined)?.[FILE]?.code;
  if (typeof code !== 'string') return source;
  // The rewrite slot-fills the factory's optional parameters with `undefined`
  // before the injected `__rt_…` id. Type-first passes no value/options so the
  // padding is leading — `createValidate<MyType>(undefined, __rt_…)`; value-first
  // passes the schema so the padding is the `options` slot between it and the id
  // — `createJsonEncoder(MyType, undefined, __rt_…)`. Drop that padding either
  // way so the call reads like the code a user writes (`…(__rt_…)` /
  // `…(MyType, __rt_…)`). Scope the cleanup to the factory call itself (the last
  // non-empty line) so it can never touch user code with the same shape.
  const lines = code.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      lines[i] = lines[i].replace(/([(,])\s*(?:undefined,\s*)+(__rt_[A-Za-z0-9_]+)\)/g, (_m, sep: string, id: string) =>
        sep === ',' ? `, ${id})` : `(${id})`
      );
      break;
    }
  }
  return lines.join('\n').trimEnd();
}

// A single generated cache module: the virtual-module specifier the transformed
// file (or a sibling cache) imports, plus its `export const __rt_… = […]` source.
export interface CacheModule {
  name: string; // e.g. `virtual:rt/fns/jdST.js`
  code: string;
}

// generatedCache returns the generated cache modules for this factory + type —
// one entry per family module the resolver emits (ModuleMode allSingle = one per
// family tag). A single-function type is one module; a JSON/binary codec is a few
// (the composite + the primitives it looks up at runtime), which import each
// other — the UI labels each with its module name and keeps the imports so the
// cross-module structure is visible. For reflection (getRunType) it is the single
// runtype data bundle.
export async function generatedCache(
  factory: string,
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<CacheModule[]> {
  const {dispatch} = await getResolver(options);
  const {entryModules} = scan(dispatch, factory, userCode, mode);
  return Object.entries(entryModules).map(([basename, code]) => ({name: `virtual:rt/${basename}.js`, code: code.trim()}));
}

// mock generates a random value for the type via createMockType (the same
// generator MockData feeds). Returns the value plus any diagnostics.
export async function mock(
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<{value: unknown; diagnostics: Diagnostic[]}> {
  const {dispatch} = await getResolver(options);
  const {fn, diagnostics} = materialize(dispatch, 'createMockType', userCode, mode);
  return {value: fn(), diagnostics};
}

// mockInvalid generates a value that FAILS validation via the core createMockType
// `invalid` option (a valid mock with one type-aware position corrupted; see
// invalidLeafProbability). It additionally verifies against the live validator and
// retries, so the rare position the core can't make invalid on its own (a
// multi-type union arm, `any`) is caught here. Falls back to the last attempt when
// nothing in the budget is found invalid (e.g. an `any` / `unknown` type).
export async function mockInvalid(
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type',
  invalidLeafProbability = 0.85
): Promise<{value: unknown; diagnostics: Diagnostic[]}> {
  const {dispatch} = await getResolver(options);
  const validate = materialize(dispatch, 'createValidate', userCode, mode).fn as (v: unknown) => boolean;
  const {fn: generate, diagnostics} = materialize(dispatch, 'createMockType', userCode, mode);
  const callOpts = {mock: {invalid: true, invalidLeafProbability}};
  let last: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    last = generate(callOpts);
    if (!validate(last)) return {value: last, diagnostics};
  }
  return {value: last, diagnostics};
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value; // createBinaryEncoder returns a Uint8Array view
  return new Uint8Array(value as ArrayBuffer);
}

// run executes the chosen operation. `input` is the parsed JS value (may be
// undefined for ops that take no input). `mode` selects the TS-type vs schema form.
export async function run(
  opKey: string,
  userCode: string,
  input?: unknown,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<RunResult> {
  const {dispatch} = await getResolver(options);
  const op = operationByKey(opKey);

  switch (op.kind) {
    case 'graph': {
      // Type mode reflects via getRunType<MyType>(); schema mode resolves the
      // same graph through a value-first reflection call on the schema.
      const reflectFactory = mode === 'schema' ? 'createMockType' : 'getRunType';
      const {site, runTypes, diagnostics} = scan(dispatch, reflectFactory, userCode, mode);
      const rootId = site?.id ?? null;
      const root = runTypes.find((n) => n.id === rootId) ?? runTypes[0] ?? null;
      return {op, kind: 'graph', rootId, root, runTypes, diagnostics};
    }
    case 'predicate': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      return {op, kind: 'predicate', value: Boolean(fn(input)), diagnostics};
    }
    case 'errors': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      return {op, kind: 'errors', value: fn(input) as unknown[], diagnostics};
    }
    case 'encode': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      return {op, kind: 'encode', value: fn(input), diagnostics};
    }
    case 'jsonRoundtrip': {
      const enc = materialize(dispatch, 'createJsonEncoder', userCode, mode);
      const dec = materialize(dispatch, 'createJsonDecoder', userCode, mode);
      const encoded = enc.fn(input);
      const decoded = dec.fn(encoded);
      return {op, kind: 'jsonRoundtrip', encoded, decoded, diagnostics: dec.diagnostics};
    }
    case 'binaryEncode': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      const bytes = asBytes(fn(input));
      return {op, kind: 'binaryEncode', byteLength: bytes.length, hex: toHex(bytes), diagnostics};
    }
    case 'binaryRoundtrip': {
      const enc = materialize(dispatch, 'createBinaryEncoder', userCode, mode);
      const dec = materialize(dispatch, 'createBinaryDecoder', userCode, mode);
      const bytes = asBytes(enc.fn(input));
      const decoded = dec.fn(bytes);
      return {op, kind: 'binaryRoundtrip', byteLength: bytes.length, hex: toHex(bytes), decoded, diagnostics: dec.diagnostics};
    }
    default:
      throw new Error(`unknown operation kind: ${String(op.kind)}`);
  }
}
