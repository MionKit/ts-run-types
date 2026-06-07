// Zod validators keyed by suite case key ("GROUP.case"). Partial: any case
// absent here is treated as not-supported for zod. Schemas mirror the suite's
// TypeScript types; ts-go-run-types validates the serialisable projection
// (methods dropped, extra keys allowed), which zod's defaults match.

import {z, type ZodTypeAny} from 'zod';
import type {CompetitorMap} from '../types.ts';

const c = (s: ZodTypeAny) => (v: unknown) => s.safeParse(v).success;
const objA = z.object({a: z.string()});

export const zodMap: CompetitorMap = {
  // ── ATOMIC ──
  'ATOMIC.any': c(z.any()),
  'ATOMIC.unknown': c(z.unknown()),
  'ATOMIC.bigint': c(z.bigint()),
  'ATOMIC.boolean': c(z.boolean()),
  'ATOMIC.string': c(z.string()),
  'ATOMIC.number': c(z.number().finite()),
  'ATOMIC.null': c(z.null()),
  'ATOMIC.undefined': c(z.undefined()),
  'ATOMIC.void': c(z.void()),
  'ATOMIC.symbol': c(z.symbol()),
  'ATOMIC.never': c(z.never()),
  'ATOMIC.date': c(z.date()),
  'ATOMIC.regexp': c(z.instanceof(RegExp)),
  'ATOMIC.literal_2': c(z.literal(2)),
  'ATOMIC.literal_a': c(z.literal('a')),
  'ATOMIC.literal_true': c(z.literal(true)),
  'ATOMIC.literal_1n': c(z.literal(1n)),

  // ── ARRAY ──
  'ARRAY.string_array': c(z.array(z.string())),
  'ARRAY.number_array': c(z.array(z.number().finite())),
  'ARRAY.boolean_array': c(z.array(z.boolean())),
  'ARRAY.bigint_array': c(z.array(z.bigint())),
  'ARRAY.date_array': c(z.array(z.date())),
  'ARRAY.regexp_array': c(z.array(z.instanceof(RegExp))),
  'ARRAY.undefined_array': c(z.array(z.undefined())),
  'ARRAY.null_array': c(z.array(z.null())),
  'ARRAY.array_generic': c(z.array(z.string())),
  'ARRAY.string_array_2d': c(z.array(z.array(z.string()))),
  'ARRAY.string_array_3d': c(z.array(z.array(z.array(z.string())))),
  'ARRAY.object_array': c(z.array(objA)),
  'ARRAY.union_array': c(z.array(z.union([z.string(), z.number().finite()]))),
  'ARRAY.tuple_array': c(z.array(z.tuple([z.string(), z.number().finite()]))),
  'ARRAY.symbol_array': c(z.array(z.symbol())),
  'ARRAY.readonly_string_array': c(z.array(z.string())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': c(z.tuple([z.string(), z.number().finite()])),
  'TUPLE.full_mion_tuple': c(
    z.tuple([z.date(), z.number().finite(), z.string(), z.null(), z.array(z.string()), z.bigint()]),
  ),
  'TUPLE.nested_tuple_in_array': c(z.array(z.tuple([z.string(), z.number().finite()]))),
  'TUPLE.tuple_rest': c(z.tuple([z.number().finite()]).rest(z.string())),
  'TUPLE.tuple_named_labels': c(z.tuple([z.string(), z.number().finite()])),
  'TUPLE.empty_tuple': c(z.tuple([])),
  'TUPLE.single_element_tuple': c(z.tuple([z.string()])),
  'TUPLE.readonly_tuple': c(z.tuple([z.string(), z.number().finite()])),

  // ── UNION ──
  'UNION.atomic_union': c(z.union([z.date(), z.number().finite(), z.string(), z.null(), z.bigint()])),
  'UNION.string_literal_union': c(z.enum(['UNO', 'DOS', 'TRES'])),
  'UNION.string_or_number': c(z.union([z.string(), z.number().finite()])),
  'UNION.union_of_array_types': c(
    z.union([z.array(z.string()), z.array(z.number().finite()), z.array(z.boolean())]),
  ),
  'UNION.array_of_union': c(z.array(z.union([z.string(), z.bigint(), z.boolean(), z.date()]))),
  'UNION.union_of_object_shapes': c(
    z.union([
      z.object({a: z.string(), aa: z.boolean()}),
      z.object({b: z.number().finite()}),
      z.object({c: z.bigint()}),
    ]),
  ),
  'UNION.discriminated_union': c(
    z.union([
      z.object({kind: z.literal('a'), n: z.number().finite()}),
      z.object({kind: z.literal('b'), s: z.string()}),
    ]),
  ),
  'UNION.union_merged_property': c(
    z.union([z.object({a: z.boolean()}), z.object({a: z.number().finite()})]),
  ),
  'UNION.union_same_prop_different_types': c(
    z.union([
      z.object({type: z.literal('a'), prop: z.boolean()}),
      z.object({type: z.literal('b'), prop: z.number().finite()}),
      z.object({type: z.literal('c'), prop: z.string()}),
    ]),
  ),
  'UNION.intersection_to_object': c(z.object({a: z.string(), b: z.number().finite()})),
  'UNION.union_with_any_fallback': c(z.any()),
  'UNION.union_with_unknown_fallback': c(z.unknown()),

  // ── OBJECT ──
  'OBJECT.simple_interface': c(z.object({a: z.string(), b: z.number().finite()})),
  'OBJECT.object_as_const_literals': c(z.object({name: z.literal('john'), age: z.literal(30)})),
  'OBJECT.object_via_property_access': c(z.object({id: z.number().finite(), name: z.string()})),
  'OBJECT.object_via_array_access': c(z.object({id: z.number().finite(), name: z.string()})),
  'OBJECT.interface_with_optional': c(z.object({a: z.string(), b: z.number().finite().optional()})),
  'OBJECT.interface_with_date': c(z.object({date: z.date(), name: z.string()})),
  'OBJECT.interface_with_method': c(z.object({name: z.string()})),
  'OBJECT.nested_object': c(
    z.object({a: z.string(), deep: z.object({b: z.string(), c: z.number().finite()})}),
  ),
  'OBJECT.interface_string_array_prop': c(z.object({tags: z.array(z.string())})),
  'OBJECT.index_signature_string': c(z.record(z.string(), z.string())),
  'OBJECT.index_signature_nested': c(z.record(z.string(), z.record(z.string(), z.number().finite()))),
  'OBJECT.index_signature_date_value': c(z.record(z.string(), z.record(z.string(), z.date()))),
  // interface_all_optional: ts-go's all-optional guard rejects RegExp/Date/etc.
  // at the root; zod accepts a RegExp as a {a?,b?} object — not-supported.
  'OBJECT.record_union_keys': c(z.object({a: z.number().finite(), b: z.number().finite()})),
  'OBJECT.union_value_index': c(z.record(z.union([z.string(), z.number().finite()]))),
  'OBJECT.object_with_union_prop': c(
    z.object({kind: z.union([z.literal('a'), z.literal('b')]), n: z.number().finite()}),
  ),

  // ── NATIVE ──
  'NATIVE.map_string_number': c(z.map(z.string(), z.number().finite())),
  'NATIVE.set_string': c(z.set(z.string())),
  'NATIVE.awaited_promise': c(z.string()),

  // ── DATETIME (validation) ──
  'DATETIME.date': c(z.date()),
};
