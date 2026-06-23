# Worksheet B — Oracle Discovery

> Produce a **typed oracle layer**: a set of always-true rules, each one sound. Full
> prose: [framework-fuzzy-testing.md → Methodology B](../../../docs/talks/directive-driven-testing/framework-fuzzy-testing.md).

## B1 · Write the SUT's promises

- [ ] In plain English, list what the SUT guarantees ("decoding the encoding gives
      back the value"; "an unknown field is rejected"). Each promise is a candidate
      oracle.

## B2 · The archetype sweep (the heart)

Ask each question against your SUT; keep every one that applies. (Most SUTs satisfy 3–5.)

| #   | Archetype      | Ask…                                                | Example                                               |
| --- | -------------- | --------------------------------------------------- | ----------------------------------------------------- |
| ①   | totality       | never crashes/hangs; only _controlled_ outcomes?    | `decode(junk)` throws `DecodeError`, not `RangeError` |
| ②   | round-trip     | an inverse pair composes to identity?               | `encode(decode(w)) === w`                             |
| ③   | idempotence    | `f(f(x)) === f(x)`?                                 | a second `--update` is byte-identical                 |
| ④   | invariant      | some property always holds of the output?           | output re-validates; a length/bound holds             |
| ⑤   | differential   | matches an independent reference oracle?            | vs `JSON.parse`, vs the previous implementation       |
| ⑥   | metamorphic    | a known input change ⇒ a predictable output change? | add a field ⇒ exactly that node appears               |
| ⑦   | preservation   | unrelated data is left untouched by an operation?   | an authored value survives an unrelated edit          |
| ⑧   | negative-space | a _bad_ input is reported, never silently accepted? | unknown field ⇒ a specific diagnostic (MD001/FT002)   |

- **Output:** one row per surviving archetype = your candidate oracles.

## B3 · Provenance — keep only grounded rules

- [ ] Tag each candidate: from a **spec** / a **code comment** / a **fixed bug** /
      **inferred**. Drop rules you cannot ground — an invented invariant is the main
      source of false positives.

## B4 · ⚠️ The soundness gate (one-directional — read twice)

- [ ] For each oracle: **predicate fires ⇒ a REAL bug**, no exceptions. A false
      negative only costs coverage; a **false positive** destroys trust in the suite.
- [ ] **Negative control:** deliberately break the expected output and confirm the
      oracle fires _with the right signal_. An oracle you have not watched fail is not
      yet trustworthy. (Enrich fuzzer: we asserted a bogus code `MD999`, watched it
      fail and shrink to one event — proof the probe was live.)

## B5 · Strength ladder + generator coverage

- [ ] Prefer **strong** oracles (round-trip, differential, metamorphic) over **weak**
      ones (no-crash). Always keep **totality ①** as the floor.
- [ ] Confirm the **generator actually reaches the space the rule talks about**:
      negative-space ⑧ needs _invalid_ inputs (`mutateToInvalid`), a cyclic-rule needs
      a cyclic generator. A rule over inputs your generator never produces passes
      vacuously.

## B6 · Encode the oracle layer (the deliverable)

- [ ] One `check*(target, value, ctx) -> Violation | null` per rule — see
      [`templates/oracle-layer.ts`](templates/oracle-layer.ts). Collect them behind one
      typed `FuzzTarget` (the contract between generator A and oracles B).
- [ ] **Share one oracle layer** between the example suite and the fuzz lane — the same
      assertion helper called with hand-data (example) and generated data (fuzz), so
      the two can never drift. (In this repo the `test/util/*Asserts.ts` files are that
      layer; the fuzz oracles currently _mirror_ them — sharing is the cleaner end state.)
