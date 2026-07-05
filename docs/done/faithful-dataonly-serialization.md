# Make JSON serialization faithful to DataOnly

**Status:** idea, not started. Scoping + design note. Two faithfulness gaps,
both verified against the source (one also rendered empirically):

- **Case A — undefined/void roots:** the encoder returns the JS value
  `undefined` instead of a JSON document, so the round-trip fails. The fix is a
  root wrapper. This is the primary subject below. The runtime-only shape the
  idea was first sketched in does not stand alone (see Feasibility); the
  recommended path moves the decision to build time and keeps a thin runtime
  wrapper in `ts-runtypes`.
- **Case B — non-serializable union sibling:** a `symbol` / function / `Promise`
  member makes the WHOLE union throw, even though `DataOnly` drops that member
  (`DataOnly<Date | symbol>` = `Date`). The fix is to drop stripped union
  members. Detailed under "Second gap" below.

## The idea

`createJsonEncoder<T>()` / `createJsonDecoder<T>()` should produce a working,
round-tripping function for **every** type that is valid `DataOnly<T>` (i.e.
`DataOnly<T>` is not `never`). Today a small set of DataOnly-valid types fail:
the undefined-only roots do not serialize (no top-level JSON form), and a union
with a stripped sibling throws instead of dropping that sibling. We want to be
faithful to `DataOnly`: if the projection keeps the type, the serializer must
round-trip it (wrapping the value in a JSON envelope when the bare value is not a
standalone JSON document, and dropping union members that `DataOnly` drops).

The constraint (Case A): do **not** add an `isRoot` axis to the type id or
fnHash. Root-ness is a property of the *call* (`createJsonEncoder<T>()` is always
the root frame), not of the type. The same `T` used at a property position must
keep its existing cache entry and hash.

## Case A — what breaks at the root (the precise set)

The only gap between "valid `DataOnly`" and "round-trips through the default JSON
encoder/decoder at root" is **the undefined-only roots** (Case B, the union
sibling, is a propagating-position gap, not a root gap; see "Second gap" below):

- `undefined` — `DataOnly<undefined>` = `undefined` (kept, `dataOnly.ts:153`).
- `void` — `DataOnly<void>` = `void` (kept; falls through to the final `: T`
  arm in `dataOnly.ts:189`).
- the literal `undefined` type (`RT.literal(undefined)`), and any type whose
  only inhabitant is `undefined` / `void`.

Why they break:

- Default encoder strategy `clone` is `JSON.stringify(prepareForJsonSafe(v))`.
  `prepareForJsonSafe(undefined)` emits the bare expression `undefined`
  (`json_prepare_safe.go:110-115`), and `JSON.stringify(undefined)` returns the
  JS value `undefined`, not a string. The `direct` strategy (`stringifyJson`)
  also emits bare `undefined` at root (`json_stringify.go:180-193`).
- So `createJsonEncoder<undefined>()(undefined)` returns the value `undefined`,
  not a JSON document. Chaining `decode(encode(undefined))` then calls
  `JSON.parse(undefined)` → `JSON.parse("undefined")` → **throws SyntaxError**.
- The serialization suite hides this: the round-trip adapter bails with
  `if (serialized === undefined) return;` (`serializationAsserts.ts:114`), so the
  decode side of these cases is never actually asserted. The case descriptions
  in `suites/serialization/Atomic.ts` (`undefined`, `void`) claim a round-trip
  that the harness silently skips.

### What does NOT break (correcting the initial framing)

These are sometimes assumed broken but already round-trip at root, so they are
**out of scope**:

- `null`, `number`, `string`, `boolean`, enums, template literals, primitive
  literals — natively JSON-representable at root.
- `bigint` — every strategy transforms it to a quoted decimal string
  (`prepareForJson`/`prepareForJsonSafe` emit `v.toString()`; `stringifyJson`
  emits `'"'+v.toString()+'"'`), and the decoder rebuilds via `BigInt(...)`
  (`json_restore.go`). `bigint` at root round-trips correctly.
- `Date` / `RegExp` / Temporal — serialize to a quoted string, decoder rebuilds.
- `Map` / `Set` — serialize to a JSON array of entries.
- arrays / tuples / objects — JSON-representable at root.
- root **unions** that contain a non-JSON-compatible member (e.g.
  `string | undefined`, `number | bigint`) — because not every member is
  JSON-compatible (`json_compat.go`), the union uses the wrapped tuple wire
  shape `[memberIndex, value]`, which is itself a valid JSON document. These
  already round-trip. (This is, in effect, the same wrapping trick this todo
  generalizes to the bare-atomic root.)

### The build-time alwaysThrow set is already faithful

The root kinds the pipeline renders as an `alwaysThrow` factory (with an
Error-severity diagnostic) are `never`, `symbol`, function / method /
call-signature, `Promise`, and `SubKindNonSerializable` typed arrays
(`diag_codes.go` `rootCodeMap`; `json_compat.go:97-108`). That set is **exactly**
the `DataOnlyStripped` set (`dataOnly.ts:77-92`), each of which projects to
`never`. So none of them are DataOnly-valid; the alwaysThrow behavior is correct
and needs no change.

### Second gap (verified): a non-serializable union SIBLING poisons the whole union

To be clear up front: **`Date` serializes fine**, on its own and as a union
member. The bug is that a *non-serializable sibling* (a `symbol`, a function, a
`Promise`) in the same union makes the **entire** union throw, instead of that
sibling being dropped the way `DataOnly` drops it.

`DataOnly` distributes over unions and drops the stripped members:
`DataOnly<Date | symbol>` = `Date`, `DataOnly<string | (() => void)>` = `string`.
The serializer + emitter do the opposite today, confirmed empirically:

- The serializer keeps every union member, including the symbol:
  `serialize.go:610-617` appends `cache.Serialize(member)` for every
  `tsType.Distributed()` member with no non-serializable filtering, and
  `finalizeUnion` only reorders (it keeps `len(SafeUnionChildren) == len(Children)`).
- Given that union, the emitter renders the **union entry** as `alwaysThrow`.
  A probe that built `Date | symbol` (both children present) and rendered each
  family produced:

  ```
  prepareForJson : init('…_dat','date',undefined,true)              // Date: clean noop
                   init('…_uni','union',…,'PJ005')                   // union: alwaysThrow
  stringifyJson  : init('…_uni','union',…,'SJ005')                   // alwaysThrow
  restoreFromJson: init('…_uni','union',…,'RJ005')                   // alwaysThrow
  validate       : init('…_uni','union',…,'VL002')                   // alwaysThrow
  ```

  The `Date` member is a healthy noop entry; the union is poisoned by the symbol
  sibling (the `CodeNS` propagation at `union_flat.go:85-86`, `:114`,
  `:354-355`, …). So `createJsonEncoder<Date | symbol>()` throws at the first
  lookup, even though `DataOnly<Date | symbol>` = `Date`.

(Caveat on the verification: this was confirmed at the serializer + emitter
layers, the serializer code is unambiguous and the emitter behavior was rendered
directly. A full tsgo→runtime end-to-end run was not possible here because the
`third_party/tsgolint` submodules are not checked out, so the binary cannot
build. Re-confirm e2e once the submodules are present.)

This is currently the **documented** contract (CLAUDE.md: a non-serializable
type at a "propagating position" such as a union member emits `alwaysThrow` with
an Error). It is intended-as-built, but it is exactly the faithfulness gap this
todo is about: per `DataOnly`, that type IS serializable (as `Date`).

**Fix (different mechanism from root wrapping): drop stripped union members to
match `DataOnly`'s distribution.** In the union layout / emit
(`union_flat_layout.go` `buildFlatLayout`, mirrored in the validate /
validationErrors union paths), skip a member whose own emit is `CodeNS` because
its kind is in the stripped set (symbol / function / method / call-signature /
Promise / `SubKindNonSerializable`), rather than propagating `CodeNS`. Keep the
remaining members. Only when **no** member survives (e.g. `symbol | (() => void)`,
whose `DataOnly` is `never`) does the union stay `alwaysThrow` — which then
matches `DataOnly` exactly. Dropping is sound: a symbol value handed to
`createJsonEncoder<Date | symbol>()` is not data, so failing the surviving `Date`
member's guard (a "does not belong to the union" error) is the correct outcome.

Note the interaction with the tuple-wrap rule: a *non-compatible but
serializable* member (`bigint`, `Date`, `undefined`) must still be kept and
forces the `[memberIndex, value]` envelope (unchanged). Only the truly *stripped*
kinds are dropped. This change touches every family that walks unions (validate,
validationErrors, the JSON families, binary), so it is larger than the root
wrap; it can ship as its own slice but belongs to the same "faithful to DataOnly"
goal.

## Design constraint recap

- No `isRoot` param on the type id / fnHash. No new cache axis.
- The wrapped form must be a valid, standalone JSON document.
- Encoder and decoder must stay symmetric for the same `(typeId, strategy)`.
- Binary is unaffected: `createBinaryEncoder<undefined>()` already round-trips a
  root `undefined` via a marker byte (`suites/serialization/Atomic.ts` `undefined`
  notes). This change is JSON-only.

## Feasibility of the original runtime-only sketch

The first sketch was: inside `createJsonEncoder` / `createJsonDecoder`, grab the
`RunType` from the runtypes reflection cache by id, and if it is a DataOnly-valid
but root-unserializable kind, return a `serializeDataOnlyRoot` wrapper instead of
the compiled entry.

Two of three legs work; one does not:

1. The `typeId` **is** recoverable at runtime inside the factory. The injected
   `[typeId, fnId]` tuple's key is `<fnHash>_<typeId>`, and `resolveEntryTupleFn`
   already slices `typeId = key.slice(FN_HASH_LEN + 1)`
   (`runtypes/entryTuple.ts`).
2. A lookup API exists: `getRTUtils().getRunType(typeId)` returns the
   reconstructed `RunType` with `.kind` / `.subKind` / `.flags`
   (`runtypes/rtUtils.ts`), enough to detect undefined / void.
3. **But the reflection RunType is not in the runtime cache for a JSON-only
   site.** The kind-4 reflection bundle (`virtual:rt/runtypes.js`) is populated
   only by reflection-root sites, defined as `site.FnId == ""`
   (`internal/cachegen/runtype/entries.go` `reflectionRoots`).
   `createJsonEncoder` / `createJsonDecoder` sites carry a `FnId` (the composite
   fnHash), so they are excluded. A file that only calls
   `createJsonEncoder<undefined>()` and never reflects on the type emits **no**
   reflection row for it, so `getRunType(typeId)` returns `undefined` at runtime.

So the runtime-only approach cannot detect the kind on its own. It would have to
also force reflection emission for every JSON-factory site (see Alternative B),
which is heavier than deciding at build time where the kind is already known.

## Proposed design (recommended): decide in Go, wrap in `ts-runtypes`

The JSON composite emitter already renders one entry per `(typeId, strategy)`
and is, by definition, the **root** frame. It already holds the root `RunType`
(`collectJsonCompositeEntry(runType, …)` in `internal/compiled/typefns/json_composite.go`).
Make the wrap decision there.

1. **Build-time predicate.** Add `rootNeedsDataOnlyWrap(runType, ctx) bool`,
   true when the type is DataOnly-valid but its encoded form is not a standalone
   JSON document. For the current corpus that is exactly: `KindUndefined`,
   `KindVoid`, and a `KindLiteral` whose only value is `undefined`. Keep it a
   narrow, explicit allowlist (like the noop predicates in `noop_types.go`) so a
   new kind is a deliberate addition, never an accident.
2. **Wrapping composite body.** When the predicate is true, emit a wrapping body
   instead of the plain one:
   - encoder: `return serializeDataOnlyRoot(<innerEncodeFragment>);`
   - decoder: `return deserializeDataOnlyRoot(JSON.parse(s));` (then the existing
     restore, which for undefined already yields `undefined` unconditionally).
   The wrapping helpers live in `packages/ts-runtypes/src/runtypes/` (matching the
   requested `serializeDataOnlyRoot` name), so the envelope format lives in one
   place and the Go side only references them by name, exactly like the existing
   `prepareForJsonSafe` / `restoreFromJson` primitive references.
3. **No id / hash change.** Same `typeId`, same per-strategy fnHash; only the
   composite *body* differs for these specific root kinds. Nothing else in the
   cache, demand, or disk-format layer moves.

### Envelope format

Pick one fixed, minimal envelope. Recommended: a **one-element JSON array**.

- encode: the document is `'[' + innerFragment + ']'`. The inner value sits at a
  nested (array-element) position, where the existing non-root emit arms already
  produce valid JSON fragments (`undefined` → `null`, `bigint` → `"123"`, …). So
  the envelope reuses the emitter's nested behavior instead of inventing new
  per-kind logic.
- decode: `JSON.parse(s)[0]`, then the existing restore.

For the pure undefined / void case the inner fragment is `null`, so
`encode(undefined)` returns `"[null]"` and `decode("[null]")` returns
`undefined`. (A bare `"null"` document would also round-trip for a fixed
undefined-typed entry, because its decoder restores `undefined` unconditionally;
the array envelope is preferred for a uniform, self-describing wrapper and to
extend cleanly to any future DataOnly-valid-but-unrepresentable kind.)

### Behavior change to call out

`createJsonEncoder<undefined>()(undefined)` returns `"[null]"` (a string) instead
of `undefined`. `JsonEncoderFn` stays `(value) => string | undefined` because the
no-plugin fallback (`jsonStringifyFallback = JSON.stringify`) still returns
`undefined` for a bare `undefined` input; only the plugin-emitted wrapped-root
entries are guaranteed to return a string. This is the intended fix: a real JSON
document you can store and read back, instead of a value that silently fails to
serialize.

## Alternative A — pure build-time, no runtime helper

Inline the wrap directly in the composite body (`'[' + … + ']'` / `JSON.parse(s)[0]`)
with no `serializeDataOnlyRoot` export. Smaller surface, but the envelope format
is then duplicated across encoder and decoder bodies and harder to evolve. Prefer
the shared helper.

## Alternative B — runtime RunType inspection (the literal original idea)

Keep the decision in `createJsonEncoder` / `createJsonDecoder` at runtime, but
make the reflection RunType available for JSON-factory sites by adding reflection
demand for them in the scanner (so the kind-4 row is emitted), then branch to
`serializeDataOnlyRoot` when `getRunType(typeId)` reports an undefined/void kind.
Downsides: emits full reflection rows even when reflection is otherwise unused,
adds a runtime lookup + branch on every JSON factory call, and still needs a
build-time scanner change. Strictly more work and more runtime cost than the
recommended path; recorded for completeness.

## Implementation steps (recommended path)

1. **Go predicate.** Add `rootNeedsDataOnlyWrap` (new file beside
   `json_composite.go`, or in `noop_types.go` next to the other type-graph
   predicates). Cover `KindUndefined`, `KindVoid`, undefined-only `KindLiteral`.
2. **Go emit.** In `jsonCompositeBody` (`json_composite.go:211`), branch on the
   predicate to emit the wrapping encoder/decoder bodies that call
   `serializeDataOnlyRoot` / `deserializeDataOnlyRoot`. Make sure the elision /
   noop logic still composes (the wrap is around the existing inner expression).
3. **Runtime helpers.** Add `serializeDataOnlyRoot(innerJsonFragment)` and
   `deserializeDataOnlyRoot(parsed)` to `packages/ts-runtypes/src/runtypes/`
   (new module, exported through the package barrel the composite references).
   Implement the array envelope.
4. **Constants sync.** If the helper names need to be referenced from Go
   constants (mirrored via `pnpm run gen:ts-constants`), wire them like the other
   primitive names rather than hard-coding strings in two places.
5. **Rebuild + test.** Rebuild `bin/ts-runtypes` (plugin tests spawn it) and
   rebuild `runtypes-devtools` dist, then run the JS + Go suites.

## Testing

1. **Stop papering over it.** In `serializationAsserts.ts`, the
   `if (serialized === undefined) return;` short-circuit currently swallows the
   undefined/void cases. Once the encoder returns a real document, those cases
   must assert a genuine `decode(encode(v))` deep-equals `v`. Update the
   `undefined` / `void` cases in `suites/serialization/Atomic.ts` (and their
   schema variants) so the decode side is actually exercised.
2. **Go unit test.** In `json_composite_test.go`, assert the wrapping body is
   emitted for undefined / void / literal-undefined and **not** for null /
   number / bigint / Date. Add a small corpus pin for `rootNeedsDataOnlyWrap`
   in the style of `noop_predicate_test.go`.
3. **New fuzz property (requested).** The fuzzer already generates bare atomic
   roots via `genLeaf` (`test/fuzz/typeGen.ts`) and conforming values via
   `genValidValue` (`test/fuzz/shapeValue.ts`); the existing oracles O5/O6
   (`test/fuzz/fuzzOracle.ts`) only assert *wire stability*
   (`encode(decode(encode v)) === encode(v)`), which is too weak to catch a
   silently-undefined encode. Add an oracle:

   > **DataOnly root round-trip:** for any generated DataOnly-valid type `T`
   > (including bare `undefined` / `void` / unions / atomics), a valid value `v`
   > satisfies `isDeepStrictEqual(decode(encode(v)), v)` for JSON, and the same
   > for binary.

   Touch points: add `checkDataOnlyRoundTrip` next to `checkJsonStable` /
   `checkBinaryStable` in `fuzzOracle.ts`, and call it from `runValueOracles` in
   `test/fuzz/typeFuzzRunner.ts`. Make sure the generator actually emits bare
   `undefined` / `void` roots (not only as object properties) so the new oracle
   sees them; widen `genLeaf`'s root weighting if needed.
4. **Marker-coverage rule.** Per CLAUDE.md, any marker test must cover both
   `getRunTypeId<T>()` and `getRunTypeId(value)` shapes — only relevant if
   Alternative B is pursued (it touches reflection demand). The recommended path
   does not add reflection sites, so this rule is satisfied by the existing
   serialization-suite shape.

## Documentation impact (when this lands)

- `docs/ARCHITECTURE.md` — the serialization / validate-contract section: note
  that DataOnly-valid roots with no native JSON form are wrapped in a JSON
  envelope rather than returning a non-document value.
- `CLAUDE.md` — the "validate contract" bullets describe root vs property
  behavior; add a line that undefined/void roots now wrap instead of returning a
  bare value.
- `docs/UNSUPPORTED-KINDS.md` — referenced across the Go emit + tests but **does
  not currently exist** in the tree. Either create it (the diag-code comments
  already point at it) or fix the dangling references while documenting the
  wrapped-root behavior.
- The `createJsonEncoder` JSDoc (`createRTFunctions.ts:145-147`,
  `:324-355`) — clarify that a wrapped root returns a string document, while the
  no-plugin fallback still mirrors `JSON.stringify` (`string | undefined`).

## Open questions

1. **Build-time decision (recommended) vs runtime RunType inspection
   (Alternative B)?** This is the central call. Build-time is lighter and avoids
   the reflection-cache problem.
2. **Envelope shape:** one-element array `[inner]` (recommended) vs object
   `{"v":inner}` vs a bare parseable document. Array is the lightest
   self-describing option.
3. **Sequence Case A and Case B together, or ship separately?** Case B (drop
   stripped union members) is verified real and belongs to the same goal, but it
   touches every family that walks unions, so it is a larger change than the
   root wrap. Recommend separate slices under one tracking doc.
4. **`createJsonEncoder<undefined>` return value:** keep status quo
   (`undefined`, faithful to `JSON.stringify`) or the wrapped string (faithful to
   `DataOnly`)? Choosing `DataOnly` faithfulness is the whole point of this todo,
   but it is a behavior change worth a changelog note.
5. **Interop / wire expectations:** the wrapped document is no longer the JSON a
   human would hand-write for the value. For root `undefined` there is no sensible
   hand-written JSON anyway, so this seems acceptable, but confirm no consumer
   depends on the exact wire bytes of these specific roots.

## Not in scope

- Binary serialization (already round-trips `undefined` / `void` at root).
- Any change to the type id, fnHash, or disk cache format / fingerprint.
- Refining `createValidate` / `DataOnly` return types or renaming factories
  (separate roadmap item; see `docs/ROADMAP.md`).

Case B (dropping stripped union members) IS in scope for the "faithful to
DataOnly" goal but is expected to ship as its own slice (it touches every
union-walking family); see "Second gap" and open question 3.
