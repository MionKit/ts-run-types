// validation / Union — every UNION case run through isType, getTypeErrors, and mockType,
// each delegating to its shared helper in util/validationAsserts.ts.
import {describe, it} from 'vitest';
import {UNION} from './Union.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Union', () => {
  for (const c of Object.values(UNION)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
