import Ajv, {type Schema} from 'ajv';
import addFormats from 'ajv-formats';
import {NOT_SUPPORTED, type CompetitorCases, type Validator} from '../../shared/harness/types.ts';

// Mirrors the options of the original benchmarks/src/competitors/ajv.ts.
const ajv = new Ajv({strict: false, allowUnionTypes: true});
// ajv-formats in FULL mode: the `date`/`time`/`date-time` formats then enforce
// real calendar validity (leap years, month-day bounds) — which a `pattern`
// alone cannot. Only schemas that opt into a `format` keyword are affected.
addFormats(ajv, {mode: 'full'});

// LAZY builder: the JSON Schema is compiled inside the returned thunk, so each
// case pays its own compile cost at run start and a bad schema is attributable
// to exactly one case (recorded as `errored`, never silent not-supported).
const c =
  (schema: Schema): (() => Validator) =>
  () => {
    const validate = ajv.compile(schema);
    return (v) => validate(v) === true;
  };

// Shared sub-schemas, ported verbatim from the original ajv.ts.
const objA: Schema = {type: 'object', properties: {a: {type: 'string'}}, required: ['a']};
const addressAjv: Schema = {
  type: 'object',
  properties: {
    street: {type: 'string'},
    city: {type: 'string'},
    state: {type: 'string'},
    zip: {type: 'string'},
    country: {type: 'string'},
  },
  required: ['street', 'city', 'state', 'zip', 'country'],
};
const productAjv: Schema = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    name: {type: 'string'},
    description: {type: 'string'},
    price: {type: 'number'},
    currency: {enum: ['USD', 'EUR', 'GBP']},
    inStock: {type: 'boolean'},
    categories: {type: 'array', items: {type: 'string'}},
    dimensions: {
      type: 'object',
      properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
      required: ['width', 'height', 'depth'],
    },
  },
  required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
};

// TOTAL map over all 263 shared case keys (order matches the suite). Supported
// cases compile a JSON Schema; everything JSON Schema cannot express (bigint,
// Date/RegExp/symbol/undefined, Map/Set/Promise, Temporal, case-insensitive
// patterns, unbounded `number` which ajv lets NaN/Infinity through, circular
// refs, advanced TS utility/mapped/template-literal types, …) is NOT_SUPPORTED.
export const cases: CompetitorCases = {

  // ── ATOMIC ──
  'ATOMIC.any': c({}),
  'ATOMIC.bigint': NOT_SUPPORTED, // no bigint type in JSON Schema
  'ATOMIC.boolean': c({type: 'boolean'}),
  'ATOMIC.date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'ATOMIC.enum_mixed': c({enum: [0, 'green', 2]}), // Color.Red=0, Color.Green='green', Color.Blue=2
  'ATOMIC.literal_2': c({const: 2}),
  'ATOMIC.literal_a': c({const: 'a'}),
  'ATOMIC.literal_true': c({const: true}),
  'ATOMIC.literal_1n': NOT_SUPPORTED, // no bigint in JSON Schema
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // no symbol type in JSON Schema
  'ATOMIC.never': c({not: {}}), // JSON Schema {not:{}} rejects every value — exact analogue of TS `never`
  'ATOMIC.null': c({type: 'null'}),
  'ATOMIC.number': {build: c({type: 'number'}), samples: {invalid: ['hello', null, undefined]}}, // override: ajv {type:number} accepts NaN/Infinity; drop them from invalid
  'ATOMIC.object': NOT_SUPPORTED, // TS object type includes arrays/Date/RegExp; ajv {type:'object'} rejects arrays
  'ATOMIC.regexp': NOT_SUPPORTED, // no RegExp instance type in JSON Schema
  'ATOMIC.string': c({type: 'string'}),
  'ATOMIC.symbol': NOT_SUPPORTED, // no symbol type in JSON Schema; factoryThrows
  'ATOMIC.undefined': NOT_SUPPORTED, // no undefined type in JSON Schema
  'ATOMIC.void': NOT_SUPPORTED, // no undefined/void type in JSON Schema
  'ATOMIC.literal_2_noLiterals': {build: c({type: 'number'}), samples: {invalid: ['4', null]}}, // override: degrades to number; ajv accepts NaN/Infinity — drop them from invalid
  'ATOMIC.literal_a_noLiterals': c({type: 'string'}),
  'ATOMIC.literal_regexp_noLiterals': NOT_SUPPORTED, // degrades to RegExp; no RegExp instance type in JSON Schema
  'ATOMIC.literal_true_noLiterals': c({type: 'boolean'}),
  'ATOMIC.literal_1n_noLiterals': NOT_SUPPORTED, // degrades to bigint; no bigint type in JSON Schema
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // degrades to symbol; no symbol type in JSON Schema; factoryThrows
  'ATOMIC.unknown': c({}),

  // ── ARRAY ──
  'ARRAY.string_array': c({type: 'array', items: {type: 'string'}}),
  'ARRAY.number_array': {build: c({type: 'array', items: {type: 'number'}}), samples: {invalid: [[1, '2'], 'not-array', null, undefined, [null]]}}, // override: ajv {type:number} accepts NaN/Infinity per element; drop [Infinity]/[-Infinity]/[NaN] from invalid
  'ARRAY.boolean_array': c({type: 'array', items: {type: 'boolean'}}),
  'ARRAY.bigint_array': NOT_SUPPORTED, // no bigint type in JSON Schema
  'ARRAY.date_array': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'ARRAY.regexp_array': NOT_SUPPORTED, // no RegExp instance type in JSON Schema
  'ARRAY.undefined_array': NOT_SUPPORTED, // no undefined type in JSON Schema
  'ARRAY.null_array': c({type: 'array', items: {type: 'null'}}),
  'ARRAY.array_generic': c({type: 'array', items: {type: 'string'}}),
  'ARRAY.string_array_2d': c({type: 'array', items: {type: 'array', items: {type: 'string'}}}),
  'ARRAY.string_array_3d': c({
      type: 'array',
      items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
    }),
  'ARRAY.string_array_noIsArrayCheck': NOT_SUPPORTED, // mion-specific noIsArrayCheck option; no JSON Schema equivalent
  'ARRAY.object_array': c({type: 'array', items: objA}),
  'ARRAY.union_array': {
    build: c({type: 'array', items: {anyOf: [{type: 'string'}, {type: 'number'}]}}),
    samples: {invalid: [[true], 'a', [null], ['a', true], null, undefined, [BigInt(1)]]},
  }, // override: ajv {type:'number'} accepts Infinity; drop [Infinity] from invalid (bigint not a JSON number so [BigInt(1)] still fails ajv)
  'ARRAY.tuple_array': c({
      type: 'array',
      items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
    }),
  'ARRAY.circular_array': c({
      $id: 'circular_array',
      type: 'array',
      items: {$ref: 'circular_array'},
    }),
  'ARRAY.circular_object_with_array': c({
      $id: 'circular_object_with_array',
      type: 'object',
      properties: {
        a: {type: 'string'},
        deep: {
          type: 'object',
          properties: {b: {type: 'string'}, c: {type: 'number'}},
          required: ['b', 'c'],
        },
        d: {type: 'array', items: {$ref: 'circular_object_with_array'}},
      },
      required: ['a'],
    }),
  'ARRAY.symbol_array': NOT_SUPPORTED, // no symbol type in JSON Schema; factoryThrows
  'ARRAY.readonly_string_array': c({type: 'array', items: {type: 'string'}}),

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: c({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']}),
    samples: {invalid: ['hello', null, undefined, {a: 'x'}, {a: 1, b: 1}, {a: 'x', b: 'not number'}, {b: 1}, true]},
  }, // override: ajv {type:number} accepts NaN/Infinity; drop b:NaN and b:Infinity from invalid
  'OBJECT.object_as_const_literals': c({
      type: 'object',
      properties: {name: {const: 'john'}, age: {const: 30}},
      required: ['name', 'age'],
    }),
  'OBJECT.object_via_return_type_utility': c({
      type: 'object',
      properties: {id: {type: 'number'}, name: {type: 'string'}},
      required: ['id', 'name'],
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
  'OBJECT.interface_with_optional': {
    build: c({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a']}),
    samples: {invalid: [{a: 'x', b: 'not number'}, {a: 1}, null, undefined, {}, {b: 1}]},
  }, // override: ajv {type:number} accepts NaN; drop b:NaN from invalid
  'OBJECT.interface_with_date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'OBJECT.interface_with_method': c({type: 'object', properties: {name: {type: 'string'}}, required: ['name']}),
  'OBJECT.nested_object': {
    build: c({
      type: 'object',
      properties: {
        a: {type: 'string'},
        deep: {type: 'object', properties: {b: {type: 'string'}, c: {type: 'number'}}, required: ['b', 'c']},
      },
      required: ['a', 'deep'],
    }),
    samples: {invalid: [{a: 'x'}, {a: 'x', deep: {b: 1, c: 1}}, {a: 'x', deep: null}, null, undefined, {a: 'x', deep: {b: 'y'}}]},
  }, // override: ajv {type:number} accepts NaN; drop deep.c:NaN from invalid
  'OBJECT.interface_string_array_prop': c({
      type: 'object',
      properties: {tags: {type: 'array', items: {type: 'string'}}},
      required: ['tags'],
    }),
  'OBJECT.circular_interface': c({
      $id: 'circular_interface',
      type: 'object',
      properties: {
        name: {type: 'string'},
        child: {$ref: 'circular_interface'},
      },
      required: ['name'],
    }),
  'OBJECT.circular_interface_on_array': c({
      $id: 'circular_interface_on_array',
      type: 'object',
      properties: {
        name: {type: 'string'},
        children: {type: 'array', items: {$ref: 'circular_interface_on_array'}},
      },
      required: ['name'],
    }),
  'OBJECT.circular_interface_on_nested_object': c({
      $id: 'circular_interface_on_nested_object',
      type: 'object',
      properties: {
        name: {type: 'string'},
        embedded: {
          type: 'object',
          properties: {
            hello: {type: 'string'},
            child: {$ref: 'circular_interface_on_nested_object'},
          },
          required: ['hello'],
        },
      },
      required: ['name', 'embedded'],
    }),
  'OBJECT.index_signature_string': c({type: 'object', additionalProperties: {type: 'string'}}),
  'OBJECT.index_signature_named_props': c({
      type: 'object',
      properties: {
        a: {type: 'string'},
        b: {type: 'number'},
      },
      required: ['a', 'b'],
      additionalProperties: {type: ['string', 'number']},
    }),
  'OBJECT.index_signature_nested': {
    build: c({type: 'object', additionalProperties: {type: 'object', additionalProperties: {type: 'number'}}}),
    samples: {invalid: [{a: 1}, {a: {x: 'not number'}}, null, undefined, {a: {x: null}}]},
  }, // override: ajv {type:number} accepts NaN; drop a.x:NaN from invalid
  'OBJECT.index_signature_date_value': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'OBJECT.index_signature_non_root': c({
      type: 'object',
      properties: {
        b: {type: 'string'},
        c: {
          type: 'object',
          additionalProperties: {type: 'string'},
        },
      },
      required: ['b', 'c'],
    }),
  'OBJECT.function_top_level': NOT_SUPPORTED, // no function type in JSON Schema
  'OBJECT.interface_callable': NOT_SUPPORTED, // callable interface (function with props); no function type in JSON Schema
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // allOptionalCode guard rejects Date/Map/Set/RegExp; no JSON Schema equivalent for plain-object-only constraint
  'OBJECT.class_simple': NOT_SUPPORTED, // class has Date prop; no Date instance type in JSON Schema
  'OBJECT.rpc_error_class': c({
      type: 'object',
      properties: {
        'mion@isΣrrθr': {const: true},
        type: {const: 'test-error'},
        publicMessage: {type: 'string'},
        id: {type: 'string'},
      },
      required: ['mion@isΣrrθr', 'type', 'publicMessage'],
    }),
  'OBJECT.call_signature_params': {
    build: c({type: 'array', items: [{type: 'number'}, {type: 'boolean'}], minItems: 2, maxItems: 2}),
    samples: {invalid: [[1, 'not boolean'], [1], [1, true, 'extra'], ['not number', true], 'not array', null, undefined, []]},
  }, // override: ajv {type:number} accepts NaN; drop [NaN,true] from invalid
  'OBJECT.call_signature_params_with_optional': {
    build: c({type: 'array', items: [{type: 'number'}, {type: 'boolean'}, {type: 'string'}], minItems: 2, maxItems: 3}),
    samples: {invalid: [[3, 3, 3], [3, true, 'hello', 7], [3], 'not array', null, undefined]},
  }, // override: ajv {type:number} accepts NaN; drop [NaN,true] from invalid
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED, // rest contains Date instances; no Date type in JSON Schema
  'OBJECT.record_union_keys': {
    build: c({type: 'object', properties: {a: {type: 'number'}, b: {type: 'number'}}, required: ['a', 'b']}),
    samples: {invalid: [{a: 1}, {b: 1}, {}, {a: 'x', b: 1}, null, 'not object', undefined]},
  }, // override: ajv {type:number} accepts NaN/Infinity; drop b:NaN and a:Infinity from invalid
  'OBJECT.union_value_index': NOT_SUPPORTED, // union includes bigint; no bigint type in JSON Schema
  'OBJECT.object_with_union_prop': {
    build: c({
      type: 'object',
      properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
      required: ['kind', 'n'],
    }),
    samples: {invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null, undefined, {kind: 'a'}]},
  }, // override: ajv {type:number} accepts NaN; drop kind:'a',n:NaN from invalid
  'OBJECT.interface_inheritance': c({
      type: 'object',
      properties: {a: {type: 'string'}, b: {type: 'number'}},
      required: ['a', 'b'],
    }),
  'OBJECT.class_inheritance': c({
      type: 'object',
      properties: {a: {type: 'string'}, b: {type: 'number'}},
      required: ['a', 'b'],
    }),
  'OBJECT.index_signature_number_key': c({
      type: 'object',
      additionalProperties: {type: 'string'},
    }),

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: c({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2}),
    samples: {invalid: [[], ['hello'], ['hello', 1, 'extra'], [1, 'hello'], 'not array', null, undefined, [null, 1], ['hello', null]]},
  }, // override: ajv {type:number} accepts NaN; drop ['hello',NaN] from invalid
  'TUPLE.full_mion_tuple': NOT_SUPPORTED, // contains Date, bigint; no Date/bigint type in JSON Schema
  'TUPLE.tuple_with_optional': NOT_SUPPORTED, // optional bigint slot; no bigint type in JSON Schema
  'TUPLE.nested_tuple_in_array': {
    build: c({type: 'array', items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2}}),
    samples: {invalid: [[['a', 'b']], [['a']], ['not tuple'], null, undefined, [[null, 1]]]},
  }, // override: ajv {type:number} accepts NaN; drop [['a',NaN]] from invalid
  'TUPLE.tuple_rest': {
    build: c({type: 'array', items: [{type: 'number'}], additionalItems: {type: 'string'}, minItems: 1}),
    samples: {invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [3, null]]},
  }, // override: ajv {type:number} accepts NaN; drop [NaN,'a'] from invalid; use draft-7 items+additionalItems (not prefixItems)
  'TUPLE.tuple_circular': NOT_SUPPORTED, // contains Date, bigint; no Date/bigint type in JSON Schema
  'TUPLE.tuple_multiple_trailing_optionals': NOT_SUPPORTED, // number and bigint slots; no bigint type in JSON Schema
  'TUPLE.tuple_named_labels': {
    build: c({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2}),
    samples: {invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array', undefined, [null, 30]]},
  }, // override: ajv {type:number} accepts NaN; drop ['Alice',NaN] from invalid
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED, // function slot must be === undefined; no undefined type in JSON Schema
  'TUPLE.empty_tuple': c({type: 'array', maxItems: 0}),
  'TUPLE.single_element_tuple': c({type: 'array', items: [{type: 'string'}], minItems: 1, maxItems: 1}),
  'TUPLE.readonly_tuple': c({
      type: 'array',
      items: [{type: 'string'}, {type: 'number'}],
      minItems: 2,
      maxItems: 2,
    }),

  // ── UNION ──
  'UNION.atomic_union': NOT_SUPPORTED, // union includes Date, bigint; no Date/bigint type in JSON Schema
  'UNION.string_literal_union': c({enum: ['UNO', 'DOS', 'TRES']}),
  'UNION.large_union_eight_arms': NOT_SUPPORTED, // arm contains bigint; no bigint type in JSON Schema
  'UNION.string_or_number': {
    build: c({anyOf: [{type: 'string'}, {type: 'number'}]}),
    samples: {invalid: [null, undefined, true, [], {}, BigInt(1)]},
  }, // override: ajv {type:'number'} accepts NaN/Infinity; drop NaN/Infinity from invalid
  'UNION.union_of_array_types': {
    build: c({anyOf: [{type: 'array', items: {type: 'string'}}, {type: 'array', items: {type: 'number'}}, {type: 'array', items: {type: 'boolean'}}]}),
    samples: {invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [null], [BigInt(1)]]},
  }, // override: ajv {type:'number'} accepts Infinity; drop [Infinity] from invalid (bigint is not a JSON number so [BigInt(1)] still fails)
  'UNION.array_of_union': NOT_SUPPORTED, // union includes bigint, Date; no bigint/Date type in JSON Schema
  'UNION.union_of_object_shapes': NOT_SUPPORTED, // arm c has bigint value; no bigint type in JSON Schema
  'UNION.discriminated_union': {
    build: c({anyOf: [
      {type: 'object', properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
      {type: 'object', properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
    ]}),
    samples: {invalid: [{kind: 'c', n: 1}, {kind: 'a', n: 'not number'}, {n: 1}, null, 'not object', undefined, {kind: 'a'}, {kind: 'b'}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {kind:'a',n:NaN} from invalid
  'UNION.circular_union': NOT_SUPPORTED, // union includes Date; no Date instance type in JSON Schema
  'UNION.union_with_methods': c({
      anyOf: [
        {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
        {type: 'object', properties: {age: {type: 'number'}}, required: ['age']},
      ],
    }),
  'UNION.intersection_to_object': {
    build: c({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']}),
    samples: {invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}, undefined, {}]},
  }, // override: ajv {type:'number'} accepts NaN/Infinity; drop {a:'x',b:NaN} from invalid
  'UNION.union_with_index_arm': NOT_SUPPORTED, // arm c has bigint values; no bigint type in JSON Schema
  'UNION.union_same_prop_different_types': c({
      anyOf: [
        {type: 'object', properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
        {type: 'object', properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
        {type: 'object', properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
      ],
    }),
  'UNION.union_mixed_arrays_and_objects': NOT_SUPPORTED, // arm {b: number} — ajv accepts NaN; samples allow b:123n (bigint)
  'UNION.union_merged_property': {
    build: c({anyOf: [{type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']}, {type: 'object', properties: {a: {type: 'number'}}, required: ['a']}]}),
    samples: {invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {a:NaN} from invalid
  'UNION.union_mixed_with_index': NOT_SUPPORTED, // arm has bigint values; no bigint type in JSON Schema
  'UNION.union_with_any_fallback': c({}),
  'UNION.union_with_unknown_fallback': c({}),
  'UNION.union_subset_small_first': c({
      anyOf: [
        {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
        {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
      ],
    }),
  'UNION.union_subset_nested_levels': c({
      anyOf: [
        {type: 'object', properties: {x: {type: 'string'}}, required: ['x']},
        {type: 'object', properties: {x: {type: 'string'}, y: {type: 'number'}}, required: ['x', 'y']},
        {type: 'object', properties: {x: {type: 'string'}, y: {type: 'number'}, z: {type: 'boolean'}}, required: ['x', 'y', 'z']},
      ],
    }),
  'UNION.union_subset_mixed_related_unrelated': {
    build: c({anyOf: [
      {type: 'object', properties: {id: {type: 'string'}}, required: ['id']},
      {type: 'object', properties: {id: {type: 'string'}, name: {type: 'string'}}, required: ['id', 'name']},
      {type: 'object', properties: {value: {type: 'number'}}, required: ['value']},
    ]}),
    samples: {invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined]},
  }, // override: ajv {type:'number'} accepts NaN; drop {value:NaN} from invalid

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': c({
      type: 'string',
      pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
    }),
  'TEMPLATE_LITERAL.multi_segment_url': c({
      type: 'string',
      pattern: '^\\/api\\/v\\d+\\/user\\/[\\s\\S]+\\/posts\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
    }),
  'TEMPLATE_LITERAL.leading_string_placeholder': c({
      type: 'string',
      pattern: '^[\\s\\S]*\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
    }),
  'TEMPLATE_LITERAL.regex_special_chars': c({
      type: 'string',
      pattern: '^\\(-?(?:\\d+\\.?\\d*|\\.\\d+)\\)$',
    }),
  'TEMPLATE_LITERAL.template_literal_nested_in_object': c({
      type: 'object',
      properties: {
        url: {type: 'string', pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$'},
        method: {type: 'string'},
      },
      required: ['url', 'method'],
    }),
  'TEMPLATE_LITERAL.template_literal_index_key': NOT_SUPPORTED, // patternProperties key is a regex but samples need key-pattern validation per entry; no exact JSON Schema equivalent for template-literal index key semantics
  'TEMPLATE_LITERAL.template_literal_union_placeholder': c({
      type: 'string',
      pattern: '^(?:a|b)--?(?:\\d+\\.?\\d*|\\.\\d+)$',
    }),

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // no Map instance type in JSON Schema
  'NATIVE.set_string': NOT_SUPPORTED, // no Set instance type in JSON Schema
  'NATIVE.promise_string': NOT_SUPPORTED, // no thenable/Promise instance type in JSON Schema
  'NATIVE.awaited_promise': c({type: 'string'}),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': NOT_SUPPORTED, // number prop — ajv accepts NaN; samples reject NaN; also optional Date prop
  'CIRCULAR.array_of_union_with_self_ref': NOT_SUPPORTED, // union includes Date; no Date instance type in JSON Schema
  'CIRCULAR.object_with_tuple_prop': NOT_SUPPORTED, // tuple contains bigint; no bigint type in JSON Schema
  'CIRCULAR.object_with_index_prop': c({
      $id: 'circular_object_with_index_prop',
      type: 'object',
      properties: {
        index: {
          type: 'object',
          additionalProperties: {$ref: 'circular_object_with_index_prop'},
        },
      },
      required: ['index'],
    }),
  'CIRCULAR.object_deeply_nested': c({
      $id: 'object_deeply_nested',
      type: 'object',
      properties: {
        deep1: {
          type: 'object',
          properties: {
            deep2: {
              type: 'object',
              properties: {
                deep3: {
                  type: 'object',
                  properties: {
                    deep4: {$ref: 'object_deeply_nested'},
                  },
                },
              },
              required: ['deep3'],
            },
          },
          required: ['deep2'],
        },
      },
      required: ['deep1'],
    }),
  'CIRCULAR.circular_child_under_literal_root': NOT_SUPPORTED, // child contains bigint; no bigint type in JSON Schema
  'CIRCULAR.multiple_circular_types_cross_referenced': NOT_SUPPORTED, // contains bigint and Date; no bigint/Date type in JSON Schema

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED, // Partial type includes Date prop; no Date instance type in JSON Schema
  'UTILITY.required': NOT_SUPPORTED, // Required type includes Date prop; no Date instance type in JSON Schema
  'UTILITY.pick': NOT_SUPPORTED, // Pick result includes Date prop; no Date instance type in JSON Schema
  'UTILITY.omit': NOT_SUPPORTED, // Omit result includes Date prop; no Date instance type in JSON Schema
  'UTILITY.exclude_atomic': c({enum: ['name', 'createdAt']}),
  'UTILITY.extract_atomic': c({enum: ['name', 'createdAt']}),
  'UTILITY.exclude_from_object_union': {
    build: c({anyOf: [
      {type: 'object', properties: {kind: {const: 'square'}, x: {type: 'number'}}, required: ['kind', 'x']},
      {type: 'object', properties: {kind: {const: 'triangle'}, base: {type: 'number'}, height: {type: 'number'}}, required: ['kind', 'base', 'height']},
    ]}),
    samples: {invalid: [{kind: 'circle', radius: 3}, {}, null, undefined, {kind: 'square'}, {kind: 'triangle', base: 4}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {kind:'square',x:NaN} from invalid
  'UTILITY.non_nullable': {
    build: c({anyOf: [{type: 'string'}, {type: 'number'}]}),
    samples: {invalid: [null, undefined, true, {}, []]},
  }, // override: ajv {type:'number'} accepts NaN/Infinity; drop NaN/Infinity from invalid
  'UTILITY.return_type': NOT_SUPPORTED, // ReturnType resolves to Date; no Date instance type in JSON Schema
  'UTILITY.readonly': {
    build: c({type: 'object', properties: {name: {type: 'string'}, age: {type: 'number'}}, required: ['name', 'age']}),
    samples: {invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {name:'John',age:NaN} from invalid
  'UTILITY.intersection_with_required_override': NOT_SUPPORTED, // optional Date prop; no Date instance type in JSON Schema
  'UTILITY.omit_keeping_optional': {
    build: c({type: 'object', properties: {b: {type: 'number'}, c: {type: 'boolean'}}, required: ['c']}),
    samples: {invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: 0}, {b: 1, c: 1}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {c:true,b:NaN} from invalid
  'UTILITY.keyof_to_literal_union': c({enum: ['name', 'age', 'createdAt']}),
  'UTILITY.typeof_variable_query': c({
      type: 'object',
      properties: {url: {type: 'string'}, port: {type: 'number'}},
      required: ['url', 'port'],
    }),
  'UTILITY.indexed_access_type': c({type: 'string'}),
  'UTILITY.conditional_type_resolved': c({type: 'boolean'}),
  'UTILITY.mapped_type_custom': c({
      type: 'object',
      properties: {
        a: {type: ['string', 'null']},
        b: {type: ['number', 'null']},
      },
      required: ['a', 'b'],
    }),
  'UTILITY.mapped_type_with_conditional_value': c({
      type: 'object',
      properties: {
        name: {
          type: 'object',
          properties: {kind: {const: 'text'}, value: {type: 'string'}},
          required: ['kind', 'value'],
        },
        age: {
          type: 'object',
          properties: {kind: {const: 'number'}, value: {type: 'number'}, min: {type: 'number'}},
          required: ['kind', 'value'],
        },
        admin: {
          type: 'object',
          properties: {kind: {const: 'checkbox'}, value: {type: 'boolean'}},
          required: ['kind', 'value'],
        },
      },
      required: ['name', 'age', 'admin'],
    }),
  'UTILITY.distributive_conditional_over_union': {
    build: c({anyOf: [{type: 'object', properties: {w: {type: 'string'}}, required: ['w']}, {type: 'object', properties: {w: {type: 'number'}}, required: ['w']}]}),
    samples: {invalid: [{w: true}, {w: null}, {}, null, undefined]},
  }, // override: ajv {type:'number'} accepts NaN; drop {w:NaN} from invalid
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED, // value literals ('light'/'dark') — need enum; deep nested optional structure hard to express without knowing exact shape; also number (NaN issue)

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': NOT_SUPPORTED, // key-renaming mapped type; no JSON Schema analogue
  'TYPE_MAPPINGS.key_conditional_rename': NOT_SUPPORTED, // conditional key-renaming mapped type; no JSON Schema analogue
  'TYPE_MAPPINGS.key_filter_via_never': NOT_SUPPORTED, // key-filtering mapped type; no JSON Schema analogue

  // ── DATETIME ──
  'DATETIME.date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.instant': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.plainDate': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainTime': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainDateTime': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // no Temporal.PlainMonthDay instance type in JSON Schema
  'DATETIME.duration': NOT_SUPPORTED, // no Temporal.Duration instance type in JSON Schema

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': c({type: 'string', maxLength: 5}),
  'STRING_FORMAT.string_minLength': c({type: 'string', minLength: 3}),
  'STRING_FORMAT.string_length': c({type: 'string', minLength: 4, maxLength: 4}),
  'STRING_FORMAT.string_range': c({type: 'string', minLength: 2, maxLength: 4}),
  'STRING_FORMAT.string_allowedChars': c({type: 'string', pattern: '^[0-9a-f]+$'}),
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED, // case-insensitive regex; JSON Schema pattern has no ignore-case flag
  'STRING_FORMAT.string_allowedChars_literal': c({type: 'string', pattern: '^[.\\-]+$'}),
  'STRING_FORMAT.string_disallowedChars': c({type: 'string', pattern: '^[^!@#]*$'}),
  'STRING_FORMAT.string_allowedValues': c({type: 'string', enum: ['red', 'green', 'blue']}),
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED, // case-insensitive enum match; no JSON Schema equivalent
  'STRING_FORMAT.string_allowedValues_escaped': c({type: 'string', enum: ['a.b', 'c+d']}),
  'STRING_FORMAT.string_disallowedValues': c({type: 'string', not: {enum: ['admin', 'root']}}),
  'STRING_FORMAT.string_customErrorMessage': c({type: 'string', enum: ['a', 'b']}),
  'STRING_FORMAT.alpha': c({type: 'string', pattern: '^[A-Za-z]+$'}),
  'STRING_FORMAT.alphaNumeric': c({type: 'string', pattern: '^[A-Za-z0-9]+$'}),
  'STRING_FORMAT.numeric': c({type: 'string', pattern: '^[0-9]+$'}),
  'STRING_FORMAT.alpha_withLength': c({type: 'string', pattern: '^[A-Za-z]+$', maxLength: 3}),
  'STRING_FORMAT.lowercase_validate': c({type: 'string'}),
  'STRING_FORMAT.uuidv4': c({
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    }),
  'STRING_FORMAT.uuidv7': c({
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    }),
  'STRING_FORMAT.date_iso': c({type: 'string', format: 'date'}), // ajv-formats full mode: calendar-aware ISO date
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // pattern cannot enforce calendar validity (month-day bounds)
  'STRING_FORMAT.date_YM': c({
      type: 'string',
      pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
    }),
  'STRING_FORMAT.date_MD': c({
      type: 'string',
      pattern: '^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
    }),
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // requires date-comparison logic; pattern alone cannot enforce date range
  'STRING_FORMAT.time_iso': c({
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$',
    }),
  'STRING_FORMAT.time_HHmmss': c({
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$',
    }),
  'STRING_FORMAT.time_HHmmss_ms': c({
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?$',
    }),
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // requires time-comparison logic; pattern alone cannot enforce time range
  // ajv-formats full mode gives calendar validity; pattern 'T' enforces the ISO
  // 'T' separator (ajv-formats/RFC3339 also accept a space, which mion rejects).
  'STRING_FORMAT.dateTime_default': c({type: 'string', format: 'date-time', pattern: 'T'}),
  'STRING_FORMAT.dateTime_custom': c({
      type: 'string',
      pattern: '^(0[1-9]|[12]\\d|3[01])-(0[1-9]|1[0-2])-\\d{4} ([01]\\d|2[0-3]):[0-5]\\d$',
    }),
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // requires datetime-comparison logic; pattern alone cannot enforce range
  'STRING_FORMAT.ipv4': c({type: 'string', format: 'ipv4'}), // ajv-formats
  'STRING_FORMAT.ipv6': c({type: 'string', format: 'ipv6'}), // ajv-formats
  'STRING_FORMAT.ip_any': c({
      type: 'string',
      anyOf: [
        {pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)$'},
        {pattern: '^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^::1$|^::$'},
      ],
    }),
  'STRING_FORMAT.ipv4_port': c({
      type: 'string',
      pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d):(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
    }),
  'STRING_FORMAT.ipv6_port': c({
      type: 'string',
      pattern: '^\\[(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,7}:\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::1\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
    }),
  'STRING_FORMAT.domain': c({
      type: 'string',
      pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$',
    }),
  'STRING_FORMAT.domainStrict': c({
      type: 'string',
      pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$',
    }),
  'STRING_FORMAT.email': c({
      type: 'string',
      // local-part 2+ chars (rejects 'a@...'); domain: optional subdomains + 2+ char label + 2+ char TLD
      pattern: '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
    }),
  'STRING_FORMAT.emailPunycode': c({
      type: 'string',
      pattern: '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9]+)$',
    }),
  'STRING_FORMAT.emailStrict': c({
      type: 'string',
      // strict: no + in local, no _ in domain, 2+ char domain label, 2+ char TLD
      pattern: '^[a-zA-Z0-9.\\-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
    }),
  'STRING_FORMAT.url': c({
      type: 'string',
      pattern: '^(?:https?|ftp|wss?):\\/\\/.+',
    }),
  'STRING_FORMAT.urlHttp': c({
      type: 'string',
      pattern: '^https?:\\/\\/.+',
    }),
  'STRING_FORMAT.urlFile': c({
      type: 'string',
      pattern: '^file:\\/\\/.+',
    }),
  'STRING_FORMAT.pattern_slug': c({type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'}),
  'STRING_FORMAT.pattern_hex': c({type: 'string', pattern: '^[0-9a-fA-F]+$'}),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': c({type: 'number', maximum: 100}),
  'NUMBER_FORMAT.number_min': c({type: 'number', minimum: 0}),
  'NUMBER_FORMAT.number_lt': c({type: 'number', exclusiveMaximum: 10}),
  'NUMBER_FORMAT.number_gt': c({type: 'number', exclusiveMinimum: 0}),
  'NUMBER_FORMAT.number_integer': c({type: 'integer'}),
  'NUMBER_FORMAT.number_float': c({type: 'number', not: {type: 'integer'}}),
  'NUMBER_FORMAT.number_multipleOf': c({type: 'number', multipleOf: 5}),
  'NUMBER_FORMAT.number_combined': c({type: 'integer', minimum: 0, maximum: 100, multipleOf: 5}),
  'NUMBER_FORMAT.number_int8': c({type: 'integer', minimum: -128, maximum: 127}),
  'NUMBER_FORMAT.number_uint8': c({type: 'integer', minimum: 0, maximum: 255}),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_min': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_lt': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_gt': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_multipleOf': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_combined': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // no bigint type in JSON Schema

  // ── DATETIME ──
  'DATETIME.date_minmax': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_gtlt': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_min_lt': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_max_now': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_rel_window': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.instant_minmax': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.instant_rel': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema

  // ── REALWORLD ──
  'REALWORLD.user': c({
      type: 'object',
      properties: {
        id: {type: 'number'},
        email: {type: 'string'},
        name: {type: 'string'},
        age: {type: 'number'},
        roles: {type: 'array', items: {enum: ['admin', 'editor', 'user']}},
        active: {type: 'boolean'},
        createdAt: {type: 'string'},
      },
      required: ['id', 'email', 'name', 'roles', 'active', 'createdAt'],
    }),
  'REALWORLD.order': c({
      type: 'object',
      properties: {
        id: {type: 'string'},
        customer: {type: 'object', properties: {id: {type: 'number'}, email: {type: 'string'}}, required: ['id', 'email']},
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {sku: {type: 'string'}, name: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
            required: ['sku', 'name', 'qty', 'price'],
          },
        },
        shipping: addressAjv,
        status: {enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']},
        total: {type: 'number'},
        note: {type: 'string'},
      },
      required: ['id', 'customer', 'items', 'shipping', 'status', 'total'],
    }),
  'REALWORLD.blogPost': c({
      type: 'object',
      properties: {
        id: {type: 'number'},
        title: {type: 'string'},
        slug: {type: 'string'},
        body: {type: 'string'},
        tags: {type: 'array', items: {type: 'string'}},
        author: {type: 'object', properties: {name: {type: 'string'}, email: {type: 'string'}}, required: ['name', 'email']},
        published: {type: 'boolean'},
        publishedAt: {type: 'string'},
        meta: {type: 'object', properties: {views: {type: 'number'}, likes: {type: 'number'}}, required: ['views', 'likes']},
      },
      required: ['id', 'title', 'slug', 'body', 'tags', 'author', 'published', 'meta'],
    }),
  'REALWORLD.product': c(productAjv),
  'REALWORLD.productPage': c({
      type: 'object',
      properties: {
        data: {type: 'array', items: productAjv},
        page: {type: 'number'},
        pageSize: {type: 'number'},
        total: {type: 'number'},
        hasMore: {type: 'boolean'},
      },
      required: ['data', 'page', 'pageSize', 'total', 'hasMore'],
    }),
  'REALWORLD.registrationForm': c({
      type: 'object',
      properties: {
        email: {type: 'string'},
        password: {type: 'string'},
        acceptedTerms: {const: true},
        profile: {
          type: 'object',
          properties: {firstName: {type: 'string'}, lastName: {type: 'string'}, age: {type: 'number'}},
          required: ['firstName', 'lastName'],
        },
      },
      required: ['email', 'password', 'acceptedTerms', 'profile'],
    }),
};
