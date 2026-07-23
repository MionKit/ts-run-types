---
type: chore
spec: full-plan
status: done
created: 2026-07-23
completed: 2026-07-23
---

# Rename `createX` factories → `createXFn` (callable-returning ones only)

## Shipped (2026-07-23)

All 12 callable-returning factories renamed to `createXFn` across src, tests, the 47 examples, docs, website content, and Go comments/diag-prose (diag catalog regenerated). The 6 object-returning factories were left untouched; return-type aliases unchanged. `createMockData` was included (returns `createMockDataFn`), and its source **file** `createMockData.ts` was intentionally NOT renamed (only import-path refs preserved).

**One deviation from the plan:** the `sourcerewrite/testdata/*.json` golden fixtures were **left at their committed synthetic names** (`createValidate`, …) rather than renamed. Those fixtures bake UTF-8 byte offsets, and their generator `gen_golden.mjs` is broken (its JS `rewrite()` oracle was deleted in `7031676c`; path also stale from the Go-tree relocation), so they can't be regenerated. The callee identifier there is immaterial to the byte-offset/sourcemap mechanics under test. Tracked as a follow-up: [fix-broken-golden-generator-sourcerewrite.md](../todos/fix-broken-golden-generator-sourcerewrite.md).

**Verification:** Go suite green; typecheck green (examples + testfixtures overlay + both packages); lint + format clean; 7208 JS tests pass. Remaining `pnpm test` failures are **not** from this rename — they are the host's Node-24-vs-required-Node-26 `Temporal` gap (~721) plus pre-existing format-mock fuzz failures (baseline-confirmed identical on `origin/main`). The real Node-26 / CI gate is where the Temporal suite runs clean.

## Context / Problem

The public factory names read as imperatives: `createValidate<T>()` looks like "create-and-validate now", when it actually returns a reusable function you call later (`const isUser = createValidate<User>(); isUser(x)`). That two-step shape is central to RunTypes, so the name should telegraph it. Appending `Fn` makes the return value explicit and gives the whole factory family one predictable, scannable convention. Pre-release, no external users, so no back-compat shims are needed.

Boundary decision (already made): rename **only factories whose return type is a bare callable**. Factories that return objects keep their names, because suffixing `Fn` there would be a fresh lie (an object isn't a function). `createMockData` **is included** (it returns a `MockTypeFn` generator).

De-risking finding from investigation: this is a **pure JS identifier rename with zero scanner/protocol impact**. The Go scanner keys on the `InjectTypeFnArgs<T, Fn>` marker type + the operations registry `FamilyTag`/`FnKey` (`val`, `verr`, `tb`…), never on the string `createValidate`. Every Go reference to these names is a doc comment or diagnostic help text. The internal `resolveEntryTupleFn('createValidate', …)` first arg is a **diagnostic label only** (used solely in `${fnName}(): …` error strings — the real cache key is `entryTupleKey(injected)`), so those strings rename cosmetically alongside each factory.

## Scope — the rename map (12)

| Old | New | Returns |
|---|---|---|
| `createValidate` | `createValidateFn` | `ValidateFn` |
| `createGetValidationErrors` | `createGetValidationErrorsFn` | `GetValidationErrorsFn` |
| `createHasUnknownKeys` | `createHasUnknownKeysFn` | `HasUnknownKeysFn` |
| `createCloneExactShape` | `createCloneExactShapeFn` | `CloneExactShapeFn` |
| `createUnknownKeyErrors` | `createUnknownKeyErrorsFn` | `UnknownKeyErrorsFn` |
| `createFormatTransform` | `createFormatTransformFn` | `FormatTransformFn` |
| `createJsonEncoder` | `createJsonEncoderFn` | `JsonEncoderFn` |
| `createJsonDecoder` | `createJsonDecoderFn` | `JsonDecoderFn` |
| `createBinaryEncoder` | `createBinaryEncoderFn` | `BinaryEncoderFn` |
| `createBinarySizer` | `createBinarySizerFn` | `BinarySizerFn` |
| `createBinaryDecoder` | `createBinaryDecoderFn` | `BinaryDecoderFn` |
| `createMockData` | `createMockDataFn` | `MockTypeFn<T>` |

The return-type aliases (`ValidateFn`, `JsonEncoderFn`, …) already end in `Fn` and are **unchanged**; no collision with the new factory names.

## Excluded — return objects, keep their names

- `createStandardSchema` → `RTStandardSchemaV1<…>` (Standard Schema object)
- `createFriendlyText` / `createFriendlyTextI18n` → `FriendlyRenderer` (interface)
- `createDataViewSerializer` / `createDataViewDeserializer` / `createSizingSerializer` → `DataView*` (interfaces; also low-level)

## Plan — surfaces to update

**1. Factory definitions + co-located diagnostic labels** — [packages/ts-runtypes/src/createRTFunctions.ts](../../packages/ts-runtypes/src/createRTFunctions.ts): `createValidate`:289 (label :290), `createGetValidationErrors`:302 (:303), `createHasUnknownKeys`:319 (:320), `createCloneExactShape`:329 (:330), `createUnknownKeyErrors`:335 (:336), `createFormatTransform`:356 (:357), `createJsonEncoder` overloads :387/:392/:397 (`resolveTupleEntry` label :404), `createJsonDecoder` overloads :416/:421/:426. [packages/ts-runtypes/src/createRTFBinary.ts](../../packages/ts-runtypes/src/createRTFBinary.ts): `createBinaryEncoder` :145-173 (label :183), `createBinarySizer` :245-247 (:250), `createBinaryDecoder` :260-277 (:277). [packages/ts-runtypes/src/mocking/createMockData.ts](../../packages/ts-runtypes/src/mocking/createMockData.ts): overloads :21-23 + its own `createMockData(): …` error strings. Rename every overload signature + the impl.

**2. Public re-exports** — [packages/ts-runtypes/src/index.ts](../../packages/ts-runtypes/src/index.ts) lines 141-192 (createRTFunctions + createRTFBinary blocks) and :213 (createMockData). Verify no subpath barrel also re-exports them (grep `export ... create` across `src/`).

**3. Cross-references inside src** — including [packages/ts-runtypes/src/standard/createStandardSchema.ts](../../packages/ts-runtypes/src/standard/createStandardSchema.ts), which keeps its own name but internally uses `resolveEntryTupleFn('createValidate', …)` / `('createGetValidationErrors', …)` labels + JSDoc "mirroring createValidate" → update those two labels + the comment.

**4. Diagnostic help text (Go-authored, regenerated — do NOT hand-edit the outputs)** — the `createValidate<User>()` / `createJsonEncoder(undefined, preset)` example snippets live in [ts-go-runtypes/internal/diagnostics/messages.go](../../ts-go-runtypes/internal/diagnostics/messages.go) + [ts-go-runtypes/internal/diagnostics/prose.go](../../ts-go-runtypes/internal/diagnostics/prose.go). Edit there, then regenerate `packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts` + `container/website/app/components/content/go-generated/diagnostics-catalog.json` via `node scripts/core/gen-diagnostics-catalog.mjs` (the rt.mjs `diag` codegen entry).

**5. Go doc comments** — 68 files under [ts-go-runtypes/internal/](../../ts-go-runtypes/internal/) reference the names in comments only (not load-bearing). Sweep for accuracy.

## Tests

Pure rename ⇒ **no new test cases**; the gate is that the full existing suite passes under the new names.

- [packages/ts-runtypes/test/](../../packages/ts-runtypes/test/) + [packages/ts-runtypes-devtools/test/](../../packages/ts-runtypes-devtools/test/) — update every reference. Keep the paired value-first (`createXFn(rt)`) vs type-first (`createXFn<T>()`) factory tests and the marker hash-equivalence tests working (names only).
- Go tests that embed the TS names as scanner input or assert diagnostic help text — the resolver `*_test.go` set incl. [ts-go-runtypes/internal/compiler/resolver/diagnostics_test.go](../../ts-go-runtypes/internal/compiler/resolver/diagnostics_test.go). Update expected-diagnostic strings that changed in step 4; embedded-fixture names are name-agnostic to the scanner but update for consistency.

## Docs

- [packages/examples/src/](../../packages/examples/src/) (47 files) — rename; **must compile** under [packages/examples/tsconfig.json](../../packages/examples/tsconfig.json) (wired into root `typecheck` → `pnpm run lint` → CI). Hard gate.
- Website [container/website/content/](../../container/website/content/) — prose mentions + `index.md` API names (API-truth update, which is required/allowed). `<code-import>` blocks auto-propagate once `packages/examples/src` is renamed (regenerated, machine-owned timestamps off-limits). Keep edits scoped to examples/prose; don't restructure MDC components.
- [README.md](../../README.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md), [docs/ROADMAP.md](../ROADMAP.md) + other `docs/*.md`, [CLAUDE.md](../../CLAUDE.md), [SETUP.md](../../SETUP.md), and the skills under `.claude/skills/` + `packages/ts-runtypes/skills/` — update API-name mentions (e.g. CLAUDE.md's Rewrite/markers sections, the enrich skill's `createMockData`).

## Fuzzing

Not a fuzzing candidate — identifier rename, no new behavior or oracle.

## Verification (end-to-end)

1. `node scripts/core/gen-diagnostics-catalog.mjs` — regenerate the diag catalog after the Go prose edits.
2. Rebuild `ts-runtypes-devtools` dist (consumers/typecheck read its dist `.d.ts`) and `bin/ts-runtypes` (`pnpm run pretest` covers staleness).
3. `pnpm test` (JS suite, spawns the binary) — green.
4. `go -C ts-go-runtypes test ./internal/...` — green.
5. `pnpm run lint` (includes the `typecheck` that compiles `packages/examples`) + `pnpm run format` / `check-format` — clean.

## Out of scope

- The object-returning factories (see **Excluded**) — names unchanged.
- Internal factory-builders `createTypeFnArgsFunction` / `createRTFunction` / `createRTFunctionArg` — plumbing, not the public `createX<T>` surface; unchanged.
- Return-type aliases (`ValidateFn`, …) — unchanged (already `Fn`-suffixed).
- No deprecated `createX` aliases / shims (pre-release, no users; breaking rename is intended).
- No behavior, signature, or overload-shape change beyond the identifier.
- Generated / build artifacts (website `.output`/`.nuxt`/`dist`, playground bundle, git-ignored bench-data, `node_modules`) — regenerated, never hand-edited; scope the sweep to source + `content/`.

## Done when

- All 12 factories (every overload + impl) + their co-located diagnostic labels renamed to `createXFn`; public re-exports updated; return-type aliases untouched.
- Excluded object-returning factories untouched.
- Full JS suite + Go suite green; `packages/examples` typechecks; lint + format clean; diag catalog **regenerated** (not hand-edited).
- Docs (README, `docs/*`, website content + `index.md`, CLAUDE.md, SETUP.md, skills) and Go comments reflect the new names.
- No new test cases; existing paired value-first/type-first and hash-equivalence tests pass under the new names.
