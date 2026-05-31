import type {FormatTransformCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createFormatTransform} from '@mionjs/ts-go-run-types';
import type {
  FormatString,
  FormatLowercase,
  FormatUppercase,
  FormatCapitalize,
  FormatUUIDv4,
  FormatEmail,
} from '@mionjs/ts-go-run-types/formats';

export const STRING_FORMAT = {
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
} as const satisfies Record<string, FormatTransformCase>;
