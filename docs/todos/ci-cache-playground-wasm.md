# CI rebuilds the playground WASM on every container-smoke run

**Status:** todo
**Created:** 2026-07-09
**Found while:** diagnosing the `container smoke` job failure that led to splitting
the e2e image out of `tsrt-website` (branch `ci/split-e2e-image`). This is a
SEPARATE inefficiency surfaced along the way — not the disk-exhaustion cause.

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
