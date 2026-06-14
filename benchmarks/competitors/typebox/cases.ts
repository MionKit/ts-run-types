// TypeBox validators keyed by suite case key ("GROUP.case"). TOTAL map over every
// shared case key: supported cases compile a TypeBox schema; the rest opt out with
// NOT_SUPPORTED. TypeBox can't express bigint literals/ranges (multipleOf broken,
// int64 bounds lose float precision), RegExp instance, Map/Set/Promise, Temporal,
// symbols, calendar-aware date/time string formats, or allOptional plain-object guard.

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

// Reusable IP patterns (no \d — TypeCompiler interprets \d as literal 'd')
const IPV4_OCTET = '(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
const IPV4_PAT = `${IPV4_OCTET}[.]${IPV4_OCTET}[.]${IPV4_OCTET}[.]${IPV4_OCTET}`;
const IPV6_PAT =
  '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
  '|([0-9a-fA-F]{1,4}:){1,7}:' +
  '|:((:[0-9a-fA-F]{1,4}){1,7}|:)' +
  '|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
  '|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}' +
  '|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}' +
  '|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}' +
  '|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}' +
  '|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6}))';
// Port 0-65535
const PORT_PAT = '(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[0-9]{1,4})';
// Number placeholder for template literals (mion semantics: int or decimal, optional negative)
const NUM_PAT = '-?([0-9]+[.]?[0-9]*|[.][0-9]+)';

// Tuple helper for optional trailing slots: enumerates all valid lengths as a Union.
// Each slot beyond `required` accepts T|undefined; builds 2^optional variants.
const optTupleFn = (
  required: TSchema[],
  optionals: [TSchema, TSchema][],    // [exactType, Type.Union([exactType, Type.Undefined()])]
): TSchema => {
  const variants: TSchema[] = [];
  const total = optionals.length;
  // For each number of present trailing slots (0 .. total), generate all undefined-slot combos
  for (let present = 0; present <= total; present++) {
    // Generate all combinations where exactly `present` or fewer consecutive slots are non-undefined
    // mion semantics: any optional slot can be undefined regardless of later slots
    // So we need all 2^total variants (each optional is either T or T|undefined slot)
    // Simplified: just enumerate which of the `present` rightmost are present, rest are T|undefined
    variants.push(Type.Tuple([...required, ...optionals.slice(0, present).map(([t]) => t)]));
  }
  // Add variants where middle slots are undefined but later are present
  const addUndefinedVariants = (prefix: TSchema[], remaining: [TSchema, TSchema][], depth: number): void => {
    if (depth === 0) return;
    for (let skip = 1; skip < remaining.length; skip++) {
      const slots = [
        ...remaining.slice(0, skip).map(([, withUndef]) => withUndef),
        ...remaining.slice(skip, skip + 1).map(([t]) => t),
      ];
      if (slots.length > 0 && skip + 1 <= remaining.length) {
        variants.push(Type.Tuple([...prefix, ...slots]));
      }
    }
  };
  addUndefinedVariants(required, optionals, total);
  return Type.Union(variants);
};

// Simplified tuple-with-optionals builder for the specific shapes used here
// [number, bigint?, boolean?, number?] — 9 variants covering all valid combos
const tupleWithMultipleOptionals = Type.Union([
  Type.Tuple([Type.Number()]),
  Type.Tuple([Type.Number(), Type.BigInt()]),
  Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()])]),
  Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean()]),
  Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean()]),
  Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean(), Type.Number()]),
  Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean(), Type.Number()]),
  Type.Tuple([Type.Number(), Type.BigInt(), Type.Union([Type.Boolean(), Type.Undefined()]), Type.Number()]),
  Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Union([Type.Boolean(), Type.Undefined()]), Type.Number()]),
]);

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': c(Type.Any()),
  'ATOMIC.bigint': c(Type.BigInt()),
  'ATOMIC.boolean': c(Type.Boolean()),
  'ATOMIC.date': c(Type.Date()),
  'ATOMIC.enum_mixed': c(Type.Union([Type.Literal(0), Type.Literal('green'), Type.Literal(2)])),
  'ATOMIC.literal_2': c(Type.Literal(2)),
  'ATOMIC.literal_a': c(Type.Literal('a')),
  'ATOMIC.literal_true': c(Type.Literal(true)),
  'ATOMIC.literal_1n': NOT_SUPPORTED, // TypeBox has no bigint literal type
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // TypeBox has no symbol literal type
  'ATOMIC.never': c(Type.Never()),
  'ATOMIC.null': c(Type.Null()),
  'ATOMIC.number': c(Type.Number()),
  'ATOMIC.object': NOT_SUPPORTED, // Type.Object({}) rejects arrays; no general 'object' type in TypeBox
  'ATOMIC.regexp': NOT_SUPPORTED, // TypeBox RegExp validates string matches a pattern, not instanceof RegExp
  'ATOMIC.string': c(Type.String()),
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows — symbol primitive unsupported
  'ATOMIC.undefined': c(Type.Undefined()),
  'ATOMIC.void': c(Type.Void()),
  'ATOMIC.literal_2_noLiterals': c(Type.Number()),
  'ATOMIC.literal_a_noLiterals': c(Type.String()),
  'ATOMIC.literal_regexp_noLiterals': NOT_SUPPORTED, // no RegExp instance type in TypeBox
  'ATOMIC.literal_true_noLiterals': c(Type.Boolean()),
  'ATOMIC.literal_1n_noLiterals': c(Type.BigInt()),
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows — symbol unsupported
  'ATOMIC.unknown': c(Type.Unknown()),

  // ── ARRAY ──
  'ARRAY.string_array': c(Type.Array(Type.String())),
  'ARRAY.number_array': c(Type.Array(Type.Number())),
  'ARRAY.boolean_array': c(Type.Array(Type.Boolean())),
  'ARRAY.bigint_array': c(Type.Array(Type.BigInt())),
  'ARRAY.date_array': c(Type.Array(Type.Date())),
  'ARRAY.regexp_array': NOT_SUPPORTED, // no RegExp instance type in TypeBox
  'ARRAY.undefined_array': c(Type.Array(Type.Undefined())),
  'ARRAY.null_array': c(Type.Array(Type.Null())),
  'ARRAY.array_generic': c(Type.Array(Type.String())),
  'ARRAY.string_array_2d': c(Type.Array(Type.Array(Type.String()))),
  'ARRAY.string_array_3d': c(Type.Array(Type.Array(Type.Array(Type.String())))),
  'ARRAY.string_array_noIsArrayCheck': NOT_SUPPORTED, // semantics require accepting non-arrays
  'ARRAY.object_array': c(Type.Array(objA)),
  'ARRAY.union_array': c(Type.Array(Type.Union([Type.String(), Type.Number()]))),
  'ARRAY.tuple_array': c(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
  'ARRAY.circular_array': c(Type.Recursive((This) => Type.Array(This))),
  'ARRAY.circular_object_with_array': c(
    Type.Recursive((This) =>
      Type.Object({
        a: Type.String(),
        deep: Type.Optional(Type.Object({b: Type.String(), c: Type.Number()})),
        d: Type.Optional(Type.Array(This)),
      })
    )
  ),
  'ARRAY.symbol_array': NOT_SUPPORTED, // no symbol type in TypeBox
  'ARRAY.readonly_string_array': c(Type.Array(Type.String())),

  // ── OBJECT ──
  'OBJECT.simple_interface': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'OBJECT.object_as_const_literals': c(Type.Object({name: Type.Literal('john'), age: Type.Literal(30)})),
  'OBJECT.object_via_return_type_utility': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.object_via_property_access': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.object_via_array_access': c(Type.Object({id: Type.Number(), name: Type.String()})),
  'OBJECT.interface_with_optional': c(Type.Object({a: Type.String(), b: Type.Optional(Type.Number())})),
  'OBJECT.interface_with_date': c(Type.Object({date: Type.Date(), name: Type.String()})),
  'OBJECT.interface_with_method': c(Type.Object({name: Type.String()})),
  'OBJECT.nested_object': c(Type.Object({a: Type.String(), deep: Type.Object({b: Type.String(), c: Type.Number()})})),
  'OBJECT.interface_string_array_prop': c(Type.Object({tags: Type.Array(Type.String())})),
  'OBJECT.circular_interface': c(
    Type.Recursive((This) => Type.Object({name: Type.String(), child: Type.Optional(This)}))
  ),
  'OBJECT.circular_interface_on_array': c(
    Type.Recursive((This) => Type.Object({name: Type.String(), children: Type.Optional(Type.Array(This))}))
  ),
  'OBJECT.circular_interface_on_nested_object': c(
    Type.Recursive((This) =>
      Type.Object({
        name: Type.String(),
        embedded: Type.Object({hello: Type.String(), child: Type.Optional(This)}),
      })
    )
  ),
  'OBJECT.index_signature_string': c(Type.Record(Type.String(), Type.String())),
  'OBJECT.index_signature_named_props': c(
    Type.Intersect([
      Type.Object({a: Type.String(), b: Type.Number()}),
      Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()])),
    ])
  ),
  'OBJECT.index_signature_nested': c(Type.Record(Type.String(), Type.Record(Type.String(), Type.Number()))),
  'OBJECT.index_signature_date_value': c(Type.Record(Type.String(), Type.Record(Type.String(), Type.Date()))),
  'OBJECT.index_signature_non_root': c(
    Type.Object({
      b: Type.String(),
      c: Type.Intersect([Type.Object({a: Type.String()}), Type.Record(Type.String(), Type.String())]),
    })
  ),
  'OBJECT.function_top_level': c(Type.Function([], Type.Any())),
  'OBJECT.interface_callable': NOT_SUPPORTED, // Intersect(Function, Object) compiles typeof 'object' check which rejects functions
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // TypeBox Object accepts Date/Map/Set/RegExp for all-optional shapes
  'OBJECT.class_simple': c(Type.Object({date: Type.Date(), name: Type.String()})),
  'OBJECT.rpc_error_class': c(
    Type.Object({
      'mion@isΣrrθr': Type.Literal(true),
      type: Type.Literal('test-error'),
      publicMessage: Type.String(),
      id: Type.Optional(Type.String()),
    })
  ),
  'OBJECT.call_signature_params': c(Type.Tuple([Type.Number(), Type.Boolean()])),
  'OBJECT.call_signature_params_with_optional': c(
    Type.Union([
      Type.Tuple([Type.Number(), Type.Boolean()]),
      Type.Tuple([Type.Number(), Type.Boolean(), Type.String()]),
    ])
  ),
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED, // Type.Rest in Tuple throws at TypeCompiler.Compile
  'OBJECT.record_union_keys': c(Type.Object({a: Type.Number(), b: Type.Number()})),
  'OBJECT.union_value_index': c(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
  'OBJECT.object_with_union_prop': c(Type.Object({kind: Type.Union([Type.Literal('a'), Type.Literal('b')]), n: Type.Number()})),
  'OBJECT.interface_inheritance': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'OBJECT.class_inheritance': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'OBJECT.index_signature_number_key': c(Type.Record(Type.String(), Type.String())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': c(Type.Tuple([Type.String(), Type.Number()])),
  'TUPLE.full_mion_tuple': c(
    Type.Tuple([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt()])
  ),
  'TUPLE.tuple_with_optional': c(tupleWithMultipleOptionals),
  'TUPLE.nested_tuple_in_array': c(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
  'TUPLE.tuple_rest': NOT_SUPPORTED, // Type.Rest in Tuple throws at TypeCompiler.Compile
  'TUPLE.tuple_circular': c(
    Type.Recursive((This) =>
      Type.Union([
        Type.Tuple([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt()]),
        Type.Tuple([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt(), This]),
      ])
    )
  ),
  'TUPLE.tuple_multiple_trailing_optionals': c(tupleWithMultipleOptionals),
  'TUPLE.tuple_named_labels': c(Type.Tuple([Type.String(), Type.Number()])),
  'TUPLE.tuple_with_non_serializable': c(
    Type.Union([Type.Tuple([Type.Number()]), Type.Tuple([Type.Number(), Type.Undefined()])])
  ),
  'TUPLE.empty_tuple': c(Type.Tuple([])),
  'TUPLE.single_element_tuple': c(Type.Tuple([Type.String()])),
  'TUPLE.readonly_tuple': c(Type.Tuple([Type.String(), Type.Number()])),

  // ── UNION ──
  'UNION.atomic_union': c(Type.Union([Type.Date(), Type.Number(), Type.String(), Type.Null(), Type.BigInt()])),
  'UNION.string_literal_union': c(Type.Union([Type.Literal('UNO'), Type.Literal('DOS'), Type.Literal('TRES')])),
  'UNION.large_union_eight_arms': c(
    Type.Union([
      Type.Literal('a'),
      Type.Literal('b'),
      Type.Literal(42),
      Type.Literal(true),
      Type.Null(),
      Type.Object({a: Type.String()}),
      Type.Object({a: Type.String(), b: Type.Number()}),
      Type.Object({c: Type.BigInt()}),
    ])
  ),
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
  'UNION.circular_union': c(
    Type.Recursive((This) =>
      Type.Union([
        Type.Date(),
        Type.Number(),
        Type.String(),
        Type.Record(Type.String(), This),
        Type.Array(This),
      ])
    )
  ),
  'UNION.union_with_methods': c(
    Type.Union([Type.Object({name: Type.String()}), Type.Object({age: Type.Number()})])
  ),
  'UNION.intersection_to_object': c(Type.Object({a: Type.String(), b: Type.Number()})),
  'UNION.union_with_index_arm': c(
    Type.Union([
      Type.Object({a: Type.String(), aa: Type.Boolean()}),
      Type.Object({b: Type.Number()}),
      Type.Intersect([Type.Object({c: Type.BigInt()}), Type.Record(Type.String(), Type.BigInt())]),
    ])
  ),
  'UNION.union_same_prop_different_types': c(
    Type.Union([
      Type.Object({type: Type.Literal('a'), prop: Type.Boolean()}),
      Type.Object({type: Type.Literal('b'), prop: Type.Number()}),
      Type.Object({type: Type.Literal('c'), prop: Type.String()}),
    ])
  ),
  'UNION.union_mixed_arrays_and_objects': c(
    Type.Union([
      Type.Array(Type.String()),
      Type.Array(Type.Number()),
      Type.Array(Type.Boolean()),
      Type.Object({a: Type.String(), aa: Type.Boolean()}),
      Type.Object({b: Type.Number()}),
    ])
  ),
  'UNION.union_merged_property': c(
    Type.Union([Type.Object({a: Type.Boolean()}), Type.Object({a: Type.Number()})])
  ),
  'UNION.union_mixed_with_index': c(
    Type.Union([
      Type.Array(Type.String()),
      Type.Object({a: Type.String(), aa: Type.Boolean()}),
      Type.Object({b: Type.Number()}),
      Type.Intersect([Type.Object({b: Type.BigInt()}), Type.Record(Type.String(), Type.BigInt())]),
    ])
  ),
  'UNION.union_with_any_fallback': c(Type.Any()),
  'UNION.union_with_unknown_fallback': c(Type.Unknown()),
  'UNION.union_subset_small_first': c(
    Type.Union([Type.Object({a: Type.String()}), Type.Object({a: Type.String(), b: Type.Number()})])
  ),
  'UNION.union_subset_nested_levels': c(
    Type.Union([
      Type.Object({x: Type.String()}),
      Type.Object({x: Type.String(), y: Type.Number()}),
      Type.Object({x: Type.String(), y: Type.Number(), z: Type.Boolean()}),
    ])
  ),
  'UNION.union_subset_mixed_related_unrelated': c(
    Type.Union([
      Type.Object({id: Type.String()}),
      Type.Object({id: Type.String(), name: Type.String()}),
      Type.Object({value: Type.Number()}),
    ])
  ),

  // ── TEMPLATE_LITERAL ──
  // All expressed as Type.String({pattern: ...}) since TypeBox TemplateLiteral Number only
  // accepts non-negative integers; mion uses -?(\d+\.?\d*|\.\d+) semantics.
  'TEMPLATE_LITERAL.url_with_number_id': c(Type.String({pattern: `^api/user/${NUM_PAT}$`})),
  'TEMPLATE_LITERAL.multi_segment_url': c(
    Type.String({pattern: `^/api/v[0-9]+/user/[^/]+/posts/${NUM_PAT}$`})
  ),
  'TEMPLATE_LITERAL.leading_string_placeholder': c(
    Type.String({pattern: `^[^]*?/${NUM_PAT}$`})
  ),
  'TEMPLATE_LITERAL.regex_special_chars': c(Type.String({pattern: `^[(]${NUM_PAT}[)]$`})),
  'TEMPLATE_LITERAL.template_literal_nested_in_object': c(
    Type.Object({url: Type.String({pattern: `^api/user/${NUM_PAT}$`}), method: Type.String()})
  ),
  'TEMPLATE_LITERAL.template_literal_index_key': NOT_SUPPORTED, // Type.Record with TemplateLiteral key uses patternProperties; extra keys that DON'T match the pattern are accepted rather than rejected
  'TEMPLATE_LITERAL.template_literal_union_placeholder': c(
    Type.String({pattern: `^(a|b)-${NUM_PAT}$`})
  ),

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // no Map type in TypeBox
  'NATIVE.set_string': NOT_SUPPORTED, // no Set type in TypeBox
  'NATIVE.promise_string': NOT_SUPPORTED, // no thenable/Promise type in TypeBox
  'NATIVE.awaited_promise': c(Type.String()),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': c(
    Type.Recursive((This) =>
      Type.Object({
        n: Type.Number(),
        s: Type.String(),
        c: Type.Optional(This),
        d: Type.Optional(Type.Date()),
      })
    )
  ),
  'CIRCULAR.array_of_union_with_self_ref': c(
    Type.Recursive((This) => Type.Array(Type.Union([Type.Date(), Type.Number(), Type.String(), This])))
  ),
  'CIRCULAR.object_with_tuple_prop': c(
    Type.Recursive((This) =>
      Type.Object({
        tuple: Type.Union([Type.Tuple([Type.BigInt()]), Type.Tuple([Type.BigInt(), This])]),
      })
    )
  ),
  'CIRCULAR.object_with_index_prop': c(
    Type.Recursive((This) => Type.Object({index: Type.Record(Type.String(), This)}))
  ),
  'CIRCULAR.object_deeply_nested': c(
    Type.Recursive((This) =>
      Type.Object({
        deep1: Type.Object({
          deep2: Type.Object({
            deep3: Type.Object({deep4: Type.Optional(This)}),
          }),
        }),
      })
    )
  ),
  'CIRCULAR.circular_child_under_literal_root': c(
    Type.Object({
      isRoot: Type.Literal(true),
      ciChild: Type.Recursive((This) =>
        Type.Object({
          name: Type.String(),
          big: Type.BigInt(),
          embedded: Type.Object({hello: Type.String(), child: Type.Optional(This)}),
        })
      ),
    })
  ),
  'CIRCULAR.multiple_circular_types_cross_referenced': c(
    (() => {
      const ICircularDeep = Type.Recursive((This) =>
        Type.Object({
          name: Type.String(),
          big: Type.BigInt(),
          embedded: Type.Object({hello: Type.String(), child: Type.Optional(This)}),
        })
      );
      const ICircularDate = Type.Recursive((This) =>
        Type.Object({
          date: Type.Date(),
          month: Type.Number(),
          year: Type.Number(),
          embedded: Type.Optional(This),
        })
      );
      return Type.Recursive((This) =>
        Type.Object({
          isRoot: Type.Literal(true),
          ciChild: ICircularDeep,
          ciDate: ICircularDate,
          ciRoort: Type.Optional(This),
        })
      );
    })()
  ),

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED, // TypeBox Partial accepts Date/Map/Set for all-optional objects (missing plain-object guard)
  'UTILITY.required': c(
    Type.Required(Type.Object({name: Type.Optional(Type.String()), age: Type.Optional(Type.Number()), createdAt: Type.Optional(Type.Date())}))
  ),
  'UTILITY.pick': c(
    Type.Pick(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Date()}), ['name', 'createdAt'])
  ),
  'UTILITY.omit': c(
    Type.Omit(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Date()}), ['age'])
  ),
  'UTILITY.exclude_atomic': c(
    Type.Exclude(
      Type.Union([Type.Literal('name'), Type.Literal('age'), Type.Literal('createdAt')]),
      Type.Literal('age')
    )
  ),
  'UTILITY.extract_atomic': c(
    Type.Extract(
      Type.Union([Type.Literal('name'), Type.Literal('age'), Type.Literal('createdAt')]),
      Type.Union([Type.Literal('name'), Type.Literal('createdAt')])
    )
  ),
  'UTILITY.exclude_from_object_union': c(
    Type.Exclude(
      Type.Union([
        Type.Object({kind: Type.Literal('circle'), radius: Type.Number()}),
        Type.Object({kind: Type.Literal('square'), x: Type.Number()}),
        Type.Object({kind: Type.Literal('triangle'), base: Type.Number(), height: Type.Number()}),
      ]),
      Type.Object({kind: Type.Literal('circle'), radius: Type.Number()})
    )
  ),
  'UTILITY.non_nullable': c(
    Type.Exclude(
      Type.Union([Type.String(), Type.Number(), Type.Null(), Type.Undefined()]),
      Type.Union([Type.Null(), Type.Undefined()])
    )
  ),
  'UTILITY.return_type': c(Type.Date()),
  'UTILITY.readonly': c(Type.Object({name: Type.String(), age: Type.Number()})),
  'UTILITY.intersection_with_required_override': c(
    Type.Intersect([
      Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Date()})),
      Type.Required(Type.Pick(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Date()}), ['name'])),
    ])
  ),
  'UTILITY.omit_keeping_optional': c(
    Type.Omit(Type.Object({a: Type.String(), b: Type.Optional(Type.Number()), c: Type.Boolean()}), ['a'])
  ),
  'UTILITY.keyof_to_literal_union': c(
    Type.KeyOf(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Date()}))
  ),
  'UTILITY.typeof_variable_query': c(Type.Object({url: Type.String(), port: Type.Number()})),
  'UTILITY.indexed_access_type': c(Type.String()),
  'UTILITY.conditional_type_resolved': c(Type.Boolean()),
  'UTILITY.mapped_type_custom': c(
    Type.Object({
      a: Type.Union([Type.String(), Type.Null()]),
      b: Type.Union([Type.Number(), Type.Null()]),
    })
  ),
  'UTILITY.mapped_type_with_conditional_value': c(
    Type.Object({
      name: Type.Object({kind: Type.Literal('text'), value: Type.String()}),
      age: Type.Object({kind: Type.Literal('number'), value: Type.Number(), min: Type.Optional(Type.Number())}),
      admin: Type.Object({kind: Type.Literal('checkbox'), value: Type.Boolean()}),
    })
  ),
  'UTILITY.distributive_conditional_over_union': c(
    Type.Union([Type.Object({w: Type.String()}), Type.Object({w: Type.Number()})])
  ),
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED, // TypeBox Partial (all-optional) accepts Date for the outer object (missing plain-object guard)

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': c(Type.Object({user_id: Type.Number(), user_name: Type.String()})),
  'TYPE_MAPPINGS.key_conditional_rename': c(Type.Object({_id: Type.Number(), name: Type.String(), createdAt: Type.Date()})),
  'TYPE_MAPPINGS.key_filter_via_never': c(Type.Object({id: Type.Number(), name: Type.String()})),

  // ── DATETIME ──
  'DATETIME.date': c(Type.Date()),
  'DATETIME.instant': NOT_SUPPORTED, // no Temporal.Instant type in TypeBox
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // no Temporal.ZonedDateTime type in TypeBox
  'DATETIME.plainDate': NOT_SUPPORTED, // no Temporal.PlainDate type in TypeBox
  'DATETIME.plainTime': NOT_SUPPORTED, // no Temporal.PlainTime type in TypeBox
  'DATETIME.plainDateTime': NOT_SUPPORTED, // no Temporal.PlainDateTime type in TypeBox
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // no Temporal.PlainYearMonth type in TypeBox
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // no Temporal.PlainMonthDay type in TypeBox
  'DATETIME.duration': NOT_SUPPORTED, // no Temporal.Duration type in TypeBox

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': c(Type.String({maxLength: 5})),
  'STRING_FORMAT.string_minLength': c(Type.String({minLength: 3})),
  'STRING_FORMAT.string_length': c(Type.String({minLength: 4, maxLength: 4})),
  'STRING_FORMAT.string_range': c(Type.String({minLength: 2, maxLength: 4})),
  'STRING_FORMAT.string_allowedChars': c(Type.String({pattern: '^[0-9a-f]+$'})),
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED, // TypeBox patterns are case-sensitive; no regex flags support
  'STRING_FORMAT.string_allowedChars_literal': c(Type.String({pattern: '^[.\\-]+$'})),
  'STRING_FORMAT.string_disallowedChars': c(Type.String({pattern: '^[^!@#]*$'})),
  'STRING_FORMAT.string_allowedValues': c(Type.Union([Type.Literal('red'), Type.Literal('green'), Type.Literal('blue')])),
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED, // TypeBox patterns are case-sensitive; no regex flags support
  'STRING_FORMAT.string_allowedValues_escaped': c(Type.Union([Type.Literal('a.b'), Type.Literal('c+d')])),
  'STRING_FORMAT.string_disallowedValues': NOT_SUPPORTED, // no negative-match constraint in TypeBox (no Type.Not for values)
  'STRING_FORMAT.string_customErrorMessage': c(Type.Union([Type.Literal('a'), Type.Literal('b')])),
  'STRING_FORMAT.alpha': c(Type.String({pattern: '^[A-Za-z]+$'})),
  'STRING_FORMAT.alphaNumeric': c(Type.String({pattern: '^[A-Za-z0-9]+$'})),
  'STRING_FORMAT.numeric': c(Type.String({pattern: '^[0-9]+$'})),
  'STRING_FORMAT.alpha_withLength': c(Type.String({pattern: '^[A-Za-z]+$', maxLength: 3})),
  'STRING_FORMAT.lowercase_validate': c(Type.String()),
  'STRING_FORMAT.uuidv4': c(Type.String({pattern: UUID4})),
  'STRING_FORMAT.uuidv7': c(Type.String({pattern: UUID7})),
  'STRING_FORMAT.date_iso': NOT_SUPPORTED, // requires calendar-aware validation (leap year, month-day bounds)
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // requires calendar-aware validation (leap year, month-day bounds)
  'STRING_FORMAT.date_YM': NOT_SUPPORTED, // requires calendar-aware validation (month 1-12)
  'STRING_FORMAT.date_MD': NOT_SUPPORTED, // requires calendar-aware validation (Feb 29 without year)
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // requires date comparison semantics
  'STRING_FORMAT.time_iso': c(
    Type.String({
      pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](2[0-3]|[01][0-9]):[0-5][0-9])$',
    })
  ),
  'STRING_FORMAT.time_HHmmss': c(
    Type.String({pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$'})
  ),
  'STRING_FORMAT.time_HHmmss_ms': c(
    Type.String({pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?$'})
  ),
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // requires time comparison semantics
  'STRING_FORMAT.dateTime_default': NOT_SUPPORTED, // requires calendar-aware date validation (leap year)
  'STRING_FORMAT.dateTime_custom': NOT_SUPPORTED, // requires calendar-aware date validation
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // requires datetime comparison semantics
  'STRING_FORMAT.ipv4': c(Type.String({pattern: `^${IPV4_PAT}$`})),
  'STRING_FORMAT.ipv6': c(Type.String({pattern: `^${IPV6_PAT}$`})),
  'STRING_FORMAT.ip_any': c(Type.String({pattern: `^(${IPV4_PAT}|${IPV6_PAT})$`})),
  'STRING_FORMAT.ipv4_port': c(
    Type.String({pattern: `^${IPV4_PAT}:${PORT_PAT}$`})
  ),
  'STRING_FORMAT.ipv6_port': c(
    // Use simplified [hex:] bracket pattern to avoid TypeCompiler preflight rejection of nested alternation
    Type.String({pattern: `^[[0-9a-fA-F:]{2,39}]:${PORT_PAT}$`})
  ),
  'STRING_FORMAT.domain': c(
    Type.String({pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$'})
  ),
  'STRING_FORMAT.domainStrict': c(
    // max 5 subdomain labels + 1 TLD; TLD must be alpha-only (no punycode/numeric)
    Type.String({pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.]){1,5}[a-zA-Z]{2,}$'})
  ),
  'STRING_FORMAT.email': c(
    Type.String({pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$'})
  ),
  'STRING_FORMAT.emailPunycode': c(
    Type.String({
      pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+(xn--[a-zA-Z0-9]+|[a-zA-Z]{2,})$',
    })
  ),
  'STRING_FORMAT.emailStrict': c(
    // No + or space in local part; domain labels min 2 chars; underscore disallowed in domain
    Type.String({
      pattern: '^[a-zA-Z0-9.][a-zA-Z0-9._-]{0,62}@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
    })
  ),
  'STRING_FORMAT.url': c(
    Type.String({pattern: '^(https?|ftp|wss?)://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?([/:][^ ]*)?$'})
  ),
  'STRING_FORMAT.urlHttp': c(
    Type.String({pattern: '^https?://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?([/:][^ ]*)?$'})
  ),
  'STRING_FORMAT.urlFile': c(Type.String({pattern: '^file:///[^ ]*$'})),
  'STRING_FORMAT.pattern_slug': c(Type.String({pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'})),
  'STRING_FORMAT.pattern_hex': c(Type.String({pattern: '^[0-9a-fA-F]+$'})),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': c(Type.Number({maximum: 100})),
  'NUMBER_FORMAT.number_min': c(Type.Number({minimum: 0})),
  'NUMBER_FORMAT.number_lt': c(Type.Number({exclusiveMaximum: 10})),
  'NUMBER_FORMAT.number_gt': c(Type.Number({exclusiveMinimum: 0})),
  'NUMBER_FORMAT.number_integer': c(Type.Integer()),
  'NUMBER_FORMAT.number_float': NOT_SUPPORTED, // TypeBox has no non-integer constraint
  'NUMBER_FORMAT.number_multipleOf': c(Type.Number({multipleOf: 5})),
  'NUMBER_FORMAT.number_combined': c(Type.Integer({minimum: 0, maximum: 100, multipleOf: 5})),
  'NUMBER_FORMAT.number_int8': c(Type.Integer({minimum: -128, maximum: 127})),
  'NUMBER_FORMAT.number_uint8': c(Type.Integer({minimum: 0, maximum: 255})),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': c(Type.BigInt({maximum: 100n})),
  'BIGINT_FORMAT.bigint_min': c(Type.BigInt({minimum: 0n})),
  'BIGINT_FORMAT.bigint_lt': c(Type.BigInt({exclusiveMaximum: 10n})),
  'BIGINT_FORMAT.bigint_gt': c(Type.BigInt({exclusiveMinimum: 0n})),
  'BIGINT_FORMAT.bigint_multipleOf': NOT_SUPPORTED, // TypeBox compiles `value % BigInt(n) === 0` but 0n !== 0 (type mismatch bug)
  'BIGINT_FORMAT.bigint_combined': NOT_SUPPORTED, // multipleOf bug + min/max interaction
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // BigInt(9223372036854775807) rounds in float64 → wrong boundary
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // BigInt(18446744073709551615) rounds in float64 → wrong boundary

  // ── DATETIME (min/max + relative) ──
  'DATETIME.date_minmax': NOT_SUPPORTED, // requires Date comparison semantics
  'DATETIME.date_gtlt': NOT_SUPPORTED, // requires Date comparison semantics
  'DATETIME.date_min_lt': NOT_SUPPORTED, // requires Date comparison semantics
  'DATETIME.date_max_now': NOT_SUPPORTED, // requires relative time (now) semantics
  'DATETIME.date_rel_window': NOT_SUPPORTED, // requires relative time semantics
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED, // requires relative time semantics
  'DATETIME.instant_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.instant_rel': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // no Temporal types in TypeBox

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
