// format-validation / BigintFormat — runs every BIGINT_FORMAT case through isType,
// getTypeErrors, and mockType.
import {describe, it} from 'vitest';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {assertIsType, assertMockType, assertFormatGetTypeErrors} from '../../util/validationAsserts.ts';

describe('format-validation / BigintFormat', () => {
  for (const c of Object.values(BIGINT_FORMAT)) {
    it(`isType — ${c.title}`, () => assertIsType(c));
    it(`getTypeErrors — ${c.title}`, () => assertFormatGetTypeErrors(c));
    it(`mockType — ${c.title}`, () => assertMockType(c));
  }
});
