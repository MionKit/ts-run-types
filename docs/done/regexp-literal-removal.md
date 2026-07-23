# Removing the RegExp-literal type from the schema / type system

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `ts-runtypes-devtools`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

> **Status: implemented.** The "RegExp-literal" feature (matching a value against a
> _specific_ regex source+flags) has been removed from the type-definition system.
> `RegExp` is now a single `KindRegexp` leaf and `typeof /abc/i` ≡ `typeof /xyz/` ≡
> `RegExp` (one id — id ≡ f(T)). The sections below stand as the rationale + change
> record. The **string-pattern format** (`string({pattern, flags, mockSamples})` /
> `registerFormatPattern`) is a SEPARATE feature and **stays** — and, by decision,
> `registerFormatPattern` still accepts a `{regexp: /…/}` literal at the call site
> (recovered from the AST; see [§ What is preserved](#what-is-preserved)).

## TL;DR

TypeScript has **no literal type for `RegExp`** — `/abc/i` is just `RegExp`, even
under `as const`. Yet the system currently treats `typeof /abc/i` as a distinct
"RegExp-literal" type, matched by source+flags. That breaks the project's core
invariant that **the structural id is a pure function of `T`**: three types that
are _identical_ to TypeScript get _three different_ ids. Removing the feature
makes `RegExp` uniformly "any RegExp instance" (one id), at the cost of the
(niche) ability to assert a value is a RegExp with a _specific_ pattern.

**Recommendation: remove it.**

## Background: TS has no literal RegExp type (verified)

```ts
const myReg = /mypattern/; //  typeof myReg === RegExp
const o = {r: /x/i, s: 'lit'} as const; //  {readonly r: RegExp; readonly s: 'lit'}
//                                           ^ regex stays RegExp; only the string narrows
```

Strings/numbers/booleans have literal types (`'lit'`, `42`, `true`); **RegExp does
not**. A regex literal always widens to `RegExp`.

## The problem: id is not a pure function of `T` (verified)

Runtime factory identity (`createValidateFn<T>()` returns the cached factory for `T`'s
id, so `===` is id-equality):

```
createValidateFn<typeof /abc/i>()  →  val_D1Bjh   ┐
createValidateFn<typeof /xyz/>()   →  val_XNnRL   ├─ three DIFFERENT ids …
createValidateFn<RegExp>()         →  val_kCssiW  ┘
```

…even though `typeof /abc/i`, `typeof /xyz/`, and `RegExp` are **the same type** to
TypeScript. This is the inconsistency you flagged: two declarations TS considers
identical produce different ids.

The divergence is **whole-type only**. A regex literal _nested_ in a member does
**not** harvest — it collapses to "any RegExp" and converges:

```
createValidateFn<{r: typeof /abc/i}>()  ┐
createValidateFn<{r: typeof /xyz/}>()   ├─ all the SAME id (val_e4m0Ms)
createValidateFn<{r: RegExp}>()         ┘
```

So the feature only ever fires when a regex literal is the **entire** type
argument (`createValidateFn<typeof reg>()` / `getRunTypeId<typeof /…/>()`), plus the
value-first `regexp({source, flags})` builder. It's narrow — but where it fires,
it violates "id ≡ f(T)".

## How the RegExp-literal feature works today

TS can't carry the pattern in `T` (it's just `RegExp`), so the source+flags are
recovered out-of-band and stored as a **synthetic `KindLiteral` node**:

- **Type-first** (`createValidateFn<typeof /abc/i>()`): the scanner **AST-harvests**
  the literal from the call's type argument —
  [`scan.go`](../internal/compiler/resolver/scan.go) `resolveRegexLiteralSource` →
  `traceRegexLiteral` (walks `typeof reg` → the `const reg = /abc/i` initializer) →
  `splitRegexLiteralText`.
- **Value-first** (`regexp({source, flags})`): source+flags ride as literal type
  args on the `RegexLiteralType<S, F>` brand (`RegExp & {__rtRegexSource;
  __rtRegexFlags}`), read off the TYPE by
  [`typeid/formats.go`](../internal/cachegen/runtype/typeid/formats.go)
  `RegexLiteralFromType`.
- Both feed [`serialize.go`](../internal/cachegen/runtype/serialize.go)
  `SerializeRegexLiteral(source, flags)`, which registers a `KindLiteral` node with
  `Literal: {regexp: {source, flags}}` and structural id
  `<KindLiteral>:regexp:<source>|<flags>` (bypassing the `*checker.Type` path).
- Emitters dispatch on that `literal.regexp` shape to render a `/source/flags`
  literal and a source+flags-matching validator.

## What removal involves (full surface)

### TS (value-first builder + types)
- [`src/schema/atomic.ts`](../packages/ts-go-run-types/src/schema/atomic.ts):
  drop the `regexp<const A extends StringPatternArgs>` overload — keep only
  `regexp(id?): RunType<RegExp>`. Drop the `RegexLiteralType` / `RegexFlagsOf`
  imports (and `StringPatternArgs` **iff** unused after — it's also referenced by
  the string-pattern types, so confirm).
- [`src/schema/static.ts`](../packages/ts-go-run-types/src/schema/static.ts):
  remove `RegexLiteralType` and `RegexFlagsOf`.

### Go scanner / id
- [`scan.go`](../internal/compiler/resolver/scan.go): remove the `RegexLiteralFromType`
  branch (1) and the `resolveRegexLiteralSource` branch (2) in the id-resolution
  block; delete `resolveRegexLiteralSource`, `traceRegexLiteral`,
  `splitRegexLiteralText`. RegExp then falls straight through to `AssignID` →
  `KindRegexp` ("any RegExp"), one id for all.
- [`typeid/formats.go`](../internal/cachegen/runtype/typeid/formats.go): remove
  `RegexLiteralFromType` + the `regexSourceProp`/`regexFlagsProp` consts. **Keep**
  `traceRegexpExpr` / `splitRegexpLiteralText` (string-pattern — see below).
- [`serialize.go`](../internal/cachegen/runtype/serialize.go): remove
  `SerializeRegexLiteral` + the synthetic `KindLiteral` regexp node.

### Go emitters (the `literal.regexp` branches — all regexp-INSTANCE-literal paths)
Each currently special-cases `entry["regexp"]` / `literalMap["regexp"]`; all
become dead once no `KindLiteral` regexp node is produced:
- [`module.go`](../internal/cachegen/runtype/module.go) `footerLiteralExpr` (+ the
  `hasRegexp` guard)
- [`istype.go`](../internal/cachegen/typefunctions/istype.go) (~1420, ~1468)
- [`typeerrors.go`](../internal/cachegen/typefunctions/typeerrors.go) (~597)
- [`json_prepare.go`](../internal/cachegen/typefunctions/json_prepare.go),
  [`json_prepare_safe.go`](../internal/cachegen/typefunctions/json_prepare_safe.go),
  [`json_compat.go`](../internal/cachegen/typefunctions/json_compat.go),
  [`binary_from.go`](../internal/cachegen/typefunctions/binary_from.go)
- protocol: the `"regexp"` literal marker noted in
  [`protocol.go`](../internal/protocol/protocol.go) `Flags` (free-form field stays;
  the regexp usage goes away).

### Tests
- Delete [`internal/compiler/resolver/regexp_brand_test.go`](../internal/compiler/resolver/regexp_brand_test.go).
- **Keep** [`internal/cachegen/runtype/typeid/formats_regexp_test.go`](../internal/cachegen/runtype/typeid/formats_regexp_test.go)
  — it tests `registerFormatPattern({regexp: /…/})` recovery (the string-pattern
  path via `traceRegexpExpr`), not the RegExp-instance literal.
- [`Atomic.ts`](../packages/ts-go-run-types/test/suites/validation/Atomic.ts):
  `literal_regexp_simple` + the escaped-source case — remove, or convert to "any
  RegExp" (`createValidateFn<RegExp>()` / `regexp()`).
- [`typesafety.test.ts`](../packages/ts-go-run-types/test/typesafety.test.ts): the
  `regexp({source, flags})` / `RegexLiteralType` assertions (~321–324).
- Any mocking / serialization suite cases keyed on a specific regex pattern.

## What is preserved

The **string-pattern format** is a different feature and is untouched:

- `string({pattern: {source, flags, mockSamples}})` — validate a **string** matches
  a pattern (`StringParamsValueFirst` / `StringPatternArgs`).
- `registerFormatPattern({regexp: /…/, name, mockSamples})` and the type-first
  `FormatString<{pattern: …}>` authoring.
- Its pattern is carried on a **format annotation** (not a `KindLiteral` regexp
  node), recovered by `formats.go` `traceRegexpExpr` — a separate path that does
  **not** go through `SerializeRegexLiteral` or any `literal.regexp` emit branch.

In short: **"validate a string against a regex" stays; "validate a value is a
RegExp with a specific source/flags" goes.**

### `FormatString<{pattern: typeof …}>` authoring is unaffected (verified)

A natural worry: string formats are authored with `typeof`, so does removing the
RegExp-literal feature break them? **No.** The canonical form keeps working
untouched:

```ts
const slug = registerFormatPattern({regexp: /^[a-z0-9-]+$/, mockSamples: ['my-slug']});
type Slug = FormatString<{pattern: typeof slug}>; //  ✓ unchanged
```

The reason: the `typeof` here does **not** reference a `RegExp`. The pattern slot
(`PatternParam = FormatPattern | StringPatternArgs`,
[`stringFormats.ts`](../packages/ts-go-run-types/src/formats/string/stringFormats.ts))
never accepts a raw `RegExp` in the first place. The two things you can put behind
`typeof` are both non-`RegExp`:

- `slug` is a `registerFormatPattern(...)` result, whose type is the **opaque
  `FormatPattern`** brand
  ([`formatPattern.ts`](../packages/ts-go-run-types/src/runtypes/formatPattern.ts)) —
  a `unique symbol`-branded interface, not `RegExp`. So `typeof slug` is
  `FormatPattern`.
- The built-in pattern consts referenced as `{pattern: typeof EMAIL_PATTERN}`
  (`ALPHA_PATTERN`, `DOMAIN_PATTERN`, …) are inline `{source, flags, mockSamples}`
  literals (the `StringPatternArgs` shape), again not `RegExp`.

The Go recovery for **both** is `formatPatternFromSymbol`
([`typeid/formats.go`](../internal/cachegen/runtype/typeid/formats.go), case (a) →
`formatPatternFromCall` → `traceRegexpExpr`) — the **format-annotation** path. It is
completely independent of the regexp-INSTANCE harvest this doc proposes removing
(`scan.go` `traceRegexLiteral`, `serialize.go` `SerializeRegexLiteral`,
`typeid/formats.go` `RegexLiteralFromType`) and never goes through
`SerializeRegexLiteral` or any `KindLiteral` regexp node.

What was **never** valid — and so loses nothing — is `typeof` of a bare `RegExp`
const in a pattern slot:

```ts
const re = /^[a-z]+$/;                            // typeof re === RegExp
type Bad = FormatString<{pattern: typeof re}>;   // ✗ already a type error TODAY:
//                                               //   RegExp ∉ FormatPattern | StringPatternArgs
```

You have always had to wrap the regex in `registerFormatPattern` (which validates
the samples at load with the real JS engine). So if "using `typeof regexp`" meant
`typeof slug` where `slug = registerFormatPattern({regexp: /…/, …})`, it is
**unaffected**; if it meant `typeof` of a raw regex literal, that never compiled and
removing the feature changes nothing.

## Behavioral impact

- `createValidateFn<typeof /abc/i>()` becomes equivalent to `createValidateFn<RegExp>()`
  (matches any RegExp instance) — and now shares its id (id ≡ f(T) restored).
- `RT.regexp()` is unchanged (always was "any RegExp").
- `RT.regexp({source, flags})` is removed → a compile error at call sites; migrate
  to `RT.regexp()` (any RegExp) or, if the intent was to validate a **string**, to
  `string({pattern})`.
- **Lost:** asserting a value is a RegExp _instance_ with a specific source/flags.
  This is niche (RegExp instances rarely cross a serialization boundary — they
  don't survive JSON), and the common "match a string against a pattern" need is
  served by the string-pattern format, which stays.

## Recommendation

Remove it. It contradicts TypeScript's type system (no literal RegExp type) and is
the one place the schema id stops being a pure function of `T`. The change is
mechanical and well-bounded, the kept string-pattern format covers the real
use case, and `RegExp` becomes a clean single-kind leaf (`KindRegexp`).
