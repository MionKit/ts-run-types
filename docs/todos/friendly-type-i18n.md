# Internationalization for `FriendlyType<T>` — the source is a locale, translations are same-tree mirrors

> **Status: PROPOSAL — exploratory design, not yet scheduled.** Adds per-locale
> translation of a type's `FriendlyType<T>` (human labels + validation-error
> messages), built on the existing committed-mirror + value-preserving reconcile
> machinery. Scope: `FriendlyType<T>` only (labels + `$errors` templates) — **not**
> `MockData<T>` (sample data is never translated). This note supersedes the parked
> one-liner in [AI_ENRICHMENT.md → Decided defaults](../AI_ENRICHMENT.md) ("*v1 is
> single-locale; a `Record<Locale, FriendlyType<T>>` wrapper can be added later*").
>
> Product of a design study (4 deep repo readers + 5 i18n-ecosystem researchers —
> vue-i18n, i18next, ICU/MF2, the platform `Intl` API, and the type-safe/compile-time
> family: Paraglide, typesafe-i18n, Lingui, Fluent — then a 3-architect / 3-judge panel),
> refined through a design dialogue. Key claims are **verified against the code**, tagged
> `(VERIFIED …)`.

---

## Goal

Let a project ship its validation UI (field labels + error messages) in multiple
languages, where:

- **The `FriendlyType<T>` a project already authors IS the source *locale*** (a
  first-class, complete language — the same way every mature i18n system treats its base
  locale: gettext's `msgid`/`msgid_plural`, Fluent's reference locale, i18next/vue-i18n's
  default locale). It renders directly for source-language users and is the **terminal
  fallback**. There is **no** separate default/English catalog to maintain.
- **A translation is just another `FriendlyType<T>`**, one committed file per configured
  locale, the **same tree** as the source (same field paths, same `$errors` constraint
  keys). Its key is the mirror path (`typeID` + type name + field path), never a
  hand-typed string. **Translation is optional** — an untranslated locale falls through to
  the source language, leaf by leaf.
- **The same value-preserving reconcile rules apply** — never edit an authored
  translation, orphan removed nodes (`@rtOrphan`/`@rtOrphanChild`), scaffold new nodes as
  `@todo` blanks, `--prune` is the only destructive op — but now reconciling the **source
  `FriendlyType` against each translation file** rather than a type against its mirror.
- **Plurals and interpolation work**, on top of the JS `Intl` API (which gives
  `PluralRules` / `NumberFormat` / `DateTimeFormat` / `RelativeTimeFormat` / `ListFormat`
  for free but has **no message lookup** — the gap we fill with a tiny resolver).

### The plural model in one paragraph (the crux of the design dialogue)

Plural structure is **owned by the generator, not the author** — this preserves RunTypes'
fill-the-gaps philosophy (the compiler scaffolds the shape; the LLM/human only fills
*string* leaves; validation only type-checks strings). A plural is **not** an opt-in that
the LLM builds by hand; the generator emits a plural **object** exactly where a message can
carry a count — the **count-bearing constraints** `minLength` / `maxLength` / `min` /
`max` / `lt` / `gt` — and a plain **string** everywhere else (`type`, `pattern`,
`allowedChars`, `integer`, `date`/`time`, `version`, `$default`, …). Because the leaf
*kind* is fixed by the constraint, it is **identical across the source and every
translation**, so the reconcile never meets a string-vs-object mismatch at the same leaf.
The **arms** inside a plural object are the file's-locale CLDR categories (English
`one`/`other`; Polish `one`/`few`/`many`/`other`), taken from a built-in per-language
table; the runtime selects one via `Intl.PluralRules(locale).select(bound)` with the
mandatory `other` arm as backstop.

## TL;DR

| Axis | Decision |
| --- | --- |
| **Source** | The source `FriendlyType` is a first-class locale (`sourceLocale`, default `'en'`, configurable). No separate default catalog. |
| **File layout** | One committed file per (source file, locale) under a **path-segment** subtree: `runtypes/generated/i18n/<locale>/<rel>.ts`, const `<Locale>_friendly<Name>: Translation<Name>`. |
| **Plurals** | **Generator-owned, constraint-classified.** Objects on count-bearing constraints (`minLength`/`maxLength`/`min`/`max`/`lt`/`gt`), strings elsewhere. Arms = the file-locale's CLDR categories from a built-in table (top ~10 locales; unknown → all six). Runtime selects via `Intl.PluralRules`; `other` mandatory + backstop. |
| **Leaf type** | `TemplateLeaf = string \| PluralTemplate` (permissive in TS; the Go checker enforces the per-constraint kind, an FT003 extension). Language-agnostic. |
| **Runtime** | `createFriendlyI18n(source, { locale, translations, formats? })` — thin locale selector over the one pure `createFriendly` walk; per-leaf fallback to source. `resolveLocale()` exported standalone. |
| **Interpolation** | Keep the **closed `$[…]` DSL**. Add `$[val:number:currency]`-style tokens naming `Intl` formats declared once in config. **No ICU/MF2.** |
| **Count source** | Always the **violated bound** (`$[val]`, cardinal). Because objects appear only on count-bearing constraints, there is no cardinal-vs-ordinal ambiguity. |
| **Reconcile** | Reuse the generic merge/rename/orphan/splice core; swap the type-bound outer shell (desired side = source-const bytes; orphan oracle = source mirror). **One genuinely-new capability:** descend into `$errors` (today opaque) and into plural objects (locale-owned arms). |
| **Fallback** | Source `FriendlyType` is the terminal fallback; runtime **always lenient**; strictness lives in `check --translate`. |

---

## Background — what exists today (and why so much of it transfers)

`FriendlyType<T>` ([friendlyType.ts](../../packages/ts-runtypes/src/enrich/friendlyType.ts))
is a recursive mapped type mirroring `DataOnly<T>`. Each node is
`{ $label: string, $errors: ErrorTemplates, __rt_typeName?: string }` plus homomorphic
child fields; arrays use `$items`, tuples `$slots`, `Map` `$keys`/`$values`, `Set`
`$values`. `$errors` is **either** a record `{ <constraintKey>: templateString }` (the
constraint keys are the verified `(format.name, formatPath-tail)` discriminator: `type`,
`minLength`, `min`, `max`, `pattern`, `version`, …, `$default`) **or** an inline
`(failed) => string` arrow (the opaque escape hatch, documented for "joining,
pluralization, i18n").

`createFriendly<T>(map)`
([createFriendly.ts:161](../../packages/ts-runtypes/src/enrich/createFriendly.ts)) is the
**sole** runtime consumer of a map — **pure data over `(map, RTValidationError[])`, no
type-id, no `rtUtils`, no runtime hashing.** It walks `error.path` into the node, picks a
template by constraint key, and interpolates the `$[label]` / `$[val]` / `$[path]` /
`$[index]` tokens via `/\$\[(\w+)\]/g`. That purity is why a translated same-tree map is a
drop-in for `map`.

Enrichment is committed to a **mirror directory** (default `runtypes/generated`, set via
the `ts-runtypes` entry under `compilerOptions.plugins`), one file per source file,
consumed by **real committed imports** (never plugin-injected). The
`gen`/`gen --update`/`gen --prune`/`check` CLI reconciles value-preservingly: match by
`@rtType` structural id, carry renames via `@rtIds`, orphan removed nodes, scaffold new
nodes with a one-time `@todo` blank. Full design:
[AI_ENRICHMENT.md](../AI_ENRICHMENT.md).

**Why the reconcile mostly transfers (VERIFIED `internal/enrich/mirror/*`):** the merge
core — `mergeObject` (merge.go:196), `computeRenames`/`fieldIdentity` (merge.go:648),
the orphan/insert/replace ops, `parseDesiredObject` (merge.go:118, which just reparses a
body string), and the descending fatal-on-overlap splicer — is **generic over two
same-tree object literals**; it never touches the source type. `friendlyReservedKeys`
already encodes the FriendlyType node shape exactly. What's welded to the *type* is only
the **outer driver** (`Reconcile`, reconcile.go:42): it derives the desired set from the
type graph (`EmitClosure`), decides orphaning by consulting the `.ts` source
(`orphanConsts` → `SourceDeclaresType`, orphan.go:35), and recognises `friendly*/mock*`
var names (index.go:504). Those four are what an i18n driver swaps out.

## Design principles (from the ecosystem study)

1. **Do NOT adopt ICU MessageFormat or MF2 as our template syntax.** MF2 /
   `Intl.MessageFormat` is stuck at **TC39 Stage 2**, ships in no browser or Node, and has
   negligible adoption (`i18next-mf2` ≈ 6 downloads/week vs `i18next-icu` ≈ 300k). A full
   ICU/MF2 parser is ~40% of FormatJS's bundle and violates our minimal-runtime-dep posture
   (the plugin's only runtime dep is `ts-runtypes-bin`). Our `$[…]` token set is **closed
   and validator-supplied**, so open `{arg}` / `{$var}` interpolation buys nothing.
2. **Model plurals as structured data owned by the generator, not a string sub-grammar and
   not hand-built by the LLM.** A category-keyed object stays compile-checkable and
   reconcile-diffable; the compiler emits the shape, the author fills strings.
3. **`Intl` is the engine; we own only lookup + the template layer.** Delegate all
   category selection and number/date/relative-time formatting to `Intl`, keyed on the
   active locale, with formatters cached (the i18next `addCached` model).
4. **The mirror path is the key.** No FormatJS content-hash id, no i18next flat dotted
   keys, no giant recursive key-union types. Structural stability + per-node compile-time
   validation come for free because the mirror IS the type structure.
5. **The base locale is a real locale; the source is the fallback.** Paraglide/Fluent/gettext
   confirm the model — committed typed consts imported by name, tree-shakeable, with the
   source as the terminal link in the fallback chain.

---

## The design

### 1. The source is a locale — `sourceLocale`

The source `FriendlyType` is written in a real language and rendered directly for that
language's users. `sourceLocale` (default `'en'`, configurable) names it. This avoids
duplicating the primary language into a translation file, and — critically — lets a
**non-English-primary** project (say Polish) author correct primary-language plurals in the
source (a plain-string template could not). `sourceLocale` only *matters* for a leaf that
is a plural object: it tells the checker which CLDR arms are valid and the renderer which
`Intl.PluralRules` to use for source-language output.

### 2. File layout — a per-locale path-segment subtree

Translation files live under a **directory segment per locale**, mirroring the source
mirror's relative sub-path:

```
runtypes/generated/models/user.ts            # source language (unchanged) — friendlyUser
runtypes/generated/i18n/es/models/user.ts    # es_friendlyUser
runtypes/generated/i18n/pl/models/user.ts    # pl_friendlyUser
```

Each translation const is named `<Locale>_friendly<Name>` (leading locale segment, e.g.
`pl_friendlyUser`), typed `Translation<Name>` (an alias, §3), and carries the **same**
`@rtType <Name>#<id>` marker as the source (the id is name-independent, so a source rename
carries across locales) plus a new `@rtI18n <locale> from '<rel-to-source-mirror>'`
breadcrumb pointing at the **source mirror file** (the reconcile's desired anchor and
orphan oracle) — never at the `.ts` type.

**Why a path segment, not a `user.es.ts` filename infix (VERIFIED):** `config.go:159`
`forceTSExt` collapses every mirror to a single `.ts` and its comment says it "cannot
express `user.es.ts`". A path segment means `forceTSExt` **never sees the locale** —
`i18nMirrorPath(declFile, locale) = join(i18n.dir, locale, relOf(declFile))` then the
unchanged `forceTSExt` — resolving the limitation with no signature change, avoiding a
re-parse ambiguity for region tags (`pt-BR`), and giving a translator **one subtree to
own** (the vue-i18n / Paraglide model). **Why a leading const prefix, not a suffix
(VERIFIED):** `isFriendlyVar` uses `hasCamelSuffix(name, 'friendly')`, so `friendlyUser_es`
*still* matches as a friendly const; a leading segment plus the directory boundary makes an
`isTranslationVar(name, locale)` predicate robust.

### 3. Type changes — a language-agnostic plural leaf

In [friendlyType.ts](../../packages/ts-runtypes/src/enrich/friendlyType.ts), widen the
`$errors` template leaf to allow a plural object. **Applied to the shared leaf so source
and translations stay same-tree.**

```ts
// Locally declared in the `#region friendlytype-extract` block so the verbatim slice stays
// self-contained (lib + own decls only) and cheap — the extract is measured by an
// instantiation-budget compile test (compileHarness.ts: lib.es2023.d.ts alone). Do NOT
// reference `Intl.LDMLPluralRule` here; use this local union (runtime code in
// createFriendly.ts, which is NOT sliced, may use Intl.LDMLPluralRule directly).
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** A plural template: one arm per CLDR category the file's locale uses. `other` is
 *  mandatory (CLDR guarantees it; it is also the in-leaf backstop); the rest are optional
 *  so each locale supplies exactly the categories it needs. LANGUAGE-AGNOSTIC — the SAME
 *  type for every locale; the *arms present* differ per file, not the type. */
export type PluralTemplate = { other: FriendlyTemplate } & Partial<Record<PluralCategory, FriendlyTemplate>>;

/** An error-template leaf is a plain template OR a plural object. Which one appears at a
 *  given constraint is DETERMINED BY THE CONSTRAINT (see §4), not by author choice — so the
 *  kind is locale-invariant and the reconcile is monomorphic per leaf. */
export type TemplateLeaf = FriendlyTemplate | PluralTemplate;

// ErrorTemplates' record arm value becomes `TemplateLeaf | undefined` (was
// `FriendlyTemplate | undefined`). The inline-arrow arm is UNCHANGED.
```

- `FriendlyTemplate` stays `string`; `$label` stays a plain `string` (labels are never
  count-driven — a deliberate minimal call).
- Add `export type Translation<T> = FriendlyType<T>;` — zero merge/runtime impact
  (structurally identical), pure readability + unambiguous detection.
- **TypeScript stays permissive** (`string | PluralTemplate`); the **Go checker** enforces
  the per-constraint kind (count-bearing → object with the file-locale's arms; else string)
  and that each arm is a valid template — a natural extension of today's FT003 ("key must be
  a declared constraint of `T`'s format"), which already relies on Go enforcing what the
  permissive TS index signature can't.
- **v1 drops exact-count keys** (`'=0'`, `'=1'`): a template-literal index signature adds
  cost to the budget-measured extract slice and complicates the Go arm-set predicate. Deferred.

### 4. Plurals — generator-owned, constraint-classified, `Intl`-selected

**The generator classifies each constraint and emits the appropriate leaf kind:**

| Constraint | Kind emitted | Rationale |
| --- | --- | --- |
| `minLength`, `maxLength`, `min`, `max`, `lt`, `gt` | **plural object** (file-locale arms) | carries a numeric bound → the message can pluralize on it |
| `type`, `pattern`, `allowedChars`, `integer`, `date`, `time`, `splitChar`, `version`, `$default` | **plain string** | no numeric count → an object would have **dead arms** (only `other` ever renders) |

The classification is a fixed table in the generator (constraint key → count-bearing bool).
Because the kind is constraint-determined, it is **the same in the source and in every
translation** — the reconcile at `minLength` is always object↔object, at `pattern` always
string↔string, never a mismatch (this is what resolves the string-vs-object concern).

**The arms** of a plural object are the file-locale's CLDR categories, from a **built-in
per-language table**:

- **Top ~10 locales shipped** (`en, es, zh, hi, ar, pt, ru, ja, de, fr`) → exact category
  set (`en` → `one`/`other`; `pl`/`ru` → `one`/`few`/`many`/`other`; `ar` → all six; `zh`/`ja`
  → `other` only).
- **Unknown locale → emit all six** (`zero`/`one`/`two`/`few`/`many`/`other`). Only `other`
  is a hard requirement; the extras are optional prompts the translator fills where the
  language uses them and prunes otherwise (an unused filled arm is harmless — it is never
  selected).
- The table is **required at generation** (it sets the emitted shape) but the **runtime
  needs no table** (`Intl.PluralRules` selects). Any table imperfection is non-fatal at
  runtime thanks to the `other` backstop. The table can later be widened / generated from
  the resolver's bundled ICU (residual decision below).

**Runtime selection** (inside `createFriendly`'s template-picking step, gated on the locale
context):

1. Resolve the leaf for the constraint key. A `string` interpolates as today.
2. A `PluralTemplate` object appears **only on a count-bearing constraint**, so the count is
   **always the bound** — `count = primitiveVal(err.format?.val)` (cardinal). There is **no
   cardinal-vs-ordinal ambiguity** to resolve (a happy consequence of constraint-classification).
3. **Guard:** if the bound isn't a finite number, select `other` directly —
   `Intl.PluralRules.select(NaN)` throws `RangeError` (VERIFIED `primitiveVal` returns
   `undefined` for non-numeric bounds).
4. `category = new Intl.PluralRules(locale, { type: 'cardinal' }).select(Number(count))`
   (cached per locale); pick `template[category]`, falling to `template.other` if that arm is
   absent for this locale; then run the same `$[…]` interpolation on the chosen arm.

**Asymmetric arms fall out for free** (selection reads only the one chosen category with an
`other` backstop). At **reconcile** time the arm set is **locale-owned** (see §Reconcile).
**Plural-leaf atomicity:** a translated plural falls through to source as a **whole unit**
(its own `other` backstops missing arms) — it never mixes a target `few` with a source
`other` mid-message.

> **⚠️ Author-facing doc note that MUST be loud:** the plural count is the **violated
> bound** (`minLength: 3` → `3`), **not** the received value's length — `RTValidationError`
> carries no received value (`$[value]` is parked). Authors pluralize on the **threshold**.

#### Worked example — nothing is LLM-restructured; only strings are `@todo`

`type User { name: FormatString<{minLength:2}>; email: FormatString<{pattern: email}> }`

Generated **English source** (`sourceLocale: 'en'`):

```ts
name: {
  $label: '',              // @todo  (label is always a plain string)
  $errors: {
    type: '',              // @todo  string — no count
    minLength: {           // object — count-bearing, en categories
      one:   '',           // @todo
      other: '',           // @todo
    },
  },
},
email: {
  $label: '',              // @todo
  $errors: {
    type: '',              // @todo  string
    pattern: '',           // @todo  string — no count, stays a string (no dead arms)
  },
},
```

Author fills the strings (opting `minLength` into real English plurals is just filling the
two arms — the shape was already there):

```ts
name: { $label: 'Full name', $errors: {
  type: '$[label] must be text',
  minLength: {
    one:   '$[label] must be at least $[val] character',
    other: '$[label] must be at least $[val] characters',
  },
} },
```

Scaffolded **Polish translation** of the same type — `minLength` gets Polish's four arms;
`pattern` stays a string; every leaf a `@todo` blank that falls back to the source until
filled:

```ts
// runtypes/generated/i18n/pl/models/user.ts
/** @rtType User#9f3a @rtIds {name: a1b2, email: e5f6} @rtI18n pl from '../../../models/user' */
export const pl_friendlyUser: Translation<User> = {
  $label: '',
  name: { $label: '', $errors: {
    type: '',
    minLength: { one: '', few: '', many: '', other: '' },   // all @todo
  } },
  email: { $label: '', $errors: { type: '', pattern: '' } },
};
```

At render (input `{ name: 'a' }`, `minLength` bound `2`): `pl` →
`Intl.PluralRules('pl').select(2)` = `'few'` → the Polish `few` arm (or fall back to the
source `one`/`other` string if `few` is still `@todo`).

### 5. Runtime API — a thin wrapper over the one pure walk

Two additions in [createFriendly.ts](../../packages/ts-runtypes/src/enrich/createFriendly.ts).
The plural/format branch lives **inside** the existing walk, gated on a locale context that
is **absent by default** (single-locale callers are byte-behaviour-unchanged), and the
wrapper pre-selects which map the walk reads:

```ts
export function resolveLocale<T>(
  locale: string,
  translations: Partial<Record<string, FriendlyType<T>>>,
): string | undefined;   // best-match tag or undefined; BCP-47 truncation that REFUSES cross-script substitution

export interface FriendlyI18nOptions<T> {
  locale: string | { readonly value: string };            // string OR any { value } ref (e.g. a Vue Ref) — structural read, no Vue dep
  translations: Partial<Record<string, FriendlyType<T>>>; // locale tag -> committed translation const
  formats?: Record<string, NamedFormats>;                 // per-locale named Intl formats (§6)
  strict?: boolean;                                        // reserved; runtime stays lenient — strictness lives in `check`
}

export function createFriendlyI18n<T>(
  source: FriendlyType<T>,                                 // the terminal fallback = source language
  options: FriendlyI18nOptions<T>,
): FriendlyRenderer;                                       // SAME return type as createFriendly
```

Consumers import the source const and each locale const **by name** (committed imports — no
plugin injection) and pass them in; the active locale is app-owned (a Vue `useI18n().locale`,
a route param, `navigator.language`). **Reactive seam:** `createFriendlyI18n` reads
`typeof locale === 'object' ? locale.value : locale` on **every** render, so a Vue `ref`
re-renders on switch with zero API churn (documented honestly: the renderer is not itself
reactivity-tracked — call it inside a `computed()` / re-invoke `errors()` per render; a truly
reactive renderer would need an optional `@vue/reactivity` peer, deferred).

**Crash guard (mandatory, touches the walk — VERIFIED createFriendly.ts:190 has no
`typeof` guard, so a plural object hits `interpolate`'s `.replace()` → `TypeError`):**
before interpolate, branch on `typeof template === 'string'`; a `PluralTemplate` routes
through `selectPlural` (§4), which returns a string arm and never calls `select` with a
non-finite count.

### 6. Interpolation + `Intl` formatting — named formats, closed DSL

Keep the closed `$[…]` set; add a three-part token `$[<binding>:<kind>:<name>]` naming an
`Intl` format declared once in config:

- `binding ∈ { val, index }`; `kind ∈ { number, date, relativeTime, list }`; `name` a key
  under `formats[locale][kind]`. E.g. `'must be at most $[val:number:currency]'`.
- Bare `$[val]` stays raw `String(val)`. Unknown format name **or** unknown token → left
  **verbatim** (matching today's unknown-token rule). The regex widens to
  `/\$\[(\w+)(?::(\w+):(\w+))?\]/g` — the required bracket-close leaves a literal colon in
  prose (`ratio 3:1` outside any `$[…]`) untouched.

```ts
export interface NamedFormats {
  number?: Record<string, Intl.NumberFormatOptions>;
  date?: Record<string, Intl.DateTimeFormatOptions>;
  relativeTime?: Record<string, Intl.RelativeTimeFormatOptions>;
  list?: Record<string, Intl.ListFormatOptions>;
}
// runtypes/i18n.formats.ts default-exports Record<localeTag, NamedFormats>; tsconfig i18n.formats names it.
```

**Caching (i18next `addCached` model):** a module-level
`intlCache = new Map<string, (v: unknown) => string>()` keyed `${locale}\0${kind}\0${name}`
builds each `Intl.*Format` lazily and returns a `value => string` closure; `PluralRules`
share it keyed `${locale}\0plural\0cardinal`. The cache is a module-scope singleton
**beside** the pure walk (the walk itself caches nothing).

---

## The reconcile — mostly reuse, plus one load-bearing new capability

### Reused verbatim

`mergeObject`, `computeRenames`/`fieldIdentity`, the rename/keep/recurse/insert/drop passes,
`replaceChildOp`, `mergeMetaNodes`/`mergeSlots`, `sanitize`/`unsanitize`, the descending
fatal-on-overlap splicer, `parseDesiredObject`, `computeConstRenames`, and the whole
`@rtType`/`@rtIds`/`@rtOrphan`/`@rtOrphanChild`/`@todo` marker layer.

### The new i18n driver (swaps the four type-bound arms)

Discriminated by a translate mode carrying `{ Locale, SourceMirrorBytes }`:

1. **Desired side = source-const bytes.** Instead of `EmitClosure` walking the type,
   `ParseMirror` the source mirror; feed each source `friendly<Name>` object-literal body to
   `parseDesiredObject`. Before the merge sees it, rewrite each `$label`/string-leaf to its
   `@todo` blank, and each **plural object** to a blank object seeded with the **target
   locale's** arms (from the table, or all six if unknown) — so a new node arrives blank and
   an existing translated leaf wins the merge. Function-form `$errors` leaves are **copied
   verbatim** (not blanked) so the const type-checks.
2. **Orphan oracle swap.** Replace `orphanConsts` → `SourceDeclaresType(.ts breadcrumb)` with
   `SourceMirrorDeclaresConst(sourceMirrorText, "friendly<Name>")` — resolve the `@rtI18n`
   breadcrumb to the source **mirror** and ask "does the source `FriendlyType` file still
   declare this const/field." Message: "*FriendlyType file no longer declares this
   const/field.*"
3. **Var predicate.** Add `isTranslationVar(name, locale)` for the leading-prefix form; the
   **mock family is excluded** (`WantMock:false`). Rename-carry works via the shared
   name-independent `@rtType` id.

### ⚠️ The load-bearing gap all drafts missed (VERIFIED `merge.go`)

**Today the merge never descends into `$errors`.** `$errors` is `$`-prefixed, so
`fieldKeys` skips it (merge.go:110); and `objectMetaKeys = {"$items","$keys","$values"}`
does **not** include it (merge.go:290), so `mergeMetaNodes` never recurses it. The whole
`$errors` record is an **atomic leaf** — kept byte-identical or added/dropped only as a whole
property. Consequence the naive "reuse + one predicate" framing gets wrong: **a source that
adds a constraint key on an existing node is silently not scaffolded** into translations — it
renders untranslated with no `@todo` signal, and plural-arm reconcile has no attachment
point.

So i18n mode must add **new, budgeted merge code**: descend **one level into `$errors`**
(diff constraint keys — `insertFieldsOp` a `@todo` blank of the constraint-appropriate kind
for each source-added key, `orphanChildOp` each key the source dropped, leave same-key string
leaves byte-identical), then **one more level into a plural object** with the
**asymmetric-plural rule**:

- Mark the plural-arm keys (the `PluralCategory` union under a count-bearing constraint)
  **locale-owned**: suppress **both** `orphanChildOp` **and** the rename pass for them. (The
  rename half matters — `computeRenames`/`fieldIdentity` would otherwise spuriously pair a
  dropped `one` with an added `few` and silently relabel a translated arm.)
- Never down-scope to the source's arm set; require only `other`; scaffold a new blank plural
  leaf from the **target** locale's category set.
- Prove per-arm inserts + an orphan-child inside **one** plural object stay non-overlapping
  under the fatal-on-overlap splicer.

Note the leaf **kind** (string vs object) is guaranteed consistent between source and target
by the generator's constraint-classification, so the merge never has to reconcile a
string-against-object; a hand-edit that diverges the kind is ordinary shape drift, flagged by
`check`. **`@todo`/orphan semantics:** a blank scaffold counts as **absent** at render and
falls through to the source leaf (partial translations render). Carcasses are value-preserving
and restorable; `--prune` is the only delete. **Never auto-copy the source string as if
translated** — an empty `@todo` is the honest signal.

---

## CLI + config surface

New verbs beside the existing `describe`/`gen`/`check` in
[enrich_cli.go](../../cmd/ts-runtypes/enrich_cli.go):

```
ts-runtypes gen   --translate <locale>            <src>   # scaffold a locale file (same tree; string leaves + plural arms are @todo blanks; NEVER copies source text)
ts-runtypes gen   --translate <locale> --update   <src>   # reconcile via the new i18n driver (source bytes = desired; asymmetric plurals)
ts-runtypes gen   --translate <locale> --prune    <src>   # the only destructive op — strip @rtOrphan/@rtOrphanChild carcasses
ts-runtypes gen   --translate all      --update           # fan out over every tsconfig i18n.locales entry
ts-runtypes check --translate <locale>                    # non-writing completeness gate: report @todo blanks / orphans / missing nodes (drives strict CI)
```

tsconfig plugin option (new `i18n` object; precedence CLI > tsconfig > default; default =
dormant, zero behaviour change):

```jsonc
{ "name": "ts-runtypes", "enrichDir": "runtypes/generated",
  "i18n": {
    "sourceLocale": "en",                  // the language the source FriendlyType is authored in (default 'en')
    "dir": "generated/i18n",               // resolved under the enrich root; locale is a PATH SEGMENT
    "locales": ["es", "pl", "ar"],         // target set — the source is NOT listed (it IS the source language)
    "formats": "runtypes/i18n.formats.ts", // optional module default-exporting Record<locale, NamedFormats>
    "strict": false                        // check --translate gate; runtime is always lenient
  } }
```

`config.go` gains `i18nMirrorPath` (path-segment join, then unchanged `forceTSExt`),
`SourceLocale` / `I18nDir` / `I18nLocales` / `I18nFormats` fields, and the reconcile's
`MirrorPathFor` closure is parameterized so cross-file value imports between translation
files resolve to sibling `i18n/<locale>/` paths. The **plural-category table** lives in a new
`internal/enrich/cldr` package (built-in top-~10 map + an all-six fallback).

## Fallback semantics — always lenient at runtime

`createFriendlyI18n` calls `resolveLocale` to pick `translations[matched]` (or `source` when
none matches), then renders through the **one** `createFriendly` walk. Per error the walk
reads the chosen translation node's `$errors[constraintKey]`; if that leaf is **absent**
(untranslated / `@todo`-blank / orphaned / whole node missing) it falls through to the
**source** node's leaf. Same for `$label`. A plural leaf falls through as a **whole unit**.
No default catalog — the source `FriendlyType` **is** the source language and terminal
fallback. `strict` is a **build/CI** concept (`check --translate`), never a runtime throw.

## Scope — what's in, what's out (v1)

**In:** `$label` + record-form `$errors` translation; generator-owned plurals on
count-bearing constraints via `Intl.PluralRules`; `Intl` number/date/relative-time/list
formatting via named formats; per-locale committed mirrors reconciled against the source; a
configurable `sourceLocale`.

**Out (v1):**

- **`MockData<T>` is never translated** (`WantMock:false`).
- **Function-form `$errors` ignores the i18n layer entirely** — the arrow is opaque, carried
  verbatim, executed as-is; the author owns their own `t()` inside it (the active locale does
  **not** reach the inlined arrow). When source is record-form but a translation was hand-edited
  to arrow form, the merge (never looking inside `$errors`) keeps the mismatch invisible and the
  **translation's form wins** — document this precedence.
- **Ordinal plurals** (pluralizing on `$[index]`) — since objects appear only on count-bearing
  constraints (cardinal), ordinal is deferred to a later explicit opt-in.
- **Union per-member (`$members`)** stays node-level only. **`$[value]`** stays parked.
  **Exact-count plural keys (`=0`, `=1`)** deferred. **Linked labels (`@:path`)** deferred to v2.

---

## Design decisions to settle

1. **How does the Go generator obtain each locale's CLDR plural-category set?** *Decided
   direction:* ship a **built-in static table for ~10 common locales** (`en, es, zh, hi, ar,
   pt, ru, ja, de, fr`); **unknown locale → emit all six** categories (only `other` required,
   the rest optional prompts). Open sub-question: whether to later **generate** the table from
   the resolver's bundled ICU to cover every locale precisely. Runtime correctness never
   depends on the table (the `other` backstop), so the static table is a safe v1.
2. **Where do named `Intl` format definitions live?** *Recommend* a shared module keyed by
   locale, referenced by `tsconfig i18n.formats`, so the CLI can validate format-name
   references at `gen`/`check` and the runtime imports the same table. Co-location duplicates
   defs; runtime-only loses build validation.
3. **How strict is BCP-47 fallback in `resolveLocale`?** *Recommend* truncation that **refuses
   cross-script** substitution (`zh-Hant` must not fall to `zh-Hans`), else source. Naive
   truncation can silently serve the wrong script.

## Risk register (verified hazards to honour in implementation)

- **[BLOCKING]** The merge never descends into `$errors` (VERIFIED merge.go:110, :290) — so
  source-added constraint keys aren't scaffolded and plural-arm reconcile has no attachment
  point. `$errors`-aware descent is genuinely new merge code (see §Reconcile), not a predicate
  bolt-on.
- **[CRASH]** `createFriendly.ts:190` does `template ? interpolate(template, …)` with **no**
  `typeof` guard; a plural object is truthy with no `.replace` → `TypeError`. A `typeof`/plural
  branch **must** be added to the walk (gated off by default).
- **[CRASH]** `Intl.PluralRules.select(NaN)` throws `RangeError`; a plural on a bound that isn't
  a finite number must select `other` instead of calling `select`.
- **Plural table required at generation** — the generator can't emit arms without each locale's
  category set. Mitigated by the built-in top-~10 table + all-six fallback + the runtime `other`
  backstop (a wrong/missing arm degrades, never breaks). Pin/generate the table and enforce
  `other`-mandatory at build.
- **Constraint-classification must agree** between the generator (which emits object vs string)
  and the checker (which validates the kind). Keep the count-bearing list in one place
  (`internal/operations` / the constraint catalog) so both read it.
- **Rename-suppression inside a plural object** must cover **both** orphan and rename (VERIFIED
  `computeRenames` could pair a dropped `one` with an added `few`).
- **Splicer non-overlap** for per-arm ops inside one plural object (fatal-on-overlap).
- **Regex-widening injection surface** — a literal colon in prose (`ratio 3:1`) outside any
  `$[…]` must be left verbatim.
- **Rename-carry across locales is convergent, not atomic** — a source rename run for `es` but
  not `pl` leaves `pl`'s const stale until its own run; the shared name-independent `@rtType` id
  is the only thing preventing an orphan+regenerate that would destroy `pl`'s work. Consider
  fanning a source rename to all locale files eagerly.
- **enrichHarness slice** — keep the widened leaf self-contained (local `PluralCategory` union,
  no `Intl.LDMLPluralRule` in the sliced region) and re-measure the instantiation budget in
  Phase 0.

## Implementation phasing

- **Phase 0 — type + crash guard (ships independently).** Widen the leaf (`PluralTemplate` /
  `TemplateLeaf`, local `PluralCategory`), add `Translation<T>`, keep `$label: string`. Add the
  `typeof`-template guard in `createFriendly.ts:190`. Re-measure the enrichHarness compile-budget
  test; add compile-test cases for the widened leaf.
- **Phase 1 — pure runtime plural + named formats.** `selectPlural` (cardinal-on-bound, NaN
  guard, `other` backstop), the widened `$[…:kind:name]` regex with verbatim fallback, the
  module-level `intlCache`. Vitest: per-category selection (en `one/other`, pl
  `one/few/many/other`, ar all six, ja `other`-only), format tokens, unknown-token/format
  verbatim, the `ratio 3:1` non-mis-parse.
- **Phase 2 — locale-selecting wrapper.** `createFriendlyI18n` + `resolveLocale` (cross-script
  refusal), leaf-granular fallback-to-source, reactive `{ value }` seam. Vitest: partial-
  translation fallback, whole-plural atomic fallback, ref-driven switch, function-form node
  ignores i18n.
- **Phase 3 — constraint classification + CLDR table (Go).** The count-bearing constraint list
  (shared with the checker), the `internal/enrich/cldr` table (top-~10 + all-six fallback), and
  the scaffold that emits object-vs-string per constraint with the file-locale's arms. `go test`
  for the classification + arm emission per locale.
- **Phase 4 — Go reconcile driver (the load-bearing new merge code).** `$errors` descent + plural
  sub-object rules (locale-owned arms: suppress orphan AND rename, never down-scope); desired-side
  swap; orphan-oracle swap; `isTranslationVar`. `go test ./internal/...`: source adds a key →
  `@todo` blank; source drops a key → orphan; asymmetric plural never orphaned/renamed; splicer
  non-overlap; cross-locale rename-carry via shared id.
- **Phase 5 — CLI + config + path machinery.** `gen --translate` / `check --translate`,
  `i18nMirrorPath`, the tsconfig `i18n` object (incl. `sourceLocale`), build-time format-name
  validation. `cmd/ts-runtypes` tests for path math (incl. `pt-BR`) and verb dispatch.
- **Phase 6 — docs.** README / ARCHITECTURE + website content (plain language, no em-dashes, MDC
  untouched); `git mv` this spec into `docs/done` (or `docs/partially`).

## Test plan (highlights)

- **Runtime:** the Vitest matrix above, plus a fuzz angle — reconcile a source `FriendlyType`
  against a randomly-mutated translation and assert the value-preserving invariants
  (never-edit-filled-leaf, orphan-not-delete, `@todo`-only-on-new, asymmetric arms untouched,
  string↔object kind never mismatched), mirroring the existing enrich reconcile fuzzers under
  [test/fuzz/enrich](../../packages/ts-runtypes/test/fuzz/enrich).
- **Go:** the reconcile + classification + table cases above, and an idempotency check (a second
  `--translate --update` is a byte-identical no-op).

## Docs to update on landing

[README.md](../../README.md) (feature + CLI flags), [AI_ENRICHMENT.md](../AI_ENRICHMENT.md)
(replace the parked i18n note with a link here), [ARCHITECTURE.md](../ARCHITECTURE.md)
(reconcile + `$errors` descent + constraint classification), [ROADMAP.md](../ROADMAP.md), the
website docs under [container/website/content](../../container/website/content) (plain-language
style), and the [runtypes-friendly-type](../../.claude/skills/runtypes-friendly-type) /
[rt-enrich-types](../../.claude/skills/rt-enrich-types) skills.

## Acceptance

- A configured locale scaffolds a same-tree file whose string leaves and plural arms are `@todo`
  blanks (plural arms drawn from the locale's category set, or all six if unknown); filling and
  reconciling never loses authored work; a source change scaffolds new `@todo` blanks (including
  **inside `$errors`**) and orphans removed nodes; `--prune` is the only delete.
- The generator emits a plural **object** exactly on count-bearing constraints and a **string**
  elsewhere; the LLM only ever fills string leaves; the checker enforces the per-constraint kind.
- `createFriendlyI18n` renders labels + error messages in the active locale, falls through to the
  source language per-leaf for anything untranslated, selects plurals via `Intl.PluralRules`
  (asymmetric-safe), formats via named `Intl` formats, and **never throws** on a partial
  translation.
- `check --translate` reports completeness for CI; the single-locale path is byte-behaviour and
  bundle-size unchanged when `i18n` is unconfigured.

---

## Appendix — why not ICU / MessageFormat 2.0, and what each ecosystem taught us

| Ecosystem | Borrowed | Rejected |
| --- | --- | --- |
| **vue-i18n** | named-format indirection; same-tree per-locale mirrors (locale-first, then path); source-as-fallback; lazy per-locale load. | JIT string-compile-at-runtime; its bespoke count→index plural resolver (we use `Intl.PluralRules` categories); mandatory in-file `locale →` top key; Vue scope machinery. |
| **i18next** | `Intl.PluralRules`-driven categories; `addCached` formatter memoization. | flat dotted keys; exploding plurals into sibling keys; retrofitted key-union types; the all-or-nothing ICU plugin. |
| **ICU MF1 / FormatJS** | structure-as-key (we go one better: the mirror path is the key, no hash id); source-as-default; `Intl` as the engine; precompile mindset. | a runtime ICU/MF2 parser (~40% of bundle); open `{arg}` interpolation; sha512 message ids. |
| **MF2 / `Intl.MessageFormat`** | the **shape** of `.match` category variants (as a plain JS object, not a string). | adopting MF2 itself — **Stage 2, ships nowhere, negligible adoption**. |
| **Intl (ECMA-402)** | the whole formatting + plural-selection + subtag-fallback engine, for free. | nothing — but note it has **no** message lookup (the gap we fill). |
| **Paraglide / typesafe-i18n / Lingui / Fluent / gettext** | messages as committed typed consts imported by name; Base/Translation compile-checking (free via `FriendlyType<T>`); **Fluent's asymmetric plurals** (target locales own their category set); the base locale is a real locale (gettext `msgid`/`msgid_plural`); source-as-terminal-fallback. | hashed/string-content keys (drift); embedding an ICU/FTL sub-grammar in strings; forcing the target plural set to equal the source; hard missing-key compile errors with no runtime fallback. |

**Selected sources:** vue-i18n
[pluralization](https://vue-i18n.intlify.dev/guide/essentials/pluralization.html) /
[number](https://vue-i18n.intlify.dev/guide/essentials/number.html) /
[fallback](https://vue-i18n.intlify.dev/guide/essentials/fallback.html);
i18next [plurals](https://www.i18next.com/translation-function/plurals) /
[formatting](https://www.i18next.com/translation-function/formatting);
FormatJS [ICU syntax](https://formatjs.github.io/docs/core-concepts/icu-syntax/);
MF2 [home](https://messageformat.unicode.org/) and TC39
[proposal-intl-messageformat #49 "this proposal is stuck"](https://github.com/tc39/proposal-intl-messageformat/issues/49);
MDN [Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization)
and [Intl.PluralRules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules);
[Paraglide variants](https://paraglidejs.com/variants),
[typesafe-i18n](https://github.com/ivanhofer/typesafe-i18n),
Fluent [asymmetric localization](https://hacks.mozilla.org/2019/04/fluent-1-0-a-localization-system-for-natural-sounding-translations/).
