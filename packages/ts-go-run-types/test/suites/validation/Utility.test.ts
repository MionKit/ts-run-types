// validation / Utility — runs every UTILITY case through isType, getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {UTILITY} from './Utility.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Utility', () => {
  for (const c of Object.values(UTILITY)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
