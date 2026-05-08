// Fake the runtime marker package so atomic fixtures don't need a real
// `@mionkit/runtypes` install on the search path.
declare module "@mionkit/runtypes" {
  export type RuntypeId<T> = string & { readonly __mionRuntypeBrand?: T };
  export function getRuntypeId<T>(value?: T, id?: RuntypeId<T>): RuntypeId<T>;
}
