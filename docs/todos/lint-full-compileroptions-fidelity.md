---
type: fix
spec: guidelines
status: ready
created: 2026-07-23
---

# Full `compilerOptions` fidelity at lint time (replicate tsc)

## Intent

The lint path builds an **inferred** single-root Program per file and, as of
`docs/done/eslint-inline-server-honor-customconditions.md`, merges only the
project tsconfig's **resolution** options (`customConditions` / `paths` /
`baseUrl` / `pathsBasePath`) onto a fixed, hardcoded option set. Every other
`compilerOptions` field a consumer sets is ignored, so lint diverges from a real
tsc / vite build for **lib-sensitive** diagnostics. The documented example is
**TMP001**: `Temporal.*` types only resolve when `ESNext.Temporal` is in the
consumer's `lib`; the build path reads `lib`, the lint path does not (it hardcodes
`Target: ES2022` with no `lib`), so a project that enabled Temporal correctly can
still see a false TMP001 in the editor. Goal: make the inferred lint Program
replicate TypeScript's behaviour by applying the full parsed `compilerOptions`,
so lint findings match what a build would say.

## Direction

The implementer plans the details; the verified starting points:

- **Where the options are set:** `program.NewInferred` in
  [ts-go-runtypes/internal/compiler/program/program.go](../../ts-go-runtypes/internal/compiler/program/program.go)
  hardcodes a `core.CompilerOptions{…}` (Module: ESNext, ModuleResolution:
  Bundler, Target: ES2022, AllowImportingTsExtensions, StrictNullChecks,
  StrictFunctionTypes, ESModuleInterop, AllowNonTsExtensions, ResolveJsonModule)
  and — post the resolution fix — copies only `Paths` / `BaseUrl` /
  `PathsBasePath` / `CustomConditions` from the parsed tsconfig when
  `opts.ResolutionBase` is set.
- **The parsed config is already in hand.** `program.ParseInferredResolution` in
  [inferred_resolution.go](../../ts-go-runtypes/internal/compiler/program/inferred_resolution.go)
  returns an opaque `InferredResolution` handle that holds the WHOLE parsed
  `*core.CompilerOptions` (only four fields are read today). Widening the merge
  needs **no new parsing** — just copying more fields onto the inferred options
  in `NewInferred`. (Note `core.CompilerOptions` embeds `_ noCopy`, so keep it to
  field assignment, never a value copy — `go vet` guards this.)
- **The reference for "replicate tsc" already exists.** `program.New` (same file)
  is the build/vite path and applies the FULL parsed `ParsedCommandLine` — use it
  as the oracle for which options should take effect.
- **The key risk — it is NOT a wholesale swap.** The hardcoded structural options
  (`Module: ESNext`, `ModuleResolution: Bundler`, `AllowImportingTsExtensions`,
  `AllowNonTsExtensions`, `ResolveJsonModule`) are load-bearing for scanning the
  linted file and its imports as `.ts` **source overlays** the way a bundler does.
  Adopting a consumer's `moduleResolution: node16` (which demands explicit
  extensions) or a non-bundler setup could break that overlay scan. So the
  implementer must decide, **per option**, adopt-from-tsconfig vs keep-fixed —
  the highest-value adopt is `lib` (and probably `target`), plus the
  type-shape-affecting flags; the module/resolution structural knobs likely stay
  fixed. That adopt-vs-keep policy is the real design work here.

Related: this extends `docs/done/eslint-inline-server-honor-customconditions.md`
and closes the "full-`compilerOptions` lint fidelity" follow-up noted in
[docs/ROADMAP.md](../ROADMAP.md) (Lint follow-ups) and the Limitations bullet in
[docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Done when

- A Temporal fixture whose tsconfig sets `lib: ["ESNext.Temporal"]` no longer
  raises a false TMP001 at lint time — the inline-server / setSources path matches
  the build.
- The source-overlay scan still resolves for consumer tsconfigs carrying awkward
  `module` / `moduleResolution` values (a regression proving the structural
  options stayed safe).
- The existing resolution tests still pass
  ([internal/compiler/resolver/inline_server_tsconfig_test.go](../../ts-go-runtypes/internal/compiler/resolver/inline_server_tsconfig_test.go),
  [packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts](../../packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts)),
  and the ROADMAP / ARCHITECTURE notes are updated to say full fidelity shipped.
- If any new test exercises the marker API, it covers both `getRunTypeId` shapes
  (the Marker test coverage rule in [CLAUDE.md](../../CLAUDE.md)).
