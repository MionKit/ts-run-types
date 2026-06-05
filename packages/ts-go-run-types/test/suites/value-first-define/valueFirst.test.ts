// value-first define — every VALUE_FIRST_SUITE case run through isType and a light getTypeErrors
// contract check, each delegating to its shared helper in util/validationAsserts.ts.
import {describe, it} from 'vitest';
import {VALUE_FIRST_SUITE} from './index.ts';
import {assertIsType, assertGetTypeErrorsContract} from '../../util/validationAsserts.ts';

describe('value-first define', () => {
  for (const c of Object.values(VALUE_FIRST_SUITE)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertGetTypeErrorsContract(c));
  }
});
