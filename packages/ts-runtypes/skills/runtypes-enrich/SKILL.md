---
name: runtypes-enrich
description: Drive the RunTypes enrichment workflow — author and maintain the committed, type-keyed FriendlyType<T> (human labels + error messages) and MockData<T> (realistic sample data) for a type. Use when scaffolding or filling a type's enrichment file, when running the `ts-runtypes` CLI (`describe` / `gen` / `gen --update` / `gen --prune` / `check`), when filling `@todo` blanks the compiler left, or when working with the enrichment JSDoc tags (`@rtType`, `@rtIds`, `@rtOrphan`, `@rtOrphanChild`, `@todo`). Covers the mirror directory, the compiler-scaffolds/agent-fills loop, the node shapes, and the placeholder DSL.
---

# RunTypes enrichment — the compiler scaffolds, you fill the blanks

Enrichment is the **committed, type-keyed data RunTypes can't generate on its own**: human
labels + error messages (`FriendlyType<T>`) and realistic sample values (`MockData<T>`).
Unlike validators/codecs (pure functions of the type, recomputed every build, never
committed), enrichment is **authored once, committed, and validated against the type
forever after**. Full design: [docs/AI_ENRICHMENT.md](https://github.com/mionkit/ts-runtypes/blob/main/docs/AI_ENRICHMENT.md).

The division of labour: **the compiler writes the code; you (the agent) fill the blanks.**
The compiler scaffolds a real, type-accurate file with every field in place and the gaps
marked `@todo`; your job is to fill those gaps with believable, valid content.

## The loop

1. **`describe`** — ask the compiler what a type looks like (fields, kinds, format rules).
   This is your context for writing good values.
2. **`gen`** — the compiler scaffolds the mirror file: one entry per field, correctly
   typed, each blank marked `@todo`.
3. **Fill the `@todo`s** — write the labels, messages, and sample values; delete each
   `@todo` line as you finish it.
4. **`check`** — the compiler validates every authored value against the live type.
   Fix anything it flags, repeat until clean.
5. **`gen --update`** — when the type later changes, re-sync the file *value-preservingly*
   (property merge + field rename + orphaning); fill any new `@todo`s it adds.
6. **`gen --prune`** — the only destructive op: removes the `@rtOrphan`/`@rtOrphanChild`
   carcasses left by deleted types/fields.

Never call an LLM inside a build — enrichment authoring is an explicit, out-of-band step
that produces a reviewable, committed diff.

## Where it lives — the mirror directory

Enrichment is committed to a **mirror directory** whose tree shadows your source: a type
defined in `<rootDir>/models/user.ts` gets its enrichment in
`<enrichDir>/models/user.ts` (default `enrichDir`: `runtypes/generated`, configurable via
the `ts-runtypes` entry under `compilerOptions.plugins` in `tsconfig.json`). One mirror
file per source file, anchored at the type's **definition** (not its call sites).

The mirror file holds a strict `import type` back to the source (the rename **breadcrumb**)
and committed consts you import by name:

```ts
// runtypes/generated/models/user.ts — GENERATED, COMMITTED, hand-editable
import type { User } from '../../../models/user';
import type { FriendlyType, MockData } from 'ts-runtypes';

/** @rtType User#9f3a @rtIds {name: a1, age: b2} */
// @todo: generated skeleton — fill in real data, then delete this line
export const userMock: MockData<User> = { name: { pool: [] }, age: { pool: [] } };
```

Consumers use a **real, committed import** (never plugin-injected — enrichment is
committed, so its link is committed too):

```ts
import { userMock } from 'runtypes/generated/models/user';
createMockType<User>({ data: userMock });
```

## The JSDoc tags

`@rt`-prefixed tags are **compiler-owned** — the compiler reads/writes them; do not edit
them by hand. A plain `@todo` is **yours** — the compiler only emits it.

| Tag | Owner | Meaning |
| --- | --- | --- |
| `@rtType <Name>#<id>` | compiler | the const's stable structural identity; reconcile matches by this, not the var name |
| `@rtIds {field: id, …}` | compiler | each field's child type id — lets `--update` detect a field **rename** and carry your value across |
| `@rtOrphan …` | compiler | a whole const whose source type is gone — commented out (value preserved), removed by `--prune` |
| `@rtOrphanChild …` | compiler | a single field removed from the type — commented out (value preserved), removed by `--prune` |
| `@todo …` | **you** | a blank the compiler scaffolded — fill it in, then **delete the line** |

Hand-authored comments are preserved across `--update` and travel with a renamed field.
`--update` never edits your values; it only adds blanks, flags stale values, and orphans
gone fields. `--prune` is the only command that deletes.

## `FriendlyType<T>` — labels + error messages

A combined, per-field map: `$label` (human name) + `$errors` (one message template per
failed constraint). Pure data; rendered at runtime by `createFriendly<T>(map)`.

- Node shape: `{ $label?, $errors?, ...childFields }` — `$`-keys are meta, every other key
  is a child field; nests the same way at every depth. Arrays/tuples use `$items`/`$slots`;
  Map/Set use `$keys`/`$values`.
- `$errors` keys name the **failed constraint** (`type`, `minLength`, `min`, `max`,
  `pattern`, …, `$default`) — bounded by the type: a bare `string` only has `type`.
- Placeholder DSL in templates: `$[label]`, `$[val]` (the constraint bound), `$[path]`,
  `$[index]`.
- `$errors` is either a `{ constraint: template }` record (one message per constraint,
  compiler-validated) or an inline `(failed) => string` (one message per field, for
  joining/pluralization/i18n).

```ts
export const userFriendly: FriendlyType<User> = {
  $label: 'User account',
  name: { $label: 'Full name', $errors: {
    type: '$[label] must be text',
    minLength: '$[label] needs at least $[val] characters',
  } },
};
```

Use it to turn `createGetValidationErrors<T>()` output into readable messages:
`createFriendly<T>(map).errors(errs)` → `{ path, label, message }[]`; `.label(path)` for a
field's label.

## `MockData<T>` — realistic sample data

Per-field value pools and ranges that feed `createMockType<T>({ data })`. The mechanical
generator handles structure + format-correctness; you supply *believable* values.

- `pool: [...]` — draw from this list (strings, numbers, booleans, …).
- `min` / `max` — bound numbers/dates.
- `$items` + `$length` — array element node + length; `$slots` — fixed tuple slots;
  `$keys` / `$values` — Map/Set.
- Object fields recurse; `$optional` sets present-probability for optional members.

```ts
export const userMock: MockData<User> = {
  name: { pool: ['Ada Lovelace', 'Linus Torvalds', 'Grace Hopper'] },
  age: { min: 18, max: 95 },
};
```

Every pool/range value is **validated against its field** at build time — a malformed
email in an `email` pool, or an out-of-range number, is a build error.

## Authoring checklist

- Run `describe <file> <Type>` first; write values that fit the field's kind + format.
- Fill **every `@todo`** the scaffold left, then **delete that `@todo` line**.
- Never touch `@rt*` tags or `@rtOrphan`/`@rtOrphanChild` comment blocks — the compiler
  owns them; `--prune` clears orphans.
- Friendly `$errors` keys must match the field's **declared** constraints only.
- Keep mock pools out of production bundles (use them in tests/seeds — normal
  tree-shaking handles it).
- After editing, run `check` and resolve every Error before committing.
- When the type changes, prefer `gen --update` (keeps your values) over regenerating.
