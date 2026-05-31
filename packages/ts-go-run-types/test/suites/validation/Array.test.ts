// validation / Array — every ARRAY case run through isType, getTypeErrors, and mockType,
// each delegating to its shared helper in util/validationAsserts.ts.
import {describe, it} from 'vitest';
import {ARRAY} from './Array.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Array', () => {
  for (const c of Object.values(ARRAY)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
