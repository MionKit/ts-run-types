// Monaco in-editor stubs + shared constants for the playground.
//
// The RESOLVER no longer reads a hand-written ambient `declare module` overlay
// (it type-checks against the REAL ts-runtypes sources staged on the virtual
// disk — see runtypesPackageSources.ts, which is faithful by construction and
// can't drift). What remains here is used only by the in-editor Monaco language
// service, which needs loose module stubs so a user's `import * as RT from
// 'ts-runtypes/schema'` / `import type { Email } from 'ts-runtypes/formats'`
// resolves in the editor without red squiggles. The precise types that drive
// codegen come from the real sources fed to the resolver, not from these stubs.

// A type-format catalog entry driving the Monaco format stubs.
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

// A loose `ts-runtypes/formats` module for the in-editor type checker (Monaco):
// each format alias is just its base type and each builder returns `any`. The
// RESOLVER type-checks against the REAL ts-runtypes sources (runtypesPackageSources.ts),
// which carry the precise format brands; the editor only needs the names to
// resolve so a user's `import { Email } from 'ts-runtypes/formats'` doesn't error.
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
    `  export function self(): any;`,
    `  export function circular(body: any): any;`,
    `}`,
  ].join('\n');
}

// The root type the user's snippet must define: a TS type \`MyType\` in type mode,
// or a schema \`const MyType = ...\` in schema mode. The engine resolves
// \`<factory><MyType>()\` (type) or \`<factory>(MyType)\` (schema).
export const ROOT_TYPE = 'MyType';
