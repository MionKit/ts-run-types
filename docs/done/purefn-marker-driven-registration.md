# Anonymous content-hashed pure-fn registration (`registerAnonymousPureFn` + `InjectPureFnHash`) + a runtime-key lookup

**Status:** done
**Created:** 2026-07-16
**Shipped:** 2026-07-16

## What shipped

All three additive pieces landed, exactly as designed below; nothing about the
named lane / `usePureFn` / the literal lookups changed.

- **`InjectPureFnHash<F>` marker** — [`packages/ts-runtypes/src/markers.ts`](../../packages/ts-runtypes/src/markers.ts)
  (`string & {__rtInjectPureFnHashBrand?: F}`, mirroring `InjectRunTypeId`), recognized Go-side as a
  new `marker.KindInjectPureFnHash` spec ([`marker.go`](../../ts-go-runtypes/internal/compiler/marker/marker.go)).
- **`registerAnonymousPureFn<F>(fn, hash?)`** — [`pureFn.ts`](../../packages/ts-runtypes/src/runtypes/pureFn.ts).
  The extractor recognizes the call by brand (`PureFunction<F>` factory + `InjectPureFnHash<F>` trailing
  slot, `purefunctions.isAnonymousPureFnCall`), reuses the named lane's purity gate + body extraction
  keyed `rt::<CodeHash(body)>`, rewrites the factory to its entry-module tuple, and splices
  `"rt::<hash>"` as a point-insertion `Replacement` at the closing paren (`Entry.HashInjectText`). The
  resolver's marker walk carries NO injection case for the kind (it is a `Replacement`, not a `Site`),
  so the only resolver-side effect is the factory's normal `PureFunction` purity check.
- **Runtime-key accessor** — `getRTUtils().getPureFnByKey(key: string)` / `hasPureFnByKey(key: string)`
  ([`rtUtils.ts`](../../packages/ts-runtypes/src/runtypes/rtUtils.ts)). Plain-`string` params, so they are
  naturally exempt from `extractDeps`' `CompTimeArgs`-branded dep tracking — no scanner change was needed
  for the exemption.

Two transport fixes were required for the wrappable lane to reach real builds (a pure fn is a
`Replacement`, never a `Site`, so it never lands in the Site-derived transform gate):

- `OpGenerate`'s `SiteFiles` now folds in `sess.pureFnReplacementFiles` (every file carrying an extracted
  pure-fn registration, named or anonymous, wrapper call sites included), and the plugin's textual
  fallback lists `registerAnonymousPureFn` alongside `registerPureFnFactory` — so a consumer calling a
  library wrapper is transformed with zero configuration.
- Per-file rewrites draw from `purefunctions.RawEntries` (every call site, not the cross-file-deduped
  set), so a same-file duplicate body's second call is rewritten too; the injected id would otherwise be
  lost on the un-rewritten site (the named lane tolerated that via its literal id; the anonymous lane
  cannot). The emitted MODULE still dedups by key.

Tests: Go — `purefunctions/anonymous_test.go`, `resolver/anonymous_purefn_test.go`; JS —
`ts-runtypes-devtools/test/pure-fns-anonymous.test.ts`, `ts-runtypes/test/features/anonymousPureFn.test.ts`.
Docs — [ARCHITECTURE.md → third marker](../ARCHITECTURE.md) + the `siteFiles` note, and the website
[pure functions](../../container/website/content/2.guide/8.pure-functions.md) /
[compiler markers](../../container/website/content/2.guide/6.compiler-markers.md) guides.

## Follow-up shipped: symmetric factory/direct forms (two markers, four registrars)

The first cut left an inconsistency: `registerPureFnFactory` / `registerAnonymousPureFn` had one
declare a factory and the other a plain function, so a single-callback framework API like
`serverMapFrom(t => t.id)` was forced to write a factory it did not need. The fix generalizes the
surface to **two lanes × two forms** with a second form marker carrying the intent:

- **`PureFunctionFactory<F>` marker** — [`markers.ts`](../../packages/ts-runtypes/src/markers.ts)
  (`F & {__rtPureFunctionFactoryBrand?: never}`), recognized Go-side as `marker.KindPureFunctionFactory`
  ([`marker.go`](../../ts-go-runtypes/internal/compiler/marker/marker.go)). The existing `PureFunction<F>`
  now explicitly means the **direct** form (the argument IS the pure fn; the compiler wraps it into
  `() => fn`, rendering the extracted code as `return <fn>;` like the override lane); `PureFunctionFactory<F>`
  means the **factory** form (the argument IS the factory, emitted as-is). `purefunctions.pureFnFormMarker`
  reads which one the pure-fn parameter carries and returns the `wrap` bit that steers extraction, so the
  form propagates through a wrapper.
- **Four registrars** — [`pureFn.ts`](../../packages/ts-runtypes/src/runtypes/pureFn.ts): named-direct
  `registerPureFn(id, fn)` (NEW), named-factory `registerPureFnFactory(id, factory)` (marker made honest —
  now `PureFunctionFactory<F>`), anonymous-direct `registerAnonymousPureFn(fn, hash?)` (its marker flipped
  from factory to `PureFunction<F>`), and anonymous-factory `registerAnonymousPureFnFactory(factory, hash?)`
  (NEW). All four share one `registerCore` + `asFactory(fn, wrap)` runtime path; `wrap` only matters on the
  no-plugin fallback (the plugin rewrites every form to the same entry-module tuple).
- **Extraction dispatch** — `walker.go` (`isNamedPureFnCall`) and `anonymous.go` (`isAnonymousPureFnCall`)
  each return `(matched, wrap)`; `pureFnCode(sf, fn, wrap)` renders `return <fn>;` (direct) or the stripped
  factory body (factory), and `buildPureFnEntry(…, wrap)` skips param + `utl`-dep extraction for the direct
  form. Content-addressing is unchanged: the two forms hash different code, so a direct fn and a
  setup-bearing factory never alias, while a direct fn and a trivial `() => fn` factory correctly do.

Both content markers stay checked in the plugin's textual fallback via the substrings `registerPureFn`
(covers both named registrars) + `registerAnonymousPureFn` (covers both anonymous), in
[`unplugin.ts`](../../packages/ts-runtypes-devtools/src/unplugin.ts) and
[`eslint/prefilter.ts`](../../packages/ts-runtypes-devtools/src/eslint/prefilter.ts).

Tests extended: the Go `anonymous_test.go` covers direct + factory forms + `FormsDedupByContent`; the JS
`anonymousPureFn.test.ts` runs a direct fn, a factory with one-time setup, and named-direct
`registerPureFn`; the third-party suites register through a wrapper in direct form. Example files:
`guide/custom-pure-fn-direct.ts` + `guide/anonymous-pure-fn-factory.ts` (new), the anonymous ones migrated
to direct form.

## Consumer follow-up (mion) — still open

The mion adapter changes below are a SEPARATE change in the mion repo, tracked there; the ts-runtypes
primitive + marker + accessor this spec describes are what shipped here.

## Problem

`registerPureFnFactory(pureFnId: CompTimeArgs<PureFnId>, createPureFn: PureFunction<…>)` takes the
pure-fn IDENTITY as a comptime-literal STRING ARGUMENT. That is correct for a DEVELOPER-NAMED pure
fn (you write the literal directly), but it means the primitive cannot be WRAPPED: a library that
composes the id (e.g. namespaces a user-supplied name) produces a computed key → **CTA003**, and
forwarding the factory through the wrapper → **PFN001**. There is no lane for registering a pure fn
whose identity is DERIVED (content-hashed) and INJECTED, the way every other ts-runtypes primitive
injects.

Consequence (real, shipped): mion's `@mionjs/run-types` adapter wraps the API
(`registerMionPureFn`, key `mionjs::<name>`), so EVERY consumer that transitively imports the
adapter trips the scanner. mion had to default the plugin's `failOnError` to `false` monorepo-wide,
losing the strict-build safety net. See mion `docs/todos/failonerror-adapter-pure-fn-scanning.md`.

The runtime LOOKUPS have the same surface for a different reason: `getPureFn` / `getCompiledPureFn`
/ `hasPureFn` are typed `CompTimeArgs<string>`, but a framework that dispatches on a pure-fn id
received over the WIRE must use a runtime key — mion `serverMapFrom` →
`getMionPureFn(mapping.bodyHash)` (router `routesFlow.ts`), where `mapping.bodyHash` arrives in the
request. Inherently non-literal, so the scanner flags it.

## Design — the pure-fn surface becomes consistently two-laned

The two identity models are DIFFERENT operations (different contract, different tracking, different
reference model), so they get DIFFERENT functions — and the same named/dynamic split already
applies on the lookup side. Mental model:

> Named things are build-tracked and referenced by name. Hashed things are content-addressed and
> referenced by value.

### 1. Named lane — UNCHANGED, no breaking change

`registerPureFnFactory(pureFnId: CompTimeArgs<PureFnId>, createPureFn: PureFunction<…>)` stays
EXACTLY as-is. The developer supplies a literal `"<namespace>::<name>"`; other code references it by
name via `usePureFn("<namespace>::<name>")` (inside RT-fn bodies / other pure fns); it stays
build-TRACKED (PFE9012 "referenced but never registered" + pure-fn→pure-fn dependency edges). This
lane is meant for direct developer use with literals, so it does NOT need to be wrappable.

### 2. Anonymous lane — NEW, marker-driven (this is the additive piece)

Add a second function whose identity rides an INJECTED marker in the callee signature — mirroring
`InjectRunTypeId<T>` / `InjectTypeFnArgs<T, Fn>`, so injection propagates through wrappers (the same
reason `createValidateFn<T>` is wrappable):

```ts
registerAnonymousPureFn<F>(
    fn: PureFunction<F>,          // existing factory marker: purity checks (PFExxx) + body → cache
    hash?: InjectPureFnHash<F>,   // NEW marker: plugin injects "rt::<fnHash>"
): CompiledPureFunction
```

`InjectPureFnHash<F>` is a pure INJECTION marker (no literal double-duty — the named literal is the
other function's job). Absent at author time; the plugin fills it with a content hash
`"rt::<fnHash>"`. The hash is over the normalized function BODY (reuse the existing `bodyHash`), NOT
the `<F>` TYPE (same-signature/different-body would collide) — the plugin resolves the `fn` VALUE to
hash it; `<F>` is only the type link.

Because the marker lives in the callee signature, a library wrapper injects at ITS OWN call sites,
so mion (and any library) can offer an ergonomic register API with ZERO diagnostics:

```ts
// mion, after — thin wrapper over the anonymous lane:
function registerMionPureFn<F>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
    if (!hash) throw new Error('ts-runtypes plugin did not run');   // standard marker-not-injected guard
    return {hash, fn};
}
```

The `fn` argument's `PureFunction` marker does the purity validation + body extraction as a build
side-effect; the plugin injects `hash` at each `registerMionPureFn(…)` call site. Content-addressing
also FINISHES the model mion already half-has: `serverMapFrom` already dispatches on a wire
`bodyHash`, and now client and server can carry the SAME shared mapper fn and inject the SAME
`rt::<hash>` — no stringly-typed name to typo or drift.

### 3. Companion — a runtime-key lookup accessor (the half that actually unlocks strict builds)

Registration composability ALONE does not let a framework flip `failOnError: true`: dispatch on a
WIRE-provided id is inherently non-literal. Add a plain-`string` runtime lookup, kept DISTINCT from
the build-tracked literal form so no one silently loses demand-checking:

- KEEP `usePureFn(key: CompTimeArgs<string>)` (+ the literal `getPureFn` / `getCompiledPureFn` /
  `hasPureFn` forms) build-tracked — they drive PFE9012 + dependency edges when an RT-fn body
  references another pure fn.
- ADD an explicit untracked runtime accessor, e.g. `getRTUtils().getPureFnByKey(key: string)` /
  `hasPureFnByKey(key: string)`, documented as "not build-tracked; for framework dispatch on a
  runtime id."

Two named doors, not one relaxed door. (This supersedes the mion todo's "option 2 = exempt the
lookups from comptime enforcement", which is UNSAFE: relaxing the existing lookups would drop
PFE9012 + dep-edge tracking for every consumer.)

## Why additive is the win

Nothing existing changes: `registerPureFnFactory`, `usePureFn`, and the literal lookups keep their
signatures and their build-tracking, so every current caller / example / test is untouched. The
whole change is NEW surface — `registerAnonymousPureFn`, the `InjectPureFnHash` marker, and the
runtime-key accessor. Lower risk than reshaping the existing primitive, and the named lane that
pure-fn→pure-fn already relies on is never at risk.

## Go / scanner work

- New `InjectPureFnHash` marker recognized in the resolver (analogous to `InjectTypeFnArgs`) and a
  new `registerAnonymousPureFn` call-shape: inject `"rt::<bodyHash>"` and run the existing
  `PureFunction` factory-marker extraction (purity + body → cache) for the `fn` argument.
- `registerPureFnFactory` / `usePureFn` / the literal lookups: NO scanner change.
- The runtime-key accessor is a JS type-only addition + a scanner exemption for that specific
  accessor (it is not an injection site).
- Bump protocol / `diskcache.FormatVersion` only if the emitted id format or on-wire key shape
  actually changes.

## Marker test coverage

Per the repo's marker-test discipline (cover both `getRunTypeId` call shapes), cover:

- the anonymous lane via a DIRECT call AND THROUGH A LIBRARY WRAPPER (a fixture that forwards the
  markers), asserting the wrapper's call sites inject the same `rt::<hash>` as a direct call;
- equal bodies → equal `rt::<hash>` (content-addressed dedup); different bodies, same signature →
  different hash (no collision);
- the untouched named lane still fires PFE9012 when a `usePureFn("ns::name")` target is unregistered.

## Consumer follow-up (mion)

- `registerMionPureFn` becomes the thin wrapper above over the anonymous lane; drop `mionPureFnId`'s
  computed key.
- router `serverMapFrom` dispatch (`routesFlow.ts` `getMionPureFn` / `hasMionPureFn`) uses the new
  runtime-key lookup accessor.
- `mionVitePlugin` re-defaults `failOnError: true`; the adapter no longer trips the scanner.
- Re-point / close mion `docs/todos/failonerror-adapter-pure-fn-scanning.md` at this spec.

## Acceptance

- A library can define its own `registerXPureFn` wrapper over the anonymous lane with ZERO scanner
  diagnostics (no CTA003 / PFN001), verified by a wrapper fixture.
- The named lane is unchanged; pure-fn→pure-fn by name stays build-tracked (PFE9012 fires on a
  missing target).
- A framework can dispatch on a wire-provided pure-fn id via the runtime accessor without tripping
  the scanner.
- mion can default `failOnError: true` again with its adapter clean; full Go + JS suites green.
