# Fix `typecheck:test` errors in the enrich suites (type-only)

> **Status: pending (found 2026-06-23).** `pnpm --filter ts-runtypes run typecheck:test`
> is RED with 17 errors, all about the `FriendlyMeta` type requiring `$label` /
> `$errors`. Pre-existing and independent of any current feature work (reproduces on
> `main`; the `binary-sizing-modes` branch does not touch any enrich file). **The fix
> must be type-only — no change to runtime behaviour** (the runtime already does the
> right thing; only the static types are out of step).

## Symptom

`tsc -p tsconfig.test.json --noEmit` reports 17 errors in three files (runtime
`pnpm test` is GREEN — this is a type-check-only failure):

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
meta keys as **required**:

```ts
export interface FriendlyMeta {
  $label: string;
  $errors: ErrorTemplates;
  __rt_typeName?: string;
}
```

The doc comment says this is deliberate ("both REQUIRED, every node must be
addressed"), enforced for AUTHORING by the `@todo` / diagnostic layer. But two things
are out of step with that strictness:

1. **The runtime accepts partial / empty maps.** [`createFriendly`](../../packages/ts-runtypes/src/enrich/createFriendly.ts)
   reads them defensively: `node?.$label ?? rawLabel(path)` (label falls back),
   `errorTemplates?.[…] ?? errorTemplates?.$default` (errors optional). So a node with
   only `$label`, only `$errors`, or neither is a valid runtime input.
2. **Callers legitimately pass partial maps.** `validationAsserts.ts:612` calls
   `createFriendly<unknown>({})` (no overrides — the cross-suite "every error renders"
   net), and the test cases override just a label, just an error, or a subtree.

So the **input type over-constrains**: it forbids partial maps that the runtime is
built to handle. The tests encode the intended lenient-input behaviour; the type is
the thing that drifted (likely when the "total contract" landed in `b91ace6b`).

## The decision to make

Is a partial friendly map a supported INPUT to `createFriendly`?

- **Runtime + existing call sites say yes** (the `{}` call and the fallbacks above).
- The "must be filled" contract is an **authoring** concern (the CLI scaffolding /
  `@todo` diagnostics that nudge you to fill every node), not a constraint that the
  `createFriendly` rendering API should impose at the TS level.

If that holds, the fix is to **relax the input type, not the tests**. Confirm by
reading the enrich contract docs before changing anything:
[`docs/AI_ENRICHMENT.md`](../AI_ENRICHMENT.md) and the `rt-enrich-types` /
`runtypes-friendly-type` skills.

## Fix approach (type-only)

Preferred: **relax the type `createFriendly<T>()` accepts for its map argument** so
`$label`, `$errors`, and child nodes are all optional, matching the runtime. Keep the
strict `FriendlyMeta` / `FriendlyType<T>` for the authoring + scaffolding contract.

- Introduce an input-side partial (e.g. `PartialFriendlyType<T>` / a deep-`Partial`
  over the `FriendlyNode` shape) and use it as the `createFriendly` parameter type.
  `FriendlyMeta` stays strict where the scaffold/diagnostics consume it.
- Do **not** weaken what the enrich CLI/`@todo` layer enforces.
- Do **not** touch `createFriendly`'s runtime — it already defaults; behaviour is
  unchanged.

Fallback (only where a test map is genuinely wrong rather than intentionally partial):
correct that map. But the `{}` call and the label-only / errors-only cases are
legitimate and MUST type-check, so they cannot be "fixed" by filling them in.

## Guardrails

- **No functionality change.** Runtime output of `createFriendly` must be identical;
  `pnpm test` must stay green. This is purely about making the static types accept the
  inputs the runtime already supports.
- Do not relax `FriendlyMeta` itself if that weakens the authoring contract the
  scaffolding relies on — relax the rendering API's INPUT type instead.

## Files

- Errors: [`test/suites/enrich/createFriendly.test.ts`](../../packages/ts-runtypes/test/suites/enrich/createFriendly.test.ts),
  [`test/suites/enrich/cases/Circular.ts`](../../packages/ts-runtypes/test/suites/enrich/cases/Circular.ts),
  [`test/util/validationAsserts.ts`](../../packages/ts-runtypes/test/util/validationAsserts.ts)
- Types: [`src/enrich/friendlyType.ts`](../../packages/ts-runtypes/src/enrich/friendlyType.ts) (`FriendlyMeta`, `FriendlyNode`, `FriendlyType`)
- Runtime (read-only, do not change behaviour): [`src/enrich/createFriendly.ts`](../../packages/ts-runtypes/src/enrich/createFriendly.ts)

## Investigation steps

1. Read `FriendlyNode` / `FriendlyType` in `friendlyType.ts` to see how the strict
   `FriendlyMeta` composes into the recursive map, and what `createFriendly` declares
   as its parameter type.
2. Confirm the runtime tolerance (the `??` fallbacks) and enumerate every partial
   shape the tests rely on (label-only, errors-only, `{}`, partial subtree, `$slots`,
   `$keys`/`$values`).
3. Read `docs/AI_ENRICHMENT.md` + the enrich skills to confirm "filled values" is an
   authoring (`@todo`/CLI) concern, not a `createFriendly`-input constraint.
4. Implement the input-side partial type; re-run the two gates below.

## Verification

```
pnpm --filter ts-runtypes run typecheck:test   # must be GREEN (0 errors)
pnpm test                                       # must stay GREEN (no behaviour change)
```
