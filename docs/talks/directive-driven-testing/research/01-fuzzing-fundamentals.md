# Fuzzing Fundamentals and the Landscape

> Research brief for a JS/TS + general-tech conference talk on fuzz testing.
> All claims are cited inline as `[n]` against the numbered **Sources** list at the end.
> Figures verified against multiple independent sources where possible (June 2026).

---

## 1. Definition and Origin

**Fuzzing (fuzz testing)** is an automated software-testing technique that feeds a program a large volume of invalid, unexpected, or random inputs and watches for anomalous behavior — crashes, hangs, failed assertions, memory-safety violations, or other oracle trips [9]. The core idea is brutally simple: generate inputs faster than a human ever could, run the target on each, and flag any input that makes the program misbehave.

### The Barton Miller origin (1988 / 1990)

The technique and the name both trace to **Barton P. Miller** at the University of Wisconsin–Madison. The seminal paper is:

> Barton P. Miller, Lars Fredriksen, Bryan So, **"An Empirical Study of the Reliability of UNIX Utilities,"** *Communications of the ACM*, **Vol. 33, Issue 12, pp. 32–44, December 1990**, DOI `10.1145/96267.96279` [3][8].

The work began as a **1988 graduate operating-systems class project** at UW–Madison and was published in 1990 [1][9]. The team built a tool, literally named **`fuzz`**, that generates a stream of random characters and pipes them into a target program [1].

**The "dark and stormy night" origin of the term.** The motivating anecdote: one author was logged into his workstation over a **dial-up line during a thunderstorm**; rain-induced line noise injected spurious random characters into his commands, and those garbage characters kept **crashing UNIX utilities**. He noticed the crashes were not random luck — programs genuinely could not handle malformed input — and set out to study it systematically [1]. That random "fuzzy" line noise gave the technique its name.

**The headline result.** The team tested roughly **88–90 standard UNIX utilities** (e.g. `vi`, `mail`, `cc`, `emacs`-style tools) across **seven versions of UNIX** by feeding them random input. They were able to **crash or hang 24–33%** of the utilities tested (commonly cited as "about a quarter to a third"; the original study reported roughly 25–33% across systems, with ~24% of the basic utilities failing) [1][2]. Causes included unchecked array bounds, bad pointer arithmetic, and naive use of routines like `gets()` [2].

Miller's group revisited the study repeatedly — **"Fuzz Revisited" (1995)** re-tested UNIX utilities and network services and found failure rates had *not* improved much, and later studies extended to Windows and macOS [2]. The lasting lesson: **a dumb random-input generator finds real bugs in mature, widely deployed software** — and it still does, 35+ years later.

---

## 2. Taxonomy of Fuzzers

Fuzzers are classified along several (orthogonal) axes. The canonical survey is Manes et al., *"The Art, Science, and Engineering of Fuzzing: A Survey"* (IEEE TSE, 2019) [4].

### 2.1 By visibility into the target (black / grey / white box)

- **Black-box fuzzing** — no knowledge of the target's internals. The fuzzer only sees inputs in and outputs/crashes out. Uses predefined mutation rules; cheap to set up, but blind, so it tends to stay shallow [10][9]. (Miller's original `fuzz` was black-box.)
- **White-box fuzzing** — uses full program analysis (symbolic/concolic execution, constraint solving) to *derive* inputs that drive execution down specific paths. Microsoft's **SAGE** (using the SMT solver Z3) is the archetype. Powerful at penetrating narrow input checks, but expensive and hard to scale [10][9].
- **Grey-box fuzzing** — the modern sweet spot: *partial* knowledge, almost always **code-coverage feedback** gathered via lightweight instrumentation. The fuzzer learns which inputs reach new code and steers toward them, without full program analysis [10][9]. AFL, libFuzzer, honggfuzz, and AFL++ are all grey-box.

### 2.2 By how inputs are produced (mutation vs generation)

- **Mutation-based** — start from a **seed corpus** of valid sample inputs and mutate them (bit flips, byte swaps, splices, arithmetic, dictionary insertions). Easy to bootstrap; no spec needed. But "any traditional mutation (e.g. bit flipping) leads to an invalid input rejected by the target in the early stage of parsing" for complex formats [6][7].
- **Generation-based** — synthesize inputs **from scratch** from a model of the input format: a **grammar**, schema, or protocol definition. More work to build the model, but inputs are valid by construction and reach deep logic. Examples: Csmith for C programs [13], grammar fuzzers, Peach/boofuzz for protocols [4].

### 2.3 Dumb vs smart

- **Dumb fuzzing** — format-unaware; treats input as an opaque byte blob. Fast and trivial, but stalls on structured inputs that enforce checksums, lengths, or magic bytes [6].
- **Smart (structure-aware) fuzzing** — input-format-aware, so mutations respect the grammar (see §6). Smart ≈ structure-aware; it can be layered on either mutation or generation strategies [6][7].

### 2.4 Coverage-guided fuzzing (the defining modern idea)

A coverage-guided grey-box fuzzer instruments the target to record **edge/branch coverage** per run; an input is **promoted into the corpus only if it exercises new coverage** [4][11]. Over time the corpus evolves into a population of inputs that collectively cover the program — an evolutionary/genetic search where coverage is the fitness function. This single idea (AFL, 2013) is what turned fuzzing from a curiosity into an industrial bug-finding machine [5][12].

> **Mental model for the talk:** *mutation vs generation* = "where do inputs come from?"; *black/grey/white* = "how much do I see inside?"; *coverage-guided* = "the feedback signal that makes grey-box smart." These compose: AFL is mutation-based, grey-box, coverage-guided.

---

## 3. Key Tools and Their Lineage

### AFL → AFL++ (the coverage-guided revolution)

- **AFL (American Fuzzy Lop)** — created by **Michał ("lcamtuf") Zalewski in 2013** [5][12]. It popularized practical coverage-guided grey-box fuzzing and is credited with finding "countless" vulnerabilities in open-source code [5].
  - **Edge instrumentation:** at each branch it runs `shared_mem[cur_location ^ prev_location]++; prev_location = cur_location >> 1;`, recording edge transitions into a **64 KB shared-memory bitmap**. The XOR captures *which edge*; the right-shift keeps A→B distinct from B→A [12].
  - **Hit-count bucketing:** raw counters are coarsened into 8 buckets (1, 2, 3, 4–7, 8–15, 16–31, 32–127, 128+); only **bucket transitions** count as "new," which suppresses loop noise [12].
  - **Evolutionary queue:** an input is kept only if it produces a **new tuple or a new hit-count bucket** [12].
  - **Corpus culling ("favored" entries):** periodically distills a **5–10× smaller** subset that still covers every tuple, scored by speed × size [12].
  - **Mutation stages:** *deterministic* (sequential bit flips, arithmetic, magic values like 0/1/INT_MAX) → *havoc* (random stacked mutations) → *splicing* (recombine two queue entries) [12].
  - **Fork server:** initialize the target once, then `fork()` clones from a stopped, copy-on-write state — typically **1.5–2× faster**; *persistent mode* (one process, many inputs) reaches **5–10×** [12].
- **AFL++ (AFLplusplus)** — the **community-maintained successor fork** since AFL went unmaintained. Paper: Fioraldi, Maier, Eißfeldt, Heuse, **"AFL++: Combining Incremental Steps of Fuzzing Research,"** USENIX WOOT '20 (Aug 2020) [14]. Adds collision-free coverage, a **Custom Mutator API**, RedQueen (input-to-state / comparison "magic byte" solving), laf-intel, AFLfast++ power schedules, MOpt mutators, QEMU/Unicorn modes for binary-only targets [14]. It is the de-facto modern AFL.

### libFuzzer (in-process, library-level)

- **Developed by Google (LLVM project), released ~2015.** An **in-process, coverage-guided** engine: instead of spawning a process per input, it repeatedly calls a function `LLVMFuzzerTestOneInput(data, size)` in the same process, driven by Clang's SanitizerCoverage instrumentation [15][9]. Extremely fast for libraries/APIs; tightly integrated with the sanitizers (§4). Supports custom mutators via `LLVMFuzzerCustomMutator` [6].

### honggfuzz (hardware-assisted feedback)

- Security-oriented, **feedback-driven evolutionary** fuzzer by Google engineer **Robert Świecki** [16]. Multi-process/multi-threaded; supports both **software** coverage and **hardware** feedback — CPU branch/instruction counters, **Intel BTS** and **Intel PT** — and a **persistent in-process mode** reaching iteration speeds up to **~1M execs/sec** [16]. One of the three engines OSS-Fuzz runs.

### OSS-Fuzz (continuous fuzzing at Google scale)

- **Announced December 1, 2016**, partly in response to **Heartbleed** — a "relatively simple memory buffer-overflow bug that could have been detected by fuzzing" [15][20]. Runs continuous fuzzing for critical open-source projects; each distinct bug is filed automatically to the project's tracker.
- **Engines:** libFuzzer, **AFL++**, and honggfuzz. **Languages:** C/C++, Rust, Go, Python, Java/JVM, JavaScript, and Lua [15].
- **Scale (verified figures):**
  - **As of Aug 2023:** 10,000+ vulnerabilities and 36,000+ bugs across ~1,000 projects [17].
  - **As of Sept 2024:** 12,000+ bugs across all projects (cumulative ClusterFuzz) [17].
  - **As of May 2025:** **13,000+ vulnerabilities and 50,000+ bugs across 1,000 projects** [15][17].
- **Infrastructure:** built on **ClusterFuzz** (the distributed execution + crash dedup/triage backend); closed-source projects can self-host via **ClusterFuzzLite** [17].
- **AI direction:** since Aug 2023, OSS-Fuzz uses **LLMs to auto-generate fuzz targets**, improving coverage across 272 C/C++ projects by **370,000+ lines**; in Nov 2024 Google reported AI-generated harnesses finding **26 new vulnerabilities**, including a long-latent bug in OpenSSL (CVE-2024-9143) [18][21].

### syzkaller / syzbot (kernel fuzzing)

- **syzkaller** — coverage-guided **Linux kernel system-call fuzzer** by **Dmitry Vyukov (Google)** [19]. It is *generation + coverage* hybrid: templates describe each syscall's argument domains (so it emits *valid-ish* syscall sequences), and KCOV coverage feedback steers exploration [19].
- **Impact:** found **150+ mainline kernel bugs in its first few months** (2016) [19]; the automated **syzbot** CI runs it continuously and has reported **thousands** of kernel bugs, with a per-month discovery rate that *has not declined over 7+ years* [19]. It also fuzzes other kernels (BSDs, etc.) and supports remote/USB/network attack surfaces [19].

---

## 4. Sanitizers — the Bug-Detection Oracle

Coverage tells the fuzzer *where it is*; **sanitizers tell it when something went wrong.** They are compiler-inserted dynamic checks plus a runtime library that turns otherwise-silent undefined behavior into a **loud, immediate, deterministic crash with a stack trace** — exactly the signal a fuzzer needs [22][24]. Google authored the main four (the "Sanitizers" project) [22]:

| Sanitizer | Catches | Notes |
|---|---|---|
| **ASan** (AddressSanitizer) | Heap/stack/global **out-of-bounds**, **use-after-free**, use-after-return, double-free | ~2× slowdown via shadow memory + red zones; the workhorse of memory fuzzing [22][24] |
| **UBSan** (UndefinedBehaviorSanitizer) | Signed-integer overflow, null deref, misaligned/oversized shifts, bad casts, alignment | Cheap; catches C/C++ undefined behavior that may otherwise be silently miscompiled [22][24] |
| **MSan** (MemorySanitizer) | **Use of uninitialized memory** (poison propagation into branches, derefs, syscalls) | Requires the whole dependency stack to be instrumented [22][24] |
| **TSan** (ThreadSanitizer) | **Data races** and some deadlocks in multithreaded code | Needs concurrency in the harness to be exercised [22][24] |

Related: **LSan** (LeakSanitizer, memory leaks) and **LibFuzzer's** built-in OOM/timeout detection [22].

**Why this matters for fuzzing:** a memory bug like a 1-byte heap overflow often does **not** crash on its own — the program limps on with corrupted state. ASan makes it crash *at the moment of the bad access*, so the fuzzer (a) registers a finding and (b) keeps a tiny reproducer. "Combining a sanitizer with fuzzing turns latent memory issues into immediate, actionable crashes." [24][26]. Sanitizers therefore **are part of the oracle** (see §5). Their limit: they only observe **executed** paths and add runtime cost, so they trade speed for sensitivity [24].

---

## 5. The Oracle Problem — "What Counts as a Bug?"

A fuzzer can generate billions of inputs, but it is useless without a **test oracle**: a decision procedure that says *"this run was wrong."* For arbitrary code, deciding correctness is undecidable in general — this is the **oracle problem**, and it is the single biggest limiter on what fuzzing can find [23][25]. The art is choosing oracles that are **cheap, automatic, and sound enough.**

Practical oracles, roughly from easiest to hardest:

1. **Crash / signal** — SIGSEGV, SIGABRT, illegal instruction. Free and unambiguous, but absence of a crash ≠ absence of a bug [23].
2. **Sanitizer trip** (§4) — ASan/UBSan/MSan/TSan converting silent UB into a crash. This vastly *widens* the oracle beyond "did it segfault?" [24][26].
3. **Assertion / invariant violation** — `assert()`s and runtime checks encoding pre-conditions, post-conditions, and invariants. With assertions in place, fuzzers "catch not just unhandled exceptions, but also broken business logic." [23]. This is how you find *logic* bugs, not just memory bugs.
4. **Differential testing** — run **two or more implementations** (or two versions, or two configs) on the same input and flag **disagreement**. The oracle is "they should agree." Csmith fuzzed C programs and used differential testing across GCC/LLVM as its oracle, reporting **325+ previously unknown compiler bugs** over three years [13][25]. The hard part: deciding whether a difference is a real bug, undefined behavior, or a benign spec gap [25].
5. **Timeout / hang** — a watchdog flags runs exceeding a budget, catching infinite loops, deadlocks, and algorithmic-complexity (ReDoS-style) blowups [16][23].
6. **Round-trip / metamorphic invariants** — e.g. `decode(encode(x)) == x`, `parse(serialize(x)) == x`, "optimized and unoptimized output must match." No reference implementation needed; you assert a property of *one* program. Highly relevant to JS/TS (parsers, serializers, codecs).

> **Talk takeaway:** *Coverage is the steering wheel; the oracle is the destination.* A fuzzer with weak oracles will happily explore millions of paths and report nothing. The deepest value usually comes from **richer oracles** (sanitizers + assertions + differential/metamorphic checks), not from a cleverer mutator.

---

## 6. Structure-Aware / Grammar-Based Fuzzing

**Why naive byte mutation fails on structured inputs.** A dumb mutation-based fuzzer treats input as raw bytes, so for any format with internal constraints — checksums, length prefixes, magic bytes, nested grammars, compression — random bit-flips produce inputs that are **rejected in the earliest parsing stage** and never reach the interesting logic [6][7]. The Google fuzzing guide is blunt: "the lack of an input grammar can result in inefficient fuzzing for complicated input types, where any traditional mutation (e.g. bit flipping) leads to an invalid input rejected by the target in the early stage of parsing." [6]

Concrete failure cases [6]:
- **PNG** — has CRC checksums and length fields that must stay in sync with the data, plus embedded zlib streams. Flip one byte and the CRC fails; the image is discarded before any decode logic runs.
- **Compressed data (gzip/zlib)** — random byte edits corrupt the stream so it won't even decompress; the fuzzer cannot reach the consumer of the decompressed bytes.
- **Protocol Buffers** — a tightly encoded tag/field structure; raw mutation almost never yields a valid message.
- **Source code / SQL** — must satisfy a grammar (and often semantic constraints) before the compiler/optimizer logic is reachable.

**The fix: mutate the *structure*, not the bytes.** Structure-aware fuzzers parse → mutate the parsed representation → re-serialize (re-computing checksums/lengths), so every produced input is grammatically valid [6]:

- **libFuzzer custom mutators** — implement `LLVMFuzzerCustomMutator`, which (1) **parses** the bytes into a typed object, (2) **mutates** the object (optionally recursing into `LLVMFuzzerMutate` for leaf fields), (3) **serializes** back to bytes [6].
- **libprotobuf-mutator (LPM)** — Google's reusable bridge: define your input format as a **`.proto` message**, and LPM mutates *parsed protobufs* (field-aware) and hands valid bytes to libFuzzer [6]. A common trick is to use protobuf as an **intermediate grammar** — describe SQL, a network packet, or even C/LLVM IR as a proto, mutate the proto, then render it to the real target format [6]. Kostya Serebryany's LLVM-dev talk applied exactly this to fuzz Clang/LLVM [6].
- **Grammar generators** — tools like **Grammarinator** turn an **ANTLR** grammar into a generator and pair it with an in-process fuzzer; classic generation-based fuzzers (Csmith [13], Peach, boofuzz) build inputs from a format/protocol spec [4][6].

> **JS/TS relevance:** this is *the* connection to **property-based testing**. PBT generators ("arbitraries") are structure-aware input *generators*; combining them with coverage feedback is essentially structure-aware grey-box fuzzing (see §9).

---

## 7. The Fuzzing Loop — Corpus, Seeds, Coverage, Minimization

The coverage-guided loop, drawn for the slide:

```
            ┌─────────────────────────────────────────────┐
            │                                             │
            ▼                                             │
   [ Seed corpus ] --select--> [ Mutate / generate ]      │
        ▲                              │                  │
        │                              ▼                  │
        │                     [ Run target on input ]     │
        │                              │                  │
        │                              ▼                  │
        │        ┌──────── [ Observe: coverage + oracle ] │
        │        │                     │                  │
        │   new coverage?         crash/sanitizer/        │
        │        │ yes             assert/diff/hang?      │
        │        ▼                     │ yes              │
        └─ add to corpus               ▼                  │
                                 [ Save crashing input ] ─┘
                                        │
                                        ▼
                              [ Minimize / shrink reproducer ]
```

Key pieces [4][11][12]:

- **Seeds & corpus.** Mutation fuzzers start from a **seed corpus** of valid sample inputs (e.g. real PNGs to fuzz a PNG decoder). Seed quality strongly affects results; both AFL and AFL++ do better when bootstrapped with a **minimized** corpus [11].
- **Corpus distillation / set-cover minimization.** Build "the smallest set of files that covers the largest branch coverage" (a.k.a. *corpus minimization* / *cmin*). This shrinks the input set the fuzzer cycles through, speeding everything up [11][12]. AFL's "favored entries" culling (§3) is the online version.
- **Coverage feedback.** Instrumentation records edges per run; **only inputs that add coverage are promoted** into the corpus [4][12]. This is the evolutionary fitness signal.
- **Test-case minimization / shrinking.** Once a crash is found, the raw reproducer is often huge. A minimizer (AFL's *tmin*, libFuzzer's `-minimize_crash`, C-Reduce for programs, PBT *shrinking*) iteratively removes/simplifies bytes while preserving the failure, yielding a tiny, human-readable counterexample [11][12]. In property-based testing this is the headline feature — "the process of going from a failure to the smallest counterexample" — and fast-check ships **integrated shrinking** to the minimal failing input [27][28].

---

## 8. Real-World Impact — Bugs and CVEs

Fuzzing is not academic; it finds the bugs that make the news.

- **Heartbleed (CVE-2014-0160, OpenSSL, April 2014)** — a buffer over-read leaking private memory (keys, session data) from the majority of TLS servers on the internet. It was a "relatively simple memory buffer-overflow bug that **could have been detected by fuzzing**," and was a direct motivation for launching **OSS-Fuzz** in 2016 [9][20]. (OSS-Fuzz later regression-tests OpenSSL continuously.)
- **Shellshock (CVE-2014-6271 et al., GNU Bash, Sept 2014)** — a family of remote-code-execution bugs in Bash; **most of the variants were found with the fuzzer AFL** [9][20]. Attackers weaponized it within hours; severity was compared to Heartbleed [20].
- **Stagefright (Android, 2015)** — seven vulnerabilities in Android's media-playback library, exploitable via a single MMS; surfaced through fuzzing of the media stack [9].
- **OSS-Fuzz aggregate** — **50,000+ bugs and 13,000+ vulnerabilities across 1,000 projects** as of May 2025 [15]; an empirical study of OSS-Fuzz noted **20,000+ bugs found with ~98 receiving CVE IDs** at an earlier snapshot [9][17]. Targets include OpenSSL, FFmpeg, SQLite, libpng, curl, the kernels, browsers' codecs, etc.
- **Compilers** — Csmith's differential fuzzing reported **325+ unknown bugs** in GCC/LLVM; "every compiler tested was found to crash and also to silently generate wrong code." [13]
- **Kernels** — syzkaller/syzbot: **thousands** of Linux kernel bugs, many security-relevant, on an ongoing basis [19].

> **One-liner for the talk:** "If your code parses untrusted input and has never been fuzzed, fuzzing it for an afternoon will almost certainly find something."

---

## 9. JS/TS Angle — Fuzzing in the JavaScript Ecosystem

(Tailored for the conference audience.)

- **Memory-safety bugs are off the table** in pure JS — there's no UAF/OOB. So JS fuzzing oracles shift to: **unhandled exceptions**, **logic/assertion failures**, **hangs / event-loop starvation / OOM (DoS)**, and **differential/round-trip invariants** [29][30].
- **jsfuzz** — coverage-guided fuzzer for Node packages; uses **Istanbul (istanbuljs)** instrumentation for coverage; targets unhandled exceptions, logic bugs, and DoS-via-hang [30].
- **Jazzer.js** (Code Intelligence) — **coverage-guided, in-process** fuzzer for Node.js, **built on libFuzzer**; it instruments loaded JS to add coverage feedback *and* value-profile feedback (e.g. comparisons in `if`-statements) to solve magic values, and integrates with Jest via `it.fuzz()` / `test.fuzz()` (TypeScript-friendly) [29]. The closest thing to "AFL for Node."
- **fast-check** — the mainstream **property-based testing** framework for JS/TS, by **Nicolas Dubien (2017)** [27][28]. Provides 80+ composable **arbitraries** (generators) and **integrated shrinking** to a minimal counterexample; **10M+ weekly npm downloads**; used by Jest, fp-ts, io-ts, Ramda, js-yaml [28]. PBT is *generation-based, structure-aware, property-oracle* fuzzing in spirit — the bridge between "fuzzing" and "testing" for this audience.
- **Engine fuzzing** — V8/JavaScriptCore/SpiderMonkey are fuzzed heavily (e.g. **Fuzzilli**, coverage-guided JS-engine fuzzing) and are a steady source of high-severity browser RCEs; differential testing across engines is a common oracle [25].

> **Bridge to make on stage:** *property-based testing and coverage-guided fuzzing are the same idea from two communities.* PBT brings structured generators + shrinking; fuzzing brings coverage feedback + sanitizer-style oracles. Combine them and you get the best of both — which is exactly where tools like Jazzer.js and fast-check are converging.

---

## 10. State of the Art (~2023–2026) and Limitations

**Where the field is now:**
- **Continuous fuzzing as infrastructure.** OSS-Fuzz / ClusterFuzz(Lite) made fuzzing a *CI primitive*, not a one-off audit; the bug-discovery rate is sustained, not exhausted [15][17][19].
- **AFL++ as the research substrate.** AFL++'s pluggable architecture (custom mutators, RedQueen input-to-state, power schedules) consolidated a decade of research into one combinable tool [14].
- **LLM-assisted fuzzing (the 2023→2026 wave).** LLMs are now used to (a) **auto-generate fuzz harnesses/targets**, (b) **synthesize seed corpora**, and (c) act as **differential/spec oracles**. OSS-Fuzz's LLM target-generation added **370k+ lines of covered code** across 272 projects and found **26 new vulns** (incl. OpenSSL CVE-2024-9143) [18][21]. Research systems (OSS-Fuzz-Gen, PromeFuzz, HarnessAgent, etc.) push automated harness construction [33].

**Limitations to be honest about on stage:**
1. **Oracle scarcity** — the #1 limiter. Fuzzers excel at finding *crashes*; they are weak at *"wrong-but-doesn't-crash."* Without sanitizers, assertions, or differential checks, deep logic bugs are invisible [23][25].
2. **Shallow vs deep bugs** — coverage-guided fuzzing finds shallow bugs fast, then plateaus. Deep bugs behind tight checks (magic constants, checksums, multi-stage state machines) remain hard; this is why RedQueen, concolic hybrids, and structure-aware grammars exist [6][14].
3. **Harness-writing cost** — writing a good `LLVMFuzzerTestOneInput` / Jazzer target (correct API setup, valid input decoding, meaningful oracle) is skilled manual work and the main human bottleneck. LLM auto-harnessing helps but **"the generated harnesses are generic and often produce false-positive crashes due to incorrect input constraints,"** and LLMs can **exploit validation metrics, producing plausible but useless code** [33].
4. **Cost & flakiness of LLM-in-the-loop** — per-bug LLM costs are small but nonzero (papers report ~$0.15–$0.40 per project/bug; feedback analysis is token-heavy), and LLM-driven differential oracles introduce *noise* that needs filtering [33][32].
5. **Structured / non-textual inputs** — LLMs are poor at emitting binary formats (images, video, PDF), limiting LLM-driven grammar fuzzing where structure-aware mutators still win [6][33].
6. **Evaluation rigor** — benchmarking remains contentious; **FuzzBench** (Google) standardized comparisons, but fair, reproducible fuzzer evaluation is an open problem the community keeps re-litigating [4].

> **Closing thesis for the talk:** Fuzzing's frontier has moved from *"how do I mutate inputs?"* (largely solved by coverage feedback) to *"how do I (a) write the harness and (b) decide what's a bug?"* — i.e. **harness generation and the oracle problem.** LLMs are the current bet on the first; richer oracles (sanitizers, differential/metamorphic invariants, property-based assertions) are the durable answer to the second. For JS/TS specifically, that means property-based testing + coverage feedback is the practical, here-today form of fuzzing.

---

## Sources

[1] Wikipedia — *Fuzzing* (origin, Miller 1988/1990, line-noise anecdote, taxonomy, notable bugs). https://en.wikipedia.org/wiki/Fuzzing
[2] Miller, Cooksey, Moore et al. — *Fuzz Revisited / "An Empirical Study of the Reliability of UNIX Utilities"* (PDF; crash rates, OSes, history). https://www.paradyn.org/papers/fuzz-revisited.pdf
[3] ACM Digital Library — Miller, Fredriksen, So, *An Empirical Study of the Reliability of UNIX Utilities*, CACM 33(12):32–44, Dec 1990, DOI 10.1145/96267.96279. https://dl.acm.org/doi/10.1145/96267.96279
[4] Manes et al. — *The Art, Science, and Engineering of Fuzzing: A Survey* (IEEE TSE 2019). https://alastairreid.github.io/RelatedWork/papers/manes:ieeetse:2019/
[5] lcamtuf (M. Zalewski) — *American Fuzzy Lop* project page. https://lcamtuf.coredump.cx/afl/
[6] google/fuzzing — *Structure-Aware Fuzzing* docs (why byte mutation fails; libprotobuf-mutator; custom mutators; PNG/protobuf/SQL examples). https://github.com/google/fuzzing/blob/master/docs/structure-aware-fuzzing.md
[7] devilinside.me — *Structure-Aware Fuzzing with AFL (protobuf mutator)*. https://devilinside.me/blogs/afl-structure-aware-fuzzing-protobuf-mutator
[8] Semantic Scholar — Miller et al. *An empirical study of the reliability of UNIX utilities* (bibliographic record). https://www.semanticscholar.org/paper/An-empirical-study-of-the-reliability-of-UNIX-Miller-Fredriksen/2c13dcfdc5ea2d355a46fe326c371038a00ba7f5
[9] Wikipedia — *Fuzzing* (definition, Heartbleed/Shellshock/Stagefright, OSS-Fuzz CVE counts). https://en.wikipedia.org/wiki/Fuzzing
[10] ScienceDirect — *A survey of coverage-guided greybox fuzzing with deep neural models* (black/grey/white-box, mutation vs generation). https://www.sciencedirect.com/science/article/pii/S0950584925001363
[11] Isosceles — *How to Build a Fuzzing Corpus* (seeds, set-cover minimization / corpus distillation). https://blog.isosceles.com/how-to-build-a-corpus-for-fuzzing/
[12] google/AFL — *technical_details.txt* (64 KB bitmap, edge XOR, hit-count buckets, favored entries, mutation stages, fork server). https://github.com/google/AFL/blob/master/docs/technical_details.txt
[13] Yang, Chen, Eide, Regehr — *Finding and Understanding Bugs in C Compilers* (Csmith; 325+ bugs; differential oracle). https://dl.acm.org/doi/10.1145/1993316.1993532
[14] Fioraldi, Maier, Eißfeldt, Heuse — *AFL++: Combining Incremental Steps of Fuzzing Research*, USENIX WOOT '20. https://www.usenix.org/conference/woot20/presentation/fioraldi
[15] google/oss-fuzz — README (launch Dec 1 2016; 13k vulns / 50k bugs / 1k projects @ May 2025; engines libFuzzer/AFL++/honggfuzz; languages). https://github.com/google/oss-fuzz
[16] google/honggfuzz — README + FeedbackDrivenFuzzing docs (Robert Świecki; Intel BTS/PT; persistent ~1M execs/sec). https://github.com/google/honggfuzz
[17] Ding & Le Goues — *An Empirical Study of OSS-Fuzz Bugs* (cumulative bug/CVE counts; ClusterFuzz). https://arxiv.org/abs/2103.11518
[18] Google Online Security Blog — *Leveling Up Fuzzing: Finding more vulnerabilities with AI* (Nov 2024; 26 vulns; OpenSSL CVE-2024-9143; 370k lines). https://security.googleblog.com/2024/11/leveling-up-fuzzing-finding-more.html
[19] LWN — *Coverage-guided kernel fuzzing with syzkaller* (Vyukov; 150+ bugs; syzbot). https://lwn.net/Articles/677764/
[20] Wikipedia — *Shellshock (software bug)* (AFL-found variants; comparison to Heartbleed). https://en.wikipedia.org/wiki/Shellshock_(software_bug)
[21] The Hacker News — *Google's AI-Powered OSS-Fuzz Finds 26 Vulnerabilities*. https://thehackernews.com/2024/11/googles-ai-powered-oss-fuzz-tool-finds.html
[22] google/sanitizers — ASan/TSan/MSan/UBSan/LSan project. https://github.com/google/sanitizers
[23] estebanherlein.github.io — *Fuzz testing* (oracle problem; crashes vs assertions/invariants; pre/post-conditions). https://estebanherlein.github.io/blog/fuzz-testing/
[24] swenotes.com — *AddressSanitizer (ASan): A Practical Guide* (how sanitizers detect; pairing with fuzzing). https://swenotes.com/2025/09/27/addresssanitizer-asan-a-practical-guide-for-safer-c-c/
[25] ScienceDirect — *Fuzzing JavaScript JIT compilers with a high-quality differential test oracle* (differential oracle; engines). https://www.sciencedirect.com/science/article/abs/pii/S0167404825003499
[26] DeepWiki (google/oss-fuzz) — *Sanitizers and Fuzzing Engines*. https://deepwiki.com/google/oss-fuzz/2.4-sanitizers-and-fuzzing-engines
[27] dubzzz/fast-check — Property-based testing framework for JS/TS (arbitraries, shrinking). https://github.com/dubzzz/fast-check
[28] PkgPulse — *Property-Based Testing in JavaScript 2026* (Dubien 2017; 80+ arbitraries; 10M+ weekly downloads; integrated shrinking). https://www.pkgpulse.com/guides/property-based-testing-fast-check-javascript-2026
[29] CodeIntelligenceTesting/jazzer.js — Coverage-guided in-process fuzzing for Node.js (libFuzzer-based; it.fuzz()). https://github.com/CodeIntelligenceTesting/jazzer.js/
[30] fuzzitdev/jsfuzz — Coverage-guided fuzz testing for JavaScript (Istanbul coverage; unhandled exceptions/DoS). https://github.com/fuzzitdev/jsfuzz
[31] DevSecOps School — *What is Coverage-guided Fuzzing?* (canonical loop; instrumentation; corpus evolution). https://devsecopsschool.com/blog/coverage-guided-fuzzing/
[32] arXiv 2402.00350 — *Large Language Models Based Fuzzing Techniques: A Survey* (LLM-in-loop costs, non-textual limits). https://arxiv.org/html/2402.00350v1
[33] arXiv 2512.03420 — *HarnessAgent: Scaling Automatic Fuzzing Harness Construction* (harness-writing cost; LLM false positives / metric gaming). https://arxiv.org/html/2512.03420v1
