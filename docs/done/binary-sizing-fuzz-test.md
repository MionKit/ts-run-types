# Binary cold-start sizing — no-resize fuzz test + reserve tightenings

> **Status: SHIPPED.** Follows the compile-time size estimate from
> [docs/done/binary-encoder-sizing-redesign.md](./binary-encoder-sizing-redesign.md).
> Implements (and extends) the original TODO below.

## What shipped

A property/fuzz test proving the per-type cold-start buffer estimate is **sound for
in-bounds data**, plus two runtime reserve tightenings that make the strict no-resize
property actually hold for the serialization-format types.

### The finding that shaped it

The literal "in-bounds data never grows the buffer" did **not** hold before this change,
and the reason was **not** the estimator — it was runtime **over-reservation**. The
estimator already sizes packed numbers to their format width (`numberFormat.BinarySize` →
1/2/4 bytes). But the emitted encode body reserved a hardcoded **8** for every number,
`MAX_VARINT` (5) for every collection length, etc. — so a cold buffer seeded at the
(tight) estimate would grow even on an exact-fit value. Empirically: `'hello'` has an
exact wire size of 6 bytes, yet seeding a 6-byte buffer still grew it to 20 (the string
reserve is `MAX_VARINT + charLength*3`).

### Part A — reserve tightenings (product)

- **Scalar number reserve → packed width.** The `KindNumber` arm reserves the format's
  `BinarySize().Fixed` (1/2/4) when a packed override is present, not the float64 worst
  case ([binary_to.go](../../internal/compiled/typefns/binary_to.go)); `fixedWidthForKind`
  returns the packed width so a homogeneous packed-int array reserves `length*packedWidth`.
  The format-width helper is shared with the estimator (`formatFixedWidth`,
  [binary_size_estimate.go](../../internal/compiled/typefns/binary_size_estimate.go)) so the
  two can't drift.
- **`serLength` reserve → exact varint width.** Reserves `varintLen(value)` (the width it's
  about to write, known at the call) instead of `MAX_VARINT`
  ([dataView.ts](../../packages/ts-runtypes/src/runtypes/dataView.ts)).

Both reserves stay `>=` the actual write, so there is no overflow regression (the full
binary round-trip suite, `binaryDynamicGrow`, `binaryEncoderResize` and the fuzz oracle all
stay green). Strings keep their `3x` worst-case reserve — UTF-8 expansion isn't known until
encode — so the *mock* bounds the value to fit that reserve (see below), rather than the
estimate over-allocating.

### Part B — `respectBinarySize` mock option (product) + the fuzz suite

**Value source — a real `createMockType` option** (`packages/ts-runtypes/src/mocking/`):

- **`respectBinarySize: true | false | undefined`** + **`binarySizingOptions`**
  (`{sizeBias, sizeItems, sizeStringBytes, sizeMaxBytes}`) on `MockOptions`
  ([`mockTypes.ts`](../../packages/ts-runtypes/src/mocking/mockTypes.ts)). `true` (only when
  explicitly `=== true`) bounds a generated value to fit the **cold buffer** — bounds target
  the per-write RESERVE, not the wire size: collections capped at `sizeItems`, strings short
  enough that their `5 + 3*length` reserve fits `sizeStringBytes`, bigint magnitude small,
  ASCII charset, optionals omitted below bias 1
  ([`binarySize.ts`](../../packages/ts-runtypes/src/mocking/binarySize.ts)). `false` overshoots
  one unbounded position, the size counterpart of `mockInvalid.ts`
  ([`mockOversized.ts`](../../packages/ts-runtypes/src/mocking/mockOversized.ts)); `undefined`
  is unchanged. Unit-pinned by
  [`suites/mocking/respectBinarySize.test.ts`](../../packages/ts-runtypes/test/suites/mocking/respectBinarySize.test.ts).

**The design — a DUMB oracle.** All the "does it fit?" logic lives in two places that must
agree: the mock bounds (above) and the cold-start estimate (`binary_size_estimate.go`). The
oracle ([`sizeOracle.ts`](../../packages/ts-runtypes/test/fuzz/binary/sizeOracle.ts)) does NO
size arithmetic and knows nothing about kinds — it encodes into a cold buffer (seeded at the
estimate) and observes one bit, *did it resize?*:

- **in-bounds** (`respectBinarySize:true`) → the cold buffer MUST NOT resize, and round-trips.
- **oversized** (`respectBinarySize:false`) → the cold buffer MUST resize, and round-trips (the
  negative control proving teeth + grow-in-place stays sound).

Type SELECTION (skip the non-data leaves `DATA_GEN_OPTIONS` never emits) moved out of the
oracle to [`sizeEligible.ts`](../../packages/ts-runtypes/test/fuzz/binary/sizeEligible.ts), a
runner concern. The existing `typeGen` (DATA_GEN_OPTIONS) supplies random serialisable types;
the harness exposes the baked `seed` and the reflection tuple. Config is varied (bias stays 1
so the bounding is exact; `items`/`stringBytes`/`maxBytes` change, incl. adversarial tiny
`stringBytes` and a tight `maxBytes` to exercise the clamp). A **clamped** estimate (seed
reaches `maxBytes`) is deliberately under-allocated and scoped OUT (the todo's "larger than the
rules assume" case) — skipped, not failed.

**Making the two sides agree — the reserve audit.** A per-kind audit (derive the reserve
high-water vs the estimate vs the mock bound, then adversarially refute each "fits" verdict)
drove the bounds above plus a set of estimator fixes where a value is **type-constrained** (the
mock can't shrink it) and the estimate was below its floor reserve, in
`binary_size_estimate.go`:

- **Map / Set element under-count** — `mapElement`/`setElement` read the element off `Children`,
  but it lives on `Arguments` (`KindParameter` wrappers); fixed to read `Arguments` + descend
  the parameter. Fixes flat *and* nested containers.
- **Object-member union framing** — the flat object branch's sub-discriminator + merged optional
  bitmap, now added.
- **Union budgets the LARGEST member** (`maxBytes`, not the bias-interpolated footprint) — the
  mock can pick any member.
- **String / regexp floor of 8** — the shortest mock string (1 char) reserves `5 + 3 = 8`.
- **String-enum per-member reserve** — `max(8, 4 + 5 + 3*utf16Len)` over the members (the member
  literal can't be shrunk), replacing the hardcoded 8.
- **Index-signature string-key floor** — keys are synthesized `key{i}` (length floor the mock
  can't shrink); budget `5 + 3*(3 + digits(items-1))`.
- **Template-literal layout** — the whole rendered template is one serString; budget its static
  texts + per-`${string}` content + a digit budget for numeric placeholders + literal lengths,
  read off the `templateLiteral` layout on `rt.Literal` (split from the plain-string arm).
- **Non-packing format-branded bigint** — a brand that doesn't pack to 64-bit takes the decimal
  serString arm and is mocked within its own `[min,max]` (not the ±9999 mock bound), so budget
  the longest decimal the brand can emit.

`typeGen` emits neither template literals nor format brands, so these two are covered by the
deterministic `binarySizeFloors.test.ts` cases rather than the random soak.

**Deterministic pins.** [`binarySizeFloors.test.ts`](../../packages/ts-runtypes/test/fuzz/binary/binarySizeFloors.test.ts)
checks (1) Part A's packed formats (`int8/16/32`, `bigint64` — reverting Part A turns it red)
and (2) the audit's refuted worst-cases (`Record<string,string>`, `Record<string,bigint>`,
string enums, `string|number` unions, nested containers, regexp, template literals, non-packing
branded bigints) at a tiny adversarial config (items=2, stringBytes=1), 30 random in-bounds
values each, all no-resize.

Soak: `FUZZ_SIZE_SOAK_MS=<ms> pnpm exec vitest run binarySizeEstimate` (mirrors
`FUZZ_TYPES_SOAK_MS`). A 40s soak runs ~2000 types with 0 violations, ~1500 no-resize checks
and ~500 negative-control grows (clean across many seeds; ~28% of generated types skip as
recursive / clamped / non-serialisable).

---

## Original TODO

> A property / fuzz test that proves the per-type buffer-size estimate is **sound for
> in-bounds data**: a value whose collections, strings and formatted scalars stay within
> the estimation rules must encode through the `dynamic` strategy **without growing the
> buffer**. The estimate is only a seed (grow-on-miss keeps things correct either way), but
> the whole point is that in-bounds data skips the realloc on a cold start.
>
> Contract is one-directional: **over-**estimating (no grow, some slack) is fine;
> **under-**estimating for in-bounds data is the bug this catches. Out-of-bounds data
> (larger than the rules assume) is allowed to grow and is out of scope.
