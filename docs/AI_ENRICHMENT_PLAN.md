# AI enrichment — implementation plan

Companion to the design in [AI_ENRICHMENT.md](./AI_ENRICHMENT.md). This is the
**actionable build plan**: phased tasks, the file touchpoints, the required tests,
acceptance criteria, and the commit cadence. Checkboxes are the live task list —
updated and committed as work lands.

- **Branch:** `feat/ai-enrichment`
- **Lands via:** Rebase-and-merge — keep linear (see CLAUDE.md → Git workflow).
- **Verify loop:** `go test ./internal/...` (Go), rebuild `bin/ts-runtypes` before
  any plugin test, `pnpm exec vitest run <pattern>` (JS). Lint+format before each
  commit (pre-commit `lint-staged` enforces it).

## Guiding principles

1. **Ship verifiable increments.** Every commit builds and its tests pass. No
   blind code on a surface I can't run.
2. **TS-first, low-risk-first.** The pure-type DSLs and the pure-data runtime are
   self-contained and fully testable without touching the Go pipeline — do them
   first; they de-risk the contract the Go side validates against.
3. **No new emit family.** This is a *validation + authoring + registry* feature,
   not a code-emit family. Keep it out of `internal/operations` and
   `typefns.Families`.
4. **Instantiation-budget discipline.** The DSL types get a per-branch budget test
   mirroring `dataonly.compile.test.ts` (one-way ratchet).

## Dependency ordering

```
P1 (DSL types) ─┬─► P2 (runtime render) ─────────────► P5 (mock→createMockType)
                └─► P3 (Go validation) ──► P4 (CLI/gen) ─► P6 (registry v2, deferred)
P0 (prereqs: declFile, $[val]) feeds P3/P4 but is independent of P1/P2
```

P1 and P2 are the autonomous critical path (no Go). P0/P3/P4 touch Go + the binary
and are sequenced after, each gated on a green build.

---

## P0 — Prerequisites (Go)

Independent enabling changes. Each is small, well-scoped, Go-test-verifiable.

### P0.1 — Surface the type's declaration file on the wire
- [ ] Add `DeclFile string` (+ `DeclName string` if not already covered by
  `TypeName`) to `protocol.RunType` ([internal/protocol/protocol.go](../internal/protocol/protocol.go)).
- [ ] Populate from `symbol.Declarations → GetSourceFileOfNode()` in
  [serialize.go](../internal/compiled/runtype/serialize.go) (the `declarationPos`
  helper already reads the declaration; extend to the file path; follow
  re-exports to the original declaration).
- [ ] Gate behind `Request.includeDeclSites` (don't bloat the default dump).
- **Tests:** Go fixture asserting `DeclFile` for a named interface, a re-exported
  type (resolves to original), and an anonymous/inline type (empty).
- **Acceptance:** `describe` (P4.1) and the sibling-placement (P4.3) can resolve a
  type to its definition file.

### P0.2 — `$[val]` enrichment: format errors carry the raw param
- [ ] In [formats/emit.go](../internal/compiled/typefns/formats/emit.go)
  `FormatErrCall`, stop overloading `val` with messages: always emit the raw
  constraint param value; carry any human message in a separate optional field
  (e.g. `format.msg`) so `pattern`/`allowedChars` keep their message AND `$[val]`
  resolves to the bound. Add `val` for date bounds (currently absent).
- [ ] Mirror the shape on the TS `TypeFormatError` interface
  ([createRTFunctions.ts](../packages/ts-runtypes/src/createRTFunctions.ts)).
- **Tests:** extend `format-validation` suites — assert `val` is the bound for
  `minLength`/`maxLength`/`min`/`max`/date-bounds; assert the message field for
  `pattern`. Rebuild binary + run `string/number/datetime` format suites.
- **Risk:** touches the error wire shape; existing tests assert `val`. Audit every
  `format:` assertion before changing. **Do this behind a careful diff.**

---

## P1 — DSL types (TS, pure type-level) — AUTONOMOUS

### P1.1 — `FriendlyType<T>` + `MockData<T>`
- [x] New module `packages/ts-runtypes/src/enrichment/friendlyType.ts` with a
  `// #region friendlytype-extract … #endregion` block (self-contained — lib types
  + own decls only), holding `FriendlyMeta`, `ErrorTemplates`, `FriendlyTemplate`,
  `FailedConstraint`, `FailedConstraints`, `FriendlyLeaf`, `_FriendlyDepth`,
  `FriendlyNode`, `FriendlyType`.
- [x] New module `packages/ts-runtypes/src/enrichment/mockData.ts` with a
  `// #region mockdata-extract … #endregion` block holding `_MockDepth`,
  `MockNode`, `MockData`.
- [x] Construction follows `DataOnly<T>`: depth-bounded tuple decrement, **no
  `infer` on the hot path** (`T[number]`/`T[K]`), scalar-before-object gates,
  homomorphic `{ [K in keyof T]?: … }`. Note: explicit `boolean`/`bigint` MockNode
  arms (fixed element type, not `T[]`) so a boolean field doesn't splinter into
  `{pool?: true[]} | {pool?: false[]}` under union distribution.
- [x] Export both from [index.ts](../packages/ts-runtypes/src/index.ts).
- **Acceptance:** the compile-budget tests (P1.2) type-check both modules through
  the real TS compiler — green. (There is no separate `typecheck` script; vitest
  is the package's only check.)

### P1.2 — instantiation-budget compile tests
- [x] `test/types/enrichmentHarness.ts` — slices both regions verbatim (mirrors
  `dataonlyHarness.ts`), binds to `makeMeasurer`, `Equal/Expect/Assignable` preamble.
- [x] `test/types/friendlyType.compile.test.ts` (8 branches) +
  `mockData.compile.test.ts` (6 branches) — scalar leaf, object nest + unknown-field
  rejection, nested object, array `$items`, function-form `$errors`, optional/union,
  deep-nesting (depth budget), circular type (bounded).
- [x] Each asserts (1) clean type-check + invalid maps rejected (`@ts-expect-error`
  → TS2578 if too loose), (2) net instantiations ≤ exact budget (ratchet-down only).
  Budgets: friendly `44/36/74/82/27/40/121/60`, mock `71/94/78/77/154/86`.
- **Acceptance:** `pnpm exec vitest run friendlyType.compile mockData.compile` —
  14/14 green. ✅

---

## P2 — Runtime rendering (TS, pure-data) — AUTONOMOUS

### P2.1 — `createFriendly<T>(map)`
- [ ] New module `packages/ts-runtypes/src/enrichment/createFriendly.ts`:
  `createFriendly<T>(map: FriendlyType<T>) => { label(path): string; errors(errs: RunTypeError[]): FriendlyMessage[] }`.
- [ ] `errors()`: walk `error.path` (string/number/object segments — handle
  Map/Set object segments) into the map; pick template by
  `error.format ? formatPath.at(-1) : 'type'`, else `$default`; interpolate
  `$[label]` / `$[val]` / `$[path]` / `$[index]`. Function-valued `$errors` →
  call with a synthesized `failed` object grouped from the path's errors.
- [ ] `label(path)`: walk to the node, return `$label` ?? last raw path segment.
- [ ] Pure-data — **no** type-id injection, no `rtUtils`. (UI/runtype pairing is P6.)
- **Tests** (`test/suites/enrichment/createFriendly.test.ts`, vitest, hand-built
  `RunTypeError[]`):
  - [ ] base type failure → `type` template, `$[label]` resolves
  - [ ] format failure → constraint template, `$[val]` = bound (post-P0.2)
  - [ ] nested path (`profile.email`) resolution
  - [ ] array element (`$items`, `$[index]`)
  - [ ] label fallback to raw name when `$label` absent
  - [ ] multiple errors on one field → list (accumulation)
  - [ ] function escape hatch → synthesized `failed` join
  - [ ] missing map entry → graceful fallback message
- **Acceptance:** suite green; **both `getRunTypeId` call-shapes rule N/A** here
  (no marker), but document that the marker-coverage rule applies to P3/P4.

---

## P3 — Compile-time validation (Go) — gated on green build

### P3.1 — recognize the annotations as markers
- [ ] Marker scanner ([internal/marker/marker.go](../internal/marker/marker.go)):
  detect a declaration/expression typed `FriendlyType<T>` / `MockData<T>` (alias
  named + declared in `ts-runtypes`, same gating as `InjectRunTypeId`). Resolve
  `T`'s `RunType`.
- [ ] New `ShapeCheckedArgs<T>` axis: walk the object-literal AST (reuse
  [comptimeargs](../internal/comptimeargs/comptimeargs.go)) against `T`'s graph.

### P3.2 — `FT0xx` / `MD0xx` diagnostics
- [ ] Add codes to the diag catalog ([internal/diag/catalog.go](../internal/diag/catalog.go)):
  FT001 Info, FT002 Error, FT003 Warning, FT004 Error, FT005 Warning, FT010 Info;
  MD001 Error, MD002 Error, MD003 Error, MD004 Warning, MD005 Info, MD010 Info.
- [ ] Emit on the existing `Diagnostic[]` channel; surface through the plugin like
  `VL0xx`.

### P3.3 — MD003 pool-validation
- [ ] For each `MockData` pool/range value, run it through the field's validator
  (reuse the validate emit / a value check) → MD003 on failure.

### P3.4 — drift stamp
- [ ] Compare a header-comment structural-id hash to the live type → FT010/MD010.
- **Tests:** Go fixtures (extend `internal/testfixtures/`) for each diagnostic;
  plugin tests under `packages/vite-plugin-runtypes/test/` asserting the
  diagnostics surface. **Marker-coverage rule:** any marker test covers both
  `getRunTypeId` shapes where applicable (paired tests + one hash-equivalence).
- **Acceptance:** `go test ./internal/...` green; rebuilt binary; plugin tests green.

---

## P4 — CLI + `.rt.ts` generation (Go) — gated on green build

### P4.1 — `describe <file>#<Type> --format prompt|json`
- [ ] New CLI subcommand in [cmd/ts-runtypes](../cmd/ts-runtypes/); resolves the
  type, dumps its `RunType` (needs P0.1) as prompt text or JSON.

### P4.2 — `check [glob]` / `check --file <p> --json`
- [ ] Run the P3 validation standalone; non-zero exit on Error; `--json` for agents.

### P4.3 — `gen <file> [--mock] [--friendly] [--check]`
- [ ] Global demand discovery (FriendlyType = any marker; MockData =
  `createMockType` only). For each demanded named type → resolve definition file
  (P0.1) → write/refresh `<defFile>.rt.ts`. Best-effort `import type`; create-only
  (skip present entries via parse/regex). External-type resolution order (lib
  sibling → `rt-overrides/` opt-in → skip).
- **Tests:** CLI integration tests (golden `.rt.ts` output for a fixture project;
  re-export resolution; create-only skip; external-type skip).
- **Acceptance:** `go test ./...` green; manual `gen` smoke on a fixture.

---

## P5 — `MockData` → `createMockType` integration (TS)

- [ ] Extend `createMockType<T>({ data })` to consume `MockData<T>` pools/ranges/
  `$items`/`$length`/`$optional` ([packages/ts-runtypes/src/mocking/](../packages/ts-runtypes/src/mocking/)).
- **Tests:** vitest — pool selection, range bounds, array length, optional
  probability, nested; **MD003 covered separately in P3.3.**
- **Acceptance:** mocking suite green.

---

## P6 — Registry accessors (v2, DEFERRED — plan only)

`getFriendlyType<T>` / `getMockData<T>` / `registerFriendly<T>` over `rtUtils`,
keyed by injected `InjectRunTypeId<T>`; plugin injects a side-effect import of the
`.rt.ts`; mock registration gated to dev/test. This is the on-ramp to the UI
runtype-pairing. **Not in initial scope** — documented in AI_ENRICHMENT.md → registry roadmap.

---

## Test matrix (required)

| Area | Kind | Location |
| --- | --- | --- |
| DSL types | TS compile-budget (ratchet) | `test/types/{friendlyType,mockData}.compile.test.ts` |
| `createFriendly` render | vitest | `test/suites/enrichment/createFriendly.test.ts` |
| `$[val]` enrichment | vitest (format suites) | `test/suites/format-validation/*` |
| declFile wire | Go | `internal/...` fixture |
| FT/MD diagnostics | Go fixtures + plugin | `internal/testfixtures/`, `packages/vite-plugin-runtypes/test/` |
| MD003 pool validation | Go + plugin | as above |
| CLI describe/check/gen | Go integration | `cmd/ts-runtypes` |
| mock data consumption | vitest | `test/suites/mocking/*` |

## Risk register

| Risk | Mitigation |
| --- | --- |
| P0.2 changes error wire shape; breaks existing format assertions | Audit all `format:` assertions first; add the new field additively, keep `val` semantics where already a bound |
| DSL type instantiation blowup | DataOnly construction + budget tests; union-distribution guards (`[T] extends […]`) |
| Go marker recognition for a non-injected annotation is new shape | Start read-only (validate, no rewrite); reuse comptimeargs walker |
| Autonomy: deep Go/CLI changes unverifiable mid-way | Each phase gated on green `go test` + rebuilt binary; commit only green increments |

## Commit cadence

One commit per completed, green task (or tight task group). Conventional-ish
messages, linear history, `--force-with-lease` only after a rebase. Update this
file's checkboxes in the same commit that lands the work.

## Progress log

- `feat/ai-enrichment` branched off `main`.
- Spec ([AI_ENRICHMENT.md](./AI_ENRICHMENT.md)) + this plan committed.
- **P1 done** — `FriendlyType<T>` + `MockData<T>` DSL types (DataOnly-style,
  depth-bounded, `infer`-free) + 14 instantiation-budget compile tests, all green;
  exported from the package entry. lint+prettier clean.
