# `InjectRunTypeId` helper → `getRTUtils().getRunType(id)` returns undefined at runtime

**Status:** todo (found 2026-07-08 while building the pre-publish e2e feature matrix)
**Severity:** doc-vs-runtime gap (a published guide example does not work when run)
**Scope:** investigate — either the runtime registry accessor
(`packages/ts-runtypes/src/runtypes/rtUtils.ts` `getRunType`) or the guide
example (`packages/examples/src/guide/markers-wrap-helper.ts`) + the marker docs.

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

- [ ] `getRTUtils().getRunType(<InjectRunTypeId handle>)` resolves the node, OR the
      guide/docs are corrected to the working pattern.
- [ ] `createValidate<T>()`-in-generic and local-var value-first `getRunTypeId` are
      supported or emit a build-time diagnostic (never a silent runtime throw).
- [ ] Restore the fuller marker assertions in
      `container/pre-publish-e2e/apps/shared/src/markers.ts` and drop the note there.
- [ ] `git mv` this spec to `docs/done/`.
