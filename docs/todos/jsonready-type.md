# `JsonReady<T>` — the JSON-wire projection type + a type↔runtime fuzz

**Status:** SPEC — for review, decision pending. New branch off `main`
(`claude/mion-migration-implementation-fgfbda`, reset onto `origin/main` @ `3c74d02`). Requested by the
user as a follow-up to the mion-adoption work.

> **⚠️ Read §9 first.** After writing §1–§8 we established that "prepareForJson" is not a single
> function — the JSON codec has **four encode strategies backed by three different value-level prepare
> primitives** (`mutate`→`pj`, `clone`→`pjs`, `direct`→`sj`, `compact`→`compactForJson`), and their
> *returned/wire values differ* (esp. `compact`, which is a positional-array wire). A truly faithful
> design therefore needs **one `JsonReady*` type per prepare variant**, not one universal type. That is
> more surface than the original ask. **Current call (user, pending confirm): export all prepare/restore
> variants so users can pick, but DEFER the per-variant `JsonReady` types — they're not worth building
> yet.** §1–§8 below describe the *standard* wire (`mutate`/`clone`/`direct`, which converge); §9 is the
> corrected, wider picture and the deferral.

## Goal

`DataOnly<T>` strips non-serialisable members but KEEPS `Date`/`Map`/`Set`/`RegExp`/Temporal as-is.
We want a sibling **`JsonReady<T>`** that goes one step further and reflects the *actual JSON
conversion the library performs*, so a framework (mion) can type an RPC wire payload precisely:

| `T` | `DataOnly<T>` (today) | **`JsonReady<T>` (new)** |
|---|---|---|
| `Date` | `Date` | `string` |
| `Temporal.Instant` | `Temporal.Instant` | `string` |
| `bigint` | `bigint` | `string` |
| `RegExp` | `RegExp` | `string` |
| `Set<E>` | `Set<E>` | `JsonReady<E>[]` |
| `Map<K,V>` | `Map<K,V>` | `[JsonReady<K>, JsonReady<V>][]` |
| transforming union | union preserved | `[index, val]` envelope |
| `() => void` (prop) | dropped | dropped |

Plus a **fuzz test** (compare-to-a-trusted-source): generate random types, produce a conforming
value, run it through the real `prepareForJson`, and assert the runtime wire value conforms to
`JsonReady<T>`.

---

## 1. Ground truth — the runtime JSON wire shape (per kind)

Assembled from the emitters (`ts-go-runtypes/internal/cachegen/typefunctions/json_prepare_safe.go`
clone emitter, `json_prepare.go` mutate, `union_flat_layout.go`/`union_flat.go` union layout,
`json_compat.go` compatibility predicate, `json_composite.go` root wrap). `Prep<X>` = the wire shape
of child `X`. **All of `clone`/`mutate`/`direct` share ONE wire shape** (byte-identical by design,
`json_prepare_safe.go:14-17`); `JsonReady<T>` models that shape. The 4th strategy `compact`
(positional arrays, no keys) is a DIFFERENT wire and is **out of scope** — do not fold it in.

| Kind | Wire value | Notes / cite |
|---|---|---|
| `string`/`number`/`boolean`/`null` | identity | `json_prepare.go:89-95` |
| `bigint` | **`string`** (decimal) | `json_prepare.go:102-105`; restore `BigInt(v)` `json_restore.go:99` |
| `Date` | **`string`** (ISO) | clone `.toISOString()` `json_prepare_safe.go:143` |
| `Temporal.*` (8 types) | **`string`** (canonical `.toJSON()`) | `json_prepare_safe.go:137`; `protocol/temporal.go:59` |
| `RegExp` | **`string`** `"/src/flags"` | `json_prepare.go:114-116` |
| enum | identity (underlying) | `json_compat.go:89` |
| primitive literal | identity | `json_prepare.go:239-240` |
| `array E[]` / `ReadonlyArray` | `Prep<E>[]` | `json_prepare.go:206-223` |
| `tuple [A,B]` | `[Prep<A>,Prep<B>]`; **optional slot present-but-`undefined` → `null`** | `json_prepare.go:457-526` |
| `object`/`interface` | recurse declared props; **drop** non-data members (fn/method/symbol/`Promise`/non-serialisable/`never`) | `json_prepare.go:251-311`; drop set `union_strip.go:29-43` |
| optional prop `x?: T` | `x?: Prep<T>` | `json_prepare.go:391-396` |
| index sig `[k:string]:V` | `{ [k:string]: Prep<V> }` (symbol keys skipped) | `json_prepare.go:400-455` |
| `Set<E>` | **`Prep<E>[]`** (flat array) | `json_prepare_safe.go:950-990` |
| `Map<K,V>` | **`[Prep<K>,Prep<V>][]`** (array of pairs) | `json_prepare_safe.go:984-986` |
| union | envelope — **§2** (NOT always wrapped) | `union_flat_layout.go` |
| class + registered serializer | `serialize(v)` output | `class_serializer.go:116-132` |
| plain user class (no serializer) | structural object | `json_prepare.go:138-140` |
| `unknown`/`any` | identity pass-through | `json_compat.go:86-87` |
| `undefined`/`void` (value level) | `undefined` (dropped at prop) | see §3 |
| `symbol` (bare) | UNSUPPORTED → drop@prop / throw@root | `json_prepare.go:107-112` |
| `function`/`Promise`/typed-arrays | UNSUPPORTED → drop@prop / throw@root | `json_prepare.go:143-178` |
| `never` | UNSUPPORTED → throw | `json_prepare.go:97-100` |

The **drop set** (non-serialisable members removed at object/property positions, collapse to `never`
at propagating positions) is *identical* to `DataOnly`'s `DataOnlyStripped` — so `JsonReady` reuses
that exact strip arm.

## 2. Union wire shape (the hard part — the user's "`[index, val]`" is conditional)

Runtime layout (`buildFlatLayout` `union_flat_layout.go:154`):

1. **Strip** DataOnly-stripped members first; survivors kept gap-free, loop index = wire index.
2. **`roundTripsRaw`** = every survivor is `isJsonCompatible` (`union_flat_layout.go:368`). **If true →
   NO envelope, identity wire** (`string | number` → `string | number`; `{a:string} | {b:number}` →
   identity). A named-class member forces the envelope even if compatible.
3. **If not all-compatible → ALL-OR-NOTHING envelope:**
   - atomic member at survivor-index `i` → **`[i, Prep<member>]`** (`union_flat.go:164`),
   - ALL object-bucket members → **one `[-1, mergedObject]`** (`union_flat.go:206`), merged object =
     union of every object member's props, each `Prep`'d, conflicting props sub-wrapped `[subIdx, v]`.
   - Even a bare `string` member becomes `[0, "…"]` once any member wraps.

**Type-level obstruction:** the index `i` is post-strip *declaration order*, but TS union members are
**unordered** in the type system — exact literal indices are NOT computable in a mapped type. And
merging all object members into one `[-1, merged]` object needs union-to-intersection gymnastics.

**Proposed sound modeling** (superset of the runtime value, so the fuzz assignability oracle passes):

- All-JSON-compatible union → **identity** (natural distribution; `JsonReady<member> === member`).
- Transforming union →
  ```
  (each atomic member M)  [number, JsonReady<M>]      // index widened to `number`
  | (if any object member) [-1, Record<string, JsonValue>]   // loose-but-sound object bucket
  ```
  `[0, "iso"]` ⊑ `[number, string]` ✓ ; `[-1, {a:"42"}]` ⊑ `[-1, Record<string,JsonValue>]` ✓.

This captures the `[index, val]` tuple shape the user asked for and is fuzz-sound. It trades
precision on (a) the exact index literal and (b) the merged-object props. **Decision D2** below asks
whether to invest in a precise merged object (union-to-intersection) or ship the loose bucket for v1.

Needs a type-level **`IsJsonCompatible<M>`** predicate mirroring `json_compat.go:40-212`: `true` for
`string`/`number`/`boolean`/`null`/enum/literal/`unknown`/`any`/plain object of compatible props/
array·tuple of compatible/compatible-union; `false` for `Date`/Temporal/`bigint`/`RegExp`/`Map`/
`Set`/`undefined`/`void`/named-class/non-serialisable. (This is also the correct predicate for
"`JsonReady<T> === T`", NOT the pj-noop set — `Date` is a pj-noop yet its wire value is a string.)

## 3. Root `undefined`/`void`

Value-level `prepareForJson(undefined) === undefined` (`createRTFunctions.ts:315-325`); the `[null]`
one-element array is a *document* concern of `createJsonEncoder`, not the value transform
(`json_composite.go:245-297`). So **`JsonReady<undefined>` = `undefined`, `JsonReady<void>` =
`undefined`** at the value level. The document envelope is not modeled by `JsonReady`.

## 4. The `JsonReady<T>` type (sketch)

A sibling recursion in its own module `packages/ts-runtypes/src/runtypes/jsonReady.ts`, `#region
jsonready-extract` markers (sliced verbatim by tests, exactly like `dataOnly.ts` / `friendlyText.ts` /
`mockData.ts`). Depth-bounded (`_JsonReadyDepth` decrement, budget 8). Structure:

```ts
// #region jsonready-extract
export interface JsonReadyToStringExtra {}                 // augmentation hook (Temporal → string)
type JsonReadyToString = Date | RegExp | JsonReadyToStringExtra[keyof JsonReadyToStringExtra];
type JsonReadyStripped = /* == DataOnlyStripped (symbol|fn|ctor|thenable|buffers) */;
type JsonValue = string | number | boolean | null | JsonValue[] | {[k: string]: JsonValue};
type _JsonReadyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

export type JsonReady<T, Depth extends number = 8> =
  Depth extends 0 ? JsonValue
  : unknown extends T ? JsonValue                          // any/unknown → any JSON value
  : [T] extends [never] ? never
  : T extends JsonReadyStripped ? never                    // drop / collapse
  : T extends bigint ? string
  : T extends JsonReadyToString ? string                   // Date | RegExp | Temporal(aug)
  : T extends string | number | boolean | null ? T
  : T extends undefined | void ? undefined
  : T extends ReadonlyMap<infer K, infer V> ? [JsonReady<K, D-1>, JsonReady<V, D-1>][]
  : T extends ReadonlySet<infer U> ? JsonReady<U, D-1>[]
  : T extends readonly unknown[] ? { -readonly [K in keyof T]: JsonReady<T[K], D-1> }  // array+tuple
  : IsUnion<T> extends true
      ? AllJsonCompatible<T> extends true ? T              // identity union
      : JsonReadyUnionEnvelope<T, D-1>                     // §2 envelope (non-distributive)
  : T extends object
      ? object extends T ? JsonValue                       // broad object/{} → any JSON value
      : { [K in keyof T as K extends symbol ? never
            : [JsonReady<T[K], D-1>] extends [never] ? never : K]: JsonReady<T[K], D-1> }
  : T;                                                     // fallback
// #endregion jsonready-extract
```

Open sub-points for the build:
- **`IsUnion<T>`** must be checked *before* the object branch and *without* distributing (wrap in
  `[T]`). Standard `IsUnion` helper (`[T] extends [UnionToIntersection...]`).
- **Optional tuple slot → `null`**: `{ -readonly [K in keyof T]: … }` on a tuple keeps `?`, but the
  runtime replaces a present-but-`undefined` optional slot with `null` (`json_prepare.go:515-521`).
  Model optional tuple slots as `JsonReady<T[K]> | null` (or keep `?`; decide during build — a fuzz
  case will pin it).
- **Named user class**: runtime = `serialize(v)` output (with a registered serializer) or structural
  object (without). Generic type-level modeling of an arbitrary serializer output is intractable;
  propose **structural-object projection** for the no-serializer case (falls through to the object
  branch) and, for a registered serializer, `JsonReady<SerializeReturn>` if the registry type exposes
  it, else `JsonValue`. Flag as a corner (rare in wire DTOs).
- **`JsonReadyToStringExtra` augmentation** lives in `formats/datetime/temporalFormats.ts` (same file
  that augments `DataOnlyNativeExtra`), adding the 8 Temporal types → the augmentation is *value* =
  the Temporal instance types, and `JsonReady` maps any member of that union to `string`. Keeps the
  Temporal-lib coupling out of core (same D1 self-guard concern as last PR — core never names
  `Temporal`).

## 5. Wiring / export surface

- Export `JsonReady` from `packages/ts-runtypes/src/index.ts` (next to `DataOnly`).
- **Decision D1** governs factory wiring:
  - `createPrepareForJson<T>()` return type → `JsonReady<T>` (requires clone-materialised runtime so
    the value truly has `Date` as string — see D1).
  - `createRestoreFromJson<T>()` input → `JsonReady<T>`, return `DataOnly<T>` (typed inverse pair:
    `prepare: T → JsonReady<T>`, `restore: JsonReady<T> → DataOnly<T>`).
  - Optionally the JSON encoder/decoder gain `JsonReady<T>` as their logical wire type in docs
    (their signatures stay `string`).

## 6. Test plan (mirrors the DataOnly test trio + a new fuzz)

1. **Per-branch compile/budget test** `test/types/jsonReady.compile.test.ts` + `jsonReadyHarness.ts`
   (slice `#region jsonready-extract` verbatim, `Equal`/`Expect` preamble, `makeMeasurer`). One
   `Expect<Equal<JsonReady<X>, Expected>>` per kind: bigint→string, Date→string, Temporal→string
   (via local augmentation stub), RegExp→string, Set→array, Map→pairs, array/tuple recurse, object
   drop-and-recurse, optional, index sig, compatible-union identity, transforming-union envelope,
   nested, circular (budget). This is the **exactness/too-wide** guard the fuzz can't give.
2. **Factory-wiring type test** `test/types/jsonReadyReturnType.test.ts` (analog of
   `decodeReturnType.test.ts`): `Expect<Equal<ReturnType<typeof createPrepareForJson<T>>,
   JsonReady<T>>>` etc. Checked by `typecheck:test` (vitest erases types).
3. **The fuzz** `test/fuzz/type/jsonReadyType.integration.test.ts` — **compare-to-a-trusted-source**,
   the runtime `prepareForJson` output is the oracle:
   - `genType(preset)` (add a `JSONREADY_GEN_OPTIONS` preset biased to transforming kinds: Date,
     bigint, Set, Map, unions, tuples, optionals). Seeded via `withSeededRandom`.
   - Compile through the real resolver (`type/typeFuzzHarness.ts compileType`); read the serialize-vs-
     reject tier off actual encoder behaviour (like `nonDataTypeFuzz`). Skip reject-tier (or assert
     `JsonReady<T>` is `never`/uninhabited).
   - Conforming value via `shapeValue.genValidValue(gen)` (pure) or `wired.mock()`; skip `floored`.
   - `wire = JSON.parse(clone-strategy encode(value))` — pure JSON, so **renderable as a TS literal**.
   - Emit snippet `<decls>; type __T = <root>; const __w: JsonReady<__T> = <wire-literal>;` and compile
     in-process (`tsValidate`-style host + the `jsonready-extract` preamble). Zero errors ⇒ pass; an
     error ⇒ `JsonReady` too narrow for a real wire value ⇒ bug (shrink via seed like `enrichFuzz`).
   - **Negative control**: deliberately break `JsonReady` (e.g. force Date→Date) and confirm the fuzz
     FIRES — proves the harness catches divergence.
   - **Direction caveat (document in the test):** assignability catches *too-narrow*; test 1 (exact
     `Equal`) bounds *too-wide*.
   - Harness detail to resolve: forcing **tuple** (not array) inference on rendered envelope literals
     (annotate, or model the envelope as `readonly` tuples so a mutable runtime tuple still assigns).

## 7. Files touched (estimate)

- **new** `packages/ts-runtypes/src/runtypes/jsonReady.ts` (the type + region)
- `packages/ts-runtypes/src/index.ts` (export)
- `packages/ts-runtypes/src/createRTFunctions.ts` (D1 wiring: prepare/restore return/param types)
- `packages/ts-runtypes/src/formats/datetime/temporalFormats.ts` (augment `JsonReadyToStringExtra`)
- **maybe Go** `ts-go-runtypes/internal/cachegen/typefunctions/` — only if D1a (route
  `createPrepareForJson` through the clone/materialise emitter so its return truly matches `JsonReady`)
- **new tests** `test/types/jsonReady.compile.test.ts`, `jsonReadyHarness.ts`,
  `jsonReadyReturnType.test.ts`, `test/fuzz/type/jsonReadyType.integration.test.ts`, a
  `JSONREADY_GEN_OPTIONS` preset in `test/fuzz/core/typeGen.ts`
- **docs**: website `2.guide` serialization page (the wire-shape table), `README`/`ARCHITECTURE` if
  they enumerate the type surface, a `packages/examples/src/` compilable example
- move this spec `docs/todos/ → docs/done/` on completion (PR-readiness gate)

## 8. Decisions (status)

- **D1 — semantics.** RESOLVED in principle, but see §9. `JsonReady<T>` = the JSON **wire** shape
  (`Date`→**string**), matching "dates to strings". Do **not** change any existing runtime (D1 mandate).
  The value-level `createPrepareForJson` shipped last PR is the `mutate`/`pj` primitive, whose *raw
  return keeps `Date` as a `Date`* (materialised to a string only by the downstream `JSON.stringify`) —
  so `JsonReady<T>` is NOT `ReturnType<createPrepareForJson>` for that variant. The primitive whose
  returned value genuinely IS `JsonReady<T>` (dates already strings) is `prepareForJsonSafe`
  (`pjs`/clone), which already exists internally and would just be **exposed** as
  `createPrepareForJsonSafe` (additive, no behaviour change). See §9.
- **D2 — union precision.** DECIDED: **(A)** sound-but-loose envelope. Per user: model a member as
  `[number, JsonReady<M>] | JsonReady<M>` (some members ride raw due to no-tuple optimisations), object
  bucket as `[-1, Record<string, JsonValue>]`. No exact index literal / merged-prop reconstruction.
- **D3 — fuzz oracle.** DECIDED: **(A)** assignability (runtime wire ⊑ `JsonReady<T>`, catches
  too-narrow) + the exact per-branch compile test (bounds too-wide) + a negative control.

## 9. Strategy landscape — likely **one `JsonReady*` per prepare variant** (DEFERRED)

"prepareForJson" is not one function. The JSON codec exposes **four encode strategies** on
`createJsonEncoder<T>(val?, options?, id?)` (`options.strategy`), each backed by a distinct value-level
primitive, and the **prepared/wire value differs per strategy** (`json_composite.go:303-326`,
`createRTFunctions.ts:156-189`, `operations.go:113-118`):

| encode strategy | prepare primitive | value-level factory | prepared value for `Date` | wire shape |
|---|---|---|---|---|
| `mutate` | `prepareForJson` (`pj`) | `createPrepareForJson` (shipped) | stays `Date` (noop; string at `stringify`) | standard JSON |
| `clone` (default) | `prepareForJsonSafe` (`pjs`) | *not yet exposed* → `createPrepareForJsonSafe` | already ISO `string` | standard JSON (same as mutate/direct) |
| `direct` | `stringifyJson` (`sj`) | *string-only, no value stage* | — (goes straight to string) | standard JSON |
| `compact` | `compactForJson` | *not yet exposed* | positional array, no keys | **DIFFERENT** wire |

Decode side mirrors it: `restoreFromJson` (`rj`, shipped as `createRestoreFromJson`) + a `compact`
decoder (`compactFromJson`) + strip/preserve variants on `createJsonDecoder`.

**Consequence for the type.** `mutate`/`clone`/`direct` all converge on ONE standard JSON wire, so a
single `JsonReady<T>` (§1–§8) types all three. But:
- `compact` is a genuinely different wire (objects → positional arrays) → it needs its **own**
  `JsonReadyCompact<T>` (shape-coupled, both ends share `T` — like the binary codec). Non-trivial.
- If we expose `createPrepareForJson` (mutate) *and* `createPrepareForJsonSafe` (clone) as a typed pair,
  only the clone one's raw return equals `JsonReady<T>`; the mutate one's raw return is a "pre-stringify"
  shape (`Date` still a `Date`) that would need either no `JsonReady` return type or a separate
  `JsonPrepared<T>` alias. More types, more surface.

**Decision (user, pending confirm after reading this spec):**
1. **Export all prepare/restore variants** so users can pick the value-level transform matching their
   chosen encode/decode strategy: `createPrepareForJson` (shipped), **add** `createPrepareForJsonSafe`
   (clone) and the `compact` prepare, plus `createRestoreFromJson` (shipped) and the `compact` restore.
   (Pure exposure of existing primitives — additive, no runtime change.)
2. **DEFER the per-variant `JsonReady*` types.** Building a faithful type per strategy — especially
   `JsonReadyCompact<T>` — is more complex than the original ask and not worth it yet. Ship (1); revisit
   the typed projections (including whether a single standard `JsonReady<T>` for `mutate`/`clone`/`direct`
   is worth landing on its own) as a follow-up once the exposure lands and real mion usage clarifies which
   variants matter.

So the concrete near-term work is item (1) — the exports — with the type work parked behind this spec.
