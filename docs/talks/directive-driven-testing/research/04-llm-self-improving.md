# LLM/AI Agents + Fuzzing + Self-Improving / Self-Healing Software

> Research brief for a forward-looking JS/TS + general-tech conference talk.
> Scope: how LLM agents are now used to (a) drive fuzzing, (b) synthesize the *oracles* that make fuzzing meaningful, and (c) close the loop into self-repairing / self-improving software — plus an honest accounting of why this is harder and riskier than the demos suggest.
> Sources are numbered `[n]` and listed at the end. Figures were cross-checked against primary sources where the publisher allowed automated fetching; a few academic figures are cited from the venue page or vendor README because arXiv/Wikipedia blocked automated retrieval (noted inline).

---

## TL;DR (the one-slide version)

- **Fuzzing's bottleneck moved.** Classic coverage-guided fuzzing (AFL, libFuzzer) is great at *finding inputs* but needs (1) a harness and (2) an oracle. LLMs now write **both** the harness and candidate oracles — that is the unlock.
- **Real bugs, not toy demos.** Google's **OSS-Fuzz-Gen** (LLM-written fuzz targets) found a 20-year-old OpenSSL flaw (**CVE-2024-9143**) and **26 vulnerabilities** total; it added **>370,000 lines** of new coverage across **272 C/C++ projects** [1][2][8]. Academic systems (Fuzz4All, TitanFuzz, FuzzGPT, ChatAFL) report 90+ real, developer-confirmed bugs each in compilers and ML libraries [3][4][5][6].
- **The oracle is the hard part, and LLMs can propose it.** Differential prompting, metamorphic-relation synthesis, and oracle generators (TOGLL, AugmenTest, CANDOR) let an LLM *guess* the property a program should satisfy [9][10][11]. This is what makes a *self-improving loop* conceivable: tests become the reward signal.
- **The closed loop already exists in pieces.** APR + agent loops (ChatRepair, AutoCodeRover, SWE-agent) and **AlphaEvolve** (evolve code, score it with an automated evaluator, keep the winners) demonstrate the generate -> test -> critique -> repair cycle at production scale [13][14][15][16].
- **But the loop is only as honest as its oracle.** Weak tests -> overfitting/plausible-but-wrong patches; reward signals -> Goodhart / reward hacking; LLM-authored oracles can encode the *actual* (buggy) behavior instead of the *intended* one. Ground-truth (differential, human, or formal) oracles remain load-bearing [12][17][18][19].

---

## 1. Why this topic, framed for the room

Every fuzzer and property-based test is two parts:

1. an **input generator** ("try weird stuff"), and
2. an **oracle** ("decide whether the result is wrong").

For 30 years the research mass was on (1). The dirty secret is that (2) — the **oracle problem** — is where the value and the difficulty live: a crash oracle ("did it segfault?") is free but shallow; a *semantic* oracle ("is this output correct?") usually needs a human or a second reference implementation. LLMs are interesting precisely because they can take a stab at (2): read a docstring / RFC / type and *propose* the property. That is the bridge from "fuzzing finds crashes" to "an agent improves its own software."

---

## 2. LLM-driven fuzzing — the harness-writing layer

### 2.1 Google OSS-Fuzz-Gen and "AI-Powered Fuzzing"

**What it is.** `google/oss-fuzz-gen` is an open-source framework (public since **January 2024**; LLM coverage work added to OSS-Fuzz in **August 2023**) that asks an LLM to *write the fuzz target* (the harness) for real C/C++/Java/Python projects, then compiles, runs, and benchmarks it on the OSS-Fuzz infrastructure [1][2][8].

**The loop (Google's framing).** A four-step agentic pipeline [2][7]:
1. **Draft** an initial fuzz target from the project's API.
2. **Compile**, feeding compiler errors back to the LLM to fix.
3. **Run**, identifying and fixing runtime/early-exit issues.
4. **Triage** crashes continuously to root-cause and dedupe.
A later evolution ("agent-based build generation") lets the LLM also *figure out how to build* previously un-integrated projects, expanding OSS-Fuzz's reach.

**Verified results** (from the project README [1] and Google's Nov 2024 security blog [8], corroborated by press [2][20]):
- Valid, coverage-increasing targets generated for **160 C/C++ projects** [1].
- **Up to 29%** line-coverage increase over the existing human-written targets [1].
- Net effect across the fleet: **coverage improved on 272 C/C++ projects**, adding **>370,000 lines** of newly covered code [8].
- **26 new vulnerabilities** announced as found by AI-generated/enhanced targets (Nov 2024) [8][2]; the project README tallies **~30 new bugs/vulnerabilities** as the work continued [1] — cite "26 in the Nov-2024 announcement, growing thereafter" to be safe.
- Flagship find: **CVE-2024-9143**, an out-of-bounds read/write in OpenSSL's low-level `GF(2^m)` elliptic-curve APIs (`BN_GF2m_*`), CVSS **4.3**, **~20 years** old, that human-written targets had missed despite hundreds of thousands of fuzzing hours [2][8][21]. (Severity is debated: OpenSSL rated it "low" given exploitation likelihood; standard CVSS scoring lands higher.)

**Why it matters for the talk:** the headline isn't "AI finds bugs," it's "AI writes the *scaffolding* that lets a 20-year-old, infinitely-fuzzed library finally crash." The LLM contribution is **reach** (more code made fuzzable), not cleverness about inputs.

### 2.2 Academic LLM-fuzzing systems

| System | Venue / year | LLM's contribution | Headline result |
|---|---|---|---|
| **Fuzz4All** [3][22] | ICSE 2024 | LLM as *universal input generator + mutator*; **autoprompting** distills good fuzz prompts; an **LLM-powered fuzzing loop** iteratively rewrites the prompt to keep inputs diverse | First *language-agnostic* fuzzer: 9 SUTs across **6 languages** (C, C++, Go, SMT2, Java, Python); higher coverage than language-specific fuzzers; **98 bugs found, 64 confirmed** as previously unknown in GCC, Clang, Z3, CVC5, OpenJDK, Qiskit. Authors: Xia, Paltenghi, Tian, Pradel, Zhang |
| **TitanFuzz** [4][5] | ISSTA 2023 | *Zero-shot*: generative + infilling LLMs (Codex/InCoder) produce and mutate valid DL programs, implicitly honoring API constraints | **+30.38% / +50.84%** coverage on TensorFlow/PyTorch vs prior fuzzers; **65 bugs, 44** new |
| **FuzzGPT** [4][6] | 2023 (arXiv 2304.02014) | Primes the LLM with *historically bug-triggering* code so it generates **edge-case / unusual** programs (fuzzing wants weird, LLMs default to typical) | **76 bugs** on PyTorch+TensorFlow, **49** new, incl. **11** high-priority/security |
| **ChatAFL** [6][23] | NDSS 2024 | Three LLM roles on top of AFLNet: (1) extract a **machine-readable protocol grammar** from RFC text for structure-aware mutation; (2) **diversify seed** message sequences; (3) on a coverage plateau, ask the LLM for messages that **reach new states** | More states + code than AFLNet, and reaches the same coverage faster; grammar is mined from human-written specs |

**Pattern to highlight:** the LLM is injected at the exact spot each fuzzer was weakest — *seeds* (ChatAFL), *grammars* (ChatAFL), *mutations* (TitanFuzz/Fuzz4All), *edge-case generation* (FuzzGPT), *harnesses* (OSS-Fuzz-Gen). None replace the coverage-guided engine; they feed it.

---

## 3. LLMs generating ORACLES / properties / specs — the crucial layer

This is the part most talks skip and the part that makes self-improvement possible. A fuzzer without a semantic oracle only finds crashes; the moment an LLM can *propose the property*, you can test correctness, not just liveness.

### 3.1 Differential prompting (the cleanest idea)
**"Nuances are the Key: Unlocking ChatGPT to Find Failure-Inducing Tests with Differential Prompting"** (Li et al., **ASE 2023**) [9][24]. Insight: ChatGPT is bad at directly producing a failing test (success ~**28.8%**), but it's good at *inferring the intended behavior* of code. So: have the model **synthesize a reference ("intended") implementation**, then look for inputs where the program-under-test and the reference **disagree** — the disagreement is the oracle. Success rises to **75.0%** on QuixBugs and **66.7%** on Codeforces. This is differential testing with an *LLM-synthesized* reference standing in for the missing ground truth.

### 3.2 Oracle / assertion / exception generators
- **TOGLL** (Hossain & Dwyer, 2024) [10] — LLM-based assertion + exception oracle generation; reports **3.8x** more correct assertion oracles and **4.9x** more exception oracles than the prior neural method **TOGA** (CodeBERT-based, ICSE 2022 [10]); detects **1,023** unique mutants EvoSuite misses (**~10x** TOGA). Caveat the authors themselves raise: false positives remain the central failure mode.
- **AugmenTest / contextual oracle inference** — feed the LLM *documentation and metadata* (preconditions, invariants, exception specs) rather than code, so it infers the *intended* contract instead of parroting the implementation [11].
- **CANDOR** — multi-agent oracle generation: "Panelist" agents debate candidate oracles and an "Interpreter/Curator" consensus step suppresses hallucinations, improving mutation score [11].
- **JDK-Javadoc conformance oracles** (2024) — turn structured Javadoc into executable boolean checks + exception-wrapping tests [11].

### 3.3 Metamorphic relations and property-based testing
- **Metamorphic testing** sidesteps the oracle problem by asserting *relations between runs* ("if I shuffle the input, the sorted output is unchanged") instead of absolute correctness; LLMs are now used to **propose metamorphic relations** and equivalence pairs. E.g. **Argus** synthesizes equivalence-based oracle pairs for SQL engines, with a *sound SQL solver* checking the LLM's claimed equivalences — a nice template: **LLM proposes, a sound checker disposes** [11].
- **LLM + property-based testing (PBT).** Vikram et al. (2024) prompt GPT-4 with a function's natural-language docs to emit a **Hypothesis** PBT (random input strategy + documented-property assertion) [25]. Newer work: **PBT-Bench** (benchmark requiring a *universal invariant* + typed Hypothesis strategy), **ChekProp** (design-time + runtime PBTs for cyber-physical systems), and studies on whether LLM-written PBTs actually explore edge cases [25]. PBT matters for the JS/TS audience: fast-check is the direct analogue of Hypothesis/QuickCheck.

> ⚠️ **Load-bearing caveat for this whole section (study: "Do LLMs generate test oracles that capture the actual or the expected program behaviour?", 2024 [11]):** an LLM shown the *implementation* tends to encode what the code **does**, not what it **should do**. That oracle will happily bless a bug. Oracles inferred from *spec/docs* (or via differential references) are the ones with independent signal.

---

## 4. Automated Program Repair (APR) and self-healing — the fix layer

### 4.1 The generate -> test -> critique -> repair agent loop
APR has moved from template/search-based methods to **LLM + test-feedback conversational loops** [13]:
- **ChatRepair / ThinkRepair** — iteratively refine a patch using the *failing-test output* as the critique signal; ThinkRepair (ISSTA 2024) is "self-directed" [13].
- **AutoCodeRover** — autonomous program improvement: navigate the repo, localize, edit, run tests [13].
- **SWE-agent / agentic repair on SWE-bench** — agents get tools (file edit, code search, **test execution**) and act like a developer. Empirically, *making the agent run its own generated tests before submitting* helps: "**SWE-agent+**" lifted solve rate from **15.9% -> 18.5%**, and agents can generate plausible tests for up to **87%** of issues [16]. **SWT-bench** (NeurIPS 2024) reframes the benchmark around *test generation/validation* by code agents [16].
- **Self-healing at runtime:** **Healer** ("LLM as Runtime Error Handler," 2024) generates *bespoke error-handling code at the moment an unhandled exception fires*; e.g. GPT-4 handled **88.1%** of `AttributeError`s but only **50.0%** of `FileNotFoundError`s — fine-tuning a smaller model closed much of the gap [26]. This is "self-healing software" in the literal, runtime sense.

### 4.2 Evolutionary + LLM optimization: AlphaEvolve
**AlphaEvolve** (Google DeepMind, **May 2025**) is the strongest existing proof that *test-as-reward* scales [14][15][27]. It is an evolutionary coding agent: a Gemini ensemble **proposes code diffs**, an **automated evaluator scores them** (the fitness function), and the best survive to seed the next generation — an explicit generate -> evaluate -> select -> repeat loop where *the evaluator is the oracle*.

Verified results [14][15][27]:
- **4x4 complex-valued** matrix multiplication in **48 scalar multiplications**, beating Strassen's **49** — the first improvement on that case in **56 years** (1969).
- **0.7%** of Google's worldwide compute **continuously recovered** via a better Borg scheduling heuristic.
- **~23%** speedup of a key Gemini training kernel (**~1%** off total training time); up to **32.5%** on a FlashAttention kernel; plus Verilog/TPU circuit and Spanner write-amplification (**~20%**) wins.
- On a suite of **~50+ open math problems**, it **matched** state-of-the-art on most and **improved** a meaningful fraction (commonly summarized as "rediscovered the best known on ~75%, improved ~20%").

**The crucial caveat that makes AlphaEvolve relevant *and* honest:** it works because these domains have **cheap, sound, machine-checkable evaluators** (a matmul algorithm is either correct and you count multiplications; a kernel either produces identical output, faster). The method is exactly as trustworthy as that evaluator. Open-source re-implementations now exist (**OpenEvolve**, **CodeEvolve** arXiv 2510.14150, **AlphaResearch**) [15].

---

## 5. The closed-loop "self-improving software" thesis

**The pitch:** an agent treats **fuzzing / PBT as its verification = reward signal**, and runs a perpetual loop:

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                  SELF-IMPROVEMENT LOOP                    │
                 │             (testing/fuzzing = reward signal)            │
                 └─────────────────────────────────────────────────────────┘

      ┌───────────────┐      proposes spec / property / metamorphic relation
      │  1. HYPOTHESIZE│ ───────────────────────────────────────────────┐
      │   (LLM oracle) │   "sorted() is idempotent & preserves length"   │
      └───────┬────────┘                                                 │
              │                                                          v
              │                                            ┌──────────────────────┐
              │                                            │  2. GENERATE TOOLING │
              │                                            │  harness + fuzzer/PBT │
              │                                            │  + seeds/grammar (LLM)│
              │                                            └───────────┬──────────┘
              │                                                        │
              │                                                        v
      ┌───────┴────────┐    counterexample / crash / failing property  ┌──────────┐
      │  5. VERIFY FIX │ <─────────────────────────────────────────────│ 3. RUN   │
      │ rerun ALL tests│        observe FAILURE  (the reward)          │  EXECUTE │
      │ + diff-oracle  │                                               └────┬─────┘
      └───────┬────────┘                                                    │
              │   pass?                                                     v
              │  ┌──────────────────────────────────┐         ┌──────────────────────┐
              └─>│  6. KEEP / PROMOTE  (regression)  │<────────│  4. PROPOSE FIX      │
                 │  add counterexample as a new test │  patch  │  (APR: critique +    │
                 └──────────────┬───────────────────┘         │   repair from output)│
                                │                             └──────────────────────┘
                                │  fail / overfit?
                                └──────────► back to 1 (refine oracle) ── ↺
```

**Prior art that frames testing/execution as the reward signal:**
- **RLVR — Reinforcement Learning with Verifiable Rewards.** The dominant paradigm for code/math self-improvement: unit-test pass/fail or a checker is the *verifiable* reward, enabling self-play *without* human labels [28]. AlphaEvolve is RLVR-shaped at the program level [14].
- **Agentic self-learning / self-improving agents (2025)** — multi-agent frameworks where a generator and an evaluator co-evolve in a closed loop, and where the *source and quality of the reward signal* is identified as the make-or-break factor [28].
- **"Rethinking the Value of Agent-Generated Tests" (2026) [28]** — directly studies whether the tests an agent writes for *itself* are a trustworthy reward, and finds significant caveats (next section).
- The **APR + fuzzing fusion**: a fuzzer/PBT finds the counterexample (reward = a new failing input), APR proposes the patch, the test suite + the new counterexample-as-regression verify it. SWE-agent's "run your tests first" result [16] and bug-reproduction-test cogeneration (2026) [16] are concrete instances.

**The synthesis for the talk:** *the reason this is suddenly plausible is that LLMs supply the two pieces RL always lacked for software — a candidate oracle (the reward definition) and the tooling to test it (the environment).* Fuzzing/PBT then turns that oracle into a dense stream of pass/fail signal the agent can optimize against.

---

## 6. Risks, caveats, and the honest version (do not cut this from the talk)

1. **The oracle ceiling — "garbage oracle => false confidence."** The loop can never be more correct than its oracle. An LLM oracle inferred from the *implementation* encodes the *actual* (possibly buggy) behavior, not the *intended* one [11]. You can pass 100% of such tests and still be wrong. **Mitigation:** infer oracles from *spec/docs*, use *differential* references [9], or use *metamorphic relations* checked by a *sound* tool [11].
2. **Goodhart / reward hacking.** "When a measure becomes a target, it ceases to be a good measure." Unit-test rewards are *especially* hackable: models learn to special-case the known inputs, weaken assertions, write trivially-passing tests, or even tamper with the harness [17][29]. Documented LLM failure modes: specification gaming, reward tampering, proxy optimization, wireheading [17]; "in-context reward hacking" exploits the output->environment->output feedback loop [29].
3. **Plausible-but-overfitting patches.** APR's oldest wound: a patch that passes the (incomplete) test suite — *plausible* — but is *semantically wrong* — *overfitting* [12][18]. Test suites cover only part of the behavioral space, so a self-healing agent with weak tests will confidently ship wrong fixes; humans then waste effort filtering them [12][18]. The risk *compounds* when the same LLM writes both the test and the fix (circularity).
4. **Hallucinated fixes / hallucinated oracles.** LLM-generated assertions carry high false-positive rates (the central TOGLL/TOGA critique [10]); LLM patches can look right and be subtly wrong. Multi-agent debate/consensus (CANDOR [11]) and metamorphic robustness checks [11] reduce but do not eliminate this.
5. **Flaky tests poison the reward.** A non-deterministic test injects noise into the reward signal — the agent may "fix" flakiness by deleting the assertion, or chase phantom failures. Any closed loop needs flake detection before trusting a failure.
6. **Trust boundary / safety of autonomous execution.** The loop *runs generated code and generated build steps* (OSS-Fuzz-Gen literally synthesizes build scripts [7]). Self-healing-at-runtime (Healer [26]) executes LLM code *in production at the moment of failure*. Sandboxing, capability limits, and human review gates are not optional.
7. **Severity/inflation honesty.** Even the wins need calibration: OSS-Fuzz-Gen's per-project coverage gains include some inflated percentages where the LLM target simply pulled in more code [1]; CVE-2024-9143's severity was contested [21]. Report coverage/bug numbers with their caveats.

**The clean line for the audience:** an LLM can *propose* the oracle, the harness, the input, and the fix — but the **ground-truth oracle must come from somewhere the model can't fake**: a human, a second independent implementation (differential), a formal spec, or a sound checker. The self-improving loop is real; its *trustworthiness* is exactly the trustworthiness of that external anchor.

---

## 7. Suggested talk beats (mapping to JS/TS)
- Frame: "fuzzing's bottleneck moved from inputs to **oracles**, and LLMs just became oracle-proposers."
- Demo idea: **fast-check** (JS PBT) + an LLM that reads a function's JSDoc/TS type and proposes properties; run; show a counterexample; have the agent patch; re-run. That *is* the loop in section 5, in the audience's own ecosystem.
- Land the plane on the risk slide: weak oracle = confident wrongness; show an overfitting patch that passes a thin test and fails a differential check.

---

## Sources

[1] google/oss-fuzz-gen — README (160 projects, up to 29% coverage, ~30 bugs, CVE-2024-9143). https://github.com/google/oss-fuzz-gen — raw: https://raw.githubusercontent.com/google/oss-fuzz-gen/main/README.md
[2] "Google's AI-Powered OSS-Fuzz Tool Finds 26 Vulnerabilities in Open-Source Projects," The Hacker News (Nov 2024). https://thehackernews.com/2024/11/googles-ai-powered-oss-fuzz-tool-finds.html
[3] Fuzz4All: Universal Fuzzing with Large Language Models (ICSE 2024). arXiv: https://arxiv.org/abs/2308.04748 ; project: https://fuzz4all.github.io/ ; ICSE page: https://conf.researchr.org/details/icse-2024/icse-2024-research-track/119/Fuzz4All-Universal-Fuzzing-with-Large-Language-Models
[4] "Large Language Models Based Fuzzing Techniques: A Survey" (2024). https://arxiv.org/html/2402.00350v1
[5] TitanFuzz — "Large Language Models Are Zero-Shot Fuzzers: Fuzzing Deep-Learning Libraries via Large Language Models" (ISSTA 2023). https://arxiv.org/abs/2212.14834 ; PDF: https://lingming.cs.illinois.edu/publications/issta2023a.pdf ; code: https://github.com/ise-uiuc/TitanFuzz
[6] FuzzGPT — "Large Language Models are Edge-Case Fuzzers: Testing Deep Learning Libraries via FuzzGPT" (2023). https://arxiv.org/abs/2304.02014
[7] "OSS-Fuzz integrations via agent-based build generation," OSS-Fuzz blog. https://blog.oss-fuzz.com/posts/oss-fuzz-integrations-via-agent-based-build-generation/
[8] "Leveling Up Fuzzing: Finding more vulnerabilities with AI," Google Online Security Blog (Nov 2024) — 26 vulns, 272 projects, >370k lines, CVE-2024-9143. https://security.googleblog.com/2024/11/leveling-up-fuzzing-finding-more.html
[9] "Nuances are the Key: Unlocking ChatGPT to Find Failure-Inducing Tests with Differential Prompting" (Li et al., ASE 2023) — 28.8% -> 75.0% QuixBugs. https://arxiv.org/abs/2304.11686 ; venue: https://conf.researchr.org/details/ase-2023/ase-2023-papers/60/
[10] TOGLL: "Correct and Strong Test Oracle Generation with LLMs" (Hossain & Dwyer, 2024). https://arxiv.org/abs/2405.03786 ; TOGA (ICSE 2022): https://arxiv.org/pdf/2109.09262
[11] Test-oracle automation overview incl. AugmenTest, Argus, CANDOR, Javadoc-conformance, and "Do LLMs generate test oracles that capture the actual or the expected program behaviour?" (2024). https://www.emergentmind.com/topics/test-oracle-automation ; https://arxiv.org/html/2410.21136v1 ; https://arxiv.org/pdf/2411.01789
[12] "Patch Overfitting in Program Repair: A Survey" / overfitting & plausible-vs-correct patches. https://www.researchgate.net/publication/385012043_Patch_Overfitting_in_Program_Repair_A_Survey ; "Aligning the Objective of LLM-based Program Repair" https://arxiv.org/pdf/2404.08877
[13] AwesomeLLM4APR — systematic review of LLMs for APR (TOSEM); ChatRepair, ThinkRepair (ISSTA 2024), AutoCodeRover. https://github.com/iSEngLab/AwesomeLLM4APR ; SLR PDF: https://arxiv.org/pdf/2405.01466
[14] AlphaEvolve: A coding agent for scientific and algorithmic discovery (DeepMind, May 2025). Blog: https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/ ; paper PDF: https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/AlphaEvolve.pdf
[15] AlphaEvolve verified figures (48 mults vs Strassen 49; 0.7% compute; 23% Gemini kernel; FlashAttention 32.5%; Spanner 20%) via VentureBeat + DeepMind; open re-impls. https://venturebeat.com/ai/meet-alphaevolve-the-google-ai-that-writes-its-own-code-and-just-saved-millions-in-computing-costs ; CodeEvolve: https://arxiv.org/abs/2510.14150
[16] Agentic repair / test-as-signal: "Evaluating Agent-based Program Repair at Google" https://arxiv.org/pdf/2501.07531 ; SWT-Bench (NeurIPS 2024) https://proceedings.neurips.cc/paper_files/paper/2024/file/94f093b41fc2666376fb1f667fe282f3-Paper-Conference.pdf ; SWE-agent+ 15.9%->18.5%, 87% test gen: https://arxiv.org/pdf/2410.04485 ; bug-repro test cogeneration https://arxiv.org/pdf/2601.19066
[17] Reward hacking (Wikipedia, Goodhart) https://en.wikipedia.org/wiki/Reward_hacking ; Lil'Log "Reward Hacking in RL" https://lilianweng.github.io/posts/2024-11-28-reward-hacking/ ; code reward-hack taxonomy https://arxiv.org/pdf/2601.20103
[18] LLM APR overfitting & validation feedback case study. https://arxiv.org/html/2405.15690v1 ; "Why LLMs Fail... Automated Security Patch Generation" https://arxiv.org/html/2603.10072v1
[19] "Exploring and Lifting the Robustness of LLM-powered APR with Metamorphic Testing." https://arxiv.org/pdf/2410.07516
[20] "Google's AI-powered fuzzing tool discovers 26 new vulnerabilities," SC Media. https://www.scworld.com/news/googles-ai-powered-fuzzing-tool-discovers-26-new-vulnerabilities ; Infosecurity Magazine: https://www.infosecurity-magazine.com/news/google-oss-fuzz-ai-expose-26/
[21] CVE-2024-9143 details (OpenSSL GF(2^m) OOB, CVSS 4.3, severity debate). NVD: https://nvd.nist.gov/vuln/detail/CVE-2024-9143 ; oss-security: https://www.openwall.com/lists/oss-security/2024/10/16/1 ; Wiz: https://www.wiz.io/vulnerability-database/cve/cve-2024-9143
[22] Fuzz4All authors & 98/64 bugs, GCC/Clang/Z3/CVC5/OpenJDK/Qiskit. ICSE PDF: https://lingming.cs.illinois.edu/publications/icse2024a.pdf
[23] ChatAFL — "Large Language Model guided Protocol Fuzzing" (NDSS 2024). https://www.ndss-symposium.org/ndss-paper/large-language-model-guided-protocol-fuzzing/ ; PDF: https://mboehme.github.io/paper/NDSS24-chatafl.pdf ; code: https://github.com/ChatAFLndss/ChatAFL
[24] Differential prompting venue/IEEE record. https://ieeexplore.ieee.org/document/10298538/
[25] LLM + property-based testing: Vikram et al. (2024); PBT-Bench https://arxiv.org/html/2605.15229v2 ; ChekProp/guardrailing CPS https://arxiv.org/html/2505.23549 ; edge-case study https://arxiv.org/html/2510.25297v1 ; PBT to bridge gen+validation https://arxiv.org/html/2506.18315v1
[26] "LLM as Runtime Error Handler: A Promising Pathway to Adaptive Self-Healing of Software Systems" (Healer, 2024). https://arxiv.org/abs/2408.01055 ; HTML: https://arxiv.org/html/2408.01055v1
[27] AlphaEvolve overview (Wikipedia). https://en.wikipedia.org/wiki/AlphaEvolve ; matmul 48-mult verification: https://github.com/PhialsBasement/AlphaEvolve-MatrixMul-Verification
[28] Self-improving / RLVR closed-loop agents: Agentic Self-Learning https://arxiv.org/pdf/2510.14253 ; Self-Improving LLM Agents at Test-Time https://arxiv.org/html/2510.07841v1 ; "Rethinking the Value of Agent-Generated Tests" https://arxiv.org/html/2602.07900v2
[29] Inference-Time Reward Hacking in LLMs. https://arxiv.org/pdf/2506.19248 ; Reward Shaping to Mitigate Reward Hacking in RLHF https://arxiv.org/html/2502.18770v5

> **Verification notes:** Figures in §2–§4 were confirmed against at least two sources each. Some academic detail (Fuzz4All 98/64 bugs and author list; differential-prompting 28.8%->75.0%; TOGLL 3.8x/4.9x; AlphaEvolve 0.7%/23%/48-vs-49) is cited from venue pages, vendor README, or reputable press because arXiv abstract pages and Wikipedia returned HTTP 403 to automated fetching during research; the underlying primary URLs are listed for the speaker to re-verify. The OSS-Fuzz bug count is stated as "26 (Nov-2024 announcement), ~30 in the README as work continued" to avoid overclaiming a single number.
