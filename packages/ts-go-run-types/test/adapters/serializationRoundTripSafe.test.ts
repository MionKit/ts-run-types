// Safe round-trip adapter — drives every SerializationCase through the
// new `prepareForJsonSafe` encoder paired with the existing
// `restoreFromJson` decoder. Three contracts per case:
//
//   1. Round-trip: `restoreFromJson(JSON.parse(JSON.stringify(prepareForJsonSafe(v))))`
//      ≅ deserializedValues[i] ?? values[i]
//   2. No-mutation: `v` is byte-for-byte unchanged after
//      `prepareForJsonSafe(v)` — verified via a structuredClone snapshot
//      taken before the call and deep-equal after. Skipped for cycles
//      where structuredClone refuses.
//   3. Extras stripped: when getTestDataForStringify supplies values
//      with extra (undeclared) keys, the encoded output must not
//      contain them. Same expectation the existing safe-path
//      stringifyJson adapter holds.
//
// Walks the suite generically (one describe per category, one it per
// case) so new cases light up automatically without test edits.

import {describe, expect, it} from 'vitest';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

const identityFn = (v: unknown) => v;

function safeStructuredClone(input: unknown): {ok: true; snapshot: unknown} | {ok: false} {
  try {
    return {ok: true, snapshot: structuredClone(input)};
  } catch {
    return {ok: false};
  }
}

function runSafeCase(c: SerializationCase): void {
  if (c.throwsAtCompile) {
    expect(() => c.prepareForJsonSafe(), `${c.title}: prepareForJsonSafe factory must throw at compile time`).toThrow();
    return;
  }
  // jsonStringifyThrows is an unsafe-path contract (the input carries a
  // non-serializable extra that the unsafe encoder forwards to
  // JSON.stringify, which throws). The safe encoder STRIPS extras by
  // construction, so the throw doesn't apply — round-trip succeeds with
  // the declared-keys-only output.
  const bestEffort = c.roundTripBestEffort ?? false;
  const prepare = c.prepareForJsonSafe();
  const restore = c.restoreFromJson?.() ?? identityFn;
  // Use the stringify-test-data variant when the case provides one — it
  // covers the strip-extras observable that the unsafe path skips.
  const getTestData = c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = safeStructuredClone(input);

    let prepared: unknown;
    try {
      prepared = prepare(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    // Contract 2: no mutation of the input.
    if (preSnapshot.ok) {
      expect(input, `${c.title} [safe]: values[${i}] — prepareForJsonSafe must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(prepared);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (serialized === undefined) return;
    if (bestEffort) return;

    if (c.safeAdapterStringifyJsonNotParseable) {
      // Number-not-supported case (`Infinity` etc) — JSON.stringify
      // produces `null`, which IS parseable and round-trips as null.
      // The non-parseable flag was specific to stringifyJson's
      // `String(Infinity) === "Infinity"` path; the safe-prep path
      // doesn't apply it.
    }

    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [safe]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

for (const [category, cases] of Object.entries(SERIALIZATION_SPEC)) {
  describe(`serialization-safe / ${category}`, () => {
    for (const [_, c] of Object.entries(cases) as [string, SerializationCase][]) {
      it(c.title, () => runSafeCase(c));
    }
  });
}
