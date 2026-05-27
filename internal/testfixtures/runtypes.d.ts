// Fake the runtime marker package so fixtures don't need a real
// `@mionjs/ts-go-run-types` install on the search path.
//
// The resolver's scanFiles op looks for any signature whose trailing
// parameter is `InjectRuntypeId<T>` *and* whose alias is declared inside the
// configured marker module — both checks must pass for a call to be
// rewritten.
declare module '@mionjs/ts-go-run-types' {
  // Branded-string sentinel — only the phantom `T` matters to the checker.
  export type InjectRuntypeId<T> = string & {readonly __mionInjectRuntypeIdBrand?: T};

  // Static marker — explicit T, no value.
  export function getRuntypeId<T>(id?: InjectRuntypeId<T>): InjectRuntypeId<T>;
  // Reflection marker — T inferred from a runtime value.
  export function reflectRuntypeId<T>(value: T, id?: InjectRuntypeId<T>): InjectRuntypeId<T>;
}
