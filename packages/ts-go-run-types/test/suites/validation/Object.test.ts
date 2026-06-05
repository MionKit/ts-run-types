// validation / Object — runs every OBJECT case through isType, getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {OBJECT} from './Object.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Object', () => {
  for (const c of Object.values(OBJECT)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
