# Serialization bugs surfaced by the non-data fuzz lane

**Status:** F1, K2, F2 (product side) FIXED — see the Resolution section below.
F3 plus two newly-surfaced issues are DEFERRED to a follow-up. Originally four
findings from the DataOnly non-data fuzz lane (the `createMockType`-driven,
real-pipeline lane in [`nonDataTypeFuzz.integration.test.ts`](../../packages/ts-runtypes/test/fuzz/nonDataTypeFuzz.integration.test.ts)).

## Resolution

| ID | What | Status |
|----|------|--------|
| **F1** | `binaryEncode`/`binaryDecode` mis-applied the index-sig encoder to NAMED properties on objects mixing both | **FIXED** — named props emit first, the index-sig loop skips declared keys via the shared `publishSiblingNamedKeysForIndexSig` + `siblingNamedSkipCode`. Pinned by `binaryIndexSig.smoke.test.ts`. |
| **K2** | A stripped-valued prop in a UNION member failed the whole union (a standalone object drops it) | **FIXED** — `buildMergedProps` drops the full `isStrippedUnionMember` set + emits the drop warning. Pinned by `TestDataOnlyUnion_ObjectMemberStrippedProp`. |
| **F2** | Callable interface: function to `validate`, object to the serializers | **FIXED (product)** — `objectHasCallSignature` makes the serializers + validate treat it function-like everywhere (typeof-function at root, dropped at a property). Pinned by `callable_interface_dataonly_test.go`. Re-enabling fuzz GENERATION is deferred (see F2b). |
| **F2b** | Re-enabling callable-interface fuzz generation surfaces an UNCONTROLLED wire error (`reading 'fn'`) + an unresolved binary site on a complex callable interface (call sig with `any` / methods / non-serialisable intersection params) | **DEFERRED** — a separate emit/dependency-linking bug. Generation stays disabled in `typeGen.ts`. |
| **F3** | An Error-severity diagnostic is emitted for a non-serialisable position inside a DROPPED property subtree, though the value serialises fine | **DEFERRED** — cosmetic (runtime correct; the fuzz lane tiers on actual encoder behaviour, so it's invisible there). A correct fix reworks the absorb-path severity (`DiagCodeForLeaf` returns ROOT/Error codes) + scoped diagnostic scrubbing across all 8 property emitters — invasive for the diagnostic catalog, better isolated. |
| **G1** | NEW soak finding: `O5` JSON round-trip throws `Cannot convert a BigInt value to a number` on `{1 prop + index signature}` (a bigint at a numeric-index-sig position). Pre-existing in the WILD lane, unrelated to F1/K2/F2. | **DEFERRED** |

Every original finding replays from the listed seed via the soak:

```
FUZZ_NONDATA_SOAK_MS=45000 FUZZ_SEED=20260620 pnpm exec vitest run nonDataTypeFuzz
```

The lane routes a REAL value (from `createMockType`, `nonDataTypes:true`) through
the real validators and serializers, then checks metamorphic properties
(JSON/binary wire-stability, cross-wire agreement, family agreement). That is why
it reaches shapes the older shape-value lane never built. The committed lane (seed
`0xda7a01`, 100 iterations) is deterministically green; these findings come from
OTHER seeds in the soak.

## Where the code lives

- Binary emitter (index signatures, the F1 site) — [`internal/compiled/typefns/binary_to.go`](../../internal/compiled/typefns/binary_to.go), [`binary_from.go`](../../internal/compiled/typefns/binary_from.go)
- JSON object/index-sig emit (the correct reference + the absorption path) — [`internal/compiled/typefns/json_prepare.go`](../../internal/compiled/typefns/json_prepare.go)
- Union flat layout + merged-prop emit (the K2 site) — [`internal/compiled/typefns/union_flat_layout.go`](../../internal/compiled/typefns/union_flat_layout.go), [`union_flat.go`](../../internal/compiled/typefns/union_flat.go)
- Validate root arms (the F2 site) — [`internal/compiled/typefns/validate.go`](../../internal/compiled/typefns/validate.go)
- Diagnostic severities (the F3 site) — [`internal/compiled/typefns/diag_codes.go`](../../internal/compiled/typefns/diag_codes.go), [`internal/diag/codes_runtype.go`](../../internal/diag/codes_runtype.go)
- Fuzz harness + runner + generator + product mock — [`typeFuzzHarness.ts`](../../packages/ts-runtypes/test/fuzz/typeFuzzHarness.ts), [`typeFuzzRunner.ts`](../../packages/ts-runtypes/test/fuzz/typeFuzzRunner.ts), [`typeGen.ts`](../../packages/ts-runtypes/test/fuzz/typeGen.ts), [`mockType.ts`](../../packages/ts-runtypes/src/mocking/mockType.ts)

---

## F1 — binaryEncode mishandles an index signature mixed with named properties (PRIMARY)

A real binary-serializer correctness bug, independent of non-data types. When an
object type carries BOTH an index signature AND explicitly named properties,
`createBinaryEncoder` applies the index-signature VALUE encoder to the named
properties as well, instead of encoding each named property with its own type.
`createJsonEncoder` handles the same value correctly, so the two wires disagree
and the lane's cross-wire / family-agreement rule flags it.

### Repro

- **seed 591039178** — `type T = {p0?: Record<string, number>; [k: string]: string}`
  - mock value: `{p0: {…numbers…}, key0: "…", key1: "…", …}`
  - `jsonEncode`: OK. `binaryEncode`: throws `The "src" argument must be of type string. Received an instance of Object`.
  - The index-signature value type is `string`, so the encoder tried to string-encode `p0` (a `Record` object).
- **seed 2648652937** — `type T = {"a-b"?: Set<42>; p1?: Set<string>; [k: string]: Map<string, Date>}`
  - `jsonEncode`: OK. `binaryEncode`: throws `Cannot read properties of undefined (reading 'size')`.
  - Same shape of failure: the `Map` index-value encoder is applied to the `Set`-typed / missing named props.

### Likely root cause (confirm in the PR)

The binary object/index-signature emit appears to iterate every own enumerable key
and apply the single index-signature value encoder, without first peeling off the
declared named properties (which have their own, different types). The JSON path
does NOT have this bug, so it is the reference for correct behavior.

### Proposed fix

In the binary index-signature emit ([`binary_to.go`](../../internal/compiled/typefns/binary_to.go) /
[`binary_from.go`](../../internal/compiled/typefns/binary_from.go)): encode the
declared named properties with their own per-property encoders first, then iterate
only the REMAINING keys for the index signature (skip any key that names a declared
property). Mirror whatever `json_prepare.go` does for the same mixed shape. Pin
with a fixed-type regression test plus the two seeds above.

---

## K2 — a union object member with a stripped-valued property fails the whole union

A standalone object drops a stripped-valued property and serializes; the SAME
property inside a union member fails the entire union instead. The drop is not
applied consistently between the two code paths.

- Standalone `{b: symbol}` → `b` is absorbed (dropped) → serializes as `{}`
  ([`json_prepare.go:396-407`](../../internal/compiled/typefns/json_prepare.go), `AbsorbUnsupported`).
- Union `X | {b: symbol}` → fails: `buildMergedProps` only filters FUNCTION-LIKE
  props ([`union_flat_layout.go:177`](../../internal/compiled/typefns/union_flat_layout.go)),
  so a `symbol` / `Promise` / non-serializable-valued prop survives into the merge,
  emits `CodeNS`, and `emitMergedPropPrepare` returns false
  ([`union_flat.go:154-162`](../../internal/compiled/typefns/union_flat.go)), which
  alwaysThrows the whole union ([`union_flat.go:110-115`](../../internal/compiled/typefns/union_flat.go)).

This was found by code review during the fuzz work, not auto-flagged by the lane
(the lane has no independent model, and the resolver's own tiering treats it as a
genuine collapse). Worth a paired Go test either way.

### Proposed fix

In `buildMergedProps`, drop a merged-prop candidate whose resolved child is
otherwise stripped (symbol / Promise / non-serializable / never), the same set the
standalone object absorbs, not only `isFunctionLikeKind`. Emit the existing
member-dropped Warning so the drop stays visible. Confirm `Date | {b: symbol}`
serializes as `Date | {}` with a warning, matching `{b: symbol}` standalone.

---

## F2 — callable interfaces are inconsistent across families

A callable interface (an interface with a call signature) is treated as a FUNCTION
by `validate` but as an OBJECT by the serializers, so no single value satisfies
both and it cannot be round-trip-fuzzed.

- **seed 2643544942** — `interface N0 { (a0: DataView): 1; p0?(a0: string): … }`, `type T = N0`.
  - `validate<N0>(() => {})` is `true`; `validate<N0>({})` is `false` (validate uses
    the function-at-root `typeof === 'function'` guard, see
    [`validate.go`](../../internal/compiled/typefns/validate.go) ~lines 459-468).
  - `jsonEncode<N0>({})` serializes `{}` (the serializers treat `N0` as an object and
    drop the call signature / method, emitting VL010/VL011-family member-drop warnings).

### Decision needed (then fix)

Pick one contract for a callable interface and make every family honor it:

1. Treat it as function-like everywhere (validate already does): the serializers
   should then alwaysThrow at the root / drop at a property, consistent with a bare
   function. Simplest and most consistent with `DataOnly`, which strips a callable
   interface to `never`.
2. Or treat it as its object projection everywhere: `validate` would stop using the
   function guard for a callable interface and validate the (possibly empty) object.

Option 1 is recommended (it matches `DataOnly<CallableInterface> = never`). Until
this lands, callable-interface GENERATION stays disabled in the fuzz generator
([`typeGen.ts`](../../packages/ts-runtypes/test/fuzz/typeGen.ts), `genDecl`); the
`calls` plumbing (TypeShape / render / ref-walk) is kept so it can be re-enabled.

---

## F3 — an Error diagnostic is emitted for a DROPPED subtree

The resolver emits an Error-severity diagnostic for a non-serializable position
that sits inside a DROPPED property subtree, even though the factory serializes
fine. An Error is supposed to mean "will throw at runtime, build must fail"
([`codes_runtype.go`](../../internal/diag/codes_runtype.go) convention), but here
the runtime does not throw, so the diagnostic over-reports.

- Example — `{p2: Promise<Set<Float64Array>>}`. `p2` is a `Promise` property, which
  is dropped. The binary family still walks into the dropped `Promise` and emits an
  Error for the `Float64Array` inside the `Set`, yet `binaryEncode` correctly drops
  `p2` and serializes the rest.

This is WHY the fuzz runner tiers serialize-vs-fail from ACTUAL encoder behavior
rather than from `errorDiagnostics` (an Error can be present on a type that still
serializes). See the tier note in [`typeFuzzRunner.ts`](../../packages/ts-runtypes/test/fuzz/typeFuzzRunner.ts)
(`checkMockBehaviour`).

### Proposed fix

When a property (or other droppable position) is dropped, do not walk its subtree
for Error-severity diagnostics, or downgrade those nested diagnostics to Warning so
"Error" keeps its "this will throw at runtime" meaning. Re-check the
`errorDiagnostics`-based assumptions in any tooling that trusts Error severity.

---

## Verification for the fix PR

- Add paired Go tests for F1 (mixed index-sig + named props, binary round-trip), K2
  (`Date | {b: symbol}` serializes with a warning), and F3 (a dropped non-data
  subtree emits at most a Warning).
- For F2, add tests pinning whichever contract is chosen across all families, then
  re-enable callable-interface generation in `typeGen.ts` and run the soak.
- Re-run the non-data soak; F1/F2/F3 seeds above should stop firing. Once the
  resolver no longer over-reports (F3), the runner MAY switch back to a
  diagnostics-assisted tier, but actual-behavior tiering is the safer default.
- Update the website page [`container-website/content/6.suites/6.how-we-fuzz.md`](../../container-website/content/6.suites/6.how-we-fuzz.md)
  so the F1 story reads as found-and-fixed.
