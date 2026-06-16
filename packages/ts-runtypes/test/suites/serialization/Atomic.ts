import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import type {SerializationCase} from './types.ts';

export const ATOMIC = {
  string: {
    title: 'string',
    description:
      'Root `string` round-trips identically across JSON and binary; samples cover empty strings and multi-byte UTF-8 (CJK, Arabic, Cyrillic, emoji) to exercise byte-offset handling.',
    serializeNotes: 'Binary encodes UTF-8 with a length prefix, so byte size is variable (no fixed-size assertion).',
    mutateEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string>(),
    preserveDecoder: () => createJsonDecoder<string>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string>(),
    binaryDecoder: () => createBinaryDecoder<string>(),
    schemaEncoder: () => createJsonEncoder(RT.string()),
    schemaDecoder: () => createJsonDecoder(RT.string()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.string()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.string()),
    getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
  },
  number: {
    title: 'number',
    description:
      'Root `number` round-trips across JSON and binary; samples span integers, negatives, fractions, the 2**31 boundary, and the JS safe-integer / min / max extremes.',
    serializeNotes: 'Binary writes every number as float64, so all values encode to a fixed 8 bytes regardless of magnitude.',
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(RT.number()),
    schemaDecoder: () => createJsonDecoder(RT.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.number()),
    getTestData: () => ({
      values: [
        0,
        99,
        -1,
        1.1,
        -1.1,
        1988,
        2045,
        2 ** 31,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.MIN_VALUE,
        Number.MAX_VALUE,
      ],
    }),
  },
  number_not_supported: {
    title: 'number edge cases',
    description: 'Infinity / NaN are not supported by all protocols and do not survive JSON encoding, becoming null on restore.',
    serializeNotes: [
      'JSON.stringify maps Infinity / -Infinity / NaN to null, so the strip / clone / mutate paths restore null.',
      'Binary writes float64, which preserves Infinity / -Infinity / NaN natively, so binary uses a separate test-data override.',
      'Direct path: stringifyJson uses String(v) at root, emitting the literal "Infinity" which JSON.parse rejects — safeAdapterStringifyJsonNotParseable opts into the loose "throw or non-equal" semantic.',
    ],
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(RT.number()),
    schemaDecoder: () => createJsonDecoder(RT.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.number()),
    // Binary writes float64, which preserves Infinity/NaN natively —
    // no conversion to null like JSON.stringify does.
    getBinaryTestData: () => ({
      values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
      deserializedValues: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
    }),
    getTestData: () => ({
      values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
      // After JSON.stringify(Infinity) === 'null', restore yields null.
      deserializedValues: [null, null, null],
    }),
    // Safe-path adapter: stringifyJson at root uses `String(v)` per
    // mion (stringifyJson.ts:97). `String(Infinity) === "Infinity"`
    // which is not valid JSON — JSON.parse throws. The flag opts the
    // safe adapter into mion's loose "throw OR non-equal" semantic
    // for this case.
    safeAdapterStringifyJsonNotParseable: true,
  },
  regexp: {
    title: 'regexp',
    description:
      'Root `RegExp` round-trips across JSON and binary; samples cover various flag combinations (case-insensitive, global, anchored).',
    serializeNotes:
      'RegExp serializes to a `/source/flags` string on the JSON wire and is rebuilt with `new RegExp(...)` on decode; binary stores source and flags as separate strings.',
    mutateEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<RegExp>(),
    preserveDecoder: () => createJsonDecoder<RegExp>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<RegExp>(),
    binaryDecoder: () => createBinaryDecoder<RegExp>(),
    schemaEncoder: () => createJsonEncoder(RT.regexp()),
    schemaDecoder: () => createJsonDecoder(RT.regexp()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.regexp()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.regexp()),
    getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
  },
  bigint: {
    title: 'bigint',
    description:
      'Root `bigint` round-trips across JSON and binary; bigint is not natively JSON-encodable so a transform applies.',
    serializeNotes: [
      'JSON encodes bigint to a decimal string and rebuilds it with `BigInt(...)` on decode.',
      'Plain `bigint` takes the binary string-fallback path (variable length), so no fixed byte size is asserted; only a 64-bit-fitting bigint format brand would encode to a fixed 8 bytes.',
    ],
    mutateEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<bigint>(),
    preserveDecoder: () => createJsonDecoder<bigint>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<bigint>(),
    binaryDecoder: () => createBinaryDecoder<bigint>(),
    schemaEncoder: () => createJsonEncoder(RT.bigint()),
    schemaDecoder: () => createJsonDecoder(RT.bigint()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.bigint()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.bigint()),
    getTestData: () => ({values: [1n]}),
  },
  boolean: {
    title: 'boolean',
    description: 'Root `boolean` round-trips identically across JSON and binary; no transform is needed.',
    mutateEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<boolean>(),
    preserveDecoder: () => createJsonDecoder<boolean>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<boolean>(),
    binaryDecoder: () => createBinaryDecoder<boolean>(),
    schemaEncoder: () => createJsonEncoder(RT.boolean()),
    schemaDecoder: () => createJsonDecoder(RT.boolean()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.boolean()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.boolean()),
    getTestData: () => ({values: [true]}),
  },
  any: {
    title: 'any',
    description:
      'Root `any` is serialized best-effort via raw JSON (no per-kind transform); samples are all JSON-natural values (primitives, null, nested object and array).',
    serializeNotes:
      'With no static type, `any` round-trips whatever JSON.stringify produces — the adapter only asserts a non-undefined string, not deep equality.',
    mutateEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<any>(),
    preserveDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<any>(),
    binaryDecoder: () => createBinaryDecoder<any>(),
    schemaEncoder: () => createJsonEncoder(RT.any()),
    schemaDecoder: () => createJsonDecoder(RT.any()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.any()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.any()),
    roundTripBestEffort: true,
    getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
  },
  not_supported_any: {
    title: 'any edge cases',
    description:
      'undefined / Date / BigInt are not natively JSON-encodable when the type is `any`, since no per-kind transform applies.',
    serializeNotes:
      'Because the static type is `any`, no Date/BigInt transform fires; undefined and bigint do not survive JSON, so the round-trip is best-effort (string-only assertion) rather than deep-equal.',
    mutateEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<any>(),
    preserveDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<any>(),
    binaryDecoder: () => createBinaryDecoder<any>(),
    schemaEncoder: () => createJsonEncoder(RT.any()),
    schemaDecoder: () => createJsonDecoder(RT.any()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.any()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.any()),
    roundTripBestEffort: true,
    getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
  },
  null: {
    title: 'null',
    description: 'Root `null` literal round-trips identically across JSON and binary.',
    mutateEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<null>(),
    preserveDecoder: () => createJsonDecoder<null>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<null>(),
    binaryDecoder: () => createBinaryDecoder<null>(),
    schemaEncoder: () => createJsonEncoder(RT.literal(null)),
    schemaDecoder: () => createJsonDecoder(RT.literal(null)),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.literal(null)),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.literal(null)),
    getTestData: () => ({values: [null]}),
  },
  undefined: {
    title: 'undefined',
    description: 'Root `undefined` literal round-trips across JSON and binary.',
    serializeNotes:
      'JSON has no undefined, so the parsed value may arrive as null or missing; decode force-rebinds it back to undefined. Binary writes a marker byte and reconstructs undefined directly.',
    mutateEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<undefined>(),
    preserveDecoder: () => createJsonDecoder<undefined>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<undefined>(),
    binaryDecoder: () => createBinaryDecoder<undefined>(),
    schemaEncoder: () => createJsonEncoder(RT.literal(undefined)),
    schemaDecoder: () => createJsonDecoder(RT.literal(undefined)),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.literal(undefined)),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.literal(undefined)),
    getTestData: () => ({values: [undefined]}),
  },
  date: {
    title: 'date',
    description: 'Root `Date` round-trips across JSON and binary, returning a real Date instance on decode.',
    serializeNotes:
      'JSON serializes Date to an ISO string and revives it with `new Date(...)`; binary stores the epoch as a fixed 8-byte float64 of `getTime()`.',
    mutateEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date>(),
    preserveDecoder: () => createJsonDecoder<Date>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date>(),
    binaryDecoder: () => createBinaryDecoder<Date>(),
    schemaEncoder: () => createJsonEncoder(RT.date()),
    schemaDecoder: () => createJsonDecoder(RT.date()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.date()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.date()),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },
  enum_color: {
    title: 'enum',
    description:
      'String enum `Color` round-trips across JSON and binary as its underlying string values; samples encode the `red` / `green` members.',
    serializeNotes:
      'Wire form is the plain enum value (a string), so no enum-specific transform is applied; encode and decode treat it as the value-union of its members.',
    // Value-first `RT.enum(...)` carries the enum's value-UNION; the type-first
    // `<Color>` is the named `KindEnum`. Same wire output, but structurally
    // distinct ids by design — so the serializer id-integrity check is skipped.
    idDivergent: true,
    mutateEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoder<Color>();
    },
    preserveDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoder<Color>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createBinaryEncoder<Color>();
    },
    binaryDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createBinaryDecoder<Color>();
    },
    // Value-first enum via the enum-like RECORD form (self-contained per thunk):
    // `RT.enum({...})` carries the value-union, same as the string-literal union.
    schemaEncoder: () => createJsonEncoder(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaDecoder: () => createJsonDecoder(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    getTestData: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return {values: [Color.Red, Color.Green]};
    },
  },
  symbol: {
    title: 'symbol',
    description:
      'symbol at root is unsupported because identity does not survive JSON or binary round-trips, so the factory is rendered as alwaysThrow.',
    mutateEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<symbol>(),
    preserveDecoder: () => createJsonDecoder<symbol>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<symbol>(),
    binaryDecoder: () => createBinaryDecoder<symbol>(),
    // Bare symbol resolves the same alwaysThrow factory via the value-first path,
    // so each schema thunk throws like the type-first form (factoryThrows below).
    schemaEncoder: () => createJsonEncoder(RT.symbol()),
    schemaDecoder: () => createJsonDecoder(RT.symbol()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.symbol()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.symbol()),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  object: {
    title: 'object',
    description:
      'The TS `object` primitive (any non-primitive) is serialized best-effort via raw JSON with no per-kind transform; samples cover a plain object and null.',
    serializeNotes: [
      'With no declared shape the round-trip is best-effort — the adapter only asserts JSON.stringify yields a non-undefined string, not deep equality.',
      'No value-first variant: `RT.object(...)` is the shape composer, a different kind from the TS `object` primitive.',
    ],
    mutateEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<object>(),
    preserveDecoder: () => createJsonDecoder<object>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<object>(),
    binaryDecoder: () => createBinaryDecoder<object>(),
    // No value-first builder for the TS `object` primitive (any non-null
    // non-primitive) — `RT.object(...)` is the shape composer, a different kind.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    roundTripBestEffort: true,
    getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
  },
  void: {
    title: 'void',
    description: 'Root `void` round-trips across JSON and binary with an undefined sample, decoding back to undefined.',
    serializeNotes:
      'JSON has no undefined, so the parsed value may arrive as null or missing and decode force-rebinds it to undefined; binary writes a marker byte and reconstructs undefined.',
    mutateEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<void>(),
    preserveDecoder: () => createJsonDecoder<void>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<void>(),
    binaryDecoder: () => createBinaryDecoder<void>(),
    schemaEncoder: () => createJsonEncoder(RT.void()),
    schemaDecoder: () => createJsonDecoder(RT.void()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.void()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.void()),
    getTestData: () => ({values: [undefined]}),
  },
  never: {
    title: 'never',
    description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
    mutateEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<never>(),
    preserveDecoder: () => createJsonDecoder<never>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<never>(),
    binaryDecoder: () => createBinaryDecoder<never>(),
    // never resolves the same alwaysThrow factory via the value-first path.
    schemaEncoder: () => createJsonEncoder(RT.never()),
    schemaDecoder: () => createJsonDecoder(RT.never()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.never()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.never()),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  literal_string: {
    title: 'string literal',
    description: 'A string-literal type round-trips identically across JSON and binary as a plain string.',
    mutateEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<'hello'>(),
    preserveDecoder: () => createJsonDecoder<'hello'>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<'hello'>(),
    binaryDecoder: () => createBinaryDecoder<'hello'>(),
    schemaEncoder: () => createJsonEncoder(RT.literal('hello')),
    schemaDecoder: () => createJsonDecoder(RT.literal('hello')),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.literal('hello')),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.literal('hello')),
    getTestData: () => ({values: ['hello']}),
  },
  literal_number: {
    title: 'number literal',
    description: 'A number-literal type round-trips identically across JSON and binary as a plain number.',
    mutateEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<42>(),
    preserveDecoder: () => createJsonDecoder<42>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<42>(),
    binaryDecoder: () => createBinaryDecoder<42>(),
    schemaEncoder: () => createJsonEncoder(RT.literal(42)),
    schemaDecoder: () => createJsonDecoder(RT.literal(42)),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.literal(42)),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.literal(42)),
    getTestData: () => ({values: [42]}),
  },
  literal_boolean: {
    title: 'boolean literal',
    description: 'A boolean-literal type round-trips identically across JSON and binary as a plain boolean.',
    mutateEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<true>(),
    preserveDecoder: () => createJsonDecoder<true>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<true>(),
    binaryDecoder: () => createBinaryDecoder<true>(),
    schemaEncoder: () => createJsonEncoder(RT.literal(true)),
    schemaDecoder: () => createJsonDecoder(RT.literal(true)),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.literal(true)),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.literal(true)),
    getTestData: () => ({values: [true]}),
  },
} as const satisfies Record<string, SerializationCase>;
