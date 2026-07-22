# ESLint/inline-server resolver ignores tsconfig `customConditions` (and `paths`)

**Status:** todo
**Created:** 2026-07-22

The ESLint lint surface resolves marker types with a program that never applies the project
tsconfig's `customConditions` / `paths`, so a consumer that resolves workspace packages from
source behind a `source` export condition (the usual monorepo dev setup) has every marker over
a cross-package type collapse to `any` — emitting false-positive `MKR007` (`invalid-marker`)
and `VE020`/`VL021` (`validate-skipped-member`) at lint time only. The build/vite path resolves
the same types correctly.

## Evidence

- The lint plugin (`packages/ts-runtypes-devtools/src/eslint/…`) spawns the resolver in
  **inline-server mode**: `lint-worker.ts` calls `buildResolverArgs(process.cwd(), '', {
  serverMode: true, singleThreaded: true })`, which emits `--inline-server` and passes **no**
  `--tsconfig`.
- `cmd/ts-runtypes/main.go`: `hasTsconfig := !inlineServer && !inlineSourcesStdin` — the comment
  states *"inline / server modes carry no tsconfig, so they run on flags + defaults."*
- `internal/compiler/resolver/dispatch.go` (`setSources` handler) builds the per-request program
  via `program.NewInferred(program.Options{Cwd, SingleThreaded, Overlay}, fileNames)` — **without
  `Conditions`**.
- `internal/compiler/program/program.go` → `NewInferred` constructs a **hardcoded**
  `core.CompilerOptions{…}` and only threads `CustomConditions: opts.Conditions`. With no
  `Conditions` passed, `customConditions` is nil and `paths` is absent — so tsgo activates only
  the default export conditions (`types` / `import` / …), never `source`.
- Contrast: `program.New` (the build / vite path, invoked with a tsconfig) parses the config via
  `GetParsedCommandLineOfConfigFile`, so `customConditions` (including one inherited through
  `extends`) and `paths` are honored. This is why the same types resolve on the build/test path.
- The enrichment CLI already relies on this by passing `Conditions: ["source"]` into
  `NewInferred`; the inline-server/ESLint session simply never sets it.

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

## Fix plan

- In inline-server / `setSources`, discover the project tsconfig at `--cwd` (or accept an explicit
  `--tsconfig` in server mode) and thread its **resolution-affecting** options into
  `program.NewInferred`: at minimum `customConditions` and `paths` (plus `baseUrl`,
  `moduleResolution`), following `extends` (mion declares `customConditions` in the ROOT tsconfig;
  leaves inherit it). Keep the inferred file set (`setSources` overlay) — only the compiler
  *options* need to come from the config, not the file glob.
  - Minimal interim: parse the tsconfig once per session and pass its `CustomConditions` (+ `Paths`)
    down to every `NewInferred` call, extending `program.Options` as needed.
- Add a resolver test on the **inline-server / setSources** path: a file importing a package whose
  only resolvable entry sits behind a `source` export condition, with `customConditions:["source"]`
  in the tsconfig, must resolve the marker to the real type (no `MKR007`). Extend the existing
  `internal/compiler/resolver/external_lib_diagnostics_test.go` / `pkgjson_fs_test.go` pattern to
  cover it.
- After release, a consumer bump re-enables the marker rules (see mion todo above).

Until this ships, source-resolved monorepos cannot adopt the `@ts-runtypes/devtools/eslint`
marker rules at error severity.
