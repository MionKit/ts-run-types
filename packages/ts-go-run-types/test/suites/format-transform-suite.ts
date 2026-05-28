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
} from '@mionjs/ts-go-run-types/formats';

/** One format-transform case: a thunk wrapping `createFormatTransform<T>()`
 *  (plugin-rewritten at the call site) plus input → expected-output
 *  pairs the adapter feeds through it. **/
export interface FormatTransformCase {
  title: string;
  formatTransform: () => FormatTransformFn;
  getCases: () => Array<{input: unknown; expected: unknown}>;
}

export const FORMAT_TRANSFORM_SUITE: {STRING_FORMAT: Record<string, FormatTransformCase>} = {
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
};
