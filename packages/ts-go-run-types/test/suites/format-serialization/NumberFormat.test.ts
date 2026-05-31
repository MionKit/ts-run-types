// format-serialization / NumberFormat — every NUMBER_FORMAT case run through the JSON round-trip strategies
// (mutate / stripClone / direct) and the binary round-trip. One `it()` per strategy, each
// delegating to its shared helper in util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {
  assertMutateRoundTrip,
  assertStripCloneRoundTrip,
  assertDirectRoundTrip,
  runBinaryRoundTripCase,
} from '../../util/serializationAsserts.ts';

describe('format-serialization / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(`mutate — ${c.title}`, () => assertMutateRoundTrip(c));
    it(`stripClone — ${c.title}`, () => assertStripCloneRoundTrip(c));
    it(`direct — ${c.title}`, () => assertDirectRoundTrip(c));
    it(`binary — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
