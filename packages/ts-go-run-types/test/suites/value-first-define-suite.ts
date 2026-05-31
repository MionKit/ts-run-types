// Value-first `define` validation suite — single source of truth for the
// behavioral assertions of the value-first authoring surface
// (`@mionjs/ts-go-run-types/define`). Sibling of validation-suite.ts /
// format-validation-suite.ts.
//
// Each model is authored with `define({...})` and the validator is built from
// `ModelType<typeof Model>` through the SAME `createIsType` / createGetTypeErrors
// path as the type-first surface — proving the value-first front-end lowers to
// the identical RunType graph (convergence is asserted directly in
// vite-plugin-runtypes/test/value-first.test.ts via same-hash equality).
//
// Per the CLAUDE.md marker-coverage rule every case carries BOTH forms:
//   - static  `createIsType<ModelType<typeof Model>>()`
//   - reflect `createIsType(value)` where `value` is a runtime object whose
//     declared type is `ModelType<typeof Model>` (the format brand can't be
//     constructed from a plain literal, so the value is cast — it is discarded
//     at runtime, only its static type drives `T` inference).
//
// The bare `import '@mionjs/ts-go-run-types/define'` is type-only here; the
// `import '@mionjs/ts-go-run-types/formats'` side-effect import is load-bearing
// (registers the format mock fns + pure-fns the emitted validators reach).

import {createIsType, createGetTypeErrors, type IsTypeFn, type GetTypeErrorsFn} from '@mionjs/ts-go-run-types';
import {define, type ModelType} from '@mionjs/ts-go-run-types/define';
import {deserializeIsType} from '../util/deserializeRTFunctions.ts';
import '@mionjs/ts-go-run-types/formats';

/** A value-first case: the four isType thunks (static / reflect / their
 *  deserialize companions), a getTypeErrors thunk, and the shared samples.
 *  Reuses the same field names as `ValidationCase` so it can flow through the
 *  shared adapter helpers. **/
export interface ValueFirstCase {
  title: string;
  isType: () => IsTypeFn;
  isTypeReflect: () => IsTypeFn;
  deserializeIsType: () => IsTypeFn;
  deserializeIsTypeReflect: () => IsTypeFn;
  getTypeErrors: () => GetTypeErrorsFn;
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}

// ─────────────────────────────── Models ─────────────────────────────

const UserModel = define({
  username: {type: 'string', minLength: 3, maxLength: 20},
  code: {type: 'string', length: 4},
  role: {type: 'string', allowedValues: {val: ['admin', 'user', 'guest']}},
  age: {type: 'number', min: 0, max: 120, integer: true},
  score: {type: 'number', gt: 0, lt: 100},
  step: {type: 'number', multipleOf: 5},
  ratio: {type: 'number', float: true},
  level: {type: 'number', min: -128, max: 127, integer: true},
  bornBefore: {type: 'date', max: 'now'},
});

const StringModel = define({
  short: {type: 'string', maxLength: 5},
  long: {type: 'string', minLength: 3},
  exact: {type: 'string', length: 4},
  pick: {type: 'string', allowedValues: {val: ['red', 'green', 'blue']}},
});

const NumberModel = define({
  bounded: {type: 'number', min: 0, max: 10},
  exclusive: {type: 'number', gt: 0, lt: 10},
  whole: {type: 'number', integer: true},
  fractional: {type: 'number', float: true},
  divisible: {type: 'number', multipleOf: 3},
});

const DateModel = define({
  past: {type: 'date', max: 'now'},
  window: {type: 'date', min: '2020-01-01T00:00:00', max: '2030-01-01T00:00:00'},
});

const ProfileModel = define({name: {type: 'string', maxLength: 5}});
const SettingsModel = define({theme: {type: 'string', allowedValues: {val: ['light', 'dark']}}});

const NOW = Date.now();

// Reflect-form thunks are written INLINE per case (never via a generic
// helper): the scanner skips any `createIsType` call where `T` carries a free
// type parameter, so the model type must be concrete at the literal call site.
// The value is cast (the format brand isn't constructible from a plain
// literal) and discarded at runtime — only its declared type drives `T`.

export const VALUE_FIRST_SUITE: Record<string, ValueFirstCase> = {
  flat_mixed: {
    title: 'flat model — string/number/date constraints across many fields',
    isType: () => createIsType<ModelType<typeof UserModel>>(),
    isTypeReflect: () => {
      const v = {
        username: 'alice',
        code: 'AB12',
        role: 'admin',
        age: 30,
        score: 50,
        step: 10,
        ratio: 1.5,
        level: 10,
        bornBefore: new Date(NOW - 1000),
      } as unknown as ModelType<typeof UserModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<ModelType<typeof UserModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {
        username: 'alice',
        code: 'AB12',
        role: 'admin',
        age: 30,
        score: 50,
        step: 10,
        ratio: 1.5,
        level: 10,
        bornBefore: new Date(NOW - 1000),
      } as unknown as ModelType<typeof UserModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<ModelType<typeof UserModel>>(),
    getSamples: () => ({
      valid: [
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        {
          username: 'bob',
          code: 'ZZZZ',
          role: 'guest',
          age: 0,
          score: 99,
          step: 0,
          ratio: 0.1,
          level: -128,
          bornBefore: new Date(0),
        },
      ],
      invalid: [
        // username too short
        {
          username: 'ab',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // role not in allowedValues
        {
          username: 'alice',
          code: 'AB12',
          role: 'root',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // age not integer
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30.5,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // score not exclusive (== 100)
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 100,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // step not multipleOf 5
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 7,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // bornBefore in the future
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW + 1_000_000),
        },
      ],
    }),
  },

  string_features: {
    title: 'string fields — length / minLength / maxLength / allowedValues',
    isType: () => createIsType<ModelType<typeof StringModel>>(),
    isTypeReflect: () => {
      const v = {short: 'ab', long: 'abc', exact: 'ABCD', pick: 'red'} as unknown as ModelType<typeof StringModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<ModelType<typeof StringModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {short: 'ab', long: 'abc', exact: 'ABCD', pick: 'red'} as unknown as ModelType<typeof StringModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<ModelType<typeof StringModel>>(),
    getSamples: () => ({
      valid: [
        {short: '', long: 'abc', exact: 'ABCD', pick: 'red'},
        {short: 'hello', long: 'longer', exact: 'wxyz', pick: 'blue'},
      ],
      invalid: [
        {short: 'toolong', long: 'abc', exact: 'ABCD', pick: 'red'}, // short > 5
        {short: 'ok', long: 'ab', exact: 'ABCD', pick: 'red'}, // long < 3
        {short: 'ok', long: 'abc', exact: 'ABC', pick: 'red'}, // exact != 4
        {short: 'ok', long: 'abc', exact: 'ABCD', pick: 'purple'}, // not allowed
      ],
    }),
  },

  number_features: {
    title: 'number fields — bounds / exclusive / integer / float / multipleOf',
    isType: () => createIsType<ModelType<typeof NumberModel>>(),
    isTypeReflect: () => {
      const v = {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9} as unknown as ModelType<typeof NumberModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<ModelType<typeof NumberModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9} as unknown as ModelType<typeof NumberModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<ModelType<typeof NumberModel>>(),
    getSamples: () => ({
      valid: [
        {bounded: 0, exclusive: 1, whole: 3, fractional: 1.5, divisible: 0},
        {bounded: 10, exclusive: 9, whole: -7, fractional: -0.5, divisible: 9},
      ],
      invalid: [
        {bounded: 11, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9}, // bounded > 10
        {bounded: 5, exclusive: 10, whole: 3, fractional: 1.5, divisible: 9}, // exclusive == 10
        {bounded: 5, exclusive: 5, whole: 3.5, fractional: 1.5, divisible: 9}, // whole not integer
        {bounded: 5, exclusive: 5, whole: 3, fractional: 2, divisible: 9}, // fractional is integer
        {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 7}, // not multipleOf 3
      ],
    }),
  },

  date_bounds: {
    title: 'date fields — relative now bound + absolute window',
    isType: () => createIsType<ModelType<typeof DateModel>>(),
    isTypeReflect: () => {
      const v = {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')} as unknown as ModelType<typeof DateModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<ModelType<typeof DateModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')} as unknown as ModelType<typeof DateModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<ModelType<typeof DateModel>>(),
    getSamples: () => ({
      valid: [
        {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')},
        {past: new Date(0), window: new Date('2020-01-01T00:00:00')},
      ],
      invalid: [
        {past: new Date(NOW + 1_000_000), window: new Date('2025-06-01T00:00:00')}, // past in future
        {past: new Date(NOW - 1000), window: new Date('2019-01-01T00:00:00')}, // window before min
        {past: new Date(NOW - 1000), window: new Date('2031-01-01T00:00:00')}, // window after max
      ],
    }),
  },

  nested: {
    title: 'nested — value-first models composed inside a parent object',
    isType: () => createIsType<{profile: ModelType<typeof ProfileModel>; settings: ModelType<typeof SettingsModel>}>(),
    isTypeReflect: () => {
      const v = {profile: {name: 'abc'}, settings: {theme: 'dark'}} as unknown as {
        profile: ModelType<typeof ProfileModel>;
        settings: ModelType<typeof SettingsModel>;
      };
      return createIsType(v);
    },
    deserializeIsType: () =>
      deserializeIsType<{profile: ModelType<typeof ProfileModel>; settings: ModelType<typeof SettingsModel>}>(),
    deserializeIsTypeReflect: () => {
      const v = {profile: {name: 'abc'}, settings: {theme: 'dark'}} as unknown as {
        profile: ModelType<typeof ProfileModel>;
        settings: ModelType<typeof SettingsModel>;
      };
      return deserializeIsType(v);
    },
    getTypeErrors: () =>
      createGetTypeErrors<{profile: ModelType<typeof ProfileModel>; settings: ModelType<typeof SettingsModel>}>(),
    getSamples: () => ({
      valid: [
        {profile: {name: 'abc'}, settings: {theme: 'dark'}},
        {profile: {name: 'hi'}, settings: {theme: 'light'}},
      ],
      invalid: [
        {profile: {name: 'toolong'}, settings: {theme: 'dark'}}, // profile.name > 5
        {profile: {name: 'abc'}, settings: {theme: 'blue'}}, // settings.theme not allowed
      ],
    }),
  },
};
