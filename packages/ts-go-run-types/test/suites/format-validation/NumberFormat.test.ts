// format-validation / NumberFormat — per-variant it() blocks: every NUMBER_FORMAT
// case yields up to 9 it()s (5 isType + 2 getTypeErrors [format + schema] +
// 2 mockType). The format variant uses the format-payload assertion
// (assertFormatGetTypeErrorsStatic); the schema variant the value-first contract
// check (assertGetTypeErrorsSchema). The other 3 getTypeErrors forms aren't
// exercised by the format-validation suites. Missing thunks → " (not implemented)" suffix.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {
  assertIsTypeStatic,
  assertIsTypeReflect,
  assertIsTypeDeserializeStatic,
  assertIsTypeDeserializeReflect,
  assertIsTypeSchema,
  assertFormatGetTypeErrorsStatic,
  assertGetTypeErrorsSchema,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('format-validation / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(titleFor(c, 'isType/static'), () => assertIsTypeStatic(c));
    it(titleFor(c, 'isType/reflect'), () => assertIsTypeReflect(c));
    it(titleFor(c, 'isType/deserialize-static'), () => assertIsTypeDeserializeStatic(c));
    it(titleFor(c, 'isType/deserialize-reflect'), () => assertIsTypeDeserializeReflect(c));
    it(titleFor(c, 'isType/schema'), () => assertIsTypeSchema(c));

    it(titleFor(c, 'getTypeErrors/format'), () => assertFormatGetTypeErrorsStatic(c));
    it(titleFor(c, 'getTypeErrors/schema'), () => assertGetTypeErrorsSchema(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
