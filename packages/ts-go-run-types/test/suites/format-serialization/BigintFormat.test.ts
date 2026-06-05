// format-serialization / BigintFormat — runs every BIGINT_FORMAT case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('format-serialization / BigintFormat', () => {
  for (const c of Object.values(BIGINT_FORMAT)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
