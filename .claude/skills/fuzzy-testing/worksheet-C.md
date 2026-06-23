# Worksheet C — Lifting an example test into a fuzz test

> The on-ramp: **extend** an example/unit test you already have into a fuzz test, and
> **keep both**. An example test has already paid the three hardest costs — a valid
> input, a working SUT boundary, a true assertion. A fuzz test is what you get by
> letting each of those vary. Full prose: [framework-fuzzy-testing.md → Methodology C](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md).

## C1 · Map Arrange-Act-Assert → fuzz parts

| Example test (AAA)                     | → fuzz part       | the edit                                    |
| -------------------------------------- | ----------------- | ------------------------------------------- |
| **Arrange** a literal input / fixture  | generator (A2)    | vary the axis the author froze arbitrarily  |
| **Act**: call the SUT                  | SUT boundary (A1) | **keep verbatim** — it already works        |
| **Assert** `expect(out).toBe(literal)` | oracle (B)        | generalise the constant to an **invariant** |

Two of three are free; only the Assert needs real thought (C3).

## C2 · Read the inputs you need off the Arrange

- [ ] Don't invent an input space — **widen** the one the example uses. Find the frozen
      axis (value, length, field set, order) and let it vary.
- [ ] A hardcoded **`valid[]` + `invalid[]`** split literally names the **two
      generators**: `createMockType<T>()` for the valid side, `mutateToInvalid(schema,
    mock)` for the invalid side.
- [ ] A **table-driven** test: each row is a hand-found seed; the row dimension is your
      generator.

## C3 · Lift the assertion — constant → invariant (the only hard part)

| The example asserts…                            | Lift it to…                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| a **relation** already (round-trip/idempotence) | the same relation over a generator — _trivial_ (swap the literal for `createMockType<T>()`) |
| **true/false** on a hand-picked good/bad value  | two generators + the **consistency invariant** that ties the SUT's outputs together         |
| a **constant you can recompute** (`toBe(5)`)    | a **reference oracle** (differential) or the metamorphic relation it instances              |
| a **hardcoded regression** ("this once broke")  | **fuzz the neighbourhood** of that hazard                                                   |

- [ ] Run the lifted oracle through **B4 soundness** — a constant lazily generalised
      will false-positive.

## C4 · Share the oracle layer

- [ ] Factor the example's assertion into a helper **both lanes call** — don't copy it
      into the fuzz runner (copies drift). See worksheet-B §B6.

## C5 · Keep the example — regression pin + shrink floor

- [ ] The example stays: fastest reproducer, executable intent, 1 ms smoke beside a
      soak. If a fuzz failure shrinks to something **simpler** than your example,
      promote that minimal case to a **new example test** — the lanes feed each other.

## C6 · Know when NOT to lift

- [ ] **Pure, total transforms** (deterministic `transform(input) === expected`, no
      error path): nothing to sweep — the examples suffice.
- [ ] **Inputs the generator can't reach** (e.g. a cyclic value the default generator
      never produces): fix the generator first, or the fuzz space never contains the
      case (B5 coverage trap).

The test: _is there an axis worth sweeping, and a relation that stays true across it?_
Yes → lift (C1–C5). No → the example already is the right tool.
