// Fake the runtime marker package so atomic fixtures don't need a real
// `@mionjs/ts-go-run-types` install on the search path.
declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __mionPureFunctionBrand?: never};
}
