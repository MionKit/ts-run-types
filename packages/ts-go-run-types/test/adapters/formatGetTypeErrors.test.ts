// format getTypeErrors adapter — for every STRING_FORMAT case carrying
// a `getTypeErrors` thunk, asserts valid samples produce no errors and
// each invalid sample produces the expected format-error payload.
//
// Unlike the atomic getTypeErrors adapter (which deep-equals the full
// RunTypeError[]), format diagnostics are matched on the `format`
// payload — name, optional `val`, optional tail of `formatPath` — via
// the case's index-parallel `expectedFormatErrors`. This mirrors how
// the old stringFormats.test.ts asserted format diagnostics (find the
// error by format.name, then check val / formatPath) and stays robust
// against incidental fields in the error envelope.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_VALIDATION_SUITE, type FormatValidationCase} from '../suites/format-validation-suite.ts';

function assertFormatGetTypeErrors(c: FormatValidationCase): void {
  if (!c.getTypeErrors) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);
  if (!c.expectedFormatErrors) throw new Error(`case ${c.title}: missing expectedFormatErrors thunk`);

  const {valid, invalid} = c.getSamples();
  const expected = c.expectedFormatErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: expectedFormatErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  const getErr = c.getTypeErrors();

  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title}: valid[${i}] → no errors`).toEqual([]);
  });

  invalid.forEach((v, i) => {
    const errors = getErr(v);
    expect(errors.length, `${c.title}: invalid[${i}] should produce at least one error`).toBeGreaterThan(0);

    const exp = expected[i];
    if (!exp) return;

    const formatErr = errors.find((entry) => entry.format?.name === exp.name)?.format;
    expect(formatErr, `${c.title}: invalid[${i}] should carry a '${exp.name}' format error`).toBeDefined();

    if (exp.val !== undefined) {
      expect(formatErr?.val, `${c.title}: invalid[${i}] format.val`).toEqual(exp.val);
    }
    if (exp.formatPathTail !== undefined) {
      const path = formatErr?.formatPath;
      expect(path?.[path.length - 1], `${c.title}: invalid[${i}] format.formatPath tail`).toBe(exp.formatPathTail);
    }
  });
}

describe('format getTypeErrors / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  const cases = Object.values(FORMAT_VALIDATION_SUITE.STRING_FORMAT);
  for (const c of cases) {
    if (c.getTypeErrors) {
      it(c.title, () => assertFormatGetTypeErrors(c));
    } else {
      it.todo(c.title);
    }
  }

  it('all STRING_FORMAT getTypeErrors tests ran', () => {
    expect(ranTests).toBe(cases.filter((c) => c.getTypeErrors).length);
  });
});
