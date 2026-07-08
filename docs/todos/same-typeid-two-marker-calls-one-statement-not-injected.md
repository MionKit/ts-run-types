# Two same-typeid marker calls in one statement (inside a nested scope) → one is not injected

**Status:** todo (found 2026-07-08 while fixing the `InjectRunTypeId` wrapper-handle bug)
**Severity:** correctness — a natural call pattern silently loses injection and throws at runtime
**Scope:** marker scanner / rewrite (`ts-go-runtypes/internal/compiler/resolver/scan.go` +
`ts-go-runtypes/internal/compiler/sourcerewrite/`). Go resolver only. **Pre-existing —
reproduces on a pristine binary (verified by reverting scan.go), NOT introduced by the
wrapper/PFE9012 fixes in this branch.**

## Symptom

When TWO marker calls that resolve to the **same structural type id** appear in a **single
statement/expression** AND that statement is inside a **nested function scope** (an `it()`
arrow, any callback / function body), one of the two calls is left un-rewritten. At runtime
the un-injected call throws `getRunTypeId(): no id injected. ts-runtypes-devtools must be active.`

```ts
import {getRunTypeId} from '@ts-runtypes/core';

it('one statement, same type twice', () => {
  // ❌ throws "no id injected" — only one of the two calls gets the id injected
  expect(getRunTypeId<{q: number}>()).toBe(getRunTypeId<{q: number}>());
});
```

## What does and does not reproduce

| Shape | Result |
|---|---|
| two same-id calls, ONE statement, inside `it()` (above) | ❌ one call not injected |
| two same-id calls on SEPARATE statements, inside `it()` | ✅ both injected |
| two DIFFERENT-type calls, ONE statement, inside `it()` | ✅ both injected |
| two same-id calls, ONE expression, at MODULE top level (`export const x = (a === b)`) | ✅ both injected |
| the identical source through `client.transform` in the devtools test harness | ✅ 2 sites, correct rewrite |

The last two rows are the key clue: the SCAN of the same source produces the correct 2 sites
in isolation (devtools `client.transform`, and at module scope), so the miss is triggered by
the combination of **same structural id + two sites in one statement + a nested function
scope**, most likely in the per-file scope/dedup bookkeeping (`markFileScanned` /
`recordFileIDs` / the bounded-scope projection) or the rewrite's per-id binding injection when
two sites share one id within a nested block. It manifests through the real marker vitest
(`packages/ts-runtypes/vitest.config.ts`, full `tsconfig.test.json` program) but not through the
lean devtools overlay — so reproduce it there.

## Reproduction (host)

Add a `.test.ts` under `packages/ts-runtypes/test/features/` with the three shapes above and run
`pnpm exec vitest run <file>` from `packages/ts-runtypes`. The first fails, the other two pass.

## Why it matters

`expect(getRunTypeId<T>()).toBe(getRunTypeId<T>())` and any expression that names the same type
through two marker calls (`f(getRunTypeId<T>(), g(getRunTypeId<T>()))`, `a ?? getRunTypeId<T>()`
beside another `getRunTypeId<T>()`, …) is a natural pattern. It fails silently at build time
(no diagnostic) and only throws when the code runs. Tests that compare a wrapper's resolved id
to the direct id must currently split the two calls across statements to stay green (see
`packages/ts-runtypes/test/features/getRunType.test.ts`, the "user wrapper forwarding an
injected handle" suite).

## Fix direction

- Confirm whether the miss is in the SCAN (a second site with an already-seen id inside a
  nested scope is dropped) or the REWRITE (per-id binding injection collapses two sites that
  share one id). Instrument `commitPending` / `recordFileIDs` and the sourcerewrite edit
  builder for a same-id, two-site, nested-scope input.
- Sites are position-addressed, so two sites with the same id must each still receive their own
  injection edit; ensure nothing keys the injection or the "already handled" set on the id
  rather than the call position.
- Add a regression: same-id twice in one statement inside a callback → both injected (both
  transform modes), plus the module-scope and different-type controls.

## Acceptance

- [ ] `expect(getRunTypeId<T>()).toBe(getRunTypeId<T>())` inside `it()` injects BOTH calls and
      runs without throwing.
- [ ] A build-mode + edits-mode regression pins same-id/two-site/nested-scope injection.
- [ ] `git mv` this spec to `docs/done/`.
