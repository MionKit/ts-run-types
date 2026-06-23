# Self-Improving Software via Directive-Driven Testing

> A design framework for closing the testing loop with an LLM agent: the agent
> proposes directives (oracles), generates the tooling, runs it, observes
> failures, proposes fixes, and re-verifies — using **directive-driven testing as
> its reward signal**, anchored to an oracle it cannot fake.
>
> Builds directly on
> [`framework-directive-driven-testing.md`](framework-directive-driven-testing.md).
> Backing research and citations in [`research/04-llm-self-improving.md`](research/04-llm-self-improving.md)
> and [`sources.md`](sources.md).

---

## 1. The thesis, and why it is suddenly plausible

Reinforcement learning for code always lacked two things: a **reward definition**
(what counts as correct?) and the **environment** to test it. LLMs now supply
both:

- they can **propose a candidate directive** (read a type / docstring / RFC and
  guess the property), and
- they can **generate the tooling** (harness, generator, seeds) to exercise it.

Directive-driven testing then turns that directive into a **dense stream of
pass/fail signal** an agent can optimize against. That is the unlock:

> **Fuzzing / PBT is the verification = reward signal that makes
> "self-improving software" mean something concrete instead of a slogan.**

It already exists in pieces:

- **OSS-Fuzz-Gen** (Google): an LLM *writes the fuzz harness*; it improved
  coverage on 272 C/C++ projects (+370k lines) and surfaced a **~20-year-old
  OpenSSL bug, CVE-2024-9143**, that hand-written harnesses missed.
- **AlphaEvolve** (DeepMind, 2025): propose code diffs → score with an
  **automated evaluator** → keep winners. It beat Strassen's 56-year-old 4×4
  matrix-multiply record (48 vs 49 scalar multiplications) and recovered ~0.7% of
  Google's fleet compute. The evaluator *is* the oracle.
- **Differential prompting** (ASE 2023): an LLM is bad at writing a failing test
  directly (~28.8%) but good at synthesizing a **reference implementation** to
  disagree with — lifting success to ~75%. A differential oracle from thin air.
- **SWE-agent+ / RLVR**: agents that **run their own tests before submitting**
  solve more issues; reinforcement-learning-with-verifiable-rewards uses test
  pass/fail as the signal.

None of these replaces the search/repair engine; the LLM is injected exactly
where each system was weakest — the **oracle** and the **harness**.

---

## 2. The closed loop

```
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                         SELF-IMPROVEMENT LOOP                              │
 │                  directive-driven testing = reward signal                  │
 └───────────────────────────────────────────────────────────────────────────┘

   ┌────────────────┐  proposes a directive (oracle/hypothesis)
   │ 1. HYPOTHESIZE │  "decode(encode(x)) == x for all x : T"
   │   (LLM)        │  from a type / docstring / spec / RFC
   └───────┬────────┘
           │                        ┌──────────────────────────┐
           ▼                        │ 2. BUILD TOOLING          │
   ┌────────────────┐               │ generator + harness + seeds│
   │  TRUST GATE    │──── derived ─►│ (LLM or reflection-derived)│
   │  is this a     │   directive   └──────────┬────────────────┘
   │  SOUND oracle? │                          │
   │  (§4)          │                          ▼
   └───────┬────────┘               ┌──────────────────────────┐
           │ anchored                │ 3. GENERATE + RUN         │
           ▼                         │ thousands of seeded inputs │
   ┌────────────────┐  fails         └──────────┬────────────────┘
   │ 6. VERIFY FIX  │ ◄──────────────── counterexample / crash / violation
   │ rerun ALL +    │                          │  (the reward = a FAILURE)
   │ differential   │                          ▼
   └───────┬────────┘               ┌──────────────────────────┐
           │ pass                    │ 4. SHRINK                 │
           ▼                         │ minimal, seeded repro      │
   ┌────────────────┐                └──────────┬────────────────┘
   │ 7. PROMOTE     │                           │
   │ counterexample │                           ▼
   │ → regression   │                ┌──────────────────────────┐
   └───────┬────────┘                │ 5. PROPOSE FIX (APR)      │
           │                         │ patch from the shrunk repro│
           │  overfit? weak oracle?  └──────────┬────────────────┘
           └──────────────► back to 1: strengthen the directive ◄┘
```

Two failure exits matter as much as the happy path:

- **Step 6 fails** → the fix didn't work or broke something → re-propose.
- **Step 7 suspects overfitting** (passed a thin test) → **go back to 1 and
  strengthen the directive**, not ship the patch. The loop improves its *oracle*,
  not just its code.

---

## 3. Roles: who does what

| Step | Owner | Human-authored anchor still required? |
|---|---|---|
| 1. Hypothesize directive | LLM proposes; **reflection derives the safe ones** | Yes — see §4 |
| 2. Build tooling (gen/harness) | LLM or reflection layer (Q1/Q2 of DDT) | No (mechanical when reflection exists) |
| 3. Generate + run | Harness (deterministic, seeded) | No |
| 4. Shrink | Engine (fast-check/Hypothesis/C-Reduce) | No |
| 5. Propose fix | LLM (APR: ChatRepair / AutoCodeRover style) | No |
| 6. Verify fix | Full suite + **differential / sound checker** | **Yes — the trust anchor** |
| 7. Promote / refine | Loop policy | Human review gate at low maturity |

The single most important design choice is **where the trustworthy oracle comes
from in step 6** — because everything else can be machine-generated and therefore
machine-gamed.

---

## 4. The trust anchor (the part that makes this honest)

> **The loop can never be more correct than its oracle.**

Three concrete ways it goes wrong, and the anchor that prevents each:

1. **Oracle inferred from buggy code blesses the bug.** An LLM shown the
   *implementation* tends to encode what the code *does*, not what it *should do*
   (documented result, 2024). A test built from it passes on the bug.
   **Anchor:** derive directives from something *independent of the
   implementation under repair* — a **type/spec** (reflection), an **inverse**
   (round-trip), or a **second implementation** (differential). A
   reflection-derived "value of `T` must `validate(T)`" oracle does not know or
   care how the encoder is written, so a broken encoder *cannot* satisfy it.

2. **Goodhart / reward hacking.** "When a measure becomes a target, it ceases to
   be a good measure." Test-as-reward is especially hackable: weaken the
   assertion, special-case known inputs, or tamper with the harness.
   **Anchor:** the agent must **not be able to edit the directive or the
   harness** in the same trust domain as the code it's repairing. Keep the
   oracle, the seed corpus, and the regression suite **out of the agent's write
   scope**. Verify with a *held-out, differently-derived* oracle in step 6.

3. **Plausible-but-overfitting patches.** APR's oldest wound: a patch that passes
   an incomplete suite but is semantically wrong — worse when the *same* LLM
   wrote both the test and the fix (circularity).
   **Anchor:** the counterexample that triggered the fix is promoted to a
   regression (step 7), and step 6 re-runs a **differential** check the patch
   wasn't tuned against. If a fix passes the thin test but fails the differential,
   the loop *strengthens the directive* (back to 1) instead of shipping.

**The clean rule:** an LLM may *propose* the oracle, the harness, the input, and
the fix — but **the deciding oracle must come from somewhere the model can't
fake**: a human, a differential reference, a formal spec, or a sound checker.
Reflection-derived directives are valuable precisely because they are such an
anchor.

```
trust(loop)  =  trust(the oracle in step 6)
             =  independence(oracle, code-under-repair) × soundness(directive §3.5 of DDT)
```

---

## 5. Pseudo-code

```ts
// One iteration of the self-improvement loop.
// Invariants:
//   - `directiveStore`, `seedCorpus`, `regressionSuite` are OUTSIDE agent write-scope.
//   - `verifyOracle` is INDEPENDENT of the code the agent may edit (reflection / diff / spec).
async function improveOnce(target: Module, ctx: LoopContext): Promise<Outcome> {
  // 1. HYPOTHESIZE — prefer derived directives; LLM only proposes candidates.
  const directive =
    deriveDirectiveFromReflection(target)          // sound, free, anchored  (best)
    ?? await llm.proposeDirective(target.specOrDocs) // candidate — must pass the trust gate
    ?? roundTripIfInverseExists(target)              // free baseline
    ?? neverCrashes(target);                         // weakest, still useful

  if (!passesTrustGate(directive, target)) {         // §4: independent? sound? not editable?
    return { kind: 'rejected-directive', directive };
  }

  // 2. BUILD TOOLING — reflection-derived when possible, else LLM-generated, then frozen.
  const generator = deriveGenerator(target) ?? await llm.writeArbitrary(target);
  const harness   = seededHarness(generator, { seed: ctx.seed, iterations: 10_000 });

  // 3 + 4. RUN to a shrunk, seeded counterexample (or success).
  const result = await harness.run(directive);
  if (result.ok) return { kind: 'holds', directive, seed: ctx.seed };
  const repro = result.shrink();                     // minimal, replayable

  // 5. PROPOSE FIX — APR conditioned on the minimal repro.
  const patch = await llm.repair(target, repro, directive);

  // 6. VERIFY — full suite + a DIFFERENT, independent oracle the patch wasn't tuned on.
  const verdict = await verify(patch, {
    regression: ctx.regressionSuite,                 // includes prior counterexamples
    directive,                                       // the one that failed
    independentOracle: ctx.differentialOracle,       // the anti-Goodhart check
  });
  if (!verdict.pass)  return { kind: 'fix-failed', repro, patch, verdict };
  if (verdict.overfitSuspected)                      // passed thin test, failed differential
    return { kind: 'strengthen-directive', repro, directive }; // → back to step 1

  // 7. PROMOTE — land the patch AND pin the counterexample forever.
  ctx.regressionSuite.add(reproAsTest(repro, directive));
  return { kind: 'improved', patch, repro, directive };
}
```

Key structural points the pseudo-code encodes:

- **Derive before you prompt.** The cheapest *and* safest directives come from
  reflection; the LLM is the fallback, gated by trust (§4).
- **Freeze the tooling.** Once built, the harness/directive/corpus are read-only
  to the repair agent — no editing the test to pass it.
- **A suspected overfit strengthens the oracle**, it does not ship the patch.

---

## 6. Concrete instantiation for JS/TS

The audience can build a toy of this today:

```
Reflection  : Zod schema  (or RunTypes getRunType<T>())   →  introspectable T
Generator   : zod-fast-check / createMockType<T>()         →  values of T
Directive   : round-trip  decode(encode(x)) == x           →  derived oracle
Harness     : fast-check  (seed + shrink built in)         →  deterministic runner
Fix agent   : Claude / GPT given the shrunk counterexample →  patch proposal
Anchor      : a SECOND, independent encoder (or the schema  →  differential verify
              itself) the patch was not tuned against
```

Demo arc for a talk or a repo: LLM reads a `User` type, proposes
`decode(encode(u)) == u`, fast-check finds a unicode/optional-field
counterexample, shrinks it, the agent patches the codec, the loop re-verifies
against the schema (which the patch can't edit), and pins the counterexample.
That *is* the loop in section 2, in the audience's own ecosystem — and RunTypes'
Phase-1/Phase-2 fuzzers are the reflection-native version of the same thing.

---

## 7. Maturity ladder

```
M0  Human writes directives; CI runs them.                    (today, most teams)
M1  Reflection DERIVES directives; human reviews; CI runs.    (RunTypes today)
M2  LLM PROPOSES directives; human approves; loop runs +      assisted
    auto-shrinks; human fixes.
M3  LLM proposes directive + fix; loop verifies against an     supervised autonomy
    INDEPENDENT anchor; human gates the promote step.
M4  Fully autonomous on domains with SOUND, independent        frontier
    oracles (round-trip / differential / formal). Bounded
    write-scope, sandboxed execution, audit trail.
```

**Do not skip the anchor to climb the ladder.** M4 is safe *only* on domains
where the oracle is independent and sound (codecs, validators, compilers,
protocols, numeric kernels — the AlphaEvolve sweet spot). On domains where the
oracle is soft or LLM-inferred, stay at M2–M3 with a human gate.

---

## 8. Risks and mitigations (keep all of these)

| Risk | Mechanism | Mitigation |
|---|---|---|
| **Garbage oracle → confident wrongness** | oracle inferred from buggy code | derive from spec/inverse/diff; reflection anchor (§4.1) |
| **Reward hacking / Goodhart** | weaken assertion, tamper harness | directive + corpus + suite outside agent write-scope (§4.2) |
| **Overfitting patches** | passes thin suite, semantically wrong | promote counterexample; verify on independent differential (§4.3) |
| **Hallucinated oracle / fix** | high false-positive assertions | multi-candidate + consensus; sound-checker disposes (LLM proposes, checker disposes) |
| **Flaky tests poison reward** | nondeterminism in the signal | seed everything; flake-detect before trusting a failure |
| **Unsafe autonomous execution** | runs generated code/builds in prod | sandbox, capability limits, human gate at promote; never self-heal in prod unbounded |
| **Circularity** | same LLM writes test and fix | different provenance for the verifying oracle than the fixing agent |

---

## 9. Design principles (the short list)

1. **The directive is the contract.** Improve the oracle, not just the code; a
   suspected overfit strengthens the directive.
2. **Derive before you prompt.** Reflection-derived directives are cheaper and
   safer than LLM-proposed ones; use the LLM as fallback, behind a trust gate.
3. **The deciding oracle must be unfakeable** by the agent — independent of the
   code under repair and out of its write-scope.
4. **Seed everything.** A reward signal must be reproducible or it trains the
   loop to cheat.
5. **Sandbox and gate.** Autonomy scales with oracle soundness, not with ambition.

---

## 10. One-paragraph summary

LLMs finally supply the two things software RL lacked — a candidate **oracle** and
the **tooling** to test it — and directive-driven testing converts that oracle
into a dense reward signal an agent can optimize against (OSS-Fuzz-Gen,
AlphaEvolve, differential prompting are existing proof). The loop is
hypothesize → build → run → shrink → fix → verify → promote, where a suspected
overfit *strengthens the directive* rather than shipping the patch. The whole
thing is trustworthy exactly insofar as the deciding oracle is **independent of
the code under repair and sound** — which is why **reflection-derived directives
are the ideal anchor**, and why Framework 1's soundness contract is the
foundation this one stands on.
