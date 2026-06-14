// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {
  createValidate,
  createGetValidationErrors,
  createMockType,
  registerFormatPattern,
  type DataOnly,
} from '@mionjs/ts-go-run-types';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {
  FormatString,
  FormatAlpha,
  FormatAlphaNumeric,
  FormatNumeric,
  FormatLowercase,
  FormatUUIDv4,
  FormatUUIDv7,
  FormatStringDate,
  FormatStringTime,
  FormatStringDateTime,
  FormatIP,
  FormatIPv4,
  FormatIPv6,
  FormatIPv4WithPort,
  FormatIPv6WithPort,
  FormatDomain,
  FormatDomainStrict,
  FormatEmail,
  FormatEmailPunycode,
  FormatEmailStrict,
  FormatUrl,
  FormatUrlHttp,
  FormatUrlFile,
} from '@mionjs/ts-go-run-types/formats';

// Custom patterns registered once at module load — the call sites the
// Go scanner recovers {source, flags, mockSamples} from. Mirrors the
// `registerFormatPattern` block in the old stringFormats.test.ts.
const slug = registerFormatPattern({
  source: '^[a-z0-9-]+$',
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});
type Slug = FormatString<{pattern: typeof slug}>;

const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = FormatString<{pattern: typeof hex}>;

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 4
const V7 = '018f1b8c-2e3d-7b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 7

export const STRING_FORMAT = {
  // ─────────────────────────── FormatString ───────────────────────
  string_maxLength: {
    title: 'FormatString maxLength — bounds the upper length',
    description: 'stringFormat with an inclusive upper-length bound; rejects strings longer than `maxLength`',
    validateNotes: 'Length 5 passes (`hello`); 6 chars (`hello!`) fails with `val` 5 (`maxLength`). A non-string (42) fails the string typeof gate before any format check. Empty string passes.',
    validate: () => createValidate<FormatString<{maxLength: 5}>>(),
    validateReflect: () => {
      const v: FormatString<{maxLength: 5}> = 'hello';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{maxLength: 5}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{maxLength: 5}> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{maxLength: 5}> = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatString<{maxLength: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{maxLength: 5}> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{maxLength: 5}> = 'hello';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{maxLength: 5}>>>(),
    validateSchema: () => createValidate(RT.string({maxLength: 5})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{maxLength: 5}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{maxLength: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({maxLength: 5})),
    mockType: () => createMockType<FormatString<{maxLength: 5}>>(),
    getSamples: () => ({valid: ['', 'hello'], invalid: ['hello!', 42]}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 5}, null],
  },
  string_minLength: {
    title: 'FormatString minLength — bounds the lower length',
    description: 'stringFormat with an inclusive lower-length bound; rejects strings shorter than `minLength`',
    validateNotes: 'Length 3 passes (`abc`); 2 chars (`ab`) and the empty string both fail with `val` 3 (`minLength`).',
    validate: () => createValidate<FormatString<{minLength: 3}>>(),
    validateReflect: () => {
      const v: FormatString<{minLength: 3}> = 'abc';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{minLength: 3}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{minLength: 3}> = 'abc';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{minLength: 3}> = 'abc';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatString<{minLength: 3}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{minLength: 3}> = 'abc';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{minLength: 3}> = 'abc';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{minLength: 3}>>>(),
    validateSchema: () => createValidate(RT.string({minLength: 3})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{minLength: 3}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{minLength: 3}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({minLength: 3})),
    mockType: () => createMockType<FormatString<{minLength: 3}>>(),
    getSamples: () => ({valid: ['abc', 'abcd'], invalid: ['ab', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 3},
    ],
  },
  string_length: {
    title: 'FormatString length — exact length only',
    description: 'stringFormat requiring an exact length; rejects anything not exactly `length` chars',
    validateNotes: 'Only length 4 passes (`abcd`); both 3 chars (`abc`) and 5 chars (`abcde`) fail with `val` 4 (`length`).',
    validate: () => createValidate<FormatString<{length: 4}>>(),
    validateReflect: () => {
      const v: FormatString<{length: 4}> = 'abcd';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{length: 4}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{length: 4}> = 'abcd';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{length: 4}> = 'abcd';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatString<{length: 4}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{length: 4}> = 'abcd';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{length: 4}> = 'abcd';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{length: 4}>>>(),
    validateSchema: () => createValidate(RT.string({length: 4})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{length: 4}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{length: 4}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({length: 4})),
    mockType: () => createMockType<FormatString<{length: 4}>>(),
    getSamples: () => ({valid: ['abcd'], invalid: ['abc', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 4},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_range: {
    title: 'FormatString minLength + maxLength — bounds both ends',
    description: 'stringFormat with both inclusive length bounds; accepts lengths in `[minLength, maxLength]`',
    validateNotes: 'Boundary lengths 2 (`ab`) and 4 (`abcd`) pass (inclusive). 1 char (`a`) fails with `val` 2 (`minLength`); 5 chars (`abcde`) fails with `val` 4 (`maxLength`).',
    validate: () => createValidate<FormatString<{minLength: 2; maxLength: 4}>>(),
    validateReflect: () => {
      const v: FormatString<{minLength: 2; maxLength: 4}> = 'ab';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{minLength: 2; maxLength: 4}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{minLength: 2; maxLength: 4}> = 'ab';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{minLength: 2; maxLength: 4}> = 'ab';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatString<{minLength: 2; maxLength: 4}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{minLength: 2; maxLength: 4}> = 'ab';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{minLength: 2; maxLength: 4}> = 'ab';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{minLength: 2; maxLength: 4}>>>(),
    validateSchema: () => createValidate(RT.string({minLength: 2, maxLength: 4})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{minLength: 2; maxLength: 4}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{minLength: 2; maxLength: 4}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({minLength: 2, maxLength: 4})),
    mockType: () => createMockType<FormatString<{minLength: 2; maxLength: 4}>>(),
    getSamples: () => ({valid: ['ab', 'abcd'], invalid: ['a', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 2},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_allowedChars: {
    title: 'FormatString allowedChars — only the allowed set passes',
    description: 'stringFormat restricting every char to the `allowedChars` set (hex digits); rejects any out-of-set char',
    validateNotes: [
      'Each character must be in `0123456789abcdef`; `deadbeef` and `0042` pass.',
      '`xyz` fails with `val` `Invalid characters`.',
      'The space in `dead beef` is not in the set, so it also fails. The empty string passes (no chars to check).',
    ],
    validate: () => createValidate<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedChars: {val: '0123456789abcdef'}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedChars: {val: '0123456789abcdef'}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
  },
  string_allowedChars_ignoreCase: {
    title: 'FormatString allowedChars ignoreCase — folds case',
    description: 'stringFormat allowedChars with `ignoreCase`; both cases of the `abc` set are accepted',
    validateNotes: 'Case-folded: `ABC` and `aAbBcC` pass even though only lowercase `abc` was listed. `abcd` fails with `val` `Invalid characters` (`d` not in the set).',
    validate: () => createValidate<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_allowedChars_literal: {
    title: 'FormatString allowedChars — regex-special chars treated literally',
    description: 'stringFormat allowedChars where regex-special chars are matched literally; only `.` and `-` pass',
    validateNotes: 'The set `.-` is treated as literal chars (NOT a regex range), so `...---` passes. `a` fails with `val` `Invalid characters`.',
    validate: () => createValidate<FormatString<{allowedChars: {val: '.-'}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedChars: {val: '.-'}}> = '...---';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{allowedChars: {val: '.-'}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedChars: {val: '.-'}}> = '...---';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedChars: {val: '.-'}}> = '...---';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatString<{allowedChars: {val: '.-'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedChars: {val: '.-'}}> = '...---';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedChars: {val: '.-'}}> = '...---';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedChars: {val: '.-'}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedChars: {val: '.-'}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedChars: {val: '.-'}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{allowedChars: {val: '.-'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedChars: {val: '.-'}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: '.-'}}>>(),
    getSamples: () => ({valid: ['...---'], invalid: ['a']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_disallowedChars: {
    title: 'FormatString disallowedChars — rejects any disallowed char',
    description: 'stringFormat blacklisting the `disallowedChars` set (`!@#`); any occurrence rejects the string',
    validateNotes: 'A string passes only if it contains none of `!`, `@`, `#`; `hello` passes. `hi!` and `a@b` each fail with `val` `Invalid characters`.',
    validate: () => createValidate<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    validateReflect: () => {
      const v: FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    validateSchema: () => createValidate(RT.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    mockType: () => createMockType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getSamples: () => ({valid: ['hello'], invalid: ['hi!', 'a@b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid characters'},
      {name: 'stringFormat', val: 'Invalid characters'},
    ],
  },
  string_allowedValues: {
    title: 'FormatString allowedValues — enum-like exact match',
    description: 'stringFormat restricting the whole value to a fixed set (`red`/`green`/`blue`); enum-like exact match',
    validateNotes: [
      'The entire string must equal one listed value; `red` and `blue` pass.',
      '`yellow` (not listed) fails with `val` `Invalid value`.',
      'Match is case-sensitive (`RED` fails) and whole-string (`redgreen` fails — no substring/concat).',
    ],
    validate: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
  },
  string_allowedValues_ignoreCase: {
    title: 'FormatString allowedValues ignoreCase — folds case across the set',
    description: 'stringFormat allowedValues with `ignoreCase`; the fixed set matches regardless of case',
    validateNotes: 'Case-folded equality: `RED` and `Green` pass. `blue` (not in the `red`/`green` set) fails with `val` `Invalid value`.',
    validate: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}],
  },
  string_allowedValues_escaped: {
    title: 'FormatString allowedValues — regex-special chars matched literally',
    description: 'stringFormat allowedValues where regex-special chars in the set are matched literally',
    validateNotes: 'Listed values `a.b` and `c+d` match literally (the `.` and `+` are not regex metacharacters), so they pass. `axb` and `ccd` each fail with `val` `Invalid value`.',
    validate: () => createValidate<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['a.b', 'c+d']}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedValues: {val: ['a.b', 'c+d']}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getSamples: () => ({valid: ['a.b', 'c+d'], invalid: ['axb', 'ccd']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_disallowedValues: {
    title: 'FormatString disallowedValues — rejects the listed values',
    description: 'stringFormat blacklisting whole values (`admin`/`root`); any other string passes',
    validateNotes: 'A string passes unless it exactly equals a blacklisted value; `alice` passes. `admin` and `root` each fail with `val` `Invalid value`.',
    validate: () => createValidate<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    validateReflect: () => {
      const v: FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
    validateSchema: () => createValidate(RT.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    mockType: () => createMockType<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getSamples: () => ({valid: ['alice'], invalid: ['admin', 'root']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_customErrorMessage: {
    title: 'FormatString allowedValues — custom errorMessage surfaces as format.val',
    description: 'stringFormat allowedValues with a custom `errorMessage`; on failure the message surfaces as the format error `val`',
    validateNotes: '`a` and `b` pass. `c` fails with `val` `pick a or b` — the custom `errorMessage` replaces the default `Invalid value`.',
    validate: () => createValidate<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    validateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    deserializeValidateReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
  },

  // ─────────────────────── Default string formats ─────────────────
  alpha: {
    title: 'FormatAlpha — letters only',
    description: 'FormatAlpha (stringFormat with a baked letters-only pattern); rejects digits, spaces, and symbols',
    validateNotes: [
      'Only ASCII letters pass; `Hello` and `abcXYZ` pass.',
      'A digit (`hello1`) or space (`hi there`) fails with `val` `Invalid pattern`.',
      'The empty string passes (the pattern allows zero letters).',
    ],
    validate: () => createValidate<FormatAlpha>(),
    validateReflect: () => {
      const v: FormatAlpha = 'Hello';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatAlpha>(),
    deserializeValidateReflect: () => {
      const v: FormatAlpha = 'Hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatAlpha = 'Hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatAlpha>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatAlpha = 'Hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatAlpha = 'Hello';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatAlpha>>(),
    validateSchema: () => createValidate(RT.alpha()),
    getValidationErrors: () => createGetValidationErrors<FormatAlpha>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatAlpha>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.alpha()),
    mockType: () => createMockType<FormatAlpha>(),
    getSamples: () => ({valid: ['Hello', 'abcXYZ'], invalid: ['hello1', 'hi there', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid pattern'}, null, null],
  },
  alphaNumeric: {
    title: 'FormatAlphaNumeric — letters and digits',
    description: 'FormatAlphaNumeric (stringFormat with a baked letters+digits pattern); rejects everything else',
    validateNotes: 'Letters and digits pass (`abc123`, `ABC`, `123`); a hyphen (`a-b`) or space (`a b`) fails with `val` `Invalid pattern`.',
    validate: () => createValidate<FormatAlphaNumeric>(),
    validateReflect: () => {
      const v: FormatAlphaNumeric = 'abc123';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatAlphaNumeric>(),
    deserializeValidateReflect: () => {
      const v: FormatAlphaNumeric = 'abc123';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatAlphaNumeric = 'abc123';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatAlphaNumeric>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatAlphaNumeric = 'abc123';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatAlphaNumeric = 'abc123';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatAlphaNumeric>>(),
    validateSchema: () => createValidate(RT.alphaNumeric()),
    getValidationErrors: () => createGetValidationErrors<FormatAlphaNumeric>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatAlphaNumeric>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.alphaNumeric()),
    mockType: () => createMockType<FormatAlphaNumeric>(),
    getSamples: () => ({valid: ['abc123', 'ABC', '123'], invalid: ['a-b', 'a b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  numeric: {
    title: 'FormatNumeric — digits only',
    description: 'FormatNumeric (stringFormat with a baked digits-only pattern); rejects non-digit chars',
    validateNotes: 'Only digit chars pass (`12345`, `007` — leading zeros allowed since it is a string). A decimal point (`12.3`) or letter (`12a`) fails with `val` `Invalid pattern`.',
    validate: () => createValidate<FormatNumeric>(),
    validateReflect: () => {
      const v: FormatNumeric = '12345';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumeric>(),
    deserializeValidateReflect: () => {
      const v: FormatNumeric = '12345';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumeric = '12345';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatNumeric>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumeric = '12345';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumeric = '12345';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumeric>>(),
    validateSchema: () => createValidate(RT.numeric()),
    getValidationErrors: () => createGetValidationErrors<FormatNumeric>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatNumeric>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.numeric()),
    mockType: () => createMockType<FormatNumeric>(),
    getSamples: () => ({valid: ['12345', '007'], invalid: ['12.3', '12a']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  alpha_withLength: {
    title: 'FormatAlpha with maxLength — char class plus length bound',
    description: 'FormatAlpha carrying a `maxLength` param; enforces letters-only AND an inclusive upper-length bound',
    validateNotes: '`abc` (3 letters) passes. `abcd` exceeds the bound and fails with `val` 3 (`maxLength`); `a1` is within length but the digit fails the pattern with `val` `Invalid pattern`.',
    validate: () => createValidate<FormatAlpha<{maxLength: 3}>>(),
    validateReflect: () => {
      const v: FormatAlpha<{maxLength: 3}> = 'abc';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatAlpha<{maxLength: 3}>>(),
    deserializeValidateReflect: () => {
      const v: FormatAlpha<{maxLength: 3}> = 'abc';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatAlpha<{maxLength: 3}> = 'abc';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatAlpha<{maxLength: 3}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatAlpha<{maxLength: 3}> = 'abc';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatAlpha<{maxLength: 3}> = 'abc';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatAlpha<{maxLength: 3}>>>(),
    validateSchema: () => createValidate(RT.alpha({maxLength: 3})),
    getValidationErrors: () => createGetValidationErrors<FormatAlpha<{maxLength: 3}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatAlpha<{maxLength: 3}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.alpha({maxLength: 3})),
    mockType: () => createMockType<FormatAlpha<{maxLength: 3}>>(),
    getSamples: () => ({valid: ['abc'], invalid: ['abcd', 'a1']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  lowercase_validate: {
    title: 'FormatLowercase — transformer-only, validates as a plain string',
    description: 'FormatLowercase (transformer-only `lowercase` flag); validate treats it as a plain string',
    validateNotes: 'The lowercase transform applies only via createFormatTransform, NOT validate — so ANY string passes regardless of case (`already lower` AND `HasUpper` pass). Only a non-string (42) fails, via the typeof gate.',
    validate: () => createValidate<FormatLowercase>(),
    validateReflect: () => {
      const v: FormatLowercase = 'already lower';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatLowercase>(),
    deserializeValidateReflect: () => {
      const v: FormatLowercase = 'already lower';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatLowercase = 'already lower';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatLowercase>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatLowercase = 'already lower';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatLowercase = 'already lower';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatLowercase>>(),
    validateSchema: () => createValidate(RT.lowercase()),
    getValidationErrors: () => createGetValidationErrors<FormatLowercase>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatLowercase>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.lowercase()),
    mockType: () => createMockType<FormatLowercase>(),
    getSamples: () => ({valid: ['already lower', 'HasUpper'], invalid: [42]}),
    expectedFormatErrors: () => [null],
  },

  // ─────────────────────────────── UUID ───────────────────────────
  uuidv4: {
    title: 'FormatUUIDv4 — accepts v4, rejects v7 and malformed',
    description: 'FormatUUIDv4 (format `uuid`, version `4`); accepts only version-4 UUIDs',
    validateNotes: [
      'Only a well-formed v4 UUID passes; the version nibble must be `4`.',
      'A v7 UUID fails with `val` `4`; a non-UUID string (`not-a-uuid`) also fails with `val` `4`.',
      'The empty string, a hyphen-stripped UUID, and a non-string (123) are all rejected.',
    ],
    validate: () => createValidate<FormatUUIDv4>(),
    validateReflect: () => {
      const v: FormatUUIDv4 = V4;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatUUIDv4>(),
    deserializeValidateReflect: () => {
      const v: FormatUUIDv4 = V4;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatUUIDv4 = V4;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatUUIDv4>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatUUIDv4 = V4;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatUUIDv4 = V4;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatUUIDv4>>(),
    validateSchema: () => createValidate(RT.uuidv4()),
    getValidationErrors: () => createGetValidationErrors<FormatUUIDv4>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatUUIDv4>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.uuidv4()),
    mockType: () => createMockType<FormatUUIDv4>(),
    getSamples: () => ({valid: [V4], invalid: [V7, 'not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '4'}, {name: 'uuid', val: '4'}, null, null, null],
  },
  uuidv7: {
    title: 'FormatUUIDv7 — accepts v7, rejects v4',
    description: 'FormatUUIDv7 (format `uuid`, version `7`); accepts only version-7 UUIDs',
    validateNotes: 'The version nibble must be `7`; a valid v4 UUID fails with `val` `7`.',
    validate: () => createValidate<FormatUUIDv7>(),
    validateReflect: () => {
      const v: FormatUUIDv7 = V7;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatUUIDv7>(),
    deserializeValidateReflect: () => {
      const v: FormatUUIDv7 = V7;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatUUIDv7 = V7;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatUUIDv7>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatUUIDv7 = V7;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatUUIDv7 = V7;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatUUIDv7>>(),
    validateSchema: () => createValidate(RT.uuidv7()),
    getValidationErrors: () => createGetValidationErrors<FormatUUIDv7>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatUUIDv7>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.uuidv7()),
    mockType: () => createMockType<FormatUUIDv7>(),
    getSamples: () => ({valid: [V7], invalid: [V4]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '7'}],
  },

  // ─────────────────────────────── Date ───────────────────────────
  date_iso: {
    title: 'FormatStringDate — ISO / YYYY-MM-DD (default)',
    description: 'FormatStringDate (format `date`) with the default ISO `YYYY-MM-DD` layout; enforces calendar validity',
    validateNotes: [
      'Default layout is ISO `YYYY-MM-DD`; the format error `val` is `ISO`.',
      'Calendar validity is enforced: `2023-02-29` (not a leap year), `2024-13-01` (month 13), and `2024-04-31` (April has 30 days) all fail.',
      'Width is exact — `2024-1-1` (single-digit month/day) fails; `not-a-date` fails. `0001-01-01` is accepted.',
    ],
    validate: () => createValidate<FormatStringDate>(),
    validateReflect: () => {
      const v: FormatStringDate = '2024-02-29';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringDate>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDate = '2024-02-29';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDate = '2024-02-29';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringDate>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDate = '2024-02-29';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDate = '2024-02-29';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringDate>>(),
    validateSchema: () => createValidate(RT.stringDate()),
    getValidationErrors: () => createGetValidationErrors<FormatStringDate>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringDate>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringDate()),
    mockType: () => createMockType<FormatStringDate>(),
    getSamples: () => ({
      valid: ['2024-02-29', '2026-05-28', '0001-01-01'],
      invalid: ['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-1', 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'date', val: 'ISO'}, null, null, null, null],
  },
  date_DMY: {
    title: 'FormatStringDate — DD-MM-YYYY layout',
    description: 'FormatStringDate with the `DD-MM-YYYY` layout; day-first ordering plus calendar validity',
    validateNotes: 'Layout is `DD-MM-YYYY` (format error `val` `DD-MM-YYYY`); `29-02-2024` passes. An ISO-ordered string (`2024-02-29`) fails the layout, and `31-04-2024` fails calendar validity (April has 30 days).',
    validate: () => createValidate<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    validateReflect: () => {
      const v: FormatStringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringDate<{format: 'DD-MM-YYYY'}>>>(),
    validateSchema: () => createValidate(RT.stringDate({format: 'DD-MM-YYYY'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringDate<{format: 'DD-MM-YYYY'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringDate({format: 'DD-MM-YYYY'})),
    mockType: () => createMockType<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    getSamples: () => ({valid: ['29-02-2024'], invalid: ['2024-02-29', '31-04-2024']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'DD-MM-YYYY'},
      {name: 'date', val: 'DD-MM-YYYY'},
    ],
  },
  date_YM: {
    title: 'FormatStringDate — YYYY-MM layout (no day)',
    description: 'FormatStringDate with the `YYYY-MM` layout (year-month, no day component)',
    validateNotes: 'Layout is `YYYY-MM` (format error `val` `YYYY-MM`); `2024-02` passes. Month 13 (`2024-13`) fails, and supplying a day (`2024-02-29`) fails the layout.',
    validate: () => createValidate<FormatStringDate<{format: 'YYYY-MM'}>>(),
    validateReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringDate<{format: 'YYYY-MM'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM'}> = '2024-02';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringDate<{format: 'YYYY-MM'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM'}> = '2024-02';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringDate<{format: 'YYYY-MM'}>>>(),
    validateSchema: () => createValidate(RT.stringDate({format: 'YYYY-MM'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringDate<{format: 'YYYY-MM'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringDate({format: 'YYYY-MM'})),
    mockType: () => createMockType<FormatStringDate<{format: 'YYYY-MM'}>>(),
    getSamples: () => ({valid: ['2024-02'], invalid: ['2024-13', '2024-02-29']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'YYYY-MM'},
      {name: 'date', val: 'YYYY-MM'},
    ],
  },
  date_MD: {
    title: 'FormatStringDate — MM-DD layout (no year)',
    description: 'FormatStringDate with the `MM-DD` layout (month-day, no year component)',
    validateNotes: 'Layout is `MM-DD` (format error `val` `MM-DD`); `02-29` passes. Month 13 (`13-01`) fails.',
    validate: () => createValidate<FormatStringDate<{format: 'MM-DD'}>>(),
    validateReflect: () => {
      const v: FormatStringDate<{format: 'MM-DD'}> = '02-29';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringDate<{format: 'MM-DD'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDate<{format: 'MM-DD'}> = '02-29';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'MM-DD'}> = '02-29';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringDate<{format: 'MM-DD'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'MM-DD'}> = '02-29';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDate<{format: 'MM-DD'}> = '02-29';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringDate<{format: 'MM-DD'}>>>(),
    validateSchema: () => createValidate(RT.stringDate({format: 'MM-DD'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringDate<{format: 'MM-DD'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringDate<{format: 'MM-DD'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringDate({format: 'MM-DD'})),
    mockType: () => createMockType<FormatStringDate<{format: 'MM-DD'}>>(),
    getSamples: () => ({valid: ['02-29'], invalid: ['13-01']}),
    expectedFormatErrors: () => [{name: 'date', val: 'MM-DD'}],
  },
  date_minMax_absolute: {
    title: 'FormatStringDate — absolute min/max bounds (inclusive)',
    description: 'FormatStringDate with inclusive absolute `min`/`max` date bounds; accepts dates within [`min`, `max`]',
    validateNotes: 'Bounds `2020-01-01`..`2020-12-31` are inclusive — both endpoints pass. `2019-12-31` fails on `min` (formatPathTail `min`); `2021-01-01` fails on `max` (formatPathTail `max`).',
    validate: () => createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    // mockType must respect the bounds — assertMockType re-validates every
    // generated value through validate, so an out-of-range mock would fail.
    mockType: () => createMockType<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: ['2020-01-01', '2020-06-15', '2020-12-31'],
      invalid: ['2019-12-31', '2021-01-01'],
    }),
    expectedFormatErrors: () => [
      {name: 'date', formatPathTail: 'min'},
      {name: 'date', formatPathTail: 'max'},
    ],
  },

  // ─────────────────────────────── Time ───────────────────────────
  time_iso: {
    title: 'FormatStringTime — ISO (default, tz-aware)',
    description: 'FormatStringTime (format `time`) with the default ISO layout; requires a timezone and valid time fields',
    validateNotes: [
      'Default ISO layout (format error `val` `ISO`) requires a tz suffix; `12:30:45Z`, `12:30:45.123Z` (ms), and offset forms like `+05:30` / `-08:00` pass.',
      'A tz-less time (`12:30:45`) fails. Field ranges are enforced: hour 24 (`24:00:00Z`) and minute 60 (`12:60:00Z`) both fail.',
    ],
    validate: () => createValidate<FormatStringTime>(),
    validateReflect: () => {
      const v: FormatStringTime = '12:30:45Z';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringTime>(),
    deserializeValidateReflect: () => {
      const v: FormatStringTime = '12:30:45Z';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringTime = '12:30:45Z';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringTime>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringTime = '12:30:45Z';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringTime = '12:30:45Z';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringTime>>(),
    validateSchema: () => createValidate(RT.stringTime()),
    getValidationErrors: () => createGetValidationErrors<FormatStringTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringTime()),
    mockType: () => createMockType<FormatStringTime>(),
    getSamples: () => ({
      valid: ['12:30:45Z', '12:30:45.123Z', '12:30:45+05:30', '00:00:00-08:00'],
      invalid: ['12:30:45', '24:00:00Z', '12:60:00Z'],
    }),
    expectedFormatErrors: () => [
      {name: 'time', val: 'ISO'},
      {name: 'time', val: 'ISO'},
      {name: 'time', val: 'ISO'},
    ],
  },
  time_HHmmss: {
    title: 'FormatStringTime — HH:mm:ss fixed layout',
    description: 'FormatStringTime with the fixed `HH:mm:ss` layout (no tz, no milliseconds)',
    validateNotes: '`23:59:59` passes. Out-of-range fields (`99:99:99`) fail with `val` `HH:mm:ss`; a missing seconds component (`23:59`) and hour 24 (`24:00:00`) are also rejected.',
    validate: () => createValidate<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    validateReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringTime<{format: 'HH:mm:ss'}>>>(),
    validateSchema: () => createValidate(RT.stringTime({format: 'HH:mm:ss'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringTime<{format: 'HH:mm:ss'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringTime({format: 'HH:mm:ss'})),
    mockType: () => createMockType<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    getSamples: () => ({valid: ['23:59:59'], invalid: ['99:99:99', '23:59', '24:00:00']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss'}, null, null],
  },
  time_HHmmss_ms: {
    title: 'FormatStringTime — HH:mm:ss[.mmm] optional milliseconds',
    description: 'FormatStringTime with the `HH:mm:ss[.mmm]` layout; milliseconds optional and capped at 3 digits',
    validateNotes: 'Milliseconds are optional — both `12:30:45` and `12:30:45.999` pass. A 4-digit fraction (`12:30:45.9999`) exceeds the `.mmm` width and fails with `val` `HH:mm:ss[.mmm]`.',
    validate: () => createValidate<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    validateReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    validateSchema: () => createValidate(RT.stringTime({format: 'HH:mm:ss[.mmm]'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringTime({format: 'HH:mm:ss[.mmm]'})),
    mockType: () => createMockType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getSamples: () => ({valid: ['12:30:45', '12:30:45.999'], invalid: ['12:30:45.9999']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss[.mmm]'}],
  },
  time_minMax_absolute: {
    title: 'FormatStringTime — absolute min/max bounds (business hours)',
    description: 'FormatStringTime with inclusive absolute `min`/`max` time bounds (HH:mm); accepts times within [`min`, `max`]',
    validateNotes: 'Bounds `09:00`..`17:00` are inclusive — both endpoints pass. `08:59` fails on `min` (formatPathTail `min`); `17:01` fails on `max` (formatPathTail `max`).',
    validate: () => createValidate<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    validateReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    validateSchema: () => createValidate(RT.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    mockType: () => createMockType<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getSamples: () => ({
      valid: ['09:00', '12:30', '17:00'],
      invalid: ['08:59', '17:01'],
    }),
    expectedFormatErrors: () => [
      {name: 'time', formatPathTail: 'min'},
      {name: 'time', formatPathTail: 'max'},
    ],
  },

  // ───────────────────────────── DateTime ─────────────────────────
  dateTime_default: {
    title: 'FormatStringDateTime — default (ISO date T ISO time)',
    description: 'FormatStringDateTime (format `dateTime`) with the default ISO layout: ISO date, `T` split char, ISO tz-aware time',
    validateNotes: [
      'Both halves must be individually valid and joined by `T`; `2024-02-29T12:30:45Z` passes.',
      'A space separator (`2024-02-29 12:30:45Z`) fails on the split char (formatPathTail `splitChar`).',
      'A non-leap date (`2023-02-29`), an out-of-range hour (`25:30:45`), and `not-a-datetime` are all rejected.',
    ],
    validate: () => createValidate<FormatStringDateTime>(),
    validateReflect: () => {
      const v: FormatStringDateTime = '2024-02-29T12:30:45Z';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatStringDateTime>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDateTime = '2024-02-29T12:30:45Z';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDateTime = '2024-02-29T12:30:45Z';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatStringDateTime>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDateTime = '2024-02-29T12:30:45Z';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDateTime = '2024-02-29T12:30:45Z';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatStringDateTime>>(),
    validateSchema: () => createValidate(RT.stringDateTime()),
    getValidationErrors: () => createGetValidationErrors<FormatStringDateTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringDateTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringDateTime()),
    mockType: () => createMockType<FormatStringDateTime>(),
    getSamples: () => ({
      valid: ['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00'],
      invalid: ['2024-02-29 12:30:45Z', '2023-02-29T12:30:45Z', '2024-02-29T25:30:45Z', 'not-a-datetime'],
    }),
    expectedFormatErrors: () => [{name: 'dateTime', formatPathTail: 'splitChar'}, null, null, null],
  },
  dateTime_custom: {
    title: 'FormatStringDateTime — custom nested layouts + splitChar',
    description: 'FormatStringDateTime with custom nested `date`/`time` layouts and a space `splitChar`; each part validated independently',
    validateNotes: [
      'Layout is `DD-MM-YYYY` date + `HH:mm` time joined by a space; `29-02-2024 23:59` passes.',
      'An ISO-ordered date (`2024-02-29 23:59`) fails on the date half (formatPathTail `date`).',
      'A `T` separator (`29-02-2024T23:59`) fails the split char (formatPathTail `splitChar`); hour 24 (`29-02-2024 24:00`) fails the time half (formatPathTail `time`).',
    ],
    validate: () =>
      createValidate<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    validateReflect: () => {
      const v: FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    deserializeValidateReflect: () => {
      const v: FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>>(),
    validateSchema: () =>
      createValidate(RT.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    mockType: () =>
      createMockType<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    getSamples: () => ({
      valid: ['29-02-2024 23:59'],
      invalid: ['2024-02-29 23:59', '29-02-2024T23:59', '29-02-2024 24:00'],
    }),
    expectedFormatErrors: () => [
      {name: 'dateTime', formatPathTail: 'date'},
      {name: 'dateTime', formatPathTail: 'splitChar'},
      {name: 'dateTime', formatPathTail: 'time'},
    ],
  },
  dateTime_minMax_absolute: {
    title: 'FormatStringDateTime — absolute min/max bounds',
    description: 'FormatStringDateTime with inclusive absolute `min`/`max` datetime bounds; accepts values within [`min`, `max`]',
    validateNotes: 'Bounds `2020-01-01T00:00:00`..`2020-12-31T23:59:59` are inclusive — both endpoints pass. `2019-12-31T23:59:59` fails on `min` (formatPathTail `min`); `2021-01-01T00:00:00` fails on `max` (formatPathTail `max`).',
    validate: () =>
      createValidate<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    validateReflect: () => {
      const v: FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    deserializeValidateReflect: () => {
      const v: FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '2020-01-01T00:00:00';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '2020-01-01T00:00:00';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<
        DataOnly<
          FormatStringDateTime<{
            date: {format: 'YYYY-MM-DD'};
            time: {format: 'HH:mm:ss'};
            splitChar: 'T';
            min: '2020-01-01T00:00:00';
            max: '2020-12-31T23:59:59';
          }>
        >
      >(),
    validateSchema: () =>
      createValidate(
        RT.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    getValidationErrors: () =>
      createGetValidationErrors<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<
          FormatStringDateTime<{
            date: {format: 'YYYY-MM-DD'};
            time: {format: 'HH:mm:ss'};
            splitChar: 'T';
            min: '2020-01-01T00:00:00';
            max: '2020-12-31T23:59:59';
          }>
        >
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    mockType: () =>
      createMockType<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    getSamples: () => ({
      valid: ['2020-01-01T00:00:00', '2020-06-15T12:00:00'],
      invalid: ['2019-12-31T23:59:59', '2021-01-01T00:00:00'],
    }),
    expectedFormatErrors: () => [
      {name: 'dateTime', formatPathTail: 'min'},
      {name: 'dateTime', formatPathTail: 'max'},
    ],
  },

  // ──────────────────────────────── IP ────────────────────────────
  ipv4: {
    title: 'FormatIPv4 — dotted-quad addresses',
    description: 'FormatIPv4 (format `ip`, version 4); accepts dotted-quad IPv4 addresses only',
    validateNotes: [
      'Each octet must be 0–255; `192.168.0.1`, `0.0.0.0`, and `255.255.255.255` pass.',
      'Out-of-range octets (`999.999.999.999`, `256.0.0.1`), a 3-octet address (`1.2.3`), and an IPv6 address (`::1`) all fail; the first failure carries `val` 4.',
    ],
    validate: () => createValidate<FormatIPv4>(),
    validateReflect: () => {
      const v: FormatIPv4 = '192.168.0.1';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatIPv4>(),
    deserializeValidateReflect: () => {
      const v: FormatIPv4 = '192.168.0.1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatIPv4 = '192.168.0.1';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatIPv4>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatIPv4 = '192.168.0.1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatIPv4 = '192.168.0.1';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatIPv4>>(),
    validateSchema: () => createValidate(RT.ipv4()),
    getValidationErrors: () => createGetValidationErrors<FormatIPv4>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatIPv4>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.ipv4()),
    mockType: () => createMockType<FormatIPv4>(),
    getSamples: () => ({
      valid: ['192.168.0.1', '0.0.0.0', '255.255.255.255'],
      invalid: ['999.999.999.999', '256.0.0.1', '1.2.3', '::1'],
    }),
    expectedFormatErrors: () => [{name: 'ip', val: 4}, null, null, null],
  },
  ipv6: {
    title: 'FormatIPv6 — colon-separated, loopback allowed',
    description: 'FormatIPv6 (format `ip`, version 6); accepts colon-separated IPv6 addresses (including `::` compression)',
    validateNotes: 'Full, compressed (`::1`), and link-local (`fe80::1`) forms pass. An IPv4 address (`192.168.0.1`) and a group exceeding 4 hex digits (`12345::1`) each fail with `val` 6.',
    validate: () => createValidate<FormatIPv6>(),
    validateReflect: () => {
      const v: FormatIPv6 = '2001:db8:0:0:0:0:0:1';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatIPv6>(),
    deserializeValidateReflect: () => {
      const v: FormatIPv6 = '2001:db8:0:0:0:0:0:1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatIPv6 = '2001:db8:0:0:0:0:0:1';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatIPv6>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatIPv6 = '2001:db8:0:0:0:0:0:1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatIPv6 = '2001:db8:0:0:0:0:0:1';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatIPv6>>(),
    validateSchema: () => createValidate(RT.ipv6()),
    getValidationErrors: () => createGetValidationErrors<FormatIPv6>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatIPv6>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.ipv6()),
    mockType: () => createMockType<FormatIPv6>(),
    getSamples: () => ({valid: ['2001:db8:0:0:0:0:0:1', '::1', 'fe80::1'], invalid: ['192.168.0.1', '12345::1']}),
    expectedFormatErrors: () => [
      {name: 'ip', val: 6},
      {name: 'ip', val: 6},
    ],
  },
  ip_any: {
    title: 'FormatIP — accepts both v4 and v6',
    description: 'FormatIP (format `ip`, version `any`); accepts either an IPv4 or an IPv6 address',
    validateNotes: 'Both `10.0.0.1` (v4) and `2001:db8::1` (v6) pass. A non-IP string (`definitely not an ip`) fails with `val` `any`.',
    validate: () => createValidate<FormatIP>(),
    validateReflect: () => {
      const v: FormatIP = '10.0.0.1';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatIP>(),
    deserializeValidateReflect: () => {
      const v: FormatIP = '10.0.0.1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatIP = '10.0.0.1';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatIP>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatIP = '10.0.0.1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatIP = '10.0.0.1';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatIP>>(),
    validateSchema: () => createValidate(RT.ip()),
    getValidationErrors: () => createGetValidationErrors<FormatIP>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatIP>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.ip()),
    mockType: () => createMockType<FormatIP>(),
    getSamples: () => ({valid: ['10.0.0.1', '2001:db8::1'], invalid: ['definitely not an ip']}),
    expectedFormatErrors: () => [{name: 'ip', val: 'any'}],
  },
  ipv4_port: {
    title: 'FormatIPv4WithPort — v4 with port',
    description: 'FormatIPv4WithPort (format `ip`, version 4, port allowed); accepts `ipv4:port`',
    validateNotes: 'The port must be in range; `192.168.0.1:8080` passes, while `192.168.0.1:70000` (port > 65535) fails with `val` 4.',
    validate: () => createValidate<FormatIPv4WithPort>(),
    validateReflect: () => {
      const v: FormatIPv4WithPort = '192.168.0.1:8080';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatIPv4WithPort>(),
    deserializeValidateReflect: () => {
      const v: FormatIPv4WithPort = '192.168.0.1:8080';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatIPv4WithPort = '192.168.0.1:8080';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatIPv4WithPort>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatIPv4WithPort = '192.168.0.1:8080';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatIPv4WithPort = '192.168.0.1:8080';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatIPv4WithPort>>(),
    validateSchema: () => createValidate(RT.ipv4WithPort()),
    getValidationErrors: () => createGetValidationErrors<FormatIPv4WithPort>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatIPv4WithPort>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.ipv4WithPort()),
    mockType: () => createMockType<FormatIPv4WithPort>(),
    getSamples: () => ({valid: ['192.168.0.1:8080'], invalid: ['192.168.0.1:70000']}),
    expectedFormatErrors: () => [{name: 'ip', val: 4}],
  },
  ipv6_port: {
    title: 'FormatIPv6WithPort — v6 with bracketed port',
    description: 'FormatIPv6WithPort (format `ip`, version 6, port allowed); accepts bracketed `[ipv6]:port`',
    validateNotes: 'The port must be in range; `[2001:db8::1]:443` passes, while `[2001:db8::1]:99999` (port > 65535) fails with `val` 6.',
    validate: () => createValidate<FormatIPv6WithPort>(),
    validateReflect: () => {
      const v: FormatIPv6WithPort = '[2001:db8::1]:443';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatIPv6WithPort>(),
    deserializeValidateReflect: () => {
      const v: FormatIPv6WithPort = '[2001:db8::1]:443';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatIPv6WithPort = '[2001:db8::1]:443';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatIPv6WithPort>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatIPv6WithPort = '[2001:db8::1]:443';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatIPv6WithPort = '[2001:db8::1]:443';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatIPv6WithPort>>(),
    validateSchema: () => createValidate(RT.ipv6WithPort()),
    getValidationErrors: () => createGetValidationErrors<FormatIPv6WithPort>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatIPv6WithPort>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.ipv6WithPort()),
    mockType: () => createMockType<FormatIPv6WithPort>(),
    getSamples: () => ({valid: ['[2001:db8::1]:443'], invalid: ['[2001:db8::1]:99999']}),
    expectedFormatErrors: () => [{name: 'ip', val: 6}],
  },

  // ────────────────────────────── Domain ──────────────────────────
  domain: {
    title: 'FormatDomain — standard',
    description: 'FormatDomain (format `domain`); enforces the baked domain pattern plus `minLength` 5 / `maxLength` 253',
    validateNotes: [
      'Multi-label hostnames pass (`mion.io`, `example.com`, `sub.example.co.uk`, `a-b.example.org`).',
      'Rejected: a bare label (`not-a-domain`), a leading dot (`.com`), a single-char TLD (`example.c`), a leading-hyphen label (`-bad.com`), an embedded space (`exa mple.com`), and the empty string. The format error is `{name: domain}` (no `val`).',
    ],
    validate: () => createValidate<FormatDomain>(),
    validateReflect: () => {
      const v: FormatDomain = 'mion.io';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDomain>(),
    deserializeValidateReflect: () => {
      const v: FormatDomain = 'mion.io';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDomain = 'mion.io';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatDomain>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDomain = 'mion.io';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatDomain = 'mion.io';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatDomain>>(),
    validateSchema: () => createValidate(RT.domain()),
    getValidationErrors: () => createGetValidationErrors<FormatDomain>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatDomain>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.domain()),
    mockType: () => createMockType<FormatDomain>(),
    getSamples: () => ({
      valid: ['mion.io', 'example.com', 'sub.example.co.uk', 'a-b.example.org'],
      invalid: ['not-a-domain', '.com', 'example.c', '-bad.com', 'exa mple.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null, null],
  },
  domainStrict: {
    title: 'FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge',
    description: 'FormatDomainStrict (format `domain`); stricter than FormatDomain — ≤6 labels, ≥2 parts, strict name/TLD patterns',
    validateNotes: [
      'Up to 6 labels pass (`mion.io`, `sub.example.com`, `aa.bb.cc.dd.ee.com`).',
      'Rejected: a leading-hyphen label (`-bad.com`), more than 6 labels (`aa.bb.cc.dd.ee.ff.com`), a numeric TLD (`example.123`), an underscore in a label (`ex_ample.com`), and a single-part name (`localhost`). The format error is `{name: domain}` (no `val`).',
    ],
    validate: () => createValidate<FormatDomainStrict>(),
    validateReflect: () => {
      const v: FormatDomainStrict = 'mion.io';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDomainStrict>(),
    deserializeValidateReflect: () => {
      const v: FormatDomainStrict = 'mion.io';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDomainStrict = 'mion.io';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatDomainStrict>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDomainStrict = 'mion.io';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatDomainStrict = 'mion.io';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatDomainStrict>>(),
    validateSchema: () => createValidate(RT.domainStrict()),
    getValidationErrors: () => createGetValidationErrors<FormatDomainStrict>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatDomainStrict>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.domainStrict()),
    mockType: () => createMockType<FormatDomainStrict>(),
    getSamples: () => ({
      valid: ['mion.io', 'sub.example.com', 'aa.bb.cc.dd.ee.com'],
      invalid: ['-bad.com', 'aa.bb.cc.dd.ee.ff.com', 'example.123', 'ex_ample.com', 'localhost'],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null],
  },

  // ─────────────────────────────── Email ──────────────────────────
  email: {
    title: 'FormatEmail — standard',
    description: 'FormatEmail (format `email`); enforces the baked email pattern plus `minLength` 7 / `maxLength` 254',
    validateNotes: [
      'Standard addresses pass, including subaddressing (`user+tag@sub.example.org`).',
      'Rejected: no `@` (`not-an-email`), too short (`a@b.co`, below `minLength` 7), missing local part (`@example.com`), missing domain (`john@`), a TLD-less domain (`john@example`), an embedded space (`john doe@example.com`), and the empty string. The format error is `{name: email}` (no `val`).',
    ],
    validate: () => createValidate<FormatEmail>(),
    validateReflect: () => {
      const v: FormatEmail = 'john@example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatEmail>(),
    deserializeValidateReflect: () => {
      const v: FormatEmail = 'john@example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatEmail = 'john@example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatEmail>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatEmail = 'john@example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatEmail = 'john@example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatEmail>>(),
    validateSchema: () => createValidate(RT.email()),
    getValidationErrors: () => createGetValidationErrors<FormatEmail>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatEmail>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.email()),
    mockType: () => createMockType<FormatEmail>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io', 'ab@cd.co', 'user+tag@sub.example.org'],
      invalid: ['not-an-email', 'a@b.co', '@example.com', 'john@', 'john@example', 'john doe@example.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'email'}, null, null, null, null, null, null],
  },
  emailPunycode: {
    title: 'FormatEmailPunycode — accepts punycode-tld domains',
    description: 'FormatEmailPunycode (format `email`); email pattern that additionally accepts punycode (`xn--`) domain labels',
    validateNotes: 'A punycode-TLD address (`john@example.xn--fiqs8s`) passes. A non-email string (`not-an-email`) fails with `{name: email}` (no `val`).',
    validate: () => createValidate<FormatEmailPunycode>(),
    validateReflect: () => {
      const v: FormatEmailPunycode = 'john@example.xn--fiqs8s';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatEmailPunycode>(),
    deserializeValidateReflect: () => {
      const v: FormatEmailPunycode = 'john@example.xn--fiqs8s';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatEmailPunycode = 'john@example.xn--fiqs8s';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatEmailPunycode>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatEmailPunycode = 'john@example.xn--fiqs8s';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatEmailPunycode = 'john@example.xn--fiqs8s';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatEmailPunycode>>(),
    validateSchema: () => createValidate(RT.emailPunycode()),
    getValidationErrors: () => createGetValidationErrors<FormatEmailPunycode>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatEmailPunycode>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.emailPunycode()),
    mockType: () => createMockType<FormatEmailPunycode>(),
    getSamples: () => ({valid: ['john@example.xn--fiqs8s'], invalid: ['not-an-email']}),
    expectedFormatErrors: () => [{name: 'email'}],
  },
  emailStrict: {
    title: 'FormatEmailStrict — localPart + domain decomposition',
    description: 'FormatEmailStrict (format `email`); splits on the last `@`, then applies a strict local-part pattern + strict domain',
    validateNotes: [
      'Plain addresses pass (`john@example.com`, `jane.doe@mion.io`).',
      'A disallowed local-part char (`a+b@x.com`) fails with `val` `Invalid characters in email local part`.',
      'Also rejected: a space in the local part (`a b@example.com`), a doubled `@` (`john@@example.com`), an underscore in the domain (`john@bad_domain.com`), and no `@` at all (`no-at-symbol`).',
    ],
    validate: () => createValidate<FormatEmailStrict>(),
    validateReflect: () => {
      const v: FormatEmailStrict = 'john@example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatEmailStrict>(),
    deserializeValidateReflect: () => {
      const v: FormatEmailStrict = 'john@example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatEmailStrict = 'john@example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatEmailStrict>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatEmailStrict = 'john@example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatEmailStrict = 'john@example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatEmailStrict>>(),
    validateSchema: () => createValidate(RT.emailStrict()),
    getValidationErrors: () => createGetValidationErrors<FormatEmailStrict>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatEmailStrict>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.emailStrict()),
    mockType: () => createMockType<FormatEmailStrict>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io'],
      invalid: ['a+b@x.com', 'a b@example.com', 'john@@example.com', 'john@bad_domain.com', 'no-at-symbol'],
    }),
    expectedFormatErrors: () => [{name: 'email', val: 'Invalid characters in email local part'}, null, null, null, null],
  },

  // ──────────────────────────────── URL ───────────────────────────
  url: {
    title: 'FormatUrl — standard (http/ftp/ws schemes)',
    description: 'FormatUrl (format `url`, `maxLength` 2048); accepts common schemes (http, ftp, ws/wss)',
    validateNotes: [
      'Multiple schemes pass (`https://`, `http://` with path+query, `ftp://`, `wss://`).',
      'Rejected: a scheme-less string (`not-a-url`), a bare host (`example.com`), a `mailto:` URI, and a scheme with no host (`https://`). The format error is `{name: url}` (no `val`).',
    ],
    validate: () => createValidate<FormatUrl>(),
    validateReflect: () => {
      const v: FormatUrl = 'https://example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatUrl>(),
    deserializeValidateReflect: () => {
      const v: FormatUrl = 'https://example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatUrl = 'https://example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatUrl>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatUrl = 'https://example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatUrl = 'https://example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatUrl>>(),
    validateSchema: () => createValidate(RT.url()),
    getValidationErrors: () => createGetValidationErrors<FormatUrl>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatUrl>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.url()),
    mockType: () => createMockType<FormatUrl>(),
    getSamples: () => ({
      valid: ['https://example.com', 'http://mion.io/path?q=1', 'ftp://files.example.org', 'wss://socket.example.com'],
      invalid: ['not-a-url', 'example.com', 'mailto:john@example.com', 'https://'],
    }),
    expectedFormatErrors: () => [{name: 'url'}, null, null, null],
  },
  urlHttp: {
    title: 'FormatUrlHttp — http(s) only',
    description: 'FormatUrlHttp (format `url`); restricts the scheme to `http` / `https`',
    validateNotes: 'Both `https://example.com` and `http://example.com` pass; a non-http scheme (`ftp://example.com`) fails with `{name: url}` (no `val`).',
    validate: () => createValidate<FormatUrlHttp>(),
    validateReflect: () => {
      const v: FormatUrlHttp = 'https://example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatUrlHttp>(),
    deserializeValidateReflect: () => {
      const v: FormatUrlHttp = 'https://example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatUrlHttp = 'https://example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatUrlHttp>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatUrlHttp = 'https://example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatUrlHttp = 'https://example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatUrlHttp>>(),
    validateSchema: () => createValidate(RT.urlHttp()),
    getValidationErrors: () => createGetValidationErrors<FormatUrlHttp>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatUrlHttp>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.urlHttp()),
    mockType: () => createMockType<FormatUrlHttp>(),
    getSamples: () => ({valid: ['https://example.com', 'http://example.com'], invalid: ['ftp://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },
  urlFile: {
    title: 'FormatUrlFile — file URLs',
    description: 'FormatUrlFile (format `url`); restricts the scheme to `file:`',
    validateNotes: 'A `file:///etc/hosts` URL passes; a non-file scheme (`https://example.com`) fails with `{name: url}` (no `val`).',
    validate: () => createValidate<FormatUrlFile>(),
    validateReflect: () => {
      const v: FormatUrlFile = 'file:///etc/hosts';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatUrlFile>(),
    deserializeValidateReflect: () => {
      const v: FormatUrlFile = 'file:///etc/hosts';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatUrlFile = 'file:///etc/hosts';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatUrlFile>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatUrlFile = 'file:///etc/hosts';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatUrlFile = 'file:///etc/hosts';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatUrlFile>>(),
    validateSchema: () => createValidate(RT.urlFile()),
    getValidationErrors: () => createGetValidationErrors<FormatUrlFile>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatUrlFile>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.urlFile()),
    mockType: () => createMockType<FormatUrlFile>(),
    getSamples: () => ({valid: ['file:///etc/hosts'], invalid: ['https://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },

  // ─────────────────── registerFormatPattern ──────────────────
  pattern_slug: {
    title: 'registerFormatPattern — slug regex recovered from the call site',
    description: 'stringFormat with a registered `pattern` (slug `^[a-z0-9-]+$`); only lowercase letters, digits, and hyphens pass',
    validateNotes: [
      'Lowercase slug strings pass (`my-slug`, `a-b-c`).',
      'Rejected: capitals (`Has Capitals`, `UPPER`), an embedded space (`has space`), and the empty string.',
      'Although the pattern registers a custom message (`must be a slug`), validate surfaces the static default `val` `Invalid pattern` (the `message` field is excluded from cache identity).',
    ],
    validate: () => createValidate<Slug>(),
    validateReflect: () => {
      const v: Slug = 'my-slug';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<Slug>(),
    deserializeValidateReflect: () => {
      const v: Slug = 'my-slug';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Slug = 'my-slug';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Slug>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Slug = 'my-slug';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Slug = 'my-slug';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<Slug>>(),
    // Value-first can't reference the OPAQUE `registerFormatPattern` result
    // (its source/flags erase to `string`), so the schema re-authors the same
    // regex inline. The pattern's {source, flags} ARE part of the structural id,
    // so `flags: ''` must be supplied explicitly to match the type-first form.
    validateSchema: () =>
      createValidate(
        RT.string({
          pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
        })
      ),
    getValidationErrors: () => createGetValidationErrors<Slug>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Slug>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.string({
          pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
        })
      ),
    mockType: () => createMockType<Slug>(),
    getSamples: () => ({valid: ['my-slug', 'a-b-c'], invalid: ['Has Capitals', 'UPPER', 'has space', '']}),
    // `pattern`'s custom message lives under the key-excluded `message`
    // field, so the emitter uses the static default 'Invalid pattern'
    // (shared.go messageLiteral special-cases pattern for cache identity).
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  pattern_hex: {
    title: 'registerFormatPattern — {source, flags} overload (case-insensitive)',
    description: 'stringFormat with a registered case-insensitive `pattern` (hex `^[0-9a-f]+$`, flag `i`); accepts hex digits in either case',
    validateNotes: 'The `i` flag folds case, so both `0042` and `DEADbeef` pass. A non-hex string (`xyz`) and the empty string each fail with `val` `Invalid pattern`.',
    validate: () => createValidate<Hex>(),
    validateReflect: () => {
      const v: Hex = '0042';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<Hex>(),
    deserializeValidateReflect: () => {
      const v: Hex = '0042';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Hex = '0042';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Hex>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Hex = '0042';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Hex = '0042';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<Hex>>(),
    validateSchema: () =>
      createValidate(RT.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    getValidationErrors: () => createGetValidationErrors<Hex>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Hex>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    mockType: () => createMockType<Hex>(),
    getSamples: () => ({valid: ['0042', 'DEADbeef'], invalid: ['xyz', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
