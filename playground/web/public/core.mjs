// core.mjs — the playground execution engine.
//
// Given a TypeScript type written as a string and a chosen build function, this
// drives the WASM resolver to RESOLVE the type, links the emitted entry-module
// code in-browser, and hands the resulting tuple to the matching public
// ts-runtypes factory to produce a LIVE function we then run against input.
//
// The whole pipeline is the same one the Vite plugin + runtime use at
// build/run time, here driven live from a single resolver dispatch.

import { loadResolver } from './wasm.mjs';
import * as RT from '/runtime/index.js';

// The marker ambient declaration. The resolver gates recognition of each
// factory on an import from a module named `ts-runtypes`; this `declare module`
// satisfies that on the virtual disk without a real package. Each factory's
// `InjectTypeFnArgs<T, '<fnKey>'>` / `InjectRunTypeId<T>` trailing param is what
// the scanner reads to compute demand + the function hash. Kept minimal: the
// options params are omitted because we place the injected tuple ourselves.
const MARKER_DTS = `
declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __b?: T};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> =
    string & {readonly __b?: T; readonly __f?: [F1, F2, F3]};
  export type CompTimeArgs<T> = T & {readonly __c?: never};
  export type CompTimeFnArgs<T> = T & {readonly __cf?: never};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createGetValidationErrors<T>(val?: T, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: T) => unknown;
  export function createJsonDecoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (v: unknown) => T;
  export function createBinaryEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'tb'>): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'fb'>): (v: Uint8Array) => T;
}
`;

const FILE = 'playground.ts';
// The root type the user's snippet must define. The editor seeds it; the
// resolver always resolves `<factory><MyType>()`.
export const ROOT_TYPE = 'MyType';

// The build functions the picker offers. `factory` is the ts-runtypes export;
// `fnKey` matches the marker overlay above. `kind` selects how run() invokes it.
export const OPERATIONS = [
  {
    key: 'validate',
    factory: 'createValidate',
    fnKey: 'val',
    kind: 'predicate',
    label: 'createValidate',
    blurb: 'Type guard — returns true when the value matches the type.',
    needsInput: true,
  },
  {
    key: 'errors',
    factory: 'createGetValidationErrors',
    fnKey: 'verr',
    kind: 'errors',
    label: 'createGetValidationErrors',
    blurb: 'Returns the list of validation errors (empty when valid).',
    needsInput: true,
  },
  {
    key: 'jsonEncoder',
    factory: 'createJsonEncoder',
    fnKey: 'jsonEncoder',
    kind: 'encode',
    label: 'createJsonEncoder',
    blurb: 'Encodes a value into its JSON-safe shape.',
    needsInput: true,
  },
  {
    key: 'jsonDecoder',
    factory: 'createJsonDecoder',
    fnKey: 'jsonDecoder',
    kind: 'jsonRoundtrip',
    label: 'createJsonDecoder',
    blurb: 'Decodes JSON back into the data type (encodes your input first, then decodes it).',
    needsInput: true,
  },
  {
    key: 'binaryEncoder',
    factory: 'createBinaryEncoder',
    fnKey: 'tb',
    kind: 'binaryEncode',
    label: 'createBinaryEncoder',
    blurb: 'Encodes a value into a compact binary buffer (shown as hex).',
    needsInput: true,
  },
  {
    key: 'binaryDecoder',
    factory: 'createBinaryDecoder',
    fnKey: 'fb',
    kind: 'binaryRoundtrip',
    label: 'createBinaryDecoder',
    blurb: 'Decodes a binary buffer back into the data type (encodes your input first, then decodes it).',
    needsInput: true,
  },
  {
    key: 'graph',
    factory: 'getRunTypeId',
    fnKey: null,
    kind: 'graph',
    label: 'getRunTypeId (RunType graph)',
    blurb: 'Resolves the type and shows its RunType graph + id.',
    needsInput: false,
  },
];

export function operationByKey(key) {
  return OPERATIONS.find((op) => op.key === key) ?? OPERATIONS[0];
}

let resolverPromise = null;
function resolver() {
  if (!resolverPromise) resolverPromise = loadResolver();
  return resolverPromise;
}

export async function versions() {
  return (await resolver()).versions;
}

// link the emitted entry modules into the root tuple. Each module is
// `export const __rt_X = [...]` possibly preceded by `import { __rt_dep } …`;
// deps ride lazy thunks (slot 1) so concatenating every const into one scope
// and returning the root binding is enough — no TDZ on the lazy references.
function linkRootTuple(entryModules, binding) {
  const parts = [];
  for (const src of Object.values(entryModules)) {
    parts.push(src.replace(/^\s*import[^;]*;\s*$/gm, '').replace(/^\s*export\s+const/gm, 'const'));
  }
  parts.push(`\nreturn ${binding};`);
  // eslint-disable-next-line no-new-func
  return new Function(parts.join('\n'))();
}

// scan resolves a `<factory><MyType>()` call against the resolver and returns
// the site + emitted modules + run types + diagnostics. `userCode` is the
// editor snippet; it must define a `MyType` type (or interface).
function scan(dispatch, factory, userCode) {
  const source = [
    `import { ${factory} } from 'ts-runtypes';`,
    userCode,
    `${factory}<${ROOT_TYPE}>();`,
    ``,
  ].join('\n');
  dispatch({ op: 'setSources', sources: { 'ts-runtypes.d.ts': MARKER_DTS, [FILE]: source } });
  const result = dispatch({ op: 'scanFiles', files: [FILE], includeRunTypes: true, includeEntryModules: true });
  return {
    site: result.sites?.[0] ?? null,
    entryModules: result.entryModules ?? {},
    runTypes: result.runTypes ?? [],
    diagnostics: result.diagnostics ?? [],
  };
}

// materialize a live function for a type-fn family (validate / encoders / …).
function materialize(dispatch, factory, userCode) {
  const { site, entryModules, diagnostics } = scan(dispatch, factory, userCode);
  if (!site) {
    throw new Error(
      `${factory}<…>() produced no call site. Check the type compiles.` +
        (diagnostics.length ? `\n${formatDiagnostics(diagnostics)}` : '')
    );
  }
  const binding = `__rt_${site.fnId}_${site.id}`;
  const tuple = linkRootTuple(entryModules, binding);
  // validate/encoders take an options slot, so the injected tuple is trailing.
  const fn = RT[factory](undefined, undefined, tuple);
  return { fn, diagnostics, site };
}

function formatDiagnostics(diagnostics) {
  return diagnostics
    .map((d) => `${(d.severity ?? d.Severity ?? '').toString().toUpperCase()} ${d.code ?? d.Code ?? ''}: ${d.message ?? d.Message ?? ''}`.trim())
    .join('\n');
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// run executes the chosen operation. `input` is the parsed JS value (may be
// undefined for ops that take no input). Returns a structured result the UI
// renders.
export async function run(opKey, userCode, input) {
  const { dispatch } = await resolver();
  const op = operationByKey(opKey);

  if (op.kind === 'graph') {
    const { site, runTypes, diagnostics } = scan(dispatch, 'getRunTypeId', userCode);
    const rootId = site?.id ?? null;
    const root = runTypes.find((n) => n.id === rootId) ?? runTypes[0] ?? null;
    return { op, kind: 'graph', rootId, root, runTypes, diagnostics };
  }

  switch (op.kind) {
    case 'predicate': {
      const { fn, diagnostics } = materialize(dispatch, op.factory, userCode);
      return { op, kind: 'predicate', value: Boolean(fn(input)), diagnostics };
    }
    case 'errors': {
      const { fn, diagnostics } = materialize(dispatch, op.factory, userCode);
      return { op, kind: 'errors', value: fn(input), diagnostics };
    }
    case 'encode': {
      const { fn, diagnostics } = materialize(dispatch, op.factory, userCode);
      return { op, kind: 'encode', value: fn(input), diagnostics };
    }
    case 'jsonRoundtrip': {
      const enc = materialize(dispatch, 'createJsonEncoder', userCode);
      const dec = materialize(dispatch, 'createJsonDecoder', userCode);
      const encoded = enc.fn(input);
      const decoded = dec.fn(encoded);
      return { op, kind: 'jsonRoundtrip', encoded, decoded, diagnostics: dec.diagnostics };
    }
    case 'binaryEncode': {
      const { fn, diagnostics } = materialize(dispatch, op.factory, userCode);
      const bytes = fn(input);
      return { op, kind: 'binaryEncode', byteLength: bytes.length ?? bytes.byteLength, hex: toHex(bytes), diagnostics };
    }
    case 'binaryRoundtrip': {
      const enc = materialize(dispatch, 'createBinaryEncoder', userCode);
      const dec = materialize(dispatch, 'createBinaryDecoder', userCode);
      const bytes = enc.fn(input);
      const decoded = dec.fn(bytes);
      return {
        op,
        kind: 'binaryRoundtrip',
        byteLength: bytes.length ?? bytes.byteLength,
        hex: toHex(bytes),
        decoded,
        diagnostics: dec.diagnostics,
      };
    }
    default:
      throw new Error(`unknown operation kind: ${op.kind}`);
  }
}
