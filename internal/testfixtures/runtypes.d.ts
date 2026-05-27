// Fake the runtime marker package so fixtures don't need a real
// `@mionjs/ts-go-run-types` install on the search path.
//
// The resolver's scanFiles op looks for any signature whose trailing
// parameter is `InjectRunTypeId<T>` *and* whose alias is declared inside the
// configured marker module — both checks must pass for a call to be
// rewritten.
declare module '@mionjs/ts-go-run-types' {
  // Branded-string sentinel — only the phantom `T` matters to the checker.
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};

  // Static marker — explicit T, no value.
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  // Reflection marker — T inferred from a runtime value.
  export function reflectRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;

  // Compile-time-args brand — the Go scanner requires the argument to be
  // fully literal at the call site or via a module-scope const initializer.
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};

  // Pure-function brand — the argument must be a literal arrow/function
  // expression AND must pass the purity rules (no closures, no this, no
  // await/yield, no forbidden globals).
  export type PureFunction<F> = F & {readonly __mionPureFunctionBrand?: never};
}
