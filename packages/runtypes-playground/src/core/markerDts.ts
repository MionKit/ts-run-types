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
//
// `ts-runtypes/formats` carries the TYPE-FORMAT catalog (Email, UUIDv4, …): each
// alias is the same two-sentinel brand (`__rtFormatName` + `__rtFormatParams`)
// the resolver lifts into a RunType's FormatAnnotation, so a user-written
// `import type { Email } from 'ts-runtypes/formats'` resolves AND drives
// format-aware validate / mock / codegen. The catalog is built from data below so
// the regex params embed via JSON.stringify (no hand-escaping). Pattern-bearing
// formats (email / url) carry the same {source, flags?, mockSamples} the real
// package registers; named formats (uuid / ip) and number formats carry their
// plain params. Faithful to ts-runtypes/formats so behaviour matches real code.

// A type-format catalog entry. `name` is the format category the Go emitter keys
// on; `params` is embedded as a literal type via JSON so the scanner recovers it.
interface FormatEntry {
  alias: string; // the TS type users import: `Email`
  builder: string; // the value-first builder: `email`
  base: 'string' | 'number';
  name: string; // FormatAnnotation name: `email` / `uuid` / `ip` / `numberFormat`
  params: Record<string, unknown>;
}

// Regex sources + mock samples mirror packages/ts-runtypes/src/formats/string/string-patterns.ts.
const EMAIL_PATTERN = {
  source: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$',
  mockSamples: ['john@example.com', 'jane.doe@mion.io', 'contact@test.org'],
};
const URL_PATTERN = {
  source: '^(?:https?|ftps?|wss?):\\/\\/[^\\s/$.?#-][^\\s]*$',
  flags: 'i',
  mockSamples: ['https://example.com', 'http://mion.io/path', 'ftp://files.example.org'],
};

const FORMATS: FormatEntry[] = [
  {
    alias: 'Email',
    builder: 'email',
    base: 'string',
    name: 'email',
    params: {pattern: EMAIL_PATTERN, maxLength: 254, minLength: 7},
  },
  {alias: 'Url', builder: 'url', base: 'string', name: 'url', params: {pattern: URL_PATTERN, maxLength: 2048}},
  {alias: 'UUIDv4', builder: 'uuidv4', base: 'string', name: 'uuid', params: {version: '4'}},
  {alias: 'UUIDv7', builder: 'uuidv7', base: 'string', name: 'uuid', params: {version: '7'}},
  {alias: 'IPv4', builder: 'ipv4', base: 'string', name: 'ip', params: {version: 4, allowLocalHost: true}},
  {alias: 'IPv6', builder: 'ipv6', base: 'string', name: 'ip', params: {version: 6, allowLocalHost: true}},
  {alias: 'Integer', builder: 'integer', base: 'number', name: 'numberFormat', params: {integer: true}},
  {alias: 'Float', builder: 'float', base: 'number', name: 'numberFormat', params: {float: true}},
  {alias: 'Positive', builder: 'positive', base: 'number', name: 'numberFormat', params: {min: 0}},
  {alias: 'Negative', builder: 'negative', base: 'number', name: 'numberFormat', params: {max: 0}},
  {alias: 'PositiveInt', builder: 'positiveInt', base: 'number', name: 'numberFormat', params: {min: 0, integer: true}},
];

// One brand alias per format: `Base & {__rtFormatName?: name; __rtFormatParams?: params}`.
// The optional sentinels keep the format mutually assignable with its base (so
// `'x@y.io'` flows into an `Email` slot), exactly like the real TypeFormat brand.
function formatTypeAliases(): string {
  return FORMATS.map(
    (f) =>
      `  export type ${f.alias} = ${f.base} & {readonly __rtFormatName?: '${f.name}'; readonly __rtFormatParams?: ${JSON.stringify(f.params)}};`
  ).join('\n');
}

// Value-first builders (schema form: `TF.email()` → `RunType<Email>`).
function formatBuilders(): string {
  return FORMATS.map((f) => `  export function ${f.builder}(): RunType<${f.alias}>;`).join('\n');
}

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
  // Type-format catalog — each alias brands its base so the resolver detects it.
${formatTypeAliases()}
  // Scalar + value-first format builders (schema form: \`import * as TF from 'ts-runtypes/formats'\`).
  export function string(): RunType<string>;
  export function number(): RunType<number>;
  export function boolean(): RunType<boolean>;
${formatBuilders()}
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

// A loose `ts-runtypes/formats` module for the in-editor type checker (Monaco):
// each format alias is just its base type and each builder returns `any`. The
// resolver (MARKER_DTS) carries the real brands that drive format-aware codegen;
// the editor only needs the names to resolve so a user's `import { Email } from
// 'ts-runtypes/formats'` doesn't error. Derived from the same FORMATS catalog so
// the two never drift.
export function formatsEditorModule(): string {
  const aliases = FORMATS.map((f) => `  export type ${f.alias} = ${f.base};`).join('\n');
  const builders = FORMATS.map((f) => `  export function ${f.builder}(): any;`).join('\n');
  return [
    `declare module 'ts-runtypes/formats' {`,
    aliases,
    `  export function string(): any;`,
    `  export function number(): any;`,
    `  export function boolean(): any;`,
    builders,
    `}`,
  ].join('\n');
}

// A loose `ts-runtypes/schema` module for the in-editor type checker, so a user's
// `import * as RT from 'ts-runtypes/schema'` resolves in Monaco. The resolver
// (MARKER_DTS) carries the precise builders that drive resolution; the editor only
// needs the names.
export function schemaEditorModule(): string {
  return [
    `declare module 'ts-runtypes/schema' {`,
    `  export function string(): any;`,
    `  export function number(): any;`,
    `  export function boolean(): any;`,
    `  export function literal(v: any): any;`,
    `  export function array(element: any): any;`,
    `  export function union(members: any[]): any;`,
    `  export function optional(element: any): any;`,
    `  export function object(shape: Record<string, any>): any;`,
    `}`,
  ].join('\n');
}

// The root type the user's snippet must define: a TS type \`MyType\` in type mode,
// or a schema \`const MyType = ...\` in schema mode. The engine resolves
// \`<factory><MyType>()\` (type) or \`<factory>(MyType)\` (schema).
export const ROOT_TYPE = 'MyType';
