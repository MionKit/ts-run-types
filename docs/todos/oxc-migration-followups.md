# OXC migration follow-ups (still deferred)

**Status:** todo — only the items below remain. **Points 1 (rolldown) & 2b (esbuild) shipped in [PR #191](https://github.com/MionKit/ts-run-types/pull/191)** (see [`docs/done/scope-rename-ts-runtypes-org.md`](../done/scope-rename-ts-runtypes-org.md)).
**Parent:** [`docs/done/oxc-toolchain-migration.md`](../done/oxc-toolchain-migration.md)
**Created:** 2026-07-04

## Optional hardening — adopt `oxlint --type-aware` (NOT related to the RunTypes plugin)

**This is orthogonal to RunTypes' own lint plugin.** `oxlint --type-aware` turns on
oxlint's *own* type-aware lint rules (no-floating-promises, no-misused-promises,
await-thenable, …), powered by oxlint's bundled tsgolint. It is a dev-hardening knob for
linting **this repo's own source**. It does NOT touch, use, or depend on the RunTypes
lint plugin (`@ts-runtypes/devtools/eslint`) — that is a *separate* oxlint JS plugin
which surfaces RunTypes compiler diagnostics through our own resolver binary. Toggling
`--type-aware` changes only which generic TypeScript lint rules run in CI; our plugin is
unaffected either way.

Nothing type-aware runs today, so it is pure lint-coverage gain when adopted — but
adopting it means enabling the rules and fixing whatever they flag (scope unknown until
it runs). Deferred as a deliberate, separate hardening task.

## Next.js integration (webpack + Turbopack)

Moved to [`docs/maybe/next-js-support.md`](../maybe/next-js-support.md) on 2026-07-22.
