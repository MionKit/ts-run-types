// engine.ts — the framework-agnostic playground engine.
//
// Given a TypeScript snippet that defines `MyType` and a chosen build function,
// it drives the WASM resolver to RESOLVE the type, links the emitted
// entry-module code in-browser, and hands the resulting tuple to the matching
// public ts-runtypes factory to produce a LIVE function it then runs against
// input. This is the same pipeline the Vite plugin + runtime use at build/run
// time, here driven live from a single resolver dispatch.

import * as RT from 'ts-runtypes';
import {loadResolver, type Resolver, type ResolverOptions, type ResolverVersions} from './wasmLoader.ts';
import {MARKER_DTS, ROOT_TYPE} from './markerDts.ts';
import {operationByKey, type Operation} from './operations.ts';
import {injectNegative} from './negativeMock.ts';

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

function scan(dispatch: Resolver['dispatch'], factory: string, userCode: string, mode: Mode = 'type'): ScanResult {
  const imports =
    mode === 'schema'
      ? [
          `import { ${factory} } from 'ts-runtypes';`,
          `import * as RT from 'ts-runtypes/schema';`,
          `import * as TF from 'ts-runtypes/formats';`,
        ]
      : [`import { ${factory} } from 'ts-runtypes';`];
  const call = mode === 'schema' ? `${factory}(${ROOT_TYPE});` : `${factory}<${ROOT_TYPE}>();`;
  const source = [...imports, userCode, call, ''].join('\n');
  dispatch({op: 'setSources', sources: {'ts-runtypes.d.ts': MARKER_DTS, [FILE]: source}});
  const result = dispatch({op: 'scanFiles', files: [FILE], includeRunTypes: true, includeEntryModules: true});
  const sites = (result.sites as ScanResult['site'][]) ?? [];
  return {
    site: sites[0] ?? null,
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

// Slot index of the generated function body inside a type-fn entry tuple
// (FN_TYPE_REQUIRED_KEYS = [familyTag, deps, ini, rtFnHash, typeName, code] in
// packages/ts-runtypes/src/runtypes/entryTuple.ts). Noop / alwaysThrow entries
// ship without a code string.
const CODE_SLOT = 5;

export interface GeneratedModule {
  factory: string;
  // The generated function source, or null when the family is a no-op (identity)
  // for this type or could not be generated (see `note`).
  code: string | null;
  note?: string;
}

// The type-fn families whose generated code the playground shows, in display
// order. Reflection (getRunTypeId / createMockType) has no per-type function code.
const CODE_FAMILIES: ReadonlyArray<string> = [
  'createValidate',
  'createGetValidationErrors',
  'createJsonEncoder',
  'createJsonDecoder',
  'createBinaryEncoder',
  'createBinaryDecoder',
];

// linkOne reads the generated function source for one family by linking its entry
// tuple and reading the code slot.
function linkOne(dispatch: Resolver['dispatch'], factory: string, userCode: string, mode: Mode): GeneratedModule {
  try {
    const {tuple} = linkEntry(dispatch, factory, userCode, mode);
    const code = tuple[CODE_SLOT];
    if (typeof code === 'string' && code.length > 0) return {factory, code};
    return {factory, code: null, note: 'no-op for this type (the generated function is the identity)'};
  } catch (err) {
    return {factory, code: null, note: (err as Error).message ?? String(err)};
  }
}

// generatedFunction returns the generated source for ONE family (the playground's
// selected build function).
export async function generatedFunction(
  factory: string,
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<GeneratedModule> {
  const {dispatch} = await getResolver(options);
  return linkOne(dispatch, factory, userCode, mode);
}

// generatedModules returns the generated function source for each family.
export async function generatedModules(
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<GeneratedModule[]> {
  const {dispatch} = await getResolver(options);
  return CODE_FAMILIES.map((factory) => linkOne(dispatch, factory, userCode, mode));
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

// rootRunTypeNode resolves the RunType graph for the user's type (the same
// reflection path the 'graph' op uses) and returns the root node, so the
// negative generator can read each position's declared type.
function rootRunTypeNode(dispatch: Resolver['dispatch'], userCode: string, mode: Mode): RunTypeNode | undefined {
  const reflectFactory = mode === 'schema' ? 'createMockType' : 'getRunTypeId';
  const {site, runTypes} = scan(dispatch, reflectFactory, userCode, mode);
  const rootId = site?.id ?? null;
  return runTypes.find((n) => n.id === rootId) ?? runTypes[0] ?? undefined;
}

// mockInvalid generates a value that FAILS validation: a fresh valid mock with
// one position turned into a type-aware inverse (see injectNegative /
// leafProbability), verified against the real validator and retried if the
// corruption happened to stay valid (e.g. a multi-type union arm accepted it).
// Falls back to the last attempt if none is found invalid in the budget (e.g. an
// `any` / `unknown` type accepts everything).
export async function mockInvalid(
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type',
  leafProbability = 0.85
): Promise<{value: unknown; diagnostics: Diagnostic[]}> {
  const {dispatch} = await getResolver(options);
  const validate = materialize(dispatch, 'createValidate', userCode, mode).fn as (v: unknown) => boolean;
  const {fn: generate, diagnostics} = materialize(dispatch, 'createMockType', userCode, mode);
  const node = rootRunTypeNode(dispatch, userCode, mode);
  let last: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    last = injectNegative(generate(), node, leafProbability);
    if (!validate(last)) return {value: last, diagnostics};
  }
  return {value: last, diagnostics};
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function asBytes(value: unknown): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
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
      // Type mode reflects via getRunTypeId<MyType>(); schema mode resolves the
      // same graph through a value-first reflection call on the schema.
      const reflectFactory = mode === 'schema' ? 'createMockType' : 'getRunTypeId';
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
