# Step 3 — What should always be true? (the rules)

> This is the heart of the work. List the rules that must hold for EVERY input, run
> down the checklist of common rule shapes, and note where each rule came from. A rule
> that's always true is what you check against (the jargon word is an _oracle_). Full
> prose: [framework-fuzzy-testing.md → Step 3](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md#step-3-what-should-always-be-true).

## First, list what the code promises

- [ ] In plain English, write down what the code guarantees. Examples: "if you decode
      what you encoded, you get the value back"; "an unknown field is rejected". Each
      promise is a candidate rule.

## Run down the rule-shape checklist (the heart)

Ask each question against your code. Keep every shape that fits. Most code matches
three to five of these.

| #   | Rule shape                  | Ask…                                                             | Example                                               |
| --- | --------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| ①   | never crashes               | never crashes or hangs; only _controlled_ outcomes?              | `decode(junk)` throws `DecodeError`, not `RangeError` |
| ②   | do it then undo it          | does undoing it give back what you started with?                 | `encode(decode(w)) === w`                             |
| ③   | doing it twice              | does a second pass change nothing? `f(f(x)) === f(x)`?           | a second `--update` is byte-identical                 |
| ④   | a fact always holds         | is some fact about the output always true?                       | output re-validates; a length or bound holds          |
| ⑤   | compare to a trusted source | does it match a second, trusted way to get the answer?           | vs `JSON.parse`, vs the previous implementation       |
| ⑥   | predicted change            | does a known input change cause the output change you predicted? | add a field ⇒ exactly that node appears               |
| ⑦   | leave the rest alone        | does an unrelated change leave everything else untouched?        | an authored value survives an unrelated edit          |
| ⑧   | reject bad input            | is a _bad_ input always reported, never quietly accepted?        | unknown field ⇒ a specific diagnostic (MD001/FT002)   |

- **Write down:** one row per shape that fits = your candidate rules.

## Note where each rule came from

- [ ] Tag each candidate: from a **spec**, a **code comment**, a **past bug**, or
      **guessed**. Drop any rule you can't ground in one of those. An invented rule is
      the main cause of false alarms.

## ⚠️ The iron rule — a red test always means a real bug (read twice)

- [ ] For each rule: when it goes red, there must be a REAL bug, every time. A rule
      that misses a bug only costs you coverage. A rule that goes red when nothing is
      wrong (a false alarm) destroys trust in the whole suite.
- [ ] **Break it on purpose (negative control):** deliberately break the expected
      output and confirm the rule goes red _with the right signal_. A rule you've never
      watched fail is not yet trustworthy. (Enrich fuzzer: we asserted a bogus code
      `MD999`, watched it fail and shrink to one event — proof the check was live, not
      passing for the wrong reason.)

## Prefer strong rules, and make sure inputs reach the case

- [ ] Prefer **strong** rules (do-it-then-undo-it, compare-to-a-trusted-source,
      predicted-change) over the **weak** one ("doesn't crash"). Always keep the
      doesn't-crash rule (①) as the floor.
- [ ] Confirm your input maker **actually reaches the situation the rule talks about**.
      The reject-bad-input rule (⑧) needs _invalid_ inputs (`mutateToInvalid`); a rule
      about cycles needs an input maker that builds cycles. A rule over inputs your
      maker never produces passes for the wrong reason, and tells you nothing.

## Gather the rules in one place (the deliverable)

- [ ] Write one `check*(target, value, ctx) -> Violation | null` per rule — see
      [`templates/oracle-layer.ts`](templates/oracle-layer.ts). Collect them behind one
      typed `FuzzTarget` (the handshake between your input maker and your rules).
- [ ] **Share one set of rule-checks** between your example tests and your fuzz tests —
      the same assertion helper, called once with hand-written data (example) and once
      with generated data (fuzz), so the two can never drift apart. (In this repo the
      `test/util/*Asserts.ts` files are that shared layer; the fuzz checks currently
      _mirror_ them — sharing is the cleaner end state.)
