---
name: fuzzy-testing
description: Add fuzz / property-based testing to a system with a fixed, code-first methodology — Tool Discovery (find the generator, seed, observation, shrink), Oracle Discovery (sweep eight rule-archetypes for sound always-true invariants), and Lifting (extend an existing example/unit test into a fuzz test). Use when adding a fuzz test, property test, or generative/randomised test; when generalising an example/unit test to random inputs; when designing oracles or invariants (round-trip, idempotence, metamorphic, differential, preservation, negative-space); when building a model-based / stateful / event-sequence fuzzer; or when hunting edge cases beyond hand-written cases. Grounded in this repo's real harness (packages/ts-runtypes/test/fuzz/) with the FriendlyType/MockData sync fuzzer as the worked example.
---

# Fuzzy testing — a methodology, not a library

Fuzz testing: **generate** a flood of inputs you would never write by hand, run the
system on each, and check an **always-true rule**. The bug is whatever breaks the
rule. Five moving parts — **generator, SUT, observation, oracle, shrink** — plus a
**seed** so any finding replays.

This skill is that process as a fixed checklist with worksheet outputs. Full
reference (runnable code + the complete worked example): [framework-fuzzy-testing.md](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md).
The first real application lives at `packages/ts-runtypes/test/fuzz/enrich/` (the
FriendlyType/MockData sync fuzzer) — read it as a template for a stateful SUT.

## When to use

- Adding a fuzz / property / generative test to a function or pipeline.
- Generalising an existing example/unit test to random inputs → start with **C**.
- Designing oracles/invariants (round-trip, idempotence, metamorphic, differential, negative-space).
- Building a model-based / stateful / event-sequence fuzzer.
- Hunting edge cases beyond hand-written cases.

## The three methodologies

- **A — Tool Discovery** → [worksheet-A.md](worksheet-A.md). Bound the SUT, pick the
  generator, make runs replayable (seed), find the observation surface, decide shrink.
  Output: a **tool inventory + gap list**.
- **B — Oracle Discovery** → [worksheet-B.md](worksheet-B.md). Sweep the eight
  rule-archetypes, harvest the always-true ones, tag provenance, pass the soundness
  gate. Output: a **typed oracle layer**.
- **C — Lifting (the on-ramp)** → [worksheet-C.md](worksheet-C.md). When an example
  test already exists, **extend** it: keep its SUT call, turn its fixture into a
  generator, generalise its assertion to an invariant. C hands you a first cut of A
  and B for free.

> **Have an example test? Do C first**, then fill gaps with A/B. **Greenfield?** Do
> A, then B. The lanes are complementary — keep the example test as the fast
> reproducer and regression pin.

## Procedure

1. **Bound the SUT** (A1) — smallest callable boundary; wrap side effects into
   `run(input) -> observation`.
2. **Tool Discovery** (A2–A6) — fill the inventory/gap table; build ONLY the gaps.
   Reuse what exists (this repo: `createMockType`, `mutateToInvalid`, `randomJunk`,
   `withSeededRandom`/`mixSeed`).
3. **Oracle Discovery** (B1–B6) — sweep all eight archetypes; encode each as one
   `check*(...) -> Violation | null`. _Or **Lift** (C1–C6) if you already have an
   example test — it yields the generator and oracle directly._
4. **Wire the runner** — seed every iteration; collect replayable `Violation`s; add a
   prefix/delta shrinker. Templates below.
5. **Soak + pin** — run many seeds; for each finding, shrink to the minimal
   reproducer and commit it as a regression example test (next time, that example is
   C's seed).

## ⚠️ The soundness gate (read twice — non-negotiable)

Every oracle must be **one-directional sound**: _the predicate firing ⇒ a real bug_,
always. A false negative just costs bytes; a **false positive** (test fails with no
bug) destroys trust and gets the whole suite ignored. Before trusting a new oracle,
run a **negative control**: deliberately break the expected output and confirm the
oracle fires with the right signal. (We did exactly this for the enrich fuzzer:
temporarily asserted a bogus diagnostic code, saw it fail and shrink to a 1-event
reproducer — proving the probe was live, not vacuous.) Details: worksheet-B §B4.

## Templates (copy + adapt)

- [`templates/oracle-layer.ts`](templates/oracle-layer.ts) — `FuzzTarget` + `check*`
  oracle skeletons + a replayable `Violation` (shape of `test/fuzz/fuzzOracle.ts`).
- [`templates/seeded-runner.ts`](templates/seeded-runner.ts) — seeded driver + soak +
  prefix-shrinker (shape of `test/fuzz/fuzzRunner.ts` / `enrich/enrichFuzzRunner.ts`).
- [`templates/model-based.ts`](templates/model-based.ts) — event/command + state-model
  skeleton for stateful SUTs (the enrich shape).

Templates are **dependency-free** (this repo has no fast-check). If fast-check IS
available, it can replace the seeded-runner + shrinker (`fc.assert` / `fc.commands`
give both for free); the oracle layer is engine-agnostic either way.

## Acceptance — the skill is done when it produced

(a) a **tool inventory + gap list**; (b) an **oracle layer** with ≥1 **strong** oracle
plus the **totality** baseline; (c) a **seeded** runner; (d) at least one **pinned
counterexample** OR a clean soak — for whatever SUT it was pointed at. Plus: every
oracle passed the soundness gate (a negative control fired). The enrichment pipeline
(`test/fuzz/enrich/`) is the reference acceptance run.
