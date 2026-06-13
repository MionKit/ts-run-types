import * as TF from 'ts-runtypes/formats';
import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const TEMPLATE_LITERAL = {
  url_with_number_id: {
    title: 'Number placeholder',
    description:
      "templateLiteral.spec.ts 'URL pattern api/user/${number}': the `${number}` placeholder is compiled to `^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$` at RT-build time, and validate emits `typeof v === 'string' && regex.test(v)`.",
    validateNotes: [
      'Template literal types are compiled to a JS RegExp at build time and matched at runtime with `regex.test(v)`.',
      'The `${number}` placeholder expects digit-strings (`42`, `-7`, `3.14`) — NOT the words "NaN" or "Infinity" even though those are typeof "number" at the JS level.',
    ],
    validate: () => createValidate<`api/user/${number}`>(),
    validateDataOnly: () => createValidate<DataOnly<`api/user/${number}`>>(),
    validateSchema: () => createValidate(RT.templateLiteral(['api/user/', TF.number()])),
    deserializeValidate: () => deserializeValidate<`api/user/${number}`>(),
    validateReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<`api/user/${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<`api/user/${number}`>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.templateLiteral(['api/user/', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`api/user/${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<`api/user/${number}`>(),
    mockTypeReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['api/user/42', 'api/user/0', 'api/user/3.14', 'api/user/-7'],
      invalid: [
        'api/user/abc',
        '/api/user/42',
        'api/user/',
        42,
        null,
        'api/user/42x',
        undefined,
        '',
        'api/user/NaN', // NaN is a name, not a digit-pattern
        'api/user/Infinity', // same
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  multi_segment_url: {
    title: 'Multiple placeholders',
    description: "templateLiteral.spec.ts 'multi-segment URL' combines multiple placeholders with literal segments.",
    validateNotes:
      'Every literal segment and placeholder is matched positionally in one regex — the `${number}` spans require digit-strings while the `${string}` span accepts any characters; a single mismatched segment fails the whole match.',
    validate: () => createValidate<`/api/v${number}/user/${string}/posts/${number}`>(),
    validateDataOnly: () => createValidate<DataOnly<`/api/v${number}/user/${string}/posts/${number}`>>(),
    validateSchema: () =>
      createValidate(RT.templateLiteral(['/api/v', TF.number(), '/user/', TF.string(), '/posts/', TF.number()])),
    deserializeValidate: () => deserializeValidate<`/api/v${number}/user/${string}/posts/${number}`>(),
    validateReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<`/api/v${number}/user/${string}/posts/${number}`>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.templateLiteral(['/api/v', TF.number(), '/user/', TF.string(), '/posts/', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<`/api/v${number}/user/${string}/posts/${number}`>(),
    mockTypeReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['/api/v1/user/jane/posts/7', '/api/v2/user/joe/posts/0'],
      invalid: ['api/v1/user/jane/posts/7', '/api/v1/user/jane/posts/abc', '/api/vx/user/jane/posts/7', null, undefined, 42, ''],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  leading_string_placeholder: {
    title: 'Leading string placeholder',
    description:
      "templateLiteral.spec.ts 'leading ${string} placeholder' accepts an empty-string prefix because the string span uses `[\\s\\S]*`, not `+`.",
    validateNotes:
      'A leading `${string}` placeholder matches the empty string too — `"/42"` is valid (no characters before the slash).',
    validate: () => createValidate<`${string}/${number}`>(),
    validateDataOnly: () => createValidate<DataOnly<`${string}/${number}`>>(),
    validateSchema: () => createValidate(RT.templateLiteral([TF.string(), '/', TF.number()])),
    deserializeValidate: () => deserializeValidate<`${string}/${number}`>(),
    validateReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: `${string}/${number}` = '/42';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<`${string}/${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<`${string}/${number}`>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.templateLiteral([TF.string(), '/', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`${string}/${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `${string}/${number}` = '/42';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<`${string}/${number}`>(),
    mockTypeReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['/42', 'users/42'],
      invalid: ['users', '/abc', null, undefined, '', 42, 'abc/abc'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  regex_special_chars: {
    title: 'Regex metacharacters',
    description:
      "templateLiteral.spec.ts 'regex special chars in literal' requires that parens and other regex metacharacters in the literal segments be escaped in the compiled regex.",
    validateNotes:
      'Regex metacharacters in literal segments are escaped, so the parens are matched literally — `(42)` passes but `42` (no parens) fails.',
    validate: () => createValidate<`(${number})`>(),
    validateDataOnly: () => createValidate<DataOnly<`(${number})`>>(),
    validateSchema: () => createValidate(RT.templateLiteral(['(', TF.number(), ')'])),
    deserializeValidate: () => deserializeValidate<`(${number})`>(),
    validateReflect: () => {
      const v: `(${number})` = '(42)';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: `(${number})` = '(42)';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<`(${number})`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<`(${number})`>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.templateLiteral(['(', TF.number(), ')'])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`(${number})`>(),
    getValidationErrorsReflect: () => {
      const v: `(${number})` = '(42)';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `(${number})` = '(42)';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<`(${number})`>(),
    mockTypeReflect: () => {
      const v: `(${number})` = '(42)';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['(42)', '(0)', '(-3.14)'],
      invalid: ['42', '(abc)', '()', '(42', null, undefined, '', '42)', '(NaN)'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  template_literal_nested_in_object: {
    title: 'Nested in object',
    description:
      "templateLiteral.spec.ts 'nested in object' uses a template literal as a property value, and the parent object's AND chain composes the typeof+regex check against `v.url`.",
    validateNotes:
      'The `url` property is checked with the same typeof+regex as a standalone template literal, so a numeric `url: 42` fails (`expected: "templateLiteral"`) even though it would pass a plain `string` property.',
    validate: () => createValidate<{url: `api/user/${number}`; method: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{url: `api/user/${number}`; method: string}>>(),
    validateSchema: () => createValidate(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    deserializeValidate: () => deserializeValidate<{url: `api/user/${number}`; method: string}>(),
    validateReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{url: `api/user/${number}`; method: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{url: `api/user/${number}`; method: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{url: `api/user/${number}`; method: string}>(),
    getValidationErrorsReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{url: `api/user/${number}`; method: string}>(),
    mockTypeReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{url: 'api/user/42', method: 'GET'}],
      invalid: [
        {url: 'api/admin/42', method: 'GET'},
        {url: 'api/user/42'},
        null,
        undefined,
        {url: 42, method: 'GET'},
        {method: 'GET'},
        {url: 'api/user/42', method: 42},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['url'], expected: 'templateLiteral'}],
      [{path: ['method'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['url'], expected: 'templateLiteral'}],
      [{path: ['url'], expected: 'templateLiteral'}],
      [{path: ['method'], expected: 'string'}],
    ],
  },

  template_literal_index_key: {
    title: 'Index signature key',
    description:
      "templateLiteral.spec.ts 'as index signature key' uses a template literal pattern as the index signature's key type; the IndexSignature emit compiles the key pattern to a regex (same path as standalone template literals) and adds a per-key `regex.test(k)` check to the for-in loop, mirroring the getKeyPatternVar.",
    validateNotes:
      'Index-signature keys constrained by a template literal pattern: every own key on the object must match the compiled regex AND its value must satisfy the value type.',
    validate: () => createValidate<{[key: `api/${string}`]: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{[key: `api/${string}`]: number}>>(),
    validateSchema: () => createValidate(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    deserializeValidate: () => deserializeValidate<{[key: `api/${string}`]: number}>(),
    validateReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{[key: `api/${string}`]: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{[key: `api/${string}`]: number}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[key: `api/${string}`]: number}>(),
    getValidationErrorsReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{[key: `api/${string}`]: number}>(),
    mockTypeReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {'api/users': 1}, {'api/users': 1, 'api/admin': 2}],
      invalid: [{foo: 1}, {'api/users': 'not number'}, {'api/users': 1, foo: 2}, null, undefined, {'api/users': NaN}],
    }),
    getExpectedErrors: () => [
      // {foo: 1} — key 'foo' fails the template-literal pattern.
      [{path: ['foo'], expected: 'never'}],
      // {'api/users': 'not number'} — key passes, value fails number.
      [{path: ['api/users'], expected: 'number'}],
      // {'api/users': 1, foo: 2} — 'foo' fails key pattern; 'api/users' OK.
      [{path: ['foo'], expected: 'never'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['api/users'], expected: 'number'}],
    ],
  },

  template_literal_union_placeholder: {
    title: 'Union placeholder',
    description:
      'A template literal with a union placeholder, where tsgo distributes the union internally so the type-checker hands the projector either a union span or a pre-distributed set of template literals; either way the compiled regex must constrain the placeholder to {a, b} and reject anything outside the union.',
    validateNotes:
      'Union placeholders inside a template literal compile to a character-class / alternation in the regex — only the listed literal values pass.',
    validate: () => createValidate<`${'a' | 'b'}-${number}`>(),
    validateDataOnly: () => createValidate<DataOnly<`${'a' | 'b'}-${number}`>>(),
    validateSchema: () => createValidate(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', TF.number()])),
    deserializeValidate: () => deserializeValidate<`${'a' | 'b'}-${number}`>(),
    validateReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<`${'a' | 'b'}-${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<`${'a' | 'b'}-${number}`>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`${'a' | 'b'}-${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<`${'a' | 'b'}-${number}`>(),
    mockTypeReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['a-42', 'b-0', 'a--3.14'],
      invalid: ['c-1', 'a-', '-1', 'a-foo', 'ab-1', null, undefined, '', 'A-1', 42],
    }),
    // The resolver distributes ${'a'|'b'} into a union of two template
    // literals (`'a-${number}'` | `'b-${number}'`), so the top-level
    // kind is KindUnion not KindTemplateLiteral. Expected kindname is
    // 'union'.
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
