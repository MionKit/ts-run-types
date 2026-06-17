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
    // `// ##### … #####` markers delimit the spans the harness slices; the const
    // names derive from the type name (friendly<Type> / mock<Type>).
    case: () => {
      // ##### src #####
      type Target = TF.String<{minLength: 2; maxLength: 60}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $errors: {type: '', maxLength: '', minLength: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
  // …
} satisfies Record<string, EnrichmentCase>;
```

Per category file the harness (in a `beforeAll`):

1. **Extract** every case's `case` arrow-function body via `cmd/extract-fn-bodies`
   (verbatim, dedented, comments preserved), then **split by the `// ##### … #####`
   markers** into the `src` / `friendly` / `mock` spans (the `result` span is for
   runtime only — ignored by the shape comparison). A plain string split — no AST
   sub-parse needed.
2. **Synthesize** a temp `.ts`: the suite file's import block + each case's `src` span
   (the `type …` declaration) re-exported. *(Batching wrinkle — see below.)*
3. **Generate** with the CLI: `ts-runtypes gen … --stdout --json` →
   `{ "<type>": { "friendly": "<obj-literal text>", "mock": "<obj-literal text>" }, … }`.
4. **Compare** the generated object-literal against the `friendly` / `mock` span's
   initializer, **AST-normalizing both** (const name / `export` / annotation stripped —
   only the object literal compared) so whitespace/quote style never false-diffs.

**Dual-use.** The `case()` body is real, type-checked code that also *runs*: `tsc`
proves the `friendly`/`mock` expecteds are well-formed `FriendlyType<T>`/`MockData<T>`
(a case can't encode an invalid expectation), and the `result` return lets a test
optionally execute the case and exercise the runtime (`createFriendly`,
`createMockType`) on the authored values. **The primary assertion is the source
extraction + comparison**; runtime use is opt-in per case.

**Batching wrinkle (impl decision B-batch).** A uniform `Target` name collides if all
cases are synthesized into one file. Two ways out: (a) cases name the type **uniquely**
(derived from the case key) → one temp file + one batched `gen --types …` per category
(fast, recursive-safe); or (b) keep a uniform `Target` → **one temp file per case** and
gen per case, driving a **persistent binary** (`--daemon`) so there's no respawn cost.
Recommend (a) — unique names — unless the uniform `Target` reads materially better.

## Decisions (recommended — confirm)

- **D1 — Compare TS source, normalized** (not a structured shape). The expected is
  real type-checked TS extracted from the case; the generated is the CLI's `.rt.ts`
  text; both are AST-/Prettier-normalized before `===`. *(Supersedes the earlier
  structured-shape idea — no `emit.go` shape-tree refactor needed; `gen` already emits
  text.)*
- **D2 — One self-enclosing `case()` function per type — CONFIRMED.** Declares the
  type + `const friendly<Type>` / `const mock<Type>` (names derived from the type) and
  returns them. `// ##### src/friendly/mock/result #####` comment markers delimit the
  spans, so extraction is a **string split by markers** (no AST sub-parse). Co-locates
  the type with its expecteds, type-checks them together, and is dual-use (runnable).
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

- **`EnrichmentCase`** is tiny: a `title` and a `case()` function whose body carries
  the marker-delimited spans. The body is dual-use — source-extracted for the primary
  comparison, and runnable for opt-in runtime checks via its `result` return.
  (`TypeFriendlyCase` / `MockDataCase` survive as the *types* of `friendly` / `mock`
  inside `case`, i.e. `FriendlyType<T>` / `MockData<T>`.)
- **Drift guard:** `index.ts` `as const satisfies` (compile-time), exactly like
  `validation/index.ts`; the adapter also asserts every case's type was generated
  (a typo'd case yields no CLI output → red).
- **Adapter:** per category, `beforeAll` runs the extract+synthesize+generate pipeline
  once; each `it('<title> — friendly' | '— mock')` compares normalized strings.

## Tasks

- [ ] **B1** — `gen --types … --stdout --json` batch mode (returns object-literal text
  per type) + a Go test (hermetic, assert JSON for 1–2 types).
- [ ] **T1** — `test/util/enrichmentGen.ts`: invoke `extract-fn-bodies` (or reuse
  `scripts/export-validation-suite.mjs`'s spawn), **split each case body by the
  `// ##### … #####` markers** into `{src, friendly, mock}`, synthesize the temp
  file(s) (per B-batch), spawn `gen`, AST-normalize, return a
  `{caseKey → {friendly, mock}}` lookup of generated + expected.
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

*(D1 text-compare and D2 self-enclosing `case()` + comment markers are confirmed.)*

1. **B-batch** — unique per-case type names → one batched `gen` per category file
   (recommended), vs uniform `Target` → per-case gen via a persistent `--daemon`.
2. **Normalization** — TS compiler API (recommend — exact AST equivalence) vs Prettier.
3. **Suite dir** — `enrichment-gen/` (recommended) vs fold into existing `enrichment/`.
4. **`check` suite** — give validation its own case suite now, or keep it on the Go
   unit tests for this pass?
5. **D3** — re-declare the validation type ranges in the enrichment cases (recommended)
   vs reuse the validation suite's inline `T`s via extraction.
