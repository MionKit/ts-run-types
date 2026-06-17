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

**Batching (decided).** One `extract-fn-bodies` pass per category file up front gets
every case body. The uniform `Target` name is kept (readable); to avoid collisions,
each case's `src` span is written to its **own temp module file** (`import …; export
type Target = …`) — module scoping makes same-named `Target`s distinct symbols. A
single `gen --files <list> --type Target --stdout --json` call builds **one** program
over all the temp files and resolves `Target` per file. One binary invocation, no
renaming, recursive- and multi-type-safe.

## New binary capability

Extend `gen` with a **multi-file, stdout, JSON** batch mode (no file writes — returns
the same `.rt.ts` object-literal text it would write), one program over all files:

```
ts-runtypes gen --files a.ts,b.ts,c.ts --type Target --stdout --json
→ { "a.ts": { "friendly": "{…}", "mock": "{…}" }, "b.ts": { … } }
```

- Returns just the object-literal skeleton per file (the value, not the
  `export const … =` wrapper) so comparison is against the case's initializer.
- One inferred `Program` over all `--files`; resolves `--type` per file via the
  existing bridge. Keyed by file in the JSON.
- Lives in `internal/enrichment` + `cmd/ts-runtypes/enrichment_cli.go`; the existing
  single-file file-writing `gen` is untouched (this adds the `--files`/`--stdout`/`--json` arms).

## Suite structure

```
packages/ts-runtypes/test/suites/enrichment/
  cases/
    types.ts          # EnrichmentCase = { title; description?; case: () => {friendly; mock} }
    Atomic.ts Array.ts Object.ts Tuple.ts Union.ts Native.ts
    TemplateLiteral.ts Format.ts Utility.ts Circular.ts Realworld.ts   # the sections
    index.ts          # `as const satisfies Record<string, Record<string, EnrichmentCase>>` (drift guard)
  enrichmentGen.test.ts    # entry 1: extract → gen → compare generated vs expected shape
  enrichmentCheck.test.ts  # entry 2: synth .rt.ts from the cases → `check` → assert ZERO findings
  createFriendly.test.ts   # existing runtime-render suite (unchanged)
test/util/enrichmentCases.ts  # shared: extract-fn-bodies + split-by-markers → {src, friendly, mock} per case
test/util/enrichmentGen.ts    # synth temp module files + spawn `gen --files` + Prettier-normalize + compare
```

**The two entries share the one case suite** (`cases/`). `enrichmentGen` verifies the
generator produces the right shape; `enrichmentCheck` verifies `check` finds nothing
wrong in those same (valid, tsc-checked) authored maps — i.e. **no false positives
across every type range**. The "check catches real errors" direction stays on the Go
unit tests (`validate_test.go`, deliberately-broken maps).

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

- [x] **B1** — `gen --files … --type Target` multi-file batch (one Program; JSON
  object-literal skeletons per file) + program `Conditions:["source"]` so formats
  project their `FormatAnnotation`; hermetic Go test. (commit `c2e9686`)
- [x] **T1** — `enrichmentCases.ts` (extract-fn-bodies → split by markers →
  `{src, friendly, mock}`, strip a trailing `as` cast) + `enrichmentGen.ts`
  (per-case temp module → `gen --files` → `prettierNormalize` both sides).
- [x] **T2** — `cases/types.ts` (`EnrichmentCase`).
- [x] **T3** — 11 category files, 84 cases, re-declaring the validation type ranges.
- [x] **T4** — `cases/index.ts` (`as const satisfies`) + `enrichmentGen.test.ts` (177).
- [x] **T5** — `enrichmentCheck.test.ts` (94) — zero findings on the valid maps.
- [ ] **T6** — (optional) trim Go `emit_describe_test.go` rendered-text cases.
- **Result:** 271 new tests; full suite **6183 passed / 2 skipped**. (commit `33dae5e`)

## Finding — emitter ↔ DSL-type divergence (follow-up)

The comprehensive coverage surfaced a real gap: the `emit.go` walker emits an
**opaque leaf** (`{$label:''}` / `{pool:[]}`) for kinds the `FriendlyType<T>` /
`MockData<T>` mapped types model **structurally**, so the generated skeleton is
**not assignable** to the map type for: **tuples** (`MockData` → `{$items,$length}`),
**Map/Set** (homomorphic object map), **Promise**, **object-member unions**
(`{a}|{b}`), and **bare index-signature roots** (friendly side — `$label:string`
collides with the index). Emitter and `check` are internally consistent (check
reports zero on the leaf), so the mismatch is **emitter ↔ type definitions**, both
shipped in P1/P5. Those cases currently pin the leaf behaviour with a stripped
`as MockData<T>` cast. **Fix options:** (a) make `emit.go` emit structurally for
those kinds (tuples → `$items`+`$length`, Map/Set/index-sig → appropriate), or
(b) route those kinds to a leaf-pool branch in the DSL types (an `IsTuple`/`IsMap`
discrimination) so the simple emitter is correct. (b) is likely simpler + coherent
(pool-of-whole-values). Either is verified by this suite.

## Normalization

Generated text (emitter style) and expected text (Prettier style in source) differ in
whitespace/commas/quotes. Run **both** through **Prettier** (wrapped as `const _ =
<expr>`) and compare the formatted strings — the comparison is then about
**shape + keys + values**, not formatting. (Prettier is the repo's formatter; chosen
over the TS-API printer for simplicity, both being available.)

## Decisions — all settled

| # | Decision |
| --- | --- |
| Compare | TS **source**, Prettier-normalized (not a structured shape) |
| Case shape | self-enclosing `case()` with `// ##### src/friendly/mock/result #####` markers; const names `friendly<Type>`/`mock<Type>` |
| Batching | one `extract-fn-bodies` per file; per-case temp module files; one `gen --files` call |
| Normalization | Prettier |
| Suite dir | fold into `enrichment/` (`cases/` + two entry files) |
| `check` | reuse the same case suite via a second entry (`enrichmentCheck.test.ts`) → assert zero findings on the valid maps; error-catching stays on Go unit tests |
| Type ranges | re-declared per case (consistent with the `case()` shape) |
