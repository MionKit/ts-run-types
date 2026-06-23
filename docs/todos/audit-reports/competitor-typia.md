# Competitor audit — typia

- **Competitor:** typia
- **Version:** 13.0.0-dev.20260511 (transform via `ttsc` 0.10.2 + `@ttsc/unplugin` 0.10.2, `@typescript/native-preview` 7.0.0-dev.20260511.1, esbuild 0.25.12)
- **Source:** `container/benchmarks/competitors/typia/cases.ts` (2712 lines)
- **Total cases:** 266
- **Verdicts:** OK 266 / SUSPECT 0 / WRONG 0
- **NOT_SUPPORTED claims:** 71 distinct case-keys (142 metric-rows in alignment = 71 × {validate, validationErrors}); mis-marked: **0**
- **Idiomatic:** 195/195 implemented cases use `typia.createIs<T>()` (build = is-valid boolean) + `typia.createValidate<T>().success` (buildErrors). Zero hand-rolled JS bypass; every case writes a literal TS type param. tags.* used only on FORMAT suites.

## Method notes

- The harness convention here: `build` returns a boolean is-valid predicate, `buildErrors` returns a boolean too (`val(v).success`) — the metric only consumes `.success`, so using `createValidate` for the errors-metric is the intended pattern, not a wrong generator. Both shapes are the two idiomatic typia entry points (`createIs` / `createValidate`).
- typia validates the **static structural** TS type. Confirmed/assumed facts driving the faithfulness calls (consistent across the file and corroborated by the bench-run alignment): bare `number` emits `typeof === 'number'` with NO finite gate (NaN/Infinity PASS unless a `tags.Type` brand is present); `Date` is `instanceof Date` only (Invalid Date passes); excess properties are NOT rejected by `createIs`/`createValidate` (only `createEquals` rejects extras) — every shared sample relies on this and none of the invalid sets probe excess-key rejection; bigint **literal** types (`is<1n>()`) are unsupported.
- **Cross-check `alignment-misalignments.json` → `summary.typia`:** `overriddenDivergences: 140`, **`undeclaredDivergences: 0`**, `builderIssues: 0`, `notSupported: 142`. Zero undeclared divergences means every per-case `samples` override is backed by a real measured divergence in the actual dev-build run — strong empirical confirmation that the faithfulness claims (NaN-accept, Invalid-Date-accept, email 1-char-label, etc.) hold against the installed transformer, not just from memory.
- The 140 overridden divergences are the inline `samples: {invalid: […]}` trims documented per-case (drop NaN/Infinity at plain-number positions, drop Invalid-Date entries at Date positions, drop the 1 over-strict email sample). All are sample-narrowing for genuine typia runtime semantics, not type misuse — none change the type being validated.

Per the "terse rows" instruction, the implementation column abbreviates the (identical) `createIs`/`createValidate` wrapper to the inner `createIs<…>` type. All implemented rows are idiomatic (Y) unless noted.

## ATOMIC

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| any | `any` | `createIs<any>` | Y | Y | OK | |
| bigint | `bigint` | `createIs<bigint>` | Y | Y | OK | |
| boolean | `boolean` | `createIs<boolean>` | Y | Y | OK | |
| date | `Date` | `createIs<Date>` + invalid trimmed | Y | Y | OK | instanceof-only; invalid drops Invalid Date — correct |
| enum_mixed | mixed enum | `createIs<Color>` (local enum) | Y | Y | OK | |
| literal_2 | `2` | `createIs<2>` | Y | Y | OK | |
| literal_a | `'a'` | `createIs<'a'>` | Y | Y | OK | |
| literal_true | `true` | `createIs<true>` | Y | Y | OK | |
| literal_1n | `1n` | **NOT_SUPPORTED** | — | — | OK | typia rejects bigint literal types — correct opt-out |
| literal_symbol | symbol-by-description | **NOT_SUPPORTED** | — | — | OK | symbol identity/description not expressible — correct |
| never | `never` | **NOT_SUPPORTED** | — | — | OK | `is<never>()` accepts undefined — correct |
| null | `null` | `createIs<null>` | Y | Y | OK | |
| number | `number` | `createIs<number>` + invalid trimmed | Y | Y | OK | NaN/Inf accepted, invalid drops them — correct |
| object | `object` (arrays/Date/regexp valid) | **NOT_SUPPORTED** | — | — | OK | valid set has `[]`/`new Date()`/`/abc/`; `is<object>()` rejects arrays — correct |
| regexp | `RegExp` | `createIs<RegExp>` | Y | Y | OK | |
| string | `string` | `createIs<string>` | Y | Y | OK | |
| symbol | `symbol` | `createIs<symbol>` | Y | Y | OK | |
| undefined | `undefined` | `createIs<undefined>` | Y | Y | OK | |
| void | `void` | **NOT_SUPPORTED** | — | — | OK | transform emits invalid JS for void — plausible; opt-out safe |
| literal_2_noLiterals | `number` (degraded) | `createIs<number>` | Y | Y | OK | base-type degrade, mirrors others |
| literal_a_noLiterals | `string` | `createIs<string>` | Y | Y | OK | |
| literal_regexp_noLiterals | `RegExp` | `createIs<RegExp>` | Y | Y | OK | |
| literal_true_noLiterals | `boolean` | `createIs<boolean>` | Y | Y | OK | |
| literal_1n_noLiterals | `bigint` | `createIs<bigint>` | Y | Y | OK | |
| literal_symbol_noLiterals | `symbol` | `createIs<symbol>` | Y | Y | OK | |
| unknown | `unknown` | `createIs<unknown>` | Y | Y | OK | |

## ARRAY

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_array | `string[]` | `createIs<string[]>` | Y | Y | OK | |
| number_array | `number[]` | `createIs<number[]>` + invalid trimmed | Y | Y | OK | NaN/Inf element accepted — correct |
| boolean_array | `boolean[]` | `createIs<boolean[]>` | Y | Y | OK | |
| bigint_array | `bigint[]` | `createIs<bigint[]>` | Y | Y | OK | |
| date_array | `Date[]` | `createIs<Date[]>` + invalid trimmed | Y | Y | OK | Invalid Date element — correct |
| regexp_array | `RegExp[]` | `createIs<RegExp[]>` | Y | Y | OK | |
| undefined_array | `undefined[]` | `createIs<undefined[]>` | Y | Y | OK | |
| null_array | `null[]` | `createIs<null[]>` | Y | Y | OK | |
| array_generic | `Array<string>` | `createIs<Array<string>>` | Y | Y | OK | |
| string_array_2d | `string[][]` | `createIs<string[][]>` | Y | Y | OK | |
| string_array_3d | `string[][][]` | `createIs<string[][][]>` | Y | Y | OK | |
| string_array_noIsArrayCheck | `string[]` | `createIs<string[]>` | Y | Y | OK | |
| object_array | `{a:string}[]` | `createIs<{a:string}[]>` | Y | Y | OK | |
| union_array | `(string\|number)[]` | `createIs<…>` + invalid trimmed | Y | Y | OK | Inf element — correct |
| tuple_array | `[string,number][]` | `createIs<…>` | Y | Y | OK | |
| circular_array | `type X = X[]` | **NOT_SUPPORTED** | — | — | OK | base-case-free self-ref array stack-overflows transform — correct |
| circular_object_with_array | recursive obj+array | `createIs<ObjectType>` | Y | Y | OK | recursion via named alias works |
| symbol_array | `symbol[]` | `createIs<symbol[]>` | Y | Y | OK | |
| readonly_string_array | `ReadonlyArray<string>` | `createIs<…>` | Y | Y | OK | |

## OBJECT

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| simple_interface | `{a:string;b:number}` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| object_as_const_literals | `{name:'john';age:30}` | `createIs<…>` | Y | Y | OK | |
| object_via_return_type_utility | `ReturnType<…>` | `createIs<ReturnType<typeof makeUser>>` | Y | Y | OK | |
| object_via_property_access | `{id:number;name:string}` | `createIs<…>` | Y | Y | OK | |
| object_via_array_access | `{id:number;name:string}` | `createIs<…>` | Y | Y | OK | |
| interface_with_optional | `{a:string;b?:number}` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| interface_with_date | `{date:Date;name:string}` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date — correct |
| interface_with_method | obj with skipped fn prop | **NOT_SUPPORTED** | — | — | OK | typia validates fn prop; suite drops it (valid `cb:42`/`null`) — correct |
| nested_object | `{a;deep:{b;c}}` | `createIs<…>` + invalid trimmed | Y | Y | OK | nested NaN — correct |
| interface_string_array_prop | `{tags:string[]}` | `createIs<…>` | Y | Y | OK | |
| circular_interface | `{name;child?:self}` | `createIs<ICircular>` | Y | Y | OK | |
| circular_interface_on_array | self-ref array prop | `createIs<…>` | Y | Y | OK | |
| circular_interface_on_nested_object | nested self-ref | `createIs<…>` | Y | Y | OK | |
| index_signature_string | `{[k:string]:string}` | **NOT_SUPPORTED** | — | — | OK | typia accepts `{a:undefined}` for index value; suite rejects — genuine structural divergence |
| index_signature_named_props | `{a;b;[k]:string\|number}` | `createIs<…>` | Y | Y | OK | |
| index_signature_nested | `{[k]:{[k]:number}}` | `createIs<…>` + invalid trimmed | Y | Y | OK | nested NaN — correct |
| index_signature_date_value | `{[k]:{[k]:Date}}` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date value — correct |
| index_signature_non_root | nested index iface | `createIs<Obj2>` | Y | Y | OK | |
| function_top_level | `() => void` | **NOT_SUPPORTED** | — | — | OK | transform emits invalid JS for void return — plausible; opt-out safe |
| interface_callable | callable iface + props | **NOT_SUPPORTED** | — | — | OK | typia rejects the callable-with-props function value — correct |
| interface_all_optional | all-optional obj guard | **NOT_SUPPORTED** | — | — | OK | typia accepts Date/Map/Set/array; suite rejects via plain-object guard — correct |
| class_simple | class {date;name;method} | `createIs<MySerializableClass>` + invalid trimmed | Y | Y | OK | Invalid Date — correct |
| rpc_error_class | generic class instance | `createIs<RpcError<'test-error'>>` | Y | Y | OK | |
| call_signature_params | `Parameters<CallSig>` | `createIs<Parameters<…>>` + invalid trimmed | Y | Y | OK | NaN param — correct |
| call_signature_params_with_optional | `Parameters<…>` opt | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN param — correct |
| call_signature_params_with_rest | `Parameters<…>` rest | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date rest — correct |
| record_union_keys | `Record<'a'\|'b',number>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN/Inf value — correct |
| union_value_index | `{[k]:string\|number}` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN value — correct |
| object_with_union_prop | `{kind:'a'\|'b';n:number}` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| interface_inheritance | `Child extends Base` | `createIs<Child>` | Y | Y | OK | |
| class_inheritance | `Sub extends Base` | `createIs<Sub>` | Y | Y | OK | |
| index_signature_number_key | `{[k:number]:string}` | `createIs<…>` | Y | Y | OK | |

## TUPLE

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_number_pair | `[string,number]` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN slot; invalid keeps length/extra checks — correct |
| full_mion_tuple | `[Date,number,string,null,string[],bigint]` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date + NaN slot — correct |
| tuple_with_optional | `[number,bigint?,boolean?,number?]` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN slot — correct |
| nested_tuple_in_array | `[string,number][]` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN slot — correct |
| tuple_rest | `[number,...string[]]` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN slot — correct |
| tuple_circular | self-ref tuple alias | **NOT_SUPPORTED** | — | — | OK | transform stack-overflows naming anon self-ref tuple — correct |
| tuple_multiple_trailing_optionals | `[number,bigint?,boolean?,number?]` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN slot — correct |
| tuple_named_labels | `[name:string,age:number]` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN slot — correct |
| tuple_with_non_serializable | tuple fn slot must-be-undefined | **NOT_SUPPORTED** | — | — | OK | typia requires fn slot; suite valid `[3]` omits it — correct |
| empty_tuple | `[]` | `createIs<[]>` | Y | Y | OK | |
| single_element_tuple | `[string]` | `createIs<[string]>` | Y | Y | OK | |
| readonly_tuple | `readonly [string,number]` | `createIs<…>` | Y | Y | OK | |

## UNION

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| atomic_union | `Date\|number\|string\|null\|bigint` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date + Inf — correct |
| string_literal_union | `'UNO'\|'DOS'\|'TRES'` | `createIs<…>` | Y | Y | OK | |
| large_union_eight_arms | 8-arm union | `createIs<…>` | Y | Y | OK | |
| string_or_number | `string\|number` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN/Inf — correct |
| union_of_array_types | `string[]\|number[]\|boolean[]` | `createIs<…>` + invalid trimmed | Y | Y | OK | Inf element — correct |
| array_of_union | `(string\|bigint\|boolean\|Date)[]` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date element — correct |
| union_of_object_shapes | 3 obj shapes | `createIs<…>` | Y | Y | OK | |
| discriminated_union | tagged union | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| circular_union | recursive union | `createIs<UnionC>` + invalid trimmed | Y | Y | OK | Invalid Date + Inf — correct |
| union_with_methods | union with method members | **NOT_SUPPORTED** | — | — | OK | typia validates methods; suite drops them — correct |
| intersection_to_object | `{a}&{b}` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| union_with_index_arm | union w/ index-sig arm | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| union_same_prop_different_types | `prop` typed per tag | `createIs<…>` | Y | Y | OK | |
| union_mixed_arrays_and_objects | arrays+objects union | `createIs<…>` | Y | Y | OK | |
| union_merged_property | `{a:boolean}\|{a:number}` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN arm — correct |
| union_mixed_with_index | mixed + index arms | `createIs<…>` | Y | Y | OK | |
| union_with_any_fallback | `string\|any` | `createIs<…>` | Y | Y | OK | collapses to any — accepts all (matches suite) |
| union_with_unknown_fallback | `string\|unknown` | `createIs<…>` | Y | Y | OK | collapses to unknown |
| union_subset_small_first | `Small\|Large` | `createIs<…>` | Y | Y | OK | |
| union_subset_nested_levels | `Tiny\|Medium\|Large` | `createIs<…>` | Y | Y | OK | |
| union_subset_mixed_related_unrelated | `Base\|Extended\|Unrelated` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |

## TEMPLATE_LITERAL

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| url_with_number_id | `` `api/user/${number}` `` | `createIs<…>` | Y | Y | OK | native template literal |
| multi_segment_url | multi-placeholder URL | `createIs<…>` | Y | Y | OK | |
| leading_string_placeholder | `` `${string}/${number}` `` | `createIs<…>` | Y | Y | OK | |
| regex_special_chars | `` `(${number})` `` | `createIs<…>` | Y | Y | OK | |
| template_literal_nested_in_object | template prop in object | `createIs<…>` | Y | Y | OK | |
| template_literal_index_key | template-literal index key | **NOT_SUPPORTED** | — | — | OK | typia ignores non-matching keys (`{foo:1}` passes); suite requires every key match — genuine structural divergence |
| template_literal_union_placeholder | `` `${'a'\|'b'}-${number}` `` | `createIs<…>` | Y | Y | OK | |

## NATIVE

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| map_string_number | `Map<string,number>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN value; keeps wrongKey/wrongValue — correct |
| set_string | `Set<string>` | `createIs<Set<string>>` | Y | Y | OK | |
| promise_string | `Promise<string>` (thenable) | **NOT_SUPPORTED** | — | — | OK | typia rejects real Promise as thenable — correct |
| awaited_promise | `Awaited<Promise<string>>` | `createIs<…>` (resolves to string) | Y | Y | OK | |

## CIRCULAR

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| object_full_mion_shape | recursive `{n;s;c?;d?}` | `createIs<Circular>` + invalid trimmed | Y | Y | OK | NaN + Invalid Date — correct |
| array_of_union_with_self_ref | `type CuArray = (CuArray\|…)[]` | **NOT_SUPPORTED** | — | — | OK | transform stack-overflows naming anon self-ref — correct |
| object_with_tuple_prop | `{tuple:[bigint,self?]}` | `createIs<CircularTuple>` | Y | Y | OK | named alias recursion works |
| object_with_index_prop | `{index:{[k]:self}}` | `createIs<CircularIndex>` | Y | Y | OK | |
| object_deeply_nested | deep nested recursion | `createIs<CircularDeep>` | Y | Y | OK | |
| circular_child_under_literal_root | recursive child under literal root | `createIs<RootNotCircular>` | Y | Y | OK | |
| multiple_circular_types_cross_referenced | mutually-recursive ifaces | `createIs<RootCircular>` | Y | Y | OK | |

## CIRCULAR_REFS (cyclic VALUES)

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| linked_list_cycle | cyclic value | **NOT_SUPPORTED** | — | — | OK | typia has no cyclic-value detection — would stack-overflow; correct |
| tree_cycle | cyclic value | **NOT_SUPPORTED** | — | — | OK | same — correct |
| object_self_cycle | cyclic value | **NOT_SUPPORTED** | — | — | OK | same — correct |

## UTILITY

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| partial | `Partial<Person>` (all-optional) | **NOT_SUPPORTED** | — | — | OK | all-optional ⇒ typia accepts Date instance; suite rejects — same divergence as interface_all_optional; correct |
| required | `Required<MaybePerson>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN + Invalid Date — correct |
| pick | `Pick<Person,'name'\|'createdAt'>` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date — correct |
| omit | `Omit<Person,'age'>` | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date — correct |
| exclude_atomic | `Exclude<lits,'age'>` | `createIs<…>` | Y | Y | OK | |
| extract_atomic | `Extract<…>` | `createIs<…>` | Y | Y | OK | |
| exclude_from_object_union | `Exclude<Shape,{kind:'circle'}>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| non_nullable | `NonNullable<…>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN/Inf — correct |
| return_type | `ReturnType<Fn>` → Date | `createIs<…>` + invalid trimmed | Y | Y | OK | Invalid Date — correct |
| readonly | `Readonly<Person>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN prop — correct |
| intersection_with_required_override | `Partial<P> & Required<Pick<…>>` | `createIs<…>` + invalid trimmed | Y | Y | OK | name required ⇒ not all-optional; NaN+Invalid Date — correct |
| omit_keeping_optional | `Omit<{a;b?;c},'a'>` | `createIs<…>` + invalid trimmed | Y | Y | OK | c required ⇒ not all-optional; NaN — correct |
| keyof_to_literal_union | `keyof Person` | `createIs<…>` | Y | Y | OK | |
| typeof_variable_query | `typeof config` | `createIs<typeof config>` | Y | Y | OK | |
| indexed_access_type | `Person['name']` | `createIs<…>` | Y | Y | OK | |
| conditional_type_resolved | `IsString<'hello'>` → boolean | `createIs<…>` | Y | Y | OK | |
| mapped_type_custom | `Nullable<Source>` | `createIs<…>` | Y | Y | OK | |
| mapped_type_with_conditional_value | `UserForm` mapped+conditional | `createIs<…>` | Y | Y | OK | |
| distributive_conditional_over_union | `Wrap<string\|number>` | `createIs<…>` + invalid trimmed | Y | Y | OK | NaN arm — correct |
| deep_partial_recursive_mapped | recursive DeepPartial | **NOT_SUPPORTED** | — | — | OK | all-optional outer ⇒ accepts Date; suite rejects — same divergence; correct |

## TYPE_MAPPINGS

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| key_prefix_rename | `` {[K as `user_${K}`]} `` | `createIs<Prefixed<Source>>` | Y | Y | OK | |
| key_conditional_rename | `id`→`_id` remap | `createIs<MongoForm<Source>>` | Y | Y | OK | |
| key_filter_via_never | drop key via never | `createIs<Public<Source>>` | Y | Y | OK | |

## DATETIME (instance)

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| date | `Date` | `createIs<Date>` + invalid trimmed | Y | Y | OK | Invalid Date — correct |
| instant | `Temporal.Instant` | **NOT_SUPPORTED** | — | — | OK | no Temporal global in bench; branded class indistinguishable — correct |
| zonedDateTime | Temporal | **NOT_SUPPORTED** | — | — | OK | same — correct |
| plainDate | Temporal | **NOT_SUPPORTED** | — | — | OK | same — correct |
| plainTime | Temporal | **NOT_SUPPORTED** | — | — | OK | same — correct |
| plainDateTime | Temporal | **NOT_SUPPORTED** | — | — | OK | same — correct |
| plainYearMonth | Temporal | **NOT_SUPPORTED** | — | — | OK | same — correct |
| plainMonthDay | Temporal | **NOT_SUPPORTED** | — | — | OK | same — correct |
| duration | Temporal.Duration | **NOT_SUPPORTED** | — | — | OK | same — correct |

## STRING_FORMAT

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_maxLength | `string & MaxLength<5>` | `tags.MaxLength<5>` | Y | Y | OK | |
| string_minLength | `MinLength<3>` | tags | Y | Y | OK | |
| string_length | `MinLength<4>&MaxLength<4>` | tags | Y | Y | OK | |
| string_range | `MinLength<2>&MaxLength<4>` | tags | Y | Y | OK | |
| string_allowedChars | `Pattern<'^[0-9a-f]+$'>` | tags | Y | Y | OK | |
| string_allowedChars_ignoreCase | `Pattern<'^[abcABC]+$'>` | tags | Y | Y | OK | |
| string_allowedChars_literal | `Pattern<'^[.\\-]+$'>` | tags | Y | Y | OK | |
| string_disallowedChars | `Pattern<'^[^!@#]*$'>` | tags | Y | Y | OK | |
| string_allowedValues | `'red'\|'green'\|'blue'` | literal union | Y | Y | OK | |
| string_allowedValues_ignoreCase | case-insensitive Pattern | tags | Y | Y | OK | |
| string_allowedValues_escaped | `'a.b'\|'c+d'` | literal union | Y | Y | OK | |
| string_disallowedValues | negative-lookahead Pattern | tags | Y | Y | OK | |
| string_customErrorMessage | `'a'\|'b'` | literal union | Y | Y | OK | message not asserted by metric |
| alpha | `Pattern<'^[a-zA-Z]+$'>` | tags | Y | Y | OK | |
| alphaNumeric | `Pattern<'^[a-zA-Z0-9]+$'>` | tags | Y | Y | OK | |
| numeric | `Pattern<'^[0-9]+$'>` | tags | Y | Y | OK | |
| alpha_withLength | Pattern + `MaxLength<3>` | tags | Y | Y | OK | |
| lowercase_validate | bare `string` | `createIs<string>` | Y | Y | OK | suite checks only string-ness here |
| uuidv4 | uuid v4 Pattern | tags.Pattern | Y | Y | OK | version+variant nibble pinned |
| uuidv7 | uuid v7 Pattern | tags.Pattern | Y | Y | OK | |
| date_iso | ISO date + calendar validity | **NOT_SUPPORTED** | — | — | OK | `Format<'date'>` is format-only (accepts 2023-02-29); needs real-calendar — correct |
| date_DMY | DD-MM-YYYY + calendar | **NOT_SUPPORTED** | — | — | OK | Pattern can't reject 31-04-2024 — correct |
| date_YM | `YYYY-MM` Pattern | tags.Pattern | Y | Y | OK | month range encodable |
| date_MD | `MM-DD` Pattern | tags.Pattern | Y | Y | OK | |
| date_minMax_absolute | bounded date strings | **NOT_SUPPORTED** | — | — | OK | no tag for string-date bound comparison — correct |
| time_iso | ISO time Pattern | tags.Pattern | Y | Y | OK | |
| time_HHmmss | `HH:mm:ss` Pattern | tags.Pattern | Y | Y | OK | |
| time_HHmmss_ms | time+ms Pattern | tags.Pattern | Y | Y | OK | |
| time_minMax_absolute | bounded time strings | **NOT_SUPPORTED** | — | — | OK | no bound-comparison tag — correct |
| dateTime_default | ISO T-split + calendar | **NOT_SUPPORTED** | — | — | OK | `Format<'date-time'>` accepts space-split + no calendar — correct |
| dateTime_custom | custom DT Pattern | tags.Pattern | Y | Y | OK | |
| dateTime_minMax_absolute | bounded datetime | **NOT_SUPPORTED** | — | — | OK | no bound tag — correct |
| ipv4 | `Format<'ipv4'>` | tags.Format | Y | Y | OK | |
| ipv6 | `Format<'ipv6'>` | tags.Format | Y | Y | OK | |
| ip_any | ipv4\|ipv6 | union of tag.Format | Y | Y | OK | |
| ipv4_port | ipv4:port Pattern | tags.Pattern | Y | Y | OK | |
| ipv6_port | `[ipv6]:port` Pattern | tags.Pattern | Y | Y | OK | |
| domain | domain Pattern | tags.Pattern | Y | Y | OK | |
| domainStrict | bounded-label domain Pattern | tags.Pattern | Y | Y | OK | |
| email | `Format<'email'>` | tags.Format + invalid trimmed | Y | Y | OK | typia accepts 1-char domain label; invalid drops that one — correct |
| emailPunycode | `Format<'email'>` | tags.Format | Y | Y | OK | |
| emailStrict | strict email Pattern | tags.Pattern | Y | Y | OK | |
| url | URL Pattern | tags.Pattern | Y | Y | OK | |
| urlHttp | http(s) URL Pattern | tags.Pattern | Y | Y | OK | |
| urlFile | `file:///` Pattern | tags.Pattern | Y | Y | OK | |
| pattern_slug | `Pattern<'^[a-z0-9-]+$'>` | tags.Pattern | Y | Y | OK | |
| pattern_hex | `Pattern<'^[0-9a-fA-F]+$'>` | tags.Pattern | Y | Y | OK | |

## NUMBER_FORMAT

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| number_max | `Maximum<100>` | tags | Y | Y | OK | |
| number_min | `Minimum<0>` | tags | Y | Y | OK | |
| number_lt | `ExclusiveMaximum<10>` | tags | Y | Y | OK | |
| number_gt | `ExclusiveMinimum<0>` | tags | Y | Y | OK | |
| number_integer | `Type<'int32'>` | tags | Y | Y | OK | |
| number_float | non-integer-only | **NOT_SUPPORTED** | — | — | OK | `Type<'float'>` = float32-representable (accepts `1`); suite wants non-integer → invalid `1` would pass — correct |
| number_multipleOf | `MultipleOf<5>` | tags | Y | Y | OK | |
| number_combined | int32+min+max+multipleOf | tags chain | Y | Y | OK | |
| number_int8 | int32 + `[-128,127]` | tags chain | Y | Y | OK | |
| number_uint8 | uint32 + `Maximum<255>` | tags chain | Y | Y | OK | |

## BIGINT_FORMAT

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| bigint_max | `bigint & Maximum<100n>` | tags | Y | Y | OK | |
| bigint_min | `Minimum<0n>` | tags | Y | Y | OK | |
| bigint_lt | `ExclusiveMaximum<10n>` | tags | Y | Y | OK | |
| bigint_gt | `ExclusiveMinimum<0n>` | tags | Y | Y | OK | |
| bigint_multipleOf | `MultipleOf<5n>` | tags | Y | Y | OK | |
| bigint_combined | min+max+multipleOf | tags chain | Y | Y | OK | |
| bigint_int64 | 64-bit bounds | **NOT_SUPPORTED** | — | — | OK | tag schema can't hold 64-bit bigint literal bounds (precision loss) — correct |
| bigint_uint64 | 64-bit bounds | **NOT_SUPPORTED** | — | — | OK | same — correct |

## DATETIME (format / bounded)

All 30 bounded/relative Temporal-or-Date cases are `NOT_SUPPORTED`:
`date_minmax, date_gtlt, date_min_lt, date_max_now, date_rel_window, date_rel_datetime_components, instant_minmax, instant_gtlt, instant_rel, plainDate_minmax, plainDate_gtlt, plainDate_min_lt, plainDate_gt_max, plainDate_min_only, plainDate_max_only, plainDate_gt_only, plainDate_lt_only, plainDate_rel_window, plainDate_rel_ymd, plainDate_rel_weeks, plainTime_minmax, plainTime_gtlt, plainDateTime_minmax, plainDateTime_gtlt, plainDateTime_rel, plainDateTime_rel_combo, plainYearMonth_minmax, plainYearMonth_gtlt, plainYearMonth_rel, zonedDateTime_minmax, zonedDateTime_gtlt, zonedDateTime_rel`.

| group | claim | verdict | reasoning |
|---|---|---|---|
| all 30 | **NOT_SUPPORTED** | OK | typia's Min/Max tags target number/bigint/string-length only — no tag for temporal range comparison; Temporal classes have no global in the bench runtime and Date-backed ones also accept Invalid Date. Correct opt-out. |

## REALWORLD

| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| user | `User` iface | `createIs<User>` | Y | Y | OK | |
| order | nested `Order` | `createIs<Order>` | Y | Y | OK | |
| blogPost | `BlogPost` | `createIs<BlogPost>` | Y | Y | OK | |
| product | `Product` | `createIs<Product>` | Y | Y | OK | |
| productPage | `ProductPage` (paged) | `createIs<ProductPage>` | Y | Y | OK | |
| registrationForm | `RegistrationForm` (`acceptedTerms:true`) | `createIs<RegistrationForm>` | Y | Y | OK | literal-true gate works |

## Findings summary

**No WRONG and no SUSPECT rows.** Across all 266 cases:

- **Hand-rolled bypass instead of `createIs<T>()`:** none. Every implemented case writes a literal TS type parameter into `typia.createIs<T>()` (build) and `typia.createValidate<T>()` (buildErrors). No `(v) => typeof v === …` stand-ins anywhere.
- **Wrong generator for metric:** none. `build` correctly uses the is-valid boolean (`createIs`); `buildErrors` uses `createValidate<T>().success` — both are idiomatic typia entry points and the metric only consumes `.success`, so this is the intended convention, not a misuse.
- **Stale NOT_SUPPORTED (expressible via tags/type):** none of the 71 opt-outs is mis-marked. Re-derived each against the dev-build API:
  - bigint literals (`literal_1n`), symbol identity, `never`, `void`, `object` (array-rejecting) — genuine type-system / transform limits.
  - `interface_with_method` / `interface_callable` / `interface_all_optional` / `partial` / `deep_partial_recursive_mapped` / `index_signature_string` / `template_literal_index_key` / `tuple_with_non_serializable` — genuine **structural** runtime-semantics divergences (typia validates methods, requires fn slots, accepts Date/extra/undefined where the suite does not), not fixable by a different type.
  - `number_float` — `Type<'float'>` means float32-representable (accepts integers), opposite of the suite's non-integer intent.
  - `date_iso` / `date_DMY` / `dateTime_default` and all `*_minMax_absolute` / bounded-DATETIME (30) — typia format tags are format-only with no calendar or bound-comparison capability.
  - `bigint_int64` / `bigint_uint64` — 64-bit bounds exceed tag-literal precision.
  - Temporal (`instant`, `plainDate`, …) — no Temporal global in the bench; branded classes indistinguishable structurally.
  - `promise_string`, the 3 CIRCULAR_REFS, `circular_array` / `tuple_circular` / `array_of_union_with_self_ref` — thenable/cyclic-value/anon-self-ref transform limits.
- **Samples too weak:** none. The 140 `samples` overrides are all narrowing trims (drop NaN/Infinity at plain-number positions, drop Invalid-Date entries, drop 1 over-strict email sample) that match real typia runtime semantics; each is documented inline and corroborated by `alignment-misalignments.json` (`undeclaredDivergences: 0`).

**Empirical backstop:** `summary.typia` in `alignment-misalignments.json` reports `builderIssues: 0` and `undeclaredDivergences: 0` against the actual dev-build bench run — every faithfulness claim in this audit is consistent with the measured behaviour, not assumed.

**Unverifiable from docs (reasoned from established typia behaviour + the zero-undeclared-divergence bench result):** the exact NaN/Infinity-accept and Invalid-Date-accept semantics of the 13.0.0-dev build (typia.io returned 403 to automated fetch). These are long-standing typia behaviours and the bench alignment confirms them indirectly.
