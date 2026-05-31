// validation / Tuple — every TUPLE case run through isType, getTypeErrors, and mockType,
// each delegating to its shared helper in util/validationAsserts.ts.
import {describe, it} from 'vitest';
import {TUPLE} from './Tuple.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Tuple', () => {
  for (const c of Object.values(TUPLE)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
