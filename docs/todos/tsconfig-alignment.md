---
type: fix
spec: full-plan
status: ready
created: 2026-07-24
---

# Configuration architecture: one tsconfig, one behavior

**Sequencing: implement FIRST, before
[cli-subcommand-consolidation.md](cli-subcommand-consolidation.md), which builds on
the single config-resolution seam this todo creates.**

## Philosophy

RunTypes works ON TOP of TypeScript's own defaults. The user hands the process one
tsconfig at startup; that config governs the entire process lifecycle; tsgo — not
our code — loads libs and enforces every flag. RunTypes must behave exactly like
the tsgo CLI on every entry point. We never curate per-option behavior.

## The architecture

**Config resolution.**

- Every lane takes an explicit tsconfig at startup (`--tsconfig`; the vite plugin
  and the lint worker already always pass one — `unplugin.ts:287`,
  `eslint/lint-worker.ts:132`).
- The human-driven enrich CLI additionally falls back to tsc-style upward
  discovery from the target file's directory when no flag is given (the existing
  `findNearestTsconfig`, [config.go:334](../../ts-go-runtypes/cmd/ts-runtypes/config.go),
  mirrors tsc's own `findConfigFile` walk).
- The daemon protocol never discovers: explicit or nothing. Bare spawns (smoke
  script, benchmarks, inline test suites, fuzz harness) run with an empty
  `--tsconfig` at the repo root; upward discovery there would silently adopt an
  unrelated ancestor config and flip resolution/caching behavior.

**Lifecycle.**

- Parse ONCE per process with tsgo's own `tsoptions.GetParsedCommandLineOfConfigFile`
  (follows `extends`), then freeze the parsed `CompilerOptions` for the lifetime.
- Every program the process ever builds — initial scan, both `--compile` passes,
  every per-edit daemon rebuild, enrich — derives from that same frozen options
  pointer. RunTypes supplies only file roots and overlays.
- A tsconfig change means restart/respawn (vite rebuilds already respawn the
  resolver). No mid-session reparse: tsgo's reload layer is LSP-host machinery;
  parse-once is the embedder contract, and tsgo's own LSP builds many sequential
  programs from one parsed options pointer (vendored `project.go:352-406`).

**Enforcement.**

- tsgo enforces the config. No option curation, no per-field adoption, no
  structural overrides — the override list is EMPTY (evidence below).

**Error semantics — strict like tsc.**

- A config that was named or discovered but is missing or unparseable fails
  LOUDLY in every lane: CLI lanes fatal; daemon ops return a structured error,
  surfaced as a lint diagnostic / plugin build error.
- The inferred-defaults fallback (today's hardcoded literal in `NewInferred`)
  applies ONLY when no config exists at all — tsc's own loose-file behavior. The
  WASM playground, bare test spawns and `gen-builtin-purefns` stay there.
- The JS side passes the implicit `tsconfig.json` default only when the file
  exists; an explicitly configured path is always passed and always strict. The
  opt-in `TsconfigFailOnError` becomes the default and its option/flag plumbing is
  removed (binary and JS packages ship in lockstep, so argv changes are atomic).

**The per-lane contract.**

| Lane | tsconfig source | Missing / broken | Programs built from |
|---|---|---|---|
| build / vite initial (`program.New`) | `--tsconfig` (default `<cwd>/tsconfig.json`) | hard error (unchanged) | full config (unchanged) |
| `--compile` | same | hard error (unchanged) | full config (unchanged) |
| daemon `setSources` rebuilds (lint, HMR) | `--tsconfig` argv, parsed once per session | **loud error (new — was silent fallback)** | **full config (new — was 4 fields)** |
| inline one-shot stdin | same | **loud error (new)** | **full config (new)** |
| enrich CLI `describe`/`gen`/`check` | **new `--tsconfig` flag; fallback: upward discovery from the target file** | **loud error (new)** | **full config (new — was none)** |
| no config anywhere (WASM, bare spawns, `gen-builtin-purefns`) | none | — | hardcoded inferred defaults (unchanged) |

## Why this architecture is sound (verified against the vendored tsgo)

- Nothing mutates `*core.CompilerOptions` after parse; `Program.Options()` aliases
  the pointer; the checker snapshots scalars at construction. Reusing one frozen
  options pointer across sequential programs is tsgo's native pattern, not a hack.
  `(*core.CompilerOptions).Clone()` is reachable through the shim for the one case
  needing a modified copy.
- No structural override is required for overlay programs with `.ts`/`.tsx`
  roots: `allowNonTsExtensions: false` (the tsc default) does not drop `.ts` roots
  (that gate guards lib/reference outputs, not root files);
  `allowImportingTsExtensions` only matters for literal `./x.ts` specifiers;
  module resolution is fully VFS-transparent (the vendored `internal/module`
  package performs zero direct filesystem calls, so an in-memory overlay buffer
  resolves identically to the on-disk file under bundler/node16/node10);
  `composite`/`incremental`/`noEmit`/`outDir` only surface through
  `GetProgramDiagnostics()`, which this path never calls; `noCheck` gates
  diagnostics, not type queries.
- An explicit `lib` replaces the defaults wholesale — correct, because the user's
  complete array is copied verbatim; `lib.esnext.temporal.d.ts` ships in the
  bundled lib set already.

## Current implementation vs the architecture

Two program-construction paths exist and only one follows the architecture.
`program.New` ([program.go:50-110](../../ts-go-runtypes/internal/compiler/program/program.go))
is already correct. `program.NewInferred`
([program.go:114-172](../../ts-go-runtypes/internal/compiler/program/program.go))
hardcodes its options and copies back only four resolution fields (:144-150) —
and it backs every daemon lane: lint (each linted file), vite dev/HMR (after the
first edit the resolver swaps to a `NewInferred` program and stays there for the
session), the edits-mode drift re-sync (can swap a `vite build` mid-flight), the
inline one-shot, and the enrichment CLI, which passes no tsconfig at all
([enrich_cli.go:49/:69](../../ts-go-runtypes/cmd/ts-runtypes/enrich_cli.go)).
Daemon-lane semantics therefore diverge from the build for ANY option-sensitive
type (example: `lib: ["ES2022", "ESNext.Temporal"]` → false TMP001 on lint, and a
Temporal type introduced mid-HMR projects as `any`, persisted to `<genDir>/types/`
and the incremental disk cache). Separately, the reduced lanes swallow config
problems silently
([inferred_resolution.go:36-59](../../ts-go-runtypes/internal/compiler/program/inferred_resolution.go)
returns nil on any failure) where tsc errors loudly.

## Plan

1. **[inferred_resolution.go](../../ts-go-runtypes/internal/compiler/program/inferred_resolution.go)** —
   rename `InferredResolution` → `InferredConfig`, `ParseInferredResolution` →
   `ParseInferredConfig(cwd, tsconfigPath string, extraConditions ...string)`
   returning `(*InferredConfig, error)`: `(nil, nil)` only when no path was given;
   missing file or parse diagnostics → error carrying the diagnostics. Effective
   options are computed ONCE at parse: no extras → the parsed pointer as-is (zero
   mutation, shared across every rebuild); extras (enrich passes `"source"`) →
   `parsed.Clone()` + `CustomConditions = mergeConditions(extras, parsed.CustomConditions)`.
   Never rebuild options field-by-field — that would drop `ConfigFilePath`, which
   roots `@types` discovery (vendored `fileloader.go:232`).
2. **`NewInferred`** ([program.go:114-172](../../ts-go-runtypes/internal/compiler/program/program.go)) —
   with an `InferredConfig`, use its effective options wholesale; the hardcoded
   literal (+ `opts.Conditions`) remains only the no-config fallback. Delete the
   4-field cherry-pick. Build the wrapper with the shimmed
   `tsoptions.NewParsedCommandLine(options, fileNames, tspath.ComparePathsOptions{…})`
   in both branches (populates `comparePathsOptions`; `ProjectReferences` stays nil
   by construction). Rewrite the :137-143 policy comment to state this contract.
3. **[dispatch.go:1149-1152](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go)
   + [resolver.go:177-178](../../ts-go-runtypes/internal/compiler/resolver/resolver.go)** —
   the once-per-session parse now propagates the error path: a failed parse fails
   the `setSources` op with a structured error. Remove `TsconfigFailOnError`
   (resolver option + `main.go:346` + JS plumbing); strict is the default.
4. **[main.go:404-434](../../ts-go-runtypes/cmd/ts-runtypes/main.go)** (inline
   one-shot) — same strictness via the shared parse.
5. **Enrich CLI** ([enrich_cli.go](../../ts-go-runtypes/cmd/ts-runtypes/enrich_cli.go),
   [config.go](../../ts-go-runtypes/cmd/ts-runtypes/config.go)) — add `--tsconfig`
   to the `describe`/`gen`/`check` FlagSets and the `valueFlags` map (:465).
   Resolution order: explicit flag → `findNearestTsconfig(filepath.Dir(absPath))` →
   none. Thread ONE resolved path into `buildProgram`/`buildProgramMulti`
   (`ParseInferredConfig(cwd, path, "source")`) AND `resolveEnrichConfig`
   (:190-242, replacing its separate discovery) so genDir/i18n and type resolution
   read the SAME config. A named-or-discovered config that fails → fatal.
6. **JS side** ([resolver-client.ts:485-516](../../packages/ts-runtypes-devtools/src/resolver-client.ts),
   `unplugin.ts:287`, `eslint/session.ts:105-108`, `lint-worker.ts`) — pass
   `--tsconfig` only when explicitly configured OR the default `tsconfig.json`
   exists; surface the daemon's config error as a lint diagnostic / plugin error.
7. **Deliberate divergences from tsc, documented:** tsconfig `references` dropped
   (existing decision, `program.go:91-93`); the daemon never walk-up discovers;
   server-mode `rtStore` stays override-only (`resolver.go:358-360` — cache
   posture is ours; the vite build lane already honors the full program's
   `IsIncremental`); `gen-builtin-purefns` and the WASM playground stay on the
   fallback literal (fixed inputs / no disk).

## Tests

- **Parity oracle — the architectural verification.** One on-disk fixture scanned
  through the build lane (`program.New` + `resolver.New`) AND the daemon lane
  (`NewServer` + `OpSetSources`, identical file content) must yield identical site
  kinds and reflection ids. Matrix rows: bundler config; `module/moduleResolution:
  node16`; a lib-sensitive type (`lib` with `ESNext.Temporal`); `strict: false`.
  Fixtures carry BOTH marker shapes — static `getRunTypeId<T>()` and value-first
  `getRunTypeId(v)` — with id equality asserted across shapes AND lanes
  (Marker rule; pattern: `TestAtomic_FormEquivalence`).
- **Error semantics.** Named-but-broken config → `setSources` op errors and lint
  surfaces it; named-but-missing → error; nothing named → fallback works. Update
  the `fail-on-error` tests to pin strict-by-default.
- **Program-level** (`internal/compiler/program/`): options adopted wholesale
  (including `module: node16` honored — full parity, nothing kept fixed);
  `extraConditions` merge preserves `"source"` without mutating the shared parse;
  the fallback literal is untouched without a config.
- **Option-sensitive regressions on both public surfaces** (using the Temporal lib
  example): eslint surface — lib present → no `invalid-marker` report, lib absent →
  TMP001-routed report (via `makeFixtureProject`/`runRule`); daemon/HMR surface —
  a `setSources` edit introducing a new Temporal-typed marker projects as a class
  (not `any`), no TMP001, both marker-shape ids equal (modeled on
  `transform-modes.test.ts` direct `ResolverClient` use).
- **Keep green:** `inline_server_tsconfig_test.go` (its fixtures already set
  explicit bundler options), `temporal_guard_test.go` and all `setupInline` /
  bare-spawn suites (fallback lane), enrichment goldens (tempdir fixtures find no
  config above `/tmp`). Refresh the stale "can't load a newer lib" comment in
  [temporal.d.ts:1-9](../../ts-go-runtypes/internal/testfixtures/temporal.d.ts).

## Docs

- [docs/ARCHITECTURE.md](../ARCHITECTURE.md):205 (`NewInferred` description) and
  :521-524 (Limitations bullet) — replace with the contract and the
  deliberate-divergences list.
- [docs/ROADMAP.md](../ROADMAP.md):183 — the "REST of `compilerOptions` are still
  not applied" clause → shipped.
- Website `container/website/content/2.guide/9.linting.md` "Your tsconfig" — the
  linter reads the full tsconfig, checking options like lib, target and strict
  behave the same as the build, and a broken config is reported instead of
  ignored. House style (plain wording, no em/en dashes).
- Enrich flag tables (website i18n/linting pages and the
  `packages/ts-runtypes/skills/` enrichment skill docs) — document `--tsconfig`.

## Out of scope

- The CLI subcommand restructure —
  [cli-subcommand-consolidation.md](cli-subcommand-consolidation.md), ships AFTER
  this.
- Narrow rooting of daemon rebuilds ("source file not in program" for files
  outside the last overlay's closure) and the drift re-sync swapping a build
  mid-flight — pre-existing, lower-stakes once configs match.
- `UpdateProgram` incremental rebuild latency (existing ROADMAP item).
- Folding compiler options into the disk-cache fingerprint — unnecessary: entries
  are keyed by structural typeID, so projection changes re-key and stale entries
  orphan harmlessly.

## Done when

- The parity tests pin daemon lane ≡ build lane across the fixture matrix — the
  architecture holds by test, not by convention.
- Config errors are loud on every lane; the inferred fallback applies only where
  no config exists.
- The enrich CLI honors `--tsconfig` (explicit) and upward discovery (fallback),
  and its genDir/i18n and type resolution read the same config.
- Option-sensitive regressions are pinned on both public surfaces (lint + daemon).
- Existing resolution/marker/enrichment suites stay green; docs updated; both
  `getRunTypeId` shapes covered with id-equivalence assertions.
