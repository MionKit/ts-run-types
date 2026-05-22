// isType adapter for TEMPLATE_LITERAL cases.
//
// Template literal types (`\`api/user/${number}\``) project as
// KindTemplateLiteral with the literal text + placeholder spans on
// rt.Literal; the emit compiles to an anchored RegExp at JIT-build
// time and hoists it into the closure prologue as a context-item
// const, then validator-call runs `typeof v === 'string' &&
// regex.test(v)`.

import {afterEach, describe, expect, it} from 'vitest';
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

let ranTests = 0;
afterEach(() => {
  ranTests++;
});

async function assertIsType(c: ValidationCase): Promise<void> {
  if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);
  const isType = await c.isType();
  const {valid, invalid} = c.getSamples();
  valid.forEach((v, i) => {
    expect(isType(v), `${c.title}: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isType(v), `${c.title}: invalid[${i}] should fail`).toBe(false);
  });
}

describe('isType / TEMPLATE_LITERAL', () => {
  it('`api/user/${number}`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.url_with_number_id));
  it('`/api/v${number}/user/${string}/posts/${number}`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.multi_segment_url));
  it('`${string}/${number}`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.leading_string_placeholder));
  it('`(${number})`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.regex_special_chars));
  it('{url: `api/user/${number}`; method: string}', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('{[key: `api/${string}`]: number}', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_index_key));
  it("`${'a' | 'b'}-${number}` (union placeholder)", () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.TEMPLATE_LITERAL).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
