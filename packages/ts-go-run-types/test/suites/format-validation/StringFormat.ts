import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createValidate, createGetValidationErrors, createMockType, registerFormatPattern, type DataOnly} from '@mionjs/ts-go-run-types';
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
  regexp: /^[a-z0-9-]+$/,
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
    validate: () => createValidate<FormatString<{maxLength: 5}>>(),
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
    validate: () => createValidate<FormatString<{minLength: 3}>>(),
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
    validate: () => createValidate<FormatString<{length: 4}>>(),
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
    validate: () => createValidate<FormatString<{minLength: 2; maxLength: 4}>>(),
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
    validate: () => createValidate<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedChars: {val: '0123456789abcdef'}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedChars: {val: '0123456789abcdef'}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
  },
  string_allowedChars_ignoreCase: {
    title: 'FormatString allowedChars ignoreCase — folds case',
    validate: () => createValidate<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_allowedChars_literal: {
    title: 'FormatString allowedChars — regex-special chars treated literally',
    validate: () => createValidate<FormatString<{allowedChars: {val: '.-'}}>>(),
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
    validate: () => createValidate<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
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
    validate: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
  },
  string_allowedValues_ignoreCase: {
    title: 'FormatString allowedValues ignoreCase — folds case across the set',
    validate: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}],
  },
  string_allowedValues_escaped: {
    title: 'FormatString allowedValues — regex-special chars matched literally',
    validate: () => createValidate<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['a.b', 'c+d']}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
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
    validate: () => createValidate<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    validateDataOnly: () =>
      createValidate<DataOnly<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
    validateSchema: () => createValidate(RT.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
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
    validate: () => createValidate<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    validateSchema: () => createValidate(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    getValidationErrors: () => createGetValidationErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
  },

  // ─────────────────────── Default string formats ─────────────────
  alpha: {
    title: 'FormatAlpha — letters only',
    validate: () => createValidate<FormatAlpha>(),
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
    validate: () => createValidate<FormatAlphaNumeric>(),
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
    validate: () => createValidate<FormatNumeric>(),
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
    validate: () => createValidate<FormatAlpha<{maxLength: 3}>>(),
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
    validate: () => createValidate<FormatLowercase>(),
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
    validate: () => createValidate<FormatUUIDv4>(),
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
    validate: () => createValidate<FormatUUIDv7>(),
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
    validate: () => createValidate<FormatStringDate>(),
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
    validate: () => createValidate<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
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
    validate: () => createValidate<FormatStringDate<{format: 'YYYY-MM'}>>(),
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
    validate: () => createValidate<FormatStringDate<{format: 'MM-DD'}>>(),
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
    validate: () => createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    validateDataOnly: () =>
      createValidate<DataOnly<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
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
    validate: () => createValidate<FormatStringTime>(),
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
    validate: () => createValidate<FormatStringTime<{format: 'HH:mm:ss'}>>(),
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
    validate: () => createValidate<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
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
    validate: () => createValidate<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    validateDataOnly: () => createValidate<DataOnly<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    validateSchema: () => createValidate(RT.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    getValidationErrors: () => createGetValidationErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
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
    validate: () => createValidate<FormatStringDateTime>(),
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
    validate: () => createValidate<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    validateDataOnly: () =>
      createValidate<DataOnly<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>>(),
    validateSchema: () => createValidate(RT.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
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
    validate: () => createValidate<FormatIPv4>(),
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
    validate: () => createValidate<FormatIPv6>(),
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
    validate: () => createValidate<FormatIP>(),
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
    validate: () => createValidate<FormatIPv4WithPort>(),
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
    validate: () => createValidate<FormatIPv6WithPort>(),
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
    validate: () => createValidate<FormatDomain>(),
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
    validate: () => createValidate<FormatDomainStrict>(),
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
    validate: () => createValidate<FormatEmail>(),
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
    validate: () => createValidate<FormatEmailPunycode>(),
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
    validate: () => createValidate<FormatEmailStrict>(),
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
    validate: () => createValidate<FormatUrl>(),
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
    validate: () => createValidate<FormatUrlHttp>(),
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
    validate: () => createValidate<FormatUrlFile>(),
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
    validate: () => createValidate<Slug>(),
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
    validate: () => createValidate<Hex>(),
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
