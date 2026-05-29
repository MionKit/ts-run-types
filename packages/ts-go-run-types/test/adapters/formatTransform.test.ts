// format transform adapter — drives every STRING_FORMAT case in
// FORMAT_TRANSFORM_SUITE through `createFormatTransform<T>()` and
// asserts each input maps to its expected output (value-transform for
// lowercase / uppercase / capitalize / trim; identity for
// non-transforming types).

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_TRANSFORM_SUITE, type FormatTransformCase} from '../suites/format-transform-suite.ts';

function assertFormatTransform(c: FormatTransformCase): void {
  const transform = c.formatTransform();
  c.getCases().forEach(({input, expected}, i) => {
    expect(transform(input), `${c.title}: case[${i}] transform output`).toEqual(expected);
  });
}

describe('format transform', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  for (const c of Object.values(FORMAT_TRANSFORM_SUITE).flatMap((bucket) => Object.values(bucket))) {
    it(c.title, () => assertFormatTransform(c));
  }

  it('all transform tests ran', () => {
    expect(ranTests).toBe(Object.values(FORMAT_TRANSFORM_SUITE).reduce((total, bucket) => total + Object.keys(bucket).length, 0));
  });
});
