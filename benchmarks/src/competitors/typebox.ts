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
