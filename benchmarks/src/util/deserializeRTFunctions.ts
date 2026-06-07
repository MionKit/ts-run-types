// Benchmark stub for the package's test-only deserialize twins.
//
// The real `deserializeValidate` / `deserializeGetValidationErrors` live in the
// package's test util and reach into its `src/`. The benchmark only ever calls
// each case's `validate` thunk (never the deserialize thunks), so these inert
// stubs satisfy the suite imports without dragging in package internals. They
// carry no `InjectTypeFnArgs` marker, so the plugin leaves their call sites
// untouched.

export function deserializeValidate<T>(_value?: unknown): (value: unknown) => boolean {
  void _value as T | undefined;
  return () => true;
}

export function deserializeGetValidationErrors<T>(_value?: unknown): (value: unknown) => unknown[] {
  void _value as T | undefined;
  return () => [];
}
