# Project references with unbuilt outputs silently yield zero marker sites

**Status: FIXED — the resolver now drops tsconfig project `references` when building its program.**

## Evidence (2026-07-11, mion migration)

mion's per-package tsconfigs carry project `references` (for `tsc --build`), e.g.
`packages/router/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "references": [{"path": "../core"}, {"path": "../run-types"}, {"path": "../type-formats"}, {"path": "../test-server"}],
  "include": ["."]
}
```

The referenced projects' declaration outputs (`.dist/esm/*.d.ts`) do not exist during dev
(mion never builds during development). Against that tsconfig:

- `generate` (the plugin's buildStart path) returned **`siteFiles: []` and 0 modules** for a
  program that actually contains ~20 marker-site files — no diagnostics, no error. Every
  `route()` call site shipped untransformed and factories threw "no id injected" at runtime.
- The identical program with `references: []` (same compilerOptions, same include) returned
  20 site files / 722 modules and injected everything correctly.

tsgo redirects imports that land in a referenced project's sources to that project's
declaration outputs; with the outputs missing, the marker aliases resolve to nothing and the
scanner sees no sites.

## Why the fix drops references (fix plan option 1, sharpened)

Project references are a `tsc --build` orchestration concept. The resolver's job is scanning
the SOURCES the bundler will execute — and bundlers (vite/esbuild/rollup) never honor
reference redirects, so honoring them in the scan actively diverged from runtime reality even
when outputs existed. Dropping them keeps normal module resolution (paths, node_modules,
custom conditions) pointed at real sources, matching the bundler.

## Shipped

- `ts-go-runtypes/internal/compiler/program/program.go` — `program.New` nils
  `ParsedConfig.ProjectReferences` after parsing the tsconfig, before `compiler.NewProgram`.
- Regression tests:
  - Go: `internal/compiler/program/references_test.go` — a referenced composite project with
    unbuilt outputs; asserts the referenced SOURCE stays in the program (fails on the old
    redirect behavior).
  - JS e2e: `packages/ts-runtypes-devtools/test/references-unbuilt.test.ts` — the mion shape
    (`paths` onto a referenced sibling's sources + `references` + unbuilt `dist/`); asserts a
    wrapper consumer still gets its call site rewritten through the shipped binary.
- `docs/ARCHITECTURE.md` (program bootstrap section) documents the behavior.

## Consumer note

mion's `@mionjs/devtools` shipped an interim workaround (a references-free twin tsconfig
generated under `node_modules/.cache/mion-devtools/`); it was removed once this fix landed —
the plugin can be handed the project's real tsconfig, references and all.
