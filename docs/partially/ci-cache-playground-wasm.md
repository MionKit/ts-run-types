# CI rebuilds the playground WASM on every container-smoke run

**Status:** partially done (PR #205 — the `ci.yml` smoke lane; two lower-frequency
jobs remain).
**Created:** 2026-07-09
**Found while:** diagnosing the `container smoke` job failure that led to splitting
the e2e image out of `tsrt-website` (branch `ci/split-e2e-image`). This is a
SEPARATE inefficiency surfaced along the way — not the disk-exhaustion cause.

## Resolved in PR #205 (the `ci.yml → smoke` lane)

Implemented the fix plan for the container-smoke job — the one the title calls
out and the one that runs on every website PR:

- `actions/cache` on `.cache/rt-wasm`, keyed on the WASM inputs
  (`ts-go-runtypes/cmd/ts-runtypes-wasm/**`, `internal/**`, `go.mod`, `go.sum`,
  `container/website/scripts/build-playground.mjs`, `scripts/lib/garble.mjs`,
  `.github/actions/bootstrap/**`), prefixed `rt-wasm-plain-`.
- On a cache hit, `touch .cache/rt-wasm/.wasm-stamp` so the mtime gate
  short-circuits (`wasm up to date`) instead of rebuilding-to-compare — the
  "bump the STAMP after restore" option from the fix plan.
- Build the smoke's WASM plain (`RT_GARBLE=0`): obfuscation isn't needed to prove
  a page serves, and a plain build is faster on a cache miss. The deployed site
  still builds its own garbled WASM in the release/deploy workflow.

Verified locally: touching the stamp then running `build-playground` with
`RT_GARBLE=0` logs `wasm up to date` and skips the build.

## Remaining (why this is `partially`, not `done`)

The same cache pattern is NOT yet applied to the two other jobs the fix plan
lists — `release-gate.yml → website-build` and `website-deploy.yml`. They still
rebuild the WASM (garbled, since they ship the real artifact). Extending the
cache there is the same shape (an `actions/cache` step keyed the same way, minus
`RT_GARBLE=0`), but those are release-critical workflows and were out of scope
for the smoke-speedup PR.

## Symptom

Every `Website serves-a-page smoke` step (`pnpm rtx website check`) logs:

```
==> wasm inputs changed - building reference (GOOS=js GOARCH=wasm, garble -tiny) ...
```

and recompiles the resolver to WASM from scratch, adding minutes to the job — on
every run, regardless of whether the Go tree or tsgolint actually changed.

## Root cause

The WASM staleness gate in
[`container/website/scripts/build-playground.mjs`](../../container/website/scripts/build-playground.mjs)
keys freshness off the on-disk cache dir `.cache/rt-wasm/` (the `RAW_WASM` bytes +
the `.wasm-stamp` freshness anchor):

```js
const wasmMaybeStale = () =>
  !existsSync(RAW_WASM) || !existsSync(STAMP) || modeChanged() || anyNewer(WASM_INPUTS, mtime(STAMP));
```

`.cache/rt-wasm/` is **git-ignored** (`.gitignore` → `/.cache/rt-wasm/`) and is
**not** part of any CI cache — the bootstrap action caches only `~/.cache/go-build`
+ `~/go/pkg/mod` (GOCACHE) and `~/go/bin/garble`. So on a fresh runner checkout
`RAW_WASM`/`STAMP` never exist → `wasmMaybeStale()` is ALWAYS true → the build runs
every time, then gzips. The restored GOCACHE makes the *compile* cheaper (tsgo
objects reuse) but the gate still shells out to `garble build` + gzips on each run.

Affected jobs (all that run `website check` / `website build` / `container-build`):
`ci.yml → smoke`, `release-gate.yml → website-build`, `website-deploy.yml`.

## Fix plan

Cache `.cache/rt-wasm/` across CI runs with `actions/cache`, keyed on the real WASM
inputs so it invalidates exactly when the bytes would change:

- **Key inputs:** `hashFiles('ts-go-runtypes/cmd/ts-runtypes-wasm/**', 'ts-go-runtypes/internal/**', 'ts-go-runtypes/go.mod', 'ts-go-runtypes/go.sum')` + the tsgolint pin (already resolved in the bootstrap action as `steps.tsgo.outputs.sha`) + a garble-mode marker (garbled vs plain change the bytes; see `MODE_MARKER`). Salt like the GOCACHE key so it can be rotated.
- **Path:** `.cache/rt-wasm/` (holds `RAW_WASM`, `RAW_GZ`, `WASM_EXEC`, `SOURCES_JSON`, `.wasm-stamp`, `.wasm-garble`).
- **Where:** either fold it into `.github/actions/bootstrap` (guarded so non-website jobs skip it) or add a dedicated step in the three website jobs before `pnpm rtx website …`.
- On a cache hit the mtime pre-check still fires; `git checkout` sets fresh mtimes on the Go inputs, so restored files can look "newer" than a restored STAMP. Either restore-with-preserved-mtime, or bump the STAMP after restore, or rely on the `go tool buildid` / content-hash second tier (`sameAsDisk`) to short-circuit to `wasm unchanged - skipped gzip`. Verify the tier-2 compare actually no-ops on a warm GOCACHE before relying on it.

**Acceptance:** a second smoke run with no Go/tsgolint change logs `wasm up to date`
(or `wasm unchanged - skipped gzip`) instead of `building reference …`, and the
step's wall time drops accordingly.

## Notes

- Independent of the e2e-image split; can land on its own.
- Garble output is byte-deterministic but carries no `go tool buildid`, so the gate
  content-hashes it (`sha256File`) in garble mode — a restored cache compares
  correctly either way.
