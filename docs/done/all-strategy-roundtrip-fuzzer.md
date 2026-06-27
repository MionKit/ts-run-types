# All-strategy round-trip fuzzer

> **Status: DONE (shipped 2026-06-30).** The fuzzer is built, wired into
> the suite, and finds bugs. It round-trips one random value through every
> codec/strategy compiled for the same random type and checks they all agree.
> Shipping it surfaced a cluster of pre-existing JSON-codec bugs: **9 root causes
> are now fixed + pinned** (the original 5, the 3 deeper index-signature / union
> bugs, and the final wire-stability-only finding on structurally-ambiguous
> discriminated unions). A 120s soak at seed 0x1234 (which originally hit the last
> finding) now runs clean across ~6k generated types.

## What shipped

A dedicated fuzz lane under [packages/ts-runtypes/test/fuzz/roundtrip/](../../packages/ts-runtypes/test/fuzz/roundtrip/):

- **`roundtripHarness.ts`** — renders a fixture that emits EVERY codec call site
  for one generated type (clone / mutate / direct / compact JSON encoders + the
  strip / preserve / compact decoders + binary), drives the real resolver →
  plugin → runtime pipeline, classifies fn sites BY TUPLE TAG (jeCL/jeMU/jeDI/jeCO,
  jdST/jdPR/jdCO, tb/fb, val), and wires one real factory per codec. Forks the
  fixture from the `type/` harness (which only emits the default JSON strategy)
  but reuses `openClient` + the inline eval helpers.
- **`roundtripOracle.ts`** — the oracle. Round-trip identity + cross-strategy
  agreement is expressed as WIRE agreement (re-encode each lane's decoded value
  through the canonical clone encoder and compare to the clone wire of the
  original) rather than a raw deep-equal, because JSON representation
  normalisation (dropped `undefined`, vanished optionals, `-0` → `0`) is correct
  but not structurally identical. Plus per-lane wire stability, both-ends
  validate, serialize-vs-`alwaysThrow` agreement, and a native-JSON ground-truth
  check on the JSON-safe subset. Per-codec exceptions are handled (compact's
  optional-null collapse via `compactNullRisk`; mutate's in-place mutation via a
  fresh clone per encode).
- **`roundtripRunner.ts`** — generates `DATA_GEN_OPTIONS` types, gates on
  `valueOracleSafe` + `!isRecursive` + `!floored`, seeds the type AND its value
  from one number so a finding replays exactly, restarts the resolver on a hang,
  and reuses the TS-validity gate to drop non-compilable-type false positives.
- **`allStrategyRoundtrip.integration.test.ts`** — binary-gated, a 100-iteration
  seeded corpus (passes clean) + an opt-in soak via `FUZZ_ROUNDTRIP_SOAK_MS`.

Hygiene: the inline-server overlay in
[packages/runtypes-devtools/test/helpers/inline.ts](../../packages/runtypes-devtools/test/helpers/inline.ts)
gained `compact` in its JSON strategy unions (was stale).

## Bugs found and FIXED (pinned)

All in the JSON codecs; the binary codec round-tripped these correctly, which is
how the oracle isolated them.

1. **`null` / `undefined` / `void` lost from arrays + Sets.** The single-pass
   `direct`/`stringifyJson` emitter pushed a bare value then `Array.join(',')`,
   which coerces `null`/`undefined` to `''` — so `[null,null]` rendered as the
   invalid `[,]` and `(number | null)[]` dropped nulls. Fixed in
   [internal/compiled/typefns/json_stringify.go](../../internal/compiled/typefns/json_stringify.go)
   (split `KindNull` from `KindNumber` to emit the constant `'null'`; gave
   `KindVoid` the same three-way branch as `KindUndefined`; extended
   `parentIsArrayLike` to Map/Set parents). Pinned in the serialization suite
   (`null_in_array`, `nullable_number_array`, `void_in_array`, `set_nullable`,
   `set_void`).
2. **A Map mistaken for a `Record`.** A `Record<K,V>` validator accepted a Map /
   Set / Date (no own string keys → vacuous per-key check), so in a union a Map
   matched the Record candidate and serialized as `{}`. Fixed in
   [internal/compiled/typefns/validate.go](../../internal/compiled/typefns/validate.go)
   (brand-guard index-signature objects). Pinned in
   [packages/ts-runtypes/test/indexSigUnionDispatch.test.ts](../../packages/ts-runtypes/test/indexSigUnionDispatch.test.ts).
3. **`direct` wrote invalid JSON for an all-optional object with an index sig.**
   The skip-commas flag was set once before the prop loop; a nested-object child
   cleared the shared flag, baking a trailing comma into a later sibling. Fixed
   in `json_stringify.go` (re-establish per iteration). Pinned in
   `indexSigUnionDispatch.test.ts`.
4. **Union "invalid union index" / "item does not belong to the union".** A
   `[k: string | number | symbol]: U` key is split by the resolver into one index
   signature per kind, all sharing value type U. Each emitted its own `for…in`
   sweep, but `for…in` enumerates every own string key regardless of the declared
   kind, so the dynamic keys were processed twice — double-wrapping a union value
   on encode and reading an already-decoded value on decode. Fixed in
   [json_prepare.go](../../internal/compiled/typefns/json_prepare.go)
   (`emitObjectJsonChildren` dedups index-sig sweeps by value-type id). Pinned in
   `indexSigUnionDispatch.test.ts` (seeds 4178250116, 221169984, 3710949730).
5. **"Too many unknown keys" + `.match` on undefined.** The strip decoder's
   index-signature `for…in` sweep ran over the NAMED sibling props too, applying
   the index value's allowlist / restore to them. On a named prop whose value is
   a string (a RegExp on the wire), `for…in` over the string enumerated its
   character indices, which overflowed the unknown-keys cap and ran format checks
   on the wrong operand. Fixed in
   [unknownkeys_to_undefined.go](../../internal/compiled/typefns/unknownkeys_to_undefined.go)
   + [unknownkeys_strip.go](../../internal/compiled/typefns/unknownkeys_strip.go)
   (the sweep skips published sibling-named keys unconditionally). Pinned in
   `indexSigUnionDispatch.test.ts` (seeds 3063523037, 1095371430).

These eight fixes took the deep soak from 26 distinct bug signatures to one.

## The final finding (fixed)

The last finding, surfaced once the throws above were cleared, was
**wire-stability only**: the decoded data was always correct, but the JSON bytes
were not byte-for-byte stable across a round-trip.

- **Ambiguous union merged-prop wire instability** — a discriminated union whose
  members overlap in shape (e.g. a `Record<string, undefined>` prop that
  round-trips to `{}` and then also matches an all-optional sibling member's prop)
  could encode the same value to two equally valid wires. The flat-union merged
  encode dispatched each prop independently by first-match validate rather than by
  the outer discriminant, so re-encode picked a different candidate index. Binary
  stayed stable (its `Record` codec keeps undefined keys, so the value shape never
  changes). **Fixed:** when the union has a usable shared-name plain-literal
  discriminant, the multi-candidate sub-wrap encoders select each candidate by the
  discriminant value (preserved across the round-trip) instead of re-validating —
  `detectFlatDiscriminant` + per-candidate `DiscValues` in
  [union_flat_layout.go](../../internal/compiled/typefns/union_flat_layout.go),
  consumed by `mergedPropPrepareBody` / `emitMergedPropStringify` in
  [union_flat.go](../../internal/compiled/typefns/union_flat.go) and
  `emitMergedPropPrepareSafe` in
  [json_prepare_safe.go](../../internal/compiled/typefns/json_prepare_safe.go).
  The decoder is unchanged; binary keeps its independent validate-dispatch as an
  oracle. Seed 84967679; pinned in
  [indexSigUnionDispatch.test.ts](../../packages/ts-runtypes/test/indexSigUnionDispatch.test.ts).

Run `FUZZ_ROUNDTRIP_SOAK_MS=120000 FUZZ_SEED=4660 pnpm exec vitest run packages/ts-runtypes/test/fuzz/roundtrip/allStrategyRoundtrip.integration.test.ts`
to soak. The website fuzzing page documents the fuzzer:
[container/website/content/6.suites/5.fuzzing.md](../../container/website/content/6.suites/5.fuzzing.md).
