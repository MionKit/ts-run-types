# Directive-Driven Testing (DDT)

> A framework for (1) assessing whether a project can support generator-driven
> testing, (2) identifying the exact tooling it needs, and (3) authoring the
> **directives** (oracles) that drive both the testing and the development.
>
> Companion to the talk *"Your Types Already Know How to Test Themselves."*
> Backing research and citations live in [`research/`](research/) and
> [`sources.md`](sources.md).

---

## 0. Why a new name

"Fuzzing" makes people think of crashes and random bytes. "Property-based
testing" makes people think of a niche FP library. Both undersell the idea.

The unifying observation (Nelson Elhage; the Hypothesis engine itself):

> **A property-based test is a fuzzer whose oracle is your property.**
> Fuzzing and PBT are the *same machine* — one run without an explicit spec,
> one with.

What actually drives the whole thing is not the randomness. It is the
**directive**: the executable claim about *all* inputs that decides pass/fail
and, in a development loop, decides what "done" means. So:

> **directive  ≡  oracle  ≡  hypothesis**
> a machine-checkable claim that must hold for every input in a domain.

The randomness is just how we *attack* the directive. **Name the directive the
unit of work**, and testing stops being "write more cases" and becomes "state
the next law and let the machine hunt."

*Naming is yours to choose.* Equally good labels for the same idea:
**Directive-Driven Testing (DDT)**, **Oracle-Driven Development (ODD)**,
**Hypothesis-Directed Testing (HDT)**. This document uses DDT.

---

## 1. The shape of the thing

Every generator-driven test — every fuzzer, every property test, Jepsen,
Schemathesis, Csmith, RunTypes — is the same five-part loop:

```
        ┌──────────────────────────────────────────────────────────┐
        │                                                          │
        ▼                                                          │
  ┌───────────┐   reflect    ┌───────────┐   sample   ┌──────────┐ │
  │  STRUCTURE │ ───────────► │ GENERATOR │ ─────────► │   RUN    │ │
  │  (schema/  │              │ (inputs)  │            │ (system  │ │
  │   type)    │              └───────────┘            │ under    │ │
  └───────────┘                                        │  test)   │ │
        │                                              └────┬─────┘ │
        │  derive                                           │       │
        ▼                                                   ▼       │
  ┌───────────┐         pass / fail            ┌─────────────────┐  │
  │ DIRECTIVE │ ◄──────────────────────────────│   OBSERVE       │  │
  │ (oracle)  │                                 │ (coverage +     │  │
  └───────────┘                                 │  directive)     │  │
        │ fail                                  └─────────────────┘  │
        ▼                                                            │
  ┌───────────┐   minimal repro                                      │
  │  SHRINK   │ ───────────────────────────────────────────────────►┘
  └───────────┘     (and: every failure carries its seed)
```

DDT is the discipline of recognizing this loop, building the parts a project is
missing, and writing good directives.

---

## 2. The readiness assessment — five questions

Point these five questions at any codebase. Each maps to one capability and one
piece of tooling. Score each 0 (absent) / 1 (partial) / 2 (solid). A project is
"DDT-ready" when it can answer 1–4; question 5 decides who drives the loop.

### Q1. Input space — *can we generate valid inputs?*

- **What:** a generator that produces inputs the system actually accepts. For
  structured systems, "valid" is the hard part — random bytes get rejected at
  the front door (Csmith's entire contribution was generating C that *avoids
  undefined behavior*; Fuzzilli mutates an IR that *always lifts to runnable JS*).
- **Detect it:** Is there a schema, grammar, type, or interface that describes
  legal inputs? Is there already a factory/mock/fixture builder? A serializer
  implies a value space; an API spec implies a request space.
- **Tooling:** a **structure-aware generator**. Hand-written (`fc.Arbitrary`),
  schema-derived (`hypothesis-jsonschema`, `zod-fast-check`), or
  reflection-derived (typia `random<T>()`, RunTypes `createMockDataFn<T>()`).

### Q2. Reflection — *can we introspect the shape at runtime?*

- **What:** programmatic access to the structure of an input/type, so the
  generator can be *derived* instead of *written*, and so the runner can walk an
  input to find where to corrupt it.
- **Why it's the multiplier:** reflection is what collapses Q1 and Q3 from
  "build by hand, per type" to "derive once, for all types." Without it you
  write a generator and an oracle for every shape; with it you write the
  *walker* once.
- **Detect it:** Is there a runtime description of types/schemas (a JSON Schema,
  a Zod object, an `io-ts` codec, a reflected `RunType`, an OpenAPI doc, a DB
  catalog)? If types are erased and nothing reifies them, reflection is your
  first build target.
- **Tooling:** a **reflection layer** — `getRunType<T>()`, `schema.shape`,
  `Reflect.getMetadata`, a parsed grammar, an introspectable catalog.

### Q3. Directive — *what must always be true?* (the hard, valuable part)

- **What:** the oracle. See §3 for how to author one. The four archetypes:
  **round-trip, differential, invariant, metamorphic**, plus the free
  **"never crashes"** baseline.
- **Detect it:** Do you have an inverse (encode/decode, parse/print)? A second
  implementation or an old version (differential)? A property that must always
  hold (sorted, balanced, conserved)? A meaning-preserving transform (reorder,
  widen, recompress)? If "yes" to any, you have a directive.
- **Tooling:** usually *none to build* — the directive is **derived** from
  structure (Q2) or from an existing inverse/second-impl. This is the cheapest
  part to *run* and the most expensive part to *get right*.

### Q4. Runner + shrink — *deterministic at scale, with minimal repros?*

- **What:** an engine that drives thousands of iterations, makes every run
  **reproducible from a seed**, **shrinks** a failure to a minimal example, and
  **pins** it as a regression.
- **Detect it:** Is there a seeded PRNG path (or are tests using ambient
  `Math.random`/wall-clock, i.e. flaky)? Is there a shrinker? Is there a place
  to park found counterexamples as permanent tests?
- **Tooling:** a **harness** — seeded RNG (`mulberry32` + `withSeededRandom`),
  iteration driver, integrated shrinking (fast-check/Hypothesis give it free;
  C-Reduce/`tmin` for programs), a corpus, and a regression sink.

### Q5. Loop owner — *who closes it?*

- **What:** once a directive fails, something must diagnose, fix, and re-verify.
  Today that is a human. Increasingly it can be an **agent** (see
  [`framework-self-improving-agents.md`](framework-self-improving-agents.md)).
- **Detect it:** Is the failure→fix→reverify path manual, scripted, or
  autonomous? Do you trust the directive enough to let a machine optimize
  against it?
- **Tooling:** CI integration at minimum; an APR/agent loop at most — but **only
  as trustworthy as the directive (§3.5)**.

### Scorecard template

```
Capability       Q   Tooling needed                 Project has?   Build?
─────────────────────────────────────────────────────────────────────────
Input space      1   structure-aware generator      [ 0 1 2 ]      ____
Reflection       2   runtime shape introspection     [ 0 1 2 ]      ____
Directive        3   derived/authored oracle         [ 0 1 2 ]      ____
Runner + shrink  4   seeded harness + minimizer      [ 0 1 2 ]      ____
Loop owner       5   human | CI | agent              [ h c a ]      ____
─────────────────────────────────────────────────────────────────────────
DDT-ready when 1–4 ≥ 1 each. Reflection (Q2) is the force multiplier —
build it first if missing; it makes Q1 and Q3 nearly free.
```

---

## 3. Authoring directives (the oracle method)

This is the part teams get stuck on ("what property do I even write?"). Use the
decision tree, then the archetype recipes, then check soundness.

### 3.1 The directive decision tree

```
Do you have an INVERSE? (encode/decode, parse/print, serialize/load, migrate up/down)
   └─ yes ─► ROUND-TRIP:     decode(encode(x)) == x        ← start here, highest ROI
Do you have a SECOND implementation or an OLD version?
   └─ yes ─► DIFFERENTIAL:   A(x) == B(x)                  ← free correctness, no spec
Is there a property that must ALWAYS hold of the output?
   └─ yes ─► INVARIANT:      P(f(x)) is true               ← e.g. sorted, balanced, conserved
Is there a meaning-PRESERVING transform of the input?
   └─ yes ─► METAMORPHIC:    rel(f(x), f(t(x)))            ← when there's no ground truth
None of the above?
   └─────► NEVER-CRASHES:    f(x) returns / doesn't throw  ← free baseline; still finds bugs
   └─────► or ASK AN LLM to propose a candidate, then verify it (§3.5, agents doc)
```

### 3.2 The four archetypes (with the law and a worked instance)

| Archetype | Law | What you need | Worked instance |
|---|---|---|---|
| **Round-trip** | `decode(encode(x)) == x` | an inverse pair | RunTypes O5/O6: JSON & binary wire stable through `decode∘encode` |
| **Differential** | `A(x) == B(x)` | two impls / versions | RunTypes O12: JSON wire == JSON-of-(binary round-trip); Csmith: GCC vs LLVM |
| **Invariant** | `P(f(x))` always | a never-broken property | RunTypes O1/O2: `validate(mock(T))` true; `validate(corrupt)` false |
| **Metamorphic** | `rel(f(x), f(t(x)))` | a meaning-preserving `t` | EMI: mutate dead code → same output; "erase inferable annotation → still type-checks" |

Wlaschin's named patterns map onto these and are worth teaching verbatim:
*"There and back again"* (round-trip), *"The test oracle"* (differential /
model-based), *"Some things never change"* (invariant), *"Different paths same
destination"* and *"The more things change…"* (metamorphic / idempotence).

### 3.3 Deriving directives from reflection (the free ones)

When you have Q2 (reflection), three directives are **mechanical**, no spec
required:

```
1. ROUND-TRIP (type-level):  v = generate(T)  ⇒  validate(T)(v) == true
       generate and validate are two independent readings of "inhabits T";
       any disagreement is a real bug in one of them. Self-differential.

2. DIFFERENTIAL (runtime vs static):  the runtime validator for T is a
       reference implementation of the static type T. Values the static type
       accepts must pass the validator; rejects must fail. Divergence =
       unsoundness or lossy reflection. (The TSTest pattern, generalized.)

3. METAMORPHIC (transform-preserving):  any meaning-preserving type/value
       transform — reorder fields, widen a union, encode→decode, erase→reinfer —
       must preserve the verdict. Mutate and re-check. (The EMI / Hephaestus
       pattern.)
```

This is the engine of the whole approach: **the generator is the product, and
the oracle is "two derivations of the same structure must agree."**

### 3.4 Corruption directives — testing the *negative* space

A validator that accepts everything is useless, so you also need inputs that
**must be rejected**. Derive them by reflection too: walk the structure, change
exactly one position to a provably-wrong value, assert rejection. (RunTypes'
`mutateToInvalid` / `invalidForKind` — "the inverse giant switch.")

Steal Hephaestus's two type-level corruptions directly:
- **erase what's inferable → must still pass** (targets inference bugs);
- **overwrite with something incompatible → must be rejected** (targets
  soundness bugs).

### 3.5 The soundness contract (read this twice)

A directive is a claim you trust enough to *fail the build on*. So its failure
must be **sound**: when it fires, something is genuinely wrong.

Make corruption/transform directives **one-directional and conservative**:

> **False negative** (missed a possible corruption) only costs *coverage*.
> **False positive** (flagged a value that's actually valid) produces a *spurious
> failure* and destroys trust. **Never trade toward false positives.**

Concretely: never corrupt at a position where a sibling could re-accept it
(under a union, `any`/`unknown`, an index signature, a Map/Set interior). When in
doubt, generate *less* aggressively. RunTypes encodes this as the `proven` flag
and refuses to corrupt unprovable positions — the same shape as its serializer's
noop-elision contract.

**The whole self-improvement story (Framework 2) rests on this:** an agent can
only safely optimize against a directive whose failures are sound and whose
*pass* genuinely implies correctness — i.e. an oracle it **cannot quietly game**.

---

## 4. The tooling map — what to build, in order

```
build order   capability        concrete artifact                       effort
───────────────────────────────────────────────────────────────────────────────
1  (if any)   Reflection (Q2)   runtime shape introspection             high, one-time
                                 → unlocks 2 and 3 for ALL shapes
2             Generator (Q1)     value gen from shape (+ type gen)       med (free w/ Q2)
3             Harness (Q4)       seeded RNG, iteration driver, shrink,   med
                                 regression sink
4             Directive (Q3)     decision tree (§3) → derived/authored   low to run,
                                 oracle; corruption gen; soundness gate   high to get right
5  (optional) Loop owner (Q5)    CI gate → APR/agent loop                varies
───────────────────────────────────────────────────────────────────────────────
```

Counter-intuitive but load-bearing: **build reflection first**. It is the
expensive one-time investment that makes generators and oracles fall out for
free, for every shape, forever. Everyone who has the two halves (PropEr, typia,
Schemathesis, RunTypes) got there by reflecting a single source of truth.

---

## 5. It generalizes — domain → generator → directive

The recipe is **structure → generator → derivable directive**. Anywhere a
machine-readable description of "valid" exists, instantiate the table:

| Domain | Generator (from…) | Directive(s) you can derive |
|---|---|---|
| **Serializers / codecs** (JSON, protobuf, binary) | values of type `T` | round-trip `decode(encode v)==v`; differential lib-A vs lib-B |
| **Schema validators** (Zod, Ajv, io-ts) | values + near-misses from the schema | invariant `parse(generate(schema))` ok; near-miss must fail; differential vs the type |
| **ORMs / migrations** | model instances; migration sequences | round-trip `read(write x)==x`; metamorphic `up∘down==id`; post-migration invariants |
| **APIs** (OpenAPI, GraphQL) | requests conforming to schema | invariant "no 5xx + response matches schema"; differential vs prior version (Schemathesis) |
| **Parsers ↔ printers** | random valid ASTs | round-trip `parse(print ast)==ast`; idempotence `print∘parse` stable |
| **Compilers / transpilers** | random well-typed programs | differential across backends/opt-levels; metamorphic (EMI) |
| **State machines / protocols** | random command sequences | model-differential (real vs reference model per step); safety invariants (Jepsen) |
| **Data pipelines (ETL)** | records of the declared schema | metamorphic (filter/map algebra); conservation invariants (row count, sums) |
| **Config loaders** | configs from the config schema | round-trip `serialize(load c)==c`; defaults/constraints invariant |

Every row reduces to one of the four archetypes. If you can describe "valid,"
you can generate it and derive at least one directive for it.

---

## 6. Two worked walkthroughs

### 6.1 RunTypes (reflection-native — score 2/2/2/2)

- **Q1 generator:** `createMockDataFn<T>()` (values) + `test/fuzz/typeGen.ts`
  (random types — "the third giant switch").
- **Q2 reflection:** `getRunType<T>()` walks any type at runtime; the marker
  system reifies `T` at call sites.
- **Q3 directives:** O1/O2 (invariant), O5/O6 (round-trip), **O12 (differential:
  JSON vs binary encoders of the same type)**, O4 (consistency); TR1–TR4 at the
  resolver/emit tier. All derived, none hand-written.
- **Q4 harness:** `seededRng.ts` (`mulberry32`, `withSeededRandom`),
  `fuzzRunner.ts`/`typeFuzzRunner.ts`, conservative `mutateToInvalid` shrink,
  regressions pinned (e.g. `binaryEncoderResize.test.ts`).
- **Result:** a real shipped bug (binary buffer overflow) on the first run. See
  [`../../FUZZING.md`](../../FUZZING.md) and
  [`../../done/binary-buffer-sizing.md`](../../done/binary-buffer-sizing.md).

### 6.2 A plain JSON codec (no reflection — score 1/0/1/1 → here's the plan)

Suppose you have `encode(user: User): string` / `decode(s): User` and *no*
runtime type info.

- **Q2 (missing):** you have no reflection. Two options: (a) adopt a schema lib
  (Zod) so `User` becomes an introspectable value; (b) hand-write one
  `fc.Arbitrary<User>`. Option (a) buys you reflection for *every* type; (b) is
  one type's worth.
- **Q1:** `zod-fast-check` derives the generator from the Zod schema — free once
  you did (a).
- **Q3:** the inverse already exists → **round-trip** directive
  `decode(encode(u)) == u`. That single directive, over a generated `User`, is
  the highest-ROI test in the codebase and will immediately surface unicode,
  empty-collection, and optional-vs-missing bugs.
- **Q4:** wrap it in `fc.assert` (seed + shrink are built in); park any
  counterexample as a unit test.
- **Payoff:** one afternoon, one directive, and you are fuzzing — exactly the
  RunTypes story at small scale.

---

## 7. Maturity model

```
L0  Example tests only.                      "test what you thought of"
L1  One hand-written generator + one         a round-trip property in fast-check
    directive (usually round-trip).
L2  Reflection-derived generators +          RunTypes Phase 1: values vs fixed types
    multiple directives, seeded + shrunk.
L3  Generate the STRUCTURES too; run the      RunTypes Phase 2: generate types,
    full pipeline.                            compile, run, check
L4  Agent owns the loop; directive is the     framework-self-improving-agents.md
    reward signal, with a trust anchor.
```

Most teams live at L0. **Getting to L1 is one round-trip property.** The jump
from L1→L2 is the reflection investment (§4). L4 is the frontier and only as
safe as L2/L3's directives.

---

## 8. Anti-patterns

- **Characterization masquerading as an oracle.** Auto-generating tests that
  assert *current* behavior (Diffblue, Qodo Cover) bakes today's bugs into green
  tests. A directive must encode *intended* behavior (spec/inverse/relation),
  not observed behavior.
- **Plausible mocks instead of adversarial generators.** Faker-style mock data
  (`@anatine/zod-mock`, `intermock`) gives realistic fixtures, not the empty
  strings, null bytes, huge arrays, and combining characters that find bugs. Mock
  data ≠ a generator.
- **Flaky directive = poisoned signal.** Ambient `Math.random`/wall-clock/network
  make failures unreproducible and, in an agent loop, train the loop to "fix"
  flakiness by deleting assertions. Seed everything (Q4).
- **Unsound corruption.** A false-positive directive (flagging valid input) burns
  trust faster than a missing one. Stay conservative (§3.5).
- **Skipping reflection and hand-writing per-type.** Works for one type; doesn't
  scale. If you'll fuzz more than a handful of shapes, build Q2 first.

---

## 9. One-paragraph summary

Recognize the five-part loop (structure → generator → run → directive → shrink).
Score a project on the five questions; build the missing tooling **reflection
first**, because reflection makes generators and oracles fall out for free.
Author directives with the decision tree — reach for round-trip first, then
differential, invariant, metamorphic, with "never crashes" as a free baseline —
and keep every corruption/transform directive **one-directionally sound** so a
*pass* genuinely means correct. That soundness is also the license to hand the
loop to an agent, which is Framework 2.
