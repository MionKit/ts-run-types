# Lint plugin: make binary + cwd transparent (zero-config linting)

**Status:** SHIPPED on branch `linting-zero-config`. `binary` / `cwd` / `socket`
removed from the lint settings surface and the transport; only
`settings.runtypes.timeoutMs` remains. Binary → `getExePath()`, cwd →
`process.cwd()`. Full devtools suite green.
**Branch:** `linting-zero-config`
**Created:** 2026-07-18

## Motivation

The RunTypes lint plugin (`@ts-runtypes/devtools/eslint`, served on the `./eslint`
and `./oxlint` subpaths) currently exposes a `settings.runtypes` configuration bag
with `binary`, `cwd`, `socket`, and `timeoutMs`. The website's linting page grew a
whole "editor config" section documenting these.

The owner's call: linting should require **zero** RunTypes-specific configuration,
exactly like any other linter.

- `binary` must **not** be configurable. Each plugin resolves the host-platform
  resolver itself (the same `@ts-runtypes/bin` `getExePath()` the bundler plugins
  use). Transparent.
- `cwd` must **not** be configurable. Linting uses `process.cwd()`, the directory
  every other linter already runs in. Transparent.
- The docs "editor config" section is removed (done — see below).

## Current state (before this change)

The knobs are read in [`packages/ts-runtypes-devtools/src/eslint/index.ts`](../../packages/ts-runtypes-devtools/src/eslint/index.ts)
`sessionOptions()` off `context.settings.runtypes`, threaded through the sync
bridge as `LintSessionOptions`
([`session-protocol.ts`](../../packages/ts-runtypes-devtools/src/eslint/session-protocol.ts)),
and consumed in the worker
([`lint-worker.ts`](../../packages/ts-runtypes-devtools/src/eslint/lint-worker.ts)):

| Knob | Where used | Default today |
| --- | --- | --- |
| `binary` | `lint-worker.ts` `ensureConnection` → `options.binary ?? getExePath()` | host binary via `@ts-runtypes/bin` |
| `cwd` | `lint-worker.ts` `ensureConnection` + `lintOne` (relativize the file) | `process.cwd()` |
| `socket` | `lint-worker.ts` `ensureConnection` → connect to a `--daemon` instead of spawning | unset (spawn a child) |
| `timeoutMs` | `session.ts` `roundTrip` per-file wait budget | `DEFAULT_TIMEOUT_MS` = 60_000 |

Note the defaults are already the transparent values — the change is to **remove the
override path**, not to change behaviour when unset.

## Plan (code)

1. **`index.ts`** — delete `sessionOptions()` and stop reading `context.settings`
   entirely. `diagnosticRule.create` no longer computes/passes an options object;
   `session.lintFileSync(file, text)` is called with no options. Update the
   `RuleContext` interface to drop `settings?`. Update the top-of-file doc comment
   (lines 23–24) that describes `settings.runtypes`.
2. **`session-protocol.ts`** — `LintSessionOptions` keeps only `timeoutMs`; drop
   `binary` / `cwd` / `socket`. Remove the `options` field from `LintWorkerRequest`
   (the worker resolves binary + cwd itself and never needs `timeoutMs`).
3. **`session.ts`** — `lintFileSync` / `roundTrip` no longer take `options`;
   `timeoutMs` becomes the constant `DEFAULT_TIMEOUT_MS`.
4. **`lint-worker.ts`** — `ensureConnection` uses `getExePath()` and `process.cwd()`
   unconditionally (no `adopted` options plumbing); `lintOne` relativizes against
   `process.cwd()`. Drop the `socket` branch if socket is removed (see decision).
5. **Tests** — update the suites that set these settings:
   - [`test/eslint/oxlint-e2e.test.ts:49`](../../packages/ts-runtypes-devtools/test/eslint/oxlint-e2e.test.ts) — `settings: {runtypes: {binary: BIN, cwd: project.dir}}`
   - [`test/eslint/plugin.test.ts:147`](../../packages/ts-runtypes-devtools/test/eslint/plugin.test.ts) — `settings = {runtypes: {binary: BIN, cwd: project.dir}}`
   - [`test/eslint/session.test.ts:21`](../../packages/ts-runtypes-devtools/test/eslint/session.test.ts) — `{binary: …, cwd: …, timeoutMs: …}`

   Resolution as implemented:
   - `oxlint-e2e.test.ts` — drop the settings entirely except a **bogus** `binary`
     (`/nonexistent/…`) that must be IGNORED; the existing "no engine error +
     findings present" assertions double as the end-to-end transparency proof.
     `process.cwd()` is already the fixture dir (oxlint is spawned with `{cwd}`).
   - `plugin.test.ts` — this in-process suite `process.chdir(project.dir)` in
     `beforeAll` (restored in `afterAll`) so `process.cwd()` roots the resolver at
     the fixture, exactly like a real run. `getExePath()` resolves the built
     `bin/ts-runtypes`. `settings` becomes `{}`. Plus a pure unit test on the
     exported `sessionOptions()` proving `binary` / `cwd` / `socket` are dropped and
     only `timeoutMs` survives.
   - `session.test.ts` — the engine-error path no longer injects a bad binary; it
     forces a timeout with `{timeoutMs: 1}` (the cold child spawn can't answer in
     1ms), still asserting the error surfaces, is reported, and sticks.
6. Rebuild `@ts-runtypes/devtools` (dist is what consumers/tests read) and run the
   JS suite. Marker-API coverage rule does not apply (no marker surface touched).

## Decision (resolved)

`binary`, `cwd`, and `socket` are removed from the settings surface **and** from the
transport (`LintSessionOptions`). The lint plugin reads exactly one knob:
`settings.runtypes.timeoutMs` (the per-file wait budget, default 60s). Binary →
`getExePath()`, cwd → `process.cwd()`, socket → gone (no daemon connect in the lint
lane; a daemon story, if revived, belongs to a deliberate feature).

`sessionOptions()` in `index.ts` now extracts only `timeoutMs`; it is exported so a
unit test can pin that `binary` / `cwd` / `socket` in `settings.runtypes` are
dropped. `LintWorkerRequest` no longer carries `options` (the worker needs nothing
from the rule thread — it resolves binary + cwd itself); `timeoutMs` is used purely
on the rule-thread side (`session.ts roundTrip`).

**Owner note — respect the host linter's timeout.** Ideally the per-file budget would
come from oxlint / ESLint themselves rather than a RunTypes setting. As of today
neither exposes a per-rule/plugin timeout to a JS plugin through the rule `context`,
so `settings.runtypes.timeoutMs` stays as the mechanism. **Future:** if a host adds a
timeout it surfaces to plugins, prefer it and fall back to our setting. Tracked here;
not blocking.

## Docs (already done on this branch)

- [`container/website/content/2.guide/9.linting.md`](../../container/website/content/2.guide/9.linting.md)
  — removed the `settings.runtypes` example + settings table (`binary` / `cwd` /
  `timeoutMs`). The commit-time and "checking without a linter" sections stay.
- [`container/website/content/1.introduction/4.configuration.md`](../../container/website/content/1.introduction/4.configuration.md)
  — table-first restructure (unrelated to this decision, same doc pass).
- Cross-links from the moved pages fixed (`/guide/*` → `/introduction/*`).

## Done criteria

- No `settings` read anywhere under `src/eslint/`.
- `pnpm --filter @ts-runtypes/devtools test` green (eslint suites updated).
- Linting page carries no RunTypes-specific configuration section.
- A regression test proves `settings.runtypes.binary` is ignored.
