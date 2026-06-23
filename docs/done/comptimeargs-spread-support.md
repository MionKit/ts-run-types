# Support the spread operator inside `CompTimeArgs` object / array literals

> **Status: DONE (shipped 2026-06-23).** A spread of a statically-resolvable
> `const` (or inline) container fragment inside a `CompTimeArgs<T>` /
> `CompTimeFnArgs<T>` literal is now accepted — `object({...base, name: string()})`,
> `createJsonDecoder<T>({...preset, strategy: 'mutate'})`. Parts A, B and C all
> shipped, with cross-module operand support (Decision 2) and shape-mismatch
> rejection (Decision 3). A spread whose operand is dynamic, non-`const`, or a
> shape mismatch still raises `CTA003`.
>
> **What shipped vs. this note:**
> - **Part A** — `comptimeargs.ResolveSpreadContainer` (in
>   [values.go](../../internal/comptimeargs/values.go)) resolves the operand
>   through wrappers + `const` chain + **import aliases**; `checkObjectSpread` /
>   `checkArraySpread` ([comptimeargs.go](../../internal/comptimeargs/comptimeargs.go))
>   accept ONLY a resolved literal of the matching kind. Soundness refinement
>   over the original sketch: rejection is on the resolved KIND, not by
>   re-validating the operand as a bare literal — a scalar `const` is a valid
>   literal leaf but is NOT a valid spread operand, so a "re-validate the
>   operand" fallback would wrongly accept `{...someStringConst}`. All bad
>   spreads therefore report a single uniform `CTA003` reason rather than the
>   CTA001/CTA003 split this note proposed.
> - **Part B** — free for builders, as predicted. Pinned by exact-inference
>   typesafety tests (object spread + tuple/union spread of a tuple operand).
> - **Part C** — `eachOptionProperty` threads the `*checker.Checker` and
>   descends into spreads in source order; both readers are now last-write-wins
>   (`extractValidateOptions` deletes on an explicit `false`,
>   `extractStrategyOption` takes the latest) so an inline key overrides a
>   spread-in key.
>
> Original design note retained below for context.

## Motivation

The value-first builders deliberately mirror what the type-first API can express.
Type-first composition ("split + merge") is free — `interface User extends Base`,
`A & B`, intersections — so the value-first equivalent should be too. The natural
spelling is the spread operator:

```ts
// schema fragments shared across many types
const base = {id: number(), createdAt: date()};

const User = object({...base, name: string()});      // wanted
const Post = object({...base, title: string()});     // wanted

// shared option presets across many call sites
const strict = {noLiterals: true, noIsArrayCheck: true} as const;
const isUser = createValidate<User>(undefined, {...strict, rejectCircularRefs: true});  // wanted
```

All three raise `CTA003` today.

## Current behavior (what we reject and where)

The shared literal validator rejects spread in both container kinds:

- object spread (`{...x}`) → [internal/comptimeargs/comptimeargs.go:312](../../internal/comptimeargs/comptimeargs.go) (`KindSpreadAssignment`)
- array spread (`[...x]`) → [internal/comptimeargs/comptimeargs.go:330](../../internal/comptimeargs/comptimeargs.go) (`KindSpreadElement`)
- diagnostic `CTA003` lists "spread" as a forbidden construct ([codes_marker.go:38](../../internal/diag/codes_marker.go), user fix text in [diagnosticCatalog.ts:187](../../packages/runtypes-devtools/src/diagnosticCatalog.ts))
- pinned by tests `TestComposerCTA_TupleSpreadRejected` / `TestComposerCTA_UnionSpreadRejected` ([comptimeargs_composer_test.go:100](../../internal/resolver/comptimeargs_composer_test.go))

`CheckLiteral` already const-traces a *whole* identifier
(`const opts = {...}; createValidate(undefined, opts)` works — [comptimeargs.go:361](../../internal/comptimeargs/comptimeargs.go)).
The gap is purely **merging two fragments**.

## Key insight — there are two consumer classes, and spread costs them very differently

The shared validator `comptimeargs.CheckLiteral` (entry [comptimeargs.go:89](../../internal/comptimeargs/comptimeargs.go),
called from [scan.go:783](../../internal/resolver/scan.go)) guards both markers, but the
two classes of consumer use the literal differently:

1. **Value-first builders** (`object` / `union` / `tuple` / `intersection` / `record` /
   `propMod` / … in [compose.ts](../../packages/ts-runtypes/src/schema/compose.ts)) —
   the literal **value is discarded**. The scanner reflects the whole composed type
   off the `InjectRunTypeId<…>` brand ([compose.ts:23-34](../../packages/ts-runtypes/src/schema/compose.ts)).
   **TypeScript itself performs the spread merge at the type level.** So once the
   syntactic guard allows spread, builders get correct results with **zero**
   Go-side merge logic. **This is the easy, high-value part.**

2. **Option bags** (`CompTimeFnArgs<ValidateOptions>` / `<JsonEncoderOptions>` / … on
   `createValidate`, `createJsonEncoder`, `createJsonDecoder`, the `huk`/`suk`/… group)
   — the literal **value is read from the AST** to compute the fn-hash variant.
   `eachOptionProperty` walks the literal positionally and **silently skips spreads**
   ([scan.go:613-620](../../internal/resolver/scan.go)); `extractValidateOptions`
   ([scan.go:733](../../internal/resolver/scan.go)) and `extractStrategyOption`
   ([scan.go:651](../../internal/resolver/scan.go)) both go through it. Here spread
   needs **real merge logic** in Go.

   > Note: the type channel (`TypeLiteralObject`, [typevalues.go:37](../../internal/comptimeargs/typevalues.go))
   > can NOT substitute here. The option-bag param types (`ValidateOptions`, etc.)
   > are non-`const`, so `{noLiterals: true}` widens its property to `boolean` — the
   > literal `true` exists only in the AST tokens. The AST read is mandatory, and
   > so is an AST-level merge.

## ⚠️ Soundness coupling — do not relax the guard alone

`CheckLiteral` is shared by both markers ([scan.go:352-365](../../internal/resolver/scan.go)).
If we relax it to accept spread **without** also teaching the option-bag readers to
merge, then `createValidate<T>(undefined, {...strict, rejectCircularRefs: true})` would
**pass validation and then silently drop** `strict`'s options → wrong fn-hash → wrong
validator variant. That is a silent correctness regression. So Part C below is **not
optional** unless we explicitly gate the relaxation by marker kind (see Decision 1).

## Scope

Spread of a **statically-resolvable container** inside a `CompTimeArgs` / `CompTimeFnArgs`
object or array literal:

- object spread whose operand resolves to an **object literal** (`{...base}`)
- array spread whose operand resolves to an **array literal** (`[...members]`)

Operand may be an inline literal or an identifier const-traced to one (same rules as
the existing identifier trace, plus Decision 2 on cross-module).

## Implementation

### Part A — relax the shared validator (`internal/comptimeargs/comptimeargs.go`)

In `checkObjectLiteral` replace the `KindSpreadAssignment` rejection with: unwrap the
spread's expression and `CheckLiteral` it (depth+1, same `builderCall` predicate); the
operand must resolve to an **object literal** (reject a spread whose operand is a
non-object, e.g. a string/array, with a precise reason). Mirror it in `checkArrayLiteral`
for `KindSpreadElement` (operand must resolve to an **array literal**). Keep the
`DepthCap` threading and keep rejecting spread of a dynamic operand (call result,
ternary, `let`/`var`) — that still yields `CTA001`/`CTA003`, which is correct.

### Part B — builders (free once Part A lands)

No Go value-merge needed. Verify the **type** still infers correctly through the spread:

- `object({...base, x})` — object spread always merges cleanly; rock-solid.
- `union([...base, extra])` / `tuple([...base, extra])` — these capture with `const T`
  (see the inference notes at [compose.ts:29-34, 171-174](../../packages/ts-runtypes/src/schema/compose.ts)).
  A spread of a **tuple** operand preserves tuple-ness; a spread of a plain `RunType[]`
  operand collapses to an array (losing per-slot precision). Document that the operand
  must be a tuple (`as const` / const-inferred) and pin it with a typesafety test.

### Part C — option bags (the careful part, `internal/resolver/scan.go`)

Teach `eachOptionProperty` to handle `KindSpreadAssignment`: resolve the operand to its
object-literal declaration (reuse `comptimeargs.EachConstVariableDeclaration` /
`resolveConstInitializer`), then recurse into its properties **in source order** so the
existing last-write-wins behavior of the callers gives correct override semantics
(`{...a, x: 1, ...b}` → b.x beats inline x beats a.x). This needs the `*checker.Checker`
threaded into `eachOptionProperty` and its two callers (today they take only
`call, lastIndex, argsCount`). Respect `DepthCap` to bound pathological const chains.

## Design decisions to settle before coding

1. **Option bags: merge (Part C) or gate?** Recommended: **do Part C** — it is what
   "same features in both places" means, and the merge is mechanical. The minimal
   fallback is to gate Part A by marker kind (allow spread for `KindCompTimeArgs`, keep
   rejecting for `KindCompTimeFnArgs`) and ship builders only — but that leaves option
   presets un-mergeable and is a weaker story.
2. **Cross-module operand?** The split-and-merge use case is strongest when `base` is
   an **imported** shared fragment. The existing identifier trace is deliberately
   same-module ([values.go:22-26](../../internal/comptimeargs/values.go)), but the regex
   trace already crosses modules via `ResolveImportAlias` ([values.go:27, 80](../../internal/comptimeargs/values.go)).
   Recommended: **follow import aliases for the spread operand** (both the Part A guard
   trace and the Part C value trace) so `import {base} from './schema'` works.
   Builders' type channel already resolves imported types cross-module, so rejecting
   cross-module spread there would be artificially restrictive.
3. **Non-container / shape-mismatched operand.** Reject object-spread of an
   array-literal operand and vice-versa (can't be statically merged in this model) with
   a clear `CTA003` reason. Reject spread of a non-`const` binding (`CTA001`).

## Out of scope

- `PureFunction<F>` — uses the stricter `CheckLiteralFunction` (arrow/function only);
  spread does not apply.
- Format-pattern args (`registerFormatPattern`, `string({pattern})`) — read via the
  type channel; not part of this change.
- A recursive value-config DSL — still explicitly **not** pursued (ROADMAP "Deliberate
  boundary"). This change is only the spread sugar over existing literal containers.

## Test plan

- **Go (`internal/comptimeargs`)** — new accept tests: inline object/array spread,
  const-traced operand, nested spread, override order; keep reject tests for dynamic /
  non-container / shape-mismatched / non-`const` operands.
- **Go (`internal/resolver`)** — **flip** `TestComposerCTA_TupleSpreadRejected` /
  `TestComposerCTA_UnionSpreadRejected` ([comptimeargs_composer_test.go:100](../../internal/resolver/comptimeargs_composer_test.go))
  from "rejected" to "accepted + correct reflected type". New `extractValidateOptions`
  / `extractStrategyOption` merge tests proving spread-merged options select the right
  fn-hash variant (and override order is honored). If Decision 2 = cross-module, a
  two-file fixture.
- **JS typesafety (`packages/ts-runtypes/test/typesafety.test.ts`)** — `object` spread
  infers the merged `Static`; `union`/`tuple` spread of a tuple operand preserves
  per-slot types.
- **Vite plugin (`packages/runtypes-devtools/test`)** — one end-to-end spread case
  through the real binary (build the binary first per SETUP.md).
- Marker-coverage rule still applies where the site is reflection-shaped.

## Docs to update

- [diagnosticCatalog.ts CTA003](../../packages/runtypes-devtools/src/diagnosticCatalog.ts) —
  reword: spread of a `const`-bound literal is now allowed; the "replace spread with a
  literal" fix becomes "spread a `const` fragment" and the remaining rejected cases
  (dynamic / non-container operand) stay.
- [markers.ts](../../packages/ts-runtypes/src/markers.ts) JSDoc for `CompTimeArgs` /
  `CompTimeFnArgs` ("No spread" → "spread of a const-bound literal fragment is allowed").
- The package header comment in [comptimeargs.go](../../internal/comptimeargs/comptimeargs.go)
  (Accepted containers / Rejected constructs lists).
- Website value-first docs (per the **Website docs style** in CLAUDE.md) — show the
  `object({...base, …})` composition pattern.
- `docs/ARCHITECTURE.md` if the const-trace policy changes to cross-module.

## Acceptance

- `object({...base, name: string()})` and `union`/`tuple` with a tuple-operand spread
  compile, reflect the merged type, and converge on the same structural id as the
  type-first equivalent.
- `createValidate` / `createJson*` option bags with a spread select the **same**
  fn-hash variant as the fully-inlined equivalent (no silent option drop).
- Spread of a dynamic / non-container / non-`const` operand still errors with a precise
  `CTA0xx` diagnostic.
- `go test ./internal/...` and `pnpm test` green; the flipped composer tests assert the
  new accept behavior.
