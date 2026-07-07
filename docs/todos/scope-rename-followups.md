# `@ts-runtypes/*` rename — remaining follow-ups

**Status:** todo (prose/cosmetic only). The functional rename shipped in [PR #191](https://github.com/MionKit/ts-run-types/pull/191) — see [`docs/done/scope-rename-ts-runtypes-org.md`](../done/scope-rename-ts-runtypes-org.md). The benchmark harness and the website playground alias were fixed + verified via `pnpm rtx website build --quick` (green, exit 0, zero `@ts-runtypes` resolution errors).
**Created:** 2026-07-07

Prose/cosmetic leftovers after the core `@ts-runtypes/*` rename. None affect `pnpm test`, publishing, the website build, or the runtime — the code-example imports and all functional references are updated.

- **Doc-prose package references.** README / [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) / etc. still write backtick `` `ts-runtypes` `` in prose where they mean the *package* `@ts-runtypes/core`. Needs a careful pass that distinguishes three things that share the string: the **package** (`@ts-runtypes/core`), the **kept tsconfig-plugin identifier** `ts-runtypes` (the `plugins:[{name:"ts-runtypes"}]` config key the Go binary matches — deliberately NOT renamed), and **"RunTypes"/the project name**. A blanket replace would corrupt the plugin-key refs.

- **Website-content prose** in `container/website/content/**` — the code-example imports were updated; only prose package-name mentions remain.

- **Internal comment cosmetics** — a few `ts-runtypes-devtools/<entry>` header comments in `packages/ts-runtypes-devtools/src/*.ts`, the `publish-tarballs.mjs` `rank()` comment, and similar.
