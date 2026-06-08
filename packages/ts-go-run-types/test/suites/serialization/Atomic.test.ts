// serialization / Atomic — every ATOMIC case run through every JSON encoder × decoder pairing
// (10 combinations) and the binary round-trip. One `it()` per pairing, each delegating to its
// shared helper in util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {ATOMIC} from './Atomic.ts';
import {
  assertMutatePreserveRoundTrip,
  assertMutateStripRoundTrip,
  assertClonePreserveRoundTrip,
  assertCloneStripRoundTrip,
  assertStripMutatePreserveRoundTrip,
  assertStripMutateStripRoundTrip,
  assertStripClonePreserveRoundTrip,
  assertStripCloneStripRoundTrip,
  assertDirectPreserveRoundTrip,
  assertDirectStripRoundTrip,
  assertBinaryRoundTrip,
  assertSchemaJsonRoundTrip,
  assertSchemaBinaryRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('serialization / Atomic', () => {
  for (const c of Object.values(ATOMIC)) {
    it(`mutate - preserve - ${c.title}`, () => assertMutatePreserveRoundTrip(c));
    it(`mutate - strip - ${c.title}`, () => assertMutateStripRoundTrip(c));
    it(`clone - preserve - ${c.title}`, () => assertClonePreserveRoundTrip(c));
    it(`clone - strip - ${c.title}`, () => assertCloneStripRoundTrip(c));
    it(`stripMutate - preserve - ${c.title}`, () => assertStripMutatePreserveRoundTrip(c));
    it(`stripMutate - strip - ${c.title}`, () => assertStripMutateStripRoundTrip(c));
    it(`stripClone - preserve - ${c.title}`, () => assertStripClonePreserveRoundTrip(c));
    it(`stripClone - strip - ${c.title}`, () => assertStripCloneStripRoundTrip(c));
    it(`direct - preserve - ${c.title}`, () => assertDirectPreserveRoundTrip(c));
    it(`direct - strip - ${c.title}`, () => assertDirectStripRoundTrip(c));
    it(`binary - ${c.title}`, () => assertBinaryRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
    it(`schema - binary - ${c.title}`, () => assertSchemaBinaryRoundTrip(c));
  }
});
