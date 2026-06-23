# Talk: *Meet Botty, the Tireless Bug-Hunting Robot*

A friendly, no-jargon conference talk about how computers can find — and even
fix — their own mistakes, plus two deeper companion docs for engineers who want
the how.

> **The one idea (in plain words):** you can't think of every way something
> breaks, so don't. Teach the computer the **shape** of your stuff, give it **one
> always-true rule** (start with *"do it, then undo it, and you should be back
> where you started"*), and let a **tireless robot** try a million weird cases
> you'd never dream up. It works — as long as the robot can't cheat on the rule.
>
> socks 🧦 · cookie cutters 🍪 · a backpack that rips 🎒 · a robot named Botty 🤖

Status: **first draft, meant to be iterated on.** Format is Marp Markdown so it
stays diffable and editable.

---

## Contents

| File | What it is |
|---|---|
| [`slides.md`](slides.md) | The **Marp deck** — the talk itself: casual, no-jargon, ~10–12 min (21 short slides). |
| [`speaker-notes.md`](speaker-notes.md) | Slide-by-slide rehearsal script with timing + cut list + Q&A. |
| [`framework-fuzzy-testing.md`](framework-fuzzy-testing.md) | **The fuzzy-testing framework (code-first, the main methodology).** Two processes — *Tool Discovery* (A1–A6) + *Oracle Discovery* (B1–B6) — with runnable code grounded in this repo's real harness. Worked first test case: the **FriendlyType/MockData sync pipeline** (R1–R10). Written to become a skill. |
| [`framework-directive-driven-testing.md`](framework-directive-driven-testing.md) | **Conceptual companion (no code):** the same idea at altitude — five-question readiness model + the oracle decision tree + soundness contract. |
| [`framework-self-improving-agents.md`](framework-self-improving-agents.md) | **Framework 2:** close the loop with an LLM agent — the architecture, pseudo-code, the **trust anchor**, and the risk accounting. |
| [`prior-art.md`](prior-art.md) | Who's already doing this (typia, PropEr, Schemathesis, Antithesis…), closeness ranking, **what not to claim on stage**, people to cite. |
| [`sources.md`](sources.md) | Every load-bearing number/quote on a slide, tied to a primary source. |
| [`research/`](research/) | The five deep research briefs behind it all (fuzzing fundamentals; PBT & oracles; compiler/type fuzzing & extrapolation; LLM self-improvement; prior art & people), each fully cited. |

---

## The arc (no-jargon cut)

```
1  Meet Botty 🤖 — a dumb, fast, tireless little robot
2  Every app is just a recipe… that sometimes goes wrong
3  We only test the things we thought of
4  The bugs hide in the stuff we DIDN'T think of
5  True story: a thunderstorm types random junk and crashes everything
6  What if we crash things on purpose? (the first bug-hunting robot)
7  Botty tries a million silly things while you drink one coffee
8  The hard part: how does Botty know when something went wrong?
9  A wrong answer that doesn't crash (2 + 2 = 5, straight face)
10 The trick: you don't need the answer key — just a rule that's ALWAYS true
11 🧦 The sock rule: inside-out twice = the same sock
12 Computers are full of sock rules (save→open, zip→unzip)
13 The magic: what if the computer knew the SHAPE of your stuff?
14 🍪 One cookie cutter, two jobs: make a million + spot the bad one
15 We pointed Botty at our own software (3,000 green tests…)
16 🎒 …and it found a real bug: the backpack that rips
17 Where it's going: software that fixes ITSELF
18 A robot doing its own homework (the loop)
19 ⚠️ The catch: it only works if the robot can't cheat
20 The whole idea, tiny
21 Try it tonight: "save it, open it — is it still the same?"
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

- **The deck (`slides.md`)** is the talk: the friendly, socks-and-cookies version.
  It's deliberately non-technical — anyone can follow it.
- **The two frameworks** are the grown-up deep-dive for engineers who watch the
  talk and ask "okay, how do I actually do this?" They translate the sock rule and
  the cookie cutter into a real method (Framework 1) and into the self-improving
  agent loop, with the "can't cheat" rule made rigorous (Framework 2). Heads-up:
  they still use the technical vocabulary on purpose.
- **prior-art.md / sources.md / research/** keep the talk honest and citeable —
  the real names and numbers behind the friendly stories.

## Iterating

It's a draft. Likely next passes: trim to your exact time slot, drop in your
speaker theme/colors, add your name to the title slide, and — if you show it to a
technical crowd — decide whether to add the optional "grown-up wink" at the end
(see `speaker-notes.md`). The deeper frameworks keep their own technical naming.
