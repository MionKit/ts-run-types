// validation / Union — runs every UNION case through isType, getTypeErrors, and mockType.
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
