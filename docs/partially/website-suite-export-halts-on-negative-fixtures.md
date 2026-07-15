# Website suite-data export halts on the test suite's deliberate negative fixtures

> **Status (partially):** `failOnError: false` applied to both exporters in PR #226
> and verified locally (the halt clears; `loaded VALIDATION_SUITE`). End-to-end
> CI-green for the full `website build` (stages 3-6) is still pending the
> `website-deploy.yml` re-run — this pipeline has never been green in CI, so further
> downstream failures may surface and would be tracked separately.

## Symptom

`pnpm rtx website build` (the full docs pipeline) fails at **stage 3 (suite-data)**:

```
Error: @ts-runtypes/devtools: 1678 unsupported-type errors — build halted.
website build: scripts/website/suite-data/export-validation.mjs failed
```

This is the step that generates `gendocs/*-suite.json` for the docs site. It is the
**only** reason the manually-triggered `website-deploy.yml` cannot complete.

## It is NOT arm64, NOT the resolver, NOT a regression from the runner change

- Reproduces **identically on x64 Linux** (1678 errors) and arm64 Linux CI — arch-independent.
- The resolver is behaving **correctly**: the "errors" are the test suite's *intended*
  negative cases. Diagnostic tally over the 1678 (captured via a customLogger, since
  `export-validation.mjs` sets `logLevel:'error'` and suppresses them):
  `VE002` (Cannot validate `Unsupported`), `NE001`, and the JSON/binary families
  `PJ/RJ/SJ/PJS/TB/FB 00x`, `VL002` — all from files like
  `packages/ts-runtypes/test/suites/validation/Atomic.ts` and
  `packages/ts-runtypes/test/features/nonEnumerableGuard.test.ts`.

## Root cause

`loadSuiteWithPlugin` in both suite-data exporters configures the plugin with
`tsconfig: 'tsconfig.test.json'`, whose `buildStart` scan covers the **entire**
`packages/ts-runtypes/test/` tree — which deliberately contains ~1678 unsupported-type
NEGATIVE fixtures. The plugin's `failOnError` **defaults to `true`**
(`unplugin.ts`: `const failOnError = options.failOnError !== false`), so those expected
Error-severity diagnostics halt the build.

## Why it was never caught

The full `pnpm rtx website build` (with the suite-data exporters) runs **only** in
`website-deploy.yml`, which had never successfully run before. The release gate runs
`rtx website container-build` + `rtx bench`, neither of which invokes the exporters.
Local manual builds skip them via `--no-bench` / reused suite-data, so the halt never
surfaced there either.

## Fix (verified locally)

Pass `failOnError: false` to `runtypesPlugin(...)` in the `loadSuiteWithPlugin` of:

- `scripts/website/suite-data/export-validation.mjs`
- `scripts/website/suite-data/export-serialization.mjs`

These are **data-export passes** that intentionally load suites full of unsupported-type
cases to document/measure them — the Error diagnostics are the data, not a build breaker.
The real build lanes (the site build, user code) keep `failOnError` at its default `true`.

Verified: with `failOnError:false`, `ssrLoadModule(validation/index.ts)` returns the suite
(12 categories) with no halt.

### Secondary (optional, not required)

`buildStart` scans the whole `tsconfig.test.json` program, including files unrelated to the
exported suite (e.g. `nonEnumerableGuard.test.ts`). A narrower, suite-scoped tsconfig would
cut wasted scanning, but is a larger change; `failOnError:false` is the minimal correct fix.

## Also verify

- `scripts/website/suite-data/website-data.mjs` — confirm it doesn't hit the same halt.
- After fixing, run the full `pnpm rtx website build` in CI (website-deploy.yml) to confirm
  stages 3-6 complete end-to-end (this pipeline has never been green in CI).
