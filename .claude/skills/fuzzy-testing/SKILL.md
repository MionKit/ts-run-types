---
name: fuzzy-testing
description: Add a fuzz / property test to a piece of code, the structured way. Walks you through deciding WHAT must always be true before you build any tooling. Use when adding a fuzz test, a property test, or any test that throws lots of random inputs at the code; when generalising one example/unit test into a test that runs over many inputs; when deciding what rules to check (round-trip, do-it-twice, compare-to-a-trusted-source, predicted-change, leave-the-rest-alone, reject-bad-input); when testing code with memory by feeding it a sequence of actions (model-based / sequence testing); or when hunting edge cases your hand-written tests miss. Grounded in this repo's real harness (packages/ts-runtypes/test/fuzz/) with the FriendlyType/MockData sync fuzzer as the worked example.
---

# Fuzzy testing — a way of working, not a library

Fuzz testing means this: instead of writing inputs by hand, you make a machine spit
out a flood of inputs you'd never think of, run your code on each one, and check that
some rule still holds. The bug is whatever breaks the rule. The rule that's always
true is the centre of the whole thing (the jargon word for it is an _oracle_).

This skill is that process written down as a checklist, with worksheets to fill in.
The big idea: **decide what should always be true BEFORE you build any machinery.**
Tools come last, not first.

Full reference (runnable code + the complete worked example): [framework-fuzzy-testing.md](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md).
The first real use of this lives at `packages/ts-runtypes/test/fuzz/enrich/` (the
FriendlyType/MockData sync fuzzer) — read it as a template for testing code that has
memory.

## When to use

- Adding a fuzz / property / random-input test to a function or pipeline.
- Taking one example/unit test you already have and making it run over many inputs.
  Already have a test? Use the shortcut below — you get most of the work for free.
- Deciding what rules to check (do-it-then-undo-it, do-it-twice, compare-to-a-trusted-source, predicted-change, reject-bad-input).
- Testing code that has memory by feeding it a sequence of actions.
- Hunting edge cases beyond the handful you'd write by hand.

## The five steps

Work top to bottom. Steps 1 to 3 are thinking; step 4 is building; step 5 is running.

1. **Step 1 — What are you testing, and what can you see?**
   Name the one piece of code you're putting under the microscope. Write down what
   goes in, and (just as important) what you can actually watch come out: the return
   value, errors it throws, files it writes, logs, exit codes. You can't decide what
   to check if you don't know what you can see.
2. **Step 2 — Is fuzzing even worth it here?**
   A 30-second gut-check before you invest. Fuzzing only pays off when you can run the
   code over and over with different inputs, the same input always does the same
   thing (or you can force that), and you have a cheap way to tell right from wrong
   without re-doing the code's job. If any of those is false, stop: a few hand-written
   examples are the better tool.
3. **Step 3 — What should always be true? (the rules)**
   List the rules that must hold for EVERY input, not just one example. Run down the
   short checklist of common rule shapes and keep the ones that fit. Note where each
   rule came from. This is the heart of the work → fill in **[the rules worksheet (worksheet-B.md)](worksheet-B.md)**.
4. **Step 4 — Build the pieces.**
   Now build what the rules need, and only that. You need something that makes random
   inputs (an input maker), a way to replay any run from one saved number (a seed),
   the loop that runs each input and checks every rule, and a way to cut a failing
   input down to its smallest form (shrinking). Reuse what exists → fill in **[the tools worksheet (worksheet-A.md)](worksheet-A.md)**.
5. **Step 5 — Run it hard, and keep what breaks.**
   Run thousands of inputs. Every time you find a break, save that smallest failing
   input as an ordinary test so the same bug can never sneak back. A clean run after
   thousands of tries is a result too: confidence you didn't have before.

### Shortcut — already have a normal test? Grow it.

A regular test already hands you three of the hard parts: an input, the call, and a
check. Turn the input into the input maker, and turn the check (true for ONE input)
into a rule (true for ALL inputs). So when an example test exists, start there: you
get Step 1 and Step 3 mostly for free, then finish with Step 4. Keep the original test
too — it's your fastest "did I break it?" check and your smallest known example.
Worksheet: **[grow an existing test (worksheet-C.md)](worksheet-C.md)**.

## The one iron rule

A failing test must ALWAYS mean a real bug. If a test goes red when nothing is
actually wrong (a false alarm), people stop trusting the suite and start ignoring it.
That's worse than no test at all.

So before you trust a new rule, break the output on purpose and watch the rule catch
it (the negative-control habit). We did exactly this for the enrich fuzzer: we told a
test to expect a wrong answer, watched it fail and point at the precise spot, then put
it back. That proved the check actually works and isn't passing for the wrong reason.

Two more habits that keep you honest:

- Prefer strong rules (do-it-then-undo-it, compare-to-a-trusted-source,
  predicted-change) over the weak one ("it just doesn't crash"). Always keep "doesn't
  crash" as the floor, though.
- Make sure your random inputs actually reach the situation a rule talks about. A rule
  about bad input needs an input maker that makes bad input, or the rule passes for
  the wrong reason.

## The three worksheets

Linked in the order you actually use them (the rules before the tools):

- **[The rules — worksheet-B.md](worksheet-B.md)** (Step 3). The rule-shape checklist,
  noting where each rule came from, the iron rule plus its negative control, and
  making sure your inputs reach each case. **This is the heart — start here once you
  know what you're testing.**
- **[The tools — worksheet-A.md](worksheet-A.md)** (Step 4, with Step 1's "what can you
  see?" and Step 2's worth-it check). Decide your input maker, replay/seed, the loop,
  and shrinking. Produces a list of what you already have and what's missing.
- **[Grow an existing test — worksheet-C.md](worksheet-C.md)** (the shortcut). Turn one
  example test into a fuzz test, and keep both.

> Have an example test? Do the shortcut first, then fill the gaps with the rules and
> tools worksheets. Starting from scratch? Do the rules, then the tools. Either way,
> keep the example test as the fast reproducer and the regression pin.

## Templates (copy and adapt)

- [`templates/oracle-layer.ts`](templates/oracle-layer.ts) — one place that gathers all
  the rule-checks, each returning a replayable failure record or nothing (shape of
  `test/fuzz/fuzzOracle.ts`).
- [`templates/seeded-runner.ts`](templates/seeded-runner.ts) — the replayable loop plus
  a run-it-a-lot mode plus a shrinker (shape of `test/fuzz/fuzzRunner.ts` /
  `enrich/enrichFuzzRunner.ts`).
- [`templates/model-based.ts`](templates/model-based.ts) — a sequence-of-actions
  skeleton for code that has memory (the enrich shape).

Templates need no extra libraries (this repo has no fast-check). If fast-check IS
available, it can replace the loop and the shrinker (`fc.assert` / `fc.commands` give
both for free); the place that holds your rules works the same either way.

## Done when you have

(a) a list of what tooling you already have and what's missing; (b) the rules written
down, with at least one strong rule plus the "doesn't crash" floor; (c) a runner you
can replay from a seed; (d) at least one saved failing input OR a clean run over
thousands of inputs — for whatever code you pointed this at. Plus: every rule passed
the iron-rule check (you broke the output on purpose and watched the rule fire). The
enrichment pipeline (`test/fuzz/enrich/`) is the reference run.
