# Project references with unbuilt outputs silently yield zero marker sites

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

Reproduced both through `@ts-runtypes/devtools` (ResolverClient.generate) and isolated from
vite. tsgo presumably redirects the referenced packages' imports to their (missing)
declaration outputs, so the marker aliases resolve to nothing and the scanner sees no sites.

## Why it matters

A consumer with standard `tsc --build` project references gets a **silently dead** setup —
the worst failure mode: no diagnostics at build time, runtime "no id injected" errors far
from the cause. mion works around it by generating a references-free twin tsconfig
(`@mionjs/devtools` `deriveRuntypesTsconfig()` writes `{extends: <abs original>, references: []}`
under `node_modules/.cache/mion-devtools/` and hands that to the plugin).

## Fix plan (pick one, roughly in preference order)

1. **Fall back to source**: when a referenced project's declaration output is missing,
   resolve through the referenced project's sources (equivalent of
   `disableSourceOfProjectReferenceRedirect: false` semantics with missing outputs), so the
   scan sees the real types. Mirrors what bundler-based dev loops (vite `source` conditions)
   do anyway.
2. **Fail loud**: if the program contains `references` whose outputs are missing AND the
   whole-program scan finds zero sites while marker imports are present textually, emit a
   dedicated diagnostic ("references redirect to unbuilt outputs — build the referenced
   projects or drop references from the RunTypes tsconfig").
3. **Document + config knob**: at minimum document the limitation in the Configuration guide
   and honor an `ignoreReferences: true` plugin/tsconfig option so consumers don't need the
   twin-config trick.

## Tests

- Fixture with two mini projects (A references B, B has marker sites reachable from A,
  B's outputs absent) pinning whichever behavior is chosen.
