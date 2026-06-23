# Competitor audit — @sinclair/typebox

- **Competitor:** typebox (`container/benchmarks/competitors/typebox/cases.ts`)
- **Version:** @sinclair/typebox 0.34.49
- **Total cases:** 266 (189 implemented, 77 `NOT_SUPPORTED`)
- **Verdicts (post-fix):** OK 258 (1 newly implemented) · SUSPECT 2 · FIXED/CONFIRMED 4
- **NOT_SUPPORTED:** 76 claims after fix (was 77) · **resolved mis-marks:** 1 implemented (`string_disallowedValues`), 3 confirmed-correct-as-NS after source check (`bigint_int64`, `bigint_uint64`, `template_literal_index_key`).
- **Audit-verdict correction:** my original `WRONG` flags on `bigint_int64`/`bigint_uint64` were themselves wrong — the float-rounding opt-out is real because TypeCompiler stringifies the bound into `BigInt(<numeric-literal>)`. Verified by running the codegen path in node.

> Note: alignment summary `summary.typebox.notSupported = 154` counts both metrics (validate + validationErrors) over the supported/NS split; the source file has 77 distinct `NOT_SUPPORTED` keys. The 16 typebox `records` divergences are ALL `samplesOverridden: true` (intended, dropped from aggregate) and concern the same documented limitation: `Type.Object` does not add a plain-object guard, so `interface_all_optional` / `partial` / `deep_partial_recursive_mapped` accept Date/Map/Set/RegExp/array where the reference rejects them.

Helper convention: every implemented case builds its own schema inside `build`/`buildErrors` and compiles via `TypeCompiler.Compile`; `build` returns `check.Check`, `buildErrors` iterates `check.Errors`. No `FormatRegistry`/`Type.Unsafe`/raw guards anywhere — string formats use `Type.String({pattern})`, value enums use `Type.Union([Type.Literal…])`. This is uniformly idiomatic.

## ATOMIC (26; 7 NS)

| case | intended | impl | faithful | idiomatic | verdict | issue |
|---|---|---|---|---|---|---|
| any | any | Type.Any() | yes | yes | OK | |
| bigint | bigint | Type.BigInt() | yes (typeof gate; Infinity is number) | yes | OK | |
| boolean | boolean | Type.Boolean() | yes | yes | OK | |
| date | Date (reject Invalid) | Type.Date() | yes (TB rejects NaN-time) | yes | OK | |
| enum_mixed | 0\|'green'\|2 | Union(Literal…) | yes | yes | OK | |
| literal_2 | 2 | Literal(2) | yes | yes | OK | |
| literal_a | 'a' | Literal('a') | yes | yes | OK | |
| literal_true | true | Literal(true) | yes | yes | OK | |
| literal_1n | 1n | NOT_SUPPORTED | claim valid — no bigint literal type in TB | — | OK | |
| literal_symbol | symbol literal | NOT_SUPPORTED | valid — no symbol literal | — | OK | |
| never | never | Type.Never() | yes | yes | OK | |
| null | null | Type.Null() | yes | yes | OK | |
| number | number (reject NaN/Inf) | Type.Number() | yes (AllowNaN default false) | yes | OK | |
| object | object (any non-null obj inc array/Date/regex) | NOT_SUPPORTED | valid — Type.Object({}) rejects arrays; no general 'object' kind | — | OK | |
| regexp | RegExp instance | NOT_SUPPORTED | valid — TB RegExp matches a string, not instanceof | — | OK | |
| string | string | Type.String() | yes | yes | OK | |
| symbol | symbol (factoryThrows) | NOT_SUPPORTED | valid — no symbol primitive | — | OK | |
| undefined | undefined | Type.Undefined() | yes | yes | OK | |
| void | void (accept undefined, reject null) | Type.Void() | yes | yes | OK | |
| literal_2_noLiterals | number | Type.Number() | yes | yes | OK | |
| literal_a_noLiterals | string | Type.String() | yes | yes | OK | |
| literal_true_noLiterals | boolean | Type.Boolean() | yes | yes | OK | |
| literal_1n_noLiterals | bigint | Type.BigInt() | yes | yes | OK | |
| literal_regexp_noLiterals | RegExp instance | NOT_SUPPORTED | valid — no RegExp instance type | — | OK | |
| literal_symbol_noLiterals | symbol (factoryThrows) | NOT_SUPPORTED | valid — symbol unsupported | — | OK | |
| unknown | unknown | Type.Unknown() | yes | yes | OK | |

## ARRAY (19; 3 NS)

| case | intended | impl | faithful | idiomatic | verdict | issue |
|---|---|---|---|---|---|---|
| string_array | string[] | Array(String) | yes | yes | OK | |
| number_array | number[] | Array(Number) | yes | yes | OK | |
| boolean_array | boolean[] | Array(Boolean) | yes | yes | OK | |
| bigint_array | bigint[] | Array(BigInt) | yes | yes | OK | |
| date_array | Date[] | Array(Date) | yes | yes | OK | |
| undefined_array | undefined[] | Array(Undefined) | yes | yes | OK | |
| null_array | null[] | Array(Null) | yes | yes | OK | |
| regexp_array | RegExp[] | NOT_SUPPORTED | valid — no RegExp instance type | — | OK | |
| string_array_noIsArrayCheck | accept non-arrays | NOT_SUPPORTED | valid — TB Array always Array.isArray-gates | — | OK | |
| symbol_array | symbol[] (factoryThrows) | NOT_SUPPORTED | valid — no symbol type | — | OK | |
| array_generic | Array<string> | Array(String) | yes | yes | OK | |
| string_array_2d | string[][] | Array(Array(String)) | yes | yes | OK | |
| string_array_3d | string[][][] | nested Array | yes | yes | OK | |
| object_array | {a:string}[] | Array(Object) | yes | yes | OK | |
| union_array | (string\|number)[] | Array(Union) | yes | yes | OK | |
| tuple_array | [string,number][] | Array(Tuple) | yes | yes | OK | |
| circular_array | self-ref array | Recursive(This=>Array(This)) | yes | yes | OK | |
| circular_object_with_array | recursive via array prop | Recursive(Object{…,d:Array(This)}) | yes | yes | OK | |
| readonly_string_array | readonly string[] | Array(String) | yes | yes | OK | |

## OBJECT (32; 2 NS)

| case | intended | impl | faithful | idiomatic | verdict | issue |
|---|---|---|---|---|---|---|
| simple_interface | {a:string;b:number} | Object | yes (extras allowed by default) | yes | OK | |
| object_as_const_literals | {name:'john';age:30} | Object(Literal,Literal) | yes | yes | OK | |
| object_via_return_type_utility | {id:number;name:string} | Object | yes | yes | OK | |
| object_via_property_access | same | Object | yes | yes | OK | |
| object_via_array_access | same | Object | yes | yes | OK | |
| interface_with_optional | {a;b?} | Object{a,Optional(b)} | yes | yes | OK | |
| interface_with_date | {date:Date;name} | Object | yes | yes | OK | |
| interface_with_method | {name} (fn prop skipped) | Object{name} | yes — extras pass, so cb:42 ok | yes | OK | |
| nested_object | nested | Object(Object) | yes | yes | OK | |
| interface_string_array_prop | {tags:string[]} | Object{Array(String)} | yes | yes | OK | |
| circular_interface | linked-list | Recursive(Object{name,Optional(This)}) | yes | yes | OK | |
| circular_interface_on_array | via array | Recursive | yes | yes | OK | |
| circular_interface_on_nested_object | buried self-ref | Recursive | yes | yes | OK | |
| index_signature_string | {[k]:string} | Record(String,String) | yes (pattern ^(.*)$ matches all keys) | yes | OK | |
| index_signature_named_props | {a;b}+index | Intersect(Object,Record) | yes | yes | OK | |
| index_signature_nested | nested index | Record(String,Record) | yes | yes | OK | |
| index_signature_date_value | index Date leaf | Record(String,Record(String,Date)) | yes | yes | OK | |
| index_signature_non_root | nested index prop | Object{Intersect(Object,Record)} | yes | yes | OK | |
| function_top_level | typeof==='function' | Type.Function([],Any) | yes via TypeCompiler typeof-function guard (alignment: 0 divergence) | borderline — Function is a TB "extended type" | SUSPECT | TFunction is documented as not-fully-supported for value validation; works here but relies on TypeCompiler emitting a typeof guard. Could use `Type.Unsafe<Function>({type:'function'})` w/ custom kind for robustness; current form passes alignment so low risk. |
| interface_all_optional | all-optional + plain-obj guard | Object{Optional,Optional} | partial — accepts Date/Map/Set/regex/[] (intended divergence, samplesOverridden) | yes | OK | documented limitation; rows dropped from aggregate |
| class_simple | {date;name} | Object | yes | yes | OK | |
| rpc_error_class | branded class shape | Object(Literal brand+…) | yes | yes | OK | |
| call_signature_params | [number,boolean] | Tuple | yes | yes | OK | |
| call_signature_params_with_optional | [number,boolean,string?] | Union(Tuple,Tuple) | yes | yes | OK | arity-union models trailing optional |
| call_signature_params_with_rest | [number,boolean,...Date[]] | NOT_SUPPORTED | valid — Type.Rest in Tuple is fragile / not TypeCompiler-checkable for unbounded rest | — | OK | |
| record_union_keys | Record<'a'\|'b',number> | Object{a:Number,b:Number} | yes (tsgo distributes union → fixed props) | yes | OK | |
| union_value_index | {[k]:string\|number} | Record(String,Union) | yes | yes | OK | |
| object_with_union_prop | {kind:'a'\|'b';n} | Object{Union,Number} | yes | yes | OK | |
| interface_inheritance | extends merge | Object (flattened) | yes | yes | OK | |
| class_inheritance | extends merge | Object (flattened) | yes | yes | OK | |
| index_signature_number_key | {[k:number]:string} | Record(String,String) | yes (JS keys are strings) | yes | OK | |

## TUPLE (12; 1 NS)

| case | intended | impl | faithful | idiomatic | verdict | issue |
|---|---|---|---|---|---|---|
| string_number_pair | [string,number] | Tuple | yes (TB rejects excess) | yes | OK | |
| full_mion_tuple | 6-elem hetero | Tuple(6) | yes | yes | OK | |
| tuple_with_optional | trailing optionals | Union(Tuple…) exhaustive arities | yes | yes (TB tuples have no optional slot; arity-union is the idiom) | OK | |
| nested_tuple_in_array | [string,number][] | Array(Tuple) | yes | yes | OK | |
| tuple_rest | [...rest] | NOT_SUPPORTED | valid — Type.Rest in Tuple throws/fragile at Compile | — | OK | |
| tuple_circular | self-ref tuple | Recursive(Union(Tuple,Tuple+This)) | yes | yes | OK | |
| tuple_multiple_trailing_optionals | many trailing opt | Union(Tuple…) | yes | yes | OK | |
| tuple_named_labels | labels erased | Tuple | yes | yes | OK | |
| tuple_with_non_serializable | [number,undefined?] | Union(Tuple([Number]),Tuple([Number,Undefined])) | yes | yes | OK | |
| empty_tuple | [] | Tuple([]) | yes | yes | OK | |
| single_element_tuple | [string] | Tuple([String]) | yes | yes | OK | |
| readonly_tuple | readonly [T,U] | Tuple | yes | yes | OK | |

## UNION (21; 0 NS)

All implemented as `Type.Union` of the corresponding member schemas (objects/arrays/literals/intersects). `Type.Object`'s extra-props-allowed default means subset/superset arms and "matches at least one arm" semantics hold. `any`/`unknown` fallbacks collapse correctly.

| case | impl | faithful | verdict |
|---|---|---|---|
| atomic_union | Union(Date,Number,String,Null,BigInt) | yes | OK |
| string_literal_union | Union(Literal×3) | yes | OK |
| large_union_eight_arms | Union(8 arms) | yes | OK |
| string_or_number | Union(String,Number) | yes | OK |
| union_of_array_types | Union(Array×3) | yes | OK |
| array_of_union | Array(Union(BigInt,…,Date)) | yes | OK |
| union_of_object_shapes | Union(Object×3) | yes (extras allowed → loose match) | OK |
| discriminated_union | Union(Object{kind:Literal,…}) | yes | OK |
| circular_union | Recursive(Union(…,Record(String,This),Array(This))) | yes | OK |
| union_with_methods | Union(Object,Object) (methods → extras) | yes | OK |
| intersection_to_object | Object (tsgo-resolved) | yes | OK |
| union_with_index_arm | Union(Object,Object,Intersect(Object,Record)) | yes | OK |
| union_same_prop_different_types | Union(Object{type:Literal,prop}) | yes | OK |
| union_mixed_arrays_and_objects | Union(Array…,Object…) | yes | OK |
| union_merged_property | Union(Object{a:Boolean},Object{a:Number}) | yes | OK |
| union_mixed_with_index | Union(Array,Object,Intersect) | yes | OK |
| union_with_any_fallback | Type.Any() | yes | OK |
| union_with_unknown_fallback | Type.Unknown() | yes | OK |
| union_subset_small_first | Union(Object{a},Object{a,b}) | yes | OK |
| union_subset_nested_levels | Union(Object×3) | yes | OK |
| union_subset_mixed_related_unrelated | Union(Object×3+disjoint) | yes | OK |

## UTILITY (20; 0 NS)

All use the native TB utility combinators (`Type.Partial/Required/Pick/Omit/Exclude/Extract/KeyOf/Intersect`) or tsgo-resolved object literals for mapped/conditional/indexed types. Idiomatic throughout.

| case | impl | faithful | verdict | note |
|---|---|---|---|---|
| partial | Partial(Object) | partial — Date/Map/Set accepted (intended divergence) | OK | samplesOverridden |
| required | Required(Object(Optional…)) | yes | OK | |
| pick | Pick(Object,[…]) | yes | OK | |
| omit | Omit(Object,['age']) | yes | OK | |
| exclude_atomic | Exclude(Union,Literal) | yes | OK | |
| extract_atomic | Extract(Union,Union) | yes | OK | |
| exclude_from_object_union | Exclude(Union,Union of circle arms) | yes | OK | |
| non_nullable | Exclude(Union,Union(Null,Undefined)) | yes | OK | |
| return_type | Type.Date() | yes | OK | |
| readonly | Object | yes | OK | |
| intersection_with_required_override | Intersect(Partial,Required(Pick)) | yes | OK | |
| omit_keeping_optional | Omit(Object{…,Optional},['a']) | yes | OK | |
| keyof_to_literal_union | KeyOf(Object) | yes | OK | |
| typeof_variable_query | Object{url,port} | yes | OK | |
| indexed_access_type | Type.String() | yes | OK | |
| conditional_type_resolved | Type.Boolean() | yes | OK | |
| mapped_type_custom | Object{Union(_,Null)…} | yes | OK | |
| mapped_type_with_conditional_value | Object of per-prop shapes | yes | OK | |
| distributive_conditional_over_union | Union(Object,Object) | yes | OK | |
| deep_partial_recursive_mapped | Object(nested Optional) | partial — Date accepted at outer (intended divergence) | OK | samplesOverridden |

## TEMPLATE_LITERAL (7; 1 NS)

Implemented as `Type.String({pattern})` with the placeholder compiled to a digit regex — faithful and idiomatic (TB also supports `Type.TemplateLiteral`, but the regex-pattern form is a fair, common equivalent).

| case | impl | faithful | verdict | issue |
|---|---|---|---|---|
| url_with_number_id | String({pattern}) | yes | OK | |
| multi_segment_url | String({pattern}) | yes | OK | |
| leading_string_placeholder | String({pattern}) | yes | OK | |
| regex_special_chars | String({pattern escaped}) | yes | OK | |
| template_literal_nested_in_object | Object{String({pattern}),String} | yes | OK | |
| template_literal_union_placeholder | String({pattern (a\|b)…}) | yes | OK | |
| template_literal_index_key | NOT_SUPPORTED | claim says Record w/ TemplateLiteral key accepts non-matching extra keys | CONFIRMED NOT_SUPPORTED (was SUSPECT) | Source-confirmed kept opt-out. `RecordCreateFromPattern` (build/cjs/type/record/record.js) builds `{Kind:'Record', type:'object', patternProperties:{[pattern]:T}}` with NO `additionalProperties` field. Compiler `FromRecord` (build/cjs/compiler/compiler.js:394) then defaults `check2 = 'true'` for non-matching keys (only `additionalProperties===false` yields `'false'`). So `{foo:1}` is ACCEPTED where the reference rejects it — genuinely not expressible. |

## NATIVE (4; 3 NS)

| case | intended | impl | faithful | verdict | issue |
|---|---|---|---|---|---|
| map_string_number | Map instance | NOT_SUPPORTED | — | OK | no Map type in TB |
| set_string | Set instance | NOT_SUPPORTED | — | OK | no Set type |
| promise_string | thenable check | NOT_SUPPORTED | — | OK | no Promise/thenable type |
| awaited_promise | string (Awaited) | Type.String() | yes | OK | tsgo resolves Awaited→string |

## CIRCULAR (7; 0 NS)

All seven recursive types implemented via `Type.Recursive((This)=>…)` (or an IIFE composing multiple `Type.Recursive` defs for the cross-referenced case). Acyclic-value samples don't recurse infinitely. Idiomatic.

| case | impl | faithful | verdict |
|---|---|---|---|
| object_full_mion_shape | Recursive(Object{n,s,Optional(This),Optional(Date)}) | yes | OK |
| array_of_union_with_self_ref | Recursive(Array(Union(…,This))) | yes | OK |
| object_with_tuple_prop | Recursive(Object{tuple:Union(Tuple,Tuple+This)}) | yes | OK |
| object_with_index_prop | Recursive(Object{index:Record(String,This)}) | yes | OK |
| object_deeply_nested | Recursive(Object deep4:Optional(This)) | yes | OK |
| circular_child_under_literal_root | Object{Literal,Recursive(…)} | yes | OK |
| multiple_circular_types_cross_referenced | IIFE w/ 2+ Recursive defs | yes | OK |

## CIRCULAR_REFS (3; 3 NS)

| case | intended | impl | faithful | verdict | issue |
|---|---|---|---|---|---|
| linked_list_cycle | reject reference cycle | NOT_SUPPORTED | — | OK | TB has no cyclic-value detection; a cycle stack-overflows Value.Check |
| tree_cycle | reject back-edge | NOT_SUPPORTED | — | OK | same |
| object_self_cycle | reject self-cycle | NOT_SUPPORTED | — | OK | same |

## TYPE_MAPPINGS (3; 0 NS)

tsgo resolves the key-remapping mapped types to concrete object literals; the competitor mirrors the resolved shape. Faithful.

| case | impl | faithful | verdict |
|---|---|---|---|
| key_prefix_rename | Object{user_id,user_name} | yes | OK |
| key_conditional_rename | Object{_id,name,createdAt} | yes | OK |
| key_filter_via_never | Object{id,name} | yes | OK |

## DATETIME (41; 40 NS)

Only `DATETIME.date` is implemented (`Type.Date()`, faithful). Every Temporal.* type and every Date/Temporal min/max/gtlt/rel comparison case is opted out — TB has no Temporal instance types and no Date/relative-time comparison constraints. All 40 opt-outs are correct.

| case | impl | verdict | note |
|---|---|---|---|
| date | Type.Date() | OK | faithful |
| instant, zonedDateTime, plainDate, plainTime, plainDateTime, plainYearMonth, plainMonthDay, duration | NOT_SUPPORTED | OK | no Temporal types |
| date_minmax, date_gtlt, date_min_lt, date_max_now, date_rel_window, date_rel_datetime_components | NOT_SUPPORTED | OK | needs Date comparison / relative-time |
| instant_minmax, instant_gtlt, instant_rel | NOT_SUPPORTED | OK | no Temporal |
| plainDate_minmax, _gtlt, _min_lt, _gt_max, _min_only, _max_only, _gt_only, _lt_only, _rel_window, _rel_ymd, _rel_weeks | NOT_SUPPORTED | OK | no Temporal |
| plainTime_minmax, _gtlt | NOT_SUPPORTED | OK | no Temporal |
| plainDateTime_minmax, _gtlt, _rel, _rel_combo | NOT_SUPPORTED | OK | no Temporal |
| plainYearMonth_minmax, _gtlt, _rel | NOT_SUPPORTED | OK | no Temporal |
| zonedDateTime_minmax, _gtlt, _rel | NOT_SUPPORTED | OK | no Temporal |

## STRING_FORMAT (47; 12 NS)

Length bounds → `String({minLength,maxLength})`; char/pattern formats → `String({pattern})` (anchored); value enums → `Union(Literal…)`. uuid/time/ip/email/url/domain/slug/hex patterns are anchored full-matches and faithful to the samples. No FormatRegistry needed.

| case | impl | faithful | verdict | issue |
|---|---|---|---|---|
| string_maxLength/minLength/length/range | String({len bounds}) | yes | OK | |
| string_allowedChars/_literal/disallowedChars | String({pattern}) | yes | OK | |
| string_allowedValues/_escaped/customErrorMessage | Union(Literal…) | yes | OK | |
| alpha/alphaNumeric/numeric/alpha_withLength | String({pattern[,maxLength]}) | yes | OK | |
| lowercase_validate | String() | yes | OK | transformer-only, validates as plain string |
| uuidv4/uuidv7 | String({pattern w/ version nibble}) | yes | OK | |
| time_iso/time_HHmmss/time_HHmmss_ms | String({pattern}) | yes | OK | tz-aware variant requires Z/offset |
| ipv4/ipv6/ip_any/ipv4_port/ipv6_port | String({pattern}) | yes | OK | |
| domain/domainStrict | String({pattern}) | yes | OK | |
| email/emailPunycode/emailStrict | String({pattern}) | yes | OK | |
| url/urlHttp/urlFile | String({pattern}) | yes | OK | |
| pattern_slug/pattern_hex | String({pattern}) | yes | OK | |
| string_allowedChars_ignoreCase | NOT_SUPPORTED | — | SUSPECT | technically expressible by expanding the char class to both cases (e.g. `^[aAbBcC]+$`), matching the ignoreCase samples; opt-out is defensible (TB has no regex `flags`) but the chars-variant is modellable. Low priority. |
| string_allowedValues_ignoreCase | NOT_SUPPORTED | — | OK | impractical to enumerate case variants of a value set; fair opt-out |
| string_disallowedValues | String({pattern}) | yes | FIXED (was SUSPECT/WRONG) | Implemented `Type.String({pattern:'^(?!(?:admin\|root)$)[\\s\\S]*$'})`. Source-confirmed: TypeCompiler `FromString` emits `new RegExp(schema.pattern).test(value)` (build/cjs/compiler/compiler.js:421-423), which compiles JS negative-lookahead fine. Verified against samples (valid `alice`, invalid `admin`/`root`). |
| date_iso/date_DMY/date_YM/date_MD | NOT_SUPPORTED | — | OK | needs calendar-aware (leap year / month-day bounds) — regex can't |
| date_minMax_absolute | NOT_SUPPORTED | — | OK | needs date comparison |
| time_minMax_absolute | NOT_SUPPORTED | — | OK | needs time comparison |
| dateTime_default/dateTime_custom | NOT_SUPPORTED | — | OK | needs calendar-aware date validation |
| dateTime_minMax_absolute | NOT_SUPPORTED | — | OK | needs datetime comparison |

## NUMBER_FORMAT (10; 1 NS)

| case | impl | faithful | verdict | issue |
|---|---|---|---|---|
| number_max/min/lt/gt | Number({maximum/minimum/exclusive…}) | yes | OK | |
| number_integer | Type.Integer() | yes | OK | |
| number_multipleOf | Number({multipleOf:5}) | yes (0%5===0) | OK | |
| number_combined | Integer({min,max,multipleOf}) | yes | OK | |
| number_int8/uint8 | Integer({min,max}) | yes | OK | |
| number_float | NOT_SUPPORTED | — | OK | TB has no "non-integer-only" constraint; needs a custom predicate |

## BIGINT_FORMAT (8; 4 NS)

| case | impl | faithful | verdict | issue |
|---|---|---|---|---|
| bigint_max/min/lt/gt | BigInt({maximum/minimum/exclusive…: <bigint literal>}) | yes | OK | bigint bounds passed directly, no float coercion |
| bigint_multipleOf | NOT_SUPPORTED | — | OK | plausible codegen bug: `value % BigInt(n) === 0` and `0n === 0` is false in JS — hard to verify exactly, fair opt-out |
| bigint_combined | NOT_SUPPORTED | — | OK | inherits multipleOf issue |
| bigint_int64 | NOT_SUPPORTED | — | CONFIRMED NOT_SUPPORTED (audit verdict WRONG was itself wrong) | Source-confirmed kept opt-out. TypeCompiler `FromBigInt` (build/cjs/compiler/compiler.js:249-250) emits `value <= BigInt(${schema.maximum})`. The bigint bound is interpolated as a bare Number literal `BigInt(9223372036854775807)`, which float64-rounds to `9223372036854775808n` — so invalid sample `9223372036854775808n` is wrongly accepted. (NB: the un-compiled `Value.Check` path at value/check/check.js:208-217 compares against the stored bigint directly and WOULD be exact, but the file uniformly uses TypeCompiler, so this stays NS.) |
| bigint_uint64 | NOT_SUPPORTED | — | CONFIRMED NOT_SUPPORTED (audit verdict WRONG was itself wrong) | Same `BigInt(<numeric-literal>)` rounding: bound `18446744073709551615` → `18446744073709551616n`, so invalid `18446744073709551616n` is wrongly accepted under TypeCompiler. |

## REALWORLD (6; 0 NS)

Full `Type.Object` schemas mirroring the imported interfaces (`createdAt: string` modeled as `String()`, emails/slugs as plain `String()` per the interface — no format constraints declared). Idiomatic.

| case | impl | faithful | verdict |
|---|---|---|---|
| user | Object{…,roles:Array(Union(Literal…)),…} | yes | OK |
| order | Object{…,customer,items:Array(Object),shipping,status:Union…} | yes | OK |
| blogPost | Object{…,author,meta,Optional(publishedAt)} | yes | OK |
| product | Object{…,currency:Union(Literal…),Optional(dimensions)} | yes | OK |
| productPage | Object{data:Array(Object…)} | yes | OK |
| registrationForm | Object{…,acceptedTerms:Literal(true),profile} | yes | OK |

---

## Findings summary

### FIXED (1)
- `STRING_FORMAT.string_disallowedValues` — **implemented** as `Type.String({pattern:'^(?!(?:admin|root)$)[\\s\\S]*$'})`. Source-confirmed: TypeCompiler `FromString` compiles `new RegExp(schema.pattern).test(value)` (build/cjs/compiler/compiler.js:421-423); JS negative-lookahead constructs and tests fine (verified in node). The competitor already uses negated classes (`disallowedChars` `^[^!@#]*$`), so this is consistent.

### CONFIRMED NOT_SUPPORTED after source check (3 — including a self-correction)
- `BIGINT_FORMAT.bigint_int64` / `bigint_uint64` — **my original WRONG verdict was itself wrong.** The float-rounding premise IS real because TypeCompiler `FromBigInt` (compiler.js:249-250) emits `value <= BigInt(${schema.maximum})`, interpolating the bigint bound as a bare **Number** literal `BigInt(9223372036854775807)`, which float64-rounds to `9223372036854775808n`. Ran the codegen path in node: invalid `9223372036854775808n` / `18446744073709551616n` are wrongly accepted, breaking the boundary samples. (The un-compiled `Value.Check` path would be exact, but the file uniformly uses `TypeCompiler`; switching just these two to `Value.Check` would break the file's convention, so they stay NS.)
- `TEMPLATE_LITERAL.template_literal_index_key` — kept NS, source-confirmed correct. `RecordCreateFromPattern` (type/record/record.js) builds the Record schema with `patternProperties` but **no `additionalProperties` field**, and the compiler's `FromRecord` (compiler.js:394) defaults non-matching keys to `'true'` (only `additionalProperties===false` rejects). So `{foo:1}` is accepted where the reference rejects it.

### SUSPECT (2)
- `OBJECT.function_top_level` — relies on TypeCompiler emitting a `typeof==='function'` guard for `TFunction`, a TB "extended type" documented as not-fully-supported for value validation. Passes alignment (0 divergence) so low risk, but fragile across TB versions.
- `STRING_FORMAT.string_allowedChars_ignoreCase` — modellable by expanding the char class to both cases; opt-out defensible (no regex flags) but not strictly impossible.
- (`string_allowedValues_ignoreCase` considered but left OK — enumerating case variants of a value set is impractical.)

### Intended divergences (not faults)
- `OBJECT.interface_all_optional`, `UTILITY.partial`, `UTILITY.deep_partial_recursive_mapped` — `Type.Object` adds no plain-object guard, so Date/Map/Set/RegExp/array are accepted where the reference rejects. All 16 typebox alignment `records` are these, all `samplesOverridden:true`, correctly dropped from the aggregate (n-a). Implementations are idiomatic; no fix.

### Overall (post-fix)
TypeBox's implementations are uniformly idiomatic — pure `Type.*` combinators + `TypeCompiler`, no hand-rolled guards, no `Type.Unsafe`, no FormatRegistry shortcuts. After the source-grounded re-derivation, exactly **one** new row was recovered (`string_disallowedValues`); the other three previously-suspect opt-outs are genuinely not expressible under TypeCompiler and stay NS. The number/NaN, Date-invalid, Object-extra-props, and Record-key behaviors all match TypeBox 0.34.49 defaults (AllowNaN=false, additionalProperties allowed on Object).

### Resolved from source (build/cjs of the pinned 0.34.49 tarball)
- JS-regex negative-lookahead **does** compile inside `Type.String({pattern})` — `FromString` → `new RegExp(pattern).test(value)` (compiler.js:421-423). ⇒ `string_disallowedValues` implemented.
- Record-with-template-key does **not** emit `additionalProperties:false` — `RecordCreateFromPattern` omits it, compiler defaults non-matching keys to `true` (compiler.js:394). ⇒ `template_literal_index_key` stays NS.
- TypeCompiler bigint bounds round through `BigInt(<numeric-literal>)` (compiler.js:249-252), confirmed in node. ⇒ `bigint_int64`/`uint64` stay NS (my earlier WRONG flags retracted).

### Still unverified (reasoned, not executed)
- Exact `bigint_multipleOf` codegen bug (`0n === 0`) — plausible, kept as OK opt-out.
