# Release pipeline: first-run fixes + temporary e2e relaxation

**Status:** the 3 red gate jobs (website-build, e2e-container, e2e-win32) are
FIXED on `fix/release-pipeline-first-run`; removing the `continue-on-error`
relaxations is gated on one green `workflow_dispatch` gate run.

## Context

`publish.yml` (push → `prod`) had **never run successfully** — every attempt
(incl. the 2026-07-05 `prod` push, before the 0.9.x line) ended in
`startup_failure`, so the whole `release-gate.yml` reusable workflow was never
exercised. Bringing the 0.9.1 release to `prod` surfaced a chain of latent
bugs, one per gate job. `build` (packs + validates the packages) and `smoke`
(binary exec) pass; the rest were broken.

## Fixed (committed on the 0.9.1 line)

1. **Reusable-workflow permission cap** — `publish.yml` + `pre-publish.yml`
   granted only `contents: read`, but `release-gate.yml`'s `e2e` /
   `benchmarks` / `website-build` request `packages: read` (GHCR pull). A
   called workflow can't exceed the caller's permissions → `startup_failure`
   before any job ran. Granted `packages: read` on each caller's `gate` job.
2. **`website-build` missing pnpm/node** — the job runs `pnpm rtx website
   container-build` on the host but never set up pnpm → `pnpm: command not
   found`. Added `pnpm/action-setup` + `setup-node`, mirroring `e2e`.
3. **`benchmarks` wrong command** — ran `pnpm rtx bench bench`; the `rtx` CLI
   has no `bench` sub-target (`unknown bench target 'bench'`). Fixed to
   `pnpm rtx bench` (the default verb).
4. **verdaccio 413 (host-npx e2e)** — the per-platform `ts-runtypes-binary-*`
   tarballs exceed verdaccio's 10mb default, 413-ing the local publish on
   mac/win. Set `max_body_size: 100mb` in `.github/verdaccio.yaml`. (Verified:
   e2e darwin-arm64 passed in run #5.)
7. **`publish-npm` setup-node fails on pnpm** — this job is deliberately
   pnpm-free (runs `node scripts/rt.mjs`), but `actions/setup-node@v5` defaults
   `package-manager-cache: true`, auto-detects the `packageManager` field
   (pnpm), and fails (`Unable to locate executable file: pnpm`), skipping the
   whole stage-publish. Set `package-manager-cache: false` on the step.

## RESOLVED — CI reverted to NPM_TOKEN auth

8. **`stage-publish` failed `ENEEDAUTH`** (run #6, commit `428d0b3b`) — the gate
   passes and `publish-npm` reached the real publish, but `npm stage publish`
   errored `ENEEDAUTH` (`You need to authorize this machine using npm login`).
   Cause: the OIDC switch (commit `ecebc3cf`) was unintended and Trusted
   Publishing was never configured on npm. Per maintainer, **reverted CI to token
   auth**: the `publish-npm` job writes `secrets.NPM_TOKEN` to `~/.npmrc` before
   `npm stage publish` (`.github/workflows/publish.yml`). `NPM_TOKEN` must be an
   **automation/granular** token (2FA-bypassing) so the unattended stage works;
   0.9.0's packages already exist, so this only stages 0.9.1 for later approval.
   Env registry (`scripts/lib/env.mjs`) + `publish-tarballs.mjs` comments updated
   to match.

- **Tag push (`v0.9.1`)** — not yet reached (runs after stage-publish). May 403
  under the tag-protection ruleset (a plain tag push already 403'd for the app
  token); it's after staging, so staging can succeed even if tagging fails.

## Fixed on `fix/release-pipeline-first-run` (2026-07-14)

The 2026-07-11 prod publish (run #6, success overall) staged npm but left THREE
gate jobs red — all `continue-on-error`, so they never blocked staging, but they
are why "the website and other tasks failed". Root causes + fixes:

5. **`e2e` linux-x64 (container) — GHCR `denied`, NOT a missing image.** The
   `ghcr.io/mionkit/tsrt-e2e:latest` package EXISTS (pushed 2026-07-09) but is
   PRIVATE and not granted to the repo, so the CI `GITHUB_TOKEN` is denied it —
   while `tsrt-website` (same private, `repository:null` state) is readable
   (a per-package Actions-access difference the package API doesn't expose). Fix:
   authenticate the GHCR pulls with the **`GHCR_PAT`** repo secret
   (read:packages) instead of `GITHUB_TOKEN`. `pull-shared-image` takes a
   `password` input (falls back to `GITHUB_TOKEN` when empty, e.g. fork PRs); the
   release gate / post-publish / website-deploy pass `secrets.GHCR_PAT`, and the
   two gate callers gain `secrets: inherit`. No image re-push needed — verified
   the PAT pulls tsrt-e2e. `scripts/lib/env.mjs` documents the CI-pull role.
6. **`website-build` (Nuxt) — missing `nuxt prepare` on a fresh `.nuxt` volume.**
   `nuxt build`/`generate` transform first-party `.ts` through Vite's esbuild,
   whose tsconfck resolves `tsconfig.json` → `extends: ./.nuxt/tsconfig.json`. On
   a fresh `.nuxt` volume (every CI run) that file doesn't exist yet →
   `TSConfckParseError`. Fix: run `nuxt prepare` first (the standard Nuxt
   `postinstall`, which never ran here — deps are baked, config bind-mounted;
   locally it was masked by the persistent `.nuxt` volume a prior `nuxt dev`
   populated). Fixing that exposed two more latent `cmdBuild` bugs `cmdGenerate`
   already handled: OOM on the ~2GB default heap, and `EBUSY` rmdir'ing the
   bind-mounted `.output`. `cmdBuild` now mirrors `cmdGenerate` (prepare +
   `--max-old-space-size=6144` + build into an internal `.output`, copy to the
   host mount). `nuxt prepare` added to `cmdGenerate` too — the DEPLOY
   (`nuxt generate`) had the same latent bug.

   Once the tsconfig error was cleared, a SECOND CI failure surfaced (this job had
   never built far enough to hit it): `Could not load .../ts-runtypes-dist/index.js`.
   `container-build` prebuilds the playground on the host (`build-playground.mjs`:
   resolver WASM + a vendored ts-runtypes dist `nuxt build` imports), which needs Go
   + the tsgolint submodule + deps. The gate's `website-build` job checked out
   WITHOUT submodules and never ran `bootstrap`, so the WASM `go build` failed and
   the vendor dist was never produced. Fix: the job now does
   `checkout submodules:recursive` + `bootstrap` + `cache-playground-wasm (plain)`
   and builds with `RT_GARBLE=0` — mirroring `website-deploy.yml` / `ci.yml`'s
   website jobs. Verified green locally (the whole chain from a cleared cache).
9. **`e2e` win32-x64 (host-npx) — `spawnSync npm ENOENT`** (newly found; not in
   the original list). `npm` is `npm.cmd` on Windows and can't be exec'd without
   a shell. Every npm/npx spawn in `scripts/release/e2e.mjs` now passes
   `shell: onWindows` (a no-op elsewhere). Can't be verified on a non-Windows
   host — CI confirms.

Also: `release-gate.yml` gains a `workflow_dispatch` trigger, so the whole gate
(build + e2e + smoke + benchmarks + website-build) can run on demand on any
branch with no publish — `gh workflow run release-gate.yml --ref <branch>`. That
is the "run the full workflow except the publish task" path.

`ci.yml`'s website smoke still pulls `tsrt-website` with `GITHUB_TOKEN` (works
today; runs on fork PRs where secrets are unavailable) — left as-is on purpose.

## Verification — gate now fully blocking; confirm green, then drop the temp trigger

The `continue-on-error` relaxations on `e2e` + `website-build` are REMOVED — the
gate is fully blocking again (the intended state). To confirm it green in real CI
BEFORE merging, `pre-publish.yml` carries a TEMPORARY `push:` trigger on
`fix/release-pipeline-first-run`, so every push runs the whole gate (build + e2e +
smoke + benchmarks + website-build, NO publish). `benchmarks` was fixed (#3) and
verified green in run #4.

**Checklist:**
- [x] `tsrt-e2e` reachable by CI (#5) — via `GHCR_PAT` auth (image already on GHCR).
- [x] Nuxt `.nuxt/tsconfig.json` build fixed (#6) — verified green locally.
- [x] win32 host-npx npm spawn fixed (#9) — code fix (CI-verified only).
- [x] Removed the two `continue-on-error: true` lines from `release-gate.yml`.
- [ ] Push the branch; confirm the gate (e2e all 3 OS + website-build) is GREEN.
- [ ] Revert the TEMPORARY `push:` trigger in `pre-publish.yml`.
- [ ] Merge to main; verify a subsequent `prod` publish gates on both again.
