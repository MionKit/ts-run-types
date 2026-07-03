# Fix the `pj` noop-predicate false positive the renderer tripwire keeps catching

> **Status: TODO.** Pre-existing on `main` — found (and bisected) during PR
> #166 work, unrelated to that PR's changes. Not a fuzzer failure: the fuzz
> and test suites are green; this is the renderer's SOUNDNESS TRIPWIRE firing
> on every plugin scan of the JS test suites.

## The finding

Every vitest run that boots the Vite plugin prints:

```
ts-runtypes: noop-predicate mismatch for pj_X9VR731 (objectLiteral): IsNoopType claims
identity but the compiled body is not — shipping the live body; fix the predicate arm
to mirror the emitter
```

Emitted from the protective tripwire in
[internal/compiled/typefns/module.go](../../internal/compiled/typefns/module.go)
(~line 481): the `pj` (prepareForJson) family's `IsNoopType` predicate returns
TRUE (identity) for some objectLiteral type in the shared test-suite import
graph, while the compiled body for that same entry is NOT the identity — the
predicate has a FALSE POSITIVE for that shape.

## Why it matters (and why nothing is broken today)

Per the soundness contract (CLAUDE.md → noop elision): predicate true ⇒ body
is identity. A false positive would silently skip a transform — but the
renderer's tripwire catches the disagreement and ships the LIVE body, so
runtime behaviour is correct today. The cost is noise on stderr and, more
importantly, a predicate arm that disagrees with its emitter — the exact drift
the corpus test ([internal/resolver/noop_predicate_test.go](../../internal/resolver/noop_predicate_test.go))
exists to prevent, meaning the corpus has a coverage gap for this shape.

## What is known (verified during PR #166)

- Fires for `pj_X9VR731` — an objectLiteral entry somewhere in the shared
  test-util import graph (it fires even for a single unrelated suite file like
  `validation/Boolean.test.ts`, so the type comes from the common utils).
- Bisected: a binary built from the tree BEFORE the Currency/isCurrency
  commits (`154e4fc~1`) fires identically — it predates PR #166 entirely and
  most likely dates to the predicate-decided noop-verdicts refactor
  (`f8de180` on main).
- CI is green with it: the message is stderr-only and the runtime self-heals.

## The work

1. Identify the type behind id `X9VR731` (e.g. `--out-modules` /
   `--out-json` over the ts-runtypes test project, or a temporary log of the
   type name next to the tripwire).
2. Diff the `pj` predicate's objectLiteral arm against the `pj` emitter's arm
   for that shape; fix the predicate to mirror the emitter (predicates must
   delegate where the emitter delegates — see CLAUDE.md → noop elision).
3. Add the shape to the corpus test so the false positive is pinned.
4. Confirm the tripwire message is gone from a full `pnpm test` run.
