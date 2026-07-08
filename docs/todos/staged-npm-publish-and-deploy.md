# Staged npm publish + website-deploy split

**Status:** todo (design agreed; not started)
**Created:** 2026-07-08
**Scope:** `.github/workflows/publish.yml` + `website-deploy.yml` (new), `scripts/release/publish-tarballs.mjs` + a new `stage-approve` helper, `SETUP.md` (publishing runbook), and one-time npmjs.com trusted-publisher config (external). No package/runtime code.

> **Separate track** from the pre-publish e2e units (① [harness](./prepublish-e2e-1-harness.md), ② [feature matrix](./prepublish-e2e-2-feature-matrix.md)) — this touches the **publish pipeline**, not the e2e fixture, so it's **independent**. Ship as its own focused PR — earlier if publish-security is the more urgent need, otherwise after the e2e work. Highest real-world risk (a botched flow breaks an actual release) + external setup prerequisites, so keep it isolated.

## Context / the problem

Two coupled problems in the release pipeline:

1. **The npm publish credential requires 2FA**, which can't run unattended in CI —
   so an automated `npm publish` either needs a 2FA-exempt token (weaker) or can't
   run at all.
2. Adopting **staged publishing** (the fix for #1) means the current deploy gating
   in [`publish.yml`](../../.github/workflows/publish.yml) (`deploy-website`
   `needs: publish-npm`) would fire *before* the packages are approved/live.

This unit reworks publish + deploy around npm's two GA features so CI publishes
safely (no long-lived token) and a human approves with 2FA, then triggers the
deploy.

## Publish model — staged publishing + trusted publishing (OIDC)

This resolves the 2FA problem **without** weakening security or baking an
interactive-2FA token. Two GA npm features compose exactly for this:

- **Trusted Publishing (OIDC)** — npm ↔ GitHub trust via OIDC; **no `NPM_TOKEN`**.
  Short-lived per-workflow identity, automatic provenance. Needs npm ≥ 11.5.1 and
  `permissions: id-token: write` (the `publish-npm` job in
  [`publish.yml`](../../.github/workflows/publish.yml) already grants it). One-time
  npmjs.com config: register the trusted publisher (repo `MionKit/ts-run-types`,
  workflow `publish.yml`) **per published package**.
- **Staged publishing** — `npm stage publish` uploads to a **stage queue** and
  does **not** require 2FA, so CI can stage unattended. A maintainer then
  **approves** the staged version with a **live 2FA challenge** (npmjs.com queue
  or the npm CLI). The approval is "proof of presence" and **cannot** be done by a
  token, OIDC, or any non-interactive path — only a human 2FA. Needs npm ≥ 11.15.0
  / Node ≥ 22.14.0 (CI runs Node 26 — verify the bundled npm is ≥ 11.15.0; add
  `npm i -g npm@latest` if not).

Configure the trusted publisher with **stage-only permissions** (allow
`npm stage publish`, disallow `npm publish`). Then *every* CI publish is forced
through the stage queue → a maintainer must 2FA-approve before anything goes live.
This is npm's own recommended maximum-security posture and is exactly the
"publish to staged, then manually approve" the maintainer wants.

### Changes

| File | Change |
|------|--------|
| [`scripts/release/publish-tarballs.mjs`](../../scripts/release/publish-tarballs.mjs) | `npm publish` → `npm stage publish` (keep the dependency-safe order: binaries → launcher → FE). Provenance is automatic under OIDC — drop the explicit token auth (`authPublicRegistry`) for the CI/OIDC path; keep a `--registry` path for the local verdaccio e2e (which stays a plain publish into the throwaway registry, unaffected by staging). |
| [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml) `publish-npm` | Remove `NPM_TOKEN` (env + secret usage). Keep `id-token: write`. Run `npm stage publish` via the script. Keep the preflight (refuse to re-stage an existing version) + idempotent tag guard. **The GH `environment: release` reviewer gate becomes complementary** — the authoritative human gate is now npm's 2FA approval. |
| **Docs / runbook** | A new manual step: after the `publish-npm` job stages everything, a maintainer reviews the npm stage queue and approves with 2FA (npmjs.com or `npm stage`). Only then are the packages live; only then does the website deploy make sense. Document in `SETUP.md` → publishing. |
| Repo secrets | `NPM_TOKEN` can be deleted once OIDC is verified. Register the trusted publisher on npmjs.com for **each** package (`@ts-runtypes/core`, `-devtools`, `-bin`, and every `@ts-runtypes/binary-*`). |

### Stage-approval is per-package, NOT atomic — approve leaves-first (investigated 2026-07-08)

Confirmed against the [npm-stage CLI reference](https://docs.npmjs.com/cli/v11/commands/npm-stage/):
`npm stage approve`/`reject` take a **single `<stage-id>`** — there is **no
batch/group/atomic approval and no "release" grouping**. Each staged package is
independent, and **approving one publishes THAT package to the registry
immediately** ("Approve a staged package, publishing it to the npm registry").
Staging takes any token and no 2FA; **approving prompts for 2FA**
("The act of staging does not prompt for 2FA … the act of approving will").

⇒ So during a multi-package release the registry is briefly **partially live**
while you approve one id at a time, and the dependency-ordering concern is
**real** and must be in the runbook: **approve leaves-first, in the same order
[`publish-tarballs.mjs`](../../scripts/release/publish-tarballs.mjs) already
ranks** — every `@ts-runtypes/binary-<os>-<arch>` FIRST, then `@ts-runtypes/bin`
(launcher), then `@ts-runtypes/core` + `@ts-runtypes/devtools`. Approving the
launcher before its `binary-*` optional deps would open a window where a consumer
install resolves a launcher whose platform binary 404s.

**Helper (recommended):** a new `rtx release stage-approve` lists this version's
pending stage-ids sorted by that same `rank()` and drives `npm stage approve <id>`
in dependency order (npm prompts for the 2FA OTP per id). Turns "approve N ids in
the right order" into one guided, correctly-ordered pass instead of hand-copying
stage-ids from the npmjs.com queue.

### Deploy gating — split into a manually-triggered `website-deploy.yml` (decided 2026-07-08)

Staging breaks the current wiring: `deploy-website` does `needs: publish-npm`, but
under staging `publish-npm` finishing means **"staged," not "live"** — it would
deploy the site *before* the packages are approved. And **npm does not fire a
usable publish webhook** for this account/setup (checked by the maintainer), so an
automated go-live → deploy trigger is off the table.

**Decision: move the deploy into its own `website-deploy.yml`, triggered manually
from the GitHub Actions UI.**

- **NEW** `.github/workflows/website-deploy.yml`, `on: workflow_dispatch` (optional
  `version` input, for the deploy log only — the docs site builds from the repo,
  not from an installed npm version).
- `environment: production` (unchanged — it holds the `CLOUDFLARE_*` secrets, and
  its required-reviewer gate is the deploy guard).
- Steps: lift the existing `deploy-website` job verbatim — checkout (recursive
  submodules) → `bootstrap` → `pull-shared-image` → `pnpm rtx website build` →
  wrangler `pages deploy`.
- **Remove `deploy-website` from [`publish.yml`](../../.github/workflows/publish.yml).**
  The publish run now ends at "packages staged"; the maintainer approves the
  stage-ids (2FA, leaves-first), then clicks **Run workflow** on
  `website-deploy.yml`. One deliberate manual step, zero infra, no new secret.

Rejected alternatives, for the record: **(C) poll-until-live** (`npm view … until
it resolves` — hacky, still tied to the publish run) and **(A) npm-hook →
Cloudflare Worker → `repository_dispatch`** (ruled out — npm fires no usable
publish hook here; it would also have needed per-package debounce + a stored
GitHub token + a silent-failure fallback).

## Open decisions / to verify

1. **Bundled npm ≥ 11.15.0 on Node 26 runners?** If not, add `npm i -g npm@latest`.
2. ~~Stage-approval atomicity~~ **Resolved: per-package, non-atomic** — approve
   leaves-first (above). Remaining: build the `rtx release stage-approve` helper.
3. ~~Deploy trigger~~ **Resolved: manual `workflow_dispatch` on a new
   `website-deploy.yml`** (env-gated `production`); `deploy-website` removed from
   `publish.yml`. The webhook automation is **ruled out** — npm fires no usable
   publish hook here.

## Acceptance criteria

- [ ] `publish.yml` publishes with **no `NPM_TOKEN`** (OIDC), stages via
      `npm stage publish`, and a documented manual 2FA approval promotes to live.
- [ ] Trusted publisher registered on npmjs.com for every published package
      (stage-only permissions).
- [ ] `rtx release stage-approve` walks the pending stage-ids leaves-first.
- [ ] Provenance still attached (automatic under OIDC).
- [ ] `website-deploy.yml` exists (`workflow_dispatch`, `environment: production`);
      `deploy-website` removed from `publish.yml`.
- [ ] Docs updated: `SETUP.md` → publishing + the approval runbook.
- [ ] On completion, `git mv` this spec to `docs/done/` (or `docs/partially/`).

## Sources

- npm staged publishing: <https://docs.npmjs.com/staged-publishing/> ·
  <https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/>
- npm trusted publishing (OIDC): <https://docs.npmjs.com/trusted-publishers/> ·
  <https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/>
</content>
