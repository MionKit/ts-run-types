# Document every place we use fuzzy testing on the website

**Status:** idea, not started. Captured as a scoping note for a future session;
no design committed, no code touched.

The idea: add a website docs page (under
[container-website/content/](../../container-website/content/)) that explains
**how RunTypes uses fuzzy / property testing**, **every place it's applied**
in the repo, **why it's worth doing in each place**, and **concrete examples
of bugs the fuzzers caught** (or would have caught) that a hand-written unit
test missed.

## Agent: discover the places yourself

This todo deliberately does NOT enumerate the call sites. We are adding more
fuzzy tests in the near future and we want the implementing agent to
re-discover them at the time the page is written, so the doc reflects the
actual state of the repo on the day it ships, not a list that went stale
between todo and implementation.

When picking this up:

1. Search the whole repo (Go under [internal/](../../internal/) +
   [cmd/](../../cmd/), JS under [packages/](../../packages/)) for
   fuzz harnesses, property-style tests, randomized-input loops, and
   `testing/quick`-style oracles. Look at both committed fuzzers AND
   in-progress ones from open todos (e.g.
   [fuzzy-testing-for-golang-reconciliation.md](fuzzy-testing-for-golang-reconciliation.md)).
2. For each place: figure out **what invariant it pins**, **what mutation
   grammar it walks**, and **what kinds of bugs it would catch** — read the
   surrounding code, do not guess.
3. Where possible, pull a real example from `git log` or a fixed-bug
   regression test: "this fuzzer found / would have found X" with a link to
   the commit or issue. Concrete > abstract.

## What the page should cover

- **Why we fuzz.** One-paragraph rationale: compiler-driven code generation
  has a huge surface of mid-edit / partial / adversarial inputs that unit
  tests can not enumerate; fuzzers catch the unknown-unknowns.
- **How we fuzz.** The repo's house style — small, high-fidelity mutators
  (not generic AST scramblers), deterministic seeds, shrinking, in-process
  Go property tests as the cheap CI tier, end-to-end simulations for
  race / HMR-style coverage. Mention `testing/quick` if that's still what
  we use.
- **Where we fuzz.** One section per discovered location, with: file path,
  the invariants it pins, the mutation grammar, and an example bug.
- **Benefits we have actually seen.** Bugs caught, regressions prevented,
  contracts hardened. If a fuzzer turned up a design problem (e.g. forced
  us to add atomic file writes, or pinned a parse-failure policy), say so.
- **How to add a new fuzzer.** Short checklist: pick the invariant, write
  the mutator, seed the RNG, wire it into CI. Point at the closest existing
  fuzzer as a template.

## Style

Follow the website voice rules in
[CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container-websitecontent):
plain user-focused language, no em-dashes chaining clauses, short
frontmatter description, fenced code blocks over inline backticks for
anything more than a name. The reader is a RunTypes user who wants to trust
the tool, not a contributor reading internals.

## Not in scope here

- Writing new fuzzers. The page documents what exists when it is written;
  any "we should also fuzz X" findings become their own todos.
- A generic "how to write a property test in Go" tutorial. Link out to
  `testing/quick` docs instead of re-explaining them.
