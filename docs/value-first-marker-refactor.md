# Value-first builders → RunType-construct / marker refactor (FUTURE)

> **Status: proposed, NOT scheduled.** This documents a future refactor of the
> `@mionjs/ts-go-run-types/define` package. Nothing here is implemented yet. The
> scope is deliberately narrow: **port the existing `define` functions onto a
> new authoring model** where each builder returns its branded format type
> directly (and can optionally become an injectable marker), taking the
> `FieldConfig` / `FieldFormatMap` / `ModelType` mapping layer off the _forward
> authoring path_ (it is retained as a bidirectional bridge once the Tier-3
> inverse is in scope — see [§ Tier 3](#tier-3--runtype--typed-model-reflectmodel-the-inverse-direction)).
> No new format families, no composition (array/union/tuple) — those stay out of
> scope exactly as today (see [value-first-formats.md](value-first-formats.md)).

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

(Tier 3, also optional) adds the **inverse direction** — `reflectModel<T>()`
reconstructs a strongly-typed, discriminated runtime model _from_ the RunType,
for both value-first and type-first declarations. It re-uses `ModelType<C>` as
one half of a bidirectional type bridge (so those mapping types are retained,
not deleted — see [§ Tier 3](#tier-3--runtype--typed-model-reflectmodel-the-inverse-direction)).

**Three tiers, increasing scope:** Tier 1 (return the brand) is self-contained
and fully de-risked; Tiers 2–3 are independent follow-ons.

## Why this is worth doing

1. **Simplifies the forward authoring path.** `FieldConfig` (11 members),
   `FieldFormatMap`, `FieldType`, `ParamsOf`, and the two-group `ModelType`
   mapping exist _only_ to translate `{type, formatParams}` config into the
   branded format type. If the builder returns the brand, the forward path no
   longer routes through any of them (`typeof Model` is already the type). _Tier
   1 alone could delete them; with Tier 3 (§ inverse direction) they are retained
   as the bidirectional bridge_ — so the win is a simpler forward path plus
   unification, not raw deletion.
2. **Dissolves the kind/subKind discriminator question entirely.** The authoring
   layer never writes a discriminator — the Go binary derives `kind`/`subKind`
   by reflecting the branded _type_, exactly as it does for type-first today. See
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

| Probe                                                                 | What it proves                                                                                                                         | Result |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `createIsType<typeof object({string fields})>()` `toBe` type-first    | branded-return builders converge, no `ModelType`                                                                                       | ✅     |
| same for a number-field model                                         | numeric family converges                                                                                                               | ✅     |
| same for an **optional** field (`{__opt}` carrier + object split)     | `key?:` survives, converges                                                                                                            | ✅     |
| same for a **temporal** field                                         | temporal family converges                                                                                                              | ✅     |
| custom builder with trailing `id?: InjectRunTypeId<FormatString<FP>>` | transformer injects a hash for a **new** function (no name hardcoding) and it **equals** `getRunTypeId<FormatString<{maxLength:5}>>()` | ✅     |

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
function object<const C extends Record<string, unknown>>(
  c: C
): {-readonly [K in keyof C as C[K] extends {__opt: unknown} ? never : K]: C[K]} & {
  -readonly [K in keyof C as C[K] extends {__opt: unknown} ? K : never]?: ValOf<C[K]>;
};
```

`optional` wraps in a **distinct carrier** (so it does NOT intersect a brand onto
the format type — that would corrupt `__rtFormatName`/`__rtFormatParams`):

```ts
function optional<const F>(field: F): {readonly __opt: F} {
  return {__opt: field};
}
type ValOf<F> = F extends {__opt: infer Inner} ? Inner : F;
```

Authoring becomes:

```ts
const UserModel = object({name: string({maxLength: 50}), nick: optional(number({min: 0}))});
type User = typeof UserModel; // already {name: FormatString<…>; nick?: FormatNumber<…>}
const isUser = createIsType<User>(); // unchanged marker, converges with type-first
```

**Deleted by Tier 1:** `FieldConfig` + all 11 `*FieldConfig` members,
`ModelConfig`, `ParamsOf`, `FieldFormatMap`, `FieldType`, `ModelType`,
`StringFamilyParams`'s role as a config field type (still needed as the
`string` param type). The only discriminator-ish read that remains is the tiny
`{__opt}` check for optionality — and that is _optionality_, not format family.

### Tier 2 — builders as injectable markers (optional follow-on)

Add the trailing injectable param so the builder itself resolves to a cached
RunType, per your sketch:

```ts
function string<const FP extends StringFamilyParams = {}>(
  fp: FP = {} as FP,
  id?: InjectRunTypeId<FormatString<FP>>
): FormatString<FP> {
  /* runtime: return the cached node / branded carrier for `id` */
}
```

The transformer already injects `id` for any function with this trailing
parameter (verified — probe #5). This is what enables a future value-call form
(`object({...}).isType(x)` or `createIsType(model)`), where the runtime return is
the live RunType/validator bundle rather than a type-only carrier.

**Tier 2 is not required for Tier 1's win** and carries the open questions in
[§ Open design points](#open-design-points). Recommend landing Tier 1 first.

### Tier 3 — RunType → typed model (`reflectModel`), the inverse direction

Everything above runs type/value → RunType. This tier adds the **inverse**: a
runtime model reconstructed _from_ the RunType, so any reflected type — value-first
**or** type-first — yields a runtime object representing the interface (Drizzle /
OpenAPI / form generation / default instances). Because both front-ends collapse
to the same RunType, this single reflector serves both; a type-first `interface`
(which has no authoring-time runtime value at all) gets a runtime model the same
way a value-first `object({...})` does.

**Mechanically it's a third interpreter over the same cache `mockType` already
walks** — `utils.getRunType(id)` returns the node, and
[`mockType.ts`](../packages/ts-go-run-types/src/mocking/mockType.ts) is "a runtime
interpreter over `runTypesCache`". Instead of generating mock data, the walker
emits a discriminated `ModelConfig`:

```ts
createIsType<T>(); // → validator
createMockType<T>(); // → mock generator
reflectModel<T>(); // NEW → typed runtime model   (inject id → getRunType(id) → walk → ModelConfigOf<T>)
```

**The strong typing comes from the call-site `T`, not the walk.** `getRunType(id)`
returns permissively-typed `RunType` data — the literal params (`{maxLength:5}`)
are erased at runtime, so a purely runtime-built model would type as bare
`ModelConfig` (discriminators present, params widened). The literal-precise type
is supplied statically by an **inverse of `ModelType`** that reads the brand off
`T`:

```ts
// brand name → authoring tag (inverse of the format-name assignment)
type TagOf<N> = N extends 'stringFormat' ? 'string' : N extends 'nativeDate' ? 'date' : /* … */ never;

// final field type → discriminated config (reads the brand via infer)
type FieldConfigOf<F> = F extends {__rtFormatName: infer N extends string; __rtFormatParams: infer P extends object}
  ? {type: TagOf<N>; formatParams: P}
  : F extends boolean
    ? {type: 'boolean'; formatParams: Record<string, never>}
    : never;
type ModelConfigOf<T> = {-readonly [K in keyof T]-?: FieldConfigOf<NonNullable<T[K]>>};

function reflectModel<T>(value?: T, id?: InjectRunTypeId<T>): ModelConfigOf<T>; // marker shape
```

**Verified — type-level POC compiles clean:**
`ModelConfigOf<{name: FormatString<{maxLength:5}>; at: FormatTemporalInstant<{min:'2020'}>}>`
resolves to `{name: {type:'string'; formatParams:{maxLength:5}}; at: {type:'temporal.instant'; formatParams:{min:'2020'}}}`
— discriminators recovered, the literal `5` **preserved** (not widened to
`object`), and a strict round-trip equality back through `ModelType<C>` to the
original `T` holds.

So `ModelType<C extends ModelConfig>` and `ModelConfigOf<T>` are **mutual
inverses** — a bidirectional bridge between the discriminated config and the
branded final type:

```
ModelConfig (typed, discriminated) ──ModelType<C>──►  T (branded final type)
                                   ◄─ModelConfigOf<T>─
```

> ⚠️ **This overrides the "Delete" rows in the port table below.** Direction A
> needs the discriminated config shape and the bridge, so `ModelConfig` /
> `FieldConfig` / `ModelType<C>` / `FieldFormatMap` / `FieldType` / `ParamsOf`
> are **retained** (repurposed), not deleted. Only their role on the _forward
> authoring path_ goes away — builders return the brand, so `typeof Model` no
> longer routes through `ModelType`.

**Caveats:**

- `TagOf` is a small hand-maintained brand→tag lookup (inverse of the
  format-name assignment) — one line per format, a coupling point.
- **Exact + cheap for flat models** (flat map + one-level `infer`). A precise
  _recursive_ `ModelConfigOf<T>` for nested objects / arrays / unions reintroduces
  the recursive-`infer` type-perf hazard the project avoids — for composed types,
  type the reconstruction loosely (`ModelConfig` / `RunType`, runtime
  discriminators only). This matches the leaf-only value-first scope.
- Round-trips the **serializable-data projection** only (non-serializable members
  were dropped going in; a type-first `interface` has no verbatim `object({...})`
  source). The reconstruction is **canonical** — re-feeding it yields the same
  structural id — not a source copy.

## The discriminator question — resolved

The earlier worry was that unifying on a single discriminator would force folding
`RunTypeSubKind` into `RunTypeKind`. **It does not**, for two reasons:

1. **The authoring layer never writes the discriminator.** In both tiers the
   builder returns a _branded type_; the Go binary sets `kind`/`subKind` by
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

| Symbol (today)                                     | Action                                                                   | Notes                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `string(fp)` → `{type:'string'; formatParams}`     | **Change return type** → `FormatString<FP>`                              | runtime: see [§ runtime shape](#open-design-points)                                                                                                            |
| `number(fp)`                                       | → `FormatNumber<FP>`                                                     |                                                                                                                                                                |
| `bigint(fp)`                                       | → `FormatBigInt<FP>`                                                     |                                                                                                                                                                |
| `date(fp)`                                         | → `FormatDate<FP>` (`nativeDate` brand)                                  |                                                                                                                                                                |
| `boolean()`                                        | → `boolean`                                                              | no brand, no params                                                                                                                                            |
| `temporal.instant`…`plainYearMonth` (6)            | → `FormatTemporal*<FP>`                                                  | keep the lowercase namespace + shared `temporalBuilder` factory; just retype its return                                                                        |
| `optional(field)`                                  | **Reimplement** → `{__opt: F}` carrier                                   | must NOT intersect a brand onto the value                                                                                                                      |
| `object(config)`                                   | **Reimplement** → optional/required split + `-readonly` + `ValOf` unwrap | absorbs what `ModelType` did on the forward path                                                                                                               |
| `ModelType<C extends ModelConfig>`                 | **Retain (repurpose)**                                                   | no longer the forward authoring hop (builders return the brand); kept as the config→type half of the Tier-3 bridge                                             |
| `ModelConfig`, `FieldConfig`, `*FieldConfig` (×11) | **Retain**                                                               | the discriminated, strongly-typed model shape `reflectModel<T>()` returns (Tier 3) — no longer the builder _return_ shape, but still the canonical config type |
| `FieldFormatMap`, `FieldType`, `ParamsOf`          | **Retain**                                                               | engine of `ModelType<C>` (the bridge)                                                                                                                          |
| `StringFamilyParams`, `ValuePattern`               | **Keep**                                                                 | still the `string` builder's param type (regex value-channel forms)                                                                                            |
| (Tier 2) all builders                              | **Add** trailing `id?: InjectRunTypeId<ReturnType>`                      | enables marker resolution / value-call form                                                                                                                    |
| (Tier 3) `ModelConfigOf<T>`, `TagOf<N>`            | **Add (new)**                                                            | inverse map (type→config) + brand→tag lookup                                                                                                                   |
| (Tier 3) `reflectModel<T>()`                       | **Add (new)**                                                            | runtime model interpreter over `getRunType(id)`, typed `ModelConfigOf<T>`                                                                                      |

> **Net effect on the type-level subsystem:** _Tier 1 alone_ could delete
> `ModelType` / `ModelConfig` / `FieldFormatMap` / `FieldType` / `ParamsOf`. _With
> Tier 3 in scope_ they are **retained as the bidirectional bridge** instead — so
> the win is the simpler forward path (builders return the brand; `typeof Model`
> needs no mapping) **plus** the unification (one engine, one reflector for both
> front-ends), **not** raw deletion. Decide whether Tier 3 is in scope before
> committing to deleting anything.

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
   runtime while _typing_ the return as the brand (type-lie, but preserves the
   ORM story). Pick deliberately; affects every external consumer.
   **Tier 3 largely defuses this:** the canonical readable model is reconstructed
   on demand from the RunType via `reflectModel<T>()` (and it serves type-first
   declarations too, which no builder-runtime-value ever could), so the builder's
   own runtime value can be minimal rather than the system's schema-of-record.
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
