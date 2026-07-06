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
  return createJsonEncoder<Ledger>(undefined, {strategy: 'mutate'});
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

## Wiring a new group

Add the group to [`index.ts`](./index.ts) (`SERIALIZATION_SPEC`, or
`FORMAT_SERIALIZATION_SUITE` for format-serialization) and add a sibling `*.test.ts` that
iterates the group through the `serializationAsserts` helpers. The id-integrity suite
([`../id-integrity/serializers.test.ts`](../id-integrity/serializers.test.ts)) picks up
every registered group automatically.
