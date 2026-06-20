# Step 4 — The tools you'll need

> Build what your rules need, and only that: something that makes random inputs (an
> input maker), a way to replay any run from one saved number (a seed), the loop, and a
> way to shrink a failure. This worksheet also covers Step 1 (what you're testing and
> what you can see) and Step 2 (is fuzzing worth it?), since you settle those before you
> build. Produces a short list of what you already have and what's missing. Full prose:
> [framework-fuzzy-testing.md → Step 4](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md#step-4-build-the-pieces).

## Step 1 · What are you testing? Name it and bound it.

- [ ] Pick the smallest function or pipeline you can call directly in a test. Write its
      signature.
- [ ] Does it touch the outside world (CLI, server, filesystem)? Wrap that boundary so
      you can call it like a plain function: `run(args, files) -> {stdout, exit, files,
    diagnostics}`. Keep wrapping until it's clean and you can call it a million times.
- **Write down:** `the code under test: (In) -> Out` (smaller = faster runs and a
  sharper rule).

## Step 1 · What can you actually see?

- [ ] List everything you can watch the code do: the return value, any error it throws
      (and the error's type), stdout / exit code, files it writes, a list of
      diagnostics.
- [ ] **The more you can see, the stronger your rules can be.** See enough to tell
      "clean" apart from "never ran". Example: a validator that returns 0 findings
      _because the type failed to resolve_ looks identical to "valid"; that blind spot
      makes a reject-bad-input rule pass for the wrong reason. What you can see limits
      what you can check.
- **Write down:** the record of what each run lets you observe.

## Step 2 · Is fuzzing worth it here?

A 30-second check before you build anything. Fuzzing pays off only when all three hold:

- [ ] You can run the code over and over with different inputs (it's fast and callable
      in a loop).
- [ ] The same input always does the same thing, or you can force that (no loose
      randomness, clock, or network you can't pin down).
- [ ] You have a **cheap way to tell right from wrong without re-doing the code's job**.
      If the only way to know the answer is to rebuild what the code does, fuzzing
      won't help.

If any is false, stop here — a handful of hand-written examples is the better tool.

## Step 4 · Pick the input maker (the most important decision)

Ask: **how is a _valid_ input described?** That answer picks your approach.

| Valid inputs are described by…               | Input maker                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| a schema / type the program reads at runtime | **DERIVE** inputs from it (reflection): `createMockType<T>()`, zod-fast-check |
| only a written-down TS type                  | reflect it, or hand-write a small maker (`fc.Arbitrary<T>` / typia)           |
| raw text / bytes                             | **MUTATE** real samples — splice junk into known-good inputs                  |
| a SEQUENCE of operations (code with memory)  | make a random LIST of actions + a small model of the state                    |
| two coupled things that EVOLVE via edits     | make a random list of EDIT events + a small model (build it)                  |

- [ ] Does the input maker already exist? This repo has: `createMockType<T>()` (a valid
      value), `mutateToInvalid(schema, valid)` (one spot that is provably wrong),
      `randomJunk(depth)` (type-blind junk).
- **Write down:** the input maker(s) you need, and whether each already exists.

## Step 4 · A replay button (the seed)

- [ ] List **every** source of randomness the code or input maker touches: the random
      number generator, `Date.now()`, the filesystem, network, hash seeds, `Object` key
      order, `Set` / `Map` iteration order.
- [ ] Make each one replayable from a single saved number (a seed). Repo trick:
      `withSeededRandom(seed, fn)` swaps `Math.random` for a seeded generator for one
      run, then restores it; `mixSeed(base, label, i)` makes a fresh seed per run.
- **Write down:** every run reproducible from a single integer.

## Step 4 · Shrinking a failure

- [ ] Decide how you'll cut a failing input down to its smallest form. fast-check does
      this automatically. By hand, the options are: **smallest-prefix** (the fewest
      first-K actions that still fail — what the enrich fuzzer uses), **drop-subsets**
      (remove chunks and see if it still fails), **simplify-the-value** (shrink the
      input itself).
- [ ] Always keep the **seed** alongside the shrunk reproducer.

## The list: what you have, what's missing (the deliverable)

| Part             | Tool (existing or to build) | Exists? | Missing |
| ---------------- | --------------------------- | ------- | ------- |
| input maker      |                             |         |         |
| seed / replay    |                             |         |         |
| what you can see |                             |         |         |
| shrinking        |                             |         |         |

Build only what's **missing**. You should already have your rules from [the rules
worksheet (worksheet-B.md)](worksheet-B.md) — or come from [grow an existing test
(worksheet-C.md)](worksheet-C.md) if an example test already exists.
