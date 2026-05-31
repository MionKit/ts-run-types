// validation / Atomic — runs every ATOMIC case through isType, getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {ATOMIC} from './Atomic.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / Atomic', () => {
  for (const c of Object.values(ATOMIC)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
