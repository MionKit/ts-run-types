# AI enrichment — generation-shape test plan

> **Status: plan.** Restructures enrichment testing to match the
> `validation` / `serialization` / `format-validation` suites' case-per-category
> shape, so the `gen` output is verified across (almost) every type kind. Companion
> to [AI_ENRICHMENT.md](./AI_ENRICHMENT.md) + [AI_ENRICHMENT_PLAN.md](./AI_ENRICHMENT_PLAN.md).

## Goal

The `gen` emitter's job is "produce the correct `FriendlyType<T>` / `MockData<T>`
**shape** for any type `T`." The existing suites already enumerate (almost) every
type kind across category files; mirroring their structure gives the generator the
same near-exhaustive coverage. Each case fixes a type `T` and the **expected
generated shape**; the harness asks the binary to generate for `T` and compares.

## What the existing suites do (grounding)

- `test/suites/<suite>/` has one **category file per section** (`Atomic.ts`,
  `Array.ts`, `Object.ts`, `Tuple.ts`, `Union.ts`, `Native.ts`,
  `TemplateLiteral.ts`, `Utility.ts`, `DateTime.ts`, `Circular.ts`, `Realworld.ts`),
  each exporting `const SECTION = { caseKey: {…} }`.
- An `index.ts` aggregates them under **`as const satisfies Record<string,
  Record<string, Case>>`** — the compile-time **drift guard** (a case missing a
  required field fails the build).
- A `*.test.ts` adapter iterates `Object.values(SECTION)` and registers `it()`s.
- A case carries the **type under test via a marker thunk** (`() =>
  createValidate<T>()`); the Vite plugin scans the call site (batched per file) and
  injects the compiled id. Format cases add `expectedFormatErrors()` and the adapter
  **structurally** matches (`format.name` + optional `val` / `formatPath` tail).

**The key divergence:** enrichment `gen` is CLI-driven (not the plugin scan). So the
harness spawns the binary directly instead of riding the marker→plugin path.

## Decisions (recommended — confirm before building)

- **D1 — Compare a structured shape, not rendered text.** The binary returns a
  JSON **shape tree** (per node: its meta keys / `$errors` constraint keys / `$items`
  / `pool`), and the case's `expected` is that tree, compared with `toEqual`. This
  matches the format suites' structural style, keeps `expected` compact, and is
  robust to whitespace/render changes. Rendered-text correctness stays covered by a
  few exact-match Go tests (existing `emit_describe_test.go`).
  - *Implies a small refactor:* `emit.go` builds a **shape tree** first
    (`FriendlyShape` / `MockShape` Go structs), then renders TS from it. `gen` renders
    TS; the batch mode serialises the tree to JSON. One source of truth, two renderers.
- **D2 — One named type per case.** `gen` resolves a type by name, so each case
  declares a named `export type`/`interface` in its category file and references it by
  `typeName`. Anonymous/inline generics aren't addressable by `gen` (out of scope).
- **D3 — One `EnrichmentCase` carrying both expectations.** Per your `TypeFriendlyCase`
  + `MockDataCase` framing, but bundled so a type is declared once:
  `{ title, typeName, friendly: TypeFriendlyCase, mock: MockDataCase }`. (Alternative:
  two separate suites — more files, duplicated type decls. Recommend bundled.)
- **D4 — Batch generation per file.** One binary invocation per category file (all its
  case types at once) — not one spawn per case (hundreds of spawns = slow). A
  long-lived/daemon variant is a later optimisation.

## New binary capability

Extend `gen` (or add `gen-batch`) with a **stdout JSON, multi-type** mode:

```
ts-runtypes gen <file.ts> --types A,B,C --shape --json --stdout
```

Returns, to stdout:

```json
{ "A": { "friendly": <shape-tree>, "mock": <shape-tree> }, "B": { … } }
```

- `--shape` selects the structured tree (vs the rendered `.rt.ts` text the file mode
  emits). `--stdout` suppresses file writes. `--types` is the batch list.
- Lives entirely in `internal/enrichment` + `cmd/ts-runtypes/enrichment_cli.go`
  (the existing file-writing `gen` is unchanged; this adds a code path).
- The shape tree is the refactored `FriendlyShape` / `MockShape` (D1) marshalled to
  JSON. `inlineNode` + the existing kind-switch walk are reused.

## Suite structure

```
packages/ts-runtypes/test/suites/enrichment-gen/
  types.ts          # EnrichmentCase, TypeFriendlyCase, MockDataCase, FriendlyShape, MockShape
  Atomic.ts         # string / number / boolean / bigint / literal / Date / enum …
  Array.ts          # T[] (+ nested), readonly arrays
  Object.ts         # interfaces, nested objects, optional/readonly props, index sigs
  Tuple.ts          # fixed, optional, rest, labelled
  Union.ts          # unions, discriminated unions
  Native.ts         # Map / Set / Date / RegExp (leaf shapes)
  TemplateLiteral.ts
  Format.ts         # TF.String/Number/Date/Email/UUID… — drives $errors constraint keys (FT003)
  Utility.ts        # Partial / Pick / Omit / Record / …
  Circular.ts       # self/mutually-recursive (bounded shape)
  Realworld.ts      # a couple of composite real-world types
  index.ts          # `as const satisfies` aggregation (drift guard)
  enrichmentGen.test.ts  # the adapter
```

### Case types (`types.ts`)

```ts
// The expected generated shape — a normalized tree (keys matter, placeholder
// values are '' / [] and compared verbatim).
type FriendlyShape = { $label?: ''; $errors?: Record<string, ''>; $items?: FriendlyShape } & { [field: string]: FriendlyShape | '' | undefined };
type MockShape = { pool?: []; min?: number; max?: number; $items?: MockShape; $length?: [number, number] } & { [field: string]: MockShape | unknown };

interface TypeFriendlyCase { expected: () => FriendlyShape; notes?: string }
interface MockDataCase { expected: () => MockShape; notes?: string }

interface EnrichmentCase {
  title: string;
  description?: string;
  typeName: string;        // the named type declared in the same file
  friendly: TypeFriendlyCase;
  mock: MockDataCase;
}
```

### Adapter (`enrichmentGen.test.ts`)

```ts
// One binary batch per category file (beforeAll), cached by typeName.
const shapes = await generateShapes(import.meta /* category file */, typeNamesOf(SECTION));
describe('enrichment-gen / Atomic', () => {
  for (const c of Object.values(ATOMIC)) {
    it(`${c.title} — friendly`, () => expect(shapes[c.typeName].friendly).toEqual(c.friendly.expected()));
    it(`${c.title} — mock`, () => expect(shapes[c.typeName].mock).toEqual(c.mock.expected()));
  }
});
```

### Harness util (`test/util/enrichmentGen.ts`)

- `generateShapes(categoryFileAbsPath, typeNames): Promise<Record<string, {friendly, mock}>>`
- Spawns `bin/ts-runtypes gen <file> --types <names> --shape --json --stdout` (one
  child per category file), parses stdout JSON, returns the map. The category `.ts`
  file is the real source the binary's inferred program resolves (its
  `ts-runtypes` imports resolve via the workspace, as the existing bridge tests do).
- `pretest` already rebuilds `bin/ts-runtypes`; the suite depends on it being current.

### Drift guard

`index.ts` ends with `as const satisfies Record<string, Record<string,
EnrichmentCase>>` (compile-time), exactly like `validation/index.ts`. Optionally a
runtime "every declared `typeName` resolved" assertion in the adapter catches a
typo'd `typeName` (binary returns no shape for it).

## Tasks

- [ ] **B1** — refactor `internal/enrichment/emit.go` to build `FriendlyShape` /
  `MockShape` trees, render TS from the tree (gen output byte-identical to today),
  and JSON-marshal the tree. Keep `emit_describe_test.go` green (rendered text).
- [ ] **B2** — add the batch `gen --types … --shape --json --stdout` mode +
  a Go test (hermetic inferred program, assert the JSON shape for 1–2 types).
- [ ] **T1** — `test/util/enrichmentGen.ts` (spawn + parse).
- [ ] **T2** — `types.ts` (the case + shape types).
- [ ] **T3** — the category files (sections above), porting type coverage from the
  validation suite's categories.
- [ ] **T4** — `index.ts` (`as const satisfies`) + `enrichmentGen.test.ts` adapter.
- [ ] **T5** — reconcile existing tests: keep `createFriendly.test.ts` (runtime
  rendering — different concern); reduce the Go `emit_describe_test.go` to a small
  rendered-text smoke set (the new suite owns shape coverage). 

## Test matrix

| What | Where | How |
| --- | --- | --- |
| Generated **shape** per type kind | `enrichment-gen/*` (Vitest) | binary batch → JSON shape vs `expected` (`toEqual`) |
| Rendered **`.rt.ts` text** | `internal/enrichment/emit_describe_test.go` (Go) | exact-match, a few representative types |
| `createFriendly` runtime render | `enrichment/createFriendly.test.ts` (Vitest) | unchanged |
| `check` diagnostics | `internal/enrichment/validate_test.go` (Go) | unchanged (could later get its own case suite: authored-map → expected-findings) |

## Open decisions for you

1. **D1** shape-tree comparison (recommended) vs exact rendered-text? (Drives B1.)
2. **D3** bundled `EnrichmentCase` (recommended) vs separate `TypeFriendlyCase` /
   `MockDataCase` suites?
3. Suite dir name: `enrichment-gen/` vs folding into the existing `enrichment/`?
4. Should `check` validation ALSO get a case suite now (authored map → expected
   findings), or keep it on the Go unit tests for this pass?
