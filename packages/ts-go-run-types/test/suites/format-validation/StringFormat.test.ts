// format-validation / StringFormat — runs every STRING_FORMAT case through isType,
// getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import {assertIsType, assertMockType, assertFormatGetTypeErrors} from '../../util/validationAsserts.ts';

describe('format-validation / StringFormat', () => {
  for (const c of Object.values(STRING_FORMAT)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertFormatGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
