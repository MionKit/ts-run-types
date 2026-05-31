// format-validation / StringFormat — per-variant it() blocks: every STRING_FORMAT
// case yields up to 8 it()s (5 isType + 1 getTypeErrors/format + 2 mockType).
// The getTypeErrors variant uses the format-payload assertion (assertFormatGet-
// TypeErrorsStatic); the other 4 getTypeErrors forms aren't exercised by the
// format-validation suites. Missing thunks → " (not implemented)" suffix.
import {describe, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import {
  assertIsTypeStatic,
  assertIsTypeReflect,
  assertIsTypeDeserializeStatic,
  assertIsTypeDeserializeReflect,
  assertIsTypeSchema,
  assertFormatGetTypeErrorsStatic,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('format-validation / StringFormat', () => {
  for (const c of Object.values(STRING_FORMAT)) {
    it(titleFor(c, 'isType/static'), () => assertIsTypeStatic(c));
    it(titleFor(c, 'isType/reflect'), () => assertIsTypeReflect(c));
    it(titleFor(c, 'isType/deserialize-static'), () => assertIsTypeDeserializeStatic(c));
    it(titleFor(c, 'isType/deserialize-reflect'), () => assertIsTypeDeserializeReflect(c));
    it(titleFor(c, 'isType/schema'), () => assertIsTypeSchema(c));

    it(titleFor(c, 'getTypeErrors/format'), () => assertFormatGetTypeErrorsStatic(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
