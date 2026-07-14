# Scan diagnostics fire on the marker package's OWN source (root-cause fix)

**Status:** todo — a SURGICAL fix shipped (see below); this doc tracks the cleaner
root-cause fix for a separate PR.

## Symptom

When a consumer program pulls `@ts-runtypes/core`'s OWN TypeScript **source** into
its program (not the usual `dist/*.d.ts`), the resolver's whole-program scan walks
the library's own `src/` and emits **false-positive** literal-argument diagnostics
on the library's own generic definitions — halting the build.

Reproduced by the pre-publish e2e (`container/pre-publish-e2e/build-all.mjs`): the
bundler apps install the packed `@ts-runtypes/core` (which ships `src/`) and the RT
plugin's scan reports:

```
[plugin @ts-runtypes/devtools] node_modules/@ts-runtypes/core/src/runtypes/pureFn.ts:
  error CTA001: `CompTimeArgs<T>` argument must be a literal at the call site ...
@ts-runtypes/devtools: 3 unsupported-type errors — build halted.
```

`pureFn.ts` defines `registerPureFnFactory(pureFnId: CompTimeArgs<PureFnId>, …)`;
the library's OWN internal calls into `CompTimeArgs`/`PureFunction`-branded helpers
are not consumer call sites, so the literal requirement must not apply to them.

Never caught before because the e2e matrix never actually ran (it was blocked first
by the GHCR image-pull `denied`, then by the verdaccio "cannot publish over 0.9.1"
conflict — both fixed on the `fix/release-pipeline-first-run` branch).

## Root cause + the code path

- `scanAllProgramFiles` (`ts-go-runtypes/internal/compiler/resolver/scan.go`) scans
  **every** program `.ts` file and only skips declaration files
  (`if sf.IsDeclarationFile { continue }`). So when core resolves to `.ts` source it
  is scanned like consumer code.
- `analyzeCall` → the `KindCompTimeArgs`/`KindPureFunction` branches → `checkCompTimeArgs`
  / `checkPureFunction` emit CTA001 / PFN001.
- The bundler-side already handles this (`build-all.mjs`: `@ts-runtypes/core` is
  EXTERNAL — "bundling the marker package would make the plugin choke on files not
  in its program"), but that governs **bundling**, not the tsgo **scan**.
- The sibling diagnostic **PFE9012** already solved this class for pure-fn dep
  validation via a built-in / marker-owned exemption
  (`validateProgramPureFnDeps`, `render.go`; `docs/done/pfe9012-consumer-registerpurefn-false-positive.md`),
  but its design assumed core is seen as a `.d.ts` — the `source` condition breaks
  that assumption.

## The surgical fix that shipped (this branch)

`marker.FileInModule(filePath, module, fs)` (new, `marker/marker.go`) + a guard in
`analyzeCall` (`scan.go`) that suppresses just CTA001 / PFN001 when the call's file
belongs to the marker package. Minimal blast radius (marker collection + all other
diagnostics unchanged); does NOT skip whole files (so it can't drop diagnostics on
the marker package's own TEST files, which share its package name).

## The better fix (this PR)

Pick one, in rough order of preference:

1. **Confirm + fix WHY consumer deps resolve to `source` at all.** The Explore pass
   could NOT confirm this from committed code: the plugin build path sets no
   `customConditions:["source"]` (only the enrichment CLI + the workspace's own
   `tsconfig.test.json` do), and `@ts-runtypes/core`'s tarball ships `dist/` too — so
   a normal `moduleResolution: bundler` consumer SHOULD land on `dist/*.d.ts` (which
   the existing `.d.ts` scan-skip already covers, making the whole problem vanish).
   Find what actually enables `source` for the failing run (resolver default? a
   not-fully-traced path? the `"source"` condition being first in `exports`?). If a
   dep resolving to its own `src` is unintended, fixing the resolution is the
   cleanest fix and needs no diagnostic special-casing.
2. **Scope whole-program scan diagnostics to first-party files.** The plugin already
   tracks its transform targets (`siteFiles`, `unplugin.ts`); surfacing scan
   diagnostics only for those (never for `node_modules` / non-transformed deps) is
   the general form of the surgical fix and covers every dependency, not just the
   marker package. Careful with monorepo/workspace symlinks (first-party code under
   `node_modules`) — prefer "is a transform target" over "path contains node_modules".
3. **Skip the marker package's own source at `scanAllProgramFiles`** (next to the
   `.d.ts` skip) rather than per-diagnostic — but verify it does not skip the marker
   package's own test files (same package name) if any go through this scan path.

## Acceptance

- The e2e matrix builds all six bundler apps against a packed `@ts-runtypes/core`
  (which ships `src/`) with no false-positive CTA001/PFN001 from the library's own
  source.
- The CTA001/PFN001 corpus (`resolver/atomic_test.go`, the devtools plugin tests)
  still fires for genuine consumer non-literal call sites.
- No regression in the Go suite or `pnpm test`.
