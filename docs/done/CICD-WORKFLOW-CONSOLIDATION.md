# CI/CD workflow consolidation — clean `main` / `prod` model

Status: **implemented** on branch `ci/workflow-consolidation` (2026-06-30). Pending: configure the repo secrets/environments (see below) and a first CI run to confirm green.
Scope: `.github/workflows/`, a few supporting scripts. No package/runtime code.

## What shipped

- **New** `ci.yml` (PR/push → main): a single `verify` job (Go + JS suites incl. fuzz, gofmt/vet, lint, typecheck, format) with the website + benchmark container smoke folded in as trailing **path-gated** steps (`dorny/paths-filter`), so the smoke reuses the same bootstrap + Go binary + dists instead of a second job that repeats them.
- **Renamed** `release-build-test.yml` → `release-gate.yml`; added a `version` `workflow_call` output, a `benchmarks` job, and a `website-build` job; bumped the `tarballs` artifact retention to 14 days; dropped the e2e `vite`/`vitest` pins (now in `e2e/package.json`).
- **Re-pointed** `pre-publish.yml` (PR → `prod`) and `publish.yml` (push → `prod`); folded the Cloudflare deploy into `publish.yml` as `deploy-website` (`needs: publish-npm`); added an npm preflight + idempotent tag guard; pinned the tag to the gate's `version` output.
- **Deleted** `benchmarks.yml`, `website.yml`, `website-publish.yml` (folded in).
- **Fixes:** `scripts/benchmarks.sh cmd_build` now accumulates competitor build failures and exits non-zero; `e2e/package.json` description corrected (no phantom `scripts/e2e-test.mjs`) and `vite`/`vitest` pinned as devDependencies.
- **Image strategy — CI never builds the shared image, it only PULLS it.** Every image-using job (the main-PR smoke, the gate's `benchmarks` + `website-build`, and the prod `deploy-website`) uses the `pull-shared-image` composite action: log in to GHCR with the built-in `GITHUB_TOKEN` (no secret; the job grants `packages: read`), pull `ghcr.io/mionkit/tsrt-website:latest`, tag it `tsrt-website:dev`, and **fail the job if the pull fails** (a missing/stale image is a signal to republish from local, not a silent slow rebuild). The image is produced and pushed **from local** (`scripts/podman-website.sh push`); it is not a CI artifact. For the pull to work the `ghcr.io/mionkit/tsrt-website` package must be readable by the repo's token (public, or org package granted to the repo). typia is skipped in the smoke (`RT_BENCH_NO_TYPIA`) until the image **bakes** typia's `.ttsc` native plugin (a local image change + republish); the prod `benchmarks` job runs typia.

## Why

The repo has six workflow files, but the branch model they encode does not match
reality. The real branches are `origin/main` and `origin/prod`; **there are no
`release/**` branches.** The result:

| File | Trigger today | Reality |
|------|---------------|---------|
| `release-build-test.yml` | `workflow_call` (reusable) | The real gate (Go + JS suites, build, 7-platform binaries, verdaccio e2e). Solid content. |
| `pre-publish.yml` | PR → `release/**` | **Dead** — no `release/**` branches exist |
| `publish.yml` | push → `release/**` | **Dead** — npm publish + tag + GH release never fire |
| `website-publish.yml` | push → `prod` | The only live auto-trigger. Deploys docs to Cloudflare **with no test/e2e/publish gate** |
| `benchmarks.yml` | `workflow_dispatch` | Disabled (manual-only) |
| `website.yml` | `workflow_dispatch` | Disabled (manual-only) |

Three structural problems:

1. **`main` has zero CI.** No lint, typecheck, test, or fuzz runs on any PR.
   (Fuzzing already runs inside `pnpm test` — the `*.integration.test.ts` specs
   match the vitest `test/**/*.test.ts` include and run at default iteration
   counts; the `:soak` scripts are the separate long runs.)
2. **The npm-publish pipeline is keyed to `release/**`, which does not exist** —
   so publishing is effectively dead code.
3. **The website deploy is decoupled from the publish gate** — a `prod` push
   ships docs even if the source suite would fail, and never publishes to npm.

## Goal

A clean model with **one workflow file per described pipeline**, plus one shared
reusable gate and the existing composite actions:

- **PR → `main`** = full lint / typecheck / test / fuzz gate (+ container smoke,
  path-gated). This is the "stable but development" gate.
- **PR → `prod`** = "pre-publish": full build + 7-platform e2e + benchmarks +
  website build. No publish, no secrets.
- **push → `prod`** = "publish": the *same* gate, then the two extra steps —
  publish to npm, then deploy the website to Cloudflare Pages. So
  "publish == pre-publish + extra step" is literally true.

## Target structure

```
.github/
  actions/
    bootstrap/            (keep — apply tsgolint patches, Go 1.26 + Node 24 + pnpm, install)
    verdaccio-publish/    (keep — throwaway local registry for the consumer e2e)
  workflows/
    ci.yml                # PR/push → main   : single verify job (lint, typecheck, test+fuzz, go test, gofmt/vet) + container smoke folded in as path-gated steps
    pre-publish.yml       # PR → prod         : uses release-gate.yml. No publish.
    publish.yml           # push → prod       : uses release-gate.yml → publish-npm → deploy-website
    release-gate.yml      # reusable (workflow_call): build + 7-platform e2e + benchmarks + website-build
```

**Delete** (folded into the above): `benchmarks.yml`, `website.yml`,
`website-publish.yml`. **Rename** `release-build-test.yml` → `release-gate.yml`
and extend it with the `benchmarks` + `website-build` jobs.

The reusable `release-gate.yml` is shared infrastructure (like the composite
actions), not a fourth "described workflow" — it keeps `pre-publish.yml` and
`publish.yml` DRY without the `if:`/`needs:` skip-propagation footguns a single
combined `release.yml` would invite (see Design notes).

## Per-file design

### `ci.yml` — gate on `main` (the big missing piece)

```yaml
on:
  pull_request: { branches: [main] }
  push:         { branches: [main] }   # post-merge confirmation
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  verify:          # ubuntu-latest — ONE job; the smoke is folded in as trailing path-gated steps
    - checkout (submodules: recursive) -> ./.github/actions/bootstrap
    - go test ./internal/...
    - gofmt -l cmd internal (fail if non-empty) + go vet ./cmd/... ./internal/...
    - pnpm test            # pretest builds bin/ts-runtypes + dists; runs the fuzz integration specs
    - pnpm run lint        # lerna run lint + typecheck
    - pnpm run check-format
    # --- container smoke: path-gated steps, reuse the bootstrap + binary + dists above ---
    - dorny/paths-filter (id: changes): `smoke` = container/** or driver scripts; `image` = a _deps manifest or the Containerfile
    - [if smoke] podman login ghcr.io (built-in GITHUB_TOKEN, best-effort, non-fatal)
    - [if smoke] pnpm run website:smoke   # RT_WEBSITE_USE_LOCAL set ONLY if `image` changed, else pull the prebuilt image
    - [if smoke] pnpm run bench:smoke     # RT_BENCH_USE_LOCAL   set ONLY if `image` changed, else pull (competitor deps incl. typia are baked in)
```

The smoke reuses `verify`'s bootstrap, Go binary, and dists rather than standing up
a second job that repeats that work, and PULLS the prebuilt shared image (deps
baked) instead of rebuilding it - only forcing a fresh local image build when the
baked deps themselves change. Falls back to a local build if the image can't be
pulled. This keeps the main fast-path quick while making the (rare) container-PR
smoke much cheaper than a from-scratch image build.

### `release-gate.yml` — reusable (`workflow_call`)

Today's `release-build-test.yml` jobs, plus two new ones so a prod PR runs
everything pre-publish should:

```
build         : full main gate (go test + gofmt/vet + pnpm test incl. fuzz + pnpm run lint + pnpm run check-format) + pnpm run build + build-binary-packages.mjs (7 platforms) + pack-artifacts.mjs -> upload `tarballs` artifact
e2e (matrix)  : linux-x64 / darwin-arm64 / win32-x64 -> verdaccio install of published pkgs -> npm test
exec-smoke    : linux-arm64 / linux-arm under QEMU -> ts-runtypes --version
benchmarks    : bootstrap -> benchmarks.sh prep -> pull prebuilt image -> bench/typecost   (CI never builds the image)
website-build : bootstrap -> static site build (prove `website:publish generate` compiles; no deploy)
```

Build-once contract: the publish path **downloads and reuses the exact
`tarballs` artifact** the e2e validated — it must never rebuild the binaries
(non-deterministic Go build output would mean npm ships different bytes than e2e
tested, and provenance would be a lie).

### `pre-publish.yml` — PR → prod

```yaml
on: { pull_request: { branches: [prod] } }
jobs: { gate: { uses: ./.github/workflows/release-gate.yml } }
```

No secrets, no publish, no `if:` — structurally safe even for fork PRs.

### `publish.yml` — push → prod

```yaml
on: { push: { branches: [prod] } }
concurrency: { group: release-prod, cancel-in-progress: false }   # shared so deploy can't race the publish
jobs:
  gate:           { uses: ./.github/workflows/release-gate.yml }
  publish-npm:    # needs: gate ; environment: release (protected reviewer gate)
    - download the `tarballs` artifact (do NOT rebuild)
    - preflight: fail early if `npm view ts-runtypes@$version` already exists
    - node scripts/publish-tarballs.mjs --provenance   (platform pkgs -> launcher -> FE)
    - git tag v$version (idempotent guard) -> git-cliff -> gh release create
  deploy-website: # needs: publish-npm ; environment: production
    - pnpm run website:publish generate (RT_WEBSITE_USE_LOCAL=1) -> wrangler pages deploy
```

Folding the website deploy in as `needs: publish-npm` fixes the decoupling:
docs only ship for a version that actually published green, and the shared
concurrency group stops the deploy racing the publish on the `prod` ref.

## Required secrets

Three GitHub repository secrets cover all three publish destinations (plus one
conditional for GHCR). Scope the publish secrets to the protected environments
(`release` / `production`) rather than the repo root where possible.

| Secret | Destination | Used by | What it is |
|--------|-------------|---------|------------|
| `NPM_TOKEN` | npm | `publish.yml` (`NODE_AUTH_TOKEN`) | npm **Automation** token with publish rights to all packages |
| `CLOUDFLARE_API_TOKEN` | Cloudflare | wrangler `apiToken` | API token with the **Cloudflare Pages: Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare | wrangler `accountId` | Cloudflare account ID (stored as a secret by convention) |
| ~~`GHCR_PAT`~~ | GHCR | **not needed in CI** | CI builds the shared image locally (`RT_WEBSITE_USE_LOCAL`); GHCR auth is a local-dev convenience only |

**npm — `NPM_TOKEN`:** an Automation access token (bypasses OTP, required for the
10-package sequential publish). Publish scope must cover `ts-runtypes`,
`ts-runtypes-devtools`, `ts-runtypes-bin`, and all seven
`ts-runtypes-binary-<os>-<arch>` packages, or a platform-package publish 403s
mid-sequence. The job also needs `permissions: id-token: write` (not a secret)
for npm provenance.

**Cloudflare — `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`:** the token is
created at Cloudflare dashboard -> My Profile -> API Tokens with the
"Cloudflare Pages: Edit" permission. One-time, not a secret: the Pages project
must exist first (`wrangler pages project create runtypes-docs` — the name is
hardcoded as `PAGES_PROJECT: runtypes-docs`).

**GHCR — usually no secret.** No workflow authenticates to GHCR today
(`website-publish.yml` runs with `RT_WEBSITE_USE_LOCAL=1` and builds locally). It
only matters for the planned `ci.yml` smoke job:
- Make the GHCR package (`ghcr.io/mionkit/tsrt-website`) **public** -> no secret,
  anonymous pulls work. **Recommended.**
- Keep it private -> authenticate the pull with either the built-in
  `GITHUB_TOKEN` + a job-level `permissions: packages: read` (same `MionKit`
  org, no secret to create — preferred), or a classic `GHCR_PAT` wired to the
  `GHCR_PAT` env var that `scripts/lib-ghcr.sh` already reads.
- Pushing/republishing the image (`benchmarks.sh push`, when
  `container/benchmarks/_deps` changes) needs `write:packages`; done locally via
  `GHCR_PAT` / `GHCR_PAT_FILE` env vars today, not a repo secret.

**Not secrets, just permissions:** the git tag push + `gh release create` use the
built-in `GITHUB_TOKEN` and only need the job-level `permissions: contents:
write` already present.

## Decisions

- **Container smoke on `main` = path-gated** (confirmed). It runs only when a PR
  touches `container/**` or the smoke scripts, not on every PR. Rationale:
  `bench:smoke` needs the full Go toolchain + cross-compiled Linux binary +
  bootstrapped submodules and sequentially builds ~5 competitors (typia takes
  minutes); `website:smoke` is fast only when the GHCR image is warm/pullable,
  else it silently falls back to a multi-minute local build. The `main`
  fast-path (lint/typecheck/test/fuzz) stays quick; full benchmarks + website
  build still run on every `prod` PR via the gate.
- **Design = reusable workflow (not a single combined `release.yml`).** A single
  file triggered on both `pull_request:[prod]` and `push:[prod]` invites
  `needs:`/`if:` skip-propagation bugs (a skipped need is not `success()`),
  fork-PR secret exposure, and concurrency races with the deploy. The reusable
  gate isolates secrets in `publish.yml` only and keeps `needs:` binary
  (success/fail), with no skip ambiguity.
- **Version-bump model.** CI does **not** run `lerna version`. `publish.yml`
  reads the already-bumped version from `lerna.json`, so **the release PR into
  `prod` must carry the version bump** (committed `lerna.json` + package.jsons).
  The local `scripts/publish.sh` diverges (interactive `lerna version`) and
  should become bump-only or be retired to avoid two sources of truth. No
  release-please/changesets exists; the bump is a manual PR step.
- **Soak fuzzing** is out of the three core files. If wanted, add a separate
  nightly `schedule:` cron workflow running the `:soak` scripts.

## Prerequisite fixes (small, fold into the migration)

- **`bench:smoke` exit codes** — `cmd_build` logs `build <name> FAILED` but
  continues and returns 0, so CI would report green on a broken competitor
  build. Accumulate failures and exit non-zero before using it as a gate.
- **Git tag idempotency** — guard `git rev-parse v$ver >/dev/null 2>&1 ||
  (git tag … && git push …)` so a publish re-run after a transient failure does
  not die on "tag already exists".
- **npm preflight** — `npm view ts-runtypes@$version` hard-fail before
  publishing any platform package (avoids a non-atomic half-publish when a bump
  was missed).
- **Pin the tag to the build job's `outputs.version`**, not a fresh `lerna.json`
  read in the publish job (drift if re-triggered after a bump).
- **Artifact retention** — `tarballs` is `retention-days: 3`; if the `release`
  environment approval is slower than that, the artifact expires and the publish
  job has nothing to download. Raise to ~14 days or document the approval SLA.
- **Phantom reference** — `e2e/package.json` description cites
  `scripts/e2e-test.mjs`, which does not exist; the real install is the inline
  `npm install` in the gate. Fix the description.
- **e2e tooling pins** — `vite@5.4.10` / `vitest@2.1.9` live only in the
  workflow YAML, divorced from the workspace pins and `ts-runtypes-devtools`
  peerDeps. Move them into `e2e/package.json` so a workspace bump cannot silently
  diverge the release-install test.
- **Unify bootstrap** — `benchmarks.yml` inlines Node 22 + its own setup;
  everything else uses the composite action on Node 24. Consolidate on the
  composite action.

## Branch protection (the other half — set in repo settings, not in YAML)

- **`main`**: require the `ci / verify` check before merge (the container smoke
  is part of that one job now, so there is no separate check to require).
- **`prod`**: require the `pre-publish` gate jobs; keep the `release`
  environment's required-reviewer gate on `publish-npm`.

## Migration checklist

1. Create `ci.yml` (single `verify` job; container smoke folded in as path-gated steps that pull the prebuilt image).
2. Rename `release-build-test.yml` -> `release-gate.yml`; add `benchmarks` +
   `website-build` jobs.
3. Re-point `pre-publish.yml` to `pull_request:[prod]`; keep it as a thin
   `uses:` of the gate.
4. Re-point `publish.yml` to `push:[prod]`; fold in the `deploy-website` job
   (from `website-publish.yml`) as `needs: publish-npm`; add the npm preflight +
   tag-idempotency guard + version pin.
5. Delete `benchmarks.yml`, `website.yml`, `website-publish.yml`.
6. Apply the prerequisite fixes above.
7. Add the three secrets; decide GHCR image visibility.
8. Set branch-protection required checks on `main` and `prod`.

## Open questions

- Confirm the version-bump source of truth (release PR carries the bump; retire
  or reduce `scripts/publish.sh`'s interactive `lerna version`).
- Do we want the nightly soak-fuzz cron as a deliberate fourth file?
- GHCR image visibility: make it public (simplest) or keep private + authenticate
  the smoke pull?
