---
name: runtypes-friendly-type
description: Author and use a `FriendlyType<T>` for a RunTypes type — the committed, type-keyed map of human-readable field LABELS + ERROR-MESSAGE templates. Use when writing or editing friendly validation errors, friendly/human-readable field labels, form-builder labels, or a `*.rt.ts` enrichment sibling; when turning `createGetValidationErrors<T>()` output into readable messages via `createFriendly<T>(map).errors(...)`; or when an `$errors` / `$label` / `$[label]` / `$[val]` placeholder template needs writing. Covers the `{ $label, $errors, ...children }` node shape, the `$[…]` placeholder DSL, error-template keys (the failed-constraint name: `type`, `minLength`, `min`, `max`, `pattern`, …, `$default`), the data-form vs inline-function escape hatch, and where the map lives.
---

# Authoring & using `FriendlyType<T>`

`FriendlyType<T>` is one of two **AI-enrichment artifacts** in RunTypes (the other is
`MockData<T>` — see the `runtypes-mock-data` skill). Unlike validators / codecs (pure
functions of the type, recomputed every build, never committed), enrichment is
**authored once, committed, and validated against the type forever after**. The full
design is [docs/AI_ENRICHMENT.md](../../../docs/AI_ENRICHMENT.md).

A `FriendlyType<T>` is a combined, per-field map of:

- **labels** — `$label`, a human name for each field (`'Full name'` for `name`);
- **error-message templates** — `$errors`, one template per failed constraint.

It is **pure data**. The shipped runtime renderer is
[`createFriendly<T>(map)`](../../../packages/ts-runtypes/src/enrich/createFriendly.ts);
it turns `createGetValidationErrors<T>()` output into readable messages. No type-id
injection, no `rtUtils` — error rendering needs only `(map, errors)`.

## When to use it

- You have `createGetValidationErrors<T>()` errors (`RunTypeError[]`) and want
  human-readable messages instead of raw `{ path, expected, format }`.
- You need stable, human field **labels** (form building, error summaries).
- You're scaffolding a type's committed `*.rt.ts` enrichment sibling.

If you only need a boolean pass/fail, use `createValidate<T>()` directly — no friendly
map involved.

## What is shipped today vs designed

- **Shipped:** the `FriendlyType<T>` DSL type
  ([`friendlyType.ts`](../../../packages/ts-runtypes/src/enrich/friendlyType.ts))
  and the `createFriendly<T>(map)` renderer
  ([`createFriendly.ts`](../../../packages/ts-runtypes/src/enrich/createFriendly.ts)),
  both exported from `ts-runtypes`.
- **Designed (not yet wired):** build-time validation of the authored literal against
  the live type (the `FT0xx` diagnostics + the `ShapeCheckedArgs<T>` axis), the `gen`
  CLI that scaffolds the `*.rt.ts` sibling, and `rtUtils` registry accessors. Author
  the map per the conventions below so it's ready when those land.

## The node model — `{ $label, $errors, ...children }`

One recursive node, uniform at every depth. `$`-prefixed keys are **meta**; every other
key is a **child field**. Leaf nodes simply have no children — there is no `fields:`
wrapper.

- `$label?: string` — the field's human name.
- `$errors?` — per-constraint message templates (data form) OR an inline function.
- Arrays / tuples carry `$items` (the element node).
- Nested objects recurse with the *same* node shape.

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

Errors **accumulate** — a value violating `minLength` *and* `pattern` yields two
messages (a list), one per violated constraint.

## The placeholder DSL

Templates are plain strings with `$[…]` tokens the renderer substitutes:

| Token       | Resolves to                                                         |
| ----------- | ------------------------------------------------------------------- |
| `$[label]`  | the node's `$label`, falling back to the raw field name             |
| `$[val]`    | the failed constraint's bound (`error.format.val`; e.g. `2`)        |
| `$[path]`   | dotted path to the field (`profile.email`)                          |
| `$[index]`  | array element index, for `$items` failures                         |

Unknown `$[…]` tokens are left verbatim. `$[value]` (the actual received value) is out
of scope for v1 — `RunTypeError` carries no value.

## Data form vs the function escape hatch

`$errors` is EITHER a record of templates (the **data form**) OR an inline arrow (the
**escape hatch**):

- **Data form** — a `{ constraint: template }` record. Yields **one message per failed
  constraint**. Gets compile-time placeholder/constraint validation (when that lands).
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

## Where the map lives — the `.rt.ts` sibling

Enrichment is committed in a sibling of the file where the **type is defined**, not
where it's consumed: `src/models/user.ts` → `src/models/user.rt.ts`. One sibling per
source file, one `export` per enriched type defined there. This mirrors the cache's "one
canonical entry per structural id, app-wide" rule — **one enrichment home per type, at
its definition**, however many files consume it. It is the first committed RunTypes
artifact (every other output is gitignored cache) and is hand-editable.

```ts
// src/models/user.rt.ts — committed, hand-editable.  rt-id: 9f3a (User structural hash)
import type {FriendlyType} from 'ts-runtypes';
import type {User} from './user';

export const userFriendly: FriendlyType<User> = { /* … */ };
```

The `import type` line is best-effort — if a consumed type isn't exported, the file
fails to compile and you fix the export.

## Build-time validation (designed: FT0xx)

When the validation axis lands, the scanner cross-references the authored literal
against the live `RunType` during the normal build and emits diagnostics on the same
channel as today's `VL0xx` warnings — so they surface in Vite/HMR:

| Code  | Severity | Meaning                                                          |
| ----- | -------- | ---------------------------------------------------------------- |
| FT001 | Info     | a field of `T` has no label (renders the raw name)               |
| FT002 | Error    | key is not a field of `T` — stale (field renamed/removed)        |
| FT003 | Warning  | `$errors` key isn't a constraint this field's format declares    |
| FT004 | Error    | structural mismatch (object node where `T` is scalar, or vice-versa) |
| FT005 | Warning  | unknown `$[…]` placeholder for this constraint/context           |
| FT010 | Info     | `T`'s structural id changed since authored — review for drift    |

These catch drift: rename a field and `FT002` flags the now-stale entry.

## Rendering at runtime — `createFriendly<T>(map)`

```ts
import {createGetValidationErrors, createFriendly} from 'ts-runtypes';
import {userFriendly} from '../models/user.rt';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrors<User>();
const friendly = createFriendly<User>(userFriendly);

friendly.errors(getUserErrors(badInput));
// → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }, …]

friendly.label('profile.email');   // → 'Email'  (falls back to the raw field name)
```

`createFriendly` returns `{ errors(errs), label(path) }`:

- `errors(errs)` — groups `RunTypeError[]` by path, looks up the node, and for each
  failed constraint interpolates the matching template (or the function form once for the
  whole field). Returns `FriendlyMessage[]` (`{ path, label, message }`).
- `label(path)` — the friendly label for a dotted path or a raw path-segment array.

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
// src/models/user.rt.ts — the committed enrichment sibling
import type {FriendlyType} from 'ts-runtypes';
import type {User} from './user';

export const userFriendly: FriendlyType<User> = {
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
    $items: {$errors: {type: 'each tag must be text'}},   // element node
  },

  profile: {                                              // nested object — recurse
    $label: 'Profile',
    email: {$label: 'Email', $errors: {pattern: 'Enter a valid email address'}},
    score: {$label: 'Score', $errors: {min: 'min $[val]', max: 'max $[val]'}},
  },
};
```

```ts
// src/services/userForm.ts — the CONSUMER
import {createGetValidationErrors, createFriendly} from 'ts-runtypes';
import {userFriendly} from '../models/user.rt';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrors<User>();
const friendly = createFriendly<User>(userFriendly);

const messages = friendly.errors(getUserErrors({name: 'A', age: 200, profile: {email: 'nope', score: 5}}));
// name     → 'Full name needs at least 2 characters'
// age      → 'Age must be no more than 120'
// profile.email → 'Enter a valid email address'
```

## Authoring checklist

- Put the map in the **definition file's** `*.rt.ts` sibling, not the consumer's.
- Type it `FriendlyType<T>` so structure is checked against `T`.
- Add `$label` to every field you want a human name for; omit it to fall back to the raw
  name (FT001 Info).
- Use `$errors` keys that match the field's **declared format constraints** only — a
  bare `string` only has `type`. Add `$default` for a catch-all.
- Reach for the **function form** only when joining/pluralizing/i18n — otherwise prefer
  the data form so it stays compiler-validated.
- For arrays use `$items`; for nested objects recurse with the same node shape.
