// The marker ambient declaration handed to the resolver on its virtual disk.
// The resolver gates recognition of each factory on an import from a module
// named `ts-runtypes`; this `declare module` satisfies that without a real
// package. Each factory's `InjectTypeFnArgs<T, '<fnKey>'>` / `InjectRunTypeId<T>`
// trailing param is what the scanner reads to compute demand + the function
// hash. Kept minimal: the options params are omitted because the engine places
// the injected tuple itself when invoking the public factory.
//
// Both call shapes are declared so the playground can run a type EITHER as a TS
// type (`createX<MyType>()`) or as a value-first SCHEMA (`createX(MyType)` where
// `MyType` is built from `ts-runtypes/schema` + `ts-runtypes/formats`). The schema
// builder modules below give tsgo enough to infer the static type from a schema;
// `optional(...)` widens to `T | undefined` (a required key) rather than a `?:`
// key, which is a close-enough approximation for the playground.
export const MARKER_DTS = `
declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __b?: T};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> =
    string & {readonly __b?: T; readonly __f?: [F1, F2, F3]};
  export type CompTimeArgs<T> = T & {readonly __c?: never};
  export type CompTimeFnArgs<T> = T & {readonly __cf?: never};
  export interface RunType<T> { readonly __rt?: T; readonly id: string; }
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  // Schema overloads come FIRST so a value-first \`createX(MyType)\` infers T from
  // RunType<T> rather than matching \`(val?: T)\` with T = RunType<T> (which would
  // validate the schema wrapper instead of the type). The no-arg type form
  // \`createX<MyType>()\` skips the (required) schema overload and uses \`(val?)\`.
  export function createMockType<T>(schema: RunType<T>, options?: unknown, id?: InjectRunTypeId<T>): () => T;
  export function createMockType<T>(val?: T, options?: unknown, id?: InjectRunTypeId<T>): () => T;
  export function createValidate<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createGetValidationErrors<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown) => unknown[];
  export function createGetValidationErrors<T>(val?: T, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: T) => unknown;
  export function createJsonEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: T) => unknown;
  export function createJsonDecoder<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (v: unknown) => T;
  export function createJsonDecoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (v: unknown) => T;
  export function createBinaryEncoder<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'tb'>): (v: T) => Uint8Array;
  export function createBinaryEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'tb'>): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'fb'>): (v: Uint8Array) => T;
  export function createBinaryDecoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'fb'>): (v: Uint8Array) => T;
}
declare module 'ts-runtypes/formats' {
  import type {RunType} from 'ts-runtypes';
  export function string(): RunType<string>;
  export function number(): RunType<number>;
  export function boolean(): RunType<boolean>;
}
declare module 'ts-runtypes/schema' {
  import type {RunType} from 'ts-runtypes';
  type St<R> = R extends RunType<infer T> ? T : never;
  export function string(): RunType<string>;
  export function number(): RunType<number>;
  export function boolean(): RunType<boolean>;
  export function literal<V extends string | number | boolean>(v: V): RunType<V>;
  export function array<R extends RunType<unknown>>(element: R): RunType<St<R>[]>;
  export function union<R extends RunType<unknown>[]>(members: [...R]): RunType<St<R[number]>>;
  export function optional<R extends RunType<unknown>>(element: R): RunType<St<R> | undefined>;
  export function object<C extends Record<string, RunType<unknown>>>(shape: C): RunType<{[K in keyof C]: St<C[K]>}>;
}
`;

// The root type the user's snippet must define: a TS type \`MyType\` in type mode,
// or a schema \`const MyType = ...\` in schema mode. The engine resolves
// \`<factory><MyType>()\` (type) or \`<factory>(MyType)\` (schema).
export const ROOT_TYPE = 'MyType';
