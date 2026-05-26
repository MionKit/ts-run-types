---
name: add-jit-fn-from-scratch
description: Implement a brand-new JIT function (validator, serializer, coercer, …) in ts-go-run-types from first principles, with NO mion reference to port from. Use when the user asks to add a JIT family that doesn't exist in @mionjs/run-types — they want a new behavior, not a port. Covers the same Go-side + JS-side + test-suite plumbing as the port skill, but adds a design phase up front.
argument-hint: <fn-name>  (e.g. coerce, schemaFromType)
effort: high
---

# Add a brand-new JIT function to `ts-go-run-types` (no mion reference)

Use this skill when the target JIT function does NOT exist in
`@mionjs/run-types` and you have to design its wire contract from
first principles. If the function DOES exist in mion, use
`port-jit-fn-from-mion` instead — that skill mirrors mion's
existing emit code, which is much faster than re-designing it.

## CRITICAL — present a plan before editing

This skill MUST follow this gate (even more strictly than the port
skill, because there's no mion fallback if the wire shape is wrong):

1. Run steps 1–2 (Design) **read-only**. No edits yet.
2. Then enter plan mode, write the design + sketches into the plan
   file, and call `ExitPlanMode` to get user approval of the wire
   contract.
3. Only after the user approves, proceed to step 3 and beyond.

The wire shape IS the design decision. Once code lands it's expensive
to change, so the user MUST approve it explicitly via `ExitPlanMode`.

## Step 1 — Design the wire contract from first principles (read-only)

Because there's no mion implementation to mirror, hand-write the JS
body the emitter should produce for **3 representative kinds** so
the user can review the shape before any Go code lands. Pick:

- **One atomic kind** (e.g. `string` or `number`) — exercises the
  simple leaf case
- **One container kind** (e.g. `array` or `objectLiteral`) — exercises
  recursion + child dispatch
- **One union or templateLiteral** — exercises dispatch / aggregation
  across alternatives

For each, write the literal JS source the cache module should
eventually serialize. Capture:

- **Argument names + order** — use Greek letters consistent with the
  existing family: `vλl` (value), `pλth` (path stack), `εrr`
  (error accumulator), `δst` (destination buffer), etc. Add new
  Greek-letter aliases for any new args you need.
- **Return value identifier** — what gets `return <name>;` at the
  body's end
- **Whether path tracking is needed** — most validators yes;
  pure transforms with no error reporting no
- **Pure-fn dependencies** — list every helper called via
  `utl.getPureFn('mion::<name>')`. For each, flag whether it
  already exists in
  `packages/ts-go-run-types/src/run-types-pure-fns.ts` or has to
  be added (any new pure fn is an additional change in that file
  AND in the pure-fns cache).
- **Noop fallback for `any` / `unknown`** — what should the adapter
  return when the cache entry is empty? Identity? Empty array?
  `true`? Pick one that matches the fn's semantic.
- **Round-trip pair if applicable** — does this fn have a sibling
  deserializer (e.g. `jsonEncode` ↔ `jsonDecode`)? If so, design
  both contracts together so the round-trip test makes sense from
  phase 1.

## Step 2 — Plan-mode gate (MANDATORY)

Enter plan mode and write the design into the plan file. Include:

- The three hand-written JS sketches from step 1
- The cache namespace choice (e.g. `coerce_<hash>`)
- The full kind list bucketed by phase
- Any new pure fns that need adding
- The phased rollout plan
- The verification commands

Call `ExitPlanMode` and wait for the user to approve.

**Do NOT proceed to step 3 until approved.**

Once approved, the wire shape is the contract: the Go emitter must
produce exactly that JS for those three kinds, and extend the
pattern consistently across the remaining ~25 kinds.

If at any point during execution the wire-shape design proves wrong
(e.g. you discover you need an extra arg, or the noop fallback
semantics break for a specific kind), **stop**, re-enter plan mode
with the proposed contract change, and re-confirm with the user via
`ExitPlanMode` before continuing. Do not silently mutate the shape
after the initial gate.

## Step 3 — Cache key namespace

Pick a short identifier (e.g. `coerce`, `schemaFromType`). Cache
entries register under `<fnname>_<runtypeID>`.

**Critical**: do NOT reuse the bare runtype ID. Different JIT fns
for the same runtype must have distinct cache keys, otherwise the
second-registered fn overwrites the first.

## Step 4 — Go-side emitter

Create one new file `internal/compiled/typefns/<fnname>.go` implementing
the `Emitter` interface (see `internal/compiled/typefns/emitter.go`):

```go
type <FnName>Emitter struct{}

func (<FnName>Emitter) Args() []ArgSpec { /* greek-letter args + defaults from step 1 */ }
func (<FnName>Emitter) Supports(rt *protocol.RunType) bool { /* kind set */ }
func (<FnName>Emitter) IsJitInlined(ctx *EmitContext) bool { return DefaultIsJitInlined(ctx) }
func (<FnName>Emitter) ReturnName() string { return "<return-id-from-step-1>" }
func (<FnName>Emitter) Emit(rt *protocol.RunType, ctx *EmitContext, expectedCType CodeType) JitCode {
    switch rt.Kind {
    case protocol.KindString: /* matches sketch from step 1 */
    case protocol.KindArray: /* matches sketch from step 1 */
    // ... one case per kind ...
    }
}
func (<FnName>Emitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string { /* ... */ }
func (<FnName>Emitter) Finalize(raw string) (string, bool) { /* append return <ReturnName> */ }
```

**Architectural rule**: keep the entire switch in this one file.
Don't split kind logic across per-kind files — the convention is
"one giant switch per JIT fn family." Look at
`internal/compiled/typefns/istype.go` and `typeerrors.go` as templates
for file shape (not for semantics).

If the function needs path tracking, use `EmitContext`:
- `ctx.SetChildPathLiteral(literal)` — set BEFORE `ctx.CompileChild`
- `ctx.AccessPathLiteral(extra)` — get current path as JS array literal

If the function needs new pure fns, add them to
`packages/ts-go-run-types/src/run-types-pure-fns.ts` AND register
them in the pure-fns cache. Then declare the dependency from your
emitter via `ctx.AddPureFnDependency(<name>)`.

## Step 5 — Cache module registration

Five short mechanical edits, mirroring the `isType` / `typeErrors`
plumbing exactly:

- `internal/constants/constants.go` — add `<fnname>` entry to
  `CacheModules` with `Name: "<fnname>Module"` and `VarPrefix:
  "<fnname>_"`
- `internal/cachetpl/splice.go` — add `Skeleton<FnName>` constant
  pointing at `<fnname>Cache.ts`
- `internal/protocol/protocol.go` — add `CacheKind<FnName> CacheKind
  = "<fnname>"`; add `<FnName>CacheSource string` and `Added<FnName>
  bool` to `Response`; extend `MarshalJSON`
- `internal/resolver/dispatch.go` — wire `want<FnName>` flag mirroring
  `wantIsType`; honour `CacheKind<FnName>` in `OpScanFiles` + `OpDump`
- `internal/resolver/render.go` — add `render<FnName>Module(dump)`
- `internal/compiled/typefns/module.go` — add `<FnName>Module(w, dump)`
  one-liner + `Any<FnName>Supported(runTypes)` helper

## Step 6 — JS-side adapter

Three new files + two edits:

- NEW `packages/ts-go-run-types/src/create<FnName>.ts` — exports
  `create<FnName><T>()` + `deserialize<FnName><T>()` factories plus
  the `<FnName>Fn` type. Cache lookup uses namespaced key
  `'<fnname>_' + id`. Noop fallback matches whatever you specified
  in step 1.

- NEW `packages/ts-go-run-types/src/caches/<fnName>Cache.ts` —
  hand-authored skeleton with the `// #### REPLACE HERE ####` marker.
  Mirror `isTypeCache.ts` / `getTypeErrorsCache.ts` shape.

- `packages/ts-go-run-types/src/caches/skeletons.go` — extend the
  `//go:embed` directive to include `<fnName>Cache.ts`

- `packages/ts-go-run-types/src/index.ts` — import + bootstrap the
  new cache. **Load-order matters**: if the new fn uses pure fns,
  import `pureFn.ts` BEFORE the new factory. Pure fns must register
  first, otherwise the cache's `createJitFn` closures fail with
  `cpf_<name> is not a function` at runtime. Then re-export
  `create<FnName>`, `deserialize<FnName>`, and any new types.

## Step 7 — Vite plugin wiring

Two edits:

- `packages/vite-plugin-runtypes/src/index.ts` — extend
  `CACHE_FILE_RE`, `CACHE_KIND_BY_FILE`, `pickCacheSource` switch,
  and `handleHotUpdate`'s `kindsToInvalidate` array

- `packages/vite-plugin-runtypes/src/protocol.ts` (and
  `resolver-client.ts` if it duplicates) — add `'<fnname>'` to the
  `CacheKind` union and `added<FnName>?: boolean` +
  `<fnName>CacheSource?: string` to the response type

## Step 8 — Generalize the test suite name (FIRST non-validator fn only)

When you're adding the first JIT fn whose semantics isn't "is this
value valid", rename:

- `packages/ts-go-run-types/test/suites/validation-suite.ts` →
  `jit-suite.ts`
- Interface `ValidationCase` → `JitCase`
- Export `VALIDATION_SUITE` → `JIT_SUITE`
- Update imports in `test/adapters/*.test.ts`

Subsequent fns just add new optional thunks to the existing `JitCase`
interface — no further renames.

## Step 9 — Per-case thunks in the suite

Add four optional thunks per `JitCase`:

```ts
<fnname>?: () => <FnName>Fn;
<fnname>Reflect?: () => <FnName>Fn;
deserialize<FnName>?: () => <FnName>Fn;
deserialize<FnName>Reflect?: () => <FnName>Fn;
```

Plus an expected-output thunk whose shape depends on the function
family:

- **Validators returning bool**: no expected thunk — pass = `true`
  for `valid`, `false` for `invalid`
- **Validators returning errors**: `getExpected<FnName>: () =>
  <ErrorShape>[][]` indexed parallel to `getSamples().invalid`
- **Serializers**: no expected thunk — success = round-trip. Adapter
  asserts `deserialize(serialize(v))` deeply equals `v` for every
  valid sample. Invalid samples are not exercised.
- **Other transforms** (e.g. coerce): design an expected-output
  thunk shape during step 1 and surface it in the plan-mode gate
  for user approval.

## Step 10 — New adapter test file

Create `packages/ts-go-run-types/test/adapters/<fnname>.test.ts`
mirroring `isType.test.ts` shape exactly. Same 10 describe blocks:
ATOMIC, ARRAY, OBJECT, TUPLE, UNION, TEMPLATE_LITERAL, NATIVE,
CIRCULAR, UTILITY, TYPE_MAPPINGS.

The per-case `assert<FnName>` helper runs four passes (static /
reflect / deserialize-static / deserialize-reflect), each gated on
the matching thunk being defined.

**Strict coverage guard** — each describe block ends with:

```ts
it('all atomic <fnname> tests ran', () => {
  expect(ranTests).toBe(Object.keys(JIT_SUITE.ATOMIC).length);
});
```

Use `Object.keys(...).length`, NOT a soft filter — the strict count
catches drift when a case is added without a matching `it()`.

## Step 11 — Round-trip success criterion (serializers)

For serializer fn families, success is
`expect(deserialize(serialize(v))).toEqual(v)` deep equality. The
adapter helper bundles this:

```ts
function assert<FnName>(c: JitCase): void {
  const serialize = c.<fnname>!();
  const restore = c.deserialize<FnName>?.() ?? ((v: unknown) => v);
  for (const v of c.getSamples().valid) {
    expect(restore(JSON.parse(JSON.stringify(serialize(v))))).toEqual(v);
  }
}
```

## Step 12 — Phased implementation

Implement one kind category at a time, in this order:

1. atomic
2. array
3. object / members
4. tuple
5. function
6. native (Map / Set / Promise)
7. union
8. intersection
9. circular
10. utility
11. type-mappings

Each phase ends green end-to-end before moving on:
- Go build + Go tests pass
- Adapter test for the new fn passes for kinds shipped so far
- All previously-shipped fn adapter tests still pass
- Vite plugin tests pass

Do not bundle phases.

## Step 13 — Architectural invariants

- All logic for the new fn lives in the single Go switch file
  (`internal/compiled/typefns/<fnname>.go`). Don't spread kind logic
  across per-kind files.
- The walker is fn-agnostic. Don't touch `walker.go` unless you
  genuinely need new plumbing.
- Cache keys are namespaced (`<fnname>_<runtypeID>`).
- Pure fns must register before any cache module that uses them.
- TypeScript resolves mapped / conditional / utility types eagerly
  at the type-checker layer. The emitter only ever sees concrete
  kinds. Don't try to handle type-level operators in Go.

## Step 14 — Verification

At the end of each phase and at the very end:

```bash
cd /home/user/ts-run-types
go build -o bin/ts-go-run-types ./cmd/ts-go-run-types
go test ./internal/...
pnpm exec vitest run test/adapters/<fnname>.test.ts \
  test/adapters/isType.test.ts test/adapters/getTypeErrors.test.ts
pnpm --filter vite-plugin-runtypes test
```

Final whole-monorepo gate:

```bash
pnpm run pre-publish-test
```

## Reference files (read-only citations)

**Existing Go emitters as templates for file shape (NOT semantics):**
- `internal/compiled/typefns/istype.go`
- `internal/compiled/typefns/typeerrors.go`

**Walker + emitter interface:**
- `internal/compiled/typefns/walker.go`
- `internal/compiled/typefns/emitter.go`
- `internal/compiled/typefns/module.go`

**Cache registration:**
- `internal/constants/constants.go`
- `internal/cachetpl/splice.go`
- `internal/protocol/protocol.go`
- `internal/resolver/dispatch.go`
- `internal/resolver/render.go`

**JS adapter templates:**
- `packages/ts-go-run-types/src/createIsType.ts`
- `packages/ts-go-run-types/src/createGetTypeErrors.ts`

**Cache skeletons:**
- `packages/ts-go-run-types/src/caches/isTypeCache.ts`
- `packages/ts-go-run-types/src/caches/getTypeErrorsCache.ts`
- `packages/ts-go-run-types/src/caches/skeletons.go`

**Pure fns:**
- `packages/ts-go-run-types/src/run-types-pure-fns.ts`

**Index:**
- `packages/ts-go-run-types/src/index.ts`

**Vite plugin:**
- `packages/vite-plugin-runtypes/src/index.ts`
- `packages/vite-plugin-runtypes/src/protocol.ts`

**Test suite + adapters:**
- `packages/ts-go-run-types/test/suites/validation-suite.ts`
  (or `jit-suite.ts` post-rename)
- `packages/ts-go-run-types/test/adapters/isType.test.ts`
- `packages/ts-go-run-types/test/adapters/getTypeErrors.test.ts`
