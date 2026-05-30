// Format validation suite — the type-format sibling of
// `validation-suite.ts`. Single source of truth for the isType /
// getTypeErrors / mockType behavioral assertions of every type format,
// ported from the old consolidated
// `ts-go-type-formats/test/adapters/stringFormats.test.ts`.
//
// Only the `STRING_FORMAT` section exists today; number / bigint format
// families land in later phases under sibling top-level keys.
//
// Each case reuses the `ValidationCase` shape (so the extracted
// `assertIsType` / `assertMockType` helpers run formats unchanged) plus
// a format-specific `expectedFormatErrors` field: format diagnostics
// carry a `format: {name, val, formatPath}` payload, and the format
// getTypeErrors adapter matches on those fields rather than a brittle
// full-object deep-equal.
//
// The bare `import '@mionjs/ts-go-run-types/formats'` is load-bearing:
// it registers the string-format mock fn, the built-in patterns, and
// the pure-fn factories. A type-only import of the aliases below would
// be elided and the registrations would never run.

import {createIsType, createGetTypeErrors, createMockType, registerFormatPattern} from '@mionjs/ts-go-run-types';
import type {ValidationCase} from './validation-suite.ts';
import '@mionjs/ts-go-run-types/formats';
import type {
  FormatNumber,
  FormatInteger,
  FormatFloat,
  FormatInt8,
  FormatUInt8,
  FormatBigInt,
  FormatBigInt64,
  FormatBigUInt64,
} from '@mionjs/ts-go-run-types/formats';
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

/** One expected format-error descriptor, index-parallel to a case's
 *  invalid samples. `null` means "expect at least one error but assert
 *  nothing about its format payload". A descriptor asserts the named
 *  format error is present and, when provided, its `val` and the tail
 *  of its `formatPath`. **/
export interface FormatErrorExpectation {
  /** `format.name` — e.g. 'stringFormat' | 'uuid' | 'date' | 'time' |
   *  'dateTime' | 'ip' | 'domain' | 'email' | 'url'. **/
  name: string;
  /** `format.val` to assert (deep-equal). Omit to skip. **/
  val?: unknown;
  /** Last segment of `format.formatPath` to assert. Omit to skip. **/
  formatPathTail?: string;
}

/** A format validation case — a `ValidationCase` (isType / getTypeErrors
 *  / mockType thunks + samples) plus the optional format-error
 *  expectations consumed by the format getTypeErrors adapter. **/
export type FormatValidationCase = ValidationCase & {
  expectedFormatErrors?: () => Array<FormatErrorExpectation | null>;
};

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

export const FORMAT_VALIDATION_SUITE: {
  STRING_FORMAT: Record<string, FormatValidationCase>;
  NUMBER_FORMAT: Record<string, FormatValidationCase>;
  BIGINT_FORMAT: Record<string, FormatValidationCase>;
} = {
  STRING_FORMAT: {
    // ─────────────────────────── FormatString ───────────────────────
    string_maxLength: {
      title: 'FormatString maxLength — bounds the upper length',
      isType: () => createIsType<FormatString<{maxLength: 5}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{maxLength: 5}>>(),
      mockType: () => createMockType<FormatString<{maxLength: 5}>>(),
      getSamples: () => ({valid: ['', 'hello'], invalid: ['hello!', 42]}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 5}, null],
    },
    string_minLength: {
      title: 'FormatString minLength — bounds the lower length',
      isType: () => createIsType<FormatString<{minLength: 3}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{minLength: 3}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatString<{length: 4}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatString<{minLength: 2; maxLength: 4}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
      mockType: () => createMockType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
      getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
    },
    string_allowedChars_ignoreCase: {
      title: 'FormatString allowedChars ignoreCase — folds case',
      isType: () => createIsType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
      mockType: () => createMockType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
      getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
    },
    string_allowedChars_literal: {
      title: 'FormatString allowedChars — regex-special chars treated literally',
      isType: () => createIsType<FormatString<{allowedChars: {val: '.-'}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: '.-'}}>>(),
      mockType: () => createMockType<FormatString<{allowedChars: {val: '.-'}}>>(),
      getSamples: () => ({valid: ['...---'], invalid: ['a']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
    },
    string_disallowedChars: {
      title: 'FormatString disallowedChars — rejects any disallowed char',
      isType: () => createIsType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
      mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
      getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
    },
    string_allowedValues_ignoreCase: {
      title: 'FormatString allowedValues ignoreCase — folds case across the set',
      isType: () => createIsType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
      mockType: () => createMockType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
      getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}],
    },
    string_allowedValues_escaped: {
      title: 'FormatString allowedValues — regex-special chars matched literally',
      isType: () => createIsType<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
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
      getTypeErrors: () =>
        createGetTypeErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
      mockType: () => createMockType<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
      getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
    },

    // ─────────────────────── Default string formats ─────────────────
    alpha: {
      title: 'FormatAlpha — letters only',
      isType: () => createIsType<FormatAlpha>(),
      getTypeErrors: () => createGetTypeErrors<FormatAlpha>(),
      mockType: () => createMockType<FormatAlpha>(),
      getSamples: () => ({valid: ['Hello', 'abcXYZ'], invalid: ['hello1', 'hi there', '']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid pattern'}, null, null],
    },
    alphaNumeric: {
      title: 'FormatAlphaNumeric — letters and digits',
      isType: () => createIsType<FormatAlphaNumeric>(),
      getTypeErrors: () => createGetTypeErrors<FormatAlphaNumeric>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatNumeric>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatAlpha<{maxLength: 3}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatLowercase>(),
      mockType: () => createMockType<FormatLowercase>(),
      getSamples: () => ({valid: ['already lower', 'HasUpper'], invalid: [42]}),
      expectedFormatErrors: () => [null],
    },

    // ─────────────────────────────── UUID ───────────────────────────
    uuidv4: {
      title: 'FormatUUIDv4 — accepts v4, rejects v7 and malformed',
      isType: () => createIsType<FormatUUIDv4>(),
      getTypeErrors: () => createGetTypeErrors<FormatUUIDv4>(),
      mockType: () => createMockType<FormatUUIDv4>(),
      getSamples: () => ({valid: [V4], invalid: [V7, 'not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
      expectedFormatErrors: () => [{name: 'uuid', val: '4'}, {name: 'uuid', val: '4'}, null, null, null],
    },
    uuidv7: {
      title: 'FormatUUIDv7 — accepts v7, rejects v4',
      isType: () => createIsType<FormatUUIDv7>(),
      getTypeErrors: () => createGetTypeErrors<FormatUUIDv7>(),
      mockType: () => createMockType<FormatUUIDv7>(),
      getSamples: () => ({valid: [V7], invalid: [V4]}),
      expectedFormatErrors: () => [{name: 'uuid', val: '7'}],
    },

    // ─────────────────────────────── Date ───────────────────────────
    date_iso: {
      title: 'FormatStringDate — ISO / YYYY-MM-DD (default)',
      isType: () => createIsType<FormatStringDate>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringDate>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'YYYY-MM'}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'MM-DD'}>>(),
      mockType: () => createMockType<FormatStringDate<{format: 'MM-DD'}>>(),
      getSamples: () => ({valid: ['02-29'], invalid: ['13-01']}),
      expectedFormatErrors: () => [{name: 'date', val: 'MM-DD'}],
    },
    date_minMax_absolute: {
      title: 'FormatStringDate — absolute min/max bounds (inclusive)',
      isType: () => createIsType<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatStringTime>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>(),
      mockType: () => createMockType<FormatStringTime<{format: 'HH:mm:ss'}>>(),
      getSamples: () => ({valid: ['23:59:59'], invalid: ['99:99:99', '23:59', '24:00:00']}),
      expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss'}, null, null],
    },
    time_HHmmss_ms: {
      title: 'FormatStringTime — HH:mm:ss[.mmm] optional milliseconds',
      isType: () => createIsType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
      mockType: () => createMockType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
      getSamples: () => ({valid: ['12:30:45', '12:30:45.999'], invalid: ['12:30:45.9999']}),
      expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss[.mmm]'}],
    },
    time_minMax_absolute: {
      title: 'FormatStringTime — absolute min/max bounds (business hours)',
      isType: () => createIsType<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatStringDateTime>(),
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
      getTypeErrors: () =>
        createGetTypeErrors<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatIPv4>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatIPv6>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatIP>(),
      mockType: () => createMockType<FormatIP>(),
      getSamples: () => ({valid: ['10.0.0.1', '2001:db8::1'], invalid: ['definitely not an ip']}),
      expectedFormatErrors: () => [{name: 'ip', val: 'any'}],
    },
    ipv4_port: {
      title: 'FormatIPv4WithPort — v4 with port',
      isType: () => createIsType<FormatIPv4WithPort>(),
      getTypeErrors: () => createGetTypeErrors<FormatIPv4WithPort>(),
      mockType: () => createMockType<FormatIPv4WithPort>(),
      getSamples: () => ({valid: ['192.168.0.1:8080'], invalid: ['192.168.0.1:70000']}),
      expectedFormatErrors: () => [{name: 'ip', val: 4}],
    },
    ipv6_port: {
      title: 'FormatIPv6WithPort — v6 with bracketed port',
      isType: () => createIsType<FormatIPv6WithPort>(),
      getTypeErrors: () => createGetTypeErrors<FormatIPv6WithPort>(),
      mockType: () => createMockType<FormatIPv6WithPort>(),
      getSamples: () => ({valid: ['[2001:db8::1]:443'], invalid: ['[2001:db8::1]:99999']}),
      expectedFormatErrors: () => [{name: 'ip', val: 6}],
    },

    // ────────────────────────────── Domain ──────────────────────────
    domain: {
      title: 'FormatDomain — standard',
      isType: () => createIsType<FormatDomain>(),
      getTypeErrors: () => createGetTypeErrors<FormatDomain>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatDomainStrict>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatEmail>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatEmailPunycode>(),
      mockType: () => createMockType<FormatEmailPunycode>(),
      getSamples: () => ({valid: ['john@example.xn--fiqs8s'], invalid: ['not-an-email']}),
      expectedFormatErrors: () => [{name: 'email'}],
    },
    emailStrict: {
      title: 'FormatEmailStrict — localPart + domain decomposition',
      isType: () => createIsType<FormatEmailStrict>(),
      getTypeErrors: () => createGetTypeErrors<FormatEmailStrict>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatUrl>(),
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
      getTypeErrors: () => createGetTypeErrors<FormatUrlHttp>(),
      mockType: () => createMockType<FormatUrlHttp>(),
      getSamples: () => ({valid: ['https://example.com', 'http://example.com'], invalid: ['ftp://example.com']}),
      expectedFormatErrors: () => [{name: 'url'}],
    },
    urlFile: {
      title: 'FormatUrlFile — file URLs',
      isType: () => createIsType<FormatUrlFile>(),
      getTypeErrors: () => createGetTypeErrors<FormatUrlFile>(),
      mockType: () => createMockType<FormatUrlFile>(),
      getSamples: () => ({valid: ['file:///etc/hosts'], invalid: ['https://example.com']}),
      expectedFormatErrors: () => [{name: 'url'}],
    },

    // ─────────────────────── registerFormatPattern ──────────────────
    pattern_slug: {
      title: 'registerFormatPattern — slug regex recovered from the call site',
      isType: () => createIsType<Slug>(),
      getTypeErrors: () => createGetTypeErrors<Slug>(),
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
      getTypeErrors: () => createGetTypeErrors<Hex>(),
      mockType: () => createMockType<Hex>(),
      getSamples: () => ({valid: ['0042', 'DEADbeef'], invalid: ['xyz', '']}),
      expectedFormatErrors: () => [
        {name: 'stringFormat', val: 'Invalid pattern'},
        {name: 'stringFormat', val: 'Invalid pattern'},
      ],
    },
  },
  NUMBER_FORMAT: {
    number_max: {
      title: 'FormatNumber<{max: 100}> — inclusive upper bound',
      isType: () => createIsType<FormatNumber<{max: 100}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatNumber<{max: 100}>>(),
      mockType: () => createMockType<FormatNumber<{max: 100}>>(),
      getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
      expectedFormatErrors: () => [{name: 'numberFormat', val: 100, formatPathTail: 'max'}, null],
    },
    number_min: {
      title: 'FormatNumber<{min: 0}> — inclusive lower bound',
      isType: () => createIsType<FormatNumber<{min: 0}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatNumber<{min: 0}>>(),
      mockType: () => createMockType<FormatNumber<{min: 0}>>(),
      getSamples: () => ({valid: [0, 1, 9999], invalid: [-1]}),
      expectedFormatErrors: () => [{name: 'numberFormat', val: 0, formatPathTail: 'min'}],
    },
    number_lt: {
      title: 'FormatNumber<{lt: 10}> — exclusive upper bound',
      isType: () => createIsType<FormatNumber<{lt: 10}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatNumber<{lt: 10}>>(),
      mockType: () => createMockType<FormatNumber<{lt: 10}>>(),
      getSamples: () => ({valid: [9, 0, -100], invalid: [10, 11]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
        {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
      ],
    },
    number_gt: {
      title: 'FormatNumber<{gt: 0}> — exclusive lower bound',
      isType: () => createIsType<FormatNumber<{gt: 0}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatNumber<{gt: 0}>>(),
      mockType: () => createMockType<FormatNumber<{gt: 0}>>(),
      getSamples: () => ({valid: [1, 100], invalid: [0, -1]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
        {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
      ],
    },
    number_integer: {
      title: 'FormatInteger — whole numbers only',
      isType: () => createIsType<FormatInteger>(),
      getTypeErrors: () => createGetTypeErrors<FormatInteger>(),
      mockType: () => createMockType<FormatInteger>(),
      getSamples: () => ({valid: [0, 1, -1, 42], invalid: [1.5, 3.14]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: true, formatPathTail: 'integer'},
        {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      ],
    },
    number_float: {
      title: 'FormatFloat — non-integer only',
      isType: () => createIsType<FormatFloat>(),
      getTypeErrors: () => createGetTypeErrors<FormatFloat>(),
      mockType: () => createMockType<FormatFloat>(),
      getSamples: () => ({valid: [1.5, -0.5, 3.14], invalid: [1, 0, -2]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: true, formatPathTail: 'float'},
        {name: 'numberFormat', val: true, formatPathTail: 'float'},
        {name: 'numberFormat', val: true, formatPathTail: 'float'},
      ],
    },
    number_multipleOf: {
      title: 'FormatNumber<{multipleOf: 5}> — divisible by 5',
      isType: () => createIsType<FormatNumber<{multipleOf: 5}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatNumber<{multipleOf: 5}>>(),
      mockType: () => createMockType<FormatNumber<{multipleOf: 5}>>(),
      getSamples: () => ({valid: [0, 5, 10, -15], invalid: [3, 7]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
        {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
      ],
    },
    number_combined: {
      title: 'FormatNumber<{min:0; max:100; integer:true; multipleOf:5}> — all constraints',
      isType: () => createIsType<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
      mockType: () => createMockType<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
      getSamples: () => ({valid: [0, 5, 50, 100], invalid: [-5, 105, 7, 2.5]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', formatPathTail: 'min'},
        {name: 'numberFormat', formatPathTail: 'max'},
        {name: 'numberFormat', formatPathTail: 'multipleOf'},
        {name: 'numberFormat', formatPathTail: 'integer'},
      ],
    },
    number_int8: {
      title: 'FormatInt8 — signed 8-bit range',
      isType: () => createIsType<FormatInt8>(),
      getTypeErrors: () => createGetTypeErrors<FormatInt8>(),
      mockType: () => createMockType<FormatInt8>(),
      getSamples: () => ({valid: [-128, 0, 127], invalid: [128, -129, 1.5]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: 127, formatPathTail: 'max'},
        {name: 'numberFormat', val: -128, formatPathTail: 'min'},
        {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      ],
    },
    number_uint8: {
      title: 'FormatUInt8 — unsigned 8-bit range',
      isType: () => createIsType<FormatUInt8>(),
      getTypeErrors: () => createGetTypeErrors<FormatUInt8>(),
      mockType: () => createMockType<FormatUInt8>(),
      getSamples: () => ({valid: [0, 128, 255], invalid: [256, -1]}),
      expectedFormatErrors: () => [
        {name: 'numberFormat', val: 255, formatPathTail: 'max'},
        {name: 'numberFormat', val: 0, formatPathTail: 'min'},
      ],
    },
  },
  BIGINT_FORMAT: {
    bigint_max: {
      title: 'FormatBigInt<{max: 100n}> — inclusive upper bound',
      isType: () => createIsType<FormatBigInt<{max: 100n}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt<{max: 100n}>>(),
      mockType: () => createMockType<FormatBigInt<{max: 100n}>>(),
      getSamples: () => ({valid: [100n, 0n, -50n], invalid: [101n, 5]}),
      expectedFormatErrors: () => [{name: 'bigintFormat', val: 100n, formatPathTail: 'max'}, null],
    },
    bigint_min: {
      title: 'FormatBigInt<{min: 0n}> — inclusive lower bound',
      isType: () => createIsType<FormatBigInt<{min: 0n}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt<{min: 0n}>>(),
      mockType: () => createMockType<FormatBigInt<{min: 0n}>>(),
      getSamples: () => ({valid: [0n, 1n, 9999n], invalid: [-1n]}),
      expectedFormatErrors: () => [{name: 'bigintFormat', val: 0n, formatPathTail: 'min'}],
    },
    bigint_lt: {
      title: 'FormatBigInt<{lt: 10n}> — exclusive upper bound',
      isType: () => createIsType<FormatBigInt<{lt: 10n}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt<{lt: 10n}>>(),
      mockType: () => createMockType<FormatBigInt<{lt: 10n}>>(),
      getSamples: () => ({valid: [9n, -5n], invalid: [10n, 11n]}),
      expectedFormatErrors: () => [
        {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
        {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
      ],
    },
    bigint_gt: {
      title: 'FormatBigInt<{gt: 0n}> — exclusive lower bound',
      isType: () => createIsType<FormatBigInt<{gt: 0n}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt<{gt: 0n}>>(),
      mockType: () => createMockType<FormatBigInt<{gt: 0n}>>(),
      getSamples: () => ({valid: [1n, 100n], invalid: [0n, -1n]}),
      expectedFormatErrors: () => [
        {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
        {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
      ],
    },
    bigint_multipleOf: {
      title: 'FormatBigInt<{multipleOf: 5n}> — divisible by 5',
      isType: () => createIsType<FormatBigInt<{multipleOf: 5n}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt<{multipleOf: 5n}>>(),
      mockType: () => createMockType<FormatBigInt<{multipleOf: 5n}>>(),
      getSamples: () => ({valid: [0n, 5n, -15n], invalid: [3n, 7n]}),
      expectedFormatErrors: () => [
        {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
        {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
      ],
    },
    bigint_combined: {
      title: 'FormatBigInt<{min:0n; max:1000n; multipleOf:10n}> — all constraints',
      isType: () => createIsType<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
      mockType: () => createMockType<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
      getSamples: () => ({valid: [0n, 10n, 1000n], invalid: [-10n, 1010n, 7n]}),
      expectedFormatErrors: () => [
        {name: 'bigintFormat', formatPathTail: 'min'},
        {name: 'bigintFormat', formatPathTail: 'max'},
        {name: 'bigintFormat', formatPathTail: 'multipleOf'},
      ],
    },
    bigint_int64: {
      title: 'FormatBigInt64 — full signed 64-bit range',
      isType: () => createIsType<FormatBigInt64>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigInt64>(),
      mockType: () => createMockType<FormatBigInt64>(),
      getSamples: () => ({
        valid: [-9223372036854775808n, 0n, 9223372036854775807n],
        invalid: [9223372036854775808n, -9223372036854775809n],
      }),
      expectedFormatErrors: () => [
        {name: 'bigintFormat', val: 9223372036854775807n, formatPathTail: 'max'},
        {name: 'bigintFormat', val: -9223372036854775808n, formatPathTail: 'min'},
      ],
    },
    bigint_uint64: {
      title: 'FormatBigUInt64 — full unsigned 64-bit range',
      isType: () => createIsType<FormatBigUInt64>(),
      getTypeErrors: () => createGetTypeErrors<FormatBigUInt64>(),
      mockType: () => createMockType<FormatBigUInt64>(),
      getSamples: () => ({valid: [0n, 18446744073709551615n], invalid: [18446744073709551616n, -1n]}),
      expectedFormatErrors: () => [
        {name: 'bigintFormat', val: 18446744073709551615n, formatPathTail: 'max'},
        {name: 'bigintFormat', val: 0n, formatPathTail: 'min'},
      ],
    },
  },
};
