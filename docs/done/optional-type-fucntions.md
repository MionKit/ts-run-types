# Custom per-type function overrides — `overrideX<T>(pureFn)`

**Status:** idea, not started. Captured as a scoping note for a future session;
no design committed, no code touched.

The idea: let users **register a custom pure function for one specific type T**,
so that when the compiler resolves `T`'s typeId and a downstream `createX<T>()`
call site asks for that family's compiled body, the resolver returns the user's
function instead of the Go-emitted one. One override per `(family, typeId)`
pair; all downstream call sites for that `T` pick it up automatically because
they hash to the same `<fnHash>_<typeId>` cache key.

Example shape — final API to be designed; this is just to fix ideas:

```ts
// User-side: declared once per T, near the type definition.
overrideJsonEncoder<User>((u) => `{"id":${u.id},"n":${JSON.stringify(u.name)}}`);
overrideValidate<User>((v): v is User => typeof v === 'object' && v !== null && typeof (v as User).id === 'number');

// Anywhere else, untouched:
const encode = createJsonEncoder<User>();   // returns the custom encoder
const isUser = createValidate<User>();      // returns the custom validator
```

The shape (`overrideX<T>(pureFn)`) deliberately mirrors `createX<T>()`. Same
`InjectTypeFnArgs<T, '<fnKey>'>` marker, same `(family, typeId)` axis — the
override is just the *other side* of the same routing: `createX` reads the cache
entry; `overrideX` writes it.

## Motivation

Today every emitted body comes from the Go side: scan T, walk the type graph,
emit. That's the right default — it's where the structural deduplication and
the disk cache live — but it doesn't cover the cases where a human knows a
better function than anything the compiler can emit:

1. **Hand-tuned hot paths.** A JSON encoder for a 30-field DTO that ships in
   every RPC reply. The user knows the field order, knows there are no nulls,
   knows the strings need no escaping. A bespoke `\`{"id":${u.id},"n":"${u.name}"}\``
   can beat a generic emitter on that one specific shape.
2. **Foreign data formats.** A type whose wire format isn't the structural
   projection of T at all — a legacy column order, a packed varint layout, a
   custom binary frame for one message kind. The compiler can't know; the user
   can.
3. **Cross-cutting concerns the type graph can't express.** Redacting one
   `password` field, materialising a derived `displayName` only on encode,
   collapsing a discriminated union into a tag the compiler doesn't see.
4. **Escape valve when the emitter gets it wrong.** Today a bug in `binary_to`
   for one corner type forces a code change in the Go emitter and a binary
   re-release. An override would let a user pin a known-good function for that
   one type while the upstream fix bakes.

This is essentially the same escape valve a `JSON.toJSON()` method gives users
of `JSON.stringify`, but typed, per-family, and lifted to compile time so it
costs nothing at runtime.

## Where it would slot in the architecture

The pieces are already wired for this:

- **Cache key.** `<fnHash>_<typeId>` — fnHash from the family, typeId from T.
  An override targets exactly one such key. No new keying axis.
- **Injection marker.** `InjectTypeFnArgs<T, '<fnKey>'>` already brands the
  trailing slot the plugin fills with the entry tuple. `overrideX<T>(fn)` would
  carry the same marker (same Fn token as its `createX` twin) so the scanner
  routes both call shapes through the same fnHash path.
- **Purity gate.** `PureFunction<F>` already exists in
  [markers.ts](../../packages/ts-runtypes/src/markers.ts) — same purity rules
  as the existing `pure` helpers (no outer-scope captures, no `this`, no
  `eval`, no `import()`, etc.). An override that fails purity should hard-error
  at the call site (same `PFN001` / `PFE9006`–`PFE9011` codes), not silently
  fall through to the emitted body.
- **Operations registry.** [`internal/operations/operations.go`](../../internal/operations/operations.go)
  already names every family by `FamilyTag` + `FnKey`. An override targets one
  registry entry by FnKey; no new registry.
- **Cache-entry tuple.** The positional tuple under `__rt_<key>` already
  carries an `ini` (initializer / body) slot — see
  [packages/ts-runtypes/src/runtypes/entryTuple.ts](../../packages/ts-runtypes/src/runtypes/entryTuple.ts).
  An override would just emit a different `ini` for that one entry.
- **`emitMode`.** Today the plugin's `emitMode` (`code` / `functions` / `both`)
  controls whether bodies ship as source strings or live closures. An override
  is always a live closure (the user's function); under `code` we'd also need
  to emit `fn.toString()` for parity, OR skip the code mode for overridden
  entries (TBD — see open questions).

So the override path is a small addition: scanner recognises one more call
shape, emitter substitutes one entry's body, runtime is unchanged.

## Constraints we want the override to keep

These are the invariants the existing system gives users; the override path
must not silently weaken them.

- **The function MUST be pure.** Same rules as `PureFunction<F>` —
  inline-defined, no captures, no host references. Statically enforced; not a
  runtime check.
- **The function MUST type-check against the family's expected signature for
  T.** `overrideJsonEncoder<User>` requires `(u: User) => string`,
  `overrideValidate<User>` requires `(v: unknown) => v is User`, etc. The
  family signature is already in TS; the override marker would constrain `F`
  to it (`overrideJsonEncoder<T>(fn: PureFunction<JsonEncoderFn<T>>)`).
- **One override per `(family, typeId)`.** Declaring two overrides for the
  same pair is a hard error (`OVR0xx`), at build time — anything else makes
  cache lookups order-dependent.
- **The override participates in the same dedup as compiler bodies.** It still
  flows through `resolveTupleEntry`; the only difference is which `ini` the
  cache entry holds.
- **Soundness contract for cross-family use.** `it` (validate) is shared by
  JSON / binary decoders for union narrowing (see CLAUDE.md → "Two injection
  markers"). If a user overrides `validate<T>` to be looser than the structural
  validator, every downstream decoder that depends on it is now looser too.
  This is **the user's call** — they signed up by overriding — but it should be
  surfaced as a build-time **Warning** at every downstream site that pulls the
  overridden `val_<T>` via `SoftDeps`.
- **Compiled cache invalidation.** The override's `fn.toString()` (under
  `emitMode: 'code'`) or the function source byte-range under
  `emitMode: 'functions'` MUST fold into the disk fingerprint so a change to
  the override invalidates the entry. Today the fingerprint already covers
  `ArgsText`; adding the override's source slice is mechanical.

## Open questions (decide before designing)

1. **Where does the override get declared?** Three options, each with
   different ergonomics:
   - **Sibling file** (`User.rt.ts`, alongside the enrichment files the
     `rt-enrich-types` skill already uses). Clean, discoverable, mirrors the
     friendly/mock enrichment layer. Best fit if overrides become common.
   - **Top of any file that imports `T`** — first call wins, others are
     errors. Lightest setup; risks "where the hell is this declared?" hunts.
   - **Registry call inside an entry file** the plugin scans on load.
     Centralised; adds a load-order edge case to the scan.
   - Likely answer: sibling file, gated by the same scanner pass that already
     reads the enrichment maps; gives one durable home per T.
2. **Does the override carry comptime options?** E.g. can a user override
   `jsonEncoder` for `T` but ONLY for `strategy: 'clone'`? Probably not in v1
   — collapse to "the override wins for every strategy of that family on
   that T" and document it. Per-strategy overrides multiply the rule surface
   and make the override conceptually leakier.
3. **Override `createValidate` only, or every family?** Likely answer: every
   public op in the registry (validate, verr, huk, suk, uke, uku, fmt, tb, fb,
   jsonEncoder, jsonDecoder) gets an `overrideX` twin. The internal primitives
   (`pj`, `pjs`, `rj`, `sj`, `ukuw`) do NOT get one — they aren't user-facing.
4. **What happens under `emitMode: 'code'`?** Overrides are user functions; we
   can `fn.toString()` to serialise them for code mode, but that brings the
   purity gate from a parse-time check to a string-roundtrip check, and breaks
   closures (overrides must already be capture-free, so this is fine, but
   worth noting). Alternative: forbid overrides under `'code'` and emit a
   build-time error pointing the user to `'functions'` / `'both'`.
5. **Does an override participate in noop elision?** Likely no — the noop
   predicate is over the structural type graph; an override breaks that
   contract by definition. Easiest rule: an overridden entry is never noop,
   always emitted, always called.
6. **Failure mode when the override throws at runtime.** Same as any user
   function — let it throw, don't trap. The override is the user's contract.

## Sketched design (subject to change)

API surface (`packages/ts-runtypes/src/createRTFunctions.ts` + a new
`overrideRTFunctions.ts`):

```ts
export function overrideValidate<T>(
  fn: PureFunction<ValidateFn<T>>,
  id?: InjectTypeFnArgs<T, 'val'>,
): void;

export function overrideJsonEncoder<T>(
  fn: PureFunction<JsonEncoderFn>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>,
): void;

// …one per public op in the operations registry.
```

Scanner work (`internal/marker/` + `internal/compiled/typefns/`):

- Recognise the `overrideX<T>(fn, id)` call shape as a SECOND site kind on the
  same `(family, typeId)` axis the `createX` sites already use.
- Collect overrides into a per-(family, typeId) table during the scan;
  duplicate-override = hard error (`OVR001`).
- At emit time, when emitter renders the cache entry for `(family, typeId)`,
  substitute the override's body in the `ini` slot instead of the structural
  emit.
- Fold the override's source byte-range into the entry's disk fingerprint.

Runtime work: **none**. `resolveTupleEntry` already reads `ini` blindly.

## Why this is worth doing

It collapses the **two** common reasons users today have to bypass RT for one
type (hand-tuned hot path, or wire format the structural emitter can't produce)
into the same call shape and the same dedup pipeline as a normal RT type. The
type stays a RunType; only its compiled body changes. That keeps the rest of
the system — type ids, demand-driven caches, soft deps for cross-family edges,
binary fingerprinting — unchanged, while opening the only escape valve the
emitter currently lacks.

## Documentation impact (when this lands)

When the override API ships, the docs need a coordinated update so users can
discover and use it without reading source:

- `container-website/content/2.guide/` — a new page (or a section inside
  `7.pure-functions.md`, since the override `fn` MUST be pure) that
  introduces `overrideX<T>(pureFn)` with one example per public family.
  Voice rules apply: plain language, no em-dashes, short frontmatter (see
  [CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container-websitecontent)).
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — extend the "Two injection
  markers" section to describe override as the WRITE side of the same
  `(family, typeId)` axis.
- The diagnostic catalog page (see
  [document-compiler-diagnostic-catalog.md](document-compiler-diagnostic-catalog.md))
  needs entries for the new `OVR0xx` codes (`OVR001` duplicate override,
  any purity violations surfaced at the override call site that aren't
  already covered by `PFN001` / `PFE90xx`).
- [`README.md`](../../README.md) — one line in the project pitch under
  "escape hatches" once the API stabilises.
- The plugin-config sweep
  ([expose-go-compiler-constants-via-tsconfig-plugin.md](expose-go-compiler-constants-via-tsconfig-plugin.md))
  should re-check whether overrides need any plugin-wide option (e.g.
  "disable overrides for this build") before that todo's docs land.

## Not in scope here

- A way to override a SUB-TYPE inside a larger structural type (e.g. "use this
  encoder when this field of `User` is encoded"). That's a property-level
  override and is a much bigger design — separate todo if/when it comes up.
- Multiple variants of an override discriminated by call-site options. Lift to
  one-override-per-(family,typeId) as above; revisit only if real cases
  demand it.
- Runtime registration (registering overrides at app startup instead of at
  compile time). That defeats the whole point — the compiler can no longer
  see them, the cache key path no longer holds. Compile-time only.
