import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const TEMPLATE_LITERAL = {
  url_with_number_id: {
    title: 'Template literal URL with a number placeholder',
    description:
      "mion templateLiteral.spec.ts 'URL pattern api/user/${number}'. Compiled to `^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$` at RT-build time; isType emits `typeof v === 'string' && regex.test(v)`.",
    isTypeNotes: [
      'Template literal types are compiled to a JS RegExp at build time and matched at runtime with `regex.test(v)`.',
      'The `${number}` placeholder expects digit-strings (`42`, `-7`, `3.14`) — NOT the words "NaN" or "Infinity" even though those are typeof "number" at the JS level.',
    ],
    isType: () => createIsType<`api/user/${number}`>(),
    isTypeSchema: () => createIsType(RT.templateLiteral(['api/user/', RT.number()])),
    deserializeIsType: () => deserializeIsType<`api/user/${number}`>(),
    isTypeReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<`api/user/${number}`>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.templateLiteral(['api/user/', RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<`api/user/${number}`>(),
    getTypeErrorsReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return deserializeGetTypeErrors(v);
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
    title: 'Template literal URL with multiple placeholders',
    description: "mion templateLiteral.spec.ts 'multi-segment URL'. Multiple placeholders + literal segments.",
    isType: () => createIsType<`/api/v${number}/user/${string}/posts/${number}`>(),
    isTypeSchema: () => createIsType(RT.templateLiteral(['/api/v', RT.number(), '/user/', RT.string(), '/posts/', RT.number()])),
    deserializeIsType: () => deserializeIsType<`/api/v${number}/user/${string}/posts/${number}`>(),
    isTypeReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.templateLiteral(['/api/v', RT.number(), '/user/', RT.string(), '/posts/', RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
    getTypeErrorsReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return deserializeGetTypeErrors(v);
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
    title: 'Template literal starting with a string placeholder',
    description:
      "mion templateLiteral.spec.ts 'leading ${string} placeholder' — empty-string prefix accepted (string span uses `[\\s\\S]*`, not `+`).",
    isTypeNotes:
      'A leading `${string}` placeholder matches the empty string too — `"/42"` is valid (no characters before the slash).',
    isType: () => createIsType<`${string}/${number}`>(),
    isTypeSchema: () => createIsType(RT.templateLiteral([RT.string(), '/', RT.number()])),
    deserializeIsType: () => deserializeIsType<`${string}/${number}`>(),
    isTypeReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: `${string}/${number}` = '/42';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<`${string}/${number}`>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.templateLiteral([RT.string(), '/', RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<`${string}/${number}`>(),
    getTypeErrorsReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: `${string}/${number}` = '/42';
      return deserializeGetTypeErrors(v);
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
    title: 'Template literal with regex metacharacters in literal segments',
    description:
      "mion templateLiteral.spec.ts 'regex special chars in literal' — parens (and other regex metacharacters) in the literal segments must be escaped in the compiled regex.",
    isType: () => createIsType<`(${number})`>(),
    isTypeSchema: () => createIsType(RT.templateLiteral(['(', RT.number(), ')'])),
    deserializeIsType: () => deserializeIsType<`(${number})`>(),
    isTypeReflect: () => {
      const v: `(${number})` = '(42)';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: `(${number})` = '(42)';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<`(${number})`>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.templateLiteral(['(', RT.number(), ')'])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<`(${number})`>(),
    getTypeErrorsReflect: () => {
      const v: `(${number})` = '(42)';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: `(${number})` = '(42)';
      return deserializeGetTypeErrors(v);
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
    title: 'Object with a template-literal-typed string property',
    description:
      "mion templateLiteral.spec.ts 'nested in object' — template literal as a property value; the parent object's AND chain composes the typeof+regex check against `v.url`.",
    isType: () => createIsType<{url: `api/user/${number}`; method: string}>(),
    isTypeSchema: () => createIsType(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
    deserializeIsType: () => deserializeIsType<{url: `api/user/${number}`; method: string}>(),
    isTypeReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{url: `api/user/${number}`; method: string}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{url: `api/user/${number}`; method: string}>(),
    getTypeErrorsReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return deserializeGetTypeErrors(v);
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
    title: 'Index signature whose key is a template literal pattern',
    description:
      "mion templateLiteral.spec.ts 'as index signature key' — index signature whose key type is a template literal pattern. The IndexSignature emit now compiles the key pattern to a regex (same path as standalone template literals) and adds a per-key `regex.test(k)` check to the for-in loop, mirroring mion's getKeyPatternVar.",
    isTypeNotes:
      'Index-signature keys constrained by a template literal pattern: every own key on the object must match the compiled regex AND its value must satisfy the value type.',
    isType: () => createIsType<{[key: `api/${string}`]: number}>(),
    isTypeSchema: () => createIsType(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
    deserializeIsType: () => deserializeIsType<{[key: `api/${string}`]: number}>(),
    isTypeReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{[key: `api/${string}`]: number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: `api/${string}`]: number}>(),
    getTypeErrorsReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return deserializeGetTypeErrors(v);
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
    title: 'Template literal with a union-of-literals placeholder',
    description:
      'Template literal with a union placeholder. tsgo distributes the union internally, so the type-checker hands the projector either a union span or a pre-distributed set of template literals; either way the compiled regex must constrain the placeholder to {a, b} — anything outside the union must be rejected.',
    isTypeNotes:
      'Union placeholders inside a template literal compile to a character-class / alternation in the regex — only the listed literal values pass.',
    isType: () => createIsType<`${'a' | 'b'}-${number}`>(),
    isTypeSchema: () => createIsType(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', RT.number()])),
    deserializeIsType: () => deserializeIsType<`${'a' | 'b'}-${number}`>(),
    isTypeReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<`${'a' | 'b'}-${number}`>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<`${'a' | 'b'}-${number}`>(),
    getTypeErrorsReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return deserializeGetTypeErrors(v);
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
