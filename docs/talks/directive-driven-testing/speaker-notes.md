# Speaker notes — *Your Types Already Know How to Test Themselves*

> Lightning talk, target **~12–13 min**. One idea: *PBT is fuzzing with an
> oracle; reflection gives you both the generator and the oracle for free; and
> that free loop is the safe reward signal a self-improving agent needs.*
>
> Delivery rule: **earn the terms before you use them.** Open on the bug, not on
> a definition. Land every section on a single quotable line.

Timings are cumulative. 18 slides.

---

**1 · Title — 0:20**
"Three thousand passing tests didn't catch this bug. A fuzzer caught it on the
first run. By the end you'll know why, and why your *types* can do this for you
for almost free." Don't read the subtitle aloud.

**2 · 3,000 green tests — 0:25 (0:45)**
Set the stakes. This is a real library — RunTypes, runtime types for TypeScript.
The example suite was thorough and green. Beat. "And yet."

**3 · The bug — 1:00 (1:45)**
Walk the code block slowly. An encoder sizing its own buffer from a *running
average*. Fifty tiny payloads pull the average down; one big string overflows and
*throws instead of growing*. "Hand-written tests never hit it — because we pick
small, tidy values by hand." Don't explain the fix yet; you return to it later.

**4 · Examples vs generators — 0:20 (2:05)**
The whole talk in two lines. Say them, then **pause**. Let it sit.

**5 · Fuzzing in one slide — 0:55 (3:00)**
Tell the thunderstorm story — it's a gift. Miller, 1990, line-noise on a dial-up
link crashing UNIX tools, so he studied it: a quarter to a third crashed. "Thirty
five years later it still works — OSS-Fuzz: fifty thousand bugs." Then the pivot
line: "coverage solved *which inputs to try*. That's not the hard part anymore."

**6 · The dirty secret: the oracle — 0:55 (3:55)**
This is the hinge. "A fuzzer makes a billion inputs. It still has to know which
run was *wrong*." Steering wheel vs destination. "A crash is a free oracle, but a
shallow one — 'wrong but doesn't crash' is invisible." Name it: the oracle
problem, Weyuker 1982. "Deciding if the answer is right is the bottleneck."

**7 · PBT = fuzzing + an oracle — 0:55 (4:50)**
"There's a whole community that already writes the oracle down — they just call it
a property." QuickCheck's `reverse(reverse xs) == xs`. fast-check in TS. Then the
punch, quoting Elhage and Hypothesis: "These aren't *analogous* to fuzzing.
Hypothesis's engine literally *is* a fuzzer. PBT is fuzzing with the spec filled
in."

**8 · Four oracles — 0:50 (5:40)**
Read the table as a cheat-sheet: round-trip (you have an inverse), differential
(a second impl), invariant (a property that never breaks), metamorphic (a
meaning-preserving transform). "These four found hundreds of bugs in the world's
most-tested compilers — 147 here, 325 there — with nobody writing a single
expected output." This is the catalogue; they'll see it again as "directives."

**9 · But you have to build both halves — 0:40 (6:20)**
The cost. Csmith's genius wasn't generating C — it was generating C that avoids
undefined behavior so the oracle still means something. "Normally you hand-build
the generator *and* the oracle, per project. So here's the question that turns
this into a 12-minute talk: what if you didn't have to build either?"

**10 · Reflection hands you both — 0:50 (7:10)**
The keystone — slow down. "If you can look at a type at runtime, you can do three
things mechanically." Read the arrows. Land it: "The generator is the product.
The oracle is just — two independent readings of the same type must agree."

**11 · RunTypes concretely — 0:40 (7:50)**
"We already had all three." Reflection, a type generator, a value generator —
point at the table. "Phase 1 fuzzes values against fixed types. Phase 2 fuzzes
the *types themselves* — generate a weird type, compile it, run the whole
pipeline, check it." Mention typeGen briefly as "the third giant switch."

**12 · The oracles fall out of the type — 0:50 (8:40)**
Don't read every line. Point to two: O2 ("corrupt one field, it must be
rejected") and **O12** ("JSON and binary are two independent encoders of the same
type — so they test each other, for free — that's a differential oracle you got
for nothing"). Then the quote from FUZZING.md: "never from hand-written expected
outputs." Mention: every failure carries a seed, zero flakiness.

**13 · …which is how we found the buffer bug — 0:35 (9:15)**
Close the loop on the cold open. "That overflow? The 'encode must not throw'
oracle caught it, the harness shrank it, the seed replayed it, we fixed it
(variance-aware sizing) and pinned it. A real shipped fix from the first run.
That's the ROI."

**14 · This isn't new — 0:45 (10:00)**
The credibility slide — say it proudly, not defensively. PropEr did this in
Erlang in 2011. Schemathesis does it from OpenAPI. typia does it in TypeScript
from one type. "The recipe is *proven*. It's just under-applied — TypeScript is
under-fuzzed by exactly this recipe; one study pointed runtime values at declared
types and found mismatches in 49 of 54 libraries. That gap is the opportunity."

**15 · Name the recipe: Directive-Driven Testing — 0:45 (10:45)**
"Give it a name and it stops being a trick and becomes a method." A directive = a
checkable claim about all inputs = an oracle = a hypothesis. Read the five
questions as a checklist you can point at any repo. "And it generalizes —
anywhere you can describe 'valid', you can generate it and derive a directive."

**16 · The payoff: a loop an agent can run — 0:50 (11:35)**
"Here's why I think this matters beyond one library." Fuzzing is a *reward
signal* — the thing RL for code never had. Trace the loop once. "An LLM proposes
the directive and writes the harness; the loop finds the counterexample; an agent
proposes the fix; the directive verifies it." Proof it's real: OSS-Fuzz-Gen's LLM
harness found a twenty-year-old OpenSSL bug; AlphaEvolve beat a 56-year-old math
record with an automated evaluator as its oracle.

**17 · The catch — 0:45 (12:20)**
Do **not** skip this; it's what makes you credible. "The loop is only as honest
as its oracle. An LLM oracle written from buggy code will happily bless the bug.
Tests-as-reward invites cheating — weaken the assertion, pass the test. So the
deciding oracle has to come from somewhere the model can't fake: a human, a
differential reference, a sound checker. A reflection-derived oracle is exactly
that anchor. That's the whole point."

**18 · Takeaways — 0:30 (12:50)**
Four lines, fast. Then the call to action — the real ask: "Tonight: reflect one
type, write *one* directive — start with round-trip — and close the loop." Thanks;
gesture at the prior-art credits. Stop talking.

---

## If you're over time, cut in this order
1. Slide 5 down to one line (skip the OSS-Fuzz number).
2. Merge 11+12 (show RunTypes' three tools and O12 only).
3. Drop the AlphaEvolve example on 16 (keep OSS-Fuzz-Gen).

## If you have a Q&A buffer, have these ready
- *"Isn't this just property-based testing?"* — Yes, and that's the point;
  the new part is deriving the property from reflection and naming it the unit of
  work, plus the agent loop.
- *"Doesn't TS erase types at runtime?"* — Right, which is why a reflection layer
  (RunTypes' resolver, or a schema lib) is question #2 of the framework; it's the
  one-time investment that makes the rest free.
- *"How is the agent loop not just reward hacking?"* — It is, unless the oracle is
  independent of the code under repair and out of the agent's write-scope. See the
  trust-anchor section of the self-improving-agents framework.
