# Value-first builders → RunType-construct / marker refactor (FUTURE)

> **Status: proposed, NOT scheduled.** This documents a future refactor of the
> `@mionjs/ts-go-run-types/define` package. Nothing here is implemented yet. The
> scope is deliberately narrow: **port the existing `define` functions onto a
> new authoring model** where each builder returns its branded format type
> directly (and can optionally become an injectable marker), retiring the
> `FieldConfig` / `FieldFormatMap` / `ModelType` mapping layer. No new format
> families, no composition (array/union/tuple) — those stay out of scope exactly
> as today (see [value-first-formats.md](value-first-formats.md)).

## TL;DR

Today a builder returns a **config object** and a type-level mapping recovers the
brand:

```ts
string({maxLength: 5})                       // ⇒ {type: 'string', formatParams: {maxLength: 5}}
type User = ModelType<typeof object({ ... })> // FieldConfig → FieldFormatMap → FieldType → ModelType
const isUser = createIsType<User>();
```

The refactor makes the builder **return the branded format type directly**, so
the mapping layer disappears:

```ts
string({maxLength: 5})                       // ⇒ FormatString<{maxLength: 5}>
type User = typeof object({ ... });          // already the model type, no mapping
const isUser = createIsType<User>();
```

…and (Tier 2, optional follow-on) lets each builder be an **injectable marker**
that resolves to a cached RunType at build time, reusing the existing
`InjectRunTypeId<T>` plumbing — the seed of the parked "value-call form".

## Why this is worth doing

1. **Deletes a whole type-level subsystem.** `FieldConfig` (11 members),
   `FieldFormatMap`, `FieldType`, `ParamsOf`, and the two-group `ModelType`
   mapping all exist *only* to translate `{type, formatParams}` config back into
   the branded format type. If the builder returns the brand, none of it is
   needed.
2. **Dissolves the kind/subKind discriminator question entirely.** The authoring
   layer never writes a discriminator — the Go binary derives `kind`/`subKind`
   by reflecting the branded *type*, exactly as it does for type-first today. See
   [§ The discriminator question](#the-discriminator-question-resolved).
3. **Unifies with the marker mechanism.** Builders become the same kind of
   plugin-injected marker as `getRunTypeId` / `createIsType`, instead of a
   parallel "config + type-channel reflection of `ModelType`" path.
4. **Foundation for the value-call form.** Tier 2 is the cheapest realistic path
   to `Model.isType(x)` style ergonomics (the parked Option B), built on existing
   infra rather than a new Go value-AST front-end.

## Empirical verification (the gate — already run, PASSED ✅)

Before writing this doc the core claims were verified against the **real Go
binary** via the marker package's vitest plugin. Result: **5/5 pass.**

| Probe | What it proves | Result |
|---|---|---|
| `createIsType<typeof object({string fields})>()` `toBe` type-first | branded-return builders converge, no `ModelType` | ✅ |
| same for a number-field model | numeric family converges | ✅ |
| same for an **optional** field (`{__opt}` carrier + object split) | `key?:` survives, converges | ✅ |
| same for a **temporal** field | temporal family converges | ✅ |
| custom builder with trailing `id?: InjectRunTypeId<FormatString<FP>>` | transformer injects a hash for a **new** function (no name hardcoding) and it **equals** `getRunTypeId<FormatString<{maxLength:5}>>()` | ✅ |

The first four prove **Tier 1** (return-the-brand) preserves structural-id
convergence with the type-first surface. The fifth proves **Tier 2** (builder-as-
marker) is mechanically supported by the existing wrapper rule in
[`markers.ts`](../packages/ts-go-run-types/src/markers.ts) ("Wrappers around
`getRunTypeId` / `reflectRunTypeId` are supported — declare the same trailing
parameter on the wrapper and the transformer treats it identically").

The full proof-of-concept source is in [Appendix A](#appendix-a--proof-of-concept-source)
— drop it in `packages/ts-go-run-types/test/adapters/` and run
`pnpm --filter @mionjs/ts-go-run-types exec vitest run <file>` to re-confirm.

## Current status (what exists today)

All in [`packages/ts-go-run-types/src/define/define.ts`](../packages/ts-go-run-types/src/define/define.ts):

- **Builders** (`string`, `number`, `bigint`, `date`, `boolean`, the 6
  `temporal.*`, `optional`, `object`) — runtime identities returning plain config
  data: `{type: '<tag>', formatParams: P}` (and `optional` adds `optional: true`).
  The `<tag>` is an authoring-only discriminator string.
- **Field config types** — `StringFieldConfig` … `PlainYearMonthFieldConfig`,
  unioned as `FieldConfig`; `ModelConfig = Record<string, FieldConfig>`.
- **The mapping** — `ParamsOf<F> = F['formatParams']`; `FieldFormatMap<P>` (the
  keyed lookup added recently); `FieldType<F>` (indexes the map by `F['type']`);
  `ModelType<C>` (two-group mapped type splitting optional/required, `-readonly`).
- **Consumption** — `createIsType<ModelType<typeof Model>>()`. The Go scanner
  reflects the resolved `ModelType<…>`, which is byte-identical to the
  hand-written `Format*<P>` types, so both front-ends converge on one structural
  id (asserted by
  [`valueFirstConvergence.test.ts`](../packages/ts-go-run-types/test/adapters/valueFirstConvergence.test.ts)).

The runtime config object survives in the bundle for Drizzle / OpenAPI / form
builders to read.

## Target design

### Tier 1 — builders return the branded format type (no marker change)

Each builder's **return type** becomes the format alias it stands for; the
`const` param capture is unchanged:

```ts
function string<const FP extends StringFamilyParams = {}>(fp: FP = {} as FP): FormatString<FP> { … }
function number<const FP extends NumberParams        = {}>(fp: FP = {} as FP): FormatNumber<FP> { … }
// …bigint → FormatBigInt<FP>, date → FormatDate<FP>, boolean → boolean,
//   temporal.instant → FormatTemporalInstant<FP>, … (one per orderable temporal)
```

`object` does the work `ModelType` used to do — strip the `const`-capture
`readonly`, split optional/required, unwrap the optional carrier:

```ts
function object<const C extends Record<string, unknown>>(c: C):
  {-readonly [K in keyof C as C[K] extends {__opt: unknown} ? never : K]:  C[K]} &
  {-readonly [K in keyof C as C[K] extends {__opt: unknown} ? K     : never]?: ValOf<C[K]>}
```

`optional` wraps in a **distinct carrier** (so it does NOT intersect a brand onto
the format type — that would corrupt `__rtFormatName`/`__rtFormatParams`):

```ts
function optional<const F>(field: F): {readonly __opt: F} { return {__opt: field}; }
type ValOf<F> = F extends {__opt: infer Inner} ? Inner : F;
```

Authoring becomes:

```ts
const UserModel = object({ name: string({maxLength: 50}), nick: optional(number({min: 0})) });
type User = typeof UserModel;               // already {name: FormatString<…>; nick?: FormatNumber<…>}
const isUser = createIsType<User>();        // unchanged marker, converges with type-first
```

**Deleted by Tier 1:** `FieldConfig` + all 11 `*FieldConfig` members,
`ModelConfig`, `ParamsOf`, `FieldFormatMap`, `FieldType`, `ModelType`,
`StringFamilyParams`'s role as a config field type (still needed as the
`string` param type). The only discriminator-ish read that remains is the tiny
`{__opt}` check for optionality — and that is *optionality*, not format family.

### Tier 2 — builders as injectable markers (optional follow-on)

Add the trailing injectable param so the builder itself resolves to a cached
RunType, per your sketch:

```ts
function string<const FP extends StringFamilyParams = {}>(
  fp: FP = {} as FP,
  id?: InjectRunTypeId<FormatString<FP>>,
): FormatString<FP> { /* runtime: return the cached node / branded carrier for `id` */ }
```

The transformer already injects `id` for any function with this trailing
parameter (verified — probe #5). This is what enables a future value-call form
(`object({...}).isType(x)` or `createIsType(model)`), where the runtime return is
the live RunType/validator bundle rather than a type-only carrier.

**Tier 2 is not required for Tier 1's win** and carries the open questions in
[§ Open design points](#open-design-points). Recommend landing Tier 1 first.

## The discriminator question — resolved

The earlier worry was that unifying on a single discriminator would force folding
`RunTypeSubKind` into `RunTypeKind`. **It does not**, for two reasons:

1. **The authoring layer never writes the discriminator.** In both tiers the
   builder returns a *branded type*; the Go binary sets `kind`/`subKind` by
   reflecting it. `kind`/`subKind` stay an internal protocol concern (and remain
   two orthogonal axes: `kind` = structural shape used by the node walkers,
   `subKind` = in-kind refinement — e.g. `date`/`map`/`set` are all
   `kind: object`; flattening them would break the kind-first dispatch in
   [`mockType.ts`](../packages/ts-go-run-types/src/mocking/mockType.ts) and ripple
   through the wire protocol, the generated
   [`runTypeKind.ts`](../packages/ts-go-run-types/src/runTypeKind.ts), and every
   Go compiler that branches on `subKind`).
2. **A flat format identity already exists.** If a single "what format is this"
   key is ever wanted, it is `FormatAnnotation.name` / the `__rtFormatName`
   brand string (`'stringFormat'`, `'numberFormat'`, `'nativeDate'`,
   `'temporalInstant'`, …) — already a single-axis label the Go side keys off
   ([`define.ts`](../packages/ts-go-run-types/src/define/define.ts) notes "the Go
   side keys off the brand's `__rtFormatName`, not this tag").

**Conclusion: do not refactor the kind/subKind protocol for this work.**

## Required changes — function-by-function port

| Symbol (today) | Action | Notes |
|---|---|---|
| `string(fp)` → `{type:'string'; formatParams}` | **Change return type** → `FormatString<FP>` | runtime: see [§ runtime shape](#open-design-points) |
| `number(fp)` | → `FormatNumber<FP>` | |
| `bigint(fp)` | → `FormatBigInt<FP>` | |
| `date(fp)` | → `FormatDate<FP>` (`nativeDate` brand) | |
| `boolean()` | → `boolean` | no brand, no params |
| `temporal.instant`…`plainYearMonth` (6) | → `FormatTemporal*<FP>` | keep the lowercase namespace + shared `temporalBuilder` factory; just retype its return |
| `optional(field)` | **Reimplement** → `{__opt: F}` carrier | must NOT intersect a brand onto the value |
| `object(config)` | **Reimplement** → optional/required split + `-readonly` + `ValOf` unwrap | absorbs what `ModelType` did |
| `ModelType<C>` | **Delete** (replaced by `typeof object({...})`) | keep a thin `type ModelType<M> = M` alias for one release if back-comat matters |
| `FieldConfig`, `*FieldConfig` (×11), `ModelConfig` | **Delete** | no longer the builder return shape |
| `FieldFormatMap`, `FieldType`, `ParamsOf` | **Delete** | mapping layer gone |
| `StringFamilyParams`, `ValuePattern` | **Keep** | still the `string` builder's param type (regex value-channel forms) |
| (Tier 2) all builders | **Add** trailing `id?: InjectRunTypeId<ReturnType>` | enables marker resolution / value-call form |

## Test & doc impact (in scope to update during the port)

- [`valueFirstConvergence.test.ts`](../packages/ts-go-run-types/test/adapters/valueFirstConvergence.test.ts)
  — switch `createIsType<ModelType<typeof X>>()` → `createIsType<typeof X>()`.
  These same-hash assertions are the regression guard for the port; they MUST
  stay green (the POC already shows they do).
- [`value-first-define-suite.ts`](../packages/ts-go-run-types/test/suites/value-first-define-suite.ts)
  — all `RT.ModelType<typeof Model>` → `typeof Model`; reflect-form thunks
  unchanged otherwise.
- [`typesafety.test.ts`](../packages/ts-go-run-types/test/typesafety.test.ts)
  — the cross-family misuse `@ts-expect-error` cases still hold (each builder
  still types its own params); add cases that the builder return type is the
  branded format (`expectTypeOf(string({maxLength:5})).toEqualTypeOf<FormatString<{maxLength:5}>>()`).
- Per the **marker-coverage rule** (CLAUDE.md): keep paired static/reflect tests
  for every ported scenario.
- [value-first-formats.md](value-first-formats.md) — update the usage examples
  (`type User = ModelType<…>` → `type User = typeof Model`) and the "discriminator
  insight" section (the `FieldType` lookup is gone; the brand IS the type).

## Open design points (decide before Tier 2)

1. **Runtime return shape (Drizzle/OpenAPI consumers).** Today's `{type,
   formatParams}` is human-readable schema. Options for the new builder runtime
   value: (a) the brand shape `{__rtFormatName, __rtFormatParams: fp}` —
   structurally faithful, still readable; (b) a live cached RunType node (Tier 2)
   — richest but engine-shaped; (c) keep returning `{type, formatParams}` at
   runtime while *typing* the return as the brand (type-lie, but preserves the
   ORM story). Pick deliberately; affects every external consumer.
2. **The type-lie.** A type-first `FormatString<P>` value is a real `string` at
   runtime; a builder result typed `FormatString<P>` will be an object. Safe only
   if builder results are never used where a real string is expected (they only
   flow into `object(...)` / reflection). Fence + document.
3. **Id-injection granularity (Tier 2).** If every leaf builder is a marker, a
   nested `string(...)` inside `object(...)` reflects redundantly with the
   object. Need a root-vs-nested rule (inject on standalone/root calls; treat
   nested builder results as type-only carriers) — analogous to the scanner's
   existing "skip `T` with a free type param" rule, but structural. This is the
   one genuinely new bit of plugin/Go logic.
4. **`optional` carrier leakage.** Confirm `{__opt}` never escapes `object`'s
   mapping into a reflected type (the POC unwraps it via `ValOf`); add a negative
   test that a bare `optional(string())` outside `object` is a type error or
   well-defined.

## Non-goals

- No composition (array / union / tuple / nullable / nested object) — unchanged
  scope boundary; those compose for free in the type channel.
- No kind/subKind protocol change.
- No new format families.

## Appendix A — proof-of-concept source

Verified against the real binary (5/5 pass). Stub builders stand in for the
ported ones; the assertions use the real `createIsType` / `getRunTypeId`
markers, so the Go binary does the reflection.

```ts
import {describe, expect, it} from 'vitest';
import {createIsType, getRunTypeId, type InjectRunTypeId} from '@mionjs/ts-go-run-types';
import type {FormatString, FormatNumber} from '@mionjs/ts-go-run-types/formats';
import type {FormatTemporalInstant} from '@mionjs/ts-go-run-types/formats/temporal';
import type {StringParams} from '../../src/formats/string/stringFormats.ts';
import type {NumberParams} from '../../src/formats/numberFormats.ts';
import type {MinMax} from '../../src/formats/datetime/dateTimeParams.ts';
import '@mionjs/ts-go-run-types/formats';

function pstring<const FP extends StringParams = {}>(fp: FP = {} as FP): FormatString<FP> {
  return fp as unknown as FormatString<FP>;
}
function pnumber<const FP extends NumberParams = {}>(fp: FP = {} as FP): FormatNumber<FP> {
  return fp as unknown as FormatNumber<FP>;
}
function pinstant<const FP extends MinMax = {}>(fp: FP = {} as FP): FormatTemporalInstant<FP> {
  return fp as unknown as FormatTemporalInstant<FP>;
}
function poptional<const F>(field: F): {readonly __opt: F} {
  return {__opt: field};
}
type ValOf<F> = F extends {__opt: infer Inner} ? Inner : F;
function pobject<const C extends Record<string, unknown>>(
  c: C
): {-readonly [K in keyof C as C[K] extends {__opt: unknown} ? never : K]: C[K]} & {
  -readonly [K in keyof C as C[K] extends {__opt: unknown} ? K : never]?: ValOf<C[K]>;
} {
  return c as never;
}

const StringFirst = pobject({
  short: pstring({maxLength: 5}),
  long: pstring({minLength: 3}),
  pick: pstring({allowedValues: {val: ['a', 'b']}}),
});
const NumberFirst = pobject({bounded: pnumber({min: 0, max: 10}), whole: pnumber({integer: true})});
const OptionalFirst = pobject({req: pstring({maxLength: 5}), opt: poptional(pnumber({min: 0}))});
const TemporalFirst = pobject({at: pinstant({min: '2020-01-01T00:00:00Z'})});

type StringFirstTF = {
  short: FormatString<{maxLength: 5}>;
  long: FormatString<{minLength: 3}>;
  pick: FormatString<{allowedValues: {val: ['a', 'b']}}>;
};
type NumberFirstTF = {bounded: FormatNumber<{min: 0; max: 10}>; whole: FormatNumber<{integer: true}>};
type OptionalFirstTF = {req: FormatString<{maxLength: 5}>; opt?: FormatNumber<{min: 0}>};
type TemporalFirstTF = {at: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'}>};

function pidstring<const FP extends StringParams = {}>(
  fp: FP = {} as FP,
  id?: InjectRunTypeId<FormatString<FP>>
): InjectRunTypeId<FormatString<FP>> {
  if (id === undefined) throw new Error('pidstring: no id injected');
  return id;
}

describe('POC — branded-return builders converge with type-first (no ModelType)', () => {
  it('string model', () => expect(createIsType<typeof StringFirst>()).toBe(createIsType<StringFirstTF>()));
  it('number model', () => expect(createIsType<typeof NumberFirst>()).toBe(createIsType<NumberFirstTF>()));
  it('optional field', () => expect(createIsType<typeof OptionalFirst>()).toBe(createIsType<OptionalFirstTF>()));
  it('temporal field', () => expect(createIsType<typeof TemporalFirst>()).toBe(createIsType<TemporalFirstTF>()));
  it('Tier-2: builder-as-marker gets an id injected, equal to the canonical marker', () => {
    const injected = pidstring({maxLength: 5});
    expect(injected).toBeTypeOf('string');
    expect(injected.length).toBeGreaterThan(0);
    expect(injected).toBe(getRunTypeId<FormatString<{maxLength: 5}>>());
  });
});
```
