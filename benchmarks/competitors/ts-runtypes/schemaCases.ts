// ts-runtypes validators keyed by suite case key ("GROUP.case"), SCHEMA form
// (value-first). Each entry is the case's own `validateSchema` thunk copied
// VERBATIM from the shared suites (benchmarks/src/suites/**) — a
// `() => createValidate(RT.…)` arrow built from the `ts-runtypes/schema`
// builders instead of a literal type argument. Consumed by typecost ONLY (it is
// NOT imported by main.ts). Cases whose value-first form can't be authored
// (`validateSchema: 'not-supported'`) or that render an alwaysThrow factory
// (`factoryThrows`) opt out with NOT_SUPPORTED. TOTAL over every key.

import {createValidate} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

export const schemaCases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': () => createValidate(RT.any()),
  'ATOMIC.bigint': () => createValidate(RT.bigint()),
  'ATOMIC.boolean': () => createValidate(RT.boolean()),
  'ATOMIC.date': () => createValidate(RT.date()),
  'ATOMIC.enum_mixed': () => {
    enum Color {
      Red,
      Green = 'green',
      Blue = 2,
    }
    return createValidate(RT.enum(Color));
  },
  'ATOMIC.literal_2': () => createValidate(RT.literal(2)),
  'ATOMIC.literal_a': () => createValidate(RT.literal('a')),
  'ATOMIC.literal_true': () => createValidate(RT.literal(true)),
  'ATOMIC.literal_1n': () => createValidate(RT.literal(1n)),
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // validateSchema not-supported
  'ATOMIC.never': () => createValidate(RT.never()),
  'ATOMIC.null': () => createValidate(RT.literal(null)),
  'ATOMIC.number': () => createValidate(RT.number()),
  'ATOMIC.object': NOT_SUPPORTED, // validateSchema not-supported
  'ATOMIC.regexp': () => createValidate(RT.regexp()),
  'ATOMIC.string': () => createValidate(RT.string()),
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.undefined': () => createValidate(RT.literal(undefined)),
  'ATOMIC.void': () => createValidate(RT.void()),
  'ATOMIC.literal_2_noLiterals': () => createValidate(RT.literal(2), {noLiterals: true}),
  'ATOMIC.literal_a_noLiterals': () => createValidate(RT.literal('a'), {noLiterals: true}),
  'ATOMIC.literal_regexp_noLiterals': () => createValidate(RT.regexp(), {noLiterals: true}),
  'ATOMIC.literal_true_noLiterals': () => createValidate(RT.literal(true), {noLiterals: true}),
  'ATOMIC.literal_1n_noLiterals': () => createValidate(RT.literal(1n), {noLiterals: true}),
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.unknown': () => createValidate(RT.unknown()),

  // ── ARRAY ──
  'ARRAY.string_array': () => createValidate(RT.array(RT.string())),
  'ARRAY.number_array': () => createValidate(RT.array(RT.number())),
  'ARRAY.boolean_array': () => createValidate(RT.array(RT.boolean())),
  'ARRAY.bigint_array': () => createValidate(RT.array(RT.bigint())),
  'ARRAY.date_array': () => createValidate(RT.array(RT.date())),
  'ARRAY.regexp_array': () => createValidate(RT.array(RT.regexp())),
  'ARRAY.undefined_array': () => createValidate(RT.array(RT.literal(undefined))),
  'ARRAY.null_array': () => createValidate(RT.array(RT.literal(null))),
  'ARRAY.array_generic': () => createValidate(RT.array(RT.string())),
  'ARRAY.string_array_2d': () => createValidate(RT.array(RT.array(RT.string()))),
  'ARRAY.string_array_3d': () => createValidate(RT.array(RT.array(RT.array(RT.string())))),
  'ARRAY.string_array_noIsArrayCheck': () => createValidate(RT.array(RT.string()), {noIsArrayCheck: true}),
  'ARRAY.object_array': () => createValidate(RT.array(RT.object({a: RT.string()}))),
  'ARRAY.union_array': () => createValidate(RT.array(RT.union([RT.string(), RT.number()]))),
  'ARRAY.tuple_array': () => createValidate(RT.array(RT.tuple([RT.string(), RT.number()]))),
  'ARRAY.circular_array': () => {
    const ca = RT.circular((self) => RT.array(self));
    return createValidate(ca);
  },
  'ARRAY.circular_object_with_array': () => {
    const ot = RT.circular((self) =>
      RT.object({
        a: RT.string(),
        deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
        d: RT.optional(RT.array(self)),
      })
    );
    return createValidate(ot);
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': () => createValidate(RT.array(RT.string())),

  // ── OBJECT ──
  'OBJECT.simple_interface': () => createValidate(RT.object({a: RT.string(), b: RT.number()})),
  'OBJECT.object_as_const_literals': () =>
    createValidate(
      RT.object({name: RT.propMod({readonly: true}, RT.literal('john')), age: RT.propMod({readonly: true}, RT.literal(30))})
    ),
  'OBJECT.object_via_return_type_utility': () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
  'OBJECT.object_via_property_access': () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
  'OBJECT.object_via_array_access': () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
  'OBJECT.interface_with_optional': () => createValidate(RT.object({a: RT.string(), b: RT.optional(RT.number())})),
  'OBJECT.interface_with_date': () => createValidate(RT.object({date: RT.date(), name: RT.string()})),
  'OBJECT.interface_with_method': () => createValidate(RT.object({name: RT.string(), cb: RT.func([], RT.any())})),
  'OBJECT.nested_object': () => createValidate(RT.object({a: RT.string(), deep: RT.object({b: RT.string(), c: RT.number()})})),
  'OBJECT.interface_string_array_prop': () => createValidate(RT.object({tags: RT.array(RT.string())})),
  'OBJECT.circular_interface': () => {
    const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
    return createValidate(ic);
  },
  'OBJECT.circular_interface_on_array': () => {
    const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
    return createValidate(ica);
  },
  'OBJECT.circular_interface_on_nested_object': () => {
    const icd = RT.circular((self) =>
      RT.object({
        name: RT.string(),
        embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
      })
    );
    return createValidate(icd);
  },
  'OBJECT.index_signature_string': () => createValidate(RT.record(RT.string())),
  'OBJECT.index_signature_named_props': () =>
    createValidate(
      RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
    ),
  'OBJECT.index_signature_nested': () => createValidate(RT.record(RT.record(RT.number()))),
  'OBJECT.index_signature_date_value': () => createValidate(RT.record(RT.record(RT.date()))),
  'OBJECT.index_signature_non_root': () =>
    createValidate(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
  'OBJECT.function_top_level': () => createValidate(RT.func()),
  'OBJECT.interface_callable': () =>
    createValidate(RT.callable(RT.func([RT.number(), RT.boolean()], RT.string()), RT.object({extra: RT.string()}))),
  'OBJECT.interface_all_optional': () => createValidate(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.number())})),
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
    return createValidate(RT.classType(MySerializableClass));
  },
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
    return createValidate(RT.classType<RpcError<'test-error'>>(RpcError));
  },
  'OBJECT.call_signature_params': () => createValidate(RT.parameters(RT.func([RT.number(), RT.boolean()], RT.string()))),
  'OBJECT.call_signature_params_with_optional': () => createValidate(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], [RT.string()])))),
  'OBJECT.call_signature_params_with_rest': () => createValidate(RT.parameters(RT.func(RT.tuple([RT.number(), RT.boolean()], RT.date())))),
  'OBJECT.record_union_keys': () => createValidate(RT.object({a: RT.number(), b: RT.number()})),
  'OBJECT.union_value_index': () => createValidate(RT.record(RT.union([RT.string(), RT.number()]))),
  'OBJECT.object_with_union_prop': () => createValidate(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: RT.number()})),
  'OBJECT.interface_inheritance': () => createValidate(RT.object({a: RT.string(), b: RT.number()})),
  'OBJECT.class_inheritance': () => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    return createValidate(RT.classType(Sub));
  },
  'OBJECT.index_signature_number_key': () => createValidate(RT.record(RT.number(), RT.string())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': () => createValidate(RT.tuple([RT.string(), RT.number()])),
  'TUPLE.full_mion_tuple': () =>
    createValidate(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
  'TUPLE.tuple_with_optional': () => createValidate(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
  'TUPLE.nested_tuple_in_array': () => createValidate(RT.array(RT.tuple([RT.string(), RT.number()]))),
  'TUPLE.tuple_rest': () => createValidate(RT.tuple([RT.number()], RT.string())),
  'TUPLE.tuple_circular': NOT_SUPPORTED, // validateSchema not-supported
  'TUPLE.tuple_multiple_trailing_optionals': () => createValidate(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
  'TUPLE.tuple_named_labels': () => createValidate(RT.tuple([RT.string(), RT.number()])),
  'TUPLE.tuple_with_non_serializable': () => createValidate(RT.tuple([RT.number(), RT.func([], RT.any())])),
  'TUPLE.empty_tuple': () => createValidate(RT.tuple([])),
  'TUPLE.single_element_tuple': () => createValidate(RT.tuple([RT.string()])),
  'TUPLE.readonly_tuple': () => createValidate(RT.tuple([RT.string(), RT.number()])),

  // ── UNION ──
  'UNION.atomic_union': () => createValidate(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
  'UNION.string_literal_union': () => createValidate(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
  'UNION.large_union_eight_arms': () =>
    createValidate(
      RT.union([
        RT.literal('a'),
        RT.literal('b'),
        RT.number(),
        RT.boolean(),
        RT.literal(null),
        RT.object({a: RT.string()}),
        RT.object({a: RT.string(), b: RT.number()}),
        RT.object({c: RT.bigint()}),
      ])
    ),
  'UNION.string_or_number': () => createValidate(RT.union([RT.string(), RT.number()])),
  'UNION.union_of_array_types': () => createValidate(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean())])),
  'UNION.array_of_union': () => createValidate(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
  'UNION.union_of_object_shapes': () =>
    createValidate(
      RT.union([RT.object({a: RT.string(), aa: RT.boolean()}), RT.object({b: RT.number()}), RT.object({c: RT.bigint()})])
    ),
  'UNION.discriminated_union': () =>
    createValidate(
      RT.union([RT.object({kind: RT.literal('a'), n: RT.number()}), RT.object({kind: RT.literal('b'), s: RT.string()})])
    ),
  'UNION.circular_union': () => {
    const uc = RT.circular((self) =>
      RT.union([
        RT.date(),
        RT.number(),
        RT.string(),
        RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
        RT.array(self),
      ])
    );
    return createValidate(uc);
  },
  'UNION.union_with_methods': () =>
    createValidate(
      RT.union([
        RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
        RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
      ])
    ),
  'UNION.intersection_to_object': () => createValidate(RT.intersection(RT.object({a: RT.string()}), RT.object({b: RT.number()}))),
  'UNION.union_with_index_arm': () =>
    createValidate(
      RT.union([
        RT.object({a: RT.string(), aa: RT.boolean()}),
        RT.object({b: RT.number()}),
        RT.intersection(RT.record(RT.bigint()), RT.object({c: RT.bigint()})),
      ])
    ),
  'UNION.union_same_prop_different_types': () =>
    createValidate(
      RT.union([
        RT.object({type: RT.literal('a'), prop: RT.boolean()}),
        RT.object({type: RT.literal('b'), prop: RT.number()}),
        RT.object({type: RT.literal('c'), prop: RT.string()}),
      ])
    ),
  'UNION.union_mixed_arrays_and_objects': () =>
    createValidate(
      RT.union([
        RT.array(RT.string()),
        RT.array(RT.number()),
        RT.array(RT.boolean()),
        RT.object({a: RT.string(), aa: RT.boolean()}),
        RT.object({b: RT.number()}),
        RT.object({c: RT.bigint(), aa: RT.literal('string')}),
      ])
    ),
  'UNION.union_merged_property': () => createValidate(RT.union([RT.object({a: RT.boolean()}), RT.object({a: RT.number()})])),
  'UNION.union_mixed_with_index': () =>
    createValidate(
      RT.union([
        RT.array(RT.string()),
        RT.object({a: RT.string(), aa: RT.boolean()}),
        RT.object({b: RT.number()}),
        RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
        RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
      ])
    ),
  'UNION.union_with_any_fallback': () => createValidate(RT.any()),
  'UNION.union_with_unknown_fallback': () => createValidate(RT.unknown()),
  'UNION.union_subset_small_first': () => createValidate(RT.union([RT.object({a: RT.string()}), RT.object({a: RT.string(), b: RT.number()})])),
  'UNION.union_subset_nested_levels': () =>
    createValidate(
      RT.union([
        RT.object({x: RT.string()}),
        RT.object({x: RT.string(), y: RT.number()}),
        RT.object({x: RT.string(), y: RT.number(), z: RT.boolean()}),
      ])
    ),
  'UNION.union_subset_mixed_related_unrelated': () =>
    createValidate(
      RT.union([RT.object({id: RT.string()}), RT.object({id: RT.string(), name: RT.string()}), RT.object({value: RT.number()})])
    ),

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': () => createValidate(RT.templateLiteral(['api/user/', RT.number()])),
  'TEMPLATE_LITERAL.multi_segment_url': () =>
    createValidate(RT.templateLiteral(['/api/v', RT.number(), '/user/', RT.string(), '/posts/', RT.number()])),
  'TEMPLATE_LITERAL.leading_string_placeholder': () => createValidate(RT.templateLiteral([RT.string(), '/', RT.number()])),
  'TEMPLATE_LITERAL.regex_special_chars': () => createValidate(RT.templateLiteral(['(', RT.number(), ')'])),
  'TEMPLATE_LITERAL.template_literal_nested_in_object': () => createValidate(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
  'TEMPLATE_LITERAL.template_literal_index_key': () => createValidate(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
  'TEMPLATE_LITERAL.template_literal_union_placeholder': () => createValidate(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', RT.number()])),

  // ── NATIVE ──
  'NATIVE.map_string_number': () => createValidate(RT.map(RT.string(), RT.number())),
  'NATIVE.set_string': () => createValidate(RT.set(RT.string())),
  'NATIVE.promise_string': () => createValidate(RT.promise(RT.string())),
  'NATIVE.awaited_promise': () => createValidate(RT.string()),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': () => {
    const cir = RT.circular((self) =>
      RT.object({
        n: RT.number(),
        s: RT.string(),
        c: RT.optional(self),
        d: RT.optional(RT.date()),
      })
    );
    return createValidate(cir);
  },
  'CIRCULAR.array_of_union_with_self_ref': () => {
    const cu = RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])));
    return createValidate(cu);
  },
  'CIRCULAR.object_with_tuple_prop': () => {
    const ct = RT.circular((self) => RT.object({tuple: RT.tuple([RT.bigint()], [self])}));
    return createValidate(ct);
  },
  'CIRCULAR.object_with_index_prop': () => {
    const ci = RT.circular((self) => RT.object({index: RT.record(self)}));
    return createValidate(ci);
  },
  'CIRCULAR.object_deeply_nested': () => {
    const cd = RT.circular((self) =>
      RT.object({
        deep1: RT.object({
          deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})}),
        }),
      })
    );
    return createValidate(cd);
  },
  'CIRCULAR.circular_child_under_literal_root': () => {
    // The recursive child is a `circular(...)`; the non-circular root is a plain
    // schema referencing it — no hand-written types at all.
    const icd = RT.circular((self) =>
      RT.object({
        name: RT.string(),
        big: RT.bigint(),
        embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
      })
    );
    const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
    return createValidate(root);
  },
  'CIRCULAR.multiple_circular_types_cross_referenced': () => {
    // Mutual recursion, no types: each type's OWN back-edge uses `self`;
    // cross-references to an already-declared run-type are plain const refs.
    const icd = RT.circular((self) =>
      RT.object({
        name: RT.string(),
        big: RT.bigint(),
        embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
      })
    );
    const icDate = RT.circular((self) =>
      RT.object({
        date: RT.date(),
        month: RT.number(),
        year: RT.number(),
        embedded: RT.optional(self),
        deep: RT.optional(icd),
      })
    );
    const root = RT.circular((self) =>
      RT.object({
        isRoot: RT.literal(true),
        ciChild: icd,
        ciRoort: RT.optional(self),
        ciDate: icDate,
      })
    );
    return createValidate(root);
  },

  // ── UTILITY ──
  'UTILITY.partial': () => createValidate(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
  'UTILITY.required': () =>
    createValidate(
      RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
    ),
  'UTILITY.pick': () =>
    createValidate(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name', 'createdAt'])),
  'UTILITY.omit': () =>
    createValidate(RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['age'])),
  'UTILITY.exclude_atomic': () =>
    createValidate(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))),
  'UTILITY.extract_atomic': () =>
    createValidate(
      RT.extract(
        RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
        RT.union([RT.literal('name'), RT.literal('createdAt')])
      )
    ),
  'UTILITY.exclude_from_object_union': () =>
    createValidate(
      RT.exclude(
        RT.union([
          RT.object({kind: RT.literal('circle'), radius: RT.number()}),
          RT.object({kind: RT.literal('square'), x: RT.number()}),
          RT.object({kind: RT.literal('triangle'), base: RT.number(), height: RT.number()}),
        ]),
        RT.object({kind: RT.literal('circle')})
      )
    ),
  'UTILITY.non_nullable': () =>
    createValidate(RT.nonNullable(RT.union([RT.string(), RT.number(), RT.literal(null), RT.literal(undefined)]))),
  'UTILITY.return_type': () => createValidate(RT.returnType(RT.func([RT.number(), RT.boolean()], RT.date()))),
  'UTILITY.readonly': () => createValidate(RT.readonly(RT.object({name: RT.string(), age: RT.number()}))),
  'UTILITY.intersection_with_required_override': () =>
    createValidate(
      RT.intersection(
        RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()})),
        RT.required(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name']))
      )
    ),
  'UTILITY.omit_keeping_optional': () =>
    createValidate(RT.omit(RT.object({a: RT.string(), b: RT.optional(RT.number()), c: RT.boolean()}), ['a'])),
  'UTILITY.keyof_to_literal_union': () => createValidate(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
  'UTILITY.typeof_variable_query': () => createValidate(RT.object({url: RT.string(), port: RT.number()})),
  'UTILITY.indexed_access_type': () => createValidate(RT.string()),
  'UTILITY.conditional_type_resolved': () => createValidate(RT.boolean()),
  'UTILITY.mapped_type_custom': () =>
    createValidate(RT.object({a: RT.union([RT.string(), RT.literal(null)]), b: RT.union([RT.number(), RT.literal(null)])})),
  'UTILITY.mapped_type_with_conditional_value': () =>
    createValidate(
      RT.object({
        name: RT.object({kind: RT.literal('text'), value: RT.string()}),
        age: RT.object({kind: RT.literal('number'), value: RT.number(), min: RT.optional(RT.number())}),
        admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
      })
    ),
  'UTILITY.distributive_conditional_over_union': () => createValidate(RT.union([RT.object({w: RT.string()}), RT.object({w: RT.number()})])),
  'UTILITY.deep_partial_recursive_mapped': () =>
    createValidate(
      RT.object({
        display: RT.optional(
          RT.object({
            theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
            brightness: RT.optional(RT.number()),
          })
        ),
        audio: RT.optional(RT.object({volume: RT.optional(RT.number()), muted: RT.optional(RT.boolean())})),
      })
    ),

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': () => createValidate(RT.object({user_id: RT.number(), user_name: RT.string()})),
  'TYPE_MAPPINGS.key_conditional_rename': () => createValidate(RT.object({_id: RT.number(), name: RT.string(), createdAt: RT.date()})),
  'TYPE_MAPPINGS.key_filter_via_never': () => createValidate(RT.object({id: RT.number(), name: RT.string()})),

  // ── DATETIME ──
  'DATETIME.date': () => createValidate(RT.date()),
  'DATETIME.instant': () => createValidate(RT.temporal.instant()),
  'DATETIME.zonedDateTime': () => createValidate(RT.temporal.zonedDateTime()),
  'DATETIME.plainDate': () => createValidate(RT.temporal.plainDate()),
  'DATETIME.plainTime': () => createValidate(RT.temporal.plainTime()),
  'DATETIME.plainDateTime': () => createValidate(RT.temporal.plainDateTime()),
  'DATETIME.plainYearMonth': () => createValidate(RT.temporal.plainYearMonth()),
  'DATETIME.plainMonthDay': () => createValidate(RT.temporal.plainMonthDay()),
  'DATETIME.duration': () => createValidate(RT.temporal.duration()),

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': () => createValidate(RT.string({maxLength: 5})),
  'STRING_FORMAT.string_minLength': () => createValidate(RT.string({minLength: 3})),
  'STRING_FORMAT.string_length': () => createValidate(RT.string({length: 4})),
  'STRING_FORMAT.string_range': () => createValidate(RT.string({minLength: 2, maxLength: 4})),
  'STRING_FORMAT.string_allowedChars': () => createValidate(RT.string({allowedChars: {val: '0123456789abcdef'}})),
  'STRING_FORMAT.string_allowedChars_ignoreCase': () => createValidate(RT.string({allowedChars: {val: 'abc', ignoreCase: true}})),
  'STRING_FORMAT.string_allowedChars_literal': () => createValidate(RT.string({allowedChars: {val: '.-'}})),
  'STRING_FORMAT.string_disallowedChars': () => createValidate(RT.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
  'STRING_FORMAT.string_allowedValues': () => createValidate(RT.string({allowedValues: {val: ['red', 'green', 'blue']}})),
  'STRING_FORMAT.string_allowedValues_ignoreCase': () => createValidate(RT.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
  'STRING_FORMAT.string_allowedValues_escaped': () => createValidate(RT.string({allowedValues: {val: ['a.b', 'c+d']}})),
  'STRING_FORMAT.string_disallowedValues': () => createValidate(RT.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
  'STRING_FORMAT.string_customErrorMessage': () => createValidate(RT.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
  'STRING_FORMAT.alpha': () => createValidate(RT.alpha()),
  'STRING_FORMAT.alphaNumeric': () => createValidate(RT.alphaNumeric()),
  'STRING_FORMAT.numeric': () => createValidate(RT.numeric()),
  'STRING_FORMAT.alpha_withLength': () => createValidate(RT.alpha({maxLength: 3})),
  'STRING_FORMAT.lowercase_validate': () => createValidate(RT.lowercase()),
  'STRING_FORMAT.uuidv4': () => createValidate(RT.uuidv4()),
  'STRING_FORMAT.uuidv7': () => createValidate(RT.uuidv7()),
  'STRING_FORMAT.date_iso': () => createValidate(RT.stringDate()),
  'STRING_FORMAT.date_DMY': () => createValidate(RT.stringDate({format: 'DD-MM-YYYY'})),
  'STRING_FORMAT.date_YM': () => createValidate(RT.stringDate({format: 'YYYY-MM'})),
  'STRING_FORMAT.date_MD': () => createValidate(RT.stringDate({format: 'MM-DD'})),
  'STRING_FORMAT.date_minMax_absolute': () => createValidate(RT.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
  'STRING_FORMAT.time_iso': () => createValidate(RT.stringTime()),
  'STRING_FORMAT.time_HHmmss': () => createValidate(RT.stringTime({format: 'HH:mm:ss'})),
  'STRING_FORMAT.time_HHmmss_ms': () => createValidate(RT.stringTime({format: 'HH:mm:ss[.mmm]'})),
  'STRING_FORMAT.time_minMax_absolute': () => createValidate(RT.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
  'STRING_FORMAT.dateTime_default': () => createValidate(RT.stringDateTime()),
  'STRING_FORMAT.dateTime_custom': () =>
    createValidate(RT.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
  'STRING_FORMAT.dateTime_minMax_absolute': () =>
    createValidate(
      RT.stringDateTime({
        date: {format: 'YYYY-MM-DD'},
        time: {format: 'HH:mm:ss'},
        splitChar: 'T',
        min: '2020-01-01T00:00:00',
        max: '2020-12-31T23:59:59',
      })
    ),
  'STRING_FORMAT.ipv4': () => createValidate(RT.ipv4()),
  'STRING_FORMAT.ipv6': () => createValidate(RT.ipv6()),
  'STRING_FORMAT.ip_any': () => createValidate(RT.ip()),
  'STRING_FORMAT.ipv4_port': () => createValidate(RT.ipv4WithPort()),
  'STRING_FORMAT.ipv6_port': () => createValidate(RT.ipv6WithPort()),
  'STRING_FORMAT.domain': () => createValidate(RT.domain()),
  'STRING_FORMAT.domainStrict': () => createValidate(RT.domainStrict()),
  'STRING_FORMAT.email': () => createValidate(RT.email()),
  'STRING_FORMAT.emailPunycode': () => createValidate(RT.emailPunycode()),
  'STRING_FORMAT.emailStrict': () => createValidate(RT.emailStrict()),
  'STRING_FORMAT.url': () => createValidate(RT.url()),
  'STRING_FORMAT.urlHttp': () => createValidate(RT.urlHttp()),
  'STRING_FORMAT.urlFile': () => createValidate(RT.urlFile()),
  'STRING_FORMAT.pattern_slug': () =>
    createValidate(
      RT.string({
        pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
      })
    ),
  'STRING_FORMAT.pattern_hex': () =>
    createValidate(RT.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': () => createValidate(RT.number({max: 100})),
  'NUMBER_FORMAT.number_min': () => createValidate(RT.number({min: 0})),
  'NUMBER_FORMAT.number_lt': () => createValidate(RT.number({lt: 10})),
  'NUMBER_FORMAT.number_gt': () => createValidate(RT.number({gt: 0})),
  'NUMBER_FORMAT.number_integer': () => createValidate(RT.integer()),
  'NUMBER_FORMAT.number_float': () => createValidate(RT.float()),
  'NUMBER_FORMAT.number_multipleOf': () => createValidate(RT.number({multipleOf: 5})),
  'NUMBER_FORMAT.number_combined': () => createValidate(RT.number({min: 0, max: 100, integer: true, multipleOf: 5})),
  'NUMBER_FORMAT.number_int8': () => createValidate(RT.int8()),
  'NUMBER_FORMAT.number_uint8': () => createValidate(RT.uint8()),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': () => createValidate(RT.bigint({max: 100n})),
  'BIGINT_FORMAT.bigint_min': () => createValidate(RT.bigint({min: 0n})),
  'BIGINT_FORMAT.bigint_lt': () => createValidate(RT.bigint({lt: 10n})),
  'BIGINT_FORMAT.bigint_gt': () => createValidate(RT.bigint({gt: 0n})),
  'BIGINT_FORMAT.bigint_multipleOf': () => createValidate(RT.bigint({multipleOf: 5n})),
  'BIGINT_FORMAT.bigint_combined': () => createValidate(RT.bigint({min: 0n, max: 1000n, multipleOf: 10n})),
  'BIGINT_FORMAT.bigint_int64': () => createValidate(RT.bigInt64()),
  'BIGINT_FORMAT.bigint_uint64': () => createValidate(RT.bigUInt64()),

  // ── DATETIME ──
  'DATETIME.date_minmax': () => createValidate(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
  'DATETIME.date_gtlt': () => createValidate(RT.date({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.date_min_lt': () => createValidate(RT.date({min: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.date_max_now': () => createValidate(RT.date({max: 'now'})),
  'DATETIME.date_rel_window': () => createValidate(RT.date({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.date_rel_datetime_components': () => createValidate(RT.date({min: 'now-P1000YT12H'})),
  'DATETIME.instant_minmax': () => createValidate(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
  'DATETIME.instant_gtlt': () => createValidate(RT.temporal.instant({gt: '2020-01-01T00:00:00Z', lt: '2020-12-31T23:59:59Z'})),
  'DATETIME.instant_rel': () => createValidate(RT.temporal.instant({min: 'now-PT8760000H', max: 'now+PT8760000H'})),
  'DATETIME.plainDate_minmax': () => createValidate(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
  'DATETIME.plainDate_gtlt': () => createValidate(RT.temporal.plainDate({gt: '2020-01-01', lt: '2020-12-31'})),
  'DATETIME.plainDate_min_lt': () => createValidate(RT.temporal.plainDate({min: '2020-01-01', lt: '2020-01-10'})),
  'DATETIME.plainDate_gt_max': () => createValidate(RT.temporal.plainDate({gt: '2020-01-01', max: '2020-01-10'})),
  'DATETIME.plainDate_min_only': () => createValidate(RT.temporal.plainDate({min: '2020-01-01'})),
  'DATETIME.plainDate_max_only': () => createValidate(RT.temporal.plainDate({max: '2020-12-31'})),
  'DATETIME.plainDate_gt_only': () => createValidate(RT.temporal.plainDate({gt: '2020-01-01'})),
  'DATETIME.plainDate_lt_only': () => createValidate(RT.temporal.plainDate({lt: '2020-12-31'})),
  'DATETIME.plainDate_rel_window': () => createValidate(RT.temporal.plainDate({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.plainDate_rel_ymd': () => createValidate(RT.temporal.plainDate({min: 'now-P100Y6M15D'})),
  'DATETIME.plainDate_rel_weeks': () => createValidate(RT.temporal.plainDate({min: 'now-P52200W'})),
  'DATETIME.plainTime_minmax': () => createValidate(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
  'DATETIME.plainTime_gtlt': () => createValidate(RT.temporal.plainTime({gt: '09:00:00', lt: '17:00:00'})),
  'DATETIME.plainDateTime_minmax': () => createValidate(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
  'DATETIME.plainDateTime_gtlt': () => createValidate(RT.temporal.plainDateTime({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.plainDateTime_rel': () => createValidate(RT.temporal.plainDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.plainDateTime_rel_combo': () => createValidate(RT.temporal.plainDateTime({min: 'now-P500YT12H'})),
  'DATETIME.plainYearMonth_minmax': () => createValidate(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
  'DATETIME.plainYearMonth_gtlt': () => createValidate(RT.temporal.plainYearMonth({gt: '2020-01', lt: '2020-12'})),
  'DATETIME.plainYearMonth_rel': () => createValidate(RT.temporal.plainYearMonth({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.zonedDateTime_minmax': () =>
    createValidate(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
  'DATETIME.zonedDateTime_gtlt': () =>
    createValidate(RT.temporal.zonedDateTime({gt: '2020-01-01T00:00:00[UTC]', lt: '2020-12-31T23:59:59[UTC]'})),
  'DATETIME.zonedDateTime_rel': () => createValidate(RT.temporal.zonedDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),

  // ── REALWORLD ──
  'REALWORLD.user': () =>
    createValidate(
      RT.object({
        id: RT.number(),
        email: RT.string(),
        name: RT.string(),
        age: RT.optional(RT.number()),
        roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
        active: RT.boolean(),
        createdAt: RT.string(),
      })
    ),
  'REALWORLD.order': () =>
    createValidate(
      RT.object({
        id: RT.string(),
        customer: RT.object({id: RT.number(), email: RT.string()}),
        items: RT.array(RT.object({sku: RT.string(), name: RT.string(), qty: RT.number(), price: RT.number()})),
        shipping: RT.object({
          street: RT.string(),
          city: RT.string(),
          state: RT.string(),
          zip: RT.string(),
          country: RT.string(),
        }),
        status: RT.union([
          RT.literal('pending'),
          RT.literal('paid'),
          RT.literal('shipped'),
          RT.literal('delivered'),
          RT.literal('cancelled'),
        ]),
        total: RT.number(),
        note: RT.optional(RT.string()),
      })
    ),
  'REALWORLD.blogPost': () =>
    createValidate(
      RT.object({
        id: RT.number(),
        title: RT.string(),
        slug: RT.string(),
        body: RT.string(),
        tags: RT.array(RT.string()),
        author: RT.object({name: RT.string(), email: RT.string()}),
        published: RT.boolean(),
        publishedAt: RT.optional(RT.string()),
        meta: RT.object({views: RT.number(), likes: RT.number()}),
      })
    ),
  'REALWORLD.product': () =>
    createValidate(
      RT.object({
        id: RT.string(),
        name: RT.string(),
        description: RT.string(),
        price: RT.number(),
        currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
        inStock: RT.boolean(),
        categories: RT.array(RT.string()),
        dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
      })
    ),
  'REALWORLD.productPage': () =>
    createValidate(
      RT.object({
        data: RT.array(
          RT.object({
            id: RT.string(),
            name: RT.string(),
            description: RT.string(),
            price: RT.number(),
            currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
            inStock: RT.boolean(),
            categories: RT.array(RT.string()),
            dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
          })
        ),
        page: RT.number(),
        pageSize: RT.number(),
        total: RT.number(),
        hasMore: RT.boolean(),
      })
    ),
  'REALWORLD.registrationForm': () =>
    createValidate(
      RT.object({
        email: RT.string(),
        password: RT.string(),
        acceptedTerms: RT.literal(true),
        profile: RT.object({
          firstName: RT.string(),
          lastName: RT.string(),
          age: RT.optional(RT.number()),
        }),
      })
    ),
};
