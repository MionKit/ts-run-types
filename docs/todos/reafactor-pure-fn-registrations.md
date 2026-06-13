Currently registerPureFnFactory takes two arguments: namespace + fucntionName
this is user friendly, but then internally those are merged, and used inside code as '<namespace>::<fnName>'  
this is seems akwards the we have different systems to set and another one to retrieve, it also hurts greppabilit.
So lets refactor registerPureFnFactory to accept a single identifyer that must contains both so the function will validaet that '::' is in the string and than each par os 2 or more chars
we can use a template literal type type PureFnId = `${string}::${string}`

From

```ts
export function registerPureFnFactory(
  namespace: CompTimeArgs<string>,
  functionID: CompTimeArgs<string>,
  createPureFn: PureFunctionMarker<PureFunctionFactory> | null
): CompiledPureFunction {
```

To

```ts
export function registerPureFnFactory(
  pureFnId: CompTimeArgs<PureFnId>,
  createPureFn: PureFunctionMarker<PureFunctionFactory> | null
): CompiledPureFunction {
```
