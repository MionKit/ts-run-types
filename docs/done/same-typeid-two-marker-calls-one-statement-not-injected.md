# Marker call dropped in generic-passer-through argument position (reported as "two same-typeid marker calls in one statement")

**Status:** DONE (found 2026-07-08 while fixing the `InjectRunTypeId` wrapper-handle bug; fixed 2026-07-08).
**Severity:** correctness — a natural call pattern silently loses injection and throws at runtime.
**Scope:** marker scanner (`ts-go-runtypes/internal/compiler/resolver/scan.go` — `enclosedByInjectionMarker`). Go resolver only. **Was pre-existing** — reproduced on a pristine binary (verified by reverting `scan.go`), NOT introduced by the wrapper/PFE9012 fixes.

## Symptom (as reported)

`expect(getRunTypeId<T>()).toBe(getRunTypeId<T>())` inside an `it()` throws
`getRunTypeId(): no id injected. ts-runtypes-devtools must be active.` at runtime.

```ts
import {getRunTypeId} from '@ts-runtypes/core';

it('two markers in one expect().toBe()', () => {
  // ❌ threw "no id injected" — NEITHER call was injected
  expect(getRunTypeId<{q: number}>()).toBe(getRunTypeId<{q: number}>());
});
```

## Corrected diagnosis (the original framing was wrong)

The bug is **not** about the two calls sharing a structural id, nor about "one statement" or a
nested scope. Investigation (capturing the actual rewritten output through the real marker
vitest) showed **BOTH** calls were dropped, and the discriminator was purely **argument
position**, not id equality:

| Shape | Result |
|---|---|
| `expect(marker).toBe(marker)` | ❌ both dropped |
| `expect(marker).toBeDefined()` (no matcher arg) | ✅ injected |
| `expect(true).toBe(sink(marker))` (marker not a direct expect arg) | ✅ injected |
| `sink(marker, marker)` (plain, non-generic-method callee) | ✅ injected |
| `expect(marker === marker).toBe(true)` | ✅ injected |
| `const c = marker; expect(marker).toBe(c)` | ✅ `c`, ❌ the inline one |
| two markers on SEPARATE statements / at module scope | ✅ injected |

### Root cause

`getRunTypeId<T>()` returns the **branded** `InjectRunTypeId<T>` handle. When that value is the
argument to a **generic** function, the function's type parameter infers the branded type.
vitest's `expect` is exactly such a function: `expect(getRunTypeId<T>())` is
`Assertion<InjectRunTypeId<T>>`, and `Assertion<U>.toBe(expected: U)` therefore instantiates
`expected` to `InjectRunTypeId<T>`.

The scanner's `enclosedByInjectionMarker` walked each marker call's ancestor calls and matched
an ancestor's trailing parameter against the marker brand using the **resolved type**
(`marker.DetectAny`). `.toBe`'s resolved parameter type *is* `InjectRunTypeId<T>`, so `.toBe` was
mistaken for an **enclosing marker** (the mechanism that legitimately skips a value-first builder
nested inside `object({…})`). Both inner `getRunTypeId` calls were then skipped as "redundant
nested builders", emitted no site, and threw at runtime. The passing rows above are exactly the
cases where no ancestor call has a parameter that infers the branded type (`.toBeDefined()` has
no parameter; `sink(...unknown[])` / a `boolean` matcher parameter never infer the brand).

## Fix

`enclosedByInjectionMarker` now gates on the **written annotation**, not the resolved type. A
genuine enclosing marker is one of OUR functions and DECLARES its trailing slot as
`InjectRunTypeId<…>` / `InjectTypeFnArgs<…>`; a generic passer-through declares a bare type
parameter (`expected: U`) that merely *inferred* the brand. New syntactic detector
`comptimeargs.IsInjectionMarkerParamNode` (mirrors the existing `IsCompTimeArgsParamNode`)
resolves the parameter's type-reference through import aliases and requires the marker package's
symbol name + declaring module. The genuine nested-builder skip is unaffected (builders like
`object(config, id?: InjectRunTypeId<…>)` declare the annotation).

- `ts-go-runtypes/internal/compiler/comptimeargs/node.go` — `IsInjectionMarkerParamNode`.
- `ts-go-runtypes/internal/compiler/resolver/scan.go` — `enclosedByInjectionMarker` gates on it.

## Tests

- `ts-go-runtypes/internal/compiler/resolver/marker_wrapper_forward_test.go`:
  - `TestScan_GenericPassthroughDoesNotEncloseMarker` (static + reflection shapes) — a
    `wrap<U>(actual: U): {toBe(expected: U)}` passer-through; both marker calls must emit a site.
    Verified to FAIL on the pre-fix source (0 sites) and pass after.
  - `TestScan_GenuineNestedBuilderStillEnclosed` — pins that a value-first builder nested inside a
    genuine `InjectRunTypeId`-declaring enclosing call is still skipped (one site, not two).
- `packages/ts-runtypes-devtools/test/transform-modes.test.ts` — "generic passer-through keeps
  both marker injections (edits==go)": both wire modes inject both calls, byte-identical.
- `packages/ts-runtypes/test/features/marker-call-position.test.ts` — the exact reported shape
  driven through the real vitest `expect().toBe()`, both call shapes + a paired convergence
  assertion + a nested-callback one-liner.
- `container/pre-publish-e2e/apps/shared/src/markers.ts` — end-to-end guard against the published
  package: two `getRunTypeId<User>()` calls as arguments to the generic `eq()` in one statement.

## Acceptance

- [x] `expect(getRunTypeId<T>()).toBe(getRunTypeId<T>())` inside `it()` injects BOTH calls and
      runs without throwing.
- [x] A build-mode + edits-mode regression pins the injection (transform-modes parity case).
- [x] `git mv` this spec to `docs/done/`.
