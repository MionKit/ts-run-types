---
name: runtypes-mock-data
description: Author and use a `MockData<T>` for a RunTypes type — the committed, type-keyed map of realistic sample-value POOLS / RANGES per field that feed `createMockType<T>()`. Use when generating mock data, sample values, realistic test fixtures, or seed data for a type; when authoring or editing a `*.rt.ts` enrichment sibling's mock map; or when wiring per-field `{ pool }` / `{ min, max }` / `{ $items, $length }` / `{ $optional }` overrides into `createMockType<T>({ data })`. Covers the per-field node shape, that pool/range values are validated against the field's type + format at build time (the MD003 rule), and where the map lives.
---

# Authoring & using `MockData<T>`

`MockData<T>` is one of two **AI-enrichment artifacts** in RunTypes (the other is
`FriendlyType<T>` — see the `runtypes-friendly-type` skill). Unlike validators / codecs
(pure functions of the type, recomputed every build, never committed), enrichment is
**authored once, committed, and validated against the type forever after**. The full
design is [docs/AI_ENRICHMENT.md](../../../docs/AI_ENRICHMENT.md).

A `MockData<T>` is a per-field map of **realistic sample values** — pools, ranges,
element + length hints, optional-probability — that feeds the existing
`createMockType<T>()` generator. The mechanical generator stays deterministic; the map
only supplies the realistic *values* (a believable name, a plausible age, a valid
email). The DSL type is
[`mockData.ts`](../../../packages/ts-runtypes/src/enrichment/mockData.ts), exported from
`ts-runtypes`.

## When to use it

- You call `createMockType<T>()` and the mechanical random values are unrealistic
  (random strings for names, out-of-domain numbers) and you want believable fixtures.
- You're building test fixtures / seed data and want pools of real-looking values that
  are still **guaranteed valid** for the type.
- You're scaffolding a type's committed `*.rt.ts` enrichment sibling.

If random-but-valid values are fine, just call `createMockType<T>()` with no `data` —
the generator already mocks every shape mechanically (including `Date`, `Map`, `Set`).

## What is shipped today vs designed

- **Shipped:** the `MockData<T>` DSL type
  ([`mockData.ts`](../../../packages/ts-runtypes/src/enrichment/mockData.ts)) AND the
  `{ data }` option on `createMockType<T>()`
  ([`createMockType.ts`](../../../packages/ts-runtypes/src/mocking/createMockType.ts)) —
  pass `createMockType<T>({ data })` and generated values are drawn from the authored
  pools / ranges. Both exported from `ts-runtypes`.
- **Designed (not yet wired):** the MD003 pool-value validation (build-time check that
  each pool entry satisfies the field), and the `gen` CLI that scaffolds the `*.rt.ts`
  sibling. The map is type-checked against `T` today regardless.

## The node model — per-field pools / ranges

One recursive node, uniform at every depth, structure checked against `T` by the
`MockData<T>` mapped type. Per-field shape depends on the field's kind:

| Field kind        | Node shape                                                        |
| ----------------- | ---------------------------------------------------------------- |
| string            | `{ pool?: string[] }`                                             |
| number            | `{ pool?: number[]; min?: number; max?: number }`                |
| `Date`            | `{ pool?: Date[]; min?: Date; max?: Date }`                       |
| boolean / bigint  | `{ pool?: boolean[] }` / `{ pool?: bigint[] }`                    |
| array / tuple     | `{ $items?: <element node>; $length?: number \| [number, number] }` |
| object            | `{ [K in keyof T]?: <child node> } & { $optional?: number }`     |

- **`pool`** — pick a value at random from this list.
- **`min` / `max`** — inclusive bounds (numbers, `Date`s).
- **`$items`** — the element node for array/tuple members.
- **`$length`** — array length, fixed (`3`) or a `[min, max]` range.
- **`$optional`** — present-probability (0..1) for optional members on an object node.

## The pool-validation superpower (MD003)

Because RunTypes can **validate**, the compiler checks that **every pool / range value
actually satisfies its field's type and format** — at build time, not test runtime. An
LLM that hallucinates a malformed email into the `email` pool, or a `score` of `150`
into a `FormatNumber<{max: 100}>` field, is caught at parse time (MD003, Error). No
other mock library can do this — it falls straight out of the existing validator. Other
designed diagnostics: MD001 (key not a field of `T`), MD002 (structural mismatch), MD004
(`min > max` / inverted `$length`), MD005 (pool below a configured floor, off by
default).

## Where the map lives — the `.rt.ts` sibling

Like `FriendlyType<T>`, a `MockData<T>` map is committed in a sibling of the file where
the **type is defined**, not where it's consumed: `src/models/user.ts` →
`src/models/user.rt.ts`. One sibling per source file, one `export` per enriched type
defined there — **one enrichment home per type, at its definition**, however many files
mock it. It's the first committed RunTypes artifact (everything else is gitignored
cache) and is hand-editable. `MockData<T>` is generated **demand-driven** — only for
types actually consumed by a `createMockType` call.

```ts
// src/models/user.rt.ts — committed, hand-editable.  rt-id: 9f3a (User structural hash)
import type {MockData} from 'ts-runtypes';
import type {User} from './user';

export const userMock: MockData<User> = { /* … */ };
```

## Feeding it to `createMockType<T>()`

The consumer imports the map from the sibling and passes it via the `data` option
(plain, greppable wiring — no injection magic):

```ts
import {createMockType} from 'ts-runtypes';
import {userMock} from '../models/user.rt';
import type {User} from '../models/user';

const mockUser = createMockType<User>({data: userMock});
const sample = mockUser();   // realistic, type-valid User
```

(`data` rides the same options bag as `{ mock }` — `createMockType<T>({ data, mock })`.
Supplying no `data` mocks mechanically, exactly as before. The map is type-checked
against `T` regardless.)

## End-to-end example

```ts
// src/models/user.ts — the DEFINITION
import type {FormatNumber, FormatEmail} from 'ts-runtypes';

export interface User {
  name: string;
  age: FormatNumber<{min: 0; max: 120}>;
  tags: string[];
  profile: {
    email: FormatEmail;
    score: FormatNumber<{min: 0; max: 100}>;
  };
}
```

```ts
// src/models/user.rt.ts — the committed enrichment sibling
import type {MockData} from 'ts-runtypes';
import type {User} from './user';

export const userMock: MockData<User> = {
  name: {pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor', 'Diego Ramirez']},
  age: {min: 18, max: 95},
  tags: {
    $items: {pool: ['urgent', 'beta', 'vip']},   // element node
    $length: [1, 4],                              // 1–4 tags
  },
  profile: {
    email: {pool: ['alice@example.com', 'liang@corp.io', 'fatima@mail.net']},
    score: {min: 0, max: 100},
  },
};
```

```ts
// src/test/fixtures.ts — the CONSUMER
import {createMockType} from 'ts-runtypes';
import {userMock} from '../models/user.rt';
import type {User} from '../models/user';

const mockUser = createMockType<User>({data: userMock});

const fixture = mockUser();
// e.g. { name: 'Liang Wei', age: 41, tags: ['beta','vip'],
//        profile: { email: 'alice@example.com', score: 72 } }
```

Every value above is guaranteed to satisfy `User` — MD003 rejects any pool/range value
that doesn't at build time, so a stray `age: 200` or `email: 'nope'` in the map fails the
build, never the test.

## Authoring checklist

- Put the map in the **definition file's** `*.rt.ts` sibling, not the consumer's.
- Type it `MockData<T>` so structure is checked against `T`.
- Use `pool` for enumerable/realistic values (names, emails, tags); use `min`/`max` for
  numeric and `Date` ranges.
- Keep every pool/range value **valid for the field's type + format** — MD003 will
  reject `score: 150` against `FormatNumber<{max: 100}>`.
- For arrays set `$items` (element values) and `$length` (count); for objects use
  `$optional` to tune optional-member probability.
- Aim for a healthy pool size (the design notes a floor around 50 for realistic
  variation; MD005 is an off-by-default nudge).
