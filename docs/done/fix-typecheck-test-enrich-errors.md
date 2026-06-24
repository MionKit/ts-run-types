# Fix `typecheck:test` errors in the enrich suites (type-only)

> **Status: DONE (shipped 2026-06-24).** `pnpm --filter ts-runtypes run typecheck:test`
> is GREEN (0 errors) and `pnpm test` stays GREEN (7205 passed) — no runtime change.
> **Note:** the fix that shipped is NOT this doc's originally-preferred one. The
> "relax the input type with a `PartialFriendlyType<T>`" approach below was implemented
> first, then **rejected in review** for weakening the just-landed total contract. What
> shipped instead keeps `createFriendly` strict and fixes the test maps. See
> **Resolution** at the bottom.

## Symptom

`tsc -p tsconfig.test.json --noEmit` reported 17 errors in three files (runtime
`pnpm test` was GREEN — a type-check-only failure):

| file | count | codes |
|---|--:|---|
| `packages/ts-runtypes/test/suites/enrich/createFriendly.test.ts` | 14 | TS2322, TS2741 |
| `packages/ts-runtypes/test/suites/enrich/cases/Circular.ts` | 2 | TS2322 |
| `packages/ts-runtypes/test/util/validationAsserts.ts` | 1 | TS2345 |

Every error is a variant of:

```
TS2741: Property '$label' is missing in type '{ $errors: { type: string } }' but required in type 'FriendlyMeta'.
TS2741: Property '$errors' is missing in type '{ $label: string }' but required in type 'FriendlyMeta'.
TS2345: Argument of type '{}' is not assignable to parameter of type 'FriendlyMeta'.  // createFriendly<unknown>({})
```

## Root cause

[`FriendlyMeta`](../../packages/ts-runtypes/src/enrich/friendlyType.ts) declares both
meta keys as **required**, and the object child map flips to `-?` (so even optional
props of `T` are required nodes). This is the **total contract**, landed deliberately
as a breaking change in `b91ace6b` ("feat(enrich)!: total FriendlyType/MockData
contract"). `b91ace6b` migrated the `cases/*` fixtures and the compile tests, but did
**not** migrate `createFriendly.test.ts` / `validationAsserts.ts` — those render tests
still carried pre-`b91ace6b` partial maps. Those un-migrated maps are the 17 errors.

## The decision to make

Is a partial friendly map a supported INPUT to `createFriendly`?

This doc originally answered **yes** (relax the input type). On review the answer is
**no**, for two reasons:

1. **`b91ace6b` made the contract total on purpose.** Re-opening partiality on the
   primary render API directly contradicts the intent that just landed.
2. **The MockData sibling has no partial twin.** `createMockType` consumes the **total**
   `MockData<T>` (`data?: MockData<T>` — the whole object is optional, but when present
   it is total; there is no `PartialMockData`). Keeping `createFriendly` on the total
   `FriendlyType<T>` keeps the two render APIs symmetric.

The defensive `??` fallbacks in `createFriendly` are a runtime **safety net** for
degenerate input, not a license to type the public input as partial.

## ~~Fix approach (type-only) — NOT SHIPPED~~

> ~~Preferred: relax the type `createFriendly<T>()` accepts via a `PartialFriendlyType<T>`
> deep-partial, matching the runtime's defensiveness.~~ **Rejected** — see Resolution.

## Resolution (what shipped)

Keep the total contract end-to-end; fix the examples, not the type.

1. **`createFriendly` stays strict.** Its parameter is `FriendlyType<T>` (reverted from
   the `PartialFriendlyType<T>` first attempt). `PartialFriendlyType` / `PartialFriendlyNode`
   were deleted from `friendlyType.ts` and the index barrel — they no longer exist.
2. **Under-filled render maps → filled to total** (the majority of the 14 in
   `createFriendly.test.ts`). These were lazily-partial pre-`b91ace6b` maps; they get
   their missing `$label` / `$errors` / sibling nodes added. The added meta sits on
   nodes the test does not exercise, so no assertion changes.
3. **Genuinely-degenerate sites → localized `as FriendlyType<T>` cast** (with a comment).
   Three sites exist *to* feed deliberately-incomplete input and exercise the renderer's
   fallback safety net — they cannot be "filled" without destroying the test:
   - `createFriendly.test.ts` — "label falls back to the raw field name when `$label` is
     absent" (the node *must* omit `$label`).
   - `createFriendly.test.ts` — "missing map entry → graceful fallback message" (field
     `b` *must* be absent).
   - `validationAsserts.ts` — `assertFriendlyCoverage` renders every type's errors with
     the empty `{}` map (the cross-suite "every error renders with no overrides" net).
4. **`cases/Circular.ts` cycle-break leaf → documented divergence cast.** The
   depth-bounded `FriendlyType` / `MockData` types can't model the runtime `seen`-guard
   cutoff at a self-referential back-edge, so the `circularArray` expected carries a
   trailing `as` (stripped by `enrichCases.ts` `stripTrailingAs` before the shape
   compare; `check` re-validates the stripped literal via the Go CLI). This is the one
   pre-existing, contract-independent divergence and is unrelated to the Partial debate.

## Guardrails (met)

- **No functionality change.** `createFriendly`'s runtime is untouched; `pnpm test` stays
  green (7205 passed).
- `FriendlyMeta` / the authoring contract is **not** weakened — the scaffold / `@todo`
  diagnostics still enforce that every node is filled.

## Files touched

- `src/enrich/friendlyType.ts` — removed `PartialFriendlyType` / `PartialFriendlyNode`.
- `src/enrich/createFriendly.ts` — parameter back to `FriendlyType<T>`.
- `src/index.ts` — dropped the two partial-type exports.
- `test/suites/enrich/createFriendly.test.ts` — filled maps + 2 degenerate-case casts.
- `test/util/validationAsserts.ts` — `{} as FriendlyType<unknown>` cast on the coverage net.
- `test/suites/enrich/cases/Circular.ts` — cycle-break divergence casts (unchanged intent).

## Verification

```
pnpm --filter ts-runtypes run typecheck:test   # GREEN (0 errors)
pnpm test                                       # GREEN (7205 passed)
```
