# Release-branch promotions — freeze release scope when the team grows

## Status

Parked by design — decided 2026-07-19 while cutting v0.10.0 (the first
merge-commit promotion). The current model is deliberate and fine for a single
maintainer; implement this only when more people are landing on `main`
concurrently. No process change now.

## Current model (works today)

A release PR is `main → prod` with the head literally `main` (no intermediate
branch), merged with "Create a merge commit" — see the
[release-to-prod skill](../../.claude/skills/release-to-prod/SKILL.md) and
[SETUP.md → Cutting a release](../../SETUP.md). Guards:
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

## Proposed model — cut a release branch

1. When the bump PR lands, cut `release/vX.Y.Z` from the chosen `main` commit.
2. Open the release PR as `release/vX.Y.Z → prod` instead of `main → prod`.
3. If the gate finds problems, fix **on `main` first** (normal PR), then bring
   the fix over — see "Keeping prod main-pure" below. Scope stays explicit.
4. Merge into `prod` with a merge commit, exactly as today. Delete the branch
   after the tag exists.

## Keeping prod main-pure

The invariant that keeps future promotions conflict-free is **patch identity**,
not SHA identity: every commit reaching `prod` must exist *verbatim* in `main`
(git merges identical patches from both sides cleanly; the pre-0.10.0 conflicts
came from divergent edits, not copies).

- **Hard rule — never author a commit on the release branch.** A release-only
  patch is worse than a conflict: the next promotion's three-way merge counts it
  as a prod-side change against the base, so it silently persists in every
  future prod state even though `main` never had it. Every fix lands on `main`
  via a normal PR first.
- **Tactic A — re-cut (SHA-pure):** move `release/vX.Y.Z` forward to a later
  `main` commit containing the fix. Prod ancestry stays literally main commits
  plus merge commits; scope control is by cut point only (you take everything
  up to that commit). Default when `main` hasn't accumulated unrelated risk.
- **Tactic B — `git cherry-pick -x <main-sha>` (patch-pure):** copies exactly
  one main commit, provenance stamped by `-x`. SHAs differ but patches are
  verbatim, so future merges reconcile them cleanly. Mechanically checkable:
  `git cherry origin/main release/vX.Y.Z` must show no `+` lines (every
  release-branch commit has a patch-equivalent in `main`) — a candidate gate
  job when this model ships.

Everything else composes unchanged: the merge-commit rule, `merge-shape`,
`version-fresh`, the ruleset, and the ancestry invariant all hold — a release
branch carries only main-verbatim content, so `prod` still only ever receives
merge commits of main-lineage patches, and future promotions stay
conflict-free.

## Implementation checklist (when triggered)

- [ ] Update the [release-to-prod skill](../../.claude/skills/release-to-prod/SKILL.md)
      Phase 2: create `release/vX.Y.Z` at the bump commit, open the PR from it,
      and define the fix-forward path (fix on `main`, cherry-pick onto the
      release branch) replacing "the PR refreshes itself".
- [ ] Update [SETUP.md → Cutting a release](../../SETUP.md) step 2 and
      [CLAUDE.md](../../CLAUDE.md)'s git-workflow exception wording
      (head=`release/vX.Y.Z`, still merge-commit-only into `prod`).
- [ ] Decide branch lifecycle: delete after tag, or keep for hotfix lines
      (`release/vX.Y.Z` → patch releases) — likely delete until hotfixes are
      actually needed.
- [ ] Ruleset: nothing to change (`prod` rules key on the base branch), but
      consider a `release/*` ruleset (block force pushes) if branches live
      longer than a day.
- [ ] Optional gate job on release PRs: `git cherry origin/main <head>` with no
      `+` lines — mechanically enforces the main-pure rule above.
