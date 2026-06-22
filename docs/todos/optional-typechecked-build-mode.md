# Optional single-pass type-checked build (fuse a tsgo check into the transform)

> **Status: pending (design note, 2026-06-22).** Motivated by the compile-time
> benchmark: typia's `ttsc` does type-check + transform + emit in ONE pass, while
> ts-runtypes does a transform-only build (vite + the RT plugin) and relies on a
> SEPARATE `tsgo` pass for type-checking. This tracks an **opt-in** mode that fuses
> the two, plus the reasoning for why the lean transform-only model stays the default.

## The question

Can ts-runtypes bundle a full type-check into its transform like `ttsc` does, so a
single build both type-checks and emits validators? And would that reduce compile
time?

## What we do today vs ttsc

- **ts-runtypes (transform-only).** The vite plugin drives the Go resolver, which
  wraps tsgo's checker to resolve the types at each `createValidate<T>()` call site
  (targeted resolution for codegen). It does **not** run a full-program type-check —
  esbuild strips types, and the resolver only looks at marker call sites. Verified:
  a `vite`/esbuild build emits clean JS for `const bad: number = "x"` (no error). So
  the build is fast; type SAFETY comes from a separate `tsgo` pass.
- **typia (ttsc).** `ttsc` is tsgo + the typia transform in one compile that DOES a
  full type-check (verified: it reports `TS2322` and halts on a bad assignment) and
  emits.

So the per-toolchain totals to "type-check AND emit validators" are:
`ts-runtypes = tsgo compile + transform build (two passes)`, `typia = ttsc (one pass)`.

## Is bundling a check worth it? (the "gimmick" point)

Largely **redundant**, and the lean model is defensible:

- **tsgo is already the integrated type-checker.** Your editor runs the tsgo
  language server continuously, and CI typically runs `tsc --noEmit` once. A check
  bundled into the BUILD is a third check that catches nothing the editor/CI tsgo
  pass doesn't. ttsc's bundled check is convenient (build = gate) but not free safety.
- **It does not make the build faster.** Fusing ADDS the full-check cost to the
  build. It only reduces the COMBINED check+build time, and only when you would have
  run a dedicated `tsc --noEmit` anyway: one program load (the ~100 ms tsgo
  startup/parse/bind baseline) + one process instead of two. So the win is "CI runs
  one fused command" rather than "the build got cheaper".
- **The benchmark's `typecheck+full` (ts-runtypes 311 vs typia 179) overstates our
  real cost.** The `tsgo compile` (~100 ms) is a sunk cost you pay regardless of
  ts-runtypes (editor + CI). ts-runtypes' MARGINAL build cost is just the transform
  (~210 ms). Symmetrically, typia still runs a separate editor/CI tsgo pass too, so
  its `ttsc` check is the redundant one in the real workflow.

**Conclusion: keep transform-only as the default.** The fused check is an opt-in
convenience, not a default, and not a correctness need.

## Proposed opt-in feature

A `typeCheck` mode that fuses a full tsgo type-check into the resolver pass so one
build both type-checks and emits, for CI / standalone scenarios that want a single
command instead of `tsc --noEmit` + build.

### Why it is feasible

The resolver already loads + binds the program and runs tsgo's checker (via the
tsgolint shim) to answer call-site queries. A full-program check is incremental work
on that already-loaded program: collect ALL diagnostics, not just the call-site
resolutions. No second program load.

### Sketch

- **Resolver (Go).** Add a request flag (e.g. `protocol.Request.TypeCheck`) that, after
  resolving call sites, asks the checker for the program's full diagnostic list and
  returns it in the response (file / line / col / code / message). The checker + bound
  program are already in hand, so this reuses them.
- **Plugin / CLI surface.** A plugin option `typeCheck: boolean` (default `false`).
  When on, the plugin surfaces returned diagnostics as build errors (fail the vite
  build; print tsc-style messages). Keep it bundler-agnostic at the resolver layer so
  the future standalone CLI (see ROADMAP: decouple from Vite) can expose the same flag.
- **Docs / benchmark.** If shipped, add a "fused" column / note to the compile-time
  page so the single-pass total is comparable to typia's `ttsc`.

### Open questions / trade-offs

- **Diagnostic fidelity.** Must match `tsc --noEmit` exactly (same codes, same
  `skipLibCheck` honoring, same config) or it is worse than useless. Needs a
  conformance check against tsgo's own `--noEmit` output.
- **Incremental / watch builds.** A full check on every rebuild is heavy; consider
  gating it to production builds or a separate command.
- **Caching.** The function caches are content-addressed; full-check diagnostics are
  NOT cacheable the same way (they depend on the whole program). Keep them out of the
  type cache.
- **Default stays off.** Per the reasoning above, the lean transform-only build
  remains the default; this is purely additive.

## Acceptance

- `typeCheck: true` makes a `vite build` (and the resolver) report the SAME type
  errors as `tsgo -p tsconfig --noEmit`, halting the build on error.
- Default (`typeCheck` unset) is byte-identical to today (no check, no slowdown).
- Compile-time benchmark documents the fused single-pass total alongside the
  two-pass default.
