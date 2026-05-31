// format-transform / BigintFormat — runs every BIGINT_FORMAT case through the format transform.
import {describe, it} from 'vitest';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {assertFormatTransform} from '../../util/transformAsserts.ts';

describe('format-transform / BigintFormat', () => {
  for (const c of Object.values(BIGINT_FORMAT)) {
    it(`transform — ${c.title}`, () => assertFormatTransform(c));
  }
});
