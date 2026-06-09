# TODOS

## 2 - createValidate and other functions are not parsing compiler options, instead they are generating all families at One

> But here's the key clarification about family: createValidate does not resolve a family at compile time today. The 'val' lives only in its runtime body (createRTFunctionWithOptions('createValidate', 'val', …)); the compiler never reads it — it just injects the id and currently over-emits all families for every interned type. So "the same mechanism as createValidate" means demand all families for the id, not "resolve a precise family."

if this is correct we need to ensure the golang backend reads the params and generates only the selected fucntion.

**RESOLVED.** Every `createX<T>()` call site now carries the `InjectTypeFnArgs<T, Fn>` marker (injects a `[typeId, fnId]` tuple); the Go backend renders each function cache demand-driven — only the types its own call sites request, with `val_<member>` seeded across families for union round-trips. A `getRunTypeId<T>()`-only file emits zero function-cache entries. This subsumes the "generalize collectValidateVariants" item below. Full write-up + commit list in **`docs/DEMAND-DRIVEN-FN-CACHES.md`**.

## generalize collectValidateVariants

**DONE.** `collectValidateVariants` no longer exists — variant collection is now the generic `collectFamilyDemand` (works for any family), driven by structured `protocol.Site.Demand`, which carries each cache entry's compile params (the `ValidateOptions` set / JSON strategy) the scanner computes from the operation registry. The "maybe a new marker `CompFunctionOpts<T>`" idea was realized as `CompTimeFnArgs<T>` (the fn-selecting variant of `CompTimeArgs` that brands the compile-params slot). See CLAUDE.md → "Two injection markers + demand-driven function caches" and `docs/SLICE4-HASHED-NAMING.md`.

## make DataOnly more general and reflect actual validation logic, (in fact we could make validate an scenario of this)

DataOnly type in packages/ts-go-run-types/src/runtypes/dataOnly.ts should work exactly as the data that is validated and serialized,
so maybe we can properly fix the type mapping and make sure is the exact same shape that is validated and serialized.

sp maybe

```ts
export type ValidateFn = (value: unknown) => boolean;
```

becomes somethign like

```ts
export type ValidateFn<T> = (value: T) => value is DataOnly<T>;
```

**DONE (two stages).**

- **Stage 1 (typing).** `ValidateFn<T = unknown>` is now `(value: unknown) => value is DataOnly<T>`, and `createValidate<T>()` returns `ValidateFn<T>` (both overloads). `DataOnly` is exported from the package root. The default `unknown` keeps the bare `ValidateFn` alias (`DataOnly<unknown>` ≡ `unknown`) a plain boolean-shaped guard for the cache typedefs. `getValidationErrors` has no narrowing surface, so its signature is unchanged. `DataOnly<T>` itself was rewritten to traverse like `SubstituteSelf` and drop exactly what the emitter drops: functions/methods/constructors → `never`, symbol-typed values + symbol-keyed props + `never`-typed props dropped, primitives / `Date`/native / `Map`/`Set`/`Promise` / arrays / TUPLES (slots + modifiers preserved) recurse, `any`/`unknown` pass through.

- **Stage 2 (verification).** Each validation + format-validation case got `validateDataOnly` / `getValidationErrorsDataOnly` thunks (`createValidate<DataOnly<T>>()`), asserted to produce the SAME sample verdicts as the bare-`T` form by `assertDataOnlyEquivalence` (`test/suites/id-integrity/dataonly.test.ts`). This is a BEHAVIOURAL check, not a cached-factory `.toBe`: the emitter keeps each dropped member as a `notSupported` node, so the structural ids legitimately differ even when the validators agree. ~215/257 cases converge, proving `DataOnly` matches the emitter for the common structural data shapes (objects, unions, plain tuples, arrays, maps, sets, primitives, dropped functions/methods/symbols). The cases that CAN'T converge are flagged `dataOnlyDivergent` with rationale: native-identity leaves (`Temporal.*` + `Temporal.X & {brand}` formats), nominal `class` types, root-level `never`-collapsing kinds (bare function / callable / symbol), and degenerate tuple shapes (trailing rest, self-ref, function slot). These are types the emitter validates by native/nominal identity, which a purely structural `DataOnly` mapping cannot mirror.

- Production `createValidate` / `createGetValidationErrors` still pass the raw `T` (NOT `DataOnly<T>`) — `DataOnly` stays a typing-and-verification device, never on the AOT hot path, per the note above about parsing cost.

## maybe the encode json function with mutate strategy does not need the stripe version

the jsonPropare function with mutate strate might defaul to strip types, we coul ensure the cloned objects are based on the type shape rather than clonning the object

so ensure emited code produces

```ts

const result = {
    a: v.a,
    b: v.b
    c: prepareForJSOn(v.c)
}

```

instead of:

```ts
const result = {...v};
result.c = prepareForJSOn(result.c);
```

**DONE.** A clone built from the declared type shape (`{a: v.a, b: prepareForJson(v.b)}`, never `{...v}`) drops undeclared keys by construction — a clone is **stripped for free**, so a separate "strip" variant of clone is redundant. The shape-derived clone already existed as the `prepareForJsonSafe` emitter (`internal/compiled/typefns/json_prepare_safe.go` → `buildSafeObjectLiteral`); the only `{...v}` spread was the deliberate preserve-extras path.

Acting on this, the JSON-encoder strategy set was collapsed to **`clone` | `mutate` | `direct`** (`JsonEncoderStrategy` in `packages/ts-go-run-types/src/createRTFunctions.ts`):

- `clone` (new default) is shape-derived and **strips** undeclared keys. It now wraps `prepareForJsonSafe` (was `prepareForJsonSafePreserve`).
- `stripClone` was removed — it was just `clone`-that-strips, which is now what `clone` is.
- `stripMutate` was removed — the mutate-with-strip variant (`unknownKeysToUndefined` + `prepareForJson`) is unnecessary; use `clone` to strip, or `mutate` to keep extras.
- `mutate` (in-place, preserves extras) and `direct` (single-pass) are unchanged.

Disk cache format bumped to **v4** (the `clone` composite body changed pjsp→pjs while its fnHash is unchanged, so stale `jeCL` entries must miss).

The internal `prepareForJsonSafePreserve` primitive (pjsp) — the only thing that ever produced extras-preserving clones — was then **fully removed** as dead code: the emitter, the `operations` registry entry, the `CacheModules`/`jsonCompositeTags`/`JsonStrategyFamilies` wiring, the `Walker.PreserveExtras` plumbing (`buildSafeObjectLiteral` no longer takes a `preserveExtras` flag), the PJP* diagnostic codes (Go + both TS catalogs), the protocol cache-source/added fields + dispatch/render wiring, the embedded skeleton + cache module, and the plugin protocol/resolver-client/index mappings.
