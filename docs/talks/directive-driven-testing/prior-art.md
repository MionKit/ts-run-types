# Prior Art & Honesty Notes

> Who is already doing pieces of this, how close they are, and — importantly —
> **what NOT to claim on stage.** Full detail and citations in
> [`research/05-prior-art-people.md`](research/05-prior-art-people.md).

The talk's contribution is **not** "we invented deriving a generator + oracle
from one source of truth." That exists. The contribution is (1) pushing it down
to **fuzzing the type system itself**, (2) naming the **directive** as the unit
of work, and (3) framing the closed loop as the **safe reward signal for
self-improving software**. Crediting prior art is what makes the talk credible.

---

## Closeness ranking (how close to the full thesis)

`5` = one artifact already yields **both** a generator and an oracle, used in a loop.

| Project | What it does | Close |
|---|---|---|
| **Schemathesis** (Dmitry Dygalo) | OpenAPI/GraphQL schema → conforming inputs **+** conformance/5xx oracle. The closed loop over HTTP. | **5** |
| **PropEr** (Papadakis & Sagonas, Erlang, 2011) | `-type` → generators, `-spec` → checkable properties. The thesis, in 2011, scoped to Erlang. | **5** |
| **typia** (samchon, TypeScript) | One bare TS type → `validate<T>()` (oracle) **and** `random<T>()` (generator), via a transformer. Closest in TS. | **5** (engine) |
| **nestia** simulate / e2e (samchon) | Wires typia's two halves into a generate-then-validate loop in production. | **5** (loop) |
| **Antithesis** (Will Wilson, ex-FoundationDB) | Deterministic simulation "autonomous testing": explore + fault-inject (generator), user properties (oracle), deterministic replay. | **4** |
| **Jepsen** (Kyle Kingsbury / aphyr) | generator → nemesis → history → consistency-model checker (Knossos/Elle). Generative testing with a real oracle, as a service. | **4** |
| **Hypothesis** `from_type` / `hypothesis-jsonschema` (MacIver) | strategies inferred from type hints / JSON Schema; property still user-written. | **4** |
| **zod-fast-check / fast-check-io-ts** | derive fast-check arbitraries from a Zod/io-ts schema. The generator half, bolted onto a validator. | **4** |
| **@sinclair/typebox** + `Value` | one schema → `Value.Create` + `Value.Check`; `Create` is seed-oriented, not adversarial. | **3.5** |
| **generic-random** (Haskell) | derives `Arbitrary` structurally from a type; no oracle. | **3** |
| **Diffblue / Qodo Cover** | auto-generate tests, but the oracle is **characterization** (bakes current behavior). Good *foil*. | **2** |

**Lineage arc for the talk:** type-*indexed* generators (QuickCheck) →
*structurally derived* generators (generic-random) → type/spec → generator **and**
oracle (PropEr, 2011) → schema → generator **and** conformance oracle
(Schemathesis). RunTypes' novelty: do it over a **general language's structural
reflection**, fuzz the **types themselves**, and aim the loop at **LLM
self-improvement**.

---

## What NOT to claim (verify before stage)

- ❌ **"typia fuzzes."** typia ships the two halves; the *loop* is assembled in
  **nestia**. Say: *"typia gives you both halves from one type; nestia closes the
  loop."*
- ❌ **"We're the first to derive a generator and oracle from types."** PropEr
  (2011) and Schemathesis predate this. Say: *"proven recipe, under-applied to
  the TS type system."*
- ❌ **"Antithesis/Jepsen derive the oracle from types."** Their oracle is
  **user-supplied** (properties / consistency models). They're the closest
  *commercial generative-testing* analogs, not reflection-derived-oracle
  instances.
- ⚠️ **Most TS validators ship no native generator** (Zod, Valibot, ArkType) —
  the ecosystem bolts it on. This is a *supporting* point (demand is real, recipe
  mostly unrealized in mainstream TS), so state it as such.
- ⚠️ **Frame John Hughes's Erlang bugs** as in Erlang *systems/apps* (Klarna's
  `dets`/`mnesia`), not "the Erlang VM/language."
- ⚠️ **Severity caveats:** OSS-Fuzz-Gen's CVE-2024-9143 severity was contested
  (OpenSSL rated it "low"); report the "~20 years old, missed by hand-written
  harnesses" angle, which is the real point.

---

## People to cite (one line each)

- **John Hughes** — co-created QuickCheck (ICFP 2000); QuviQ; turned 3000+ pages
  of AUTOSAR spec into models and raised 200+ issues for Volvo. Talk: *"Testing
  the Hard Stuff and Staying Sane."*
- **David MacIver** — created **Hypothesis**; deepest writing on shrinking; **now
  at Antithesis** (nice bridge from PBT to deterministic-simulation testing).
- **Nicolas Dubien (dubzzz)** — created **fast-check**, the JS/TS PBT engine the
  ecosystem plugs adapters into.
- **samchon (Jeongho Nam)** — **typia / nestia**; the closest existing instance of
  the thesis in TypeScript.
- **Scott Wlaschin** — *"Choosing properties for property-based testing"*; the
  canonical guide to the hard part (inventing the oracle).
- **Hillel Wayne** — the practitioner bridge between PBT, **metamorphic testing**,
  and formal methods (site: hillelwayne.com).
- **Andreas Zeller** — *The Fuzzing Book*; Delta Debugging (minimization).
- **Marcel Böhme** — put coverage-guided greybox fuzzing on a statistical footing
  (AFLFast, Entropic); at **MPI-SP**.
- **Kyle Kingsbury ("aphyr")** — **Jepsen**; generator + consistency-model oracle
  finds correctness bugs in real distributed systems.
- **Dmitry Vyukov** — **syzkaller**; syscall *descriptions* as the "type model"
  that auto-derives effective generators at scale.
