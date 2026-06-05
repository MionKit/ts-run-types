// validation / TemplateLiteral — per-variant it() blocks: every TEMPLATE_LITERAL
// case yields up to 12 it()s (5 isType + 5 getTypeErrors + 2 mockType), each
// driven by its own helper in util/validationAsserts.ts. A missing thunk is
// signaled by the " (not implemented)" suffix in the it() title.
import {describe, it} from 'vitest';
import {TEMPLATE_LITERAL} from './TemplateLiteral.ts';
import {
  assertIsTypeStatic,
  assertIsTypeReflect,
  assertIsTypeDeserializeStatic,
  assertIsTypeDeserializeReflect,
  assertIsTypeSchema,
  assertGetTypeErrorsStatic,
  assertGetTypeErrorsReflect,
  assertGetTypeErrorsDeserializeStatic,
  assertGetTypeErrorsDeserializeReflect,
  assertGetTypeErrorsSchema,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('validation / TemplateLiteral', () => {
  for (const c of Object.values(TEMPLATE_LITERAL)) {
    it(titleFor(c, 'isType/static'), () => assertIsTypeStatic(c));
    it(titleFor(c, 'isType/reflect'), () => assertIsTypeReflect(c));
    it(titleFor(c, 'isType/deserialize-static'), () => assertIsTypeDeserializeStatic(c));
    it(titleFor(c, 'isType/deserialize-reflect'), () => assertIsTypeDeserializeReflect(c));
    it(titleFor(c, 'isType/schema'), () => assertIsTypeSchema(c));

    it(titleFor(c, 'getTypeErrors/static'), () => assertGetTypeErrorsStatic(c));
    it(titleFor(c, 'getTypeErrors/reflect'), () => assertGetTypeErrorsReflect(c));
    it(titleFor(c, 'getTypeErrors/deserialize-static'), () => assertGetTypeErrorsDeserializeStatic(c));
    it(titleFor(c, 'getTypeErrors/deserialize-reflect'), () => assertGetTypeErrorsDeserializeReflect(c));
    it(titleFor(c, 'getTypeErrors/schema'), () => assertGetTypeErrorsSchema(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
