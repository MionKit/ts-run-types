// Shared validator types for the benchmark.

export type Validator = (value: unknown) => boolean;

/** Sentinel: a library cannot express this case's type. Rendered "—" and
 *  skipped (never counted as a failure). */
export const NOT_SUPPORTED = 'not-supported' as const;

export type ValidatorOrUnsupported = Validator | typeof NOT_SUPPORTED;

/** A competitor library provides a PARTIAL map keyed by case key
 *  (`GROUP.case`). Any key it omits is treated as not-supported. */
export type CompetitorMap = Record<string, ValidatorOrUnsupported>;
