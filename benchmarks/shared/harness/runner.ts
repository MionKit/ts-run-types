// Generic per-competitor run loop. Iterates EVERY shared case; for each, builds
// the competitor's validator (or records not-supported), checks correctness on
// BOTH paths, then measures the accept (valid) and reject (invalid) paths
// SEPARATELY — they exercise different validator code and typically have very
// different throughput. No competitor is special-cased — a thrown builder is a
// hard `errored` for any competitor (a broken plugin rewrite for ts-go, a broken
// schema for the rest), surfaced loudly rather than hidden as not-supported.
//
// A case entry may be a bare builder (`() => Validator`) or the object form
// `{build, samples}`. When `samples.valid` / `samples.invalid` is given it
// REPLACES the shared samples for that path — for both the correctness check and
// the throughput measurement — so a competitor whose accept/reject set diverges
// from the ts-go-authored shared data can still benchmark both paths faithfully.

import {iterateCases} from '../cases/index.ts';
import {NOT_SUPPORTED, type CaseEntry, type SampleOverride, type CompetitorModule, type Validator} from './types.ts';
import {check, benchOps} from './measure.ts';
import type {CaseResult, CompetitorResult} from './result.ts';

const NO_TIMING = process.env.BENCH_NO_TIMING === '1';
const TIME_MS = Number(process.env.BENCH_TIME_MS ?? 100);

// Collapse a case entry to a builder + sample override, or null for opt-out.
function normalize(entry: CaseEntry | undefined): {build: () => Validator; override: SampleOverride} | null {
  if (entry === NOT_SUPPORTED || entry === undefined) return null;
  if (typeof entry === 'function') return {build: entry, override: {}};
  return {build: entry.build, override: entry.samples ?? {}};
}

export function runCompetitor(competitorModule: CompetitorModule): CompetitorResult {
  const cases: CaseResult[] = [];
  const summary = {ok: 0, fail: 0, errored: 0, notSupported: 0, total: 0};

  for (const iterated of iterateCases()) {
    summary.total++;
    const base = {key: iterated.key, suite: iterated.suite, group: iterated.group, name: iterated.name};
    const norm = normalize(competitorModule.cases[iterated.key]);

    if (norm === null) {
      summary.notSupported++;
      cases.push({...base, status: 'not-supported', validOpsSec: 0, invalidOpsSec: 0, samplesOverridden: false, detail: null});
      continue;
    }

    const overridden = norm.override.valid !== undefined || norm.override.invalid !== undefined;

    let validator: Validator;
    try {
      validator = norm.build();
    } catch (err) {
      summary.errored++;
      cases.push({...base, status: 'errored', validOpsSec: 0, invalidOpsSec: 0, samplesOverridden: overridden, detail: err instanceof Error ? err.message : String(err)});
      continue;
    }

    let shared: {valid: unknown[]; invalid: unknown[]};
    try {
      shared = iterated.case.getSamples();
    } catch (err) {
      summary.errored++;
      cases.push({...base, status: 'errored', validOpsSec: 0, invalidOpsSec: 0, samplesOverridden: overridden, detail: `getSamples threw: ${err instanceof Error ? err.message : String(err)}`});
      continue;
    }

    // A provided override array REPLACES the shared samples for that path.
    const validSamples = norm.override.valid ?? shared.valid;
    const invalidSamples = norm.override.invalid ?? shared.invalid;

    const badValid = check(validator, validSamples, true);
    if (badValid >= 0) {
      summary.fail++;
      cases.push({...base, status: 'fail', validOpsSec: 0, invalidOpsSec: 0, samplesOverridden: overridden, detail: `valid[${badValid}] rejected`});
      continue;
    }
    const badInvalid = check(validator, invalidSamples, false);
    if (badInvalid >= 0) {
      summary.fail++;
      cases.push({...base, status: 'fail', validOpsSec: 0, invalidOpsSec: 0, samplesOverridden: overridden, detail: `invalid[${badInvalid}] accepted`});
      continue;
    }

    summary.ok++;
    cases.push({
      ...base,
      status: 'ok',
      validOpsSec: NO_TIMING ? 0 : benchOps(validator, validSamples),
      invalidOpsSec: NO_TIMING ? 0 : benchOps(validator, invalidSamples),
      samplesOverridden: overridden,
      detail: null,
    });
  }

  return {
    competitor: competitorModule.name,
    generatedAt: new Date().toISOString(),
    env: {node: process.version, timeMs: TIME_MS, noTiming: NO_TIMING},
    cases,
    summary,
  };
}
