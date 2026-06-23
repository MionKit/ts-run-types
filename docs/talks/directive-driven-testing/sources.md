# Sources — load-bearing claims for the deck

> The numbers and quotes that appear on slides, each tied to a primary source.
> Full briefs with inline `[n]` citations are in [`research/`](research/).
>
> **Re-verify before presenting:** the research pass hit intermittent HTTP-403
> blocks on some arXiv/ACM/Wikipedia pages, so a few academic figures were
> corroborated via venue pages / READMEs / reputable press rather than a direct
> read. The widely-known canonical results below (Miller, QuickCheck, Csmith,
> EMI, OSS-Fuzz, AlphaEvolve, typia/PropEr/Schemathesis) are cross-checked across
> ≥2 sources. Spot-check anything you put on a slide verbatim.

---

## Hook / fuzzing fundamentals

- **Miller's `fuzz`, ~24–33% of UNIX utilities crashed/hung** — Miller,
  Fredriksen, So, *An Empirical Study of the Reliability of UNIX Utilities*, CACM
  33(12):32–44, 1990. https://dl.acm.org/doi/10.1145/96267.96279 ·
  https://www.paradyn.org/papers/fuzz-revisited.pdf
- **OSS-Fuzz: 50,000+ bugs / 13,000+ vulnerabilities / ~1,000 projects (May
  2025)** — https://github.com/google/oss-fuzz
- **Coverage-guided fuzzing (AFL, 2013), 64 KB edge bitmap** —
  https://lcamtuf.coredump.cx/afl/ ·
  https://github.com/google/AFL/blob/master/docs/technical_details.txt

## The oracle problem

- **"On Testing Non-testable Programs"** — Weyuker, *The Computer Journal*
  25(4):465–470, 1982. https://academic.oup.com/comjnl/article/25/4/465/366384
- **Oracle taxonomy (specified/derived/implicit/human)** — Barr, Harman, McMinn,
  Shahbaz, Yoo, *The Oracle Problem in Software Testing: A Survey*, IEEE TSE
  41(5), 2015. https://earlbarr.com/publications/testoracles.pdf

## PBT = fuzzing with an oracle

- **"Property-Based Testing Is Fuzzing"** — Nelson Elhage.
  https://blog.nelhage.com/post/property-testing-is-fuzzing/
- **Hypothesis engine = "an interactive fuzzer for lightly structured byte
  streams"** — David MacIver, *How Hypothesis Works*.
  https://hypothesis.works/articles/how-hypothesis-works/
- **QuickCheck (`reverse (reverse xs) == xs`)** — Claessen & Hughes, ICFP 2000.
  https://doi.org/10.1145/351240.351266 ·
  https://www.cse.chalmers.se/~rjmh/QuickCheck/
- **fast-check** (Nicolas Dubien) — https://github.com/dubzzz/fast-check ·
  https://fast-check.dev
- **"Choosing properties for property-based testing"** — Scott Wlaschin.
  https://fsharpforfunandprofit.com/posts/property-based-testing-2/

## The four oracles / compiler fuzzing

- **EMI — 147 confirmed GCC/LLVM bugs in 11 months (metamorphic)** — Le, Afshari,
  Su, *Compiler Validation via Equivalence Modulo Inputs*, PLDI 2014.
  https://web.cs.ucdavis.edu/~su/emi-project/
- **Csmith — 325+ bugs (79 GCC / 202 LLVM / 25 P1), differential oracle** — Yang,
  Chen, Eide, Regehr, PLDI 2011. https://www.flux.utah.edu/paper/yang-pldi11
- **Differential testing** — McKeeman, *Differential Testing for Software*,
  Digital Technical Journal 10(1), 1998.
- **Fuzzilli — 17 vulns in 6 months across V8/JSC/SpiderMonkey (IR that always
  lifts to runnable JS)** — Groß et al., NDSS 2023.
  https://www.ndss-symposium.org/wp-content/uploads/2023-290-paper.pdf
- **Metamorphic testing origin** — Chen, Cheung, Yiu, 1998 (arXiv:2002.12543).
  https://arxiv.org/abs/2002.12543

## TypeScript is under-fuzzed by this recipe

- **TSTest — runtime values vs declared `.d.ts`; mismatches in 49 of 54
  libraries** — Kristensen & Møller, *Type Test Scripts for TypeScript Testing*,
  OOPSLA 2017. https://cs.au.dk/~amoeller/papers/tstest/paper.pdf
- **Hephaestus — 156 typing bugs; erase-inferable / overwrite-incompatible
  mutations (Distinguished Paper)** — Chaliasos et al., PLDI 2022.
  https://theosotr.github.io/assets/pdf/pldi22.pdf

## Prior art that already has both halves

- **typia** (validate + random from one TS type) — https://github.com/samchon/typia ·
  https://typia.io/docs/random/
- **nestia** (closes the loop in production) — https://nestia.io/docs/sdk/e2e/
- **PropEr** (`-type` → generators, `-spec` → properties, Erlang 2011) —
  https://github.com/proper-testing/proper · http://proper.softlab.ntua.gr/Publications.html
- **Schemathesis** (OpenAPI → inputs + conformance oracle; 1.4×–4.5× more defects)
  — https://github.com/schemathesis/schemathesis · https://arxiv.org/pdf/2112.10328

## Self-improving software / LLM-in-the-loop

- **OSS-Fuzz-Gen — LLM writes the harness; +370k lines across 272 projects; 26
  vulns incl. CVE-2024-9143 (~20-yr-old OpenSSL, missed by hand-written
  harnesses)** — Google Security Blog, Nov 2024.
  https://security.googleblog.com/2024/11/leveling-up-fuzzing-finding-more.html ·
  https://github.com/google/oss-fuzz-gen · https://nvd.nist.gov/vuln/detail/CVE-2024-9143
- **AlphaEvolve — 48 vs Strassen's 49 multiplications (first improvement in 56
  years); ~0.7% Google fleet compute recovered; evaluator = oracle** — DeepMind,
  May 2025.
  https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/
- **Differential prompting — 28.8% → 75% by synthesizing a reference impl to
  disagree with** — Li et al., ASE 2023. https://arxiv.org/abs/2304.11686
- **Fuzz4All — universal LLM fuzzing, 98 bugs / 64 new across 6 languages** —
  ICSE 2024. https://arxiv.org/abs/2308.04748
- **SWE-agent+ "run your tests first" 15.9% → 18.5%; RLVR** —
  https://arxiv.org/pdf/2410.04485
- **Reward hacking / Goodhart** — https://lilianweng.github.io/posts/2024-11-28-reward-hacking/
- **LLM oracles encode actual vs intended behavior (the trust caveat)** —
  https://arxiv.org/html/2410.21136v1

## This repository's own fuzzing system

- **Design + oracle catalogue (O1–O7, TR1–TR4)** —
  [`../../FUZZING.md`](../../FUZZING.md)
- **The shipped finding (binary buffer overflow → Welford fix)** —
  [`../../done/binary-buffer-sizing.md`](../../done/binary-buffer-sizing.md)
- **Generators / harness** — `packages/ts-runtypes/test/fuzz/`
  (`typeGen.ts`, `shapeValue.ts`, `invalidValue.ts`, `fuzzOracle.ts`,
  `seededRng.ts`); value gen `packages/ts-runtypes/src/mocking/createMockType.ts`;
  reflection `packages/ts-runtypes/src/getRunType.ts`.
