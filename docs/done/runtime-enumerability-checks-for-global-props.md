# Runtime enumerability checks for global-class props (+ @nonEnumerable tag) — DONE

Supersedes the hard `stack` exclusion in
[error-subclass-projections-leak-stack.md](error-subclass-projections-leak-stack.md)
with a strictly more general, per-value rule.

## Motivation (review discussion on the lib-Error stack exclusion, 2026-07-13)

The stack fix hard-excluded ONE lib member (`Error.stack`) from class projections.
Review direction: make the general mechanism match JS semantics while staying
type-aware — emitted encoders CHECK ENUMERABILITY AT RUNTIME before writing certain
props, instead of a build-time include/exclude table or dedicated visibility brands.

## The guard invariant: GUARDED ⇒ OPTIONAL-in-type

The load-bearing rule (settled after weighing `DataOnly<T>`, see below): a property
is guarded ONLY when it is optional in its declared type. This makes `DataOnly<T>`
sound by construction — a guarded member is always one the type already permits to
be absent, so the decoder's return type can never over-promise a value the wire may
omit.

## What shipped

- **Guard predicate — one shared, drift-proof helper.** `typeid.IsNonEnumerable(symbol)`
  is read by BOTH the structural id (`memberID`) and the projection
  (`serialize.go appendProperty`), so id and projection can't diverge. It returns true
  only for an OPTIONAL member (`symbol` carries `?`) that is either:
  1. **inherited from a default-lib GLOBAL type** — every declaration sits inside an
     `interface`/`class` in a `lib.*.d.ts` file (Error's `stack?` / `cause?`). A
     subclass that REDECLARES the member as its own prop (declaration outside a lib
     file) owns it and is not guarded.
  2. **tagged `@nonEnumerable`** in JSDoc (`JSDocUnknownTag`).
- **The REQUIRED error envelope is always serialized.** `name` / `message` are required
  in lib `Error`, so they are NOT guarded — they always ride the wire (the error stays
  useful, and `DataOnly<Error>` correctly lists them). This is the deliberate reversal
  of the first-cut "uniform rule" once its `DataOnly` cost was understood (see below).
- **Guarded ⇒ non-enumerable-guarded write.** The member carries a new
  `protocol.RunType.NonEnumerable` flag (already `Optional`). The by-name serializer
  families gate the write on `Object.prototype.propertyIsEnumerable.call(v, 'k')`:
  - `prepareForJsonSafe` (clone, DEFAULT) — reuses the existing `presenceGuard` hook.
  - `stringifyJson` (direct) — the optional ternary keys on `!propertyIsEnumerable`.
  - `compactForJson` (compact) — the positional `null` placeholder keys on enumerability.
  - `toBinary` (tb) — rides the EXISTING optional presence bitmap; only the bit-set
    condition changes. `fromBinary` / the compact decoder (`cjr`) need NO change
    (`Optional` already routes the member through the shared presence path).
  - `prepareForJson` (mutate) needs no guard — its wire output is `JSON.stringify(pj(v))`,
    and native `JSON.stringify` already honors own-enumerability.
- **Id fold.** A `#ne` bit (mirroring `#ro`) folds into the member id; the guard also
  folds into the `optional` id bit. The per-ID noop memo keys on this id.
- **Reflection.** `nonEnumerable` is exposed on the reflected `RunType` (a trailing
  bundle-row slot mirrored in `entryTuple.ts` `RUN_TYPE_FIELD_KEYS`).
- **Noop soundness.** No predicate arm needed changing (guarded ⇒ `Optional`, and the
  by-name families already return false for objects-with-props / optional members). The
  corpus test gains an optional `@nonEnumerable` type and an Error subclass so the
  soundness direction is pinned.

## The `DataOnly<T>` reasoning (why guard only optional)

`DataOnly<T>` is the decoder's return type. It is a pure compile-time transform and
CANNOT observe runtime enumerability or the `@nonEnumerable` tag. The first-cut design
(the "uniform rule": guard EVERY lib-global-inherited member, `name`/`message` included)
would have made `decode(encode(vanillaError))` drop `name`/`message`, while
`DataOnly<Error>` still marks them required — a type-level over-promise
(`decoded.message` typed `string` but `undefined` at runtime). Rather than document that
as a limitation, the shipped design AVOIDS it: guard only optional props, so the type
already allows the omission. `name`/`message` (required) are always serialized instead.
Net: no `DataOnly` divergence, no separate error base class needed.

A `@nonEnumerable` tag on a REQUIRED property is therefore a no-op (the property is not
guarded and serializes unconditionally); the `NE` lint rule tells the user to make it
optional for the tag to take effect. (Lint rule tracked as a follow-up; the resolver
behavior — required-tagged is a harmless no-op — is already correct.)

## Binary presence encoding accepted (2026-07-13 ruling)

Guarded props ride the existing optional-prop presence bitmap; the enumerability check
drives the bit. Cost accepted.

## JS-semantics note (spec corrected)

The original spec claimed `this.name = x` "keeps the inherited descriptor". That is
WRONG: assigning through an inherited WRITABLE data property (`Error.prototype.name`)
creates a NEW enumerable own property. The genuinely non-enumerable cases are
`super(message)` (Error's constructor uses a non-enumerable define) and engine-set
`stack`. (Moot for `name`/`message` now that they are always serialized regardless of
enumerability, but the tests pin the real semantics for `stack`.)

## Acceptance shipped

- Rewrote `packages/ts-runtypes/test/features/errorSubclassWire.test.ts`: the envelope
  (`name`/`message`) + declared props always ride the wire; `stack`/`cause` are guarded
  (dropped unless enumerable); reflection flags stack/cause as `nonEnumerable`+`optional`
  and name/message/code as neither; per-value enumerable `stack` serializes; validators
  require the envelope and accept absent stack/cause.
- New `packages/ts-runtypes/test/features/nonEnumerableGuard.test.ts`: `@nonEnumerable`
  on an OPTIONAL prop across all four JSON strategies + binary; validators treat it
  optional; reflection flags; a required `@nonEnumerable` prop is a no-op (serialized
  unconditionally). Both suites cover both `getRunTypeId` call shapes with a
  hash-equivalence assertion (marker rule).
- Full Go suite + full JS suite green.

## mion follow-up (documented, not in this repo)

With `name`/`message` always serialized, mion's TypedError/RpcError need do nothing
special to keep the error envelope on the wire; the earlier `stack` allowlist entry can
be dropped after upgrading.
