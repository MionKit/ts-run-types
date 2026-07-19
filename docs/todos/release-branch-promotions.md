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
3. Cherry-pick (or rebase) release-critical fixes from `main` onto the release
   branch if the gate finds problems — scope stays explicit.
4. Merge into `prod` with a merge commit, exactly as today. Delete the branch
   after the tag exists.

Everything else composes unchanged: the merge-commit rule, `merge-shape`,
`version-fresh`, the ruleset, and the ancestry invariant all hold — a release
branch is a frozen prefix of `main` (plus explicit cherry-picks), so `prod`
still only ever receives merge commits of main-lineage content, and future
promotions stay conflict-free.

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
