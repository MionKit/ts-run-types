import {z} from 'zod';
import {NOT_SUPPORTED, type CompetitorCases, type Validator} from '../../shared/harness/types.ts';

// LAZY builder: schema is constructed inside the () => so build cost is per-case.
// zod v4: ZodTypeAny is deprecated; the recommended schema base type is z.ZodType.
const c = (s: z.ZodType): (() => Validator) => () => (v) => s.safeParse(v).success;

// Shared sub-schemas reused across cases (ported from the original zod map).
const objA = z.object({a: z.string()});
const addressZ = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  country: z.string(),
});
const productZ = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  inStock: z.boolean(),
  categories: z.array(z.string()),
  dimensions: z.object({width: z.number(), height: z.number(), depth: z.number()}).optional(),
});

// EXACTLY 263 entries — one per shared case key, in authoritative order.
// Supported  → c(z....)  (schema ported from the original partial zod map).
// Unsupported → NOT_SUPPORTED  (every key the original map omitted).
export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': c(z.any()),
  'ATOMIC.bigint': c(z.bigint()),
  'ATOMIC.boolean': c(z.boolean()),
  'ATOMIC.date': c(z.date()),
  // enum_mixed: numeric reverse-mapping (0,'green',2) with mixed member types is not expressible via z.enum (strings only)
  // and z.nativeEnum also doesn't match the sample set (0, 'green', 2 but not 'Red'/'Green'/'Blue').
  // z.nativeEnum on a const object {Red:0,Green:'green',Blue:2} accepts 0,'green',2 AND keys 'Red','Green','Blue' — too broad.
  'ATOMIC.enum_mixed': c(z.union([z.literal(0), z.literal('green'), z.literal(2)])),
  'ATOMIC.literal_2': c(z.literal(2)),
  'ATOMIC.literal_a': c(z.literal('a')),
  'ATOMIC.literal_true': c(z.literal(true)),
  'ATOMIC.literal_1n': c(z.literal(1n)),
  // literal_symbol: match any symbol whose description === 'hello'
  'ATOMIC.literal_symbol': c(z.custom((v) => typeof v === 'symbol' && v.description === 'hello')),
  'ATOMIC.never': c(z.never()),
  'ATOMIC.null': c(z.null()),
  'ATOMIC.number': c(z.number().finite()),
  // object: any non-null non-primitive (arrays, Date, regex all pass; null rejected)
  'ATOMIC.object': c(z.custom((v) => typeof v === 'object' && v !== null)),
  'ATOMIC.regexp': c(z.instanceof(RegExp)),
  'ATOMIC.string': c(z.string()),
  'ATOMIC.symbol': c(z.symbol()),
  'ATOMIC.undefined': c(z.undefined()),
  'ATOMIC.void': c(z.void()),
  // noLiterals cases: literal degrades to its base type
  'ATOMIC.literal_2_noLiterals': c(z.number().finite()),
  'ATOMIC.literal_a_noLiterals': c(z.string()),
  'ATOMIC.literal_regexp_noLiterals': c(z.instanceof(RegExp)),
  'ATOMIC.literal_true_noLiterals': c(z.boolean()),
  'ATOMIC.literal_1n_noLiterals': c(z.bigint()),
  // literal_symbol_noLiterals: degrades to bare symbol — factoryThrows=true in shared but empty valid/invalid; z.symbol() passes vacuously
  'ATOMIC.literal_symbol_noLiterals': c(z.symbol()),
  'ATOMIC.unknown': c(z.unknown()),

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
  // string_array_noIsArrayCheck: same samples as string_array but no non-array invalid entries — z.array(z.string()) matches
  'ARRAY.string_array_noIsArrayCheck': c(z.array(z.string())),
  'ARRAY.object_array': c(z.array(objA)),
  'ARRAY.union_array': c(z.array(z.union([z.string(), z.number().finite()]))),
  'ARRAY.tuple_array': c(z.array(z.tuple([z.string(), z.number().finite()]))),
  'ARRAY.circular_array': c(z.lazy(() => {
    const schema: z.ZodType = z.array(z.lazy(() => schema));
    return schema;
  })),
  'ARRAY.circular_object_with_array': c(z.lazy(() => {
    const schema: z.ZodType = z.object({
      a: z.string(),
      deep: z.object({b: z.string(), c: z.number().finite()}).optional(),
      d: z.array(z.lazy(() => schema)).optional(),
    });
    return schema;
  })),
  'ARRAY.symbol_array': c(z.array(z.symbol())),
  'ARRAY.readonly_string_array': c(z.array(z.string())),

  // ── OBJECT ──
  'OBJECT.simple_interface': c(z.object({a: z.string(), b: z.number().finite()})),
  'OBJECT.object_as_const_literals': c(z.object({name: z.literal('john'), age: z.literal(30)})),
  'OBJECT.object_via_return_type_utility': c(z.object({id: z.number().finite(), name: z.string()})),
  'OBJECT.object_via_property_access': c(z.object({id: z.number().finite(), name: z.string()})),
  'OBJECT.object_via_array_access': c(z.object({id: z.number().finite(), name: z.string()})),
  'OBJECT.interface_with_optional': c(z.object({a: z.string(), b: z.number().finite().optional()})),
  'OBJECT.interface_with_date': c(z.object({date: z.date(), name: z.string()})),
  'OBJECT.interface_with_method': c(z.object({name: z.string()})),
  'OBJECT.nested_object': c(z.object({a: z.string(), deep: z.object({b: z.string(), c: z.number().finite()})})),
  'OBJECT.interface_string_array_prop': c(z.object({tags: z.array(z.string())})),
  'OBJECT.circular_interface': c(z.lazy(() => {
    const schema: z.ZodType = z.object({name: z.string(), child: z.lazy(() => schema).optional()});
    return schema;
  })),
  'OBJECT.circular_interface_on_array': c(z.lazy(() => {
    const schema: z.ZodType = z.object({name: z.string(), children: z.array(z.lazy(() => schema)).optional()});
    return schema;
  })),
  'OBJECT.circular_interface_on_nested_object': c(z.lazy(() => {
    const schema: z.ZodType = z.object({name: z.string(), embedded: z.object({hello: z.string(), child: z.lazy(() => schema).optional()})});
    return schema;
  })),
  'OBJECT.index_signature_string': c(z.record(z.string(), z.string())),
  // index_signature_named_props: {a:string, b:number} + catchall of string|number for extra keys
  'OBJECT.index_signature_named_props': c(z.object({a: z.string(), b: z.number().finite()}).catchall(z.union([z.string(), z.number().finite()]))),
  'OBJECT.index_signature_nested': c(z.record(z.string(), z.record(z.string(), z.number().finite()))),
  'OBJECT.index_signature_date_value': c(z.record(z.string(), z.record(z.string(), z.date()))),
  // index_signature_non_root: object with string prop + nested index sig — requires named prop b:string AND c:{[k]:string}
  'OBJECT.index_signature_non_root': c(z.object({b: z.string(), c: z.record(z.string(), z.string())})),
  // function_top_level: any function (class counts too); z.function() only validates arity; use custom
  'OBJECT.function_top_level': c(z.custom((v) => typeof v === 'function')),
  // interface_callable: function with extra prop — typeof function AND extra prop is string
  'OBJECT.interface_callable': c(z.custom((v) => typeof v === 'function' && typeof (v as {extra?: unknown}).extra === 'string')),
  // interface_all_optional: all-optional object but arrays/Date/Map/Set rejected — use custom to enforce plain-object guard
  'OBJECT.interface_all_optional': c(z.custom((v) => {
    if (typeof v !== 'object' || v === null) return false;
    if (Object.prototype.toString.call(v) !== '[object Object]') return false;
    const obj = v as Record<string, unknown>;
    if ('a' in obj && obj.a !== undefined && typeof obj.a !== 'string') return false;
    if ('b' in obj && obj.b !== undefined && (typeof obj.b !== 'number' || !Number.isFinite(obj.b))) return false;
    return true;
  })),
  // class_simple: class with date+name props (method skipped); same as object with date+name
  'OBJECT.class_simple': c(z.object({date: z.date(), name: z.string()})),
  // rpc_error_class: brand discriminator with special char key 'mion@isΣrrθr'
  'OBJECT.rpc_error_class': c(z.object({
    'mion@isΣrrθr': z.literal(true),
    type: z.literal('test-error'),
    publicMessage: z.string(),
    id: z.string().optional(),
  })),
  // call_signature_params: [number, boolean] tuple, excess args rejected
  'OBJECT.call_signature_params': c(z.tuple([z.number().finite(), z.boolean()])),
  // call_signature_params_with_optional: [number, boolean, string?]
  'OBJECT.call_signature_params_with_optional': c(z.tuple([z.number().finite(), z.boolean(), z.string().optional()])),
  // call_signature_params_with_rest: [number, boolean, ...Date[]]
  'OBJECT.call_signature_params_with_rest': c(z.tuple([z.number().finite(), z.boolean()]).rest(z.date())),
  'OBJECT.record_union_keys': c(z.object({a: z.number().finite(), b: z.number().finite()})),
  'OBJECT.union_value_index': c(z.record(z.string(), z.union([z.string(), z.number().finite()]))),
  'OBJECT.object_with_union_prop': c(z.object({kind: z.union([z.literal('a'), z.literal('b')]), n: z.number().finite()})),
  // interface_inheritance: merged props {a: string, b: number}
  'OBJECT.interface_inheritance': c(z.object({a: z.string(), b: z.number().finite()})),
  // class_inheritance: merged props {a: string, b: number}
  'OBJECT.class_inheritance': c(z.object({a: z.string(), b: z.number().finite()})),
  // index_signature_number_key: normalised to string-key record at runtime
  'OBJECT.index_signature_number_key': c(z.record(z.string(), z.string())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': c(z.tuple([z.string(), z.number().finite()])),
  'TUPLE.full_mion_tuple': c(z.tuple([z.date(), z.number().finite(), z.string(), z.null(), z.array(z.string()), z.bigint()])),
  // tuple_with_optional: [number, bigint?, boolean?, number?] — uses custom to handle undefined in middle positions
  'TUPLE.tuple_with_optional': c(z.custom((v) => {
    if (!Array.isArray(v)) return false;
    if (v.length < 1 || v.length > 4) return false;
    if (typeof v[0] !== 'number' || !Number.isFinite(v[0])) return false;
    if (v.length > 1 && v[1] !== undefined && typeof v[1] !== 'bigint') return false;
    if (v.length > 2 && v[2] !== undefined && typeof v[2] !== 'boolean') return false;
    if (v.length > 3 && v[3] !== undefined && (typeof v[3] !== 'number' || !Number.isFinite(v[3]))) return false;
    return true;
  })),
  'TUPLE.nested_tuple_in_array': c(z.array(z.tuple([z.string(), z.number().finite()]))),
  'TUPLE.tuple_rest': c(z.tuple([z.number().finite()]).rest(z.string())),
  // tuple_circular: self-referential tuple — optional 7th slot is the tuple itself; use custom for flexibility
  'TUPLE.tuple_circular': c(z.lazy(() => {
    const schema: z.ZodType = z.custom((v) => {
      if (!Array.isArray(v)) return false;
      if (v.length < 6) return false;
      if (!(v[0] instanceof Date) || isNaN((v[0] as Date).getTime())) return false;
      if (typeof v[1] !== 'number' || !Number.isFinite(v[1])) return false;
      if (typeof v[2] !== 'string') return false;
      if (v[3] !== null) return false;
      if (!Array.isArray(v[4])) return false;
      if (typeof v[5] !== 'bigint') return false;
      if (v.length > 6 && v[6] !== undefined && !schema.safeParse(v[6]).success) return false;
      return true;
    });
    return schema;
  })),
  // tuple_multiple_trailing_optionals: [number, bigint?, boolean?, number?]
  'TUPLE.tuple_multiple_trailing_optionals': c(z.tuple([z.number().finite(), z.bigint().optional(), z.boolean().optional(), z.number().finite().optional()])),
  'TUPLE.tuple_named_labels': c(z.tuple([z.string(), z.number().finite()])),
  // tuple_with_non_serializable: function slot must be undefined — z.tuple with undefined at slot 1
  'TUPLE.tuple_with_non_serializable': c(z.tuple([z.number().finite(), z.undefined().optional()])),
  'TUPLE.empty_tuple': c(z.tuple([])),
  'TUPLE.single_element_tuple': c(z.tuple([z.string()])),
  'TUPLE.readonly_tuple': c(z.tuple([z.string(), z.number().finite()])),

  // ── UNION ──
  'UNION.atomic_union': c(z.union([z.date(), z.number().finite(), z.string(), z.null(), z.bigint()])),
  'UNION.string_literal_union': c(z.enum(['UNO', 'DOS', 'TRES'])),
  // large_union_eight_arms: 8 arms — use z.union with all members
  'UNION.large_union_eight_arms': c(z.union([
    z.literal('a'),
    z.literal('b'),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.object({a: z.string()}),
    z.object({a: z.string(), b: z.number().finite()}),
    z.object({c: z.bigint()}),
  ])),
  'UNION.string_or_number': c(z.union([z.string(), z.number().finite()])),
  'UNION.union_of_array_types': c(z.union([z.array(z.string()), z.array(z.number().finite()), z.array(z.boolean())])),
  'UNION.array_of_union': c(z.array(z.union([z.string(), z.bigint(), z.boolean(), z.date()]))),
  'UNION.union_of_object_shapes': c(z.union([z.object({a: z.string(), aa: z.boolean()}), z.object({b: z.number().finite()}), z.object({c: z.bigint()})])),
  'UNION.discriminated_union': c(z.union([z.object({kind: z.literal('a'), n: z.number().finite()}), z.object({kind: z.literal('b'), s: z.string()})])),
  // circular_union: self-referential union (date|number|string|object|array) — use custom to handle recursion and reject invalid Date/booleans/null
  'UNION.circular_union': c(z.lazy(() => {
    const check = (v: unknown): boolean => {
      if (v instanceof Date) return !isNaN(v.getTime());
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'string') return true;
      if (Array.isArray(v)) return v.every(check);
      if (typeof v === 'object' && v !== null && !(v instanceof Date) && !(v instanceof Map) && !(v instanceof Set))
        return Object.values(v as Record<string, unknown>).every(check);
      return false;
    };
    return z.custom(check);
  })),
  // union_with_methods: method props skipped — validate only data props
  'UNION.union_with_methods': c(z.union([
    z.object({name: z.string()}),
    z.object({age: z.number().finite()}),
  ])),
  'UNION.intersection_to_object': c(z.object({a: z.string(), b: z.number().finite()})),
  // union_with_index_arm: one arm is a non-empty record of bigint values; empty {} matches no arm
  'UNION.union_with_index_arm': c(z.union([
    z.object({a: z.string(), aa: z.boolean()}),
    z.object({b: z.number().finite()}),
    z.record(z.string(), z.bigint()).refine((o) => Object.keys(o).length > 0),
  ])),
  'UNION.union_same_prop_different_types': c(z.union([
      z.object({type: z.literal('a'), prop: z.boolean()}),
      z.object({type: z.literal('b'), prop: z.number().finite()}),
      z.object({type: z.literal('c'), prop: z.string()}),
    ])),
  // union_mixed_arrays_and_objects: arrays and objects in same union
  'UNION.union_mixed_arrays_and_objects': c(z.union([
    z.array(z.string()),
    z.array(z.number().finite()),
    z.array(z.boolean()),
    z.object({a: z.string(), aa: z.boolean()}),
    z.object({b: z.number().finite()}),
  ])),
  'UNION.union_merged_property': c(z.union([z.object({a: z.boolean()}), z.object({a: z.number().finite()})])),
  // union_mixed_with_index: arrays + objects (some with index sigs); empty {} matches no arm
  'UNION.union_mixed_with_index': c(z.union([
    z.array(z.string()),
    z.object({a: z.string(), aa: z.boolean()}),
    z.object({b: z.number().finite()}),
    z.record(z.string(), z.bigint()).refine((o) => Object.keys(o).length > 0),
  ])),
  'UNION.union_with_any_fallback': c(z.any()),
  'UNION.union_with_unknown_fallback': c(z.unknown()),
  // union_subset_small_first: {a} before {a,b} — structurally, {a} arm matches both; both valid
  'UNION.union_subset_small_first': c(z.union([z.object({a: z.string()}), z.object({a: z.string(), b: z.number().finite()})])),
  // union_subset_nested_levels: 3-level chain {x}, {x,y}, {x,y,z}
  'UNION.union_subset_nested_levels': c(z.union([z.object({x: z.string()}), z.object({x: z.string(), y: z.number().finite()}), z.object({x: z.string(), y: z.number().finite(), z: z.boolean()})])),
  // union_subset_mixed_related_unrelated: {id:string}, {id:string,name:string}, {value:number}
  'UNION.union_subset_mixed_related_unrelated': c(z.union([z.object({id: z.string()}), z.object({id: z.string(), name: z.string()}), z.object({value: z.number().finite()})])),

  // ── TEMPLATE_LITERAL ──
  // templateLiteral uses z.templateLiteral([parts]) in zod v4
  'TEMPLATE_LITERAL.url_with_number_id': c(z.templateLiteral(['api/user/', z.number()])),
  // multi_segment_url: version must be v1 or v2; username any string; post id number
  'TEMPLATE_LITERAL.multi_segment_url': c(z.union([
    z.templateLiteral(['/api/v1/user/', z.string(), '/posts/', z.number()]),
    z.templateLiteral(['/api/v2/user/', z.string(), '/posts/', z.number()]),
  ])),
  'TEMPLATE_LITERAL.leading_string_placeholder': c(z.templateLiteral([z.string(), '/', z.number()])),
  // regex_special_chars: literal '(' + number + ')' — template literal with parens in literal segments
  'TEMPLATE_LITERAL.regex_special_chars': c(z.templateLiteral(['(', z.number(), ')'])),
  // template_literal_nested_in_object: object with url prop that is template literal
  'TEMPLATE_LITERAL.template_literal_nested_in_object': c(z.object({url: z.templateLiteral(['api/user/', z.number()]), method: z.string()})),
  // template_literal_index_key: index sig with 'api/*' key pattern and number values — use z.custom for key pattern constraint
  'TEMPLATE_LITERAL.template_literal_index_key': c(z.custom((v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!/^api\//.test(k)) return false;
      if (typeof val !== 'number' || !Number.isFinite(val)) return false;
    }
    return true;
  })),
  // template_literal_union_placeholder: 'a-<number>' | 'b-<number>'
  'TEMPLATE_LITERAL.template_literal_union_placeholder': c(z.union([
    z.templateLiteral(['a-', z.number()]),
    z.templateLiteral(['b-', z.number()]),
  ])),

  // ── NATIVE ──
  'NATIVE.map_string_number': c(z.map(z.string(), z.number().finite())),
  'NATIVE.set_string': c(z.set(z.string())),
  // promise_string: thenable check — any object with typeof .then === 'function'
  'NATIVE.promise_string': c(z.custom((v) => typeof v === 'object' && v !== null && typeof (v as {then?: unknown}).then === 'function')),
  'NATIVE.awaited_promise': c(z.string()),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': c(z.lazy(() => {
    const schema: z.ZodType = z.object({
      n: z.number().finite(),
      s: z.string(),
      c: z.lazy(() => schema).optional(),
      d: z.date().optional(),
    });
    return schema;
  })),
  'CIRCULAR.array_of_union_with_self_ref': c(z.lazy(() => {
    const schema: z.ZodType = z.array(z.union([z.date(), z.number().finite(), z.string(), z.lazy(() => schema)]));
    return schema;
  })),
  'CIRCULAR.object_with_tuple_prop': c(z.lazy(() => {
    const schema: z.ZodType = z.object({
      tuple: z.tuple([z.bigint()]).rest(z.lazy(() => schema) as z.ZodType),
    });
    return schema;
  })),
  'CIRCULAR.object_with_index_prop': c(z.lazy(() => {
    const schema: z.ZodType = z.object({index: z.record(z.string(), z.lazy(() => schema))});
    return schema;
  })),
  // object_deeply_nested: T={deep1:{deep2:{deep3:{} | {deep4:T}}}}; deep4 must satisfy T or be absent
  'CIRCULAR.object_deeply_nested': c(z.lazy(() => {
    const schema: z.ZodType = z.object({
      deep1: z.object({
        deep2: z.object({
          deep3: z.custom((v) => {
            if (typeof v !== 'object' || v === null) return false;
            const obj = v as Record<string, unknown>;
            if ('deep4' in obj) {
              // if deep4 is present it must be a valid T
              return schema.safeParse(obj.deep4).success;
            }
            return true; // empty object (no deep4)
          }),
        }),
      }),
    });
    return schema;
  })),
  // circular_child_under_literal_root: {isRoot:true, ciChild: ICircularDeep}
  // ICircularDeep: {name:string, big:bigint, embedded:{hello:string, child?: ICircularDeep}}
  'CIRCULAR.circular_child_under_literal_root': c(z.lazy(() => {
    const ciDeep: z.ZodType = z.object({
      name: z.string(),
      big: z.bigint(),
      embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
    });
    return z.object({isRoot: z.literal(true), ciChild: ciDeep});
  })),
  // multiple_circular_types_cross_referenced: root with ciChild (ICircularDeep) + ciDate (ICircularDate) + optional self-ref
  'CIRCULAR.multiple_circular_types_cross_referenced': c(z.lazy(() => {
    const ciDeep: z.ZodType = z.object({
      name: z.string(),
      big: z.bigint(),
      embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
    });
    const ciDate: z.ZodType = z.object({
      date: z.date(),
      month: z.number().finite(),
      year: z.number().finite(),
      embedded: z.lazy(() => ciDate).optional(),
    });
    const root: z.ZodType = z.object({
      isRoot: z.literal(true),
      ciChild: ciDeep,
      ciDate: ciDate,
      ciRoort: z.lazy(() => root).optional(),
    });
    return root;
  })),

  // ── UTILITY ──
  // partial: {name?:string, age?:number, createdAt?:Date} with plain-object guard (rejects arrays/Date/Map/Set)
  'UTILITY.partial': c(z.custom((v) => {
    if (typeof v !== 'object' || v === null) return false;
    if (Object.prototype.toString.call(v) !== '[object Object]') return false;
    const obj = v as Record<string, unknown>;
    if ('name' in obj && obj.name !== undefined && typeof obj.name !== 'string') return false;
    if ('age' in obj && obj.age !== undefined && (typeof obj.age !== 'number' || !Number.isFinite(obj.age))) return false;
    if ('createdAt' in obj && obj.createdAt !== undefined) {
      if (!(obj.createdAt instanceof Date) || isNaN((obj.createdAt as Date).getTime())) return false;
    }
    return true;
  })),
  // required: {name:string, age:number, createdAt:Date}
  'UTILITY.required': c(z.object({name: z.string(), age: z.number().finite(), createdAt: z.date()})),
  // pick: {name:string, createdAt:Date}
  'UTILITY.pick': c(z.object({name: z.string(), createdAt: z.date()})),
  // omit: same resolved shape {name:string, createdAt:Date}
  'UTILITY.omit': c(z.object({name: z.string(), createdAt: z.date()})),
  // exclude_atomic: "name" | "createdAt"
  'UTILITY.exclude_atomic': c(z.union([z.literal('name'), z.literal('createdAt')])),
  // extract_atomic: "name" | "createdAt"
  'UTILITY.extract_atomic': c(z.union([z.literal('name'), z.literal('createdAt')])),
  // exclude_from_object_union: {kind:'square',x:number} | {kind:'triangle',base:number,height:number}
  'UTILITY.exclude_from_object_union': c(z.union([
    z.object({kind: z.literal('square'), x: z.number().finite()}),
    z.object({kind: z.literal('triangle'), base: z.number().finite(), height: z.number().finite()}),
  ])),
  // non_nullable: string | number (no null, no undefined) — valid: string/number; invalid: null/undefined/bool/{}/[]/NaN/Infinity
  'UTILITY.non_nullable': c(z.union([z.string(), z.number().finite()])),
  // return_type: Date
  'UTILITY.return_type': c(z.date()),
  // readonly: {name:string, age:number}
  'UTILITY.readonly': c(z.object({name: z.string(), age: z.number().finite()})),
  // intersection_with_required_override: {name:string, age?:number, createdAt?:Date}
  'UTILITY.intersection_with_required_override': c(z.object({name: z.string(), age: z.number().finite().optional(), createdAt: z.date().optional()})),
  // omit_keeping_optional: {b?:number, c:boolean}
  'UTILITY.omit_keeping_optional': c(z.object({b: z.number().finite().optional(), c: z.boolean()})),
  // keyof_to_literal_union: "name" | "age" | "createdAt"
  'UTILITY.keyof_to_literal_union': c(z.union([z.literal('name'), z.literal('age'), z.literal('createdAt')])),
  // typeof_variable_query: {url:string, port:number}
  'UTILITY.typeof_variable_query': c(z.object({url: z.string(), port: z.number().finite()})),
  // indexed_access_type: string
  'UTILITY.indexed_access_type': c(z.string()),
  // conditional_type_resolved: boolean (IsString<"hello"> resolves to boolean)
  'UTILITY.conditional_type_resolved': c(z.boolean()),
  // mapped_type_custom: {a:string|null, b:number|null}
  'UTILITY.mapped_type_custom': c(z.object({a: z.union([z.string(), z.null()]), b: z.union([z.number().finite(), z.null()])})),
  // mapped_type_with_conditional_value: complex per-prop conditional shapes
  'UTILITY.mapped_type_with_conditional_value': c(z.object({
    name: z.object({kind: z.literal('text'), value: z.string()}),
    age: z.object({kind: z.literal('number'), value: z.number().finite(), min: z.number().finite().optional()}),
    admin: z.object({kind: z.literal('checkbox'), value: z.boolean()}),
  })),
  // distributive_conditional_over_union: {w:string} | {w:number}
  'UTILITY.distributive_conditional_over_union': c(z.union([z.object({w: z.string()}), z.object({w: z.number().finite()})])),
  // deep_partial_recursive_mapped: {display?:{theme?:'light'|'dark', brightness?:number}, audio?:{volume?:number, muted?:boolean}}
  // with plain-object guard at outer level and check nested display is not a primitive
  'UTILITY.deep_partial_recursive_mapped': c(z.custom((v) => {
    if (typeof v !== 'object' || v === null) return false;
    if (Object.prototype.toString.call(v) !== '[object Object]') return false;
    const obj = v as Record<string, unknown>;
    if ('display' in obj && obj.display !== undefined) {
      if (typeof obj.display !== 'object' || obj.display === null || typeof (obj.display as Date).getTime === 'function') return false;
      const disp = obj.display as Record<string, unknown>;
      if ('theme' in disp && disp.theme !== undefined && disp.theme !== 'light' && disp.theme !== 'dark') return false;
      if ('brightness' in disp && disp.brightness !== undefined && (typeof disp.brightness !== 'number' || !Number.isFinite(disp.brightness))) return false;
    }
    if ('audio' in obj && obj.audio !== undefined) {
      if (typeof obj.audio !== 'object' || obj.audio === null) return false;
      const audio = obj.audio as Record<string, unknown>;
      if ('volume' in audio && audio.volume !== undefined && (typeof audio.volume !== 'number' || !Number.isFinite(audio.volume))) return false;
      if ('muted' in audio && audio.muted !== undefined && typeof audio.muted !== 'boolean') return false;
    }
    return true;
  })),

  // ── TYPE_MAPPINGS ──
  // key_prefix_rename: resolves to {user_id:number, user_name:string}
  'TYPE_MAPPINGS.key_prefix_rename': c(z.object({user_id: z.number().finite(), user_name: z.string()})),
  // key_conditional_rename: {_id:number, name:string, createdAt:Date}
  'TYPE_MAPPINGS.key_conditional_rename': c(z.object({_id: z.number().finite(), name: z.string(), createdAt: z.date()})),
  // key_filter_via_never: {id:number, name:string} (secret dropped)
  'TYPE_MAPPINGS.key_filter_via_never': c(z.object({id: z.number().finite(), name: z.string()})),

  // ── DATETIME ──
  'DATETIME.date': c(z.date()),
  'DATETIME.instant': NOT_SUPPORTED, // Temporal.Instant not available in validation suite container (no Temporal polyfill)
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // Temporal.ZonedDateTime not available in validation suite container
  'DATETIME.plainDate': NOT_SUPPORTED, // Temporal.PlainDate not available in validation suite container
  'DATETIME.plainTime': NOT_SUPPORTED, // Temporal.PlainTime not available in validation suite container
  'DATETIME.plainDateTime': NOT_SUPPORTED, // Temporal.PlainDateTime not available in validation suite container
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // Temporal.PlainYearMonth not available in validation suite container
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // Temporal.PlainMonthDay not available in validation suite container
  'DATETIME.duration': NOT_SUPPORTED, // Temporal.Duration not available in validation suite container

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': c(z.string().max(5)),
  'STRING_FORMAT.string_minLength': c(z.string().min(3)),
  'STRING_FORMAT.string_length': c(z.string().length(4)),
  'STRING_FORMAT.string_range': c(z.string().min(2).max(4)),
  'STRING_FORMAT.string_allowedChars': c(z.string().regex(/^[0-9a-f]+$/)),
  'STRING_FORMAT.string_allowedChars_ignoreCase': c(z.string().regex(/^[abc]+$/i)),
  'STRING_FORMAT.string_allowedChars_literal': c(z.string().regex(/^[.\-]+$/)),
  'STRING_FORMAT.string_disallowedChars': c(z.string().regex(/^[^!@#]*$/)),
  'STRING_FORMAT.string_allowedValues': c(z.enum(['red', 'green', 'blue'])),
  'STRING_FORMAT.string_allowedValues_ignoreCase': c(z.string().regex(/^(red|green)$/i)),
  'STRING_FORMAT.string_allowedValues_escaped': c(z.enum(['a.b', 'c+d'])),
  'STRING_FORMAT.string_disallowedValues': c(z.string().refine((s) => !['admin', 'root'].includes(s))),
  'STRING_FORMAT.string_customErrorMessage': c(z.enum(['a', 'b'])),
  'STRING_FORMAT.alpha': c(z.string().regex(/^[A-Za-z]+$/)),
  'STRING_FORMAT.alphaNumeric': c(z.string().regex(/^[A-Za-z0-9]+$/)),
  'STRING_FORMAT.numeric': c(z.string().regex(/^[0-9]+$/)),
  'STRING_FORMAT.alpha_withLength': c(z
      .string()
      .regex(/^[A-Za-z]+$/)
      .max(3)),
  'STRING_FORMAT.lowercase_validate': c(z.string()),
  'STRING_FORMAT.uuidv4': c(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)),
  'STRING_FORMAT.uuidv7': c(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)),
  // date_iso: YYYY-MM-DD with calendar validity — zod doesn't validate calendar correctness (e.g. 2023-02-29 rejected)
  'STRING_FORMAT.date_iso': c(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
  })),
  // date_DMY: DD-MM-YYYY with calendar validity
  'STRING_FORMAT.date_DMY': c(z.string().regex(/^\d{2}-\d{2}-\d{4}$/).refine((s) => {
    const [dd, mm, yyyy] = s.split('-');
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.getUTCDate() === +dd && d.getUTCMonth() + 1 === +mm;
  })),
  // date_YM: YYYY-MM (no day)
  'STRING_FORMAT.date_YM': c(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
  // date_MD: MM-DD (no year) — note: 02-29 is valid (leap-day without year context), 13-01 invalid
  'STRING_FORMAT.date_MD': c(z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)),
  // date_minMax_absolute: 2020-01-01..2020-12-31 inclusive
  'STRING_FORMAT.date_minMax_absolute': c(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => s >= '2020-01-01' && s <= '2020-12-31')),
  // time_iso: HH:mm:ss with timezone (Z or ±HH:MM)
  'STRING_FORMAT.time_iso': c(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/)),
  // time_HHmmss: HH:mm:ss, 00:00:00..23:59:59
  'STRING_FORMAT.time_HHmmss': c(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)),
  // time_HHmmss_ms: HH:mm:ss[.mmm] optional milliseconds (exactly 1-3 digits)
  'STRING_FORMAT.time_HHmmss_ms': c(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?$/)),
  // time_minMax_absolute: 09:00..17:00 (accepts HH:mm format too)
  'STRING_FORMAT.time_minMax_absolute': c(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).refine((s) => s >= '09:00' && s <= '17:00')),
  // dateTime_default: ISO 8601 datetime; must have T separator, tz offset, and calendar validity
  'STRING_FORMAT.dateTime_default': c(z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/).refine((s) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return false;
    // Verify the date part is calendar-valid (e.g. 2023-02-29 is invalid)
    const datePart = s.slice(0, 10);
    const [yyyy, mm, dd] = datePart.split('-').map(Number);
    const check = new Date(Date.UTC(yyyy, mm - 1, dd));
    return check.getUTCFullYear() === yyyy && check.getUTCMonth() + 1 === mm && check.getUTCDate() === dd;
  })),
  // dateTime_custom: DD-MM-YYYY HH:mm with calendar validity
  'STRING_FORMAT.dateTime_custom': c(z.string().regex(/^\d{2}-\d{2}-\d{4} ([01]\d|2[0-3]):[0-5]\d$/).refine((s) => {
    const [date] = s.split(' ');
    const [dd, mm, yyyy] = date.split('-');
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.getUTCDate() === +dd && d.getUTCMonth() + 1 === +mm;
  })),
  // dateTime_minMax_absolute: 2020-01-01T00:00:00..2020-12-31T23:59:59 (no tz suffix in samples)
  'STRING_FORMAT.dateTime_minMax_absolute': c(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).refine((s) => s >= '2020-01-01T00:00:00' && s <= '2020-12-31T23:59:59')),
  // ipv4: dotted-quad, each octet 0-255
  'STRING_FORMAT.ipv4': c(z.ipv4()),
  // ipv6: colon-separated
  'STRING_FORMAT.ipv6': c(z.ipv6()),
  // ip_any: v4 or v6
  'STRING_FORMAT.ip_any': c(z.union([z.ipv4(), z.ipv6()])),
  // ipv4_port: v4:port where port ≤ 65535 — zod ipv4() doesn't include port
  'STRING_FORMAT.ipv4_port': c(z.string().regex(/^(\d{1,3}\.){3}\d{1,3}:\d+$/).refine((s) => {
    const [ip, portStr] = s.split(':');
    const port = +portStr;
    if (port < 0 || port > 65535) return false;
    return ip.split('.').every((o) => +o >= 0 && +o <= 255);
  })),
  // ipv6_port: [v6]:port where port ≤ 65535
  'STRING_FORMAT.ipv6_port': c(z.string().regex(/^\[.+\]:\d+$/).refine((s) => {
    const lastColon = s.lastIndexOf(':');
    const port = +s.slice(lastColon + 1);
    return port >= 0 && port <= 65535;
  })),
  // domain: standard domain (2+ labels, TLD ≥ 2 chars, no leading hyphen)
  'STRING_FORMAT.domain': c(z.string().regex(/^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/)),
  // domainStrict: 2-6 labels, no leading/trailing hyphen per label, no digit-only TLD, no underscore
  // valid: 'mion.io','sub.example.com','aa.bb.cc.dd.ee.com' (6 labels)
  // invalid: 'aa.bb.cc.dd.ee.ff.com' (7 labels), '-bad.com', 'example.123', 'ex_ample.com', 'localhost'
  'STRING_FORMAT.domainStrict': c(z.string().refine((s) => {
    const parts = s.split('.');
    if (parts.length < 2 || parts.length > 6) return false;
    const tld = parts[parts.length - 1];
    if (/^\d+$/.test(tld)) return false; // TLD must not be all digits
    for (const part of parts) {
      if (!part || part.startsWith('-') || part.endsWith('-')) return false;
      if (!/^[A-Za-z0-9-]+$/.test(part)) return false; // no underscore
    }
    return true;
  })),
  // email: standard email (localPart≥2 chars, domain label≥2 chars, TLD≥2 chars; + allowed in localPart)
  'STRING_FORMAT.email': c(z.string().refine((s) => {
    const atIdx = s.lastIndexOf('@');
    if (atIdx < 2) return false; // localPart must be ≥2 chars
    const local = s.slice(0, atIdx);
    const domain = s.slice(atIdx + 1);
    if (!/^[A-Za-z0-9.+_-]+$/.test(local)) return false;
    const parts = domain.split('.');
    if (parts.length < 2) return false;
    const tld = parts[parts.length - 1];
    const firstLabel = parts[0];
    if (tld.length < 2 || firstLabel.length < 2) return false;
    return parts.every((p) => /^[A-Za-z0-9-]+$/.test(p) && p.length > 0);
  })),
  // emailPunycode: email with punycode TLD (xn--...)
  'STRING_FORMAT.emailPunycode': c(z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/).refine((s) => {
    const [, domain] = s.split('@');
    return !!domain && domain.includes('.');
  })),
  // emailStrict: no + in local part, no spaces, no double @, no underscore in domain
  'STRING_FORMAT.emailStrict': c(z.string().regex(/^[a-zA-Z0-9.]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/)),
  // url: http/ftp/ws/wss schemes (mailto rejected); zod strips trailing ':' from protocol before testing regex
  'STRING_FORMAT.url': c(z.url({protocol: /^(https?|ftps?|wss?)$/})),
  // urlHttp: http(s) only
  'STRING_FORMAT.urlHttp': c(z.httpUrl()),
  // urlFile: file:// URLs; zod strips trailing ':' from protocol before testing
  'STRING_FORMAT.urlFile': c(z.url({protocol: /^file$/})),
  'STRING_FORMAT.pattern_slug': c(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  'STRING_FORMAT.pattern_hex': c(z.string().regex(/^[0-9a-fA-F]+$/)),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': c(z.number().finite().max(100)),
  'NUMBER_FORMAT.number_min': c(z.number().finite().min(0)),
  'NUMBER_FORMAT.number_lt': c(z.number().finite().lt(10)),
  'NUMBER_FORMAT.number_gt': c(z.number().finite().gt(0)),
  'NUMBER_FORMAT.number_integer': c(z.number().int()),
  'NUMBER_FORMAT.number_float': c(z
      .number()
      .finite()
      .refine((n) => !Number.isInteger(n))),
  'NUMBER_FORMAT.number_multipleOf': c(z.number().finite().multipleOf(5)),
  'NUMBER_FORMAT.number_combined': c(z.number().int().min(0).max(100).multipleOf(5)),
  'NUMBER_FORMAT.number_int8': c(z.number().int().min(-128).max(127)),
  'NUMBER_FORMAT.number_uint8': c(z.number().int().min(0).max(255)),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': c(z.bigint().lte(100n)),
  'BIGINT_FORMAT.bigint_min': c(z.bigint().gte(0n)),
  'BIGINT_FORMAT.bigint_lt': c(z.bigint().lt(10n)),
  'BIGINT_FORMAT.bigint_gt': c(z.bigint().gt(0n)),
  'BIGINT_FORMAT.bigint_multipleOf': c(z.bigint().multipleOf(5n)),
  'BIGINT_FORMAT.bigint_combined': c(z.bigint().gte(0n).lte(1000n).multipleOf(10n)),
  'BIGINT_FORMAT.bigint_int64': c(z.bigint().gte(-9223372036854775808n).lte(9223372036854775807n)),
  'BIGINT_FORMAT.bigint_uint64': c(z.bigint().gte(0n).lte(18446744073709551615n)),

  // ── DATETIME ──
  // date min/max via z.date() with refine — zod date() accepts Date instances, no built-in min/max
  'DATETIME.date_minmax': c(z.date().refine((d) => d >= new Date(Date.UTC(2020, 0, 1)) && d <= new Date(Date.UTC(2020, 11, 31, 23, 59, 59)))),
  'DATETIME.date_gtlt': c(z.date().refine((d) => d > new Date(Date.UTC(2020, 0, 1, 0, 0, 0)) && d < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)))),
  'DATETIME.date_min_lt': c(z.date().refine((d) => d >= new Date(Date.UTC(2020, 0, 1, 0, 0, 0)) && d < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)))),
  'DATETIME.date_max_now': c(z.date().refine((d) => d <= new Date())),
  'DATETIME.date_rel_window': c(z.date().refine((d) => {
    const now = new Date();
    const minDate = new Date(now);
    minDate.setFullYear(minDate.getFullYear() - 1000);
    const maxDate = new Date(now);
    maxDate.setFullYear(maxDate.getFullYear() + 1000);
    return d >= minDate && d <= maxDate;
  })),
  'DATETIME.date_rel_datetime_components': c(z.date().refine((d) => {
    const now = new Date();
    const minDate = new Date(now);
    minDate.setFullYear(minDate.getFullYear() - 1000);
    minDate.setHours(minDate.getHours() - 12);
    return d >= minDate;
  })),
  'DATETIME.instant_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.instant_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws

  // ── REALWORLD ──
  'REALWORLD.user': c(z.object({
      id: z.number(),
      email: z.string(),
      name: z.string(),
      age: z.number().optional(),
      roles: z.array(z.enum(['admin', 'editor', 'user'])),
      active: z.boolean(),
      createdAt: z.string(),
    })),
  'REALWORLD.order': c(z.object({
      id: z.string(),
      customer: z.object({id: z.number(), email: z.string()}),
      items: z.array(z.object({sku: z.string(), name: z.string(), qty: z.number(), price: z.number()})),
      shipping: addressZ,
      status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
      total: z.number(),
      note: z.string().optional(),
    })),
  'REALWORLD.blogPost': c(z.object({
      id: z.number(),
      title: z.string(),
      slug: z.string(),
      body: z.string(),
      tags: z.array(z.string()),
      author: z.object({name: z.string(), email: z.string()}),
      published: z.boolean(),
      publishedAt: z.string().optional(),
      meta: z.object({views: z.number(), likes: z.number()}),
    })),
  'REALWORLD.product': c(productZ),
  'REALWORLD.productPage': c(z.object({
      data: z.array(productZ),
      page: z.number(),
      pageSize: z.number(),
      total: z.number(),
      hasMore: z.boolean(),
    })),
  'REALWORLD.registrationForm': c(z.object({
      email: z.string(),
      password: z.string(),
      acceptedTerms: z.literal(true),
      profile: z.object({firstName: z.string(), lastName: z.string(), age: z.number().optional()}),
    })),
};
