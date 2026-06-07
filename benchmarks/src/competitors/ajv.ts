// AJV validators keyed by suite case key ("GROUP.case"). Partial: any case
// absent is treated as not-supported. JSON Schema has no bigint / Date / RegExp
// / symbol / undefined / Map / Set / Promise / Temporal, so those cases are
// absent (not-supported).

import Ajv, {type SchemaObject} from 'ajv';
import type {CompetitorMap} from '../types.ts';

const ajv = new Ajv({strict: false, allowUnionTypes: true});
const c = (schema: SchemaObject) => {
  const v = ajv.compile(schema);
  return (value: unknown) => v(value) as boolean;
};

const objA: SchemaObject = {type: 'object', properties: {a: {type: 'string'}}, required: ['a']};

export const ajvMap: CompetitorMap = {
  // ── ATOMIC ──
  'ATOMIC.any': c({}),
  'ATOMIC.unknown': c({}),
  'ATOMIC.boolean': c({type: 'boolean'}),
  'ATOMIC.string': c({type: 'string'}),
  'ATOMIC.number': c({type: 'number'}),
  'ATOMIC.null': c({type: 'null'}),
  'ATOMIC.literal_2': c({const: 2}),
  'ATOMIC.literal_a': c({const: 'a'}),
  'ATOMIC.literal_true': c({const: true}),

  // ── ARRAY ──
  'ARRAY.string_array': c({type: 'array', items: {type: 'string'}}),
  'ARRAY.number_array': c({type: 'array', items: {type: 'number'}}),
  'ARRAY.boolean_array': c({type: 'array', items: {type: 'boolean'}}),
  'ARRAY.null_array': c({type: 'array', items: {type: 'null'}}),
  'ARRAY.array_generic': c({type: 'array', items: {type: 'string'}}),
  'ARRAY.string_array_2d': c({type: 'array', items: {type: 'array', items: {type: 'string'}}}),
  'ARRAY.string_array_3d': c({
    type: 'array',
    items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
  }),
  'ARRAY.object_array': c({type: 'array', items: objA}),
  'ARRAY.union_array': c({type: 'array', items: {type: ['string', 'number']}}),
  'ARRAY.tuple_array': c({
    type: 'array',
    items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
  }),
  'ARRAY.readonly_string_array': c({type: 'array', items: {type: 'string'}}),

  // ── TUPLE ──
  'TUPLE.string_number_pair': c({
    type: 'array',
    items: [{type: 'string'}, {type: 'number'}],
    minItems: 2,
    maxItems: 2,
  }),
  'TUPLE.nested_tuple_in_array': c({
    type: 'array',
    items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
  }),
  'TUPLE.tuple_named_labels': c({
    type: 'array',
    items: [{type: 'string'}, {type: 'number'}],
    minItems: 2,
    maxItems: 2,
  }),
  'TUPLE.empty_tuple': c({type: 'array', maxItems: 0}),
  'TUPLE.single_element_tuple': c({type: 'array', items: [{type: 'string'}], minItems: 1, maxItems: 1}),
  'TUPLE.readonly_tuple': c({
    type: 'array',
    items: [{type: 'string'}, {type: 'number'}],
    minItems: 2,
    maxItems: 2,
  }),

  // ── UNION ──
  'UNION.string_literal_union': c({enum: ['UNO', 'DOS', 'TRES']}),
  'UNION.string_or_number': c({type: ['string', 'number']}),
  'UNION.union_of_array_types': c({
    anyOf: [
      {type: 'array', items: {type: 'string'}},
      {type: 'array', items: {type: 'number'}},
      {type: 'array', items: {type: 'boolean'}},
    ],
  }),
  'UNION.discriminated_union': c({
    anyOf: [
      {type: 'object', properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
      {type: 'object', properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
    ],
  }),
  'UNION.union_same_prop_different_types': c({
    anyOf: [
      {type: 'object', properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
      {type: 'object', properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
      {type: 'object', properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
    ],
  }),
  'UNION.union_merged_property': c({
    anyOf: [
      {type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']},
      {type: 'object', properties: {a: {type: 'number'}}, required: ['a']},
    ],
  }),
  'UNION.intersection_to_object': c({
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a', 'b'],
  }),
  'UNION.union_with_any_fallback': c({}),
  'UNION.union_with_unknown_fallback': c({}),

  // ── OBJECT ──
  'OBJECT.simple_interface': c({
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a', 'b'],
  }),
  'OBJECT.object_as_const_literals': c({
    type: 'object',
    properties: {name: {const: 'john'}, age: {const: 30}},
    required: ['name', 'age'],
  }),
  'OBJECT.object_via_property_access': c({
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}},
    required: ['id', 'name'],
  }),
  'OBJECT.object_via_array_access': c({
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}},
    required: ['id', 'name'],
  }),
  'OBJECT.interface_with_optional': c({
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a'],
  }),
  'OBJECT.interface_with_method': c({type: 'object', properties: {name: {type: 'string'}}, required: ['name']}),
  'OBJECT.nested_object': c({
    type: 'object',
    properties: {
      a: {type: 'string'},
      deep: {type: 'object', properties: {b: {type: 'string'}, c: {type: 'number'}}, required: ['b', 'c']},
    },
    required: ['a', 'deep'],
  }),
  'OBJECT.interface_string_array_prop': c({
    type: 'object',
    properties: {tags: {type: 'array', items: {type: 'string'}}},
    required: ['tags'],
  }),
  'OBJECT.index_signature_string': c({type: 'object', additionalProperties: {type: 'string'}}),
  'OBJECT.index_signature_nested': c({
    type: 'object',
    additionalProperties: {type: 'object', additionalProperties: {type: 'number'}},
  }),
  'OBJECT.record_union_keys': c({
    type: 'object',
    properties: {a: {type: 'number'}, b: {type: 'number'}},
    required: ['a', 'b'],
  }),
  'OBJECT.union_value_index': c({type: 'object', additionalProperties: {type: ['string', 'number']}}),
  'OBJECT.object_with_union_prop': c({
    type: 'object',
    properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
    required: ['kind', 'n'],
  }),

  // ── NATIVE ──
  'NATIVE.awaited_promise': c({type: 'string'}),
};

// ts-go-run-types rejects NaN / Infinity for `number` (a typeof+finite gate);
// JSON Schema's `number` type accepts them (they can't occur in real JSON
// anyway, so ajv has no keyword to exclude them). Every number-bearing case
// whose invalid samples include NaN/Infinity therefore diverges → mark it
// not-supported for ajv rather than report a spurious mismatch.
for (const k of [
  'ATOMIC.number',
  'ARRAY.number_array',
  'ARRAY.union_array',
  'OBJECT.simple_interface',
  'OBJECT.interface_with_optional',
  'OBJECT.nested_object',
  'OBJECT.index_signature_nested',
  'OBJECT.record_union_keys',
  'OBJECT.union_value_index',
  'OBJECT.object_with_union_prop',
  'TUPLE.string_number_pair',
  'TUPLE.nested_tuple_in_array',
  'TUPLE.tuple_named_labels',
  'UNION.string_or_number',
  'UNION.union_of_array_types',
  'UNION.discriminated_union',
  'UNION.intersection_to_object',
  'UNION.union_merged_property',
]) {
  delete ajvMap[k];
}
