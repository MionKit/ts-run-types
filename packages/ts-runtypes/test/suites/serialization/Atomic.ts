import * as TF from 'ts-runtypes/formats';
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
    compactEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<string>(),
    preserveDecoder: () => createJsonDecoder<string>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<string>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<string>(),
    binaryDecoder: () => createBinaryDecoder<string>(),
    schemaEncoder: () => createJsonEncoder(TF.string()),
    schemaDecoder: () => createJsonDecoder(TF.string()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.string()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.string()),
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
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
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
    // Locks the "fixed 8 bytes regardless of magnitude" claim: every number
    // encodes as float64, so all 12 samples must be exactly 8 bytes.
    getBinaryByteSizes: () => [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
  },
  // Magnitude-split number cases: the base `number` case above mixes every
  // magnitude into one row, so the page can't show where binary overtakes JSON
  // on the wire. Binary always writes a fixed 8-byte float64; JSON's size is the
  // decimal-string length. These single-value cases isolate each magnitude so the
  // JSON-vs-binary payload crossover is visible per case (small/short = JSON wins,
  // large/high-precision = binary wins).
  number_small: {
    title: 'number (small)',
    description:
      'A small single-digit integer. Its JSON text is far shorter than a binary float64, so JSON is smaller on the wire here.',
    serializeNotes: 'JSON writes "7" as 1 byte; binary writes a fixed 8-byte float64. Small numbers favour JSON on payload.',
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
    getTestData: () => ({values: [7]}),
    getBinaryByteSizes: () => [8],
  },
  number_medium: {
    title: 'number (medium)',
    description: 'A mid-size six-digit integer, near the point where JSON text and a binary float64 cost about the same.',
    serializeNotes:
      'JSON writes "123456" as 6 bytes; binary writes a fixed 8-byte float64. Around six to eight digits the two are about even.',
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
    getTestData: () => ({values: [123456]}),
    getBinaryByteSizes: () => [8],
  },
  number_large: {
    title: 'number (large)',
    description:
      'The largest safe integer (16 digits). Its JSON text needs 16 bytes against a fixed 8-byte binary float64, so binary is smaller on the wire.',
    serializeNotes:
      'JSON writes Number.MAX_SAFE_INTEGER as 16 bytes; binary writes a fixed 8-byte float64. Large numbers favour binary on payload.',
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
    getTestData: () => ({values: [Number.MAX_SAFE_INTEGER]}),
    getBinaryByteSizes: () => [8],
  },
  number_float_short: {
    title: 'number (low-precision float)',
    description:
      'A short decimal with few significant digits. Its JSON text is shorter than a binary float64, so JSON is smaller on the wire.',
    serializeNotes:
      'JSON writes "3.14" as 4 bytes; binary writes a fixed 8-byte float64. Low-precision floats favour JSON on payload.',
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
    getTestData: () => ({values: [3.14]}),
    getBinaryByteSizes: () => [8],
  },
  number_float_precise: {
    title: 'number (high-precision float)',
    description:
      'A full-precision double with 17 significant digits (pi). Its JSON text needs 17 bytes against a fixed 8-byte binary float64, so binary is smaller on the wire.',
    serializeNotes:
      'JSON writes the 17-digit decimal as 17 bytes; binary writes a fixed 8-byte float64. High-precision floats favour binary on payload.',
    mutateEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
    getTestData: () => ({values: [3.141592653589793]}),
    getBinaryByteSizes: () => [8],
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
    compactEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<number>(),
    preserveDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
    schemaEncoder: () => createJsonEncoder(TF.number()),
    schemaDecoder: () => createJsonDecoder(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.number()),
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
    // Safe-path adapter: stringifyJson at root uses `String(v)`
    // (ref: stringifyJson.ts:97). `String(Infinity) === "Infinity"`
    // which is not valid JSON — JSON.parse throws. The flag opts the
    // safe adapter into the loose "throw OR non-equal" semantic
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
    compactEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<RegExp>(),
    preserveDecoder: () => createJsonDecoder<RegExp>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<RegExp>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<bigint>(),
    preserveDecoder: () => createJsonDecoder<bigint>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<bigint>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<bigint>(),
    binaryDecoder: () => createBinaryDecoder<bigint>(),
    schemaEncoder: () => createJsonEncoder(TF.bigInt()),
    schemaDecoder: () => createJsonDecoder(TF.bigInt()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.bigInt()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.bigInt()),
    // Span zero, negative, and a value beyond 64 bits / Number.MAX_SAFE_INTEGER
    // to exercise the decimal-string transform across magnitudes and signs.
    getTestData: () => ({values: [1n, 0n, -1n, -123456789012345678901234567890n, 18446744073709551616n]}),
  },
  boolean: {
    title: 'boolean',
    description: 'Root `boolean` round-trips identically across JSON and binary; no transform is needed.',
    mutateEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<boolean>(),
    preserveDecoder: () => createJsonDecoder<boolean>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<boolean>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<boolean>(),
    binaryDecoder: () => createBinaryDecoder<boolean>(),
    schemaEncoder: () => createJsonEncoder(RT.boolean()),
    schemaDecoder: () => createJsonDecoder(RT.boolean()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.boolean()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.boolean()),
    getTestData: () => ({values: [true, false]}),
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
    compactEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<any>(),
    preserveDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<any>(),
    preserveDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<null>(),
    preserveDecoder: () => createJsonDecoder<null>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<null>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<undefined>(),
    preserveDecoder: () => createJsonDecoder<undefined>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<undefined>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Date>(),
    preserveDecoder: () => createJsonDecoder<Date>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Date>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Date>(),
    binaryDecoder: () => createBinaryDecoder<Date>(),
    schemaEncoder: () => createJsonEncoder(TF.date()),
    schemaDecoder: () => createJsonDecoder(TF.date()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.date()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.date()),
    // Span whole-second, sub-second ms precision, the Unix epoch (getTime 0),
    // and a pre-1970 (negative epoch) date — all must survive the ISO/float64
    // round-trip without precision loss.
    getTestData: () => ({
      values: [
        new Date('2000-08-06T02:13:00.000Z'),
        new Date('2000-08-06T02:13:00.123Z'),
        new Date(0),
        new Date('1969-12-31T23:59:59.500Z'),
      ],
    }),
    // Binary stores every Date as a fixed 8-byte float64 of getTime().
    getBinaryByteSizes: () => [8, 8, 8, 8],
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
    compactEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'compact'});
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
    compactDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoder<Color>(undefined, {strategy: 'compact'});
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
    compactEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<symbol>(),
    preserveDecoder: () => createJsonDecoder<symbol>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<symbol>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<object>(),
    preserveDecoder: () => createJsonDecoder<object>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<object>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<void>(),
    preserveDecoder: () => createJsonDecoder<void>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<void>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<never>(),
    preserveDecoder: () => createJsonDecoder<never>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<never>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<'hello'>(),
    preserveDecoder: () => createJsonDecoder<'hello'>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<'hello'>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<42>(),
    preserveDecoder: () => createJsonDecoder<42>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<42>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<true>(),
    preserveDecoder: () => createJsonDecoder<true>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<true>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<true>(),
    binaryDecoder: () => createBinaryDecoder<true>(),
    schemaEncoder: () => createJsonEncoder(RT.literal(true)),
    schemaDecoder: () => createJsonDecoder(RT.literal(true)),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.literal(true)),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.literal(true)),
    getTestData: () => ({values: [true]}),
  },
} as const satisfies Record<string, SerializationCase>;
