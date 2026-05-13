// Fake the runtime marker package so atomic fixtures don't need a real
// `@mionjs/ts-run-types` install on the search path.
declare module '@mionjs/ts-run-types' {
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
  export function getRuntypeId<T>(value?: T, id?: RuntypeId<T>): RuntypeId<T>;
}
