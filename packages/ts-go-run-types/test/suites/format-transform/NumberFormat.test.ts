// format-transform / NumberFormat — runs every NUMBER_FORMAT case through the format transform.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {assertFormatTransform} from '../../util/transformAsserts.ts';

describe('format-transform / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(`transform — ${c.title}`, () => assertFormatTransform(c));
  }
});
