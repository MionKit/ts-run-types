# Runtime enumerability checks for global-class props (+ @nonEnumerable tag) — DONE

Supersedes the hard `stack` exclusion in
[error-subclass-projections-leak-stack.md](error-subclass-projections-leak-stack.md)
with a strictly more general, per-value rule.

## Motivation (review discussion on the lib-Error stack exclusion, 2026-07-13)

The stack fix hard-excluded ONE lib member (`Error.stack`) from class projections.
Review direction: make the general mechanism match JS semantics while staying
type-aware — emitted encoders CHECK ENUMERABILITY AT RUNTIME before writing certain
props, instead of a build-time include/exclude table or dedicated visibility brands.

## What shipped

- **Guard predicate — one shared, drift-proof helper.** `typeid.IsNonEnumerable(symbol)`
  is read by BOTH the structural id (`memberID`) and the projection
  (`serialize.go appendProperty`), so id and projection can't diverge. It fires for:
  1. **lib-global-inherited members** — every declaration sits inside an `interface`/`class`
     in a `lib.*.d.ts` file (Error's `name`/`message`/`stack`, and any other global whose
     runtime descriptor is non-enumerable). This generalises (and removes) the old
     `IsLibErrorStack` special-case: the rule is now "any prop from a global type", per the
     2026-07-13 ruling. A subclass that REDECLARES a member as its own data prop (a
     declaration outside a lib file) owns it and is NOT guarded.
  2. **`@nonEnumerable`-tagged user props** — read off the declaration's JSDoc
     (`JSDocUnknownTag`), the type-aware bridge for a descriptor TS can't express.
- **Guarded ⇒ non-enumerable-guarded write + optional shape.** The member carries a new
  `protocol.RunType.NonEnumerable` flag AND is marked `Optional`. The by-name serializer
  families gate the write on `Object.prototype.propertyIsEnumerable.call(v, 'k')`
  (`JSON.stringify` semantics):
  - `prepareForJsonSafe` (clone, the DEFAULT) — reuses the existing `presenceGuard` hook
    (the same one the union stripped-candidate path uses).
  - `stringifyJson` (direct) — the optional ternary keys on `!propertyIsEnumerable`.
  - `compactForJson` (compact) — the positional `null` placeholder keys on enumerability.
  - `toBinary` (tb) — the guarded member rides the EXISTING optional presence bitmap; only
    the bit-set condition changes (enumerability, not `!== undefined`). The decoder (`fb`)
    and the compact decoder (`cjr`) need NO change — `Optional` already routes the member
    through the shared presence path, and the bit / null placeholder is authoritative.
  - **`prepareForJson` (mutate) needs no guard** — its wire output is
    `JSON.stringify(pj(v))`, and native `JSON.stringify` already honors own-enumerability,
    so its noop verdict stays sound (an all-string Error subclass stays a pj-noop, and the
    mutate composite substitutes native `JSON.stringify`). This is a scope refinement over
    the original spec, which listed pj among the families to change.
- **Id fold.** A `#ne` bit (mirroring `#ro`) folds into the member id, and the guard also
  folds into the `optional` id bit — so a guarded member gets a distinct id from an
  unguarded twin (the per-ID noop memo keys on this id; without the fold it would collide).
- **Reflection.** `nonEnumerable` is exposed on the reflected `RunType` (a new trailing
  bundle-row slot, mirrored in `entryTuple.ts` `RUN_TYPE_FIELD_KEYS`) so a consumer can
  introspect which members are guarded.
- **Noop soundness.** No predicate arm needed changing: guarded ⇒ `Optional`, and the
  by-name families (pjs/sj/cj) already return false for objects-with-props while tb already
  returns false for optional members. The corpus test gains an `@nonEnumerable` type and an
  Error subclass so the `predicate ⇒ ground-truth` soundness direction is pinned for them.

## Decided (review rulings, 2026-07-13, confirmed at implementation)

1. **Uniform rule — no requiredness exception.** EVERY lib-global-inherited prop is guarded,
   `name`/`message` included. A vanilla `class X extends Error { super(msg) }` therefore
   ships neither (Error's constructor makes `message` non-enumerable; `name` stays on the
   prototype) — exact native-JSON behavior. A framework that wants them on the wire makes
   them enumerable own props (mion's TypedError/RpcError). This REVERSED the earlier
   done-doc decision to keep `name`/`message` projected; confirmed with the user before
   implementing.
2. **Binary presence encoding accepted.** Guarded props ride the existing optional-prop
   presence bitmap; the enumerability check drives the bit. Cost accepted.

## Type-level limitation (spec corrected)

The original spec required `DataOnly<T>` to treat guarded props as optional. `DataOnly<T>`
is a pure compile-time type transform and CANNOT observe runtime enumerability or the
`@nonEnumerable` JSDoc tag (that tag exists precisely because the type system can't express
non-enumerability). So the requirement is split:

- **Runtime** (validators + reflected projection + structural id): guarded props ARE treated
  as optional — this is what makes `validate(decode(encode(v)))` hold for a vanilla instance.
- **Type-level** (`DataOnly<T>`): UNCHANGED. It may report a guarded-but-TS-required prop
  (Error's `name`/`message`) as present though the runtime wire omits it. This is a
  compile-time-only over-promise, consistent with the todo's own premise; it does NOT break
  the runtime acceptance criterion. Left as a documented limitation.

## JS-semantics note (spec corrected)

The original spec claimed `this.name = x` "keeps the inherited descriptor" (non-enumerable).
That is WRONG: assigning through an inherited WRITABLE data property (`Error.prototype.name`)
creates a NEW **enumerable** own property — same as a class field. The genuinely
non-enumerable cases are `super(message)` (Error's constructor uses a non-enumerable define)
and engine-set `stack`. The shipped tests pin the real semantics.

## Acceptance shipped

- Rewrote `packages/ts-runtypes/test/features/errorSubclassWire.test.ts` for the new uniform
  semantics: a vanilla subclass ships only its enumerable own props (native-JSON parity),
  `stack` is now a guarded member in the reflected shape (not excluded), a `this.name = …`
  subclass ships `name`, a value that makes `stack` enumerable serializes it, and
  `validate` accepts the wire shape.
- New `packages/ts-runtypes/test/features/nonEnumerableGuard.test.ts`: the `@nonEnumerable`
  tag across all four JSON strategies + binary, validators/`getValidationErrors` treating the
  prop optional, the reflected `nonEnumerable`/`optional` flags, and the framework opt-in
  (enumerable `name`/`message` round-trip). Both suites cover both `getRunTypeId` call shapes
  with a hash-equivalence assertion (marker rule).
- Full Go suite + full JS suite (7817 passing) green.

## mion follow-up (documented, not in this repo)

mion's TypedError/RpcError make `name`/`message` enumerable own props (class field or
`Object.defineProperty` in the constructor) to keep the error envelope on the wire; after
adopting, the earlier `stack` allowlist entry can be dropped.
