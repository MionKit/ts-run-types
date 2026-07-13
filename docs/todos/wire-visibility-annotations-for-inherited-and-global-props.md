# Wire-visibility annotations for inherited / global-class props (design proposal)

## Motivation (review discussion on the lib-Error stack exclusion, 2026-07-13)

The stack fix (docs/done/error-subclass-projections-leak-stack.md) hard-excludes ONE
lib member (`Error.stack`) from class projections. Review feedback asks for the general
mechanism: per-property control over wire visibility for members inherited from global
classes — e.g. exclude `stack` from a server response encoder but INCLUDE it when
serializing to a logging platform — with sensible defaults for globals and re-tagging
in the subclasses that extend them.

## Constraints discovered

- **Enumerability is NOT in the type system.** A TS property declaration carries only
  `readonly` and `?`; runtime descriptors (`enumerable` etc.) are unmodeled. lib.es5's
  `interface Error {name; message; stack?}` is type-identical to three plain data props.
  So "enumerable included / non-enumerable excluded" cannot be DERIVED at build time —
  only encoded in a curated table of known globals, or annotated by the user.
- At runtime (V8), `stack` AND `message` are own non-enumerable on Error instances and
  `name` sits on the prototype — native `JSON.stringify(err)` yields `{}`. A strict
  enumerability default for Error would therefore also drop `name`/`message`, which are
  the USEFUL envelope half (kept deliberately by the stack fix). Curation, not raw
  descriptor semantics, has to pick the defaults.
- For USER-declared members the serializable-data contract already approximates
  enumerability semantics (methods / accessor-only / symbols drop; data fields ride).
  The gap is exclusively lib-declared globals, where the TS declaration doesn't reflect
  runtime visibility.
- Already possible today: REDECLARING the member in user code opts it back in — the
  exclusion requires every declaration to come from the lib, so
  `class RpcError extends TypedError { declare stack?: string }` puts stack back on the
  wire for that class (type-only via `declare`). What's missing is per-USE control and
  a first-class annotation.

## Proposed design (three layers, all fitting existing machinery)

1. **Property-level brands** `WireInclude<T>` / `WireExclude<T>` (naming open) in the
   marker package, recognized by the scanner the same way TypeFormat / CompTimeArgs
   brands are. Applied by redeclaring the member with the branded type in the subclass:

   ```ts
   class RpcError<T extends string, D = any> extends TypedError<T> {
     declare stack?: WireInclude<string>; // opt the lib member back onto the wire
   }
   ```

   MUST be id-relevant (visibility changes the projected shape, so it changes the
   structural id — same principle as tuple labels / format params in this PR).

2. **Per-use projections via a comptime factory option**, e.g.
   `createJsonEncoder<RpcError>({wireVisibility: 'declared' | 'all'})` (naming open).
   CompTimeFnArgs options fold into the fnHash, so a server encoder and a logging
   encoder become two distinct cache entries over the same type — the same mechanism as
   the existing clone/mutate/direct strategy axis. This answers "exclude stack in the
   API response, include it for the logging sink" without touching the class.

3. **A curated global-member defaults table** generalizing `typeid.IsLibErrorStack`:
   per known lib interface member, an include/exclude default (Error.stack: exclude;
   Error.name/message: include; future candidates as they surface). The table is the
   honest substitute for the enumerability signal the type system doesn't carry.

## Open questions

- Brand naming + whether Include/Exclude also apply to user-declared members (probably
  yes — a general redaction primitive, useful beyond globals).
- Interaction with `DataOnly<T>` and decoders (an excluded member should also vanish
  from the decode projection; an Included lib member should appear in it).
- Binary lane parity (both layers must apply to tb/fb identically).
- Whether the `wireVisibility: 'all'` variant needs a matching validate variant or
  reuses the standard validator (excluded members are unchecked either way today).
