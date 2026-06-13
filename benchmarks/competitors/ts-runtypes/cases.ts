// ts-runtypes validators keyed by suite case key ("GROUP.case"), TYPE form.
// Each entry is the case's own `validate` thunk copied VERBATIM from the shared
// suites (benchmarks/src/suites/**) — a `() => createValidate<T>()` arrow whose
// literal type argument the vite-plugin-runtypes rewrites at build time. Local
// enum / interface / type / function declarations inside a thunk are kept exactly
// as written so the plugin resolves `T` where it is authored. Cases the Go
// pipeline renders as an alwaysThrow factory (`factoryThrows`: symbol at a root or
// propagating position) opt out with NOT_SUPPORTED. This map also drives the
// runtime ts-go column and typecost's ts-go-type column. TOTAL over every key.

import {createValidate, createGetValidationErrors, registerFormatPattern} from 'ts-runtypes';
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
  FormatNumber,
  FormatInteger,
  FormatFloat,
  FormatInt8,
  FormatUInt8,
  FormatBigInt,
  FormatBigInt64,
  FormatBigUInt64,
  FormatDate,
} from 'ts-runtypes/formats';
import type {
  FormatTemporalInstant,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
  FormatTemporalZonedDateTime,
} from 'ts-runtypes/formats/temporal';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// Custom string-format patterns the STRING_FORMAT.pattern_* cases reference —
// copied VERBATIM from benchmarks/src/suites/format-validation/StringFormat.ts.
// The Go scanner recovers {source, flags, mockSamples} from these call sites, so
// the type aliases (`Slug` / `Hex`) resolve identically to the suite.
const slug = registerFormatPattern({
  source: '^[a-z0-9-]+$',
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});
type Slug = FormatString<{pattern: typeof slug}>;

const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = FormatString<{pattern: typeof hex}>;

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => createValidate<any>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<any>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.bigint': {
    build: () => createValidate<bigint>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<bigint>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.boolean': {
    build: () => createValidate<boolean>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<boolean>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.date': {
    build: () => createValidate<Date>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Date>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.enum_mixed': {
    build: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidate<Color>();
    },
    buildErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const getErrors = createGetValidationErrors<Color>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_2': {
    build: () => createValidate<2>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<2>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_a': {
    build: () => createValidate<'a'>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<'a'>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_true': {
    build: () => createValidate<true>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<true>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_1n': {
    build: () => createValidate<1n>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<1n>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_symbol': {
    build: () => {
      const sym = Symbol('hello');
      return createValidate<typeof sym>();
    },
    buildErrors: () => {
      const sym = Symbol('hello');
      const getErrors = createGetValidationErrors<typeof sym>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.never': {
    build: () => createValidate<never>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<never>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.null': {
    build: () => createValidate<null>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<null>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.number': {
    build: () => createValidate<number>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<number>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.object': {
    build: () => createValidate<object>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<object>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.regexp': {
    build: () => createValidate<RegExp>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<RegExp>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.string': {
    build: () => createValidate<string>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.undefined': {
    build: () => createValidate<undefined>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<undefined>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.void': {
    build: () => createValidate<void>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<void>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_2_noLiterals': {
    build: () => createValidate<2>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<2>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_a_noLiterals': {
    build: () => createValidate<'a'>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<'a'>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_regexp_noLiterals': {
    build: () => {
      const reg = /abc/i;
      return createValidate<typeof reg>(undefined, {noLiterals: true});
    },
    buildErrors: () => {
      const reg = /abc/i;
      const getErrors = createGetValidationErrors<typeof reg>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_true_noLiterals': {
    build: () => createValidate<true>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<true>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_1n_noLiterals': {
    build: () => createValidate<1n>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<1n>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.unknown': {
    build: () => createValidate<unknown>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<unknown>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => createValidate<string[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.number_array': {
    build: () => createValidate<number[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<number[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.boolean_array': {
    build: () => createValidate<boolean[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<boolean[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.bigint_array': {
    build: () => createValidate<bigint[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<bigint[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.date_array': {
    build: () => createValidate<Date[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Date[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.regexp_array': {
    build: () => createValidate<RegExp[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<RegExp[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.undefined_array': {
    build: () => createValidate<undefined[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<undefined[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.null_array': {
    build: () => createValidate<null[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<null[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.array_generic': {
    build: () => createValidate<Array<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Array<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => createValidate<string[][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string[][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => createValidate<string[][][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string[][][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.string_array_noIsArrayCheck': {
    build: () => createValidate<string[]>(undefined, {noIsArrayCheck: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string[]>(undefined, {noIsArrayCheck: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.object_array': {
    build: () => createValidate<{a: string}[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string}[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.union_array': {
    build: () => createValidate<(string | number)[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<(string | number)[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.tuple_array': {
    build: () => createValidate<[string, number][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[string, number][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.circular_array': {
    build: () => {
      type CircularArray = CircularArray[];
      return createValidate<CircularArray>();
    },
    buildErrors: () => {
      type CircularArray = CircularArray[];
      const getErrors = createGetValidationErrors<CircularArray>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.circular_object_with_array': {
    build: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createValidate<ObjectType>();
    },
    buildErrors: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const getErrors = createGetValidationErrors<ObjectType>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': {
    build: () => createValidate<ReadonlyArray<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<ReadonlyArray<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => createValidate<{a: string; b: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string; b: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_as_const_literals': {
    build: () => createValidate<{readonly name: 'john'; readonly age: 30}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{readonly name: 'john'; readonly age: 30}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_via_return_type_utility': {
    build: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createValidate<ReturnType<typeof makeUser>>();
    },
    buildErrors: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      const getErrors = createGetValidationErrors<ReturnType<typeof makeUser>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_via_property_access': {
    build: () => createValidate<{id: number; name: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{id: number; name: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_via_array_access': {
    build: () => createValidate<{id: number; name: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{id: number; name: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_with_optional': {
    build: () => createValidate<{a: string; b?: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string; b?: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_with_date': {
    build: () => createValidate<{date: Date; name: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{date: Date; name: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_with_method': {
    build: () => createValidate<{name: string; cb: () => any}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{name: string; cb: () => any}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.nested_object': {
    build: () => createValidate<{a: string; deep: {b: string; c: number}}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string; deep: {b: string; c: number}}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_string_array_prop': {
    build: () => createValidate<{tags: string[]}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{tags: string[]}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.circular_interface': {
    build: () => {
      type ICircular = {name: string; child?: ICircular};
      return createValidate<ICircular>();
    },
    buildErrors: () => {
      type ICircular = {name: string; child?: ICircular};
      const getErrors = createGetValidationErrors<ICircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.circular_interface_on_array': {
    build: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createValidate<ICircularArray>();
    },
    buildErrors: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const getErrors = createGetValidationErrors<ICircularArray>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    build: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createValidate<ICircularDeep>();
    },
    buildErrors: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const getErrors = createGetValidationErrors<ICircularDeep>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_string': {
    build: () => createValidate<{[key: string]: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{[key: string]: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_named_props': {
    build: () => createValidate<{a: string; b: number; [key: string]: string | number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string; b: number; [key: string]: string | number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => createValidate<{[key: string]: {[key: string]: number}}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{[key: string]: {[key: string]: number}}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_date_value': {
    build: () => createValidate<{[key: string]: {[key: string]: Date}}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{[key: string]: {[key: string]: Date}}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_non_root': {
    build: () => {
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
    buildErrors: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const getErrors = createGetValidationErrors<Obj2>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.function_top_level': {
    build: () => createValidate<() => void>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<() => void>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_callable': {
    build: () => createValidate<{(a: number, b: boolean): string; extra: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{(a: number, b: boolean): string; extra: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_all_optional': {
    build: () => createValidate<{a?: string; b?: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a?: string; b?: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.class_simple': {
    build: () => {
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
    buildErrors: () => {
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
      const getErrors = createGetValidationErrors<MySerializableClass>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.rpc_error_class': {
    build: () => {
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
    buildErrors: () => {
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
      const getErrors = createGetValidationErrors<RpcError<'test-error'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params': {
    build: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createValidate<Parameters<CallSig>>();
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      const getErrors = createGetValidationErrors<Parameters<CallSig>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createValidate<Parameters<CallSig>>();
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const getErrors = createGetValidationErrors<Parameters<CallSig>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createValidate<Parameters<CallSig>>();
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const getErrors = createGetValidationErrors<Parameters<CallSig>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.record_union_keys': {
    build: () => createValidate<Record<'a' | 'b', number>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Record<'a' | 'b', number>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.union_value_index': {
    build: () => createValidate<{[key: string]: string | number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{[key: string]: string | number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_with_union_prop': {
    build: () => createValidate<{kind: 'a' | 'b'; n: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{kind: 'a' | 'b'; n: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_inheritance': {
    build: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createValidate<Child>();
    },
    buildErrors: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const getErrors = createGetValidationErrors<Child>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.class_inheritance': {
    build: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createValidate<Sub>();
    },
    buildErrors: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const getErrors = createGetValidationErrors<Sub>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_number_key': {
    build: () => createValidate<{[k: number]: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{[k: number]: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => createValidate<[string, number]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[string, number]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.full_mion_tuple': {
    build: () => createValidate<[Date, number, string, null, string[], bigint]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[Date, number, string, null, string[], bigint]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_with_optional': {
    build: () => createValidate<[number, bigint?, boolean?, number?]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[number, bigint?, boolean?, number?]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.nested_tuple_in_array': {
    build: () => createValidate<[string, number][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[string, number][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_rest': {
    build: () => createValidate<[number, ...string[]]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[number, ...string[]]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_circular': {
    build: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createValidate<TupleCircular>();
    },
    buildErrors: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const getErrors = createGetValidationErrors<TupleCircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => createValidate<[number, bigint?, boolean?, number?]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[number, bigint?, boolean?, number?]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_named_labels': {
    build: () => createValidate<[name: string, age: number]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[name: string, age: number]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_with_non_serializable': {
    build: () => createValidate<[number, () => any]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[number, () => any]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.empty_tuple': {
    build: () => createValidate<[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => createValidate<[string]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<[string]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => createValidate<readonly [string, number]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<readonly [string, number]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': {
    build: () => createValidate<Date | number | string | null | bigint>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Date | number | string | null | bigint>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.string_literal_union': {
    build: () => createValidate<'UNO' | 'DOS' | 'TRES'>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<'UNO' | 'DOS' | 'TRES'>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.large_union_eight_arms': {
    build: () => createValidate<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<
        'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.string_or_number': {
    build: () => createValidate<string | number>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string | number>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_of_array_types': {
    build: () => createValidate<string[] | number[] | boolean[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string[] | number[] | boolean[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.array_of_union': {
    build: () => createValidate<(string | bigint | boolean | Date)[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<(string | bigint | boolean | Date)[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_of_object_shapes': {
    build: () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.discriminated_union': {
    build: () => createValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.circular_union': {
    build: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createValidate<UnionC>();
    },
    buildErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const getErrors = createGetValidationErrors<UnionC>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_methods': {
    build: () => createValidate<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{name: string; getName(): string} | {age: number; getAge(): number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.intersection_to_object': {
    build: () => createValidate<{a: string} & {b: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string} & {b: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_index_arm': {
    build: () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_same_prop_different_types': {
    build: () => createValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<
        {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_mixed_arrays_and_objects': {
    build: () =>
      createValidate<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_merged_property': {
    build: () => createValidate<{a: boolean} | {a: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{a: boolean} | {a: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_mixed_with_index': {
    build: () =>
      createValidate<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_any_fallback': {
    build: () => createValidate<string | any>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string | any>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => createValidate<string | unknown>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<string | unknown>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_subset_small_first': {
    build: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createValidate<SmallObj | LargeObj>();
    },
    buildErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const getErrors = createGetValidationErrors<SmallObj | LargeObj>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_subset_nested_levels': {
    build: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createValidate<Tiny | Medium | Large>();
    },
    buildErrors: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const getErrors = createGetValidationErrors<Tiny | Medium | Large>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_subset_mixed_related_unrelated': {
    build: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createValidate<Base | Extended | Unrelated>();
    },
    buildErrors: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const getErrors = createGetValidationErrors<Base | Extended | Unrelated>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => createValidate<`api/user/${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<`api/user/${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => createValidate<`/api/v${number}/user/${string}/posts/${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<`/api/v${number}/user/${string}/posts/${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => createValidate<`${string}/${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<`${string}/${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => createValidate<`(${number})`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<`(${number})`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => createValidate<{url: `api/user/${number}`; method: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{url: `api/user/${number}`; method: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_index_key': {
    build: () => createValidate<{[key: `api/${string}`]: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<{[key: `api/${string}`]: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => createValidate<`${'a' | 'b'}-${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<`${'a' | 'b'}-${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    build: () => createValidate<Map<string, number>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Map<string, number>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NATIVE.set_string': {
    build: () => createValidate<Set<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Set<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NATIVE.promise_string': {
    build: () => createValidate<Promise<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Promise<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NATIVE.awaited_promise': {
    build: () => createValidate<Awaited<Promise<string>>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Awaited<Promise<string>>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
    build: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createValidate<Circular>();
    },
    buildErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const getErrors = createGetValidationErrors<Circular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': {
    build: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createValidate<CuArray>();
    },
    buildErrors: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const getErrors = createGetValidationErrors<CuArray>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    build: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createValidate<CircularTuple>();
    },
    buildErrors: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const getErrors = createGetValidationErrors<CircularTuple>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createValidate<CircularIndex>();
    },
    buildErrors: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const getErrors = createGetValidationErrors<CircularIndex>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createValidate<CircularDeep>();
    },
    buildErrors: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const getErrors = createGetValidationErrors<CircularDeep>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.circular_child_under_literal_root': {
    build: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createValidate<RootNotCircular>();
    },
    buildErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const getErrors = createGetValidationErrors<RootNotCircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.multiple_circular_types_cross_referenced': {
    build: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
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
      return createValidate<RootCircular>();
    },
    buildErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
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
      const getErrors = createGetValidationErrors<RootCircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES; ts-go rejects via the {rejectCircularRefs} guard)
  'CIRCULAR_REFS.linked_list_cycle': {
    build: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    buildErrors: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      const getErrors = createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR_REFS.tree_cycle': {
    build: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    buildErrors: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      const getErrors = createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR_REFS.object_self_cycle': {
    build: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    buildErrors: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      const getErrors = createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Partial<Person>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrors<Partial<Person>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.required': {
    build: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createValidate<Required<MaybePerson>>();
    },
    buildErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const getErrors = createGetValidationErrors<Required<MaybePerson>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.pick': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Pick<Person, 'name' | 'createdAt'>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrors<Pick<Person, 'name' | 'createdAt'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.omit': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Omit<Person, 'age'>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrors<Omit<Person, 'age'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.exclude_atomic': {
    build: () => createValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.extract_atomic': {
    build: () => createValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createValidate<Exclude<Shape, {kind: 'circle'}>>();
    },
    buildErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const getErrors = createGetValidationErrors<Exclude<Shape, {kind: 'circle'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.non_nullable': {
    build: () => createValidate<NonNullable<string | number | null | undefined>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<NonNullable<string | number | null | undefined>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.return_type': {
    build: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createValidate<ReturnType<Fn>>();
    },
    buildErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      const getErrors = createGetValidationErrors<ReturnType<Fn>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.readonly': {
    build: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidate<Readonly<Person>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      const getErrors = createGetValidationErrors<Readonly<Person>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.intersection_with_required_override': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.omit_keeping_optional': {
    build: () => createValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.keyof_to_literal_union': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<keyof Person>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrors<keyof Person>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.typeof_variable_query': {
    build: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidate<typeof config>();
    },
    buildErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      const getErrors = createGetValidationErrors<typeof config>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.indexed_access_type': {
    build: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidate<Person['name']>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      const getErrors = createGetValidationErrors<Person['name']>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.conditional_type_resolved': {
    build: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createValidate<IsString<'hello'>>();
    },
    buildErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      const getErrors = createGetValidationErrors<IsString<'hello'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.mapped_type_custom': {
    build: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createValidate<Nullable<Source>>();
    },
    buildErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const getErrors = createGetValidationErrors<Nullable<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.mapped_type_with_conditional_value': {
    build: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createValidate<UserForm>();
    },
    buildErrors: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const getErrors = createGetValidationErrors<UserForm>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.distributive_conditional_over_union': {
    build: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createValidate<Wrap<string | number>>();
    },
    buildErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const getErrors = createGetValidationErrors<Wrap<string | number>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createValidate<DeepPartial<Settings>>();
    },
    buildErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const getErrors = createGetValidationErrors<DeepPartial<Settings>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': {
    build: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createValidate<Prefixed<Source>>();
    },
    buildErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const getErrors = createGetValidationErrors<Prefixed<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TYPE_MAPPINGS.key_conditional_rename': {
    build: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createValidate<MongoForm<Source>>();
    },
    buildErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const getErrors = createGetValidationErrors<MongoForm<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TYPE_MAPPINGS.key_filter_via_never': {
    build: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createValidate<Public<Source>>();
    },
    buildErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const getErrors = createGetValidationErrors<Public<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── DATETIME ──
  'DATETIME.date': {
    build: () => createValidate<Date>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Date>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant': {
    build: () => createValidate<Temporal.Instant>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.Instant>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime': {
    build: () => createValidate<Temporal.ZonedDateTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.ZonedDateTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate': {
    build: () => createValidate<Temporal.PlainDate>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.PlainDate>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainTime': {
    build: () => createValidate<Temporal.PlainTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.PlainTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime': {
    build: () => createValidate<Temporal.PlainDateTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.PlainDateTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth': {
    build: () => createValidate<Temporal.PlainYearMonth>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.PlainYearMonth>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainMonthDay': {
    build: () => createValidate<Temporal.PlainMonthDay>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.PlainMonthDay>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.duration': {
    build: () => createValidate<Temporal.Duration>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Temporal.Duration>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => createValidate<FormatString<{maxLength: 5}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{maxLength: 5}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => createValidate<FormatString<{minLength: 3}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{minLength: 3}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => createValidate<FormatString<{length: 4}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{length: 4}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => createValidate<FormatString<{minLength: 2; maxLength: 4}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{minLength: 2; maxLength: 4}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => createValidate<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    build: () => createValidate<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => createValidate<FormatString<{allowedChars: {val: '.-'}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{allowedChars: {val: '.-'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => createValidate<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    build: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => createValidate<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => createValidate<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => createValidate<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha': {
    build: () => createValidate<FormatAlpha>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatAlpha>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => createValidate<FormatAlphaNumeric>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatAlphaNumeric>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => createValidate<FormatNumeric>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumeric>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => createValidate<FormatAlpha<{maxLength: 3}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatAlpha<{maxLength: 3}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.lowercase_validate': {
    build: () => createValidate<FormatLowercase>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatLowercase>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv4': {
    build: () => createValidate<FormatUUIDv4>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatUUIDv4>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => createValidate<FormatUUIDv7>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatUUIDv7>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_iso': {
    build: () => createValidate<FormatStringDate>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringDate>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_DMY': {
    build: () => createValidate<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringDate<{format: 'DD-MM-YYYY'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_YM': {
    build: () => createValidate<FormatStringDate<{format: 'YYYY-MM'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_MD': {
    build: () => createValidate<FormatStringDate<{format: 'MM-DD'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringDate<{format: 'MM-DD'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_minMax_absolute': {
    build: () => createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_iso': {
    build: () => createValidate<FormatStringTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => createValidate<FormatStringTime<{format: 'HH:mm:ss'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => createValidate<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': {
    build: () => createValidate<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_default': {
    build: () => createValidate<FormatStringDateTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatStringDateTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_custom': {
    build: () => createValidate<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<
          FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
        >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_minMax_absolute': {
    build: () =>
      createValidate<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv4': {
    build: () => createValidate<FormatIPv4>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatIPv4>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6': {
    build: () => createValidate<FormatIPv6>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatIPv6>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ip_any': {
    build: () => createValidate<FormatIP>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatIP>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv4_port': {
    build: () => createValidate<FormatIPv4WithPort>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatIPv4WithPort>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6_port': {
    build: () => createValidate<FormatIPv6WithPort>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatIPv6WithPort>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => createValidate<FormatDomain>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDomain>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.domainStrict': {
    build: () => createValidate<FormatDomainStrict>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDomainStrict>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.email': {
    build: () => createValidate<FormatEmail>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatEmail>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => createValidate<FormatEmailPunycode>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatEmailPunycode>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailStrict': {
    build: () => createValidate<FormatEmailStrict>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatEmailStrict>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.url': {
    build: () => createValidate<FormatUrl>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatUrl>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => createValidate<FormatUrlHttp>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatUrlHttp>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => createValidate<FormatUrlFile>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatUrlFile>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => createValidate<Slug>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Slug>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => createValidate<Hex>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<Hex>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => createValidate<FormatNumber<{max: 100}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumber<{max: 100}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => createValidate<FormatNumber<{min: 0}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumber<{min: 0}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => createValidate<FormatNumber<{lt: 10}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumber<{lt: 10}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => createValidate<FormatNumber<{gt: 0}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumber<{gt: 0}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    build: () => createValidate<FormatInteger>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatInteger>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_float': {
    build: () => createValidate<FormatFloat>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatFloat>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => createValidate<FormatNumber<{multipleOf: 5}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumber<{multipleOf: 5}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_combined': {
    build: () => createValidate<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => createValidate<FormatInt8>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatInt8>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => createValidate<FormatUInt8>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatUInt8>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    build: () => createValidate<FormatBigInt<{max: 100n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt<{max: 100n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    build: () => createValidate<FormatBigInt<{min: 0n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt<{min: 0n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    build: () => createValidate<FormatBigInt<{lt: 10n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt<{lt: 10n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    build: () => createValidate<FormatBigInt<{gt: 0n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt<{gt: 0n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    build: () => createValidate<FormatBigInt<{multipleOf: 5n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt<{multipleOf: 5n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    build: () => createValidate<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_int64': {
    build: () => createValidate<FormatBigInt64>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigInt64>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => createValidate<FormatBigUInt64>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatBigUInt64>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── DATETIME ──
  'DATETIME.date_minmax': {
    build: () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_gtlt': {
    build: () => createValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_min_lt': {
    build: () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_max_now': {
    build: () => createValidate<FormatDate<{max: 'now'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDate<{max: 'now'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_rel_window': {
    build: () => createValidate<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_rel_datetime_components': {
    build: () => createValidate<FormatDate<{min: 'now-P1000YT12H'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatDate<{min: 'now-P1000YT12H'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant_minmax': {
    build: () => createValidate<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant_gtlt': {
    build: () => createValidate<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant_rel': {
    build: () => createValidate<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_minmax': {
    build: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gtlt': {
    build: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_min_lt': {
    build: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gt_max': {
    build: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_min_only': {
    build: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_max_only': {
    build: () => createValidate<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{max: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gt_only': {
    build: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_lt_only': {
    build: () => createValidate<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{lt: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_window': {
    build: () => createValidate<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_ymd': {
    build: () => createValidate<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_weeks': {
    build: () => createValidate<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P52200W'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainTime_minmax': {
    build: () => createValidate<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainTime_gtlt': {
    build: () => createValidate<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_minmax': {
    build: () => createValidate<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_gtlt': {
    build: () => createValidate<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_rel': {
    build: () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_rel_combo': {
    build: () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_minmax': {
    build: () => createValidate<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_gtlt': {
    build: () => createValidate<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_rel': {
    build: () => createValidate<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_minmax': {
    build: () =>
      createValidate<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<
          FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>
        >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_gtlt': {
    build: () => createValidate<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrors<
          FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>
        >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_rel': {
    build: () => createValidate<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrors<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── REALWORLD ──
  'REALWORLD.user': {
    build: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createValidate<User>();
    },
    buildErrors: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      const getErrors = createGetValidationErrors<User>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.order': {
    build: () => {
      interface Address {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      }
      interface OrderItem {
        sku: string;
        name: string;
        qty: number;
        price: number;
      }
      interface Order {
        id: string;
        customer: {id: number; email: string};
        items: OrderItem[];
        shipping: Address;
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      return createValidate<Order>();
    },
    buildErrors: () => {
      interface Address {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      }
      interface OrderItem {
        sku: string;
        name: string;
        qty: number;
        price: number;
      }
      interface Order {
        id: string;
        customer: {id: number; email: string};
        items: OrderItem[];
        shipping: Address;
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      const getErrors = createGetValidationErrors<Order>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.blogPost': {
    build: () => {
      interface BlogPost {
        id: number;
        title: string;
        slug: string;
        body: string;
        tags: string[];
        author: {name: string; email: string};
        published: boolean;
        publishedAt?: string;
        meta: {views: number; likes: number};
      }
      return createValidate<BlogPost>();
    },
    buildErrors: () => {
      interface BlogPost {
        id: number;
        title: string;
        slug: string;
        body: string;
        tags: string[];
        author: {name: string; email: string};
        published: boolean;
        publishedAt?: string;
        meta: {views: number; likes: number};
      }
      const getErrors = createGetValidationErrors<BlogPost>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.product': {
    build: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      return createValidate<Product>();
    },
    buildErrors: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      const getErrors = createGetValidationErrors<Product>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.productPage': {
    build: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      interface ProductPage {
        data: Product[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      }
      return createValidate<ProductPage>();
    },
    buildErrors: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      interface ProductPage {
        data: Product[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      }
      const getErrors = createGetValidationErrors<ProductPage>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.registrationForm': {
    build: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createValidate<RegistrationForm>();
    },
    buildErrors: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      const getErrors = createGetValidationErrors<RegistrationForm>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
};
