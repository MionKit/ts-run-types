# Competitor audit — ts-runtypes (the home library + reference mirror)

- **Competitor:** ts-runtypes (own repo; benchmark competitor #1 of 5 AND the reference mirror)
- **Version:** 0.1.0
- **Files:** `container/benchmarks/competitors/ts-runtypes/cases.ts` (266 keys, TYPE form) + `schemaCases.ts` (263 keys, value-first/schema form)
- **Total cases (cases.ts):** 266 — **OK: 263 · SUSPECT: 0 · WRONG: 0**
- **NOT_SUPPORTED (cases.ts):** 3 (`ATOMIC.symbol`, `ATOMIC.literal_symbol_noLiterals`, `ARRAY.symbol_array`) — all correctly mark `factoryThrows` from the shared ref. **0 mis-marked.**
- **NOT_SUPPORTED (schemaCases.ts):** 6 — the 3 above + `ATOMIC.object`, `ATOMIC.literal_symbol` (`validateSchema not-supported`), `TUPLE.tuple_circular` (`validateSchema not-supported`). All legitimate value-first-builder gaps, not type-form gaps.
- **cases.ts vs schemaCases.ts parity:** cases.ts is the full TYPE form (drives runtime + typecost). schemaCases.ts is the value-first twin, consumed by typecost ONLY (not imported by main.ts). The two diverge ONLY where the value-first builder cannot express a shape: schemaCases drops the 3 `CIRCULAR_REFS.*` keys entirely and adds 3 extra NOT_SUPPORTED opt-outs (`ATOMIC.object`, `ATOMIC.literal_symbol`, `TUPLE.tuple_circular`). No behavioural drift on any shared key; both forms build the same intended type.

Both files copy each case's thunk VERBATIM from the shared suites and use the real public API exclusively (`createValidate<T>()` / `createGetValidationErrors<T>()` for the cheap is-valid + errors paths in cases.ts; `createValidate(RT.…/TF.…)` value-first in schemaCases.ts). No hand-rolled `typeof` bypass, no `RunType<unknown>`/`as any` type-erasure anywhere. `build` always uses the is-valid validator; `buildErrors` always uses `getErrors(v).length === 0`. The `noLiterals` / `noIsArrayCheck` / `rejectCircularRefs` options are passed positionally and correctly. Format builders (`TF.int8`, `TF.uuidv4`, `TFT.instant`, …) are used for the format groups (not plain `number`/`string`), matching the format-builder semantics. Plain-object guards (all-optional / Partial / DeepPartial) reject Array/Date/Map/Set per the shared `invalid` samples. Discriminated unions, circular-via-recursive-type, and the serializable-data projection (function/method props silently dropped) all line up with the shared samples.

## ATOMIC (24)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| any | `any` | `createValidate<any>()` | yes | yes | OK | |
| bigint | `bigint` | `<bigint>()` | yes | yes | OK | typeof gate rejects Infinity per ref |
| boolean | `boolean` | `<boolean>()` | yes | yes | OK | |
| date | `Date` | `<Date>()` | yes | yes | OK | rejects Invalid Date |
| enum_mixed | mixed enum `Color` | local enum + `<Color>()` | yes | yes | OK | enum kept inline so marker resolves |
| literal_2 / literal_a / literal_true / literal_1n | `2`/`'a'`/`true`/`1n` | literal `<T>()` | yes | yes | OK | |
| literal_symbol | `typeof sym` | `Symbol('hello')` + `<typeof sym>()` | yes | yes | OK | symbol literal supported (description match) |
| never | `never` | `<never>()` | yes | yes | OK | |
| null / undefined / void | `null`/`undefined`/`void` | `<T>()` | yes | yes | OK | null≠undefined, void accepts undefined |
| number | `number` | `<number>()` | yes | yes | OK | rejects NaN/Infinity |
| object | `object` | `<object>()` | yes | yes | OK | rejects null |
| regexp | `RegExp` | `<RegExp>()` | yes | yes | OK | |
| string | `string` | `<string>()` | yes | yes | OK | |
| symbol | `symbol` | NOT_SUPPORTED | — | — | OK | claim correct (factoryThrows in ref) |
| literal_*_noLiterals (2,a,regexp,true,1n) | literal w/ `{noLiterals}` degrade | `<T>(undefined,{noLiterals:true})` | yes | yes | OK | degrades to base primitive per ref |
| literal_symbol_noLiterals | bare symbol root | NOT_SUPPORTED | — | — | OK | claim correct (factoryThrows) |
| unknown | `unknown` | `<unknown>()` | yes | yes | OK | |

## ARRAY (18)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| string/number/boolean/bigint/date/regexp/undefined/null _array | `T[]` | `<T[]>()` | yes | yes | OK | per-element typeof/instanceof |
| array_generic | `Array<string>` | `<Array<string>>()` | yes | yes | OK | collapses to string[] |
| string_array_2d / _3d | `string[][]` / `[][][]` | `<T>()` | yes | yes | OK | |
| string_array_noIsArrayCheck | `string[]` `{noIsArrayCheck}` | `<string[]>(undefined,{noIsArrayCheck:true})` | yes | yes | OK | guard stripped; samples weakened intentionally per ref |
| object_array | `{a:string}[]` | `<{a:string}[]>()` | yes | yes | OK | |
| union_array | `(string\|number)[]` | `<T>()` | yes | yes | OK | |
| tuple_array | `[string,number][]` | `<T>()` | yes | yes | OK | |
| circular_array | `CircularArray = CircularArray[]` | local recursive type + `<T>()` | yes | yes | OK | recursive type idiom |
| circular_object_with_array | `{a;deep?;d?:Self[]}` | local type + `<T>()` | yes | yes | OK | |
| symbol_array | `symbol[]` | NOT_SUPPORTED | — | — | OK | claim correct (factoryThrows propagates from element) |
| readonly_string_array | `ReadonlyArray<string>` | `<ReadonlyArray<string>>()` | yes | yes | OK | readonly erased |

## OBJECT (31)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| simple_interface | `{a:string;b:number}` | `<T>()` | yes | yes | OK | |
| object_as_const_literals | `{readonly name:'john';readonly age:30}` | `<T>()` | yes | yes | OK | literal props |
| object_via_return_type_utility | `ReturnType<typeof makeUser>` | local fn + `<ReturnType<…>>()` | yes | yes | OK | recommended static idiom (reflect form omitted in ref) |
| object_via_property_access / _array_access | `{id;name}` | `<{id:number;name:string}>()` | yes | yes | OK | same hash as static |
| interface_with_optional | `{a;b?}` | `<T>()` | yes | yes | OK | |
| interface_with_date | `{date:Date;name}` | `<T>()` | yes | yes | OK | |
| interface_with_method | `{name;cb:()=>any}` | `<T>()` | yes | yes | OK | cb dropped (serializable projection); samples expect `cb` ignored |
| nested_object | `{a;deep:{b;c}}` | `<T>()` | yes | yes | OK | |
| interface_string_array_prop | `{tags:string[]}` | `<T>()` | yes | yes | OK | |
| circular_interface / _on_array / _on_nested_object | recursive `{…child?:Self…}` | local type + `<T>()` | yes | yes | OK | |
| index_signature_string / _named_props / _nested / _date_value / _non_root / _number_key | index sig variants | `<T>()` | yes | yes | OK | number key normalised to string |
| function_top_level | `()=>void` | `<()=>void>()` | yes | yes | OK | typeof==='function' |
| interface_callable | `{(a,b):string;extra}` | `<T>()` | yes | yes | OK | callable + data prop |
| interface_all_optional | `{a?;b?}` | `<T>()` | yes | yes | OK | all-optional plain-object guard rejects Array/Date/Map/Set |
| class_simple / class_inheritance | local class / subclass | `<MyClass>()` / `<Sub>()` | yes | yes | OK | methods dropped, props merged |
| rpc_error_class | branded generic class `RpcError<'test-error'>` | local class + `<RpcError<'test-error'>>()` | yes | yes | OK | brand + literal discriminator |
| call_signature_params / _with_optional / _with_rest | `Parameters<CallSig>` | local type + `<Parameters<…>>()` | yes | yes | OK | param tuple emit |
| record_union_keys | `Record<'a'\|'b',number>` | `<T>()` | yes | yes | OK | distributes to {a;b} |
| union_value_index | `{[k]:string\|number}` | `<T>()` | yes | yes | OK | |
| object_with_union_prop | `{kind:'a'\|'b';n}` | `<T>()` | yes | yes | OK | |
| interface_inheritance | `Child extends Base` | local interfaces + `<Child>()` | yes | yes | OK | merged children |

## TUPLE (11)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| string_number_pair | `[string,number]` | `<T>()` | yes | yes | OK | |
| full_mion_tuple | `[Date,number,string,null,string[],bigint]` | `<T>()` | yes | yes | OK | |
| tuple_with_optional / tuple_multiple_trailing_optionals | `[number,bigint?,boolean?,number?]` | `<T>()` | yes | yes | OK | per-slot optional wrap |
| nested_tuple_in_array | `[string,number][]` | `<T>()` | yes | yes | OK | |
| tuple_rest | `[number,...string[]]` | `<T>()` | yes | yes | OK | rest for-loop |
| tuple_circular | `[…,Self?]` recursive | local type + `<T>()` | yes | yes | OK | (schema form NOT_SUPPORTED — value-first gap) |
| tuple_named_labels | `[name:string,age:number]` | `<T>()` | yes | yes | OK | labels erased |
| tuple_with_non_serializable | `[number,()=>any]` | `<T>()` | yes | yes | OK | fn slot must be `=== undefined` |
| empty_tuple | `[]` | `<[]>()` | yes | yes | OK | |
| single_element_tuple | `[string]` | `<[string]>()` | yes | yes | OK | |
| readonly_tuple | `readonly [string,number]` | `<T>()` | yes | yes | OK | readonly erased |

## UNION (22)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| atomic_union | `Date\|number\|string\|null\|bigint` | `<T>()` | yes | yes | OK | |
| string_literal_union | `'UNO'\|'DOS'\|'TRES'` | `<T>()` | yes | yes | OK | case-sensitive |
| large_union_eight_arms | 8-arm hetero union | `<T>()` | yes | yes | OK | subset/superset arms preserved |
| string_or_number | `string\|number` | `<T>()` | yes | yes | OK | |
| union_of_array_types | `string[]\|number[]\|boolean[]` | `<T>()` | yes | yes | OK | |
| array_of_union | `(string\|bigint\|boolean\|Date)[]` | `<T>()` | yes | yes | OK | |
| union_of_object_shapes | disjoint object union | `<T>()` | yes | yes | OK | loose match (≥1 arm) |
| discriminated_union | `{kind:'a';n}\|{kind:'b';s}` | `<T>()` | yes | yes | OK | |
| circular_union | recursive union | local type + `<T>()` | yes | yes | OK | |
| union_with_methods | object arms w/ methods | `<T>()` | yes | yes | OK | methods dropped per arm |
| intersection_to_object | `{a}&{b}` | `<T>()` | yes | yes | OK | resolves to merged object |
| union_with_index_arm | arm w/ index sig | `<T>()` | yes | yes | OK | |
| union_same_prop_different_types | discriminated, shared prop | `<T>()` | yes | yes | OK | |
| union_mixed_arrays_and_objects | mixed arms | `<T>()` | yes | yes | OK | |
| union_merged_property | `{a:boolean}\|{a:number}` | `<T>()` | yes | yes | OK | |
| union_mixed_with_index | mixed + index arms | `<T>()` | yes | yes | OK | |
| union_with_any_fallback | `string\|any`→any | `<string\|any>()` | yes | yes | OK | collapses to any (all pass) |
| union_with_unknown_fallback | `string\|unknown`→unknown | `<string\|unknown>()` | yes | yes | OK | collapses to unknown |
| union_subset_small_first / _nested_levels / _mixed_related_unrelated | subset chains | local interfaces + `<T>()` | yes | yes | OK | all arms reachable |

## TEMPLATE_LITERAL (7)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| url_with_number_id | `` `api/user/${number}` `` | `<T>()` | yes | yes | OK | number→digit regex |
| multi_segment_url | multi-placeholder URL | `<T>()` | yes | yes | OK | |
| leading_string_placeholder | `` `${string}/${number}` `` | `<T>()` | yes | yes | OK | string span allows empty |
| regex_special_chars | `` `(${number})` `` | `<T>()` | yes | yes | OK | parens escaped |
| template_literal_nested_in_object | `{url:`…`;method}` | `<T>()` | yes | yes | OK | |
| template_literal_index_key | `` {[k:`api/${string}`]:number} `` | `<T>()` | yes | yes | OK | key regex in for-in |
| template_literal_union_placeholder | `` `${'a'\|'b'}-${number}` `` | `<T>()` | yes | yes | OK | union constrained |

## NATIVE (4)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| map_string_number | `Map<string,number>` | `<T>()` | yes | yes | OK | instanceof + entries walk |
| set_string | `Set<string>` | `<T>()` | yes | yes | OK | |
| promise_string | `Promise<string>` | `<T>()` | yes | yes | OK | thenable check, T not validated |
| awaited_promise | `Awaited<Promise<string>>`→string | `<T>()` | yes | yes | OK | unwraps to string |

## CIRCULAR (7)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| object_full_mion_shape | recursive `{n;s;c?;d?}` | local interface + `<T>()` | yes | yes | OK | |
| array_of_union_with_self_ref | `(Self\|Date\|number\|string)[]` | local type + `<T>()` | yes | yes | OK | |
| object_with_tuple_prop | `{tuple:[bigint,Self?]}` | local interface + `<T>()` | yes | yes | OK | |
| object_with_index_prop | `{index:{[k]:Self}}` | local interface + `<T>()` | yes | yes | OK | |
| object_deeply_nested | 4-level buried self-ref | local interface + `<T>()` | yes | yes | OK | |
| circular_child_under_literal_root | flat root + circular child | local interfaces + `<T>()` | yes | yes | OK | |
| multiple_circular_types_cross_referenced | mutual recursion | local interfaces + `<T>()` | yes | yes | OK | |

## CIRCULAR_REFS (3) — cyclic VALUES, `{rejectCircularRefs:true}`
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| linked_list_cycle | `{value;next:Node\|null}` | `<Node>(undefined,{rejectCircularRefs:true})` | yes | yes | OK | rejects cyclic samples |
| tree_cycle | `{label;children:Node[]}` | same option | yes | yes | OK | |
| object_self_cycle | `{name;next?:Node}` | same option | yes | yes | OK | |

(Only ts-runtypes implements these — schemaCases omits all 3 keys; see parity note.)

## UTILITY (20)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| partial / required / pick / omit | `Partial/Required/Pick/Omit<Person,…>` | local interface + `<Util<…>>()` | yes | yes | OK | |
| exclude_atomic / extract_atomic | `Exclude/Extract` on literal union | `<T>()` | yes | yes | OK | |
| exclude_from_object_union | `Exclude<Shape,{kind:'circle'}>` | local type + `<T>()` | yes | yes | OK | |
| non_nullable | `NonNullable<string\|number\|null\|undefined>` | `<T>()` | yes | yes | OK | |
| return_type | `ReturnType<Fn>`→Date | local type + `<T>()` | yes | yes | OK | |
| readonly | `Readonly<Person>` | local interface + `<T>()` | yes | yes | OK | |
| intersection_with_required_override | `Partial<P>&Required<Pick<P,'name'>>` | `<T>()` | yes | yes | OK | re-requires name |
| omit_keeping_optional | `Omit<{a;b?;c},'a'>` | `<T>()` | yes | yes | OK | optionality preserved |
| keyof_to_literal_union | `keyof Person` | `<T>()` | yes | yes | OK | |
| typeof_variable_query | `typeof config` (widened) | local const + `<typeof config>()` | yes | yes | OK | widened url:string/port:number |
| indexed_access_type | `Person['name']`→string | `<T>()` | yes | yes | OK | |
| conditional_type_resolved | `IsString<'hello'>`→boolean | local type + `<T>()` | yes | yes | OK | |
| mapped_type_custom | `{[K]:T[K]\|null}` | local type + `<T>()` | yes | yes | OK | |
| mapped_type_with_conditional_value | per-prop conditional shape | local types + `<T>()` | yes | yes | OK | |
| distributive_conditional_over_union | `Wrap<string\|number>` | local type + `<T>()` | yes | yes | OK | |
| deep_partial_recursive_mapped | `DeepPartial<Settings>` | local types + `<T>()` | yes | yes | OK | all-optional-deep, outer guard rejects array/Date |

## TYPE_MAPPINGS (3)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| key_prefix_rename | `{[K as `user_${K}`]:T[K]}` | local types + `<T>()` | yes | yes | OK | |
| key_conditional_rename | `id`→`_id` rename | local types + `<T>()` | yes | yes | OK | |
| key_filter_via_never | drop `secret` via never | local types + `<T>()` | yes | yes | OK | |

## DATETIME (43 incl. Temporal base + min/max variants)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| date / instant / zonedDateTime / plainDate / plainTime / plainDateTime / plainYearMonth / plainMonthDay / duration | `Date` / `Temporal.*` | `<Date>()` / `<Temporal.*>()` | yes | yes | OK | base instances |
| date_minmax / _gtlt / _min_lt / _max_now / _rel_window / _rel_datetime_components | `TF.Date<{…}>` constrained | `<TF.Date<{…}>>()` | yes | yes | OK | absolute + relative bounds |
| instant_minmax / _gtlt / _rel | `TFT.Instant<{…}>` | `<TFT.Instant<{…}>>()` | yes | yes | OK | |
| plainDate_* (12 bound variants) | `TFT.PlainDate<{…}>` | `<TFT.PlainDate<{…}>>()` | yes | yes | OK | min/max/gt/lt/only/rel ymd/weeks |
| plainTime_minmax / _gtlt | `TFT.PlainTime<{…}>` | `<…>()` | yes | yes | OK | |
| plainDateTime_minmax / _gtlt / _rel / _rel_combo | `TFT.PlainDateTime<{…}>` | `<…>()` | yes | yes | OK | |
| plainYearMonth_minmax / _gtlt / _rel | `TFT.PlainYearMonth<{…}>` | `<…>()` | yes | yes | OK | |
| zonedDateTime_minmax / _gtlt / _rel | `TFT.ZonedDateTime<{…}>` | `<…>()` | yes | yes | OK | [UTC]-bracketed bounds |

## STRING_FORMAT (47)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| string_maxLength / _minLength / _length / _range | `TF.String<{len opts}>` | `<TF.String<{…}>>()` | yes | yes | OK | |
| string_allowedChars(_ignoreCase/_literal) / _disallowedChars | `TF.String<{(dis)allowedChars}>` | `<…>()` | yes | yes | OK | |
| string_allowedValues(_ignoreCase/_escaped) / _disallowedValues / _customErrorMessage | `TF.String<{(dis)allowedValues}>` | `<…>()` | yes | yes | OK | |
| alpha / alphaNumeric / numeric / alpha_withLength / lowercase_validate | `TF.Alpha`/`AlphaNumeric`/`Numeric`/`Lowercase` | `<TF.*>()` | yes | yes | OK | |
| uuidv4 / uuidv7 | `TF.UUIDv4`/`UUIDv7` | `<TF.*>()` | yes | yes | OK | |
| date_iso / _DMY / _YM / _MD / _minMax_absolute | `TF.StringDate<{format/min/max}>` | `<…>()` | yes | yes | OK | |
| time_iso / _HHmmss / _HHmmss_ms / _minMax_absolute | `TF.StringTime<{…}>` | `<…>()` | yes | yes | OK | |
| dateTime_default / _custom / _minMax_absolute | `TF.StringDateTime<{…}>` | `<…>()` | yes | yes | OK | |
| ipv4 / ipv6 / ip_any / ipv4_port / ipv6_port | `TF.IPv4`/`IPv6`/`IP`/`IPv4WithPort`/`IPv6WithPort` | `<TF.*>()` | yes | yes | OK | |
| domain / domainStrict / email / emailPunycode / emailStrict | `TF.Domain`/`DomainStrict`/`Email`/… | `<TF.*>()` | yes | yes | OK | |
| url / urlHttp / urlFile | `TF.Url`/`UrlHttp`/`UrlFile` | `<TF.*>()` | yes | yes | OK | |
| pattern_slug / pattern_hex | `TF.String<{pattern:…}>` via `registerFormatPattern` | `Slug`/`Hex` alias + `<T>()` | yes | yes | OK | custom pattern registered VERBATIM from suite |

## NUMBER_FORMAT (10)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| number_max / _min / _lt / _gt / _multipleOf | `TF.Number<{bound}>` | `<TF.Number<{…}>>()` | yes | yes | OK | |
| number_integer / _float | `TF.Integer` / `TF.Float` | `<TF.*>()` | yes | yes | OK | |
| number_combined | `TF.Number<{min;max;integer;multipleOf}>` | `<…>()` | yes | yes | OK | |
| number_int8 / number_uint8 | `TF.Int8` / `TF.UInt8` | `<TF.*>()` | yes | yes | OK | width-bounded |

## BIGINT_FORMAT (8)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| bigint_max / _min / _lt / _gt / _multipleOf / _combined | `TF.BigInt<{bound}>` | `<TF.BigInt<{…}>>()` | yes | yes | OK | bigint literal bounds (`100n`) |
| bigint_int64 / bigint_uint64 | `TF.BigInt64` / `TF.BigUInt64` | `<TF.*>()` | yes | yes | OK | |

## REALWORLD (6)
| case key | intended type | implementation | faithful? | idiomatic? | verdict | issue |
|---|---|---|---|---|---|---|
| user | `User` (createdAt:string) | local interface + `<User>()` | yes | yes | OK | createdAt is plain string per ref (NOT date) |
| order | `Order` w/ nested Address/OrderItem | local interfaces + `<Order>()` | yes | yes | OK | |
| blogPost | `BlogPost` | local interface + `<BlogPost>()` | yes | yes | OK | |
| product | `Product` (optional dimensions) | local interface + `<Product>()` | yes | yes | OK | |
| productPage | `ProductPage` (Product[] page) | local interfaces + `<ProductPage>()` | yes | yes | OK | |
| registrationForm | `RegistrationForm` (acceptedTerms:true) | local interface + `<RegistrationForm>()` | yes | yes | OK | literal-true required |

## Findings summary

No WRONG or SUSPECT cases. ts-runtypes' own implementations are a faithful, idiomatic 1:1 mirror of the shared reference — which is expected, since this corpus IS the reference the other four competitors are diffed against.

- **RunType<unknown>/type-erased injection:** NONE. No `as any`, no `RunType<unknown>`, no value-first schema that erases the concrete type. Every value-first `createValidate(RT.…)` in schemaCases builds a typed schema the marker can resolve.
- **Hand-rolled bypass:** NONE. No `(v)=>typeof v===…` stand-in anywhere; every `build` is `createValidate`, every `buildErrors` is the `getErrors().length===0` path.
- **Reference type disagrees with shared sample:** NONE found. Spot-checked the load-bearing cases where the home library defines the intended type for everyone (REALWORLD.user `createdAt:string` matches; the serializable-data drops on `interface_with_method` / `tuple_with_non_serializable` / `union_with_methods` match the shared `valid` samples that assume the non-serializable member is ignored; `union_with_any/unknown_fallback` correctly collapse to all-pass; `record_union_keys` distributes to a fixed shape). The reference is internally consistent with its own samples.
- **cases.ts vs schemaCases.ts drift:** the only divergences are EXPECTED value-first-builder limitations, not behavioural bugs:
  - schemaCases omits the 3 `CIRCULAR_REFS.*` keys entirely (no `rejectCircularRefs` value-first thunk authored).
  - schemaCases adds 3 NOT_SUPPORTED opt-outs absent in cases.ts: `ATOMIC.object` and `ATOMIC.literal_symbol` (`validateSchema not-supported` — no value-first builder for bare `object` / a symbol literal), and `TUPLE.tuple_circular` (`validateSchema not-supported` — recursive tuple can't be expressed value-first, though `circular(...)` covers the object/array circular cases).
  - These do not affect runtime correctness: schemaCases feeds typecost ONLY (not imported by main.ts).
- **Samples too weak:** only the documented, intentional one — `ARRAY.string_array_noIsArrayCheck` ships a single-element `invalid:[[42]]` because stripping the `Array.isArray` guard means non-array inputs are a documented caller-pre-verified trade-off. This is a deliberate ref choice, not a defect. NOT flagged WRONG.
- **NOT_SUPPORTED re-derivation:** all 3 cases.ts opt-outs (`ATOMIC.symbol`, `ATOMIC.literal_symbol_noLiterals`, `ARRAY.symbol_array`) are genuine `factoryThrows` positions (symbol at a root/propagating position renders an alwaysThrow factory). Claims are correct — none of these types CAN be expressed as a non-throwing root validator, so the markers are right.
