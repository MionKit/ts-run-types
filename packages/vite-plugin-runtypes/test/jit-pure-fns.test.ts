// End-to-end acceptance test for the parsedFns virtual module. Drives the
// Go binary over inline sources, then verifies:
//
//   1. response.parsedFnsCacheSource exports a `parsedFns` map keyed
//      by "<namespace>::<functionID>" with structurally-valid entries.
//   2. response.parsedFnsDiagnostics surfaces PFE9xxx diagnostics for
//      bad-shape calls (non-literal args, body-hash collisions, etc.).
//   3. The diagnostic wire format renders via formatTscDiagnostic into
//      VS Code's `$tsc` problem-matcher line shape.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

interface ParsedFnEntry {
  bodyHash: string;
  paramNames: string[];
  code: string;
}

// evalParsedFnsModule strips `export`s from the rendered module,
// evaluates its `initCache(jitUtils)` export against a stub that
// records every `addParsedFn(key, data)` call, and returns the
// populated flat cache (`{ 'ns::name': {bodyHash, paramNames, code} }`).
function evalParsedFnsModule(source: string): Record<string, ParsedFnEntry> {
  const registered: Record<string, ParsedFnEntry> = {};
  const stub = {
    addParsedFn(key: string, data: ParsedFnEntry) {
      registered[key] = data;
    },
  };
  const stripped = source.replace(/^\s*export\s+function\s+/gm, 'function ');
  const factory = new Function(`${stripped}\nreturn initCache;`);
  const initCache = factory() as (jitUtils: typeof stub) => void;
  initCache(stub);
  return registered;
}

describe('vite-plugin-runtypes / parsed-fns virtual module', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits parsedFns entries with structurally-valid metadata', async () => {
    const sources = {
      'pure.ts': `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
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
      expect(response.parsedFnsCacheSource).toBeDefined();
      expect(response.parsedFnsDiagnostics ?? []).toEqual([]);

      const parsedFns = evalParsedFnsModule(response.parsedFnsCacheSource!);
      expect(Object.keys(parsedFns).sort()).toEqual(['mion::asJSONString', 'mion::safeKey']);

      const asJSON = parsedFns['mion::asJSONString'];
      expect(asJSON.bodyHash).toMatch(/^[A-Za-z0-9_-]{14}$/);
      expect(asJSON.paramNames).toEqual([]);
      // Body must be JS-stripped — no `: string` annotation should remain.
      expect(asJSON.code).not.toContain(': string');
      expect(asJSON.code).toContain('return JSON.stringify');
    });
  });

  register('emits PFE9001 diagnostic for non-literal namespace', async () => {
    const sources = {
      'bad-ns.ts': `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
declare function getNs(): string;
export const x = registerPureFnFactory(getNs(), 'fn', function () { return function() {}; });
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const codes = (response.parsedFnsDiagnostics ?? []).map((diag) => diag.code);
      expect(codes).toContain('PFE9001');
    });
  });

  register('emits PFE9003 diagnostic for non-inline factory reference', async () => {
    const sources = {
      'bad-fn.ts': `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
declare const externalFn: () => () => void;
export const x = registerPureFnFactory('mion', 'fn', externalFn);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const codes = (response.parsedFnsDiagnostics ?? []).map((diag) => diag.code);
      expect(codes).toContain('PFE9003');
    });
  });

  register('emits PFE9004 collision diagnostic for mismatched bodies', async () => {
    const sources = {
      'a.ts': `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const a = registerPureFnFactory('mion', 'collideFn', function () {
  return function v1() { return 1; };
});
`,
      'b.ts': `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const b = registerPureFnFactory('mion', 'collideFn', function () {
  return function v2() { return 2; };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const collisions = (response.parsedFnsDiagnostics ?? []).filter((diag) => diag.code === 'PFE9004');
      expect(collisions.length).toBe(1);

      const collision = collisions[0];
      expect(collision.related?.length).toBe(1);
      expect(collision.related?.[0].filePath).not.toBe(collision.site.filePath);
      // Message must include the colliding key in quotes — surface looks
      // similar to TypeScript's "Duplicate identifier 'X'".
      expect(collision.message).toContain('mion::collideFn');

      // Virtual module still loads, with the first-occurrence winner.
      const parsedFns = evalParsedFnsModule(response.parsedFnsCacheSource!);
      expect(parsedFns['mion::collideFn']).toBeDefined();
    });
  });

  register('emits PFE9010 (forbidden identifier) for eval inside a factory body', async () => {
    const sources = {
      'impure.ts': `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const x = registerPureFnFactory('mion', 'evilFn', function () {
  return function _evil() {
    return eval('1+1');
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeCacheSources: ['all']});
      const diags = response.parsedFnsDiagnostics ?? [];
      const evalDiag = diags.find((diag) => diag.code === 'PFE9010' && diag.message.includes('eval'));
      expect(evalDiag).toBeDefined();
      // Ensure the formatted line matches the $tsc problem-matcher regex
      // — VS Code parses build-task output through that pattern.
      const line = formatTscDiagnostic(evalDiag!);
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+error\s+PFE9010:/);
    });
  });

  register('formatTscDiagnostic renders the canonical $tsc problem-matcher line', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9001',
      category: 'error',
      message: 'namespace must be a string literal',
      site: {
        filePath: '/abs/path/x.ts',
        startLine: 12,
        startCol: 5,
        endLine: 12,
        endCol: 9,
      },
    });
    expect(line).toBe('/abs/path/x.ts(12,5): error PFE9001: namespace must be a string literal');
    // VS Code's built-in $tsc problem matcher regex:
    expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+(error|warning)\s+[A-Z]+\d+:\s+.+$/);
  });

  register('formatTscDiagnostic includes Related sites on continuation lines', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9004',
      category: 'error',
      message: 'Duplicate registration of "mion::fn" with mismatched bodyHash',
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
