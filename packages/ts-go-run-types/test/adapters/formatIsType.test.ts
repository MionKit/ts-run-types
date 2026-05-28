// format isType adapter — runs every STRING_FORMAT case in
// FORMAT_VALIDATION_SUITE through the precompiled validator the Go
// binary emits for format-branded types. Sibling of isType.test.ts;
// shares the same `assertIsType` helper.
//
// One `it()` per case via a for-loop (the case set is uniform — every
// format case carries an `isType` thunk), plus a coverage-guard `it()`
// that fails if a case lands in the suite without running here.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_VALIDATION_SUITE} from '../suites/format-validation-suite.ts';
import {assertIsType} from '../util/validationAsserts.ts';

describe('format isType / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  for (const c of Object.values(FORMAT_VALIDATION_SUITE.STRING_FORMAT)) {
    it(c.title, () => assertIsType(c));
  }

  it('all STRING_FORMAT isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(FORMAT_VALIDATION_SUITE.STRING_FORMAT).length);
  });
});
