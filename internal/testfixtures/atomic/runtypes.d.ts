// Fake the runtime marker package so atomic fixtures don't need a real
// `@mionjs/ts-go-run-types` install on the search path.
declare module '@mionjs/ts-go-run-types' {
  export type InjectRuntypeId<T> = string & {readonly __mionInjectRuntypeIdBrand?: T};
  export function getRuntypeId<T>(id?: InjectRuntypeId<T>): InjectRuntypeId<T>;
  export function reflectRuntypeId<T>(value: T, id?: InjectRuntypeId<T>): InjectRuntypeId<T>;
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
}
