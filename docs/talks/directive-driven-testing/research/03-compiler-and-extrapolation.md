# Fuzzing Compilers, Type Checkers & Language Tooling — and Where the "Reflection + Type-Generator + Value-Generator" Recipe Extrapolates

> Research brief for a JS/TS + general-tech conference talk.
> Thesis in one line: **a project that already owns (a) type reflection, (b) a random well-formed-type generator, and (c) random value generators that inhabit a type can auto-derive both the *input space* and *strong oracles* for fuzzing — exactly the two ingredients that made compiler/type-tooling fuzzing the most productive bug-finding niche in PL research.**

---

## 1. Why compilers and type tooling are the *ideal* fuzzing target

Fuzzing is only as good as two things: the **input space** you can explore and the **oracle** that tells a bug from noise. Compilers, type checkers, serializers, and schema tools are unusually good on *both* axes:

1. **Rich, structured input space.** The valid inputs are programs / types / values — described by a grammar or a type system. You cannot find deep miscompiles by feeding random bytes; you need *valid, well-typed* inputs. A generator that understands the structure produces inputs that get *past* the front end and stress the interesting middle/back end.
2. **Strong, derivable oracles.** Most software has the *oracle problem*: given an output, was it correct? Compilers escape it three ways, all of which a reflection+generator project gets for free:
   - **Differential testing** — multiple implementations of the same spec must agree on the same input (McKeeman) [1]. No reference spec needed; the *implementations themselves* are the oracle.
   - **Metamorphic / round-trip relations** — a transformation that *should* preserve meaning must produce equivalent output (EMI, encode∘decode = id) [4][13].
   - **Reference implementation** — a slow, obviously-correct version (e.g. a runtime validator) checks a fast/clever one (the static type).
3. **Reference implementations exist to diff against.** GCC vs LLVM vs CompCert; V8 vs JSC vs SpiderMonkey; runtime validator vs compile-time type. Disagreement localizes a bug without anyone writing "expected output."

The headline lesson from 15 years of this work: **generation-based, structure-aware fuzzing with a free oracle finds *hundreds* of real bugs in software that was already heavily tested by experts.** The sections below are the receipts.

---

## 2. The canonical result: Csmith (PLDI 2011)

**"Finding and Understanding Bugs in C Compilers"** — Xuejun Yang, Yang Chen, Eric Eide, John Regehr, University of Utah, **PLDI 2011** [2][3].

- **What it does.** Csmith is "a random generator of C programs. Its primary purpose is to find compiler bugs with random programs, **using differential testing as the test oracle**" [5] (verbatim from the project README). It generates loop-, struct-, pointer- and array-rich C with complex control flow.
- **The hard part — staying inside defined behavior.** C is a minefield of undefined and unspecified behavior (signed overflow, uninitialized reads, sequence-point violations). A naive generator produces programs whose "correct" output is *undefined*, so differential disagreement means nothing. Csmith's contribution is generating a large, expressive subset of C while **provably avoiding the undefined/unspecified behaviors** that would destroy the oracle [2][8]. This is the single most-cited design lesson: *the generator must guarantee the property the oracle depends on.*
- **The oracle.** Compile the same program with many compilers (and optimization levels), run them, and **vote by majority**; an output in the minority flags a wrong-code bug. Crashes are bugs directly.
- **Results (the numbers to quote).** Over ~3 years they reported **more than 325 previously unknown bugs** to **11 different C compiler teams** [2]. Of these, **79 GCC bugs and 202 LLVM bugs** [3]; **25 of the GCC bugs were marked P1** (maximum, release-blocking priority), and their reports were about **2% of all LLVM bug reports** in the period [3]. **Every compiler tested** — GCC, LLVM/Clang, commercial compilers — was made to both crash *and* silently miscompile valid input [2].
- **The CompCert contrast (a great slide).** CompCert is a *formally verified* optimizing C compiler. Csmith found bugs in its **unverified** parts (front end / unproven components) but, after roughly six CPU-years of testing, **could not produce a wrong-code error from CompCert's verified core** — at the time the only compiler tested for which that was true [2][6]. The takeaway: verification visibly moved the needle, but the un-verified edges still had bugs.

**Follow-on you can name-drop:** *Test-Case Reduction for C Compiler Bugs* (Regehr et al., PLDI 2012, the C-Reduce tool) turns a giant failing program into a minimal one automatically — shrinking is the other half of practical fuzzing [reduction tooling] [3].

---

## 3. Differential testing as an oracle strategy (McKeeman, 1998)

**"Differential Testing for Software"** — William M. McKeeman, *Digital Technical Journal* 10(1):100–107, 1998 [1].

- **Definition.** Differential testing automatically generates tests for software that has **multiple implementations of the same specification**: feed identical input to two or more comparable programs (or two versions of one program); **any difference in output is a candidate bug** [1]. It is a *cross-referencing oracle* — it sidesteps the oracle problem entirely because no formal statement of "correct" is needed, only the assumption that the implementations *should* agree.
- **The seven input tiers (a nice teaching device).** McKeeman's own compiler experiments staged input generation in tiers of increasing structure, from "random sequence of ASCII characters" up to "**model-conforming C programs**" — illustrating that you get deeper into the system the more structure your generator respects [1]. This directly motivates the modern "semantics-aware generator" thread.
- **Lineage.** Essentially every compiler/engine fuzzer in this brief uses differential testing as the primary or secondary oracle. Csmith cites it as *the* oracle; JS-engine fuzzers diff the interpreter against the JIT; the JVM type-system fuzzers diff javac/kotlinc/groovyc against each other.

---

## 4. Metamorphic compiler testing: EMI (PLDI 2014)

**"Compiler Validation via Equivalence Modulo Inputs"** — Vu Le, Mehrdad Afshari, Zhendong Su, UC Davis, **PLDI 2014** [4][13].

- **Idea.** Take a real program plus some test inputs. Profile which statements *execute*; **stochastically delete unexecuted ("dead") code**. The mutant is *equivalent modulo those inputs* — it must produce identical output on those inputs. If a compiler makes the mutant behave differently, that compiler has a bug. This is **metamorphic testing**: a meaning-preserving transformation whose output relation is known.
- **Why it matters for the thesis.** EMI shows a *self-differential* oracle — you don't need a second compiler, you need a **transformation that provably preserves a property** and a generator of such transformations. A reflection+generator project that can mutate a type/value while preserving "inhabits T" owns exactly this.
- **Result.** Eleven months of testing produced **147 confirmed, unique bug reports for GCC and LLVM alone** [4].

---

## 5. JavaScript-engine fuzzing: Fuzzilli (NDSS 2023)

**"FUZZILLI: Fuzzing for JavaScript JIT Compiler Vulnerabilities"** — Samuel Groß (saelo) et al., **NDSS 2023** [9][10].

- **The core idea — fuzz an IR, not source text.** Fuzzilli is "a (coverage-)guided fuzzer for dynamic language interpreters **based on a custom intermediate language ("FuzzIL") which can be mutated and translated to JavaScript**" [11]. A FuzzIL program is a list of typed-SSA-like instructions where every input is a variable and every output is a new variable — so **mutations stay structurally valid** and *always lift to runnable JS*. Mutators include `InputMutator` (rewire dataflow), `CodeGenMutator` (splice generated code), `CombineMutator` (splice corpus programs), `OperationMutator` (perturb op parameters) [11]. It is **coverage-guided** (greybox): instrument the engine, keep inputs that hit new edges.
- **Why semantics-awareness is the whole game.** Random JS text almost always throws a SyntaxError/TypeError and never reaches the JIT. FuzzIL guarantees programs that *run*, so they reach the optimizing compiler — the bug-rich, security-critical layer.
- **The oracle.** Primarily crashes/sanitizer trips (these are security vulnerabilities). The JIT line of work also uses a **differential oracle**: run the same code with and without JIT (or interpreter vs compiled) and flag divergence — a JIT that computes a different result than the interpreter is miscompiling. (Follow-on differential-oracle tools build directly on Fuzzilli, e.g. DUMPLING 2025 [10].)
- **Results.** Targets **V8, JavaScriptCore, SpiderMonkey** (plus Duktape, JerryScript, Hermes) [11]. A controlled **6-month campaign on ~500 CPU cores** against the three major engines found **17 previously unknown vulnerabilities** [9]. Earlier Fuzzilli work yielded named CVEs (e.g. CVE-2018-4299, CVE-2018-4359 in JSC; CVE-2018-12386 in SpiderMonkey), and the project's public bug showcase now totals **100+ CVEs/issues** across engines [11].

---

## 6. Fuzzing and testing **type checkers** and **type inference**

This is the thread closest to a type-reflection project, and the academic story is strong — *outside* TypeScript, where the most rigorous work lives.

### 6.1 The Hephaestus line — differential testing of JVM type systems (the centerpiece)

By Stefanos Chaliasos, Thodoris Sotiropoulos, Dimitris Mitropoulos, Diomidis Spinellis et al. (AUEB / Imperial). Three papers escalate from study → generator → API-driven synthesis:

- **"Well-Typed Programs Can Go Wrong: A Study of Typing-Related Bugs in JVM Compilers"**, **OOPSLA 2021** [14]. An empirical study that manually analyzed **320 typing-related bugs** across **javac, scalac/Dotty, kotlinc, groovyc** to characterize root causes and the program features that trigger them — the design input for the fuzzers that follow. (Note: four-figure numbers some sources cite are the *total bug populations sampled*, not bugs found by a tool.)
- **"Finding Typing Compiler Bugs"**, **PLDI 2022** — introduces the **Hephaestus** generator with two mutators: **type-erasure mutation** (drops inferable annotations → must still type-check; targets **inference** bugs) and **type-overwriting mutation** (replaces a type with an incompatible one → must be *rejected*; targets **soundness** bugs) [15][16]. **Oracle = differential across the three compilers + the mutation's built-in expectation.** **Result: 156 typing bugs (137 confirmed, 85 fixed)** in javac/kotlinc/groovyc in ~9 months; **PLDI 2022 Distinguished Paper + Best Artifact** [15][16][17].
- **"API-Driven Program Synthesis for Testing Static Typing Implementations"** (tool **Thalia**), **POPL 2024** [18]. Synthesizes type-intensive well-typed programs by composing library APIs (parametric polymorphism, overloading, higher-order functions). **Oracle = differential.** **Result: 84 typing bugs (77 confirmed, 22 fixed)** in Scala/Kotlin/Groovy. The cumulative project tracker reports **262 bugs** total across these compilers [17][18].

**Two mutation patterns to steal directly:** *erase what's inferable → still valid* and *overwrite with something incompatible → must be rejected*. A type-reflection project with a type generator can implement both natively.

### 6.2 TypeScript specifically

- **No published academic fuzzer drives tsc's checker via a soundness or differential oracle** that this research could verify. TypeScript's type system is **deliberately unsound** (documented "sources of unsoundness") [21], which removes the cleanest soundness oracle — but *not* the round-trip and differential oracles a value-generator project supplies.
- **TSTest — "Type Test Scripts for TypeScript Testing"**, Erik Krogh Kristensen & Anders Møller, **OOPSLA 2017** [19][20]. Doesn't fuzz the compiler; it fuzzes the **`.d.ts` declaration files** in DefinitelyTyped. **Oracle = round-trip / contract mismatch:** auto-generate a test script that exercises the real JS library and check observed runtime behavior against the *declared* types. **Result: type mismatches in 49 of 54 libraries; ~100 accepted PRs** fixing DefinitelyTyped. This is the closest published analogue to "runtime values vs static types" — and it found bugs in nearly every library it touched.
- Industry alternative type checkers (`stc`, `tsgo`, `tsz`) run TS's own conformance suite — that's conformance/regression testing, the seed of a differential oracle, not yet a fuzzer.

### 6.3 Other languages — well-typed program generation

- **"Testing an Optimising Compiler by Generating Random Lambda Terms"**, Michał Pałka, Koen Claessen, Alejandro Russo, John Hughes, **AST 2011 (ICSE workshop)** [22]. A type-judgment-driven generator emits **random well-typed lambda terms** (scope- and type-correct). **Oracle = differential:** compile with vs without GHC optimization; results must match. **Triggered a GHC optimizer bug after ~20,000 tests**, auto-shrunk to a tiny case. The original "generate well-typed terms to test a compiler" paper.
- **"Fuzzing the Rust Typechecker Using CLP"**, Dewey, Roesch, Hardekopf, **ASE 2015** [23]. Uses Constraint Logic Programming to generate **well-typed** Rust (bypassing the parser). **Oracle = soundness/consistency:** programs that *should* type-check but don't, and vice versa.
- **"Mutation-Based Fuzzing of the Swift Compiler with Incomplete Type Information"**, Hyatt & Dewey, **ICST 2025** [24]. First Swift compiler fuzzer; mutation that preserves well-typedness with only partial type knowledge. **~22k programs/sec; 13 bugs (7 fixed), 5 of them "well-typed program wrongly rejected"** — bugs only findable *because* the generator guarantees well-typedness.
- **"Type-Centric Kotlin Compiler Fuzzing"** (tool BBF), Stepanov, Akhin, Belyaev (JetBrains Research), **ICST 2021** [25]. Type-centric hole-filling + semantic-aware mutation. **Over ~1.5 years: thousands of bugs, >200 reported, >80 fixed** by JetBrains.
- **QuickChick** (Paraskevopoulou, Hriţcu et al.) — Coq-verified property-based testing where generators of well-typed terms can be *proved* correct. A cautionary tale to cite: a simply-typed-λ generator that never produced **shadowed variables** missed a variable-capture bug in substitution — i.e. **generator coverage is itself a correctness concern** [26].

### 6.4 Gradual typing — soundness vs performance (precise framing)

Distinct from bug-fuzzing: the Greenman/Takikawa line evaluates gradual type *systems*. **"Is Sound Gradual Typing Dead?"** (POPL 2016) and **"How to evaluate the performance of gradual type systems"** (JFP 2019) [27][28] **exhaustively enumerate the typing lattice** — all 2^N typed/untyped configurations of an N-module program — and measure overhead (mean >30×, worst >100× in Typed Racket). The "oracle" is a **performance threshold**; companion work checks **soundness via complete monitors / blame**. Relevant as *exhaustive* configuration testing of a type discipline, vs randomized fuzzing.

---

## 7. The thesis, made concrete: reflection + type-gen + value-gen ⇒ a fuzzing machine

A system that can (a) **reflect** the type system, (b) **generate arbitrary well-formed types** `T`, and (c) **generate values that inhabit `T`** has, for free, the two scarce resources:

**Input space.** (b) is a grammar-aware program/type generator (the Csmith / Hephaestus role). (c) is a value generator constrained to a type (the fast-check "arbitrary" role). Together they cover *both* the type-level and value-level input spaces that every tool above had to build by hand.

**Oracles — three derivable for free:**

| Oracle | How the recipe derives it |
|---|---|
| **Round-trip (type-level)** | Generate `T`; a value `v` produced by `generate(T)` **must** pass `validate(T)(v)`. If `generate` and `validate` are independent derivations of "inhabits T", any failure is a real bug in one of them. This is a *self-differential* oracle with no second implementation needed. |
| **Differential (runtime vs static)** | The runtime validator for `T` is a *reference implementation* of the static type `T`. Generate values that the static type accepts/rejects; the validator must agree. Divergence = unsoundness in the validator *or* a lossy reflection of the type (the TSTest pattern [19], generalized). |
| **Metamorphic (transform-preserving)** | Any meaning-preserving type/value transform — widen a union, reorder fields, encode→decode, erase-then-reinfer (Hephaestus [15]) — must preserve the validation verdict. Mutate and re-check (the EMI pattern [4]). |

**Why this is unusually strong.** Most fuzzing projects spend their effort *building a structure-aware generator* (Csmith's UB avoidance, FuzzIL, Hephaestus's well-typed synthesis) and *inventing an oracle*. A reflection+generator project **already has both as core features** — the generator is the product, and the oracle is just "two derivations of the same type must agree." It is, almost by construction, the well-positioned-for-fuzzing case the literature keeps rediscovering.

---

## 8. Extrapolation: where the same generative-reflection recipe applies

The recipe is **schema/spec → structured input generator → derivable oracle**. Anywhere a machine-readable description of "valid data/behavior" exists, you can generate inputs and derive an oracle. Domains and their oracles:

| Domain | Generator (input space) | Derivable oracle(s) | Concrete example |
|---|---|---|---|
| **Serializers / codecs** (JSON, protobuf, MessagePack, custom binary) | values inhabiting type `T` | **Round-trip**: `decode(encode(v)) == v`; **differential**: lib A vs lib B vs canonical encoder | fast-check encode/decode round-trip; Csmith-style for a wire format |
| **Schema validators** (Zod, Ajv/JSON-Schema, Yup, io-ts) | values from the schema (and *near-misses*) | **Differential**: validator vs the type it claims to enforce; **round-trip**: `schema.parse(generate(schema))` always succeeds; near-misses must *fail* | hypothesis-jsonschema [src], zod-fast-check [src] |
| **ORMs & migrations** | random model instances; random migration sequences | **Round-trip**: `read(write(x)) == x`; **metamorphic**: `migrate_up ∘ migrate_down == id`; **invariant**: schema constraints hold post-migration | model save/load round-trip |
| **API / contract testing** (OpenAPI, GraphQL) | requests conforming to the schema | **Differential** vs spec / two server versions; **invariant**: no 5xx, every response conforms to its declared schema | **Schemathesis** [src] (1.4×–4.5× more defects than competitors) |
| **Parsers ↔ pretty-printers** | random valid ASTs | **Round-trip**: `parse(print(ast)) == ast`; **idempotence**: `print(parse(s))` stable; **differential** vs reference parser | classic PBT round-trip; McKeeman tiered inputs |
| **Compilers / transpilers** | random well-typed programs | **Differential** across backends/opt-levels; **metamorphic** (EMI / equivalence-preserving rewrites) | Csmith [2], EMI [4], Hephaestus [15] |
| **State machines / protocols** | random command sequences (model-based) | **Model differential**: real system vs reference model after each command; **invariant**: protocol safety properties hold | fast-check stateful "commands" [src] |
| **Data-pipeline transforms** (ETL, stream ops) | random input records of the declared schema | **Metamorphic** (map/filter/reduce algebra: `filter(p) ∘ filter(q) == filter(q) ∘ filter(p)`); **invariant**: row-count/sum conservation | PBT on transform algebra |
| **Config loaders** | random configs from the config schema | **Round-trip**: `serialize(load(c)) == c`; **invariant**: defaults + constraints satisfied; **differential** vs a second loader/version | schema-driven config fuzzing |

**Pattern recognition for the talk:** every row reduces to one of four oracles — **round-trip** (an inverse exists), **differential** (a second implementation or version exists), **invariant** (a property must always hold), **metamorphic** (a transform with a known output relation exists). A reflection+type-gen+value-gen project can *mechanically* derive at least one of these for any of these domains, because it can generate the schema-conforming inputs *and* it owns a reference notion of "valid".

---

## 9. JS/TS-ecosystem tooling map (verified)

- **fast-check** — the de-facto PBT framework for JS/TS (Nicolas Dubien, `@dubzzz`). 80+ **arbitraries** (generators), integrated **shrinking**, and **model-based / stateful testing via *commands*** (define a model + commands; it generates and shrinks random command sequences against the real system) — directly the "model differential" oracle. Active, MIT, ~10M weekly downloads. [src: github.com/dubzzz/fast-check, fast-check.dev]
- **Schemathesis** — derives PBT/fuzzing from **OpenAPI/Swagger and GraphQL** schemas; built on Hypothesis; checks 5xx + schema conformance + stateful links. Peer-reviewed (*Deriving Semantics-Aware Fuzzers from Web API Schemas*, 2021) reporting **1.4×–4.5× more defects than competitors**. Python tool, tests any HTTP API. [src: github.com/schemathesis/schemathesis]
- **hypothesis-jsonschema** — `from_schema(schema)` returns a Hypothesis strategy generating JSON that satisfies a **JSON Schema** (drafts 04/06/07). The reference "schema → generator" building block. [src: github.com/python-jsonschema/hypothesis-jsonschema]
- **jsfuzz** — coverage-guided libFuzzer-style fuzzer for Node (Istanbul/nyc coverage). **Legacy/EOL**: original repo archived (2021); GitLab's coverage-guided fuzzing deprecated in 18.0. [src: github.com/fuzzitdev/jsfuzz (archived)]
- **jazzer.js** — coverage-guided, in-process Node fuzzer by Code Intelligence, **built on libFuzzer**; `FuzzedDataProvider` for typed inputs, Jest integration (`it.fuzz()`), built-in detectors for prototype pollution / command injection / path traversal. Active, Apache-2.0. [src: github.com/CodeIntelligenceTesting/jazzer.js]
- **zod-fast-check** — turns a **Zod schema** into a fast-check arbitrary (`inputOf`/`outputOf`/`override`); the canonical "type/schema → value generator" bridge in JS. **Lightly maintained** (last release 2023, Zod 3 only). [src: github.com/DavidTimms/zod-fast-check]
- **Hypothesis** (Python, David MacIver) — the PBT engine under Schemathesis and hypothesis-jsonschema; notable for *internal shrinking* (shrinks the choice sequence, re-runs the generator). [src: hypothesis.works]

---

## 10. Presentation-ready talking points

1. **The free oracle is the whole trick.** Compilers/type-tools beat the oracle problem with differential + metamorphic + round-trip oracles. A reflection+generator project gets all three by construction.
2. **Validity is the hard, valuable part.** Csmith's real contribution wasn't "generate C" — it was "generate C *that avoids undefined behavior so the oracle is meaningful*." Fuzzilli's was "mutate an IR that *always lifts to runnable JS*." If your generator guarantees the property your oracle needs, you win.
3. **The numbers land.** Csmith: 325+ bugs (79 GCC / 202 LLVM, 25 P1) [2][3]. EMI: 147 GCC+LLVM bugs [4]. Hephaestus: 156 typing bugs, Distinguished Paper [15]. Fuzzilli: 17 vulns in 6 months, 100+ CVEs lifetime [9][11]. These are *experts' own, heavily-tested* compilers.
4. **TypeScript is under-fuzzed by this exact recipe.** The strongest type-checker fuzzing is on the JVM (Hephaestus); the only published "runtime-vs-declared-types" oracle for TS is TSTest, which found mismatches in **49 of 54** libraries [19]. The gap is the opportunity.
5. **Steal two mutations from Hephaestus:** *erase-what's-inferable (must still pass)* and *overwrite-with-incompatible (must be rejected)* — both implementable directly with a type generator [15].

---

## Sources

[1] McKeeman, W. M. "Differential Testing for Software." *Digital Technical Journal* 10(1):100–107, 1998. dblp: https://dblp.org/rec/journals/dtj/McKeeman98.html — Semantic Scholar: https://www.semanticscholar.org/paper/Differential-Testing-for-Software-McKeeman/fc881e8d0432ea8e4dd5fda4979243cac5e4b9e3 — overview/def: https://en.wikipedia.org/wiki/Differential_testing
[2] Yang, Chen, Eide, Regehr. "Finding and Understanding Bugs in C Compilers." PLDI 2011. Flux Research Group: https://www.flux.utah.edu/paper/yang-pldi11 — preprint PDF: https://users.cs.utah.edu/~regehr/papers/pldi11-preprint.pdf
[3] ACM DL entry (numbers: 79 GCC / 202 LLVM / 25 P1 / 11 teams / ~2% of LLVM reports): https://dl.acm.org/doi/10.1145/1993316.1993532 — dblp: https://dblp.org/rec/conf/pldi/YangCER11.html
[4] Le, Afshari, Su. "Compiler Validation via Equivalence Modulo Inputs." PLDI 2014 (147 GCC+LLVM bugs in 11 months). Project: https://web.cs.ucdavis.edu/~su/emi-project/ — ACM: https://dl.acm.org/doi/10.1145/2666356.2594334 — PDF: https://www.vuminhle.com/pdf/pldi14-emi.pdf
[5] Csmith project README ("...using differential testing as the test oracle"): https://github.com/csmith-project/csmith — embed.cs.utah.edu/csmith
[6] CompCert motivations / Csmith resilience context: https://compcert.org/motivations.html
[7] (reserved)
[8] Survey of Modern Compiler Fuzzing (oracle taxonomy: differential / metamorphic / EMI; Csmith UB-avoidance): https://arxiv.org/abs/2306.06884
[9] Groß, S. et al. "FUZZILLI: Fuzzing for JavaScript JIT Compiler Vulnerabilities." NDSS 2023 (17 vulns, 6 months, ~500 cores, V8/JSC/SpiderMonkey). PDF: https://www.ndss-symposium.org/wp-content/uploads/2023-290-paper.pdf — Semantic Scholar: https://www.semanticscholar.org/paper/FUZZILLI:-Fuzzing-for-JavaScript-JIT-Compiler-Gro%C3%9F-Koch/089f134f93a436f981a531d063bd990f9f111e86
[10] DUMPLING: Fine-grained Differential JavaScript Engine Fuzzing (builds a differential oracle on Fuzzilli), NDSS 2025: https://www.ndss-symposium.org/wp-content/uploads/2025-1411-paper.pdf
[11] Fuzzilli repository (FuzzIL, mutators, targets, 100+ CVE bug showcase): https://github.com/googleprojectzero/fuzzilli — early CVEs / design talk: https://saelo.github.io/presentations/offensivecon_19_fuzzilli.pdf
[12] (reserved)
[13] EMI talk slides (metamorphic / dead-code mutation framing): https://people.inf.ethz.ch/suz/emi/index.html
[14] Chaliasos, Sotiropoulos, Drosos, Mitropoulos, Mitropoulos, Spinellis. "Well-Typed Programs Can Go Wrong: A Study of Typing-Related Bugs in JVM Compilers." OOPSLA 2021 (320 bugs studied). ACM: https://dl.acm.org/doi/10.1145/3485500 — artifact: https://github.com/hephaestus-compiler-project/types-bug-study-artifact
[15] Chaliasos, Sotiropoulos, Spinellis, Gervais, Livshits, Mitropoulos. "Finding Typing Compiler Bugs." PLDI 2022 (Hephaestus; 156 bugs, 137 confirmed, 85 fixed; erasure + overwriting mutations). PDF: https://theosotr.github.io/assets/pdf/pldi22.pdf — ACM: https://dl.acm.org/doi/10.1145/3519939.3523427
[16] PLDI 2022 program page: https://pldi22.sigplan.org/details/pldi-2022-pldi/2/Finding-Typing-Compiler-Bugs
[17] Hephaestus project site + cumulative bug tracker (262 bugs): https://hephaestus-compiler-project.github.io/ — org: https://github.com/hephaestus-compiler-project — award note: https://www.imperial.ac.uk/news/237593/doc-student-receives-distinguished-paper-award/
[18] Sotiropoulos, Chaliasos, Mitropoulos. "API-Driven Program Synthesis for Testing Static Typing Implementations." POPL 2024 (Thalia; 84 bugs, 77 confirmed). ACM: https://dl.acm.org/doi/10.1145/3632904 — extended arXiv: https://arxiv.org/abs/2311.04527 — tool: https://github.com/hephaestus-compiler-project/thalia
[19] Kristensen, Møller. "Type Test Scripts for TypeScript Testing." OOPSLA 2017 (round-trip oracle on .d.ts; mismatches in 49/54 libs; ~100 PRs). Paper PDF: https://cs.au.dk/~amoeller/papers/tstest/paper.pdf — project: https://cs.au.dk/~amoeller/papers/tstest/
[20] ACM DL (TSTest, OOPSLA 2017): https://dl.acm.org/doi/10.1145/3133914
[21] TypeScript deliberate unsoundness (effective-typescript "Seven Sources of Unsoundness"): https://effectivetypescript.com/2021/05/06/unsoundness/
[22] Pałka, Claessen, Russo, Hughes. "Testing an Optimising Compiler by Generating Random Lambda Terms." AST 2011 (random well-typed lambda terms; GHC bug after ~20k tests). ACM: https://dl.acm.org/doi/10.1145/1982595.1982615 — PDF: https://publications.lib.chalmers.se/records/fulltext/195847/local_195847.pdf
[23] Dewey, Roesch, Hardekopf. "Fuzzing the Rust Typechecker Using CLP." ASE 2015. ACM: https://dl.acm.org/doi/10.1109/ASE.2015.65 — IEEE: https://ieeexplore.ieee.org/document/7372036/
[24] Hyatt, Dewey. "Mutation-Based Fuzzing of the Swift Compiler with Incomplete Type Information." ICST 2025 (first Swift fuzzer; ~22k progs/sec; 13 bugs, 5 well-typed-rejection). PDF: https://kyledewey.github.io/icst25.pdf — IEEE: https://ieeexplore.ieee.org/document/10989032/
[25] Stepanov, Akhin, Belyaev. "Type-Centric Kotlin Compiler Fuzzing." ICST 2021 (tool BBF; >200 reported, >80 fixed). arXiv: https://arxiv.org/abs/2012.06382 — IEEE: https://ieeexplore.ieee.org/abstract/document/9438552
[26] Paraskevopoulou, Hriţcu et al. QuickChick / verified property-based testing (well-typed-term generators; shadowed-variable coverage lesson): https://catalin-hritcu.github.io/students/topics/2015/quick-chick.pdf
[27] Takikawa, Feltey, Greenman, New, Vitek, Felleisen. "Is Sound Gradual Typing Dead?" POPL 2016: https://www2.ccs.neu.edu/racket/pubs/popl16-tfgnvf.pdf
[28] Greenman, Takikawa, New, Feltey, Findler, Vitek, Felleisen. "How to evaluate the performance of gradual type systems." JFP 2019 (exhaustive 2^N config enumeration; >30× mean / >100× worst overhead): https://dblp.org/rec/journals/jfp/GreenmanTNFFVF19.html

### JS/TS tooling sources
[T1] fast-check — https://github.com/dubzzz/fast-check — https://fast-check.dev/
[T2] Schemathesis — https://github.com/schemathesis/schemathesis — https://schemathesis.io/
[T3] hypothesis-jsonschema — https://github.com/python-jsonschema/hypothesis-jsonschema
[T4] jsfuzz (archived/legacy) — https://github.com/fuzzitdev/jsfuzz — GitLab: https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/jsfuzz
[T5] jazzer.js — https://github.com/CodeIntelligenceTesting/jazzer.js — https://www.code-intelligence.com/blog/jazzer-js
[T6] zod-fast-check — https://github.com/DavidTimms/zod-fast-check — https://www.npmjs.com/package/zod-fast-check — fast-check ecosystem: https://fast-check.dev/docs/ecosystem/
[T7] Hypothesis (Python) — https://hypothesis.works/ — https://pypi.org/project/hypothesis/

---

### Verification notes & caveats
- **Csmith numbers** (325+ total; 79 GCC / 202 LLVM; 25 P1; 11 teams; ~2% of LLVM reports; CompCert verified-core resilience) are corroborated across the PLDI'11 paper record [2][3] and multiple secondary summaries; direct ACM/PDF fetches were intermittently 403-blocked this session, so figures rest on the paper's own abstract text as quoted by indexers plus corroborating sources.
- **Fuzzilli "17 vulnerabilities / 6 months / ~500 cores"** is the NDSS'23 paper's controlled-experiment figure [9]; the "100+ CVEs" is the cumulative public bug showcase in the repo [11] — different scopes, do not conflate.
- **PLDI'22 Hephaestus** count is consistently **156 bugs (137 confirmed, 85 fixed)**; some snippets round to "150." The **320** in [14] is bugs *studied*, not found; the four-figure JVM numbers occasionally seen are total bug *populations*, not tool results.
- **POPL 2024** (not OOPSLA) is the correct venue for Thalia [18] — a common mis-citation.
- TypeScript: no academic tsc soundness/differential fuzzer was verifiable; TSTest [19] is declaration-file round-trip testing, the closest published analogue.
