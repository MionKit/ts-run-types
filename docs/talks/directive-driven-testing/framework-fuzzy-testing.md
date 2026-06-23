# A Framework for Fuzzy Testing

> A **practical, code-first methodology** for adding fuzz testing to a system.
> Three methodologies:
>
> - **Methodology A — Tool Discovery:** find the _tools_ a system needs to be
>   fuzzable at all (generator, seed, observation, shrink).
> - **Methodology B — Oracle Discovery:** find the _rules (oracles)_ that decide
>   when the system misbehaved.
> - **Methodology C — Lifting an existing test:** the common on-ramp — _extend_ an
>   example/unit test into a fuzz test. It usually already exists, and hands you
>   most of A and B for free.
>
> Every step has runnable code, grounded in this repo's real fuzz harness
> (`packages/ts-runtypes/test/fuzz/`). It is written to become a reusable
> **skill** (see §7). Its first real test case is the **FriendlyType / MockData
> sync pipeline** (§6) — we are the framework's first users.
>
> Conceptual companion (no code): [`framework-directive-driven-testing.md`](framework-directive-driven-testing.md).
> The LLM-self-improvement version is built on this one, later.

---

## 0. What "fuzzy testing" means here

Example-based tests check the cases _you thought of_. A fuzz test does the
opposite: it **generates** a flood of inputs you would never write by hand, runs
the system on each, and checks an **always-true rule**. The bug is whatever
breaks the rule.

```
                 ┌──────────────────────────────────────────────┐
                 ▼                                              │
  ┌──────────┐  generate  ┌──────────┐  run   ┌──────────┐ observe │
  │ GENERATOR │ ─────────► │  INPUT   │ ─────► │   SUT    │ ──────┐ │
  └──────────┘            └──────────┘         └──────────┘       │ │
       ▲ seed                                                     ▼ │
  ┌──────────┐  pass/fail decided by  ◄───────────────── ┌──────────────┐
  │  SHRINK  │ ◄───────── ORACLE (the rule) ──────────── │  OBSERVATION │
  └──────────┘   on fail: minimise + keep the seed       └──────────────┘
```

Five moving parts: **generator, the SUT, observation, oracle, shrink** — plus a
**seed** so any finding replays. Methodology A finds the parts that _produce
inputs and make them replayable_ (generator, seed, observation, shrink).
Methodology B finds the _oracle_. Get both and you have a fuzz test. Already have
an example test? **Methodology C** is the shortcut — it hands you a first cut of
both from the test you already wrote.

> The two hard parts are never "how do I randomise bytes." They are
> **(1) generating inputs the system actually accepts** and **(2) knowing when an
> output is wrong**. The methodologies below are processes for exactly those two.

---

## Methodology A — Tool Discovery

> Goal: for a given system, produce a **tool inventory** — what generates inputs,
> what makes runs replayable, what you can observe, and what minimises a failure
> — and a **gap list** of what you must build.

It is a six-step process. Run it top to bottom; each step's output feeds the next.

### A1 · Draw the smallest SUT boundary you can call in-process

Pick the smallest function (or pipeline) you can invoke directly. Smaller = faster
iterations and a sharper oracle. Write its signature down; that _is_ the input
space you must generate and the output you must observe.

```ts
// SUT boundary = one typed function you can call a million times in-process.
type SUT<In, Out> = (input: In) => Out;

// e.g. a codec under test:
declare function encode(user: User): string;
declare function decode(wire: string): User;
```

If you can only reach the system through a CLI, a server, or the filesystem, your
"SUT" is still a function — you just wrap the side-effecting boundary
(`runCommand(args, files) -> {stdout, files, diagnostics}`). Keep wrapping until
you have something pure-ish and callable. (This is exactly what the enrichment
pipeline needs — §6.)

### A2 · Characterise the input space → pick the GENERATOR tool

Ask **"how is a _valid_ input described?"** The answer picks the generator. This is
the most important decision in the whole methodology.

```
How are valid inputs described?               →  Generator tool to use
─────────────────────────────────────────────────────────────────────────────
A) runtime schema / reflected type            →  DERIVE it (reflection)
   (Zod, a RunType, JSON Schema)                  createMockType<T>(), zod-fast-check
B) only a static TS type                       →  reflect it, or hand-write
                                                   typia random<T>(), or fc.Arbitrary<T>
C) unstructured bytes / strings                →  MUTATE a seed corpus
                                                   fc.string(), byte-flip a seed
D) a SEQUENCE of operations (stateful)         →  command / model generator
                                                   fc.commands([...]) + a model
E) two coupled artifacts that EVOLVE via       →  an EVENT generator + a state model
   edits (← the enrichment case, §6)               (build it; see §6)
```

(A) reflected generator — the RunTypes case, near-free:

```ts
// The schema IS the generator. One reflected type → infinite valid values.
import {createMockType} from 'ts-runtypes';
const mockUser = createMockType<User>(); // () => User, valid by construction
const u = mockUser(); // a fresh random User every call
```

(B) hand-written arbitrary — when you have no reflection:

```ts
import fc from 'fast-check';
const userArb: fc.Arbitrary<User> = fc.record({
  id: fc.uuid(),
  name: fc.string(), // empty strings, emoji, RTL marks — the cases you forget
  age: fc.nat({max: 120}),
  tags: fc.array(fc.string()),
});
```

(C) mutation — unstructured input:

```ts
// Start from real seeds; perturb. Random bytes alone rarely get past a parser.
const seedArb = fc.constantFrom(...realSamplePayloads);
const fuzzed = seedArb.chain((s) => fc.string().map((junk) => spliceInto(s, junk)));
```

(D) stateful — generate _sequences_, not single inputs:

```ts
// A bug that only appears after a SEQUENCE of operations needs command generation.
const commands = fc.commands([fc.integer().map((v) => new PushCmd(v)), fc.constant(new PopCmd())]);
fc.assert(fc.property(commands, (cmds) => fc.modelRun(() => ({model: {len: 0}, real: new Stack()}), cmds)));
```

**Output of A2:** the generator(s) you need, and whether each already exists.

In this repo, three generators already exist and cover (A), corruption, and
type-blind junk:

| Generator                        | File                                                 | Produces                                           |
| -------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `createMockType<T>()`            | `packages/ts-runtypes/src/mocking/createMockType.ts` | a **valid** value of `T`                           |
| `mutateToInvalid(schema, valid)` | `test/fuzz/invalidValue.ts`                          | a value **corrupted at one provably-invalid spot** |
| `randomJunk(depth)`              | `test/fuzz/fuzzRunner.ts`                            | type-blind random junk (bounded, acyclic)          |

### A3 · Find the entropy sources → pick the DETERMINISM tool

List **everything non-deterministic** the SUT or the generator touches: RNG,
`Date.now()`, the filesystem, network, hash seeds, `Object` key order, `Set`/`Map`
iteration. **Every one must be replayable**, or a failure can't be reproduced and
the whole loop is useless.

The repo's trick: don't thread a generator through every call — swap `Math.random`
for a seeded PRNG for the duration of one iteration, then restore it.

```ts
// packages/ts-runtypes/test/fuzz/seededRng.ts  (real)
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed); // tiny, fast, well-distributed 32-bit PRNG
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
// mixSeed(baseSeed, label, iteration) → one uint32 so two targets never share a draw stream.
```

For non-RNG entropy, inject it: pass a fixed `now`, use an in-memory filesystem,
sort keys before comparing. **The rule:** a `Violation` must carry the single
`seed` that replays it.

```ts
// packages/ts-runtypes/test/fuzz/fuzzOracle.ts  (real) — note the seed field.
export interface Violation {
  oracle: OracleId;
  target: string;
  seed: number; // ← the exact seed to replay this iteration
  phase: 'valid' | 'invalid' | 'junk' | 'compile';
  message: string;
  value: string;
}
```

**Output of A3:** the determinism tool (seeded RNG + injected clock/FS) and a
confirmed "one seed replays any finding."

### A4 · Find the observation surface → pick the OBSERVABILITY tool

Ask **"after a run, what can I actually see?"** The oracle can only check what you
can observe. Catalogue it:

```
return value         → compare / assert properties on it
thrown error         → catch; classify (expected vs uncaught)
written files        → read them back (use an in-memory FS so it's cheap + isolated)
diagnostics list     → assert codes/severity (← the enrichment pipeline's main output)
logs / events        → capture a buffer
coverage             → instrument, to steer generation (optional, advanced)
```

If the SUT hides its effects (writes to a real disk, logs to stdout), wrap it so
the effects come back as a value — that wrapper is part of your tooling.

### A5 · Decide minimisation → pick the SHRINK tool

A raw random failure is huge and noisy. **Shrinking** reduces it to the minimal
input that still fails — that's what makes a bug diagnosable.

- Using **fast-check**: shrinking is **free** and integrated; on failure it prints
  the seed, the shrunk counterexample, and the shrink count.
- Hand-rolled harness (like this repo's): you either build a shrinker _or_ you
  **generate conservatively** so failures are already small. RunTypes corrupts
  exactly **one** position, so an O2 counterexample is already near-minimal.
- For **event streams** (§6): shrinking = _drop events_ and _simplify each event_
  — fast-check's `fc.commands` shrinks command lists for you.

### A6 · Inventory + gap analysis (the deliverable of Methodology A)

Fill this table. It is the output of tool discovery.

```
Capability      Need                         Have?         Build?
──────────────────────────────────────────────────────────────────────────────
Generator       valid-input producer         ____          ____
                invalid/near-miss producer   ____          ____
Determinism     seeded RNG + injected I/O     ____          ____
Observation     value | error | files | diag  ____          ____
Shrink          minimiser or conservative gen ____          ____
Runner          iterate × seed × collect      ____          ____
```

Worked: **RunTypes value fuzzing** — every cell is "have," pointing at a real file
(`createMockType` / `invalidValue.ts` / `seededRng.ts` / return+throw / one-spot
corruption / `fuzzRunner.ts`). That is why it could be stood up fast. The
enrichment pipeline (§6) will have _gaps_ — mainly the event generator + state
model — and the table is how we'll see exactly what to build.

---

## Methodology B — Oracle Discovery

> Goal: produce the **oracle layer** — the set of always-true rules that decide
> pass/fail — and be honest about each rule's _strength_ and _soundness_.

The oracle is the hard, valuable half (a fuzzer with a weak oracle finds only
crashes). This is a six-step **elicitation**: sweep a fixed catalogue of
rule-shapes against your SUT and harvest concrete rules.

### B1 · Write down the SUT's promises

From docs, type signatures, names, and existing tests, list what the thing claims
to do. Each promise is a candidate oracle. (`decode` _claims_ to invert `encode`;
`validate` _claims_ totality; `gen --update` _claims_ to preserve human edits.)

### B2 · The archetype sweep (the heart of the method)

For each archetype, ask the trigger question; if "yes," write the rule as code.
Sweep **all** of them — the goal is coverage of rule-shapes, not the first hit.

**① Totality / robustness** — _free baseline, always applicable._
Trigger: always. Rule: for **any** input, no crash, returns the declared type.

```ts
// RunTypes O3 (real): validate is total on ANY input — even random junk.
const r = target.validate(value);
if (typeof r !== 'boolean') fail('O3', 'validate returned a non-boolean');
// (wrapped in try/catch → a throw is also an O3 violation)
```

**② Round-trip / inverse** — _highest ROI._
Trigger: is there an inverse op (encode/decode, parse/print, gen/read)?

```ts
// RunTypes O5 (real): re-encoding a decode of the wire reproduces the wire.
const wire1 = target.jsonEncode(value);
const wire2 = target.jsonEncode(target.jsonDecode(wire1));
if (wire1 !== wire2) fail('O5', 'json round-trip not stable');
```

**③ Idempotence** — _do it twice, same as once._
Trigger: is re-running the operation supposed to be a no-op? (← `gen ∘ gen`, §6)

```ts
const once = f(x);
const twice = f(once);
if (!deepEqual(once, twice)) fail('idempotence', 'f(f(x)) !== f(x)');
```

**④ Invariant** — _a property of the output that always holds._
Trigger: what is always true of the result, regardless of input?

```ts
// RunTypes O1/O2 (real): the validator's defining invariants.
if (!target.validate(mock())) fail('O1', 'rejected a valid mock');
if (target.validate(corrupt(mock()))) fail('O2', 'accepted a provably-invalid value');
```

**⑤ Differential** — _two implementations / two views must agree._
Trigger: is there a second impl, an old version, or two paths to the same answer?

```ts
// RunTypes O4 (real): two functions, one truth.
const ok = target.validate(value);
const noErrors = target.getValidationErrors(value).length === 0;
if (ok !== noErrors) fail('O4', `validate=${ok} but errors disagree`);

// RunTypes O12 (real): the JSON and binary wires must agree on the same value.
const jsonWire = target.jsonEncode(value);
const viaBinary = target.jsonEncode(target.binaryDecode(target.binaryEncode(value)));
if (jsonWire !== viaBinary) fail('O12', 'JSON and binary wires disagree');
```

**⑥ Metamorphic** — _a known input-transform with a known effect on output._
Trigger: can you transform the input in a way whose effect on the output you can
predict — _without_ knowing the output itself? (← the core of §6: a type edit →
a bounded change in the generated file.)

```ts
// Generic shape: transform t on input → relation rel must hold on the outputs.
const y1 = f(x);
const y2 = f(t(x));
if (!rel(y1, y2)) fail('metamorphic', `f and f∘t disagree under ${t.name}`);
// e.g. add one field to a type ⇒ the generated file gains exactly one node, nothing else.
```

**⑦ Conservation / preservation** — _something must survive unchanged._
Trigger: is there content the operation must carry through untouched? (← human
edits preserved across re-sync, §6.)

```ts
const before = readAuthoredContent(file);
const after = readAuthoredContent(regenerate(file, unrelatedChange));
if (!deepEqual(before, after)) fail('preservation', 'an unrelated change clobbered authored content');
```

**⑧ Negative space** — _what must be REJECTED, and how._
Trigger: what inputs are illegal, and what should happen? The rule is not just
"reject" but "reject with a **specific, actionable** signal — never a crash, never
silent acceptance." (← "user adds an unrelated node in comptime args → _then
what?_", §6.)

```ts
const diags = run(illegalInput);
if (diags.length === 0) fail('neg', 'illegal input silently accepted');
if (!diags.some((d) => d.code === EXPECTED_CODE)) fail('neg', `wrong/no diagnostic for ${illegalInput}`);
```

### B3 · Provenance — where each rule came from

Tag every harvested rule by its source. This tells you how much to trust it, and
(critically for the self-improvement sequel) whether it is **independent** of the
code under test.

```
specified   : from a written spec / contract / type        (strongest intent)
derived     : from the type/schema itself (reflection)      ← "value of T must validate(T)"
inverse     : from an inverse operation                     (round-trip)
differential: from a 2nd impl / 2nd view / old version
domain-law  : math/algebra (commute, assoc, idempotent, conserve)
implicit    : universal (no crash, total, terminates)       (free, weak)
```

### B4 · The soundness gate (one-directional — read twice)

A rule you fail the build on must be **sound**: when it fires, something is _truly_
wrong. For corruption/transform oracles, bias hard toward **no false positives**:

> **False negative** (missed a possible bug) → only lost coverage.
> **False positive** (flagged correct behaviour) → spurious failure, destroyed
> trust. **Never trade toward false positives.**

This repo encodes it literally: corruption only happens at a position that can be
_proven_ invalid in isolation, and the metamorphic comparison uses the **wire
image** (not value equality) to avoid a benign representation difference firing
falsely:

```ts
// fuzzOracle.ts O5/O6 compare encode∘decode∘encode, NOT value equality —
// sidesteps the optional-`undefined`-key vs dropped-key mismatch (a false positive).
// invalidValue.ts only corrupts where `proven` is true; never under union/any/index-sig.
```

### B5 · Strength ladder + generator coverage

Rank your harvested rules and make sure you have at least the baseline + one
strong rule. Then sanity-check that the **generator actually reaches** the space
the rule talks about (a generator that never produces the triggering shape makes
the rule vacuously pass — the QuickChick "shadowed variable" lesson).

```
weak  → totality (never crashes)
      → invariant on output
      → idempotence
      → metamorphic / conservation
strong→ round-trip + differential (catch silent wrong-but-doesn't-crash bugs)
```

### B6 · Encode the oracle layer (the deliverable of Methodology B)

Collect the rules into one typed layer that returns a replayable `Violation`, the
way `fuzzOracle.ts` does. That `FuzzTarget` interface _is_ the contract between
the generator (A) and the oracles (B):

```ts
// packages/ts-runtypes/test/fuzz/fuzzOracle.ts  (real, trimmed)
export interface FuzzTarget {
  title: string;
  schema: RunType; // drives mock + corruption (Methodology A)
  validate: (v: unknown) => boolean; // SUT functions to exercise...
  getValidationErrors: (v: unknown) => unknown[];
  jsonEncode?: (v: unknown) => string | undefined;
  jsonDecode?: (s: string) => unknown;
  binaryEncode?: (v: unknown) => ArrayBuffer;
  binaryDecode?: (b: ArrayBuffer) => unknown;
}
// each check*(target, value, ctx) → Violation | null   ← one rule, one function
```

---

## Methodology C — Lifting an existing test into a fuzz test (the on-ramp)

> Goal: turn an **example/unit test you already have** into a fuzz test — and keep
> both. A and B build from a blank page; C is the shortcut you reach for most of
> the time, because a passing example test has already paid the three hardest
> costs of a fuzz test.

An example test and a fuzz test are not rivals; they are the **same test at two
zoom levels**. The example pins one point — fast to debug, documents intent, runs
in 1 ms. The fuzz test sweeps the neighbourhood around it. You write the example
**first**, on purpose: it is the predecessor that tells you _exactly what to test
and what inputs you need_. Then you lift it.

### C1 · Every example test already contains a fuzz test's skeleton

Arrange-Act-Assert maps one-to-one onto the fuzz parts. The lift is three local
edits, nothing structural:

| Example test (Arrange-Act-Assert)      | → fuzz part       | the edit                                                       |
| -------------------------------------- | ----------------- | -------------------------------------------------------------- |
| **Arrange** a literal input / fixture  | generator (A2)    | _"which axis did the author freeze arbitrarily?"_ → vary it    |
| **Act**: call the SUT                  | SUT boundary (A1) | **keep verbatim** — it already works                           |
| **Assert** `expect(out).toBe(literal)` | oracle (B)        | generalise the constant to a **relation true for every input** |

Two of the three are free: the **Act** is the boundary A1 tells you to hunt for,
already wrapped; the **Arrange** is a hand-built _valid input_ — the thing A2
calls the hardest part. Only the **Assert** needs real thought (C3).

### C2 · Read the inputs you need off the Arrange

Don't invent an input space — **widen the one the example already uses**. The
fixture names the shape and the validity bar; find the frozen axis and let it
vary. The loudest tell is a test that hardcodes **a `valid` list and an `invalid`
list** — that split literally names the **two generators** you need:

```ts
// test/suites/validation/Atomic.test.ts → assertValidateStatic (validationAsserts.ts:119)
// the example PINS both sides by hand:
valid.forEach((v) => expect(validate(v)).toBe(true)); //   ← createMockType<T>()           generates this side
invalid.forEach((v) => expect(validate(v)).toBe(false)); // ← mutateToInvalid(schema, mock)  generates this side
```

The fuzz harness reads exactly that off the example: `createMockType(schema)`
replaces the hand-written `valid` array (valid by construction), and
`mutateToInvalid` (`test/fuzz/invalidValue.ts`, consumed by `fuzzRunner.ts:14`)
replaces the `invalid` array (corrupt one provably-invalid spot). A **table-driven**
example is the same story: each row is a hand-found seed, and the row dimension is
your generator.

### C3 · Lift the assertion — constant → invariant (the only hard part)

A `toBe(constant)` is true for _this_ input only; a fuzz oracle must hold for
_all_. Pick the tactic by the **shape of the assertion you already have**:

| The example asserts…                             | Lift it to…                                                          | Real pair in this repo                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| a **relation** already (round-trip, idempotence) | the same relation over a generator — _trivial_                       | `assertBinaryRoundTrip` (serializationAsserts.ts:205) → `checkBinaryStable` (fuzzOracle.ts:187)         |
| **true/false** on a hand-picked good/bad value   | two generators + the **consistency invariant**                       | `assertGetValidationErrorsContract` (validationAsserts.ts:492) → `checkErrorsAgree` (fuzzOracle.ts:131) |
| a **constant you can recompute** (`toBe(5)`)     | a **reference oracle** (differential) or a metamorphic relation (B2) | —                                                                                                       |
| a **hardcoded regression** ("this once broke")   | **fuzz the neighbourhood** of that hazard                            | `binaryEncoderResize.test.ts` (50 small encodes + 1 big) → varied-length mocks                          |

The round-trip case is the gift: `expect(decode(encode(x))).toEqual(x)` is
_already_ the invariant — swap the literal `x` for `createMockType<T>()` and you
are done. The good/bad case is the workhorse: the example's two values become two
generators, and the assertion becomes the relation that ties the SUT's two outputs
together — `validate(x) ⇔ getValidationErrors(x).length === 0`, true for **every**
`x` (`checkValidAccepted` / `checkInvalidRejected` / `checkErrorsAgree`,
fuzzOracle.ts:94/106/131).

> **Soundness still applies (B4).** A constant lazily generalised to a sloppy
> invariant will false-positive under fuzzing. Run the lifted oracle through B4's
> one-directional gate: _predicate false ⇒ a real bug_, no exceptions.

### C4 · The shared oracle layer is the bridge

The lift is cheap because the oracle wants to live in **one place, called from
both lanes**. The repo's `test/util/*Asserts.ts` files **are** Methodology B6's
oracle layer seen from the example side: `assertValidateStatic`,
`assertBinaryRoundTrip`, … each encode one rule, and a shared normaliser
(`normalizeForComparison` / `deepCloneForRoundTrip`, equalsHelpers.ts:39) is
imported by **both** `serializationAsserts.ts:11` and `idIntegrityAsserts.ts:28`.

Today the fuzz oracles **mirror** those asserts (`checkErrorsAgree` re-expresses
`assertGetValidationErrorsContract`) rather than importing them. The discipline the
lift teaches: **write the oracle once, pin it with examples, sweep it with fuzz** —
factor the example's assertion into a helper the fuzz runner can call, so the two
lanes can never drift.

### C5 · Keep the example — it is now your regression pin and shrink floor

Lifting **adds** a test, it doesn't replace one. The original example earns its
keep three ways: the **fastest reproducer** (a known-minimal seed), **executable
documentation** of intent, and a **1 ms smoke** beside a multi-second soak. It also
sets the shrink floor — if a fuzz failure shrinks to something _simpler_ than your
example, that minimal case becomes a **new example test**. The two lanes feed each
other.

### C6 · Know when NOT to lift

Lifting pays where inputs vary _and_ an invariant exists. It doesn't always:

- **Pure, total transforms** — `transformAsserts.ts` (`transform(input) === expected`):
  deterministic, no error path, nothing to sweep. The examples are sufficient.
- **Inputs the generator can't reach** — `circularGuardAsserts.ts` needs a _cyclic_
  value, which the default `createMockType` rng won't produce; a naive lift would
  fuzz a space that never contains the case (B5's coverage trap). Lift only once you
  have a generator that reaches it.

The test to apply: _is there an axis worth sweeping, and a relation that stays true
across it?_ Yes → lift (C1–C5). No → the example already is the right tool.

---

## §5. Putting both together — a complete, runnable example

A 30-line fuzz test for a codec, built by running A then B:

```ts
import fc from 'fast-check';
import {test} from 'vitest';
import {encode, decode} from '../src/codec';

// --- Methodology A: tools ---
// A2 generator: a hand-written arbitrary (no reflection here).
const userArb = fc.record({id: fc.uuid(), name: fc.string(), age: fc.nat({max: 120})});
// A3 determinism + A5 shrink: fast-check gives seed + shrinking for free.
// A4 observation: the return value.

// --- Methodology B: oracles ---
test('codec', () => {
  fc.assert(
    fc.property(userArb, (user) => {
      // ② round-trip (strong)
      expect(decode(encode(user))).toStrictEqual(user);
      // ③ idempotence of encode∘decode at the wire
      const w = encode(user);
      expect(encode(decode(w))).toBe(w);
    }),
    {numRuns: 1000}
  );
  // ① totality (negative space): decode must not crash on junk, only reject.
  fc.assert(
    fc.property(fc.string(), (s) => {
      try {
        decode(s);
      } catch (e) {
        expect(e).toBeInstanceOf(DecodeError);
      }
    })
  );
});
```

That is the entire framework in miniature: pick a generator (A2), lean on
fast-check for seed/shrink (A3/A5), observe the return (A4), and sweep oracle
archetypes ②③①⑧ (B2). The rest of this doc is what to do when the SUT is _not_ a
simple in/out function — like a stateful sync pipeline.

---

## §6. First real test case — the FriendlyType / MockData sync pipeline

> This is the framework's first user. The goal: **event-driven** fuzzing that
> proves the enrichment pipeline stays consistent under _any_ sequence of edits to
> either the source type or the generated file.
>
> Grounded in the real pipeline: CLI at [`cmd/ts-runtypes/enrich_cli.go`](../../../cmd/ts-runtypes/enrich_cli.go)
> (+ `enrich_reconcile.go`, `enrich_check.go`); the value-preserving merge in
> [`internal/enrich/mirror/reconcile.go`](../../../internal/enrich/mirror/reconcile.go);
> node shapes in [`packages/ts-runtypes/src/enrich/friendlyType.ts`](../../../packages/ts-runtypes/src/enrich/friendlyType.ts)
>
> - `mockData.ts`; comptime-args validation in
>   [`internal/comptimeargs/comptimeargs.go`](../../../internal/comptimeargs/comptimeargs.go).
>   Existing **example-based** tests
>   ([`packages/ts-runtypes/test/suites/enrich/enrichReconcile.test.ts`](../../../packages/ts-runtypes/test/suites/enrich/enrichReconcile.test.ts),
>   `enrichGen.test.ts`, `enrichCheck.test.ts`) already pin individual cases — the
>   fuzzer **generalises them to "holds for every edit sequence."**

### 6.1 The problem, stated as a fuzzing problem

Two **coupled artifacts** evolve over time:

- **T** — the source TypeScript type.
- **E** — its committed enrichment sibling (`*.rt.ts`): the `FriendlyType<T>` map
  (labels + error templates) and the `MockData<T>` map (sample pools/ranges),
  scaffolded by the compiler and filled by users/LLMs.

A **pipeline P** (the `ts-runtypes` CLI: `gen` / `gen --update` / `gen --prune` /
`check` / `describe`) keeps `E` consistent with `T`. **Events** mutate `T` or `E`.
The system under test is **P**, and the question is: _for any sequence of events,
does P keep T and E consistent — preserving human work, syncing real changes, and
rejecting nonsense with a clear diagnostic instead of silent corruption or a
crash?_

That is a **stateful, metamorphic** fuzzing problem — precisely the kind naive
"throw random bytes" fuzzing cannot express, and exactly what archetypes ⑥
(metamorphic), ⑦ (preservation), and ⑧ (negative space) are for.

### 6.2 The event surface (the generator's alphabet)

```
Events on T (the source type)              Events on E (the generated file)
──────────────────────────────────        ─────────────────────────────────────
add a field                                fill a @todo blank
remove a field                             edit a label / error template
rename a field                             change a MockData pool/range value
change a field's type                      add a node (related → ok; UNRELATED → ?)
make a field optional / required           remove / rename a node
widen / narrow a union                     edit a comptime-args literal
add a format brand (e.g. email)            mark @rtOrphan / @rtOrphanChild
reorder fields                             reorder nodes
```

Interleaved with **commands**: `gen`, `gen --update`, `gen --prune`, `check`.

### 6.3 Tool discovery for the pipeline (Methodology A applied)

```
Capability    Need for this SUT                                  Have?   Build?
──────────────────────────────────────────────────────────────────────────────────
Generator     an EVENT-STREAM generator over the alphabet above   no    ✅ build
              + a MODEL of (T, E) tracking expected structure      no    ✅ build
Determinism   seeded event stream                                  yes   reuse seededRng.ts
Observation   regenerated E (text/AST) + the diagnostics list      yes   CLI already emits both
Shrink        drop/simplify events                                 yes   fc.commands shrinks for free
Runner        apply event → run command → check oracle, repeat     part  ✅ wire to a model harness
```

**The gap is the event generator + the (T, E) model.** Everything else reuses what
exists. The model only needs to track _enough_ to state the oracles: the set of
field paths in T, which nodes in E are authored vs scaffolded (`@todo`), and which
edits were "unrelated."

### 6.4 Oracle discovery for the pipeline (Methodology B applied)

The archetype sweep yields a concrete rule set:

| #       | Archetype            | Rule (oracle) — with the real diagnostic codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | ③ idempotence        | `gen --update` run twice ⇒ **byte-identical** file. No drift, no re-stamped `@todo`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **R2**  | ⑥ metamorphic        | **A single edit to T ⇒ a bounded, predictable change to E.** _add_ field → one new `@todo` scaffold node in both `friendly*` and `mock*`; _remove_ field → that node becomes an `@rtOrphanChild` carcass (authored value kept, **not** deleted); _rename_ → value carried under the new key via `@rtIds`; _retype_ → property-merged + MockData re-checked. _Local edit → local effect._                                                                                                                                                                                |
| **R3**  | ⑦ preservation       | `gen --update` **never modifies an authored leaf value**. An _unrelated_ change to T leaves every other authored label/pool byte-identical.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **R4**  | ⑤ differential       | `check` and `gen --update` agree on structure: if `check` is clean (no `FT*/MD*/GE*` error) then `--update` makes **no structural change**; a missing/extra field is seen by both.                                                                                                                                                                                                                                                                                                                                                                                      |
| **R5**  | ⑧ negative space     | Every malformed edit yields a **specific code** — never a crash, never silent accept: unrelated field → **FT002 / MD001**; bad `$errors` constraint key → **FT003**; bad `$[placeholder]` → **FT005**; bad mock pool value → **MD003**; a forbidden construct in a comptime-args `$errors` function (a call / ternary / spread / computed key / template `${}`) → **CTA003** (non-literal → CTA001, too deep → CTA002); deleted source type → **GE002**; renamed type → **GE003**. _(The precise answer to "unrelated node in comptime args → then what": **CTA003**.)_ |
| **R6**  | ③ convergence        | After `gen --update` (then `--prune`), the file is a **fixed point**: `check` passes and a second `--update` is a no-op.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **R7**  | ②⑦ orphan round-trip | _remove_ X → `--update` keeps an `@rtOrphanChild` carcass; _re-add_ X → `--update` **restores the authored value** from it. But `--prune` in between deletes the carcass, so _remove → prune → re-add_ yields a fresh empty `@todo` (value gone). Both directions must hold exactly.                                                                                                                                                                                                                                                                                    |
| **R8**  | invariant            | **`@todo` lifecycle:** emitted once on a new const; after the user deletes it, `--update` never re-adds it to an existing const, and `--prune` never removes it.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **R9**  | boundary             | **Markers are compiler-owned.** `@rtType`/`@rtIds` are _outputs_, not authored content — `--update` refreshes them on structural drift, so the generator must **not** treat hand-edits to them as R3 preservation targets.                                                                                                                                                                                                                                                                                                                                              |
| **R10** | ① totality           | The walkers are depth-bounded (`maxWalkDepth`); a deep or **circular** type must produce a diagnostic or a bounded file — **never** a crash, stack overflow, or hang.                                                                                                                                                                                                                                                                                                                                                                                                   |

R2, R3, R5, and R7 are the valuable, non-obvious ones — and they are _only_
expressible because we modelled the system as events-over-coupled-artifacts.

### 6.5 The test, as a model-based fuzzer (sketch)

Using fast-check command generation: each command is an event or a CLI run; the
model tracks expected `(T, E)` facts; after each command we assert the relevant
R-oracle. fast-check generates and **shrinks** the event sequence for free.

```ts
import fc from 'fast-check';

// The model: just enough to state the oracles.
interface Model {
  fields: Map<string, FieldSpec>; // T's fields
  authored: Map<string, string>; // E nodes the "user/LLM" filled (path → content)
  inSync: boolean; // does check expect to pass?
}
// The real system: a temp workspace with T's source + E + the CLI (in-memory FS, seeded).
interface Real {
  workspace: Workspace;
}

class AddFieldToType implements fc.Command<Model, Real> {
  constructor(
    readonly name: string,
    readonly type: string
  ) {}
  check = (m: Model) => !m.fields.has(this.name);
  run(m: Model, r: Real) {
    r.workspace.editType(add(this.name, this.type));
    m.fields.set(this.name, {type: this.type});
    m.inSync = false; // T moved, E stale
  }
}

class RunUpdate implements fc.Command<Model, Real> {
  check = () => true;
  run(m: Model, r: Real) {
    const before = r.workspace.authoredContent();
    const diff = r.workspace.run('gen', '--update'); // the SUT
    r.workspace.run('gen', '--prune');
    // R2 metamorphic: the diff touches ONLY nodes for changed fields.
    expectDiffLocalTo(diff, changedFieldsSince(m));
    // R3 preservation: unrelated authored content is byte-identical.
    expect(r.workspace.authoredContentFor(unrelated(m))).toEqual(before.forUnrelated);
    // R6 convergence: now check passes.
    expect(r.workspace.run('check').ok).toBe(true);
    m.inSync = true;
  }
}

class InjectForbiddenComptimeArg implements fc.Command<Model, Real> {
  // user/LLM puts a non-literal (fn call, ternary, spread, computed key, `${}`)
  // into an inline `$errors` function — the comptime-args literal slot.
  check = () => true;
  run(_m: Model, r: Real) {
    r.workspace.editEnrichment(injectForbiddenConstructIntoErrorsFn());
    const diags = r.workspace.run('check').diagnostics;
    // R5: a SPECIFIC code fires — never a crash, never silent.
    expect(diags.some((d) => d.code === 'CTA003' || d.code === 'CTA001')).toBe(true);
  }
}

class InjectUnrelatedField implements fc.Command<Model, Real> {
  check = () => true;
  run(_m: Model, r: Real) {
    r.workspace.editEnrichment(addKey('totallyUnrelated', {pool: []}));
    const diags = r.workspace.run('check').diagnostics;
    expect(diags.some((d) => d.code === 'FT002' || d.code === 'MD001')).toBe(true); // R5
  }
}

class RunCheckVsUpdate implements fc.Command<Model, Real> {
  check = () => true;
  run(_m: Model, r: Real) {
    const checkSaysInSync = r.workspace.run('check').ok; // R4 differential
    const updateChangedNothing = r.workspace.run('gen', '--update').isEmpty;
    expect(checkSaysInSync).toBe(updateChangedNothing);
  }
}

test('enrichment sync stays consistent under any edit sequence', () => {
  const cmds = fc.commands(
    [
      fc.tuple(fc.string(), fc.constantFrom('string', 'number', 'User')).map(([n, t]) => new AddFieldToType(n, t)),
      fc.constant(new RunUpdate()),
      fc.constant(new InjectForbiddenComptimeArg()),
      fc.constant(new InjectUnrelatedField()),
      fc.constant(new RunCheckVsUpdate()),
      /* RemoveField, RenameField, RetypeField, FillTodo, RunPrune, OrphanRoundTrip(R7), … */
    ],
    {maxCommands: 40}
  );
  fc.assert(
    fc.property(cmds, (run) => {
      fc.modelRun(() => ({model: freshModel(), real: freshWorkspace()}), run);
    }),
    {numRuns: 300}
  );
  // every failure prints the seed + the shrunk minimal event sequence that broke a rule.
});
```

### 6.6 What this buys us

A failing run won't say "something's off." It will say: _"seed 0xC0FFEE: after
`addField('x') → gen --update → renameField('y','z') → gen --update`, node `z`'s
authored label was lost (R3)"_ — already shrunk to the minimal sequence. That is
the difference between fuzzing the pipeline and hoping.

### 6.7 First run — what we learned (we were the first testers)

Implemented in [`packages/ts-runtypes/test/fuzz/enrich/`](../../../packages/ts-runtypes/test/fuzz/enrich/):
`enrichCli.ts` (non-throwing CLI wrappers), `enrichModel.ts` (the model + the
event/oracle command set), `enrichFuzzRunner.ts` (seeded driver + prefix
shrinker), `enrichFuzz.integration.test.ts` (the spec). Built in the repo's own
**dependency-free** seeded-harness style (reusing `test/fuzz/seededRng.ts`), not
fast-check (not a dependency here) — the `fc.commands` sketch in §6.5 is
illustrative of the shape. Run it: `pnpm run fuzz:enrich` (soak:
`pnpm run fuzz:enrich:soak`).

**Result: green** across thousands of CLI invocations (30 sequences × 14 events,
and 40 × 16) — every oracle R1–R10 held, zero false positives. A deliberate
**negative control** (assert a bogus code) confirmed the negative-space probes
truly execute and the harness reports + shrinks:

```
[R5] unknownMockField (step 0): expected MD999; check returned [MD001]
Minimal reproducer — seed 0xe6650f23, 1 event
```

Two things the framework surfaced **only because we ran it** — both about
Methodology A's step A4 (_the observation channel decides which oracles you can
express_):

1. **`check` is the wrong instrument for the comptime-args case.** The precise
   answer to _"a non-literal node inside a comptime-args `$errors` function → then
   what?"_: it is policed at **build/transform time** as **CTA001/002/003**, NOT by
   `check` — `check` deliberately treats a function-form `$errors` as opaque and
   walks past it ([`internal/enrich/validate.go`](../../../internal/enrich/validate.go)).
   **MD003** (pool value vs field type) is build-time too. So a _check-driven_
   fuzzer expresses R5 for **FT002 / FT005 / MD001** (unknown field, bad
   placeholder, unknown mock field) but **cannot** see CTA/MD003 — those need a
   second, build-driven harness. _The channel you observe through bounds your
   oracle set._
2. **`check` silently returns zero findings when the type can't resolve.** A
   mirror whose `ts-runtypes` import doesn't resolve (e.g. a fixture placed
   _outside_ the workspace) makes the validator walk nothing and report clean —
   so a mislocated harness makes every negative-space oracle **vacuously pass**.
   That is the §B5 "the generator must reach the space the rule talks about" trap,
   one level up; the negative control above is how we caught it.

Both are folded back into the implementation and this doc — which is the point of
being the first tester.

---

## §7. Turning this into a skill

The methodology is deliberately a fixed sequence of steps with worksheet outputs,
so it maps onto a `.claude/skills/fuzzy-testing/` skill:

```
.claude/skills/fuzzy-testing/
  SKILL.md         # when-to-use + the 3 methodologies as a runnable checklist
  worksheet-A.md   # Tool Discovery: the A1–A6 steps + the inventory/gap table
  worksheet-B.md   # Oracle Discovery: the B2 archetype sweep + provenance + soundness
  worksheet-C.md   # Lifting: the C1–C6 recipe to extend an example test into a fuzz test
  templates/
    oracle-layer.ts   # FuzzTarget-style skeleton (adapted from fuzzOracle.ts)
    seeded-runner.ts  # runFuzz/runForDuration skeleton (adapted from fuzzRunner.ts)
    model-based.ts    # fc.commands skeleton for stateful/event SUTs (the §6 shape)
```

**Skill procedure (what the skill tells the agent to do):**

1. **Bound the SUT** (A1) — find the smallest callable boundary; wrap side effects.
2. **Run Tool Discovery** (A2–A6) — fill the inventory/gap table; build only the gaps.
3. **Run Oracle Discovery** (B1–B6) — sweep all eight archetypes; harvest rules;
   tag provenance; pass the soundness gate; encode the oracle layer. _(If an
   example test already exists, run **Lifting** (C1–C6) instead — it yields the
   generator and the oracle straight from the test you already wrote.)_
4. **Wire the runner** — seed every iteration; collect replayable `Violation`s.
5. **Soak + pin** — run autonomously; for each finding, shrink, then commit the
   minimal reproducer as a regression test.

**Acceptance for the skill:** it produces (a) a tool inventory, (b) an oracle layer
with ≥1 strong oracle + the totality baseline, (c) a seeded runner, and (d) at
least one pinned counterexample _or_ a clean soak — for whatever SUT it's pointed
at. The enrichment pipeline (§6) is its first acceptance run.

---

## §8. One-paragraph summary

Fuzzing has five parts (generator, SUT, observation, oracle, shrink) plus a seed.
**Methodology A (Tool Discovery)** is a six-step process that inventories which
parts a system already has and which to build — its hard output is the generator
and a guarantee that any finding replays from one seed. **Methodology B (Oracle
Discovery)** is a six-step elicitation that sweeps eight rule-archetypes
(totality, round-trip, idempotence, invariant, differential, metamorphic,
preservation, negative-space) against the SUT, tags each rule's provenance, and
keeps it one-directionally sound. **Methodology C (Lifting)** is the on-ramp when
an example test already exists: keep its SUT call, turn its fixture into a
generator and its assertion into an invariant, and share one oracle layer between
the example and fuzz lanes. Applied to the **FriendlyType/MockData sync
pipeline**, these methodologies turn "keep the files consistent" into a concrete
event-stream model-based fuzzer with consistency oracles R1–R10 — implemented,
green across thousands of runs, and packaged as a reusable skill.
