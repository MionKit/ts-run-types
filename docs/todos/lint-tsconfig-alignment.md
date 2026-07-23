---
type: fix
spec: guidelines
status: ready
created: 2026-07-23
---

# Align the lint (inferred) program with the project tsconfig

## Intent

The lint path builds an **inferred** single-root Program per file. Today it honors
only the tsconfig's **resolution** options (`customConditions` / `paths` /
`baseUrl` / `pathsBasePath`, added in
`docs/done/eslint-inline-server-honor-customconditions.md`); everything else in the
project tsconfig is ignored and replaced by a fixed, hardcoded option set. So lint
can diverge from a real tsc / vite build for anything those other settings control.

The one gap we already know about is **`lib` → TMP001**: `Temporal.*` types only
resolve when `ESNext.Temporal` is in the consumer's `lib`; the build reads `lib`,
the lint path does not, so a project that enabled Temporal correctly still sees a
false TMP001 in the editor. But `lib` is almost certainly not the ONLY thing
missing. The goal of this todo is a **general tsconfig alignment**: the agent
audits the whole tsconfig surface, finds every setting the lint path SHOULD honor
to match the build but currently does not, and loads the safe ones.

## Direction

This is primarily an **investigation** — the agent audits first, then implements
what the audit finds. Verified starting points:

- **Do the diff.** The build path `program.New`
  ([ts-go-runtypes/internal/compiler/program/program.go](../../ts-go-runtypes/internal/compiler/program/program.go))
  applies the FULL parsed `ParsedCommandLine`; the lint path `program.NewInferred`
  (same file) uses a fixed hardcoded `core.CompilerOptions{…}` and merges only the
  four resolution fields from the parsed config. Enumerate the DELTA between the
  two — that delta is the candidate list.
- **Look at the whole tsconfig, not just `compilerOptions`.** Candidates to audit
  (non-exhaustive — the agent should look for more): `lib`, `target`, the `strict`
  sub-family (`noImplicitAny`, `strictPropertyInitialization`,
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, …), `jsx`,
  `experimentalDecorators` / `emitDecoratorMetadata`, `useDefineForClassFields`,
  `types` / `typeRoots` (which ambient types are in scope), and anything else that
  changes what the checker resolves or the shape RunTypes reflects. Flag any
  NON-`compilerOptions` tsconfig input that matters too. For each candidate, decide
  **adopt-from-tsconfig vs keep-fixed** and say why.
- **The parsed config is already in hand.** `program.ParseInferredResolution` in
  [inferred_resolution.go](../../ts-go-runtypes/internal/compiler/program/inferred_resolution.go)
  returns an opaque `InferredResolution` handle holding the WHOLE parsed
  `*core.CompilerOptions` (only four fields are read today). Widening the merge
  needs **no new parsing** — just copying more fields onto the inferred options in
  `NewInferred`. (`core.CompilerOptions` embeds `_ noCopy`, so field assignment
  only, never a value copy — `go vet` guards it.)
- **The key risk — NOT a wholesale swap.** The hardcoded structural options
  (`Module: ESNext`, `ModuleResolution: Bundler`, `AllowImportingTsExtensions`,
  `AllowNonTsExtensions`, `ResolveJsonModule`) are load-bearing for scanning the
  linted file and its imports as `.ts` **source overlays** the way a bundler does.
  Adopting a consumer's `moduleResolution: node16` (needs explicit extensions) or a
  non-bundler setup could break that overlay scan. So the audit must stay
  **per-option**: adopt what makes lint match the build (starting with `lib`), keep
  the structural / resolution-mechanics ones fixed. That adopt-vs-keep policy over
  the full surface is the core deliverable.

Related: extends `docs/done/eslint-inline-server-honor-customconditions.md` and
closes the "full-`compilerOptions` lint fidelity" follow-up in
[docs/ROADMAP.md](../ROADMAP.md) (Lint follow-ups) + the Limitations bullet in
[docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Done when

- The audit is written down: a list/table of every tsconfig setting the build
  honors, whether the lint path now adopts it or deliberately keeps it fixed, and
  why — so the adopt-vs-keep line is explicit, not implicit.
- The safe-to-adopt settings are loaded, so lint matches the build for them. Pinned
  regression: a Temporal fixture whose tsconfig sets `lib: ["ESNext.Temporal"]` no
  longer raises a false TMP001 at lint time.
- The source-overlay scan still resolves for consumer tsconfigs carrying awkward
  `module` / `moduleResolution` (proof the structural options stayed safe).
- Existing resolution tests stay green
  ([internal/compiler/resolver/inline_server_tsconfig_test.go](../../ts-go-runtypes/internal/compiler/resolver/inline_server_tsconfig_test.go),
  [packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts](../../packages/ts-runtypes-devtools/test/eslint/tsconfig-resolution.test.ts));
  ROADMAP / ARCHITECTURE notes updated. If a new test exercises the marker API,
  cover both `getRunTypeId` shapes (Marker test coverage rule in [CLAUDE.md](../../CLAUDE.md)).
