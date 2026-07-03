---
name: rt-enrich-types
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
7. **`gen --translate <locale|all> [<src.ts>] [--update|--prune]`** — scaffold, reconcile,
   or prune the per-locale translation files of the friendly maps (see **Translations**
   below).
8. **`check --translate <locale|all>`** — the translation completeness gate for CI
   (TR001–TR005; see **Translations** below).

Never call an LLM inside a build — enrichment authoring is an explicit, out-of-band step
that produces a reviewable, committed diff.

## Where it lives — the mirror directory, one file per family

Enrichment is committed to a **mirror directory** whose tree shadows your source, split
**per family**: a type defined in `<rootDir>/models/user.ts` gets its `friendly<Name>`
consts (`FriendlyType<Name>`) in `<enrichDir>/friendly/models/user.ts` and its
`mock<Name>` consts (`MockData<Name>`) in `<enrichDir>/mock/models/user.ts` (default
`enrichDir`: `runtypes/generated`, configurable via the `ts-runtypes` entry under
`compilerOptions.plugins` in `tsconfig.json`). One mirror file per family per source
file, anchored at the type's **definition** (not its call sites); the two families never
share a file, and each family file imports only its own wrapper type.

A pre-split combined mirror is migrated automatically on the next `gen` run over that
source: every const, marker, comment and `@rtOrphan` carcass is carried verbatim into its
family's file, the source breadcrumb import is recomputed, and the old combined file is
deleted (an existing family file is never overwritten — a warning is printed instead).
`gen --check` flags a pre-split combined mirror as GE001 location drift. `--out` keeps the
old combined single-file behavior as an explicit escape hatch.

Each family file holds a strict `import type` back to the source (the rename
**breadcrumb**) and committed consts you import by name:

```ts
// runtypes/generated/mock/models/user.ts — GENERATED, COMMITTED, hand-editable
import type { User } from '../../../../models/user';
import type { MockData } from 'ts-runtypes';

/** @rtType User#9f3a @rtIds {name: a1, age: b2} */
// @todo: generated skeleton — fill in real data, then delete this line
export const mockUser: MockData<User> = { name: { pool: [] }, age: { pool: [] } };
```

Consumers use a **real, committed import** (never plugin-injected — enrichment is
committed, so its link is committed too):

```ts
import { friendlyUser } from 'runtypes/generated/friendly/models/user';
import { mockUser } from 'runtypes/generated/mock/models/user';
createMockType<User>({ data: mockUser });
```

## The JSDoc tags

`@rt`-prefixed tags are **compiler-owned** — the compiler reads/writes them; do not edit
them by hand. A plain `@todo` is **yours** — the compiler only emits it.

| Tag | Owner | Meaning |
| --- | --- | --- |
| `@rtType <Name>#<id>` | compiler | the const's stable structural identity; reconcile matches by this, not the var name |
| `@rtIds {field: id, …}` | compiler | each field's child type id — lets `--update` detect a field **rename** and carry your value across |
| `@rtI18n <locale> from '<rel>'` | compiler | marks a translation const: its locale + the relative path back to the source friendly mirror it translates |
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
- Count-bearing constraints (`minLength`, `maxLength`, `min`, `max`, `lt`, `gt`) scaffold
  a **plural object** instead of a plain string (`minLength: { one: '', other: '' }` —
  arms from the source locale's CLDR cardinal set): fill the arms, never restructure;
  only `other` is mandatory, unused arms are prunable; the plural count is the
  **violated bound** (`$[val]`), not the received value's length. A plain string stays
  legal there, and `$label` is always a plain string.

```ts
export const friendlyUser: FriendlyType<User> = {
  $label: 'User account',
  name: { $label: 'Full name', $errors: {
    type: '$[label] must be text',
    minLength: '$[label] needs at least $[val] characters',
  } },
};
```

Use it to turn `createGetValidationErrors<T>()` output into readable messages:
`createFriendly<T>(map).errors(errs)` → `{ path, label, message }[]`; `.label(path)` for a
field's label. `createFriendlyI18n(map, { locale, translations, formats?, sourceLocale? })`
is the locale-aware form — same renderer interface, selecting a committed translation via
BCP-47 matching (`resolveLocale`) with per-leaf fallback to the source map.

## Translations — per-locale friendly files

The friendly map you author IS the source language (tsconfig `i18n.sourceLocale`, default
`en`) — there is no separate default catalog. Each target locale gets committed
translation files that shadow the friendly mirror tree: `<i18nDir>/<locale>/<rel>.ts`
(default `i18nDir`: `<enrichDir>/i18n`, resolved under the project root; the locale is a
path segment, so `pt-BR` works verbatim). The const per type is `<locale>_friendly<Name>`
(BCP-47 `-` becomes `_`: `pt_BR_friendlyUser`), annotated `Translation<Name>` (an intent
alias of `FriendlyType<Name>`), carrying the SAME `@rtType <Name>#<id> @rtIds {…}` marker
as the source plus `@rtI18n <locale> from '<rel-to-source-mirror>'`.

```
ts-runtypes gen   --translate <locale> [<src.ts>]            # scaffold (create-only)
ts-runtypes gen   --translate <locale> --update [<src.ts>]   # reconcile vs the friendly source mirror
ts-runtypes gen   --translate <locale> --prune  [<src.ts>]   # strip @rtOrphan carcasses (the only delete)
ts-runtypes gen   --translate all [--update]                 # fan out over tsconfig i18n.locales
ts-runtypes check --translate <locale|all>                   # completeness gate (CI)
```

Without `<src.ts>` the verbs walk every mirror under `<enrichDir>/friendly/`.

- **Scaffold** — the source tree with every string leaf and plural arm as an `@todo`
  blank (`''`); it NEVER copies source text as if translated. Plural objects are reseeded
  with the TARGET locale's CLDR arm set, function-form `$errors` is copied verbatim, and
  const references are renamed to their locale siblings (`home: pl_friendlyAddress`).
- **Filling one** — translate ONLY blank (`''`) leaves; never edit an already-filled
  leaf; never copy the source text across. Prune plural arms your language doesn't use —
  arms are locale-owned, so a pruned arm stays pruned (only the mandatory `other` is ever
  re-inserted).
- **`--update`** — value-preserving, mirroring `gen --update`, plus it descends ONE level
  into `$errors`: a source-added constraint key arrives as a blank of the source's kind
  (string, or a plural with TARGET-locale arms); a source-dropped key becomes an
  `@rtOrphanChild` carcass; a same-key leaf is kept byte-identical. Plural arms are never
  orphaned, renamed, or down-scoped to the source's set. Type renames carry across
  locales via the shared `@rtType` id (const, annotation, marker AND intra-file
  references are renamed in place).
- **`check --translate` findings** — TR001 missing translation file; TR002 unfilled
  `@todo` blanks; TR003 out of date vs the source mirror; TR004 orphan carcasses awaiting
  review/prune; TR005 a `$[val:kind:name]` format name missing from the configured
  formats module. All Warnings (exit 0) unless tsconfig `i18n.strict: true` flips them to
  Errors (exit 1); the runtime is always lenient regardless.

The `i18n` block lives on the `ts-runtypes` tsconfig plugin entry (dormant by default —
zero change when absent):

```jsonc
{ "name": "ts-runtypes", "enrichDir": "runtypes/generated",
  "i18n": {
    "sourceLocale": "en",              // language the source FriendlyType maps are written in
    "dir": "runtypes/generated/i18n",  // translation subtree root (default <enrichDir>/i18n)
    "locales": ["es", "pl", "pt-BR"],  // target locales (the source locale is NOT listed)
    "formats": "runtypes/i18n.formats.ts", // module default-exporting Record<locale, NamedFormats>
    "strict": false                    // check --translate gate severity (CI)
  } }
```

At runtime `createFriendlyI18n(source, { locale, translations, formats?, sourceLocale? })`
returns the same renderer as `createFriendly`: a `{ value }` locale ref is re-read on
every render, `resolveLocale` picks the translation by naive BCP-47 truncation (exact
tag, then `pt-BR` → `pt`, then any tag sharing the base language), and every unfilled
leaf falls back per-leaf to the source map — it never throws on a partial translation.

## `MockData<T>` — realistic sample data

Per-field value pools and ranges that feed `createMockType<T>({ data })`. The mechanical
generator handles structure + format-correctness; you supply *believable* values.

- `pool: [...]` — draw from this list (strings, numbers, booleans, …).
- `min` / `max` — bound numbers/dates.
- `$items` + `$length` — array element node + length; `$slots` — fixed tuple slots;
  `$keys` / `$values` — Map/Set.
- Object fields recurse; `$optional` sets present-probability for optional members.

```ts
export const mockUser: MockData<User> = {
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
- Fill scaffolded plural objects arm-by-arm (keep `other`, prune unused arms); never
  turn one back into a plain string or invent arm keys.
- In a translation file, translate only blank leaves and prune unused plural arms —
  never copy source text, never edit filled leaves (see **Translations**).
- Keep mock pools out of production bundles (use them in tests/seeds — normal
  tree-shaking handles it).
- After editing, run `check` and resolve every Error before committing.
- When the type changes, prefer `gen --update` (keeps your values) over regenerating.
