// Value-first `defineObject` validation suite — single source of truth for the
// behavioral assertions of the value-first authoring surface
// (`@mionjs/ts-go-run-types/schema`). Sibling of validation-suite.ts /
// format-validation-suite.ts.
//
// Each model is authored with `RT.object({...})`. Every builder returns the
// generic `RunType<…>` node, so `typeof Model` is that node and
// `Static<typeof Model>` recovers the model type — which is fed to
// `createIsType` / `createGetTypeErrors`, the SAME path as the type-first
// surface, proving the value-first front-end lowers to the identical RunType
// graph (same-hash convergence is asserted across all suites in
// test/suites/id-integrity/).
//
// Per the CLAUDE.md marker-coverage rule every case carries BOTH forms:
//   - static  `createIsType<Static<typeof Model>>()`
//   - reflect `createIsType(value)` where `value` is a runtime object whose
//     declared type is `Static<typeof Model>` (the format brand can't be
//     constructed from a plain literal, so the value is cast — discarded at
//     runtime, only its static type drives `T` inference).
//
// The bare `import '@mionjs/ts-go-run-types/schema'` is type-only here; the
// `import '@mionjs/ts-go-run-types/formats'` side-effect import is load-bearing
// (registers the format mock fns + pure-fns the emitted validators reach).

import {
  createIsType,
  createGetTypeErrors,
  registerFormatPattern,
  type Static,
  type IsTypeFn,
  type GetTypeErrorsFn,
} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType} from '../../util/deserializeRTFunctions.ts';
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

const UserModel = RT.object({
  username: RT.string({minLength: 3, maxLength: 20}),
  code: RT.string({length: 4}),
  role: RT.string({allowedValues: {val: ['admin', 'user', 'guest']}}),
  age: RT.number({min: 0, max: 120, integer: true}),
  score: RT.number({gt: 0, lt: 100}),
  step: RT.number({multipleOf: 5}),
  ratio: RT.number({float: true}),
  level: RT.number({min: -128, max: 127, integer: true}),
  bornBefore: RT.date({max: 'now'}),
});

const StringModel = RT.object({
  short: RT.string({maxLength: 5}),
  long: RT.string({minLength: 3}),
  exact: RT.string({length: 4}),
  pick: RT.string({allowedValues: {val: ['red', 'green', 'blue']}}),
});

const NumberModel = RT.object({
  bounded: RT.number({min: 0, max: 10}),
  exclusive: RT.number({gt: 0, lt: 10}),
  whole: RT.number({integer: true}),
  fractional: RT.number({float: true}),
  divisible: RT.number({multipleOf: 3}),
});

const DateModel = RT.object({
  past: RT.date({max: 'now'}),
  window: RT.date({min: '2020-01-01T00:00:00', max: '2030-01-01T00:00:00'}),
});

const ProfileModel = RT.object({name: RT.string({maxLength: 5})});
const SettingsModel = RT.object({theme: RT.string({allowedValues: {val: ['light', 'dark']}})});

// Leaf-format scalars added beyond string/number/date: boolean (no params) +
// bigint (bigint-valued bounds).
const ScalarModel = RT.object({
  active: RT.boolean(),
  count: RT.bigint({min: 0n, max: 1000n}),
  even: RT.bigint({multipleOf: 2n}),
});

// Temporal leaf formats (representative subset of the 6 orderable types — all
// share the same MinMax bounds). Requires `ESNext.Temporal` in lib; the test
// harness provides the ambient (test/temporal-ambient.d.ts).
const TemporalModel = RT.object({
  at: RT.temporal.instant({min: '2020-01-01T00:00:00Z'}),
  day: RT.optional(RT.temporal.plainDate({max: '2030-12-31'})),
});

// `RT.optional(...)` (shortcut for `propMod({optional: true}, ...)`) makes a
// property optional (`key?:`) — the key may be absent; when present it validates.
const OptionalModel = RT.object({
  id: RT.string({length: 4}), // required
  nick: RT.optional(RT.string({maxLength: 8})), // optional
  age: RT.optional(RT.number({min: 0})), // optional
});

// Regex through the VALUE channel — the two `pattern` forms a value-first string
// field accepts, both carrying mockSamples: an inline `{source, flags,
// mockSamples}` literal and a `registerFormatPattern` value. The Go scanner
// recovers {source, flags} from the literal the property declaration preserves.
const hexPattern = registerFormatPattern({regexp: /^[0-9a-f]+$/i, mockSamples: ['DEADbeef']});
const RegexModel = RT.object({
  slug: RT.string({pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['ok-slug', 'a-b-c-1']}}), // inline
  digits: RT.string({pattern: {source: '^[0-9]+$', flags: '', mockSamples: ['123', '0']}}), // inline
  hex: RT.string({pattern: hexPattern}), // registerFormatPattern value
});

const NOW = Date.now();

// Reflect-form thunks are written INLINE per case (never via a generic
// helper): the scanner skips any `createIsType` call where `T` carries a free
// type parameter, so the model type must be concrete at the literal call site.
// The value is cast (the format brand isn't constructible from a plain
// literal) and discarded at runtime — only its declared type drives `T`.

export const VALUE_FIRST_SUITE: Record<string, ValueFirstCase> = {
  flat_mixed: {
    title: 'flat model — string/number/date constraints across many fields',
    isType: () => createIsType<Static<typeof UserModel>>(),
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
      } as unknown as Static<typeof UserModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof UserModel>>(),
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
      } as unknown as Static<typeof UserModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof UserModel>>(),
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
    isType: () => createIsType<Static<typeof StringModel>>(),
    isTypeReflect: () => {
      const v = {short: 'ab', long: 'abc', exact: 'ABCD', pick: 'red'} as unknown as Static<typeof StringModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof StringModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {short: 'ab', long: 'abc', exact: 'ABCD', pick: 'red'} as unknown as Static<typeof StringModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof StringModel>>(),
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
    isType: () => createIsType<Static<typeof NumberModel>>(),
    isTypeReflect: () => {
      const v = {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9} as unknown as Static<typeof NumberModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof NumberModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9} as unknown as Static<typeof NumberModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof NumberModel>>(),
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
    isType: () => createIsType<Static<typeof DateModel>>(),
    isTypeReflect: () => {
      const v = {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')} as unknown as Static<typeof DateModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof DateModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')} as unknown as Static<typeof DateModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof DateModel>>(),
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

  regex_patterns: {
    title: 'regex — inline {source, flags, mockSamples} and registerFormatPattern, via the value channel',
    isType: () => createIsType<Static<typeof RegexModel>>(),
    isTypeReflect: () => {
      const v = {slug: 'ok-slug', digits: '123', hex: 'deadBEEF'} as unknown as Static<typeof RegexModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof RegexModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {slug: 'ok-slug', digits: '123', hex: 'deadBEEF'} as unknown as Static<typeof RegexModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof RegexModel>>(),
    getSamples: () => ({
      valid: [
        {slug: 'ok-slug', digits: '123', hex: 'deadBEEF'},
        {slug: 'a-b-c-1', digits: '0', hex: '0042'},
      ],
      invalid: [
        {slug: 'NOT a slug!', digits: '123', hex: 'deadBEEF'}, // slug: spaces/caps
        {slug: 'ok-slug', digits: '12x', hex: 'deadBEEF'}, // digits: non-digit
        {slug: 'ok-slug', digits: '123', hex: 'xyz'}, // hex: non-hex
      ],
    }),
  },

  optional_fields: {
    title: 'optional — `RT.optional(...)` fields may be absent; present ones validate',
    isType: () => createIsType<Static<typeof OptionalModel>>(),
    isTypeReflect: () => {
      const v = {id: 'AB12'} as unknown as Static<typeof OptionalModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof OptionalModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {id: 'AB12'} as unknown as Static<typeof OptionalModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof OptionalModel>>(),
    getSamples: () => ({
      valid: [
        {id: 'AB12'}, // both optionals absent
        {id: 'WXYZ', nick: 'hi', age: 30}, // both present + valid
        {id: 'AB12', age: 0}, // one present
      ],
      invalid: [
        {nick: 'hi'}, // id (required) missing
        {id: 'AB12', nick: 'wayTooLong'}, // present optional violates maxLength
        {id: 'AB12', age: -1}, // present optional violates min
      ],
    }),
  },

  scalars: {
    title: 'scalars — boolean (no params) + bigint (bigint-valued bounds)',
    isType: () => createIsType<Static<typeof ScalarModel>>(),
    isTypeReflect: () => {
      const v = {active: true, count: 5n, even: 4n} as unknown as Static<typeof ScalarModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof ScalarModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {active: true, count: 5n, even: 4n} as unknown as Static<typeof ScalarModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof ScalarModel>>(),
    getSamples: () => ({
      valid: [
        {active: true, count: 0n, even: 0n},
        {active: false, count: 1000n, even: 8n},
      ],
      invalid: [
        {active: 'yes', count: 5n, even: 4n}, // active not boolean
        {active: true, count: 5, even: 4n}, // count number, not bigint
        {active: true, count: 2000n, even: 4n}, // count > max
        {active: true, count: 5n, even: 3n}, // even not multipleOf 2
      ],
    }),
  },

  temporal: {
    title: 'temporal — Instant (min bound) + optional PlainDate (max bound)',
    isType: () => createIsType<Static<typeof TemporalModel>>(),
    isTypeReflect: () => {
      const v = {at: Temporal.Now.instant()} as unknown as Static<typeof TemporalModel>;
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<Static<typeof TemporalModel>>(),
    deserializeIsTypeReflect: () => {
      const v = {at: Temporal.Now.instant()} as unknown as Static<typeof TemporalModel>;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Static<typeof TemporalModel>>(),
    getSamples: () => ({
      valid: [
        {at: Temporal.Instant.from('2021-06-15T00:00:00Z')}, // after min, day absent
        {at: Temporal.Now.instant(), day: Temporal.PlainDate.from('2025-01-01')}, // both present, in range
      ],
      invalid: [
        {at: 'not-an-instant'}, // wrong type
        {day: Temporal.PlainDate.from('2025-01-01')}, // `at` required
        {at: Temporal.Instant.from('2019-01-01T00:00:00Z')}, // before min bound
        {at: Temporal.Now.instant(), day: 'not-a-date'}, // optional present but wrong type
      ],
    }),
  },

  nested: {
    title: 'nested — value-first models composed inside a parent object',
    isType: () => createIsType<{profile: Static<typeof ProfileModel>; settings: Static<typeof SettingsModel>}>(),
    isTypeReflect: () => {
      const v = {profile: {name: 'abc'}, settings: {theme: 'dark'}} as unknown as {
        profile: Static<typeof ProfileModel>;
        settings: Static<typeof SettingsModel>;
      };
      return createIsType(v);
    },
    deserializeIsType: () => deserializeIsType<{profile: Static<typeof ProfileModel>; settings: Static<typeof SettingsModel>}>(),
    deserializeIsTypeReflect: () => {
      const v = {profile: {name: 'abc'}, settings: {theme: 'dark'}} as unknown as {
        profile: Static<typeof ProfileModel>;
        settings: Static<typeof SettingsModel>;
      };
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{profile: Static<typeof ProfileModel>; settings: Static<typeof SettingsModel>}>(),
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
