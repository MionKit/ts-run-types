# `InjectRunTypeId` helper → `getRTUtils().getRunType(id)` returns undefined at runtime

**Status:** DONE (2026-07-08)
**Severity:** doc-vs-runtime gap (a published guide example does not work when run)
**Scope:** investigate — either the runtime registry accessor
(`packages/ts-runtypes/src/runtypes/rtUtils.ts` `getRunType`) or the guide
example (`packages/examples/src/guide/markers-wrap-helper.ts`) + the marker docs.

## Resolution (what shipped)

Contract decided: the injected `InjectRunTypeId<T>` value is an **opaque handle**
(the reflection entry tuple), NOT a hash string, and it is resolved by
**forwarding it to a public resolver** (`getRunType` / `getRunTypeId`) as the
trailing argument — `getRunType<T>(undefined, id)`. Those functions already unwrap
the tuple (register the type graph, return the node / id). The low-level
`getRTUtils().getRunType(id)` stays a pure string→node lookup and is NOT the path
for a handle. Corrected the guide (`markers-wrap-helper.ts` now forwards),
`markers.ts` doc comments (the "just a hash string" claim + wrapper guidance), and
`container/website/content/2.guide/6.compiler-markers.md`.

One real scanner bug fixed to make forwarding work: a forwarded call inside a
generic wrapper body (`getRunType<T>(undefined, id)`, T free) wrongly tripped
MKR003 because `analyzeCall` ran the free-type-parameter check BEFORE noticing the
trailing slot was already supplied. `scan.go` now checks the **explicit
pass-through** (`argsCount > lastIndex`) first, so a forwarded handle is left
untouched and never diagnosed; MKR003 still fires when the slot is empty and T is
unresolved.

Siblings:
1. `createValidate<T>()` in a generic body is NOT a silent throw — it already
   emits **MKR003** (Error severity, halts production builds via the plugin's
   `surfaceDiagnostics`), added in commit 2b8f022 (2026-07-06), predating this
   spec. The guide `markers-wrap-parse.ts` was rewritten to the working pattern
   (build the validator at a concrete call site, pass it in). Verified + covered.
2. value-first `getRunTypeId(localVar)` on a function-body-local const was a
   **misdiagnosis**: it injects fine in a NON-generic body (verified across
   arrow / inferred-type / nested-arrow / `let` variants). The only failing shape
   is a GENERIC body whose const carries the wrapper's free `T`, which collapses
   into sibling (1) — MKR003, no site — never a silent runtime throw.

Regression coverage:
- Go: `internal/compiler/resolver/marker_wrapper_forward_test.go` —
  `TestScan_WrapperForwardsHandle_NoMKR003`, `TestScan_ValueFirstLocalConst_NonGeneric`,
  `TestScan_MarkerInGenericBody_EmitsMKR003` (getRunTypeId + createValidate).
- JS: `packages/ts-runtypes-devtools/test/marker-diagnostics.test.ts` (forward
  pattern emits no MKR003) + `packages/ts-runtypes/test/features/getRunType.test.ts`
  ("user wrapper forwarding an injected handle" — runs through the real plugin,
  proves the wrapper resolves to the same node/id as direct reflection, and pins
  that the raw handle is a tuple the low-level accessor misses).

Adjacent bug found while writing the runtime test (pre-existing, filed separately
and since fixed):
`docs/done/same-typeid-two-marker-calls-one-statement-not-injected.md` — a marker
call passed as an argument to an unrelated generic function whose parameter
INFERS the branded marker type (e.g. `expect(getRunTypeId<T>()).toBe(...)`) was
wrongly treated as "enclosed" and had its injection dropped.

## Symptom

The guide's own wrap-helper example:

```ts
function describe<T>(id?: InjectRunTypeId<T>): string {
  const runType = getRTUtils().getRunType(id!);   // <- returns undefined at runtime
  return runType ? `type #${id}` : 'unknown type';
}
describe<{id: number; name: string}>();
```

Built through the real plugin, `getRTUtils().getRunType(id!)` returns **undefined**,
so the helper always takes the `'unknown type'` branch. The type itself is fine:
a direct `getRunType<User>()` returns the node (kind `objectLiteral`).

## What the build actually injects

For a helper parameter `id?: InjectRunTypeId<T>`, the build injects the reflection
**entry tuple**, not a bare id string. Observed value for `InjectRunTypeId<User>`:

```
[5, () => [__rt_runtypes], <hole>, 'jr7ZNlF']   // tag 5 = per-root facade; id is slot 3
```

`getRTUtils().getRunType(x)` does not resolve this tuple (returns undefined), whereas
the static `getRunTypeId<User>()` returns the bare id `'jr7ZNlF'`. So the type-level
`InjectRunTypeId<T>` (a branded string, which is why `getRunType(id)` type-checks)
and the runtime-injected value (a tuple) disagree on shape, and the registry
accessor doesn't accept the tuple.

## Two smaller sibling gaps found the same way

Both are guide patterns that type-check but do NOT work when actually run:

1. **`createValidate<T>()` inside a generic body** (guide/`markers-wrap-parse.ts`):
   throws `createValidate(): no id injected` at runtime. A nested factory marker
   whose `T` is the enclosing generic parameter can't be resolved at build time
   (T is unknown at that call site) and is never injected.
2. **value-first `getRunTypeId(localVar)`** on a `const` declared *inside a function
   body* throws `getRunTypeId(): no id injected`, while the same call on a
   module-level `const` is injected fine. Position/scope sensitivity in the
   value-first rewrite.

## Why it matters

These are the documented public patterns for wrapping RunTypes in your own helper.
The e2e feature matrix (`container/pre-publish-e2e/apps/shared/src/markers.ts`)
had to route around all three to stay green, asserting only what reliably holds
(injection happened; direct `getRunType<T>()`; look-alike marker stays inert).

## Fix direction

Decide the intended contract, then make example + runtime agree:

- If `getRTUtils().getRunType(handle)` SHOULD accept the injected handle, teach it
  to unwrap the entry tuple (resolve slot-3 id / the facade) and register on demand.
- Else update the guide + marker docs to show the working pattern and stop implying
  the lookup resolves.
- For (1)/(2): either support the nested/local forms in the rewrite, or document
  them as unsupported with a diagnostic instead of a silent runtime throw.

## Acceptance

- [x] `getRTUtils().getRunType(<InjectRunTypeId handle>)` resolves the node, OR the
      guide/docs are corrected to the working pattern. → guide/docs corrected to the
      forwarding pattern (`getRunType<T>(undefined, id)`).
- [x] `createValidate<T>()`-in-generic and local-var value-first `getRunTypeId` are
      supported or emit a build-time diagnostic (never a silent runtime throw). →
      generic body emits MKR003 (Error); non-generic local-var value-first works.
- [x] Restore the fuller marker assertions in
      `container/pre-publish-e2e/apps/shared/src/markers.ts` and drop the note there.
- [x] `git mv` this spec to `docs/done/`.
