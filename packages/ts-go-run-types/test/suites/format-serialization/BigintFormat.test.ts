// format-serialization / BigintFormat — every BIGINT_FORMAT case run through the JSON round-trip strategies
// (mutate / stripClone / direct) and the binary round-trip. One `it()` per strategy, each
// delegating to its shared helper in util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {
  assertMutateRoundTrip,
  assertStripCloneRoundTrip,
  assertDirectRoundTrip,
  runBinaryRoundTripCase,
} from '../../util/serializationAsserts.ts';

describe('format-serialization / BigintFormat', () => {
  for (const c of Object.values(BIGINT_FORMAT)) {
    it(`mutate — ${c.title}`, () => assertMutateRoundTrip(c));
    it(`stripClone — ${c.title}`, () => assertStripCloneRoundTrip(c));
    it(`direct — ${c.title}`, () => assertDirectRoundTrip(c));
    it(`binary — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
