// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
import * as TF from 'ts-runtypes/formats';
import type {FormatValidationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createValidate, createGetValidationErrors, createMockType, registerFormatPattern, type DataOnly} from 'ts-runtypes';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

// Custom patterns registered once at module load — the call sites the
// Go scanner recovers {source, flags, mockSamples} from. Mirrors the
// `registerFormatPattern` block in the old stringFormats.test.ts.
const slug = registerFormatPattern({
  source: '^[a-z0-9-]+$',
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});
type Slug = TF.String<{pattern: typeof slug}>;

const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = TF.String<{pattern: typeof hex}>;

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 4
const V7 = '018f1b8c-2e3d-7b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 7

export const STRING_FORMAT = {
  // ─────────────────────────── TF.String ───────────────────────
  string_maxLength: {
    title: 'String maxLength',
    description: 'stringFormat with an inclusive upper-length bound that rejects strings longer than `maxLength`.',
    validateNotes:
      'Length 5 passes (`hello`); 6 chars (`hello!`) fails with `val` 5 (`maxLength`). A non-string (42) fails the string typeof gate before any format check. Empty string passes.',
    validate: () => createValidate<TF.String<{maxLength: 5}>>(),
    validateReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{maxLength: 5}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{maxLength: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{maxLength: 5}>>>(),
    validateSchema: () => createValidate(TF.string({maxLength: 5})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{maxLength: 5}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.String<{maxLength: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({maxLength: 5})),
    mockType: () => createMockType<TF.String<{maxLength: 5}>>(),
    getSamples: () => ({valid: ['', 'hello'], invalid: ['hello!', 42]}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 5}, null],
  },
  string_minLength: {
    title: 'String minLength',
    description: 'stringFormat with an inclusive lower-length bound that rejects strings shorter than `minLength`.',
    validateNotes: 'Length 3 passes (`abc`); 2 chars (`ab`) and the empty string both fail with `val` 3 (`minLength`).',
    validate: () => createValidate<TF.String<{minLength: 3}>>(),
    validateReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{minLength: 3}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{minLength: 3}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{minLength: 3}>>>(),
    validateSchema: () => createValidate(TF.string({minLength: 3})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{minLength: 3}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.String<{minLength: 3}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({minLength: 3})),
    mockType: () => createMockType<TF.String<{minLength: 3}>>(),
    getSamples: () => ({valid: ['abc', 'abcd'], invalid: ['ab', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 3},
    ],
  },
  string_length: {
    title: 'String length',
    description: 'stringFormat requiring an exact length that rejects anything not exactly `length` chars.',
    validateNotes: 'Only length 4 passes (`abcd`); both 3 chars (`abc`) and 5 chars (`abcde`) fail with `val` 4 (`length`).',
    validate: () => createValidate<TF.String<{length: 4}>>(),
    validateReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{length: 4}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{length: 4}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{length: 4}>>>(),
    validateSchema: () => createValidate(TF.string({length: 4})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{length: 4}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.String<{length: 4}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({length: 4})),
    mockType: () => createMockType<TF.String<{length: 4}>>(),
    getSamples: () => ({valid: ['abcd'], invalid: ['abc', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 4},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_range: {
    title: 'String length range',
    description: 'stringFormat with both inclusive length bounds, accepting lengths in `[minLength, maxLength]`.',
    validateNotes:
      'Boundary lengths 2 (`ab`) and 4 (`abcd`) pass (inclusive). 1 char (`a`) fails with `val` 2 (`minLength`); 5 chars (`abcde`) fails with `val` 4 (`maxLength`).',
    validate: () => createValidate<TF.String<{minLength: 2; maxLength: 4}>>(),
    validateReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{minLength: 2; maxLength: 4}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{minLength: 2; maxLength: 4}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{minLength: 2; maxLength: 4}>>>(),
    validateSchema: () => createValidate(TF.string({minLength: 2, maxLength: 4})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{minLength: 2; maxLength: 4}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.String<{minLength: 2; maxLength: 4}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({minLength: 2, maxLength: 4})),
    mockType: () => createMockType<TF.String<{minLength: 2; maxLength: 4}>>(),
    getSamples: () => ({valid: ['ab', 'abcd'], invalid: ['a', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 2},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_allowedChars: {
    title: 'String allowedChars',
    description: 'stringFormat restricting every char to the `allowedChars` set (hex digits), rejecting any out-of-set char.',
    validateNotes: [
      'Each character must be in `0123456789abcdef`; `deadbeef` and `0042` pass.',
      '`xyz` fails with `val` `Invalid characters`.',
      'The space in `dead beef` is not in the set, so it also fails. The empty string passes (no chars to check).',
    ],
    validate: () => createValidate<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedChars: {val: '0123456789abcdef'}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({allowedChars: {val: '0123456789abcdef'}})),
    mockType: () => createMockType<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
  },
  string_allowedChars_ignoreCase: {
    title: 'String allowedChars ignoreCase',
    description: 'stringFormat allowedChars with `ignoreCase` so both cases of the `abc` set are accepted.',
    validateNotes:
      'Case-folded: `ABC` and `aAbBcC` pass even though only lowercase `abc` was listed. `abcd` fails with `val` `Invalid characters` (`d` not in the set).',
    validate: () => createValidate<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    mockType: () => createMockType<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_allowedChars_literal: {
    title: 'String allowedChars literal',
    description: 'stringFormat allowedChars where regex-special chars are matched literally so only `.` and `-` pass.',
    validateNotes:
      'The set `.-` is treated as literal chars (NOT a regex range), so `...---` passes. `a` fails with `val` `Invalid characters`.',
    validate: () => createValidate<TF.String<{allowedChars: {val: '.-'}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedChars: {val: '.-'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{allowedChars: {val: '.-'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{allowedChars: {val: '.-'}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedChars: {val: '.-'}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{allowedChars: {val: '.-'}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.String<{allowedChars: {val: '.-'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({allowedChars: {val: '.-'}})),
    mockType: () => createMockType<TF.String<{allowedChars: {val: '.-'}}>>(),
    getSamples: () => ({valid: ['...---'], invalid: ['a']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_disallowedChars: {
    title: 'String disallowedChars',
    description: 'stringFormat blacklisting the `disallowedChars` set (`!@#`) so any occurrence rejects the string.',
    validateNotes:
      'A string passes only if it contains none of `!`, `@`, `#`; `hello` passes. `hi!` and `a@b` each fail with `val` `Invalid characters`.',
    validate: () => createValidate<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    validateReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    validateSchema: () => createValidate(TF.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    mockType: () => createMockType<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getSamples: () => ({valid: ['hello'], invalid: ['hi!', 'a@b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid characters'},
      {name: 'stringFormat', val: 'Invalid characters'},
    ],
  },
  string_allowedValues: {
    title: 'String allowedValues',
    description: 'stringFormat restricting the whole value to a fixed set (`red`/`green`/`blue`) via enum-like exact match.',
    validateNotes: [
      'The entire string must equal one listed value; `red` and `blue` pass.',
      '`yellow` (not listed) fails with `val` `Invalid value`.',
      'Match is case-sensitive (`RED` fails) and whole-string (`redgreen` fails — no substring/concat).',
    ],
    validate: () => createValidate<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    mockType: () => createMockType<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
  },
  string_allowedValues_ignoreCase: {
    title: 'String allowedValues ignoreCase',
    description: 'stringFormat allowedValues with `ignoreCase` so the fixed set matches regardless of case.',
    validateNotes:
      'Case-folded equality: `RED` and `Green` pass. `blue` (not in the `red`/`green` set) fails with `val` `Invalid value`.',
    validate: () => createValidate<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(TF.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    mockType: () => createMockType<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}],
  },
  string_allowedValues_escaped: {
    title: 'String allowedValues literal',
    description: 'stringFormat allowedValues where regex-special chars in the set are matched literally.',
    validateNotes:
      'Listed values `a.b` and `c+d` match literally (the `.` and `+` are not regex metacharacters), so they pass. `axb` and `ccd` each fail with `val` `Invalid value`.',
    validate: () => createValidate<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedValues: {val: ['a.b', 'c+d']}})),
    getValidationErrors: () => createGetValidationErrors<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string({allowedValues: {val: ['a.b', 'c+d']}})),
    mockType: () => createMockType<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getSamples: () => ({valid: ['a.b', 'c+d'], invalid: ['axb', 'ccd']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_disallowedValues: {
    title: 'String disallowedValues',
    description: 'stringFormat blacklisting whole values (`admin`/`root`) so any other string passes.',
    validateNotes:
      'A string passes unless it exactly equals a blacklisted value; `alice` passes. `admin` and `root` each fail with `val` `Invalid value`.',
    validate: () => createValidate<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    validateReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
    validateSchema: () => createValidate(TF.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    getValidationErrors: () =>
      createGetValidationErrors<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(TF.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    mockType: () => createMockType<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getSamples: () => ({valid: ['alice'], invalid: ['admin', 'root']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_customErrorMessage: {
    title: 'String custom errorMessage',
    description: 'stringFormat allowedValues with a custom `errorMessage` that surfaces as the format error `val` on failure.',
    validateNotes:
      '`a` and `b` pass. `c` fails with `val` `pick a or b` — the custom `errorMessage` replaces the default `Invalid value`.',
    validate: () => createValidate<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    validateSchema: () => createValidate(TF.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    getValidationErrors: () =>
      createGetValidationErrors<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(TF.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    mockType: () => createMockType<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
  },

  // ─────────────────────── Default string formats ─────────────────
  alpha: {
    title: 'Alpha',
    description: 'TF.Alpha (stringFormat with a baked letters-only pattern) that rejects digits, spaces, and symbols.',
    validateNotes: [
      'Only ASCII letters pass; `Hello` and `abcXYZ` pass.',
      'A digit (`hello1`) or space (`hi there`) fails with `val` `Invalid pattern`.',
      'The empty string passes (the pattern allows zero letters).',
    ],
    validate: () => createValidate<TF.Alpha>(),
    validateReflect: () => {
      const v: TF.Alpha = 'Hello';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Alpha>(),
    deserializeValidateReflect: () => {
      const v: TF.Alpha = 'Hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Alpha = 'Hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Alpha>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Alpha = 'Hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Alpha = 'Hello';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Alpha>>(),
    validateSchema: () => createValidate(TF.alpha()),
    getValidationErrors: () => createGetValidationErrors<TF.Alpha>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Alpha>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.alpha()),
    mockType: () => createMockType<TF.Alpha>(),
    getSamples: () => ({valid: ['Hello', 'abcXYZ'], invalid: ['hello1', 'hi there', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid pattern'}, null, null],
  },
  alphaNumeric: {
    title: 'AlphaNumeric',
    description: 'TF.AlphaNumeric (stringFormat with a baked letters+digits pattern) that rejects everything else.',
    validateNotes:
      'Letters and digits pass (`abc123`, `ABC`, `123`); a hyphen (`a-b`) or space (`a b`) fails with `val` `Invalid pattern`.',
    validate: () => createValidate<TF.AlphaNumeric>(),
    validateReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.AlphaNumeric>(),
    deserializeValidateReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.AlphaNumeric>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.AlphaNumeric>>(),
    validateSchema: () => createValidate(TF.alphaNumeric()),
    getValidationErrors: () => createGetValidationErrors<TF.AlphaNumeric>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.AlphaNumeric>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.alphaNumeric()),
    mockType: () => createMockType<TF.AlphaNumeric>(),
    getSamples: () => ({valid: ['abc123', 'ABC', '123'], invalid: ['a-b', 'a b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  numeric: {
    title: 'Numeric',
    description: 'TF.Numeric (stringFormat with a baked digits-only pattern) that rejects non-digit chars.',
    validateNotes:
      'Only digit chars pass (`12345`, `007` — leading zeros allowed since it is a string). A decimal point (`12.3`) or letter (`12a`) fails with `val` `Invalid pattern`.',
    validate: () => createValidate<TF.Numeric>(),
    validateReflect: () => {
      const v: TF.Numeric = '12345';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Numeric>(),
    deserializeValidateReflect: () => {
      const v: TF.Numeric = '12345';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Numeric = '12345';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Numeric>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Numeric = '12345';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Numeric = '12345';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Numeric>>(),
    validateSchema: () => createValidate(TF.numeric()),
    getValidationErrors: () => createGetValidationErrors<TF.Numeric>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Numeric>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.numeric()),
    mockType: () => createMockType<TF.Numeric>(),
    getSamples: () => ({valid: ['12345', '007'], invalid: ['12.3', '12a']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  alpha_withLength: {
    title: 'Alpha with maxLength',
    description: 'TF.Alpha carrying a `maxLength` param that enforces letters-only AND an inclusive upper-length bound.',
    validateNotes:
      '`abc` (3 letters) passes. `abcd` exceeds the bound and fails with `val` 3 (`maxLength`); `a1` is within length but the digit fails the pattern with `val` `Invalid pattern`.',
    validate: () => createValidate<TF.Alpha<{maxLength: 3}>>(),
    validateReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Alpha<{maxLength: 3}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Alpha<{maxLength: 3}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Alpha<{maxLength: 3}>>>(),
    validateSchema: () => createValidate(TF.alpha({maxLength: 3})),
    getValidationErrors: () => createGetValidationErrors<TF.Alpha<{maxLength: 3}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Alpha<{maxLength: 3}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.alpha({maxLength: 3})),
    mockType: () => createMockType<TF.Alpha<{maxLength: 3}>>(),
    getSamples: () => ({valid: ['abc'], invalid: ['abcd', 'a1']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  lowercase_validate: {
    title: 'Lowercase',
    description: 'TF.Lowercase (transformer-only `lowercase` flag) that validate treats as a plain string.',
    validateNotes:
      'The lowercase transform applies only via createFormatTransform, NOT validate — so ANY string passes regardless of case (`already lower` AND `HasUpper` pass). Only a non-string (42) fails, via the typeof gate.',
    validate: () => createValidate<TF.Lowercase>(),
    validateReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Lowercase>(),
    deserializeValidateReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Lowercase>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Lowercase>>(),
    validateSchema: () => createValidate(TF.lowercase()),
    getValidationErrors: () => createGetValidationErrors<TF.Lowercase>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Lowercase>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.lowercase()),
    mockType: () => createMockType<TF.Lowercase>(),
    getSamples: () => ({valid: ['already lower', 'HasUpper'], invalid: [42]}),
    expectedFormatErrors: () => [null],
  },

  // ─────────────────────────────── UUID ───────────────────────────
  uuidv4: {
    title: 'UUID v4',
    description: 'TF.UUIDv4 (format `uuid`, version `4`) accepting only version-4 UUIDs and rejecting v7 and malformed input.',
    validateNotes: [
      'Only a well-formed v4 UUID passes; the version nibble must be `4`.',
      'A v7 UUID fails with `val` `4`; a non-UUID string (`not-a-uuid`) also fails with `val` `4`.',
      'The empty string, a hyphen-stripped UUID, and a non-string (123) are all rejected.',
    ],
    validate: () => createValidate<TF.UUIDv4>(),
    validateReflect: () => {
      const v: TF.UUIDv4 = V4;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UUIDv4>(),
    deserializeValidateReflect: () => {
      const v: TF.UUIDv4 = V4;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UUIDv4 = V4;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UUIDv4>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UUIDv4 = V4;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UUIDv4 = V4;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.UUIDv4>>(),
    validateSchema: () => createValidate(TF.uuidv4()),
    getValidationErrors: () => createGetValidationErrors<TF.UUIDv4>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.UUIDv4>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.uuidv4()),
    mockType: () => createMockType<TF.UUIDv4>(),
    getSamples: () => ({valid: [V4], invalid: [V7, 'not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '4'}, {name: 'uuid', val: '4'}, null, null, null],
  },
  uuidv7: {
    title: 'UUID v7',
    description: 'TF.UUIDv7 (format `uuid`, version `7`) accepting only version-7 UUIDs and rejecting v4.',
    validateNotes: 'The version nibble must be `7`; a valid v4 UUID fails with `val` `7`.',
    validate: () => createValidate<TF.UUIDv7>(),
    validateReflect: () => {
      const v: TF.UUIDv7 = V7;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UUIDv7>(),
    deserializeValidateReflect: () => {
      const v: TF.UUIDv7 = V7;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UUIDv7 = V7;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UUIDv7>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UUIDv7 = V7;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UUIDv7 = V7;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.UUIDv7>>(),
    validateSchema: () => createValidate(TF.uuidv7()),
    getValidationErrors: () => createGetValidationErrors<TF.UUIDv7>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.UUIDv7>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.uuidv7()),
    mockType: () => createMockType<TF.UUIDv7>(),
    getSamples: () => ({valid: [V7], invalid: [V4]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '7'}],
  },

  // ─────────────────────────────── Date ───────────────────────────
  date_iso: {
    title: 'String date ISO',
    description: 'TF.StringDate (format `date`) with the default ISO `YYYY-MM-DD` layout that enforces calendar validity.',
    validateNotes: [
      'Default layout is ISO `YYYY-MM-DD`; the format error `val` is `ISO`.',
      'Calendar validity is enforced: `2023-02-29` (not a leap year), `2024-13-01` (month 13), and `2024-04-31` (April has 30 days) all fail.',
      'Width is exact — `2024-1-1` (single-digit month/day) fails; `not-a-date` fails. `0001-01-01` is accepted.',
    ],
    validate: () => createValidate<TF.StringDate>(),
    validateReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringDate>>(),
    validateSchema: () => createValidate(TF.stringDate()),
    getValidationErrors: () => createGetValidationErrors<TF.StringDate>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringDate>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringDate()),
    mockType: () => createMockType<TF.StringDate>(),
    getSamples: () => ({
      valid: ['2024-02-29', '2026-05-28', '0001-01-01'],
      invalid: ['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-1', 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'date', val: 'ISO'}, null, null, null, null],
  },
  date_DMY: {
    title: 'String date DMY',
    description: 'TF.StringDate with the `DD-MM-YYYY` layout using day-first ordering plus calendar validity.',
    validateNotes:
      'Layout is `DD-MM-YYYY` (format error `val` `DD-MM-YYYY`); `29-02-2024` passes. An ISO-ordered string (`2024-02-29`) fails the layout, and `31-04-2024` fails calendar validity (April has 30 days).',
    validate: () => createValidate<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringDate<{format: 'DD-MM-YYYY'}>>>(),
    validateSchema: () => createValidate(TF.stringDate({format: 'DD-MM-YYYY'})),
    getValidationErrors: () => createGetValidationErrors<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringDate<{format: 'DD-MM-YYYY'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringDate({format: 'DD-MM-YYYY'})),
    mockType: () => createMockType<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    getSamples: () => ({valid: ['29-02-2024'], invalid: ['2024-02-29', '31-04-2024']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'DD-MM-YYYY'},
      {name: 'date', val: 'DD-MM-YYYY'},
    ],
  },
  date_YM: {
    title: 'String date YM',
    description: 'TF.StringDate with the `YYYY-MM` layout (year-month, no day component).',
    validateNotes:
      'Layout is `YYYY-MM` (format error `val` `YYYY-MM`); `2024-02` passes. Month 13 (`2024-13`) fails, and supplying a day (`2024-02-29`) fails the layout.',
    validate: () => createValidate<TF.StringDate<{format: 'YYYY-MM'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'YYYY-MM'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate<{format: 'YYYY-MM'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringDate<{format: 'YYYY-MM'}>>>(),
    validateSchema: () => createValidate(TF.stringDate({format: 'YYYY-MM'})),
    getValidationErrors: () => createGetValidationErrors<TF.StringDate<{format: 'YYYY-MM'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringDate<{format: 'YYYY-MM'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringDate({format: 'YYYY-MM'})),
    mockType: () => createMockType<TF.StringDate<{format: 'YYYY-MM'}>>(),
    getSamples: () => ({valid: ['2024-02'], invalid: ['2024-13', '2024-02-29']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'YYYY-MM'},
      {name: 'date', val: 'YYYY-MM'},
    ],
  },
  date_MD: {
    title: 'String date MD',
    description: 'TF.StringDate with the `MM-DD` layout (month-day, no year component).',
    validateNotes: 'Layout is `MM-DD` (format error `val` `MM-DD`); `02-29` passes. Month 13 (`13-01`) fails.',
    validate: () => createValidate<TF.StringDate<{format: 'MM-DD'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'MM-DD'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate<{format: 'MM-DD'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringDate<{format: 'MM-DD'}>>>(),
    validateSchema: () => createValidate(TF.stringDate({format: 'MM-DD'})),
    getValidationErrors: () => createGetValidationErrors<TF.StringDate<{format: 'MM-DD'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringDate<{format: 'MM-DD'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringDate({format: 'MM-DD'})),
    mockType: () => createMockType<TF.StringDate<{format: 'MM-DD'}>>(),
    getSamples: () => ({valid: ['02-29'], invalid: ['13-01']}),
    expectedFormatErrors: () => [{name: 'date', val: 'MM-DD'}],
  },
  date_minMax_absolute: {
    title: 'String date min/max',
    description: 'TF.StringDate with inclusive absolute `min`/`max` date bounds, accepting dates within [`min`, `max`].',
    validateNotes:
      'Bounds `2020-01-01`..`2020-12-31` are inclusive — both endpoints pass. `2019-12-31` fails on `min` (formatPathTail `min`); `2021-01-01` fails on `max` (formatPathTail `max`).',
    validate: () => createValidate<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(TF.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    getValidationErrors: () =>
      createGetValidationErrors<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(TF.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    // mockType must respect the bounds — assertMockType re-validates every
    // generated value through validate, so an out-of-range mock would fail.
    mockType: () => createMockType<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
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
    title: 'String time ISO',
    description:
      'TF.StringTime (format `time`) with the default tz-aware ISO layout that requires a timezone and valid time fields.',
    validateNotes: [
      'Default ISO layout (format error `val` `ISO`) requires a tz suffix; `12:30:45Z`, `12:30:45.123Z` (ms), and offset forms like `+05:30` / `-08:00` pass.',
      'A tz-less time (`12:30:45`) fails. Field ranges are enforced: hour 24 (`24:00:00Z`) and minute 60 (`12:60:00Z`) both fail.',
    ],
    validate: () => createValidate<TF.StringTime>(),
    validateReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringTime>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringTime>>(),
    validateSchema: () => createValidate(TF.stringTime()),
    getValidationErrors: () => createGetValidationErrors<TF.StringTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringTime()),
    mockType: () => createMockType<TF.StringTime>(),
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
    title: 'String time HHmmss',
    description: 'TF.StringTime with the fixed `HH:mm:ss` layout (no tz, no milliseconds).',
    validateNotes:
      '`23:59:59` passes. Out-of-range fields (`99:99:99`) fail with `val` `HH:mm:ss`; a missing seconds component (`23:59`) and hour 24 (`24:00:00`) are also rejected.',
    validate: () => createValidate<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    validateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringTime<{format: 'HH:mm:ss'}>>>(),
    validateSchema: () => createValidate(TF.stringTime({format: 'HH:mm:ss'})),
    getValidationErrors: () => createGetValidationErrors<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringTime<{format: 'HH:mm:ss'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringTime({format: 'HH:mm:ss'})),
    mockType: () => createMockType<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    getSamples: () => ({valid: ['23:59:59'], invalid: ['99:99:99', '23:59', '24:00:00']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss'}, null, null],
  },
  time_HHmmss_ms: {
    title: 'String time with ms',
    description: 'TF.StringTime with the `HH:mm:ss[.mmm]` layout where milliseconds are optional and capped at 3 digits.',
    validateNotes:
      'Milliseconds are optional — both `12:30:45` and `12:30:45.999` pass. A 4-digit fraction (`12:30:45.9999`) exceeds the `.mmm` width and fails with `val` `HH:mm:ss[.mmm]`.',
    validate: () => createValidate<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    validateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    validateSchema: () => createValidate(TF.stringTime({format: 'HH:mm:ss[.mmm]'})),
    getValidationErrors: () => createGetValidationErrors<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringTime({format: 'HH:mm:ss[.mmm]'})),
    mockType: () => createMockType<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getSamples: () => ({valid: ['12:30:45', '12:30:45.999'], invalid: ['12:30:45.9999']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss[.mmm]'}],
  },
  time_minMax_absolute: {
    title: 'String time min/max',
    description:
      'TF.StringTime with inclusive absolute `min`/`max` time bounds (HH:mm, business hours), accepting times within [`min`, `max`].',
    validateNotes:
      'Bounds `09:00`..`17:00` are inclusive — both endpoints pass. `08:59` fails on `min` (formatPathTail `min`); `17:01` fails on `max` (formatPathTail `max`).',
    validate: () => createValidate<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    validateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    validateSchema: () => createValidate(TF.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    getValidationErrors: () => createGetValidationErrors<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    mockType: () => createMockType<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
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
    title: 'String dateTime default',
    description:
      'TF.StringDateTime (format `dateTime`) with the default ISO layout: ISO date, `T` split char, ISO tz-aware time.',
    validateNotes: [
      'Both halves must be individually valid and joined by `T`; `2024-02-29T12:30:45Z` passes.',
      'A space separator (`2024-02-29 12:30:45Z`) fails on the split char (formatPathTail `splitChar`).',
      'A non-leap date (`2023-02-29`), an out-of-range hour (`25:30:45`), and `not-a-datetime` are all rejected.',
    ],
    validate: () => createValidate<TF.StringDateTime>(),
    validateReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDateTime>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDateTime>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.StringDateTime>>(),
    validateSchema: () => createValidate(TF.stringDateTime()),
    getValidationErrors: () => createGetValidationErrors<TF.StringDateTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.StringDateTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.stringDateTime()),
    mockType: () => createMockType<TF.StringDateTime>(),
    getSamples: () => ({
      valid: ['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00'],
      invalid: ['2024-02-29 12:30:45Z', '2023-02-29T12:30:45Z', '2024-02-29T25:30:45Z', 'not-a-datetime'],
    }),
    expectedFormatErrors: () => [{name: 'dateTime', formatPathTail: 'splitChar'}, null, null, null],
  },
  dateTime_custom: {
    title: 'String dateTime custom',
    description:
      'TF.StringDateTime with custom nested `date`/`time` layouts and a space `splitChar`, each part validated independently.',
    validateNotes: [
      'Layout is `DD-MM-YYYY` date + `HH:mm` time joined by a space; `29-02-2024 23:59` passes.',
      'An ISO-ordered date (`2024-02-29 23:59`) fails on the date half (formatPathTail `date`).',
      'A `T` separator (`29-02-2024T23:59`) fails the split char (formatPathTail `splitChar`); hour 24 (`29-02-2024 24:00`) fails the time half (formatPathTail `time`).',
    ],
    validate: () => createValidate<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    validateReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>>(),
    validateSchema: () =>
      createValidate(TF.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    getValidationErrors: () =>
      createGetValidationErrors<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(TF.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    mockType: () => createMockType<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
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
    title: 'String dateTime min/max',
    description: 'TF.StringDateTime with inclusive absolute `min`/`max` datetime bounds, accepting values within [`min`, `max`].',
    validateNotes:
      'Bounds `2020-01-01T00:00:00`..`2020-12-31T23:59:59` are inclusive — both endpoints pass. `2019-12-31T23:59:59` fails on `min` (formatPathTail `min`); `2021-01-01T00:00:00` fails on `max` (formatPathTail `max`).',
    validate: () =>
      createValidate<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    validateReflect: () => {
      const v: TF.StringDateTime<{
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
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    deserializeValidateReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{
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
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '2020-01-01T00:00:00';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDateTime<{
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
          TF.StringDateTime<{
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
        TF.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    getValidationErrors: () =>
      createGetValidationErrors<
        TF.StringDateTime<{
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
          TF.StringDateTime<{
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
        TF.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    mockType: () =>
      createMockType<
        TF.StringDateTime<{
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
    title: 'IPv4',
    description: 'TF.IPv4 (format `ip`, version 4) accepting dotted-quad IPv4 addresses only.',
    validateNotes: [
      'Each octet must be 0–255; `192.168.0.1`, `0.0.0.0`, and `255.255.255.255` pass.',
      'Out-of-range octets (`999.999.999.999`, `256.0.0.1`), a 3-octet address (`1.2.3`), and an IPv6 address (`::1`) all fail; the first failure carries `val` 4.',
    ],
    validate: () => createValidate<TF.IPv4>(),
    validateReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv4>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv4>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.IPv4>>(),
    validateSchema: () => createValidate(TF.ipv4()),
    getValidationErrors: () => createGetValidationErrors<TF.IPv4>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.IPv4>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.ipv4()),
    mockType: () => createMockType<TF.IPv4>(),
    getSamples: () => ({
      valid: ['192.168.0.1', '0.0.0.0', '255.255.255.255'],
      invalid: ['999.999.999.999', '256.0.0.1', '1.2.3', '::1'],
    }),
    expectedFormatErrors: () => [{name: 'ip', val: 4}, null, null, null],
  },
  ipv6: {
    title: 'IPv6',
    description:
      'TF.IPv6 (format `ip`, version 6) accepting colon-separated IPv6 addresses including `::` compression and loopback.',
    validateNotes:
      'Full, compressed (`::1`), and link-local (`fe80::1`) forms pass. An IPv4 address (`192.168.0.1`) and a group exceeding 4 hex digits (`12345::1`) each fail with `val` 6.',
    validate: () => createValidate<TF.IPv6>(),
    validateReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv6>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv6>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.IPv6>>(),
    validateSchema: () => createValidate(TF.ipv6()),
    getValidationErrors: () => createGetValidationErrors<TF.IPv6>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.IPv6>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.ipv6()),
    mockType: () => createMockType<TF.IPv6>(),
    getSamples: () => ({valid: ['2001:db8:0:0:0:0:0:1', '::1', 'fe80::1'], invalid: ['192.168.0.1', '12345::1']}),
    expectedFormatErrors: () => [
      {name: 'ip', val: 6},
      {name: 'ip', val: 6},
    ],
  },
  ip_any: {
    title: 'IP any',
    description: 'TF.IP (format `ip`, version `any`) accepting either an IPv4 or an IPv6 address.',
    validateNotes:
      'Both `10.0.0.1` (v4) and `2001:db8::1` (v6) pass. A non-IP string (`definitely not an ip`) fails with `val` `any`.',
    validate: () => createValidate<TF.IP>(),
    validateReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IP>(),
    deserializeValidateReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IP>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.IP>>(),
    validateSchema: () => createValidate(TF.ip()),
    getValidationErrors: () => createGetValidationErrors<TF.IP>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.IP>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.ip()),
    mockType: () => createMockType<TF.IP>(),
    getSamples: () => ({valid: ['10.0.0.1', '2001:db8::1'], invalid: ['definitely not an ip']}),
    expectedFormatErrors: () => [{name: 'ip', val: 'any'}],
  },
  ipv4_port: {
    title: 'IPv4 with port',
    description: 'TF.IPv4WithPort (format `ip`, version 4, port allowed) accepting `ipv4:port`.',
    validateNotes:
      'The port must be in range; `192.168.0.1:8080` passes, while `192.168.0.1:70000` (port > 65535) fails with `val` 4.',
    validate: () => createValidate<TF.IPv4WithPort>(),
    validateReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv4WithPort>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv4WithPort>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.IPv4WithPort>>(),
    validateSchema: () => createValidate(TF.ipv4WithPort()),
    getValidationErrors: () => createGetValidationErrors<TF.IPv4WithPort>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.IPv4WithPort>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.ipv4WithPort()),
    mockType: () => createMockType<TF.IPv4WithPort>(),
    getSamples: () => ({valid: ['192.168.0.1:8080'], invalid: ['192.168.0.1:70000']}),
    expectedFormatErrors: () => [{name: 'ip', val: 4}],
  },
  ipv6_port: {
    title: 'IPv6 with port',
    description: 'TF.IPv6WithPort (format `ip`, version 6, port allowed) accepting bracketed `[ipv6]:port`.',
    validateNotes:
      'The port must be in range; `[2001:db8::1]:443` passes, while `[2001:db8::1]:99999` (port > 65535) fails with `val` 6.',
    validate: () => createValidate<TF.IPv6WithPort>(),
    validateReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv6WithPort>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv6WithPort>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.IPv6WithPort>>(),
    validateSchema: () => createValidate(TF.ipv6WithPort()),
    getValidationErrors: () => createGetValidationErrors<TF.IPv6WithPort>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.IPv6WithPort>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.ipv6WithPort()),
    mockType: () => createMockType<TF.IPv6WithPort>(),
    getSamples: () => ({valid: ['[2001:db8::1]:443'], invalid: ['[2001:db8::1]:99999']}),
    expectedFormatErrors: () => [{name: 'ip', val: 6}],
  },

  // ────────────────────────────── Domain ──────────────────────────
  domain: {
    title: 'Domain',
    description: 'TF.Domain (format `domain`) enforcing the baked domain pattern plus `minLength` 5 / `maxLength` 253.',
    validateNotes: [
      'Multi-label hostnames pass (`mion.io`, `example.com`, `sub.example.co.uk`, `a-b.example.org`).',
      'Rejected: a bare label (`not-a-domain`), a leading dot (`.com`), a single-char TLD (`example.c`), a leading-hyphen label (`-bad.com`), an embedded space (`exa mple.com`), and the empty string. The format error is `{name: domain}` (no `val`).',
    ],
    validate: () => createValidate<TF.Domain>(),
    validateReflect: () => {
      const v: TF.Domain = 'mion.io';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Domain>(),
    deserializeValidateReflect: () => {
      const v: TF.Domain = 'mion.io';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Domain = 'mion.io';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Domain>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Domain = 'mion.io';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Domain = 'mion.io';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Domain>>(),
    validateSchema: () => createValidate(TF.domain()),
    getValidationErrors: () => createGetValidationErrors<TF.Domain>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Domain>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.domain()),
    mockType: () => createMockType<TF.Domain>(),
    getSamples: () => ({
      valid: ['mion.io', 'example.com', 'sub.example.co.uk', 'a-b.example.org'],
      invalid: ['not-a-domain', '.com', 'example.c', '-bad.com', 'exa mple.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null, null],
  },
  domainStrict: {
    title: 'Domain strict',
    description:
      'TF.DomainStrict (format `domain`) stricter than TF.Domain with ≤6 labels, ≥2 parts, strict name/TLD patterns, and hyphen-edge rejection.',
    validateNotes: [
      'Up to 6 labels pass (`mion.io`, `sub.example.com`, `aa.bb.cc.dd.ee.com`).',
      'Rejected: a leading-hyphen label (`-bad.com`), more than 6 labels (`aa.bb.cc.dd.ee.ff.com`), a numeric TLD (`example.123`), an underscore in a label (`ex_ample.com`), and a single-part name (`localhost`). The format error is `{name: domain}` (no `val`).',
    ],
    validate: () => createValidate<TF.DomainStrict>(),
    validateReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.DomainStrict>(),
    deserializeValidateReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.DomainStrict>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.DomainStrict>>(),
    validateSchema: () => createValidate(TF.domainStrict()),
    getValidationErrors: () => createGetValidationErrors<TF.DomainStrict>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.DomainStrict>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.domainStrict()),
    mockType: () => createMockType<TF.DomainStrict>(),
    getSamples: () => ({
      valid: ['mion.io', 'sub.example.com', 'aa.bb.cc.dd.ee.com'],
      invalid: ['-bad.com', 'aa.bb.cc.dd.ee.ff.com', 'example.123', 'ex_ample.com', 'localhost'],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null],
  },

  // ─────────────────────────────── Email ──────────────────────────
  email: {
    title: 'Email',
    description: 'TF.Email (format `email`) enforcing the baked email pattern plus `minLength` 7 / `maxLength` 254.',
    validateNotes: [
      'Standard addresses pass, including subaddressing (`user+tag@sub.example.org`).',
      'Rejected: no `@` (`not-an-email`), too short (`a@b.co`, below `minLength` 7), missing local part (`@example.com`), missing domain (`john@`), a TLD-less domain (`john@example`), an embedded space (`john doe@example.com`), and the empty string. The format error is `{name: email}` (no `val`).',
    ],
    validate: () => createValidate<TF.Email>(),
    validateReflect: () => {
      const v: TF.Email = 'john@example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Email>(),
    deserializeValidateReflect: () => {
      const v: TF.Email = 'john@example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Email = 'john@example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Email>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Email = 'john@example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Email = 'john@example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Email>>(),
    validateSchema: () => createValidate(TF.email()),
    getValidationErrors: () => createGetValidationErrors<TF.Email>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Email>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.email()),
    mockType: () => createMockType<TF.Email>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io', 'ab@cd.co', 'user+tag@sub.example.org'],
      invalid: ['not-an-email', 'a@b.co', '@example.com', 'john@', 'john@example', 'john doe@example.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'email'}, null, null, null, null, null, null],
  },
  emailPunycode: {
    title: 'Email punycode',
    description: 'TF.EmailPunycode (format `email`) whose email pattern additionally accepts punycode (`xn--`) domain labels.',
    validateNotes:
      'A punycode-TLD address (`john@example.xn--fiqs8s`) passes. A non-email string (`not-an-email`) fails with `{name: email}` (no `val`).',
    validate: () => createValidate<TF.EmailPunycode>(),
    validateReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.EmailPunycode>(),
    deserializeValidateReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.EmailPunycode>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.EmailPunycode>>(),
    validateSchema: () => createValidate(TF.emailPunycode()),
    getValidationErrors: () => createGetValidationErrors<TF.EmailPunycode>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.EmailPunycode>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.emailPunycode()),
    mockType: () => createMockType<TF.EmailPunycode>(),
    getSamples: () => ({valid: ['john@example.xn--fiqs8s'], invalid: ['not-an-email']}),
    expectedFormatErrors: () => [{name: 'email'}],
  },
  emailStrict: {
    title: 'Email strict',
    description:
      'TF.EmailStrict (format `email`) that splits on the last `@` then applies a strict local-part pattern plus strict domain.',
    validateNotes: [
      'Plain addresses pass (`john@example.com`, `jane.doe@mion.io`).',
      'A disallowed local-part char (`a+b@x.com`) fails with `val` `Invalid characters in email local part`.',
      'Also rejected: a space in the local part (`a b@example.com`), a doubled `@` (`john@@example.com`), an underscore in the domain (`john@bad_domain.com`), and no `@` at all (`no-at-symbol`).',
    ],
    validate: () => createValidate<TF.EmailStrict>(),
    validateReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.EmailStrict>(),
    deserializeValidateReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.EmailStrict>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.EmailStrict>>(),
    validateSchema: () => createValidate(TF.emailStrict()),
    getValidationErrors: () => createGetValidationErrors<TF.EmailStrict>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.EmailStrict>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.emailStrict()),
    mockType: () => createMockType<TF.EmailStrict>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io'],
      invalid: ['a+b@x.com', 'a b@example.com', 'john@@example.com', 'john@bad_domain.com', 'no-at-symbol'],
    }),
    expectedFormatErrors: () => [{name: 'email', val: 'Invalid characters in email local part'}, null, null, null, null],
  },

  // ──────────────────────────────── URL ───────────────────────────
  url: {
    title: 'URL',
    description: 'TF.Url (format `url`, `maxLength` 2048) accepting common schemes (http, ftp, ws/wss).',
    validateNotes: [
      'Multiple schemes pass (`https://`, `http://` with path+query, `ftp://`, `wss://`).',
      'Rejected: a scheme-less string (`not-a-url`), a bare host (`example.com`), a `mailto:` URI, and a scheme with no host (`https://`). The format error is `{name: url}` (no `val`).',
    ],
    validate: () => createValidate<TF.Url>(),
    validateReflect: () => {
      const v: TF.Url = 'https://example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Url>(),
    deserializeValidateReflect: () => {
      const v: TF.Url = 'https://example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Url = 'https://example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Url>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Url = 'https://example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Url = 'https://example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Url>>(),
    validateSchema: () => createValidate(TF.url()),
    getValidationErrors: () => createGetValidationErrors<TF.Url>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Url>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.url()),
    mockType: () => createMockType<TF.Url>(),
    getSamples: () => ({
      valid: ['https://example.com', 'http://mion.io/path?q=1', 'ftp://files.example.org', 'wss://socket.example.com'],
      invalid: ['not-a-url', 'example.com', 'mailto:john@example.com', 'https://'],
    }),
    expectedFormatErrors: () => [{name: 'url'}, null, null, null],
  },
  urlHttp: {
    title: 'URL http',
    description: 'TF.UrlHttp (format `url`) restricting the scheme to `http` / `https`.',
    validateNotes:
      'Both `https://example.com` and `http://example.com` pass; a non-http scheme (`ftp://example.com`) fails with `{name: url}` (no `val`).',
    validate: () => createValidate<TF.UrlHttp>(),
    validateReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UrlHttp>(),
    deserializeValidateReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UrlHttp>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.UrlHttp>>(),
    validateSchema: () => createValidate(TF.urlHttp()),
    getValidationErrors: () => createGetValidationErrors<TF.UrlHttp>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.UrlHttp>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.urlHttp()),
    mockType: () => createMockType<TF.UrlHttp>(),
    getSamples: () => ({valid: ['https://example.com', 'http://example.com'], invalid: ['ftp://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },
  urlFile: {
    title: 'URL file',
    description: 'TF.UrlFile (format `url`) restricting the scheme to `file:`.',
    validateNotes:
      'A `file:///etc/hosts` URL passes; a non-file scheme (`https://example.com`) fails with `{name: url}` (no `val`).',
    validate: () => createValidate<TF.UrlFile>(),
    validateReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UrlFile>(),
    deserializeValidateReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UrlFile>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.UrlFile>>(),
    validateSchema: () => createValidate(TF.urlFile()),
    getValidationErrors: () => createGetValidationErrors<TF.UrlFile>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.UrlFile>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.urlFile()),
    mockType: () => createMockType<TF.UrlFile>(),
    getSamples: () => ({valid: ['file:///etc/hosts'], invalid: ['https://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },

  // ─────────────────── registerFormatPattern ──────────────────
  pattern_slug: {
    title: 'Slug',
    description:
      'stringFormat with a registered `pattern` (slug `^[a-z0-9-]+$`, recovered from the call site) where only lowercase letters, digits, and hyphens pass.',
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
        TF.string({
          pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
        })
      ),
    getValidationErrors: () => createGetValidationErrors<Slug>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Slug>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        TF.string({
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
    title: 'Hex pattern',
    description:
      'stringFormat with a registered case-insensitive `pattern` (hex `^[0-9a-f]+$`, flag `i`) accepting hex digits in either case.',
    validateNotes:
      'The `i` flag folds case, so both `0042` and `DEADbeef` pass. A non-hex string (`xyz`) and the empty string each fail with `val` `Invalid pattern`.',
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
      createValidate(TF.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    getValidationErrors: () => createGetValidationErrors<Hex>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Hex>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(TF.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    mockType: () => createMockType<Hex>(),
    getSamples: () => ({valid: ['0042', 'DEADbeef'], invalid: ['xyz', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
