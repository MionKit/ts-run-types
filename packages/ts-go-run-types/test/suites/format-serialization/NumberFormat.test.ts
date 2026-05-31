// format-serialization / NumberFormat — every NUMBER_FORMAT case run through the JSON round-trip strategies
// (unsafe / safe / safeDirect) and the binary round-trip. One `it()` per strategy, each
// delegating to its shared helper in util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {
  assertUnsafeRoundTrip,
  assertSafeRoundTrip,
  assertSafeDirectRoundTrip,
  runBinaryRoundTripCase,
} from '../../util/serializationAsserts.ts';

describe('format-serialization / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(`unsafe — ${c.title}`, () => assertUnsafeRoundTrip(c));
    it(`safe — ${c.title}`, () => assertSafeRoundTrip(c));
    it(`safeDirect — ${c.title}`, () => assertSafeDirectRoundTrip(c));
    it(`binary — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
