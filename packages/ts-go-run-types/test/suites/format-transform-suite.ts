// Format transform suite — the third type-format suite, covering
// `createFormatTransform<T>()`: the value-transform pass (lowercase /
// uppercase / capitalize / trim) the mock walker applies after a base
// value is produced, and the identity behavior for non-transforming
// types. Ported from the `createFormatTransform` block of the old
// `ts-go-type-formats/test/adapters/stringFormats.test.ts`.
//
// Only the `STRING_FORMAT` section exists today. The bare formats
// import registers the runtime machinery (see format-validation-suite).

import {createFormatTransform, type FormatTransformFn} from '@mionjs/ts-go-run-types';
import '@mionjs/ts-go-run-types/formats';
import type {
  FormatString,
  FormatLowercase,
  FormatUppercase,
  FormatCapitalize,
  FormatUUIDv4,
  FormatEmail,
  FormatInteger,
  FormatInt8,
  FormatNumber,
  FormatBigInt64,
  FormatBigInt,
} from '@mionjs/ts-go-run-types/formats';

/** One format-transform case: a thunk wrapping `createFormatTransform<T>()`
 *  (plugin-rewritten at the call site) plus input → expected-output
 *  pairs the adapter feeds through it. **/
export interface FormatTransformCase {
  title: string;
  formatTransform: () => FormatTransformFn;
  getCases: () => Array<{input: unknown; expected: unknown}>;
}

export const FORMAT_TRANSFORM_SUITE: {
  STRING_FORMAT: Record<string, FormatTransformCase>;
  NUMBER_FORMAT: Record<string, FormatTransformCase>;
  BIGINT_FORMAT: Record<string, FormatTransformCase>;
} = {
  STRING_FORMAT: {
    lowercase: {
      title: 'FormatLowercase — lowercases the value',
      formatTransform: () => createFormatTransform<FormatLowercase>(),
      getCases: () => [
        {input: 'ABC', expected: 'abc'},
        {input: 'MixedCase', expected: 'mixedcase'},
      ],
    },
    uppercase: {
      title: 'FormatUppercase — uppercases the value',
      formatTransform: () => createFormatTransform<FormatUppercase>(),
      getCases: () => [{input: 'abc', expected: 'ABC'}],
    },
    capitalize: {
      title: 'FormatCapitalize — capitalizes the first letter',
      formatTransform: () => createFormatTransform<FormatCapitalize>(),
      getCases: () => [{input: 'hello', expected: 'Hello'}],
    },
    trim: {
      title: 'FormatString trim — trims surrounding whitespace',
      formatTransform: () => createFormatTransform<FormatString<{trim: true}>>(),
      getCases: () => [{input: '  padded  ', expected: 'padded'}],
    },
    replace: {
      title: 'FormatString replace — replaces the first match only',
      formatTransform: () => createFormatTransform<FormatString<{replace: {searchValue: 'a'; replaceValue: 'X'}}>>(),
      getCases: () => [
        {input: 'banana', expected: 'bXnana'},
        {input: 'no-match', expected: 'no-mXtch'},
      ],
    },
    replaceAll: {
      title: 'FormatString replaceAll — replaces every match',
      formatTransform: () => createFormatTransform<FormatString<{replaceAll: {searchValue: 'a'; replaceValue: 'X'}}>>(),
      getCases: () => [
        {input: 'banana', expected: 'bXnXnX'},
        {input: 'aaa', expected: 'XXX'},
      ],
    },
    email_lowercase: {
      title: 'FormatEmail — lowercases the value (case-insensitive emails)',
      formatTransform: () => createFormatTransform<FormatEmail>(),
      getCases: () => [
        {input: 'John@Example.COM', expected: 'john@example.com'},
        {input: 'already@lower.io', expected: 'already@lower.io'},
      ],
    },
    identity_plain_string: {
      title: 'plain string — passes through unchanged',
      formatTransform: () => createFormatTransform<string>(),
      getCases: () => [{input: 'ABC', expected: 'ABC'}],
    },
    identity_length_only: {
      title: 'length-only FormatString — no transform',
      formatTransform: () => createFormatTransform<FormatString<{maxLength: 10}>>(),
      getCases: () => [{input: 'ABC', expected: 'ABC'}],
    },
    identity_uuid: {
      title: 'FormatUUIDv4 — no transform, passes through unchanged',
      formatTransform: () => createFormatTransform<FormatUUIDv4>(),
      getCases: () => [{input: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', expected: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}],
    },
    nested_object: {
      title: 'nested object — transforms only the format-branded field',
      formatTransform: () => createFormatTransform<{name: FormatLowercase; age: number; tag: string}>(),
      getCases: () => [{input: {name: 'ALICE', age: 30, tag: 'KEEP'}, expected: {name: 'alice', age: 30, tag: 'KEEP'}}],
    },
    branded_array_elements: {
      title: 'array of FormatLowercase — transforms each element',
      formatTransform: () => createFormatTransform<FormatLowercase[]>(),
      getCases: () => [{input: ['A', 'Bc', 'DEF'], expected: ['a', 'bc', 'def']}],
    },
  },
  // Number formats have no value transform (mion's emitFormat returns
  // undefined) — every case is identity passthrough.
  NUMBER_FORMAT: {
    identity_integer: {
      title: 'FormatInteger — no transform, passes through unchanged',
      formatTransform: () => createFormatTransform<FormatInteger>(),
      getCases: () => [
        {input: 42, expected: 42},
        {input: -7, expected: -7},
      ],
    },
    identity_int8: {
      title: 'FormatInt8 — no transform',
      formatTransform: () => createFormatTransform<FormatInt8>(),
      getCases: () => [{input: 127, expected: 127}],
    },
    identity_ranged: {
      title: 'FormatNumber<{min:0; max:100}> — no transform',
      formatTransform: () => createFormatTransform<FormatNumber<{min: 0; max: 100}>>(),
      getCases: () => [{input: 50, expected: 50}],
    },
    nested_number_field: {
      title: 'nested object — number-branded field passes through unchanged',
      formatTransform: () => createFormatTransform<{count: FormatInt8; label: string}>(),
      getCases: () => [{input: {count: 5, label: 'KEEP'}, expected: {count: 5, label: 'KEEP'}}],
    },
  },
  // BigInt formats have no value transform either — identity passthrough.
  BIGINT_FORMAT: {
    identity_int64: {
      title: 'FormatBigInt64 — no transform, passes through unchanged',
      formatTransform: () => createFormatTransform<FormatBigInt64>(),
      getCases: () => [
        {input: 5n, expected: 5n},
        {input: -9223372036854775808n, expected: -9223372036854775808n},
      ],
    },
    identity_ranged: {
      title: 'FormatBigInt<{min:0n; max:1000n}> — no transform',
      formatTransform: () => createFormatTransform<FormatBigInt<{min: 0n; max: 1000n}>>(),
      getCases: () => [{input: 500n, expected: 500n}],
    },
  },
};
