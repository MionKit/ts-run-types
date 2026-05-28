// Binary round-trip adapter — drives every case in `SERIALIZATION_SPEC`
// through `binaryEncoder` → `binaryDecoder` and asserts the decoded
// value deep-equals the original (or the per-case `deserializedValues`
// override when round-trip is asymmetric — class instances becoming
// plain objects, functions in tuples becoming undefined, etc).
//
// Coverage parity: this adapter is the binary sibling of
// `serializationRoundTrip.test.ts`. The two run against the same
// `SERIALIZATION_SPEC`, so binary inherits every JSON case
// automatically — Parameters<typeof fn>, ReturnType<typeof fn>,
// circular refs, the lot. Cases where binary semantics diverge from
// JSON (e.g. bigint extras that JSON.stringify rejects but binary
// encodes natively) provide a `getBinaryTestData` override; cases
// where binary's alwaysThrow set differs from JSON's (e.g. a kind
// binary refuses but JSON accepts) provide a `binaryFactoryThrows`
// override.
//
// Strict coverage guard: a final `it()` per category asserts that
// EVERY case has `binaryEncoder` + `binaryDecoder` populated. Adding a
// case to `SERIALIZATION_SPEC` without binary thunks will surface as a
// failing test, not a silent skip.

import {describe, expect, it} from 'vitest';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {runBinaryRoundTripCase as runCase} from '../util/serializationAsserts.ts';

// Per-category drive — generates one `describe` block per top-level
// bucket in `SERIALIZATION_SPEC` and one `it` per case. Plus a final
// `it` per category that hard-asserts every case in the bucket has
// binary thunks defined.
for (const [bucketName, bucket] of Object.entries(SERIALIZATION_SPEC) as Array<[string, Record<string, SerializationCase>]>) {
  describe(`binary round-trip: ${bucketName}`, () => {
    for (const [, c] of Object.entries(bucket)) {
      if (!c.binaryEncoder || !c.binaryDecoder) {
        // Surface missing coverage as a failure — adapter contract is
        // every case in the spec gets binary thunks.
        it(`${c.title}: has binary thunks`, () => {
          expect(c.binaryEncoder, `${c.title}: missing binaryEncoder thunk`).toBeTypeOf('function');
          expect(c.binaryDecoder, `${c.title}: missing binaryDecoder thunk`).toBeTypeOf('function');
        });
        continue;
      }
      it(c.title, () => runCase(c));
    }
  });
}
