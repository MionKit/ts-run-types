// serialization / TemplateLiterals — runs every TEMPLATE_LITERALS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {TEMPLATE_LITERALS} from './TemplateLiterals.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / TemplateLiterals', () => {
  for (const c of Object.values(TEMPLATE_LITERALS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
