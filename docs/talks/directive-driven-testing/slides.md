---
marp: true
theme: default
paginate: true
class: lead
title: Your Types Already Know How to Test Themselves
description: Fuzzing, type reflection, and oracles that drive development — and the loop that lets software improve itself.
author: "" # ← your name
---

# Your Types Already Know How to Test Themselves

### Fuzzing, the oracle problem, and the loop that lets software improve itself

generators · reflection · **oracles**

<!--
Lightning talk, ~12 min. ONE idea: a property-based test is a fuzzer with an oracle;
if you can reflect your types you get BOTH the generator and the oracle for free;
and that free loop is exactly what a self-improving agent needs.
Open on the bug. Don't define terms first — earn them.
-->

---

<!-- _class: lead -->

## We had ~3,000 tests. They were green.

## Fuzzing found the bug in the first run.

<!--
Set the stakes immediately. This is a real finding from RunTypes, a runtime-types
library for TypeScript. The example suite was thorough and passing.
-->

---

## The bug

A binary encoder that sizes its own buffer from a running average of past payloads.

```
encode("")        // tiny
encode("")        // tiny      ... 50 times
encode(bigString) // BOOM: RangeError: buffer too small
```

After ~50 small payloads the predictor had shrunk the buffer toward the **mean**.
One above-average string overflowed and **threw instead of growing**.

Hand-written tests never hit it: they use **small, hand-picked values**.

<!--
Root cause: a variance-blind size predictor. Fix shipped: Welford mean + k·sigma
prediction and in-place buffer growth. The point isn't the bug; it's WHY examples missed it.
-->

---

<!-- _class: lead -->

# Examples test what you thought of.

# Generators test what you *didn't*.

<!--
This is the whole talk in two lines. Everything else explains how to get there cheaply
and safely. Pause here.
-->

---

## Fuzzing, in one slide

**1990, Barton Miller.** A thunderstorm puts line-noise on a dial-up link.
Garbage characters keep crashing UNIX utilities. So he studies it:

> feed random input to ~90 tools → **24–33% crash or hang**.

35 years later it still works. **OSS-Fuzz: 50,000+ bugs, 13,000+ vulnerabilities** across ~1,000 projects.

Coverage feedback (AFL, 2013) solved *"which inputs to try."*

<!--
Miller, Fredriksen, So — CACM 1990. OSS-Fuzz figures: README, May 2025.
The frontier moved OFF input-generation. Set up the real bottleneck next.
-->

---

## The dirty secret: the **oracle**

A fuzzer generates a billion inputs. It still needs to know which run was **wrong**.

```
coverage  =  the steering wheel
oracle    =  the destination
```

A crash is a **free but shallow** oracle. "Wrong but doesn't crash" is invisible.

> Deciding if an output is *correct* is the bottleneck of test automation.
> — the **oracle problem** (Weyuker, 1982; Barr et al., 2015)

<!--
Weyuker "On Testing Non-testable Programs", 1982. Barr et al. survey, IEEE TSE 2015.
This is the hinge of the talk: the hard part isn't inputs, it's the oracle.
-->

---

## Property-based testing = fuzzing **+ an oracle**

Stop writing example cases. Start writing **laws** that hold for *all* inputs.

```haskell
-- QuickCheck, 2000
reverse (reverse xs) == xs
```

```ts
// fast-check, TypeScript
fc.assert(fc.property(fc.jsonValue(), v =>
  JSON.parse(JSON.stringify(v)) === structurally(v)   // round-trip law
));
```

> "Property-based testing is fuzzing." — Nelson Elhage
> Hypothesis's engine *is* "an interactive fuzzer for lightly structured byte streams."

<!--
PBT and fuzzing are the same machine: one with an explicit spec, one without.
QuickCheck: Claessen & Hughes, ICFP 2000. fast-check: Nicolas Dubien.
-->

---

## You almost always reach for one of four oracles

| Oracle | The law | You have… |
|---|---|---|
| **Round-trip** | `decode(encode(x)) == x` | an inverse |
| **Differential** | `A(x) == B(x)` | a second impl / version |
| **Invariant** | `P(f(x))` always holds | a property that never breaks |
| **Metamorphic** | `rel(f(x), f(t(x)))` | a meaning-preserving transform |

Metamorphic testing found **147 GCC/LLVM bugs** (EMI). Differential found **325+** (Csmith).
No "expected output" was ever written by hand.

<!--
EMI: Le, Afshari, Su, PLDI 2014. Csmith: Yang et al., PLDI 2011.
These are the four reusable shapes. Memorize them; they're the directive catalogue.
-->

---

## But you have to **build** both halves

Csmith's real work wasn't "generate C."
It was "generate C that **avoids undefined behavior**, so the differential oracle still means something."

Fuzzilli's was "mutate an IR that **always lifts to runnable JS**."

> The generator AND the oracle are usually hand-built, per project. That's the cost.

**What if you didn't have to build either?**

<!--
This is the pivot to the contribution. The scarce resources are a valid-input generator
and a meaningful oracle. Most fuzzing projects spend all their effort here.
-->

---

## Reflection hands you both — for free

If you can **introspect a type `T`**, you can mechanically derive:

```
reflect(T)  ─┬─►  generate random types T          (generator)
             ├─►  generate values inhabiting T      (generator)
             └─►  "a value of T must validate(T)"   (oracle)
```

The generator is **the product**.
The oracle is just *"two independent derivations of `T` must agree."*

<!--
This is the keystone. A runtime-types library already ships reflection + a validator.
Generation and the oracle fall out of it. Nothing extra to invent.
-->

---

## RunTypes, concretely

Three tools the library already had:

| Tool | What | Where |
|---|---|---|
| **Reflection** | walk any type at runtime | `getRunType<T>()` |
| **Type generator** | random well-formed TS types | `test/fuzz/typeGen.ts` |
| **Value generator** | random values inhabiting `T` | `createMockType<T>()` |

**Phase 1** — fuzz *values* against fixed types.
**Phase 2** — fuzz the *types themselves*: generate → compile → run → check.

<!--
typeGen.ts is "the third giant switch": classes, unions, intersections, index sigs,
recursive interfaces, symbols, any/unknown/never. It renders to real .ts and runs the
whole compiler pipeline.
-->

---

## The oracles fall out of the type

```
O1  validate(mock(T))            == true     // valid accepted
O2  validate(corrupt(mock(T)))   == false    // one wrong field rejected
O5  jsonEncode(decode(encode x)) stable      // round-trip
O6  binary wire byte-stable through decode∘encode
O12 jsonWire(x) == jsonWire(binaryDecode(binaryEncode x))   // DIFFERENTIAL
O4  validate(x)  ⇔  getValidationErrors(x).length === 0     // consistency
```

Every failure carries its **seed** → one number replays it exactly.

> "Fuzzing is only as good as its oracle. We derive invariants from properties the
> library must uphold — never from hand-written expected outputs."

<!--
O12 is the gem: JSON and binary are two independent encoders of the same type, so they
differential-test each other for free. Determinism (seeded PRNG) means zero flakiness.
-->

---

## …which is how we found the buffer bug

Phase 1, valid stream, after a burst of small mocks, one big string. **O7** (encode must not throw) tripped.

Shrunk, seeded, reproduced, fixed (Welford mean + k·σ, in-place growth) — and **pinned as a regression**.

A real, shipped fix from the **first** fuzzing run. That's the ROI slide.

<!--
Tie the loop back to the cold open. The oracle (O7: "encode of a valid value must not
throw") is what turned a silent landmine into a caught, minimal, replayable failure.
-->

---

## This isn't new — and that's the point

| Prior art | One artifact → generator **and** oracle |
|---|---|
| **PropEr** (Erlang, 2011) | `-type` → generators, `-spec` → properties |
| **Schemathesis** | OpenAPI schema → inputs + conformance oracle |
| **typia** (TypeScript) | one type → `validate<T>()` **and** `random<T>()` |

The recipe is **proven**. It's just **under-applied**.
TSTest pointed runtime values at declared `.d.ts` types → mismatches in **49 of 54** libraries.

> **TypeScript is under-fuzzed by exactly this recipe.** That's the opening.

<!--
Honesty slide. Credit prior art. typia ships both halves from one type; nestia closes
the loop. RunTypes' twist: fuzz the TYPE SYSTEM itself, plus a full derived-oracle catalogue.
TSTest: Kristensen & Møller, OOPSLA 2017.
-->

---

## Name the recipe: **Directive-Driven Testing**

A **directive** = a machine-checkable claim about *all* inputs (an oracle = a hypothesis).

**Five questions to assess any project:**

```
1. Input space?   can we generate valid inputs?        → generator
2. Reflection?    can we introspect the shape?         → drives gen + locates faults
3. Directive?     round-trip / differential / invariant / metamorphic?  → oracle
4. Runner+shrink? deterministic at scale, minimal repro?  → harness
5. Loop owner?    who closes it — human or agent?
```

Generalizes: **serializers, validators, ORMs, APIs, parsers, compilers, state machines, configs.**

<!--
This is the framework deliverable in one slide. Full version in
framework-directive-driven-testing.md. The directive IS the unit of work.
-->

---

## The payoff: a loop an **agent** can run

Fuzzing/PBT is a **verification = reward signal**. That's what RL for code always lacked.

```
 ┌─► HYPOTHESIZE ─► BUILD TOOLING ─► GENERATE ─► RUN ─┐
 │   (directive)     (harness)                        │
 │                                            observe FAILURE
 └── re-verify ◄─ PROPOSE FIX ◄─ SHRINK ◄─────────────┘
        │ pass → keep as regression
        └ fail → refine directive
```

OSS-Fuzz-Gen (LLM writes the harness) found a **20-year-old OpenSSL CVE**.
AlphaEvolve beat Strassen's 56-year matmul record — with an automated **evaluator as the oracle**.

<!--
LLMs supply the two things RL lacked for software: a candidate oracle and the tooling
to test it. Full design in framework-self-improving-agents.md.
-->

---

## The catch (don't skip this)

The loop is only as honest as its **oracle**.

- An LLM oracle inferred from **buggy code** blesses the bug.
- Tests-as-reward invites **Goodhart / reward hacking**: weaken the assertion, pass the test.

> Ground truth must come from somewhere the model **can't fake**:
> a human, a **differential** reference, a **sound checker**.

A **reflection-derived** oracle is exactly that kind of anchor.
**That's why this matters.**

<!--
This is what makes the self-improvement story credible instead of hype. The type-derived
oracle is independent of the implementation under repair → it can't be quietly gamed.
-->

---

<!-- _class: lead -->

## Takeaways

1. **PBT is fuzzing with an oracle.**
2. **Reflection gives you the generator *and* the oracle for free.**
3. **Name it** (directives) and it's a method, not a trick.
4. It's the **safe reward signal** for self-improving software.

### Tonight: reflect a type, write **one** directive (start with round-trip), close the loop.

🙏 Thanks · prior art: QuickCheck · Hypothesis · fast-check · PropEr · Schemathesis · typia · OSS-Fuzz

<!--
Land on action. The smallest possible first step is one round-trip property over a
generated value. Links + full citations in sources.md.
-->
