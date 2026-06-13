// Shared shape for every library's validator table.

import type {CaseName} from '../suite/samples.ts';

export type Validator = (value: unknown) => boolean;

/** Sentinel: this library cannot express the case's type. The runner skips it
 *  (reported as "not supported") instead of counting it as a failure. */
export const NOT_SUPPORTED = 'not-supported' as const;

export type ValidatorOrUnsupported = Validator | typeof NOT_SUPPORTED;

/** Every library exports one of these — a validator (or the not-supported
 *  sentinel) for each case. The `Record<CaseName, …>` forces every library to
 *  consciously account for every case. */
export type ValidatorMap = Record<CaseName, ValidatorOrUnsupported>;
