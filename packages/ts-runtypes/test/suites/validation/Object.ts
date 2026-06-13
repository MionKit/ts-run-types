import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const OBJECT = {
  simple_interface: {
    title: 'Simple interface',
    description: 'Interface with string and number props, the atomic-prop subset validated end-to-end.',
    validateNotes: [
      'Structural typing — extra properties beyond the declared shape PASS.',
      'Each declared property runs the atomic check for its type (number props reject NaN / Infinity).',
    ],
    validate: () => createValidate<{a: string; b: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string; b: number}>>(),
    validateSchema: () => createValidate(RT.object({a: RT.string(), b: RT.number()})),
    deserializeValidate: () => deserializeValidate<{a: string; b: number}>(),
    validateReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string; b: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: string; b: number}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({a: RT.string(), b: RT.number()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string; b: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; b: number} = {a: 'hello', b: 1};
      return deserializeGetValidationErrors(v);
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
    title: 'As const literals',
    description:
      'Object pinned with `as const` so every property becomes a readonly literal type, verifying the static and reflect forms agree.',
    validateNotes:
      '`readonly` is erased at runtime. Every property must strictly === its literal value (name === "john", age === 30) — no looser matches.',
    validate: () => createValidate<{readonly name: 'john'; readonly age: 30}>(),
    validateDataOnly: () => createValidate<DataOnly<{readonly name: 'john'; readonly age: 30}>>(),
    // `readonly` is part of the structural id, so the value-first model mirrors it
    // with `RT.propMod({readonly: true}, …)` on each prop.
    validateSchema: () =>
      createValidate(
        RT.object({name: RT.propMod({readonly: true}, RT.literal('john')), age: RT.propMod({readonly: true}, RT.literal(30))})
      ),
    deserializeValidate: () => deserializeValidate<{readonly name: 'john'; readonly age: 30}>(),
    validateReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return createValidate(Usr);
    },
    deserializeValidateReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return deserializeValidate(Usr);
    },
    getValidationErrors: () => createGetValidationErrors<{readonly name: 'john'; readonly age: 30}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{readonly name: 'john'; readonly age: 30}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({name: RT.propMod({readonly: true}, RT.literal('john')), age: RT.propMod({readonly: true}, RT.literal(30))})
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{readonly name: 'john'; readonly age: 30}>(),
    getValidationErrorsReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return createGetValidationErrors(Usr);
    },
    deserializeGetValidationErrorsReflect: () => {
      const Usr = {name: 'john', age: 30} as const;
      return deserializeGetValidationErrors(Usr);
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
      // error per declared prop (the emitTypeErrors per-property
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
    title: 'ReturnType utility',
    description:
      'Static-form `ReturnType<typeof fn>` idiom to validate a factory return type, since the reflect form would invoke the function at runtime and is flagged as a build-time warning.',
    validateNotes:
      'Prefer the static form `createValidate<ReturnType<typeof fn>>()` over `createValidate(fn())` — the latter invokes the function at runtime just to infer its type. The build pipeline emits a warning for the function-call reflect pattern.',
    validate: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createValidate<ReturnType<typeof makeUser>>();
    },
    validateDataOnly: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createValidate<DataOnly<ReturnType<typeof makeUser>>>();
    },
    validateSchema: () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
    // All REFLECT forms are opted out: a reflect thunk here would be
    // `createValidate(makeUser())`, which INVOKES the factory at runtime purely to
    // infer its type — the anti-pattern the resolver flags as a build-time warning
    // (see description / validateNotes). The static `ReturnType<typeof fn>` form is
    // the supported idiom; the vite-plugin diagnostic test covers the warning.
    validateReflect: 'not-supported',
    deserializeValidateReflect: 'not-supported',
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
    mockTypeReflect: 'not-supported',
    deserializeValidate: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return deserializeValidate<ReturnType<typeof makeUser>>();
    },
    getValidationErrors: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createGetValidationErrors<ReturnType<typeof makeUser>>();
    },
    getValidationErrorsDataOnly: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createGetValidationErrors<DataOnly<ReturnType<typeof makeUser>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetValidationErrors: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return deserializeGetValidationErrors<ReturnType<typeof makeUser>>();
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
    title: 'Property access inference',
    description:
      "Reflect form with a property-access argument (`createValidate(outer.user)`), where T comes from the property's declared type and produces the same hash as the static form.",
    validate: () => createValidate<{id: number; name: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{id: number; name: string}>>(),
    validateSchema: () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
    deserializeValidate: () => deserializeValidate<{id: number; name: string}>(),
    validateReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return createValidate(outer.user);
    },
    deserializeValidateReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return deserializeValidate(outer.user);
    },
    getValidationErrors: () => createGetValidationErrors<{id: number; name: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{id: number; name: string}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{id: number; name: string}>(),
    getValidationErrorsReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return createGetValidationErrors(outer.user);
    },
    deserializeGetValidationErrorsReflect: () => {
      const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
      return deserializeGetValidationErrors(outer.user);
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
    title: 'Array access inference',
    description:
      "Reflect form with an array-element-access argument (`createValidate(items[0])`), where T comes from the array's element type and produces the same hash as the static form.",
    validate: () => createValidate<{id: number; name: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{id: number; name: string}>>(),
    validateSchema: () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
    deserializeValidate: () => deserializeValidate<{id: number; name: string}>(),
    validateReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return createValidate(items[0]);
    },
    deserializeValidateReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return deserializeValidate(items[0]);
    },
    getValidationErrors: () => createGetValidationErrors<{id: number; name: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{id: number; name: string}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{id: number; name: string}>(),
    getValidationErrorsReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return createGetValidationErrors(items[0]);
    },
    deserializeGetValidationErrorsReflect: () => {
      const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
      return deserializeGetValidationErrors(items[0]);
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
    title: 'Optional property',
    description: 'Interface with one optional property emitting `(v.b === undefined || Number.isFinite(v.b))`.',
    validateNotes:
      'Optional (`?`) properties may be missing OR explicitly `undefined`. If present, the value must satisfy the declared type — `b: NaN` still fails.',
    validate: () => createValidate<{a: string; b?: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string; b?: number}>>(),
    validateSchema: () => createValidate(RT.object({a: RT.string(), b: RT.optional(RT.number())})),
    deserializeValidate: () => deserializeValidate<{a: string; b?: number}>(),
    validateReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string; b?: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: string; b?: number}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({a: RT.string(), b: RT.optional(RT.number())})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string; b?: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; b?: number} = {a: 'x'};
      return deserializeGetValidationErrors(v);
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
    title: 'Date property',
    description: 'Interface whose Date child validates via instanceof inside the AND chain.',
    validateNotes: 'Date-typed properties run the atomic `Date` check — Invalid Date instances inside the property fail too.',
    validate: () => createValidate<{date: Date; name: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{date: Date; name: string}>>(),
    validateSchema: () => createValidate(RT.object({date: RT.date(), name: RT.string()})),
    deserializeValidate: () => deserializeValidate<{date: Date; name: string}>(),
    validateReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{date: Date; name: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{date: Date; name: string}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({date: RT.date(), name: RT.string()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{date: Date; name: string}>(),
    getValidationErrorsReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
      return deserializeGetValidationErrors(v);
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
    title: 'Method property',
    description:
      "Interface with a method, where function-typed properties are skipped from validate so `validate({name:'x'})` passes even without `cb`.",
    validateNotes: [
      'TS DIVERGENCE: Function-typed properties are completely IGNORED by validate.',
      'The property may be absent, `undefined`, `null`, a number, a string — anything passes. Even a fresh function is fine.',
      'Rationale: function values cannot be serialized, so the validator (which gates serialization) treats them as out-of-scope.',
      'If you need to verify a function is actually callable, do it outside validate.',
    ],
    validate: () => createValidate<{name: string; cb: () => any}>(),
    validateDataOnly: () => createValidate<DataOnly<{name: string; cb: () => any}>>(),
    validateSchema: () => createValidate(RT.object({name: RT.string(), cb: RT.func([], RT.any())})),
    deserializeValidate: () => deserializeValidate<{name: string; cb: () => any}>(),
    validateReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{name: string; cb: () => any}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{name: string; cb: () => any}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({name: RT.string(), cb: RT.func([], RT.any())})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{name: string; cb: () => any}>(),
    getValidationErrorsReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
      return deserializeGetValidationErrors(v);
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
    title: 'Nested object',
    description: 'Interface with a nested object property, validated via outer plus inner AND-chains.',
    validateNotes:
      'Nested objects are validated recursively. Atomic-level rejections (NaN, Invalid Date) bubble up from the inner shape.',
    validate: () => createValidate<{a: string; deep: {b: string; c: number}}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string; deep: {b: string; c: number}}>>(),
    validateSchema: () => createValidate(RT.object({a: RT.string(), deep: RT.object({b: RT.string(), c: RT.number()})})),
    deserializeValidate: () => deserializeValidate<{a: string; deep: {b: string; c: number}}>(),
    validateReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string; deep: {b: string; c: number}}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: string; deep: {b: string; c: number}}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.object({a: RT.string(), deep: RT.object({b: RT.string(), c: RT.number()})})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string; deep: {b: string; c: number}}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
      return deserializeGetValidationErrors(v);
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
    title: 'String-array property',
    description: 'Interface with an array-typed property, exercising the dependency-call layer through an object.',
    validateNotes: [
      "A missing required array property is reported as `expected: 'array'` at the property path, not as an object error at the root.",
      "Element failures carry the array index in the path (e.g. `['tags', 1]`); `null` / `undefined` elements fail the element check.",
    ],
    validate: () => createValidate<{tags: string[]}>(),
    validateDataOnly: () => createValidate<DataOnly<{tags: string[]}>>(),
    validateSchema: () => createValidate(RT.object({tags: RT.array(RT.string())})),
    deserializeValidate: () => deserializeValidate<{tags: string[]}>(),
    validateReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{tags: string[]}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{tags: string[]}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({tags: RT.array(RT.string())})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{tags: string[]}>(),
    getValidationErrorsReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {tags: string[]} = {tags: []};
      return deserializeGetValidationErrors(v);
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
    title: 'Circular interface',
    description: 'Self-referential linked-list shape exercising the self-recursive dependency call.',
    validateNotes: 'Self-referential shapes are validated recursively — depth is bounded only by the input value, not the type.',
    validate: () => {
      type ICircular = {name: string; child?: ICircular};
      return createValidate<ICircular>();
    },
    validateDataOnly: () => {
      type ICircular = {name: string; child?: ICircular};
      return createValidate<DataOnly<ICircular>>();
    },
    validateSchema: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createValidate(ic);
    },
    deserializeValidate: () => {
      type ICircular = {name: string; child?: ICircular};
      return deserializeValidate<ICircular>();
    },
    validateReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type ICircular = {name: string; child?: ICircular};
      return createGetValidationErrors<ICircular>();
    },
    getValidationErrorsDataOnly: () => {
      type ICircular = {name: string; child?: ICircular};
      return createGetValidationErrors<DataOnly<ICircular>>();
    },
    getValidationErrorsSchema: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createGetValidationErrors(ic);
    },
    deserializeGetValidationErrors: () => {
      type ICircular = {name: string; child?: ICircular};
      return deserializeGetValidationErrors<ICircular>();
    },
    getValidationErrorsReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type ICircular = {name: string; child?: ICircular};
      const v: ICircular = {name: 'root'};
      return deserializeGetValidationErrors(v);
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
    title: 'Circular interface via array',
    description: 'Self-referential interface traversed via an array-of-self property.',
    validateNotes:
      'The recursive `children` array is optional, so a leaf node `{name: "r"}` is valid; each array element is validated recursively, with the array index in the path (e.g. `["children", 0, "name"]`).',
    validate: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createValidate<ICircularArray>();
    },
    validateDataOnly: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createValidate<DataOnly<ICircularArray>>();
    },
    validateSchema: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createValidate(ica);
    },
    deserializeValidate: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return deserializeValidate<ICircularArray>();
    },
    validateReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createGetValidationErrors<ICircularArray>();
    },
    getValidationErrorsDataOnly: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createGetValidationErrors<DataOnly<ICircularArray>>();
    },
    getValidationErrorsSchema: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createGetValidationErrors(ica);
    },
    deserializeGetValidationErrors: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return deserializeGetValidationErrors<ICircularArray>();
    },
    getValidationErrorsReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const v: ICircularArray = {name: 'r'};
      return deserializeGetValidationErrors(v);
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
    title: 'Circular interface in nested object',
    description: 'Self-referential interface with the circular reference buried deep inside a nested property.',
    validateNotes:
      'The `embedded` wrapper object is required (a missing `embedded` fails as `expected: "objectLiteral"`), but the recursive `embedded.child` is optional, so the cycle terminates wherever the value stops nesting.',
    validate: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createValidate<ICircularDeep>();
    },
    validateDataOnly: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createValidate<DataOnly<ICircularDeep>>();
    },
    validateSchema: () => {
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      return createValidate(icd);
    },
    deserializeValidate: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return deserializeValidate<ICircularDeep>();
    },
    validateReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createGetValidationErrors<ICircularDeep>();
    },
    getValidationErrorsDataOnly: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createGetValidationErrors<DataOnly<ICircularDeep>>();
    },
    getValidationErrorsSchema: () => {
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      return createGetValidationErrors(icd);
    },
    deserializeGetValidationErrors: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return deserializeGetValidationErrors<ICircularDeep>();
    },
    getValidationErrorsReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
      return deserializeGetValidationErrors(v);
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
    title: 'String index signature',
    description: 'Index signature with string values, looping over own keys so each value must satisfy the value type.',
    validateNotes: [
      'Validates own enumerable keys via `for...in` (not inherited). The empty object `{}` is valid.',
      "Every key's value must satisfy the value type — `{ a: 1 }` fails on `{[key: string]: string}`.",
    ],
    validate: () => createValidate<{[key: string]: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{[key: string]: string}>>(),
    validateSchema: () => createValidate(RT.record(RT.string())),
    deserializeValidate: () => deserializeValidate<{[key: string]: string}>(),
    validateReflect: () => {
      const v: {[key: string]: string} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {[key: string]: string} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{[key: string]: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{[key: string]: string}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.record(RT.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[key: string]: string}>(),
    getValidationErrorsReflect: () => {
      const v: {[key: string]: string} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[key: string]: string} = {};
      return deserializeGetValidationErrors(v);
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
    title: 'Index signature with named props',
    description:
      'Index signature combined with named props, where both the named props and the index signature validate and extras must satisfy the union value type.',
    validateNotes:
      "Named-prop checks and the index-signature for-in loop both run; an extra key whose value misses the index value type is reported as `expected: 'union'` at that key's path.",
    validate: () => createValidate<{a: string; b: number; [key: string]: string | number}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string; b: number; [key: string]: string | number}>>(),
    validateSchema: () =>
      createValidate(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    deserializeValidate: () => deserializeValidate<{a: string; b: number; [key: string]: string | number}>(),
    validateReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string; b: number; [key: string]: string | number}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<{a: string; b: number; [key: string]: string | number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{a: string; b: number; [key: string]: string | number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
      return deserializeGetValidationErrors(v);
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
      // string). We run BOTH the named-prop checks and the
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
    title: 'Nested index signatures',
    description: 'Index signature pointing at another index signature with number leaf values.',
    validateNotes: [
      "Each outer value must itself be an object — a non-object value (e.g. `{a: 1}`) fails as `expected: 'objectLiteral'` at that key.",
      'Leaf values run the atomic `number` check, so `NaN` at a leaf is rejected despite passing `typeof === "number"`.',
    ],
    validate: () => createValidate<{[key: string]: {[key: string]: number}}>(),
    validateDataOnly: () => createValidate<DataOnly<{[key: string]: {[key: string]: number}}>>(),
    validateSchema: () => createValidate(RT.record(RT.record(RT.number()))),
    deserializeValidate: () => deserializeValidate<{[key: string]: {[key: string]: number}}>(),
    validateReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{[key: string]: {[key: string]: number}}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{[key: string]: {[key: string]: number}}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.record(RT.record(RT.number()))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[key: string]: {[key: string]: number}}>(),
    getValidationErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: number}} = {};
      return deserializeGetValidationErrors(v);
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
    title: 'Index signature with Date leaves',
    description: 'Nested index signatures using Date as the leaf value type.',
    validateNotes:
      "Each leaf value runs the atomic `Date` check — an Invalid Date (`new Date('invalid')`) at a leaf is rejected as `expected: 'date'` despite being a `Date` instance.",
    validate: () => createValidate<{[key: string]: {[key: string]: Date}}>(),
    validateDataOnly: () => createValidate<DataOnly<{[key: string]: {[key: string]: Date}}>>(),
    validateSchema: () => createValidate(RT.record(RT.record(RT.date()))),
    deserializeValidate: () => deserializeValidate<{[key: string]: {[key: string]: Date}}>(),
    validateReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{[key: string]: {[key: string]: Date}}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{[key: string]: {[key: string]: Date}}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.record(RT.record(RT.date()))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[key: string]: {[key: string]: Date}}>(),
    getValidationErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[key: string]: {[key: string]: Date}} = {};
      return deserializeGetValidationErrors(v);
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
    title: 'Non-root index signature',
    description: 'Index signature attached to a nested, non-root object property.',
    validateNotes:
      "The nested property `c` combines a named prop (`a: string`) with a string index signature, so every extra key on `c` must also satisfy the index value type — a non-string extra value fails as `expected: 'string'` at e.g. `['c', 'c']`.",
    validate: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createValidate<Obj2>();
    },
    validateDataOnly: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createValidate<DataOnly<Obj2>>();
    },
    validateSchema: () =>
      createValidate(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    deserializeValidate: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return deserializeValidate<Obj2>();
    },
    validateReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createGetValidationErrors<Obj2>();
    },
    getValidationErrorsDataOnly: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createGetValidationErrors<DataOnly<Obj2>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})
      ),
    deserializeGetValidationErrors: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return deserializeGetValidationErrors<Obj2>();
    },
    getValidationErrorsReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const v: Obj2 = {b: 'hello', c: {a: 'world'}};
      return deserializeGetValidationErrors(v);
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
    title: 'Top-level function',
    description: "Function type at the root, validated with `typeof v === 'function'` so any function passes.",
    validateNotes: [
      'TS DIVERGENCE: ANY function passes, regardless of signature — arrow functions, async functions, class declarations (typeof === "function") all satisfy `() => void`.',
      'Parameter types and return type are NOT verified at runtime. If you need a specific call shape, validate at the call boundary.',
    ],
    // Root-level function type: DataOnly<() => void> collapses to `never`, which
    // the emitter renders as an always-throw factory — the bare-`T` form instead
    // emits a `typeof === 'function'` validator, so the ids cannot converge.
    dataOnlyDivergent: true,
    validate: () => createValidate<() => void>(),
    // DataOnly<() => void> = never → an always-throw factory; the assert skips it
    // (dataOnlyDivergent above), but the thunk is declared so the contract holds.
    validateDataOnly: () => createValidate<DataOnly<() => void>>(),
    validateSchema: () => createValidate(RT.func()),
    deserializeValidate: () => deserializeValidate<() => void>(),
    validateReflect: () => {
      const v: () => void = () => {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: () => void = () => {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<() => void>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<() => void>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.func()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<() => void>(),
    getValidationErrorsReflect: () => {
      const v: () => void = () => {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: () => void = () => {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<() => void>(),
    mockTypeReflect: () => {
      const v: () => void = () => {};
      return createMockType(v);
    },
    // Function kinds return `undefined` from the walker (the reference
    // behaviour); the result can't satisfy `validate<() => void>` which
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
    title: 'Callable interface',
    description:
      'Interface with a call signature plus data properties, switching the typeof guard from `object` to `function` and AND-chaining the remaining properties.',
    validateNotes:
      'Callable interfaces require a function value (`typeof === "function"`) PLUS the declared data properties. JS functions can carry properties; this case validates both halves.',
    // Callable interface: it has a call signature, so DataOnly<T> matches the
    // `(...args) => any` branch and collapses to `never`, whereas the emitter
    // validates it as a function-with-data-props. Ids cannot converge.
    dataOnlyDivergent: true,
    validate: () => createValidate<{(a: number, b: boolean): string; extra: string}>(),
    // DataOnly collapses the call signature away → never; assert skips it
    // (dataOnlyDivergent), the thunk is declared to satisfy the contract.
    validateDataOnly: () => createValidate<DataOnly<{(a: number, b: boolean): string; extra: string}>>(),
    validateSchema: () =>
      createValidate(RT.callable(RT.func([RT.number(), RT.boolean()], RT.string()), RT.object({extra: RT.string()}))),
    deserializeValidate: () => deserializeValidate<{(a: number, b: boolean): string; extra: string}>(),
    validateReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{(a: number, b: boolean): string; extra: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{(a: number, b: boolean): string; extra: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.callable(RT.func([RT.number(), RT.boolean()], RT.string()), RT.object({extra: RT.string()}))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{(a: number, b: boolean): string; extra: string}>(),
    getValidationErrorsReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
        function (_a: number, _b: boolean) {
          return 'x';
        },
        {extra: 'x'}
      );
      return deserializeGetValidationErrors(v);
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
    // not the function-ness, so `validate` (which checks `typeof ===
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
    title: 'All-optional interface',
    description:
      'Interface with every property optional, adding the `allOptionalCode` plain-object guard so arrays, Date, Map, and Set are explicitly rejected.',
    validateNotes: [
      'When every property is optional, the empty object `{}` would otherwise pass any non-plain-object input that has `typeof === "object"`.',
      'An extra guard rejects arrays, Date, Map, Set, RegExp, and other non-plain objects via `Object.prototype.toString.call(v) === "[object Object]"`.',
      'This is the ONLY shape kind where the validator enforces "plain object" semantics — see the bare `object` case for the contrast.',
    ],
    validate: () => createValidate<{a?: string; b?: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{a?: string; b?: number}>>(),
    validateSchema: () => createValidate(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.number())})),
    deserializeValidate: () => deserializeValidate<{a?: string; b?: number}>(),
    validateReflect: () => {
      const v: {a?: string; b?: number} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a?: string; b?: number} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a?: string; b?: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a?: string; b?: number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.number())})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a?: string; b?: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a?: string; b?: number} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a?: string; b?: number} = {};
      return deserializeGetValidationErrors(v);
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
    title: 'Class instance',
    // The emitter validates a class type with the nominal `class` kind; DataOnly
    // maps the instance to a plain object shape, so the validator reports
    // `objectLiteral` instead of `class`.
    dataOnlyDivergent: true,
    description:
      'Class with two atomic props validated structurally, where synthetic `prototype` members are filtered and methods drop out via the function-skip rule.',
    validateNotes: [
      'Plain object literals matching the class shape PASS — `instanceof` is NOT checked.',
      'Methods are skipped per the function-property rule; only data properties are validated.',
    ],
    validate: () => {
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
      return createValidate<MySerializableClass>();
    },
    validateDataOnly: () => {
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
      return createValidate<DataOnly<MySerializableClass>>();
    },
    validateSchema: () => {
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
      return createValidate(RT.classType(MySerializableClass));
    },
    deserializeValidate: () => {
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
      return deserializeValidate<MySerializableClass>();
    },
    validateReflect: () => {
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
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
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
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
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
      return createGetValidationErrors<MySerializableClass>();
    },
    getValidationErrorsDataOnly: () => {
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
      return createGetValidationErrors<DataOnly<MySerializableClass>>();
    },
    getValidationErrorsSchema: () => {
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
      return createGetValidationErrors(RT.classType(MySerializableClass));
    },
    deserializeGetValidationErrors: () => {
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
      return deserializeGetValidationErrors<MySerializableClass>();
    },
    getValidationErrorsReflect: () => {
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
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
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
      return deserializeGetValidationErrors(v);
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
    title: 'RpcError class',
    // Nominal `class` kind (see class_simple) — DataOnly's structural projection
    // can't preserve class identity, so the validated kind diverges.
    dataOnlyDivergent: true,
    description:
      'Local RpcError-shaped class with a literal-true brand plus generic type discriminator, exercising the standard class projection end-to-end.',
    validateNotes: [
      'Brand property + `type` discriminator + `publicMessage` are all required.',
      '`Error` base-class fields (`message`, `name`, `stack`) are NOT declared on the class shape and so are NOT validated.',
    ],
    validate: () => {
      // Mirrors a typical RpcError public shape:
      //   - `mion@isΣrrθr: true` brand (literal true)
      //   - `type: ErrType` generic discriminator
      //   - `publicMessage: string`
      //   - `id?: string`
      // `message` / `name` / `stack` are intentionally NOT declared
      // as TS properties (they exist at runtime via Error) so validate
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
      return createValidate<RpcError<'test-error'>>();
    },
    validateDataOnly: () => {
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
      return createValidate<DataOnly<RpcError<'test-error'>>>();
    },
    // Generic class → pin the instance type explicitly on `classType` (the
    // documented generic-class form), so it reflects `RpcError<'test-error'>`.
    validateSchema: () => {
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
      return createValidate(RT.classType<RpcError<'test-error'>>(RpcError));
    },
    deserializeValidate: () => {
      // Mirrors a typical RpcError public shape:
      //   - `mion@isΣrrθr: true` brand (literal true)
      //   - `type: ErrType` generic discriminator
      //   - `publicMessage: string`
      //   - `id?: string`
      // `message` / `name` / `stack` are intentionally NOT declared
      // as TS properties (they exist at runtime via Error) so validate
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
      return deserializeValidate<RpcError<'test-error'>>();
    },
    validateReflect: () => {
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
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
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
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
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
      return createGetValidationErrors<RpcError<'test-error'>>();
    },
    getValidationErrorsDataOnly: () => {
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
      return createGetValidationErrors<DataOnly<RpcError<'test-error'>>>();
    },
    getValidationErrorsSchema: () => {
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
      return createGetValidationErrors(RT.classType<RpcError<'test-error'>>(RpcError));
    },
    deserializeGetValidationErrors: () => {
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
      return deserializeGetValidationErrors<RpcError<'test-error'>>();
    },
    getValidationErrorsReflect: () => {
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
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
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
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      // Mirrors a typical RpcError public shape:
      //   - `mion@isΣrrθr: true` brand (literal true)
      //   - `type: ErrType` generic discriminator
      //   - `publicMessage: string`
      //   - `id?: string`
      // `message` / `name` / `stack` are intentionally NOT declared
      // as TS properties (they exist at runtime via Error) so validate
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
    title: 'Parameters tuple',
    description:
      'Function parameters extracted via `Parameters<F>` as a first-class tuple reusing the standard tuple emit, accepting the right args and rejecting wrong-type or excess args.',
    validateNotes: [
      'The value validated is the ARGUMENTS array — a positional tuple, not the function. Each slot runs its parameter type check.',
      "Excess args are rejected as `expected: 'tuple'` at the root; a missing required arg fails its slot type (e.g. `[1]` → `expected: 'boolean'` at index 1), since the omitted value reads as `undefined`.",
    ],
    validate: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createValidate<Parameters<CallSig>>();
    },
    validateDataOnly: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createValidate<DataOnly<Parameters<CallSig>>>();
    },
    validateSchema: () => createValidate(RT.parameters(RT.func([RT.number(), RT.boolean()], RT.string()))),
    deserializeValidate: () => {
      type CallSig = (a: number, b: boolean) => string;
      return deserializeValidate<Parameters<CallSig>>();
    },
    validateReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createGetValidationErrors<Parameters<CallSig>>();
    },
    getValidationErrorsDataOnly: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createGetValidationErrors<DataOnly<Parameters<CallSig>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.parameters(RT.func([RT.number(), RT.boolean()], RT.string()))),
    deserializeGetValidationErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      return deserializeGetValidationErrors<Parameters<CallSig>>();
    },
    getValidationErrorsReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type CallSig = (a: number, b: boolean) => string;
      const v: Parameters<CallSig> = [1, true];
      return deserializeGetValidationErrors(v);
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
        // spec: missing trailing args treated as undefined; if the
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
    title: 'Parameters tuple with optional',
    description:
      '`Parameters<F>` tuple with a trailing optional resolving to `[number, boolean, string?]`, where the optional slot accepts undefined or a string.',
    validateNotes:
      "The trailing optional slot may be omitted (`[3, false]` passes), but if present it must satisfy its type; excess args beyond the optional are still rejected as `expected: 'tuple'`.",
    validate: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createValidate<Parameters<CallSig>>();
    },
    validateDataOnly: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createValidate<DataOnly<Parameters<CallSig>>>();
    },
    validateSchema: () => createValidate(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], [RT.string()])))),
    deserializeValidate: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return deserializeValidate<Parameters<CallSig>>();
    },
    validateReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createGetValidationErrors<Parameters<CallSig>>();
    },
    getValidationErrorsDataOnly: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createGetValidationErrors<DataOnly<Parameters<CallSig>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], [RT.string()])))),
    deserializeGetValidationErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return deserializeGetValidationErrors<Parameters<CallSig>>();
    },
    getValidationErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const v: Parameters<CallSig> = [3, true, 'hello'];
      return deserializeGetValidationErrors(v);
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
    title: 'Parameters tuple with rest',
    // `Parameters<F>` is a tuple with a trailing rest; DataOnly's homomorphic
    // tuple mapping can't preserve the rest element (see Tuple.tuple_rest).
    dataOnlyDivergent: true,
    description:
      '`Parameters<F>` tuple ending in a rest segment resolving to `[number, boolean, ...Date[]]`, where all trailing slots must satisfy Date.',
    validateNotes:
      "Every trailing rest slot runs the rest element check (here `Date`); each failing rest entry is reported at its own index, and an Invalid Date in a rest slot is rejected as `expected: 'date'`.",
    validate: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createValidate<Parameters<CallSig>>();
    },
    validateDataOnly: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createValidate<DataOnly<Parameters<CallSig>>>();
    },
    validateSchema: () => createValidate(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], RT.date())))),
    deserializeValidate: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return deserializeValidate<Parameters<CallSig>>();
    },
    validateReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createGetValidationErrors<Parameters<CallSig>>();
    },
    getValidationErrorsDataOnly: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createGetValidationErrors<DataOnly<Parameters<CallSig>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], RT.date())))),
    deserializeGetValidationErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return deserializeGetValidationErrors<Parameters<CallSig>>();
    },
    getValidationErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const v: Parameters<CallSig> = [3, true];
      return deserializeGetValidationErrors(v);
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
    title: 'Record with union keys',
    description:
      '`Record<K, V>` with a literal-union key resolves to a fixed-property object literal where each key is a required property of type V.',
    validateNotes: [
      'Each union member becomes a REQUIRED property — a missing key (e.g. `{a: 1}`) fails at that key.',
      '`Record<UnionKey, V>` is NOT closed: extra keys (e.g. `{a: 1, b: 2, c: 3}`) PASS, since validation is structural.',
    ],
    validate: () => createValidate<Record<'a' | 'b', number>>(),
    validateDataOnly: () => createValidate<DataOnly<Record<'a' | 'b', number>>>(),
    validateSchema: () => createValidate(RT.object({a: RT.number(), b: RT.number()})),
    deserializeValidate: () => deserializeValidate<Record<'a' | 'b', number>>(),
    validateReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Record<'a' | 'b', number>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Record<'a' | 'b', number>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({a: RT.number(), b: RT.number()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Record<'a' | 'b', number>>(),
    getValidationErrorsReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Record<'a' | 'b', number> = {a: 1, b: 2};
      return deserializeGetValidationErrors(v);
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
    title: 'Union-value index signature',
    description: 'Index signature with a union value type, applying the union check to every own key in the for-in loop.',
    validateNotes:
      "Every own key's value must satisfy the `string | number` union, reported as `expected: 'union'` on failure. The number arm uses `Number.isFinite`, so a `NaN` value fails the union; `bigint` matches neither arm and also fails.",
    validate: () => createValidate<{[key: string]: string | number}>(),
    validateDataOnly: () => createValidate<DataOnly<{[key: string]: string | number}>>(),
    validateSchema: () => createValidate(RT.record(RT.union([RT.string(), RT.number()]))),
    deserializeValidate: () => deserializeValidate<{[key: string]: string | number}>(),
    validateReflect: () => {
      const v: {[key: string]: string | number} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {[key: string]: string | number} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{[key: string]: string | number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{[key: string]: string | number}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.record(RT.union([RT.string(), RT.number()]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[key: string]: string | number}>(),
    getValidationErrorsReflect: () => {
      const v: {[key: string]: string | number} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[key: string]: string | number} = {};
      return deserializeGetValidationErrors(v);
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
    title: 'Union property',
    description:
      'Object with a discriminated-union string property, emitting the literal-string union as an OR-chain of `===` checks.',
    validateNotes:
      "Both a wrong literal value (`kind: 'c'`) and a missing `kind` (undefined matches no arm) report `expected: 'union'` at `['kind']`, rather than a root-level object error.",
    validate: () => createValidate<{kind: 'a' | 'b'; n: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{kind: 'a' | 'b'; n: number}>>(),
    validateSchema: () => createValidate(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: RT.number()})),
    deserializeValidate: () => deserializeValidate<{kind: 'a' | 'b'; n: number}>(),
    validateReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{kind: 'a' | 'b'; n: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{kind: 'a' | 'b'; n: number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: RT.number()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{kind: 'a' | 'b'; n: number}>(),
    getValidationErrorsReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
      return deserializeGetValidationErrors(v);
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
    title: 'Interface inheritance',
    description:
      'Interface that extends a parent interface, where inherited props are merged into the child and the validator walks the merged set.',
    validateNotes:
      '`extends` is resolved at the type-checker layer — the runtype carries every inherited prop directly in its children list, so the validator does NOT separately walk the parent type.',
    validate: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createValidate<Child>();
    },
    validateDataOnly: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createValidate<DataOnly<Child>>();
    },
    validateSchema: () => createValidate(RT.object({a: RT.string(), b: RT.number()})),
    deserializeValidate: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return deserializeValidate<Child>();
    },
    validateReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createGetValidationErrors<Child>();
    },
    getValidationErrorsDataOnly: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createGetValidationErrors<DataOnly<Child>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({a: RT.string(), b: RT.number()})),
    deserializeGetValidationErrors: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return deserializeGetValidationErrors<Child>();
    },
    getValidationErrorsReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const v: Child = {a: 'x', b: 1};
      return deserializeGetValidationErrors(v);
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
    title: 'Class inheritance',
    // Nominal `class` kind (see class_simple) — DataOnly's structural projection
    // can't preserve class identity, so the validated kind diverges.
    dataOnlyDivergent: true,
    description:
      "Class that extends a parent class, where inherited data members appear in the child's children alongside its own on the class branch.",
    validateNotes:
      'Validated structurally — a plain object `{a: "x", b: 1}` PASSES (no `instanceof` check); inherited props are checked directly alongside the child\'s own, so a missing parent prop fails just like a missing own prop.',
    validate: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createValidate<Sub>();
    },
    validateDataOnly: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createValidate<DataOnly<Sub>>();
    },
    validateSchema: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createValidate(RT.classType(Sub));
    },
    deserializeValidate: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return deserializeValidate<Sub>();
    },
    validateReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createGetValidationErrors<Sub>();
    },
    getValidationErrorsDataOnly: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createGetValidationErrors<DataOnly<Sub>>();
    },
    getValidationErrorsSchema: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createGetValidationErrors(RT.classType(Sub));
    },
    deserializeGetValidationErrors: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return deserializeGetValidationErrors<Sub>();
    },
    getValidationErrorsReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const v: Sub = new Sub();
      return deserializeGetValidationErrors(v);
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
    title: 'Number-key index signature',
    description:
      '`{[k: number]: T}` normalises to the same shape as a string-key index signature, since JS object keys are always strings at runtime.',
    validateNotes:
      'TS DIVERGENCE: At runtime, all object keys are strings; the number key type constraint is enforced only by the TS compiler. The validator accepts any own enumerable key whose value satisfies T.',
    validate: () => createValidate<{[k: number]: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{[k: number]: string}>>(),
    // JS object keys are strings at runtime, so a number-key index sig validates
    // identically to a string-key one — but the key TYPE is part of the structural
    // id, so the value-first model uses an explicit number key to match.
    validateSchema: () => createValidate(RT.record(RT.number(), RT.string())),
    deserializeValidate: () => deserializeValidate<{[k: number]: string}>(),
    validateReflect: () => {
      const v: {[k: number]: string} = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {[k: number]: string} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{[k: number]: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{[k: number]: string}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.record(RT.number(), RT.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[k: number]: string}>(),
    getValidationErrorsReflect: () => {
      const v: {[k: number]: string} = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[k: number]: string} = {};
      return deserializeGetValidationErrors(v);
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
