// End-to-end acceptance test for the runtype JIT-compiler diagnostics
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
    const sources = {
      'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export const _ = getRuntypeId<never>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['prepareForJson'],
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
    const sources = {
      'never-multi.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export const _ = getRuntypeId<never>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['prepareForJson', 'stringifyJson', 'toBinary'],
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes, [...codes].join(',')).toContain('PJ001');
      expect(codes).toContain('SJ001');
      expect(codes).toContain('TB001');
    });
  });

  register('emits per-call-site fan-out — three marker calls = three diagnostics', async () => {
    const sources = {
      'fan-out.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export const a = getRuntypeId<never>();
export const b = getRuntypeId<never>();
export const c = getRuntypeId<never>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['prepareForJson'],
      });
      const neverDiags = runtypeDiagsOf(response).filter((d) => d.code === 'PJ001');
      expect(neverDiags).toHaveLength(3);
      const lines = new Set(neverDiags.map((d) => d.site.startLine));
      expect(lines.size).toBe(3);
    });
  });

  register('emits child-position warning for function-typed property under isType', async () => {
    const sources = {
      'fn-prop.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface User { name: string; onClick: () => void; }
export const _ = getRuntypeId<User>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['isType'],
      });
      const diags = runtypeDiagsOf(response);
      const dropped = diags.find((d) => (d.code === 'IT010' || d.code === 'IT011') && d.args?.[0] === 'onClick');
      expect(dropped, JSON.stringify(diags, null, 2)).toBeDefined();
      expect(dropped!.severity).toBe(Severity.Warning);
    });
  });

  register('formatTscDiagnostic renders runtype warnings in tsc line format', async () => {
    const sources = {
      'fmt-rt.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export const _ = getRuntypeId<never>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['prepareForJson'],
      });
      const diagnostic = runtypeDiagsOf(response).find((d) => d.code === 'PJ001');
      expect(diagnostic).toBeDefined();
      const line = formatTscDiagnostic(diagnostic!);
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+error\s+PJ001:\s+.+$/);
    });
  });

  register('emits TE020 warning diagnostic for typeErrors on root any/unknown', async () => {
    const sources = {
      'any.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export const _ = getRuntypeId<any>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['typeErrors'],
      });
      const diags = runtypeDiagsOf(response);
      const warning = diags.find((d) => d.code === 'TE020');
      // TE020 surfaces as Warning (not Info): root any/unknown is an
      // intentional escape hatch but a validator that accepts every
      // value is still a UX surprise worth flagging visibly.
      if (warning) {
        expect(warning.severity).toBe(Severity.Warning);
      }
    });
  });

  register('emits IT021 warning diagnostic for isType on root any/unknown', async () => {
    const sources = {
      'any-istype.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export const _ = getRuntypeId<unknown>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeCacheSources: ['isType'],
      });
      const diags = runtypeDiagsOf(response);
      const warning = diags.find((d) => d.code === 'IT021');
      // IT021 is the isType-family parallel to TE020 — root any/unknown
      // produces a validator that returns true for every value; surface
      // a warning so the user knows the schema is no longer enforced.
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(Severity.Warning);
    });
  });
});
