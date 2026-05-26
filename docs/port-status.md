# Mion JIT Port — Status, Deviations, and Open Failures

Status snapshot of every JIT function family ported from
[mion's `@mionjs/run-types`](https://github.com/mionkit/mion) into
ts-go-run-types: what was ported, where our emit intentionally
deviates from mion, and the precise list of currently-failing tests
with their root cause (sample-data mismatch vs. real implementation
gap) so follow-up work can be triaged.

Current test counts (after the most recent push):

- **`@mionjs/ts-go-run-types`**: 867 pass / 0 fail. All 9 original
  open failures closed; 6 EXTRA_PARAMS section tests; 18 wrapper-factory
  tests (`test/safeUnsafeJsonWrappers.test.ts`); 25 stringifyJson tests
  (`test/createStringifyJson.test.ts`); 12 new tests for Map/Set in the
  unknown-keys family (`test/adapters/unknownKeys.test.ts` "iterables"
  describes — see "Map/Set in unknown-keys" below).
- **`vite-plugin-runtypes`**: 212 / 212
- **Go (`internal/...`)**: all green

Closed since the prior snapshot:

- Failures 1–9 in the "Open failures — analysis" section below.
  Resolutions summarised at the top of each entry, full breakdown
  follows. Net: -9 deterministic failures, no remaining flakes.
- **Map/Set in the unknown-keys family** (`hasUnknownKeys`,
  `unknownKeyErrors`, `stripUnknownKeys`, `unknownKeysToUndefined`):
  emit ported from mion's `IterableRunType` (Iterable.ts:86-152).
  Previously every Map/Set ran a `KindClass+SubKindMap/SubKindSet`
  arm that returned an empty body, so `hasUnknownKeys(Map<string,
  ObjWithExtras>)` always reported false and the strip/error/undefine
  variants silently no-op'd. The wire-sibling `ukuw` keeps Map/Set
  as a noop on purpose — its input is the post-`JSON.parse` array
  shape (not yet a Map/Set instance), so the wire pipeline relies on
  the encoder side (`prepareForJsonSafe`) already having stripped
  inner extras before the array is produced.

## JSON serialisation semantics — two paths

mion ships two paths for `T → JSON-string` with intentionally-
different extras semantics; we mirror both:

- **Unsafe path** (`prepareForJson + JSON.stringify`):
  `prepareForJson` walks declared children, transforms them in
  place, and mutates `v`. Extras (properties not in the type) are
  never visited and pass through to `JSON.stringify`, which then
  includes JSON-compatible extras, throws on bigint extras, and
  silently drops symbol-/function-valued extras. Public API:
  `createUnsafeJsonStringify<T>()` + `createUnsafeJsonParse<T>()`.
- **Safe path** (single-pass `stringifyJson` JIT — ported from mion's
  `jitCompilers/json/stringifyJson.ts`, see "Migrated JIT function
  families" below). Extras are stripped by construction in the emit
  (walks declared members only, never `v`'s own enumerable keys),
  `v` is not mutated, and JSON-incompatible extras are silently
  dropped before they can crash. Public API:
  `createStringifyJson<T>()` direct, OR
  `createSafeJsonStringify<T>()` wrapper (single JIT call internally)
  + `createSafeJsonParse<T>(undefined, {onUnknownKeys})`.
  `createSafeJsonParse` accepts `{onUnknownKeys: 'strip' | 'error'}`
  in its 2nd positional slot (default `'strip'`); `'error'` runs
  `unknownKeyErrors` first and throws `SafeJsonParseError`
  (carries the `RunTypeError[]`) when any unknown key is present.

Test infrastructure:
- `SerializationCase.getTestData` is the canonical source for the
  unsafe-path expectations.
- `getTestDataForStringify` is an optional override consumed by the
  future safe-path adapter when the expected output diverges
  (typically only for extras-bearing cases).
- The `EXTRA_PARAMS` section in
  `test/suites/serialization-suite.ts` documents every divergence
  kind in executable form (JSON-compatible passthrough, bigint
  throws, symbol/function drops, nested extras).
- `test/safeUnsafeJsonWrappers.test.ts` covers all four wrappers
  end-to-end via the full Vite-plugin pipeline (happy-path types,
  EXTRA_PARAMS divergences, the `onUnknownKeys` option semantics).

## Migrated JIT function families

| Family                     | Mion source                                                          | Go emitter                                              | JS factory                                 | Cache tag |
|----------------------------|----------------------------------------------------------------------|---------------------------------------------------------|--------------------------------------------|-----------|
| `isType`                   | `nodes/**/emitIsType` + `lib/jitFnCompiler.ts`                       | `internal/caches/jitfn/istype.go`                       | `createIsType` / `deserializeIsType`       | `it`      |
| `getTypeErrors`            | `nodes/**/emitTypeErrors` + `JitErrorsFnCompiler`                    | `internal/caches/jitfn/typeerrors.go`                   | `createGetTypeErrors` / `deserializeGetTypeErrors` | `te` |
| `prepareForJson`           | `nodes/**/emitPrepareForJson`                                        | `internal/caches/jitfn/preparefjson.go`                 | `createPrepareForJson` / `deserializePrepareForJson` | `pj` |
| `restoreFromJson`          | `nodes/**/emitRestoreFromJson`                                       | `internal/caches/jitfn/restorefjson.go`                 | `createRestoreFromJson` / `deserializeRestoreFromJson` | `rj` |
| `stringifyJson`            | `jitCompilers/json/stringifyJson.ts` (`createStringifyCompiler`)     | `internal/caches/jitfn/stringifyjson.go`                | `createStringifyJson` / `deserializeStringifyJson` | `sj` |
| `hasUnknownKeys`           | `nodes/**/emitHasUnknownKeys` + `callCheckUnknownProperties`         | `internal/caches/jitfn/hasunknownkeys.go`               | `createHasUnknownKeys` / `deserializeHasUnknownKeys` | `huk` |
| `stripUnknownKeys`         | `nodes/**/emitStripUnknownKeys`                                      | `internal/caches/jitfn/stripunknownkeys.go`             | `createStripUnknownKeys` / `deserializeStripUnknownKeys` | `suk` |
| `unknownKeyErrors`         | `nodes/**/emitUnknownKeyErrors`                                      | `internal/caches/jitfn/unknownkeyerrors.go`             | `createUnknownKeyErrors` / `deserializeUnknownKeyErrors` | `uke` |
| `unknownKeysToUndefined`   | `nodes/**/emitUnknownKeysToUndefined`                                | `internal/caches/jitfn/unknownkeystoundefined.go`       | `createUnknownKeysToUndefined` / `deserializeUnknownKeysToUndefined` | `uku` |

Pure-fn helpers added to `packages/ts-go-run-types/src/run-types-pure-fns.ts`:

- `cpf_getUnknownKeysFromArray(value, knownKeys)` — returns the array
  of keys present on `value` but not in `knownKeys`
- `cpf_hasUnknownKeysFromArray(value, knownKeys)` — boolean predicate
  variant of the above

Per-kind coverage (where ✓ = inline emit, → child = recurses into
the kind's children via `comp.compile<Fn>`, ✗ = no-op / not
applicable):

| Kind                    | isType | typeErrors | prepareForJson | restoreFromJson | hasUnknownKeys | stripUnknownKeys | unknownKeyErrors | unknownKeysToUndefined |
|-------------------------|--------|------------|----------------|------------------|----------------|------------------|------------------|------------------------|
| string / number / bool  | ✓      | ✓          | ✗ noop         | ✗ noop           | ✗ false        | ✗ noop           | ✗ []             | ✗ noop                 |
| bigint                  | ✓      | ✓          | ✓ `toString`   | ✓ `BigInt(v)`    | ✗              | ✗                | ✗                | ✗                      |
| symbol                  | ✓      | ✓          | ✓ tagged str   | ✓ reconstruct    | ✗              | ✗                | ✗                | ✗                      |
| regexp                  | ✓      | ✓          | ✓ `toString`   | ✓ `new RegExp`   | ✗              | ✗                | ✗                | ✗                      |
| date                    | ✓      | ✓          | ✗ via `toJSON` | ✓ `new Date(v)`  | ✗              | ✗                | ✗                | ✗                      |
| literal / enum          | ✓      | ✓          | ✗              | ✗                | ✗              | ✗                | ✗                | ✗                      |
| null / undefined / void | ✓      | ✓          | ✗              | ✗                | ✗              | ✗                | ✗                | ✗                      |
| never                   | ✓ false| ✓          | ✓ throw        | ✓ throw          | ✗              | ✗                | ✗                | ✗                      |
| any / unknown / object  | ✓ true | ✓ []       | ✗ identity     | ✗ identity       | ✗              | ✗                | ✗                | ✗                      |
| objectLiteral / class   | ✓      | ✓          | ✓ → children   | ✓ → children     | ✓ at-level + → children | ✓ at-level + → children | ✓ at-level + → children | ✓ at-level + → children |
| property / propSig      | ✓      | ✓          | ✓ → member     | ✓ → member       | ✓ → member     | ✓ → member       | ✓ → member       | ✓ → member             |
| indexSignature          | ✓      | ✓          | ✓ → value      | ✓ → value        | ✓ (per pattern)| ✓ (per pattern)  | ✓ (per pattern)  | ✓ (per pattern)        |
| array                   | ✓      | ✓          | ✓ → element    | ✓ → element      | ✓ → element    | ✓ → element      | ✓ → element      | ✓ → element            |
| tuple / tupleMember     | ✓      | ✓          | ✓ → slots      | ✓ → slots        | ✓ → slots      | ✓ → slots        | ✓ → slots        | ✓ → slots              |
| union                   | ✓      | ✓          | ✓ `[idx, val]` | ✓ `[idx, val]`   | ✓ per arm      | ✓ per arm        | ✓ per arm        | ✓ per arm              |
| intersection            | ✓      | ✓          | ✗ noop         | ✗ noop           | ✗              | ✗                | ✗                | ✗                      |
| templateLiteral         | ✓      | ✓          | ✗              | ✗                | ✗              | ✗                | ✗                | ✗                      |
| function / method       | ✓ `typeof` | ✓     | ✗ noop         | ✗ noop           | ✗              | ✗                | ✗                | ✗                      |
| Map / Set (SubKind)     | ✓      | ✓          | ✓ → element    | ✓ → element      | ✓ → element    | ✓ → element      | ✓ → element      | ✓ → element            |
| Promise                 | ✓ thenable | ✓      | ✓ throw        | ✓ throw          | ✗              | ✗                | ✗                | ✗                      |
| NonSerializable (Int8Array, …) | ✓ throw | ✓ throw | ✓ throw   | ✓ throw          | ✗              | ✗                | ✗                | ✗                      |

`stringifyJson` per-kind coverage (mirrors mion's
`createStringifyCompiler` switch). All entries produce a JS
expression / return-block whose runtime value is a JSON-string
fragment (the parent emit concatenates fragments with `+`).

| Kind                       | stringifyJson emit                                       |
|----------------------------|----------------------------------------------------------|
| any / unknown / object     | `JSON.stringify(v)`                                      |
| string / templateLiteral   | `JSON.stringify(v)`                                      |
| number / null              | `String(v)` at root; bare `v` nested                     |
| boolean                    | `(v ? 'true' : 'false')`                                 |
| bigint                     | `'"' + v.toString() + '"'` (manual quoting)              |
| regexp                     | `JSON.stringify(v.toString())`                           |
| symbol                     | `JSON.stringify('Symbol:' + (v.description || ''))`      |
| undefined                  | `undefined` at root; `'null'` in array; `null` else      |
| void                       | `undefined`                                              |
| enum                       | `JSON.stringify(v)` (defensive — both string + number)    |
| literal                    | defers to underlying primitive kind                       |
| never / Promise / NonSerializable / function-at-root | throw at JIT-compile (surfaced via `JitThrow` runtime factory) |
| array                      | for-loop into `ls.push(child)`; `'[' + ls.join(',') + ']'` |
| objectLiteral / class      | `'{' + props.join('+') + '}'` (declaration order)         |
| property / propertySignature | `'"name":' + childCode + sep`; optional → empty when undefined |
| indexSignature             | for-in loop; `JSON.stringify(k) + ':' + childCode` per entry; symbol-keyed sigs skipped |
| tuple / tupleMember        | `'[' + slots.join('+') + ']'`; optional slots → `'null'` |
| union                      | if/else dispatch via `looseCheckGate`; `'[idx,' + value + ']'` per arm |
| Map / Set                  | for-of into `ls.push(entry-fragment)`; Map → `'[' + k + ',' + v + ']'`, Set → bare element |
| Date (SubKindDate)         | `'"' + v.toJSON() + '"'` (manual quoting)                |

## Intentional deviations from mion

These are decisions where our emit deliberately differs from mion's
source. Each one is documented in the corresponding Go file's
comments; this is the consolidated list.

### 1. `isNoop` factory always emitted (mion drops factory when noop)

**Where**: `internal/caches/jitfn/preparefjson.go` `Finalize` (and the
mirror in `restorefjson.go`).

**Mion**: when a body collapses to `return v` with no transformation,
mion's `createJitCompiledFunction` sets `isNoop: true` and elides the
inner factory.

**Us**: we set `isNoop: false` and emit the identity factory anyway —
**~30 bytes per noop entry, ~few KB total** in real apps. Reason: our
parent emit calls `<childHash>.fn(v[i])` unconditionally; if the
factory is missing, the call hits `undefined.fn` and crashes. To keep
parent dep-call chains correct, we always emit a real fn even when
it's the identity. Cost is the binary-overhead trade-off — verified
correct in the noop test adapter (`serializationNoop.test.ts`).

Documented divergence; not a bug.

### 2. Known-keys array sorted (mion preserves insertion order)

**Where**: `internal/caches/jitfn/unknownkeys_shared.go`.

**Mion**: builds the known-keys literal as `Array.from(new Set(...))`
which preserves the order properties appear in the source TS type.

**Us**: `sort.Strings(keys)` for byte-stable cache output. JS-side
semantics are identical (set membership check), only the literal
ordering in the emitted code differs.

Reason: Go's `map[string]struct{}` iteration is intentionally
randomized; without an explicit sort, every binary invocation would
produce a different cache module hash, breaking the deterministic-
output invariant the Vite plugin relies on for cache validity.

Documented divergence; not a bug.

### 3. `hasUnknownKeys` Finalize defaults to `false` for empty bodies

**Where**: `internal/caches/jitfn/hasunknownkeys.go` `Finalize`.

**Mion**: same — atomic kinds produce `return false`.

**Us**: same. The other three families in the family (`stripUnknownKeys`,
`unknownKeysToUndefined`, `unknownKeyErrors`) finalize to their own
identities (`return v` / `return v` / `return er` respectively).

Not a divergence — listed here as a parity confirmation since the
four-fn family has subtle finalize behavior worth pinning.

### 4. JSON-family throw-at-JIT-compile for non-serializable kinds

**Where**: `internal/caches/jitfn/preparefjson.go` Supports + Emit
for `KindNever` / `KindPromise` / function-flavoured kinds /
`SubKindNonSerializable`.

**Mion**: throws synchronously from the emit method
(`throw new Error('Jit compilation disabled for Non Serializable
types.');`) — the factory creation itself fails.

**Us**: emits a runtime-throwing factory (`JitThrow(...)`) — the
factory creation succeeds, but **calling** the resulting fn throws.
Same observable contract from a userland test (the
`throwsAtCompile: true` adapter helper invokes `c.prepareForJson()`
and asserts it throws), but the throw moves from emit-time to
first-call-time.

Reason: our AOT pipeline doesn't have a way to surface emit-time
throws through the cache module — the binary writes all cache
entries to a JS file, then the JS runtime imports them. A
throw-at-emit would have to be encoded as a TypeScript runtime
construct anyway. The runtime-throw shape lets the JS factory be a
plain `() => { throw … }`, which is what we emit.

Documented divergence; not a bug.

### 5. ~~Union encoding strictly `[memberIndex, value]`, no shortcut~~ — RESOLVED

**Closed by**: per-member `skipEncode + needsTupleEncoding` port.
The shared `unionMemberNeedsTuple(member, ctx)` helper in
`internal/caches/jitfn/preparefjson.go` is now the single source of
truth used by all three union emitters (`emitUnionPrepareForJson`,
`emitUnionStringifyJson`, `emitUnionRestoreFromJson`). A member skips
the `[memberIndex, value]` envelope iff BOTH its `prepareForJson`
AND `restoreFromJson` compile to a noop — matches mion's
`needsTupleEncoding = !!encJit?.code || !!decJit?.code`
(`jitCompilers/json/stringifyJson.ts:295-306`).

Implementation notes:
- The encoders peek into the *opposite* emitter via the existing
  `peekMemberIsNoop` helper, now refactored to memoise results on
  `Walker.peekedNoops` keyed by `<emitterTag>:<memberID>`. The cache
  is per-Compile-pass (one Walker = one entry) so the three emit
  families share the same per-member answer without re-compiling
  each member's subtree three times.
- `peekMemberIsNoop` distinguishes "truly unsupported" (no emit at
  all → counts as noop) from "JitThrow with ErrorMessage" (the member
  emits a runtime throw → counts as NON-noop). Without this split,
  a union containing a function / never / Promise member would skip
  the wrap on the rj side and the throw would never propagate to the
  parent walker, silently swallowing the compile-time throw contract.
- The restore side bails to empty (full noop union) when no member
  needs the wrap — the shape gate / dispatch would be dead code.
- Wire-shape contract verified by spot-check: `string | number`
  emits no `[<idx>,` markers on pj or sj; `string | bigint` wraps
  only the bigint arm on both encoders, and the rj dispatch only
  contains a clause for the wrapped index. Round-trip tests
  (`serializationRoundTrip.test.ts`,
  `serializationStringifyJsonRoundTrip.test.ts`,
  `serializationNoop.test.ts`) all green.

Documented divergence cleared; behaviour now matches mion.

### 6. `JIT_SUITE` → `VALIDATION_SUITE` rename

**Where**: `packages/ts-go-run-types/test/suites/validation-suite.ts`.

The shared suite was originally named `jit-suite` when it carried
thunks for every JIT family. Once the JSON pair was moved to its
own `serialization-suite.ts` (because JSON samples need
`deserializedValues` and the JSON-throws-on-extras contract clashes
with isType's "extras are valid" semantic), the remaining file only
covers `isType` and `getTypeErrors` — so it's been renamed to
`validation-suite.ts` to match its actual scope.

Pure refactor; no behavioral change.

## Open failures — analysis

**Status snapshot**: 1 open (Failure 1, deferred), 8 closed
(Failures 2–9). Each closed entry leads with a `**Closed by**` line
pointing at the fix; the original analysis is kept verbatim below
for archeology / future regression triage. Each entry:

- **Where** — our test file + section
- **What our test asserts** — input + expected output
- **What mion asserts** — the corresponding mion spec file + assertion
- **Why mion behaves that way** — the mion emit path that produces
  the expected output
- **Classification** — `BUG` (real implementation gap on our side),
  `SAMPLE-MISPORT` (our test data contradicts mion's actual semantic),
  or `RACE` (parallelism interaction, not a correctness issue)

### Failure 1 — `OBJECTS > strip extra params (mion semantic — extras pass through)`

**Closed by**: test-suite restructure to document both serialise
paths explicitly. The case was renamed to
`OBJECTS.extras_passthrough_unsafe` and its incorrect
`deserializedValues: [noExtraParams]` override was dropped — the
unsafe path now correctly compares against the input (extras
preserved through `prepareForJson + JSON.stringify`). The strip
expectation moves to `getTestDataForStringify` for consumption by
the forthcoming safe adapter. A new top-level `EXTRA_PARAMS`
section documents every extras-divergence in executable form:
JSON-compatible passthrough, bigint-extra-throws, symbol/function
silent-drops, nested extras. See the "JSON serialisation
semantics" section above for the contract.

The misleadingly-named `UNIONS.union_extra_symbol_prop_throws` was
also renamed to `UNIONS.union_extra_symbol_prop_drops` in the same
pass (`JSON.stringify` silently drops symbol-valued props per
ECMAScript spec — no throw was ever exercised).

- **Where**: `test/adapters/serializationRoundTrip.test.ts` →
  `serialization-suite.ts` `OBJECTS.strip_extra_params`
- **What our test asserts**: input `objectWithExtraParams` (includes
  extras `extraA`, `extraB`, `extraC`, and nested-object extras
  `deep.cExtra`, `?other weird p.eExtra`); expected
  `noExtraParams` (extras stripped).
- **What mion asserts**:
  `mion/packages/run-types/src/jitCompilers/json/jsonSpec/03JsonObjects.spec.ts:138-149`.
  Mion expects `deserialized === originalValues[i]` where
  `originalValues = getTestData(true).values = [objectWithExtraParams]`
  (extras intact). The line `// expect(deserializedValues[i]).toEqual(deserialized); // native JSON.stringify do not strip extra params`
  is commented out in mion's spec with the explicit comment.
- **Why mion behaves that way**:
  `mion/packages/run-types/src/nodes/collection/interface.ts:129-137`
  `emitPrepareForJson` only iterates declared children; extras are
  never visited but also never deleted. JSON.stringify preserves
  them (modulo type — bigint extras would throw, but these are all
  JSON-serializable).
- **Classification**: **SAMPLE-MISPORT**. Our case has
  `deserializedValues: [noExtraParams]` claiming strip; mion's spec
  comments that out. Fix: remove `deserializedValues` from our case
  so the adapter falls back to the input. Implementation matches
  mion already.

### Failure 2 — `RECORDS > multiple index properties (symbol keys skipped)`

**Closed by**: symbol-keyed-index-sig skip in all 8 `emitIndexSignature*`
emitters (mirrors mion's `IndexSignatureRunType.skipJit`
`indexProperty.ts:30-36`). New shared helper `isSymbolKeyedIndexSig`
in `internal/caches/jitfn/istype.go`; gate added to prepareForJson,
restoreFromJson, isType, typeErrors, hasUnknownKeys, stripUnknownKeys,
unknownKeyErrors, unknownKeysToUndefined.

- **Where**: `serialization-suite.ts` `RECORDS.multiple_index_props`
- **What our test asserts**: input `{key1: 'value1', key2: 'value2'}`
  (typed as `{[k: string]: string; [k: number]: string; [k: symbol]: Date}`);
  expected `{key1: 'value1', key2: 'value2'}` (string keys
  preserved, symbol entries dropped because JSON.stringify drops
  symbol-keyed props).
- **What our test gets**: `{key1: Invalid Date, key2: Invalid Date}`.
  String values are being passed to `new Date(...)` during
  `restoreFromJson`, producing Invalid Date.
- **What mion asserts**:
  `mion/packages/run-types/src/jitCompilers/json/jsonSpec/04JsonRecords.spec.ts:49-58`
  asserts `deserializedValues[i] === deserialized`.
- **Why mion behaves that way**: mion's `IndexSignatureRunType` emits
  one branch PER index signature, gated on a key-pattern regex. The
  string-key sig matches `key1`/`key2` and applies the string
  transform (noop). The symbol-key sig matches none of the
  surviving keys post-JSON.stringify (symbols don't serialize).
- **Why we fail**: our index-sig emit appears to collapse multiple
  signatures into a single arm and pick the LAST one (the Date arm),
  applying `new Date(v)` to every value. The key-pattern dispatch
  is missing.
- **Classification**: **BUG** in our index-signature emit for the
  multi-signature case. Single-signature index sigs work correctly
  (see passing `index_property_nested`, `index_property_bigint`).
  Follow-up: port mion's per-pattern dispatch from
  `nodes/member/indexProperty.ts:103-155` into our
  `emitIndexSignaturePrepareForJson` /
  `emitIndexSignatureRestoreFromJson`.

### Failure 3 — `UNIONS > union of object shapes`

**Closed by**: union loose-check port. New `looseCheckGate` helper in
`internal/caches/jitfn/preparefjson.go` mirrors mion's
`UnionRunType.getChildIsTypeWithLooseCheck` (`union.ts:56-78`) — for
an all-optional object member (no required props, no index sig) the
bare isType is wrapped with a property-presence gate so a value that
shares no declared property with the member fails the arm. Wired
into `unionMemberIsTypeCheck` (preparefjson) and `emitUnionIsType`
(istype) for full mion parity. Arm dispatch in preparefjson now picks
the correct concrete member before falling back to the weak shape.

- **Where**: `serialization-suite.ts` `UNIONS.union_object_with_discriminator`
- **What our test asserts**: type
  `{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}`
  with input `{c: 1n}`. Expected: round-trip preserves `{c: 1n}`.
- **What our test gets**: `TypeError: Do not know how to serialize a BigInt` at JSON.stringify.
- **What mion asserts**:
  `mion/packages/run-types/src/jitCompilers/json/jsonSpec/09JsonUnions.spec.ts:79-88`
  asserts round-trip equality.
- **Why mion behaves that way**:
  `mion/packages/run-types/src/nodes/collection/union.ts:114-152`
  `emitPrepareForJson` builds an if/else dispatch over the union
  members using `getChildIsTypeWithLooseCheck` per arm. The arms
  are tried in declaration order: `{a: string; aa: boolean}` first,
  then `{b: number}`, then `{c: bigint}` (matches `{c: 1n}` → bigint
  transform applied → JSON.stringify-safe), `{d?: string}` last.
- **Why we fail**: our union dispatch picks `{d?: string}` BEFORE
  `{c: bigint}` for input `{c: 1n}`. The all-optional arm matches
  anything (no required props), so our isType-style loose check
  considers `{c: 1n}` a valid `{d?: string}` (d absent is OK, c is
  treated as an unknown extra), and dispatches to that arm — whose
  prepareForJson is a noop. The bigint never gets transformed.
- **Classification**: **BUG** in our union arm priority / loose-check.
  Two possible fixes: (a) re-order arms so more-specific shapes
  (more required props) are checked before all-optional ones; (b)
  make the loose check stricter so an arm only matches when at
  least one of its declared props is present in the value. Mion's
  `getChildIsTypeWithLooseCheck` likely does (b) — its
  implementation lives at `nodes/collection/union.ts`.

### Failure 4 — `ITERABLES > Set<SmallObject>`

**Closed by** (with Failures 5–7): Map/Set per-entry element recursion
in `emitNativeIterablePrepareForJson`
(`internal/caches/jitfn/preparefjson.go`) and the new
`emitNativeIterableRestoreFromJson`
(`internal/caches/jitfn/restorefjson.go`). Mirrors mion's
`IterableRunType.emitPrepareForJson` / `emitRestoreFromJson`
(`nodes/native/Iterable.ts:49-82`): for non-noop element / key /
value types, emit `const ml0 = []; for (let e0 of v) { … push }; v = ml0`
on the prepare side and `for (let e0 = 0; e0 < v.length; e0++) { … }; v = new Map(v)`
on restore. Atomic-noop fast-path falls back to the original
`v = Array.from(v)` / `v = new Map(v)` shape. Reuses existing
`mapKeyValueTypes` / `setItemType` helpers in `istype.go`.

- **Where**: `serialization-suite.ts` `ITERABLES.set_small_object`
- **What our test asserts**: `Set<SmallObject>` with three elements
  including one carrying `prop5: BigInt(100)`. Expected: round-trip
  preserves the Set with bigint intact (via prepareForJson →
  toString → JSON.stringify → JSON.parse → restoreFromJson →
  BigInt).
- **What our test gets**: `TypeError: Do not know how to serialize a BigInt` at JSON.stringify.
- **What mion asserts**:
  `mion/packages/run-types/src/jitCompilers/json/jsonSpec/11JsonIterables.spec.ts:26-35`
  asserts `deserialized === originalValues[i]`.
- **Why mion behaves that way**:
  `mion/packages/run-types/src/nodes/native/Iterable.ts:49-65`
  `emitPrepareForJson` emits:
  ```js
  const ml_n = [];
  for (let v of v) { <element-transform-code>; ml_n.push(v); }
  v = ml_n;
  ```
  The `<element-transform-code>` is the result of recursively
  compiling `prepareForJson` for the element type (here:
  `SmallObject`, which contains a bigint field).
- **Why we fail**:
  `internal/caches/jitfn/preparefjson.go:691` `emitNativeIterablePrepareForJson`
  returns `v = Array.from(v)` — pure shape conversion, no per-
  element transform. The source comment at lines 686-690 explicitly
  notes "Element types whose own prepare/restore is non-noop will
  need per-entry iteration (mion's full emit covers that)".
- **Classification**: **BUG** — known unimplemented in our phase 6.
  Follow-up: port mion's per-entry iteration form, calling the
  element runtype's dependency chain inside the loop.

### Failure 5 — `ITERABLES > Map<string, SmallObject>`

**Closed by**: see Failure 4. Same root cause (Map element values are
objects containing a bigint); same fix.

### Failure 6 — `ITERABLES > Map<SmallObject, number>`

**Closed by**: see Failure 4. Same root cause (Map keys are objects
containing a bigint); same fix. The implementation iterates over both
`rt.Arguments` slots (key wrapper + value wrapper) so each half gets
its own transform via `e0[0]` / `e0[1]` accessors — matches the
`[key, value]` tuple shape mion uses for Map entries.

### Failure 7 — `ITERABLES > Map with bigint keys`

**Closed by**: see Failure 4. Same fix — the bigint key gets the
`toString()` rewrite through the per-entry transform applied to
`e0[0]`.

- **Where**: `serialization-suite.ts` `ITERABLES.map_with_bigint_keys`
- **What our test asserts**: `Map<bigint, number>` round-trip
  preserves bigint keys.
- **What mion asserts**:
  `mion/packages/run-types/src/jitCompilers/json/jsonSpec/11JsonIterables.spec.ts`
  asserts round-trip equality (assumes per-element transform recurses
  into key + value).
- **Why we fail**: same as #4 — `Array.from(v)` preserves the bigint
  keys verbatim; JSON.stringify on the resulting `[[1n, 1], [2n, 2], …]`
  throws on the bigint. With mion's per-entry transform, the bigint
  keys would go through the `toString()` rewrite first.
- **Classification**: **BUG**, same fix as #4.

### Failure 8 — `CIRCULAR_REFS > CircularTuple object with discriminator`

**Closed by** (with Failure 9): structural-id cycle-ref disambiguation
in `internal/caches/runtype/typeid/typeid.go`. The original analysis
mis-classified this as a `BUG` with unclear mechanism; the actual
root cause was a structural-dedup collision between two
`interface CircularTuple` declarations in different test files
(`validation-suite.ts` uses `tuple: [bigint, CircularTuple?]`,
`serialization-suite.ts` uses `list: [bigint, CircularTuple?]`).
Both inner tuple shapes were `[bigint, $cycle(KindObjectLiteral)?]`
— identical structural IDs after dedup, so the single shared tuple
entry's optional slot pointed at *whichever* outer entry was
registered last (sometimes `tuple`, sometimes `list`). The
intermittent failures (sometimes `expected false to be true`,
sometimes `Do not know how to serialize a BigInt`) flipped based on
emit order.

mion never hits this because its runtime JIT compiles per-call — the
two declarations live in independent compile passes. Our AOT cache
is project-global so the dedup applies across files. Fix: extend
`cycleRef` to fall back to the symbol's first-declaration position
when the type has no alias name; two interfaces with the same name
and shape but different declaration positions now produce distinct
cycle tokens, so the surrounding tuple IDs differ and the cache
holds one entry per outer interface. `aliasName`-bearing types are
unaffected (named type aliases continue to disambiguate as before).

- **Where**: `serialization-suite.ts` `CIRCULAR_REFS.circular_tuple`
- **What our test asserts**: `interface CircularTuple { list: [bigint, CircularTuple?] }`
  with deeply-nested input round-trips intact.
- **What our test gets**: this failure is **flaky** under default
  vitest `pool: threads` — sometimes a `TypeError: Do not know how
  to serialize a BigInt`, sometimes succeeds. Deterministic under
  `pool: forks` / `--no-file-parallelism` (passes consistently).
- **What mion asserts**:
  `mion/packages/run-types/src/jitCompilers/json/jsonSpec/10JsonCircular.spec.ts:37-46`
  asserts round-trip equality.
- **Why mion behaves that way**: mion's `TupleRunType.emitPrepareForJson`
  with a recursive child emits a self-recursive dep call. The bigint
  slot gets its `toString()` transform; the recursive `CircularTuple?`
  slot calls back into the same factory.
- **Why we fail**: likely a related instance of the union/iterable
  bug — when the circular ref closes via a tuple member with an
  optional self-ref, the recursive dep call shape isn't
  consistently set up. Investigation is open. The race-condition
  flavor of this failure (`object_with_tuple_prop` on
  isType/getTypeErrors under `pool: threads`) is a separate
  parallelism issue, see Failure 9.
- **Classification**: **BUG** — exact mechanism not yet pinpointed.
  Possibly related to dep-call envelope for self-recursive tuple
  members.

### Failure 9 (flake) — `isType / getTypeErrors > CIRCULAR > Self-referential object whose cycle closes via a tuple property`

**Closed by**: see Failure 8 — same root cause. The original
"test-infrastructure RACE" classification was wrong: `pool: 'forks'`
did NOT fix the failures (verified during port-completion).
Switching workers only changed *which* of the two CircularTuple
declarations registered last, so the flake symptom shifted between
serialization, isType, and typeErrors test files but never went
away. The cycle-ref position fix in Failure 8 closes this
deterministically — `pool` config is not needed.

- **Where**: `test/adapters/isType.test.ts` and `getTypeErrors.test.ts`
  → `validation-suite.ts` `CIRCULAR.object_with_tuple_prop`
- **What our test asserts**: `interface CircularTuple { tuple: [bigint, CircularTuple?] }`
  validates correctly. Returns `true` for valid samples, accumulates
  expected errors for invalid samples.
- **What our test gets**: passes when run in isolation, when running
  the full `pnpm --filter @mionjs/ts-go-run-types test`, intermittently
  produces `expected false to be true` for the recursive validator
  on a valid sample. Deterministic under `--pool=forks` or
  `--no-file-parallelism`.
- **Why mion behaves that way**: not applicable — this is our
  test-infrastructure issue, not a mion-emit comparison.
- **Why we fail**: the runtype cache / vite-plugin transform interacts
  with vitest's `threads` worker pool in a way that occasionally
  emits a different runtype-graph for this specific shape. The
  smoking gun is that the same test passes when run in isolation,
  passes deterministically under `pool: forks`, and was hidden
  pre-cleanup because more total tests masked the timing window.
- **Classification**: **RACE** in the test infrastructure, not a
  correctness bug in the emit. Out of scope for the mion-port
  surface. Could be worked around by setting `pool: 'forks'` in
  `packages/ts-go-run-types/vitest.config.ts` at the cost of slower
  test runs.

## Recommended follow-up order

Items 1–4 below were completed in the port-finalization pass; item
5 (the strip_extra_params sample) is the one remaining open
failure, deferred for a separate decision on the extras semantic.

1. ~~**Map/Set per-entry element transform**~~ — DONE; closes
   Failures 4, 5, 6, 7.
2. ~~**Symbol-keyed index signature skip**~~ — DONE; closes
   Failure 2. Mion's actual gate is per-fn `skipJit` for
   symbol-keyed sigs (`indexProperty.ts:30-36`), not per-pattern
   dispatch as originally proposed — the for-in loop doesn't
   enumerate symbol keys at runtime anyway, but the previous
   non-skipping emit corrupted unrelated string/number keys when
   the symbol sig's value type was non-noop (e.g. Date).
3. ~~**Union loose-check**~~ — DONE; closes Failure 3. Implemented
   as `looseCheckGate` helper wired into both `unionMemberIsTypeCheck`
   (preparefjson dispatch) and `emitUnionIsType` (full mion parity).
4. ~~**CircularTuple cycle-ref disambiguation**~~ — DONE; closes
   Failures 8 + 9. The flake-classification of Failure 9 was wrong:
   `pool: 'forks'` did not fix it (verified). Real root cause was a
   structural-id collision via cycle ref — fixed in
   `typeid/typeid.go` cycleRef by appending the symbol's first
   declaration position when no alias name is in play.
5. ~~**Sample fix for strip_extra_params**~~ — DONE; closes
   Failure 1. The case was renamed to
   `OBJECTS.extras_passthrough_unsafe` (drops the misleading
   `deserializedValues` override) and a new top-level `EXTRA_PARAMS`
   section was added to document the unsafe-vs-safe path divergence
   in executable form. See the "JSON serialisation semantics"
   section near the top of this doc for the contract.

## Queued mion optimisations (not yet ported)

These are mion optimisations whose absence on our side is observable
in mion's own spec files (typically as code-introspection assertions
that our generated source wouldn't pass), but where round-trip
parsed-equality still holds with our current emit. Listed here so
they're easy to find when revisiting wire-shape / payload-size
work.

### ~~Union per-member skip-encode (`skipEncode + needsTupleEncoding`)~~ — DONE

Ported. See deviation #5 above for the consolidated changelog and
implementation notes. Summary:

- Shared `unionMemberNeedsTuple(member, ctx)` helper in
  `internal/caches/jitfn/preparefjson.go` is the single source of
  truth, consumed by all three union emitters.
- `peekMemberIsNoop` was refactored to take `*EmitContext` and
  memoise on `Walker.peekedNoops` (`internal/caches/jitfn/walker.go`)
  so the three emit families share answers per-Compile-pass instead
  of re-walking each member subtree.
- `peekMemberIsNoop` now distinguishes JitThrow-emitting members
  (NON-noop — the throw must propagate) from truly-unsupported
  kinds (noop — identity passes). Without this split, a union
  containing a function / never / Promise member would silently
  swallow the compile-time-throw contract on the rj side.
- Restore side returns empty when no member needs the wrap (whole
  union → identity) instead of emitting a dead shape gate.
- Mion's `stringifySpec/09StringifyUnions.spec.ts:51-77`
  `stringifyCode.not.toContain('[<idx>,')` assertions would now
  pass under our emit — adding them as permanent tests is a
  follow-up (needs a fixture-style capture of the rendered module
  body).

## Reference

- Mion source tree: `/home/user/mion/packages/run-types/src/`
- Our Go emit source tree: `/home/user/ts-run-types/internal/caches/jitfn/`
- Our JS adapter source tree: `/home/user/ts-run-types/packages/ts-go-run-types/src/`
- Test suites: `/home/user/ts-run-types/packages/ts-go-run-types/test/suites/{validation,serialization}-suite.ts`
- Test adapters: `/home/user/ts-run-types/packages/ts-go-run-types/test/adapters/*.test.ts`
