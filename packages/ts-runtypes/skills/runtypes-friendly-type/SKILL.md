---
name: runtypes-friendly-type
description: Author and use a `FriendlyType<T>` for a RunTypes type — the committed, type-keyed map of human-readable field LABELS + ERROR-MESSAGE templates. Use when writing or editing friendly validation errors, friendly/human-readable field labels, form-builder labels, or a `*.rt.ts` enrichment sibling; when turning `createGetValidationErrors<T>()` output into readable messages via `createFriendly<T>(map).errors(...)`; or when an `$errors` / `$label` / `$[label]` / `$[val]` placeholder template needs writing. Covers the `{ $label, $errors, ...children }` node shape, the `$[…]` placeholder DSL, error-template keys (the failed-constraint name: `type`, `minLength`, `min`, `max`, `pattern`, …, `$default`), the data-form vs inline-function escape hatch, and where the map lives.
---

# Authoring & using `FriendlyType<T>`

`FriendlyType<T>` is one of two **AI-enrichment artifacts** in RunTypes (the other is
`MockData<T>` — see the `runtypes-mock-data` skill). Unlike validators / codecs (pure
functions of the type, recomputed every build, never committed), enrichment is
**authored once, committed, and validated against the type forever after**. The full
design is [docs/AI_ENRICHMENT.md](https://github.com/mionkit/ts-runtypes/blob/main/docs/AI_ENRICHMENT.md).

A `FriendlyType<T>` is a combined, per-field map of:

- **labels** — `$label`, a human name for each field (`'Full name'` for `name`);
- **error-message templates** — `$errors`, one template per failed constraint.

It is **pure data**. The shipped runtime renderer is
[`createFriendly<T>(map)`](https://github.com/mionkit/ts-runtypes/blob/main/packages/ts-runtypes/src/enrich/createFriendly.ts);
it turns `createGetValidationErrors<T>()` output into readable messages. No type-id
injection, no `rtUtils` — error rendering needs only `(map, errors)`.

## When to use it

- You have `createGetValidationErrors<T>()` errors (`RunTypeError[]`) and want
  human-readable messages instead of raw `{ path, expected, format }`.
- You need stable, human field **labels** (form building, error summaries).
- You're scaffolding a type's committed friendly mirror file, or filling a
  `Translation<T>` file for another locale (rendered via `createFriendlyI18n`).

If you only need a boolean pass/fail, use `createValidate<T>()` directly — no friendly
map involved.

## What is shipped today vs designed

- **Shipped:** the `FriendlyType<T>` DSL type with the plural + translation types
  (`PluralTemplate`, `TemplateLeaf`, `PluralCategory`, `Translation<T>`)
  ([`friendlyType.ts`](https://github.com/mionkit/ts-runtypes/blob/main/packages/ts-runtypes/src/enrich/friendlyType.ts)); the
  plural-aware `createFriendly<T>(map)` renderer plus `createFriendlyI18n`,
  `resolveLocale` and `NamedFormats`
  ([`createFriendly.ts`](https://github.com/mionkit/ts-runtypes/blob/main/packages/ts-runtypes/src/enrich/createFriendly.ts)) —
  all exported from `ts-runtypes`. The `gen` / `check` CLI (including `--translate`)
  scaffolds and validates the committed maps — see the `rt-enrich-types` skill.
- **Designed (not yet wired):** the `ShapeCheckedArgs<T>` compile-time axis and
  `rtUtils` registry accessors.

## The node model — `{ $label, $errors, ...children }`

One recursive node, uniform at every depth. `$`-prefixed keys are **meta**; every other
key is a **child field**. Leaf nodes simply have no children — there is no `fields:`
wrapper.

- `$label?: string` — the field's human name; always a plain string.
- `$errors?` — per-constraint message templates (data form) OR an inline function. A
  template leaf is a plain string, or on count-bearing constraints a **plural object**
  (`TemplateLeaf = string | PluralTemplate` — see the plural section below).
- Arrays (and rest tuples) carry `$items` (the element node); fixed tuples carry
  positional `$slots`; `Map` carries `$keys` / `$values` and `Set` carries `$values`.
- Nested objects recurse with the _same_ node shape.

The map's structure is checked against `T` by the `FriendlyType<T>` mapped type:
authoring an object node where `T` is scalar (or vice-versa) is a type error.

## `$errors` keys = the failed-constraint name

Each `$errors` key names the sub-constraint that failed. This is **not** an invented key
set — it maps 1:1 onto what `createGetValidationErrors<T>()` emits. The renderer picks
the template by the error's `(format.name, formatPath-tail)` discriminator:

- `type` — the base type-shape failure (a `RunTypeError` with no `.format`): "this
  isn't even the right kind of value".
- Format sub-constraints, exactly as the type declares them:
  - string: `minLength`, `maxLength`, `pattern`, `allowedChars`
  - number: `min`, `max`, `lt`, `gt`, `integer`
  - datetime: `date`, `time`, `splitChar`
  - `Date` bound: `min` / `max`; `uuid`: `version`
- `$default` — fallback used when no key matches the failed constraint.

**Constraint granularity is bounded by the type.** A bare `name: string` can only fail
as `type`. You only get `minLength` / `maxLength` keys because the field is declared
`FormatString<{minLength; maxLength}>`. A richer friendly map requires a richer type
annotation.

Errors **accumulate** — a value violating `minLength` _and_ `pattern` yields two
messages (a list), one per violated constraint.

## The placeholder DSL

Templates are plain strings with `$[…]` tokens the renderer substitutes:

| Token              | Resolves to                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$[label]`         | the node's `$label`, falling back to the raw field name                                                                                                      |
| `$[val]`           | the failed constraint's bound (`error.format.val`; e.g. `2`)                                                                                                 |
| `$[path]`          | dotted path to the field (`profile.email`)                                                                                                                   |
| `$[index]`         | array element index, for `$items` failures                                                                                                                   |
| `$[val:kind:name]` | the bound routed through a named `Intl` format (also `$[index:…]`) — kinds: `number`, `date`, `relativeTime`, `list`; names come from a `NamedFormats` table |

Unknown `$[…]` tokens — and an unknown format kind/name in a three-part token — are left
verbatim; a literal colon in prose (`ratio 3:1`) is never touched. `$[value]` (the actual
received value) is out of scope for v1 — `RunTypeError` carries no value.

## Plural templates on count-bearing constraints

On the count-bearing constraints — `minLength`, `maxLength`, `min`, `max`, `lt`, `gt` —
an error-template leaf is either a plain string or a **plural object** whose arms are
CLDR cardinal categories (`TemplateLeaf = string | PluralTemplate`; `PluralTemplate` is
`{other: string}` plus optional `zero`/`one`/`two`/`few`/`many` arms):

```ts
name: {
  $label: 'Full name',
  $errors: {
    type: '$[label] must be text',                        // plain string, as before
    minLength: {                                          // plural object
      one: '$[label] needs at least $[val] character',
      other: '$[label] needs at least $[val] characters',
    },
  },
},
```

- `gen` scaffolds the plural object for you (`minLength: {one: '', other: ''}`), its arms
  taken from the SOURCE locale's CLDR cardinal category set (tsconfig
  `i18n.sourceLocale`, default `en`; built-in table: en, es, zh, hi, ar, pt, ru, ja, de,
  fr, pl — any other locale scaffolds all six categories `zero one two few many other`).
  **Fill the arms; never restructure the object.** Only `other` is mandatory; prune the
  arms you don't use.
- All other constraints (`type`, `pattern`, `allowedChars`, …) stay plain strings, and
  `$label` is always a plain string. A plain string on a count-bearing constraint
  remains legal.
- **The plural count is the VIOLATED BOUND** (`$[val]` — a `minLength: 3` failure selects
  the arm for `3`), NOT the received value's length. The renderer picks the arm via
  `Intl.PluralRules(locale)`; `other` is the backstop, and a non-finite bound selects
  `other` directly. Plain `createFriendly` uses `en` rules (deterministic, matching the
  default `sourceLocale`).

## Data form vs the function escape hatch

`$errors` is EITHER a record of templates (the **data form**) OR an inline arrow (the
**escape hatch**):

- **Data form** — a `{ constraint: template }` record. Yields **one message per failed
  constraint**. Gets placeholder/constraint validation from `check` (FT003/FT005).
- **Function form** — `(failed) => string`. Yields **one message per field**, handed all
  of that field's failures aggregated in a `failed` bag (keyed by constraint name, each
  `{ val }`). Use it for logic the data form can't express — joining constraints,
  pluralization, i18n. Its body is opaque to the compiler and runs at runtime. It MUST
  be an inline expression (the `CompTimeArgs` literal rule — no external function ref).

```ts
// function form — join two constraints into one sentence
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

## Where the map lives — the friendly mirror file

Enrichment is committed to a **mirror directory** whose tree shadows your source, one
file per family, anchored at the file where the **type is defined**, not where it's
consumed: `src/models/user.ts` → `<enrichDir>/friendly/models/user.ts` (default
`enrichDir`: `runtypes/generated`, so `runtypes/generated/friendly/models/user.ts`),
holding `friendly<Name>` consts. `MockData<T>` consts live separately under
`<enrichDir>/mock/…` — the two families never share a file. One mirror file per source
file, one `export` per enriched type defined there. This mirrors the cache's "one
canonical entry per structural id, app-wide" rule — **one enrichment home per type, at
its definition**, however many files consume it. It is the first committed RunTypes
artifact (every other output is gitignored cache) and is hand-editable.

```ts
// runtypes/generated/friendly/models/user.ts — committed, hand-editable
import type {FriendlyType} from 'ts-runtypes';
import type {User} from '../../../../src/models/user';

/** @rtType User#9f3a @rtIds {…} */
export const friendlyUser: FriendlyType<User> = {
  /* … */
};
```

The `import type` line is best-effort — if a consumed type isn't exported, the file
fails to compile and you fix the export.

## Build-time validation — the FT0xx checks

The `check` verb cross-references the authored literal against the live `RunType` and
reports:

| Code  | Severity | Meaning                                                                                                                                                                                                      |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FT001 | Info     | a field of `T` has no label (renders the raw name)                                                                                                                                                           |
| FT002 | Error    | key is not a field of `T` — stale (field renamed/removed)                                                                                                                                                    |
| FT003 | Warning  | `$errors` key isn't a constraint this field's format declares                                                                                                                                                |
| FT004 | Error    | structural mismatch (object node where `T` is scalar, or vice-versa)                                                                                                                                         |
| FT005 | Warning  | unknown `$[…]` placeholder for this constraint/context — checked per plural arm; also validates three-part format tokens (binding must be `val`/`index`; kind must be `number`/`date`/`relativeTime`/`list`) |
| FT006 | Error    | a plural object is missing the mandatory `other` arm                                                                                                                                                         |
| FT007 | Warning  | a plural-object arm key is not a CLDR category                                                                                                                                                               |
| FT008 | Warning  | a plural object on a non-count-bearing constraint (dead arms)                                                                                                                                                |
| FT010 | Info     | `T`'s structural id changed since authored — review for drift                                                                                                                                                |

These catch drift: rename a field and `FT002` flags the now-stale entry.

## Rendering at runtime — `createFriendly<T>(map)`

```ts
import {createGetValidationErrors, createFriendly} from 'ts-runtypes';
import {friendlyUser} from 'runtypes/generated/friendly/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrors<User>();
const friendly = createFriendly<User>(friendlyUser);

friendly.errors(getUserErrors(badInput));
// → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }, …]

friendly.label('profile.email'); // → 'Email'  (falls back to the raw field name)
```

`createFriendly` returns `{ errors(errs), label(path) }`:

- `errors(errs)` — groups `RunTypeError[]` by path, looks up the node, and for each
  failed constraint interpolates the matching template (or the function form once for the
  whole field). Returns `FriendlyMessage[]` (`{ path, label, message }`).
- `label(path)` — the friendly label for a dotted path or a raw path-segment array.

## Translations — `Translation<T>` files under `<enrichDir>/i18n`

The friendly map you authored IS the source language (tsconfig `i18n.sourceLocale`,
default `en`) — there is no separate default catalog. Translation is optional per leaf;
anything unfilled falls back to the source.

- One committed file per locale per source mirror: `<i18nDir>/<locale>/<rel>.ts`
  (default `i18nDir`: `<enrichDir>/i18n`, e.g. `runtypes/generated/i18n/pl/models/user.ts`;
  the locale is a path segment, so `pt-BR` works verbatim).
- The const per type is `<locale>_friendly<Name>` — BCP-47 `-` becomes `_`
  (`pt_BR_friendlyUser`) — annotated `Translation<Name>` (an intent alias of
  `FriendlyType<Name>`), carrying the SAME `@rtType <Name>#<id> @rtIds {…}` marker as
  the source plus `@rtI18n <locale> from '<rel-to-source-mirror>'`.
- Scaffold with `ts-runtypes gen --translate <locale|all>`; reconcile with `--update`;
  strip orphan carcasses with `--prune`; gate completeness in CI with
  `check --translate <locale|all>` (findings TR001–TR005). CLI + tsconfig `i18n`
  reference: the `rt-enrich-types` skill.
- The scaffold is the source tree with every string leaf and plural arm as an `@todo`
  blank (`''`) — it NEVER copies source text as if translated. Plural objects are
  reseeded with the TARGET locale's CLDR arm set, function-form `$errors` is copied
  verbatim, and const references are renamed to their locale siblings
  (`home: pl_friendlyAddress`).

**Filling a translation file:** translate ONLY blank (`''`) leaves; never edit an
already-filled leaf; never copy the source text across. Prune the plural arms your
language doesn't use — arms are locale-owned, so a pruned arm stays pruned across
reconciles (only the mandatory `other` is ever re-inserted).

```ts
// runtypes/generated/i18n/pl/models/user.ts — committed, filled by a translator/agent
import type {Translation} from 'ts-runtypes';
import type {User} from '../../../../../src/models/user';

/** @rtType User#9f3a @rtIds {…} @rtI18n pl from '../../../friendly/models/user' */
export const pl_friendlyUser: Translation<User> = {
  /* … */
};
```

## Locale-aware rendering — `createFriendlyI18n`

`createFriendlyI18n(source, options)` returns the same `FriendlyRenderer` interface as
`createFriendly`:

```ts
import {createFriendlyI18n} from 'ts-runtypes';
import {friendlyUser} from 'runtypes/generated/friendly/models/user';
import {es_friendlyUser} from 'runtypes/generated/i18n/es/models/user';
import {pl_friendlyUser} from 'runtypes/generated/i18n/pl/models/user';

const friendly = createFriendlyI18n(friendlyUser, {
  locale: currentLocale, // string | {value: string} — a {value} ref (e.g. a Vue Ref)
  translations: {es: es_friendlyUser, pl: pl_friendlyUser},
  formats: appFormats, // optional Record<localeTag, NamedFormats> for $[val:kind:name]
  sourceLocale: 'en', // optional (default 'en'): plural rules when rendering from the SOURCE map
});

friendly.errors(getUserErrors(badInput)); // arm + template picked per the active locale
```

- A `{value}` locale ref is re-read on EVERY render, but the renderer itself is not
  reactivity-tracked — call `errors()` per render / inside `computed()`.
- Locale matching is `resolveLocale(locale, translations)`: naive BCP-47 truncation —
  exact tag, then subtags dropped right-to-left (`pt-BR` → `pt`), then any available tag
  sharing the base language (`zh-Hant` matches a `zh-Hans` file when nothing closer
  exists — deliberate, simple). Returns `undefined` when nothing shares the base
  language; the renderer then uses the source.
- Fallback is per-leaf and never throws on a partial translation (a reserved `strict`
  option exists; the runtime is always lenient): a blank (`''`) or missing translated
  leaf falls to the source — `$label` and each `$errors` key independently, with a
  node's own authored `$default` tried before falling cross-map. A plural leaf falls
  through as a WHOLE unit (never mixes a target arm with a source arm). Function-form
  `$errors` is opaque: the translation's arrow wins wholesale; a translation node
  without `$errors` falls to the source's arrow.
- Named `Intl` format tokens (`$[val:number:currency]`, `$[index:…]`): kinds `number`,
  `date`, `relativeTime` (its `NamedFormats` entry carries the required `unit` alongside
  the `Intl` options), `list` (an array-valued bound formats as a list). Unknown
  token/kind/name stays verbatim. `Intl` instances are memoized (`PluralRules` per
  locale; formatters per `NamedFormats` table).

## End-to-end example

```ts
// src/models/user.ts — the DEFINITION
import type {FormatString, FormatNumber, FormatEmail} from 'ts-runtypes';

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
// runtypes/generated/friendly/models/user.ts — the committed friendly mirror
import type {FriendlyType} from 'ts-runtypes';
import type {User} from '../../../../src/models/user';

export const friendlyUser: FriendlyType<User> = {
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
  isActive: {$label: 'Active?'},

  tags: {
    $label: 'Tags',
    $items: {$errors: {type: 'each tag must be text'}}, // element node
  },

  profile: {
    // nested object — recurse
    $label: 'Profile',
    email: {$label: 'Email', $errors: {pattern: 'Enter a valid email address'}},
    score: {$label: 'Score', $errors: {min: 'min $[val]', max: 'max $[val]'}},
  },
};
```

```ts
// src/services/userForm.ts — the CONSUMER
import {createGetValidationErrors, createFriendly} from 'ts-runtypes';
import {friendlyUser} from 'runtypes/generated/friendly/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrors<User>();
const friendly = createFriendly<User>(friendlyUser);

const messages = friendly.errors(getUserErrors({name: 'A', age: 200, profile: {email: 'nope', score: 5}}));
// name     → 'Full name needs at least 2 characters'
// age      → 'Age must be no more than 120'
// profile.email → 'Enter a valid email address'
```

## Authoring checklist

- Put the map in the **definition's friendly mirror file**
  (`<enrichDir>/friendly/<rel>.ts`), not the consumer's file.
- Type it `FriendlyType<T>` so structure is checked against `T`.
- Add `$label` to every field you want a human name for; omit it to fall back to the raw
  name (FT001 Info).
- Use `$errors` keys that match the field's **declared format constraints** only — a
  bare `string` only has `type`. Add `$default` for a catch-all.
- On count-bearing constraints, fill the scaffolded plural arms in place — never
  restructure the object; keep `other` (FT006), prune unused arms; remember the count is
  the violated bound, not the received value's length.
- In a `Translation<T>` file, translate only blank leaves, never copy the source text,
  and prune the arms your language doesn't use — they stay pruned.
- Reach for the **function form** only when joining/pluralizing/i18n — otherwise prefer
  the data form so it stays compiler-validated.
- For arrays use `$items` (fixed tuples `$slots`; Map/Set `$keys` / `$values`); for
  nested objects recurse with the same node shape.
