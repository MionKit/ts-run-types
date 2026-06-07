// TypeBox validators keyed by suite case key ("GROUP.case"). Partial: any case
// absent is treated as not-supported. Schemas are compiled to optimized check
// functions. TypeBox can't express bigint literals, RegExp, Map/Set, Promise or
// Temporal, so those cases are absent (not-supported).

import {Type, type TSchema} from '@sinclair/typebox';
import {TypeCompiler} from '@sinclair/typebox/compiler';
import type {CompetitorMap} from '../types.ts';

const c = (s: TSchema) => {
  const checker = TypeCompiler.Compile(s);
  return (v: unknown) => checker.Check(v);
};

const objA = Type.Object({a: Type.String()});

export const typeboxMap: CompetitorMap = {
  // ── ATOMIC ──
  'ATOMIC.any': c(Type.Any()),
  'ATOMIC.unknown': c(Type.Unknown()),
  'ATOMIC.bigint': c(Type.BigInt()),
  'ATOMIC.boolean': c(Type.Boolean()),
  'ATOMIC.string': c(Type.String()),
  'ATOMIC.number': c(Type.Number()),
  'ATOMIC.null': c(Type.Null()),
  'ATOMIC.undefined': c(Type.Undefined()),
  'ATOMIC.never': c(Type.Never()),
  'ATOMIC.date': c(Type.Date()),
  'ATOMIC.literal_2': c(Type.Literal(2)),
  'ATOMIC.literal_a': c(Type.Literal('a')),
  'ATOMIC.literal_true': c(Type.Literal(true)),

  // ── ARRAY ──
  'ARRAY.string_array': c(Type.Array(Type.String())),
  'ARRAY.number_array': c(Type.Array(Type.Number())),
  'ARRAY.boolean_array': c(Type.Array(Type.Boolean())),
  'ARRAY.bigint_array': c(Type.Array(Type.BigInt())),
  'ARRAY.date_array': c(Type.Array(Type.Date())),
  'ARRAY.undefined_array': c(Type.Array(Type.Undefined())),
  'ARRAY.null_array': c(Type.Array(Type.Null())),
  'ARRAY.array_generic': c(Type.Array(Type.String())),
  'ARRAY.string_array_2d': c(Type.Array(Type.Array(Type.String()))),
  'ARRAY.string_array_3d': c(Type.Array(Type.Array(Type.Array(Type.String())))),
  'ARRAY.object_array': c(Type.Array(objA)),
  'ARRAY.union_array': c(Type.Array(Type.Union([Type.String(), Type.Number()]))),
  'ARRAY.tuple_array': c(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
  'ARRAY.readonly_string_array': c(Type.Array(Type.String())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': c(Type.Tuple([Type.String(), Type.Number()])),
  'TUPLE.full_mion_tuple': c(
    Type.Tuple([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt()]),
  ),
  'TUPLE.nested_tuple_in_array': c(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
  'TUPLE.tuple_named_labels': c(Type.Tuple([Type.String(), Type.Number()])),
  'TUPLE.empty_tuple': c(Type.Tuple([])),
  'TUPLE.single_element_tuple': c(Type.Tuple([Type.String()])),
  'TUPLE.readonly_tuple': c(Type.Tuple([Type.String(), Type.Number()])),

  // ── UNION ──
  'UNION.atomic_union': c(
    Type.Union([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.BigInt()]),
  ),
  'UNION.string_literal_union': c(
    Type.Union([Type.Literal('UNO'), Type.Literal('DOS'), Type.Literal('TRES')]),
  ),
  'UNION.string_or_number': c(Type.Union([Type.String(), Type.Number()])),
  'UNION.union_of_array_types': c(
    Type.Union([Type.Array(Type.String()), Type.Array(Type.Number()), Type.Array(Type.Boolean())]),
  ),
  'UNION.array_of_union': c(
    Type.Array(Type.Union([Type.String(), Type.BigInt(), Type.Boolean(), Type.Date()])),
  ),
  'UNION.union_of_object_shapes': c(
    Type.Union([
      Type.Object({a: Type.String(), aa: Type.Boolean()}),
      Type.Object({b: Type.Number()}),
      Type.Object({c: Type.BigInt()}),
    ]),
  ),
  'UNION.discriminated_union': c(
    Type.Union([
      Type.Object({kind: Type.Literal('a'), n: Type.Number()}),
      Type.Object({kind: Type.Literal('b'), s: Type.String()}),
    ]),
  ),
  'UNION.union_same_prop_different_types': c(
    Type.Union([
      Type.Object({type: Type.Literal('a'), prop: Type.Boolean()}),
      Type.Object({type: Type.Literal('b'), prop: Type.Number()}),
      Type.Object({type: Type.Literal('c'), prop: Type.String()}),
    ]),
  ),
  'UNION.intersection_to_object': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'UNION.union_with_any_fallback': c(Type.Any()),
  'UNION.union_with_unknown_fallback': c(Type.Unknown()),

  // ── OBJECT ──
  'OBJECT.simple_interface': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'OBJECT.object_as_const_literals': c(Type.Object({name: Type.Literal('john'), age: Type.Literal(30)})),
  'OBJECT.object_via_property_access': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.object_via_array_access': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.interface_with_optional': c(Type.Object({a: Type.String(), b: Type.Optional(Type.Number())})),
  'OBJECT.interface_with_date': c(Type.Object({date: Type.Date(), name: Type.String()})),
  'OBJECT.interface_with_method': c(Type.Object({name: Type.String()})),
  'OBJECT.nested_object': c(
    Type.Object({a: Type.String(), deep: Type.Object({b: Type.String(), c: Type.Number()})}),
  ),
  'OBJECT.interface_string_array_prop': c(Type.Object({tags: Type.Array(Type.String())})),
  'OBJECT.index_signature_string': c(Type.Record(Type.String(), Type.String())),
  'OBJECT.index_signature_nested': c(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Number())),
  ),
  'OBJECT.index_signature_date_value': c(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Date())),
  ),
  'OBJECT.record_union_keys': c(Type.Object({a: Type.Number(), b: Type.Number()})),
  'OBJECT.union_value_index': c(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
  'OBJECT.object_with_union_prop': c(
    Type.Object({kind: Type.Union([Type.Literal('a'), Type.Literal('b')]), n: Type.Number()}),
  ),

  // ── NATIVE ──
  'NATIVE.awaited_promise': c(Type.String()),

  // ── DATETIME (validation) ──
  'DATETIME.date': c(Type.Date()),
};

// ── NUMBER_FORMAT (TypeBox can't express "not integer", so number_float is NS) ──
Object.assign(typeboxMap, {
  'NUMBER_FORMAT.number_max': c(Type.Number({maximum: 100})),
  'NUMBER_FORMAT.number_min': c(Type.Number({minimum: 0})),
  'NUMBER_FORMAT.number_lt': c(Type.Number({exclusiveMaximum: 10})),
  'NUMBER_FORMAT.number_gt': c(Type.Number({exclusiveMinimum: 0})),
  'NUMBER_FORMAT.number_integer': c(Type.Integer()),
  'NUMBER_FORMAT.number_multipleOf': c(Type.Number({multipleOf: 5})),
  'NUMBER_FORMAT.number_combined': c(Type.Integer({minimum: 0, maximum: 100, multipleOf: 5})),
  'NUMBER_FORMAT.number_int8': c(Type.Integer({minimum: -128, maximum: 127})),
  'NUMBER_FORMAT.number_uint8': c(Type.Integer({minimum: 0, maximum: 255})),
});

// ── STRING_FORMAT (pattern has no case-insensitive flag, so ignoreCase /
//    disallowedValues cases stay not-supported) ──
const UUID4 = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const UUID7 = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
Object.assign(typeboxMap, {
  'STRING_FORMAT.string_maxLength': c(Type.String({maxLength: 5})),
  'STRING_FORMAT.string_minLength': c(Type.String({minLength: 3})),
  'STRING_FORMAT.string_length': c(Type.String({minLength: 4, maxLength: 4})),
  'STRING_FORMAT.string_range': c(Type.String({minLength: 2, maxLength: 4})),
  'STRING_FORMAT.string_allowedChars': c(Type.String({pattern: '^[0-9a-f]+$'})),
  'STRING_FORMAT.string_allowedChars_literal': c(Type.String({pattern: '^[.\\-]+$'})),
  'STRING_FORMAT.string_disallowedChars': c(Type.String({pattern: '^[^!@#]*$'})),
  'STRING_FORMAT.string_allowedValues': c(
    Type.Union([Type.Literal('red'), Type.Literal('green'), Type.Literal('blue')]),
  ),
  'STRING_FORMAT.string_allowedValues_escaped': c(Type.Union([Type.Literal('a.b'), Type.Literal('c+d')])),
  'STRING_FORMAT.string_customErrorMessage': c(Type.Union([Type.Literal('a'), Type.Literal('b')])),
  'STRING_FORMAT.alpha': c(Type.String({pattern: '^[A-Za-z]+$'})),
  'STRING_FORMAT.alphaNumeric': c(Type.String({pattern: '^[A-Za-z0-9]+$'})),
  'STRING_FORMAT.numeric': c(Type.String({pattern: '^[0-9]+$'})),
  'STRING_FORMAT.alpha_withLength': c(Type.String({pattern: '^[A-Za-z]+$', maxLength: 3})),
  'STRING_FORMAT.lowercase_validate': c(Type.String()),
  'STRING_FORMAT.uuidv4': c(Type.String({pattern: UUID4})),
  'STRING_FORMAT.uuidv7': c(Type.String({pattern: UUID7})),
  'STRING_FORMAT.pattern_slug': c(Type.String({pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'})),
  'STRING_FORMAT.pattern_hex': c(Type.String({pattern: '^[0-9a-fA-F]+$'})),
});

// ── REAL-WORLD DTOs ──
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
  dimensions: Type.Optional(
    Type.Object({width: Type.Number(), height: Type.Number(), depth: Type.Number()}),
  ),
});
Object.assign(typeboxMap, {
  'REALWORLD.user': c(
    Type.Object({
      id: Type.Number(),
      email: Type.String(),
      name: Type.String(),
      age: Type.Optional(Type.Number()),
      roles: Type.Array(Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('user')])),
      active: Type.Boolean(),
      createdAt: Type.String(),
    }),
  ),
  'REALWORLD.order': c(
    Type.Object({
      id: Type.String(),
      customer: Type.Object({id: Type.Number(), email: Type.String()}),
      items: Type.Array(
        Type.Object({sku: Type.String(), name: Type.String(), qty: Type.Number(), price: Type.Number()}),
      ),
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
    }),
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
    }),
  ),
  'REALWORLD.product': c(productTB),
  'REALWORLD.productPage': c(
    Type.Object({
      data: Type.Array(productTB),
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
      hasMore: Type.Boolean(),
    }),
  ),
  'REALWORLD.registrationForm': c(
    Type.Object({
      email: Type.String(),
      password: Type.String(),
      acceptedTerms: Type.Literal(true),
      profile: Type.Object({firstName: Type.String(), lastName: Type.String(), age: Type.Optional(Type.Number())}),
    }),
  ),
});
