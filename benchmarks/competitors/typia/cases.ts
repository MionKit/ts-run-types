// typia validators keyed by suite case key ("GROUP.case"), TYPE form.
//
// typia validates the FULL TypeScript type via `typia.createIs<T>()`, transformed
// at build time by typia's tsgo transform (driven through `@ttsc/unplugin` in
// esbuild.config.mjs). Like ts-go's `createValidate<T>()` it needs the per-case
// type written LITERALLY at the call site, so each non-format entry copies the
// literal `T` (and any local enum / interface / recursive type decl) VERBATIM from
// the ts-go competitor's cases.ts. Recursion, utility types (Partial/Pick/Omit/
// Exclude/Extract/keyof/indexed-access/conditional/mapped/key-remapping), and
// template-literal types are all expressed natively and work.
//
// FORMAT suites can't use mion's `Format*` brand types, so they translate to typia
// tags (`string & tags.MinLength<…>`, `… & tags.Pattern<'…'>`, `number & tags.Type<…>
// & tags.Minimum<…>`, etc.). Tag semantics confirmed against the installed typings
// and each case's exact samples; a tag is used only where it matches the samples.
//
// A case is marked supported ONLY when (a) typia can express the type and (b) the
// shared sample data matches typia's runtime semantics. Divergences that force
// NOT_SUPPORTED (each entry below carries the precise reason):
//   - bare `number` accepts NaN/Infinity (no tag means "finite" without also forcing
//     integer/range), so every case rejecting NaN/Infinity at a plain-number position fails;
//   - `Date` is `instanceof Date` only, so Invalid Date (new Date('invalid')) passes;
//   - calendar/bound-aware string formats (date/date-time with real-calendar or
//     min/max bounds) exceed what a Pattern can express;
//   - typia validates function-typed members & methods (mion silently drops them),
//     mis-renders `void`, treats `never`/`object`/all-optional objects/Promise/Temporal
//     differently than these suites, and can't hold 64-bit bigint bounds as tag literals.

import typia, {tags} from 'typia';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';
import type {User, Order, BlogPost, Product, ProductPage, RegistrationForm} from '../../shared/cases/realworld/index.ts';

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': () => {
    const check = typia.createIs<any>();
    return (v) => check(v);
  },
  'ATOMIC.bigint': () => {
    const check = typia.createIs<bigint>();
    return (v) => check(v);
  },
  'ATOMIC.boolean': () => {
    const check = typia.createIs<boolean>();
    return (v) => check(v);
  },
  'ATOMIC.date': NOT_SUPPORTED, // Date validated by instanceof; accepts Invalid Date (new Date('invalid'))
  'ATOMIC.enum_mixed': () => {
    enum Color {
      Red,
      Green = 'green',
      Blue = 2,
    }
    const check = typia.createIs<Color>();
    return (v) => check(v);
  },
  'ATOMIC.literal_2': () => {
    const check = typia.createIs<2>();
    return (v) => check(v);
  },
  'ATOMIC.literal_a': () => {
    const check = typia.createIs<'a'>();
    return (v) => check(v);
  },
  'ATOMIC.literal_true': () => {
    const check = typia.createIs<true>();
    return (v) => check(v);
  },
  'ATOMIC.literal_1n': NOT_SUPPORTED, // typia does not support bigint literal types (is<1n>() rejects the literal 1n)
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // mion matches a symbol by its description; typia can't constrain symbol identity/description
  'ATOMIC.never': NOT_SUPPORTED, // typia is<never>() accepts undefined
  'ATOMIC.null': () => {
    const check = typia.createIs<null>();
    return (v) => check(v);
  },
  'ATOMIC.number': NOT_SUPPORTED, // bare number accepts NaN/Infinity; no typia tag means "finite" without also forcing integer/range
  'ATOMIC.object': NOT_SUPPORTED, // typia is<object>() rejects arrays; the suite treats [] as a valid object
  'ATOMIC.regexp': () => {
    const check = typia.createIs<RegExp>();
    return (v) => check(v);
  },
  'ATOMIC.string': () => {
    const check = typia.createIs<string>();
    return (v) => check(v);
  },
  'ATOMIC.symbol': () => {
    const check = typia.createIs<symbol>();
    return (v) => check(v);
  },
  'ATOMIC.undefined': () => {
    const check = typia.createIs<undefined>();
    return (v) => check(v);
  },
  'ATOMIC.void': NOT_SUPPORTED, // typia transform emits invalid JS `(void) => true` for the void type
  // noLiterals degrades a literal to its base type; typia validates that base type directly.
  'ATOMIC.literal_2_noLiterals': NOT_SUPPORTED, // degrades to number — accepts NaN/Infinity
  'ATOMIC.literal_a_noLiterals': () => {
    const check = typia.createIs<string>();
    return (v) => check(v);
  },
  'ATOMIC.literal_regexp_noLiterals': () => {
    const check = typia.createIs<RegExp>();
    return (v) => check(v);
  },
  'ATOMIC.literal_true_noLiterals': () => {
    const check = typia.createIs<boolean>();
    return (v) => check(v);
  },
  'ATOMIC.literal_1n_noLiterals': () => {
    const check = typia.createIs<bigint>();
    return (v) => check(v);
  },
  'ATOMIC.literal_symbol_noLiterals': () => {
    const check = typia.createIs<symbol>();
    return (v) => check(v);
  },
  'ATOMIC.unknown': () => {
    const check = typia.createIs<unknown>();
    return (v) => check(v);
  },

  // ── ARRAY ──
  'ARRAY.string_array': () => {
    const check = typia.createIs<string[]>();
    return (v) => check(v);
  },
  'ARRAY.number_array': NOT_SUPPORTED, // element number accepts NaN/Infinity (invalid samples reject them)
  'ARRAY.boolean_array': () => {
    const check = typia.createIs<boolean[]>();
    return (v) => check(v);
  },
  'ARRAY.bigint_array': () => {
    const check = typia.createIs<bigint[]>();
    return (v) => check(v);
  },
  'ARRAY.date_array': NOT_SUPPORTED, // Date element instanceof accepts Invalid Date (invalid sample rejects it)
  'ARRAY.regexp_array': () => {
    const check = typia.createIs<RegExp[]>();
    return (v) => check(v);
  },
  'ARRAY.undefined_array': () => {
    const check = typia.createIs<undefined[]>();
    return (v) => check(v);
  },
  'ARRAY.null_array': () => {
    const check = typia.createIs<null[]>();
    return (v) => check(v);
  },
  'ARRAY.array_generic': () => {
    const check = typia.createIs<Array<string>>();
    return (v) => check(v);
  },
  'ARRAY.string_array_2d': () => {
    const check = typia.createIs<string[][]>();
    return (v) => check(v);
  },
  'ARRAY.string_array_3d': () => {
    const check = typia.createIs<string[][][]>();
    return (v) => check(v);
  },
  'ARRAY.string_array_noIsArrayCheck': () => {
    const check = typia.createIs<string[]>();
    return (v) => check(v);
  },
  'ARRAY.object_array': () => {
    const check = typia.createIs<{a: string}[]>();
    return (v) => check(v);
  },
  'ARRAY.union_array': NOT_SUPPORTED, // (string|number)[] number arm accepts Infinity element (invalid sample rejects it)
  'ARRAY.tuple_array': () => {
    const check = typia.createIs<[string, number][]>();
    return (v) => check(v);
  },
  'ARRAY.circular_array': NOT_SUPPORTED, // typia transform stack-overflows on the base-case-free self-referential array (type X = X[])
  'ARRAY.circular_object_with_array': () => {
    type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
    const check = typia.createIs<ObjectType>();
    return (v) => check(v);
  },
  'ARRAY.symbol_array': () => {
    const check = typia.createIs<symbol[]>();
    return (v) => check(v);
  },
  'ARRAY.readonly_string_array': () => {
    const check = typia.createIs<ReadonlyArray<string>>();
    return (v) => check(v);
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': NOT_SUPPORTED, // number prop accepts NaN/Infinity (invalid samples reject them)
  'OBJECT.object_as_const_literals': () => {
    const check = typia.createIs<{readonly name: 'john'; readonly age: 30}>();
    return (v) => check(v);
  },
  'OBJECT.object_via_return_type_utility': () => {
    function makeUser(): {id: number; name: string} {
      return {id: 1, name: 'john'};
    }
    const check = typia.createIs<ReturnType<typeof makeUser>>();
    return (v) => check(v);
  },
  'OBJECT.object_via_property_access': () => {
    const check = typia.createIs<{id: number; name: string}>();
    return (v) => check(v);
  },
  'OBJECT.object_via_array_access': () => {
    const check = typia.createIs<{id: number; name: string}>();
    return (v) => check(v);
  },
  'OBJECT.interface_with_optional': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'OBJECT.interface_with_date': NOT_SUPPORTED, // Date instanceof accepts Invalid Date (invalid samples reject it)
  'OBJECT.interface_with_method': NOT_SUPPORTED, // typia validates the function prop (cb); mion silently drops it, so valid samples with cb:42/null fail here
  'OBJECT.nested_object': NOT_SUPPORTED, // nested number prop accepts NaN (invalid sample rejects it)
  'OBJECT.interface_string_array_prop': () => {
    const check = typia.createIs<{tags: string[]}>();
    return (v) => check(v);
  },
  'OBJECT.circular_interface': () => {
    type ICircular = {name: string; child?: ICircular};
    const check = typia.createIs<ICircular>();
    return (v) => check(v);
  },
  'OBJECT.circular_interface_on_array': () => {
    type ICircularArray = {name: string; children?: ICircularArray[]};
    const check = typia.createIs<ICircularArray>();
    return (v) => check(v);
  },
  'OBJECT.circular_interface_on_nested_object': () => {
    type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
    const check = typia.createIs<ICircularDeep>();
    return (v) => check(v);
  },
  // typia accepts an explicit-`undefined` property value ({a: undefined}) for a
  // string index signature — a genuine runtime-semantics divergence from the suite
  // (mion rejects it: every index value must satisfy the value type). Not fixable
  // at the type level, so opted out rather than left as a perpetual correctness FAIL.
  // typia accepts an explicit-`undefined` property value ({a: undefined}) for a
  // string index signature; mion rejects it (every index value must satisfy the value type).
  'OBJECT.index_signature_string': NOT_SUPPORTED,
  'OBJECT.index_signature_named_props': () => {
    const check = typia.createIs<{a: string; b: number; [key: string]: string | number}>();
    return (v) => check(v);
  },
  'OBJECT.index_signature_nested': NOT_SUPPORTED, // nested number value accepts NaN (invalid sample rejects it)
  'OBJECT.index_signature_date_value': NOT_SUPPORTED, // Date instanceof accepts Invalid Date (invalid sample rejects it)
  'OBJECT.index_signature_non_root': () => {
    interface Obj1 {
      a: string;
      [key: string]: string;
    }
    interface Obj2 {
      b: string;
      c: Obj1;
    }
    const check = typia.createIs<Obj2>();
    return (v) => check(v);
  },
  'OBJECT.function_top_level': NOT_SUPPORTED, // typia transform emits invalid JS for the void return position of () => void
  'OBJECT.interface_callable': NOT_SUPPORTED, // typia does not validate a callable interface as a function-with-props; rejects the valid function value
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // typia's all-optional object accepts Date/Map/Set/array instances; mion rejects them
  'OBJECT.class_simple': NOT_SUPPORTED, // Date prop instanceof accepts Invalid Date (invalid samples reject it)
  'OBJECT.rpc_error_class': () => {
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
    const check = typia.createIs<RpcError<'test-error'>>();
    return (v) => check(v);
  },
  'OBJECT.call_signature_params': NOT_SUPPORTED, // number param accepts NaN (invalid sample rejects it)
  'OBJECT.call_signature_params_with_optional': NOT_SUPPORTED, // number param accepts NaN (invalid sample rejects it)
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED, // Date rest element instanceof accepts Invalid Date (invalid sample rejects it)
  'OBJECT.record_union_keys': NOT_SUPPORTED, // number value accepts NaN/Infinity (invalid samples reject them)
  'OBJECT.union_value_index': NOT_SUPPORTED, // number value accepts NaN (invalid sample rejects it)
  'OBJECT.object_with_union_prop': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'OBJECT.interface_inheritance': () => {
    interface Base {
      a: string;
    }
    interface Child extends Base {
      b: number;
    }
    const check = typia.createIs<Child>();
    return (v) => check(v);
  },
  'OBJECT.class_inheritance': () => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    const check = typia.createIs<Sub>();
    return (v) => check(v);
  },
  'OBJECT.index_signature_number_key': () => {
    const check = typia.createIs<{[k: number]: string}>();
    return (v) => check(v);
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': NOT_SUPPORTED, // number slot accepts NaN (invalid sample rejects it)
  'TUPLE.full_mion_tuple': NOT_SUPPORTED, // Date slot accepts Invalid Date + number slot accepts NaN
  'TUPLE.tuple_with_optional': NOT_SUPPORTED, // number slot accepts NaN (invalid sample rejects it)
  'TUPLE.nested_tuple_in_array': NOT_SUPPORTED, // number slot accepts NaN (invalid sample rejects it)
  'TUPLE.tuple_rest': NOT_SUPPORTED, // number slot accepts NaN (invalid sample rejects it)
  'TUPLE.tuple_circular': NOT_SUPPORTED, // Date slot accepts Invalid Date + number slot accepts NaN
  'TUPLE.tuple_multiple_trailing_optionals': NOT_SUPPORTED, // number slot accepts NaN (invalid sample rejects it)
  'TUPLE.tuple_named_labels': NOT_SUPPORTED, // number slot accepts NaN (invalid sample rejects it)
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED, // typia requires the function slot; mion treats it as must-be-undefined (valid sample [3] omits it)
  'TUPLE.empty_tuple': () => {
    const check = typia.createIs<[]>();
    return (v) => check(v);
  },
  'TUPLE.single_element_tuple': () => {
    const check = typia.createIs<[string]>();
    return (v) => check(v);
  },
  'TUPLE.readonly_tuple': () => {
    const check = typia.createIs<readonly [string, number]>();
    return (v) => check(v);
  },

  // ── UNION ──
  'UNION.atomic_union': NOT_SUPPORTED, // Date arm accepts Invalid Date + number arm accepts Infinity
  'UNION.string_literal_union': () => {
    const check = typia.createIs<'UNO' | 'DOS' | 'TRES'>();
    return (v) => check(v);
  },
  'UNION.large_union_eight_arms': () => {
    const check = typia.createIs<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>();
    return (v) => check(v);
  },
  'UNION.string_or_number': NOT_SUPPORTED, // number arm accepts NaN/Infinity (invalid samples reject them)
  'UNION.union_of_array_types': NOT_SUPPORTED, // number[] arm accepts Infinity element (invalid sample rejects it)
  'UNION.array_of_union': NOT_SUPPORTED, // Date arm accepts Invalid Date element (invalid sample rejects it)
  'UNION.union_of_object_shapes': () => {
    const check = typia.createIs<{a: string; aa: boolean} | {b: number} | {c: bigint}>();
    return (v) => check(v);
  },
  'UNION.discriminated_union': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'UNION.circular_union': NOT_SUPPORTED, // Date arm accepts Invalid Date + number arm accepts Infinity
  'UNION.union_with_methods': NOT_SUPPORTED, // typia validates the methods; mion drops them, so valid samples omitting the method fail here
  'UNION.intersection_to_object': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'UNION.union_with_index_arm': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'UNION.union_same_prop_different_types': () => {
    const check = typia.createIs<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>();
    return (v) => check(v);
  },
  'UNION.union_mixed_arrays_and_objects': () => {
    const check = typia.createIs<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>();
    return (v) => check(v);
  },
  'UNION.union_merged_property': NOT_SUPPORTED, // number arm accepts NaN (invalid sample rejects it)
  'UNION.union_mixed_with_index': () => {
    const check = typia.createIs<
      | string[]
      | {a: string; aa: boolean}
      | {b: number}
      | {a: string; [key: string]: string}
      | {[key: string]: bigint; b: bigint}
    >();
    return (v) => check(v);
  },
  'UNION.union_with_any_fallback': () => {
    const check = typia.createIs<string | any>();
    return (v) => check(v);
  },
  'UNION.union_with_unknown_fallback': () => {
    const check = typia.createIs<string | unknown>();
    return (v) => check(v);
  },
  'UNION.union_subset_small_first': () => {
    interface SmallObj {
      a: string;
    }
    interface LargeObj {
      a: string;
      b: number;
    }
    const check = typia.createIs<SmallObj | LargeObj>();
    return (v) => check(v);
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
    const check = typia.createIs<Tiny | Medium | Large>();
    return (v) => check(v);
  },
  'UNION.union_subset_mixed_related_unrelated': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': () => {
    const check = typia.createIs<`api/user/${number}`>();
    return (v) => check(v);
  },
  'TEMPLATE_LITERAL.multi_segment_url': () => {
    const check = typia.createIs<`/api/v${number}/user/${string}/posts/${number}`>();
    return (v) => check(v);
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': () => {
    const check = typia.createIs<`${string}/${number}`>();
    return (v) => check(v);
  },
  'TEMPLATE_LITERAL.regex_special_chars': () => {
    const check = typia.createIs<`(${number})`>();
    return (v) => check(v);
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': () => {
    const check = typia.createIs<{url: `api/user/${number}`; method: string}>();
    return (v) => check(v);
  },
  'TEMPLATE_LITERAL.template_literal_index_key': NOT_SUPPORTED, // number index value accepts NaN (invalid sample rejects it)
  'TEMPLATE_LITERAL.template_literal_union_placeholder': () => {
    const check = typia.createIs<`${'a' | 'b'}-${number}`>();
    return (v) => check(v);
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // Map value is number — accepts NaN (invalid sample rejects it)
  'NATIVE.set_string': () => {
    const check = typia.createIs<Set<string>>();
    return (v) => check(v);
  },
  'NATIVE.promise_string': NOT_SUPPORTED, // typia does not validate Promise<T> as a thenable; rejects a real Promise
  'NATIVE.awaited_promise': () => {
    const check = typia.createIs<Awaited<Promise<string>>>();
    return (v) => check(v);
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': NOT_SUPPORTED, // number prop accepts NaN + Date prop accepts Invalid Date
  'CIRCULAR.array_of_union_with_self_ref': NOT_SUPPORTED, // Date arm accepts Invalid Date + number arm accepts NaN
  'CIRCULAR.object_with_tuple_prop': () => {
    interface CircularTuple {
      tuple: [bigint, CircularTuple?];
    }
    const check = typia.createIs<CircularTuple>();
    return (v) => check(v);
  },
  'CIRCULAR.object_with_index_prop': () => {
    interface CircularIndex {
      index: {[key: string]: CircularIndex};
    }
    const check = typia.createIs<CircularIndex>();
    return (v) => check(v);
  },
  'CIRCULAR.object_deeply_nested': () => {
    interface CircularDeep {
      deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
    }
    const check = typia.createIs<CircularDeep>();
    return (v) => check(v);
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
    const check = typia.createIs<RootNotCircular>();
    return (v) => check(v);
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
    const check = typia.createIs<RootCircular>();
    return (v) => check(v);
  },

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED, // number prop accepts NaN + Date prop accepts Invalid Date
  'UTILITY.required': NOT_SUPPORTED, // number prop accepts NaN + Date prop accepts Invalid Date
  'UTILITY.pick': NOT_SUPPORTED, // Date prop accepts Invalid Date (invalid sample rejects it)
  'UTILITY.omit': NOT_SUPPORTED, // Date prop accepts Invalid Date (invalid sample rejects it)
  'UTILITY.exclude_atomic': () => {
    const check = typia.createIs<Exclude<'name' | 'age' | 'createdAt', 'age'>>();
    return (v) => check(v);
  },
  'UTILITY.extract_atomic': () => {
    const check = typia.createIs<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>();
    return (v) => check(v);
  },
  'UTILITY.exclude_from_object_union': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'UTILITY.non_nullable': NOT_SUPPORTED, // number arm accepts NaN/Infinity (invalid samples reject them)
  'UTILITY.return_type': NOT_SUPPORTED, // resolves to Date; instanceof accepts Invalid Date (invalid samples reject it)
  'UTILITY.readonly': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'UTILITY.intersection_with_required_override': NOT_SUPPORTED, // number prop accepts NaN + Date prop accepts Invalid Date
  'UTILITY.omit_keeping_optional': NOT_SUPPORTED, // number prop accepts NaN (invalid sample rejects it)
  'UTILITY.keyof_to_literal_union': () => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    const check = typia.createIs<keyof Person>();
    return (v) => check(v);
  },
  'UTILITY.typeof_variable_query': () => {
    const config = {url: 'http://example.com', port: 8080};
    const check = typia.createIs<typeof config>();
    return (v) => check(v);
  },
  'UTILITY.indexed_access_type': () => {
    interface Person {
      name: string;
      age: number;
    }
    const check = typia.createIs<Person['name']>();
    return (v) => check(v);
  },
  'UTILITY.conditional_type_resolved': () => {
    type IsString<T> = T extends string ? boolean : number;
    const check = typia.createIs<IsString<'hello'>>();
    return (v) => check(v);
  },
  'UTILITY.mapped_type_custom': () => {
    interface Source {
      a: string;
      b: number;
    }
    type Nullable<T> = {[K in keyof T]: T[K] | null};
    const check = typia.createIs<Nullable<Source>>();
    return (v) => check(v);
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
    const check = typia.createIs<UserForm>();
    return (v) => check(v);
  },
  'UTILITY.distributive_conditional_over_union': NOT_SUPPORTED, // number arm accepts NaN (invalid sample rejects it)
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED, // nested number prop accepts NaN (invalid sample rejects it)

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': () => {
    interface Source {
      id: number;
      name: string;
    }
    type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
    const check = typia.createIs<Prefixed<Source>>();
    return (v) => check(v);
  },
  'TYPE_MAPPINGS.key_conditional_rename': () => {
    interface Source {
      id: number;
      name: string;
      createdAt: Date;
    }
    type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
    const check = typia.createIs<MongoForm<Source>>();
    return (v) => check(v);
  },
  'TYPE_MAPPINGS.key_filter_via_never': () => {
    interface Source {
      id: number;
      name: string;
      secret: string;
    }
    type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
    const check = typia.createIs<Public<Source>>();
    return (v) => check(v);
  },

  // ── DATETIME ──
  // Temporal.* are branded class instances; typia validates by structure and can't reliably
  // distinguish them (and the bench runtime has no Temporal global, so samples can't even build).
  'DATETIME.date': NOT_SUPPORTED, // Date instanceof accepts Invalid Date (invalid samples reject it)
  'DATETIME.instant': NOT_SUPPORTED,
  'DATETIME.zonedDateTime': NOT_SUPPORTED,
  'DATETIME.plainDate': NOT_SUPPORTED,
  'DATETIME.plainTime': NOT_SUPPORTED,
  'DATETIME.plainDateTime': NOT_SUPPORTED,
  'DATETIME.plainYearMonth': NOT_SUPPORTED,
  'DATETIME.plainMonthDay': NOT_SUPPORTED,
  'DATETIME.duration': NOT_SUPPORTED,

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': () => {
    const check = typia.createIs<string & tags.MaxLength<5>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_minLength': () => {
    const check = typia.createIs<string & tags.MinLength<3>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_length': () => {
    const check = typia.createIs<string & tags.MinLength<4> & tags.MaxLength<4>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_range': () => {
    const check = typia.createIs<string & tags.MinLength<2> & tags.MaxLength<4>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_allowedChars': () => {
    const check = typia.createIs<string & tags.Pattern<'^[0-9a-f]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': () => {
    const check = typia.createIs<string & tags.Pattern<'^[abcABC]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_allowedChars_literal': () => {
    const check = typia.createIs<string & tags.Pattern<'^[.\\-]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_disallowedChars': () => {
    const check = typia.createIs<string & tags.Pattern<'^[^!@#]*$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_allowedValues': () => {
    const check = typia.createIs<'red' | 'green' | 'blue'>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': () => {
    const check = typia.createIs<string & tags.Pattern<'^(?:[Rr][Ee][Dd]|[Gg][Rr][Ee][Ee][Nn])$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_allowedValues_escaped': () => {
    const check = typia.createIs<'a.b' | 'c+d'>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_disallowedValues': () => {
    const check = typia.createIs<string & tags.Pattern<'^(?!(?:admin|root)$).*$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.string_customErrorMessage': () => {
    const check = typia.createIs<'a' | 'b'>();
    return (v) => check(v);
  },
  'STRING_FORMAT.alpha': () => {
    const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.alphaNumeric': () => {
    const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z0-9]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.numeric': () => {
    const check = typia.createIs<string & tags.Pattern<'^[0-9]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.alpha_withLength': () => {
    const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z]+$'> & tags.MaxLength<3>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.lowercase_validate': () => {
    const check = typia.createIs<string>();
    return (v) => check(v);
  },
  'STRING_FORMAT.uuidv4': () => {
    const check = typia.createIs<string & tags.Pattern<'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.uuidv7': () => {
    const check = typia.createIs<string & tags.Pattern<'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.date_iso': NOT_SUPPORTED, // needs calendar validity (rejects 2023-02-29); a Pattern can only check format
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // needs calendar validity (rejects 31-04-2024); a Pattern can only check format
  'STRING_FORMAT.date_YM': () => {
    const check = typia.createIs<string & tags.Pattern<'^[0-9]{4}-(0[1-9]|1[0-2])$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.date_MD': () => {
    const check = typia.createIs<string & tags.Pattern<'^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // needs absolute min/max bound comparison on date strings (no typia tag)
  'STRING_FORMAT.time_iso': () => {
    const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,9})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.time_HHmmss': () => {
    const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.time_HHmmss_ms': () => {
    const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,3})?$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // needs absolute min/max bound comparison on time strings (no typia tag)
  'STRING_FORMAT.dateTime_default': NOT_SUPPORTED, // needs calendar validity + T-only split (typia date-time regex allows space split and non-calendar dates)
  'STRING_FORMAT.dateTime_custom': () => {
    const check = typia.createIs<string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // needs absolute min/max bound comparison on datetime strings (no typia tag)
  'STRING_FORMAT.ipv4': () => {
    const check = typia.createIs<string & tags.Format<'ipv4'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.ipv6': () => {
    const check = typia.createIs<string & tags.Format<'ipv6'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.ip_any': () => {
    const check = typia.createIs<(string & tags.Format<'ipv4'>) | (string & tags.Format<'ipv6'>)>();
    return (v) => check(v);
  },
  'STRING_FORMAT.ipv4_port': () => {
    const check = typia.createIs<
      string &
        tags.Pattern<'^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]):(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}|0)$'>
    >();
    return (v) => check(v);
  },
  'STRING_FORMAT.ipv6_port': () => {
    const check = typia.createIs<
      string & tags.Pattern<'^\\[[0-9a-fA-F:]+\\]:(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}|0)$'>
    >();
    return (v) => check(v);
  },
  'STRING_FORMAT.domain': () => {
    const check = typia.createIs<string & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.domainStrict': () => {
    const check = typia.createIs<string & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.email': NOT_SUPPORTED, // typia email regex accepts a@b.co (1-char domain label) which mion's FormatEmail rejects
  'STRING_FORMAT.emailPunycode': () => {
    const check = typia.createIs<string & tags.Format<'email'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.emailStrict': () => {
    const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z0-9._-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.url': () => {
    const check = typia.createIs<string & tags.Pattern<'^(?:https?|ftp|wss?):\\/\\/[^\\s.]+(?:\\.[^\\s.]+)+(?:[\\/?][^\\s]*)?$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.urlHttp': () => {
    const check = typia.createIs<string & tags.Pattern<'^https?:\\/\\/[^\\s.]+(?:\\.[^\\s.]+)+(?:[\\/?][^\\s]*)?$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.urlFile': () => {
    const check = typia.createIs<string & tags.Pattern<'^file:\\/\\/\\/[^\\s]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.pattern_slug': () => {
    const check = typia.createIs<string & tags.Pattern<'^[a-z0-9-]+$'>>();
    return (v) => check(v);
  },
  'STRING_FORMAT.pattern_hex': () => {
    const check = typia.createIs<string & tags.Pattern<'^[0-9a-fA-F]+$'>>();
    return (v) => check(v);
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': () => {
    const check = typia.createIs<number & tags.Maximum<100>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_min': () => {
    const check = typia.createIs<number & tags.Minimum<0>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_lt': () => {
    const check = typia.createIs<number & tags.ExclusiveMaximum<10>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_gt': () => {
    const check = typia.createIs<number & tags.ExclusiveMinimum<0>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_integer': () => {
    const check = typia.createIs<number & tags.Type<'int32'>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_float': NOT_SUPPORTED, // mion FormatFloat means non-integer; typia Type<'float'> means float32-representable (accepts integers)
  'NUMBER_FORMAT.number_multipleOf': () => {
    const check = typia.createIs<number & tags.MultipleOf<5>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_combined': () => {
    const check = typia.createIs<number & tags.Type<'int32'> & tags.Minimum<0> & tags.Maximum<100> & tags.MultipleOf<5>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_int8': () => {
    const check = typia.createIs<number & tags.Type<'int32'> & tags.Minimum<-128> & tags.Maximum<127>>();
    return (v) => check(v);
  },
  'NUMBER_FORMAT.number_uint8': () => {
    const check = typia.createIs<number & tags.Type<'uint32'> & tags.Maximum<255>>();
    return (v) => check(v);
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': () => {
    const check = typia.createIs<bigint & tags.Maximum<100n>>();
    return (v) => check(v);
  },
  'BIGINT_FORMAT.bigint_min': () => {
    const check = typia.createIs<bigint & tags.Minimum<0n>>();
    return (v) => check(v);
  },
  'BIGINT_FORMAT.bigint_lt': () => {
    const check = typia.createIs<bigint & tags.ExclusiveMaximum<10n>>();
    return (v) => check(v);
  },
  'BIGINT_FORMAT.bigint_gt': () => {
    const check = typia.createIs<bigint & tags.ExclusiveMinimum<0n>>();
    return (v) => check(v);
  },
  'BIGINT_FORMAT.bigint_multipleOf': () => {
    const check = typia.createIs<bigint & tags.MultipleOf<5n>>();
    return (v) => check(v);
  },
  'BIGINT_FORMAT.bigint_combined': () => {
    const check = typia.createIs<bigint & tags.Minimum<0n> & tags.Maximum<1000n> & tags.MultipleOf<10n>>();
    return (v) => check(v);
  },
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // typia tag schema can't hold 64-bit bigint bounds as literals (precision loss → "non-literal type")
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // typia tag schema can't hold 64-bit bigint bounds as literals (precision loss → "non-literal type")

  // ── DATETIME (format) ──
  // All DATETIME format cases need min/max/gt/lt/relative bound comparison on a Date or
  // Temporal value — typia has no tag for temporal range constraints (Min/Max tags target
  // number/bigint/string length only), and the Date-backed ones also accept Invalid Date.
  'DATETIME.date_minmax': NOT_SUPPORTED,
  'DATETIME.date_gtlt': NOT_SUPPORTED,
  'DATETIME.date_min_lt': NOT_SUPPORTED,
  'DATETIME.date_max_now': NOT_SUPPORTED,
  'DATETIME.date_rel_window': NOT_SUPPORTED,
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED,
  'DATETIME.instant_minmax': NOT_SUPPORTED,
  'DATETIME.instant_gtlt': NOT_SUPPORTED,
  'DATETIME.instant_rel': NOT_SUPPORTED,
  'DATETIME.plainDate_minmax': NOT_SUPPORTED,
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED,
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED,
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED,
  'DATETIME.plainDate_min_only': NOT_SUPPORTED,
  'DATETIME.plainDate_max_only': NOT_SUPPORTED,
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED,
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED,
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED,
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED,
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED,
  'DATETIME.plainTime_minmax': NOT_SUPPORTED,
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED,
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED,
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED,
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED,
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED,
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED,
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED,
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED,
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED,
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED,
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED,

  // ── REALWORLD ──
  'REALWORLD.user': () => {
    const check = typia.createIs<User>();
    return (v) => check(v);
  },
  'REALWORLD.order': () => {
    const check = typia.createIs<Order>();
    return (v) => check(v);
  },
  'REALWORLD.blogPost': () => {
    const check = typia.createIs<BlogPost>();
    return (v) => check(v);
  },
  'REALWORLD.product': () => {
    const check = typia.createIs<Product>();
    return (v) => check(v);
  },
  'REALWORLD.productPage': () => {
    const check = typia.createIs<ProductPage>();
    return (v) => check(v);
  },
  'REALWORLD.registrationForm': () => {
    const check = typia.createIs<RegistrationForm>();
    return (v) => check(v);
  },
};
