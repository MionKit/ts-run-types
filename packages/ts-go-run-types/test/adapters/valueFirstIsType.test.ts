// Value-first `define` adapter — runs every VALUE_FIRST_SUITE case through the
// precompiled validator the Go binary emits for a `ModelType<typeof Model>`
// type. Proves the value-first authoring surface lowers to the same RunType
// graph + emitters as the type-first surface (hash-level convergence is
// asserted separately in vite-plugin-runtypes/test/value-first.test.ts).
//
// Shape mirrors formatIsType.test.ts: one explicit `it(...)` per case in suite
// order + a coverage-guard counter. Each case runs `assertIsType` (static +
// reflect + deserialize forms) and a light getTypeErrors check (valid → no
// errors, invalid → at least one error) so both RT families are exercised
// without brittle full-error deep-equals.

import {afterEach, describe, expect, it} from 'vitest';
import {VALUE_FIRST_SUITE, type ValueFirstCase} from '../suites/value-first-define-suite.ts';
import {assertIsType} from '../util/validationAsserts.ts';

function assertCase(c: ValueFirstCase): void {
  assertIsType(c);

  const {valid, invalid} = c.getSamples();
  const getErr = c.getTypeErrors();
  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title} [getTypeErrors]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErr(v).length, `${c.title} [getTypeErrors]: invalid[${i}] → ≥1 error`).toBeGreaterThan(0);
  });
}

describe('value-first define / isType + getTypeErrors', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('flat model — many string/number/date fields', () => assertCase(VALUE_FIRST_SUITE.flat_mixed));
  it('string fields — length / minLength / maxLength / allowedValues', () => assertCase(VALUE_FIRST_SUITE.string_features));
  it('number fields — bounds / exclusive / integer / float / multipleOf', () => assertCase(VALUE_FIRST_SUITE.number_features));
  it('date fields — relative now bound + absolute window', () => assertCase(VALUE_FIRST_SUITE.date_bounds));
  it('regex — inline /…/, {source,flags}, registerFormatPattern via the value channel', () =>
    assertCase(VALUE_FIRST_SUITE.regex_patterns));
  it('optional — `optional(...)` fields may be absent; present ones validate', () =>
    assertCase(VALUE_FIRST_SUITE.optional_fields));
  it('scalars — boolean + bigint leaf formats', () => assertCase(VALUE_FIRST_SUITE.scalars));
  it('temporal — Instant (min bound) + optional PlainDate (max bound)', () => assertCase(VALUE_FIRST_SUITE.temporal));
  it('nested — value-first models composed in a parent object', () => assertCase(VALUE_FIRST_SUITE.nested));

  it('all VALUE_FIRST_SUITE tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALUE_FIRST_SUITE).length);
  });
});
