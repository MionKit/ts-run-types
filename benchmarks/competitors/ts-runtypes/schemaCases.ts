// ts-runtypes validators keyed by suite case key ("GROUP.case"), SCHEMA form
// (value-first). Each entry is the case's own `validateSchema` thunk copied
// VERBATIM from the shared suites (benchmarks/src/suites/**) — a
// `() => createValidate(RT.…)` arrow built from the `ts-runtypes/schema`
// builders instead of a literal type argument. Consumed by typecost ONLY (it is
// NOT imported by main.ts). Cases whose value-first form can't be authored
// (`validateSchema: 'not-supported'`) or that render an alwaysThrow factory
// (`factoryThrows`) opt out with NOT_SUPPORTED. TOTAL over every key.

import * as TF from 'ts-runtypes/formats';
import * as TFT from 'ts-runtypes/formats/temporal';
import {createValidate} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

export const schemaCases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': () => createValidate(RT.any()),
  'ATOMIC.bigint': () => createValidate(TF.bigInt()),
  'ATOMIC.boolean': () => createValidate(RT.boolean()),
  'ATOMIC.date': () => createValidate(TF.date()),
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
  'ATOMIC.number': () => createValidate(TF.number()),
  'ATOMIC.object': NOT_SUPPORTED, // validateSchema not-supported
  'ATOMIC.regexp': () => createValidate(RT.regexp()),
  'ATOMIC.string': () => createValidate(TF.string()),
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
  'ARRAY.string_array': () => createValidate(RT.array(TF.string())),
  'ARRAY.number_array': () => createValidate(RT.array(TF.number())),
  'ARRAY.boolean_array': () => createValidate(RT.array(RT.boolean())),
  'ARRAY.bigint_array': () => createValidate(RT.array(TF.bigInt())),
  'ARRAY.date_array': () => createValidate(RT.array(TF.date())),
  'ARRAY.regexp_array': () => createValidate(RT.array(RT.regexp())),
  'ARRAY.undefined_array': () => createValidate(RT.array(RT.literal(undefined))),
  'ARRAY.null_array': () => createValidate(RT.array(RT.literal(null))),
  'ARRAY.array_generic': () => createValidate(RT.array(TF.string())),
  'ARRAY.string_array_2d': () => createValidate(RT.array(RT.array(TF.string()))),
  'ARRAY.string_array_3d': () => createValidate(RT.array(RT.array(RT.array(TF.string())))),
  'ARRAY.string_array_noIsArrayCheck': () => createValidate(RT.array(TF.string()), {noIsArrayCheck: true}),
  'ARRAY.object_array': () => createValidate(RT.array(RT.object({a: TF.string()}))),
  'ARRAY.union_array': () => createValidate(RT.array(RT.union([TF.string(), TF.number()]))),
  'ARRAY.tuple_array': () => createValidate(RT.array(RT.tuple([TF.string(), TF.number()]))),
  'ARRAY.circular_array': () => {
    const ca = RT.circular((self) => RT.array(self));
    return createValidate(ca);
  },
  'ARRAY.circular_object_with_array': () => {
    const ot = RT.circular((self) =>
      RT.object({
        a: TF.string(),
        deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
        d: RT.optional(RT.array(self)),
      })
    );
    return createValidate(ot);
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': () => createValidate(RT.array(TF.string())),

  // ── OBJECT ──
  'OBJECT.simple_interface': () => createValidate(RT.object({a: TF.string(), b: TF.number()})),
  'OBJECT.object_as_const_literals': () =>
    createValidate(
      RT.object({name: RT.propMod({readonly: true}, RT.literal('john')), age: RT.propMod({readonly: true}, RT.literal(30))})
    ),
  'OBJECT.object_via_return_type_utility': () => createValidate(RT.object({id: TF.number(), name: TF.string()})),
  'OBJECT.object_via_property_access': () => createValidate(RT.object({id: TF.number(), name: TF.string()})),
  'OBJECT.object_via_array_access': () => createValidate(RT.object({id: TF.number(), name: TF.string()})),
  'OBJECT.interface_with_optional': () => createValidate(RT.object({a: TF.string(), b: RT.optional(TF.number())})),
  'OBJECT.interface_with_date': () => createValidate(RT.object({date: TF.date(), name: TF.string()})),
  'OBJECT.interface_with_method': () => createValidate(RT.object({name: TF.string(), cb: RT.func([], RT.any())})),
  'OBJECT.nested_object': () => createValidate(RT.object({a: TF.string(), deep: RT.object({b: TF.string(), c: TF.number()})})),
  'OBJECT.interface_string_array_prop': () => createValidate(RT.object({tags: RT.array(TF.string())})),
  'OBJECT.circular_interface': () => {
    const ic = RT.circular((self) => RT.object({name: TF.string(), child: RT.optional(self)}));
    return createValidate(ic);
  },
  'OBJECT.circular_interface_on_array': () => {
    const ica = RT.circular((self) => RT.object({name: TF.string(), children: RT.optional(RT.array(self))}));
    return createValidate(ica);
  },
  'OBJECT.circular_interface_on_nested_object': () => {
    const icd = RT.circular((self) =>
      RT.object({
        name: TF.string(),
        embedded: RT.object({hello: TF.string(), child: RT.optional(self)}),
      })
    );
    return createValidate(icd);
  },
  'OBJECT.index_signature_string': () => createValidate(RT.record(TF.string())),
  'OBJECT.index_signature_named_props': () =>
    createValidate(
      RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
    ),
  'OBJECT.index_signature_nested': () => createValidate(RT.record(RT.record(TF.number()))),
  'OBJECT.index_signature_date_value': () => createValidate(RT.record(RT.record(TF.date()))),
  'OBJECT.index_signature_non_root': () =>
    createValidate(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
  'OBJECT.function_top_level': () => createValidate(RT.func()),
  'OBJECT.interface_callable': () =>
    createValidate(RT.callable(RT.func([TF.number(), RT.boolean()], TF.string()), RT.object({extra: TF.string()}))),
  'OBJECT.interface_all_optional': () => createValidate(RT.object({a: RT.optional(TF.string()), b: RT.optional(TF.number())})),
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
  'OBJECT.call_signature_params': () => createValidate(RT.parameters(RT.func([TF.number(), RT.boolean()], TF.string()))),
  'OBJECT.call_signature_params_with_optional': () => createValidate(RT.parameters(RT.func(RT.tuple([TF.number(), RT.boolean()], [TF.string()])))),
  'OBJECT.call_signature_params_with_rest': () => createValidate(RT.parameters(RT.func(RT.tuple([TF.number(), RT.boolean()], TF.date())))),
  'OBJECT.record_union_keys': () => createValidate(RT.object({a: TF.number(), b: TF.number()})),
  'OBJECT.union_value_index': () => createValidate(RT.record(RT.union([TF.string(), TF.number()]))),
  'OBJECT.object_with_union_prop': () => createValidate(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: TF.number()})),
  'OBJECT.interface_inheritance': () => createValidate(RT.object({a: TF.string(), b: TF.number()})),
  'OBJECT.class_inheritance': () => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    return createValidate(RT.classType(Sub));
  },
  'OBJECT.index_signature_number_key': () => createValidate(RT.record(TF.number(), TF.string())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': () => createValidate(RT.tuple([TF.string(), TF.number()])),
  'TUPLE.full_mion_tuple': () =>
    createValidate(RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])),
  'TUPLE.tuple_with_optional': () => createValidate(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
  'TUPLE.nested_tuple_in_array': () => createValidate(RT.array(RT.tuple([TF.string(), TF.number()]))),
  'TUPLE.tuple_rest': () => createValidate(RT.tuple([TF.number()], TF.string())),
  'TUPLE.tuple_circular': NOT_SUPPORTED, // validateSchema not-supported
  'TUPLE.tuple_multiple_trailing_optionals': () => createValidate(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
  'TUPLE.tuple_named_labels': () => createValidate(RT.tuple([TF.string(), TF.number()])),
  'TUPLE.tuple_with_non_serializable': () => createValidate(RT.tuple([TF.number(), RT.func([], RT.any())])),
  'TUPLE.empty_tuple': () => createValidate(RT.tuple([])),
  'TUPLE.single_element_tuple': () => createValidate(RT.tuple([TF.string()])),
  'TUPLE.readonly_tuple': () => createValidate(RT.tuple([TF.string(), TF.number()])),

  // ── UNION ──
  'UNION.atomic_union': () => createValidate(RT.union([TF.date(), TF.number(), TF.string(), RT.literal(null), TF.bigInt()])),
  'UNION.string_literal_union': () => createValidate(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
  'UNION.large_union_eight_arms': () =>
    createValidate(
      RT.union([
        RT.literal('a'),
        RT.literal('b'),
        TF.number(),
        RT.boolean(),
        RT.literal(null),
        RT.object({a: TF.string()}),
        RT.object({a: TF.string(), b: TF.number()}),
        RT.object({c: TF.bigInt()}),
      ])
    ),
  'UNION.string_or_number': () => createValidate(RT.union([TF.string(), TF.number()])),
  'UNION.union_of_array_types': () => createValidate(RT.union([RT.array(TF.string()), RT.array(TF.number()), RT.array(RT.boolean())])),
  'UNION.array_of_union': () => createValidate(RT.array(RT.union([TF.string(), TF.bigInt(), RT.boolean(), TF.date()]))),
  'UNION.union_of_object_shapes': () =>
    createValidate(
      RT.union([RT.object({a: TF.string(), aa: RT.boolean()}), RT.object({b: TF.number()}), RT.object({c: TF.bigInt()})])
    ),
  'UNION.discriminated_union': () =>
    createValidate(
      RT.union([RT.object({kind: RT.literal('a'), n: TF.number()}), RT.object({kind: RT.literal('b'), s: TF.string()})])
    ),
  'UNION.circular_union': () => {
    const uc = RT.circular((self) =>
      RT.union([
        TF.date(),
        TF.number(),
        TF.string(),
        RT.object({a: RT.optional(self), b: RT.optional(TF.string())}),
        RT.array(self),
      ])
    );
    return createValidate(uc);
  },
  'UNION.union_with_methods': () =>
    createValidate(
      RT.union([
        RT.object({name: TF.string(), getName: RT.func([], TF.string())}),
        RT.object({age: TF.number(), getAge: RT.func([], TF.number())}),
      ])
    ),
  'UNION.intersection_to_object': () => createValidate(RT.intersection(RT.object({a: TF.string()}), RT.object({b: TF.number()}))),
  'UNION.union_with_index_arm': () =>
    createValidate(
      RT.union([
        RT.object({a: TF.string(), aa: RT.boolean()}),
        RT.object({b: TF.number()}),
        RT.intersection(RT.record(TF.bigInt()), RT.object({c: TF.bigInt()})),
      ])
    ),
  'UNION.union_same_prop_different_types': () =>
    createValidate(
      RT.union([
        RT.object({type: RT.literal('a'), prop: RT.boolean()}),
        RT.object({type: RT.literal('b'), prop: TF.number()}),
        RT.object({type: RT.literal('c'), prop: TF.string()}),
      ])
    ),
  'UNION.union_mixed_arrays_and_objects': () =>
    createValidate(
      RT.union([
        RT.array(TF.string()),
        RT.array(TF.number()),
        RT.array(RT.boolean()),
        RT.object({a: TF.string(), aa: RT.boolean()}),
        RT.object({b: TF.number()}),
        RT.object({c: TF.bigInt(), aa: RT.literal('string')}),
      ])
    ),
  'UNION.union_merged_property': () => createValidate(RT.union([RT.object({a: RT.boolean()}), RT.object({a: TF.number()})])),
  'UNION.union_mixed_with_index': () =>
    createValidate(
      RT.union([
        RT.array(TF.string()),
        RT.object({a: TF.string(), aa: RT.boolean()}),
        RT.object({b: TF.number()}),
        RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()})),
        RT.intersection(RT.record(TF.bigInt()), RT.object({b: TF.bigInt()})),
      ])
    ),
  'UNION.union_with_any_fallback': () => createValidate(RT.any()),
  'UNION.union_with_unknown_fallback': () => createValidate(RT.unknown()),
  'UNION.union_subset_small_first': () => createValidate(RT.union([RT.object({a: TF.string()}), RT.object({a: TF.string(), b: TF.number()})])),
  'UNION.union_subset_nested_levels': () =>
    createValidate(
      RT.union([
        RT.object({x: TF.string()}),
        RT.object({x: TF.string(), y: TF.number()}),
        RT.object({x: TF.string(), y: TF.number(), z: RT.boolean()}),
      ])
    ),
  'UNION.union_subset_mixed_related_unrelated': () =>
    createValidate(
      RT.union([RT.object({id: TF.string()}), RT.object({id: TF.string(), name: TF.string()}), RT.object({value: TF.number()})])
    ),

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': () => createValidate(RT.templateLiteral(['api/user/', TF.number()])),
  'TEMPLATE_LITERAL.multi_segment_url': () =>
    createValidate(RT.templateLiteral(['/api/v', TF.number(), '/user/', TF.string(), '/posts/', TF.number()])),
  'TEMPLATE_LITERAL.leading_string_placeholder': () => createValidate(RT.templateLiteral([TF.string(), '/', TF.number()])),
  'TEMPLATE_LITERAL.regex_special_chars': () => createValidate(RT.templateLiteral(['(', TF.number(), ')'])),
  'TEMPLATE_LITERAL.template_literal_nested_in_object': () => createValidate(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
  'TEMPLATE_LITERAL.template_literal_index_key': () => createValidate(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
  'TEMPLATE_LITERAL.template_literal_union_placeholder': () => createValidate(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', TF.number()])),

  // ── NATIVE ──
  'NATIVE.map_string_number': () => createValidate(RT.map(TF.string(), TF.number())),
  'NATIVE.set_string': () => createValidate(RT.set(TF.string())),
  'NATIVE.promise_string': () => createValidate(RT.promise(TF.string())),
  'NATIVE.awaited_promise': () => createValidate(TF.string()),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': () => {
    const cir = RT.circular((self) =>
      RT.object({
        n: TF.number(),
        s: TF.string(),
        c: RT.optional(self),
        d: RT.optional(TF.date()),
      })
    );
    return createValidate(cir);
  },
  'CIRCULAR.array_of_union_with_self_ref': () => {
    const cu = RT.circular((self) => RT.array(RT.union([self, TF.date(), TF.number(), TF.string()])));
    return createValidate(cu);
  },
  'CIRCULAR.object_with_tuple_prop': () => {
    const ct = RT.circular((self) => RT.object({tuple: RT.tuple([TF.bigInt()], [self])}));
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
        name: TF.string(),
        big: TF.bigInt(),
        embedded: RT.object({hello: TF.string(), child: RT.optional(self)}),
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
        name: TF.string(),
        big: TF.bigInt(),
        embedded: RT.object({hello: TF.string(), child: RT.optional(self)}),
      })
    );
    const icDate = RT.circular((self) =>
      RT.object({
        date: TF.date(),
        month: TF.number(),
        year: TF.number(),
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
  'UTILITY.partial': () => createValidate(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
  'UTILITY.required': () =>
    createValidate(
      RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
    ),
  'UTILITY.pick': () =>
    createValidate(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name', 'createdAt'])),
  'UTILITY.omit': () =>
    createValidate(RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['age'])),
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
          RT.object({kind: RT.literal('circle'), radius: TF.number()}),
          RT.object({kind: RT.literal('square'), x: TF.number()}),
          RT.object({kind: RT.literal('triangle'), base: TF.number(), height: TF.number()}),
        ]),
        RT.object({kind: RT.literal('circle')})
      )
    ),
  'UTILITY.non_nullable': () =>
    createValidate(RT.nonNullable(RT.union([TF.string(), TF.number(), RT.literal(null), RT.literal(undefined)]))),
  'UTILITY.return_type': () => createValidate(RT.returnType(RT.func([TF.number(), RT.boolean()], TF.date()))),
  'UTILITY.readonly': () => createValidate(RT.readonly(RT.object({name: TF.string(), age: TF.number()}))),
  'UTILITY.intersection_with_required_override': () =>
    createValidate(
      RT.intersection(
        RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()})),
        RT.required(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name']))
      )
    ),
  'UTILITY.omit_keeping_optional': () =>
    createValidate(RT.omit(RT.object({a: TF.string(), b: RT.optional(TF.number()), c: RT.boolean()}), ['a'])),
  'UTILITY.keyof_to_literal_union': () => createValidate(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
  'UTILITY.typeof_variable_query': () => createValidate(RT.object({url: TF.string(), port: TF.number()})),
  'UTILITY.indexed_access_type': () => createValidate(TF.string()),
  'UTILITY.conditional_type_resolved': () => createValidate(RT.boolean()),
  'UTILITY.mapped_type_custom': () =>
    createValidate(RT.object({a: RT.union([TF.string(), RT.literal(null)]), b: RT.union([TF.number(), RT.literal(null)])})),
  'UTILITY.mapped_type_with_conditional_value': () =>
    createValidate(
      RT.object({
        name: RT.object({kind: RT.literal('text'), value: TF.string()}),
        age: RT.object({kind: RT.literal('number'), value: TF.number(), min: RT.optional(TF.number())}),
        admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
      })
    ),
  'UTILITY.distributive_conditional_over_union': () => createValidate(RT.union([RT.object({w: TF.string()}), RT.object({w: TF.number()})])),
  'UTILITY.deep_partial_recursive_mapped': () =>
    createValidate(
      RT.object({
        display: RT.optional(
          RT.object({
            theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
            brightness: RT.optional(TF.number()),
          })
        ),
        audio: RT.optional(RT.object({volume: RT.optional(TF.number()), muted: RT.optional(RT.boolean())})),
      })
    ),

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': () => createValidate(RT.object({user_id: TF.number(), user_name: TF.string()})),
  'TYPE_MAPPINGS.key_conditional_rename': () => createValidate(RT.object({_id: TF.number(), name: TF.string(), createdAt: TF.date()})),
  'TYPE_MAPPINGS.key_filter_via_never': () => createValidate(RT.object({id: TF.number(), name: TF.string()})),

  // ── DATETIME ──
  'DATETIME.date': () => createValidate(TF.date()),
  'DATETIME.instant': () => createValidate(TFT.instant()),
  'DATETIME.zonedDateTime': () => createValidate(TFT.zonedDateTime()),
  'DATETIME.plainDate': () => createValidate(TFT.plainDate()),
  'DATETIME.plainTime': () => createValidate(TFT.plainTime()),
  'DATETIME.plainDateTime': () => createValidate(TFT.plainDateTime()),
  'DATETIME.plainYearMonth': () => createValidate(TFT.plainYearMonth()),
  'DATETIME.plainMonthDay': () => createValidate(TFT.plainMonthDay()),
  'DATETIME.duration': () => createValidate(TFT.duration()),

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': () => createValidate(TF.string({maxLength: 5})),
  'STRING_FORMAT.string_minLength': () => createValidate(TF.string({minLength: 3})),
  'STRING_FORMAT.string_length': () => createValidate(TF.string({length: 4})),
  'STRING_FORMAT.string_range': () => createValidate(TF.string({minLength: 2, maxLength: 4})),
  'STRING_FORMAT.string_allowedChars': () => createValidate(TF.string({allowedChars: {val: '0123456789abcdef'}})),
  'STRING_FORMAT.string_allowedChars_ignoreCase': () => createValidate(TF.string({allowedChars: {val: 'abc', ignoreCase: true}})),
  'STRING_FORMAT.string_allowedChars_literal': () => createValidate(TF.string({allowedChars: {val: '.-'}})),
  'STRING_FORMAT.string_disallowedChars': () => createValidate(TF.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
  'STRING_FORMAT.string_allowedValues': () => createValidate(TF.string({allowedValues: {val: ['red', 'green', 'blue']}})),
  'STRING_FORMAT.string_allowedValues_ignoreCase': () => createValidate(TF.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
  'STRING_FORMAT.string_allowedValues_escaped': () => createValidate(TF.string({allowedValues: {val: ['a.b', 'c+d']}})),
  'STRING_FORMAT.string_disallowedValues': () => createValidate(TF.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
  'STRING_FORMAT.string_customErrorMessage': () => createValidate(TF.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
  'STRING_FORMAT.alpha': () => createValidate(TF.alpha()),
  'STRING_FORMAT.alphaNumeric': () => createValidate(TF.alphaNumeric()),
  'STRING_FORMAT.numeric': () => createValidate(TF.numeric()),
  'STRING_FORMAT.alpha_withLength': () => createValidate(TF.alpha({maxLength: 3})),
  'STRING_FORMAT.lowercase_validate': () => createValidate(TF.lowercase()),
  'STRING_FORMAT.uuidv4': () => createValidate(TF.uuidv4()),
  'STRING_FORMAT.uuidv7': () => createValidate(TF.uuidv7()),
  'STRING_FORMAT.date_iso': () => createValidate(TF.stringDate()),
  'STRING_FORMAT.date_DMY': () => createValidate(TF.stringDate({format: 'DD-MM-YYYY'})),
  'STRING_FORMAT.date_YM': () => createValidate(TF.stringDate({format: 'YYYY-MM'})),
  'STRING_FORMAT.date_MD': () => createValidate(TF.stringDate({format: 'MM-DD'})),
  'STRING_FORMAT.date_minMax_absolute': () => createValidate(TF.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
  'STRING_FORMAT.time_iso': () => createValidate(TF.stringTime()),
  'STRING_FORMAT.time_HHmmss': () => createValidate(TF.stringTime({format: 'HH:mm:ss'})),
  'STRING_FORMAT.time_HHmmss_ms': () => createValidate(TF.stringTime({format: 'HH:mm:ss[.mmm]'})),
  'STRING_FORMAT.time_minMax_absolute': () => createValidate(TF.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
  'STRING_FORMAT.dateTime_default': () => createValidate(TF.stringDateTime()),
  'STRING_FORMAT.dateTime_custom': () =>
    createValidate(TF.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
  'STRING_FORMAT.dateTime_minMax_absolute': () =>
    createValidate(
      TF.stringDateTime({
        date: {format: 'YYYY-MM-DD'},
        time: {format: 'HH:mm:ss'},
        splitChar: 'T',
        min: '2020-01-01T00:00:00',
        max: '2020-12-31T23:59:59',
      })
    ),
  'STRING_FORMAT.ipv4': () => createValidate(TF.ipv4()),
  'STRING_FORMAT.ipv6': () => createValidate(TF.ipv6()),
  'STRING_FORMAT.ip_any': () => createValidate(TF.ip()),
  'STRING_FORMAT.ipv4_port': () => createValidate(TF.ipv4WithPort()),
  'STRING_FORMAT.ipv6_port': () => createValidate(TF.ipv6WithPort()),
  'STRING_FORMAT.domain': () => createValidate(TF.domain()),
  'STRING_FORMAT.domainStrict': () => createValidate(TF.domainStrict()),
  'STRING_FORMAT.email': () => createValidate(TF.email()),
  'STRING_FORMAT.emailPunycode': () => createValidate(TF.emailPunycode()),
  'STRING_FORMAT.emailStrict': () => createValidate(TF.emailStrict()),
  'STRING_FORMAT.url': () => createValidate(TF.url()),
  'STRING_FORMAT.urlHttp': () => createValidate(TF.urlHttp()),
  'STRING_FORMAT.urlFile': () => createValidate(TF.urlFile()),
  'STRING_FORMAT.pattern_slug': () =>
    createValidate(
      TF.string({
        pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
      })
    ),
  'STRING_FORMAT.pattern_hex': () =>
    createValidate(TF.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': () => createValidate(TF.number({max: 100})),
  'NUMBER_FORMAT.number_min': () => createValidate(TF.number({min: 0})),
  'NUMBER_FORMAT.number_lt': () => createValidate(TF.number({lt: 10})),
  'NUMBER_FORMAT.number_gt': () => createValidate(TF.number({gt: 0})),
  'NUMBER_FORMAT.number_integer': () => createValidate(TF.integer()),
  'NUMBER_FORMAT.number_float': () => createValidate(TF.float()),
  'NUMBER_FORMAT.number_multipleOf': () => createValidate(TF.number({multipleOf: 5})),
  'NUMBER_FORMAT.number_combined': () => createValidate(TF.number({min: 0, max: 100, integer: true, multipleOf: 5})),
  'NUMBER_FORMAT.number_int8': () => createValidate(TF.int8()),
  'NUMBER_FORMAT.number_uint8': () => createValidate(TF.uint8()),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': () => createValidate(TF.bigInt({max: 100n})),
  'BIGINT_FORMAT.bigint_min': () => createValidate(TF.bigInt({min: 0n})),
  'BIGINT_FORMAT.bigint_lt': () => createValidate(TF.bigInt({lt: 10n})),
  'BIGINT_FORMAT.bigint_gt': () => createValidate(TF.bigInt({gt: 0n})),
  'BIGINT_FORMAT.bigint_multipleOf': () => createValidate(TF.bigInt({multipleOf: 5n})),
  'BIGINT_FORMAT.bigint_combined': () => createValidate(TF.bigInt({min: 0n, max: 1000n, multipleOf: 10n})),
  'BIGINT_FORMAT.bigint_int64': () => createValidate(TF.bigInt64()),
  'BIGINT_FORMAT.bigint_uint64': () => createValidate(TF.bigUInt64()),

  // ── DATETIME ──
  'DATETIME.date_minmax': () => createValidate(TF.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
  'DATETIME.date_gtlt': () => createValidate(TF.date({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.date_min_lt': () => createValidate(TF.date({min: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.date_max_now': () => createValidate(TF.date({max: 'now'})),
  'DATETIME.date_rel_window': () => createValidate(TF.date({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.date_rel_datetime_components': () => createValidate(TF.date({min: 'now-P1000YT12H'})),
  'DATETIME.instant_minmax': () => createValidate(TFT.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
  'DATETIME.instant_gtlt': () => createValidate(TFT.instant({gt: '2020-01-01T00:00:00Z', lt: '2020-12-31T23:59:59Z'})),
  'DATETIME.instant_rel': () => createValidate(TFT.instant({min: 'now-PT8760000H', max: 'now+PT8760000H'})),
  'DATETIME.plainDate_minmax': () => createValidate(TFT.plainDate({min: '2020-01-01', max: '2020-12-31'})),
  'DATETIME.plainDate_gtlt': () => createValidate(TFT.plainDate({gt: '2020-01-01', lt: '2020-12-31'})),
  'DATETIME.plainDate_min_lt': () => createValidate(TFT.plainDate({min: '2020-01-01', lt: '2020-01-10'})),
  'DATETIME.plainDate_gt_max': () => createValidate(TFT.plainDate({gt: '2020-01-01', max: '2020-01-10'})),
  'DATETIME.plainDate_min_only': () => createValidate(TFT.plainDate({min: '2020-01-01'})),
  'DATETIME.plainDate_max_only': () => createValidate(TFT.plainDate({max: '2020-12-31'})),
  'DATETIME.plainDate_gt_only': () => createValidate(TFT.plainDate({gt: '2020-01-01'})),
  'DATETIME.plainDate_lt_only': () => createValidate(TFT.plainDate({lt: '2020-12-31'})),
  'DATETIME.plainDate_rel_window': () => createValidate(TFT.plainDate({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.plainDate_rel_ymd': () => createValidate(TFT.plainDate({min: 'now-P100Y6M15D'})),
  'DATETIME.plainDate_rel_weeks': () => createValidate(TFT.plainDate({min: 'now-P52200W'})),
  'DATETIME.plainTime_minmax': () => createValidate(TFT.plainTime({min: '09:00:00', max: '17:00:00'})),
  'DATETIME.plainTime_gtlt': () => createValidate(TFT.plainTime({gt: '09:00:00', lt: '17:00:00'})),
  'DATETIME.plainDateTime_minmax': () => createValidate(TFT.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
  'DATETIME.plainDateTime_gtlt': () => createValidate(TFT.plainDateTime({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.plainDateTime_rel': () => createValidate(TFT.plainDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.plainDateTime_rel_combo': () => createValidate(TFT.plainDateTime({min: 'now-P500YT12H'})),
  'DATETIME.plainYearMonth_minmax': () => createValidate(TFT.plainYearMonth({min: '2020-01', max: '2020-12'})),
  'DATETIME.plainYearMonth_gtlt': () => createValidate(TFT.plainYearMonth({gt: '2020-01', lt: '2020-12'})),
  'DATETIME.plainYearMonth_rel': () => createValidate(TFT.plainYearMonth({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.zonedDateTime_minmax': () =>
    createValidate(TFT.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
  'DATETIME.zonedDateTime_gtlt': () =>
    createValidate(TFT.zonedDateTime({gt: '2020-01-01T00:00:00[UTC]', lt: '2020-12-31T23:59:59[UTC]'})),
  'DATETIME.zonedDateTime_rel': () => createValidate(TFT.zonedDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),

  // ── REALWORLD ──
  'REALWORLD.user': () =>
    createValidate(
      RT.object({
        id: TF.number(),
        email: TF.string(),
        name: TF.string(),
        age: RT.optional(TF.number()),
        roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
        active: RT.boolean(),
        createdAt: TF.string(),
      })
    ),
  'REALWORLD.order': () =>
    createValidate(
      RT.object({
        id: TF.string(),
        customer: RT.object({id: TF.number(), email: TF.string()}),
        items: RT.array(RT.object({sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.number()})),
        shipping: RT.object({
          street: TF.string(),
          city: TF.string(),
          state: TF.string(),
          zip: TF.string(),
          country: TF.string(),
        }),
        status: RT.union([
          RT.literal('pending'),
          RT.literal('paid'),
          RT.literal('shipped'),
          RT.literal('delivered'),
          RT.literal('cancelled'),
        ]),
        total: TF.number(),
        note: RT.optional(TF.string()),
      })
    ),
  'REALWORLD.blogPost': () =>
    createValidate(
      RT.object({
        id: TF.number(),
        title: TF.string(),
        slug: TF.string(),
        body: TF.string(),
        tags: RT.array(TF.string()),
        author: RT.object({name: TF.string(), email: TF.string()}),
        published: RT.boolean(),
        publishedAt: RT.optional(TF.string()),
        meta: RT.object({views: TF.number(), likes: TF.number()}),
      })
    ),
  'REALWORLD.product': () =>
    createValidate(
      RT.object({
        id: TF.string(),
        name: TF.string(),
        description: TF.string(),
        price: TF.number(),
        currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
        inStock: RT.boolean(),
        categories: RT.array(TF.string()),
        dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
      })
    ),
  'REALWORLD.productPage': () =>
    createValidate(
      RT.object({
        data: RT.array(
          RT.object({
            id: TF.string(),
            name: TF.string(),
            description: TF.string(),
            price: TF.number(),
            currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
            inStock: RT.boolean(),
            categories: RT.array(TF.string()),
            dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
          })
        ),
        page: TF.number(),
        pageSize: TF.number(),
        total: TF.number(),
        hasMore: RT.boolean(),
      })
    ),
  'REALWORLD.registrationForm': () =>
    createValidate(
      RT.object({
        email: TF.string(),
        password: TF.string(),
        acceptedTerms: RT.literal(true),
        profile: RT.object({
          firstName: TF.string(),
          lastName: TF.string(),
          age: RT.optional(TF.number()),
        }),
      })
    ),
};
