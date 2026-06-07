// The contract EVERY competitor satisfies — including ts-go-run-types, which is
// just another competitor. The runner (./runner.ts) is generic over this; it has
// zero competitor-specific branches.

import type {CaseKey} from '../cases/index.ts';

export type Validator = (value: unknown) => boolean;

/** A competitor deliberately does not support a case. Rendered "—" in the table,
 *  never counted as a failure. */
export const NOT_SUPPORTED = 'not-supported' as const;
export type NotSupported = typeof NOT_SUPPORTED;

/** What a competitor declares PER CASE: a LAZY builder that returns the validator
 *  (built once at run start, so compile/build cost is paid then and a throw is
 *  attributable to this one case), OR the explicit opt-out. A builder that THROWS
 *  is recorded as a hard `errored` (a broken plugin rewrite for ts-go, a broken
 *  schema for the others) — never a silent not-supported. */
export type CaseEntry = (() => Validator) | NotSupported;

/** A competitor's cases as a TOTAL map over every shared case key, so TS fails
 *  the build if a case is unhandled. This is the "function OR explicit
 *  not-supported, for every case" guarantee. */
export type CompetitorCases = Record<CaseKey, CaseEntry>;

export interface CompetitorModule {
  name: string;
  cases: CompetitorCases;
}
