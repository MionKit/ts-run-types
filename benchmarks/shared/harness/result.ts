// Per-competitor result JSON: each competitor's `main.ts` writes
// `<results>/<name>.json`; `aggregate.mjs` reads them all and joins by case key.
// This is what makes the runs independent (per-process isolation, Decision D).

import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

export type CaseStatus = 'ok' | 'fail' | 'errored' | 'not-supported';

/** Per-metric result for one case (one of `validate` / `validationErrors`). */
export interface MetricResult {
  status: CaseStatus;
  /** ACCEPT-path throughput: function over the (resolved) valid samples, ops/sec.
   *  0 when not timed (BENCH_NO_TIMING) or when there are no valid samples. */
  validOpsSec: number;
  /** REJECT-path throughput: function over the (resolved) invalid samples, ops/sec.
   *  0 when not timed (BENCH_NO_TIMING) or when there are no invalid samples. */
  invalidOpsSec: number;
  detail: string | null;
}

export interface CaseResult {
  key: string;
  suite: string;
  group: string;
  name: string;
  /** True when this competitor replaced the shared samples for this case. */
  samplesOverridden: boolean;
  /** The cheap boolean validator. */
  validate: MetricResult;
  /** The validation-errors function (boolean-wrapped: true = no errors). */
  validationErrors: MetricResult;
}

export interface MetricSummary {
  ok: number;
  fail: number;
  errored: number;
  notSupported: number;
}

export interface CompetitorResult {
  competitor: string;
  generatedAt: string;
  env: {node: string; timeMs: number; noTiming: boolean};
  cases: CaseResult[];
  summary: {
    total: number;
    validate: MetricSummary;
    validationErrors: MetricSummary;
    // Totals across BOTH metrics — drive the per-competitor process exit code.
    fail: number;
    errored: number;
  };
}

// Each competitor runs with cwd = benchmarks/competitors/<name>, so results live
// two levels up. The driver sets BENCH_RESULTS_DIR explicitly for container runs.
const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? path.resolve(process.cwd(), '..', '..', 'results');

export function writeResult(result: CompetitorResult): void {
  mkdirSync(RESULTS_DIR, {recursive: true});
  writeFileSync(path.join(RESULTS_DIR, `${result.competitor}.json`), JSON.stringify(result, null, 2) + '\n');
}
