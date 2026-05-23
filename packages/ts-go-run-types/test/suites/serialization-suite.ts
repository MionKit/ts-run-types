// Serialization suite ported from
// mion/packages/run-types/src/jitCompilers/serialization-suite.ts.
//
// Runs ALONGSIDE jit-suite.ts as a separate, JSON-specific driver. The
// jit-suite covers isType / getTypeErrors / prepareForJson /
// restoreFromJson with broad validator-oriented samples; this suite
// goes deeper into JSON serialization edge cases (richer Date/BigInt
// samples, more union shapes, dedicated ITERABLES + RECORDS +
// CIRCULAR_REFS buckets, function-shape variants via TS utility types).
//
// Mion lays the cases out as `{rt, values, deserializedValues?}` —
// the spec files build the serialize/deserialize functions from `rt`
// at test time. Our adapter pattern uses plugin-rewritten thunks
// instead: each case holds factory functions that already encode the
// runtype id (the marker scanner injects the hash at build time), so
// the suite never needs the raw RunType object.
//
// FUNCTIONS bucket: mion uses bespoke createSerializationParamsFn /
// createSerializationReturnFn helpers. We use TypeScript's native
// Parameters<typeof fn> and ReturnType<typeof fn> utilities — same
// type-level slicing, no extra factories required.

import {
  createPrepareForJson,
  deserializePrepareForJson,
  createRestoreFromJson,
  deserializeRestoreFromJson,
  type PrepareForJsonFn,
  type RestoreFromJsonFn,
} from '@mionjs/ts-go-run-types';

// ========================================================================
// Shared test types
// Mion defines these at module scope because TypeScript reflection needs
// stable type declarations (declaring classes inside getTestData() would
// produce different anonymous-class identities per call).
// ========================================================================

enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

interface SmallObject {
  prop1: string;
  prop2: number;
  prop3: boolean;
  prop4?: Date;
  prop5?: bigint;
}

class MySerializableClass {
  name: string;
  surname: string;
  id: number;
  startDate: Date;
  constructor() {
    this.name = 'John';
    this.surname = 'Doe';
    this.id = 0;
    this.startDate = new Date('2000-08-06T02:13:00.000Z');
  }
  getFullName() {
    return `${this.name} ${this.surname}`;
  }
}

class NonSerializableClass {
  constructor(
    public name: string,
    public surname: string,
    public id: number,
    public startDate: Date
  ) {}
  getFullName() {
    return `${this.name} ${this.surname}`;
  }
}

// circular ref types (must be declared at module scope for reflection)

type ObjCircularArr = {
  a: string;
  deep?: {
    b: string;
    c: number;
  };
  d?: ObjCircularArr[];
};

interface ICircularDeep {
  name: string;
  big: bigint;
  embedded: {
    hello: string;
    child?: ICircularDeep;
  };
}
interface ICircularDate {
  date: Date;
  month: number;
  year: number;
  embedded?: ICircularDate;
  deep?: ICircularDeep;
}
interface RootCircular {
  isRoot: true;
  ciChild: ICircularDeep;
  ciRoort?: RootCircular;
  ciDate: ICircularDate;
}

interface RootNotCircular {
  isRoot: true;
  ciChild: ICircularDeep;
}

interface ICircularArray {
  name: string;
  children?: ICircularArray[];
}

interface ICircularTuple {
  name: string;
  parent?: [string, ICircularTuple];
}

interface ObjectWithMethods {
  name: string;
  methodProp: () => any;
}

// Reused for FUNCTIONS bucket — TS Parameters<typeof fn> / ReturnType<typeof fn>
// utilities extract the relevant slices. These named functions must
// live at module scope so the marker scanner can resolve them.

function fnNoOptional(a: number, b: boolean, c: string): Date {
  return new Date(a);
}
function fnOptionalParams(a: Date, b?: boolean): bigint {
  void a;
  void b;
  return 1n;
}
function fnOptionalParam(a: number, b: boolean, c?: string): Date {
  void a;
  void b;
  void c;
  return new Date(0);
}
function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
  void rest;
  void a;
  void b;
  return new Date(0);
}
function fnOnlyRestParams(...rest: number[]): Date {
  void rest;
  return new Date(0);
}
function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
  void a;
  void b;
  void c;
  return new Date(0);
}
function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
  void a;
  void b;
  void c;
  return Promise.resolve(new Date(0));
}
function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
  void a;
  void b;
  void c;
  return () => new Date(0);
}

// ========================================================================
// SERIALIZATION_SPEC — single source of truth for the round-trip cases
// ========================================================================

/** One case in the JSON serialization suite. Mirrors mion's `SingleTest`
 *  but with our marker-based thunks in place of the raw RunType. **/
export interface SerializationCase {
  title: string;
  description?: string;

  // Round-trip thunks. Static is required; reflect / deserialize
  // variants are optional. Same 4-variant pattern as jit-suite.ts.
  prepareForJson: () => PrepareForJsonFn;
  prepareForJsonReflect?: () => PrepareForJsonFn;
  deserializePrepareForJson?: () => PrepareForJsonFn;
  deserializePrepareForJsonReflect?: () => PrepareForJsonFn;
  restoreFromJson: () => RestoreFromJsonFn;
  restoreFromJsonReflect?: () => RestoreFromJsonFn;
  deserializeRestoreFromJson?: () => RestoreFromJsonFn;
  deserializeRestoreFromJsonReflect?: () => RestoreFromJsonFn;

  /** Sample values to round-trip. `deserializedValues` is set only when
   *  the restored shape is asymmetric — e.g. class instances decode to
   *  plain objects, functions in tuples decode to undefined, etc.
   *  Mirrors mion's `getTestData` shape. **/
  getTestData: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Broad types (any / unknown / object) where the round-trip is
   *  best-effort via JSON. The adapter weakens the assertion: succeed
   *  when JSON.stringify(prepared) is a non-undefined string, without
   *  requiring deep-equal back to the original. **/
  roundTripBestEffort?: boolean;

  /** When the prepareForJson / restoreFromJson factory creation itself
   *  is expected to throw (e.g. `never` type, non-serializable
   *  primitives, Promise top-level). Tests verify a throw at thunk
   *  invocation time rather than a successful round-trip. **/
  throwsAtCompile?: boolean;
}

export const SERIALIZATION_SPEC = {
  ATOMIC: {
    string: {
      title: 'string',
      prepareForJson: () => createPrepareForJson<string>(),
      restoreFromJson: () => createRestoreFromJson<string>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string>(),
      getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
    },
    number: {
      title: 'number',
      prepareForJson: () => createPrepareForJson<number>(),
      restoreFromJson: () => createRestoreFromJson<number>(),
      deserializePrepareForJson: () => deserializePrepareForJson<number>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<number>(),
      getTestData: () => ({
        values: [
          0,
          99,
          -1,
          1.1,
          -1.1,
          1988,
          2045,
          2 ** 31,
          Number.MAX_SAFE_INTEGER,
          Number.MIN_SAFE_INTEGER,
          Number.MIN_VALUE,
          Number.MAX_VALUE,
        ],
      }),
    },
    number_not_supported: {
      title: 'number values not supported by all protocols',
      description: 'Infinity / NaN do not survive JSON encoding (become null on restore).',
      prepareForJson: () => createPrepareForJson<number>(),
      restoreFromJson: () => createRestoreFromJson<number>(),
      getTestData: () => ({
        values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
        // After JSON.stringify(Infinity) === 'null', restore yields null.
        deserializedValues: [null, null, null],
      }),
    },
    regexp: {
      title: 'regexp',
      prepareForJson: () => createPrepareForJson<RegExp>(),
      restoreFromJson: () => createRestoreFromJson<RegExp>(),
      deserializePrepareForJson: () => deserializePrepareForJson<RegExp>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<RegExp>(),
      getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
    },
    bigint: {
      title: 'bigint',
      prepareForJson: () => createPrepareForJson<bigint>(),
      restoreFromJson: () => createRestoreFromJson<bigint>(),
      deserializePrepareForJson: () => deserializePrepareForJson<bigint>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<bigint>(),
      getTestData: () => ({values: [1n]}),
    },
    boolean: {
      title: 'boolean',
      prepareForJson: () => createPrepareForJson<boolean>(),
      restoreFromJson: () => createRestoreFromJson<boolean>(),
      deserializePrepareForJson: () => deserializePrepareForJson<boolean>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<boolean>(),
      getTestData: () => ({values: [true]}),
    },
    any: {
      title: 'any',
      prepareForJson: () => createPrepareForJson<any>(),
      restoreFromJson: () => createRestoreFromJson<any>(),
      deserializePrepareForJson: () => deserializePrepareForJson<any>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
    },
    not_supported_any: {
      title: 'not supported in JSON stringify when any type is used',
      description:
        'undefined / Date / BigInt are not natively JSON-encodable when the type is `any` (no per-kind transform applies).',
      prepareForJson: () => createPrepareForJson<any>(),
      restoreFromJson: () => createRestoreFromJson<any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
    },
    null: {
      title: 'null',
      prepareForJson: () => createPrepareForJson<null>(),
      restoreFromJson: () => createRestoreFromJson<null>(),
      deserializePrepareForJson: () => deserializePrepareForJson<null>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<null>(),
      getTestData: () => ({values: [null]}),
    },
    undefined: {
      title: 'undefined',
      prepareForJson: () => createPrepareForJson<undefined>(),
      restoreFromJson: () => createRestoreFromJson<undefined>(),
      deserializePrepareForJson: () => deserializePrepareForJson<undefined>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<undefined>(),
      getTestData: () => ({values: [undefined]}),
    },
    date: {
      title: 'date',
      prepareForJson: () => createPrepareForJson<Date>(),
      restoreFromJson: () => createRestoreFromJson<Date>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date>(),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
    },
    enum_color: {
      title: 'enum',
      prepareForJson: () => createPrepareForJson<Color>(),
      restoreFromJson: () => createRestoreFromJson<Color>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Color>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Color>(),
      getTestData: () => ({values: [Color.Red, Color.Green]}),
    },
    symbol: {
      title: 'symbol',
      prepareForJson: () => createPrepareForJson<symbol>(),
      restoreFromJson: () => createRestoreFromJson<symbol>(),
      deserializePrepareForJson: () => deserializePrepareForJson<symbol>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<symbol>(),
      getTestData: () => ({values: [Symbol('foo'), Symbol()]}),
    },
    object: {
      title: 'object',
      prepareForJson: () => createPrepareForJson<object>(),
      restoreFromJson: () => createRestoreFromJson<object>(),
      deserializePrepareForJson: () => deserializePrepareForJson<object>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<object>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
    },
    void: {
      title: 'void',
      prepareForJson: () => createPrepareForJson<void>(),
      restoreFromJson: () => createRestoreFromJson<void>(),
      deserializePrepareForJson: () => deserializePrepareForJson<void>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<void>(),
      getTestData: () => ({values: [undefined]}),
    },
    never: {
      title: 'never',
      description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
      prepareForJson: () => createPrepareForJson<never>(),
      restoreFromJson: () => createRestoreFromJson<never>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    literal_string: {
      title: 'string literal',
      prepareForJson: () => createPrepareForJson<'hello'>(),
      restoreFromJson: () => createRestoreFromJson<'hello'>(),
      deserializePrepareForJson: () => deserializePrepareForJson<'hello'>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<'hello'>(),
      getTestData: () => ({values: ['hello']}),
    },
    literal_number: {
      title: 'number literal',
      prepareForJson: () => createPrepareForJson<42>(),
      restoreFromJson: () => createRestoreFromJson<42>(),
      deserializePrepareForJson: () => deserializePrepareForJson<42>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<42>(),
      getTestData: () => ({values: [42]}),
    },
    literal_boolean: {
      title: 'boolean literal',
      prepareForJson: () => createPrepareForJson<true>(),
      restoreFromJson: () => createRestoreFromJson<true>(),
      deserializePrepareForJson: () => deserializePrepareForJson<true>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<true>(),
      getTestData: () => ({values: [true]}),
    },
    literal_regexp: {
      title: 'regexp literal',
      prepareForJson: () => {
        const reg = /abc/;
        return createPrepareForJson<typeof reg>();
      },
      restoreFromJson: () => {
        const reg = /abc/;
        return createRestoreFromJson<typeof reg>();
      },
      getTestData: () => ({values: [/abc/]}),
    },
  },

  ARRAYS: {
    array: {
      title: 'array',
      prepareForJson: () => createPrepareForJson<string[]>(),
      restoreFromJson: () => createRestoreFromJson<string[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[]>(),
      getTestData: () => ({values: [['hello', 'world'], []]}),
    },
    array_date: {
      title: 'array of dates',
      prepareForJson: () => createPrepareForJson<Date[]>(),
      restoreFromJson: () => createRestoreFromJson<Date[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date[]>(),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
      }),
    },
    undefined_in_array: {
      title: 'undefined is serialized as null in array',
      prepareForJson: () => createPrepareForJson<undefined[]>(),
      restoreFromJson: () => createRestoreFromJson<undefined[]>(),
      getTestData: () => ({values: [[undefined, undefined]]}),
    },
    multi_dimensional: {
      title: 'multi dimensional array',
      prepareForJson: () => createPrepareForJson<string[][]>(),
      restoreFromJson: () => createRestoreFromJson<string[][]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[][]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[][]>(),
      getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
    },
    non_serializable_in_array: {
      title: 'non serializable items throws an error',
      description: 'symbol[] should throw at JIT-compile time per mion semantic.',
      prepareForJson: () => createPrepareForJson<symbol[]>(),
      restoreFromJson: () => createRestoreFromJson<symbol[]>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    array_circular: {
      title: 'array circular',
      prepareForJson: () => {
        type CircularArray = CircularArray[];
        return createPrepareForJson<CircularArray>();
      },
      restoreFromJson: () => {
        type CircularArray = CircularArray[];
        return createRestoreFromJson<CircularArray>();
      },
      getTestData: () => {
        type CircularArray = CircularArray[];
        const arr: CircularArray = [];
        arr.push([]);
        arr[0].push([]);
        arr[0][0].push([]);
        return {values: [arr, []]};
      },
    },
  },

  OBJECTS: {
    interface: {
      title: 'interface',
      prepareForJson: () =>
        createPrepareForJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      restoreFromJson: () =>
        createRestoreFromJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      getTestData: () => {
        const value = {
          startDate: new Date('2000-08-06T02:13:00.000Z'),
          quantity: 123,
          name: 'hello',
          nullValue: null,
          big: BigInt(123),
          stringArray: ['a', 'b', 'c'],
          "weird prop name \n?>'\\\t\r": 'hello2',
        };
        const valueWithOptional = {...value, optionalString: 'hello3'};
        return {values: [value, valueWithOptional]};
      },
    },
    many_optional_props: {
      title: 'many optional properties',
      prepareForJson: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createPrepareForJson<ManyOptional>();
      },
      restoreFromJson: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createRestoreFromJson<ManyOptional>();
      },
      getTestData: () => ({
        values: [{a0: 0, a1: 1, b0: 16, a8: 8, b7: 23, b15: 31}, {a0: 0, b8: 24}, {}],
      }),
    },
    class: {
      title: 'class',
      prepareForJson: () => createPrepareForJson<MySerializableClass>(),
      restoreFromJson: () => createRestoreFromJson<MySerializableClass>(),
      getTestData: () => {
        const item = new MySerializableClass();
        const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
        return {values: [new MySerializableClass()], deserializedValues: [restored]};
      },
    },
    extended_class: {
      title: 'extended class',
      prepareForJson: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createPrepareForJson<ExtendedClass>();
      },
      restoreFromJson: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createRestoreFromJson<ExtendedClass>();
      },
      getTestData: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return {values: [new ExtendedClass()]};
      },
    },
    non_serializable_class: {
      title: 'non-serializable class via deserialize function',
      description:
        'mion registers a deserialize fn so the class instance can be reconstructed; without that registration, JSON yields a plain object.',
      prepareForJson: () => createPrepareForJson<NonSerializableClass>(),
      restoreFromJson: () => createRestoreFromJson<NonSerializableClass>(),
      getTestData: () => {
        const item = new NonSerializableClass('John', 'Doe', 0, new Date('2000-08-06T02:13:00.000Z'));
        const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
        return {values: [item], deserializedValues: [restored]};
      },
    },
    undefined_in_object: {
      title: 'undefined is omitted in object prop',
      prepareForJson: () => createPrepareForJson<{a: string; b: number; c: undefined}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; b: number; c: undefined}>(),
      getTestData: () => ({
        values: [{a: 'hello', b: 42, c: undefined}],
        deserializedValues: [{a: 'hello', b: 42}],
      }),
    },
    optional_properties_order: {
      title: 'optional properties order',
      prepareForJson: () => createPrepareForJson<{a: string; b?: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; b?: string}>(),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
    },
    all_optional_fields: {
      title: 'all optional fields',
      prepareForJson: () => createPrepareForJson<{a?: string; b?: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a?: string; b?: string}>(),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}]}),
    },
    strip_extra_params: {
      title: 'strip extra params (mion semantic — extras pass through)',
      prepareForJson: () =>
        createPrepareForJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          stringArray: string[];
          bigInt: bigint;
          optionalString?: string;
          "weird prop name \n?>'\\\t\r": string;
          deep: {a: string; b: number};
          '?other weird p': {c: string; d: number};
        }>(),
      restoreFromJson: () =>
        createRestoreFromJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          stringArray: string[];
          bigInt: bigint;
          optionalString?: string;
          "weird prop name \n?>'\\\t\r": string;
          deep: {a: string; b: number};
          '?other weird p': {c: string; d: number};
        }>(),
      getTestData: () => {
        const startDate = new Date('2000-08-06T02:13:00.000Z');
        const noExtraParams = {
          startDate,
          quantity: 123,
          name: 'hello',
          nullValue: null,
          stringArray: ['a', 'b', 'c'],
          bigInt: BigInt(123),
          "weird prop name \n?>'\\\t\r": 'hello2',
          deep: {a: 'hello', b: 123},
          '?other weird p': {c: 'hello', d: 123},
        };
        const objectWithExtraParams = {
          ...noExtraParams,
          deep: {a: 'hello', b: 123, cExtra: true},
          '?other weird p': {c: 'hello', d: 123, eExtra: true},
          extraA: 'hello',
          extraB: 123,
          extraC: true,
        };
        return {values: [objectWithExtraParams], deserializedValues: [noExtraParams]};
      },
    },
    interface_circular: {
      title: 'interface circular',
      prepareForJson: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createPrepareForJson<ICircular>();
      },
      restoreFromJson: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createRestoreFromJson<ICircular>();
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    interface_circular_array: {
      title: 'interface circular array',
      prepareForJson: () => createPrepareForJson<ICircularArray>(),
      restoreFromJson: () => createRestoreFromJson<ICircularArray>(),
      getTestData: () => ({
        values: [
          {name: 'hello', children: []},
          {name: 'hello', children: [{name: 'world'}]},
        ],
      }),
    },
    interface_circular_deep: {
      title: 'interface circular deep',
      prepareForJson: () => createPrepareForJson<ICircularDeep>(),
      restoreFromJson: () => createRestoreFromJson<ICircularDeep>(),
      getTestData: () => ({
        values: [
          {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          {
            name: 'hello',
            big: 2n,
            embedded: {hello: 'world', child: {name: 'world1', big: 3n, embedded: {hello: 'world2'}}},
          },
        ],
      }),
    },
    interface_root_not_circular: {
      title: 'interface root not circular',
      prepareForJson: () => createPrepareForJson<RootNotCircular>(),
      restoreFromJson: () => createRestoreFromJson<RootNotCircular>(),
      getTestData: () => ({
        values: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 2n,
              embedded: {hello: 'world', child: {name: 'world1', big: 2n, embedded: {hello: 'world2'}}},
            },
          },
        ],
      }),
    },
    interface_multiple_circular: {
      title: 'interface multiple circular',
      prepareForJson: () => createPrepareForJson<RootCircular>(),
      restoreFromJson: () => createRestoreFromJson<RootCircular>(),
      getTestData: () => {
        const ciDate: ICircularDate = {date: new Date('2000-08-06T02:13:00.000Z'), month: 1, year: 2021};
        return {
          values: [
            {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate},
            {
              isRoot: true,
              ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
              },
              ciDate,
            },
          ],
        };
      },
    },
    interface_with_methods: {
      title: 'methods should be excluded from interface when serializing',
      prepareForJson: () => createPrepareForJson<ObjectWithMethods>(),
      restoreFromJson: () => createRestoreFromJson<ObjectWithMethods>(),
      getTestData: () => {
        const objWithMethod = {
          name: 'John',
          methodProp() {
            return 'method result';
          },
        } as ObjectWithMethods;
        return {values: [objWithMethod], deserializedValues: [{name: 'John'}]};
      },
    },
  },

  RECORDS: {
    index_property: {
      title: 'index property',
      prepareForJson: () => createPrepareForJson<{[key: string]: string}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: string}>(),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
    },
    index_property_and_prop: {
      title: 'interface with a single property and index property',
      prepareForJson: () => createPrepareForJson<{a: string; [key: string]: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; [key: string]: string}>(),
      getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
    },
    index_property_extra: {
      title: 'index property with extra props and unions',
      prepareForJson: () => createPrepareForJson<{a: string; b: number; [key: string]: string | number}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; b: number; [key: string]: string | number}>(),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
    },
    multiple_index_props: {
      title: 'multiple index properties (symbol keys skipped)',
      prepareForJson: () => createPrepareForJson<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      getTestData: () => {
        const objWithSymbolKeys = {
          key1: 'value1',
          key2: 'value2',
          [Symbol('key3')]: new Date(),
          [Symbol('key4')]: new Date(),
        };
        return {
          values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys],
          deserializedValues: [
            {key1: 'value1', key2: 'value2'},
            {key1: 'value1', key2: 'value2'},
          ],
        };
      },
    },
    index_property_nested: {
      title: 'index property nested',
      prepareForJson: () => createPrepareForJson<{[key: string]: {[key: string]: number}}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: {[key: string]: number}}>(),
      getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
    },
    index_property_nested_date: {
      title: 'index property nested with Date values',
      prepareForJson: () => createPrepareForJson<{[key: string]: {[key: string]: Date}}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: {[key: string]: Date}}>(),
      getTestData: () => ({
        values: [
          {
            key1: {
              nestedKey1: new Date('2000-08-06T02:13:00.000Z'),
              nestedKey2: new Date('2000-08-06T02:13:00.000Z'),
            },
          },
        ],
      }),
    },
    index_property_bigint: {
      title: 'index property with bigint values',
      prepareForJson: () => createPrepareForJson<{[key: string]: bigint}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: bigint}>(),
      getTestData: () => ({
        values: [
          {key1: 1n, key2: 2n},
          {hello: 1n, world: 2n},
        ],
      }),
    },
    index_property_non_root: {
      title: 'index property non-root',
      prepareForJson: () => createPrepareForJson<{b: string; c: {a: string; [key: string]: string}}>(),
      restoreFromJson: () => createRestoreFromJson<{b: string; c: {a: string; [key: string]: string}}>(),
      getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
    },
  },

  TUPLES: {
    tuple: {
      title: 'tuple',
      prepareForJson: () => createPrepareForJson<[Date, number, string, null, string[], bigint]>(),
      restoreFromJson: () => createRestoreFromJson<[Date, number, string, null, string[], bigint]>(),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
      }),
    },
    tuple_with_optional: {
      title: 'tuple with optional params',
      prepareForJson: () => createPrepareForJson<[number, bigint?, boolean?, number?]>(),
      restoreFromJson: () => createRestoreFromJson<[number, bigint?, boolean?, number?]>(),
      getTestData: () => ({
        values: [
          [3, undefined, true, 4],
          [446, undefined, undefined, undefined],
        ],
      }),
    },
    tuple_rest_parameter: {
      title: 'tuple rest parameter',
      prepareForJson: () => createPrepareForJson<[number, ...bigint[]]>(),
      restoreFromJson: () => createRestoreFromJson<[number, ...bigint[]]>(),
      getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
    },
    tuple_with_non_serializable: {
      title: 'tuple with non serializable types are transformed to undefined',
      prepareForJson: () => createPrepareForJson<[number, () => any]>(),
      restoreFromJson: () => createRestoreFromJson<[number, () => any]>(),
      getTestData: () => ({values: [[3, () => null]], deserializedValues: [[3, undefined]]}),
    },
    tuple_circular: {
      title: 'tuple circular',
      prepareForJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createPrepareForJson<TupleCircular>();
      },
      restoreFromJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createRestoreFromJson<TupleCircular>();
      },
      getTestData: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const tDeep: TupleCircular = [
          new Date('2000-08-06T02:13:00.000Z'),
          456,
          'world',
          null,
          ['x', 'y', 'z'],
          BigInt(456),
          undefined,
        ];
        const typeValue: TupleCircular = [
          new Date('2000-08-06T02:13:00.000Z'),
          123,
          'hello',
          null,
          ['a', 'b', 'c'],
          BigInt(123),
          tDeep,
        ];
        return {values: [typeValue]};
      },
    },
    interface_circular_tuple: {
      title: 'interface circular tuple',
      prepareForJson: () => createPrepareForJson<ICircularTuple>(),
      restoreFromJson: () => createRestoreFromJson<ICircularTuple>(),
      getTestData: () => {
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        return {values: [obj1, obj2]};
      },
    },
  },

  FUNCTIONS: {
    // Function parameter and return-type slicing uses TS utility types
    // (Parameters<typeof fn>, ReturnType<typeof fn>) rather than mion's
    // bespoke createSerializationParamsFn / createSerializationReturnFn
    // helpers. Same type-level slicing, no extra factories.
    parameters: {
      title: 'function parameters',
      prepareForJson: () => createPrepareForJson<Parameters<typeof fnNoOptional>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<typeof fnNoOptional>>(),
      getTestData: () => ({
        values: [
          [3, true, 'hello'],
          [3, true, 'world'],
        ],
      }),
    },
    optional_params: {
      title: 'optional parameters',
      prepareForJson: () => createPrepareForJson<Parameters<typeof fnOptionalParams>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<typeof fnOptionalParams>>(),
      getTestData: () => {
        const d = new Date('2000-08-06T02:13:00.000Z');
        return {values: [[d, true], [d]]};
      },
    },
    function_return: {
      title: 'function return',
      prepareForJson: () => createPrepareForJson<ReturnType<typeof fnOptionalParam>>(),
      restoreFromJson: () => createRestoreFromJson<ReturnType<typeof fnOptionalParam>>(),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
    },
    function_with_rest_parameters: {
      title: 'function with rest parameters',
      prepareForJson: () => createPrepareForJson<Parameters<typeof fnRestParams>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<typeof fnRestParams>>(),
      getTestData: () => ({
        values: [
          [3, true, new Date('2000-08-06T02:13:00.000Z'), new Date('2000-08-06T02:13:00.000Z')],
          [3, true],
        ],
      }),
    },
    function_with_date_parameters: {
      title: 'function with Date parameters',
      prepareForJson: () => createPrepareForJson<Parameters<typeof fnOptionalParams>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<typeof fnOptionalParams>>(),
      getTestData: () => {
        const d = new Date('2000-08-06T02:13:00.000Z');
        return {values: [[d, true], [d]]};
      },
    },
    required_function_return: {
      title: 'required function return',
      prepareForJson: () => createPrepareForJson<ReturnType<typeof fnOptionalParams>>(),
      restoreFromJson: () => createRestoreFromJson<ReturnType<typeof fnOptionalParams>>(),
      getTestData: () => ({values: [1n]}),
    },
    function_with_only_rest_parameters: {
      title: 'function with only rest parameters',
      prepareForJson: () => createPrepareForJson<Parameters<typeof fnOnlyRestParams>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<typeof fnOnlyRestParams>>(),
      getTestData: () => ({values: [[3, 2, 1], []]}),
    },
    non_serializable_params: {
      title: 'non serializable params',
      prepareForJson: () => createPrepareForJson<Parameters<typeof fnWithCallback>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<typeof fnWithCallback>>(),
      getTestData: () => ({
        values: [
          [3, true, () => null],
          [3, true, undefined],
        ],
        deserializedValues: [
          [3, true, undefined],
          [3, true, undefined],
        ],
      }),
    },
    function_promise_return_type: {
      title: 'function returns a promise',
      description: 'Promise<T> as a return type — Promises are non-serializable in mion.',
      prepareForJson: () => createPrepareForJson<ReturnType<typeof fnReturnsPromise>>(),
      restoreFromJson: () => createRestoreFromJson<ReturnType<typeof fnReturnsPromise>>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    function_return_type_is_function: {
      title: 'return type of a closure',
      description: 'fn returns another fn — non-serializable.',
      prepareForJson: () => createPrepareForJson<ReturnType<typeof fnReturnsFunction>>(),
      restoreFromJson: () => createRestoreFromJson<ReturnType<typeof fnReturnsFunction>>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    call_signature_params: {
      title: 'call signature params',
      prepareForJson: () => createPrepareForJson<Parameters<{(a: number, b: boolean): string}>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<{(a: number, b: boolean): string}>>(),
      getTestData: () => ({values: [[3, true]]}),
    },
    call_signature_return: {
      title: 'call signature return',
      prepareForJson: () => createPrepareForJson<ReturnType<{(a: number, b: boolean): string}>>(),
      restoreFromJson: () => createRestoreFromJson<ReturnType<{(a: number, b: boolean): string}>>(),
      getTestData: () => ({values: ['result']}),
    },
  },

  UTILITY_TYPES: {
    awaited: {
      title: 'Awaited<Promise<T>>',
      prepareForJson: () => createPrepareForJson<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      restoreFromJson: () => createRestoreFromJson<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    exclude_atomic: {
      title: 'Exclude on atomic union',
      prepareForJson: () => createPrepareForJson<Exclude<'name' | 'age' | number, 'age'>>(),
      restoreFromJson: () => createRestoreFromJson<Exclude<'name' | 'age' | number, 'age'>>(),
      getTestData: () => ({values: ['name', 3, 4]}),
    },
    exclude_objects: {
      title: 'Exclude on object union',
      prepareForJson: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createPrepareForJson<Exclude<Shape, Circle>>();
      },
      restoreFromJson: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createRestoreFromJson<Exclude<Shape, Circle>>();
      },
      getTestData: () => ({
        values: [
          {kind: 'square', x: 5},
          {kind: 'triangle', x: 5, y: 10},
        ],
      }),
    },
    required_properties: {
      title: 'Required<T>',
      prepareForJson: () => createPrepareForJson<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      restoreFromJson: () => createRestoreFromJson<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      getTestData: () => ({
        values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
      }),
    },
    extract_atomic: {
      title: 'Extract on atomic union',
      prepareForJson: () => createPrepareForJson<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      restoreFromJson: () => createRestoreFromJson<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      getTestData: () => ({values: ['name']}),
    },
    extract_objects: {
      title: 'Extract on object union',
      prepareForJson: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createPrepareForJson<Extract<Shape, ToExtract>>();
      },
      restoreFromJson: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createRestoreFromJson<Extract<Shape, ToExtract>>();
      },
      getTestData: () => ({values: [{kind: 'square', x: 5}]}),
    },
    partial_properties: {
      title: 'Partial<T>',
      prepareForJson: () => createPrepareForJson<Partial<{name: string; age: number; createdAt: Date}>>(),
      restoreFromJson: () => createRestoreFromJson<Partial<{name: string; age: number; createdAt: Date}>>(),
      getTestData: () => {
        const createdAt = new Date('2000-08-06T02:13:00.000Z');
        return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
      },
    },
    pick_properties: {
      title: 'Pick<T, K>',
      prepareForJson: () =>
        createPrepareForJson<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      restoreFromJson: () =>
        createRestoreFromJson<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    omit_properties: {
      title: 'Omit<T, K>',
      prepareForJson: () => createPrepareForJson<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      restoreFromJson: () => createRestoreFromJson<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    record_type: {
      title: 'Record<string, Date>',
      prepareForJson: () => createPrepareForJson<Record<string, Date>>(),
      restoreFromJson: () => createRestoreFromJson<Record<string, Date>>(),
      getTestData: () => ({
        values: [
          {
            key1: new Date('2000-08-06T02:13:00.000Z'),
            key2: new Date('2001-09-07T03:14:00.000Z'),
          },
          {},
        ],
      }),
    },
  },

  UNIONS: {
    union: {
      title: 'atomic union',
      prepareForJson: () => createPrepareForJson<Date | number | string | null | bigint>(),
      restoreFromJson: () => createRestoreFromJson<Date | number | string | null | bigint>(),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
    },
    union_array: {
      title: 'union of arrays',
      prepareForJson: () => createPrepareForJson<string[] | number[] | boolean[] | Date[]>(),
      restoreFromJson: () => createRestoreFromJson<string[] | number[] | boolean[] | Date[]>(),
      getTestData: () => ({
        values: [
          ['a', 'b', 'c'],
          [1, 2, 3],
          [true, false, true],
          [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')],
          [],
        ],
      }),
    },
    with_discriminator: {
      title: 'array of union with discriminator',
      prepareForJson: () => createPrepareForJson<(string | bigint | boolean | Date)[]>(),
      restoreFromJson: () => createRestoreFromJson<(string | bigint | boolean | Date)[]>(),
      getTestData: () => {
        const date = new Date('2000-08-06T02:13:00.000Z');
        return {
          values: [
            ['a', 'b', 'c'],
            [1n, 2n, 3n],
            [true, false, true],
            [1n, 'b', date],
          ],
        };
      },
    },
    union_object_with_discriminator: {
      title: 'union of object shapes',
      prepareForJson: () => createPrepareForJson<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      getTestData: () => ({values: [{a: 'world', aa: true}, {c: 1n}, {d: 'hello'}, {}]}),
    },
    union_with_discriminator_property: {
      title: 'union with discriminator property',
      prepareForJson: () =>
        createPrepareForJson<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      getTestData: () => ({
        values: [
          {type: 'a', otherProp: true},
          {type: 'b', otherProp: 123},
          {type: 'c', otherProp: 'hello', time: new Date('2000-08-06T02:13:00.000Z')},
          {type: true, otherProp: 'typeD'},
        ],
      }),
    },
    union_mixed_with_discriminator: {
      title: 'union mixed arrays and objects',
      prepareForJson: () =>
        createPrepareForJson<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
      getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}]}),
    },
    union_index_property_with_discriminator: {
      title: 'union with index property and discriminator',
      prepareForJson: () =>
        createPrepareForJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}, {b: 1n, c: 2n}]}),
    },
    circular_union_with_discriminator: {
      title: 'Circular union with discriminator',
      prepareForJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createPrepareForJson<UnionC>();
      },
      restoreFromJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createRestoreFromJson<UnionC>();
      },
      getTestData: () => {
        const date = new Date('2000-08-06T02:13:00.000Z');
        return {
          values: [
            new Date(date.getTime()),
            123,
            'hello',
            {a: {a: {}}},
            {},
            [],
            [[]],
            [123, 3, {b: 'hello'}],
            [123, 3, 'hello'],
            [[123], 3, [3, 'hello']],
          ],
        };
      },
    },
    union_with_methods: {
      title: 'union with methods — methods should be excluded',
      prepareForJson: () =>
        createPrepareForJson<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      getTestData: () => {
        const objWithName = {
          name: 'John',
          getName() {
            return 'John';
          },
        };
        const objWithAge = {
          age: 25,
          getAge() {
            return 25;
          },
        };
        const objWithActive = {
          active: true,
          isActive() {
            return true;
          },
        };
        return {
          values: [objWithName, objWithAge, objWithActive],
          deserializedValues: [{name: 'John'}, {age: 25}, {active: true}],
        };
      },
    },
    union_with_any: {
      title: 'union with any — checked last as fallback',
      prepareForJson: () => createPrepareForJson<number | {name: string} | any>(),
      restoreFromJson: () => createRestoreFromJson<number | {name: string} | any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
    },
    union_with_non_serializable: {
      title: 'union with non-serializable type throws',
      description: 'function in union — mion throws at JIT-compile time.',
      prepareForJson: () => createPrepareForJson<Date | number | string | (() => any)>(),
      restoreFromJson: () => createRestoreFromJson<Date | number | string | (() => any)>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
  },

  ITERABLES: {
    set_string: {
      title: 'Set<string>',
      prepareForJson: () => createPrepareForJson<Set<string>>(),
      restoreFromJson: () => createRestoreFromJson<Set<string>>(),
      getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
    },
    set_small_object: {
      title: 'Set<SmallObject>',
      prepareForJson: () => createPrepareForJson<Set<SmallObject>>(),
      restoreFromJson: () => createRestoreFromJson<Set<SmallObject>>(),
      getTestData: () => ({
        values: [
          new Set<SmallObject>([
            {prop1: 'value1', prop2: 1, prop3: true},
            {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')},
            {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
          ]),
        ],
      }),
    },
    objects_with_nested_sets: {
      title: 'objects with nested sets',
      prepareForJson: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createPrepareForJson<DeepWithSet>();
      },
      restoreFromJson: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createRestoreFromJson<DeepWithSet>();
      },
      getTestData: () => {
        const setB = new Set([
          {s: 'a', arr: [1, 2, 3]},
          {s: 'b', arr: [4, 5, 6]},
        ]);
        const setC = new Set([
          {s: 'a', arr: [1, 2, 3]},
          {s: 'b', arr: [4, 5, 6]},
        ]);
        return {values: [{a: 'a', b: setB, c: setC}]};
      },
    },
    map_string_number: {
      title: 'Map<string, number>',
      prepareForJson: () => createPrepareForJson<Map<string, number>>(),
      restoreFromJson: () => createRestoreFromJson<Map<string, number>>(),
      getTestData: () => ({
        values: [
          new Map<string, number>([
            ['one', 1],
            ['two', 2],
            ['three', 3],
          ]),
        ],
      }),
    },
    map_string_small_object: {
      title: 'Map<string, SmallObject>',
      prepareForJson: () => createPrepareForJson<Map<string, SmallObject>>(),
      restoreFromJson: () => createRestoreFromJson<Map<string, SmallObject>>(),
      getTestData: () => ({
        values: [
          new Map<string, SmallObject>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
            ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}],
            ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
          ]),
        ],
      }),
    },
    map_small_object_number: {
      title: 'Map<SmallObject, number>',
      prepareForJson: () => createPrepareForJson<Map<SmallObject, number>>(),
      restoreFromJson: () => createRestoreFromJson<Map<SmallObject, number>>(),
      getTestData: () => ({
        values: [
          new Map<SmallObject, number>([
            [{prop1: 'value1', prop2: 1, prop3: true}, 1],
            [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}, 2],
            [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
          ]),
        ],
      }),
    },
    objects_with_nested_maps: {
      title: 'objects with nested maps',
      prepareForJson: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createPrepareForJson<DeepWithMap>();
      },
      restoreFromJson: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createRestoreFromJson<DeepWithMap>();
      },
      getTestData: () => ({
        values: [
          {
            a: 'a',
            b: new Map([
              ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
              ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
          },
        ],
      }),
    },
    map_with_bigint_keys: {
      title: 'Map with bigint keys',
      prepareForJson: () => createPrepareForJson<Map<bigint, number>>(),
      restoreFromJson: () => createRestoreFromJson<Map<bigint, number>>(),
      getTestData: () => ({
        values: [
          new Map<bigint, number>([
            [1n, 1],
            [2n, 2],
            [3n, 3],
          ]),
        ],
      }),
    },
    map_with_date_values: {
      title: 'Map with Date values',
      prepareForJson: () => createPrepareForJson<Map<string, Date>>(),
      restoreFromJson: () => createRestoreFromJson<Map<string, Date>>(),
      getTestData: () => ({
        values: [
          new Map<string, Date>([
            ['date1', new Date('2000-08-06T02:13:00.000Z')],
            ['date2', new Date('2001-09-07T03:14:00.000Z')],
          ]),
        ],
      }),
    },
  },

  CIRCULAR_REFS: {
    circular_types: {
      title: 'circular objects',
      prepareForJson: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createPrepareForJson<CircularObject>();
      },
      restoreFromJson: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createRestoreFromJson<CircularObject>();
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    circular_union_array: {
      title: 'CircularUnion array with discriminator',
      prepareForJson: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createPrepareForJson<CuArray>();
      },
      restoreFromJson: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createRestoreFromJson<CuArray>();
      },
      getTestData: () => {
        const date = new Date('2000-08-06T02:13:00.000Z');
        return {
          values: [
            [date, 123, 'hello', ['a', 'b', 'c']],
            [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]],
            [],
          ],
        };
      },
    },
    circular_tuple: {
      title: 'CircularTuple object with discriminator',
      prepareForJson: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createPrepareForJson<CircularTuple>();
      },
      restoreFromJson: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createRestoreFromJson<CircularTuple>();
      },
      getTestData: () => ({
        values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
      }),
    },
    circular_index: {
      title: 'CircularIndex object with discriminator',
      prepareForJson: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createPrepareForJson<CircularIndex>();
      },
      restoreFromJson: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createRestoreFromJson<CircularIndex>();
      },
      getTestData: () => ({
        values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
      }),
    },
    circular_deep: {
      title: 'CircularDeep object with discriminator',
      prepareForJson: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createPrepareForJson<CircularDeep>();
      },
      restoreFromJson: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createRestoreFromJson<CircularDeep>();
      },
      getTestData: () => ({
        values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      }),
    },
    circular_tuple_complex: {
      title: 'Circular tuple with complex structure',
      prepareForJson: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createPrepareForJson<CircularTupleComplex>();
      },
      restoreFromJson: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createRestoreFromJson<CircularTupleComplex>();
      },
      getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
    },
    object_with_circular_array: {
      title: 'object with circular array',
      prepareForJson: () => createPrepareForJson<ObjCircularArr>(),
      restoreFromJson: () => createRestoreFromJson<ObjCircularArr>(),
      getTestData: () => ({
        values: [
          {
            a: 'hello',
            deep: {b: 'world', c: 123},
            d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
          },
        ],
      }),
    },
  },

  TEMPLATE_LITERALS: {
    url_string: {
      title: 'template literal as string type',
      prepareForJson: () => createPrepareForJson<`api/users/${number}`>(),
      restoreFromJson: () => createRestoreFromJson<`api/users/${number}`>(),
      getTestData: () => ({
        values: [
          'api/users/0',
          'api/users/1',
          'api/users/42',
          'api/users/-7',
          'api/users/3.14',
          `api/users/${Number.MAX_SAFE_INTEGER}`,
        ],
      }),
    },
    url_in_object: {
      title: 'template literal as object property type',
      prepareForJson: () => createPrepareForJson<{url: `api/user/${number}`; method: string}>(),
      restoreFromJson: () => createRestoreFromJson<{url: `api/user/${number}`; method: string}>(),
      getTestData: () => ({
        values: [
          {url: 'api/user/1', method: 'GET'},
          {url: 'api/user/42', method: 'POST'},
          {url: 'api/user/-7', method: 'DELETE'},
        ],
      }),
    },
    url_index_key: {
      title: 'template literal as index signature key',
      prepareForJson: () => createPrepareForJson<{[key: `api/${string}`]: number}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: `api/${string}`]: number}>(),
      getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
    },
    url_index_key_with_named: {
      title: 'template literal index key + sibling named property',
      prepareForJson: () => createPrepareForJson<{meta: string; [key: `api/${string}`]: string | number}>(),
      restoreFromJson: () => createRestoreFromJson<{meta: string; [key: `api/${string}`]: string | number}>(),
      getTestData: () => ({
        values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
      }),
    },
  },

  OTHERS: {
    promise_jsonStringify_error: {
      title: 'Promise top-level throws',
      prepareForJson: () => createPrepareForJson<Promise<string>>(),
      restoreFromJson: () => createRestoreFromJson<Promise<string>>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable: {
      title: 'non-serializable type throws (Int8Array)',
      prepareForJson: () => createPrepareForJson<Int8Array>(),
      restoreFromJson: () => createRestoreFromJson<Int8Array>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_interface: {
      title: 'non-serializable inside interface throws',
      prepareForJson: () => createPrepareForJson<{a: Int8Array}>(),
      restoreFromJson: () => createRestoreFromJson<{a: Int8Array}>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_array: {
      title: 'non-serializable inside array throws',
      prepareForJson: () => createPrepareForJson<Int8Array[]>(),
      restoreFromJson: () => createRestoreFromJson<Int8Array[]>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_tuple: {
      title: 'non-serializable inside tuple throws',
      prepareForJson: () => createPrepareForJson<[Int8Array]>(),
      restoreFromJson: () => createRestoreFromJson<[Int8Array]>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
  },
} as const satisfies Record<string, Record<string, SerializationCase>>;
