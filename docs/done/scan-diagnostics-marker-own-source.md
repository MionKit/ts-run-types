# Scan diagnostics fire on the marker package's OWN source (root-cause fix)

**Status:** DONE (2026-07-15) — generalized to first-party diagnostic scoping.
**Severity:** correctness — halts a consumer build with false-positive errors.
**Scope:** `ts-go-runtypes/internal/compiler/resolver/scan.go` (+ removed the
surgical `marker.FileInModule`). Go resolver only — no JS runtime change.

## Symptom

When a consumer program pulls `@ts-runtypes/core`'s OWN TypeScript **source** into
its program (not the usual `dist/*.d.ts`), the resolver's whole-program scan walks
the library's own `src/` and emits **false-positive** literal-argument diagnostics
on the library's own generic definitions — halting the build:

```
[plugin @ts-runtypes/devtools] node_modules/@ts-runtypes/core/src/runtypes/pureFn.ts:
  error CTA001: `CompTimeArgs<T>` argument must be a literal at the call site ...
@ts-runtypes/devtools: 3 unsupported-type errors — build halted.
```

`pureFn.ts` defines `registerPureFnFactory(pureFnId: CompTimeArgs<PureFnId>, …)`;
the library's OWN internal calls into `CompTimeArgs`/`PureFunction`-branded helpers
are not consumer call sites, so the literal requirement must not apply to them.

## Root cause (confirmed empirically)

The open question in the original todo — *why do consumer deps resolve to `source`
at all?* — was answered by building the tsgo program each path uses and inspecting
what `@ts-runtypes/core` resolves to:

| Scenario | Resolves to | Scanned? |
|---|---|---|
| plain `moduleResolution: bundler` (the plugin's build path) | `dist/index.d.ts` | no — `.d.ts` skip already covers it |
| `customConditions: ["source"]` active | `src/index.ts` | **yes → the false positives** |
| `bundler`, `dist/` absent | unresolved (MKR007) | n/a |

`module.GetConditions` returns `["import","types"]` for bundler mode; `source` is
**not** among them and `conditionMatches("source")` is false even though `source`
is listed first in `exports`. So a normal consumer already lands on `dist/*.d.ts`.
The library's `src/` enters a *scanned* program **only when `source` is an active
resolution condition**, which happens in exactly two by-design situations:

- The **enrichment CLI** (`ts-runtypes gen`/`check`) sets `Conditions:["source"]`
  on purpose — it needs `src` to see the `TypeFormat` brands (documented in
  `program.go`). The e2e's `ensureEnrichment()` runs it.
- A **consumer who sets `customConditions: ["source"]`** (common in pnpm /
  source-first monorepos for HMR). Their RT plugin scan then walks core's `src`.

**So the `source` resolution is intentional, not a bug** — "fix the resolution" (the
old option 1) would break enrichment and override a deliberate consumer condition.
The fix belongs at the diagnostic-scoping layer, not the resolver.

## Resolution (what shipped) — first-party scoping (was option 2)

Scan diagnostics are consumer feedback ("you wrote this call wrong"), so they must
surface only for FIRST-PARTY files, never for a dependency's own source. The scan's
single aggregation point (`dispatchScanFiles`) now drops every diagnostic anchored
in a source file TypeScript resolved by **searching node_modules** —
`program.IsSourceFileFromExternalLibrary`, via the new
`Session.dropExternalLibraryDiagnostics`. Marker collection / sites are untouched;
only the diagnostic list is scoped.

Why provenance, not a `node_modules`-in-path check:
- Robust through **workspace symlinks** (first-party code physically under
  `node_modules`) — it reads how the file was actually reached, not its path.
- The marker package's OWN self-import (source condition, resolved via its `exports`,
  not a node_modules search) stays **first-party**, so the RT suite still lints the
  marker package's own source and real bugs in it are never hidden — strictly better
  than the shipped surgical fix, which matched by package name and would have
  silenced core's own test/src diagnostics too.
- General to **every dependency**, not just `@ts-runtypes/core` — any third-party lib
  source-resolved into the program is covered.

This replaced the surgical fix (per-diagnostic `!fileInMarker` guards on
`checkCompTimeArgs`/`checkPureFunction`) and removed the now-unused
`marker.FileInModule`. It also subsumes the class the PFE9012 built-in exemption
addressed.

## Regression coverage

- `ts-go-runtypes/internal/compiler/resolver/external_lib_diagnostics_test.go`:
  `TestScan_ExternalLibrarySourceDiagnosticsAreScopedOut` — a source-resolved
  external `@ts-runtypes/core` with an internal non-literal `CompTimeArgs` call
  produces NO CTA diagnostic, while the SAME mistake in a first-party file still
  fires. Asserts the external/first-party provenance split directly. (Verified to
  fail without the filter.)
- The marker-package suite already fires CTA001/CTA003 on its own test files
  (self-import via `source` = first-party), confirming no over-suppression.

## Acceptance

- [x] A source-resolved `@ts-runtypes/core` (or any dependency) no longer emits
      false-positive CTA/PFN on the library's own source.
- [x] The CTA/PFN corpus still fires for genuine consumer non-literal call sites
      (`resolver` suite + devtools plugin tests, `pnpm test` green).
- [x] No regression in the Go suite or `pnpm test`.
- [x] `git mv` this spec to `docs/done/`.
