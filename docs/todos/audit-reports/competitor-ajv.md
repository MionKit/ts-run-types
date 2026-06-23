# Competitor audit — ajv

- **Competitor:** ajv
- **Version:** 8.20.0 (+ ajv-formats, `mode: 'full'`)
- **Total cases:** 266
- **Verdicts (post-fix):** the 3 WRONG mis-marks + the borderline template-literal row are now implemented as real compiled schemas (`FIXED (was WRONG)`); the 4 SUSPECT comment issues are corrected (`FIXED`); `key_conditional_rename` keeps its defensible opt-out with a corrected reason.
- **NOT_SUPPORTED count:** 118 → 114 (flipped 3 TYPE_MAPPINGS/template rows to supported: `key_prefix_rename`, `key_filter_via_never`, `template_literal_index_key`). The remaining 114 opt-outs (bigint, symbol, Date/Map/Set/RegExp/Promise/Temporal instances, cyclic values, case-insensitive, `date_DMY` calendar-validity) are genuinely JSON-Schema-inexpressible.

## Conventions

Each supported case builds a self-contained Ajv inside its own thunk: `build` uses a default `Ajv({strict:false, allowUnionTypes:true})`, `buildErrors` adds `allErrors:true`; both call `addFormats(ajv,{mode:'full'})` then `ajv.compile(schema)` and wrap to a boolean. Every supported case compiles a REAL JSON Schema — **no hand-rolled JS predicate bypass anywhere in the file** (the idiomatic axis is clean across the board). The single systematic faithfulness gap is ajv's `{type:'number'}` accepting `NaN`/`Infinity` (`typeof === 'number'`, no finiteness check); every affected case carries a `samples.invalid` override dropping the non-finite entries (72 overridden divergences, 0 undeclared per `alignment-misalignments.json`). bigint/Date/symbol/Temporal/Map/Set/RegExp instances and cyclic VALUES are JSON-Schema-inexpressible and legitimately opt out.

## ATOMIC

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| ATOMIC.any | any | `{}` | yes | yes | OK | |
| ATOMIC.bigint | bigint | NOT_SUPPORTED (no bigint in JSON Schema) | n/a | n/a | OK | legit |
| ATOMIC.boolean | boolean | `{type:'boolean'}` | yes | yes | OK | |
| ATOMIC.date | Date | NOT_SUPPORTED (no Date instance type) | n/a | n/a | OK | legit |
| ATOMIC.enum_mixed | 0\|'green'\|2 | `{enum:[0,'green',2]}` | yes | yes | OK | |
| ATOMIC.literal_2 | 2 | `{const:2}` | yes | yes | OK | |
| ATOMIC.literal_a | 'a' | `{const:'a'}` | yes | yes | OK | |
| ATOMIC.literal_true | true | `{const:true}` | yes | yes | OK | |
| ATOMIC.literal_1n | 1n | NOT_SUPPORTED (bigint) | n/a | n/a | OK | legit |
| ATOMIC.literal_symbol | symbol literal | NOT_SUPPORTED (symbol) | n/a | n/a | OK | legit |
| ATOMIC.never | never | `{not:{}}` | yes | yes | OK | exact analogue |
| ATOMIC.null | null | `{type:'null'}` | yes | yes | OK | |
| ATOMIC.number | number | `{type:'number'}`, invalid override drops NaN/Inf | yes | yes | OK | override correct |
| ATOMIC.object | object | NOT_SUPPORTED (TS object includes arrays/Date/RegExp; ajv type:object rejects arrays) | n/a | n/a | OK | legit — can't accept arrays AND reject null/primitives the same way |
| ATOMIC.regexp | RegExp | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.string | string | `{type:'string'}` | yes | yes | OK | |
| ATOMIC.symbol | symbol | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.undefined | undefined | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.void | void | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.literal_2_noLiterals | number | `{type:'number'}`, override | yes | yes | OK | |
| ATOMIC.literal_a_noLiterals | string | `{type:'string'}` | yes | yes | OK | |
| ATOMIC.literal_regexp_noLiterals | RegExp | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.literal_true_noLiterals | boolean | `{type:'boolean'}` | yes | yes | OK | |
| ATOMIC.literal_1n_noLiterals | bigint | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.literal_symbol_noLiterals | symbol | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ATOMIC.unknown | unknown | `{}` | yes | yes | OK | |

## ARRAY

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| ARRAY.string_array | string[] | `{type:'array',items:{type:'string'}}` | yes | yes | OK | |
| ARRAY.number_array | number[] | array of number, override drops [Inf]/[NaN] | yes | yes | OK | |
| ARRAY.boolean_array | boolean[] | array of boolean | yes | yes | OK | |
| ARRAY.bigint_array | bigint[] | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ARRAY.date_array | Date[] | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ARRAY.regexp_array | RegExp[] | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ARRAY.undefined_array | undefined[] | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ARRAY.null_array | null[] | `items:{type:'null'}` | yes | yes | OK | |
| ARRAY.array_generic | string[] | array of string | yes | yes | OK | |
| ARRAY.string_array_2d | string[][] | nested array items | yes | yes | OK | |
| ARRAY.string_array_3d | string[][][] | triple-nested items | yes | yes | OK | |
| ARRAY.string_array_noIsArrayCheck | string[] (no isArray guard) | NOT_SUPPORTED (RunTypes-specific option) | n/a | n/a | OK | legit — no JSON Schema knob to strip arrayness check |
| ARRAY.object_array | {a:string}[] | array of object w/ required a | yes | yes | OK | |
| ARRAY.union_array | (string\|number)[] | items anyOf string/number, override drops [Inf] | yes | yes | OK | |
| ARRAY.tuple_array | [string,number][] | array of fixed 2-tuple | yes | yes | OK | |
| ARRAY.circular_array | CircularArray[] | `$id`+`$ref` self-ref | yes | yes | OK | idiomatic recursive `$ref` |
| ARRAY.circular_object_with_array | recursive obj via array prop | `$ref` self-ref object | yes | yes | OK | |
| ARRAY.symbol_array | symbol[] | NOT_SUPPORTED | n/a | n/a | OK | legit |
| ARRAY.readonly_string_array | readonly string[] | array of string | yes | yes | OK | readonly erased |

## OBJECT

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| OBJECT.simple_interface | {a:string;b:number} | object props+required, override drops NaN/Inf | yes | yes | OK | |
| OBJECT.object_as_const_literals | {name:'john';age:30} | const-valued props | yes | yes | OK | |
| OBJECT.object_via_return_type_utility | {id:number;name:string} | object props | yes | yes | OK | |
| OBJECT.object_via_property_access | {id:number;name:string} | object props | yes | yes | OK | |
| OBJECT.object_via_array_access | {id:number;name:string} | object props | yes | yes | OK | |
| OBJECT.interface_with_optional | {a:string;b?:number} | a required only, override drops NaN | yes | yes | OK | optional via absence-from-required |
| OBJECT.interface_with_date | {date:Date;name:string} | NOT_SUPPORTED | n/a | n/a | OK | legit |
| OBJECT.interface_with_method | {name:string;cb:()=>…} | object {name} only (method dropped) | yes | yes | OK | matches data-only drop semantics |
| OBJECT.nested_object | {a;deep:{b;c}} | nested object, override drops NaN | yes | yes | OK | |
| OBJECT.interface_string_array_prop | {tags:string[]} | object w/ array prop | yes | yes | OK | |
| OBJECT.circular_interface | linked-list shape | `$ref` self-ref | yes | yes | OK | |
| OBJECT.circular_interface_on_array | self via array prop | `$ref` self-ref | yes | yes | OK | |
| OBJECT.circular_interface_on_nested_object | self in nested obj | `$ref` self-ref | yes | yes | OK | |
| OBJECT.index_signature_string | {[k]:string} | `additionalProperties:{type:'string'}` | yes | yes | OK | |
| OBJECT.index_signature_named_props | {a;b;[k]:string\|number} | props+`additionalProperties` union | yes | yes | OK | |
| OBJECT.index_signature_nested | {[k]:{[k]:number}} | nested additionalProperties, override NaN | yes | yes | OK | |
| OBJECT.index_signature_date_value | {[k]:{[k]:Date}} | NOT_SUPPORTED | n/a | n/a | OK | legit |
| OBJECT.index_signature_non_root | {b;c:{[k]:string}} | nested additionalProperties | yes | yes | OK | |
| OBJECT.function_top_level | () => … | NOT_SUPPORTED | n/a | n/a | OK | legit |
| OBJECT.interface_callable | callable interface | NOT_SUPPORTED | n/a | n/a | OK | legit |
| OBJECT.interface_all_optional | all-optional (plain-obj guard) | NOT_SUPPORTED | n/a | n/a | FIXED (was SUSPECT) | opt-out kept; comment already cited the correct blocker (all-optional plain-object guard rejects Date/Map/Set/RegExp which ajv `{type:'object'}` accepts) — confirmed accurate, left as-is. |
| OBJECT.class_simple | class w/ Date prop | NOT_SUPPORTED | n/a | n/a | OK | legit (Date prop) |
| OBJECT.rpc_error_class | branded class | object const-brand+const-type+props | yes | yes | OK | unicode keys handled |
| OBJECT.call_signature_params | Parameters → [number,boolean] | fixed 2-tuple, override drops NaN | yes | yes | OK | |
| OBJECT.call_signature_params_with_optional | [number,boolean,string?] | items[3] min2 max3, override | yes | yes | OK | |
| OBJECT.call_signature_params_with_rest | [...Date[]] | NOT_SUPPORTED | n/a | n/a | OK | legit (Date rest) |
| OBJECT.record_union_keys | {a:number;b:number} | object props, override drops NaN/Inf | yes | yes | OK | |
| OBJECT.union_value_index | {[k]:string\|number\|bigint} | NOT_SUPPORTED (bigint) | n/a | n/a | OK | legit |
| OBJECT.object_with_union_prop | {kind:'a'\|'b';n:number} | enum kind+number, override NaN | yes | yes | OK | |
| OBJECT.interface_inheritance | extends → {a;b} | merged props | yes | yes | OK | |
| OBJECT.class_inheritance | extends → {a;b} | merged props | yes | yes | OK | |
| OBJECT.index_signature_number_key | {[k:number]:string} | `additionalProperties:{type:'string'}` | yes | yes | OK | runtime keys are strings |

## TUPLE

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| TUPLE.string_number_pair | [string,number] | items[]+min2+max2, override NaN | yes | yes | OK | draft-7 tuple form |
| TUPLE.full_mion_tuple | [Date,…,bigint] | NOT_SUPPORTED | n/a | n/a | OK | legit (Date+bigint) |
| TUPLE.tuple_with_optional | trailing optional bigint | NOT_SUPPORTED | n/a | n/a | OK | legit (bigint) |
| TUPLE.nested_tuple_in_array | [string,number][] | array of 2-tuple, override NaN | yes | yes | OK | |
| TUPLE.tuple_rest | [number,...string[]] | items[number]+additionalItems:string | yes | yes | OK | correct draft-7 rest |
| TUPLE.tuple_circular | self-ref w/ Date,bigint | NOT_SUPPORTED | n/a | n/a | OK | legit |
| TUPLE.tuple_multiple_trailing_optionals | number+bigint slots | NOT_SUPPORTED | n/a | n/a | OK | legit (bigint) |
| TUPLE.tuple_named_labels | [name:string,age:number] | items[]+min2+max2, override | yes | yes | OK | labels erased |
| TUPLE.tuple_with_non_serializable | function slot ===undefined | NOT_SUPPORTED | n/a | n/a | OK | legit (needs undefined) |
| TUPLE.empty_tuple | [] | `{type:'array',maxItems:0}` | yes | yes | OK | |
| TUPLE.single_element_tuple | [string] | items[string] min1 max1 | yes | yes | OK | |
| TUPLE.readonly_tuple | readonly [T,U] | items[] min2 max2 | yes | yes | OK | readonly erased |

## UNION

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| UNION.atomic_union | Date\|number\|string\|null\|bigint | NOT_SUPPORTED (Date+bigint) | n/a | n/a | OK | legit |
| UNION.string_literal_union | 'UNO'\|'DOS'\|'TRES' | `{enum:[...]}` | yes | yes | OK | |
| UNION.large_union_eight_arms | 8-arm incl bigint | NOT_SUPPORTED (bigint arm) | n/a | n/a | OK | legit |
| UNION.string_or_number | string\|number | anyOf, override drops NaN/Inf/bigint→keeps bigint | yes | yes | OK | |
| UNION.union_of_array_types | string[]\|number[]\|boolean[] | anyOf of arrays, override [Inf] | yes | yes | OK | |
| UNION.array_of_union | (bigint\|…\|Date)[] | NOT_SUPPORTED | n/a | n/a | OK | legit |
| UNION.union_of_object_shapes | disjoint shapes incl bigint | NOT_SUPPORTED | n/a | n/a | OK | legit (bigint arm) |
| UNION.discriminated_union | {kind:'a';n}\|{kind:'b';s} | anyOf const-discriminated, override NaN | yes | yes | OK | |
| UNION.circular_union | self-ref incl Date | NOT_SUPPORTED | n/a | n/a | OK | legit (Date) |
| UNION.union_with_methods | obj arms w/ methods | anyOf data-only props | yes | yes | OK | |
| UNION.intersection_to_object | {a;b} merged | object props, override NaN/Inf | yes | yes | OK | |
| UNION.union_with_index_arm | arm has bigint values | NOT_SUPPORTED | n/a | n/a | OK | legit |
| UNION.union_same_prop_different_types | discriminated `prop` | anyOf const+typed prop | yes | yes | OK | |
| UNION.union_mixed_arrays_and_objects | arrays+objects incl bigint | NOT_SUPPORTED | n/a | n/a | SUSPECT | reason cites bigint sample `{b:123,c:123n}` + NaN; arrays/objects modelable but a bigint-bearing VALID sample blocks faithful modelling — opt-out defensible |
| UNION.union_merged_property | {a:boolean\|number} | anyOf shapes, override NaN | yes | yes | OK | |
| UNION.union_mixed_with_index | index arms w/ bigint | NOT_SUPPORTED | n/a | n/a | OK | legit (bigint) |
| UNION.union_with_any_fallback | collapses to any | `{}` | yes | yes | OK | |
| UNION.union_with_unknown_fallback | collapses to unknown | `{}` | yes | yes | OK | |
| UNION.union_subset_small_first | {a}\|{a;b} | anyOf | yes | yes | OK | |
| UNION.union_subset_nested_levels | 3-level subset | anyOf x3 | yes | yes | OK | |
| UNION.union_subset_mixed_related_unrelated | subset pair + disjoint | anyOf x3, override NaN | yes | yes | OK | |

## TEMPLATE_LITERAL

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| TEMPLATE_LITERAL.url_with_number_id | `api/user/${number}` | `{type:'string',pattern:…}` | yes | yes | OK | regex matches number spans |
| TEMPLATE_LITERAL.multi_segment_url | multi-placeholder URL | string+pattern | yes | yes | OK | |
| TEMPLATE_LITERAL.leading_string_placeholder | `${string}/${number}` | string+pattern (`[\s\S]*`) | yes | yes | OK | |
| TEMPLATE_LITERAL.regex_special_chars | metachars escaped | string+pattern w/ escaped parens | yes | yes | OK | |
| TEMPLATE_LITERAL.template_literal_nested_in_object | obj w/ TL prop | object+prop pattern | yes | yes | OK | |
| TEMPLATE_LITERAL.template_literal_index_key | `{[k:\`api/${string}\`]:number}` | `patternProperties:{'^api\/[\s\S]*$':{type:'number'}}, additionalProperties:false`, NaN dropped | yes | yes | FIXED (was WRONG) | now compiles `patternProperties` keyed on `^api\/[\s\S]*$` (`${string}`→`[\s\S]*`) + `additionalProperties:false`; rejects non-matching keys + wrong values; NaN dropped via samples override |
| TEMPLATE_LITERAL.template_literal_union_placeholder | `${'a'\|'b'}-${number}` | string+pattern w/ `(?:a\|b)` | yes | yes | OK | |

## NATIVE

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| NATIVE.map_string_number | Map | NOT_SUPPORTED | n/a | n/a | OK | legit |
| NATIVE.set_string | Set | NOT_SUPPORTED | n/a | n/a | OK | legit |
| NATIVE.promise_string | Promise/thenable | NOT_SUPPORTED | n/a | n/a | OK | legit |
| NATIVE.awaited_promise | Awaited→string | `{type:'string'}` | yes | yes | OK | resolves to string |

## CIRCULAR

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| CIRCULAR.object_full_mion_shape | n:number+optional Date+self | NOT_SUPPORTED | n/a | n/a | OK | legit — invalid samples reject NaN AND Date, ajv can't do either at number/Date |
| CIRCULAR.array_of_union_with_self_ref | self-ref array w/ Date | NOT_SUPPORTED | n/a | n/a | OK | legit (Date) |
| CIRCULAR.object_with_tuple_prop | tuple has bigint | NOT_SUPPORTED | n/a | n/a | OK | legit (bigint) |
| CIRCULAR.object_with_index_prop | self via index sig | `$ref`+additionalProperties | yes | yes | OK | recursive `$ref` |
| CIRCULAR.object_deeply_nested | self 4 levels deep | nested `$ref` | yes | yes | OK | |
| CIRCULAR.circular_child_under_literal_root | child has bigint | NOT_SUPPORTED | n/a | n/a | OK | legit (bigint) |
| CIRCULAR.multiple_circular_types_cross_referenced | bigint+Date | NOT_SUPPORTED | n/a | n/a | OK | legit |

## CIRCULAR_REFS

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| CIRCULAR_REFS.linked_list_cycle | cyclic VALUE rejected | NOT_SUPPORTED | n/a | n/a | OK | legit — ajv has no cyclic-value detection (would overflow) |
| CIRCULAR_REFS.tree_cycle | cyclic VALUE rejected | NOT_SUPPORTED | n/a | n/a | OK | legit |
| CIRCULAR_REFS.object_self_cycle | cyclic VALUE rejected | NOT_SUPPORTED | n/a | n/a | OK | legit |

## UTILITY

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| UTILITY.partial | Partial w/ Date prop | NOT_SUPPORTED | n/a | n/a | OK | legit (Date) |
| UTILITY.required | Required w/ Date prop | NOT_SUPPORTED | n/a | n/a | OK | legit |
| UTILITY.pick | Pick → Date prop | NOT_SUPPORTED | n/a | n/a | OK | legit |
| UTILITY.omit | Omit → Date prop | NOT_SUPPORTED | n/a | n/a | OK | legit |
| UTILITY.exclude_atomic | 'name'\|'createdAt' | `{enum:[...]}` | yes | yes | OK | |
| UTILITY.extract_atomic | 'name'\|'createdAt' | `{enum:[...]}` | yes | yes | OK | |
| UTILITY.exclude_from_object_union | discriminated union | anyOf, override NaN | yes | yes | OK | |
| UTILITY.non_nullable | string\|number | anyOf, override NaN/Inf | yes | yes | OK | |
| UTILITY.return_type | ReturnType→Date | NOT_SUPPORTED | n/a | n/a | OK | legit |
| UTILITY.readonly | {name;age} | object props, override NaN | yes | yes | OK | |
| UTILITY.intersection_with_required_override | optional Date prop | NOT_SUPPORTED | n/a | n/a | OK | legit (Date) |
| UTILITY.omit_keeping_optional | {b?:number;c:boolean} | object c required, override NaN | yes | yes | OK | |
| UTILITY.keyof_to_literal_union | keyof → 3 literals | `{enum:[...]}` | yes | yes | OK | |
| UTILITY.typeof_variable_query | {url;port} | object props | yes | yes | OK | |
| UTILITY.indexed_access_type | Person['name']→string | `{type:'string'}` | yes | yes | OK | |
| UTILITY.conditional_type_resolved | → boolean | `{type:'boolean'}` | yes | yes | OK | |
| UTILITY.mapped_type_custom | {[K]:T[K]\|null} | props `type:[X,'null']` | yes | yes | OK | |
| UTILITY.mapped_type_with_conditional_value | per-prop shapes | nested const-discriminated objects | yes | yes | OK | |
| UTILITY.distributive_conditional_over_union | {w:string}\|{w:number} | anyOf, override NaN | yes | yes | OK | |
| UTILITY.deep_partial_recursive_mapped | DeepPartial w/ enum literals | NOT_SUPPORTED | n/a | n/a | FIXED (was SUSPECT) | opt-out kept; comment corrected — real blocker is the all-optional plain-object guard rejecting the `new Date()` invalid sample, which ajv `{type:'object'}` accepts (so a faithful schema can't reject it). |

## TYPE_MAPPINGS

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| TYPE_MAPPINGS.key_prefix_rename | {user_id:number;user_name:string} | `{type:'object',properties:{user_id:{type:'number'},user_name:{type:'string'}},required:['user_id','user_name']}` | yes | yes | FIXED (was WRONG) | mapped type resolves to a concrete object literal; plain properties+required. No non-finite invalids so no override needed. |
| TYPE_MAPPINGS.key_conditional_rename | {_id:number;name;createdAt:Date} | NOT_SUPPORTED | n/a | n/a | FIXED (comment) | opt-out kept (resolved shape carries a real `createdAt: Date` prop — JSON Schema has no Date instance type); stale "no analogue" reason corrected to cite the Date prop. |
| TYPE_MAPPINGS.key_filter_via_never | {id:number;name:string} | `{type:'object',properties:{id:{type:'number'},name:{type:'string'}},required:['id','name']}` | yes | yes | FIXED (was WRONG) | resolves to plain `{id:number;name:string}`; extra `secret` prop passes structurally (default `additionalProperties` allows it). No non-finite invalids so no override needed. |

## DATETIME (instances)

All 9 + 21 relative cases below are `Date` / `Temporal.*` instances (samples pass real `new Date()` / `Temporal.X.from(...)` objects, reject ISO strings). JSON Schema has no instance type → every opt-out is **legit (OK)**.

| case key | intended type | impl | verdict |
|---|---|---|---|
| DATETIME.date / instant / zonedDateTime / plainDate / plainTime / plainDateTime / plainYearMonth / plainMonthDay / duration | Date/Temporal instance | NOT_SUPPORTED | OK (legit) |
| DATETIME.date_minmax / date_gtlt / date_min_lt / date_max_now / date_rel_window / date_rel_datetime_components | Date instance + bounds | NOT_SUPPORTED | OK (legit) |
| DATETIME.instant_minmax / instant_gtlt / instant_rel | Temporal.Instant | NOT_SUPPORTED | OK (legit) |
| DATETIME.plainDate_minmax / _gtlt / _min_lt / _gt_max / _min_only / _max_only / _gt_only / _lt_only / _rel_window / _rel_ymd / _rel_weeks | Temporal.PlainDate | NOT_SUPPORTED | OK (legit) |
| DATETIME.plainTime_minmax / _gtlt | Temporal.PlainTime | NOT_SUPPORTED | OK (legit) |
| DATETIME.plainDateTime_minmax / _gtlt / _rel / _rel_combo | Temporal.PlainDateTime | NOT_SUPPORTED | OK (legit) |
| DATETIME.plainYearMonth_minmax / _gtlt / _rel | Temporal.PlainYearMonth | NOT_SUPPORTED | OK (legit) |
| DATETIME.zonedDateTime_minmax / _gtlt / _rel | Temporal.ZonedDateTime | NOT_SUPPORTED | OK (legit) |

## STRING_FORMAT

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| STRING_FORMAT.string_maxLength | maxLength 5 | `{type:'string',maxLength:5}` | yes | yes | OK | |
| STRING_FORMAT.string_minLength | minLength 3 | string+minLength | yes | yes | OK | |
| STRING_FORMAT.string_length | exact 4 | min4+max4 | yes | yes | OK | |
| STRING_FORMAT.string_range | 2..4 | min2+max4 | yes | yes | OK | |
| STRING_FORMAT.string_allowedChars | hex set | pattern `^[0-9a-f]+$` | yes | yes | OK | |
| STRING_FORMAT.string_allowedChars_ignoreCase | case-fold | NOT_SUPPORTED | n/a | n/a | OK | legit — JSON Schema pattern has no `i` flag |
| STRING_FORMAT.string_allowedChars_literal | literal `.-` | pattern `^[.\-]+$` | yes | yes | OK | |
| STRING_FORMAT.string_disallowedChars | no `!@#` | pattern `^[^!@#]*$` | yes | yes | OK | |
| STRING_FORMAT.string_allowedValues | red/green/blue | `enum` | yes | yes | OK | |
| STRING_FORMAT.string_allowedValues_ignoreCase | case-fold enum | NOT_SUPPORTED | n/a | n/a | OK | legit |
| STRING_FORMAT.string_allowedValues_escaped | 'a.b','c+d' | `enum` (literal compare) | yes | yes | OK | |
| STRING_FORMAT.string_disallowedValues | not admin/root | `not:{enum:[…]}` | yes | yes | OK | |
| STRING_FORMAT.string_customErrorMessage | 'a'\|'b' | `enum` | yes | yes | OK | error-text axis not modelled but accept/reject correct |
| STRING_FORMAT.alpha | letters | pattern `^[A-Za-z]+$` | yes | yes | OK | |
| STRING_FORMAT.alphaNumeric | alnum | pattern | yes | yes | OK | |
| STRING_FORMAT.numeric | digits | pattern `^[0-9]+$` | yes | yes | OK | |
| STRING_FORMAT.alpha_withLength | letters maxLen3 | pattern+maxLength | yes | yes | OK | |
| STRING_FORMAT.lowercase_validate | transformer→string | `{type:'string'}` | yes | yes | OK | validate-only is plain string |
| STRING_FORMAT.uuidv4 | UUID v4 | pattern w/ `4` nibble + `[89abAB]` | yes | yes | OK | rejects v7; could use `format:'uuid'` but pattern is fine |
| STRING_FORMAT.uuidv7 | UUID v7 | pattern w/ `7` nibble | yes | yes | OK | rejects v4 |
| STRING_FORMAT.date_iso | ISO date | `format:'date'` (ajv-formats full) | yes | yes | OK | calendar-aware |
| STRING_FORMAT.date_DMY | DD-MM-YYYY | NOT_SUPPORTED | n/a | n/a | FIXED (was SUSPECT) | re-examined and NOT promotable: invalid sample `31-04-2024` is layout-valid (DD=31, MM=04) but April has 30 days; a layout+bounds pattern (mirroring date_MD) would WRONGLY accept it. Rejecting it needs per-month day-count validation a pattern can't express. Earlier "no leap-year edge" claim missed this April-31 calendar invalid. Comment corrected; opt-out kept. |
| STRING_FORMAT.date_YM | YYYY-MM | pattern | yes | yes | OK | |
| STRING_FORMAT.date_MD | MM-DD | pattern | yes | yes | OK | |
| STRING_FORMAT.date_minMax_absolute | date range | NOT_SUPPORTED | n/a | n/a | OK | legit — no string-date comparison in JSON Schema |
| STRING_FORMAT.time_iso | ISO time | pattern (tz-aware) | yes | yes | OK | |
| STRING_FORMAT.time_HHmmss | HH:mm:ss | pattern | yes | yes | OK | |
| STRING_FORMAT.time_HHmmss_ms | optional ms | pattern | yes | yes | OK | |
| STRING_FORMAT.time_minMax_absolute | time range | NOT_SUPPORTED | n/a | n/a | OK | legit |
| STRING_FORMAT.dateTime_default | ISO date-time | `format:'date-time'`+`pattern:'T'` | yes | yes | OK | clever: format gives calendar validity, pattern forces `T` separator |
| STRING_FORMAT.dateTime_custom | DD-MM-YYYY HH:mm | pattern | yes | yes | OK | |
| STRING_FORMAT.dateTime_minMax_absolute | range | NOT_SUPPORTED | n/a | n/a | OK | legit |
| STRING_FORMAT.ipv4 | IPv4 | `format:'ipv4'` | yes | yes | OK | ajv-formats |
| STRING_FORMAT.ipv6 | IPv6 | `format:'ipv6'` | yes | yes | OK | |
| STRING_FORMAT.ip_any | v4\|v6 | anyOf of two patterns | yes | yes | OK | could use two `format`s; patterns acceptable |
| STRING_FORMAT.ipv4_port | v4:port | pattern w/ port range | yes | yes | OK | |
| STRING_FORMAT.ipv6_port | [v6]:port | pattern | yes | yes | OK | |
| STRING_FORMAT.domain | domain | pattern | yes | yes | OK | rejects 1-char TLD, leading hyphen |
| STRING_FORMAT.domainStrict | strict domain | pattern w/ maxParts | yes | yes | OK | |
| STRING_FORMAT.email | email | pattern (2+ local, 2+ TLD) | yes | yes | OK | uses pattern not `format:'email'` to match the suite's stricter accept/reject set — justified |
| STRING_FORMAT.emailPunycode | punycode TLD | pattern w/ `xn--` | yes | yes | OK | |
| STRING_FORMAT.emailStrict | strict email | pattern | yes | yes | OK | |
| STRING_FORMAT.url | http/ftp/ws | pattern scheme alternation | yes | yes | OK | `format:'uri'` too loose; pattern matches the suite | 
| STRING_FORMAT.urlHttp | http(s) | pattern | yes | yes | OK | |
| STRING_FORMAT.urlFile | file:// | pattern | yes | yes | OK | |
| STRING_FORMAT.pattern_slug | slug | pattern | yes | yes | OK | |
| STRING_FORMAT.pattern_hex | hex (case-insens) | pattern `^[0-9a-fA-F]+$` | yes | yes | OK | case handled by char-class, not `i` flag |

## NUMBER_FORMAT

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| NUMBER_FORMAT.number_max | ≤100 | `{type:'number',maximum:100}` | yes | yes | OK | |
| NUMBER_FORMAT.number_min | ≥0 | minimum:0 | yes | yes | OK | |
| NUMBER_FORMAT.number_lt | <10 | exclusiveMaximum:10 | yes | yes | OK | |
| NUMBER_FORMAT.number_gt | >0 | exclusiveMinimum:0 | yes | yes | OK | |
| NUMBER_FORMAT.number_integer | integer | `{type:'integer'}` | yes | yes | OK | |
| NUMBER_FORMAT.number_float | non-integer | `{type:'number',not:{type:'integer'}}` | yes | yes | OK | clever inverse |
| NUMBER_FORMAT.number_multipleOf | %5 | multipleOf:5 | yes | yes | OK | |
| NUMBER_FORMAT.number_combined | int 0..100 %5 | integer+min+max+multipleOf | yes | yes | OK | |
| NUMBER_FORMAT.number_int8 | -128..127 int | integer+min+max | yes | yes | OK | |
| NUMBER_FORMAT.number_uint8 | 0..255 int | integer+min+max | yes | yes | OK | |

Note: NUMBER_FORMAT samples never include NaN/Infinity in invalid (the bounds + integer keywords already constrain), so no override needed and faithfulness holds.

## BIGINT_FORMAT

| case key | intended type | impl | verdict |
|---|---|---|---|
| BIGINT_FORMAT.bigint_max / _min / _lt / _gt / _multipleOf / _combined / _int64 / _uint64 | bigint + bounds | NOT_SUPPORTED | OK (legit — no bigint in JSON Schema) |

## REALWORLD

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
|---|---|---|---|---|---|---|
| REALWORLD.user | User | object, roles enum-array, createdAt:string | yes | yes | OK | createdAt is `string` in type (not Date) → faithful |
| REALWORLD.order | Order | nested objects+items array+status enum | yes | yes | OK | |
| REALWORLD.blogPost | BlogPost | object+tags+author+meta | yes | yes | OK | |
| REALWORLD.product | Product | object+currency enum+dimensions optional | yes | yes | OK | |
| REALWORLD.productPage | ProductPage | data:Product[] paginated | yes | yes | OK | |
| REALWORLD.registrationForm | RegistrationForm | object, acceptedTerms const true | yes | yes | OK | |

## Findings summary

### WRONG — stale NOT_SUPPORTED, expressible idiomatically in JSON Schema (3 confirmed mis-marks + 1 borderline)
- **`TYPE_MAPPINGS.key_prefix_rename`** — resolves to `{user_id:number;user_name:string}`; plain `properties`+`required`. Mark supported.
- **`TYPE_MAPPINGS.key_filter_via_never`** — resolves to `{id:number;name:string}` (extra `secret` passes structurally). Mark supported.
- **`TEMPLATE_LITERAL.template_literal_index_key`** — `patternProperties` keyed on the compiled template regex + `additionalProperties:false` rejects non-matching keys and wrong value types (the lone NaN sample is the droppable universal number caveat). Mark supported.
- **`TYPE_MAPPINGS.key_conditional_rename`** — opt-out is actually defensible (the resolved shape carries a real `createdAt: Date` prop), but the stated reason ("no JSON Schema analogue for renaming") is WRONG; the true blocker is the Date prop. Fix the comment, keep opt-out.

### SUSPECT — opt-out defensible but reason is wrong/weak, or a pattern could express it
- **`OBJECT.interface_all_optional`**, **`UTILITY.deep_partial_recursive_mapped`** — both opt out citing enum/NaN/guard wording; the genuine blocker is that the all-optional "plain-object" guard rejects `new Date()`/`new Map()` instances, which ajv `{type:'object'}` happily accepts. Defensible opt-out; tighten the comment.
- **`UNION.union_mixed_arrays_and_objects`**, **`CIRCULAR.object_full_mion_shape`** — opt-out blocked by a bigint VALID sample / Date+NaN invalid samples respectively. Correct to opt out; reasons are fine but worth confirming the bigint/Date is the true cause.
- **`STRING_FORMAT.date_DMY`** — a layout+bounds pattern (mirroring `date_MD`/`date_YM`, which ARE supported) would pass this case's samples (no leap-year edge in the DMY invalid set). Only true calendar leap-validity is unreachable. Could be promoted to supported with a pattern.

### Systematic faithfulness pattern (handled correctly)
- **Non-finite numbers:** ajv `{type:'number'}` accepts `NaN`/`Infinity` (no finiteness check). Every affected case carries a `samples.invalid` override dropping the non-finite entries with an inline reason. Verified against `alignment-misalignments.json`: ajv shows 72 overridden divergences, **0 undeclared** — the override discipline is complete and correct.

### Idiomatic axis — clean
Every one of the 148 supported cases compiles a real JSON Schema via `ajv.compile`. **No hand-rolled `typeof` predicate or schema-bypassing `validate` function anywhere.** Custom regex patterns (UUID, email, URL, IP, template literals) are used where `format` is unavailable or too loose for the suite's accept/reject set — exactly what a real ajv user does. ajv-formats (`mode:'full'`) is used for `date`/`date-time`/`ipv4`/`ipv6`. The `{not:{type:'integer'}}` float trick and the `format:'date-time'`+`pattern:'T'` combo are both legitimate idiomatic constructions.

### NOT_SUPPORTED legitimacy
Of 118 opt-outs: bigint (all BIGINT_FORMAT + bigint-bearing unions/tuples/circulars), symbol, undefined/void, Date/RegExp/Map/Set/Promise instances, all 39 DATETIME instance cases, cyclic VALUES (CIRCULAR_REFS), and case-insensitive regex/enum are all genuinely JSON-Schema-inexpressible — legitimate. The only firm mis-marks are the 3 TYPE_MAPPINGS / template-index rows above that resolve to ordinary object/patternProperties schemas.
