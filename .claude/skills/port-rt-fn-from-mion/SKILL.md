---
name: port-rt-fn-from-mion
description: Port a RT function (validator, serializer, coercer, …) from @mionjs/run-types into the ts-go-run-types Go-side AOT compiler + JS adapter + test suite. Use when the user asks to add isType-style / typeErrors-style / prepareForJson / jsonStringify / jsonDecode / coerce / any other named RT family that already exists in the mion run-types package.
argument-hint: <fn-name>  (e.g. isType — OR a serialize/deserialize pair like "jsonStringify jsonDecode")
effort: high
---

# Port a RT function from `@mionjs/run-types` into `ts-go-run-types`

Use this skill when the target RT function already has a reference
implementation in mion (`mion/packages/run-types/src/nodes/**/emit<Fn>.ts`).
The mion source is the contract; your job is to mirror its emitted JS,
its arg shape, and its pure-fn dependencies into the Go-side AOT
compiler + JS-side adapter + shared test suite.

## Serialization functions: BOTH halves must be ported together

If the target function is part of a serialize/deserialize pair
(`prepareForJson` ↔ `jsonDecode`, `jsonStringify` ↔ `jsonDecode`,
any encode/decode pairing), this skill REQUIRES both halves to be
ported in tandem. Reason: the only way to test a serializer's
correctness is the round-trip
`deserialize(serialize(v)) === v` — a half-ported serializer has
nothing to assert against and can't be progressively verified.

**Before doing anything else, if the user asked for a serializer**:

- Confirm the user has provided BOTH function names (e.g. they said
  "port `jsonStringify` and `jsonDecode`", not just "port
  `jsonStringify`").
- If only one half was named, use `AskUserQuestion` to ask the user
  for the matching half explicitly. Suggest the obvious mion pairing
  as the first option. Do not proceed until both names are pinned.
- The plan, the phased rollout, and every per-phase verification
  step must cover both halves together — never ship phase N of
  serialize and phase N-1 of deserialize.

Validators (`isType`, `getTypeErrors`) and other single-fn families
(`coerce` returning a transformed value, `schemaFromType` returning
a schema object) don't have this constraint — they're one fn per
skill invocation.

## CRITICAL — present a plan before editing

This skill MUST follow this gate:

1. Run steps 1–2 (Investigation) **read-only**. No edits yet.
2. Then enter plan mode, write a per-port plan into the plan file
   covering everything from the investigation, and call
   `ExitPlanMode` to get user approval.
3. Only after the user approves the plan, proceed to step 3 and
   beyond (the actual implementation work).

The user explicitly wants this planning gate. Skipping it is a
correctness bug for this skill.

## Step 1 — Pre-flight investigation (read-only)

Locate the mion source for the target function. The patterns are:

- `mion/packages/run-types/src/nodes/**/emit<Fn>.ts` — per-kind
  emit implementations (one file per kind/category)
- `mion/packages/run-types/src/lib/rtFnCompiler.ts` — defines the
  per-fn `Compiler` class (args, return name, call helpers like
  `callRTErr`, `callRTErrWithPath`)

Build a list of every kind that has an `emit<Fn>` so the Go switch
can mirror it. Group them by category so the phased rollout maps
cleanly onto suite sections:

- atomic (string, number, boolean, bigint, symbol, null, undefined,
  void, never, any, unknown, literal, enum, object, regexp, date)
- array (Array<T>, ReadonlyArray<T>)
- object / members (objectLiteral, property, propertySignature,
  indexSignature, method, methodSignature)
- tuple (tuple, tupleMember including rest + optional)
- function (function, method, methodSignature, callSignature)
- native (Map, Set, Promise, Awaited<Promise>)
- union
- intersection
- templateLiteral
- utility (Partial, Required, Pick, Omit, Exclude, Extract,
  NonNullable, ReturnType, Readonly)

## Step 2 — Identify the wire contract (read-only)

Note the JS function's:

- **Argument names** — mion uses Greek-letter symbols: `vλl`, `pλth`,
  `εrr`, `δst`, etc. Preserve those exactly in the Go `Args()` return
  so the emitted JS matches mion's shape.
- **Return value identifier** — what gets `return <name>;` at the
  body's end. For `isType` it's `v` (the input value, narrowed via
  boolean expression). For `typeErrors` it's `er` (the accumulated
  error array). For serializers it's typically the transformed
  output identifier.
- **Pure-fn dependencies** — anything called via
  `comp.getPureFn('mion::<name>')` in the mion emit code. Check
  whether each is already exported from
  `packages/ts-go-run-types/src/run-types-pure-fns.ts` or whether
  you'll need to add new pure-fn entries.
- **Success semantic** for the test adapter — boolean predicate?
  Error accumulator? Round-trip pair (serialize then deserialize
  should equal original)?

## Step 3 — Plan-mode gate (MANDATORY)

With investigation done, enter plan mode and write a per-port plan
into the plan file covering:

- The target fn name + cache namespace (e.g. `prepareForJson` →
  `prepareForJson_<hash>` cache keys). **For serializers, BOTH
  halves with their respective namespaces** (e.g. `prepareForJson_`
  and `jsonDecode_`).
- The kind list bucketed by phase (one phase per category)
- The wire contract from step 2 (args, return, pure-fn deps, success
  semantic). **For serializers, the contract for BOTH halves plus
  the round-trip equality criterion** (`deserialize(serialize(v))`
  must `toEqual(v)` for every valid sample).
- Any new pure fns that need adding to `run-types-pure-fns.ts`
  (both halves of a pair may need different pure fns; list them
  separately).
- Whether this is the FIRST non-validator port (and therefore
  triggers the `validation/` → `rt-suite.ts` rename — see
  step 8; note: the rt-suite rename did not stick in the current tree —
  the active suites are `validation/` + `serialization/`
  + format suites; a further rename is a separate decision)
- The verification commands from step 14, including the round-trip
  assertion for each serializer pair.

Call `ExitPlanMode` and wait for the user to approve.

**Do NOT proceed to step 4 until approved.**

## Step 4 — Cache key namespace

Pick a short identifier (`isType`, `typeErrors`, `prepareForJson`).
Cache entries register under `<fnname>_<runtypeID>`.

**Critical**: do NOT reuse the bare runtype ID. Different RT fns
for the same runtype must have distinct cache keys, otherwise the
second-registered fn overwrites the first.

## Step 5 — Go-side emitter

Create one new file `internal/compiled/typefns/<fnname>.go` implementing
the `Emitter` interface (see `internal/compiled/typefns/emitter.go` for
the interface definition):

```go
type <FnName>Emitter struct{}

func (<FnName>Emitter) Args() []ArgSpec { /* greek-letter args + defaults */ }
func (<FnName>Emitter) Supports(rt *protocol.RunType) bool { /* kind set */ }
func (<FnName>Emitter) IsRTInlined(ctx *EmitContext) bool { return DefaultIsRTInlined(ctx) }
func (<FnName>Emitter) ReturnName() string { return "<return-id>" }
func (<FnName>Emitter) Emit(rt *protocol.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
    switch rt.Kind {
    case protocol.KindString: /* ... */
    case protocol.KindArray: /* ... */
    // ... one case per kind ...
    }
}
func (<FnName>Emitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string { /* ... */ }
func (<FnName>Emitter) Finalize(raw string) (string, bool) { /* append return <ReturnName> */ }
```

**Architectural rule**: keep the entire switch in this one file.
Don't split kind logic across per-kind files — the convention is
"one giant switch per RT fn family." Look at
`internal/compiled/typefns/istype.go` and `typeerrors.go` as templates.

If the function needs path tracking (e.g. errors need to report
"where in the value"), use the path-tracking infrastructure already
on `EmitContext`:
- `ctx.SetChildPathLiteral(literal)` — set BEFORE `ctx.CompileChild`,
  attaches a path segment to the next-pushed frame
- `ctx.AccessPathLiteral(extra)` — get the current path as a JS
  array literal

## Step 6 — Cache module registration

Five short mechanical edits. Mirror the `isType` / `typeErrors`
plumbing exactly:

- `internal/constants/constants.go` — add `<fnname>` entry to the
  `CacheModules` map with `Name: "<fnname>Module"` and `VarPrefix:
  "<fnname>_"`
- `internal/cachetpl/splice.go` — add a `Skeleton<FnName>` constant
  pointing at `<fnname>Cache.ts`
- `internal/protocol/protocol.go` — add `CacheKind<FnName> CacheKind
  = "<fnname>"`; add `<FnName>CacheSource string` and `Added<FnName>
  bool` to `Response`; extend `MarshalJSON` to surface both
- `internal/resolver/dispatch.go` — wire `want<FnName>` flag mirroring
  `wantIsType`; honour `CacheKind<FnName>` in `OpScanFiles` + `OpDump`;
  set `Added<FnName>` and populate `<FnName>CacheSource`
- `internal/resolver/render.go` — add `render<FnName>Module(dump)`
  that calls into the new emitter
- `internal/compiled/typefns/module.go` — add `<FnName>Module(w, dump)`
  one-liner that calls `RenderFnModule(w, dump,
  CacheModules["<fnname>"], <FnName>Emitter{}, "<fnname>_",
  cachetpl.Skeleton<FnName>)` plus `Any<FnName>Supported(runTypes)`
  helper alongside `AnyIsTypeSupported`

## Step 7 — JS-side adapter

Three new files + two edits:

- NEW `packages/ts-go-run-types/src/create<FnName>.ts` — exports
  `create<FnName><T>()` + `deserialize<FnName><T>()` factories plus
  the `<FnName>Fn` type. Cache lookup uses the namespaced key
  `'<fnname>_' + id`. Noop fallback (for `any` / `unknown` that
  produce empty cache entries) returns the fn's identity value:
  - Predicates → `() => true`
  - Error accumulators → `() => []`
  - Identity transforms → `(v) => v`
  - JSON stringifiers → `(v) => JSON.stringify(v)`

- NEW `packages/ts-go-run-types/src/caches/<fnName>Cache.ts` —
  hand-authored skeleton with the `// #### REPLACE HERE ####` marker
  exactly where the Go renderer should splice in the factory calls.
  Mirror `isTypeCache.ts` / `getTypeErrorsCache.ts` shape.

- `packages/ts-go-run-types/src/caches/skeletons.go` — extend the
  `//go:embed` directive to include `<fnName>Cache.ts`

- `packages/ts-go-run-types/src/index.ts` — import + bootstrap the
  new cache. **Load-order matters**: if the new fn uses pure fns,
  import `pureFn.ts` BEFORE the new factory module. Pure fns must
  register first, otherwise the cache's `createRTFn` closures fail
  with `cpf_<name> is not a function` at runtime. Then re-export
  `create<FnName>`, `deserialize<FnName>`, and any new types
  (`<FnName>Fn` etc.)

## Step 8 — Vite plugin wiring

Two edits:

- `packages/vite-plugin-runtypes/src/index.ts` — extend
  `CACHE_FILE_RE` regex to match `<fnName>Cache`; extend
  `CACHE_KIND_BY_FILE` with `<fnName>Cache: '<fnname>'`; extend
  `pickCacheSource` switch with the new kind; extend
  `handleHotUpdate`'s `kindsToInvalidate` build to push
  `'<fnname>'` when `result.added<FnName>` is true.

- `packages/vite-plugin-runtypes/src/protocol.ts` (and
  `resolver-client.ts` if it duplicates the type) — add `'<fnname>'`
  to the `CacheKind` union and `added<FnName>?: boolean` +
  `<fnName>CacheSource?: string` to the response type.

## Step 9 — Generalize the test suite name (FIRST non-validator port only)

When you're adding the first serialization or coercion family (i.e.
the first RT fn whose semantics isn't "is this value valid"),
rename the test suite to reflect that it now covers more than
validation:

- `packages/ts-go-run-types/test/suites/validation/` →
  `rt-suite.ts`
- Interface `ValidationCase` → `RTCase`
- Export `VALIDATION_SUITE` → `RT_SUITE`
- Update imports in `test/adapters/*.test.ts`

**Note**: The rt-suite rename did not stick in the current tree. The
active suites are `validation/` (isType/getTypeErrors) +
`serialization/` (JSON families) + format suites. If the
rename is desirable, confirm with the user first — it is not a
prerequisite for adding new RT families.

Subsequent ports just add new optional thunks to the existing
interface — no further renames needed.

## Step 10 — Per-case thunks in the suite

Add four optional thunks per `RTCase` (or `ValidationCase` if you
haven't done the rename yet):

```ts
<fnname>?: () => <FnName>Fn;              // static form
<fnname>Reflect?: () => <FnName>Fn;        // reflect form
deserialize<FnName>?: () => <FnName>Fn;
deserialize<FnName>Reflect?: () => <FnName>Fn;
```

Plus an expected-output thunk whose shape depends on the function
family:

- **Validators returning bool** (`isType`): no expected thunk —
  pass = `true` for `valid` samples, `false` for `invalid`
- **Validators returning errors** (`getTypeErrors`):
  `getExpectedErrors: () => RunTypeError[][]` indexed parallel to
  `getSamples().invalid`
- **Serializers** (`prepareForJson`, `jsonStringify`, `jsonDecode`):
  no expected thunk — success = round-trip. The adapter asserts
  `deserialize(serialize(v))` deeply equals `v` for every valid
  sample. Invalid samples are not exercised (out-of-domain input
  for serializers).

## Step 11 — New adapter test file

Create `packages/ts-go-run-types/test/adapters/<fnname>.test.ts`
mirroring `isType.test.ts` shape exactly. Same 10 describe blocks:
ATOMIC, ARRAY, OBJECT, TUPLE, UNION, TEMPLATE_LITERAL, NATIVE,
CIRCULAR, UTILITY, TYPE_MAPPINGS.

The per-case `assert<FnName>` helper runs four passes (static /
reflect / deserialize-static / deserialize-reflect), each gated
on the matching thunk being defined.

**Strict coverage guard** — each describe block ends with:

```ts
it('all atomic <fnname> tests ran', () => {
  expect(ranTests).toBe(Object.keys(RT_SUITE.ATOMIC).length);
});
```

Use `Object.keys(...).length`, NOT a soft `.filter(c =>
c.<fnname>).length`. The strict count catches drift when a case is
added to the suite without a matching `it()` line.

## Step 12 — Round-trip success criterion for serializers

For any fn family whose semantics is "transform value", success is
defined as `expect(deserialize(serialize(v))).toEqual(v)` deep
equality. The adapter helper bundles this:

```ts
function assertPrepareForJson(c: RTCase): void {
  const prepare = c.prepareForJson!();
  const restore = c.jsonDecode?.() ?? ((v: unknown) => v);
  for (const v of c.getSamples().valid) {
    expect(restore(JSON.parse(JSON.stringify(prepare(v))))).toEqual(v);
  }
}
```

If the function comes as a serialize/deserialize pair, both halves
land together so the round-trip test is meaningful from phase 1.

## Step 13 — Phased implementation

Port one kind category at a time, in this order:

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
11. type-mappings (key remapping via `as` clauses)

Each phase ends green end-to-end before moving on:

- Go binary builds + Go tests pass
- Adapter test for the new fn passes for the kinds shipped so far
- Adapter tests for all previously-shipped fns still pass (no
  regressions)
- Vite plugin tests pass

Do not bundle phases. Each phase is a checkpoint.

**For serializer pairs, every phase ports BOTH halves together** —
e.g. phase 1 ships `prepareForJson` for atomic kinds AND `jsonDecode`
for atomic kinds. Phase 1 is not green until the round-trip test
(`deserialize(serialize(v))` deep-equals `v`) passes for every
atomic sample. Never advance to phase 2 with only one half of the
pair landed for phase 1 — there's nothing to verify against, and
the asymmetry compounds across phases.

If a kind genuinely cannot round-trip (e.g. `Date` serializes to
a string and the deserialized value's prototype must be restored
explicitly), surface that during the plan-mode gate; do not silently
skip the round-trip assertion for it.

## Step 14 — Architectural invariants

- All logic for the new fn lives in the single Go switch file
  (`internal/compiled/typefns/<fnname>.go`). Don't spread kind logic
  across per-kind files.
- The walker is fn-agnostic. Don't touch `walker.go` for a new fn
  unless you genuinely need new plumbing — e.g. `getTypeErrors`
  added `PathLiteral` once, and every later fn that needs paths
  reuses it.
- Cache keys are namespaced (`<fnname>_<runtypeID>`); never use the
  bare runtype ID.
- Pure fns must register before any cache module that uses them
  (verify import order in `index.ts`).
- TypeScript resolves mapped / conditional / utility types eagerly
  at the type-checker layer. The emitter only ever sees concrete
  kinds. Don't try to handle type-level operators in Go.

## Step 15 — Verification

At the end of each phase and at the very end, run:

```bash
cd /home/user/ts-run-types
go build -o bin/ts-go-run-types ./cmd/ts-go-run-types
go test ./internal/...
pnpm exec vitest run test/adapters/<fnname>.test.ts \
  test/suites/validation/isType.test.ts test/suites/validation/getTypeErrors.test.ts
pnpm --filter vite-plugin-runtypes test
```

Final whole-monorepo gate before pushing:

```bash
pnpm run pre-publish-test
```

## Reference files (read-only citations)

**Mion source of truth:**
- `mion/packages/run-types/src/nodes/**/emit<Fn>.ts`
- `mion/packages/run-types/src/lib/rtFnCompiler.ts`

**Existing Go emitters as templates:**
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
- `packages/ts-go-run-types/src/createRTFunctions.ts` (exports `createIsType`, `createGetTypeErrors`, `createJsonEncoder`, `createJsonDecoder`, and format helpers)
- `packages/ts-go-run-types/src/createBinary.ts` (exports `createBinaryEncoder`, `createBinaryDecoder`)

**Cache skeletons:**
- `packages/ts-go-run-types/src/caches/isTypeCache.ts`
- `packages/ts-go-run-types/src/caches/getTypeErrorsCache.ts`
- `packages/ts-go-run-types/src/caches/skeletons.go`

**Index:**
- `packages/ts-go-run-types/src/index.ts`

**Vite plugin:**
- `packages/vite-plugin-runtypes/src/index.ts`
- `packages/vite-plugin-runtypes/src/protocol.ts`

**Test suite + adapters:**
- `packages/ts-go-run-types/test/suites/validation/` (isType/getTypeErrors)
- `packages/ts-go-run-types/test/suites/serialization/` (JSON families)
- `packages/ts-go-run-types/test/suites/validation/isType.test.ts`
- `packages/ts-go-run-types/test/suites/validation/getTypeErrors.test.ts`
