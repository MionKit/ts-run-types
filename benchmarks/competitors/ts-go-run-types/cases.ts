// ts-go-run-types validators keyed by suite case key ("GROUP.case"), TYPE form.
// Each entry is the case's own `validate` thunk copied VERBATIM from the shared
// suites (benchmarks/src/suites/**) — a `() => createValidate<T>()` arrow whose
// literal type argument the vite-plugin-runtypes rewrites at build time. Local
// enum / interface / type / function declarations inside a thunk are kept exactly
// as written so the plugin resolves `T` where it is authored. Cases the Go
// pipeline renders as an alwaysThrow factory (`factoryThrows`: symbol at a root or
// propagating position) opt out with NOT_SUPPORTED. This map also drives the
// runtime ts-go column and typecost's ts-go-type column. TOTAL over every key.

import {createValidate, registerFormatPattern, type DataOnly} from '@mionjs/ts-go-run-types';
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
import type {User, Order, BlogPost, Product, ProductPage, RegistrationForm} from '../../src/suites/realworld/index.ts';

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
  'ATOMIC.any': () => createValidate<any>(),
  'ATOMIC.bigint': () => createValidate<bigint>(),
  'ATOMIC.boolean': () => createValidate<boolean>(),
  'ATOMIC.date': () => createValidate<Date>(),
  'ATOMIC.enum_mixed': () => {
    enum Color {
      Red,
      Green = 'green',
      Blue = 2,
    }
    return createValidate<Color>();
  },
  'ATOMIC.literal_2': () => createValidate<2>(),
  'ATOMIC.literal_a': () => createValidate<'a'>(),
  'ATOMIC.literal_true': () => createValidate<true>(),
  'ATOMIC.literal_1n': () => createValidate<1n>(),
  'ATOMIC.literal_symbol': () => {
    const sym = Symbol('hello');
    return createValidate<typeof sym>();
  },
  'ATOMIC.never': () => createValidate<never>(),
  'ATOMIC.null': () => createValidate<null>(),
  'ATOMIC.number': () => createValidate<number>(),
  'ATOMIC.object': () => createValidate<object>(),
  'ATOMIC.regexp': () => createValidate<RegExp>(),
  'ATOMIC.string': () => createValidate<string>(),
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.undefined': () => createValidate<undefined>(),
  'ATOMIC.void': () => createValidate<void>(),
  'ATOMIC.literal_2_noLiterals': () => createValidate<2>(undefined, {noLiterals: true}),
  'ATOMIC.literal_a_noLiterals': () => createValidate<'a'>(undefined, {noLiterals: true}),
  'ATOMIC.literal_regexp_noLiterals': () => {
    const reg = /abc/i;
    return createValidate<typeof reg>(undefined, {noLiterals: true});
  },
  'ATOMIC.literal_true_noLiterals': () => createValidate<true>(undefined, {noLiterals: true}),
  'ATOMIC.literal_1n_noLiterals': () => createValidate<1n>(undefined, {noLiterals: true}),
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.unknown': () => createValidate<unknown>(),

  // ── ARRAY ──
  'ARRAY.string_array': () => createValidate<string[]>(),
  'ARRAY.number_array': () => createValidate<number[]>(),
  'ARRAY.boolean_array': () => createValidate<boolean[]>(),
  'ARRAY.bigint_array': () => createValidate<bigint[]>(),
  'ARRAY.date_array': () => createValidate<Date[]>(),
  'ARRAY.regexp_array': () => createValidate<RegExp[]>(),
  'ARRAY.undefined_array': () => createValidate<undefined[]>(),
  'ARRAY.null_array': () => createValidate<null[]>(),
  'ARRAY.array_generic': () => createValidate<Array<string>>(),
  'ARRAY.string_array_2d': () => createValidate<string[][]>(),
  'ARRAY.string_array_3d': () => createValidate<string[][][]>(),
  'ARRAY.string_array_noIsArrayCheck': () => createValidate<string[]>(undefined, {noIsArrayCheck: true}),
  'ARRAY.object_array': () => createValidate<{a: string}[]>(),
  'ARRAY.union_array': () => createValidate<(string | number)[]>(),
  'ARRAY.tuple_array': () => createValidate<[string, number][]>(),
  'ARRAY.circular_array': () => {
    type CircularArray = CircularArray[];
    return createValidate<CircularArray>();
  },
  'ARRAY.circular_object_with_array': () => {
    type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
    return createValidate<ObjectType>();
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': () => createValidate<ReadonlyArray<string>>(),

  // ── OBJECT ──
  'OBJECT.simple_interface': () => createValidate<{a: string; b: number}>(),
  'OBJECT.object_as_const_literals': () => createValidate<{readonly name: 'john'; readonly age: 30}>(),
  'OBJECT.object_via_return_type_utility': () => {
    function makeUser(): {id: number; name: string} {
      return {id: 1, name: 'john'};
    }
    return createValidate<ReturnType<typeof makeUser>>();
  },
  'OBJECT.object_via_property_access': () => createValidate<{id: number; name: string}>(),
  'OBJECT.object_via_array_access': () => createValidate<{id: number; name: string}>(),
  'OBJECT.interface_with_optional': () => createValidate<{a: string; b?: number}>(),
  'OBJECT.interface_with_date': () => createValidate<{date: Date; name: string}>(),
  'OBJECT.interface_with_method': () => createValidate<{name: string; cb: () => any}>(),
  'OBJECT.nested_object': () => createValidate<{a: string; deep: {b: string; c: number}}>(),
  'OBJECT.interface_string_array_prop': () => createValidate<{tags: string[]}>(),
  'OBJECT.circular_interface': () => {
    type ICircular = {name: string; child?: ICircular};
    return createValidate<ICircular>();
  },
  'OBJECT.circular_interface_on_array': () => {
    type ICircularArray = {name: string; children?: ICircularArray[]};
    return createValidate<ICircularArray>();
  },
  'OBJECT.circular_interface_on_nested_object': () => {
    type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
    return createValidate<ICircularDeep>();
  },
  'OBJECT.index_signature_string': () => createValidate<{[key: string]: string}>(),
  'OBJECT.index_signature_named_props': () => createValidate<{a: string; b: number; [key: string]: string | number}>(),
  'OBJECT.index_signature_nested': () => createValidate<{[key: string]: {[key: string]: number}}>(),
  'OBJECT.index_signature_date_value': () => createValidate<{[key: string]: {[key: string]: Date}}>(),
  'OBJECT.index_signature_non_root': () => {
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
  'OBJECT.function_top_level': () => createValidate<() => void>(),
  'OBJECT.interface_callable': () => createValidate<{(a: number, b: boolean): string; extra: string}>(),
  'OBJECT.interface_all_optional': () => createValidate<{a?: string; b?: number}>(),
  'OBJECT.class_simple': () => {
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
  'OBJECT.rpc_error_class': () => {
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
    return createValidate<RpcError<'test-error'>>();
  },
  'OBJECT.call_signature_params': () => {
    type CallSig = (a: number, b: boolean) => string;
    return createValidate<Parameters<CallSig>>();
  },
  'OBJECT.call_signature_params_with_optional': () => {
    type CallSig = (a: number, b: boolean, c?: string) => Date;
    return createValidate<Parameters<CallSig>>();
  },
  'OBJECT.call_signature_params_with_rest': () => {
    type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
    return createValidate<Parameters<CallSig>>();
  },
  'OBJECT.record_union_keys': () => createValidate<Record<'a' | 'b', number>>(),
  'OBJECT.union_value_index': () => createValidate<{[key: string]: string | number}>(),
  'OBJECT.object_with_union_prop': () => createValidate<{kind: 'a' | 'b'; n: number}>(),
  'OBJECT.interface_inheritance': () => {
    interface Base {
      a: string;
    }
    interface Child extends Base {
      b: number;
    }
    return createValidate<Child>();
  },
  'OBJECT.class_inheritance': () => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    return createValidate<Sub>();
  },
  'OBJECT.index_signature_number_key': () => createValidate<{[k: number]: string}>(),

  // ── TUPLE ──
  'TUPLE.string_number_pair': () => createValidate<[string, number]>(),
  'TUPLE.full_mion_tuple': () => createValidate<[Date, number, string, null, string[], bigint]>(),
  'TUPLE.tuple_with_optional': () => createValidate<[number, bigint?, boolean?, number?]>(),
  'TUPLE.nested_tuple_in_array': () => createValidate<[string, number][]>(),
  'TUPLE.tuple_rest': () => createValidate<[number, ...string[]]>(),
  'TUPLE.tuple_circular': () => {
    type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
    return createValidate<TupleCircular>();
  },
  'TUPLE.tuple_multiple_trailing_optionals': () => createValidate<[number, bigint?, boolean?, number?]>(),
  'TUPLE.tuple_named_labels': () => createValidate<[name: string, age: number]>(),
  'TUPLE.tuple_with_non_serializable': () => createValidate<[number, () => any]>(),
  'TUPLE.empty_tuple': () => createValidate<[]>(),
  'TUPLE.single_element_tuple': () => createValidate<[string]>(),
  'TUPLE.readonly_tuple': () => createValidate<readonly [string, number]>(),

  // ── UNION ──
  'UNION.atomic_union': () => createValidate<Date | number | string | null | bigint>(),
  'UNION.string_literal_union': () => createValidate<'UNO' | 'DOS' | 'TRES'>(),
  'UNION.large_union_eight_arms': () => createValidate<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
  'UNION.string_or_number': () => createValidate<string | number>(),
  'UNION.union_of_array_types': () => createValidate<string[] | number[] | boolean[]>(),
  'UNION.array_of_union': () => createValidate<(string | bigint | boolean | Date)[]>(),
  'UNION.union_of_object_shapes': () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
  'UNION.discriminated_union': () => createValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
  'UNION.circular_union': () => {
    type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
    return createValidate<UnionC>();
  },
  'UNION.union_with_methods': () => createValidate<{name: string; getName(): string} | {age: number; getAge(): number}>(),
  'UNION.intersection_to_object': () => createValidate<{a: string} & {b: number}>(),
  'UNION.union_with_index_arm': () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
  'UNION.union_same_prop_different_types': () => createValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
  'UNION.union_mixed_arrays_and_objects': () =>
    createValidate<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
  'UNION.union_merged_property': () => createValidate<{a: boolean} | {a: number}>(),
  'UNION.union_mixed_with_index': () =>
    createValidate<
      | string[]
      | {a: string; aa: boolean}
      | {b: number}
      | {a: string; [key: string]: string}
      | {[key: string]: bigint; b: bigint}
    >(),
  'UNION.union_with_any_fallback': () => createValidate<string | any>(),
  'UNION.union_with_unknown_fallback': () => createValidate<string | unknown>(),
  'UNION.union_subset_small_first': () => {
    interface SmallObj {
      a: string;
    }
    interface LargeObj {
      a: string;
      b: number;
    }
    return createValidate<SmallObj | LargeObj>();
  },
  'UNION.union_subset_nested_levels': () => {
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
  'UNION.union_subset_mixed_related_unrelated': () => {
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

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': () => createValidate<`api/user/${number}`>(),
  'TEMPLATE_LITERAL.multi_segment_url': () => createValidate<`/api/v${number}/user/${string}/posts/${number}`>(),
  'TEMPLATE_LITERAL.leading_string_placeholder': () => createValidate<`${string}/${number}`>(),
  'TEMPLATE_LITERAL.regex_special_chars': () => createValidate<`(${number})`>(),
  'TEMPLATE_LITERAL.template_literal_nested_in_object': () => createValidate<{url: `api/user/${number}`; method: string}>(),
  'TEMPLATE_LITERAL.template_literal_index_key': () => createValidate<{[key: `api/${string}`]: number}>(),
  'TEMPLATE_LITERAL.template_literal_union_placeholder': () => createValidate<`${'a' | 'b'}-${number}`>(),

  // ── NATIVE ──
  'NATIVE.map_string_number': () => createValidate<Map<string, number>>(),
  'NATIVE.set_string': () => createValidate<Set<string>>(),
  'NATIVE.promise_string': () => createValidate<Promise<string>>(),
  'NATIVE.awaited_promise': () => createValidate<Awaited<Promise<string>>>(),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': () => {
    interface Circular {
      n: number;
      s: string;
      c?: Circular;
      d?: Date;
    }
    return createValidate<Circular>();
  },
  'CIRCULAR.array_of_union_with_self_ref': () => {
    type CuArray = (CuArray | Date | number | string)[];
    return createValidate<CuArray>();
  },
  'CIRCULAR.object_with_tuple_prop': () => {
    interface CircularTuple {
      tuple: [bigint, CircularTuple?];
    }
    return createValidate<CircularTuple>();
  },
  'CIRCULAR.object_with_index_prop': () => {
    interface CircularIndex {
      index: {[key: string]: CircularIndex};
    }
    return createValidate<CircularIndex>();
  },
  'CIRCULAR.object_deeply_nested': () => {
    interface CircularDeep {
      deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
    }
    return createValidate<CircularDeep>();
  },
  'CIRCULAR.circular_child_under_literal_root': () => {
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
  'CIRCULAR.multiple_circular_types_cross_referenced': () => {
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

  // ── UTILITY ──
  'UTILITY.partial': () => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return createValidate<Partial<Person>>();
  },
  'UTILITY.required': () => {
    interface MaybePerson {
      name?: string;
      age?: number;
      createdAt?: Date;
    }
    return createValidate<Required<MaybePerson>>();
  },
  'UTILITY.pick': () => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return createValidate<Pick<Person, 'name' | 'createdAt'>>();
  },
  'UTILITY.omit': () => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return createValidate<Omit<Person, 'age'>>();
  },
  'UTILITY.exclude_atomic': () => createValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
  'UTILITY.extract_atomic': () => createValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
  'UTILITY.exclude_from_object_union': () => {
    type Shape =
      | {kind: 'circle'; radius: number}
      | {kind: 'square'; x: number}
      | {kind: 'triangle'; base: number; height: number};
    return createValidate<Exclude<Shape, {kind: 'circle'}>>();
  },
  'UTILITY.non_nullable': () => createValidate<NonNullable<string | number | null | undefined>>(),
  'UTILITY.return_type': () => {
    type Fn = (a: number, b: boolean) => Date;
    return createValidate<ReturnType<Fn>>();
  },
  'UTILITY.readonly': () => {
    interface Person {
      name: string;
      age: number;
    }
    return createValidate<Readonly<Person>>();
  },
  'UTILITY.intersection_with_required_override': () => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return createValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
  },
  'UTILITY.omit_keeping_optional': () => createValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
  'UTILITY.keyof_to_literal_union': () => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return createValidate<keyof Person>();
  },
  'UTILITY.typeof_variable_query': () => {
    const config = {url: 'http://example.com', port: 8080};
    return createValidate<typeof config>();
  },
  'UTILITY.indexed_access_type': () => {
    interface Person {
      name: string;
      age: number;
    }
    return createValidate<Person['name']>();
  },
  'UTILITY.conditional_type_resolved': () => {
    type IsString<T> = T extends string ? boolean : number;
    return createValidate<IsString<'hello'>>();
  },
  'UTILITY.mapped_type_custom': () => {
    interface Source {
      a: string;
      b: number;
    }
    type Nullable<T> = {[K in keyof T]: T[K] | null};
    return createValidate<Nullable<Source>>();
  },
  'UTILITY.mapped_type_with_conditional_value': () => {
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
  'UTILITY.distributive_conditional_over_union': () => {
    type Wrap<T> = T extends any ? {w: T} : never;
    return createValidate<Wrap<string | number>>();
  },
  'UTILITY.deep_partial_recursive_mapped': () => {
    interface Settings {
      display: {theme: 'light' | 'dark'; brightness: number};
      audio: {volume: number; muted: boolean};
    }
    type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
    return createValidate<DeepPartial<Settings>>();
  },

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': () => {
    interface Source {
      id: number;
      name: string;
    }
    type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
    return createValidate<Prefixed<Source>>();
  },
  'TYPE_MAPPINGS.key_conditional_rename': () => {
    interface Source {
      id: number;
      name: string;
      createdAt: Date;
    }
    type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
    return createValidate<MongoForm<Source>>();
  },
  'TYPE_MAPPINGS.key_filter_via_never': () => {
    interface Source {
      id: number;
      name: string;
      secret: string;
    }
    type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
    return createValidate<Public<Source>>();
  },

  // ── DATETIME ──
  'DATETIME.date': () => createValidate<Date>(),
  'DATETIME.instant': () => createValidate<Temporal.Instant>(),
  'DATETIME.zonedDateTime': () => createValidate<Temporal.ZonedDateTime>(),
  'DATETIME.plainDate': () => createValidate<Temporal.PlainDate>(),
  'DATETIME.plainTime': () => createValidate<Temporal.PlainTime>(),
  'DATETIME.plainDateTime': () => createValidate<Temporal.PlainDateTime>(),
  'DATETIME.plainYearMonth': () => createValidate<Temporal.PlainYearMonth>(),
  'DATETIME.plainMonthDay': () => createValidate<Temporal.PlainMonthDay>(),
  'DATETIME.duration': () => createValidate<Temporal.Duration>(),

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': () => createValidate<FormatString<{maxLength: 5}>>(),
  'STRING_FORMAT.string_minLength': () => createValidate<FormatString<{minLength: 3}>>(),
  'STRING_FORMAT.string_length': () => createValidate<FormatString<{length: 4}>>(),
  'STRING_FORMAT.string_range': () => createValidate<FormatString<{minLength: 2; maxLength: 4}>>(),
  'STRING_FORMAT.string_allowedChars': () => createValidate<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
  'STRING_FORMAT.string_allowedChars_ignoreCase': () => createValidate<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
  'STRING_FORMAT.string_allowedChars_literal': () => createValidate<FormatString<{allowedChars: {val: '.-'}}>>(),
  'STRING_FORMAT.string_disallowedChars': () => createValidate<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
  'STRING_FORMAT.string_allowedValues': () => createValidate<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
  'STRING_FORMAT.string_allowedValues_ignoreCase': () => createValidate<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
  'STRING_FORMAT.string_allowedValues_escaped': () => createValidate<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
  'STRING_FORMAT.string_disallowedValues': () => createValidate<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
  'STRING_FORMAT.string_customErrorMessage': () => createValidate<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
  'STRING_FORMAT.alpha': () => createValidate<FormatAlpha>(),
  'STRING_FORMAT.alphaNumeric': () => createValidate<FormatAlphaNumeric>(),
  'STRING_FORMAT.numeric': () => createValidate<FormatNumeric>(),
  'STRING_FORMAT.alpha_withLength': () => createValidate<FormatAlpha<{maxLength: 3}>>(),
  'STRING_FORMAT.lowercase_validate': () => createValidate<FormatLowercase>(),
  'STRING_FORMAT.uuidv4': () => createValidate<FormatUUIDv4>(),
  'STRING_FORMAT.uuidv7': () => createValidate<FormatUUIDv7>(),
  'STRING_FORMAT.date_iso': () => createValidate<FormatStringDate>(),
  'STRING_FORMAT.date_DMY': () => createValidate<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
  'STRING_FORMAT.date_YM': () => createValidate<FormatStringDate<{format: 'YYYY-MM'}>>(),
  'STRING_FORMAT.date_MD': () => createValidate<FormatStringDate<{format: 'MM-DD'}>>(),
  'STRING_FORMAT.date_minMax_absolute': () => createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
  'STRING_FORMAT.time_iso': () => createValidate<FormatStringTime>(),
  'STRING_FORMAT.time_HHmmss': () => createValidate<FormatStringTime<{format: 'HH:mm:ss'}>>(),
  'STRING_FORMAT.time_HHmmss_ms': () => createValidate<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
  'STRING_FORMAT.time_minMax_absolute': () => createValidate<FormatStringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
  'STRING_FORMAT.dateTime_default': () => createValidate<FormatStringDateTime>(),
  'STRING_FORMAT.dateTime_custom': () =>
    createValidate<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
  'STRING_FORMAT.dateTime_minMax_absolute': () =>
    createValidate<
      FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }>
    >(),
  'STRING_FORMAT.ipv4': () => createValidate<FormatIPv4>(),
  'STRING_FORMAT.ipv6': () => createValidate<FormatIPv6>(),
  'STRING_FORMAT.ip_any': () => createValidate<FormatIP>(),
  'STRING_FORMAT.ipv4_port': () => createValidate<FormatIPv4WithPort>(),
  'STRING_FORMAT.ipv6_port': () => createValidate<FormatIPv6WithPort>(),
  'STRING_FORMAT.domain': () => createValidate<FormatDomain>(),
  'STRING_FORMAT.domainStrict': () => createValidate<FormatDomainStrict>(),
  'STRING_FORMAT.email': () => createValidate<FormatEmail>(),
  'STRING_FORMAT.emailPunycode': () => createValidate<FormatEmailPunycode>(),
  'STRING_FORMAT.emailStrict': () => createValidate<FormatEmailStrict>(),
  'STRING_FORMAT.url': () => createValidate<FormatUrl>(),
  'STRING_FORMAT.urlHttp': () => createValidate<FormatUrlHttp>(),
  'STRING_FORMAT.urlFile': () => createValidate<FormatUrlFile>(),
  'STRING_FORMAT.pattern_slug': () => createValidate<Slug>(),
  'STRING_FORMAT.pattern_hex': () => createValidate<Hex>(),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': () => createValidate<FormatNumber<{max: 100}>>(),
  'NUMBER_FORMAT.number_min': () => createValidate<FormatNumber<{min: 0}>>(),
  'NUMBER_FORMAT.number_lt': () => createValidate<FormatNumber<{lt: 10}>>(),
  'NUMBER_FORMAT.number_gt': () => createValidate<FormatNumber<{gt: 0}>>(),
  'NUMBER_FORMAT.number_integer': () => createValidate<FormatInteger>(),
  'NUMBER_FORMAT.number_float': () => createValidate<FormatFloat>(),
  'NUMBER_FORMAT.number_multipleOf': () => createValidate<FormatNumber<{multipleOf: 5}>>(),
  'NUMBER_FORMAT.number_combined': () => createValidate<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
  'NUMBER_FORMAT.number_int8': () => createValidate<FormatInt8>(),
  'NUMBER_FORMAT.number_uint8': () => createValidate<FormatUInt8>(),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': () => createValidate<FormatBigInt<{max: 100n}>>(),
  'BIGINT_FORMAT.bigint_min': () => createValidate<FormatBigInt<{min: 0n}>>(),
  'BIGINT_FORMAT.bigint_lt': () => createValidate<FormatBigInt<{lt: 10n}>>(),
  'BIGINT_FORMAT.bigint_gt': () => createValidate<FormatBigInt<{gt: 0n}>>(),
  'BIGINT_FORMAT.bigint_multipleOf': () => createValidate<FormatBigInt<{multipleOf: 5n}>>(),
  'BIGINT_FORMAT.bigint_combined': () => createValidate<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
  'BIGINT_FORMAT.bigint_int64': () => createValidate<FormatBigInt64>(),
  'BIGINT_FORMAT.bigint_uint64': () => createValidate<FormatBigUInt64>(),

  // ── DATETIME ──
  'DATETIME.date_minmax': () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
  'DATETIME.date_gtlt': () => createValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
  'DATETIME.date_min_lt': () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
  'DATETIME.date_max_now': () => createValidate<FormatDate<{max: 'now'}>>(),
  'DATETIME.date_rel_window': () => createValidate<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
  'DATETIME.date_rel_datetime_components': () => createValidate<FormatDate<{min: 'now-P1000YT12H'}>>(),
  'DATETIME.instant_minmax': () => createValidate<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
  'DATETIME.instant_gtlt': () => createValidate<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
  'DATETIME.instant_rel': () => createValidate<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
  'DATETIME.plainDate_minmax': () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
  'DATETIME.plainDate_gtlt': () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
  'DATETIME.plainDate_min_lt': () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
  'DATETIME.plainDate_gt_max': () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
  'DATETIME.plainDate_min_only': () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
  'DATETIME.plainDate_max_only': () => createValidate<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
  'DATETIME.plainDate_gt_only': () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
  'DATETIME.plainDate_lt_only': () => createValidate<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
  'DATETIME.plainDate_rel_window': () => createValidate<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
  'DATETIME.plainDate_rel_ymd': () => createValidate<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
  'DATETIME.plainDate_rel_weeks': () => createValidate<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
  'DATETIME.plainTime_minmax': () => createValidate<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
  'DATETIME.plainTime_gtlt': () => createValidate<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
  'DATETIME.plainDateTime_minmax': () => createValidate<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
  'DATETIME.plainDateTime_gtlt': () => createValidate<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
  'DATETIME.plainDateTime_rel': () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
  'DATETIME.plainDateTime_rel_combo': () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
  'DATETIME.plainYearMonth_minmax': () => createValidate<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
  'DATETIME.plainYearMonth_gtlt': () => createValidate<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
  'DATETIME.plainYearMonth_rel': () => createValidate<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
  'DATETIME.zonedDateTime_minmax': () =>
    createValidate<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
  'DATETIME.zonedDateTime_gtlt': () =>
    createValidate<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
  'DATETIME.zonedDateTime_rel': () => createValidate<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),

  // ── REALWORLD ──
  'REALWORLD.user': () => createValidate<User>(),
  'REALWORLD.order': () => createValidate<Order>(),
  'REALWORLD.blogPost': () => createValidate<BlogPost>(),
  'REALWORLD.product': () => createValidate<Product>(),
  'REALWORLD.productPage': () => createValidate<ProductPage>(),
  'REALWORLD.registrationForm': () => createValidate<RegistrationForm>(),
};
