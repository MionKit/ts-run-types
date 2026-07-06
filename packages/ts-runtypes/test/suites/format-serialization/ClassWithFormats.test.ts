// format-serialization / ClassWithFormats — a registered class whose fields
// carry type formats, run through every JSON encoder × decoder pairing and the
// binary round-trip. Proves the class-serializer path composes with the format
// families (currency width, Date wire) and reconstructs a real instance.
import {describe, it} from 'vitest';
import {CLASS_WITH_FORMATS} from './ClassWithFormats.ts';
import {
  assertMutatePreserveRoundTrip,
  assertMutateStripRoundTrip,
  assertClonePreserveRoundTrip,
  assertCloneStripRoundTrip,
  assertDirectPreserveRoundTrip,
  assertDirectStripRoundTrip,
  assertCompactRoundTrip,
  assertBinaryRoundTrip,
  assertSchemaJsonRoundTrip,
  assertSchemaBinaryRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('format-serialization / ClassWithFormats', () => {
  for (const c of Object.values(CLASS_WITH_FORMATS)) {
    it(`mutate - preserve - ${c.title}`, () => assertMutatePreserveRoundTrip(c));
    it(`mutate - strip - ${c.title}`, () => assertMutateStripRoundTrip(c));
    it(`clone - preserve - ${c.title}`, () => assertClonePreserveRoundTrip(c));
    it(`clone - strip - ${c.title}`, () => assertCloneStripRoundTrip(c));
    it(`direct - preserve - ${c.title}`, () => assertDirectPreserveRoundTrip(c));
    it(`direct - strip - ${c.title}`, () => assertDirectStripRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
    it(`binary - ${c.title}`, () => assertBinaryRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
    it(`schema - binary - ${c.title}`, () => assertSchemaBinaryRoundTrip(c));
  }
});
