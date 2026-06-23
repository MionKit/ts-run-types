# Worksheet A — Tool Discovery

> Produce a **tool inventory** (what produces inputs, what makes runs replayable, what
> you observe, what minimises a failure) + a **gap list** of what to build. Six steps,
> top to bottom. Full prose: [framework-fuzzy-testing.md → Methodology A](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md).

## A1 · Bound the SUT

- [ ] Pick the smallest function/pipeline callable in-process. Write its signature.
- [ ] Side-effecting (CLI / server / filesystem)? Wrap the boundary:
      `run(args, files) -> {stdout, exit, files, diagnostics}`. Keep wrapping until
      it is pure-ish and callable a million times.
- **Output:** `SUT: (In) -> Out` (smaller = faster iterations + sharper oracle).

## A2 · Pick the GENERATOR (the most important decision)

Ask: **how is a _valid_ input described?**

| Valid inputs are described by…              | Generator tool                                                    |
| ------------------------------------------- | ----------------------------------------------------------------- |
| a runtime schema / reflected type           | **DERIVE** it (reflection): `createMockType<T>()`, zod-fast-check |
| only a static TS type                       | reflect it, or hand-write `fc.Arbitrary<T>` / typia               |
| unstructured bytes / strings                | **MUTATE** a seed corpus (splice junk into real samples)          |
| a SEQUENCE of operations (stateful)         | a **command/model** generator + a state model                     |
| two coupled artifacts that EVOLVE via edits | an **EVENT** generator + a state model (build it)                 |

- [ ] Does the generator already exist? This repo: `createMockType<T>()` (valid value),
      `mutateToInvalid(schema, valid)` (one provably-invalid spot), `randomJunk(depth)`
      (type-blind junk).
- **Output:** the generator(s) you need + whether each exists.

## A3 · Determinism (replay)

- [ ] List **every** entropy source the SUT/generator touches: RNG, `Date.now()`, fs,
      network, hash seeds, `Object` key order, `Set`/`Map` iteration.
- [ ] Make each replayable from one seed. Repo trick: `withSeededRandom(seed, fn)`
      swaps `Math.random` for a seeded PRNG for one iteration, then restores it;
      `mixSeed(base, label, i)` derives a per-iteration seed.
- **Output:** every run reproducible from a single integer.

## A4 · Observation surface

- [ ] Enumerate what you can see: return value, thrown error (and its type), stdout /
      exit code, emitted files, diagnostics list.
- [ ] **Richer observation ⇒ stronger oracle.** Observe enough to distinguish "clean"
      from "did not run" — e.g. a validator that returns 0 findings _when the type
      failed to resolve_ looks identical to "valid"; that gap makes negative-space
      oracles vacuous. The channel you observe through **bounds your oracle set**.
- **Output:** the observation record each run yields.

## A5 · Shrink

- [ ] Decide minimisation. fast-check shrinks automatically. Hand-rolled options:
      **prefix-shrink** (smallest K events that still fail — what the enrich fuzzer
      uses), **delta-debug** (drop subsets), **value-shrink** (simplify the input).
- [ ] Always keep the **seed** with the shrunk reproducer.

## A6 · Inventory + gap table (the deliverable)

| Part             | Tool (existing or to build) | Exists? | Gap |
| ---------------- | --------------------------- | ------- | --- |
| generator        |                             |         |     |
| seed/determinism |                             |         |     |
| observation      |                             |         |     |
| shrink           |                             |         |     |

Build only the **gaps**. Then go to worksheet-B (oracles) — or worksheet-C if an
example test already exists.
