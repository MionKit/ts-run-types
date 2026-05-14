// Fake the runtime marker package so fixtures don't need a real
// `@mionjs/ts-go-run-types` install on the search path.
//
// The resolver's scanFile op looks for any signature whose trailing
// parameter is `RuntypeId<T>` *and* whose alias is declared inside the
// configured marker module — both checks must pass for a call to be
// rewritten.
declare module '@mionjs/ts-go-run-types' {
  // Branded-string sentinel — only the phantom `T` matters to the checker.
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};

  // Canonical reflection helper. The transformer rewrites every call
  // site to pass the trailing `id` argument.
  export function getRuntypeId<T>(value?: T, id?: RuntypeId<T>): RuntypeId<T>;
}
