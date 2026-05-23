// getTypeErrors adapter — runs every ValidationCase whose `getTypeErrors`
// thunk is defined against the precompiled validator the Go binary emits
// via internal/caches/jitfn/typeerrors.go.
//
// Mirrors `isType.test.ts` shape exactly — one `describe(...)` per
// category, one `it(...)` per case (no for-loop registration), a
// per-describe counter + coverage-guard `it('all <category>
// getTypeErrors tests ran', …)` that fails if a new case in the
// validation suite is missed here.
//
// Cases the Go emitter doesn't support yet leave their `getTypeErrors`
// thunk undefined; the coverage guard reads the active-count off the
// suite at run time, so the file scales naturally as kinds land.

import {afterEach, describe, expect, it} from 'vitest';
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

function assertGetTypeErrors(c: ValidationCase): void {
  if (!c.getTypeErrors) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();

  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  // Static form: createGetTypeErrors<T>().
  const getErrStatic = c.getTypeErrors();
  valid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: invalid[${i}]`).toEqual(expected[i]);
  });

  // Reflect form: createGetTypeErrors(value). Optional.
  if (c.getTypeErrorsReflect) {
    const getErrReflect = c.getTypeErrorsReflect();
    valid.forEach((v, i) => {
      expect(getErrReflect(v), `${c.title} [reflect]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(getErrReflect(v), `${c.title} [reflect]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Deserialize-static form: deserializeGetTypeErrors<T>().
  if (c.deserializeGetTypeErrors) {
    const deserializedStatic = c.deserializeGetTypeErrors();
    valid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Deserialize-reflect form: deserializeGetTypeErrors(value).
  if (c.deserializeGetTypeErrorsReflect) {
    const deserializedReflect = c.deserializeGetTypeErrorsReflect();
    valid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}]`).toEqual(expected[i]);
    });
  }
}

describe('getTypeErrors / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.any));
  it('BigInt primitive', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.object));
  it('RegExp instance', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.regexp));
  it('String primitive', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.string));
  it('Symbol primitive', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.void));

  // noLiterals variants — literal types degrade to their base kind.
  it('Numeric literal with noLiterals (degrades to number)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_symbol_noLiterals));

  it('all atomic getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.ATOMIC).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});
