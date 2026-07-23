# Format patterns must live in the type, not in a runtime value

**Status:** implemented. Discovered while building the cross-library validation
benchmarks (`benchmarks/`), where RunTypes resolves the marker package
through its published `dist/*.d.ts` instead of `src/`. The proposed solution
below is now live — `registerFormatPattern` / `FormatPattern` are generic over
the args literal, the built-ins are authored as `{source, flags, mockSamples}`,
and the Go scanner recovers the pattern from the resolved TYPE
(`formatPatternFromType`). The benchmark's `alpha`/`email`/`url`/`domain` cases
validate for RunTypes through `dist/*.d.ts`.

## TL;DR

`FormatAlpha` / `FormatAlphaNumeric` / `FormatNumeric` (and the
domain/email/url formats) carry their regex **outside the type system** — as a
runtime `registerFormatPattern({regexp: /…/})` value referenced by `typeof`. The
Go scanner recovers the regex by reading that **call's source AST**, which only
works when the call's source is in scan scope. A consumer that resolves the
package via its `.d.ts` (any normal npm dependent, and our benchmark) has
neither the source AST nor a type-level literal to read, so those formats can't
be compiled and degrade to not-supported.

The fix: **make the pattern a type-level literal** — drop the `regexp` overload,
accept only `{source, flags?, mockSamples, message?}` string literals, make
`registerFormatPattern` / `FormatPattern` generic so the literal lands in
`TypeFormat`'s params, and migrate every built-in pattern to the string form.
Then the scanner recovers patterns the same way it recovers `{maxLength: 5}` —
straight from the type, surviving `.d.ts`.

## Background — two ways a format carries its params

RunTypes resolves `createValidateFn<T>()` by reading `T` with the tsgo
type checker. Format params reach the scanner by one of two routes:

1. **Type-argument literals (survive `.d.ts`).** `FormatString<{maxLength: 5}>`,
   `FormatNumber<{max: 100}>`, `FormatUUIDv4 = TypeFormat<string,'uuid',{version:'4'}>`.
   The `{maxLength: 5}` _is_ the type. TypeScript emits type arguments verbatim
   into `.d.ts`, so the scanner sees them no matter how the package is resolved.

2. **`typeof` an opaque runtime value (does NOT survive `.d.ts`).** The
   char-class formats in
   [`src/formats/string/stringFormats.ts`](../packages/ts-runtypes/src/formats/string/stringFormats.ts):

   ```ts
   export type FormatAlpha<P = {}> = TypeFormat<string, 'stringFormat', P & {pattern: typeof ALPHA_PATTERN}, never>;
   ```

   where, in
   [`src/formats/string/string-patterns.ts`](../packages/ts-runtypes/src/formats/string/string-patterns.ts):

   ```ts
   export const ALPHA_PATTERN = registerFormatPattern({ regexp: /^[\p{L}]+$/u, mockSamples: [...] });
   ```

   `registerFormatPattern` is typed to return a **non-generic, opaque** interface
   ([`src/runtypes/formatPattern.ts`](../packages/ts-runtypes/src/runtypes/formatPattern.ts)):

   ```ts
   export interface FormatPattern {
     readonly source: string; // ← `string`, not `'^[\\p{L}]+$'`
     readonly flags: string;
     readonly mockSamples: readonly string[];
     readonly [formatPatternBrand]: true;
   }
   export function registerFormatPattern(args: CompTimeArgs<FormatPatternArgs>): FormatPattern;
   ```

   So `typeof ALPHA_PATTERN` is just `FormatPattern` — it encodes **nothing**
   about the actual regex. The regex exists only in the runtime call argument.

## Root cause

Because the regex is not in the type, the Go scanner recovers it from the
**call-site AST**: `formatPatternFromSymbol` in
[`internal/cachegen/runtype/typeid/formats.go`](../internal/cachegen/runtype/typeid/formats.go)
walks from `pattern: typeof p` to `p`'s declaration and reads the
`registerFormatPattern({regexp: /…/ | source: '…'})` argument. The
`CompTimeArgs<…>` marker forces a literal at the call site precisely so this
read can succeed.

This works for first-party builds (the package's own tests resolve the package
to `src` via the `"source"` export condition + `customConditions`, so the call
AST is in scope). It **cannot** work for a consumer that resolves the package
through its published `.d.ts`, because:

- the declared type is the opaque `FormatPattern` (never carried the regex), and
- `.d.ts` emission strips the `registerFormatPattern({…})` initializer body.

Both the type-level and AST-level sources are gone. The scanner can't build the
`stringFormat` node's pattern, the entry degrades, and
`createValidateFn<FormatAlpha>()` throws on instantiation.

### Why a `/regex/` literal can never be a type

`typeof /foo/` is `RegExp` — TypeScript has **no literal type for a regex**. So
the `regexp:` form is fundamentally untypeable; no amount of generics can lift
`/^[\p{L}]+$/u` into the type. Only **string** literals (`source`, `flags`) can
be captured as literal types (via `const` type parameters) and survive `.d.ts`.
This is the same reason inline `/regex/` literals were abandoned in the first
place — the registration approach moved the problem from "literal in the type"
to "literal in the call AST", which is recoverable first-party but not through a
`.d.ts`.

## Why it matters

- **Downstream npm consumers** of RunTypes always resolve via
  `dist/*.d.ts`. Today, every format whose pattern is a registered package
  constant (alpha/alphaNumeric/numeric, domain, email, url, …) silently fails to
  compile for them — exactly the formats most users want.
- The benchmark surfaced it because it deliberately consumes the published
  shape: `alpha`/`alphaNumeric`/`numeric`/`alpha_withLength` show as
  not-supported for RunTypes while zod/typebox/ajv handle them.

## Guiding principle

**Every parameter the scanner needs must be preserved as a literal _in the type_,
so it survives `.d.ts` emission.** That is the whole game. The scanner reads `T`;
for a consumer, `T` is whatever the published `.d.ts` says it is. So anything the
validator/mock/diagnostics depend on — bounds, lengths, enum values, regex
source, flags, mock samples, messages — must be encoded as **literal types** that
TypeScript carries verbatim into the `.d.ts` (the way `{maxLength: 5}` or
`{version: '4'}` already do).

Conversely, any param that lives only in a **runtime value** — an opaque return
type (`FormatPattern` with `source: string`), or a value with no literal type at
all (a `/regex/` literal, since `typeof /x/` is `RegExp`) — is invisible to a
`.d.ts` consumer, full stop. The AST-recovery workaround papers over this for
first-party builds but cannot for published packages.

The fix below applies this principle to the format-pattern bundle: **all** of its
params (`source`, `flags`, `mockSamples`, `message`) become type-level literals —
not a hand-picked subset — so nothing is lost on the `.d.ts` boundary.

## Proposed solution

Make the pattern bundle a set of **type-level literals**, identical in spirit to
`{maxLength: 5}` — and capture _every_ field, not just the regex.

1. **`registerFormatPattern` accepts only the string form.** Remove the
   `regexp: RegExp` overload. The sole signature is the `{source, flags?,
mockSamples, message?}` shape, all string literals, still wrapped in
   `CompTimeArgs<…>` so the values are compile-time literals.

2. **Make `registerFormatPattern` / `FormatPattern` generic over the WHOLE args
   object** — not just `source`/`flags`. Capturing only the regex would re-create
   the bug for the other two fields: `mockSamples` (drives `createMockDataFn`) and
   `message` (drives diagnostics) would widen to `readonly string[]` / `string`
   and be lost for `.d.ts` consumers, exactly like the regex is today. Carry the
   full literal args so all four fields survive:

   ```ts
   export interface FormatPattern<A extends StringPatternArgs = StringPatternArgs> {
     readonly source: A['source'];
     readonly flags: A['flags'] extends string ? A['flags'] : '';
     readonly mockSamples: A['mockSamples']; // literal tuple, e.g. readonly ['abc','Hello']
     readonly message?: A['message'];
     readonly [formatPatternBrand]: true;
   }
   export function registerFormatPattern<const A extends StringPatternArgs>(args: CompTimeArgs<A>): FormatPattern<A>;
   ```

   The `const A` inference keeps every field literal. So `typeof ALPHA_PATTERN`
   becomes
   `FormatPattern<{source: '^[\\p{L}]+$'; flags: 'u'; mockSamples: readonly ['abc','Hello','World']}>`
   — source, flags, mock samples **and** message all live in the type and survive
   `.d.ts`. `FormatAlpha`'s `pattern` param carries the lot.

   (Equivalent shapes work too — e.g. `FormatPattern = Readonly<A> & {brand}` — as
   long as the projection preserves the literals; the point is the _whole_ args
   object rides the type, not a hand-picked subset.)

3. **Recover the pattern from the type, not the AST.** The scanner already reads
   `{maxLength: 5}` from a format's params; teach the stringFormat path to read
   the full bundle — `pattern.source`, `pattern.flags`, `pattern.mockSamples`,
   `pattern.message` — from the resolved type the same way
   (`internal/cachegen/runtype/typeid/formats.go`). All four matter: source/flags
   build the validator, mockSamples feed `createMockDataFn`, message feeds
   diagnostics. The call-AST reader (`formatPatternFromSymbol`) can be kept as a
   fallback for the value-first builder path, or removed once the type path is
   authoritative.

4. **Migrate every built-in pattern to the string form.** Convert all
   `registerFormatPattern({regexp: /…/})` calls (alpha/alphaNumeric/numeric,
   domain, email, url, …) in
   [`src/formats/string/string-patterns.ts`](../packages/ts-runtypes/src/formats/string/string-patterns.ts)
   to `{source: '…', flags: '…', mockSamples: […]}`. A regex's `.source` /
   `.flags` are mechanical to extract; the only manual care is backslash
   double-escaping in the string literal.

## Migration & compatibility

- **Breaking for pattern authors** using the `regexp:` overload — they must
  switch to `{source, flags}`. This is a deliberate, documented break (the
  `regexp` form can never work for `.d.ts` consumers). Provide a short codemod /
  guidance (`/re/u` → `{source: 're', flags: 'u'}`) in the changelog.
- `CompTimeArgs` already enforces literals, so authoring stays compile-time
  checked (a non-literal `source` is a build-time CTA0xx error).
- No runtime behavior change: `FormatPattern` still validates `mockSamples`
  against the pattern at registration and freezes the bundle.

## Trade-offs

- Writing the regex as a `source` string loses `/regex/` editor affordances
  (syntax highlighting, no double-escaping). Acceptable: it's the only form that
  survives type emission, and `mockSamples` (validated at registration) guard
  against typos.

## Acceptance criteria — met

- ✅ `registerFormatPattern` has no `regexp` overload; `FormatPattern` is generic
  over the args literal (`const A`), so `source`/`flags`/`mockSamples`/`message`
  all ride the type.
- ✅ All built-in patterns authored as `{source, flags?, mockSamples}`.
- ✅ The scanner recovers stringFormat patterns from the **type**
  (`formatPatternFromType` in `internal/cachegen/runtype/typeid/formats.go`); the
  AST reader stays as the value-first fallback.
- ✅ The benchmark's `alpha` / `alphaNumeric` / `numeric` / `alpha_withLength`
  (and domain/email/url) compile and validate for RunTypes through
  `dist/*.d.ts` — no `"source"` resolution condition.
