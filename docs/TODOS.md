# TODOS

## 2 - createIsType and other functions are not parsing compiler options, instead they are generating all families at One

> But here's the key clarification about family: createIsType does not resolve a family at compile time today. The 'it' lives only in its runtime body (createRTFunctionWithOptions('createIsType', 'it', …)); the compiler never reads it — it just injects the id and currently over-emits all families for every interned type. So "the same mechanism as createIsType" means demand all families for the id, not "resolve a precise family."

if this is correct we need to ensure the golang backend reads the params and generates only the selected fucntion.

**RESOLVED.** Every `createX<T>()` call site now carries the `InjectTypeFnArgs<T, Fn>` marker (injects a `[typeId, fnId]` tuple); the Go backend renders each function cache demand-driven — only the types its own call sites request, with `it_<member>` seeded across families for union round-trips. A `getRunTypeId<T>()`-only file emits zero function-cache entries. This subsumes the "generalize collectIsTypeVariants" item below. Full write-up + commit list in **`docs/DEMAND-DRIVEN-FN-CACHES.md`**.

## generalize collectIsTypeVariants

generalize collectIsTypeVariants in internal/compiled/typefns/module.go to be a generic function and collect function compile params
maybe a new marker CompFunctionOpts<T>

## make DataOnly more general and reflect actual validation logic, (in fact we could make validate an scenario of this)

DataOnly type in packages/ts-go-run-types/src/runtypes/types.ts should work exactly as the data that is validated and serialized,
so maybe we can properly fix the type mapping and make sure is the exact same shape that is validated and serialized.

sp maybe

```ts
export type IsTypeFn = (value: unknown) => boolean;
```

becomes somethign like

```ts
export type IsTypeFn<T> = (value: T) => value is DataOnly<T>;
```

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
