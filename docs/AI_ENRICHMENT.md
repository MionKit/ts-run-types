# AI enrichment — `FriendlyType<T>` and `MockData<T>`

> **Status: implemented** (branch `feat/ai-enrichment`; see
> [AI_ENRICHMENT_PLAN.md](./AI_ENRICHMENT_PLAN.md) for the phase tracker).
> **Shipped + tested:**
> - the `FriendlyType<T>` / `MockData<T>` DSL types (type-checked against `T`), the
>   pure-data `createFriendly<T>(map)` renderer, and the `createMockType<T>({ data })`
>   integration — all exported from `ts-runtypes`;
> - the Go CLI trio `describe` / `check` / `gen` (`internal/enrichment`, a separate
>   package), incl. the `check` diagnostics **FT002 / FT003 / FT005 / MD001**.
>
> **Deferred refinements (design-stage below):** **MD003** (pool values validate —
> needs the runtime validator), the always-on *Vite-build* surfacing of the
> `FT0xx`/`MD0xx` diagnostics (today they run via the `check` CLI, not the build),
> `FT004`/`MD002` (the precise types already make TS catch these), `FT010`/`MD010`
> drift + `MD004`, the `$[val]` enrichment, `declFile` (only needed for demand-driven
> `gen`), and the `rtUtils` registry accessors (P6). Sections describing those note it.

## Why this is a new artifact class

Everything RunTypes emits today — validators, JSON/binary codecs, the reflection
bundle — is a **pure function of the type**: deterministic, regenerated every
build, never committed, correct by construction. There is no "sync" problem
because there is nothing to keep in sync; the artifact *is* the type, recomputed.
All of it lives only as ephemeral `virtual:rt/*` modules + the gitignored
`node_modules/.cache/ts-runtypes/` disk cache.

`FriendlyType<T>` and `MockData<T>` are a different species:

| Property        | Generated cache (today)         | Enrichment (this doc)                       |
| --------------- | ------------------------------- | ------------------------------------------- |
| Determinism     | Deterministic (`f(type)`)       | Non-deterministic (an LLM authored it)      |
| Content         | Glue (validators, codecs)       | The *value is the content* (a label, a message, a realistic name) |
| Cost            | Cheap, recompute every build    | Expensive (LLM call) — generate once        |
| Storage         | Ephemeral, gitignored           | **Committed** to the repo                   |
| Drift           | Impossible (recomputed)         | **Possible** — the type can change underneath it |

So these are **satellite artifacts keyed by a type**: authored once, committed,
and validated against the type forever after. They are *not* a code-emit family
like `validate`/`json`/`binary` — there is no Go emitter and no runtime codegen.
The compiler's only jobs are (1) **validate** the authored literal against the
live type during the normal scan, and (2) later, route it through `rtUtils` by id.
This makes the feature mostly a *validation + authoring + registry* concern.

The two artifacts:

- **`FriendlyType<T>`** — combined human-readable **labels + error messages** for a
  type. Pure data. Used for validation-error rendering today; powers form-building
  UI later.
- **`MockData<T>`** — realistic sample **value pools / ranges** per field. Feeds the
  existing `createMockType<T>()` generator (which already accepts custom pools and
  per-property overrides), so the mechanical generator stays deterministic and the
  AI only supplies realistic values.

---

## `FriendlyType<T>`

### Node model

One recursive node. Every node is `{ $label?, $errors?, ...childFields }`:
`$`-prefixed keys are meta, every other key is a child field. Leaf nodes simply
have no children, so nesting is uniform with no `fields:` wrapper. (`$`-prefixed
field names in the source type are the one reserved-key collision; flagged as a
diagnostic if it ever happens.)

```ts
// models/user.ts
export interface User {
  name: FormatString<{minLength: 2; maxLength: 60}>;
  age: FormatNumber<{min: 0; max: 120}>;
  isActive: boolean;
  tags: string[];
  profile: {
    email: FormatEmail;
    score: FormatNumber<{min: 0; max: 100}>;
  };
}
```

```ts
// the authored map — validated against User at scan time
const userFriendly: FriendlyType<User> = {
  $label: 'User account',

  name: {
    $label: 'Full name',
    $errors: {
      type: '$[label] must be text',
      minLength: '$[label] needs at least $[val] characters',
      maxLength: '$[label] allows at most $[val] characters',
    },
  },
  age: {
    $label: 'Age',
    $errors: {
      type: '$[label] must be a number',
      min: '$[label] must be at least $[val]',
      max: '$[label] must be no more than $[val]',
    },
  },
  isActive: { $label: 'Active?' },

  tags: {
    $label: 'Tags',
    $items: { $errors: { type: 'each tag must be text' } },
  },

  profile: {                         // nested object — same node shape, recursively
    $label: 'Profile',
    email: { $label: 'Email', $errors: { pattern: 'Enter a valid email address' } },
    score: { $label: 'Score', $errors: { min: 'min $[val]', max: 'max $[val]' } },
  },
};
```

Container meta keys: arrays/tuples use `$items` (element node); maps/sets use
`$keys` / `$values` (their error paths carry the object path-segment
`{key, index, failed}` — the renderer handles those). Unions get node-level
`$label` / `$errors` only in v1; per-member addressing (`$members`) is deferred.

### Error keys = the verified `(format.name, formatPath-tail)` discriminator

Each `$errors` key names the failed sub-constraint. This is **not** an invented
key set — it maps 1:1 onto what `createGetValidationErrors<T>()` actually emits.
A validation failure is a `RunTypeError` (see
[`createRTFunctions.ts`](../packages/ts-runtypes/src/createRTFunctions.ts)):

```ts
interface RunTypeError {
  path: (string | number | object)[];      // ['profile','email'] · [1] · [{key,index,failed}]
  expected: string;                          // 'string' | 'number' | 'objectLiteral' | …
  format?: { name: string; val: …; formatPath: (string | number)[] };
}
```

The `$errors` key is **`error.format.formatPath.at(-1)`**, and `type` is the base
type-shape failure (a `RunTypeError` with no `.format`). The Go format emitters
([`internal/compiled/typefns/formats/`](../internal/compiled/typefns/formats/))
write one independent `if (fail) push(...)` per constraint, with the constraint
name and value known at emit time:

| Failure                | `format.name` | `formatPath` (key) | `format.val`        |
| ---------------------- | ------------- | ------------------ | ------------------- |
| base type-shape        | *(none)*      | `type`             | —                   |
| string `minLength`     | `stringFormat`| `minLength`        | the bound (`2`)     |
| string `maxLength`     | `stringFormat`| `maxLength`        | the bound (`60`)    |
| string `pattern`       | `stringFormat`| `pattern`          | a message¹          |
| number `min`/`max`     | `numberFormat`| `min` / `max`      | the bound           |
| number `lt`/`gt`       | `numberFormat`| `lt` / `gt`        | the bound           |
| number `integer`       | `numberFormat`| `integer`          | `true`              |
| datetime `date`/`time` | `dateTime`    | `date` / `time`    | *(none)*            |
| datetime `splitChar`   | `dateTime`    | `splitChar`        | the separator       |
| `Date` bound           | `nativeDate`  | `min` / `max`      | *(none)*¹           |
| `uuid` version         | `uuid`        | `version`          | `'4'`               |

¹ See **`$[val]` enrichment** under Prerequisites — `val` is currently overloaded
(a *message* for `pattern`/`allowedChars`, *absent* for date bounds). The
enrichment makes `$[val]` resolve uniformly to the declared bound.

**Constraint granularity is bounded by the type.** A bare `name: string` can only
fail as `type`; you only get `minLength`/`maxLength` keys because the field is
`FormatString<{minLength; maxLength}>`. The richness of the friendly map is a
function of how richly the type is annotated.

### Aggregation: errors accumulate

`createGetValidationErrors` **accumulates** — a value that violates `minLength`
*and* `pattern` produces two `RunTypeError`s, not one. (The boolean `createValidate`
path short-circuits; irrelevant here.) The only short-circuits are structurally
necessary: no separator ⇒ datetime skips `date`/`time`; no `@` ⇒ email skips
`localPart`/`domain`. So the data DSL yields **one message per violated
constraint** (a list). The mion-style "join into one sentence" (`at least X and at
most Y`) needs the function escape hatch below.

### Placeholder DSL

Templates are plain strings with `$[…]` tokens, validated by the compiler:

- `$[label]` — the node's `$label`, falling back to the raw field name.
- `$[val]`   — the failed constraint's parameter (`error.format.val`; see enrichment).
- `$[path]`  — dotted path to the field.
- `$[index]` — array element index, for `$items` failures.

`$[value]` (the *actual received value*) is out of scope for v1: the error carries
no value (`RunTypeError` is `{path, expected, format?}`), so it would require
threading the input into the renderer. Revisit with the `$[val]` enrichment.

### Function escape hatch

Any `$errors` entry may be an **inline arrow** instead of a template record, for
logic the data form can't express (joining constraints, pluralization, i18n
lookups). It receives a synthesized `failed` object (grouped from the
`RunTypeError`s at that path), mirroring mion ergonomics:

```ts
name: {
  $label: 'Full name',
  $errors: (failed) => {
    const parts: string[] = [];
    if (failed.minLength) parts.push(`at least ${failed.minLength.val} characters`);
    if (failed.maxLength) parts.push(`at most ${failed.maxLength.val} characters`);
    return parts.length ? `Name must be ${parts.join(' and ')}` : 'Invalid name';
  },
},
```

The function must be an **inline** expression (the `CompTimeArgs` literal rule — no
external function reference); its body is opaque to the compiler and runs at
runtime, so it may call i18n machinery freely. The trade: the data form gets
compile-time placeholder/constraint validation (below); a function does not.

### Type sketch — modelled on `DataOnly<T>`

Both DSL types are recursive mapped types over `T`, and should follow the
construction in
[`dataOnly.ts`](../packages/ts-runtypes/src/runtypes/dataOnly.ts) (`#region
dataonly-extract`) — this repo's reference for a *cheap* recursive type. The
codebase is acutely sensitive to TS instantiation cost (see the
[markers.ts](../packages/ts-runtypes/src/markers.ts) note on the
~700-instantiation tuple-intersection trap, and `docs/value-first-typecheck-cost.md`).
Three rules carried over from `DataOnly`:

1. **Depth-bounded** via a tuple-decrement budget, so circular / mutually-recursive
   types resolve to a finite instantiation instead of tripping the TS2589 depth cap.
2. **No `infer` on the hot path** — reach element/property types with `T[number]`
   and `T[K]`, behind cheap bare `extends` gates ordered scalar-before-object.
3. **Homomorphic** `{ [K in keyof T]?: … }` to preserve structure for free.

And like `DataOnly`, these should live in their own module as a self-contained,
verbatim-sliced region with a per-branch **instantiation-budget** compile test
(mirroring `test/types/dataonly.compile.test.ts`).

```ts
type Template = string;                        // `$[…]`-interpolated

type ErrorTemplates =
  | { type?: Template; $default?: Template; [constraint: string]: Template | undefined }
  | ((failed: FailedConstraints) => string);   // inline-arrow escape hatch

interface Meta { $label?: string; $errors?: ErrorTemplates }
type FriendlyLeaf = string | number | boolean | bigint | null | undefined | Date | RegExp;
type _Depth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

type FriendlyNode<T, Depth extends number = 8> =
  Depth extends 0                ? Meta                            // budget spent — keep as leaf
  : T extends FriendlyLeaf       ? Meta                            // scalar / native — no children
  : T extends readonly unknown[] ? Meta & { $items?: FriendlyNode<T[number], _Depth[Depth]> }
  : T extends object             ? Meta & { [K in keyof T]?: FriendlyNode<T[K], _Depth[Depth]> }
  :                                Meta;

export type FriendlyType<T> = FriendlyNode<T>;
```

### Runtime API — pure-data now, UI deferred

Error rendering needs only `(map, errors)` — index the map by `error.path`, pick
the template by the `formatPath` tail, interpolate. No type id, no `rtUtils`
lookup:

```ts
const friendly = createFriendly<User>(userFriendly);
friendly.errors(getUserErrors(badInput));   // → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }]
friendly.label('profile.email');             // → 'Email'
```

**UI form-building is deferred and *does* need the runtype.** To enumerate every
field of `User` (labelling the ones in the map, falling back to raw names for the
rest, in declaration order) the runtime must read the type's field set — i.e. the
reflection node, fetched by injecting the type id and looking it up in `rtUtils`,
exactly as [`getRunTypeId<T>()`](../packages/ts-runtypes/src/markers.ts) does. We
ship `createFriendly` **pure-data** first; the runtype pairing lands with the UI
feature. The registry roadmap below is what makes that pairing a one-line addition.

---

## `MockData<T>`

### Node model

Per-field pools, ranges, and per-format hints that feed the **existing**
`createMockType<T>()` generator (`createMockType` already supports custom pools and
per-property overrides — `MockData<T>` is just the typed, validated form of those):

```ts
const userMock: MockData<User> = {
  name:  { pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor', /* …50+ */ ] },
  age:   { min: 18, max: 95 },
  tags:  { $items: { pool: ['urgent', 'beta', 'vip'] }, $length: [1, 4] },
  profile: {
    email: { pool: ['alice@example.com', 'liang@corp.io', /* … */ ] },
    score: { min: 0, max: 100 },
  },
};

const mockUser = createMockType<User>({ data: userMock });   // existing factory + new `data` option
```

### The pool-validation superpower (MD003)

Because RunTypes can **validate**, the compiler checks that **every pool / range
value actually satisfies its field's type and format**. An LLM that hallucinates a
malformed email into the `email` pool, or a `score` of `150`, is caught at parse
time — not at test runtime. No other mock library can do this; it falls straight
out of the existing validator.

### Type sketch

Same construction as `FriendlyType` above — depth-bounded, `infer`-free, scalar
gates before the object branch, structure-preserving homomorphic map (see the
`DataOnly` reference there):

```ts
type _MockDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

type MockNode<T, Depth extends number = 8> =
  Depth extends 0                ? { pool?: T[] }                  // budget spent — keep as leaf pool
  : T extends readonly unknown[] ? { $items?: MockNode<T[number], _MockDepth[Depth]>; $length?: number | [number, number] }
  : T extends number             ? { pool?: number[]; min?: number; max?: number }
  : T extends string             ? { pool?: string[] }
  : T extends object             ? { [K in keyof T]?: MockNode<T[K], _MockDepth[Depth]>; $optional?: number }
  :                                { pool?: T[] };

export type MockData<T> = MockNode<T>;
```

---

## Validation — the `check` command (build surfacing deferred)

> **Most drift is already caught by TypeScript itself.** Because `FriendlyType<T>`
> / `MockData<T>` are *precise* mapped types, the user's own type-checker rejects
> the bulk of drift with no Go pass at all: a renamed/removed field makes the map
> key an excess property (editor error), and an object-vs-scalar shape mismatch is a
> type error (both proven by the P1 instantiation-budget tests). So the Go pass
> below is a **refinement layer** — it adds only what the type system can't see:
> constraint-key existence (FT003 — the `$errors` record has an index signature, so
> TS accepts any key), `$[…]` placeholder validity (FT005), mock pool-value
> validation (MD003), and the semantic-drift hash (FT010/MD010). The feature is
> already useful with just the types + the editor; the pass sharpens the diagnostics.

**Implemented today as the `check` CLI command** (not yet the Vite build). It finds
`FriendlyType<T>` / `MockData<T>` const declarations, resolves `T`'s `RunType`, and
runs a **kind-switch paired walk** of the authored object-literal against the
`RunType` — the emitter convention, in
[`internal/enrichment/validate.go`](../internal/enrichment/validate.go) over a tiny
`LiteralView` adapter (so the checks are unit-testable without a Program). Wired
diagnostics: **FT002, FT003, FT005, MD001** (the others below are deferred).

The **always-on build version is the deferred integration**: recognize the
annotation as one more marker arm during the normal scan and emit on the existing
`Diagnostic[]` channel so findings surface in Vite/HMR like today's `VL0xx` warnings
— a **new shape-aware comptime axis** (`ShapeCheckedArgs<T>`) where `CompTimeArgs`
today only checks *literalness* but this also cross-references the literal's keys
against `T`'s children and formats. The walk logic is identical to `check`; only the
trigger differs (CLI vs build scan).

### `FriendlyType` diagnostics

| Code      | Severity | Status | Meaning                                                                       |
| --------- | -------- | ------ | ---------------------------------------------------------------------------- |
| **FT002** | Error    | ✅ `check` | key is not a field of `T` — stale (field renamed/removed)              |
| **FT003** | Warning  | ✅ `check` | `$errors` key isn't a constraint this field's format declares (Go has `FormatAnnotation.Params`, so the exact set is known) |
| **FT005** | Warning  | ✅ `check` | unknown `$[…]` placeholder for this constraint/context                 |
| **FT001** | Info     | deferred | field of `T` has no label (renders the raw name)                       |
| **FT004** | Error    | deferred (TS catches) | structural mismatch (object node where `T` is scalar)     |
| **FT010** | Info     | deferred | `T`'s structural id changed since authored — review for semantic drift |

### `MockData` diagnostics

| Code      | Severity | Status | Meaning                                                            |
| --------- | -------- | ------ | ----------------------------------------------------------------- |
| **MD001** | Error    | ✅ `check` | key is not a field of `T`                                      |
| **MD002** | Error    | deferred (TS catches) | structural mismatch                               |
| **MD003** | Error    | deferred (needs validator) | a pool/range value **fails validation** against the field's type/format |
| **MD004** | Warning  | deferred | `min > max`, or `$length` inverted                              |
| **MD005** | Info     | deferred | pool below a configured floor (e.g. `< 50`) — off by default     |
| **MD010** | Info     | deferred | structural drift since authored                                 |

### Drift detection (FT010 / MD010)

Structural diagnostics catch field renames/removals, but not *semantic* drift
("shape unchanged, meaning moved"). Stamp each generated artifact with `T`'s
structural-id hash in a header comment; the normal scan compares it to the live
type and emits an Info nudge when they differ. LLMs retrieve all of these via the
CLI (below) rather than scraping editor output.

---

## CLI surface

| Command                                         | Purpose                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ts-runtypes check [glob]`                      | Run FT/MD validation standalone; non-zero exit on Error. CI / pre-commit.                 |
| `ts-runtypes check --file <p> --json`           | Validate **one file**, structured JSON out. The agent's tight feedback tool.              |
| `ts-runtypes describe <file>#<Type> --format prompt\|json` | Emit the type's shape (names, kinds, optionality, formats, literals — all already in the `RunType` struct) as LLM prompt context. |
| `ts-runtypes gen <file> [--mock] [--friendly] [--check]` | Generate / refresh the `.rt.ts` sibling (see below).                             |

All three are **implemented** as out-of-band CLI modes of the Go binary. Validation
runs via the `check` verb (CI / agents); surfacing the same FT/MD diagnostics
*always-on during a Vite build* is the deferred integration (see Validation below).

### The agent loop — the compiler as a tool for the LLM

```
describe ./models/user.ts#User  ──►  agent writes/patches user.rt.ts  ──►  check --file user.rt.ts --json
        ▲                                                                          │
        └──────────────────────────  loop until clean  ◄────────────────────────────┘
                                            │
                                 human reviews the diff, commits
```

`describe` is the prompt context; `check --file --json` is the ground-truth
correctness check. The Go binary already runs as a long-lived process under the
plugin, so `check --file` is a cheap incremental op. The same two ops are exactly
what you'd expose as **MCP tools** so any agent (Claude Code, Cursor, your own)
can drive generation, vendor-neutral.

### Process model — where each command runs (decided)

**No new binary, all Go-side, CLI-arg-driven.** `describe` / `check` / `gen` are
new **command-line modes** of the existing binary (`main.go` is flag-only today —
add subcommand/positional dispatch). They are **out-of-band, one-shot commands a
developer or agent runs deliberately — NOT part of the Vite build.** The Vite
resolver process is untouched and still emits no `.rt.ts`; "build time" is the wrong
label for generation.

- **The `gen` codegen emitter lives in Go.** It walks the `RunType` graph — a giant
  `switch` over `RunType.kind`, the same emitter pattern as
  [`serialize.go`](../internal/compiled/runtype/serialize.go) and the typefns
  families — and **emits new `.rt.ts` files or appends to existing ones**. Keeping it
  Go-side reuses that walk; doing it in JS would mean shipping the graph to Node and
  re-implementing the kind-switch — duplicating the emitter for nothing. Because
  `gen` is one-shot (not a tight loop), paying the `Program` build per invocation is
  fine — it builds, walks, writes, exits.
- **`describe` / `check` are the same kind-switch walk** (output: prompt text / JSON
  / diagnostics rather than files). For a tight agent loop that wants them fast and
  repeated, the binary's existing **`--daemon`** keeps one warm `Program` alive — no
  new binary, warmth is an existing knob. `check`'s analysis is the *same* validation
  the always-on scan runs during a real Vite build; the CLI just runs it standalone.
- **Public surface stays in the npm package** via a thin `ts-runtypes` bin that
  shells to the Go binary — per CLAUDE.md ("the JS packages are the only public
  surface") — but the *logic* (the emitter, the walk, file I/O) is Go.

(Earlier draft split file-writing onto the JS side; superseded — the emitter is a
`RunType.kind` switch, so it belongs in Go with the other emitters.)

**Never call an LLM inside a build.** Builds stay pure and deterministic. Any
LLM-backed generation is an explicit, opt-in CLI/agent action that writes a
reviewable diff; results are always committed and human-reviewed.

---

## The `.rt.ts` sibling

Enrichment is stored in a committed sibling of the file where the **type is
defined** — not where it is consumed. This mirrors the cache's core rule (*one
canonical entry per structural id, app-wide*, demand discovered at scattered call
sites): the `.rt.ts` sibling is the committed analog — **one enrichment home per
type, at the type's definition**, however many files consume it.

```
src/models/user.ts        interface User { … }              ← definition
src/services/userApi.ts   createMockType<User>()            ← consumer
src/test/fixtures.ts      createMockType<User>()            ← consumer
                          ──────────────────────────────────
gen ⇒  src/models/user.rt.ts   export const userMock: MockData<User> = { … }
                               (ONE sibling, at the definition — not at the call sites)
```

### Algorithm

- **Demand discovery — global.** Scan all call sites across the project.
- **Output location — the definition.** For each demanded *named* type `T`, resolve
  `T` to its declaration's source file `F` (following re-exports to the original),
  and write/refresh `F.rt.ts`.

One `.rt.ts` per source file holds one export per enriched type defined there:

```ts
// src/models/user.rt.ts — GENERATED, COMMITTED, hand-editable.  rt-id: 9f3a  (User structural hash)
import type { User, Post } from './user';

export const userMock:     MockData<User>     = { /* … */ };
export const userFriendly: FriendlyType<User> = { /* … */ };
export const postMock:     MockData<Post>     = { /* … */ };
```

This is the **first committed RunTypes artifact** — every other output is gitignored
cache. The `import type` line is best-effort: if a consumed type isn't exported,
the generated file simply fails to compile and the user fixes the export.

### Named-type-driven emission (decided)

Generation is driven by **type names** — the same principle as the cache (*one entry
per named type*). An inlined/anonymous type cannot own a `const`, so the split of the
emitted output mirrors the **named-type** structure:

- **Each named type → its own `const`** (`friendly<Name>` / `mock<Name>`). A field
  whose type is *another named type* is a **reference by name**, not an inlined copy —
  a cross-file `import` from that type's definition-anchored sibling (this is why
  `declFile`, [Prerequisites](#prerequisites-on-the-existing-system), is **required**,
  not deferred). Within one file (e.g. a test fixture declaring several interfaces)
  the references are intra-file const references, no imports.
- **Anonymous / inline shapes are inlined** into their parent const (no name → no const).
- **Cycles break at the back-edge.** Emit named consts in dependency (topological)
  order; a back-edge to an already-in-progress named type becomes a **leaf node**
  (friendly `{$label:''}`, mock `{}`) so the const graph never hits a TDZ self-reference.

```ts
// interface A { id: string; b: B }   interface B { id: string; a: A }
export const friendlyB: FriendlyType<B> = {$label: '', id: {$label: ''}, a: {$label: ''}}; // back-edge → leaf
export const friendlyA: FriendlyType<A> = {$label: '', id: {$label: ''}, b: friendlyB};     // forward ref
```

### Structural node shapes (solution A)

The emitter **reflects type structure at the node level too** — composite kinds are NOT
collapsed to opaque leaves. New DSL shapes (the `FriendlyType<T>`/`MockData<T>` mapped
types model the same):

| Kind | friendly node | mock node |
| --- | --- | --- |
| tuple `[A, B]` | `{$label?, $slots: [node, node]}` | `{$slots: [node, node]}` (fixed length, no `$length`) |
| `Map<K,V>` | `{$label?, $keys: node, $values: node}` | `{$keys: node, $values: node, $size?: [min,max]}` |
| `Set<U>` | `{$label?, $values: node}` | `{$values: node, $size?: [min,max]}` |
| index sig `{[k]:V}` | `{$label?, $values: node}` | `{$values: node, $size?: [min,max]}` |
| array `U[]` | `{$label?, $items: node}` | `{$items: node, $length?}` |

Tuples use **`$slots`** (per-slot, homomorphic `{[K in keyof T]: node}`) — the correct
reflection of a fixed tuple — distinct from arrays' `$items`/`$length`. Map/Set/index-sig
get `$keys`/`$values`/`$size`. This supersedes the earlier leaf-pool divergence: the
emitter and the DSL types now agree structurally for every kind.

### Trigger policy

| Artifact         | Generated for…                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| `FriendlyType<T>`| **any** type referenced by **any** RunTypes marker (broad — friendly also serves future UI, so we scaffold eagerly) |
| `MockData<T>`    | only types consumed by a **`createMockType`** call (demand-driven by the mock consumer) |

### `gen` semantics

- **Best-effort.** Emits the sibling + `import type`; broken exports are the user's
  to fix.
- **Create-only (for now).** Detect existing entries (parse, or even a regex on the
  export name); if present, **skip**. Append missing entries. Never rewrite existing
  content — these files are hand-editable and AI-authored. (Parsing an existing entry
  to fill *missing fields within it* is a future enhancement.)

### Edge cases

| Case                                          | Policy                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Named type in user `.ts`                      | sibling of its definition file — the rule                               |
| Several types in one file                     | one `.rt.ts`, one export per type                                       |
| Re-exported / `import type` aliased           | follow to the original declaration; sibling lives there                 |
| Anonymous/inline `createMockType<{a:string}>()` | no named home → **skip** (no sibling)                                 |
| Generic instantiations `Box<string>` vs `Box<number>` | separate entries in `Box`'s sibling, one per structural id, name-disambiguated |
| Type declared only in a `.d.ts`               | sibling can't be `.d.ts` (no runtime value) → emit a `.ts` sibling next to it |
| Existing hand-edited `.rt.ts`                 | create-only — skip present entries, append missing ones, never clobber  |

### External / library types — a resolution order

A type defined in `node_modules` can't get a sibling there (the dir is ephemeral
and wiped on install). And a dependency might **already ship** enrichment for its
own types — so we must never blindly generate over it. That makes external-type
enrichment a lookup-precedence problem. **Enrichment for `T`, first match wins:**

1. **`T` defined in your source** → its definition-file sibling `*.rt.ts`. *(generated by `gen`)*
2. **`T` from a dependency that ships enrichment** → use the library's `*.rt.ts` / named enrichment exports. *(read-only, vendored — we consume, never generate)*
3. **`T` from a dependency, user opted in** via a `@rtEnrich` JSDoc tag → user-authored override in a configured dir (`rt-overrides/`). *(opt-in only)*
4. **No match** → emit nothing; factories fall back (mock = mechanical `createMockType`; friendly = raw field names).

So **by default we emit nothing for external types** — they land at #4 unless the
library provides (#2) or the user explicitly opts in (#3). Built-ins (`Date`,
`Map`, …) are #4 by nature; `createMockType` already mocks them mechanically.

Two implications:

- **Enrichment becomes part of a library's public API.** A library that wants to
  support this adds `ts-runtypes` (for the `FriendlyType`/`MockData` types) and
  ships `customer.rt.ts` next to `customer.d.ts`; our resolver finds it by the same
  sibling convention — no special-casing.
- **The opt-in tag needs an anchor.** The cleanest is a tagged local re-export,
  which gives both the opt-in signal and a stable import:

  ```ts
  /** @rtEnrich */
  export type { Customer } from 'stripe';
  ```

  The tag flips generation on for that type; output lands in the configured override
  dir. (A config array of type names is the alternative if you'd rather not touch
  source.)

---

## Wiring and the `rtUtils` registry roadmap

### v1 — explicit wiring

The consumer imports the enrichment from the sibling and passes it. Plain,
greppable code, no injection magic:

```ts
import { userMock } from '../models/user.rt';
createMockType<User>({ data: userMock });
```

### v2 — registry accessors (the on-ramp to UI)

The natural RunTypes-native evolution is to route enrichment through `rtUtils` by
**injected type id**, exactly like the reflection cache. The consumer stops caring
*where* the data physically lives:

```ts
// reflection accessors, all keyed by InjectRunTypeId<T>, all resolving from rtUtils
getRunTypeId<User>()                  // exists today
getFriendlyType<User>()               // → rtUtils.getFriendly(id)
getMockData<User>()                   // → rtUtils.getMock(id)

// the .rt.ts self-registers — also a marker call, id injected at scan time
registerFriendly<User>(userFriendly); // → rtUtils.registerFriendly(id, data)
```

This is the same machinery the deferred UI case needs: once enrichment resolves by
injected id through `rtUtils`, `getFriendlyType<T>()` can hand back *both* the
friendly map and the runtype node by that one id — so building the registry now is
what makes the UI form-builder a one-line addition later.

Two caveats to bank for when v2 is built:

1. **The registry is only populated if the `.rt.ts` was loaded.** So
   `getFriendlyType<User>()` still needs a thin **injected side-effect import**
   (plugin resolves `User → user.rt.ts` and injects `import 'user.rt.ts'` for its
   registration side-effect) — much lighter than threading data through call args,
   and the same import-injection RunTypes already does for the runtype bundle. The
   wiring moves from the user to the plugin; it does not vanish.
2. **Mock data must not bloat production.** Friendly labels/messages belong in the
   prod bundle (UI); 50+-item mock pools almost never do. Side-effect registration
   resists tree-shaking, so gate mock registration to dev/test (a condition or a
   test-only entry) while friendly ships normally.

---

## Prerequisites on the existing system

- **Surface the type's declaration file.** Placing the sibling at the definition
  requires `declFile` (+ `declName`) on the resolved type. The binary already reads
  this internally (`symbol.Declarations → GetSourceFileOfNode()`;
  `declarationPos` in
  [`serialize.go`](../internal/compiled/runtype/serialize.go)) but does not
  serialize it — it's the "location" slot the protocol reserves but never populates.
  It's also what `describe` wants for prompt context, so it pays for itself.
- **`$[val]` enrichment.** `format.val` is overloaded — the param for
  numeric/length constraints, a pre-baked *message* for `pattern`/`allowedChars`,
  *absent* for date bounds. For `$[val]` to resolve uniformly to the declared
  bound, always carry the raw param value and stop overloading `val` with messages.
  A small, localized change to the format-error emit in
  [`internal/compiled/typefns/formats/emit.go`](../internal/compiled/typefns/formats/emit.go).
- **No new emit family.** Unlike `validate`/`json`/`binary`, this feature adds **no**
  Go emitter and **no** runtime codegen. It needs only (1) the `ShapeCheckedArgs<T>`
  validation axis, and (2) for v2, the `rtUtils` accessors + side-effect import
  injection. Keep it out of the `operations` / `typefns.Families` registries.

---

## Decided defaults / out of scope

These were the open small-detail questions; all are now **decided** (none affect the
overall architecture) and documented here:

- **i18n.** v1 is single-locale. A `Record<Locale, FriendlyType<T>>` wrapper can be
  added later without a breaking change; the same marker-detection that finds
  enrichment can emit a translation-file scaffold per locale.
- **`$[value]`** (the actual received value) in templates — needs the input threaded
  into the renderer or added to `RunTypeError`. Revisit with the `$[val]` enrichment.
- **Union per-member addressing** (`$members`) — node-level `$label`/`$errors` only
  for v1.
- **Auto-wire vs explicit** — explicit in v1; auto-wire arrives with the v2 registry
  accessors (as an injected side-effect import).
- **`MockData` pool floor** (MD005) — warn-only, threshold configurable, off by
  default.

See [ROADMAP.md](./ROADMAP.md) for the broader parked-questions list and
[CLAUDE.md](../CLAUDE.md) → "validate contract" for the serializable-data semantics
that bound what the friendly-error layer can describe.
