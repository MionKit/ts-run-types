// format-transform / NumberFormat — every NUMBER_FORMAT case run through the format transform.
// Assertion logic inlined directly in the `it()` body (no shared util helper).
import {describe, expect, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import type {FormatTransformCase} from './types.ts';

describe('format-transform / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT) as FormatTransformCase[]) {
    it(`transform — ${c.title}`, () => {
      const transform = c.formatTransform();
      c.getCases().forEach(({input, expected}, i) => {
        expect(transform(input), `${c.title}: case[${i}] transform output`).toEqual(expected);
      });
    });
  }
});
