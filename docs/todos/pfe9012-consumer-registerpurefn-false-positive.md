# PFE9012 false positive: a consumer `registerPureFnFactory` breaks built-in pure-fn discovery

**Status:** todo (found 2026-07-08 while building the pre-publish e2e feature matrix)
**Severity:** correctness — halts a consumer build with a false-positive error
**Scope:** `ts-go-runtypes/internal/compiler/resolver/render.go`
(`validateProgramPureFnDeps`) + `ts-go-runtypes/internal/cachegen/purefunctions/`.
Go resolver only — no JS.

## Symptom

A consumer app that installs the **published** `@ts-runtypes/core` and both

1. calls its own `registerPureFnFactory('ns::fn', …)`, **and**
2. uses any feature that references a built-in pure fn (`createGetValidationErrors`,
   the unknown-key **errors** family, `createStandardSchema`, any `TF` format
   whose validator calls `rtFormats::…`, …)

fails the build with a wall of

```
PFE9012: Pure-fn `rt::newRunTypeErr` is referenced by a RT function but never
registered — call registerPureFnFactory('rt::newRunTypeErr', …) first.
PFE9012: Pure-fn `rtFormats::isUUID` … never registered …
```

The referenced built-ins (`rt::newRunTypeErr`, `rtFormats::isUUID`, …) are the
runtime's OWN pure fns, registered by `@ts-runtypes/core`'s side-effect import of
`src/runtypes/pure-fns-utils.ts`. **At runtime they ARE registered** (the package's
`.js` runs), so the generated `utl.getPureFn('rt::newRunTypeErr')` would work — the
diagnostic is a false positive that halts the build.

## Root cause

`validateProgramPureFnDeps` (render.go) validates every RT pure-fn dependency
against the whole-program registration set, but guards the check:

```go
entries, walkFiles, _ := sess.extractProgramPureFns(nil)
if len(entries) == 0 { return nil }   // <- the guard
```

The guard's intent (documented right above it) is: a consumer resolving
`@ts-runtypes/core` to its **`.d.ts`** (the normal published case — tsgo type-checks
against declarations, and the `registerPureFnFactory('rt::…')` calls live only in
the `.js`) has ZERO registrations in the program, so validating would false-positive
on the built-ins. When `entries == 0` it skips — correct for the common case.

But the guard checks *any* registration, not *the built-ins'* registration. A
consumer's own `registerPureFnFactory('ns::fn')` makes `entries == 1`, defeats the
guard, and the check then runs against a set that has the consumer's `ns::fn` but
**not** the built-in `rt::`/`rtFormats::` ones (their source isn't in a `.d.ts`-only
program) — so every built-in reference is flagged missing.

## Evidence (host reproduction)

Built the shared feature library through the real devtools Vite plugin +
`bin/ts-runtypes`, resolving `@ts-runtypes/core` to its built `dist/index.d.ts`
(what a published-package consumer's tsgo sees), `@ts-runtypes/core` externalized:

| Program | Result |
|---|---|
| `createGetValidationErrors<T>()` alone (no own pure fn) | builds — guard skips (entries == 0) |
| `createGetValidationErrors<T>()` **+ own `registerPureFnFactory`** | **PFE9012 halt** |
| full shared app **+ `registerPureFnFactory('e2e::slugify')`** | 42× PFE9012 halt |
| full shared app, own `registerPureFnFactory` **removed** | builds green (65/65 checks pass) |

The e2e feature matrix therefore **cannot** exercise `registerPureFnFactory`
(guide/`custom-pure-fn.ts`) against the published package until this is fixed; the
`overrides` family covers `overrideValidate` only, with a pointer to this file
(`container/pre-publish-e2e/apps/shared/src/overrides.ts`).

## Fix direction

Make the built-in `rt::*` / `rtFormats::*` pure fns count as registered
independent of whether their source is in the program (they are guaranteed present
at runtime whenever `@ts-runtypes/core` is imported). Options:

- **Seed the built-ins** into the index the validation runs against (a static set
  the resolver owns), so a reference to a built-in never misses; only genuinely
  user-namespaced deps are validated. Cleanest — keeps the check useful for real
  user typos while never false-positiving on the runtime's own fns.
- Or narrow the guard: validate a dep only when its OWN namespace has ≥1
  registration in the program (so `rt::`/`rtFormats::`, unregistered in a
  `.d.ts`-only consumer, are never checked, but a user `ns::` typo still fires).

Prefer the seed: it's faithful to runtime (built-ins are always loaded) and keeps
the diagnostic's value for user pure fns.

## Acceptance

- [ ] A consumer program with its own `registerPureFnFactory` + `createGetValidationErrors`
      (or any built-in-referencing feature) builds against the published package.
- [ ] A genuine user typo (`ns::typoFn` referenced but never registered) still fires PFE9012.
- [ ] Re-add the `custom-pure-fn` (`registerPureFnFactory`) coverage to
      `container/pre-publish-e2e/apps/shared/src/overrides.ts` and drop the note there.
- [ ] `git mv` this spec to `docs/done/`.
