import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const OBJECT = {
  simple_interface: {
    title: 'Simple interface with string and number props',
    description:
      'mion interface.spec.ts "validate object" (simplified to the atomic-prop subset that the current Go port can validate end-to-end)',
    isTypeNotes: [
      'Structural typing — extra properties beyond the declared shape PASS.',
      'Each declared property runs the atomic check for its type (number props reject NaN / Infinity).',
    ],
    isType: () => createIsType<{a: string; b: number}>(),
    isTypeSchema: () => createIsType(RT.object({a: RT.string(), b: RT.number()})),
    deserializeIsType: () => deserializeIsType<{a: string; b: number}>(),
    isTypeReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string; b: number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({a: RT.string(), b: RT.number()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; b: number}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{a: string; b: number}>(),
    mockTypeReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'hello', b: 1},
        {a: '', b: 0},
        {a: 'x', b: 42, extra: true},
      ],
      invalid: [
        'hello',
        null,
        undefined,
        {a: 'x'},
        {a: 1, b: 1},
        {a: 'x', b: 'not number'},
        {a: 'x', b: NaN},
        {a: 'x', b: Infinity},
        {b: 1},
        true,
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  object_as_const_literals: {
    title: 'Object pinned with `as const` (readonly literal props)',
    description:
      'Object literal pinned with `as const` — every property becomes a readonly literal type. Verifies that the type-id resolution and validator emit handle the readonly-literal-props shape end-to-end and that the static / reflect forms agree.',
    isTypeNotes:
      '`readonly` is erased at runtime. Every property must strictly === its literal value (name === "john", age === 30) — no looser matches.',
    isType: () => createIsType<{readonly name: 'john'; readonly age: 30}>(),
    isTypeSchema: () => createIsType(RT.object({name: RT.literal('john'), age: RT.literal(30)})),
    deserializeIsType: () => deserializeIsType<{readonly name: 'john'; readonly age: 30}>(),
    isTypeReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return createIsType(Usr);
    },
    deserializeIsTypeReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return deserializeIsType(Usr);
    },
    getTypeErrors: () => createGetTypeErrors<{readonly name: 'john'; readonly age: 30}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({name: RT.literal('john'), age: RT.literal(30)})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{readonly name: 'john'; readonly age: 30}>(),
    getTypeErrorsReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return createGetTypeErrors(Usr);
    },
    deserializeGetTypeErrorsReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return deserializeGetTypeErrors(Usr);
    },
    mockType: () => createMockType<{readonly name: 'john'; readonly age: 30}>(),
    mockTypeReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return createMockType(Usr);
    },
    getSamples: () => ({
      valid: [{name: 'john', age: 30}],
      invalid: [
        {name: 'jane', age: 30}, // name not the literal 'john'
        {name: 'john', age: 31}, // age not the literal 30
        {name: 'john'}, // missing age
        {age: 30}, // missing name
        {},
        null,
        'not object',
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'literal'}],
      [{path: ['age'], expected: 'literal'}],
      [{path: ['age'], expected: 'literal'}],
      [{path: ['name'], expected: 'literal'}],
      // {} — both props are missing; the for-each loop records one
      // error per declared prop (mion's emitTypeErrors per-property
      // accumulation).
      [
        {path: ['name'], expected: 'literal'},
        {path: ['age'], expected: 'literal'},
      ],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  object_via_return_type_utility: {
    title: 'Object inferred via ReturnType<typeof factory>',
    description:
      'Static-form usage of the recommended `ReturnType<typeof fn>` idiom when you have a factory function whose return type you want to validate. The reflect form `createIsType(makeUser())` would invoke the function at runtime purely for type inference — anti-pattern that the resolver now flags as a build-time warning. The reflect-form thunk is intentionally omitted; the diagnostic test in vite-plugin-runtypes covers the warning.',
    isTypeNotes:
      'Prefer the static form `createIsType<ReturnType<typeof fn>>()` over `createIsType(fn())` — the latter invokes the function at runtime just to infer its type. The build pipeline emits a warning for the function-call reflect pattern.',
    isType: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createIsType<ReturnType<typeof makeUser>>();
    },
    isTypeSchema: () => createIsType(RT.object({id: RT.number(), name: RT.string()})),
    deserializeIsType: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return deserializeIsType<ReturnType<typeof makeUser>>();
    },
    getTypeErrors: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createGetTypeErrors<ReturnType<typeof makeUser>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetTypeErrors: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return deserializeGetTypeErrors<ReturnType<typeof makeUser>>();
    },
    mockType: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createMockType<ReturnType<typeof makeUser>>();
    },
    getSamples: () => ({
      valid: [
        {id: 1, name: 'john'},
        {id: 0, name: ''},
        {id: 42, name: 'jane', extra: true},
      ],
      invalid: [{id: 'not number', name: 'x'}, {id: 1}, {name: 'x'}, null, 'not object'],
    }),
    getExpectedErrors: () => [
      [{path: ['id'], expected: 'number'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['id'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  object_via_property_access: {
    title: 'Object inferred via property access on a parent shape',
    description:
      "Reflect form with a property-access argument (`createIsType(outer.user)`). T comes from the property's declared type on the parent shape — property accesses don't go through const-binding CFA, so the natural pattern produces the same hash as the static form.",
    isType: () => createIsType<{id: number; name: string}>(),
    isTypeSchema: () => createIsType(RT.object({id: RT.number(), name: RT.string()})),
    deserializeIsType: () => deserializeIsType<{id: number; name: string}>(),
    isTypeReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return createIsType(outer.user);
    },
    deserializeIsTypeReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return deserializeIsType(outer.user);
    },
    getTypeErrors: () => createGetTypeErrors<{id: number; name: string}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{id: number; name: string}>(),
    getTypeErrorsReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return createGetTypeErrors(outer.user);
    },
    deserializeGetTypeErrorsReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return deserializeGetTypeErrors(outer.user);
    },
    mockType: () => createMockType<{id: number; name: string}>(),
    mockTypeReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return createMockType(outer.user);
    },
    getSamples: () => ({
      valid: [
        {id: 1, name: 'john'},
        {id: 0, name: ''},
      ],
      invalid: [{id: 'not number', name: 'x'}, {id: 1}, null],
    }),
    getExpectedErrors: () => [
      [{path: ['id'], expected: 'number'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  object_via_array_access: {
    title: 'Object inferred via array element access',
    description:
      "Reflect form with an array-element-access argument (`createIsType(items[0])`). T comes from the array's declared element type — indexed accesses don't go through const-binding CFA, so the natural pattern produces the same hash as the static form.",
    isType: () => createIsType<{id: number; name: string}>(),
    isTypeSchema: () => createIsType(RT.object({id: RT.number(), name: RT.string()})),
    deserializeIsType: () => deserializeIsType<{id: number; name: string}>(),
    isTypeReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return createIsType(items[0]);
    },
    deserializeIsTypeReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return deserializeIsType(items[0]);
    },
    getTypeErrors: () => createGetTypeErrors<{id: number; name: string}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{id: number; name: string}>(),
    getTypeErrorsReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return createGetTypeErrors(items[0]);
    },
    deserializeGetTypeErrorsReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return deserializeGetTypeErrors(items[0]);
    },
    mockType: () => createMockType<{id: number; name: string}>(),
    mockTypeReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return createMockType(items[0]);
    },
    getSamples: () => ({
      valid: [
        {id: 1, name: 'john'},
        {id: 0, name: ''},
      ],
      invalid: [{id: 'not number', name: 'x'}, {id: 1}, null],
    }),
    getExpectedErrors: () => [
      [{path: ['id'], expected: 'number'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  interface_with_optional: {
    title: 'Interface with one optional property',
    description: 'optional property — `(v.b === undefined || Number.isFinite(v.b))` per PropertyRunType.emitIsType',
    isTypeNotes:
      'Optional (`?`) properties may be missing OR explicitly `undefined`. If present, the value must satisfy the declared type — `b: NaN` still fails.',
    isType: () => createIsType<{a: string; b?: number}>(),
    isTypeSchema: () => createIsType(RT.object({a: RT.string(), b: RT.optional(RT.number())})),
    deserializeIsType: () => deserializeIsType<{a: string; b?: number}>(),
    isTypeReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string; b?: number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({a: RT.string(), b: RT.optional(RT.number())})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; b?: number}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{a: string; b?: number}>(),
    mockTypeReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{a: 'x'}, {a: 'x', b: 0}, {a: 'x', b: undefined}],
      invalid: [{a: 'x', b: 'not number'}, {a: 1}, null, undefined, {}, {b: 1}, {a: 'x', b: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — only required prop `a` is checked; `b` is optional + undefined → skipped.
      [{path: ['a'], expected: 'string'}],
      // {b: 1} — `a` missing, `b` is 1 (passes since it's a finite number)
      [{path: ['a'], expected: 'string'}],
      [{path: ['b'], expected: 'number'}],
    ],
  },

  interface_with_date: {
    title: 'Interface with a Date property',
    description: 'tests that Date child validates via instanceof inside the AND chain — mion interface.spec.ts ObjectType subset',
    isTypeNotes: 'Date-typed properties run the atomic `Date` check — Invalid Date instances inside the property fail too.',
    isType: () => createIsType<{date: Date; name: string}>(),
    isTypeSchema: () => createIsType(RT.object({date: RT.date(), name: RT.string()})),
    deserializeIsType: () => deserializeIsType<{date: Date; name: string}>(),
    isTypeReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{date: Date; name: string}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({date: RT.date(), name: RT.string()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{date: Date; name: string}>(),
    getTypeErrorsReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{date: Date; name: string}>(),
    mockTypeReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{date: new Date(), name: 'x'}],
      invalid: [
        {date: 'not date', name: 'x'},
        {date: new Date(), name: 1},
        {name: 'x'},
        null,
        undefined,
        {date: new Date('invalid'), name: 'x'},
        {date: new Date(NaN), name: 'x'},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['date'], expected: 'date'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['date'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['date'], expected: 'date'}],
      [{path: ['date'], expected: 'date'}],
    ],
  },

  interface_with_method: {
    title: 'Interface with a method (function prop skipped from check)',
    description:
      "mion: objectSkipProps — function-typed properties are skipped from isType (mion's `getRTChild → undefined` for function children). validate({name:'x'}) PASSES even without `cb`.",
    isTypeNotes: [
      'TS DIVERGENCE: Function-typed properties are completely IGNORED by isType.',
      'The property may be absent, `undefined`, `null`, a number, a string — anything passes. Even a fresh function is fine.',
      'Rationale: function values cannot be serialized, so the validator (which gates serialization) treats them as out-of-scope.',
      'If you need to verify a function is actually callable, do it outside isType.',
    ],
    isType: () => createIsType<{name: string; cb: () => any}>(),
    isTypeSchema: () => createIsType(RT.object({name: RT.string(), cb: RT.func([], RT.any())})),
    deserializeIsType: () => deserializeIsType<{name: string; cb: () => any}>(),
    isTypeReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{name: string; cb: () => any}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({name: RT.string(), cb: RT.func([], RT.any())})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{name: string; cb: () => any}>(),
    getTypeErrorsReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{name: string; cb: () => any}>(),
    mockTypeReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{name: 'x'}, {name: 'x', cb: () => null}, {name: 'x', cb: 42}, {name: 'x', cb: null}, {name: 'x', cb: 'not-a-fn'}],
      invalid: [{name: 1}, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  nested_object: {
    title: 'Interface with a nested object property',
    description: 'nested object — outer + inner AND-chains; mion ObjectType "deep" subset',
    isTypeNotes:
      'Nested objects are validated recursively. Atomic-level rejections (NaN, Invalid Date) bubble up from the inner shape.',
    isType: () => createIsType<{a: string; deep: {b: string; c: number}}>(),
    isTypeSchema: () => createIsType(RT.object({a: RT.string(), deep: RT.object({b: RT.string(), c: RT.number()})})),
    deserializeIsType: () => deserializeIsType<{a: string; deep: {b: string; c: number}}>(),
    isTypeReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string; deep: {b: string; c: number}}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.object({a: RT.string(), deep: RT.object({b: RT.string(), c: RT.number()})})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; deep: {b: string; c: number}}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{a: string; deep: {b: string; c: number}}>(),
    mockTypeReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{a: 'x', deep: {b: 'y', c: 1}}],
      invalid: [
        {a: 'x'},
        {a: 'x', deep: {b: 1, c: 1}},
        {a: 'x', deep: null},
        null,
        undefined,
        {a: 'x', deep: {b: 'y', c: NaN}},
        {a: 'x', deep: {b: 'y'}},
      ],
    }),
    getExpectedErrors: () => [
      // {a: 'x'} — missing 'deep' which is required → fails object check at ['deep']
      [{path: ['deep'], expected: 'objectLiteral'}],
      [{path: ['deep', 'b'], expected: 'string'}],
      [{path: ['deep'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['deep', 'c'], expected: 'number'}],
      // {a:'x', deep:{b:'y'}} — deep missing 'c'
      [{path: ['deep', 'c'], expected: 'number'}],
    ],
  },

  interface_string_array_prop: {
    title: 'Interface with a string-array property',
    description: 'an array-typed property — exercises the dependency-call layer through an object',
    isType: () => createIsType<{tags: string[]}>(),
    isTypeSchema: () => createIsType(RT.object({tags: RT.array(RT.string())})),
    deserializeIsType: () => deserializeIsType<{tags: string[]}>(),
    isTypeReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{tags: string[]}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({tags: RT.array(RT.string())})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{tags: string[]}>(),
    getTypeErrorsReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{tags: string[]}>(),
    mockTypeReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{tags: []}, {tags: ['a', 'b']}],
      invalid: [{tags: ['a', 1]}, {tags: 'not array'}, null, undefined, {tags: [null]}, {tags: [undefined]}, {}],
    }),
    getExpectedErrors: () => [
      [{path: ['tags', 1], expected: 'string'}],
      [{path: ['tags'], expected: 'array'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['tags', 0], expected: 'string'}],
      [{path: ['tags', 0], expected: 'string'}],
      // {} — missing tags; the prop is required → object check
      // then property check; tags is undefined which is not array.
      [{path: ['tags'], expected: 'array'}],
    ],
  },

  circular_interface: {
    title: 'Self-referential interface (linked-list shape)',
    description:
      "mion interface.spec.ts 'validate circular object'. Exercises self-recursive dependency call (mion isSelf branch — `<innerFnName>(v.child)` without `.fn`).",
    isTypeNotes: 'Self-referential shapes are validated recursively — depth is bounded only by the input value, not the type.',
    isType: () => {
      type ICircular = {name: string; child?: ICircular};
      return createIsType<ICircular>();
    },
    isTypeSchema: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createIsType(ic);
    },
    deserializeIsType: () => {
      type ICircular = {name: string; child?: ICircular};
      return deserializeIsType<ICircular>();
    },
    isTypeReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type ICircular = {name: string; child?: ICircular};
      return createGetTypeErrors<ICircular>();
    },
    getTypeErrorsSchema: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createGetTypeErrors(ic);
    },
    deserializeGetTypeErrors: () => {
      type ICircular = {name: string; child?: ICircular};
      return deserializeGetTypeErrors<ICircular>();
    },
    getTypeErrorsReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type ICircular = {name: string; child?: ICircular};
      return createMockType<ICircular>();
    },
    mockTypeReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{name: 'root'}, {name: 'root', child: {name: 'a'}}, {name: 'root', child: {name: 'a', child: {name: 'b'}}}],
      invalid: [
        {name: 1},
        {name: 'x', child: {name: 1}},
        {name: 'x', child: 'not object'},
        null,
        undefined,
        {}, // missing required name
        {name: 'x', child: {}}, // child missing required name
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'string'}],
      [{path: ['child', 'name'], expected: 'string'}],
      [{path: ['child'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['child', 'name'], expected: 'string'}],
    ],
  },

  circular_interface_on_array: {
    title: 'Self-referential interface via an array-of-self property',
    description: "mion interface.spec.ts 'validate circular interface on array' — circular type traversed via an array property.",
    isType: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createIsType<ICircularArray>();
    },
    isTypeSchema: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createIsType(ica);
    },
    deserializeIsType: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return deserializeIsType<ICircularArray>();
    },
    isTypeReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createGetTypeErrors<ICircularArray>();
    },
    getTypeErrorsSchema: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createGetTypeErrors(ica);
    },
    deserializeGetTypeErrors: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return deserializeGetTypeErrors<ICircularArray>();
    },
    getTypeErrorsReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createMockType<ICircularArray>();
    },
    mockTypeReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{name: 'r'}, {name: 'r', children: []}, {name: 'r', children: [{name: 'a'}, {name: 'b', children: [{name: 'c'}]}]}],
      invalid: [{name: 'r', children: [{name: 1}]}, {name: 'r', children: 'not array'}, {name: 1}],
    }),
    getExpectedErrors: () => [
      [{path: ['children', 0, 'name'], expected: 'string'}],
      [{path: ['children'], expected: 'array'}],
      [{path: ['name'], expected: 'string'}],
    ],
  },

  circular_interface_on_nested_object: {
    title: 'Self-referential interface buried in a nested object',
    description:
      "mion interface.spec.ts 'validate circular interface on nested object' — circular reference deep inside a property.",
    isType: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createIsType<ICircularDeep>();
    },
    isTypeSchema: () => {
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      return createIsType(icd);
    },
    deserializeIsType: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return deserializeIsType<ICircularDeep>();
    },
    isTypeReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createGetTypeErrors<ICircularDeep>();
    },
    getTypeErrorsSchema: () => {
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      return createGetTypeErrors(icd);
    },
    deserializeGetTypeErrors: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return deserializeGetTypeErrors<ICircularDeep>();
    },
    getTypeErrorsReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createMockType<ICircularDeep>();
    },
    mockTypeReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'r', embedded: {hello: 'h'}},
        {name: 'r', embedded: {hello: 'h', child: {name: 'c', embedded: {hello: 'h2'}}}},
      ],
      invalid: [{name: 'r'}, {name: 'r', embedded: {hello: 1}}, {name: 'r', embedded: null}],
    }),
    getExpectedErrors: () => [
      [{path: ['embedded'], expected: 'objectLiteral'}],
      [{path: ['embedded', 'hello'], expected: 'string'}],
      [{path: ['embedded'], expected: 'objectLiteral'}],
    ],
  },

  index_signature_string: {
    title: 'Index signature with string values',
    description:
      "mion indexProperty.spec.ts 'validate index run type' — for-in loop over own keys, value must satisfy the value type.",
    isTypeNotes: [
      'Validates own enumerable keys via `for...in` (not inherited). The empty object `{}` is valid.',
      "Every key's value must satisfy the value type — `{ a: 1 }` fails on `{[key: string]: string}`.",
    ],
    isType: () => createIsType<{[key: string]: string}>(),
    isTypeSchema: () => createIsType(RT.record(RT.string())),
    deserializeIsType: () => deserializeIsType<{[key: string]: string}>(),
    isTypeReflect: () => {
      const v: {[key: string]: string} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {[key: string]: string} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{[key: string]: string}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.record(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: string}>(),
    getTypeErrorsReflect: () => {
      const v: {[key: string]: string} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {[key: string]: string} = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{[key: string]: string}>(),
    mockTypeReflect: () => {
      const v: {[key: string]: string} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {a: 'x'}, {a: 'x', b: 'y'}],
      invalid: [{a: 1}, {a: 'x', b: 2}, null, 'not object', undefined, {a: null}, {a: undefined}],
    }),
    getExpectedErrors: () => [
      [{path: ['a'], expected: 'string'}],
      [{path: ['b'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['a'], expected: 'string'}],
      [{path: ['a'], expected: 'string'}],
    ],
  },

  index_signature_named_props: {
    title: 'Index signature combined with named properties',
    description:
      "mion indexProperty.spec.ts 'validate index run type + extra properties' — named props (a, b) AND the index signature both validate; extras (any key not a/b) must satisfy the union value type.",
    isType: () => createIsType<{a: string; b: number; [key: string]: string | number}>(),
    isTypeSchema: () =>
      createIsType(RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))),
    deserializeIsType: () => deserializeIsType<{a: string; b: number; [key: string]: string | number}>(),
    isTypeReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string; b: number; [key: string]: string | number}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; b: number; [key: string]: string | number}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{a: string; b: number; [key: string]: string | number}>(),
    mockTypeReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: 'x', b: 1, extra: 'y'},
        {a: 'x', b: 1, extra: 7},
      ],
      invalid: [{a: 1, b: 1}, {a: 'x'}, null, {a: 'x', b: 1, extra: true}],
    }),
    getExpectedErrors: () => [
      // {a: 1, b: 1} — index-sig checks every own key. Both 'a' (=1)
      // and 'b' (=1) are valid by index-sig (string|number). But
      // named prop 'a: string' fails because v.a is 1 (number, not
      // string). Mion runs BOTH the named-prop checks and the
      // index-sig loop, so 'a' fails the string check from the
      // named prop side. Note: 'a' is allowed in the for-in loop's
      // index check (number is in union) so no extra error there.
      [{path: ['a'], expected: 'string'}],
      // {a: 'x'} — named prop 'b' missing → undefined fails number.
      // For-in loop only sees key 'a' which IS in the union (string).
      [{path: ['b'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      // {a: 'x', b: 1, extra: true} — named props OK; for-in loop
      // sees key 'extra' (true) which fails the union check.
      [{path: ['extra'], expected: 'union'}],
    ],
  },

  index_signature_nested: {
    title: 'Nested index signatures (number leaf values)',
    description: 'mion indexProperty.spec.ts nested rtNested — index sig pointing at another index sig.',
    isType: () => createIsType<{[key: string]: {[key: string]: number}}>(),
    isTypeSchema: () => createIsType(RT.record(RT.record(RT.number()))),
    deserializeIsType: () => deserializeIsType<{[key: string]: {[key: string]: number}}>(),
    isTypeReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{[key: string]: {[key: string]: number}}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.record(RT.record(RT.number()))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: {[key: string]: number}}>(),
    getTypeErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{[key: string]: {[key: string]: number}}>(),
    mockTypeReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {a: {x: 1, y: 2}}, {a: {}, b: {n: 0}}],
      invalid: [{a: 1}, {a: {x: 'not number'}}, null, undefined, {a: {x: NaN}}, {a: {x: null}}],
    }),
    getExpectedErrors: () => [
      [{path: ['a'], expected: 'objectLiteral'}],
      [{path: ['a', 'x'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['a', 'x'], expected: 'number'}],
      [{path: ['a', 'x'], expected: 'number'}],
    ],
  },

  index_signature_date_value: {
    title: 'Nested index signatures with Date leaf values',
    description: 'mion indexProperty.spec.ts rtNested2 — Date as the leaf value type.',
    isType: () => createIsType<{[key: string]: {[key: string]: Date}}>(),
    isTypeSchema: () => createIsType(RT.record(RT.record(RT.date()))),
    deserializeIsType: () => deserializeIsType<{[key: string]: {[key: string]: Date}}>(),
    isTypeReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{[key: string]: {[key: string]: Date}}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.record(RT.record(RT.date()))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: {[key: string]: Date}}>(),
    getTypeErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{[key: string]: {[key: string]: Date}}>(),
    mockTypeReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {a: {x: new Date()}}],
      invalid: [{a: {x: 'not date'}}, {a: 'not object'}, null, undefined, {a: {x: new Date('invalid')}}],
    }),
    getExpectedErrors: () => [
      [{path: ['a', 'x'], expected: 'date'}],
      [{path: ['a'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['a', 'x'], expected: 'date'}],
    ],
  },

  index_signature_non_root: {
    title: 'Index signature on a nested (non-root) object property',
    description:
      "mion indexProperty.spec.ts 'IndexType non root' — index signature attached to a nested (non-root) object property.",
    isType: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createIsType<Obj2>();
    },
    isTypeSchema: () =>
      createIsType(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    deserializeIsType: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return deserializeIsType<Obj2>();
    },
    isTypeReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createGetTypeErrors<Obj2>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    deserializeGetTypeErrors: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return deserializeGetTypeErrors<Obj2>();
    },
    getTypeErrorsReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createMockType<Obj2>();
    },
    mockTypeReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {b: 'hello', c: {a: 'world', c: 'world'}},
        {b: 'x', c: {a: 'y'}},
      ],
      invalid: [{b: 'hello', c: {a: 'world', c: 123}}, {b: 'hello'}, {b: 'hello', c: 'not object'}, null],
    }),
    getExpectedErrors: () => [
      // c is index-sig {[key]: string} + named prop 'a: string'. Key 'c' has 123 — fails string check at [c, c].
      [{path: ['c', 'c'], expected: 'string'}],
      // {b:'hello'} — missing c which is required → fails objectLiteral at [c]
      [{path: ['c'], expected: 'objectLiteral'}],
      [{path: ['c'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  function_top_level: {
    title: 'Function type at top level (any function passes)',
    description: "mion FunctionRunType.emitIsType — `typeof v === 'function'`. Param-arity check is deferred (mion-level).",
    isTypeNotes: [
      'TS DIVERGENCE: ANY function passes, regardless of signature — arrow functions, async functions, class declarations (typeof === "function") all satisfy `() => void`.',
      'Parameter types and return type are NOT verified at runtime. If you need a specific call shape, validate at the call boundary.',
    ],
    isType: () => createIsType<() => void>(),
    isTypeSchema: () => createIsType(RT.func()),
    deserializeIsType: () => deserializeIsType<() => void>(),
    isTypeReflect: () => {
      const v: () => void = () => {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: () => void = () => {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<() => void>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.func()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<() => void>(),
    getTypeErrorsReflect: () => {
      const v: () => void = () => {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: () => void = () => {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<() => void>(),
    mockTypeReflect: () => {
      const v: () => void = () => {};
      return createMockType(v);
    },
    // Function kinds return `undefined` from the walker (mion's
    // behaviour); the result can't satisfy `isType<() => void>` which
    // checks `typeof === 'function'`. Mock still runs without error.
    mockTypeExpect: 'skip',
    getSamples: () => ({
      valid: [() => {}, function () {}, async () => {}, class {}],
      invalid: [null, undefined, 42, 'function', {}, [], true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
    ],
  },

  // ---- DEFERRED — kept as data for future adapter activation ----

  interface_callable: {
    title: 'Callable interface (function plus data properties)',
    description:
      'mion interface.spec.ts "validate callable interface" — the emit detects a CallSignature child and switches the typeof guard from `object` to `function`, then AND-chains the remaining properties on top (JS functions can carry properties).',
    isTypeNotes:
      'Callable interfaces require a function value (`typeof === "function"`) PLUS the declared data properties. JS functions can carry properties; this case validates both halves.',
    isType: () => createIsType<{(a: number, b: boolean): string; extra: string}>(),
    isTypeSchema: () =>
      createIsType(RT.intersection(RT.func([RT.number(), RT.boolean()], RT.string()), RT.object({extra: RT.string()}))),
    deserializeIsType: () => deserializeIsType<{(a: number, b: boolean): string; extra: string}>(),
    isTypeReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{(a: number, b: boolean): string; extra: string}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.intersection(RT.func([RT.number(), RT.boolean()], RT.string()), RT.object({extra: RT.string()}))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{(a: number, b: boolean): string; extra: string}>(),
    getTypeErrorsReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{(a: number, b: boolean): string; extra: string}>(),
    mockTypeReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return createMockType(v);
    },
    // Callable interface — the runtype is a plain object literal
    // with a CallSignature child, which the walker treats as a
    // skipped method. The mock generates the data properties only,
    // not the function-ness, so `isType` (which checks `typeof ===
    // 'function'`) rejects the result.
    mockTypeExpect: 'skip',
    getSamples: () => ({
      valid: [
        Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        ),
      ],
      invalid: [
        {extra: 'x'}, // not a function
        () => {}, // missing `extra` prop
        Object.assign(() => {}, {extra: 42}), // extra wrong type
        null,
        undefined,
        Object.assign(() => {}, {extra: null}), // extra wrong type (null)
      ],
    }),
    // Callable interface emits `typeof v === 'function'` as the
    // top-level guard (instead of object). Non-functions report
    // `expected: 'function'`; functions that pass the guard fall
    // through to per-property checks.
    getExpectedErrors: () => [
      [{path: [], expected: 'function'}],
      [{path: ['extra'], expected: 'string'}],
      [{path: ['extra'], expected: 'string'}],
      [{path: [], expected: 'function'}],
      [{path: [], expected: 'function'}],
      [{path: ['extra'], expected: 'string'}],
    ],
  },

  interface_all_optional: {
    title: 'Interface with every property optional (plain-object guard)',
    description:
      "mion interface.spec.ts \"validate empty object for ObjectAllOptional type\". The `allOptionalCode` guard `(!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]')` is added when every contributing child is optional, so arrays / Date / Map / Set are explicitly rejected (without the guard they'd slip through the bare `typeof === 'object'` check).",
    isTypeNotes: [
      'When every property is optional, the empty object `{}` would otherwise pass any non-plain-object input that has `typeof === "object"`.',
      'An extra guard rejects arrays, Date, Map, Set, RegExp, and other non-plain objects via `Object.prototype.toString.call(v) === "[object Object]"`.',
      'This is the ONLY shape kind where the validator enforces "plain object" semantics — see the bare `object` case for the contrast.',
    ],
    isType: () => createIsType<{a?: string; b?: number}>(),
    isTypeSchema: () => createIsType(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.number())})),
    deserializeIsType: () => deserializeIsType<{a?: string; b?: number}>(),
    isTypeReflect: () => {
      const v: {a?: string; b?: number} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a?: string; b?: number} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a?: string; b?: number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.number())})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a?: string; b?: number}>(),
    getTypeErrorsReflect: () => {
      const v: {a?: string; b?: number} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a?: string; b?: number} = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{a?: string; b?: number}>(),
    mockTypeReflect: () => {
      const v: {a?: string; b?: number} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: undefined, b: undefined}],
      invalid: [[], new Date(), new Map(), new Set(), null, 'hello', 42, undefined, /regex/, true],
    }),
    // The `allOptionalCode` guard rejects arrays / Date / Map / Set /
    // RegExp at the top level so every invalid sample fails the
    // objectLiteral check (the children body never runs).
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  class_simple: {
    title: 'Class with two atomic props (instance or plain match)',
    description:
      "mion class.spec.ts 'validate class'. ClassRunType inherits InterfaceRunType.emitIsType in mion, so the KindClass+SubKindNone arm in istype.go falls through to emitObjectIsType. The serializer filters synthetic `prototype` members from class projections so the AND chain only includes user-declared properties + methods (methods drop out via the function-skip rule).",
    isTypeNotes: [
      'Plain object literals matching the class shape PASS — `instanceof` is NOT checked.',
      'Methods are skipped per the function-property rule; only data properties are validated.',
    ],
    isType: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return createIsType<MySerializableClass>();
    },
    isTypeSchema: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return createIsType(RT.classType(MySerializableClass));
    },
    deserializeIsType: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return deserializeIsType<MySerializableClass>();
    },
    isTypeReflect: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return createGetTypeErrors<MySerializableClass>();
    },
    getTypeErrorsSchema: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return createGetTypeErrors(RT.classType(MySerializableClass));
    },
    deserializeGetTypeErrors: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return deserializeGetTypeErrors<MySerializableClass>();
    },
    getTypeErrorsReflect: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      return createMockType<MySerializableClass>();
    },
    mockTypeReflect: () => {
      class MySerializableClass {
        date: Date;
        name: string;
        constructor(date: Date, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
      return createMockType(v);
    },
    getSamples: () => {
      class Match {
        date = new Date();
        name = 'x';
        someMethod() {
          return 'unused';
        }
      }
      return {
        valid: [new Match(), {date: new Date(), name: 'x'}, {date: new Date(), name: 'x', someMethod: () => null}],
        invalid: [
          {date: 'not date', name: 'x'},
          {date: new Date()},
          {name: 'x'},
          null,
          'not object',
          undefined,
          {date: new Date('invalid'), name: 'x'},
          {date: new Date(NaN), name: 'x'},
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['date'], expected: 'date'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['date'], expected: 'date'}],
      [{path: [], expected: 'class'}],
      [{path: [], expected: 'class'}],
      [{path: [], expected: 'class'}],
      [{path: ['date'], expected: 'date'}],
      [{path: ['date'], expected: 'date'}],
    ],
  },

  rpc_error_class: {
    title: 'RpcError-shaped class with branded discriminator',
    description:
      "mion classRpcError.spec.ts — verifies the standard class projection handles RpcError-shaped classes (the actual @mionjs/core RpcError isn't a built-in node kind; it's a regular class with a literal-true brand + generic type discriminator). We define a local equivalent here to exercise the same shape end-to-end without pulling in the @mionjs/core dependency for a single test.",
    isTypeNotes: [
      'Brand property + `type` discriminator + `publicMessage` are all required.',
      '`Error` base-class fields (`message`, `name`, `stack`) are NOT declared on the class shape and so are NOT validated.',
    ],
    isType: () => {
      // Mirrors @mionjs/core's RpcError public shape:
      //   - `mion@isΣrrθr: true` brand (literal true)
      //   - `type: ErrType` generic discriminator
      //   - `publicMessage: string`
      //   - `id?: string`
      // `message` / `name` / `stack` are intentionally NOT declared
      // as TS properties (they exist at runtime via Error) so isType
      // doesn't validate them.
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return createIsType<RpcError<'test-error'>>();
    },
    // Generic class → pin the instance type explicitly on `classType` (the
    // documented generic-class form), so it reflects `RpcError<'test-error'>`.
    isTypeSchema: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return createIsType(RT.classType<RpcError<'test-error'>>(RpcError));
    },
    deserializeIsType: () => {
      // Mirrors @mionjs/core's RpcError public shape:
      //   - `mion@isΣrrθr: true` brand (literal true)
      //   - `type: ErrType` generic discriminator
      //   - `publicMessage: string`
      //   - `id?: string`
      // `message` / `name` / `stack` are intentionally NOT declared
      // as TS properties (they exist at runtime via Error) so isType
      // doesn't validate them.
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return deserializeIsType<RpcError<'test-error'>>();
    },
    isTypeReflect: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return createGetTypeErrors<RpcError<'test-error'>>();
    },
    getTypeErrorsSchema: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return createGetTypeErrors(RT.classType<RpcError<'test-error'>>(RpcError));
    },
    deserializeGetTypeErrors: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return deserializeGetTypeErrors<RpcError<'test-error'>>();
    },
    getTypeErrorsReflect: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      // Mirrors @mionjs/core's RpcError public shape:
      //   - `mion@isΣrrθr: true` brand (literal true)
      //   - `type: ErrType` generic discriminator
      //   - `publicMessage: string`
      //   - `id?: string`
      // `message` / `name` / `stack` are intentionally NOT declared
      // as TS properties (they exist at runtime via Error) so isType
      // doesn't validate them.
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      return createMockType<RpcError<'test-error'>>();
    },
    mockTypeReflect: () => {
      class RpcError<ErrType extends string> {
        public readonly 'mion@isΣrrθr': true = true;
        public readonly type: ErrType;
        public readonly publicMessage: string;
        public readonly id?: string;
        constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
          this.type = args.type;
          this.publicMessage = args.publicMessage;
          this.id = args.id;
        }
      }
      const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
      return createMockType(v);
    },
    getSamples: () => {
      const validInstance = {
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
      };
      const validWithId = {...validInstance, id: 'error-123'};
      return {
        valid: [validInstance, validWithId],
        invalid: [
          // brand wrong
          {'mion@isΣrrθr': false, type: 'test-error', publicMessage: 'x'},
          // type discriminator wrong
          {'mion@isΣrrθr': true, type: 'other-error', publicMessage: 'x'},
          // missing publicMessage
          {'mion@isΣrrθr': true, type: 'test-error'},
          null,
          'not object',
          undefined,
          {}, // missing everything
          {publicMessage: 'x'}, // missing brand + type
          // publicMessage wrong type
          {'mion@isΣrrθr': true, type: 'test-error', publicMessage: 42},
        ],
      };
    },
    getExpectedErrors: () => [
      // brand wrong (mion@isΣrrθr: false) → literal check fails
      [{path: ['mion@isΣrrθr'], expected: 'literal'}],
      // type discriminator wrong → literal check fails
      [{path: ['type'], expected: 'literal'}],
      // missing publicMessage (undefined fails string)
      [{path: ['publicMessage'], expected: 'string'}],
      [{path: [], expected: 'class'}],
      [{path: [], expected: 'class'}],
      [{path: [], expected: 'class'}],
      // {} — all three required props missing → 3 errors
      [
        {path: ['mion@isΣrrθr'], expected: 'literal'},
        {path: ['type'], expected: 'literal'},
        {path: ['publicMessage'], expected: 'string'},
      ],
      // {publicMessage: 'x'} — brand + type missing
      [
        {path: ['mion@isΣrrθr'], expected: 'literal'},
        {path: ['type'], expected: 'literal'},
      ],
      // publicMessage wrong type
      [{path: ['publicMessage'], expected: 'string'}],
    ],
  },

  call_signature_params: {
    title: 'Function parameters extracted via Parameters<F>',
    description:
      "mion callSignature.spec.ts 'should validate correct parameters' — mion exposes this via `rt.getCallSignature().createRTParamsFunction(RTFunctions.isType)`; our pipeline uses TypeScript's built-in `Parameters<F>` to extract the param tuple as a first-class type and reuses the standard tuple emit. Same observable behavior: the validator accepts `[number, boolean]`, rejects wrong-type args, accepts missing trailing args (treats them as undefined per mion's `v.length <= N` policy), rejects excess args.",
    isType: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createIsType<Parameters<CallSig>>();
    },
    isTypeSchema: () => createIsType(RT.parameters(RT.func([RT.number(), RT.boolean()], RT.string()))),
    deserializeIsType: () => {
      type CallSig = (a: number, b: boolean) => string;
      return deserializeIsType<Parameters<CallSig>>();
    },
    isTypeReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createGetTypeErrors<Parameters<CallSig>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.parameters(RT.func([RT.number(), RT.boolean()], RT.string()))),
    deserializeGetTypeErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      return deserializeGetTypeErrors<Parameters<CallSig>>();
    },
    getTypeErrorsReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createMockType<Parameters<CallSig>>();
    },
    mockTypeReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        [1, true],
        [0, false],
        // mion: missing trailing args treated as undefined; if the
        // param type is `boolean` (not `boolean | undefined`) then
        // `[1]` fails because v[1] === undefined doesn't satisfy
        // typeof === 'boolean'. Same shape here.
      ],
      invalid: [
        [1, 'not boolean'],
        [1], // missing required boolean
        [1, true, 'extra'], // excess args
        ['not number', true],
        'not array',
        null,
        undefined,
        [NaN, true], // NaN fails Number.isFinite
        [],
      ],
    }),
    getExpectedErrors: () => [
      [{path: [1], expected: 'boolean'}],
      [{path: [1], expected: 'boolean'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
      [
        {path: [0], expected: 'number'},
        {path: [1], expected: 'boolean'},
      ],
    ],
  },

  call_signature_params_with_optional: {
    title: 'Parameters<F> tuple with a trailing optional argument',
    description:
      "mion function.spec.ts 'validate function parameters' — params tuple with a trailing optional. `Parameters<F>` resolves to `[number, boolean, string?]`; the optional slot accepts undefined OR a string.",
    isType: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createIsType<Parameters<CallSig>>();
    },
    isTypeSchema: () => createIsType(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], [RT.string()])))),
    deserializeIsType: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return deserializeIsType<Parameters<CallSig>>();
    },
    isTypeReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createGetTypeErrors<Parameters<CallSig>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], [RT.string()])))),
    deserializeGetTypeErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return deserializeGetTypeErrors<Parameters<CallSig>>();
    },
    getTypeErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createMockType<Parameters<CallSig>>();
    },
    mockTypeReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        [3, true, 'hello'],
        [3, false],
      ],
      invalid: [
        [3, 3, 3], // wrong type for b and c
        [3, true, 'hello', 7], // excess args
        [3], // missing required boolean
        'not array',
        null,
        undefined,
        [NaN, true], // NaN fails Number.isFinite
      ],
    }),
    getExpectedErrors: () => [
      // [3, 3, 3] — slot 1 (3 not boolean) AND slot 2 (3 not string, optional but defined).
      [
        {path: [1], expected: 'boolean'},
        {path: [2], expected: 'string'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'boolean'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
    ],
  },

  call_signature_params_with_rest: {
    title: 'Parameters<F> tuple with a trailing rest segment',
    description:
      "mion function.spec.ts 'validate function with rest parameters' — params tuple ending in a rest segment. `Parameters<F>` resolves to `[number, boolean, ...Date[]]`; all trailing slots must satisfy Date.",
    isType: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createIsType<Parameters<CallSig>>();
    },
    isTypeSchema: () => createIsType(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], RT.date())))),
    deserializeIsType: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return deserializeIsType<Parameters<CallSig>>();
    },
    isTypeReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createGetTypeErrors<Parameters<CallSig>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], RT.date())))),
    deserializeGetTypeErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return deserializeGetTypeErrors<Parameters<CallSig>>();
    },
    getTypeErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createMockType<Parameters<CallSig>>();
    },
    mockTypeReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return createMockType(v);
    },
    getSamples: () => {
      const date1 = new Date();
      const date2 = new Date();
      return {
        valid: [
          [3, true, date1, date2],
          [3, false],
          [3, true],
        ],
        invalid: [
          [3, 3, 3], // wrong type for b
          [3, true, new Date(), 7], // 7 is not a Date in rest slot
          [3, true, new Date(), 7, true], // multiple wrong rest entries
          'not array',
          null,
          undefined,
          [3, true, new Date('invalid')], // Invalid Date in rest slot
        ],
      };
    },
    getExpectedErrors: () => [
      // [3, 3, 3] — slot 1 (3 not boolean), rest from slot 2: iVar=2 3 not Date.
      [
        {path: [1], expected: 'boolean'},
        {path: [2], expected: 'date'},
      ],
      // [3, true, new Date(), 7] — rest iVar=2 Date OK, iVar=3 7 not Date.
      [{path: [3], expected: 'date'}],
      // [3, true, new Date(), 7, true] — rest 2 OK, 3 fails, 4 fails.
      [
        {path: [3], expected: 'date'},
        {path: [4], expected: 'date'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      // [3, true, new Date('invalid')] — rest iVar=2 Invalid Date.
      [{path: [2], expected: 'date'}],
    ],
  },

  record_union_keys: {
    title: 'Record<UnionKey, V> — resolves to a fixed-property shape',
    description:
      '`Record<K, V>` with a literal-union key resolves to a fixed-property object literal (`{a: V; b: V}`) at the type-checker level — tsgo distributes the union over the property names. Same emit path as a hand-written object literal; each key is a required property of type V.',
    isType: () => createIsType<Record<'a' | 'b', number>>(),
    isTypeSchema: () => createIsType(RT.object({a: RT.number(), b: RT.number()})),
    deserializeIsType: () => deserializeIsType<Record<'a' | 'b', number>>(),
    isTypeReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Record<'a' | 'b', number>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({a: RT.number(), b: RT.number()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Record<'a' | 'b', number>>(),
    getTypeErrorsReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Record<'a' | 'b', number>>(),
    mockTypeReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 1, b: 2},
        {a: 0, b: 0},
        // Extra props pass — Record<UnionKey, V> doesn't imply strict.
        {a: 1, b: 2, c: 3},
      ],
      invalid: [
        {a: 1}, // missing 'b'
        {b: 1}, // missing 'a'
        {}, // empty
        {a: 'x', b: 1}, // wrong type
        null,
        'not object',
        undefined,
        {a: 1, b: NaN}, // NaN fails Number.isFinite
        {a: Infinity, b: 1},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'number'}],
      [
        {path: ['a'], expected: 'number'},
        {path: ['b'], expected: 'number'},
      ],
      [{path: ['a'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'number'}],
    ],
  },

  union_value_index: {
    title: 'Index signature with a union value type',
    description:
      'index signature with union value type — union emit landed; for-in loop applies the union check to every own key.',
    isType: () => createIsType<{[key: string]: string | number}>(),
    isTypeSchema: () => createIsType(RT.record(RT.union([RT.string(), RT.number()]))),
    deserializeIsType: () => deserializeIsType<{[key: string]: string | number}>(),
    isTypeReflect: () => {
      const v: {[key: string]: string | number} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {[key: string]: string | number} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{[key: string]: string | number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.record(RT.union([RT.string(), RT.number()]))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: string | number}>(),
    getTypeErrorsReflect: () => {
      const v: {[key: string]: string | number} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {[key: string]: string | number} = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{[key: string]: string | number}>(),
    mockTypeReflect: () => {
      const v: {[key: string]: string | number} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: 1, b: 'x'}],
      invalid: [{a: true}, {a: 'x', b: null}, 'not object', null, undefined, {a: BigInt(1)}, {a: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: ['a'], expected: 'union'}],
      [{path: ['b'], expected: 'union'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['a'], expected: 'union'}],
      [{path: ['a'], expected: 'union'}],
    ],
  },

  object_with_union_prop: {
    title: 'Object with a discriminated-union string property',
    description:
      'discriminated union as a property type — union emit handles the literal-string union as an OR-chain of `===` checks.',
    isType: () => createIsType<{kind: 'a' | 'b'; n: number}>(),
    isTypeSchema: () => createIsType(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: RT.number()})),
    deserializeIsType: () => deserializeIsType<{kind: 'a' | 'b'; n: number}>(),
    isTypeReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{kind: 'a' | 'b'; n: number}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: RT.number()})),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{kind: 'a' | 'b'; n: number}>(),
    getTypeErrorsReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{kind: 'a' | 'b'; n: number}>(),
    mockTypeReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {kind: 'a', n: 1},
        {kind: 'b', n: 0},
      ],
      invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null, undefined, {kind: 'a', n: NaN}, {kind: 'a'}],
    }),
    getExpectedErrors: () => [
      [{path: ['kind'], expected: 'union'}],
      [{path: ['kind'], expected: 'union'}],
      [{path: ['n'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['n'], expected: 'number'}],
      [{path: ['n'], expected: 'number'}],
    ],
  },

  interface_inheritance: {
    title: 'Interface that extends a parent interface',
    description:
      "TS `interface Child extends Base {…}` — inherited props are merged into the child's RunType.Children by tsgo's GetPropertiesOfType. The validator's emit walks the merged set; runtime behaviour matches a hand-flattened object literal.",
    isTypeNotes:
      '`extends` is resolved at the type-checker layer — the runtype carries every inherited prop directly in its children list, so the validator does NOT separately walk the parent type.',
    isType: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createIsType<Child>();
    },
    isTypeSchema: () => createIsType(RT.object({a: RT.string(), b: RT.number()})),
    deserializeIsType: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return deserializeIsType<Child>();
    },
    isTypeReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createGetTypeErrors<Child>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({a: RT.string(), b: RT.number()})),
    deserializeGetTypeErrors: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return deserializeGetTypeErrors<Child>();
    },
    getTypeErrorsReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createMockType<Child>();
    },
    mockTypeReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [
        {a: 'x'}, // missing b (inherited check still applies)
        {b: 1}, // missing a (parent prop)
        {a: 1, b: 1}, // a wrong type
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: ['a'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  class_inheritance: {
    title: 'Class that extends a parent class',
    description:
      "TS `class Sub extends Base {…}` — same merging as interface inheritance, but on the KindClass branch. Inherited data members appear in the child class's Children alongside its own.",
    isType: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createIsType<Sub>();
    },
    isTypeSchema: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createIsType(RT.classType(Sub));
    },
    deserializeIsType: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return deserializeIsType<Sub>();
    },
    isTypeReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createGetTypeErrors<Sub>();
    },
    getTypeErrorsSchema: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createGetTypeErrors(RT.classType(Sub));
    },
    deserializeGetTypeErrors: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return deserializeGetTypeErrors<Sub>();
    },
    getTypeErrorsReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createMockType<Sub>();
    },
    mockTypeReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [
        {a: 'x'}, // missing inherited b
        {b: 1}, // missing inherited a
        {a: 'x', b: 'not number'},
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: ['b'], expected: 'number'}],
      [{path: [], expected: 'class'}],
      [{path: [], expected: 'class'}],
    ],
  },

  index_signature_number_key: {
    title: 'Index signature with a number key',
    description:
      '`{[k: number]: T}` — TS lets you declare number-keyed index signatures. JS object keys are always strings at runtime, so the resolver normalises this to the same shape as `{[k: string]: T}` and the validator behaves identically.',
    isTypeNotes:
      'TS DIVERGENCE: At runtime, all object keys are strings; the number key type constraint is enforced only by the TS compiler. The validator accepts any own enumerable key whose value satisfies T.',
    isType: () => createIsType<{[k: number]: string}>(),
    // Number-key index sigs are string-key at runtime (JS object keys are
    // strings), so the string-key record() validates the same samples.
    isTypeSchema: () => createIsType(RT.record(RT.string())),
    deserializeIsType: () => deserializeIsType<{[k: number]: string}>(),
    isTypeReflect: () => {
      const v: {[k: number]: string} = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {[k: number]: string} = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{[k: number]: string}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.record(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[k: number]: string}>(),
    getTypeErrorsReflect: () => {
      const v: {[k: number]: string} = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {[k: number]: string} = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{[k: number]: string}>(),
    mockTypeReflect: () => {
      const v: {[k: number]: string} = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {0: 'x'}, {1: 'x', 2: 'y'}],
      invalid: [{0: 1}, null, 'not object', undefined, {0: null}],
    }),
    getExpectedErrors: () => [
      [{path: ['0'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['0'], expected: 'string'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
