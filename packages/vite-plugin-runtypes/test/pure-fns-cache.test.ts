// End-to-end acceptance test for the pureFns virtual module. Drives the
// Go binary over inline sources, then verifies:
//
//   1. response.pureFnsCacheSource exports `factory(...)` calls keyed
//      by "<namespace>::<functionID>" with structurally-valid entries
//      including the inline `createPureFn` literal.
//   2. response.replacements carries one byte-range null-out per
//      accepted call site.
//   3. response.diagnostics (filtered to PureFn family) surfaces PFE9xxx
//      diagnostics for bad-shape calls (non-literal args, body-hash
//      collisions, etc.).
//   4. The diagnostic wire format renders via formatTscDiagnostic into
//      VS Code's `$tsc` problem-matcher line shape.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Severity, type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

// runtypesDts is the ambient marker declaration prepended to every
// fixture below. registerPureFnFactory's discovery is now marker-driven
// (CompTimeArgs<string> × 2 + PureFunction<F> brands on the three
// params), so test fixtures need a branded signature in scope —
// otherwise the walker silently skips the call.
const runtypesDts = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __mionPureFunctionBrand?: never};
  export interface RTUtils {
    usePureFn(key: CompTimeArgs<string>): any;
    getPureFn(key: CompTimeArgs<string>): any;
    getCompiledPureFn(key: CompTimeArgs<string>): any;
    hasPureFn(key: CompTimeArgs<string>): boolean;
    findCompiledPureFn(fnName: CompTimeArgs<string>): any;
  }
  export function registerPureFnFactory(
    namespace: CompTimeArgs<string>,
    functionID: CompTimeArgs<string>,
    factory: PureFunction<(utl: RTUtils) => any> | null
  ): any;
}
`;

function pureFnDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.PureFn);
}

interface PureFnEntry {
  namespace: string;
  fnName: string;
  bodyHash: string;
  paramNames: string[];
  code: string;
  pureFnDependencies: string[];
  createPureFn: unknown;
  fn: unknown;
}

// evalPureFnsModule strips `export`s from the rendered module,
// evaluates its `initCache(rtUtils)` export against a stub that
// records every `addPureFn(key, entry)` call, and returns the
// populated flat cache (`{ 'ns::name': CompiledPureFunction-ish }`).
function evalPureFnsModule(source: string): Record<string, PureFnEntry> {
  const registered: Record<string, PureFnEntry> = {};
  const stub = {
    addPureFn(key: string, entry: PureFnEntry) {
      registered[key] = entry;
    },
  };
  const stripped = source.replace(/^\s*export\s+function\s+/gm, 'function ');
  const factory = new Function(`${stripped}\nreturn initCache;`);
  const initCache = factory() as (rtUtils: typeof stub) => void;
  initCache(stub);
  return registered;
}

describe('vite-plugin-runtypes / pure-fns virtual module', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits pureFns entries with structurally-valid metadata', async () => {
    const sources = {
      'pure.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
export const a = registerPureFnFactory('mion', 'asJSONString', function () {
  return function _stringify(s: string): string {
    return JSON.stringify(s);
  };
});
export const b = registerPureFnFactory('mion', 'safeKey', function () {
  return function _safe(value: any): any {
    return value;
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      expect(response.pureFnsCacheSource).toBeDefined();
      expect(pureFnDiagsOf(response)).toEqual([]);

      const pureFns = evalPureFnsModule(response.pureFnsCacheSource!);
      expect(Object.keys(pureFns).sort()).toEqual(['mion::asJSONString', 'mion::safeKey']);

      const asJSON = pureFns['mion::asJSONString'];
      expect(asJSON.namespace).toBe('mion');
      expect(asJSON.fnName).toBe('asJSONString');
      expect(asJSON.bodyHash).toMatch(/^[A-Za-z0-9_-]{14}$/);
      expect(asJSON.paramNames).toEqual([]);
      // Body must be JS-stripped — no `: string` annotation should remain.
      expect(asJSON.code).not.toContain(': string');
      expect(asJSON.code).toContain('return JSON.stringify');
      // Dependencies array is always present (empty when no deps).
      expect(asJSON.pureFnDependencies).toEqual([]);
      // createPureFn is a function — the cache module IS the canonical
      // runtime home of the body.
      expect(typeof asJSON.createPureFn).toBe('function');
      // Calling it with a utl stub yields the actual pure function.
      const inner = (asJSON.createPureFn as (utl: unknown) => (s: string) => string)({});
      expect(typeof inner).toBe('function');
      expect(inner('hi')).toBe('"hi"');
    });
  });

  register('emits Replacement entries that null out each factory argument', async () => {
    const sources = {
      'src.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
export const _ = registerPureFnFactory('mion', 'foo', function () {
  return function _f(x: number) { return x + 1; };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const reps = response.replacements ?? [];
      expect(reps.length).toBe(1);
      expect(reps[0].text).toBe('null');
      expect(reps[0].end).toBeGreaterThan(reps[0].start);
      // Verify the rewrite produces a syntactically clean nulled-out
      // call form when applied to the source.
      const buf = Buffer.from(sources['src.ts'], 'utf8');
      const after = Buffer.concat([
        buf.subarray(0, reps[0].start),
        Buffer.from(reps[0].text, 'utf8'),
        buf.subarray(reps[0].end),
      ]).toString('utf8');
      expect(after).toContain("registerPureFnFactory('mion', 'foo',null)");
    });
  });

  register('extracts pureFnDependencies statically from utl.getPureFn calls', async () => {
    const sources = {
      'deps.ts': `import {registerPureFnFactory, type RTUtils} from '@mionjs/ts-go-run-types';
export const _ = registerPureFnFactory('mion', 'consumer', function (utl: RTUtils) {
  return function _f(x: any) {
    return utl.getPureFn('mion::dep')(x);
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const pureFns = evalPureFnsModule(response.pureFnsCacheSource!);
      expect(pureFns['mion::consumer'].pureFnDependencies).toEqual(['mion::dep']);
    });
  });

  register('emits CTA001 for non-literal namespace (was PFE9001 pre-marker-migration)', async () => {
    const sources = {
      'bad-ns.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
declare function getNs(): string;
export const x = registerPureFnFactory(getNs(), 'fn', function () { return function() {}; });
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      // CompTimeArgs<string> brand on the namespace param fires a CTA0xx
      // diagnostic from the marker layer (resolver.scanCall) — the exact
      // sub-code depends on the failure mode (CTA001 non-literal, CTA003
      // function-call construct). The walker silently skips extraction.
      const ctaSeen = (response.diagnostics ?? [])
        .filter((d) => d.family === Family.Marker)
        .some((d) => d.code.startsWith('CTA'));
      expect(ctaSeen).toBe(true);
      // No purefn-family shape diagnostic — PFE9001 was retired.
      expect(pureFnDiagsOf(response).map((d) => d.code)).not.toContain('PFE9001');
    });
  });

  register('emits PFN001 for non-inline factory reference (was PFE9003 pre-marker-migration)', async () => {
    const sources = {
      'bad-fn.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
declare const externalFn: (utl: unknown) => () => void;
export const x = registerPureFnFactory('mion', 'fn', externalFn);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      // PureFunction<F> brand on the factory param emits PFN001 from
      // the marker layer when the arg isn't an inline arrow/function
      // expression (or const-bound binding to one).
      const markerCodes = (response.diagnostics ?? []).filter((d) => d.family === Family.Marker).map((d) => d.code);
      expect(markerCodes).toContain('PFN001');
      // No purefn-family shape diagnostic — PFE9003 was retired.
      expect(pureFnDiagsOf(response).map((d) => d.code)).not.toContain('PFE9003');
    });
  });

  register('emits PFE9004 collision diagnostic for mismatched bodies', async () => {
    const sources = {
      'a.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
export const a = registerPureFnFactory('mion', 'collideFn', function () {
  return function v1() { return 1; };
});
`,
      'b.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
export const b = registerPureFnFactory('mion', 'collideFn', function () {
  return function v2() { return 2; };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const collisions = pureFnDiagsOf(response).filter((d) => d.code === 'PFE9004');
      expect(collisions.length).toBe(1);

      const collision = collisions[0];
      expect(collision.related?.length).toBe(1);
      expect(collision.related?.[0].filePath).not.toBe(collision.site.filePath);
      // Args carry the colliding key — the catalog template substitutes
      // it into the headline ("Duplicate registerPureFnFactory for `X`…").
      expect(collision.args).toEqual(['mion::collideFn']);

      // Virtual module still loads, with the first-occurrence winner.
      const pureFns = evalPureFnsModule(response.pureFnsCacheSource!);
      expect(pureFns['mion::collideFn']).toBeDefined();
    });
  });

  register('emits PFE9010 (forbidden identifier) for eval inside a factory body', async () => {
    const sources = {
      'impure.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
export const x = registerPureFnFactory('mion', 'evilFn', function () {
  return function _evil() {
    return eval('1+1');
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const diags = pureFnDiagsOf(response);
      const evalDiag = diags.find((d) => d.code === 'PFE9010' && d.args?.[0] === 'eval');
      expect(evalDiag).toBeDefined();
      // Ensure the formatted line matches the $tsc problem-matcher regex
      // — VS Code parses build-task output through that pattern.
      const line = formatTscDiagnostic(evalDiag!);
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+error\s+PFE9010:/);
    });
  });

  register('emits PFE9011 (closure variable) for module-level const captured by factory', async () => {
    // The whole point of the source-rewrite-to-null design: closure
    // captures must blow up at scan time, since the cached fn body
    // can't see anything outside its own scope.
    const sources = {
      'closure.ts': `import {registerPureFnFactory} from '@mionjs/ts-go-run-types';
const PRECISION = 0.001;
export const x = registerPureFnFactory('mion', 'rounder', function () {
  return function _round(n: number) {
    return Math.round(n / PRECISION) * PRECISION;
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const diags = pureFnDiagsOf(response);
      const closureDiag = diags.find((d) => d.code === 'PFE9011' && d.args?.[0] === 'PRECISION');
      expect(closureDiag).toBeDefined();
    });
  });

  register('formatTscDiagnostic renders the canonical $tsc problem-matcher line', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9004',
      family: Family.PureFn,
      severity: Severity.Error,
      args: ['mion::collideFn'],
      site: {
        filePath: '/abs/path/x.ts',
        startLine: 12,
        startCol: 5,
        endLine: 12,
        endCol: 9,
      },
    });
    // Headline text comes from the JS catalog; we don't pin the exact
    // copy here (catalog wording can evolve). Just confirm the line
    // shape: <path>(<line>,<col>): <severity> <code>: <headline-with-arg>
    expect(line).toMatch(/^\/abs\/path\/x\.ts\(12,5\): error PFE9004: /);
    expect(line).toContain('mion::collideFn');
    // VS Code's built-in $tsc problem matcher regex:
    expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+(error|warning)\s+[A-Z]+\d+:\s+.+$/);
  });

  register('formatTscDiagnostic includes Related sites on continuation lines', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9004',
      family: Family.PureFn,
      severity: Severity.Error,
      args: ['mion::fn'],
      site: {
        filePath: '/abs/b.ts',
        startLine: 5,
        startCol: 1,
        endLine: 5,
        endCol: 30,
      },
      related: [
        {
          filePath: '/abs/a.ts',
          startLine: 3,
          startCol: 1,
          endLine: 3,
          endCol: 30,
          message: 'First registered here with bodyHash=abc1234567890_',
        },
      ],
    });
    expect(line).toContain('/abs/b.ts(5,1): error PFE9004:');
    expect(line).toContain('Related: /abs/a.ts(3,1): First registered here with bodyHash=abc1234567890_');
  });
});
