# `@ts-runtypes/*` rename — remaining follow-ups

**Status:** todo (non-functional). The functional rename shipped in [PR #191](https://github.com/MionKit/ts-run-types/pull/191) — see [`docs/done/scope-rename-ts-runtypes-org.md`](../done/scope-rename-ts-runtypes-org.md).
**Created:** 2026-07-07

Prose/cosmetic leftovers plus one bench-harness item after the core `@ts-runtypes/*` rename. None affect `pnpm test`, publishing, or the runtime — the code-example imports and all functional references were already updated.

- **Doc-prose package references.** README / [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) / etc. still write backtick `` `ts-runtypes` `` in prose where they mean the *package* `@ts-runtypes/core`. Needs a careful pass that distinguishes three things that share the string: the **package** (`@ts-runtypes/core`), the **kept tsconfig-plugin identifier** `ts-runtypes` (the `plugins:[{name:"ts-runtypes"}]` config key the Go binary matches — deliberately NOT renamed), and **"RunTypes"/the project name**. A blanket replace would corrupt the plugin-key refs.

- **Benchmark harness.** A **pre-existing** stale `@mionjs/ts-runtypes` mount in [`container/benchmarks/typecost/typecost.mjs`](../../container/benchmarks/typecost/typecost.mjs) (predates this rename), plus the typecost tsconfig `paths` and the competitor source under `container/benchmarks/competitors/ts-runtypes/`. Bench-specific; not on the `pnpm test` / publish path. NB: any `container/benchmarks/_deps` change needs a GHCR bench-image rebuild + push.

- **Website-content prose** in `container/website/content/**` — the code-example imports were updated; only prose package-name mentions remain.

- **Internal comment cosmetics** — a few `ts-runtypes-devtools/<entry>` header comments in `packages/ts-runtypes-devtools/src/*.ts`, the `publish-tarballs.mjs` `rank()` comment, and similar.
