// ts-go-run-types validators keyed by suite case key ("GROUP.case"), TYPE form.
// Each entry is the case's own `validate` thunk copied VERBATIM from the shared
// suites (benchmarks/src/suites/**) — a `() => createValidate<T>()` arrow whose
// literal type argument the vite-plugin-runtypes rewrites at build time. Local
// enum / interface / type / function declarations inside a thunk are kept exactly
// as written so the plugin resolves `T` where it is authored. Cases the Go
// pipeline renders as an alwaysThrow factory (`factoryThrows`: symbol at a root or
// propagating position) opt out with NOT_SUPPORTED. This map also drives the
// runtime ts-go column and typecost's ts-go-type column. TOTAL over every key.

import {createValidate, createGetValidationErrors, registerFormatPattern, type DataOnly} from '@mionjs/ts-go-run-types';
const noErrs = (fn: (v: unknown) => {length: number}) => (v: unknown) => fn(v).length === 0;
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
} from '@mionjs/ts-go-run-types/formats';
import type {
  FormatTemporalInstant,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
  FormatTemporalZonedDateTime,
} from '@mionjs/ts-go-run-types/formats/temporal';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';
import type {User, Order, BlogPost, Product, ProductPage, RegistrationForm} from '../../shared/cases/realworld/index.ts';

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
  'ATOMIC.any': {build: () => createValidate<any>(), buildErrors: () => noErrs(createGetValidationErrors<any>())},
  'ATOMIC.bigint': {build: () => createValidate<bigint>(), buildErrors: () => noErrs(createGetValidationErrors<bigint>())},
  'ATOMIC.boolean': {build: () => createValidate<boolean>(), buildErrors: () => noErrs(createGetValidationErrors<boolean>())},
  'ATOMIC.date': {build: () => createValidate<Date>(), buildErrors: () => noErrs(createGetValidationErrors<Date>())},
  'ATOMIC.enum_mixed': (() => {
    enum Color {
      Red,
      Green = 'green',
      Blue = 2,
    }
    return {build: () => createValidate<Color>(), buildErrors: () => noErrs(createGetValidationErrors<Color>())};
  })(),
  'ATOMIC.literal_2': {build: () => createValidate<2>(), buildErrors: () => noErrs(createGetValidationErrors<2>())},
  'ATOMIC.literal_a': {build: () => createValidate<'a'>(), buildErrors: () => noErrs(createGetValidationErrors<'a'>())},
  'ATOMIC.literal_true': {build: () => createValidate<true>(), buildErrors: () => noErrs(createGetValidationErrors<true>())},
  'ATOMIC.literal_1n': {build: () => createValidate<1n>(), buildErrors: () => noErrs(createGetValidationErrors<1n>())},
  'ATOMIC.literal_symbol': (() => {
    const sym = Symbol('hello');
    return {build: () => createValidate<typeof sym>(), buildErrors: () => noErrs(createGetValidationErrors<typeof sym>())};
  })(),
  'ATOMIC.never': {build: () => createValidate<never>(), buildErrors: () => noErrs(createGetValidationErrors<never>())},
  'ATOMIC.null': {build: () => createValidate<null>(), buildErrors: () => noErrs(createGetValidationErrors<null>())},
  'ATOMIC.number': {build: () => createValidate<number>(), buildErrors: () => noErrs(createGetValidationErrors<number>())},
  'ATOMIC.object': {build: () => createValidate<object>(), buildErrors: () => noErrs(createGetValidationErrors<object>())},
  'ATOMIC.regexp': {build: () => createValidate<RegExp>(), buildErrors: () => noErrs(createGetValidationErrors<RegExp>())},
  'ATOMIC.string': {build: () => createValidate<string>(), buildErrors: () => noErrs(createGetValidationErrors<string>())},
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.undefined': {build: () => createValidate<undefined>(), buildErrors: () => noErrs(createGetValidationErrors<undefined>())},
  'ATOMIC.void': {build: () => createValidate<void>(), buildErrors: () => noErrs(createGetValidationErrors<void>())},
  'ATOMIC.literal_2_noLiterals': {build: () => createValidate<2>(undefined, {noLiterals: true}), buildErrors: () => noErrs(createGetValidationErrors<2>(undefined, {noLiterals: true}))},
  'ATOMIC.literal_a_noLiterals': {build: () => createValidate<'a'>(undefined, {noLiterals: true}), buildErrors: () => noErrs(createGetValidationErrors<'a'>(undefined, {noLiterals: true}))},
  'ATOMIC.literal_regexp_noLiterals': (() => {
    const reg = /abc/i;
    return {build: () => createValidate<typeof reg>(undefined, {noLiterals: true}), buildErrors: () => noErrs(createGetValidationErrors<typeof reg>(undefined, {noLiterals: true}))};
  })(),
  'ATOMIC.literal_true_noLiterals': {build: () => createValidate<true>(undefined, {noLiterals: true}), buildErrors: () => noErrs(createGetValidationErrors<true>(undefined, {noLiterals: true}))},
  'ATOMIC.literal_1n_noLiterals': {build: () => createValidate<1n>(undefined, {noLiterals: true}), buildErrors: () => noErrs(createGetValidationErrors<1n>(undefined, {noLiterals: true}))},
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.unknown': {build: () => createValidate<unknown>(), buildErrors: () => noErrs(createGetValidationErrors<unknown>())},

  // ── ARRAY ──
  'ARRAY.string_array': {build: () => createValidate<string[]>(), buildErrors: () => noErrs(createGetValidationErrors<string[]>())},
  'ARRAY.number_array': {build: () => createValidate<number[]>(), buildErrors: () => noErrs(createGetValidationErrors<number[]>())},
  'ARRAY.boolean_array': {build: () => createValidate<boolean[]>(), buildErrors: () => noErrs(createGetValidationErrors<boolean[]>())},
  'ARRAY.bigint_array': {build: () => createValidate<bigint[]>(), buildErrors: () => noErrs(createGetValidationErrors<bigint[]>())},
  'ARRAY.date_array': {build: () => createValidate<Date[]>(), buildErrors: () => noErrs(createGetValidationErrors<Date[]>())},
  'ARRAY.regexp_array': {build: () => createValidate<RegExp[]>(), buildErrors: () => noErrs(createGetValidationErrors<RegExp[]>())},
  'ARRAY.undefined_array': {build: () => createValidate<undefined[]>(), buildErrors: () => noErrs(createGetValidationErrors<undefined[]>())},
  'ARRAY.null_array': {build: () => createValidate<null[]>(), buildErrors: () => noErrs(createGetValidationErrors<null[]>())},
  'ARRAY.array_generic': {build: () => createValidate<Array<string>>(), buildErrors: () => noErrs(createGetValidationErrors<Array<string>>())},
  'ARRAY.string_array_2d': {build: () => createValidate<string[][]>(), buildErrors: () => noErrs(createGetValidationErrors<string[][]>())},
  'ARRAY.string_array_3d': {build: () => createValidate<string[][][]>(), buildErrors: () => noErrs(createGetValidationErrors<string[][][]>())},
  'ARRAY.string_array_noIsArrayCheck': {build: () => createValidate<string[]>(undefined, {noIsArrayCheck: true}), buildErrors: () => noErrs(createGetValidationErrors<string[]>(undefined, {noIsArrayCheck: true}))},
  'ARRAY.object_array': {build: () => createValidate<{a: string}[]>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string}[]>())},
  'ARRAY.union_array': {build: () => createValidate<(string | number)[]>(), buildErrors: () => noErrs(createGetValidationErrors<(string | number)[]>())},
  'ARRAY.tuple_array': {build: () => createValidate<[string, number][]>(), buildErrors: () => noErrs(createGetValidationErrors<[string, number][]>())},
  'ARRAY.circular_array': (() => {
    type CircularArray = CircularArray[];
    return {build: () => createValidate<CircularArray>(), buildErrors: () => noErrs(createGetValidationErrors<CircularArray>())};
  })(),
  'ARRAY.circular_object_with_array': (() => {
    type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
    return {build: () => createValidate<ObjectType>(), buildErrors: () => noErrs(createGetValidationErrors<ObjectType>())};
  })(),
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': {build: () => createValidate<ReadonlyArray<string>>(), buildErrors: () => noErrs(createGetValidationErrors<ReadonlyArray<string>>())},

  // ── OBJECT ──
  'OBJECT.simple_interface': {build: () => createValidate<{a: string; b: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string; b: number}>())},
  'OBJECT.object_as_const_literals': {build: () => createValidate<{readonly name: 'john'; readonly age: 30}>(), buildErrors: () => noErrs(createGetValidationErrors<{readonly name: 'john'; readonly age: 30}>())},
  'OBJECT.object_via_return_type_utility': (() => {
    function makeUser(): {id: number; name: string} {
      return {id: 1, name: 'john'};
    }
    return {build: () => createValidate<ReturnType<typeof makeUser>>(), buildErrors: () => noErrs(createGetValidationErrors<ReturnType<typeof makeUser>>())};
  })(),
  'OBJECT.object_via_property_access': {build: () => createValidate<{id: number; name: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{id: number; name: string}>())},
  'OBJECT.object_via_array_access': {build: () => createValidate<{id: number; name: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{id: number; name: string}>())},
  'OBJECT.interface_with_optional': {build: () => createValidate<{a: string; b?: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string; b?: number}>())},
  'OBJECT.interface_with_date': {build: () => createValidate<{date: Date; name: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{date: Date; name: string}>())},
  'OBJECT.interface_with_method': {build: () => createValidate<{name: string; cb: () => any}>(), buildErrors: () => noErrs(createGetValidationErrors<{name: string; cb: () => any}>())},
  'OBJECT.nested_object': {build: () => createValidate<{a: string; deep: {b: string; c: number}}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string; deep: {b: string; c: number}}>())},
  'OBJECT.interface_string_array_prop': {build: () => createValidate<{tags: string[]}>(), buildErrors: () => noErrs(createGetValidationErrors<{tags: string[]}>())},
  'OBJECT.circular_interface': (() => {
    type ICircular = {name: string; child?: ICircular};
    return {build: () => createValidate<ICircular>(), buildErrors: () => noErrs(createGetValidationErrors<ICircular>())};
  })(),
  'OBJECT.circular_interface_on_array': (() => {
    type ICircularArray = {name: string; children?: ICircularArray[]};
    return {build: () => createValidate<ICircularArray>(), buildErrors: () => noErrs(createGetValidationErrors<ICircularArray>())};
  })(),
  'OBJECT.circular_interface_on_nested_object': (() => {
    type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
    return {build: () => createValidate<ICircularDeep>(), buildErrors: () => noErrs(createGetValidationErrors<ICircularDeep>())};
  })(),
  'OBJECT.index_signature_string': {build: () => createValidate<{[key: string]: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{[key: string]: string}>())},
  'OBJECT.index_signature_named_props': {build: () => createValidate<{a: string; b: number; [key: string]: string | number}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string; b: number; [key: string]: string | number}>())},
  'OBJECT.index_signature_nested': {build: () => createValidate<{[key: string]: {[key: string]: number}}>(), buildErrors: () => noErrs(createGetValidationErrors<{[key: string]: {[key: string]: number}}>())},
  'OBJECT.index_signature_date_value': {build: () => createValidate<{[key: string]: {[key: string]: Date}}>(), buildErrors: () => noErrs(createGetValidationErrors<{[key: string]: {[key: string]: Date}}>())},
  'OBJECT.index_signature_non_root': (() => {
    interface Obj1 {
      a: string;
      [key: string]: string;
    }
    interface Obj2 {
      b: string;
      c: Obj1;
    }
    return {build: () => createValidate<Obj2>(), buildErrors: () => noErrs(createGetValidationErrors<Obj2>())};
  })(),
  'OBJECT.function_top_level': {build: () => createValidate<() => void>(), buildErrors: () => noErrs(createGetValidationErrors<() => void>())},
  'OBJECT.interface_callable': {build: () => createValidate<{(a: number, b: boolean): string; extra: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{(a: number, b: boolean): string; extra: string}>())},
  'OBJECT.interface_all_optional': {build: () => createValidate<{a?: string; b?: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{a?: string; b?: number}>())},
  'OBJECT.class_simple': (() => {
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
    return {build: () => createValidate<MySerializableClass>(), buildErrors: () => noErrs(createGetValidationErrors<MySerializableClass>())};
  })(),
  'OBJECT.rpc_error_class': (() => {
    // Mirrors @mionjs/core's RpcError public shape:
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
    return {build: () => createValidate<RpcError<'test-error'>>(), buildErrors: () => noErrs(createGetValidationErrors<RpcError<'test-error'>>())};
  })(),
  'OBJECT.call_signature_params': (() => {
    type CallSig = (a: number, b: boolean) => string;
    return {build: () => createValidate<Parameters<CallSig>>(), buildErrors: () => noErrs(createGetValidationErrors<Parameters<CallSig>>())};
  })(),
  'OBJECT.call_signature_params_with_optional': (() => {
    type CallSig = (a: number, b: boolean, c?: string) => Date;
    return {build: () => createValidate<Parameters<CallSig>>(), buildErrors: () => noErrs(createGetValidationErrors<Parameters<CallSig>>())};
  })(),
  'OBJECT.call_signature_params_with_rest': (() => {
    type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
    return {build: () => createValidate<Parameters<CallSig>>(), buildErrors: () => noErrs(createGetValidationErrors<Parameters<CallSig>>())};
  })(),
  'OBJECT.record_union_keys': {build: () => createValidate<Record<'a' | 'b', number>>(), buildErrors: () => noErrs(createGetValidationErrors<Record<'a' | 'b', number>>())},
  'OBJECT.union_value_index': {build: () => createValidate<{[key: string]: string | number}>(), buildErrors: () => noErrs(createGetValidationErrors<{[key: string]: string | number}>())},
  'OBJECT.object_with_union_prop': {build: () => createValidate<{kind: 'a' | 'b'; n: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{kind: 'a' | 'b'; n: number}>())},
  'OBJECT.interface_inheritance': (() => {
    interface Base {
      a: string;
    }
    interface Child extends Base {
      b: number;
    }
    return {build: () => createValidate<Child>(), buildErrors: () => noErrs(createGetValidationErrors<Child>())};
  })(),
  'OBJECT.class_inheritance': (() => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    return {build: () => createValidate<Sub>(), buildErrors: () => noErrs(createGetValidationErrors<Sub>())};
  })(),
  'OBJECT.index_signature_number_key': {build: () => createValidate<{[k: number]: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{[k: number]: string}>())},

  // ── TUPLE ──
  'TUPLE.string_number_pair': {build: () => createValidate<[string, number]>(), buildErrors: () => noErrs(createGetValidationErrors<[string, number]>())},
  'TUPLE.full_mion_tuple': {build: () => createValidate<[Date, number, string, null, string[], bigint]>(), buildErrors: () => noErrs(createGetValidationErrors<[Date, number, string, null, string[], bigint]>())},
  'TUPLE.tuple_with_optional': {build: () => createValidate<[number, bigint?, boolean?, number?]>(), buildErrors: () => noErrs(createGetValidationErrors<[number, bigint?, boolean?, number?]>())},
  'TUPLE.nested_tuple_in_array': {build: () => createValidate<[string, number][]>(), buildErrors: () => noErrs(createGetValidationErrors<[string, number][]>())},
  'TUPLE.tuple_rest': {build: () => createValidate<[number, ...string[]]>(), buildErrors: () => noErrs(createGetValidationErrors<[number, ...string[]]>())},
  'TUPLE.tuple_circular': (() => {
    type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
    return {build: () => createValidate<TupleCircular>(), buildErrors: () => noErrs(createGetValidationErrors<TupleCircular>())};
  })(),
  'TUPLE.tuple_multiple_trailing_optionals': {build: () => createValidate<[number, bigint?, boolean?, number?]>(), buildErrors: () => noErrs(createGetValidationErrors<[number, bigint?, boolean?, number?]>())},
  'TUPLE.tuple_named_labels': {build: () => createValidate<[name: string, age: number]>(), buildErrors: () => noErrs(createGetValidationErrors<[name: string, age: number]>())},
  'TUPLE.tuple_with_non_serializable': {build: () => createValidate<[number, () => any]>(), buildErrors: () => noErrs(createGetValidationErrors<[number, () => any]>())},
  'TUPLE.empty_tuple': {build: () => createValidate<[]>(), buildErrors: () => noErrs(createGetValidationErrors<[]>())},
  'TUPLE.single_element_tuple': {build: () => createValidate<[string]>(), buildErrors: () => noErrs(createGetValidationErrors<[string]>())},
  'TUPLE.readonly_tuple': {build: () => createValidate<readonly [string, number]>(), buildErrors: () => noErrs(createGetValidationErrors<readonly [string, number]>())},

  // ── UNION ──
  'UNION.atomic_union': {build: () => createValidate<Date | number | string | null | bigint>(), buildErrors: () => noErrs(createGetValidationErrors<Date | number | string | null | bigint>())},
  'UNION.string_literal_union': {build: () => createValidate<'UNO' | 'DOS' | 'TRES'>(), buildErrors: () => noErrs(createGetValidationErrors<'UNO' | 'DOS' | 'TRES'>())},
  'UNION.large_union_eight_arms': {build: () => createValidate<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(), buildErrors: () => noErrs(createGetValidationErrors<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>())},
  'UNION.string_or_number': {build: () => createValidate<string | number>(), buildErrors: () => noErrs(createGetValidationErrors<string | number>())},
  'UNION.union_of_array_types': {build: () => createValidate<string[] | number[] | boolean[]>(), buildErrors: () => noErrs(createGetValidationErrors<string[] | number[] | boolean[]>())},
  'UNION.array_of_union': {build: () => createValidate<(string | bigint | boolean | Date)[]>(), buildErrors: () => noErrs(createGetValidationErrors<(string | bigint | boolean | Date)[]>())},
  'UNION.union_of_object_shapes': {build: () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>())},
  'UNION.discriminated_union': {build: () => createValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>())},
  'UNION.circular_union': (() => {
    type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
    return {build: () => createValidate<UnionC>(), buildErrors: () => noErrs(createGetValidationErrors<UnionC>())};
  })(),
  'UNION.union_with_methods': {build: () => createValidate<{name: string; getName(): string} | {age: number; getAge(): number}>(), buildErrors: () => noErrs(createGetValidationErrors<{name: string; getName(): string} | {age: number; getAge(): number}>())},
  'UNION.intersection_to_object': {build: () => createValidate<{a: string} & {b: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string} & {b: number}>())},
  'UNION.union_with_index_arm': {build: () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>())},
  'UNION.union_same_prop_different_types': {build: () => createValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>())},
  'UNION.union_mixed_arrays_and_objects': {
    build: () => createValidate<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    buildErrors: () => noErrs(createGetValidationErrors<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>()),
  },
  'UNION.union_merged_property': {build: () => createValidate<{a: boolean} | {a: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{a: boolean} | {a: number}>())},
  'UNION.union_mixed_with_index': {
    build: () =>
      createValidate<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    buildErrors: () =>
      noErrs(createGetValidationErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >()),
  },
  'UNION.union_with_any_fallback': {build: () => createValidate<string | any>(), buildErrors: () => noErrs(createGetValidationErrors<string | any>())},
  'UNION.union_with_unknown_fallback': {build: () => createValidate<string | unknown>(), buildErrors: () => noErrs(createGetValidationErrors<string | unknown>())},
  'UNION.union_subset_small_first': (() => {
    interface SmallObj {
      a: string;
    }
    interface LargeObj {
      a: string;
      b: number;
    }
    return {build: () => createValidate<SmallObj | LargeObj>(), buildErrors: () => noErrs(createGetValidationErrors<SmallObj | LargeObj>())};
  })(),
  'UNION.union_subset_nested_levels': (() => {
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
    return {build: () => createValidate<Tiny | Medium | Large>(), buildErrors: () => noErrs(createGetValidationErrors<Tiny | Medium | Large>())};
  })(),
  'UNION.union_subset_mixed_related_unrelated': (() => {
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
    return {build: () => createValidate<Base | Extended | Unrelated>(), buildErrors: () => noErrs(createGetValidationErrors<Base | Extended | Unrelated>())};
  })(),

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {build: () => createValidate<`api/user/${number}`>(), buildErrors: () => noErrs(createGetValidationErrors<`api/user/${number}`>())},
  'TEMPLATE_LITERAL.multi_segment_url': {build: () => createValidate<`/api/v${number}/user/${string}/posts/${number}`>(), buildErrors: () => noErrs(createGetValidationErrors<`/api/v${number}/user/${string}/posts/${number}`>())},
  'TEMPLATE_LITERAL.leading_string_placeholder': {build: () => createValidate<`${string}/${number}`>(), buildErrors: () => noErrs(createGetValidationErrors<`${string}/${number}`>())},
  'TEMPLATE_LITERAL.regex_special_chars': {build: () => createValidate<`(${number})`>(), buildErrors: () => noErrs(createGetValidationErrors<`(${number})`>())},
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {build: () => createValidate<{url: `api/user/${number}`; method: string}>(), buildErrors: () => noErrs(createGetValidationErrors<{url: `api/user/${number}`; method: string}>())},
  'TEMPLATE_LITERAL.template_literal_index_key': {build: () => createValidate<{[key: `api/${string}`]: number}>(), buildErrors: () => noErrs(createGetValidationErrors<{[key: `api/${string}`]: number}>())},
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {build: () => createValidate<`${'a' | 'b'}-${number}`>(), buildErrors: () => noErrs(createGetValidationErrors<`${'a' | 'b'}-${number}`>())},

  // ── NATIVE ──
  'NATIVE.map_string_number': {build: () => createValidate<Map<string, number>>(), buildErrors: () => noErrs(createGetValidationErrors<Map<string, number>>())},
  'NATIVE.set_string': {build: () => createValidate<Set<string>>(), buildErrors: () => noErrs(createGetValidationErrors<Set<string>>())},
  'NATIVE.promise_string': {build: () => createValidate<Promise<string>>(), buildErrors: () => noErrs(createGetValidationErrors<Promise<string>>())},
  'NATIVE.awaited_promise': {build: () => createValidate<Awaited<Promise<string>>>(), buildErrors: () => noErrs(createGetValidationErrors<Awaited<Promise<string>>>())},

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': (() => {
    interface Circular {
      n: number;
      s: string;
      c?: Circular;
      d?: Date;
    }
    return {build: () => createValidate<Circular>(), buildErrors: () => noErrs(createGetValidationErrors<Circular>())};
  })(),
  'CIRCULAR.array_of_union_with_self_ref': (() => {
    type CuArray = (CuArray | Date | number | string)[];
    return {build: () => createValidate<CuArray>(), buildErrors: () => noErrs(createGetValidationErrors<CuArray>())};
  })(),
  'CIRCULAR.object_with_tuple_prop': (() => {
    interface CircularTuple {
      tuple: [bigint, CircularTuple?];
    }
    return {build: () => createValidate<CircularTuple>(), buildErrors: () => noErrs(createGetValidationErrors<CircularTuple>())};
  })(),
  'CIRCULAR.object_with_index_prop': (() => {
    interface CircularIndex {
      index: {[key: string]: CircularIndex};
    }
    return {build: () => createValidate<CircularIndex>(), buildErrors: () => noErrs(createGetValidationErrors<CircularIndex>())};
  })(),
  'CIRCULAR.object_deeply_nested': (() => {
    interface CircularDeep {
      deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
    }
    return {build: () => createValidate<CircularDeep>(), buildErrors: () => noErrs(createGetValidationErrors<CircularDeep>())};
  })(),
  'CIRCULAR.circular_child_under_literal_root': (() => {
    interface ICircularDeep {
      name: string;
      big: bigint;
      embedded: {hello: string; child?: ICircularDeep};
    }
    interface RootNotCircular {
      isRoot: true;
      ciChild: ICircularDeep;
    }
    return {build: () => createValidate<RootNotCircular>(), buildErrors: () => noErrs(createGetValidationErrors<RootNotCircular>())};
  })(),
  'CIRCULAR.multiple_circular_types_cross_referenced': (() => {
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
    return {build: () => createValidate<RootCircular>(), buildErrors: () => noErrs(createGetValidationErrors<RootCircular>())};
  })(),

  // ── UTILITY ──
  'UTILITY.partial': (() => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return {build: () => createValidate<Partial<Person>>(), buildErrors: () => noErrs(createGetValidationErrors<Partial<Person>>())};
  })(),
  'UTILITY.required': (() => {
    interface MaybePerson {
      name?: string;
      age?: number;
      createdAt?: Date;
    }
    return {build: () => createValidate<Required<MaybePerson>>(), buildErrors: () => noErrs(createGetValidationErrors<Required<MaybePerson>>())};
  })(),
  'UTILITY.pick': (() => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return {build: () => createValidate<Pick<Person, 'name' | 'createdAt'>>(), buildErrors: () => noErrs(createGetValidationErrors<Pick<Person, 'name' | 'createdAt'>>())};
  })(),
  'UTILITY.omit': (() => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return {build: () => createValidate<Omit<Person, 'age'>>(), buildErrors: () => noErrs(createGetValidationErrors<Omit<Person, 'age'>>())};
  })(),
  'UTILITY.exclude_atomic': {build: () => createValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>(), buildErrors: () => noErrs(createGetValidationErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>())},
  'UTILITY.extract_atomic': {build: () => createValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(), buildErrors: () => noErrs(createGetValidationErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>())},
  'UTILITY.exclude_from_object_union': (() => {
    type Shape =
      | {kind: 'circle'; radius: number}
      | {kind: 'square'; x: number}
      | {kind: 'triangle'; base: number; height: number};
    return {build: () => createValidate<Exclude<Shape, {kind: 'circle'}>>(), buildErrors: () => noErrs(createGetValidationErrors<Exclude<Shape, {kind: 'circle'}>>())};
  })(),
  'UTILITY.non_nullable': {build: () => createValidate<NonNullable<string | number | null | undefined>>(), buildErrors: () => noErrs(createGetValidationErrors<NonNullable<string | number | null | undefined>>())},
  'UTILITY.return_type': (() => {
    type Fn = (a: number, b: boolean) => Date;
    return {build: () => createValidate<ReturnType<Fn>>(), buildErrors: () => noErrs(createGetValidationErrors<ReturnType<Fn>>())};
  })(),
  'UTILITY.readonly': (() => {
    interface Person {
      name: string;
      age: number;
    }
    return {build: () => createValidate<Readonly<Person>>(), buildErrors: () => noErrs(createGetValidationErrors<Readonly<Person>>())};
  })(),
  'UTILITY.intersection_with_required_override': (() => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return {build: () => createValidate<Partial<Person> & Required<Pick<Person, 'name'>>>(), buildErrors: () => noErrs(createGetValidationErrors<Partial<Person> & Required<Pick<Person, 'name'>>>())};
  })(),
  'UTILITY.omit_keeping_optional': {build: () => createValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>(), buildErrors: () => noErrs(createGetValidationErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>())},
  'UTILITY.keyof_to_literal_union': (() => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return {build: () => createValidate<keyof Person>(), buildErrors: () => noErrs(createGetValidationErrors<keyof Person>())};
  })(),
  'UTILITY.typeof_variable_query': (() => {
    const config = {url: 'http://example.com', port: 8080};
    return {build: () => createValidate<typeof config>(), buildErrors: () => noErrs(createGetValidationErrors<typeof config>())};
  })(),
  'UTILITY.indexed_access_type': (() => {
    interface Person {
      name: string;
      age: number;
    }
    return {build: () => createValidate<Person['name']>(), buildErrors: () => noErrs(createGetValidationErrors<Person['name']>())};
  })(),
  'UTILITY.conditional_type_resolved': (() => {
    type IsString<T> = T extends string ? boolean : number;
    return {build: () => createValidate<IsString<'hello'>>(), buildErrors: () => noErrs(createGetValidationErrors<IsString<'hello'>>())};
  })(),
  'UTILITY.mapped_type_custom': (() => {
    interface Source {
      a: string;
      b: number;
    }
    type Nullable<T> = {[K in keyof T]: T[K] | null};
    return {build: () => createValidate<Nullable<Source>>(), buildErrors: () => noErrs(createGetValidationErrors<Nullable<Source>>())};
  })(),
  'UTILITY.mapped_type_with_conditional_value': (() => {
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
    return {build: () => createValidate<UserForm>(), buildErrors: () => noErrs(createGetValidationErrors<UserForm>())};
  })(),
  'UTILITY.distributive_conditional_over_union': (() => {
    type Wrap<T> = T extends any ? {w: T} : never;
    return {build: () => createValidate<Wrap<string | number>>(), buildErrors: () => noErrs(createGetValidationErrors<Wrap<string | number>>())};
  })(),
  'UTILITY.deep_partial_recursive_mapped': (() => {
    interface Settings {
      display: {theme: 'light' | 'dark'; brightness: number};
      audio: {volume: number; muted: boolean};
    }
    type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
    return {build: () => createValidate<DeepPartial<Settings>>(), buildErrors: () => noErrs(createGetValidationErrors<DeepPartial<Settings>>())};
  })(),

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': (() => {
    interface Source {
      id: number;
      name: string;
    }
    type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
    return {build: () => createValidate<Prefixed<Source>>(), buildErrors: () => noErrs(createGetValidationErrors<Prefixed<Source>>())};
  })(),
  'TYPE_MAPPINGS.key_conditional_rename': (() => {
    interface Source {
      id: number;
      name: string;
      createdAt: Date;
    }
    type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
    return {build: () => createValidate<MongoForm<Source>>(), buildErrors: () => noErrs(createGetValidationErrors<MongoForm<Source>>())};
  })(),
  'TYPE_MAPPINGS.key_filter_via_never': (() => {
    interface Source {
      id: number;
      name: string;
      secret: string;
    }
    type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
    return {build: () => createValidate<Public<Source>>(), buildErrors: () => noErrs(createGetValidationErrors<Public<Source>>())};
  })(),

  // ── DATETIME ──
  'DATETIME.date': {build: () => createValidate<Date>(), buildErrors: () => noErrs(createGetValidationErrors<Date>())},
  'DATETIME.instant': {build: () => createValidate<Temporal.Instant>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.Instant>())},
  'DATETIME.zonedDateTime': {build: () => createValidate<Temporal.ZonedDateTime>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.ZonedDateTime>())},
  'DATETIME.plainDate': {build: () => createValidate<Temporal.PlainDate>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.PlainDate>())},
  'DATETIME.plainTime': {build: () => createValidate<Temporal.PlainTime>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.PlainTime>())},
  'DATETIME.plainDateTime': {build: () => createValidate<Temporal.PlainDateTime>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.PlainDateTime>())},
  'DATETIME.plainYearMonth': {build: () => createValidate<Temporal.PlainYearMonth>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.PlainYearMonth>())},
  'DATETIME.plainMonthDay': {build: () => createValidate<Temporal.PlainMonthDay>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.PlainMonthDay>())},
  'DATETIME.duration': {build: () => createValidate<Temporal.Duration>(), buildErrors: () => noErrs(createGetValidationErrors<Temporal.Duration>())},

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {build: () => createValidate<FormatString<{maxLength: 5}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{maxLength: 5}>>())},
  'STRING_FORMAT.string_minLength': {build: () => createValidate<FormatString<{minLength: 3}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{minLength: 3}>>())},
  'STRING_FORMAT.string_length': {build: () => createValidate<FormatString<{length: 4}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{length: 4}>>())},
  'STRING_FORMAT.string_range': {build: () => createValidate<FormatString<{minLength: 2; maxLength: 4}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{minLength: 2; maxLength: 4}>>())},
  'STRING_FORMAT.string_allowedChars': {build: () => createValidate<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>())},
  'STRING_FORMAT.string_allowedChars_ignoreCase': {build: () => createValidate<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>())},
  'STRING_FORMAT.string_allowedChars_literal': {build: () => createValidate<FormatString<{allowedChars: {val: '.-'}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedChars: {val: '.-'}}>>())},
  'STRING_FORMAT.string_disallowedChars': {build: () => createValidate<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>())},
  'STRING_FORMAT.string_allowedValues': {build: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>())},
  'STRING_FORMAT.string_allowedValues_ignoreCase': {build: () => createValidate<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>())},
  'STRING_FORMAT.string_allowedValues_escaped': {build: () => createValidate<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>())},
  'STRING_FORMAT.string_disallowedValues': {build: () => createValidate<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>())},
  'STRING_FORMAT.string_customErrorMessage': {build: () => createValidate<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>())},
  'STRING_FORMAT.alpha': {build: () => createValidate<FormatAlpha>(), buildErrors: () => noErrs(createGetValidationErrors<FormatAlpha>())},
  'STRING_FORMAT.alphaNumeric': {build: () => createValidate<FormatAlphaNumeric>(), buildErrors: () => noErrs(createGetValidationErrors<FormatAlphaNumeric>())},
  'STRING_FORMAT.numeric': {build: () => createValidate<FormatNumeric>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumeric>())},
  'STRING_FORMAT.alpha_withLength': {build: () => createValidate<FormatAlpha<{maxLength: 3}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatAlpha<{maxLength: 3}>>())},
  'STRING_FORMAT.lowercase_validate': {build: () => createValidate<FormatLowercase>(), buildErrors: () => noErrs(createGetValidationErrors<FormatLowercase>())},
  'STRING_FORMAT.uuidv4': {build: () => createValidate<FormatUUIDv4>(), buildErrors: () => noErrs(createGetValidationErrors<FormatUUIDv4>())},
  'STRING_FORMAT.uuidv7': {build: () => createValidate<FormatUUIDv7>(), buildErrors: () => noErrs(createGetValidationErrors<FormatUUIDv7>())},
  'STRING_FORMAT.date_iso': {build: () => createValidate<FormatStringDate>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringDate>())},
  'STRING_FORMAT.date_DMY': {build: () => createValidate<FormatStringDate<{format: 'DD-MM-YYYY'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringDate<{format: 'DD-MM-YYYY'}>>())},
  'STRING_FORMAT.date_YM': {build: () => createValidate<FormatStringDate<{format: 'YYYY-MM'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM'}>>())},
  'STRING_FORMAT.date_MD': {build: () => createValidate<FormatStringDate<{format: 'MM-DD'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringDate<{format: 'MM-DD'}>>())},
  'STRING_FORMAT.date_minMax_absolute': {build: () => createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>())},
  'STRING_FORMAT.time_iso': {build: () => createValidate<FormatStringTime>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringTime>())},
  'STRING_FORMAT.time_HHmmss': {build: () => createValidate<FormatStringTime<{format: 'HH:mm:ss'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss'}>>())},
  'STRING_FORMAT.time_HHmmss_ms': {build: () => createValidate<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>())},
  'STRING_FORMAT.time_minMax_absolute': {build: () => createValidate<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>())},
  'STRING_FORMAT.dateTime_default': {build: () => createValidate<FormatStringDateTime>(), buildErrors: () => noErrs(createGetValidationErrors<FormatStringDateTime>())},
  'STRING_FORMAT.dateTime_custom': {
    build: () => createValidate<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    buildErrors: () => noErrs(createGetValidationErrors<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>()),
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
    buildErrors: () =>
      noErrs(createGetValidationErrors<
        FormatStringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >()),
  },
  'STRING_FORMAT.ipv4': {build: () => createValidate<FormatIPv4>(), buildErrors: () => noErrs(createGetValidationErrors<FormatIPv4>())},
  'STRING_FORMAT.ipv6': {build: () => createValidate<FormatIPv6>(), buildErrors: () => noErrs(createGetValidationErrors<FormatIPv6>())},
  'STRING_FORMAT.ip_any': {build: () => createValidate<FormatIP>(), buildErrors: () => noErrs(createGetValidationErrors<FormatIP>())},
  'STRING_FORMAT.ipv4_port': {build: () => createValidate<FormatIPv4WithPort>(), buildErrors: () => noErrs(createGetValidationErrors<FormatIPv4WithPort>())},
  'STRING_FORMAT.ipv6_port': {build: () => createValidate<FormatIPv6WithPort>(), buildErrors: () => noErrs(createGetValidationErrors<FormatIPv6WithPort>())},
  'STRING_FORMAT.domain': {build: () => createValidate<FormatDomain>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDomain>())},
  'STRING_FORMAT.domainStrict': {build: () => createValidate<FormatDomainStrict>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDomainStrict>())},
  'STRING_FORMAT.email': {build: () => createValidate<FormatEmail>(), buildErrors: () => noErrs(createGetValidationErrors<FormatEmail>())},
  'STRING_FORMAT.emailPunycode': {build: () => createValidate<FormatEmailPunycode>(), buildErrors: () => noErrs(createGetValidationErrors<FormatEmailPunycode>())},
  'STRING_FORMAT.emailStrict': {build: () => createValidate<FormatEmailStrict>(), buildErrors: () => noErrs(createGetValidationErrors<FormatEmailStrict>())},
  'STRING_FORMAT.url': {build: () => createValidate<FormatUrl>(), buildErrors: () => noErrs(createGetValidationErrors<FormatUrl>())},
  'STRING_FORMAT.urlHttp': {build: () => createValidate<FormatUrlHttp>(), buildErrors: () => noErrs(createGetValidationErrors<FormatUrlHttp>())},
  'STRING_FORMAT.urlFile': {build: () => createValidate<FormatUrlFile>(), buildErrors: () => noErrs(createGetValidationErrors<FormatUrlFile>())},
  'STRING_FORMAT.pattern_slug': {build: () => createValidate<Slug>(), buildErrors: () => noErrs(createGetValidationErrors<Slug>())},
  'STRING_FORMAT.pattern_hex': {build: () => createValidate<Hex>(), buildErrors: () => noErrs(createGetValidationErrors<Hex>())},

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {build: () => createValidate<FormatNumber<{max: 100}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumber<{max: 100}>>())},
  'NUMBER_FORMAT.number_min': {build: () => createValidate<FormatNumber<{min: 0}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumber<{min: 0}>>())},
  'NUMBER_FORMAT.number_lt': {build: () => createValidate<FormatNumber<{lt: 10}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumber<{lt: 10}>>())},
  'NUMBER_FORMAT.number_gt': {build: () => createValidate<FormatNumber<{gt: 0}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumber<{gt: 0}>>())},
  'NUMBER_FORMAT.number_integer': {build: () => createValidate<FormatInteger>(), buildErrors: () => noErrs(createGetValidationErrors<FormatInteger>())},
  'NUMBER_FORMAT.number_float': {build: () => createValidate<FormatFloat>(), buildErrors: () => noErrs(createGetValidationErrors<FormatFloat>())},
  'NUMBER_FORMAT.number_multipleOf': {build: () => createValidate<FormatNumber<{multipleOf: 5}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumber<{multipleOf: 5}>>())},
  'NUMBER_FORMAT.number_combined': {build: () => createValidate<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>())},
  'NUMBER_FORMAT.number_int8': {build: () => createValidate<FormatInt8>(), buildErrors: () => noErrs(createGetValidationErrors<FormatInt8>())},
  'NUMBER_FORMAT.number_uint8': {build: () => createValidate<FormatUInt8>(), buildErrors: () => noErrs(createGetValidationErrors<FormatUInt8>())},

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {build: () => createValidate<FormatBigInt<{max: 100n}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt<{max: 100n}>>())},
  'BIGINT_FORMAT.bigint_min': {build: () => createValidate<FormatBigInt<{min: 0n}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt<{min: 0n}>>())},
  'BIGINT_FORMAT.bigint_lt': {build: () => createValidate<FormatBigInt<{lt: 10n}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt<{lt: 10n}>>())},
  'BIGINT_FORMAT.bigint_gt': {build: () => createValidate<FormatBigInt<{gt: 0n}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt<{gt: 0n}>>())},
  'BIGINT_FORMAT.bigint_multipleOf': {build: () => createValidate<FormatBigInt<{multipleOf: 5n}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt<{multipleOf: 5n}>>())},
  'BIGINT_FORMAT.bigint_combined': {build: () => createValidate<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>())},
  'BIGINT_FORMAT.bigint_int64': {build: () => createValidate<FormatBigInt64>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigInt64>())},
  'BIGINT_FORMAT.bigint_uint64': {build: () => createValidate<FormatBigUInt64>(), buildErrors: () => noErrs(createGetValidationErrors<FormatBigUInt64>())},

  // ── DATETIME ──
  'DATETIME.date_minmax': {build: () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>())},
  'DATETIME.date_gtlt': {build: () => createValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>())},
  'DATETIME.date_min_lt': {build: () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>())},
  'DATETIME.date_max_now': {build: () => createValidate<FormatDate<{max: 'now'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDate<{max: 'now'}>>())},
  'DATETIME.date_rel_window': {build: () => createValidate<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>())},
  'DATETIME.date_rel_datetime_components': {build: () => createValidate<FormatDate<{min: 'now-P1000YT12H'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatDate<{min: 'now-P1000YT12H'}>>())},
  'DATETIME.instant_minmax': {build: () => createValidate<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>())},
  'DATETIME.instant_gtlt': {build: () => createValidate<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>())},
  'DATETIME.instant_rel': {build: () => createValidate<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>())},
  'DATETIME.plainDate_minmax': {build: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>())},
  'DATETIME.plainDate_gtlt': {build: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>())},
  'DATETIME.plainDate_min_lt': {build: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>())},
  'DATETIME.plainDate_gt_max': {build: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>())},
  'DATETIME.plainDate_min_only': {build: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'}>>())},
  'DATETIME.plainDate_max_only': {build: () => createValidate<FormatTemporalPlainDate<{max: '2020-12-31'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{max: '2020-12-31'}>>())},
  'DATETIME.plainDate_gt_only': {build: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'}>>())},
  'DATETIME.plainDate_lt_only': {build: () => createValidate<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{lt: '2020-12-31'}>>())},
  'DATETIME.plainDate_rel_window': {build: () => createValidate<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>())},
  'DATETIME.plainDate_rel_ymd': {build: () => createValidate<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>())},
  'DATETIME.plainDate_rel_weeks': {build: () => createValidate<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P52200W'}>>())},
  'DATETIME.plainTime_minmax': {build: () => createValidate<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>())},
  'DATETIME.plainTime_gtlt': {build: () => createValidate<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>())},
  'DATETIME.plainDateTime_minmax': {build: () => createValidate<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>())},
  'DATETIME.plainDateTime_gtlt': {build: () => createValidate<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>())},
  'DATETIME.plainDateTime_rel': {build: () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>())},
  'DATETIME.plainDateTime_rel_combo': {build: () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>())},
  'DATETIME.plainYearMonth_minmax': {build: () => createValidate<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>())},
  'DATETIME.plainYearMonth_gtlt': {build: () => createValidate<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>())},
  'DATETIME.plainYearMonth_rel': {build: () => createValidate<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>())},
  'DATETIME.zonedDateTime_minmax': {
    build: () => createValidate<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>()),
  },
  'DATETIME.zonedDateTime_gtlt': {
    build: () => createValidate<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>()),
  },
  'DATETIME.zonedDateTime_rel': {build: () => createValidate<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(), buildErrors: () => noErrs(createGetValidationErrors<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>())},

  // ── REALWORLD ──
  'REALWORLD.user': {build: () => createValidate<User>(), buildErrors: () => noErrs(createGetValidationErrors<User>())},
  'REALWORLD.order': {build: () => createValidate<Order>(), buildErrors: () => noErrs(createGetValidationErrors<Order>())},
  'REALWORLD.blogPost': {build: () => createValidate<BlogPost>(), buildErrors: () => noErrs(createGetValidationErrors<BlogPost>())},
  'REALWORLD.product': {build: () => createValidate<Product>(), buildErrors: () => noErrs(createGetValidationErrors<Product>())},
  'REALWORLD.productPage': {build: () => createValidate<ProductPage>(), buildErrors: () => noErrs(createGetValidationErrors<ProductPage>())},
  'REALWORLD.registrationForm': {build: () => createValidate<RegistrationForm>(), buildErrors: () => noErrs(createGetValidationErrors<RegistrationForm>())},
};
