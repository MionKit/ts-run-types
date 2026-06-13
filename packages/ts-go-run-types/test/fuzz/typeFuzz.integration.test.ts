// Phase 2 end-to-end: generate random TYPES and drive each through the real
// resolver → plugin → runtime pipeline, checking the Tier-A (resolver/emit,
// TR1–TR4) and Tier-B (value, O1–O7) oracles. Unlike fuzz.integration.test.ts
// (which fuzzes values against a FIXED set of hand-written types), this fuzzes
// the type space itself via an inline-server resolver fed generated source.
//
// Needs the Go binary (spawned by the harness's ResolverClient); skipped when
// it isn't built.

import {describe, it, expect} from 'vitest';
import {openClient, hasBinary} from './typeFuzzHarness.ts';
import {runTypeFuzz, runTypeFuzzForDuration} from './typeFuzzRunner.ts';

describe('fuzz / type-generation — oracle sweep over generated types', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const client = openClient();
      try {
        const report = await runTypeFuzz(client, {seed: 0xc0ffee, iterations: 80});
        if (report.violations.length > 0) {
          const summary = report.violations
            .slice(0, 25)
            .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      src/val=${v.value}`)
            .join('\n');
          throw new Error(
            `${report.violations.length} oracle violation(s) over ${report.runs} generated types:\n${summary}` +
              (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
          );
        }
        expect(report.runs).toBe(80);
      } finally {
        client.close();
      }
    },
    60_000
  );

  // Autonomous soak: opt-in via FUZZ_TYPES_SOAK_MS=<ms>. Generates types
  // continuously for the duration, logging every violation with its seed.
  const soakMs = Number(process.env.FUZZ_TYPES_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — generate types continuously and log all findings',
    async () => {
      const client = openClient();
      try {
        const report = await runTypeFuzzForDuration(client, soakMs, {seed: Number(process.env.FUZZ_SEED ?? 1)}, (v) => {
          console.error(`[type-fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
        });
        console.error(`[type-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s)`);
        expect(report.violations).toHaveLength(0);
      } finally {
        client.close();
      }
    },
    soakMs + 30_000
  );
});
