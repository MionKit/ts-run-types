// format-transform / StringFormat — runs every STRING_FORMAT case through the format transform.
import {describe, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import {assertFormatTransform} from '../../util/transformAsserts.ts';

describe('format-transform / StringFormat', () => {
  for (const c of Object.values(STRING_FORMAT)) {
    it(`transform — ${c.title}`, () => assertFormatTransform(c));
  }
});
