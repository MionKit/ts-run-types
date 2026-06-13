// Generic per-competitor run loop. Iterates EVERY shared case; for each, builds
// the competitor's validator (or records not-supported), checks correctness, then
// measures throughput. No competitor is special-cased — a thrown builder is a
// hard `errored` for any competitor (a broken plugin rewrite for ts-go, a broken
// schema for the rest), surfaced loudly rather than hidden as not-supported.

import {iterateCases} from '../cases/index.ts';
import {NOT_SUPPORTED, type CompetitorModule, type Validator} from './types.ts';
import {check, benchOps} from './measure.ts';
import type {CaseResult, CompetitorResult} from './result.ts';

const NO_TIMING = process.env.BENCH_NO_TIMING === '1';
const TIME_MS = Number(process.env.BENCH_TIME_MS ?? 100);

export function runCompetitor(competitorModule: CompetitorModule): CompetitorResult {
  const cases: CaseResult[] = [];
  const summary = {ok: 0, fail: 0, errored: 0, notSupported: 0, total: 0};

  for (const iterated of iterateCases()) {
    summary.total++;
    const base = {key: iterated.key, suite: iterated.suite, group: iterated.group, name: iterated.name};
    const entry = competitorModule.cases[iterated.key];

    if (entry === NOT_SUPPORTED || entry === undefined) {
      summary.notSupported++;
      cases.push({...base, status: 'not-supported', opsSec: 0, detail: null});
      continue;
    }

    let validator: Validator;
    try {
      validator = entry();
    } catch (err) {
      summary.errored++;
      cases.push({...base, status: 'errored', opsSec: 0, detail: err instanceof Error ? err.message : String(err)});
      continue;
    }

    let samples: {valid: unknown[]; invalid: unknown[]};
    try {
      samples = iterated.case.getSamples();
    } catch (err) {
      summary.errored++;
      cases.push({...base, status: 'errored', opsSec: 0, detail: `getSamples threw: ${err instanceof Error ? err.message : String(err)}`});
      continue;
    }

    const badValid = check(validator, samples.valid, true);
    if (badValid >= 0) {
      summary.fail++;
      cases.push({...base, status: 'fail', opsSec: 0, detail: `valid[${badValid}] rejected`});
      continue;
    }
    const badInvalid = check(validator, samples.invalid, false);
    if (badInvalid >= 0) {
      summary.fail++;
      cases.push({...base, status: 'fail', opsSec: 0, detail: `invalid[${badInvalid}] accepted`});
      continue;
    }

    summary.ok++;
    const all = [...samples.valid, ...samples.invalid];
    cases.push({...base, status: 'ok', opsSec: NO_TIMING ? 0 : benchOps(validator, all), detail: null});
  }

  return {
    competitor: competitorModule.name,
    generatedAt: new Date().toISOString(),
    env: {node: process.version, timeMs: TIME_MS, noTiming: NO_TIMING},
    cases,
    summary,
  };
}
