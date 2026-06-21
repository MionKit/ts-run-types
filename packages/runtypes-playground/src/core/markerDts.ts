// The marker ambient declaration handed to the resolver on its virtual disk.
// The resolver gates recognition of each factory on an import from a module
// named `ts-runtypes`; this `declare module` satisfies that without a real
// package. Each factory's `InjectTypeFnArgs<T, '<fnKey>'>` / `InjectRunTypeId<T>`
// trailing param is what the scanner reads to compute demand + the function
// hash. Kept minimal: the options params are omitted because the engine places
// the injected tuple itself when invoking the public factory.
export const MARKER_DTS = `
declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __b?: T};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> =
    string & {readonly __b?: T; readonly __f?: [F1, F2, F3]};
  export type CompTimeArgs<T> = T & {readonly __c?: never};
  export type CompTimeFnArgs<T> = T & {readonly __cf?: never};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createGetValidationErrors<T>(val?: T, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: T) => unknown;
  export function createJsonDecoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (v: unknown) => T;
  export function createBinaryEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'tb'>): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'fb'>): (v: Uint8Array) => T;
}
`;

// The root type the user's snippet must define. The editor seeds it; the
// resolver always resolves `<factory><MyType>()`.
export const ROOT_TYPE = 'MyType';
