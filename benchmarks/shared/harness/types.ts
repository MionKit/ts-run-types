// The contract EVERY competitor satisfies — including ts-go-run-types, which is
// just another competitor. The runner (./runner.ts) is generic over this; it has
// zero competitor-specific branches.

import type {CaseKey} from '../cases/index.ts';

export type Validator = (value: unknown) => boolean;

/** A competitor deliberately does not support a case. Rendered "—" in the table,
 *  never counted as a failure. */
export const NOT_SUPPORTED = 'not-supported' as const;
export type NotSupported = typeof NOT_SUPPORTED;

/** Optional per-competitor sample override for a single case. The benchmark
 *  validates BOTH paths (valid = accepted, invalid = rejected) and measures each
 *  path's throughput SEPARATELY. The shared case samples were authored for
 *  ts-go-run-types' semantics; when a competitor's accept/reject set genuinely
 *  differs, it may replace either array here. A provided field REPLACES the
 *  shared samples for that path (used for BOTH correctness and timing); omit a
 *  field to keep the shared samples for that path. Keep both paths non-empty and
 *  representative, and add a one-line reason at the call site. */
export interface SampleOverride {
  valid?: unknown[];
  invalid?: unknown[];
}

/** Builder + optional sample override — the object form of a case entry. */
export interface CaseBuilder {
  build: () => Validator;
  samples?: SampleOverride;
}

/** What a competitor declares PER CASE: a LAZY builder that returns the validator
 *  (built once at run start, so compile/build cost is paid then and a throw is
 *  attributable to this one case), OR the same builder paired with a sample
 *  override (`{build, samples}`), OR the explicit opt-out. A builder that THROWS
 *  is recorded as a hard `errored` (a broken plugin rewrite for ts-go, a broken
 *  schema for the others) — never a silent not-supported. */
export type CaseEntry = (() => Validator) | CaseBuilder | NotSupported;

/** A competitor's cases as a TOTAL map over every shared case key, so TS fails
 *  the build if a case is unhandled. This is the "function OR explicit
 *  not-supported, for every case" guarantee. */
export type CompetitorCases = Record<CaseKey, CaseEntry>;

export interface CompetitorModule {
  name: string;
  cases: CompetitorCases;
}
