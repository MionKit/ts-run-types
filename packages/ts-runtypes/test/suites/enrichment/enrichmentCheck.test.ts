// Entry 2 of the AI-enrichment generation suite: synthesize a `.rt.ts` per case
// from the authored `src` + `friendly` + `mock` spans, run `ts-runtypes check`,
// and assert ZERO findings. These maps are valid + tsc-checked, so `check` must
// not false-positive across the type ranges. (The "check catches real errors"
// direction stays on the Go unit tests with deliberately-broken maps.) See
// docs/AI_ENRICHMENT_TEST_PLAN.md.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {checkCategory, cleanupTempDir, type CaseCheck} from '../../util/enrichmentGen.ts';
import {ENRICHMENT_CASES, ENRICHMENT_CATEGORIES} from './cases/index.ts';
import type {EnrichmentCase} from './cases/types.ts';

afterAll(() => cleanupTempDir('check'));

for (const {constName, fileBase} of ENRICHMENT_CATEGORIES) {
  const cases = ENRICHMENT_CASES[constName as keyof typeof ENRICHMENT_CASES] as Record<string, EnrichmentCase>;

  describe(`enrichment check — ${constName}`, () => {
    let checks: Record<string, CaseCheck>;

    beforeAll(() => {
      checks = checkCategory(fileBase, constName);
    });

    it('checked every case (no missing key)', () => {
      expect(Object.keys(checks).sort()).toEqual(Object.keys(cases).sort());
    });

    for (const [caseKey, theCase] of Object.entries(cases)) {
      it(`${theCase.title} — check reports zero findings`, () => {
        const check = checks[caseKey];
        expect(check, `no check result for case '${caseKey}'`).toBeDefined();
        expect(check.findings, JSON.stringify(check.findings)).toEqual([]);
      });
    }
  });
}
