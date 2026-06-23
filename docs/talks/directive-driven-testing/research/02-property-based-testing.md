# Property-Based Testing, Metamorphic Testing & Oracles

*"Hypothesis-directed" testing: specify what must always be true, generate the inputs, let the machine hunt for a counterexample, then shrink it to the smallest reproducer.*

A research brief for a JS/TS + general-tech conference talk. Every load-bearing claim is cited inline as `[n]`; see [Sources](#sources).

---

## 1. The Big Idea: Properties Instead of Examples

A traditional unit test is an **example**: "for *this* input, I expect *that* output." You write the inputs, you write the answers, and you only ever test the cases you thought of.

**Property-based testing (PBT)** inverts this. You state a **property** (an invariant, a law) that must hold for *all* inputs in some domain, and the framework generates hundreds or thousands of random inputs trying to falsify it. When it finds a counterexample, it **shrinks** it to a minimal failing case and reports that.

```
example test:   assert sort([3,1,2]) == [1,2,3]
property test:  for all lists xs:  sort(xs) is sorted  AND  sort(xs) is a permutation of xs
```

The mindset shift the talk should sell: *stop enumerating cases, start specifying laws.* You are no longer the test-case author; you are the **specification author**, and the machine is the adversary trying to break your spec [1][13].

---

## 2. QuickCheck — The Origin (Claessen & Hughes, Haskell, 2000)

PBT began with one paper:

- **Koen Claessen & John Hughes, "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs."** *Proceedings of the Fifth ACM SIGPLAN International Conference on Functional Programming (ICFP '00)*, Montreal, Sept 18–21 2000, pp. 268–279. DOI [10.1145/351240.351266](https://doi.org/10.1145/351240.351266) [1][2].
- It won the **ACM SIGPLAN Most Influential ICFP Paper Award (2010)** [12], and has since been ported to ~40 languages [1].

### What QuickCheck introduced

QuickCheck is **"a tool for testing Haskell programs automatically. The programmer provides a specification of the program, in the form of properties which functions should satisfy, and QuickCheck then tests that the properties hold in a large number of randomly generated cases"** [4]. Three design choices defined the genre:

1. **Properties as an embedded DSL.** Properties are ordinary Haskell functions, universally quantified over their parameters, conventionally named `prop_*` [3][12].
2. **Type-directed generation via the `Arbitrary` type class.** Each testable type provides an `arbitrary :: Gen a` generator (`Gen` is a monad); QuickCheck ships defaults for standard types and lets you write custom ones [4][12].
3. **`forAll`, conditional properties (`==>`), and distribution reporting (`classify` / `collect`).** `forAll` quantifies over an explicit generator; `p ==> q` *discards* a case when `p` is false; `classify`/`collect` report the distribution of generated data so you can confirm your generator actually exercises interesting cases [3].

### The canonical first examples (real Haskell)

```haskell
import Test.QuickCheck

-- Reversing a list twice is the identity.
prop_RevRev :: [Int] -> Bool
prop_RevRev xs = reverse (reverse xs) == xs

-- reverse distributes over (++) by swapping the operands.
prop_RevApp :: [Int] -> [Int] -> Bool
prop_RevApp xs ys = reverse (xs ++ ys) == reverse ys ++ reverse xs

-- A conditional property: insertion preserves sortedness (only test sorted inputs).
prop_Insert :: Int -> [Int] -> Property
prop_Insert x xs = ordered xs ==> ordered (insert x xs)
```

Running `quickCheck prop_RevRev` generates ~100 random `[Int]` and prints `+++ OK, passed 100 tests.`; a failure prints a counterexample [4][12]. `prop_RevRev` and the list-reverse pair are *the* textbook PBT examples — perfect for an opening slide.

> **Shrinking note:** the original 2000 paper generated random cases but did not yet have automatic shrinking; the `shrink` method on `Arbitrary` (reduce a failing value to simpler forms) became central shortly after and is now standard [12]. See §8.

---

## 3. Hypothesis — The Python Reinvention (David MacIver)

- **Hypothesis** is the dominant PBT library for Python, created by **David R. MacIver**; the academic write-up is **MacIver, Hatfield-Dodds et al., "Hypothesis: A new approach to property-based testing,"** *Journal of Open Source Software* 4(43):1891, 2019 [5][6]. It sees >100k downloads/week [5].

### The API

```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_is_idempotent(xs):
    assert sorted(sorted(xs)) == sorted(xs)

@given(st.text())
def test_encode_decode_roundtrip(s):
    assert s.encode("utf-8").decode("utf-8") == s
```

You decorate a test with `@given(...)`, passing **strategies** (`st.integers()`, `st.text()`, `st.lists(...)`, `st.builds(...)`, composed via `.map`, `.filter`, `st.one_of`). Hypothesis draws many inputs, records failures in an **example database** so a once-seen failure is replayed deterministically on the next run, and reports the **minimal** failing example [5][6].

### What is genuinely *new* about Hypothesis: Conjecture

QuickCheck-style libraries couple generation and shrinking to the *typed* value: every type needs both an `arbitrary` and a `shrink`. Hypothesis decouples them. Its core engine, **Conjecture**, is *"an interactive fuzzer for lightly structured byte streams... it does not need to understand the structure of the data it is generating at all"* [9].

- All strategies are built on **one primitive**: ask Conjecture for blocks of bytes (a **choice sequence**). A strategy is a *decoder* from that byte stream to a Python value [9].
- **Generation, shrinking, and serialization live entirely in the engine.** Strategy authors get all three for free — they never write a `shrink` function [9].
- **Shrinking operates on the underlying choice sequence, not the typed value.** Make the byte buffer lexicographically smaller/shorter and you automatically get a "simpler" value for *any* strategy. E.g. deleting the byte-interval that encodes one list element deletes that element and shifts the rest left [9]. The whole Conjecture implementation is *"a bit under a thousand significant lines"* [9].

This "shrink the source of randomness, not the value" model is the intellectual ancestor of fast-check's design and of "internal/integrated shrinking" generally — a great compare-and-contrast slide against classic QuickCheck.

---

## 4. fast-check — PBT for JavaScript / TypeScript (Nicolas Dubien)

- **fast-check** is the leading PBT framework for JS/TS, written in TypeScript by **Nicolas Dubien (GitHub `dubzzz`)**, MIT-licensed; used by Jest, Jasmine, fp-ts, io-ts, Ramda, and others [10][11]. Docs: <https://fast-check.dev>.

### Vocabulary

- **Arbitrary** — a generator (analogous to a QuickCheck `Gen` / Hypothesis strategy). `fc.Arbitrary<T>` produces values of type `T` *and* knows how to shrink them.
- **Property** — `fc.property(...arbitraries, predicate)`; the predicate returns `boolean` (or `void` and throws). `fc.asyncProperty` for `async` predicates.
- **Runner** — `fc.assert(property, { numRuns, seed, path })` runs it (default 100 runs) and throws a rich report on failure.

### Core arbitraries

```ts
fc.integer()            fc.integer({ min: 0, max: 100 })
fc.nat()                fc.float()  fc.double()  fc.bigInt()
fc.boolean()            fc.string()  fc.unicodeString()  fc.hexaString()
fc.constantFrom('a','b','c')          // pick from a fixed set
fc.array(fc.integer())  fc.uniqueArray(fc.integer())
fc.tuple(fc.string(), fc.nat())       // fixed-length, heterogeneous
fc.record({ id: fc.uuid(), age: fc.nat({ max: 120 }) })   // typed object
fc.dictionary(fc.string(), fc.integer())
fc.option(fc.integer())               // value or null
fc.oneof(fc.string(), fc.integer())   // union of arbitraries
fc.letrec(/* ... */)                  // mutually-recursive / tree arbitraries
```

`.map`, `.filter`, `.chain` transform/compose arbitraries; all derived arbitraries shrink correctly because shrinking is **integrated** (see §8).

### A complete property test

```ts
import fc from 'fast-check';
import { test } from 'vitest';

test('addition is commutative', () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (a, b) => {
      return a + b === b + a;            // must hold for ALL a, b
    }),
    { numRuns: 1000 }
  );
});
```

### Round-trip (the highest-value, lowest-effort property)

```ts
// JSON round-trip: parse ∘ stringify == identity, for any JSON-safe value.
test('JSON round-trips', () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      expect(JSON.parse(JSON.stringify(value))).toStrictEqual(value);
    })
  );
});

// Any encoder/decoder pair: decode ∘ encode == identity.
test('codec round-trips', () => {
  fc.assert(
    fc.property(fc.record({ id: fc.uuid(), tags: fc.array(fc.string()) }), (user) => {
      expect(decode(encode(user))).toStrictEqual(user);
    })
  );
});
```

fast-check will throw exactly the inputs hand-written tests forget — empty strings, null bytes, emoji and combining characters, RTL markers, huge arrays — which is why round-trip + `fc.string()` finds real encoding bugs [10]. On failure it prints the seed, the shrunk counterexample, and the number of shrink steps, e.g. `Counterexample: [""]` after reducing from some large random value.

---

## 5. PBT = Fuzzing With a Specification

The single most "presentation-worthy" framing: **a property-based test is a fuzzer whose oracle is your property.**

- The canonical statement is Nelson Elhage's essay **"Property-Based Testing Is Fuzzing"**: fuzzing and PBT are *"essentially the same practice, at least at a certain level of abstraction."* Both **automatically generate inputs to trigger violations of an asserted property** [16]. The difference is mostly the *oracle* and the *generator*:
  - A classic fuzzer's implicit property is **"does not crash"** — but *any* property can be encoded as `assert(p); // else it 'crashes'`, so "doesn't crash" generalizes to "doesn't violate my spec" [16].
  - PBT traditionally uses **typed, structured generators** and **integrated shrinking**; fuzzers traditionally use **random byte streams / mutation + coverage feedback** [16][8].
- The two have been *converging*. Coverage-guided PBT exists (**"Coverage Guided, Property Based Testing,"** Lampropoulos, Hicks, Pierce, OOPSLA 2019) [→ HypoFuzz lineage]; tools like **HypoFuzz** and **Crowbar** let you run the *same properties* under a coverage-guided fuzzing engine, transitioning between short PBT runs and long fuzzing campaigns [15][14]. **QuickFuzz** wired QuickCheck generators into off-the-shelf mutational fuzzers for file-format fuzzing [→ §2 lineage].
- Practical summary (from the literature): PBT *"overlaps with fuzzing but they're not the same — property-based testing usually needs more test-specific setup but is better at shrinking bugs and can focus generated input to specific parts of the state space"* [14]. Recall that **Hypothesis's own engine is literally described as "an interactive fuzzer for lightly structured byte streams"** [9] — the equivalence isn't a metaphor, it's the implementation.

**Slide line:** *Fuzzing finds crashes. PBT finds crashes too — plus every bug you can write down as a property. PBT is fuzzing + an explicit oracle.*

---

## 6. The Oracle Problem

A property *is* a kind of **test oracle** — so it's worth defining the oracle problem, because it's the deep reason PBT and metamorphic testing matter.

### Definition

A **test oracle** is *"a mechanism for determining whether a test has passed or failed."* The hard part of testing is rarely making inputs; it's deciding if the output is *right*:

> *"Given an input for a system, the challenge of distinguishing the corresponding desired, correct behaviour from potentially incorrect behaviour is called the 'test oracle problem'."*
> — Barr, Harman, McMinn, Shahbaz & Yoo (2015) [8-oracle]

It is **the central bottleneck of test automation**: input generation is heavily automated (fuzzing, search-based, symbolic execution), but checking correctness still often falls back to a human writing expected values by hand. The oracle is the part that resists automation, so it caps how far the whole pipeline can go [8-oracle].

### Weyuker 1982 — "non-testable programs"

- **Elaine J. Weyuker, "On Testing Non-testable Programs,"** *The Computer Journal* 25(4):465–470, Nov 1982 [W82]. She attacks the common assumption that an oracle always exists and defines a program as **non-testable** when:

  > *"either there does not exist an oracle or the tester must expend some extraordinary amount of time to determine whether or not the output is correct."* [W82]

  Two categories: **(1) no oracle exists** — e.g. *"programs which were written in order to determine the answer in the first place"* (scientific/numerical computation: you can't independently verify the result); **(2) an oracle exists but is impractical** — e.g. a program emitting all permutations of ten elements produces **3,628,800** outputs, *"surely too many to check ... manually"* [W82]. This paper coins the term and seeds the entire oracle-problem literature.

### The Barr et al. taxonomy (2015) — four kinds of oracle

**Barr, Harman, McMinn, Shahbaz, Yoo, "The Oracle Problem in Software Testing: A Survey,"** *IEEE TSE* 41(5):507–525, May 2015, DOI [10.1109/TSE.2014.2372785](https://doi.org/10.1109/TSE.2014.2372785) [8-oracle]. The standard classification:

| Kind | What decides correctness | Examples |
|---|---|---|
| **Specified** | A formal/explicit spec of intended behaviour | Formal specs (Z, B, VDM); **assertions**; **Design by Contract** (pre/post-conditions, invariants); algebraic/temporal specs [8-oracle] |
| **Derived** | Information *derived from artifacts* of the system | **Regression** (prior version's output); **pseudo-oracles / N-version / differential**; **metamorphic relations**; inferred invariants (Daikon); documentation [8-oracle] |
| **Implicit** | Universally-wrong behaviour, no domain knowledge needed | **Crashes**, **hangs / non-termination**, **null-pointer derefs**, **buffer overflows**, **memory leaks**, **deadlocks / races** [8-oracle] |
| **Human** | A person's judgement, when none of the above can be automated | Quantitative vs qualitative judgement; crowdsourced oracles [8-oracle] |

- A **derived** oracle *"differentiates correct and incorrect behaviour by using information derived from artifacts of the system"* [8-oracle].
- An **implicit** oracle *"requires neither domain knowledge nor a formal specification ... and applies to nearly all programs"* — this is the class **fuzzers** lean on (crash = bug) [8-oracle].

### Pseudo-oracles & differential testing (the "derived" sub-family)

- **Pseudo-oracles** originate with **Davis & Weyuker, "Pseudo-oracles for Non-testable Programs,"** *Proc. ACM '81*, pp. 254–257 [DW81]: an *independently produced* second implementation of the same spec; feed both the same input and compare. "Pseudo" because agreement doesn't prove correctness, *but where they differ, at least one is wrong* [DW81].
- **Differential testing** is the practical form: **William McKeeman, "Differential Testing for Software,"** *Digital Technical Journal* 10(1):100–107, 1998 [M98]: present two-or-more comparable systems with mechanically generated inputs — *"if the results differ, or one of the systems loops indefinitely or crashes, the tester has a candidate for a bug-exposing test"* [M98]. The discrepancy *is* the oracle. (See CSmith in §7 for the modern compiler version.)

**Where PBT sits:** a hand-written property is a **specified** oracle; "compare against a reference implementation" (§7, model-based) is a **derived/pseudo** oracle; "never crashes" is an **implicit** oracle. Metamorphic testing (§7) is a **derived** oracle. PBT frameworks let you express all of these.

---

## 7. Metamorphic Testing — Oracles Without Ground Truth

When you genuinely *cannot* say what the right answer is for a single input (Weyuker's non-testable programs), you can often still say how the answers to **related** inputs must relate. That is **metamorphic testing (MT)**.

### Origin & definition

- **T.Y. Chen, S.C. Cheung, S.M. Yiu, "Metamorphic Testing: A New Approach for Generating Next Test Cases,"** HKUST tech report **HKUST-CS98-01 (1998)**; re-released as **arXiv:2002.12543** [MT-origin]. The insight: even **passing** test cases carry exploitable information — transform a source input into a *follow-up* input via a known relation, and the outputs are constrained relative to each other [MT-origin].
- A **metamorphic relation (MR)** is *a necessary property of the target function relating two or more inputs and their expected outputs* [MT-rev]. The MT loop:
  1. **Source test case** *x* — run it; you need NOT know if its output is correct.
  2. **Input transformation** — derive **follow-up** input(s) (e.g. `x ↦ π − x`).
  3. **Output relation** — assert how the outputs must relate (e.g. equal).
  4. A **violation reveals a bug**; satisfaction raises confidence (MRs are *necessary, not sufficient*).
- **Crucial subtlety:** an MR must span **≥2 inputs**. `−1 ≤ sin(x) ≤ 1` is a true necessary property but is **not** an MR (single input); `sin(x) = sin(π−x)` **is** (two executions) [MT-rev].

### Canonical, slide-ready examples (relations written out)

- **Trigonometry / numerics** — you can't verify `sin(37°)` to machine precision, but: `sin(x) = sin(π − x)`; `sin(−x) = −sin(x)`; `sin(x) = sin(x + 2π)`. Divergence beyond rounding ⇒ bug [MT-rev][MT-untestable].
- **Search engines** — no objective oracle for "correct results." Let `S(q)` be the result set. Narrowing the query must shrink-or-preserve the results: `S(q AND c) ⊆ S(q)` and `|S(q AND c)| ≤ |S(q)|`. From **Zhou, Xiang, Chen, "Metamorphic Testing for Software Quality Assessment: A Study of Search Engines,"** *IEEE TSE* 42(3):264–284, 2016 — applied to Google/Bing/Baidu, found real ranking/content inconsistencies [MT-search].
- **Compilers — Equivalence Modulo Inputs (EMI).** **Le, Afshari, Su, "Compiler Validation via Equivalence Modulo Inputs,"** *PLDI 2014* (Distinguished Paper) [EMI]. Profile program `P` on input `I`, find code **not executed** on `I`, mutate that dead code to get `P′`. Since the mutation never runs, `P` and `P′` are equivalent *modulo* `I`: `output(compile(P)) on I == output(compile(P′)) on I`. Any divergence is a **miscompilation**. Result: **147 confirmed bugs in GCC/LLVM in 11 months** [EMI].
- **Compilers — differential (CSmith).** **Yang, Chen, Eide, Regehr, "Finding and Understanding Bugs in C Compilers,"** *PLDI 2011* [CSmith]: generate random *valid* C programs, compile across compilers, majority-vote (a *differential* oracle). **>325 bugs** in GCC/LLVM and even CompCert over ~3 years [CSmith]. Nice contrast: EMI's oracle is *metamorphic* (self-equivalence); CSmith's is *differential* (cross-compiler).
- **ML classifiers** — no oracle for the "correct" label, but a sound learner must be invariant to label-preserving transforms: permuting feature order `predict(σ(x)) = predict(x)`; scaling/affine-shifting numeric features; duplicating training rows of a class. From **Xie, Ho, Murphy, Kaiser, Xu, Chen, "Testing and Validating Machine Learning Classifiers by Metamorphic Testing,"** *J. Systems & Software* 84(4):544–558, 2011 [MT-ml]. Modern variant: *small perturbations must not flip the label* (robustness) — the basis of much DNN testing.
- **Shortest path** — `sp(G,a,b) = sp(G,b,a)` (undirected symmetry); subpath optimality `len(sp(a,b)) = len(sp(a,m)) + len(sp(m,b))` when `m` lies on a shortest path [MT-rev].

### Surveys & impact

- **Segura, Fraser, Sánchez, Ruiz-Cortés, "A Survey on Metamorphic Testing,"** *IEEE TSE* 42(9):805–824, 2016 — first comprehensive survey; MT found *real faults in mature software* (compilers, web services, simulators, bioinformatics) [MT-survey1]. Accessible companion: *"Metamorphic Testing: Testing the Untestable,"* *IEEE Software* 2020 [MT-untestable].
- **Chen, Kuo, Liu, Poon, Towey, Tse, Zhou, "Metamorphic Testing: A Review of Challenges and Opportunities,"** *ACM Computing Surveys* 51(1) Art. 4, 2018 — by the field's originators; the open problem is *systematically identifying good MRs* [MT-rev].

**Closing line for the MT slide:** *When you can't say what the right answer IS, you can still say how the answers to RELATED inputs must RELATE — and a program that violates those relations is provably wrong.*

### Metamorphic relations as fast-check properties

MT and PBT compose cleanly — an MR is just a property over a generated source input:

```ts
// sin(x) == sin(pi - x), within floating-point tolerance.
test('sin reflection MR', () => {
  fc.assert(
    fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (x) => {
      expect(Math.sin(x)).toBeCloseTo(Math.sin(Math.PI - x), 10);
    })
  );
});
```

---

## 8. Shrinking / Minimization — Why It Is the Killer Feature

Random testing's weakness is that a counterexample is usually *huge and noisy* — a 4,000-element array with a 38-character unicode string buried inside. **Shrinking** turns that into the **smallest input that still fails**, which is what makes the bug diagnosable.

- After a failure, the framework repeatedly applies *simplifying* transforms (smaller numbers, shorter lists, removed elements, lexicographically smaller bytes), re-running the property, keeping any still-failing reduction, until it reaches a local minimum [4][9][10].
- **Two architectural schools:**
  - **Type-directed (classic QuickCheck):** each `Arbitrary` provides an explicit `shrink :: a -> [a]`. Powerful but every type needs hand-written shrink logic, and composed generators can shrink poorly [12].
  - **Integrated / internal shrinking (Hypothesis, fast-check):** shrink the **source of randomness** (the choice sequence / byte stream), so *every* derived arbitrary shrinks for free and `.map`/`.filter` compositions stay shrinkable. fast-check builds shrinking into the `Arbitrary` itself; Hypothesis's Conjecture shrinks the byte buffer [9][10]. This is why fast-check can *"efficiently shrink failing scenarios"* even for `fc.commands` and `fc.oneof` where array-of-union generators cannot [10].
- The payoff, concretely: a failure that first appears as `[847, -3, 0, ... 4000 more ...]` shrinks to something like `[0, 0]` or `[""]`, and fast-check reports the **seed** + **shrunk counterexample** + **number of shrink steps** so the failure is deterministically replayable [10].

**Slide line:** *Generation finds the bug; shrinking makes it a one-line reproducer.*

---

## 9. Stateful / Model-Based Testing — Properties Over *Sequences*

Single-call properties don't catch bugs that only appear after a *sequence* of operations (a cache, a database, a UI, a data structure). **Model-based (stateful) testing** generates random **command sequences**, runs them against the **real system (SUT)**, and checks each step against a **simplified model / reference implementation** — the model is the oracle [10][13].

This is exactly Scott Wlaschin's **"test oracle"** pattern: *"create a simplified model in parallel with your system under test, do the same (simplified) things to the model, and compare the model's state with the system's"* [13].

### fast-check API

You implement the `fc.Command<Model, Real>` interface (`check(model)` gates whether a command is applicable; `run(model, real)` mutates *both* and asserts they agree), build a sequence with `fc.commands([...commandArbitraries])`, and execute with `fc.modelRun` (or `fc.asyncModelRun`) [10].

```ts
import fc from 'fast-check';

// SUT: a real list. Model: a plain number tracking expected length.
type Model = { length: number };
class List { data: number[] = []; push(v: number) { this.data.push(v); } pop() { return this.data.pop(); } size() { return this.data.length; } }

class PushCmd implements fc.Command<Model, List> {
  constructor(readonly value: number) {}
  check = (_m: Readonly<Model>) => true;          // always applicable
  run(m: Model, r: List) {
    r.push(this.value);
    m.length++;
    expect(r.size()).toBe(m.length);              // model vs real
  }
  toString = () => `push(${this.value})`;         // readable failing sequences
}

class PopCmd implements fc.Command<Model, List> {
  check = (m: Readonly<Model>) => m.length > 0;   // only pop a non-empty list
  run(m: Model, r: List) {
    r.pop();
    m.length--;
    expect(r.size()).toBe(m.length);
  }
  toString = () => 'pop()';
}

test('list behaves like its length model', () => {
  const commands = fc.commands([
    fc.integer().map((v) => new PushCmd(v)),
    fc.constant(new PopCmd()),
  ]);
  fc.assert(
    fc.property(commands, (cmds) => {
      const real = () => ({ model: { length: 0 }, real: new List() });
      fc.modelRun(real, cmds);                    // runs the sequence, checks each step
    })
  );
});
```

Key points the talk should make [10]:
- `fc.commands` is *"like an enhanced array that efficiently shrinks failing scenarios"* — a failing 50-command sequence shrinks to the minimal command subsequence that breaks the invariant.
- `check` keeps generated sequences *valid* (don't pop an empty list), so you explore the realistic state space.
- `toString` makes the counterexample a readable script, e.g. `push(0),push(0),pop(),pop()`.
- Replaying a model-based failure needs the extra `replayPath` (alongside `seed`/`path`) printed in the report.

This is the JS/TS analogue of QuickCheck's stateful machine model and FsCheck's experimental stateful API.

---

## 10. The Property Catalogue — How to Find Properties (Wlaschin's Patterns)

The hardest part of PBT in practice is *"what property do I even write?"* Scott Wlaschin's **"Choosing properties for property-based testing"** gives the canonical, memorable pattern names [13]. These double as the common **"oracles"** of PBT:

| Pattern (Wlaschin's name) | Law | fast-check sketch |
|---|---|---|
| **"There and back again"** (round-trip / inverse) | `decode(encode(x)) == x` | `parse`∘`print`, `deserialize`∘`serialize`, `decompress`∘`compress` |
| **"Different paths, same destination"** (commutativity) | `f(g(x)) == g(f(x))`; `a+b == b+a` | sort-then-map == map-then-sort (for order-independent maps) |
| **"Some things never change"** (invariants) | a property preserved by the operation | `sort(xs)` is a permutation of `xs`; balance never negative |
| **"The more things change, the more they stay the same"** (idempotence) | `f(f(x)) == f(x)` | `sort`, `normalize`, `dedup`, `abs` |
| **"Solve a smaller problem first"** (structural induction) | result on a structure relates to result on its parts | recursive data / divide-and-conquer |
| **"Hard to prove, easy to verify"** | generating the answer is hard; checking it is easy | a maze solution is hard to find, trivial to validate |
| **"The test oracle"** (model-based / reference) | new impl agrees with a simpler trusted one | optimized code vs naive reference (§9) |

Add three more workhorse patterns the literature emphasizes:

- **Never crashes / no exceptions** (the implicit oracle): `fc.property(arb, (x) => { f(x); })` — passes unless `f` throws. The cheapest property; turns PBT into a structured fuzzer (§5).
- **Metamorphic** (§7): outputs of related inputs must relate.
- **Consistency between two operations**: e.g. `list.contains(x)` is true iff `x` is in `list.toArray()`.

**Talk takeaway:** you almost never need a full spec. Reach for round-trip first (highest ROI), then invariants and idempotence, then a model/oracle for the complex stuff, and "never crashes" as a free baseline.

---

## 11. One-Slide Summary

- **PBT** = state laws, generate inputs, find a counterexample, shrink it. Born with **QuickCheck (Claessen & Hughes, ICFP 2000)** [1].
- **Hypothesis** (MacIver, Python) reinvented the engine: generate & shrink a **byte/choice stream**, not typed values, via **Conjecture** — *"an interactive fuzzer for lightly structured byte streams"* [9].
- **fast-check** (Dubien) brings this to JS/TS with `fc.assert`/`fc.property`/arbitraries/integrated shrinking and **model-based** testing via `fc.commands`/`fc.modelRun` [10].
- **PBT is fuzzing + an explicit oracle (your property)** — the practices are converging (coverage-guided PBT, HypoFuzz) [16][14].
- The deep reason it matters is the **oracle problem** (Weyuker 1982; Barr et al. 2015): deciding if output is *correct* is the bottleneck of test automation [W82][8-oracle].
- When there is **no ground truth**, **metamorphic testing** (Chen et al. 1998) supplies a derived oracle from relations between related inputs — and it found **147 GCC/LLVM bugs in 11 months** [EMI].
- **Shrinking** is what turns a random failure into a minimal, deterministic reproducer [9][10].

---

## Sources

[1] QuickCheck (Claessen & Hughes, ICFP 2000) — Papers We Love & paper metadata: <https://paperswelove.org/papers/quickcheck-a-lightweight-tool-for-random-testing-o-42b89925/>; DOI: <https://doi.org/10.1145/351240.351266>

[2] Alastair Reid, related-work page for *QuickCheck: A lightweight tool for random testing of Haskell programs* (venue, pages, ICFP '00): <https://alastairreid.github.io/RelatedWork/papers/claessen:icfp:2000/>

[3] QuickCheck manual — properties, `forAll`, `==>`, `classify`/`collect`, `prop_RevRev`: <https://www.cse.chalmers.se/~rjmh/QuickCheck/manual_body.html>

[4] QuickCheck home (Chalmers) — "programmer provides a specification ... properties ... tested in a large number of randomly generated cases": <https://www.cse.chalmers.se/~rjmh/QuickCheck/>

[5] Hypothesis on PyPI — strategies, `@given`, shrinking, adoption stats: <https://pypi.org/project/hypothesis/>

[6] MacIver, Hatfield-Dodds et al., *Hypothesis: A new approach to property-based testing*, JOSS 4(43):1891, 2019: <https://joss.theoj.org/papers/10.21105/joss.01891>

[7] *In praise of property-based testing* (Increment) — PBT overview, QuickCheck lineage: <https://increment.com/testing/in-praise-of-property-based-testing/>

[8] David R. MacIver, *How Hypothesis Works* — Conjecture, "interactive fuzzer for lightly structured byte streams", choice-sequence shrinking, ~1000 LOC: <https://hypothesis.works/articles/how-hypothesis-works/>

[9] (same as [8]) Conjecture internals / choice-sequence shrinking: <https://hypothesis.works/articles/how-hypothesis-works/>

[10] fast-check — GitHub repo (author Nicolas Dubien/`dubzzz`, API, integrated shrinking, used-by) and model-based docs: <https://github.com/dubzzz/fast-check> and <https://fast-check.dev/docs/advanced/model-based-testing/>

[11] fast-check on npm — overview, TypeScript, adoption: <https://www.npmjs.com/package/fast-check>

[12] QuickCheck (Grokipedia) — Most Influential ICFP Paper Award 2010, `Arbitrary`/`shrink`, EDSL framing, ~40 ports: <https://grokipedia.com/page/QuickCheck>

[13] Scott Wlaschin, *Choosing properties for property-based testing* (F# for Fun and Profit) — round-trip/commutativity/invariant/idempotence/oracle/model-based pattern names: <https://fsharpforfunandprofit.com/posts/property-based-testing-2/>

[14] *Randomized Property-Based Testing and Fuzzing* (PLUM @ UMD) — PBT vs fuzzing relationship, shrinking, coverage-guided PBT, HypoFuzz/Crowbar lineage: <https://plum-umd.github.io/projects/random-testing.html>

[15] HypoFuzz — related research (coverage-guided PBT literature, transitioning PBT↔fuzzing): <https://hypofuzz.com/docs/literature.html>

[16] Nelson Elhage, *Property-Based Testing Is Fuzzing* — "essentially the same practice", "does not crash" generalizes to any property, generator/oracle differences: <https://blog.nelhage.com/post/property-testing-is-fuzzing/>

[17] Harrison Goldstein et al., *Property-Based Testing in Practice* (ICSE 2024) — empirical study, PBT/fuzzing workflow differences: <https://harrisongoldste.in/papers/icse24-pbt-in-practice.pdf>

### Oracle problem

[W82] Elaine J. Weyuker, *On Testing Non-testable Programs*, The Computer Journal 25(4):465–470, 1982 — definition of non-testable program; permutations example: <https://academic.oup.com/comjnl/article/25/4/465/366384> (free course copy: <https://homes.cs.washington.edu/~rjust/courses/CSE503/2021_02_12-reading1.pdf>)

[8-oracle] Barr, Harman, McMinn, Shahbaz, Yoo, *The Oracle Problem in Software Testing: A Survey*, IEEE TSE 41(5):507–525, 2015, DOI 10.1109/TSE.2014.2372785 — oracle-problem definition + specified/derived/implicit/human taxonomy: <https://dl.acm.org/doi/10.1109/TSE.2014.2372785> (author PDF: <https://earlbarr.com/publications/testoracles.pdf>)

[DW81] Davis & Weyuker, *Pseudo-oracles for Non-testable Programs*, Proc. ACM '81, pp. 254–257 — origin of pseudo-oracles: <https://dl.acm.org/doi/10.1145/800175.809889>

[M98] William McKeeman, *Differential Testing for Software*, Digital Technical Journal 10(1):100–107, 1998 — "if the results differ ... candidate for a bug-exposing test": <https://dblp.org/rec/journals/dtj/McKeeman98.html> (PDF: <https://www.cs.swarthmore.edu/~bylvisa1/cs97/f13/Papers/DifferentialTestingForSoftware.pdf>)

### Metamorphic testing

[MT-origin] Chen, Cheung, Yiu, *Metamorphic Testing: A New Approach for Generating Next Test Cases* (HKUST-CS98-01, 1998; re-released arXiv:2002.12543): <https://arxiv.org/abs/2002.12543>

[MT-rev] Chen, Kuo, Liu, Poon, Towey, Tse, Zhou, *Metamorphic Testing: A Review of Challenges and Opportunities*, ACM Computing Surveys 51(1) Art. 4, 2018 — MR definition; the ≥2-input subtlety: <https://dl.acm.org/doi/10.1145/3143561>

[MT-survey1] Segura, Fraser, Sánchez, Ruiz-Cortés, *A Survey on Metamorphic Testing*, IEEE TSE 42(9):805–824, 2016: <https://dblp.org/rec/journals/tse/SeguraFSC16.html> (OA: <https://eprints.whiterose.ac.uk/110335/>)

[MT-untestable] Segura et al., *Metamorphic Testing: Testing the Untestable*, IEEE Software 2020 — plain-language overview, sine MRs, oracle framing: <https://personales.us.es/sergiosegura/files/papers/segura20-software.pdf>

[MT-search] Zhou, Xiang, Chen, *Metamorphic Testing for Software Quality Assessment: A Study of Search Engines*, IEEE TSE 42(3):264–284, 2016 — search-engine MRs (subset/result-count under refinement): <https://www.semanticscholar.org/paper/589708faf99880ea47dc30c37c3942129d025c9e>

[EMI] Le, Afshari, Su, *Compiler Validation via Equivalence Modulo Inputs*, PLDI 2014 — EMI dead-code mutation; 147 confirmed GCC/LLVM bugs in 11 months: <https://dl.acm.org/doi/10.1145/2594291.2594334> (project: <https://web.cs.ucdavis.edu/~su/emi-project/>)

[CSmith] Yang, Chen, Eide, Regehr, *Finding and Understanding Bugs in C Compilers*, PLDI 2011 — random valid C + differential oracle; >325 bugs: <https://dl.acm.org/doi/10.1145/1993498.1993532>

[MT-ml] Xie, Ho, Murphy, Kaiser, Xu, Chen, *Testing and Validating Machine Learning Classifiers by Metamorphic Testing*, J. Systems & Software 84(4):544–558, 2011 — classifier MRs (permutation, scaling, duplication): <https://www.cs.columbia.edu/wp-content/uploads/sites/7/2016/08/jss2011.pdf>

---

*Verification note: WebFetch was HTTP-403 blocked for this research session, so primary-source text was gathered via WebSearch result snippets (which quote the original papers) and cross-confirmed across multiple independent mirrors (DBLP, ACM DOI pages, author-hosted PDFs, course copies). Bibliographic facts (titles, authors, venues, volumes, pages, years) were each corroborated by ≥2 sources; numeric claims (e.g. EMI's 147 bugs, CSmith's 325+) appeared verbatim in multiple snippets quoting the abstracts. The TypeScript/Haskell/Python code snippets follow the documented public APIs of fast-check, QuickCheck, and Hypothesis respectively.*
