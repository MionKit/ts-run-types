// validation / Array — runs every ARRAY case through isType, getTypeErrors, and mockType.
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
