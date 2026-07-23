# Serialization case-suite authoring

Governs this directory AND [`../format-serialization/`](../format-serialization/) — both
express their cases as `SerializationCase` records (the type lives in
[`types.ts`](./types.ts); format-serialization re-exports it). Each `*.ts` file exports a
group of cases; the sibling `*.test.ts` runs every case through the shared round-trip
adapters in [`../../util/serializationAsserts.ts`](../../util/serializationAsserts.ts)
(mutate / clone / direct / compact × strip / preserve, plus binary + the value-first
`schema` variants).

## ⚠️ Every thunk is self-contained — define ALL types INLINE

A `SerializationCase` is a bag of THUNKS: `mutateEncoder` / `cloneEncoder` /
`directEncoder` / `compactEncoder` / `stripDecoder` / `preserveDecoder` /
`compactDecoder` / `binaryEncoder` / `binaryDecoder` / the `schema*` variants / and
`getTestData`. **Every type a thunk needs (interfaces, classes, `TF.*` format types,
type aliases) MUST be declared INSIDE that thunk — never at module scope.** The
duplication across thunks is deliberate and required.

**Why:** each thunk is lifted out and consumed as a STANDALONE code sample — the website
doc pipeline, the benchmark harness, and code extraction each take one thunk's body and
must compile + run it in isolation. A type pulled from module scope (or shared via a
module-level helper) breaks that extraction. So repeat the type — and any
`registerClassSerializer` / setup call it depends on — in full, in each thunk. See the
`schemaEncoder` note in [`types.ts`](./types.ts) ("every thunk stays self-contained +
single-purpose — benchmarking, code extraction, doc-gen") and
[`LargeObjects.large_class_union`](./LargeObjects.ts) for the canonical shape.

```ts
// RIGHT — the class (and its register call) live inside the thunk
mutateEncoder: () => {
  class Ledger { constructor(public owner: string, public balance: bigint) {} }
  registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.balance)});
  return createJsonEncoderFn<Ledger>(undefined, {strategy: 'mutate'});
},
// WRONG — `class Ledger {}` at module scope, referenced from the thunk.
```

## Class-serializer cases

- Define the class + its `registerClassSerializer(Cls, {deserialize})` INSIDE each thunk
  (per the rule above). The registry is keyed by the class's TYPE ID, and a class with
  the same name + shape resolves to the same id in every thunk, so the per-thunk classes
  register/look-up consistently. The round-trip comparison strips prototypes
  (`normalizeForComparison`), so a reconstructed instance compares structurally to the
  `getTestData` instance regardless of which thunk's class object produced it.
- A class is not expressible as a value-first `RT.*` model, so set
  `schemaEncoder` / `schemaDecoder` / `schemaBinaryEncoder` / `schemaBinaryDecoder` to
  `'not-supported'` — the id-integrity driver then skips the schema-vs-type comparison for
  that case. (`Classes.ts` and `format-serialization/ClassWithFormats.ts` are worked
  examples.)

## Prefer an EXISTING group over a new one

Add a new case to the group it fits (a class is object-like → `Objects.ts`; a formatted
DTO → `format-serialization/Realworld.ts`) rather than spinning up a new group. **Why:**
every group name is a surface that multiple consumers must know about —

- the round-trip runner (`*.test.ts`) and [`../id-integrity/serializers.test.ts`](../id-integrity/serializers.test.ts),
- the website suite-table export ([`scripts/website/suite-data/export-serialization.mjs`](../../../../../scripts/website/suite-data/export-serialization.mjs)),
- the benchmark data generator ([`scripts/website/bench-data/gen-serialization.mjs`](../../../../../scripts/website/bench-data/gen-serialization.mjs))
  and the `SuiteTable` / `BenchTable` components that render them.

An existing group already flows through ALL of them, so a case added to it is covered
everywhere for free. A new group is a new key those consumers must pick up (and the
`groupToFile` name mapping, aggregation counts, and any table layout must accommodate) —
easy to under-wire and get partial coverage. Add a new group only when the cases are a
genuinely new category, and then verify each consumer above.

To add a group anyway: register it in [`index.ts`](./index.ts) (`SERIALIZATION_SPEC`, or
`FORMAT_SERIALIZATION_SUITE`) and add a sibling `*.test.ts` iterating it through the
`serializationAsserts` helpers.
