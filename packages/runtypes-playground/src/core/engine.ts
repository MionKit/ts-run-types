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
  site: {id: string; fnId: string; [key: string]: unknown} | null;
  entryModules: Record<string, string>;
  runTypes: RunTypeNode[];
  diagnostics: Diagnostic[];
}

let resolverPromise: Promise<Resolver> | null = null;

export function getResolver(options?: ResolverOptions): Promise<Resolver> {
  if (!resolverPromise) resolverPromise = loadResolver(options);
  return resolverPromise;
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

function scan(dispatch: Resolver['dispatch'], factory: string, userCode: string): ScanResult {
  const source = [`import { ${factory} } from 'ts-runtypes';`, userCode, `${factory}<${ROOT_TYPE}>();`, ''].join('\n');
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

interface Materialized {
  fn: (...args: unknown[]) => unknown;
  diagnostics: Diagnostic[];
}

// materialize a live function for a type-fn family (validate / encoders / …).
function materialize(dispatch: Resolver['dispatch'], factory: string, userCode: string): Materialized {
  const {site, entryModules, diagnostics} = scan(dispatch, factory, userCode);
  if (!site) {
    throw new Error(
      `${factory}<…>() produced no call site. Check that the snippet compiles and defines ${ROOT_TYPE}.` +
        (diagnostics.length ? `\n${formatDiagnostics(diagnostics)}` : '')
    );
  }
  const binding = `__rt_${site.fnId}_${site.id}`;
  const tuple = linkRootTuple(entryModules, binding);
  // validate/encoders take an options slot, so the injected tuple is trailing.
  const fn = factories[factory](undefined, undefined, tuple) as Materialized['fn'];
  return {fn, diagnostics};
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function asBytes(value: unknown): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
}

// run executes the chosen operation. `input` is the parsed JS value (may be
// undefined for ops that take no input).
export async function run(opKey: string, userCode: string, input?: unknown, options?: ResolverOptions): Promise<RunResult> {
  const {dispatch} = await getResolver(options);
  const op = operationByKey(opKey);

  switch (op.kind) {
    case 'graph': {
      const {site, runTypes, diagnostics} = scan(dispatch, 'getRunTypeId', userCode);
      const rootId = site?.id ?? null;
      const root = runTypes.find((n) => n.id === rootId) ?? runTypes[0] ?? null;
      return {op, kind: 'graph', rootId, root, runTypes, diagnostics};
    }
    case 'predicate': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode);
      return {op, kind: 'predicate', value: Boolean(fn(input)), diagnostics};
    }
    case 'errors': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode);
      return {op, kind: 'errors', value: fn(input) as unknown[], diagnostics};
    }
    case 'encode': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode);
      return {op, kind: 'encode', value: fn(input), diagnostics};
    }
    case 'jsonRoundtrip': {
      const enc = materialize(dispatch, 'createJsonEncoder', userCode);
      const dec = materialize(dispatch, 'createJsonDecoder', userCode);
      const encoded = enc.fn(input);
      const decoded = dec.fn(encoded);
      return {op, kind: 'jsonRoundtrip', encoded, decoded, diagnostics: dec.diagnostics};
    }
    case 'binaryEncode': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode);
      const bytes = asBytes(fn(input));
      return {op, kind: 'binaryEncode', byteLength: bytes.length, hex: toHex(bytes), diagnostics};
    }
    case 'binaryRoundtrip': {
      const enc = materialize(dispatch, 'createBinaryEncoder', userCode);
      const dec = materialize(dispatch, 'createBinaryDecoder', userCode);
      const bytes = asBytes(enc.fn(input));
      const decoded = dec.fn(bytes);
      return {op, kind: 'binaryRoundtrip', byteLength: bytes.length, hex: toHex(bytes), decoded, diagnostics: dec.diagnostics};
    }
    default:
      throw new Error(`unknown operation kind: ${String(op.kind)}`);
  }
}
