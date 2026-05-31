// validation / TypeMappings — every TYPE_MAPPINGS case run through isType, getTypeErrors, and mockType,
// each delegating to its shared helper in util/validationAsserts.ts.
import {describe, it} from 'vitest';
import {TYPE_MAPPINGS} from './TypeMappings.ts';
import {assertIsType, assertGetTypeErrors, assertMockType} from '../../util/validationAsserts.ts';

describe('validation / TypeMappings', () => {
  for (const c of Object.values(TYPE_MAPPINGS)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
