# Value-first format & constraint definitions

> **Status: shipped for every LEAF format.**
> The value-first authoring surface — a Zod/TypeBox-style BUILDER API
> (`RT.object({ name: RT.string({maxLength: 50}) })`) ships today for flat models
> over the **type channel**, via
> [`@mionjs/ts-go-run-types/define`](../packages/ts-go-run-types/src/define/define.ts),
> imported as a namespace: `import * as RT from '@mionjs/ts-go-run-types/define'`
> (there is **no** root `RunType` export — that name is the core wire-protocol
> node type + the `RunTypeKind`/`RunTypeError`/`RunTypeOptions` public family).
>
> **Update — RunType-construct / marker model
> ([value-first-marker-refactor.md](value-first-marker-refactor.md), Tiers 1–3
> implemented):** each builder now RETURNS its branded format type directly, so
> `typeof Model` IS the model type (no `ModelType<…>` hop on the forward path)
> and the validator is `createIsType<typeof Model>()`. Builders are also
> injectable markers — a standalone `RT.string({maxLength: 5})` / `RT.object({…})`
> resolves to the live RunType node the type compiler produces — and the inverse
> `RT.reflectModel<T>()` reconstructs a discriminated runtime model from the
> RunType (Drizzle / OpenAPI / forms). `ModelType<C>` / `FieldConfig` /
> `FieldFormatMap` are RETAINED as the config↔type bridge (`ModelType<C>` ⇄
> `ModelConfigOf<T>`), no longer the forward hop. The design-discussion sections
> below describe that retained mapping engine; only the forward authoring path
> changed (builders return the brand). A string `pattern` follows the type-first
> `StringParams.pattern` exactly — a `registerFormatPattern` result or an inline
> `{source, flags?, mockSamples, …}` object; a bare `/regex/` is **not** accepted
> (a pattern must carry `mockSamples` so the mock generator can produce matching
> values).
> Per-type builders cover all leaf formats: `RT.string()` / `RT.number()` /
> `RT.date()` / `RT.bigint()` / `RT.boolean()`, plus the 6 orderable temporal
> types under a lowercase `temporal` namespace mirroring the `Temporal.X` API
> (`RT.temporal.instant()`, `RT.temporal.zonedDateTime()`, `RT.temporal.plainDate()`,
> `RT.temporal.plainTime()`, `RT.temporal.plainDateTime()`,
> `RT.temporal.plainYearMonth()`). `RT.optional(builder)` wraps any field to make
> it `key?:`.
> Most of it needed **no new Go engine**: the branded format types are the same
> ones the type-first surface already reflects. An inline `pattern` object
> (`{source, flags?, mockSamples}`) is recovered from the property declaration by
> a small additive Go read — **not** a separate value-AST front-end.
>
> **Deliberate boundary** (this is what keeps it from becoming a worse
> Zod/TypeBox): the value DSL owns **leaf formats only**. **Composition** —
> array, union, tuple, nullable, nesting — stays in the type channel, where it
> composes for free: `ModelType<typeof M>[]`, `ModelType<typeof A> | null`, and
> `{x: ModelType<typeof M>}` all reflect + validate today with **no new API**. A
> _property-level_ composition DSL (`{type: 'array', of: …}`) is **not** pursued
> — it would reinvent the TS type system as values and requires a recursive
> `infer`, a checker-perf cost we explicitly avoid. What's still parked: a value
> call form (`Model.isType(x)`). `PlainMonthDay` / `Duration` have no format
> family (no ordering ⇒ no min/max), so they are outside this surface too. See
> "Spike results" for what the de-risking experiment found.

## The question

Formats and constraints can be expressed two ways:

- **Type-first** — pure type aliases the Go binary reflects:
  ```ts
  type User = {
    name: FormatString<{minLength: 1; maxLength: 50}>;
    email: FormatEmail;
    age: number;
  };
  const isUser = createIsType<User>();
  ```
- **Value-first** — compose per-type builders; the type is derived from the model:
  ```ts
  import * as RT from '@mionjs/ts-go-run-types/define';
  const UserModel = RT.object({
    name: RT.string({minLength: 1, maxLength: 50}),
    age: RT.number({min: 0, max: 120}),
    nick: RT.optional(RT.string({maxLength: 50})),
  });
  type User = typeof UserModel; // builders return the brand — already the model type
  const isUser = createIsType<User>();
  ```

Both are useful for different audiences. The question this doc answers: **should
we add the value-first surface, and if so, how does it fit the existing
architecture without becoming a second, divergent system?**

## Why add value-first at all

Three reasons, in order of weight:

1. **Adoption.** The validation market has already voted. Deepkit (pure
   type-reflection, arguably more elegant) has a fraction of the adoption of
   Zod (value-first, `z.infer`). The recurring complaint about type-first
   systems is _fear of large/complex types_ — opaque hovers, 40-line generic
   error expansions, and a mental model that needs TS fluency. A value-first
   front door (call a function with a config, get a type for free) lowers that
   barrier enormously.

2. **Runtime interop.** Tools like Drizzle, form builders, and OpenAPI
   generators consume _runtime config objects_. A type-only constraint
   (`{maxLength: 50}` in a type) is erased at runtime, so those consumers can't
   read it — you end up hand-writing the same constraint twice (once as a type,
   once as the ORM schema) and they drift. A value-first definition is a single
   source of truth both the validator and the ORM read.

3. **Regex ergonomics fall out for free** (see "The erasure thread" below).

### The key reframe: relocate complexity, don't eliminate it

Value-first is **not** "less complexity". The mapped/conditional types
(`ModelType<…>`) still exist — they move _inside the library_, where the user
never sees them. That's the correct move (Zod does exactly this). The lever is:
**a value-first authoring surface + the scary types as the library's problem,
not the user's.**

### Why this project is unusually well-positioned

Zod's types are heavy _because the type system is its validation engine_ —
that's why large Zod schemas hit "type instantiation is excessively deep" and
slow compiles. Here, **the Go binary is the engine**; the TS type is just a
marker. So we can offer the friendly value-first surface **without** Zod's
type-perf tax. That is a genuine "why this over Zod", not a me-too.

## The discriminator insight: mapping, not inference

Each builder returns a field config `{type, optional?, formatParams}` carrying a
`type` discriminator (`'string' | 'number' | … | 'temporal.instant' | …`). The
output type is a flat conditional lookup keyed on the literal — **no TS `infer`**,
no Zod-style structural inference:

```ts
type FieldType<F> = F extends {type: 'string'}
  ? TypeFormat<string, 'stringFormat', ParamsOf<F>> // string & {brand}
  : F extends {type: 'number'}
    ? TypeFormat<number, 'numberFormat', ParamsOf<F>>
    : F extends {type: 'date'}
      ? TypeFormat<Date, 'nativeDate', ParamsOf<F>>
      : /* …bigint, boolean, the 6 temporal.* … */ never;

type ParamsOf<F extends {formatParams: unknown}> = F['formatParams']; // indexed access, not infer
type ModelType<C> = {-readonly [K in keyof C]: FieldType<C[K]>}; // (required/optional split elided)
```

Two `infer`-free moves do all the work: each **builder** uses a `const` generic
to capture its params narrowly (`string<const P>(p: P): {type:'string'; formatParams: P}`),
and `ParamsOf<F>` reads them back out by **indexed access** on a _known_ key
(`formatParams`). `infer` would only be needed to pattern-match an _unknown_
shape (the recursive `{type:'array', of: infer E}` case we rule out). (`-readonly`
strips the `readonly` the `object<const C>` capture stamps on each property, so a
value-first model and the hand-written type-first form share one structural id —
see "Spike results".)

This is cheap, native TS:

- **Per-field**: O(1) conditional over a finite discriminator union.
- **Per-entity**: a _flat_ mapped type over keys (the same shape as
  `Partial`/`Record` — cheap; depth blowups come from recursion and distributed
  unions, not flat key maps).

This **defuses the main risk** of a value-first surface (Zod-style type-perf).
The only literal-capture needed is the `const` generic on each builder (and on
`object<const C>`) — so `{maxLength: 50}` stays narrow enough to brand as
`FormatString<{maxLength: 50}>`. That's TS narrowing an _argument_ (which it
always does), not the heavy output-computation kind.

Two residual nuances:

- **Flat is free; nesting re-introduces depth.** `{type: 'object', fields: {…}}`
  makes `FieldType` recurse — the one place a deeply nested model could strain.
  Flat entities (the Drizzle-table shape, ~90% of cases) are trivial.
- **Better errors, too.** `{type: 'number', maxLength: 5}` errors as a
  discriminated-union mismatch _on that field's object_ — local and readable —
  instead of a deep-generic expansion.

## The architectural fork: what does the Go binary read?

This is _the_ decision under every version of the idea.

- **Reflect the mapped type** (`createIsType<ModelType<typeof UserModel>>()`):
  works for every _literal_ constraint (`maxLength` is captured via `const`
  generics and lifted into the brand). `pattern: /.../ ` erases to `RegExp` in
  the _type_ — but see below: the value declaration behind that erased type is
  still reachable, so even regex is recoverable on this path. _This is the
  shipped path._
- **Reflect the config value's AST** (the Go binary traces the `object({…})`
  call and reads the literals directly): the fork's "other" branch — a separate
  value-AST front-end. It would be needed for a _value call form_
  (`Model.isType(x)`) where there's no type to reflect, but it turned out **not**
  to be needed for regex.

The spike's surprise (see "Spike results → (c)"): the value-first direction did
_not_ need a separate value-AST scanner to fix regex. The homomorphic
`Omit`/`Pick` mapped type behind `ModelType` **preserves each property's value
declaration**, so the regex literal is reachable from the reflected type's
`pattern` symbol — the existing format scanner just reads it from there. The
type channel carries everything; one small additive read covers the one value
(`/…/`) the type itself can't represent.

### The erasure thread (why regex is special, and why value-land fixes it)

A regex _value_ cannot live at the type level: `/foo/` widens to `RegExp`, and a
published `.d.ts` strips the value. That is the entire reason
`registerFormatPattern` exists (it smuggles the regex through a value + AST
trace). In a value-first config, **the regex stops being special** — it's just
`/.../ ` in the object like everything else, because nothing is going through
the type channel.

## Dual front-end, one engine

The value-first surface should **add** a front-end, not replace the type-first
one. A large amount of real code already _has_ types — GraphQL codegen,
`drizzle.$inferSelect`, hand-written domain interfaces — and those users want to
reflect an _existing_ `User`, not re-declare it.

```
type-first:   createIsType<User>()            ─┐
                                                ├─→  RunType graph  ─→  isType / typeErrors / mock emitters
value-first:  object({...}) + ModelType<...>  ─┘     (one engine, shared dedup + structural ids)
```

Both lower to the **same** RunType graph and the **same** emitters; only the
front-end scanner differs (type-scan vs value-AST-scan). This is what makes the
position unique:

|                         | reflect an existing TS type | value-first DSL + type mapping | AOT-compiled validators     |
| ----------------------- | --------------------------- | ------------------------------ | --------------------------- |
| Zod / Valibot / TypeBox | ❌ (re-declare in the DSL)  | ✅                             | ❌ (interpreted at runtime) |
| typia / Deepkit         | ✅                          | ❌                             | ✅                          |
| **this (proposed)**     | ✅                          | ✅                             | ✅                          |

Each _half_ exists somewhere; the bottom row — **both front-ends over one AOT
engine** — is white space. It is feasible _here specifically_ because neither
the types nor the DSL is the engine (the Go binary is), so a second door is a
thin adapter rather than a second validator.

**The discipline that keeps it an asset:** two front-ends, **one** RunType graph

- emitter set, no parallel validation logic. Let them fork and it degrades into
  two half-maintained surfaces.

## Building blocks that already exist

> **What actually shipped (read this first).** The sections below are the
> original design exploration of a **value-AST front-end** (the Go binary reads
> the `object({…})` call's AST). That is **not** what shipped — and it turned out
> **not to be needed**. The shipped surface lowers entirely through the **type
> channel**: `RT.object(...)` + the builders compose a `const`-narrow config
> object, `RT.ModelType<typeof Model>` maps it to the same branded `TypeFormat`
> types the type-first surface already reflects, and `createIsType<RT.ModelType<…>>()`
> reflects that _type_ — no new Go front-end, no value call form, no new rewrite
> rule. The only Go change was a small additive read so an inline `pattern: /…/`
> value is recovered from the property declaration the type system preserves (see
> "Spike results → (c)"). So items 1–3 in "net-new" below describe the parked
> Option B, kept as the design record; the params-cache de-dup (next section) is
> the one forward-looking item that still applies.

- **`CompTimeArgs<T>`** — the existing marker brand. (Relevant to the _parked_
  value-AST front-end; the shipped type-channel path does not use it.)
- **AST literal extraction** — `registerFormatPattern` already walks
  `{regexp: /.../, mockSamples: [...]}` from a call's object-literal arg. The
  shipped regex support reuses exactly this walk, pointed at the `pattern` value
  a builder stored.
- **The RunType graph + isType/typeErrors/mock emitters** — the engine,
  untouched.
- **Discriminator → type** is plain TS conditionals (the shipped `FieldType`
  mapping).
- **regex-as-value** already solved (`registerFormatPattern`), and inline `/…/`
  recovery now works too (Spike results → c).

### What would be net-new for the parked value-AST front-end (Option B)

_None of this shipped — the type-channel path made it unnecessary. Kept as the
design record for if/when a value call form is added._

1. **A value-config → RunType front-end.** Read the config object's AST and build
   the RunType graph from it directly. The shipped path instead reflects the
   `ModelType<…>` _type_, so this Go front-end was never built.
2. **A call / rewrite shape.** A value call form (`UserModel.isType(x)` /
   `createIsType(UserModel)`) keyed off the runtime config. Still parked; the
   shipped path uses the existing `createIsType<RT.ModelType<…>>()` marker.
3. **A plugin nuance.** Unlike `registerPureFnFactory` (whose factory the plugin
   nulls out), a value-call config would need to **survive at runtime** intact —
   a "scan-and-keep" rewrite. Moot until the value call form lands; the builder
   model already survives at runtime as plain data regardless.

## Known drawback: params duplication, and the fix

The structural-id system already collapses _fully identical_ RunTypes (two
`FormatString<{maxLength:50}>` share one entry). What still duplicates:

- A heavy params blob shared across _structurally-different_ parents — e.g. a
  regex `{source, flags, mockSamples}` used in `FormatString<{pattern:X,
maxLength:10}>` and `…maxLength:20`: two entries, each inlining all of X.
  `module.go` emits `formatAnnotation` per entry, so N fields sharing a pattern =
  N copies on the wire.
- A subtler case: `mockSamples` + `message` currently participate in the
  structural id, so two types that **validate identically** but differ only in
  samples/message do _not_ share a validator — duplicating the expensive thing
  (the emitted closure) for a difference that does not affect validation.

**Fix (deferred until measured):** an intermediate params cache in `rtUtils`,
referenced by key — the same pattern as the existing pure-fn cache
(`rtUtils.getPureFn(key)`):

```
// instead of inlining on every entry:
t_a.formatAnnotation = {name:'stringFormat', params:{pattern:{…}, mockSamples:[…]}}
t_b.formatAnnotation = {name:'stringFormat', params:{pattern:{…}, mockSamples:[…]}}  // dup

// hoist params to a keyed side cache, reference by id:
p_k1 = {pattern:{…}, mockSamples:[…]}                       // once
t_a.formatAnnotation = {name:'stringFormat', paramsRef:'k1'}
t_b.formatAnnotation = {name:'stringFormat', paramsRef:'k1'}
```

Second-order win: once params live in their own keyed cache, the structural id
can **split** — validators dedup on validation-relevant structure only, while
samples/message become separately-keyed metadata. That decouples "which
validator" from "which mock data", which is the right separation anyway.

## Open decisions

- **Do `mockSamples` / `message` belong in the structural id?** Today: yes
  (self-contained entries, fewer dedup hits). Pulling them into a params cache
  says "no, they're metadata". Both defensible — decide deliberately, not by
  default.
- **How is an `object()`'d model keyed** for cache dedup — by config content
  (scanner-read) so it converges with the equivalent type-first entry? Worth
  ensuring both front-ends land on the same structural id for the same shape, or
  the dual model itself becomes a duplication source. **Answered by the spike
  (see "Spike results"):** Option A's `ModelType<…>` resolves to the identical
  branded type, so convergence is automatic — once `-readonly` strips the
  `const`-capture modifier.

## De-risking experiment

The smallest spike that proves the whole thesis at once:

> Hand-write `object` + `ModelType` for `string`/`number`/`date` discriminators,
> point `createIsType<ModelType<typeof model>>()` at flat / nested / regex
> models, and check: (a) does the Go binary reflect it correctly, (b) compile
> time + error quality, (c) what happens to the inline regex — which concretely
> decides whether the value-AST front-end is required.

This spike is **done** — it shipped as Option A. Results below.

## Spike results

Implemented in
[`packages/ts-go-run-types/src/define/`](../packages/ts-go-run-types/src/define/define.ts);
covered by `test/adapters/valueFirst{IsType,Convergence}.test.ts` and the
`object`/builder cases in `test/typesafety.test.ts`.

> **API note:** the spike was first built as an inline discriminated-config
> (`defineObject({ name: {type:'string', maxLength:50} })`) and later refactored
> to the Zod/TypeBox-style builder API (`object({ name: string({maxLength:50}) })`).
> The findings below are unchanged by that refactor — convergence, regex, and the
> leaf boundary all hold identically; only the authoring syntax changed. Where
> the historical text says "exclusive union" / "`Forbid<>`" (finding b) or
> "`optional: true` flag", read the builder equivalents: per-builder param typing
> and the `optional(...)` wrapper. See the "discriminator insight" section above
> for the current shape.

**(a) The Go binary reflects `ModelType<…>` correctly — with zero Go changes.**
Each builder (and `object<const C>`) is a runtime identity returning the plain
config (so it survives for Drizzle/OpenAPI), and `ModelType<C>` maps each field
through `TypeFormat<Base, Name, ParamsOf<F>>` — structurally identical to the
type-first `FormatString`/`FormatNumber`/`FormatDate`. The existing brand
scanner (`internal/compiled/runtype/typeid/formats.go`) lifts it unchanged.
Flat fields, and **nested value-first models composed inside a parent object**,
both reflect + validate correctly. **Optional properties** come from the
`optional(builder)` wrapper, which sets `optional: true` on the field; `ModelType`
splits the keys into required/optional groups and intersects (TypeScript can't
apply `?` per-key in one homomorphic map). An optional value-first field
converges with a type-first `key?:`. (A string-key `'name?'` marker à la ArkType
was rejected: it needs a template-literal `infer` in the mapped type, which taxes
the checker.)

**Convergence holds (the dual-front-end requirement).** A value-first model and
the hand-written type-first equivalent resolve to the **same structural id → the
same cached validator** (`createIsType<ModelType<…>>() === createIsType<TypeFirst>()`).
The one wrinkle: the `object<const C>` capture stamps `readonly` on every config
property, which propagates to the mapped type and diverges the property node's
id from the (mutable) type-first form — the _format type itself was already
identical_. `ModelType`'s `-readonly` modifier strips it, restoring convergence.
This answers the "how is a value-first model keyed" open decision: by the same
structural id as the type-first shape, so the dual surface is **not** a
duplication source.

**(b) Error quality: good — bad params caught locally at the builder call.**
Each builder types its own params argument (`number(params?: NumberParams)`), so
cross-family misuse (`number({maxLength: 5})`) errors right at the `number(...)`
call — `maxLength` isn't a `NumberParams` key. This replaced the inline-config
era's exclusive-union `Forbid<>` machinery (which existed only because a plain
discriminated-union object literal let TS's lenient excess-property check pass a
foreign key); per-builder typing makes that machinery unnecessary, so it was
deleted. (`min`/`max`/`gt`/`lt` are shared by the number, date, bigint and
temporal param interfaces, so they're correctly accepted on each.)

**(c) Inline `/regex/` works — recovered from the value declaration the type
system preserves.** This was the surprise. A regex _value_ can't ride the type
channel (`/…/` erases to `RegExp`), but the homomorphic `Omit`/`Pick` mapped
type behind `ModelType` **preserves the property's value declaration**. So even
though the reflected `pattern` property's _type_ is `RegExp`, its symbol's
declaration is still the original `pattern: /…/` AST node. The format scanner
(`formatPatternFromInitializer` in `internal/compiled/runtype/typeid/formats.go`)
reads `{source, flags}` straight off that initializer. All three authoring forms
work through the value channel:

- `pattern: /^[a-z-]+$/` — an inline regex literal (full `/…/` syntax);
- `pattern: {source: '^[a-z-]+$', flags: ''}` — the regex as string literals;
- `pattern: slug` where `slug = registerFormatPattern({…})` — resolved by
  following the identifier to its initializer call (this also recovers
  `mockSamples`).

An inline value-channel regex **converges** with the type-first
`FormatString<{pattern: {source, flags}}>` for the same pattern (identical
recovered `{source, flags}` → one structural id). This is one small _additive_
Go change to the existing format scanner — **not** the value-AST front-end the
fork anticipated. The only thing an inline `/…/` lacks is `mockSamples`, so
`createMockType` can't generate matching values for it (use the
`registerFormatPattern` form, which carries samples, when you need mocks).

### What's still parked (Option B proper)

A **value call form** (`Model.isType(x)` / `createIsType(Model)` keyed off the
runtime config) with its "scan-and-keep" rewrite, and the **object / array /
union / named-format discriminators**. The params-cache de-dup below is
orthogonal. Regex — the case the fork thought _only_ a value-AST scan could
reach — turned out to be reachable through the preserved declaration, so it is
**no longer** an Option-B item.
