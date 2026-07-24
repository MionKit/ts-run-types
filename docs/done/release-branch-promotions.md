---
type: chore
spec: full-plan
status: done
created: 2026-07-19
completed: 2026-07-24
---

# Release-branch promotions — freeze release scope when the team grows

## Status

**Implemented 2026-07-24** on branch `claude/release-branch-promotions-docs-djy6t4`.
Originally parked by design (decided 2026-07-19 while cutting v0.10.0, the first
merge-commit promotion) for a single maintainer. The reconciled checklist at the
bottom records exactly what shipped.

## Prior model (what this replaced)

Before this change, a release PR was `main → prod` with the head literally `main`
(no intermediate branch), merged with "Create a merge commit". Guards:
[publish.yml](../../.github/workflows/publish.yml)'s `merge-shape` job (prod
advances only by true merge commits), [pre-publish.yml](../../.github/workflows/pre-publish.yml)'s
`version-fresh` check, and the prod ruleset (PR required, required status
checks, merge-method restriction).

## The problem once multiple people contribute

The release PR's head being `main` means the PR is a *live view*, not a
snapshot:

- **No scope control.** Anything merged to `main` between opening the release
  PR and clicking merge silently joins the release — including work the release
  owner never reviewed as release content.
- **Gate churn.** Every push to `main` refreshes the PR and restarts the
  ~35-minute release gate; on a busy `main` the gate may never stay green long
  enough to merge.
- **Changelog drift.** The curated CHANGELOG section describes the commits at
  bump time; late arrivals ship undocumented.

## The model that shipped — cut a release branch

1. When the bump PR lands, cut `release/vX.Y.Z` from the chosen `main` commit.
2. Open the release PR as `release/vX.Y.Z → prod` instead of `main → prod`.
3. If the gate finds problems, fix **on `main` first** (normal PR), then re-cut
   the branch at a `main` commit containing the fix — see "Keeping prod
   main-pure" below. Scope stays explicit, controlled by the cut point.
4. Merge into `prod` with a merge commit, exactly as today. Delete the branch
   after the tag exists.

## Keeping prod main-pure

- **Hard rule — never author a commit on the release branch.** A release-only
  patch is worse than a conflict: the next promotion's three-way merge counts it
  as a prod-side change against the base, so it silently persists in every
  future prod state even though `main` never had it. Every fix lands on `main`
  via a normal PR first.
- **The one fix-forward move — re-cut the branch.** Move `release/vX.Y.Z`
  forward to the later `main` commit containing the fix (`git branch -f` +
  `git push --force-with-lease`). The branch is always a frozen **prefix of
  `main`**, so prod's ancestry stays literally main commits plus merge commits;
  scope is controlled by the cut point (you take everything up to that commit).
  Deliberately **no cherry-picking**: copied commits would merge cleanly
  (identical patches reconcile) but would put non-`main` SHAs into prod's
  ancestry — one strategy, zero ambiguity.
- Mechanically checkable: the release branch tip must be an ancestor of
  `origin/main` (`git merge-base --is-ancestor <head> origin/main`).

Everything else composes unchanged: the merge-commit rule, `merge-shape`,
`version-fresh`, the ruleset, and the ancestry invariant all hold — a release
branch is a frozen prefix of `main`, so `prod` still only ever receives merge
commits of `main` commits, and future promotions stay conflict-free.

## Implementation — what shipped (2026-07-24)

- [x] **Rewrote the [release-to-prod skill](../../.claude/skills/release-to-prod/SKILL.md)
      to the new model.** Phase 2 now cuts `release/vX.Y.Z` at the bump commit and
      opens the PR from it; fix-forward is "land on `main`, then re-cut the branch
      forward" (`git branch -f` + `git push --force-with-lease`), replacing "the PR
      refreshes itself"; the mergeable-rule corollary, the "when things go wrong"
      table (new `main-ancestor` row), the hard-rules recap, and Phase 3 (delete the
      branch after the tag) were all updated end-to-end.
- [x] Updated [SETUP.md → Cutting a release](../../SETUP.md) step 2 (cut + open from
      `release/vX.Y.Z`; re-cut to fix forward) and step 4 (delete the branch after the
      tag), plus [CLAUDE.md](../../CLAUDE.md)'s git-workflow exception (head is a frozen
      `release/vX.Y.Z` branch, still merge-commit-only into `prod`, never author a
      commit on it).
- [x] **Added the required gate job** `main-ancestor` to
      [pre-publish.yml](../../.github/workflows/pre-publish.yml) alongside
      `version-fresh`: it checks out the PR head, fetches `origin/main`, and fails
      unless `git merge-base --is-ancestor <head> origin/main`. Also fixed the
      now-stale `version-fresh` error string (it assumed the head=`main` auto-pickup).
      **Manual step remaining:** add the `release head is an ancestor of main` check to
      the prod ruleset's required status checks — a GitHub *Settings → Rules* admin
      action that cannot be done from a repo file (documented in SETUP.md + the skill).
- [x] **CI / workflows audit — the "no other changes" analysis still holds**
      (re-verified 2026-07-24): [pre-publish.yml](../../.github/workflows/pre-publish.yml)
      fires on `pull_request: branches: [prod]` (base branch — a `release/vX.Y.Z` head
      triggers it unchanged), [publish.yml](../../.github/workflows/publish.yml) on
      `push: branches: [prod]`, website-deploy / post-publish are manual dispatches on
      the `prod` ref, and `ci.yml` is `main`-only (never runs on `release/*` pushes).
      The only workflow addition was the `main-ancestor` job.
- [x] **Branch lifecycle: delete after the tag exists** (the spec's recommended
      default). Hotfix lines (keeping `release/vX.Y.Z` for patch releases) are deferred
      until hotfixes are actually needed.
- [x] Ruleset: no repo-file change (`prod` rules key on the base branch). Note: a
      `release/*` ruleset that *blocks* force-pushes (the spec's original "consider")
      would **break re-cutting**, since fix-forward re-cuts the branch with
      `--force-with-lease` — so it is deliberately NOT added; any future `release/*`
      protection must still permit maintainer force-with-lease pushes.
