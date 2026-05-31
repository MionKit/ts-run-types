# Value-first format & constraint definitions

> **Status: Option A shipped (string / number / date); Option B still
> exploratory.** The value-first authoring surface — `define({…})` + the
> `ModelType<typeof Model>` type mapping — ships today for flat string / number
> / native-`Date` models over the **type channel**
> (`createIsType<ModelType<…>>()`), via
> [`@mionjs/ts-go-run-types/define`](../packages/ts-go-run-types/src/define/define.ts).
> It needed **no new Go engine**: `ModelType<…>` resolves to the same branded
> `TypeFormat` types the type-first surface already reflects. The value-AST
> front-end (Option B — value call form, inline `/regex/`, object/array/union
> discriminators) remains a future direction. See "Spike results" below for
> what the de-risking experiment actually found.

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
- **Value-first** — a runtime config object the type is derived from:
  ```ts
  const UserModel = define({
    name:  {type: 'string', minLength: 1, maxLength: 50},
    age:   {type: 'number', min: 0, max: 120},
  });
  type User = ModelType<typeof UserModel>;
  ```

Both are useful for different audiences. The question this doc answers: **should
we add the value-first surface, and if so, how does it fit the existing
architecture without becoming a second, divergent system?**

## Why add value-first at all

Three reasons, in order of weight:

1. **Adoption.** The validation market has already voted. Deepkit (pure
   type-reflection, arguably more elegant) has a fraction of the adoption of
   Zod (value-first, `z.infer`). The recurring complaint about type-first
   systems is *fear of large/complex types* — opaque hovers, 40-line generic
   error expansions, and a mental model that needs TS fluency. A value-first
   front door (call a function with a config, get a type for free) lowers that
   barrier enormously.

2. **Runtime interop.** Tools like Drizzle, form builders, and OpenAPI
   generators consume *runtime config objects*. A type-only constraint
   (`{maxLength: 50}` in a type) is erased at runtime, so those consumers can't
   read it — you end up hand-writing the same constraint twice (once as a type,
   once as the ORM schema) and they drift. A value-first definition is a single
   source of truth both the validator and the ORM read.

3. **Regex ergonomics fall out for free** (see "The erasure thread" below).

### The key reframe: relocate complexity, don't eliminate it

Value-first is **not** "less complexity". The mapped/conditional types
(`ModelType<…>`) still exist — they move *inside the library*, where the user
never sees them. That's the correct move (Zod does exactly this). The lever is:
**a value-first authoring surface + the scary types as the library's problem,
not the user's.**

### Why this project is unusually well-positioned

Zod's types are heavy *because the type system is its validation engine* —
that's why large Zod schemas hit "type instantiation is excessively deep" and
slow compiles. Here, **the Go binary is the engine**; the TS type is just a
marker. So we can offer the friendly value-first surface **without** Zod's
type-perf tax. That is a genuine "why this over Zod", not a me-too.

## The discriminator insight: mapping, not inference

A `type` discriminator (`'string' | 'number' | 'date' | …`) on each field means
we do **not** need Zod-style structural inference, and we use **no TS `infer`**.
The output type is a flat conditional lookup keyed on the literal:

```ts
type FieldType<F> =
  F extends {type: 'string'} ? FormatString<Omit<F, 'type'>> : // string & {brand}
  F extends {type: 'number'} ? FormatNumber<Omit<F, 'type'>> :
  F extends {type: 'date'}   ? FormatDate<Omit<F, 'type'>>   :
  never;

type ModelType<C> = {-readonly [K in keyof C]: FieldType<C[K]>};
```

(`-readonly` strips the `readonly` the `define<const C>` capture stamps on each
property, so a value-first model and the hand-written type-first form share one
structural id — see "Spike results". `Omit<F, 'type'>` drops the discriminator
before it becomes the brand's params.)

This is cheap, native TS:

- **Per-field**: O(1) conditional over a finite discriminator union.
- **Per-entity**: a *flat* mapped type over keys (the same shape as
  `Partial`/`Record` — cheap; depth blowups come from recursion and distributed
  unions, not flat key maps).

This **defuses the main risk** of a value-first surface (Zod-style type-perf).
The only literal-capture needed is one `const` generic — `define<const C>(c: C)`
— so `{maxLength: 50}` stays narrow enough to brand as `FormatString<{maxLength:
50}>`. That's TS narrowing an *argument* (which it always does), not the heavy
output-computation kind.

Two residual nuances:

- **Flat is free; nesting re-introduces depth.** `{type: 'object', fields: {…}}`
  makes `FieldType` recurse — the one place a deeply nested model could strain.
  Flat entities (the Drizzle-table shape, ~90% of cases) are trivial.
- **Better errors, too.** `{type: 'number', maxLength: 5}` errors as a
  discriminated-union mismatch *on that field's object* — local and readable —
  instead of a deep-generic expansion.

## The architectural fork: what does the Go binary read?

This is *the* decision under every version of the idea.

- **Reflect the mapped type** (`createIsType<ModelType<typeof UserModel>>()`):
  works for every *literal* constraint (`maxLength` is captured via `const`
  generics and lifted into the brand) — **but `pattern: /.../ ` erases to
  `RegExp` in the type**, so the regex problem returns even here. *This is the
  shipped path (Option A).*
- **Reflect the config value's AST** (the Go binary traces the `define({…})`
  call and reads the literals directly): `/.../ ` is a visible literal at the
  call site, so **the erasure problem dissolves entirely**. This is the
  `registerFormatPattern` AST trace generalized from "one pattern" to "a whole
  model".

So the value-first direction naturally pulls toward **value-AST scanning**, and
that is the cleaner end state for exactly the cases that are clumsy today.

### The erasure thread (why regex is special, and why value-land fixes it)

A regex *value* cannot live at the type level: `/foo/` widens to `RegExp`, and a
published `.d.ts` strips the value. That is the entire reason
`registerFormatPattern` exists (it smuggles the regex through a value + AST
trace). In a value-first config, **the regex stops being special** — it's just
`/.../ ` in the object like everything else, because nothing is going through
the type channel.

## Dual front-end, one engine

The value-first surface should **add** a front-end, not replace the type-first
one. A large amount of real code already *has* types — GraphQL codegen,
`drizzle.$inferSelect`, hand-written domain interfaces — and those users want to
reflect an *existing* `User`, not re-declare it.

```
type-first:   createIsType<User>()            ─┐
                                                ├─→  RunType graph  ─→  isType / typeErrors / mock emitters
value-first:  define({...}) + ModelType<...>  ─┘     (one engine, shared dedup + structural ids)
```

Both lower to the **same** RunType graph and the **same** emitters; only the
front-end scanner differs (type-scan vs value-AST-scan). This is what makes the
position unique:

| | reflect an existing TS type | value-first DSL + type mapping | AOT-compiled validators |
| --- | --- | --- | --- |
| Zod / Valibot / TypeBox | ❌ (re-declare in the DSL) | ✅ | ❌ (interpreted at runtime) |
| typia / Deepkit | ✅ | ❌ | ✅ |
| **this (proposed)** | ✅ | ✅ | ✅ |

Each *half* exists somewhere; the bottom row — **both front-ends over one AOT
engine** — is white space. It is feasible *here specifically* because neither
the types nor the DSL is the engine (the Go binary is), so a second door is a
thin adapter rather than a second validator.

**The discipline that keeps it an asset:** two front-ends, **one** RunType graph
+ emitter set, no parallel validation logic. Let them fork and it degrades into
two half-maintained surfaces.

## Building blocks that already exist

- **`CompTimeArgs<T>`** — the existing marker brand. Perfect here because it
  gives both halves at once: the config stays a **real runtime object** (Drizzle
  reads it) *and* is marked for **build-time literal extraction** (the Go binary
  scans it). No tension.
- **AST literal extraction** — `registerFormatPattern` already walks
  `{regexp: /.../, mockSamples: [...]}` from a call's object-literal arg.
  Reading `{name: {type: 'string', maxLength: 50}}` is the same walk.
- **The RunType graph + isType/typeErrors/mock emitters** — the engine,
  untouched.
- **Discriminator → type** is plain TS conditionals.
- **regex-as-value** already solved (`registerFormatPattern`).

### What is genuinely net-new (assembly, not foundations)

1. **A value-config → RunType front-end.** Today the binary reflects a *type*;
   this reads the config object's AST and builds the RunType graph from it
   (`type:'string'` → KindString, `type:'object'` → nested, params →
   constraints). Parallel to the existing type-reflection front-end, sharing
   everything downstream. The one real new chunk of Go — but a mapping, not new
   infrastructure.
2. **A call / rewrite shape.** `createIsType<T>()` injects a hash at the call
   site; the value path validates against a value (`UserModel.isType(x)` or
   `createIsType(UserModel)`), so there's a new call form + a keying path
   (hash off the config content the scanner already reads).
3. **A plugin nuance.** Unlike `registerPureFnFactory` (whose factory the plugin
   nulls out), the `define()` config must **survive at runtime** intact — Drizzle
   needs it. So it's a "scan-and-keep" rewrite rule, not "scan-and-strip".

## Known drawback: params duplication, and the fix

The structural-id system already collapses *fully identical* RunTypes (two
`FormatString<{maxLength:50}>` share one entry). What still duplicates:

- A heavy params blob shared across *structurally-different* parents — e.g. a
  regex `{source, flags, mockSamples}` used in `FormatString<{pattern:X,
  maxLength:10}>` and `…maxLength:20`: two entries, each inlining all of X.
  `module.go` emits `formatAnnotation` per entry, so N fields sharing a pattern =
  N copies on the wire.
- A subtler case: `mockSamples` + `message` currently participate in the
  structural id, so two types that **validate identically** but differ only in
  samples/message do *not* share a validator — duplicating the expensive thing
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
- **How is a `define()`'d model keyed** for cache dedup — by config content
  (scanner-read) so it converges with the equivalent type-first entry? Worth
  ensuring both front-ends land on the same structural id for the same shape, or
  the dual model itself becomes a duplication source. **Answered by the spike
  (see "Spike results"):** Option A's `ModelType<…>` resolves to the identical
  branded type, so convergence is automatic — once `-readonly` strips the
  `const`-capture modifier.

## De-risking experiment

The smallest spike that proves the whole thesis at once:

> Hand-write `define` + `ModelType` for `string`/`number`/`date` discriminators,
> point `createIsType<ModelType<typeof model>>()` at flat / nested / regex
> models, and check: (a) does the Go binary reflect it correctly, (b) compile
> time + error quality, (c) what happens to the inline regex — which concretely
> decides whether the value-AST front-end is required.

This spike is **done** — it shipped as Option A. Results below.

## Spike results

Implemented in
[`packages/ts-go-run-types/src/define/`](../packages/ts-go-run-types/src/define/define.ts);
covered by `test/adapters/valueFirst{IsType,Convergence}.test.ts` and the
`define` cases in `test/typesafety.test.ts`.

**(a) The Go binary reflects `ModelType<…>` correctly — with zero Go changes.**
`define<const C>(config)` is a runtime identity returning the config (so it
survives for Drizzle/OpenAPI), and `ModelType<C>` maps each field through
`TypeFormat<Base, Name, Omit<F,'type'>>` — structurally identical to the
type-first `FormatString`/`FormatNumber`/`FormatDate`. The existing brand
scanner (`internal/compiled/runtype/typeid/formats.go`) lifts it unchanged.
Flat fields, and **nested value-first models composed inside a parent object**,
both reflect + validate correctly.

**Convergence holds (the dual-front-end requirement).** A value-first model and
the hand-written type-first equivalent resolve to the **same structural id → the
same cached validator** (`createIsType<ModelType<…>>() === createIsType<TypeFirst>()`).
The one wrinkle: the `define<const C>` capture stamps `readonly` on every config
property, which propagates to the mapped type and diverges the property node's
id from the (mutable) type-first form — the *format type itself was already
identical*. `ModelType`'s `-readonly` modifier strips it, restoring convergence.
This answers the "how is a `define()`'d model keyed" open decision: by the same
structural id as the type-first shape, so the dual surface is **not** a
duplication source.

**(b) Error quality is mixed.** An *unknown discriminator* (`{type: 'boolean'}`)
is rejected locally and readably (`TS2322` on the `type` field) — the
discriminator-as-local-error win is real. **But cross-family param leakage is
NOT caught**: `{type: 'number', maxLength: 5}` compiles, because TypeScript's
excess-property check against a union allows any key present in *some* member
(`maxLength` is valid for the string member). The misplaced param is harmlessly
ignored by the number-format emitter at validation time, so this is a DX gap,
not a runtime break. Tightening it (a per-field exclusive-union validator that
forbids other members' keys) is a deferred follow-up; the spike deliberately
does not over-engineer it.

**(c) Inline `/regex/` does not survive — and a value `pattern` is worse than
"erased", it breaks.** Writing `pattern: slug` (where
`slug = registerFormatPattern({…})`) in a value config makes `define<const C>`
capture the property's type as the structural `FormatPattern` interface,
**losing the `typeof slug` TypeQuery** that the Go AST-recovery
(`formatPatternFromSymbol`) traces back to the `registerFormatPattern` call. The
scanner then reads the interface's `flags: string` as a non-literal and emits a
broken `new RegExp(…, 'string')`. So `pattern` is **omitted from the value-first
string config** (`StringFieldConfig extends Omit<StringParams, 'pattern'>`),
turning a silent runtime break into a local compile error. Regex stays on the
type-first surface (`FormatString<{pattern: typeof slug}>`) — and this is
precisely the case that **only the value-AST front-end (Option B) can fix**,
since it would read the regex literal straight off the call site instead of
through the erased type channel. The spike thus confirms Option B's value
proposition without needing to build it yet.

### What Option B would still add

Inline `/regex/` survival, a value call form (`Model.isType(x)` / a model
method), a "scan-and-keep" rewrite, and the object/array/union/named-format
discriminators. All deferred; the params-cache de-dup below is orthogonal.
