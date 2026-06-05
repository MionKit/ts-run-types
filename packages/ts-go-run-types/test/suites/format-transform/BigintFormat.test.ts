// format-transform / BigintFormat — every BIGINT_FORMAT case run through the format transform.
// Assertion logic inlined directly in the `it()` body (no shared util helper).
import {describe, expect, it} from 'vitest';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import type {FormatTransformCase} from './types.ts';

describe('format-transform / BigintFormat', () => {
  for (const c of Object.values(BIGINT_FORMAT) as FormatTransformCase[]) {
    it(`transform — ${c.title}`, () => {
      const transform = c.formatTransform();
      c.getCases().forEach(({input, expected}, i) => {
        expect(transform(input), `${c.title}: case[${i}] transform output`).toEqual(expected);
      });
    });
  }
});
