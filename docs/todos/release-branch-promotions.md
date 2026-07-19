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

## Implementation checklist (when triggered)

- [ ] **Rewrite the [release-to-prod skill](../../.claude/skills/release-to-prod/SKILL.md)
      to the new model — this spec is NOT implemented until the skill matches.**
      Phase 2 becomes: cut `release/vX.Y.Z` at the bump commit, open the PR
      from it; fix-forward becomes "land the fix on `main`, then re-cut the
      branch" (replacing "the PR refreshes itself"); update the hard-rules
      recap, the PR body template, and every workflow step the skill describes
      so an agent following it performs the new flow end-to-end.
- [ ] Update [SETUP.md → Cutting a release](../../SETUP.md) step 2 and
      [CLAUDE.md](../../CLAUDE.md)'s git-workflow exception wording
      (head=`release/vX.Y.Z`, still merge-commit-only into `prod`).
- [ ] Decide branch lifecycle: delete after tag, or keep for hotfix lines
      (`release/vX.Y.Z` → patch releases) — likely delete until hotfixes are
      actually needed.
- [ ] Ruleset: nothing to change (`prod` rules key on the base branch), but
      consider a `release/*` ruleset (block force pushes) if branches live
      longer than a day.
- [ ] Optional gate job on release PRs: fail unless the head is an ancestor of
      `origin/main` (`git merge-base --is-ancestor <head> origin/main`) —
      mechanically enforces the main-pure rule above.
