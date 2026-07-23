---
type: fix
spec: guidelines
status: ready
created: 2026-07-23
---

# Align the whole app with the project tsconfig (behave like tsc)

## Intent

RunTypes builds a TypeScript program to read user types in two ways:

- **`program.New`** — parses the FULL project tsconfig
  (`GetParsedCommandLineOfConfigFile`), so it behaves like tsc. Used by the
  build/vite INITIAL scan and `--compile`.
- **`program.NewInferred`** — a fixed, hardcoded `core.CompilerOptions` set that
  (as of `docs/done/eslint-inline-server-honor-customconditions.md`) merges only
  the tsconfig's RESOLUTION options (`customConditions` / `paths` / `baseUrl`).
  Everything else in the tsconfig — chiefly `lib` — is ignored.

The reduced-config `NewInferred` path is **NOT lint-only**. It backs every feature
routed through `setSources` / inline construction, and the app hits it at runtime:

- **Lint** (inline-server) — `setSources` → `dispatchSetSources` → `NewInferred`.
- **Vite dev / HMR** — `unplugin.ts` `handleHotUpdate` (and the edits-mode
  source-drift re-sync) push the changed buffer via `setSources`, which swaps the
  resolver's program to a `NewInferred` one. So after an edit the vite RUNTIME runs
  on the reduced config too, not just the editor.
- **Inline-sources one-shot**, **enrichment CLI**, **gen-builtin-purefns** — all
  use `NewInferred` directly (the enrichment / builtin ones pass no project
  tsconfig at all).

So the tsconfig divergence (e.g. `lib` → `Temporal` resolving to `any` → TMP001 /
accept-anything validators) may surface as more than editor noise: it can affect
generated dev output on the vite/HMR path. The goal is a **general alignment**:
read as much of the tsconfig as we safely can in `NewInferred`, so RunTypes behaves
like tsc across every entry point, not just lint.

## Direction

Investigation FIRST, then implement what it finds.

- **Step 0 — map the surface (whole app, not just lint).** Inventory every
  program-construction site and the feature it serves:
  - Reduced (`NewInferred`): `dispatch.go` `dispatchSetSources` (lint + vite HMR
    share this), `main.go` inline-sources branch, `enrich_cli.go` (×2),
    `cmd/gen-builtin-purefns/main.go`.
  - Full (`program.New`): `main.go` default branch (build/vite initial),
    `batchcompile/compile.go` (×2, `--compile`).
  - The `setSources` callers on the JS side: `eslint/lint-worker.ts`,
    `unplugin.ts` `handleHotUpdate` (~:507/:516) and the transform-drift re-sync
    (~:362).
  - Then answer, per feature on the reduced path: does the missing config actually
    cause user-visible divergence, and of what kind — wrong diagnostics (lint)
    AND/OR wrong generated output (vite runtime)? Note entry modules are
    content-addressed + immutable and only the runtype bundle is HMR-invalidated
    (CLAUDE.md → Rewrite mechanics), so the vite blast radius may be limited to
    NEWLY-introduced types after an edit. Confirm it, don't assume.
- **Step 1 — the per-option adopt-vs-keep audit.** Diff what `program.New` (full
  parsed config) applies vs what `NewInferred` applies today, and for each option
  decide **adopt-from-tsconfig vs keep-fixed** with a reason. Candidates
  (non-exhaustive — look for more): `lib`, `target`, the `strict` sub-family
  (`noImplicitAny`, `strictPropertyInitialization`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, …), `jsx`, `experimentalDecorators` /
  `emitDecoratorMetadata`, `useDefineForClassFields`, `types` / `typeRoots`, plus
  any non-`compilerOptions` tsconfig input that matters. Highest-value adopt: `lib`.
- **The parsed config is already in hand.** `program.ParseInferredResolution`
  ([inferred_resolution.go](../../ts-go-runtypes/internal/compiler/program/inferred_resolution.go))
  returns the WHOLE parsed `*core.CompilerOptions` behind the `InferredResolution`
  handle (only four fields read today), so widening the merge in `NewInferred`
  ([program.go](../../ts-go-runtypes/internal/compiler/program/program.go)) needs no
  new parsing — just more field copies. (`core.CompilerOptions` embeds `_ noCopy`:
  field assignment only, never a value copy; `go vet` guards it.) For the paths that
  pass NO tsconfig today (enrichment CLI, gen-builtin-purefns), decide whether they
  should discover / parse one.
- **The key risk — NOT a wholesale swap.** The hardcoded structural options
  (`Module: ESNext`, `ModuleResolution: Bundler`, `AllowImportingTsExtensions`,
  `AllowNonTsExtensions`, `ResolveJsonModule`) are load-bearing for scanning `.ts`
  source overlays the way a bundler does; adopting a consumer's
  `moduleResolution: node16` / non-bundler setup could break that scan. Adopt the
  behaviour-shaping options (start with `lib`), keep the resolution-mechanics /
  structural ones fixed. That policy over the full surface is the core deliverable.

Related: extends `docs/done/eslint-inline-server-honor-customconditions.md` and
closes the follow-up in [docs/ROADMAP.md](../ROADMAP.md) (Lint follow-ups) + the
Limitations bullet in [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Done when

- The audit is written down: which features run on the reduced-config path, the
  real divergence each suffers, and a per-option adopt-vs-keep table (with reasons).
- Safe-to-adopt options are loaded in `NewInferred`, so every entry point behaves
  like tsc for them.
- Pinned regressions on BOTH surfaces: (a) lint — a tsconfig with
  `lib: ["ESNext.Temporal"]` no longer raises a false TMP001; (b) vite/runtime — a
  Temporal type still validates correctly after an HMR edit (or whatever the Step-0
  blast-radius analysis shows is actually affected).
- The source-overlay scan still resolves for consumer tsconfigs with awkward
  `module` / `moduleResolution`. Existing resolution tests stay green
  ([inline_server_tsconfig_test.go](../../ts-go-runtypes/internal/compiler/resolver/inline_server_tsconfig_test.go),
  [tsconfig-resolution.test.ts](../../packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts));
  ROADMAP / ARCHITECTURE updated. New marker-API tests cover both `getRunTypeId`
  shapes ([CLAUDE.md](../../CLAUDE.md)).
