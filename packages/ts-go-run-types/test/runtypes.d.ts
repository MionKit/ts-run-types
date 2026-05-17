// Test-only overlay declaration for `@mionjs/ts-go-run-types`.
//
// Mirrors internal/testfixtures/runtypes.d.ts but extended with the new
// `createIsType` API. Referenced via `/// <reference path="…" />` from
// each test file so the Go-side TypeScript checker resolves
// `@mionjs/ts-go-run-types` to this declaration block. That sidesteps
// the package-self-resolution path (Node resolves the package via
// node_modules/@mionjs/ts-go-run-types, which doesn't expose typings
// pre-build), and matches the proven pattern used by the resolver's
// Go test fixtures in internal/testfixtures/.
declare module '@mionjs/ts-go-run-types' {
  // Branded-string sentinel — only the phantom `T` matters to the checker.
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};

  // Static marker — explicit T, no value.
  export function getRuntypeId<T>(id?: RuntypeId<T>): RuntypeId<T>;
  // Reflection marker — T inferred from a runtime value.
  export function reflectRuntypeId<T>(value: T, id?: RuntypeId<T>): RuntypeId<T>;

  // Validator returned by createIsType.
  export type IsTypeFn = (value: unknown) => boolean;
  // Static-form API: vite-plugin-runtypes injects the trailing id at
  // build time. Returns the precompiled validator dispatched via the
  // virtual:runtypes-isType module.
  export function createIsType<T>(id?: RuntypeId<T>): Promise<IsTypeFn>;
}
