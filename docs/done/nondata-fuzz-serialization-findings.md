# Serialization bugs surfaced by the non-data fuzz lane

**Status:** F1, K2, F2 (product side), F3, G1, F2b (emit), G3, G4, G5, G6 FIXED;
G2 not reproducing — see the Resolution section below. The fuzz lane was also
HARDENED (a TS-validity gate + valid-type generation — see "Fuzz-lane hardening"
below). Re-enabling callable-interface fuzz GENERATION stays a follow-up (the
`calls` plumbing is kept), but the pre-existing serialization bugs the soak
surfaced are now fixed. Originally four findings from the DataOnly non-data fuzz
lane (the `createMockType`-driven, real-pipeline lane in
[`nonDataTypeFuzz.integration.test.ts`](../../packages/ts-runtypes/test/fuzz/nonDataTypeFuzz.integration.test.ts));
broader multi-seed soaking then surfaced G5 / G6 (clean union shapes unrelated to
the stripped-member work) which are fixed too.

## Resolution

| ID | What | Status |
|----|------|--------|
| **F1** | `binaryEncode`/`binaryDecode` mis-applied the index-sig encoder to NAMED properties on objects mixing both | **FIXED** — named props emit first, the index-sig loop skips declared keys via the shared `publishSiblingNamedKeysForIndexSig` + `siblingNamedSkipCode`. Pinned by `binaryIndexSig.smoke.test.ts`. |
| **K2** | A stripped-valued prop in a UNION member failed the whole union (a standalone object drops it) | **FIXED** — `buildMergedProps` drops the full `isStrippedUnionMember` set + emits the drop warning. Pinned by `TestDataOnlyUnion_ObjectMemberStrippedProp`. |
| **F2** | Callable interface: function to `validate`, object to the serializers | **FIXED (product)** — `objectHasCallSignature` makes the serializers + validate treat it function-like everywhere (typeof-function at root, dropped at a property). Pinned by `callable_interface_dataonly_test.go`. Re-enabling fuzz GENERATION is deferred (see F2b). |
| **F2b** | A callable interface at a NON-ROOT propagating position (array element, Map/Record value, tuple slot, intersection) produced an UNCONTROLLED wire error (`reading 'fn'`) + an unresolved binary site (`no id injected`). The serializers latch the callable OBJECTLITERAL as the unsupported leaf, but `DiagCodeForLeaf` had no objectLiteral arm → returned "" → the entry was SILENTLY SKIPPED, leaving a dangling dep that cascaded to a `KindMissing` stub; a JSON composite then bound it with an unguarded `getRT(key).fn`. | **FIXED (emit)** — `callableLeafSubstitute` ([kinds.go](../../internal/cachegen/typefunctions/kinds.go)) maps the callable objectLiteral leaf to its call-signature child at the alwaysThrow site ([module.go](../../internal/cachegen/typefunctions/module.go)), so it renders a controlled alwaysThrow with the family's FUNCTION code (an Error-severity build diagnostic), exactly like a bare function. Pinned by `TestF2b_CallableInArrayElementAlwaysThrows`. Generation re-enable still deferred (G2/G3). |
| **G2** | The soak's `O5 … Too many unknown keys` throw (the `MAX_UNKNOWN_KEYS = 10` DoS guard in [`pure-fns-utils.ts`](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts)) on an index-signature / `Record` shape with dropped sibling members. (The original "bigint / DataView at the index VALUE position" framing was imprecise — the value position serialises fine; the symptom was an unknown-keys MISCOUNT from a value carrying keys a dropped member declared.) | **NOT REPRODUCING** — does not surface across extensive multi-seed soaking after the generation hardening + the G3–G6 fixes (the same dropped-member class). The guard is a controlled throw; no miscount remains. Re-open with a seed if it recurs. |
| **G3** | NEW (soak): an `invalid union index` error on a discriminated union whose members share a property NAME where one member's version is DataOnly-stripped (`{kind:'t1'; f0:Set} \| {kind:'t2'; f0:Promise}`). A value from the stripped member carries the key; binary set its optional-prop bitmap bit while the multi-candidate dispatch matched no arm and wrote no bytes, desyncing the decoder. | **FIXED** — see "G3 / G4" below. |
| **G4** | NEW (soak): the same stripped-merged-prop shape with a `Date` survivor (`{kind:'t1'; f2:Date} \| {kind:'t2'; f2:Uint8Array}`) threw an UNCONTROLLED error (`.toISOString` / `.getTime` is not a function): the merged Date codec was applied to the stripped member's foreign-typed value. | **FIXED** — see "G3 / G4" below. |
| **G5** | NEW (broader soak): a `Map` / `Set` whose VALUE type contains a union of OBJECT members (`Set<Map<string, Record<string, {kind:'t0'}\|{kind:'t1'}>>>`) threw `invalid union index` on JSON decode / dropped the value on binary. The clone Map/Set fast-path (`Array.from(v)`) trusted `isJsonCompatible`, which wrongly reported a union of objects as needing no transform, skipping the `[-1, …]` envelope on encode while the decoder still unwrapped it. | **FIXED** — see "G5" below. |
| **G6** | NEW (broader soak): an object mixing an index signature with a DataOnly-stripped named prop (`{p0?: ArrayBuffer; p1: boolean; [k:number]:"red"}`) — JSON and binary wires disagreed: the clone encoder's index for-in copied the DROPPED `p0` back into the clone (`"p0":{}`) while every other family dropped it. | **FIXED** — see "G6" below. |
| **F3** | An Error-severity diagnostic is emitted for a dropped non-serialisable property, though the value serialises fine; the default `clone` encoder FAILED such a property while the others dropped it; and a structurally-unserialisable property (`symbol[]`) was silently dropped instead of failing | **FIXED** — property-position handling now matches `DataOnly<T>` uniformly across all families. A DIRECTLY-stripped value (symbol / Promise / never / non-serialisable native; functions keep …010) drops with a new child-position **Warning** (…015), and the mutate path `delete`s it so `JSON.stringify` can't leak a typed array / Promise. A value that is only STRUCTURALLY unserialisable (`symbol[]`, `Map<string,symbol>`) now fails (root Error), matching DataOnly keeping `never[]`. An unknown future kind still absorbs gracefully. Pinned by `property_dataonly_test.go`, the updated `runtype-diagnostics.test.ts`, and the `Int8Array in interface` serialization fixture. |
| **G1** | `O5` JSON round-trip corrupted a named property mixed with an index signature of a DIFFERENT value type (`{p0: number; [k: number]: bigint}` round-tripped `p0` from a number into a bigint; with other shapes the corrupted value crashed a downstream numeric op, `Cannot convert a BigInt value to a number`). The JSON for-in index loop transformed EVERY own key, including declared siblings. | **FIXED** — the JSON walks (mutate `prepareForJson`, `restoreFromJson`, direct `stringifyJson`) now skip declared sibling keys via the same `publishSiblingNamedKeysForIndexSig` + `siblingNamedSkipCode` mechanism binary got in F1 (the clone `prepareForJsonSafe` path already skipped its KEPT siblings — though not its DROPPED ones, the gap G6 later fixed). Pinned by `index_sig_sibling_json_test.go` + `g1-index-sig-sibling.test.ts`; the 40s WILD soak (seed 20260620) is clean (974 types, 0 violations). |

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

## Fuzz-lane hardening

Two improvements keep the lanes honest (a violation is only reported on input that
could actually occur):

- **TS-validity gate.** `tsgo` is lenient: it still produces a RunType for a type
  that does NOT compile, so a violation on an invalid type is a FALSE POSITIVE,
  not a pipeline bug. When any oracle fires, the runner now typechecks the
  generated type's declarations with the repo's own `typescript` package
  ([`tsValidate.ts`](../../packages/ts-runtypes/test/fuzz/tsValidate.ts)) and DROPS
  the violation if it does not compile, counting it in
  `report.skippedInvalidTypes`. The check runs only on a violation, so a clean run
  pays nothing. This caught that the generator was emitting invalid TypeScript:
  the object render hardcoded `[k: string]`, which forces every named prop to the
  index value type (TS2411). It also revealed the committed F1 fixtures were
  invalid for the same reason. (Pinned by `tsValidateGate.test.ts` +
  `bugReprosValidTs.test.ts`, which also typechecks every fixed-bug repro.)
- **Valid-type generation.** `genObject` now generates the index signature FIRST
  (lower probability than a regular prop) with a RANDOM key kind set — `string`,
  `number`, `symbol`, or any union (`[k: string | number]`, …); the resolver
  splits a union key into one signature per kind, so the value generators + the
  product mock handle each independently. A key set containing `string` forces the
  named props to the index value type (a string index constrains every named prop,
  TS2411), so the object stays valid; otherwise string-named props are free. The
  shape-lane value (`shapeValue.ts`) keys each index entry by the declared kind
  (numeric for a number key, dropped for a symbol key) so the value conforms — a
  non-numeric key under a number index is corrupted by the binary number-index
  codec. `createMockType` already keys on the resolved index kind. Any residual
  invalid combo (e.g. a numeric weird-key prop under a number-only key, ~9% of
  generated types) is dropped by the gate above.

Note the gate only filters TYPE-level false positives. A VALUE-level mismatch (the
mock building a value that doesn't conform to a valid type, e.g. G4) is not caught
and remains a real finding to triage.

## Where the code lives

- Binary emitter (index signatures, the F1 site) — [`internal/cachegen/typefunctions/binary_to.go`](../../internal/cachegen/typefunctions/binary_to.go), [`binary_from.go`](../../internal/cachegen/typefunctions/binary_from.go)
- JSON object/index-sig emit (the correct reference + the absorption path) — [`internal/cachegen/typefunctions/json_prepare.go`](../../internal/cachegen/typefunctions/json_prepare.go)
- Union flat layout + merged-prop emit (the K2 site) — [`internal/cachegen/typefunctions/union_flat_layout.go`](../../internal/cachegen/typefunctions/union_flat_layout.go), [`union_flat.go`](../../internal/cachegen/typefunctions/union_flat.go)
- Validate root arms (the F2 site) — [`internal/cachegen/typefunctions/validate.go`](../../internal/cachegen/typefunctions/validate.go)
- Diagnostic severities (the F3 site) — [`internal/cachegen/typefunctions/diag_codes.go`](../../internal/cachegen/typefunctions/diag_codes.go), [`internal/diagnostics/codes_runtype.go`](../../internal/diagnostics/codes_runtype.go)
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

In the binary index-signature emit ([`binary_to.go`](../../internal/cachegen/typefunctions/binary_to.go) /
[`binary_from.go`](../../internal/cachegen/typefunctions/binary_from.go)): encode the
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
  ([`json_prepare.go:396-407`](../../internal/cachegen/typefunctions/json_prepare.go), `AbsorbUnsupported`).
- Union `X | {b: symbol}` → fails: `buildMergedProps` only filters FUNCTION-LIKE
  props ([`union_flat_layout.go:177`](../../internal/cachegen/typefunctions/union_flat_layout.go)),
  so a `symbol` / `Promise` / non-serializable-valued prop survives into the merge,
  emits `CodeNS`, and `emitMergedPropPrepare` returns false
  ([`union_flat.go:154-162`](../../internal/cachegen/typefunctions/union_flat.go)), which
  alwaysThrows the whole union ([`union_flat.go:110-115`](../../internal/cachegen/typefunctions/union_flat.go)).

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
    [`validate.go`](../../internal/cachegen/typefunctions/validate.go) ~lines 459-468).
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

Option 1 was taken (it matches `DataOnly<CallableInterface> = never`): the product
side is fixed (F2) and the emit cascade is fixed (F2b, below).

### F2b — the silent-skip emit bug (FIXED)

F2 made the serializers treat a callable interface as function-like by returning
`CodeNS` for it (`objectHasCallSignature`). That works at the root and at a
property, but at a NON-ROOT propagating position (array element, Map/Record value,
tuple slot, intersection) it left the entry SILENTLY SKIPPED, which a downstream
JSON composite then bound with an unguarded `getRT(key).fn`:

1. The serializer guard returns `CodeNS`, so the walker latches the callable
   **objectLiteral** as `UnsupportedLeaf` ([walker.go](../../internal/cachegen/typefunctions/walker.go)).
2. The alwaysThrow site ([module.go](../../internal/cachegen/typefunctions/module.go)) calls
   `DiagCodeForLeaf(leaf)`, but `rootCodeMap.codeFor`
   ([diag_codes.go](../../internal/cachegen/typefunctions/diag_codes.go)) maps only
   `KindFunction`/`KindMethod`/`KindCallSignature` to the family `function` code —
   no `KindObjectLiteral` arm → returns `""` → the entry is silently skipped (no
   factory, no alwaysThrow).
3. A container that hard-depends on the skipped entry (e.g. the array's pjs)
   cascades to a `KindMissing` stub; the JSON composite
   ([json_composite.go](../../internal/cachegen/typefunctions/json_composite.go)) binds
   `const pjsFn = utl.getRT(<key>).fn` on that stub → `reading 'fn'` at runtime.
   Binary has no composite, so the stub surfaces as `no id injected`.

**Fix:** `callableLeafSubstitute(leaf, refTable)`
([kinds.go](../../internal/cachegen/typefunctions/kinds.go)) maps a callable-interface
objectLiteral leaf to its call-signature child; `module.go` substitutes before
`DiagCodeForLeaf`, so the family's FUNCTION code fires and the entry renders a
controlled alwaysThrow (Error-severity diagnostic), exactly like a bare function.
Every non-callable leaf passes through unchanged; a nil/unresolvable RefTable
falls back to the original leaf (the unknown-future-kind safety net). Pinned by
`TestF2b_CallableInArrayElementAlwaysThrows`.

### Re-enabling generation — still deferred (G2/G3)

Callable-interface GENERATION stays disabled in the fuzz generator
([`typeGen.ts`](../../packages/ts-runtypes/test/fuzz/typeGen.ts), `genDecl`); the
`calls` plumbing is kept so it can be re-enabled. F2b is no longer the blocker —
the investigation soak (generation re-enabled) drove `reading 'fn'` / `no id
injected` to zero — but it surfaced SEPARATE pre-existing serialization bugs
(G3 / G4 stripped-merged-prop unions, G5 Map/Set union envelope, G6 index-sig
dropped-prop skip), all now FIXED below. Re-enabling callable generation is a
clean follow-up.

---

## F3 — property-position handling did not match `DataOnly<T>` (FIXED)

Three related divergences at an object PROPERTY position, all surfaced (or
explained) by the non-data lane:

1. **Wrong severity.** A directly DataOnly-stripped property value (symbol /
   Promise / never / a non-serialisable native like `Int8Array`) was DROPPED at
   runtime (correct) but the build emitted a ROOT-position **Error**
   (`DiagCodeForLeaf` returns the …001/…002/…005/…006 root codes). An Error means
   "will throw at runtime"; the factory serialises fine, so it over-reported.
2. **`clone` disagreed with the rest.** The default `clone` encoder
   (`prepareForJsonSafe`) FAILED such a property (`safeChildExpr` propagated
   CodeNS), while `mutate` / `direct` / `binary` dropped it — a family
   disagreement for the SAME type.
3. **Structural drop was silent.** A property whose value is only STRUCTURALLY
   unserialisable (`{a: symbol[]}`, `{a: Map<string,symbol>}`) was silently
   DROPPED, but `DataOnly<{a: symbol[]}>` = `{a: never[]}` KEEPS the property, so
   it cannot be represented and must fail (the oracle's "can't be safely dropped"
   case).

### Fix

A single classifier, `strippedPropertyDrop` (over `isStrippedUnionMember`), runs
in every property emitter + the binary/safe object pre-filters:

- **Directly stripped** value → drop the property, emit a new child-position
  **Warning** (`…015`, `CodeXxNonSerializablePropDrop`; function-valued props keep
  `…010`). The mutate `prepareForJson` path emits `delete v.<name>` for the kinds
  `JSON.stringify` would otherwise leak as a plain object (Promise, typed arrays,
  ArrayBuffer / DataView) so its output matches clone / direct / binary.
- **Structurally unserialisable** value (a stripped LEAF reached through a
  propagating slot) → propagate CodeNS so the object alwaysThrows with the root
  Error, via `propertyChildFailed`.
- **Unknown future kind** (no emit, e.g. a synthetic `KindIntersection`) → still
  absorbed gracefully (no diagnostic), preserving the pre-DataOnly contract.

The runner still tiers serialize-vs-fail from ACTUAL encoder behaviour (the
robust default), but the resolver no longer over-reports Errors on dropped
properties, so a future diagnostics-assisted tier is now sound. Pinned by
`internal/cachegen/typefunctions/property_dataonly_test.go`, the updated
`runtype-diagnostics.test.ts`, the `TestDiag_PropertyAbsorbsUnsupportedChild_NeverProp`
resolver test, and the `Int8Array in interface` serialization fixture.

---

## G3 / G4 — a flat-union merged prop with a DataOnly-stripped sibling (FIXED)

A discriminated union whose members share a property NAME where one member's
version is DataOnly-stripped:

```ts
{kind: "t1"; f2: Date} | {kind: "t2"; f2: Uint8Array}      // G4
{kind: "t0"; f0?: null} | {kind: "t1"; f0: Promise<string>} | {kind: "t2"; f0: Set<number>}  // G3
```

The flat-union encoder (`union_flat*.go`) MERGES members' properties into one
`[-1, mergedObject]` envelope. `buildMergedProps` drops the stripped candidate
(`f2: Uint8Array`, `f0: Promise`) from the merge — but a value belonging to the
STRIPPED member still carries that key at runtime (the mock builds the full
value). The merged encode applied the surviving candidate's codec whenever the
key was present, without checking the value matched it:

- **G4** (single surviving candidate): the Date codec ran `f2.toISOString()` on
  the t2 value's `Uint8Array` → uncontrolled crash.
- **G3** (multi surviving candidate): binary set the optional-prop bitmap bit for
  the present `f0`, but the multi-candidate sub-dispatch matched neither `null`
  nor `Set` (the value was a `Promise`), wrote no bytes, and desynced the decoder
  → `invalid union index` / DataView overrun. JSON's clone path happened to dodge
  it (its fallthrough returns `undefined`, dropped by `JSON.stringify`).

### Fix

`FlatMergedProp.HasStrippedCandidate` ([union_flat_layout.go](../../internal/cachegen/typefunctions/union_flat_layout.go))
records when a sibling member declared the prop with a stripped type (always
implies `!Required`). When set, every encode family guards the surviving codec
with `mergedPropSurvivingGuard` (the OR of the surviving candidates' validate
checks) and DROPS the key when the value matches none — its correct DataOnly
projection. The mutate path `delete`s it, the clone path folds the guard into the
`!== undefined` presence test, the direct path extends the `=== undefined ? ''`
drop, and the binary path gates the bitmap bit. Decoders are unchanged (the
dropped key is simply absent on the wire). The guard fires ONLY for the rare
stripped-sibling case, so the common discriminated-union path is untouched.
Pinned by `union_flat_stripped_prop_test.go` + `unionStrippedSibling.smoke.test.ts`.

---

## G5 — a Map/Set value-type containing a union of object members (FIXED)

`Set<Map<string, Record<string, {kind:'t0'} | {kind:'t1'}>>>` threw `invalid
union index` on JSON decode (and dropped the value on binary). The flat-union
encoder ALWAYS wraps object members in a `[-1, …]` envelope (for decode
disambiguation), but `isJsonCompatible` ([json_compat.go](../../internal/cachegen/typefunctions/json_compat.go))
reported a union of JSON-compatible OBJECT members as compatible (= "no
transform"). The Map/Set clone fast-path (`Array.from(v)`,
`emitNativeIterablePrepareForJsonSafe`) trusted that and skipped the envelope on
encode, while the decoder (driven by the actual compiled child, not the
predicate) still unwrapped it.

### Fix

`isJsonCompatible`'s `KindUnion` arm now returns false when any member buckets
into the merged-object branch (`unionMemberEnvelopes`, mirroring
`buildFlatLayout` + `unionJsonNoop`'s decode arm), so a union of objects is
correctly "needs transform" everywhere — the Map/Set value is encoded per-entry
with its envelope. Pinned by the `union of object members (envelopes)` case in
`json_compat_test.go` + `mapSetUnionEnvelope.smoke.test.ts`.

---

## G6 — clone index-sig for-in copied a DROPPED sibling key (FIXED)

`{p0?: ArrayBuffer; p1: boolean; [k:number]:"red"}` round-tripped differently on
the JSON-clone vs binary wires: the clone kept `"p0":{}` while every other family
dropped it. The clone encoder
(`buildSafeIndexSignatureObject`, [json_prepare_safe.go](../../internal/cachegen/typefunctions/json_prepare_safe.go))
built its index for-in "skip declared keys" set from the KEPT props only, so the
DROPPED `p0` fell through to the index arm and was copied back into the clone.
Binary already skipped it via `collectSiblingNamedKeys` (which keys on the NAME,
independent of whether the prop is kept or dropped).

### Fix

The clone path now builds its skip set with the same `collectSiblingNamedKeys`
helper (extracted from `publishSiblingNamedKeysForIndexSig`), so the full
declared-name set (kept + dropped) is skipped. Pinned by
`TestG6_CloneIndexSigSkipsDroppedSiblingProp` /
`TestG6_BinaryAndCloneSkipSameSiblingKeys` in `index_sig_sibling_json_test.go` +
`indexSigDroppedProp.smoke.test.ts`.

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
- Update the website page [`container/website/content/6.suites/6.how-we-fuzz.md`](../../container/website/content/6.suites/6.how-we-fuzz.md)
  so the F1 story reads as found-and-fixed.
