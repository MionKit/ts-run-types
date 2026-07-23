# ESLint/inline-server resolver ignores tsconfig `customConditions` (and `paths`)

**Status:** SHIPPED — the lint plugin now passes the project tsconfig (`--tsconfig` in server mode,
default `tsconfig.json`, overridable via `settings.runtypes.tsconfig`); the binary parses it and
threads `customConditions` / `paths` / `baseUrl` into every inferred Program.
**Type:** fix · **Spec:** full-plan
**Created:** 2026-07-22

The ESLint lint surface resolves marker types with a program that never applies the project
tsconfig's `customConditions` / `paths`, so a consumer that resolves workspace packages from
source behind a `source` export condition (the usual monorepo dev setup) has every marker over
a cross-package type collapse to `any` — emitting false-positive `MKR007` (`invalid-marker`)
and `VE020`/`VL021` (`validate-skipped-member`) at lint time only. The build/vite path resolves
the same types correctly.

## Evidence

- The lint plugin (`packages/ts-runtypes-devtools/src/eslint/…`) spawns the resolver in
  **inline-server mode**: `lint-worker.ts` called `buildResolverArgs(process.cwd(), '', {
  serverMode: true, singleThreaded: true })`, which emitted `--inline-server` and passed **no**
  `--tsconfig` (the arg-builder deliberately suppressed it in server mode).
- `cmd/ts-runtypes/main.go`: `hasTsconfig := !inlineServer && !inlineSourcesStdin` — inline /
  server modes carried no tsconfig, running on flags + defaults.
- `internal/compiler/resolver/dispatch.go` (`setSources` handler) built the per-request program
  via `program.NewInferred(program.Options{Cwd, SingleThreaded, Overlay}, fileNames)` — **without
  `Conditions`**.
- `internal/compiler/program/program.go` → `NewInferred` constructs a **hardcoded**
  `core.CompilerOptions{…}` and only threaded `CustomConditions: opts.Conditions`. With no
  `Conditions` passed, `customConditions` is nil and `paths` is absent — so tsgo activated only
  the default export conditions (`types` / `import` / …), never `source`.
- Contrast: `program.New` (the build / vite path, invoked with a tsconfig) parses the config via
  `GetParsedCommandLineOfConfigFile`, so `customConditions` (including one inherited through
  `extends`) and `paths` are honored. This is why the same types resolve on the build/test path.

### Downstream repro (mion)

mion's monorepo sets `customConditions: ["source"]` in its root tsconfig so `@mionjs/*` resolves
to each package's `src`/`index.ts` (no per-package build in dev/CI). After adopting
`@ts-runtypes/devtools/eslint`, a cold `pnpm run lint` (no build, no Nx cache, no
`node_modules/.cache/ts-runtypes`) produced **59 MKR007 errors** in two router spec files that
do `createValidate<HeadersSubset<…>>()` / `createValidate<ClientReturn>()` over `@mionjs/core`
types — all `unresolved import ('@mionjs/core')`. Building `@mionjs/core`'s dist (so the `types`
condition resolves) or warming the caches masks it; cold CI fails. The same specs pass 25/25
under vitest (build path honors `customConditions`). mion has disabled the two rules meanwhile
(its `docs/todos/reenable-runtypes-marker-lint-rules.md`).

Related prior art: `docs/done/project-references-unbuilt-outputs-silent-zero-sites.md` — another
inline-resolution gap surfaced by the same migration.

## Shipped

**Design decision (owner):** the resolver does NOT auto-discover a tsconfig. The consumer names
it, exactly like the build/vite path (`--tsconfig`, default `tsconfig.json`). This mirrors the
bundler plugins, is unambiguous (an ancestor walk finds *a* tsconfig, not necessarily the right
one), and matches `option-parity-tsconfig-plugin.md`'s classification of `tsconfig` as a
bootstrap option. Scope is resolution-only; full `compilerOptions` fidelity (lib-sensitive codes
like TMP001) stays a ROADMAP follow-up.

- **JS — the plugin passes the tsconfig.** `settings.runtypes.tsconfig` (default `tsconfig.json`,
  resolved against cwd), plumbed `index.ts` → `session-protocol.ts`/`session.ts` → `lint-worker.ts`
  (both server-mode spawn routes forward it). `resolver-client.ts` `buildResolverArgs` now emits
  `--tsconfig` whenever a path is set (the old `!serverMode` suppression — the exact decision that
  caused the bug — is gone).
- **Go — the binary parses it and merges the resolution options.**
  `program.ParseInferredResolution(cwd, tsconfigPath)` (new
  [`inferred_resolution.go`](../../ts-go-runtypes/internal/compiler/program/inferred_resolution.go))
  resolves the path relative to cwd and parses it via `GetParsedCommandLineOfConfigFile` (follows
  `extends`), **best-effort** (nil on empty/missing/malformed — the server must keep working with
  no tsconfig). It returns an **opaque `InferredResolution` handle**: `core.CompilerOptions.Paths`
  is typed `*collections.OrderedMap`, whose package is in typescript-go's `internal/` tree with no
  shim and cannot be named from our module, and `core.CompilerOptions` embeds `_ noCopy`, so
  `NewInferred` (same package) copies the resolution fields **by assignment** — `Paths`, `BaseUrl`,
  **`PathsBasePath`** (required: paths resolve relative to the tsconfig dir, which can differ from
  cwd), and `CustomConditions` — onto its hardcoded inferred options. Every other hardcoded flag
  (Module/Target/Strict*/ModuleResolution:Bundler) stays.
- **Wiring.** `resolver.Options.TsconfigPath` (fed from `main.go`'s `--tsconfig` in the
  `inlineServer` branch); `Session` caches the parse once per session; `dispatchSetSources` threads
  `ResolutionBase`. The `--inline-sources-stdin` sibling one-shot path got the same treatment
  (identical latent bug).

### Tests

- Go: [`internal/compiler/resolver/inline_server_tsconfig_test.go`](../../ts-go-runtypes/internal/compiler/resolver/inline_server_tsconfig_test.go)
  drives the real `NewServer → OpSetSources → dispatchSetSources → ParseInferredResolution` path
  over a `source`-conditioned cross-package dep with an unbuilt dist (the mion shape): with
  `customConditions:["source"]` → 0 MKR007, every site resolves to `ObjectLiteral`, both
  `getRunTypeId` shapes share one reflection id (marker coverage rule); without it → the type does
  NOT resolve and the server does not crash (best-effort).
- JS e2e: [`packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts`](../../packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts)
  runs the real rules through `bin/ts-runtypes` over an on-disk monorepo: the source-condition type
  resolves (no `invalid-marker`), a `buildResolverArgs` guard check, and a control proving
  `settings.runtypes.tsconfig` is honored (a config without `customConditions` still flags MKR007).
  `plugin.test.ts` transparency test updated for the new `tsconfig` knob.

### Docs

- `docs/ARCHITECTURE.md` (lint-surface Limitations) and `docs/ROADMAP.md` (lint follow-ups) updated:
  resolution fidelity shipped; lib-sensitivity (TMP001) remains open.
- Website `container/website/content/2.guide/9.linting.md` gained a "Your tsconfig" section.

After release, a consumer bump re-enables the marker rules (mion's
`docs/todos/reenable-runtypes-marker-lint-rules.md`).
