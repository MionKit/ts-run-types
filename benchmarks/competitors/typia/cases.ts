// typia validators keyed by suite case key ("GROUP.case"), TYPE form.
//
// typia validates the FULL TypeScript type via `typia.createIs<T>()`, transformed
// at build time by typia's tsgo transform (driven through `@ttsc/unplugin` in
// esbuild.config.mjs). Like ts-go's `createValidate<T>()` it needs the per-case
// type written LITERALLY at the call site, so each supported
// entry copies the literal `T` (and any local enum / interface decl) VERBATIM from
// the ts-go competitor's cases.ts.
//
// A case is marked supported ONLY when (a) typia can express the type and (b) the
// shared sample data matches typia's runtime semantics. The main divergences that
// force NOT_SUPPORTED here:
//   - typia's default `createIs<number>()` is a bare `typeof === "number"` check
//     (no `Number.isFinite`), so it ACCEPTS NaN / Infinity — every case whose
//     `invalid` samples rely on rejecting NaN / Infinity at a number position fails.
//   - `Date` is validated by `instanceof Date`, so Invalid Date instances pass —
//     cases that reject `new Date('invalid')` fail; Date is also non-serialisable here.
//   - typia does not model `any` / `unknown` / `void` / `never` / `symbol` /
//     `bigint` literals / `Map` / `Set` / `Promise` / `RegExp` / the `Format*`
//     brand types the way these suites expect.
//   - utility / mapped / template-literal / circular cases are conservatively opted
//     out even when typia could express them, to keep the transform buildable.
// When unsure, the entry is NOT_SUPPORTED (favour a buildable file over a risky type).

import typia from 'typia';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';
import type {User, Order, BlogPost, Product, ProductPage, RegistrationForm} from '../../shared/cases/realworld/index.ts';

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': NOT_SUPPORTED,
  'ATOMIC.bigint': () => {
    const check = typia.createIs<bigint>();
    return (v) => check(v);
  },
  'ATOMIC.boolean': () => {
    const check = typia.createIs<boolean>();
    return (v) => check(v);
  },
  'ATOMIC.date': NOT_SUPPORTED,
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
  'ATOMIC.literal_1n': NOT_SUPPORTED, // bigint literal
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // symbol
  'ATOMIC.never': NOT_SUPPORTED, // never
  'ATOMIC.null': () => {
    const check = typia.createIs<null>();
    return (v) => check(v);
  },
  'ATOMIC.number': NOT_SUPPORTED, // default is() accepts NaN / Infinity
  'ATOMIC.object': NOT_SUPPORTED, // bare `object` keyword
  'ATOMIC.regexp': NOT_SUPPORTED, // RegExp
  'ATOMIC.string': () => {
    const check = typia.createIs<string>();
    return (v) => check(v);
  },
  'ATOMIC.symbol': NOT_SUPPORTED,
  'ATOMIC.undefined': () => {
    const check = typia.createIs<undefined>();
    return (v) => check(v);
  },
  'ATOMIC.void': NOT_SUPPORTED, // void
  'ATOMIC.literal_2_noLiterals': NOT_SUPPORTED, // noLiterals degrade is ts-go-only
  'ATOMIC.literal_a_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_regexp_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_true_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_1n_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED,
  'ATOMIC.unknown': NOT_SUPPORTED, // unknown

  // ── ARRAY ──
  'ARRAY.string_array': () => {
    const check = typia.createIs<string[]>();
    return (v) => check(v);
  },
  'ARRAY.number_array': NOT_SUPPORTED, // invalid samples rely on NaN / Infinity rejection
  'ARRAY.boolean_array': () => {
    const check = typia.createIs<boolean[]>();
    return (v) => check(v);
  },
  'ARRAY.bigint_array': () => {
    const check = typia.createIs<bigint[]>();
    return (v) => check(v);
  },
  'ARRAY.date_array': NOT_SUPPORTED, // Date
  'ARRAY.regexp_array': NOT_SUPPORTED, // RegExp
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
  'ARRAY.union_array': NOT_SUPPORTED, // invalid samples rely on Infinity rejection
  'ARRAY.tuple_array': () => {
    const check = typia.createIs<[string, number][]>();
    return (v) => check(v);
  },
  'ARRAY.circular_array': NOT_SUPPORTED, // recursive type
  'ARRAY.circular_object_with_array': NOT_SUPPORTED, // recursive type
  'ARRAY.symbol_array': NOT_SUPPORTED,
  'ARRAY.readonly_string_array': () => {
    const check = typia.createIs<ReadonlyArray<string>>();
    return (v) => check(v);
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': NOT_SUPPORTED, // invalid samples rely on NaN / Infinity rejection
  'OBJECT.object_as_const_literals': () => {
    const check = typia.createIs<{readonly name: 'john'; readonly age: 30}>();
    return (v) => check(v);
  },
  'OBJECT.object_via_return_type_utility': NOT_SUPPORTED, // utility type
  'OBJECT.object_via_property_access': () => {
    const check = typia.createIs<{id: number; name: string}>();
    return (v) => check(v);
  },
  'OBJECT.object_via_array_access': () => {
    const check = typia.createIs<{id: number; name: string}>();
    return (v) => check(v);
  },
  'OBJECT.interface_with_optional': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'OBJECT.interface_with_date': NOT_SUPPORTED, // Date
  'OBJECT.interface_with_method': NOT_SUPPORTED, // function-typed property
  'OBJECT.nested_object': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'OBJECT.interface_string_array_prop': () => {
    const check = typia.createIs<{tags: string[]}>();
    return (v) => check(v);
  },
  'OBJECT.circular_interface': NOT_SUPPORTED, // recursive type
  'OBJECT.circular_interface_on_array': NOT_SUPPORTED, // recursive type
  'OBJECT.circular_interface_on_nested_object': NOT_SUPPORTED, // recursive type
  // typia accepts an explicit-`undefined` property value ({a: undefined}) for a
  // string index signature — a genuine runtime-semantics divergence from the suite
  // (mion rejects it: every index value must satisfy the value type). Not fixable
  // at the type level, so opted out rather than left as a perpetual correctness FAIL.
  'OBJECT.index_signature_string': NOT_SUPPORTED,
  'OBJECT.index_signature_named_props': NOT_SUPPORTED, // named + number + index combo
  'OBJECT.index_signature_nested': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'OBJECT.index_signature_date_value': NOT_SUPPORTED, // Date
  'OBJECT.index_signature_non_root': NOT_SUPPORTED, // nested index signature
  'OBJECT.function_top_level': NOT_SUPPORTED, // function type
  'OBJECT.interface_callable': NOT_SUPPORTED, // callable interface
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // all-optional object accepts Date/Map/Set instances
  'OBJECT.class_simple': NOT_SUPPORTED, // class type with Date / method
  'OBJECT.rpc_error_class': NOT_SUPPORTED, // class type
  'OBJECT.call_signature_params': NOT_SUPPORTED, // Parameters<> utility
  'OBJECT.call_signature_params_with_optional': NOT_SUPPORTED, // Parameters<> utility
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED, // Parameters<> utility (Date rest)
  'OBJECT.record_union_keys': NOT_SUPPORTED, // invalid samples rely on NaN / Infinity rejection
  'OBJECT.union_value_index': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'OBJECT.object_with_union_prop': NOT_SUPPORTED, // invalid samples rely on NaN rejection
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
  'OBJECT.class_inheritance': NOT_SUPPORTED, // class type
  'OBJECT.index_signature_number_key': NOT_SUPPORTED, // numeric-key index signature

  // ── TUPLE ──
  'TUPLE.string_number_pair': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'TUPLE.full_mion_tuple': NOT_SUPPORTED, // Date + bigint + NaN
  'TUPLE.tuple_with_optional': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'TUPLE.nested_tuple_in_array': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'TUPLE.tuple_rest': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'TUPLE.tuple_circular': NOT_SUPPORTED, // recursive type
  'TUPLE.tuple_multiple_trailing_optionals': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'TUPLE.tuple_named_labels': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED, // function element
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
  'UNION.atomic_union': NOT_SUPPORTED, // Date + bigint + Infinity
  'UNION.string_literal_union': () => {
    const check = typia.createIs<'UNO' | 'DOS' | 'TRES'>();
    return (v) => check(v);
  },
  'UNION.large_union_eight_arms': NOT_SUPPORTED, // heterogeneous 8-arm union (conservative)
  'UNION.string_or_number': NOT_SUPPORTED, // invalid samples rely on NaN / Infinity rejection
  'UNION.union_of_array_types': NOT_SUPPORTED, // invalid samples rely on Infinity rejection
  'UNION.array_of_union': NOT_SUPPORTED, // Date + bigint
  'UNION.union_of_object_shapes': () => {
    const check = typia.createIs<{a: string; aa: boolean} | {b: number} | {c: bigint}>();
    return (v) => check(v);
  },
  'UNION.discriminated_union': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'UNION.circular_union': NOT_SUPPORTED, // recursive type
  'UNION.union_with_methods': NOT_SUPPORTED, // method-bearing arms (valid samples omit the method)
  'UNION.intersection_to_object': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'UNION.union_with_index_arm': NOT_SUPPORTED, // index-signature arm + bigint
  'UNION.union_same_prop_different_types': () => {
    const check = typia.createIs<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>();
    return (v) => check(v);
  },
  'UNION.union_mixed_arrays_and_objects': NOT_SUPPORTED, // mixed arrays + bigint objects (conservative)
  'UNION.union_merged_property': NOT_SUPPORTED, // invalid samples rely on NaN rejection
  'UNION.union_mixed_with_index': NOT_SUPPORTED, // index-signature arms
  'UNION.union_with_any_fallback': NOT_SUPPORTED, // collapses to any
  'UNION.union_with_unknown_fallback': NOT_SUPPORTED, // collapses to unknown
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
  'UNION.union_subset_mixed_related_unrelated': NOT_SUPPORTED, // invalid samples rely on NaN rejection

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.multi_segment_url': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.leading_string_placeholder': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.regex_special_chars': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.template_literal_nested_in_object': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.template_literal_index_key': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.template_literal_union_placeholder': NOT_SUPPORTED,

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // Map
  'NATIVE.set_string': NOT_SUPPORTED, // Set
  'NATIVE.promise_string': NOT_SUPPORTED, // Promise
  'NATIVE.awaited_promise': NOT_SUPPORTED, // Awaited<Promise<…>>

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': NOT_SUPPORTED,
  'CIRCULAR.array_of_union_with_self_ref': NOT_SUPPORTED,
  'CIRCULAR.object_with_tuple_prop': NOT_SUPPORTED,
  'CIRCULAR.object_with_index_prop': NOT_SUPPORTED,
  'CIRCULAR.object_deeply_nested': NOT_SUPPORTED,
  'CIRCULAR.circular_child_under_literal_root': NOT_SUPPORTED,
  'CIRCULAR.multiple_circular_types_cross_referenced': NOT_SUPPORTED,

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED,
  'UTILITY.required': NOT_SUPPORTED,
  'UTILITY.pick': NOT_SUPPORTED,
  'UTILITY.omit': NOT_SUPPORTED,
  'UTILITY.exclude_atomic': NOT_SUPPORTED,
  'UTILITY.extract_atomic': NOT_SUPPORTED,
  'UTILITY.exclude_from_object_union': NOT_SUPPORTED,
  'UTILITY.non_nullable': NOT_SUPPORTED,
  'UTILITY.return_type': NOT_SUPPORTED,
  'UTILITY.readonly': NOT_SUPPORTED,
  'UTILITY.intersection_with_required_override': NOT_SUPPORTED,
  'UTILITY.omit_keeping_optional': NOT_SUPPORTED,
  'UTILITY.keyof_to_literal_union': NOT_SUPPORTED,
  'UTILITY.typeof_variable_query': NOT_SUPPORTED,
  'UTILITY.indexed_access_type': NOT_SUPPORTED,
  'UTILITY.conditional_type_resolved': NOT_SUPPORTED,
  'UTILITY.mapped_type_custom': NOT_SUPPORTED,
  'UTILITY.mapped_type_with_conditional_value': NOT_SUPPORTED,
  'UTILITY.distributive_conditional_over_union': NOT_SUPPORTED,
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED,

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': NOT_SUPPORTED,
  'TYPE_MAPPINGS.key_conditional_rename': NOT_SUPPORTED,
  'TYPE_MAPPINGS.key_filter_via_never': NOT_SUPPORTED,

  // ── DATETIME ──
  'DATETIME.date': NOT_SUPPORTED,
  'DATETIME.instant': NOT_SUPPORTED,
  'DATETIME.zonedDateTime': NOT_SUPPORTED,
  'DATETIME.plainDate': NOT_SUPPORTED,
  'DATETIME.plainTime': NOT_SUPPORTED,
  'DATETIME.plainDateTime': NOT_SUPPORTED,
  'DATETIME.plainYearMonth': NOT_SUPPORTED,
  'DATETIME.plainMonthDay': NOT_SUPPORTED,
  'DATETIME.duration': NOT_SUPPORTED,

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': NOT_SUPPORTED,
  'STRING_FORMAT.string_minLength': NOT_SUPPORTED,
  'STRING_FORMAT.string_length': NOT_SUPPORTED,
  'STRING_FORMAT.string_range': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedChars': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedChars_literal': NOT_SUPPORTED,
  'STRING_FORMAT.string_disallowedChars': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedValues': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedValues_escaped': NOT_SUPPORTED,
  'STRING_FORMAT.string_disallowedValues': NOT_SUPPORTED,
  'STRING_FORMAT.string_customErrorMessage': NOT_SUPPORTED,
  'STRING_FORMAT.alpha': NOT_SUPPORTED,
  'STRING_FORMAT.alphaNumeric': NOT_SUPPORTED,
  'STRING_FORMAT.numeric': NOT_SUPPORTED,
  'STRING_FORMAT.alpha_withLength': NOT_SUPPORTED,
  'STRING_FORMAT.lowercase_validate': NOT_SUPPORTED,
  'STRING_FORMAT.uuidv4': NOT_SUPPORTED,
  'STRING_FORMAT.uuidv7': NOT_SUPPORTED,
  'STRING_FORMAT.date_iso': NOT_SUPPORTED,
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED,
  'STRING_FORMAT.date_YM': NOT_SUPPORTED,
  'STRING_FORMAT.date_MD': NOT_SUPPORTED,
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED,
  'STRING_FORMAT.time_iso': NOT_SUPPORTED,
  'STRING_FORMAT.time_HHmmss': NOT_SUPPORTED,
  'STRING_FORMAT.time_HHmmss_ms': NOT_SUPPORTED,
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED,
  'STRING_FORMAT.dateTime_default': NOT_SUPPORTED,
  'STRING_FORMAT.dateTime_custom': NOT_SUPPORTED,
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED,
  'STRING_FORMAT.ipv4': NOT_SUPPORTED,
  'STRING_FORMAT.ipv6': NOT_SUPPORTED,
  'STRING_FORMAT.ip_any': NOT_SUPPORTED,
  'STRING_FORMAT.ipv4_port': NOT_SUPPORTED,
  'STRING_FORMAT.ipv6_port': NOT_SUPPORTED,
  'STRING_FORMAT.domain': NOT_SUPPORTED,
  'STRING_FORMAT.domainStrict': NOT_SUPPORTED,
  'STRING_FORMAT.email': NOT_SUPPORTED,
  'STRING_FORMAT.emailPunycode': NOT_SUPPORTED,
  'STRING_FORMAT.emailStrict': NOT_SUPPORTED,
  'STRING_FORMAT.url': NOT_SUPPORTED,
  'STRING_FORMAT.urlHttp': NOT_SUPPORTED,
  'STRING_FORMAT.urlFile': NOT_SUPPORTED,
  'STRING_FORMAT.pattern_slug': NOT_SUPPORTED,
  'STRING_FORMAT.pattern_hex': NOT_SUPPORTED,

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_min': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_lt': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_gt': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_integer': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_float': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_multipleOf': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_combined': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_int8': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_uint8': NOT_SUPPORTED,

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_min': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_lt': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_gt': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_multipleOf': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_combined': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED,

  // ── DATETIME (format) ──
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
