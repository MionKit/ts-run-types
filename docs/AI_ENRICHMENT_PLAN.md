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
- [x] New module `packages/ts-runtypes/src/enrichment/createFriendly.ts`:
  `createFriendly<T>(map: FriendlyType<T>) => { label(path): string; errors(errs: RunTypeError[]): FriendlyMessage[] }`,
  exported from index. `FriendlyMessage = { path; label; message }`.
- [x] `errors()`: groups by path, walks `error.path` (string → child, number/object
  → `$items`) into the map; data-form picks the template by
  `error.format ? formatPath.at(-1) : 'type'` (else `$default`, else a fallback)
  and interpolates `$[label]`/`$[val]`/`$[path]`/`$[index]` — one message per
  constraint; function-form `$errors` is called once with the synthesized `failed`
  bag — one message per field.
- [x] `label(path)`: dotted-string or segment array → node, returns `$label` ??
  raw last (string) segment.
- [x] Pure-data — **no** type-id injection, no `rtUtils`. (UI/runtype pairing is P6.)
- **Tests** (`test/suites/enrichment/createFriendly.test.ts`, vitest, hand-built
  `RunTypeError[]`):
  - [x] base type failure → `type` template, `$[label]` resolves
  - [x] format failure → constraint template, `$[val]` = bound
  - [x] nested path (`profile.email`) resolution
  - [x] array element (`$items`, `$[index]`)
  - [x] label fallback to raw name when `$label` absent
  - [x] multiple errors on one field → list (accumulation)
  - [x] function escape hatch → synthesized `failed` join
  - [x] `$default` catches an unlisted constraint
  - [x] missing map entry → graceful fallback message
  - [x] `label()` accessor (dotted/nested/root/unknown)
- **Acceptance:** suite green (10/10). ✅ The `getRunTypeId` both-call-shapes rule
  is N/A here (no marker); it applies to P3/P4. Map/Set object path segments are
  v1-limited (descend to `$items`, no `$keys`/`$values`) — noted for a later pass.

---

## P3 — Compile-time validation (Go) — gated on green build

> **Emitter convention (direction).** The validation/describe walker is structured
> like every other build-time consumer of a type in this repo: a **giant `switch`
> over `RunType.kind`**, where the per-node behavior depends on the current node —
> the same shape as `validate.go`'s emit, `serialize.go`'s projection, the typefns
> families, and the runtime `mockSwitch`. It is a **paired walk**: switch on the
> `RunType.kind` and, at each node, inspect the corresponding slot of the authored
> `FriendlyType`/`MockData` literal (object → recurse per property; array → `$items`;
> a format-carrying node → check `$errors` constraint keys + placeholders; a leaf
> with a `MockData` pool → validate each pool value). Output is diagnostics (FT/MD),
> not emitted JS — but the dispatch shape is identical. New kinds land in the one
> switch, never in scattered helpers. Same for the `describe` dump walker (P4.1).
>
> (The *runtime* renderer `createFriendly` and the mock-data consumption stay
> interpreters — `mockSwitch` is the precedent that not every family compiles
> per-type. A compiled per-type friendly/mock emitter would be a `typefns` family
> via the 5-touchpoint path, but it buys nothing for these — deferred.)

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

## P5 — `MockData` → `createMockType` integration (TS) — DONE

> The walker ([mocking/mockType.ts](../packages/ts-runtypes/src/mocking/mockType.ts))
> threads a `stack: RunType[]` for cycle detection — NOT a field-name path — and
> `MockOptions` are global knobs. So consuming `MockData<T>` needed a NEW per-field
> MockData node threaded alongside the walk, descended by field name / `$items`.

- [x] Added `data?: MockData<T>` to `RunTypeMockOptions<T>` (public) +
  an internal `dataNode` cursor; `mergeMockOptions` seeds it (call overrides factory),
  the walker threads it via the options bag (`withDataNode`/`childDataNodeByName`),
  descending objects by name and arrays by `$items`. **Strictly additive** — the
  no-data path preserves the options object's reference identity (byte-identical).
- [x] Leaf kinds: `dataNode.pool` → `randomItem(pool)` (string/number/Date/boolean/
  bigint); number/Date `min`/`max` → bounds; arrays honour `$items` + `$length`
  (fixed or `[min,max]`); objects descend `dataNode[name]`.
- **Caveats (as predicted):** Map/Set cleared (v1-limited); tuples share one `$items`
  node. `$optional` reserved, not yet read.
- **Tests:** `test/suites/mocking/mockData.test.ts` — 14 cases, each looped 200× so
  randomness can't pass by luck; pool/range/`$length`/`$items`/nested + 2 additive
  no-data sanity cases. **MD003 (pool values validate at build time) is still P3.3.**
- **Acceptance:** full suite **91 files / 5912 passed / 2 skipped** (+14, zero
  regressions); prettier + eslint clean. ✅ (commit `afba648`)

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
- **P2 done** — `createFriendly<T>(map)` pure-data renderer (label + errors,
  data-form + function escape hatch, `$[…]` interpolation, accumulation) + 10
  vitest cases, all green; exported. lint+prettier clean.
- **Full `ts-runtypes` suite green after P1+P2** — 90 files / 5898 passed / 2
  skipped, 0 fail. Additions are type-only + a side-effect-free runtime module.
- **Session boundary (autonomous).** The two clean, fully-verifiable TS phases
  (P1, P2) are landed. Remaining work is deliberately left for a focused session
  because it is either invasive or deep-Go (higher risk to do unattended):
  - **P5** — needs an additive per-field-path param threaded through the
    cycle-detection walker (findings recorded above).
  - **P0 / P3 / P4** — Go: `$[val]` enrichment touches the format-error wire shape
    (audit assertions first); marker recognition + `ShapeCheckedArgs` validation +
    CLI/`gen` are deep, interdependent, and need the binary rebuilt + plugin tests.
  Each should land as its own green, committed increment per the cadence above.

- **Rebased onto `main`** after a TF/TFT format-builder refactor landed — clean replay
  (the refactor never touched the files this branch edits); full suite re-verified green.
- **P5 done** (parallel agent) — `createMockType<T>({ data })` consumes `MockData<T>`,
  additive; +14 tests; suite 5912 green. See P5 section above.
- **Docs + skills done** (parallel agents) — website `3.ai-integration/` section (3
  pages + homepage card-group) and two skills (`runtypes-friendly-type`,
  `runtypes-mock-data`). "Shipped vs designed" notes reconciled after P5 wired `{ data }`.
- **Decisions recorded** (small open questions resolved per the user — none change the
  architecture): see "Decided defaults" + the "Process model — where each command runs"
  section in [AI_ENRICHMENT.md](./AI_ENRICHMENT.md). Headline: **no new binary** — the
  Go side gains pure `describe`/validation OPs (warm checker reuse); the user-facing
  `gen`/`check`/`describe` commands + all file writes live on the JS public surface.
- **Key realization** documented: TypeScript's own checking of the precise DSL types
  already catches the bulk of drift, so the Go validation pass (P3) is a *refinement*
  layer (FT003/FT005/MD003/drift-hash), not the core — the feature is already usable
  with P1/P2/P5 + the editor.
- **Process-model corrected** — the `gen` emitter is Go-side + CLI-arg-driven (a
  giant `RunType.kind` switch belongs with the other emitters; doing it in JS would
  duplicate the walk). `describe`/`check`/`gen` are one-shot CLI modes of the existing
  binary; `--daemon` gives loop warmth. Supersedes the earlier JS-file-writes split.

- **P4 core done (Go)** — new **separate** package `internal/enrichment/` (consumes
  `protocol.RunType` as a library; nothing added to the hot scan/render path):
  - **Emit / Describe walkers** (commit `f2ff16a`): kind-switch `EmitFriendly`/
    `EmitMock` (`.rt.ts` skeletons, `$errors` pre-keyed by declared format constraints)
    + `Describe` (prompt text). Unit-tested with hand-built RunTypes + cyclic bound.
  - **`describe` / `gen` CLI bridge** (commit `fec8997`): resolves a named type
    (walk statements → `GetSymbolAtLocation` → `getDeclaredTypeOfSymbol` →
    `cache.SerializeTopLevel` → `inlineNode` to flatten the ref-graph, clone-only).
    Minimal shared touch: 5-line pre-`flag.Parse` dispatch in `main.go` (flags never
    match a subcommand → plugin path untouched) + a `Resolver.Checker()` accessor.
    Hermetic bridge tests; end-to-end `describe`+`gen` verified; create-only writes.
  - **`check` done** (commit `a2b90c3`): the literal-AST paired walker over a tiny
    `LiteralView` adapter (unit-testable). FT002 (unknown friendly key), FT003
    ($errors key not a declared constraint), FT005 (bad `$[…]` placeholder), MD001
    (unknown mock key). Annotation detected off the TypeReference syntax (+ SkipAlias
    + DeclaredInModule) since the `FriendlyType<T>` alias body reduces. A nested-object
    `$errors` double-count bug was caught in review + fixed (+ regression test).
    **MD003** (pool values validate — needs the runtime validator) + FT004/MD002 (TS
    already catches) + the always-on Vite-build diagnostic surfacing are deferred.
  The full **`describe` / `check` / `gen`** CLI trio is now complete + tested.
- **Still deferred:** P0.1 declFile (only needed for demand-driven `gen` from marker
  usage; current `gen` takes file+type explicitly), P0.2 `$[val]`, MD003, build-time
  diagnostic integration, P6 registry accessors. None are architectural unknowns.
