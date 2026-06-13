// TypeBox validators keyed by suite case key ("GROUP.case"). TOTAL map over every
// shared case key: supported cases compile a TypeBox schema; the rest opt out with
// NOT_SUPPORTED. TypeBox can't express bigint literals/ranges, RegExp, Map/Set,
// Promise, Temporal, symbols, circular references, most TS utility/mapped types,
// template literals or the ignore-case/disallowed string formats — those are NS.

import {Type, type TSchema} from '@sinclair/typebox';
import {TypeCompiler} from '@sinclair/typebox/compiler';
import {NOT_SUPPORTED, type CompetitorCases, type Validator} from '../../shared/harness/types.ts';

// LAZY builder: schema build + compile happen inside the () => (compile is costly).
const c = (s: TSchema): (() => Validator) => () => {
  const check = TypeCompiler.Compile(s);
  return (v) => check.Check(v);
};

const objA = Type.Object({a: Type.String()});

const UUID4 = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const UUID7 = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

const addressTB = Type.Object({
  street: Type.String(),
  city: Type.String(),
  state: Type.String(),
  zip: Type.String(),
  country: Type.String(),
});
const productTB = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  price: Type.Number(),
  currency: Type.Union([Type.Literal('USD'), Type.Literal('EUR'), Type.Literal('GBP')]),
  inStock: Type.Boolean(),
  categories: Type.Array(Type.String()),
  dimensions: Type.Optional(Type.Object({width: Type.Number(), height: Type.Number(), depth: Type.Number()})),
});

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': c(Type.Any()),
  'ATOMIC.bigint': c(Type.BigInt()),
  'ATOMIC.boolean': c(Type.Boolean()),
  'ATOMIC.date': c(Type.Date()),
  'ATOMIC.enum_mixed': NOT_SUPPORTED,
  'ATOMIC.literal_2': c(Type.Literal(2)),
  'ATOMIC.literal_a': c(Type.Literal('a')),
  'ATOMIC.literal_true': c(Type.Literal(true)),
  'ATOMIC.literal_1n': NOT_SUPPORTED,
  'ATOMIC.literal_symbol': NOT_SUPPORTED,
  'ATOMIC.never': c(Type.Never()),
  'ATOMIC.null': c(Type.Null()),
  'ATOMIC.number': c(Type.Number()),
  'ATOMIC.object': NOT_SUPPORTED,
  'ATOMIC.regexp': NOT_SUPPORTED,
  'ATOMIC.string': c(Type.String()),
  'ATOMIC.symbol': NOT_SUPPORTED,
  'ATOMIC.undefined': c(Type.Undefined()),
  'ATOMIC.void': NOT_SUPPORTED,
  'ATOMIC.literal_2_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_a_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_regexp_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_true_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_1n_noLiterals': NOT_SUPPORTED,
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED,
  'ATOMIC.unknown': c(Type.Unknown()),

  // ── ARRAY ──
  'ARRAY.string_array': c(Type.Array(Type.String())),
  'ARRAY.number_array': c(Type.Array(Type.Number())),
  'ARRAY.boolean_array': c(Type.Array(Type.Boolean())),
  'ARRAY.bigint_array': c(Type.Array(Type.BigInt())),
  'ARRAY.date_array': c(Type.Array(Type.Date())),
  'ARRAY.regexp_array': NOT_SUPPORTED,
  'ARRAY.undefined_array': c(Type.Array(Type.Undefined())),
  'ARRAY.null_array': c(Type.Array(Type.Null())),
  'ARRAY.array_generic': c(Type.Array(Type.String())),
  'ARRAY.string_array_2d': c(Type.Array(Type.Array(Type.String()))),
  'ARRAY.string_array_3d': c(Type.Array(Type.Array(Type.Array(Type.String())))),
  'ARRAY.string_array_noIsArrayCheck': NOT_SUPPORTED,
  'ARRAY.object_array': c(Type.Array(objA)),
  'ARRAY.union_array': c(Type.Array(Type.Union([Type.String(), Type.Number()]))),
  'ARRAY.tuple_array': c(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
  'ARRAY.circular_array': NOT_SUPPORTED,
  'ARRAY.circular_object_with_array': NOT_SUPPORTED,
  'ARRAY.symbol_array': NOT_SUPPORTED,
  'ARRAY.readonly_string_array': c(Type.Array(Type.String())),

  // ── OBJECT ──
  'OBJECT.simple_interface': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'OBJECT.object_as_const_literals': c(Type.Object({name: Type.Literal('john'), age: Type.Literal(30)})),
  'OBJECT.object_via_return_type_utility': NOT_SUPPORTED,
  'OBJECT.object_via_property_access': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.object_via_array_access': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.interface_with_optional': c(Type.Object({a: Type.String(), b: Type.Optional(Type.Number())})),
  'OBJECT.interface_with_date': c(Type.Object({date: Type.Date(), name: Type.String()})),
  'OBJECT.interface_with_method': c(Type.Object({name: Type.String()})),
  'OBJECT.nested_object': c(Type.Object({a: Type.String(), deep: Type.Object({b: Type.String(), c: Type.Number()})})),
  'OBJECT.interface_string_array_prop': c(Type.Object({tags: Type.Array(Type.String())})),
  'OBJECT.circular_interface': NOT_SUPPORTED,
  'OBJECT.circular_interface_on_array': NOT_SUPPORTED,
  'OBJECT.circular_interface_on_nested_object': NOT_SUPPORTED,
  'OBJECT.index_signature_string': c(Type.Record(Type.String(), Type.String())),
  'OBJECT.index_signature_named_props': NOT_SUPPORTED,
  'OBJECT.index_signature_nested': c(Type.Record(Type.String(), Type.Record(Type.String(), Type.Number()))),
  'OBJECT.index_signature_date_value': c(Type.Record(Type.String(), Type.Record(Type.String(), Type.Date()))),
  'OBJECT.index_signature_non_root': NOT_SUPPORTED,
  'OBJECT.function_top_level': NOT_SUPPORTED,
  'OBJECT.interface_callable': NOT_SUPPORTED,
  'OBJECT.interface_all_optional': NOT_SUPPORTED,
  'OBJECT.class_simple': NOT_SUPPORTED,
  'OBJECT.rpc_error_class': NOT_SUPPORTED,
  'OBJECT.call_signature_params': NOT_SUPPORTED,
  'OBJECT.call_signature_params_with_optional': NOT_SUPPORTED,
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED,
  'OBJECT.record_union_keys': c(Type.Object({a: Type.Number(), b: Type.Number()})),
  'OBJECT.union_value_index': c(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
  'OBJECT.object_with_union_prop': c(Type.Object({kind: Type.Union([Type.Literal('a'), Type.Literal('b')]), n: Type.Number()})),
  'OBJECT.interface_inheritance': NOT_SUPPORTED,
  'OBJECT.class_inheritance': NOT_SUPPORTED,
  'OBJECT.index_signature_number_key': NOT_SUPPORTED,

  // ── TUPLE ──
  'TUPLE.string_number_pair': c(Type.Tuple([Type.String(), Type.Number()])),
  'TUPLE.full_mion_tuple': c(
    Type.Tuple([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt()])
  ),
  'TUPLE.tuple_with_optional': NOT_SUPPORTED,
  'TUPLE.nested_tuple_in_array': c(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
  'TUPLE.tuple_rest': NOT_SUPPORTED,
  'TUPLE.tuple_circular': NOT_SUPPORTED,
  'TUPLE.tuple_multiple_trailing_optionals': NOT_SUPPORTED,
  'TUPLE.tuple_named_labels': c(Type.Tuple([Type.String(), Type.Number()])),
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED,
  'TUPLE.empty_tuple': c(Type.Tuple([])),
  'TUPLE.single_element_tuple': c(Type.Tuple([Type.String()])),
  'TUPLE.readonly_tuple': c(Type.Tuple([Type.String(), Type.Number()])),

  // ── UNION ──
  'UNION.atomic_union': c(Type.Union([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.BigInt()])),
  'UNION.string_literal_union': c(Type.Union([Type.Literal('UNO'), Type.Literal('DOS'), Type.Literal('TRES')])),
  'UNION.large_union_eight_arms': NOT_SUPPORTED,
  'UNION.string_or_number': c(Type.Union([Type.String(), Type.Number()])),
  'UNION.union_of_array_types': c(Type.Union([Type.Array(Type.String()), Type.Array(Type.Number()), Type.Array(Type.Boolean())])),
  'UNION.array_of_union': c(Type.Array(Type.Union([Type.String(), Type.BigInt(), Type.Boolean(), Type.Date()]))),
  'UNION.union_of_object_shapes': c(
    Type.Union([
      Type.Object({a: Type.String(), aa: Type.Boolean()}),
      Type.Object({b: Type.Number()}),
      Type.Object({c: Type.BigInt()}),
    ])
  ),
  'UNION.discriminated_union': c(
    Type.Union([
      Type.Object({kind: Type.Literal('a'), n: Type.Number()}),
      Type.Object({kind: Type.Literal('b'), s: Type.String()}),
    ])
  ),
  'UNION.circular_union': NOT_SUPPORTED,
  'UNION.union_with_methods': NOT_SUPPORTED,
  'UNION.intersection_to_object': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'UNION.union_with_index_arm': NOT_SUPPORTED,
  'UNION.union_same_prop_different_types': c(
    Type.Union([
      Type.Object({type: Type.Literal('a'), prop: Type.Boolean()}),
      Type.Object({type: Type.Literal('b'), prop: Type.Number()}),
      Type.Object({type: Type.Literal('c'), prop: Type.String()}),
    ])
  ),
  'UNION.union_mixed_arrays_and_objects': NOT_SUPPORTED,
  'UNION.union_merged_property': NOT_SUPPORTED,
  'UNION.union_mixed_with_index': NOT_SUPPORTED,
  'UNION.union_with_any_fallback': c(Type.Any()),
  'UNION.union_with_unknown_fallback': c(Type.Unknown()),
  'UNION.union_subset_small_first': NOT_SUPPORTED,
  'UNION.union_subset_nested_levels': NOT_SUPPORTED,
  'UNION.union_subset_mixed_related_unrelated': NOT_SUPPORTED,

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.multi_segment_url': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.leading_string_placeholder': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.regex_special_chars': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.template_literal_nested_in_object': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.template_literal_index_key': NOT_SUPPORTED,
  'TEMPLATE_LITERAL.template_literal_union_placeholder': NOT_SUPPORTED,

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED,
  'NATIVE.set_string': NOT_SUPPORTED,
  'NATIVE.promise_string': NOT_SUPPORTED,
  'NATIVE.awaited_promise': c(Type.String()),

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
  'DATETIME.date': c(Type.Date()),
  'DATETIME.instant': NOT_SUPPORTED,
  'DATETIME.zonedDateTime': NOT_SUPPORTED,
  'DATETIME.plainDate': NOT_SUPPORTED,
  'DATETIME.plainTime': NOT_SUPPORTED,
  'DATETIME.plainDateTime': NOT_SUPPORTED,
  'DATETIME.plainYearMonth': NOT_SUPPORTED,
  'DATETIME.plainMonthDay': NOT_SUPPORTED,
  'DATETIME.duration': NOT_SUPPORTED,

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': c(Type.String({maxLength: 5})),
  'STRING_FORMAT.string_minLength': c(Type.String({minLength: 3})),
  'STRING_FORMAT.string_length': c(Type.String({minLength: 4, maxLength: 4})),
  'STRING_FORMAT.string_range': c(Type.String({minLength: 2, maxLength: 4})),
  'STRING_FORMAT.string_allowedChars': c(Type.String({pattern: '^[0-9a-f]+$'})),
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedChars_literal': c(Type.String({pattern: '^[.\\-]+$'})),
  'STRING_FORMAT.string_disallowedChars': c(Type.String({pattern: '^[^!@#]*$'})),
  'STRING_FORMAT.string_allowedValues': c(Type.Union([Type.Literal('red'), Type.Literal('green'), Type.Literal('blue')])),
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED,
  'STRING_FORMAT.string_allowedValues_escaped': c(Type.Union([Type.Literal('a.b'), Type.Literal('c+d')])),
  'STRING_FORMAT.string_disallowedValues': NOT_SUPPORTED,
  'STRING_FORMAT.string_customErrorMessage': c(Type.Union([Type.Literal('a'), Type.Literal('b')])),
  'STRING_FORMAT.alpha': c(Type.String({pattern: '^[A-Za-z]+$'})),
  'STRING_FORMAT.alphaNumeric': c(Type.String({pattern: '^[A-Za-z0-9]+$'})),
  'STRING_FORMAT.numeric': c(Type.String({pattern: '^[0-9]+$'})),
  'STRING_FORMAT.alpha_withLength': c(Type.String({pattern: '^[A-Za-z]+$', maxLength: 3})),
  'STRING_FORMAT.lowercase_validate': c(Type.String()),
  'STRING_FORMAT.uuidv4': c(Type.String({pattern: UUID4})),
  'STRING_FORMAT.uuidv7': c(Type.String({pattern: UUID7})),
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
  'STRING_FORMAT.pattern_slug': c(Type.String({pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'})),
  'STRING_FORMAT.pattern_hex': c(Type.String({pattern: '^[0-9a-fA-F]+$'})),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': c(Type.Number({maximum: 100})),
  'NUMBER_FORMAT.number_min': c(Type.Number({minimum: 0})),
  'NUMBER_FORMAT.number_lt': c(Type.Number({exclusiveMaximum: 10})),
  'NUMBER_FORMAT.number_gt': c(Type.Number({exclusiveMinimum: 0})),
  'NUMBER_FORMAT.number_integer': c(Type.Integer()),
  'NUMBER_FORMAT.number_float': NOT_SUPPORTED,
  'NUMBER_FORMAT.number_multipleOf': c(Type.Number({multipleOf: 5})),
  'NUMBER_FORMAT.number_combined': c(Type.Integer({minimum: 0, maximum: 100, multipleOf: 5})),
  'NUMBER_FORMAT.number_int8': c(Type.Integer({minimum: -128, maximum: 127})),
  'NUMBER_FORMAT.number_uint8': c(Type.Integer({minimum: 0, maximum: 255})),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_min': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_lt': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_gt': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_multipleOf': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_combined': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED,
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED,

  // ── DATETIME (min/max + relative) ──
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
  'REALWORLD.user': c(
    Type.Object({
      id: Type.Number(),
      email: Type.String(),
      name: Type.String(),
      age: Type.Optional(Type.Number()),
      roles: Type.Array(Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('user')])),
      active: Type.Boolean(),
      createdAt: Type.String(),
    })
  ),
  'REALWORLD.order': c(
    Type.Object({
      id: Type.String(),
      customer: Type.Object({id: Type.Number(), email: Type.String()}),
      items: Type.Array(Type.Object({sku: Type.String(), name: Type.String(), qty: Type.Number(), price: Type.Number()})),
      shipping: addressTB,
      status: Type.Union([
        Type.Literal('pending'),
        Type.Literal('paid'),
        Type.Literal('shipped'),
        Type.Literal('delivered'),
        Type.Literal('cancelled'),
      ]),
      total: Type.Number(),
      note: Type.Optional(Type.String()),
    })
  ),
  'REALWORLD.blogPost': c(
    Type.Object({
      id: Type.Number(),
      title: Type.String(),
      slug: Type.String(),
      body: Type.String(),
      tags: Type.Array(Type.String()),
      author: Type.Object({name: Type.String(), email: Type.String()}),
      published: Type.Boolean(),
      publishedAt: Type.Optional(Type.String()),
      meta: Type.Object({views: Type.Number(), likes: Type.Number()}),
    })
  ),
  'REALWORLD.product': c(productTB),
  'REALWORLD.productPage': c(
    Type.Object({
      data: Type.Array(productTB),
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
      hasMore: Type.Boolean(),
    })
  ),
  'REALWORLD.registrationForm': c(
    Type.Object({
      email: Type.String(),
      password: Type.String(),
      acceptedTerms: Type.Literal(true),
      profile: Type.Object({firstName: Type.String(), lastName: Type.String(), age: Type.Optional(Type.Number())}),
    })
  ),
};
