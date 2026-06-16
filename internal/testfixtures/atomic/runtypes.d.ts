// Fake the runtime marker package so atomic fixtures don't need a real
// `ts-runtypes` install on the search path.
declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __mionPureFunctionBrand?: never};
}
