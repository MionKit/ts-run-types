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

## Decided (review rulings, 2026-07-13)

1. **Uniform rule — no requiredness exception.** EVERY lib-global-inherited prop gets
   the runtime guard, `name`/`message` included. A framework that wants them on the
   wire makes them enumerable in its own classes (e.g. mion's TypedError/RpcError
   define `name`/`message` as enumerable own props — class fields use define
   semantics, or `Object.defineProperty` in the constructor). Vanilla subclasses get
   exact native-JSON behavior.
2. **Binary presence encoding accepted.** Guarded props ride the existing
   optional-prop presence path in tb/fb; the emitted enumerability check itself
   drives the presence bit. Implementation cost acknowledged and accepted.

## Derived requirements

- **Guarded ⇒ optional in the projected shape.** Because a guarded prop may be absent
  from the wire even when the TS type marks it required, validators and the decode
  projection (`DataOnly<T>`) must treat guarded props as optional — otherwise
  `validate(decode(encode(v)))` fails for vanilla instances. The type's requiredness
  stays a compile-time statement about the CLASS; the wire shape is
  enumerability-driven.
- Own-only check semantics (`propertyIsEnumerable`) match `JSON.stringify`; prototype
  reads (`v.name` succeeding through the chain today) stop counting. Pin with a test
  for a subclass that sets `this.name` (assignment keeps the inherited descriptor)
  vs one that DECLARES `name` as a class field (define semantics ⇒ enumerable).
- Noop-predicate sync: families whose emit arms gain the guard need the matching
  IsNoopType arm updated per the soundness contract (a guarded prop is never
  identity-preserving, so predicates must treat guarded members as live).
- mion follow-up (on adoption): TypedError/RpcError make `name`/`message` enumerable
  own props to keep the error envelope on the wire.

## Acceptance sketch

- Vanilla `class MyError extends Error {code}`: JSON/binary write `code` only —
  `name`/`message`/`stack` are all non-enumerable at runtime and skip (native-JSON
  behavior). Validators accept the decoded value (guarded props are optional).
- A subclass declaring `name`/`message` as enumerable own props (class fields /
  defineProperty): both ride the wire and round-trip.
- A VALUE carrying an enumerable own `stack`: stack rides the wire and round-trips
  (JSON + binary presence path).
- A user prop tagged `@nonEnumerable` behaves the same: skipped when non-enumerable
  at runtime, serialized when enumerable, optional to validators.
- `validate(decode(encode(v)))` holds for every case above.
