import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createIsType, createGetTypeErrors, createMockType, registerFormatPattern, type DataOnly} from '@mionjs/ts-go-run-types';
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
    isType: () => createIsType<FormatString<{maxLength: 5}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{maxLength: 5}>>>(),
    isTypeSchema: () => createIsType(RT.string({maxLength: 5})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{maxLength: 5}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{maxLength: 5}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({maxLength: 5})),
    mockType: () => createMockType<FormatString<{maxLength: 5}>>(),
    getSamples: () => ({valid: ['', 'hello'], invalid: ['hello!', 42]}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 5}, null],
  },
  string_minLength: {
    title: 'FormatString minLength — bounds the lower length',
    isType: () => createIsType<FormatString<{minLength: 3}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{minLength: 3}>>>(),
    isTypeSchema: () => createIsType(RT.string({minLength: 3})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{minLength: 3}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{minLength: 3}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({minLength: 3})),
    mockType: () => createMockType<FormatString<{minLength: 3}>>(),
    getSamples: () => ({valid: ['abc', 'abcd'], invalid: ['ab', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 3},
    ],
  },
  string_length: {
    title: 'FormatString length — exact length only',
    isType: () => createIsType<FormatString<{length: 4}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{length: 4}>>>(),
    isTypeSchema: () => createIsType(RT.string({length: 4})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{length: 4}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{length: 4}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({length: 4})),
    mockType: () => createMockType<FormatString<{length: 4}>>(),
    getSamples: () => ({valid: ['abcd'], invalid: ['abc', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 4},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_range: {
    title: 'FormatString minLength + maxLength — bounds both ends',
    isType: () => createIsType<FormatString<{minLength: 2; maxLength: 4}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{minLength: 2; maxLength: 4}>>>(),
    isTypeSchema: () => createIsType(RT.string({minLength: 2, maxLength: 4})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{minLength: 2; maxLength: 4}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{minLength: 2; maxLength: 4}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({minLength: 2, maxLength: 4})),
    mockType: () => createMockType<FormatString<{minLength: 2; maxLength: 4}>>(),
    getSamples: () => ({valid: ['ab', 'abcd'], invalid: ['a', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 2},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_allowedChars: {
    title: 'FormatString allowedChars — only the allowed set passes',
    isType: () => createIsType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedChars: {val: '0123456789abcdef'}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedChars: {val: '0123456789abcdef'}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
  },
  string_allowedChars_ignoreCase: {
    title: 'FormatString allowedChars ignoreCase — folds case',
    isType: () => createIsType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_allowedChars_literal: {
    title: 'FormatString allowedChars — regex-special chars treated literally',
    isType: () => createIsType<FormatString<{allowedChars: {val: '.-'}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedChars: {val: '.-'}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedChars: {val: '.-'}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: '.-'}}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{allowedChars: {val: '.-'}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedChars: {val: '.-'}})),
    mockType: () => createMockType<FormatString<{allowedChars: {val: '.-'}}>>(),
    getSamples: () => ({valid: ['...---'], invalid: ['a']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_disallowedChars: {
    title: 'FormatString disallowedChars — rejects any disallowed char',
    isType: () => createIsType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    isTypeSchema: () => createIsType(RT.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<DataOnly<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    mockType: () => createMockType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getSamples: () => ({valid: ['hello'], invalid: ['hi!', 'a@b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid characters'},
      {name: 'stringFormat', val: 'Invalid characters'},
    ],
  },
  string_allowedValues: {
    title: 'FormatString allowedValues — enum-like exact match',
    isType: () => createIsType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
  },
  string_allowedValues_ignoreCase: {
    title: 'FormatString allowedValues ignoreCase — folds case across the set',
    isType: () => createIsType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<DataOnly<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}],
  },
  string_allowedValues_escaped: {
    title: 'FormatString allowedValues — regex-special chars matched literally',
    isType: () => createIsType<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedValues: {val: ['a.b', 'c+d']}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedValues: {val: ['a.b', 'c+d']}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getSamples: () => ({valid: ['a.b', 'c+d'], invalid: ['axb', 'ccd']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_disallowedValues: {
    title: 'FormatString disallowedValues — rejects the listed values',
    isType: () => createIsType<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    isTypeDataOnly: () =>
      createIsType<DataOnly<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
    isTypeSchema: () => createIsType(RT.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    getTypeErrors: () =>
      createGetTypeErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<DataOnly<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    mockType: () => createMockType<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getSamples: () => ({valid: ['alice'], invalid: ['admin', 'root']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_customErrorMessage: {
    title: 'FormatString allowedValues — custom errorMessage surfaces as format.val',
    isType: () => createIsType<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    isTypeSchema: () => createIsType(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<DataOnly<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    mockType: () => createMockType<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
  },

  // ─────────────────────── Default string formats ─────────────────
  alpha: {
    title: 'FormatAlpha — letters only',
    isType: () => createIsType<FormatAlpha>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatAlpha>>(),
    isTypeSchema: () => createIsType(RT.alpha()),
    getTypeErrors: () => createGetTypeErrors<FormatAlpha>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatAlpha>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.alpha()),
    mockType: () => createMockType<FormatAlpha>(),
    getSamples: () => ({valid: ['Hello', 'abcXYZ'], invalid: ['hello1', 'hi there', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid pattern'}, null, null],
  },
  alphaNumeric: {
    title: 'FormatAlphaNumeric — letters and digits',
    isType: () => createIsType<FormatAlphaNumeric>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatAlphaNumeric>>(),
    isTypeSchema: () => createIsType(RT.alphaNumeric()),
    getTypeErrors: () => createGetTypeErrors<FormatAlphaNumeric>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatAlphaNumeric>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.alphaNumeric()),
    mockType: () => createMockType<FormatAlphaNumeric>(),
    getSamples: () => ({valid: ['abc123', 'ABC', '123'], invalid: ['a-b', 'a b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  numeric: {
    title: 'FormatNumeric — digits only',
    isType: () => createIsType<FormatNumeric>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatNumeric>>(),
    isTypeSchema: () => createIsType(RT.numeric()),
    getTypeErrors: () => createGetTypeErrors<FormatNumeric>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatNumeric>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.numeric()),
    mockType: () => createMockType<FormatNumeric>(),
    getSamples: () => ({valid: ['12345', '007'], invalid: ['12.3', '12a']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  alpha_withLength: {
    title: 'FormatAlpha with maxLength — char class plus length bound',
    isType: () => createIsType<FormatAlpha<{maxLength: 3}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatAlpha<{maxLength: 3}>>>(),
    isTypeSchema: () => createIsType(RT.alpha({maxLength: 3})),
    getTypeErrors: () => createGetTypeErrors<FormatAlpha<{maxLength: 3}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatAlpha<{maxLength: 3}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.alpha({maxLength: 3})),
    mockType: () => createMockType<FormatAlpha<{maxLength: 3}>>(),
    getSamples: () => ({valid: ['abc'], invalid: ['abcd', 'a1']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  lowercase_validate: {
    title: 'FormatLowercase — transformer-only, validates as a plain string',
    isType: () => createIsType<FormatLowercase>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatLowercase>>(),
    isTypeSchema: () => createIsType(RT.lowercase()),
    getTypeErrors: () => createGetTypeErrors<FormatLowercase>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatLowercase>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.lowercase()),
    mockType: () => createMockType<FormatLowercase>(),
    getSamples: () => ({valid: ['already lower', 'HasUpper'], invalid: [42]}),
    expectedFormatErrors: () => [null],
  },

  // ─────────────────────────────── UUID ───────────────────────────
  uuidv4: {
    title: 'FormatUUIDv4 — accepts v4, rejects v7 and malformed',
    isType: () => createIsType<FormatUUIDv4>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatUUIDv4>>(),
    isTypeSchema: () => createIsType(RT.uuidv4()),
    getTypeErrors: () => createGetTypeErrors<FormatUUIDv4>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatUUIDv4>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.uuidv4()),
    mockType: () => createMockType<FormatUUIDv4>(),
    getSamples: () => ({valid: [V4], invalid: [V7, 'not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '4'}, {name: 'uuid', val: '4'}, null, null, null],
  },
  uuidv7: {
    title: 'FormatUUIDv7 — accepts v7, rejects v4',
    isType: () => createIsType<FormatUUIDv7>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatUUIDv7>>(),
    isTypeSchema: () => createIsType(RT.uuidv7()),
    getTypeErrors: () => createGetTypeErrors<FormatUUIDv7>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatUUIDv7>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.uuidv7()),
    mockType: () => createMockType<FormatUUIDv7>(),
    getSamples: () => ({valid: [V7], invalid: [V4]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '7'}],
  },

  // ─────────────────────────────── Date ───────────────────────────
  date_iso: {
    title: 'FormatStringDate — ISO / YYYY-MM-DD (default)',
    isType: () => createIsType<FormatStringDate>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringDate>>(),
    isTypeSchema: () => createIsType(RT.stringDate()),
    getTypeErrors: () => createGetTypeErrors<FormatStringDate>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringDate>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringDate()),
    mockType: () => createMockType<FormatStringDate>(),
    getSamples: () => ({
      valid: ['2024-02-29', '2026-05-28', '0001-01-01'],
      invalid: ['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-1', 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'date', val: 'ISO'}, null, null, null, null],
  },
  date_DMY: {
    title: 'FormatStringDate — DD-MM-YYYY layout',
    isType: () => createIsType<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringDate<{format: 'DD-MM-YYYY'}>>>(),
    isTypeSchema: () => createIsType(RT.stringDate({format: 'DD-MM-YYYY'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringDate<{format: 'DD-MM-YYYY'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringDate({format: 'DD-MM-YYYY'})),
    mockType: () => createMockType<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    getSamples: () => ({valid: ['29-02-2024'], invalid: ['2024-02-29', '31-04-2024']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'DD-MM-YYYY'},
      {name: 'date', val: 'DD-MM-YYYY'},
    ],
  },
  date_YM: {
    title: 'FormatStringDate — YYYY-MM layout (no day)',
    isType: () => createIsType<FormatStringDate<{format: 'YYYY-MM'}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringDate<{format: 'YYYY-MM'}>>>(),
    isTypeSchema: () => createIsType(RT.stringDate({format: 'YYYY-MM'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'YYYY-MM'}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringDate<{format: 'YYYY-MM'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringDate({format: 'YYYY-MM'})),
    mockType: () => createMockType<FormatStringDate<{format: 'YYYY-MM'}>>(),
    getSamples: () => ({valid: ['2024-02'], invalid: ['2024-13', '2024-02-29']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'YYYY-MM'},
      {name: 'date', val: 'YYYY-MM'},
    ],
  },
  date_MD: {
    title: 'FormatStringDate — MM-DD layout (no year)',
    isType: () => createIsType<FormatStringDate<{format: 'MM-DD'}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringDate<{format: 'MM-DD'}>>>(),
    isTypeSchema: () => createIsType(RT.stringDate({format: 'MM-DD'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'MM-DD'}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringDate<{format: 'MM-DD'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringDate({format: 'MM-DD'})),
    mockType: () => createMockType<FormatStringDate<{format: 'MM-DD'}>>(),
    getSamples: () => ({valid: ['02-29'], invalid: ['13-01']}),
    expectedFormatErrors: () => [{name: 'date', val: 'MM-DD'}],
  },
  date_minMax_absolute: {
    title: 'FormatStringDate — absolute min/max bounds (inclusive)',
    isType: () => createIsType<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    isTypeDataOnly: () =>
      createIsType<DataOnly<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    isTypeSchema: () => createIsType(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<DataOnly<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    // mockType must respect the bounds — assertMockType re-validates every
    // generated value through isType, so an out-of-range mock would fail.
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
    isType: () => createIsType<FormatStringTime>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringTime>>(),
    isTypeSchema: () => createIsType(RT.stringTime()),
    getTypeErrors: () => createGetTypeErrors<FormatStringTime>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringTime>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringTime()),
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
    isType: () => createIsType<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringTime<{format: 'HH:mm:ss'}>>>(),
    isTypeSchema: () => createIsType(RT.stringTime({format: 'HH:mm:ss'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringTime<{format: 'HH:mm:ss'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringTime({format: 'HH:mm:ss'})),
    mockType: () => createMockType<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    getSamples: () => ({valid: ['23:59:59'], invalid: ['99:99:99', '23:59', '24:00:00']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss'}, null, null],
  },
  time_HHmmss_ms: {
    title: 'FormatStringTime — HH:mm:ss[.mmm] optional milliseconds',
    isType: () => createIsType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    isTypeSchema: () => createIsType(RT.stringTime({format: 'HH:mm:ss[.mmm]'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringTime({format: 'HH:mm:ss[.mmm]'})),
    mockType: () => createMockType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getSamples: () => ({valid: ['12:30:45', '12:30:45.999'], invalid: ['12:30:45.9999']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss[.mmm]'}],
  },
  time_minMax_absolute: {
    title: 'FormatStringTime — absolute min/max bounds (business hours)',
    isType: () => createIsType<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    isTypeSchema: () => createIsType(RT.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
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
    isType: () => createIsType<FormatStringDateTime>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatStringDateTime>>(),
    isTypeSchema: () => createIsType(RT.stringDateTime()),
    getTypeErrors: () => createGetTypeErrors<FormatStringDateTime>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatStringDateTime>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.stringDateTime()),
    mockType: () => createMockType<FormatStringDateTime>(),
    getSamples: () => ({
      valid: ['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00'],
      invalid: ['2024-02-29 12:30:45Z', '2023-02-29T12:30:45Z', '2024-02-29T25:30:45Z', 'not-a-datetime'],
    }),
    expectedFormatErrors: () => [{name: 'dateTime', formatPathTail: 'splitChar'}, null, null, null],
  },
  dateTime_custom: {
    title: 'FormatStringDateTime — custom nested layouts + splitChar',
    isType: () => createIsType<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    isTypeDataOnly: () =>
      createIsType<DataOnly<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>>(),
    isTypeSchema: () => createIsType(RT.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    getTypeErrors: () =>
      createGetTypeErrors<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<
        DataOnly<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>
      >(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
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
    isType: () =>
      createIsType<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    isTypeDataOnly: () =>
      createIsType<
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
    isTypeSchema: () =>
      createIsType(
        RT.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    getTypeErrors: () =>
      createGetTypeErrors<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    getTypeErrorsDataOnly: () =>
      createGetTypeErrors<
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
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
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
    isType: () => createIsType<FormatIPv4>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatIPv4>>(),
    isTypeSchema: () => createIsType(RT.ipv4()),
    getTypeErrors: () => createGetTypeErrors<FormatIPv4>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatIPv4>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.ipv4()),
    mockType: () => createMockType<FormatIPv4>(),
    getSamples: () => ({
      valid: ['192.168.0.1', '0.0.0.0', '255.255.255.255'],
      invalid: ['999.999.999.999', '256.0.0.1', '1.2.3', '::1'],
    }),
    expectedFormatErrors: () => [{name: 'ip', val: 4}, null, null, null],
  },
  ipv6: {
    title: 'FormatIPv6 — colon-separated, loopback allowed',
    isType: () => createIsType<FormatIPv6>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatIPv6>>(),
    isTypeSchema: () => createIsType(RT.ipv6()),
    getTypeErrors: () => createGetTypeErrors<FormatIPv6>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatIPv6>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.ipv6()),
    mockType: () => createMockType<FormatIPv6>(),
    getSamples: () => ({valid: ['2001:db8:0:0:0:0:0:1', '::1', 'fe80::1'], invalid: ['192.168.0.1', '12345::1']}),
    expectedFormatErrors: () => [
      {name: 'ip', val: 6},
      {name: 'ip', val: 6},
    ],
  },
  ip_any: {
    title: 'FormatIP — accepts both v4 and v6',
    isType: () => createIsType<FormatIP>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatIP>>(),
    isTypeSchema: () => createIsType(RT.ip()),
    getTypeErrors: () => createGetTypeErrors<FormatIP>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatIP>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.ip()),
    mockType: () => createMockType<FormatIP>(),
    getSamples: () => ({valid: ['10.0.0.1', '2001:db8::1'], invalid: ['definitely not an ip']}),
    expectedFormatErrors: () => [{name: 'ip', val: 'any'}],
  },
  ipv4_port: {
    title: 'FormatIPv4WithPort — v4 with port',
    isType: () => createIsType<FormatIPv4WithPort>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatIPv4WithPort>>(),
    isTypeSchema: () => createIsType(RT.ipv4WithPort()),
    getTypeErrors: () => createGetTypeErrors<FormatIPv4WithPort>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatIPv4WithPort>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.ipv4WithPort()),
    mockType: () => createMockType<FormatIPv4WithPort>(),
    getSamples: () => ({valid: ['192.168.0.1:8080'], invalid: ['192.168.0.1:70000']}),
    expectedFormatErrors: () => [{name: 'ip', val: 4}],
  },
  ipv6_port: {
    title: 'FormatIPv6WithPort — v6 with bracketed port',
    isType: () => createIsType<FormatIPv6WithPort>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatIPv6WithPort>>(),
    isTypeSchema: () => createIsType(RT.ipv6WithPort()),
    getTypeErrors: () => createGetTypeErrors<FormatIPv6WithPort>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatIPv6WithPort>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.ipv6WithPort()),
    mockType: () => createMockType<FormatIPv6WithPort>(),
    getSamples: () => ({valid: ['[2001:db8::1]:443'], invalid: ['[2001:db8::1]:99999']}),
    expectedFormatErrors: () => [{name: 'ip', val: 6}],
  },

  // ────────────────────────────── Domain ──────────────────────────
  domain: {
    title: 'FormatDomain — standard',
    isType: () => createIsType<FormatDomain>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatDomain>>(),
    isTypeSchema: () => createIsType(RT.domain()),
    getTypeErrors: () => createGetTypeErrors<FormatDomain>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatDomain>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.domain()),
    mockType: () => createMockType<FormatDomain>(),
    getSamples: () => ({
      valid: ['mion.io', 'example.com', 'sub.example.co.uk', 'a-b.example.org'],
      invalid: ['not-a-domain', '.com', 'example.c', '-bad.com', 'exa mple.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null, null],
  },
  domainStrict: {
    title: 'FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge',
    isType: () => createIsType<FormatDomainStrict>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatDomainStrict>>(),
    isTypeSchema: () => createIsType(RT.domainStrict()),
    getTypeErrors: () => createGetTypeErrors<FormatDomainStrict>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatDomainStrict>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.domainStrict()),
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
    isType: () => createIsType<FormatEmail>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatEmail>>(),
    isTypeSchema: () => createIsType(RT.email()),
    getTypeErrors: () => createGetTypeErrors<FormatEmail>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatEmail>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.email()),
    mockType: () => createMockType<FormatEmail>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io', 'ab@cd.co', 'user+tag@sub.example.org'],
      invalid: ['not-an-email', 'a@b.co', '@example.com', 'john@', 'john@example', 'john doe@example.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'email'}, null, null, null, null, null, null],
  },
  emailPunycode: {
    title: 'FormatEmailPunycode — accepts punycode-tld domains',
    isType: () => createIsType<FormatEmailPunycode>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatEmailPunycode>>(),
    isTypeSchema: () => createIsType(RT.emailPunycode()),
    getTypeErrors: () => createGetTypeErrors<FormatEmailPunycode>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatEmailPunycode>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.emailPunycode()),
    mockType: () => createMockType<FormatEmailPunycode>(),
    getSamples: () => ({valid: ['john@example.xn--fiqs8s'], invalid: ['not-an-email']}),
    expectedFormatErrors: () => [{name: 'email'}],
  },
  emailStrict: {
    title: 'FormatEmailStrict — localPart + domain decomposition',
    isType: () => createIsType<FormatEmailStrict>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatEmailStrict>>(),
    isTypeSchema: () => createIsType(RT.emailStrict()),
    getTypeErrors: () => createGetTypeErrors<FormatEmailStrict>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatEmailStrict>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.emailStrict()),
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
    isType: () => createIsType<FormatUrl>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatUrl>>(),
    isTypeSchema: () => createIsType(RT.url()),
    getTypeErrors: () => createGetTypeErrors<FormatUrl>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatUrl>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.url()),
    mockType: () => createMockType<FormatUrl>(),
    getSamples: () => ({
      valid: ['https://example.com', 'http://mion.io/path?q=1', 'ftp://files.example.org', 'wss://socket.example.com'],
      invalid: ['not-a-url', 'example.com', 'mailto:john@example.com', 'https://'],
    }),
    expectedFormatErrors: () => [{name: 'url'}, null, null, null],
  },
  urlHttp: {
    title: 'FormatUrlHttp — http(s) only',
    isType: () => createIsType<FormatUrlHttp>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatUrlHttp>>(),
    isTypeSchema: () => createIsType(RT.urlHttp()),
    getTypeErrors: () => createGetTypeErrors<FormatUrlHttp>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatUrlHttp>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.urlHttp()),
    mockType: () => createMockType<FormatUrlHttp>(),
    getSamples: () => ({valid: ['https://example.com', 'http://example.com'], invalid: ['ftp://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },
  urlFile: {
    title: 'FormatUrlFile — file URLs',
    isType: () => createIsType<FormatUrlFile>(),
    isTypeDataOnly: () => createIsType<DataOnly<FormatUrlFile>>(),
    isTypeSchema: () => createIsType(RT.urlFile()),
    getTypeErrors: () => createGetTypeErrors<FormatUrlFile>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<FormatUrlFile>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.urlFile()),
    mockType: () => createMockType<FormatUrlFile>(),
    getSamples: () => ({valid: ['file:///etc/hosts'], invalid: ['https://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },

  // ─────────────────── registerFormatPattern ──────────────────
  pattern_slug: {
    title: 'registerFormatPattern — slug regex recovered from the call site',
    isType: () => createIsType<Slug>(),
    isTypeDataOnly: () => createIsType<DataOnly<Slug>>(),
    // Value-first can't reference the OPAQUE `registerFormatPattern` result
    // (its source/flags erase to `string`), so the schema re-authors the same
    // regex inline. The pattern's {source, flags} ARE part of the structural id,
    // so `flags: ''` must be supplied explicitly to match the type-first form.
    isTypeSchema: () =>
      createIsType(
        RT.string({
          pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
        })
      ),
    getTypeErrors: () => createGetTypeErrors<Slug>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Slug>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
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
    isType: () => createIsType<Hex>(),
    isTypeDataOnly: () => createIsType<DataOnly<Hex>>(),
    isTypeSchema: () =>
      createIsType(RT.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    getTypeErrors: () => createGetTypeErrors<Hex>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Hex>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    mockType: () => createMockType<Hex>(),
    getSamples: () => ({valid: ['0042', 'DEADbeef'], invalid: ['xyz', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
