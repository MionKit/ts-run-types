// validation / Native — runs every NATIVE case through isType, getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {NATIVE} from './Native.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Native', () => {
  for (const c of Object.values(NATIVE)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
