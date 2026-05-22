// isType adapter for TEMPLATE_LITERAL cases — same shape as the other
// adapter files, but every case is `it.todo` today.
//
// TemplateLiteral types (`\`api/user/${number}\``) need both
// serializer-side projection (extract literal text + placeholder
// kinds; today these types are flattened to KindUnknown) and emit-side
// regex composition. Until the serializer surfaces the pattern, no
// case can be activated.
//
// Sample payloads carry over verbatim from mion's
// templateLiteral.spec.ts so activation lands as a one-line edit
// (replace `it.todo` with `it()`) once the projection + emit land.

import {describe, expect, it} from 'vitest';
import {VALIDATION_SUITE} from '../suites/validation-suite.ts';

describe('isType / TEMPLATE_LITERAL', () => {
  it.todo('`api/user/${number}`');
  it.todo('`/api/v${number}/user/${string}/posts/${number}`');
  it.todo('`${string}/${number}`');
  it.todo('`(${number})`');
  it.todo('{[key: `api/${string}`]: number}');
  it.todo('{url: `api/user/${number}`; method: string}');

  // No counter guard — every case is `it.todo`, so `ranTests` would
  // stay at 0 and the counter line is redundant. Re-add when at
  // least one case activates.
  it('all template-literal cases are accounted for', () => {
    expect(Object.keys(VALIDATION_SUITE.TEMPLATE_LITERAL).length).toBe(6);
  });
});
