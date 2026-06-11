// End-to-end acceptance test for the runtype RT-compiler diagnostics
// added in Phase 2 / Phase 3 of the centralised diag catalog. Drives the
// Go binary over inline sources and verifies:
//
//   1. Root-position throw sites (Never, NonSerializable, function at
//      root, array element non-serializable) surface per-family
//      prefixed codes (PJ001, SJ001, TB001, …) — not generic codes —
//      so users can grep their build log by family.
//   2. Each diagnostic carries the marker call site (file:line:col),
//      not just the type-declaration site, so the warning is
//      actionable for the user.
//   3. Child-position silent-skip diagnostics (function-typed
//      properties, methods, static fields) surface with the per-family
//      prefix and the member name in the message.
//   4. Multiple marker calls referencing the same RT ID get one
//      diagnostic each (per user direction: dedup is one-per-call-site,
//      not one-per-typeid).
//   5. The diagnostic wire format flows through to formatTscDiagnostic
//      in the canonical $tsc problem-matcher line shape.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Severity, type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function runtypeDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.RunType);
}

describe('vite-plugin-runtypes / runtype diagnostics', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits PJ001 for Never at root under prepareForJson', async () => {
    // pj is demand-driven now, so seed it via createJsonEncoder(mutate) → [pj].
    const sources = {
      'never.ts': `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const pjNever = diags.find((d) => d.code === 'PJ001');
      expect(pjNever, JSON.stringify(diags, null, 2)).toBeDefined();
      expect(pjNever!.severity).toBe(Severity.Error);
      expect(pjNever!.site.filePath).toContain('never.ts');
      expect(pjNever!.site.startLine).toBeGreaterThan(0);
      // Args carry the kind label; the catalog template substitutes it.
      expect(pjNever!.args).toEqual(['Never']);
    });
  });

  register('emits per-family codes — SJ001 / TB001 / PJ001 — for same root throw', async () => {
    // All three families are demand-driven: seed pj via createJsonEncoder(mutate),
    // sj via createJsonEncoder(direct), and tb via createBinaryEncoder.
    const sources = {
      'never-multi.ts': `import {createJsonEncoder, createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoder<never>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoder<never>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes, [...codes].join(',')).toContain('PJ001');
      expect(codes).toContain('SJ001');
      expect(codes).toContain('TB001');
    });
  });

  register('emits per-call-site fan-out — three marker calls = three diagnostics', async () => {
    // pj is demand-driven; three createJsonEncoder(mutate) sites share one `never`
    // id, so the single rendered pj entry fans the PJ001 diag out to all three.
    const sources = {
      'fan-out.ts': `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const a = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const b = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const c = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const neverDiags = runtypeDiagsOf(response).filter((d) => d.code === 'PJ001');
      expect(neverDiags).toHaveLength(3);
      const lines = new Set(neverDiags.map((d) => d.site.startLine));
      expect(lines.size).toBe(3);
    });
  });

  register('emits child-position warning for function-typed property under validate', async () => {
    // `it` is demand-driven, so seed it via createValidate (a reflection-only
    // getRunTypeId would emit no val_ entry and thus no validate diagnostic).
    const sources = {
      'fn-prop.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
interface User { name: string; onClick: () => void; }
export const _ = createValidate<User>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const dropped = diags.find((d) => (d.code === 'VL010' || d.code === 'VL011') && d.args?.[0] === 'onClick');
      expect(dropped, JSON.stringify(diags, null, 2)).toBeDefined();
      expect(dropped!.severity).toBe(Severity.Warning);
    });
  });

  register('formatTscDiagnostic renders runtype warnings in tsc line format', async () => {
    // pj is demand-driven, so seed it via createJsonEncoder(mutate) → [pj].
    const sources = {
      'fmt-rt.ts': `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const diagnostic = runtypeDiagsOf(response).find((d) => d.code === 'PJ001');
      expect(diagnostic).toBeDefined();
      const line = formatTscDiagnostic(diagnostic!);
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+error\s+PJ001:\s+.+$/);
    });
  });

  register('emits VE020 warning diagnostic for validationErrors on root any/unknown', async () => {
    const sources = {
      'any.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<any>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const warning = diags.find((d) => d.code === 'VE020');
      // VE020 surfaces as Warning (not Info): root any/unknown is an
      // intentional escape hatch but a validator that accepts every
      // value is still a UX surprise worth flagging visibly.
      if (warning) {
        expect(warning.severity).toBe(Severity.Warning);
      }
    });
  });

  register('emits VL021 warning diagnostic for validate on root any/unknown', async () => {
    // `it` is demand-driven, so seed it via createValidate<unknown>() (a
    // reflection-only getRunTypeId would emit no val_ entry, no VL021).
    const sources = {
      'any-istype.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
export const _ = createValidate<unknown>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const warning = diags.find((d) => d.code === 'VL021');
      // VL021 is the validate-family parallel to VE020 — root any/unknown
      // produces a validator that returns true for every value; surface
      // a warning so the user knows the schema is no longer enforced.
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(Severity.Warning);
    });
  });

  // Tuple slots are structural — a function or symbol slot can't be
  // silently dropped without changing the tuple's length / shape on the
  // wire. The serialization families (prepareForJson, prepareForJsonSafe,
  // restoreFromJson, stringifyJson, toBinary, fromBinary) propagate the
  // CodeNS upward so the renderer emits an alwaysThrow factory keyed on
  // the leaf's per-family code. Regression coverage for the array-style
  // short-circuits we removed in the tuple emits.

  register('propagates function-typed tuple slot as alwaysThrow under prepareForJson', async () => {
    // pj/pjs/rj/sj are demand-driven: seed pj via createJsonEncoder(mutate), pjs
    // via the default clone (shape-derived strip), sj via direct, and rj via createJsonDecoder.
    const sources = {
      'fn-tuple.ts': `import {createJsonEncoder, createJsonDecoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<[number, () => void]>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoder<[number, () => void]>();
export const _d = createJsonEncoder<[number, () => void]>(undefined, {strategy: 'direct'});
export const _r = createJsonDecoder<[number, () => void]>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      // One per-family error code per emitter — PJ003 / PJS003 /
      // RJ003 / SJ003 — all on the same function-root leaf.
      expect(codes, [...codes].join(',')).toContain('PJ003');
      expect(codes).toContain('PJS003');
      expect(codes).toContain('RJ003');
      expect(codes).toContain('SJ003');
      // The tuple's prepareForJson entry module must register as
      // alwaysThrow so calling `createJsonEncoder<[number, () => void]>()`
      // throws at the first lookup. Module wire form: slot 8 of the entry
      // array is the alwaysThrowCode.
      const pjThrowModule = Object.values(response.modules ?? {}).find((source) =>
        source.includes(",'pj','tuple',u,false,u,u,u,'PJ003'")
      );
      expect(pjThrowModule, JSON.stringify(Object.keys(response.modules ?? {}))).toBeDefined();
    });
  });

  register('propagates function-typed tuple slot as alwaysThrow under toBinary / fromBinary', async () => {
    // tb/fb are demand-driven, so seed each via the matching binary createX.
    const sources = {
      'fn-tuple-bin.ts': `import {createBinaryEncoder, createBinaryDecoder} from '@mionjs/ts-go-run-types';
export const _e = createBinaryEncoder<[string, () => number]>();
export const _d = createBinaryDecoder<[string, () => number]>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes).toContain('TB003');
      expect(codes).toContain('FB003');
      const tbThrowModule = Object.values(response.modules ?? {}).find((source) =>
        source.includes(",'tb','tuple',u,false,u,u,u,'TB003'")
      );
      expect(tbThrowModule, JSON.stringify(Object.keys(response.modules ?? {}))).toBeDefined();
    });
  });

  register('propagates symbol-typed tuple slot as alwaysThrow under prepareForJson', async () => {
    // Symbol in a tuple slot wasn't covered by the explicit
    // isFunctionLikeKind short-circuit — it took the natural CompileChild
    // path even before the fix. This test pins that behavior so a future
    // optimisation can't silently regress it.
    const sources = {
      'sym-tuple.ts': `import {createJsonEncoder, createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<[number, symbol]>(undefined, {strategy: 'mutate'});
export const _b = createBinaryEncoder<[number, symbol]>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes).toContain('PJ005');
      expect(codes).toContain('TB006');
    });
  });

  // The default emit mode (no inline createRTFn) keeps the cache
  // module compact by leaving the validator body in arg-3 only and
  // shipping the `u` (= undefined) alias as arg-7. The JS-side
  // materializeRTFn rebuilds the factory via `new Function('utl',
  // code)` on first lookup. Test runs themselves opt INTO the
  // inline-factory shape via vitest config (so suites cover both
  // materialisation paths) — this regression spins up a one-shot
  // ResolverClient with the production default and pins the smaller
  // emit shape.
  register('default emit (no inline createRTFn) renders `u` as arg-7 and omits g_<hash>(utl)', async () => {
    // `it` is demand-driven, so seed it via createValidate<User>() — a
    // reflection-only getRunTypeId would emit no val_ entries to inspect.
    const sources = {
      'mini.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
interface User { name: string; age: number; tags: string[]; }
export const _ = createValidate<User>();
`,
    };
    // Slice 4: the validate family prefix is the opaque fnHash the scanner
    // injected into the createValidate site's `fnId`, not the readable `it`
    // tag. Captured from the first scan so both the inline-factory and the
    // one-shot init-line assertions stay correct across version-isolated hashes.
    let itPrefix = '';
    await withInlineSources(sources, async ({client}) => {
      const inlineOn = await client.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      const itSite = inlineOn.sites.find((s) => s.fnId);
      if (!itSite?.fnId) throw new Error('expected a createValidate site with an injected fnId');
      itPrefix = itSite.fnId;
      const inlineOnBody = Object.values(inlineOn.modules ?? {}).join('\n');
      // The default shared client runs with emitCacheFunctions=true so
      // we get the inline factory here as a baseline (slot 7 of the array).
      expect(inlineOnBody, 'shared client should emit the inline factory').toMatch(
        new RegExp('function g_' + itPrefix + '_[A-Za-z0-9]+\\(utl\\)')
      );
    });

    // Spin up a one-shot client with the production default
    // (emitCacheFunctions omitted → false) and assert the smaller shape.
    const {ResolverClient} = await import('../src/resolver-client.ts');
    const path = await import('node:path');
    const ROOT = path.resolve(__dirname, '../../..');
    const oneShot = new ResolverClient(`${ROOT}/bin/ts-go-run-types`, ROOT, '', {serverMode: true});
    try {
      await oneShot.setSources({'runtypes.d.ts': RUNTYPES_DTS, ...sources});
      const response = await oneShot.scanFiles(Object.keys(sources), {
        includeModules: true,
      });
      // Default emit: the entry array carries only the body `code` string —
      // the createRTFn slot is trailing-trimmed away, so the inline closure
      // form must be completely absent from every validate module.
      const body = Object.entries(response.modules ?? {})
        .filter(([key]) => key.startsWith(itPrefix + '_'))
        .map(([, source]) => source)
        .join('\n');
      expect(body.length, 'expected at least one validate module for User').toBeGreaterThan(0);
      expect(body, 'default emit must NOT contain the inline factory closure').not.toMatch(
        new RegExp('function g_' + itPrefix + '_[A-Za-z0-9]+\\(utl\\)')
      );
    } finally {
      oneShot.close();
    }
  });
});

// RUNTYPES_DTS overlay is borrowed via the helper; re-import the
// constant for the one-shot probe above so the inline `setSources`
// call doesn't have to re-declare the marker module.
import {RUNTYPES_DTS} from './helpers/inline.ts';
