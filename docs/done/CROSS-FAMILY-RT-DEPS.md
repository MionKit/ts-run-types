# Cross-family RT dependency capture

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `runtypes-devtools`, and `reflectRunTypeId(value)` is now `getRunTypeId(value)`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

> **Superseded (historical).** The readable-tag fnId scheme and the `MigratedFamilies` gate referenced below were later replaced by the opaque-`fnHash` scheme (the `internal/operations` registry + Go-emitted JSON composites; all families demand-driven, gated only on `len(dump.Sites) > 0`). See [CLAUDE.md](../CLAUDE.md) → "Two injection markers + demand-driven function caches" for the current model. The cross-family-edge capture mechanism this doc designed is still in force.

Status: **ready to implement** (delegated, focused unit).
Parent: `docs/DEMAND-DRIVEN-FN-CACHES.md` (Slice D prerequisite, item D0pre).

## Why

The JSON/binary union decoders discriminate members at runtime via
`val_<member>.fn(value)`, and `validationErrors` delegates child checks to `val_`. Today
those references are emitted only as **closure-prologue runtime lookups** —
`registerRTLookup("val_<member>")` (`internal/compiled/typefns/emitter.go:241`)
emits `const val_<member> = utl.getRT('val_<member>')` and relies on the `it`
family being all-emit. They are **not** tracked as build-time dependency edges,
so nothing triggers emission of `val_<member>`. That blocks demand-scoping `it`
(the final step of the parent plan): scoping `it` to only `createValidate` sites
drops the `val_<member>` entries unions need, silently corrupting round-trips
(verified: 22 union/binary failures).

Contrast with what already works:
- **same-family `rtDependencies`** — `walker.UpdateDependencies(childID)`
  (`walker.go:374`, `childID = InnerPrefix + rt.ID`) feeds the topo sort,
  dangling cascade, and the demand worklist in `module.go`.
- **`pureFnDependencies`** — `walker.AddPureFnDependency` is collected by the
  resolver and drives pureFns emission/validation.

This unit extends that dependency-driven model to **cross-family** edges.

## Goal (this unit)

Capture the cross-family `registerRTLookup` targets as a tracked list, distinct
from same-family `RTDependencies`, and thread it out of the renderer so a later
step (parent plan Slice D) can follow those edges to compute the `it` demand.
**Additive only** — must NOT change which entries any family emits today; all
existing tests stay green.

## Scope — `internal/compiled/typefns/` only

Do NOT touch the resolver, dispatch, scanning, or `MigratedFamilies`. Do NOT
change emission/demand behaviour. This is pure capture + plumbing + tests.

### Required changes

1. **Walker captures cross-family edges.** Add `CrossFamilyDeps []string` to
   `Walker` (`walker.go`), initialised in `NewWalker`, with a dedup'd recorder
   (mirror `UpdateDependencies`' dedup). A "cross-family" lookup is a
   `registerRTLookup(childID)` whose family-tag prefix differs from the walker's
   own family (i.e. `childID` does NOT start with `w.InnerPrefix`). Same-family
   lookups (already tracked via `RTDependencies`) must NOT be added here.

2. **`registerRTLookup` records cross-family edges.**
   `emitter.go` `registerRTLookup(childID)` (and only there — it's the single
   choke point both `emitDepCall` and `unionMemberValidateCheck`/validationErrors funnel
   through) should, in addition to setting the context item, record `childID` on
   the walker's `CrossFamilyDeps` when it is cross-family. Note `emitDepCall`'s
   same-family calls go through here too, so the prefix check is what filters.
   (`childID` for cross-family is already the plain default form, e.g.
   `val_<member>` — no variant suffix — which is exactly the default variant we
   want.)

3. **Thread it out of the renderer.** `renderEntryWithDeps` in `module.go`
   currently returns `(line string, deps []string)`. Surface the walker's
   `CrossFamilyDeps` to callers — either add a return value or stash on the
   `compiled` struct / a small result type. Keep `renderEntryWithDeps`'s
   existing two return semantics working for current callers (adjust call sites).

4. **No behaviour change.** The captured list is recorded and threaded but not
   yet consumed by any emission decision. `RenderFnModule`'s output bytes must be
   identical to before for every family.

### Tests (`internal/compiled/typefns/`)

- Render a discriminated union (objectLiteral members with a literal
  discriminator prop) via `PrepareForJsonEmitter` (and `ToBinaryEmitter`); assert
  the captured `CrossFamilyDeps` contain `val_<memberID>` for each union member,
  and that those are NOT also in `RTDependencies` (cross-family stays separate).
- Render a plain object via `ValidateEmitter`; assert its same-family child deps
  still land in `RTDependencies` and `CrossFamilyDeps` is empty (no regression to
  the same-family path).
- A guard that an existing module render (e.g. `TestValidateModule_*`) is
  byte-identical — i.e. capture is side-effect-free on output.

## Constraints / done criteria

- `go test ./internal/...` green; `pnpm test` green; `gofmt`/`pnpm run lint`
  clean. (The Go binary must be rebuilt before `pnpm test` — plugin tests spawn
  it: `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`.)
- Additive: zero change to emitted cache bytes for any family.
- Commit to branch `claude/dreamy-cori-cT1be` with a clear message; do NOT open
  a PR. Leave a short summary of the new API (how to read the cross-family deps)
  for the parent task to consume in Slice D.
