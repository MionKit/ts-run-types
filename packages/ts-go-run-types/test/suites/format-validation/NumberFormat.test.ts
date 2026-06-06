// format-validation / NumberFormat — per-variant it() blocks: every NUMBER_FORMAT
// case yields up to 9 it()s (5 validate + 2 getValidationErrors [format + schema] +
// 2 mockType). The format variant uses the format-payload assertion
// (assertFormatGetValidationErrorsStatic); the schema variant the value-first contract
// check (assertGetValidationErrorsSchema). The other 3 getValidationErrors forms aren't
// exercised by the format-validation suites. Missing thunks → " (not implemented)" suffix.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {
  assertValidateStatic,
  assertValidateReflect,
  assertValidateDeserializeStatic,
  assertValidateDeserializeReflect,
  assertValidateSchema,
  assertFormatGetValidationErrorsStatic,
  assertGetValidationErrorsSchema,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('format-validation / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(titleFor(c, 'validate/static'), () => assertValidateStatic(c));
    it(titleFor(c, 'validate/reflect'), () => assertValidateReflect(c));
    it(titleFor(c, 'validate/deserialize-static'), () => assertValidateDeserializeStatic(c));
    it(titleFor(c, 'validate/deserialize-reflect'), () => assertValidateDeserializeReflect(c));
    it(titleFor(c, 'validate/schema'), () => assertValidateSchema(c));

    it(titleFor(c, 'getValidationErrors/format'), () => assertFormatGetValidationErrorsStatic(c));
    it(titleFor(c, 'getValidationErrors/schema'), () => assertGetValidationErrorsSchema(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
