// Fake the runtime marker package so fixtures don't need a real
// `ts-runtypes` install on the search path.
//
// The resolver's scanFiles op looks for any signature whose trailing
// parameter is `InjectRunTypeId<T>` *and* whose alias is declared inside the
// configured marker module — both checks must pass for a call to be
// rewritten.
declare module '@ts-runtypes/core' {
  // Branded-string sentinel — only the phantom `T` matters to the checker.
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};

  // Type-id marker — static (`getRunTypeId<T>()`) or value-first reflection
  // (`getRunTypeId(value)`, T inferred from the value).
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;

  // Compile-time-args brand — the Go scanner requires the argument to be
  // fully literal at the call site or via a module-scope const initializer.
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};

  // Compile-time fn-args brand — like CompTimeArgs, but marks the parameter
  // whose literal value selects the createX function variant.
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};

  // Pure-function brand — the argument must be a literal arrow/function
  // expression AND must pass the purity rules (no closures, no this, no
  // await/yield, no forbidden globals).
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};

  // createX trailing-slot marker — like InjectRunTypeId but names one (or more)
  // function families the site needs for T.
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {
    readonly __rtInjectTypeFnArgsBrand?: T;
    readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3];
  };

  // One public createX factory, enough for the override fixtures to exercise the
  // (family, type) routing both call shapes share.
  export function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;

  // Per-type custom function overrides — the WRITE side of the same routing.
  // One twin per public family; the fn must match the family's compiled signature.
  export function overrideValidate<T>(fn: PureFunction<(v: unknown) => boolean>, id?: InjectTypeFnArgs<T, 'val'>): void;
  export function overrideGetValidationErrors<T>(fn: PureFunction<(value: unknown, path?: unknown[], errors?: unknown[]) => unknown[]>, id?: InjectTypeFnArgs<T, 'verr'>): void;
  export function overrideHasUnknownKeys<T>(fn: PureFunction<(value: unknown) => boolean>, id?: InjectTypeFnArgs<T, 'huk'>): void;
  export function overrideStripUnknownKeys<T>(fn: PureFunction<(value: unknown) => unknown>, id?: InjectTypeFnArgs<T, 'suk'>): void;
  export function overrideUnknownKeyErrors<T>(fn: PureFunction<(value: unknown, path?: unknown[], errors?: unknown[]) => unknown[]>, id?: InjectTypeFnArgs<T, 'uke'>): void;
  export function overrideUnknownKeysToUndefined<T>(fn: PureFunction<(value: unknown) => unknown>, id?: InjectTypeFnArgs<T, 'uku'>): void;
  export function overrideFormatTransform<T>(fn: PureFunction<(value: unknown) => unknown>, id?: InjectTypeFnArgs<T, 'fmt'>): void;
  export function overrideBinaryEncoder<T>(fn: PureFunction<(value: unknown, Ser: any) => any>, id?: InjectTypeFnArgs<T, 'tb'>): void;
  export function overrideBinaryDecoder<T>(fn: PureFunction<(ret: unknown, Des: any) => unknown>, id?: InjectTypeFnArgs<T, 'fb'>): void;
  export function overrideJsonEncoder<T>(fn: PureFunction<(value: unknown) => string | undefined>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): void;
  export function overrideJsonDecoder<T>(fn: PureFunction<(serialized: string) => unknown>, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): void;
}
