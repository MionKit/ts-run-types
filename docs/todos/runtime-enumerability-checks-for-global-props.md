# Runtime enumerability checks for global-class props (+ @nonEnumerable tag)

## Motivation (review discussion on the lib-Error stack exclusion, 2026-07-13)

The stack fix (docs/done/error-subclass-projections-leak-stack.md) hard-excludes ONE
lib member (`Error.stack`) from class projections. Review direction: make the general
mechanism match JS semantics while staying type-aware — emitted encoders should CHECK
ENUMERABILITY AT RUNTIME before writing certain props, instead of a build-time
include/exclude table or dedicated visibility brands.

Rejected alternative (recorded for posterity): `WireInclude<T>`/`WireExclude<T>`
property brands — redundant with native type algebra (`Omit`/`Pick`, and
`Cls & {member?: T}` to re-add a member). Caveat when using mapped types: the
projection is an object-literal shape, so decoders lose class reconstruction
(`instanceof`) — fine for encoders.

## Agreed design

- **Guarded props**: the emitters (ALL families that write declared props by name —
  pj/pjs/sj, the JSON composites, and tb — not just clone/direct) wrap the write in a
  runtime own-enumerability check (`Object.prototype.propertyIsEnumerable.call(v, 'k')`,
  i.e. `JSON.stringify` semantics) for:
  1. props inherited from default-lib global interfaces (Error, and any other lib
     classes whose members are runtime-non-enumerable), and
  2. user props tagged **`@nonEnumerable`** in JSDoc — the type-aware bridge for a
     descriptor the type system cannot express (TS models only `readonly`/`?`).
- **Default behavior**: everything else (untagged user-declared data props) keeps the
  current unconditional by-name write. This mirrors JS closely: for user classes,
  class FIELDS are enumerable at runtime (define semantics) and methods/accessors are
  already dropped by the serializable-data contract, so the runtime check is only
  needed where the TS declaration and the runtime descriptor can disagree — lib
  globals and explicitly tagged members.
- **Effect on the stack case**: `stack?` guarded ⇒ a vanilla error instance skips it
  (own but non-enumerable), while a value that deliberately defines it enumerable
  (e.g. a logging path calling `Object.defineProperty(err, 'stack', {enumerable:
  true, value: err.stack})`, or a helper on the class) serializes it. This SUPERSEDES
  the hard `typeid.IsLibErrorStack` exclusion with a strictly more general rule and
  restores the per-value opt-in the exclusion removed.
- The `@nonEnumerable` tag is id-relevant (it changes the emitted shape, so it must
  fold into the structural id, same principle as tuple labels / format params).
  Reading JSDoc tags off declarations already has precedent (`@rtType` / `@rtOrphan`
  in the enrichment scanner).

## Design decisions to settle before implementing

1. **Requiredness tiebreaker.** At runtime `Error.message` is own-non-enumerable and
   `name` is prototype-resident, so a blanket guard on ALL global props would stop
   serializing both for vanilla subclasses (constructor assignment keeps the
   non-enumerable descriptor) — native-JSON behavior, but it empties the typed-error
   envelope (mion's wire relies on `message`) and a missing REQUIRED prop fails the
   type's own validator on decode. Proposed rule: **guard OPTIONAL global props
   (`stack?`); keep REQUIRED ones (`name`, `message`) unconditional** — the type's
   requiredness decides, so wire output always satisfies the type's own validator.
   An explicit `@nonEnumerable` tag on a required member opts it into the guard AND
   forces optional semantics on the wire (validators/decoders treat it as optional).
2. **Binary lane parity.** tb/fb are positional: a conditionally-present prop must ride
   the existing optional-prop presence encoding. "Guarded" therefore implies
   optional-on-the-wire in every lane (JSON absent key, binary presence bit), and the
   decode projection treats it as optional.
3. Own-only check semantics (`propertyIsEnumerable`) match `JSON.stringify`; prototype
   reads (`v.name` succeeding through the chain today) stop counting — covered by the
   requiredness tiebreaker, but worth pinning in tests for a subclass that sets
   `this.name`.
4. Noop-predicate sync: families whose emit arms gain the guard need the matching
   IsNoopType arm unchanged-or-updated per the soundness contract (a guarded prop is
   never identity-preserving, so predicates must treat guarded members as live).

## Acceptance sketch

- Vanilla `class MyError extends Error {code}`: JSON/binary write `code` +
  `name`/`message` (required, unconditional), never `stack`; identical to the current
  shipped behavior — no regression for mion.
- Same class where the VALUE carries an enumerable own `stack`: stack rides the wire
  and round-trips (JSON + binary presence path).
- A user prop tagged `@nonEnumerable` behaves like `stack?`: skipped when
  non-enumerable at runtime, serialized when enumerable, optional to validators.
- `validate(decode(encode(v)))` holds for every case above.
