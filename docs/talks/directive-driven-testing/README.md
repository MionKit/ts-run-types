# Talk: *Your Types Already Know How to Test Themselves*

A conference talk (JS/TS and general tech) plus two companion design-doc
frameworks, on **fuzzing as hypothesis/directive-driven testing**, how
RunTypes uses type reflection to get it nearly for free, and how the same loop
becomes the safe reward signal for self-improving software.

> **The one idea:** a property-based test is a fuzzer with an oracle. If you can
> **reflect your types**, you get the **generator *and* the oracle for free**.
> Name that recipe — **directives** — and it's a repeatable method, and exactly
> the verification loop an LLM agent needs to improve software *without fooling
> itself*.
>
> oracle ≡ hypothesis ≡ directive · generators + reflection + **oracles**

Status: **first draft, meant to be iterated on.** Format is Marp Markdown so it
stays diffable and editable.

---

## Contents

| File | What it is |
|---|---|
| [`slides.md`](slides.md) | The **Marp deck** — lightning length (~12–13 min, 18 slides). |
| [`speaker-notes.md`](speaker-notes.md) | Slide-by-slide rehearsal script with timing + cut list + Q&A. |
| [`framework-directive-driven-testing.md`](framework-directive-driven-testing.md) | **Framework 1:** assess a project, identify the tooling it needs, and **author the directives (oracles)**. Five-question readiness model + the oracle decision tree + soundness contract. |
| [`framework-self-improving-agents.md`](framework-self-improving-agents.md) | **Framework 2:** close the loop with an LLM agent — the architecture, pseudo-code, the **trust anchor**, and the risk accounting. |
| [`prior-art.md`](prior-art.md) | Who's already doing this (typia, PropEr, Schemathesis, Antithesis…), closeness ranking, **what not to claim on stage**, people to cite. |
| [`sources.md`](sources.md) | Every load-bearing number/quote on a slide, tied to a primary source. |
| [`research/`](research/) | The five deep research briefs behind it all (fuzzing fundamentals; PBT & oracles; compiler/type fuzzing & extrapolation; LLM self-improvement; prior art & people), each fully cited. |

---

## The arc (lightning cut)

```
1  Hook: 3,000 green tests; a fuzzer found the bug on the first run
2  Examples test what you thought of; generators test what you didn't
3  What fuzzing is (Miller → OSS-Fuzz) and what it solved (inputs)
4  The real bottleneck: the ORACLE (the oracle problem)
5  PBT = fuzzing + an explicit oracle (the same machine)
6  The four oracles you can always reach for
7  But you hand-build the generator AND the oracle — that's the cost
8  Reflection hands you BOTH for free (RunTypes: 3 tools, 2 phases, derived oracles)
9  …which is how we found the real bug
10 Not new (PropEr/Schemathesis/typia) — TS is under-fuzzed by this recipe
11 Name it: Directive-Driven Testing (5-question framework, generalizes)
12 The payoff: a loop an agent can run (fuzzing = reward signal)
13 The catch: garbage oracle = confident wrongness → the trust anchor
14 Takeaways + one call to action: reflect a type, write ONE directive
```

---

## Render the deck

The deck is [Marp](https://marp.app). Nothing is installed for it in this repo
(it has no build dependency on Marp); render on demand:

```bash
# HTML (self-contained)
npx @marp-team/marp-cli@latest docs/talks/directive-driven-testing/slides.md -o slides.html

# PDF
npx @marp-team/marp-cli@latest docs/talks/directive-driven-testing/slides.md --pdf

# Live preview while editing
npx @marp-team/marp-cli@latest -s docs/talks/directive-driven-testing/
```

(or `pnpm dlx @marp-team/marp-cli@latest …`). The **Marp for VS Code** extension
gives the same preview inline.

---

## How the pieces relate

- **The deck** sells the one idea and tells the RunTypes story.
- **Framework 1** is the deck's slide 11 expanded into a method you can apply to
  any project (and is the honest answer to "okay, how do I actually do this?").
- **Framework 2** is the deck's slides 12–13 expanded — and it stands *on*
  Framework 1's soundness contract: an agent may only optimize against a directive
  whose failures are sound and whose pass genuinely implies correctness.
- **prior-art.md / sources.md / research/** keep the talk honest and citeable.

## Iterating

It's a draft. Likely next passes: tighten the deck to your true time slot, pick a
final name (Directive-Driven Testing / Oracle-Driven Development /
Hypothesis-Directed Testing — see Framework 1 §0), swap in your speaker theme,
and re-verify the few flagged figures in `sources.md` before stage.
