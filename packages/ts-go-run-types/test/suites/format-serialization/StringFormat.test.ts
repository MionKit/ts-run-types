// format-serialization / StringFormat — runs every STRING_FORMAT case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('format-serialization / StringFormat', () => {
  for (const c of Object.values(STRING_FORMAT)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
