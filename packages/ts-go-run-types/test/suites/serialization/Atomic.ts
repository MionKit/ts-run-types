import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const ATOMIC = {
  string: {
    title: 'string',
    unsafeEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<string>(),
    safeDirectEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<string>(),
    unsafeDecoder: () => createJsonDecoder<string>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string>(),
    binaryDecoder: () => createBinaryDecoder<string>(),
    getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
  },
  number: {
    title: 'number',
    unsafeEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<number>(),
    safeDirectEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<number>(),
    unsafeDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
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
    title: 'number values not supported by all protocols',
    description: 'Infinity / NaN do not survive JSON encoding (become null on restore).',
    unsafeEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<number>(),
    safeDirectEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<number>(),
    unsafeDecoder: () => createJsonDecoder<number>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<number>(),
    binaryDecoder: () => createBinaryDecoder<number>(),
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
    unsafeEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<RegExp>(),
    safeDirectEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<RegExp>(),
    unsafeDecoder: () => createJsonDecoder<RegExp>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<RegExp>(),
    binaryDecoder: () => createBinaryDecoder<RegExp>(),
    getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
  },
  bigint: {
    title: 'bigint',
    unsafeEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<bigint>(),
    safeDirectEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<bigint>(),
    unsafeDecoder: () => createJsonDecoder<bigint>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<bigint>(),
    binaryDecoder: () => createBinaryDecoder<bigint>(),
    getTestData: () => ({values: [1n]}),
  },
  boolean: {
    title: 'boolean',
    unsafeEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<boolean>(),
    safeDirectEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<boolean>(),
    unsafeDecoder: () => createJsonDecoder<boolean>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<boolean>(),
    binaryDecoder: () => createBinaryDecoder<boolean>(),
    getTestData: () => ({values: [true]}),
  },
  any: {
    title: 'any',
    unsafeEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<any>(),
    safeDirectEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<any>(),
    unsafeDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<any>(),
    binaryDecoder: () => createBinaryDecoder<any>(),
    roundTripBestEffort: true,
    getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
  },
  not_supported_any: {
    title: 'not supported in JSON stringify when any type is used',
    description:
      'undefined / Date / BigInt are not natively JSON-encodable when the type is `any` (no per-kind transform applies).',
    unsafeEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<any>(),
    safeDirectEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<any>(),
    unsafeDecoder: () => createJsonDecoder<any>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<any>(),
    binaryDecoder: () => createBinaryDecoder<any>(),
    roundTripBestEffort: true,
    getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
  },
  null: {
    title: 'null',
    unsafeEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<null>(),
    safeDirectEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<null>(),
    unsafeDecoder: () => createJsonDecoder<null>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<null>(),
    binaryDecoder: () => createBinaryDecoder<null>(),
    getTestData: () => ({values: [null]}),
  },
  undefined: {
    title: 'undefined',
    unsafeEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<undefined>(),
    safeDirectEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<undefined>(),
    unsafeDecoder: () => createJsonDecoder<undefined>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<undefined>(),
    binaryDecoder: () => createBinaryDecoder<undefined>(),
    getTestData: () => ({values: [undefined]}),
  },
  date: {
    title: 'date',
    unsafeEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<Date>(),
    safeDirectEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Date>(),
    unsafeDecoder: () => createJsonDecoder<Date>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date>(),
    binaryDecoder: () => createBinaryDecoder<Date>(),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },
  enum_color: {
    title: 'enum',
    unsafeEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'mutate'});
    },
    clonePreserveEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'clone'});
    },
    mutateStripEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'stripMutate'});
    },
    safeEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>();
    },
    safeDirectEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoder<Color>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoder<Color>();
    },
    unsafeDecoder: () => {
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
      'symbol at root is unsupported — identity does not survive JSON or binary round-trips, so the factory is rendered as alwaysThrow. See docs/UNSUPPORTED-KINDS.md.',
    unsafeEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<symbol>(),
    safeDirectEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<symbol>(),
    unsafeDecoder: () => createJsonDecoder<symbol>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<symbol>(),
    binaryDecoder: () => createBinaryDecoder<symbol>(),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  object: {
    title: 'object',
    unsafeEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<object>(),
    safeDirectEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<object>(),
    unsafeDecoder: () => createJsonDecoder<object>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<object>(),
    binaryDecoder: () => createBinaryDecoder<object>(),
    roundTripBestEffort: true,
    getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
  },
  void: {
    title: 'void',
    unsafeEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<void>(),
    safeDirectEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<void>(),
    unsafeDecoder: () => createJsonDecoder<void>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<void>(),
    binaryDecoder: () => createBinaryDecoder<void>(),
    getTestData: () => ({values: [undefined]}),
  },
  never: {
    title: 'never',
    description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
    unsafeEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<never>(),
    safeDirectEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<never>(),
    unsafeDecoder: () => createJsonDecoder<never>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<never>(),
    binaryDecoder: () => createBinaryDecoder<never>(),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  literal_string: {
    title: 'string literal',
    unsafeEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<'hello'>(),
    safeDirectEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<'hello'>(),
    unsafeDecoder: () => createJsonDecoder<'hello'>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<'hello'>(),
    binaryDecoder: () => createBinaryDecoder<'hello'>(),
    getTestData: () => ({values: ['hello']}),
  },
  literal_number: {
    title: 'number literal',
    unsafeEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<42>(),
    safeDirectEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<42>(),
    unsafeDecoder: () => createJsonDecoder<42>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<42>(),
    binaryDecoder: () => createBinaryDecoder<42>(),
    getTestData: () => ({values: [42]}),
  },
  literal_boolean: {
    title: 'boolean literal',
    unsafeEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<true>(),
    safeDirectEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<true>(),
    unsafeDecoder: () => createJsonDecoder<true>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<true>(),
    binaryDecoder: () => createBinaryDecoder<true>(),
    getTestData: () => ({values: [true]}),
  },
  literal_regexp: {
    title: 'regexp literal',
    unsafeEncoder: () => {
      const reg = /abc/;
      return createJsonEncoder<typeof reg>(undefined, {strategy: 'mutate'});
    },
    clonePreserveEncoder: () => {
      const reg = /abc/;
      return createJsonEncoder<typeof reg>(undefined, {strategy: 'clone'});
    },
    mutateStripEncoder: () => {
      const reg = /abc/;
      return createJsonEncoder<typeof reg>(undefined, {strategy: 'stripMutate'});
    },
    safeEncoder: () => {
      const reg = /abc/;
      return createJsonEncoder<typeof reg>();
    },
    safeDirectEncoder: () => {
      const reg = /abc/;
      return createJsonEncoder<typeof reg>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      const reg = /abc/;
      return createJsonDecoder<typeof reg>();
    },
    unsafeDecoder: () => {
      const reg = /abc/;
      return createJsonDecoder<typeof reg>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      const reg = /abc/;
      return createBinaryEncoder<typeof reg>();
    },
    binaryDecoder: () => {
      const reg = /abc/;
      return createBinaryDecoder<typeof reg>();
    },
    getTestData: () => ({values: [/abc/]}),
  },
} as const satisfies Record<string, SerializationCase>;
