# Grow an existing test into a fuzz test

> The shortcut: take an example/unit test you already have and grow it into a fuzz
> test, and **keep both**. An example test has already paid the three hardest costs — a
> valid input, a working way to call the code, and a true check. A fuzz test is what
> you get by letting each of those vary. Full prose: [framework-fuzzy-testing.md → grow an existing test](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md#already-have-a-normal-test-grow-it).

## Map the example's three parts onto the fuzz parts

A normal test is set-up, call, check (Arrange, Act, Assert). Each part maps straight
across:

| Example test                          | → fuzz part         | the edit                                                |
| ------------------------------------- | ------------------- | ------------------------------------------------------- |
| **Set up** a literal input / fixture  | input maker         | vary the thing the author froze arbitrarily             |
| **Call** the code                     | the code under test | **keep it as is** — it already works                    |
| **Check** `expect(out).toBe(literal)` | a rule              | turn the constant into a rule that holds for all inputs |

Two of the three are free. Only the check needs real thought (see below).

## Read your inputs off the set-up

- [ ] Don't invent an input space — **widen** the one the example already uses. Find the
      thing the author froze (a value, a length, a field set, an order) and let it vary.
- [ ] A hardcoded **`valid[]` + `invalid[]`** split literally names your **two input
      makers**: `createMockType<T>()` for the valid side, `mutateToInvalid(schema,
  mock)` for the invalid side.
- [ ] A **table-driven** test: each row is a hand-found example; the row dimension is
      your input maker.

## Turn the check from a constant into a rule (the only hard part)

| The example checks…                                       | Grow it into…                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| a **relation** already (do-it-then-undo-it / do-it-twice) | the same relation over an input maker — _trivial_ (swap the literal for `createMockType<T>()`) |
| **true/false** on a hand-picked good/bad value            | two input makers + the rule that ties the code's outputs together                              |
| a **constant you can recompute** (`toBe(5)`)              | compare against a trusted source, or the predicted-change relation it's an instance of         |
| a **hardcoded "this once broke"** case                    | make random inputs **around** that hazard                                                      |

- [ ] Run the grown rule through the **iron rule** (break the output on purpose and
      watch it go red). A constant generalised lazily will throw false alarms.

## Share the rule-checks

- [ ] Pull the example's check into a helper that **both the example and the fuzz test
      call** — don't copy it into the fuzz runner (copies drift apart). See [the rules
      worksheet (worksheet-B.md)](worksheet-B.md).

## Keep the example — it's your fast reproducer and your floor

- [ ] The example stays: fastest reproducer, executable intent, a 1 ms smoke test
      beside a long run. If a fuzz failure shrinks to something **simpler** than your
      example, promote that smallest case to a **new example test** — the two feed each
      other.

## Know when NOT to bother

- [ ] **Pure one-answer transforms** (deterministic `transform(input) === expected`, no
      error path): there's nothing to sweep — the examples are enough.
- [ ] **Inputs your maker can't reach yet** (a cyclic value the default maker never
      produces): fix the input maker first, or the fuzz never contains the case and the
      rule passes for the wrong reason.

The test: _is there a thing worth varying, and a rule that stays true as it varies?_
Yes → grow it. No → the example already is the right tool.
