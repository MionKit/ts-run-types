# AI enrichment — generation test plan (source-extraction)

> **Status: plan.** Tests the `gen` output across (almost) every type kind by
> **reusing the validation suite's type ranges** but a different mechanism: extract
> the authored TS from each case, send the type to the CLI, and compare the
> generated `.rt.ts` text against the **expected TS authored in the case** (itself a
> type-checked `FriendlyType<T>` / `MockData<T>`). Companion to
> [AI_ENRICHMENT.md](./AI_ENRICHMENT.md) + [AI_ENRICHMENT_PLAN.md](./AI_ENRICHMENT_PLAN.md).

## Why not the validation-suite shape

The validation/serialization/format suites drive the binary through **marker call
sites** scanned by the Vite plugin. Enrichment `gen` is **CLI-driven** (our decided
architecture) and works on **TS source in → TS source out**. So the tests can't be
mechanically identical. What we keep is the **case coverage** — the same per-category
type ranges (Atomic, Array, Object, Tuple, Union, Native, TemplateLiteral, Format,
Utility, Circular, Realworld) — guaranteeing the generator is exercised on every kind.

## Mechanism — extract → generate → compare TS

The case author writes **real, type-checked TypeScript**: the input type and the
expected `FriendlyType<T>` / `MockData<T>` skeletons. The harness extracts that source
(reusing `cmd/extract-fn-bodies`), feeds the type to the CLI, and compares.

```ts
// test/suites/enrichment-gen/Atomic.ts  (real TS — tsc validates every case)
export const ATOMIC = {
  stringFormat: {
    title: 'String with min/max length format',
    // ONE self-enclosing function: the type + both expecteds, type-checked together.
    case: () => {
      type Target = TF.String<{minLength: 2; maxLength: 60}>;
      const friendly: FriendlyType<Target> = {$label: '', $errors: {type: '', maxLength: '', minLength: ''}};
      const mock: MockData<Target> = {pool: []};
      return {friendly, mock};
    },
  },
  // …
} satisfies Record<string, EnrichmentCase>;
```

Per category file the harness (in a `beforeAll`):

1. **Extract** every case's `case` arrow-function body via `cmd/extract-fn-bodies`
   (already returns the verbatim, dedented body text). From each body, pull the three
   spans: `type Target = …;`, the `friendly` initializer, the `mock` initializer (a
   small regex/AST sub-parse — the bodies are uniform by construction).
2. **Synthesize** a temp `.ts`: the suite file's import block + one
   `export type Case_<key> = <Target source>;` per case.
3. **Generate** in ONE CLI call: `ts-runtypes gen <temp> --types Case_a,Case_b,… --stdout --json`
   → `{ "Case_a": { "friendly": "<obj-literal text>", "mock": "<obj-literal text>" }, … }`.
4. **Compare** generated vs the extracted expected for each case, after **normalizing
   both** (parse to an AST and re-print, or run each through Prettier wrapped as
   `const _ = <expr>`) so whitespace/quote style never causes a false diff.

Because the expected is authored as `const friendly: FriendlyType<Target> = …`, **tsc
proves the expected is a well-formed `FriendlyType<T>`** — a case can't encode an
invalid expectation. The input type is real too, so cases can't drift into invalid TS.

## Decisions (recommended — confirm)

- **D1 — Compare TS source, normalized** (not a structured shape). The expected is
  real type-checked TS extracted from the case; the generated is the CLI's `.rt.ts`
  text; both are AST-/Prettier-normalized before `===`. *(Supersedes the earlier
  structured-shape idea — no `emit.go` shape-tree refactor needed; `gen` already emits
  text.)*
- **D2 — One self-enclosing `case()` function per type**, declaring `type Target` +
  `const friendly`/`const mock`, returned. Co-locates the type with its expecteds,
  type-checks them together, avoids module-scope name pollution, and is uniform to
  sub-parse. *(Alternative: module-scope `type Case_X` + extracted `friendly`/`mock`
  thunks — skips synthesis but pollutes the namespace. Recommend self-enclosing.)*
- **D3 — Reuse the validation type ranges**, re-declared in the enrichment cases
  (independent + readable). *(Alternative: extract the inline `T` from the validation
  suite's `createValidate<T>()` thunks and gen those directly — DRYer but couples the
  two suites. Recommend re-declare.)*
- **D4 — Batch per file** (one CLI call per category file, all its types) — not one
  spawn per case.

## New binary capability

Extend `gen` with a **batch, stdout, JSON** mode (no file writes, no shape tree — it
returns the same `.rt.ts` object-literal text it would write):

```
ts-runtypes gen <file.ts> --types A,B,C --stdout --json
→ { "A": { "friendly": "{…}", "mock": "{…}" }, "B": { … } }
```

- Returns just the object-literal skeleton per type (the value, not the
  `export const … =` wrapper) so comparison is against the case's initializer.
- Lives in `internal/enrichment` + `cmd/ts-runtypes/enrichment_cli.go`; the existing
  file-writing `gen` is untouched (this adds `--stdout`/`--json`/`--types`).

## Suite structure

```
packages/ts-runtypes/test/suites/enrichment-gen/
  types.ts            # EnrichmentCase = { title; description?; case: () => {friendly; mock} }
  Atomic.ts Array.ts Object.ts Tuple.ts Union.ts Native.ts
  TemplateLiteral.ts Format.ts Utility.ts Circular.ts Realworld.ts   # the sections
  index.ts            # `as const satisfies Record<string, Record<string, EnrichmentCase>>` (drift guard)
  enrichmentGen.test.ts   # adapter: beforeAll extract+generate per file, then it()s compare
test/util/enrichmentGen.ts  # extract (extract-fn-bodies) + synthesize temp + spawn gen + normalize
```

- **`EnrichmentCase`** is tiny: a `title` and a `case()` function. The `case` body is
  never executed for its return value — it exists to (a) type-check the expecteds and
  (b) be source-extracted. (`TypeFriendlyCase` / `MockDataCase` survive as the *types*
  of `friendly` / `mock` inside `case`, i.e. `FriendlyType<T>` / `MockData<T>`.)
- **Drift guard:** `index.ts` `as const satisfies` (compile-time), exactly like
  `validation/index.ts`; the adapter also asserts every case's type was generated
  (a typo'd case yields no CLI output → red).
- **Adapter:** per category, `beforeAll` runs the extract+synthesize+generate pipeline
  once; each `it('<title> — friendly' | '— mock')` compares normalized strings.

## Tasks

- [ ] **B1** — `gen --types … --stdout --json` batch mode (returns object-literal text
  per type) + a Go test (hermetic, assert JSON for 1–2 types).
- [ ] **T1** — `test/util/enrichmentGen.ts`: invoke `extract-fn-bodies` (or reuse
  `scripts/export-validation-suite.mjs`'s spawn), sub-parse the case body into
  `{type, friendly, mock}`, synthesize the temp file, spawn `gen`, AST/Prettier-normalize,
  return a `{caseKey → {friendly, mock}}` lookup of generated + expected.
- [ ] **T2** — `types.ts` (`EnrichmentCase`, the `case()` contract).
- [ ] **T3** — the category files, porting the validation suite's type ranges.
- [ ] **T4** — `index.ts` (`as const satisfies`) + `enrichmentGen.test.ts`.
- [ ] **T5** — reconcile: keep `createFriendly.test.ts` (runtime render, separate);
  reduce Go `emit_describe_test.go` to a couple rendered-text smoke cases (this suite
  owns shape coverage).

## Normalization detail (the one fiddly bit)

Generated text (emitter style) and expected text (Prettier style in the source) will
differ in whitespace/trailing commas/quotes. Normalize **both** identically before
comparing — simplest robust option: parse each object-literal with the TS compiler API
(or Prettier `format` wrapped as `const _ = <expr> as any`) and compare the re-printed
output. This makes the comparison about **shape + keys + values**, not formatting.

## Open decisions for you

1. **D2** self-enclosing `case()` (recommended) vs module-scope named type + extracted
   `friendly`/`mock` thunks?
2. **D3** re-declare type ranges (recommended) vs reuse the validation suite's inline
   types via extraction?
3. Normalization via the **TS compiler API** vs **Prettier** (recommend TS API — no
   extra wrapping, exact AST equivalence)?
4. Suite dir `enrichment-gen/` vs fold into existing `enrichment/`?
5. Should `check` validation also get a case suite now, or stay on Go unit tests?
