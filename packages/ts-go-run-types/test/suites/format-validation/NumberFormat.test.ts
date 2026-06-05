// format-validation / NumberFormat — runs every NUMBER_FORMAT case through isType,
// getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {assertIsType, assertMockType, assertFormatGetTypeErrors} from '../../util/validationAsserts.ts';

describe('format-validation / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertFormatGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
