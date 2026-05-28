// format mockType adapter — for every STRING_FORMAT case carrying a
// `mockType` thunk, draws N values from the generator and asserts each
// passes the paired `isType<T>()`. Sibling of mockType.test.ts; shares
// the same `assertMockType` helper.
//
// Cases without a `mockType` thunk register as `it.todo` (which does
// not fire `afterEach`), so the coverage guard compares against the
// count of mock-bearing cases only.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_VALIDATION_SUITE} from '../suites/format-validation-suite.ts';
import {assertMockType} from '../util/validationAsserts.ts';

describe('format mockType / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  const cases = Object.values(FORMAT_VALIDATION_SUITE.STRING_FORMAT);
  for (const c of cases) {
    if (c.mockType) {
      it(c.title, () => assertMockType(c));
    } else {
      it.todo(c.title);
    }
  }

  it('all STRING_FORMAT mockType tests ran', () => {
    expect(ranTests).toBe(cases.filter((c) => c.mockType).length);
  });
});
