# Audit report — `validation` test-suite case definitions

**Suite group:** `packages/ts-runtypes/test/suites/validation/`
**Case-def files audited:** 13 (Array, Atomic, Circular, CircularGuard, DateTime, Native, Object, Realworld, TemplateLiteral, Tuple, TypeMappings, Union, Utility)
**Total cases:** 168
**Verdict counts:** OK 162 · SUSPECT 6 · WRONG 0

Each `<Name>.ts` holds the case DEFINITIONS (intended `<T>`, samples, `getExpectedErrors`/`getExpectedStandardErrors`); the `<Name>.test.ts` drivers push each case through the per-variant asserts in `test/util/validationAsserts.ts`. The asserts hard-throw when `getExpectedErrors.length !== invalid.length`, so any length drift would fail at load — none present in any file. Every case was checked against the data-only projection contract (non-serializable members silently dropped) and the marker rule (paired static `createValidate<T>()` + reflect `createValidate(value)`, plus deserialize / dataOnly / schema / standardSchema / mockType companions). All cases satisfy the marker rule; no case is missing a call shape and none diverge unintentionally.

No WRONG case (no wrong expected error/path) was found in the reference. The 6 SUSPECT items are coverage gaps or emitter-token questions that cannot be confirmed by reading the case file alone — all are noted with a suggested fix.

---

## Array.ts (18 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_array | `string[]` | non-array rejected; bad elem → `[i] string`; `[]` valid | Y | Y | OK | — |
| number_array | `number[]` | NaN/±Inf/null/bigint elem rejected at `[i] number` | Y | Y | OK | strong NaN/Inf edge |
| boolean_array | `boolean[]` | strict bool; 0/1/null at `[i]` rejected | Y | Y | OK | — |
| bigint_array | `bigint[]` | strict bigint; `2`/Inf rejected | Y | Y | OK | — |
| date_array | `Date[]` | per-elem Date; Invalid Date at `[0]` | Y | partial | SUSPECT | no bare non-array (string/object) invalid sample; non-arrayness only via null/undefined. Add `'2024'` → `[] array` |
| regexp_array | `RegExp[]` | instanceof; source-string rejected | Y | Y | OK | — |
| undefined_array | `undefined[]` | strict `===undefined` | Y | Y | OK | — |
| null_array | `null[]` | strict `===null` | Y | Y | OK | — |
| array_generic | `Array<string>` | sugar collapses to `string[]` | Y | Y | OK | thin (4 invalid) but intent is id-collapse |
| string_array_2d | `string[][]` | nested `[i,j]` paths, multi-error accumulation | Y | Y | OK | — |
| string_array_3d | `string[][][]` | depth-3 `[i,j,k]` paths | Y | Y | OK | — |
| string_array_noIsArrayCheck | `string[]` `{noIsArrayCheck}` | guard stripped; only elem walk catches `[42]` | Y | partial | SUSPECT | single invalid sample; weakest set in file (justified by stripped guard). `mockType` thunk drops the option (harmless) |
| object_array | `{a:string}[]` | elem-object err at `[i,'a']`; extra keys pass | Y | Y | OK | — |
| union_array | `(string\|number)[]` | per-elem union; Inf/bigint fail both arms | Y | Y | OK | — |
| tuple_array | `[string,number][]` | tuple under array; over-length → `tuple`, slot → `[i,slot]` | Y | Y | OK | — |
| circular_array | `CircularArray = CircularArray[]` | self-recursive array; deep `array` paths | Y | Y | OK | — |
| circular_object_with_array | `{a;deep?;d?:ObjectType[]}` | cycle via array prop; `['d',0,...]` paths | Y | Y | OK | — |
| symbol_array | `symbol[]` | non-serializable root → factory throws | Y | Y | OK | factoryThrows correct |
| readonly_string_array | `ReadonlyArray<string>` | readonly erased; same as `string[]` | Y | Y | OK | — |

## Atomic.ts (26 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| any | `any` | no-op; invalid `[]`, errors `[]` | Y | Y | OK | — |
| bigint | `bigint` | typeof bigint; Inf/-Inf/42 rejected | Y | Y | OK | hand-authored StandardErrors |
| boolean | `boolean` | strict; 0/1 rejected | Y | Y | OK | notes cite `''`/`'true'` not sampled (not load-bearing) |
| date | `Date` | instanceof + getTime NaN | Y | Y | OK | — |
| enum_mixed | `enum Color` | numeric+string members; out-of-range rejected | Y | Y | OK | idDivergent correct |
| literal_2 | `2` | strict `===`; `'2'` rejected | Y | Y | OK | — |
| literal_a | `'a'` | case-sensitive; `'A'`/`''` rejected | Y | Y | OK | — |
| literal_true | `true` | `===`; 1/`'true'` rejected | Y | Y | OK | — |
| literal_1n | `1n` | `===`; 1/`'1n'`/0n rejected | Y | Y | OK | — |
| literal_symbol | `typeof sym` | by-description; diff-desc rejected | Y | Y | OK | dataOnlyDivergent correct |
| never | `never` | rejects all 10; mockType throws | Y | Y | OK | — |
| null | `null` | `===null`; all nullish/falsy traps | Y | Y | OK | — |
| number | `number` | isFinite; NaN/±Inf rejected | Y | Y | OK | — |
| object | bare `object` primitive | non-null non-primitive passes ([], Date, regex); errors token `objectLiteral` | Y | Y | SUSPECT | samples faithful; the `expected:'objectLiteral'` token for the bare `object` primitive is the open question — confirm the Go kindname for the `object` keyword isn't a distinct token |
| regexp | `RegExp` | instanceof | Y | Y | OK | reflect getErr/mock `'not-supported'` documented |
| string | `string` | typeof string; `''` valid | Y | Y | OK | — |
| symbol | bare `symbol` | factoryThrows; empty samples | Y | Y | OK | — |
| undefined | `undefined` | `===undefined` | Y | Y | OK | — |
| void | `void` | like undefined; `vd()` valid | Y | Y | OK | — |
| literal_2_noLiterals | `2`→`number` | degrades; Inf/NaN rejected | Y | Y | OK | mock drops option (intentional) |
| literal_a_noLiterals | `'a'`→`string` | degrades; `''` valid | Y | Y | OK | — |
| literal_regexp_noLiterals | `typeof /abc/i`→`RegExp` | degrades to instanceof | Y | Y | OK | — |
| literal_true_noLiterals | `true`→`boolean` | degrades; 0/1 rejected | Y | Y | OK | — |
| literal_1n_noLiterals | `1n`→`bigint` | degrades; 0n/3n valid | Y | Y | OK | — |
| literal_symbol_noLiterals | `typeof sym`→`symbol` | degrades to bare symbol → factoryThrows | Y | Y | SUSPECT | schema thunks call `RT.symbol()` WITHOUT `{noLiterals:true}` unlike every sibling noLiterals case (which thread the option). Benign (both resolve same alwaysThrow + factoryThrows masks it) but inconsistent — align with sibling pattern |
| unknown | `unknown` | no-op, same as any | Y | Y | OK | — |

## Circular.ts (7 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| object_full_mion_shape | `interface Circular{n;s;c?:Circular;d?:Date}` | self-ref object; deep `['c','s']` err | Y | Y | OK | — |
| array_of_union_with_self_ref | `(CuArray\|Date\|number\|string)[]` | self-ref array-of-union; union-emit non-recurse | Y | Y | OK | shallow paths documented |
| object_with_tuple_prop | `{tuple:[bigint,CircularTuple?]}` | cycle via tuple slot; 4-level deep valid | Y | Y | OK | — |
| object_with_index_prop | `{index:{[k]:CircularIndex}}` | cycle via index-sig value | Y | Y | OK | — |
| object_deeply_nested | `{deep1:{deep2:{deep3:{deep4?:Self}}}}` | cycle buried 4 anon levels; 7-seg path | Y | Y | OK | — |
| circular_child_under_literal_root | `{isRoot:true;ciChild:ICircularDeep}` | recursion below literal root; deep path | Y | Y | OK | — |
| multiple_circular_types_cross_referenced | mutual `RootCircular`/`ICircularDeep`/`ICircularDate` | crossing recursive types; cross paths | Y | Y | OK | — |

## CircularGuard.ts (10 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| cycle_object_property | `Node{name;next?:Node}` | armed guard rejects `a.next=a` | Y | Y | OK | real cycle built |
| cycle_array_element | `Node{label;children:Node[]}` | cycle via `children.push(self)` | Y | Y | OK | — |
| cycle_tuple_slot | `Node{head;tail?:[Node]}` | cycle via `a.tail=[a]` | Y | Y | OK | — |
| cycle_index_signature | `Node{[k]:Node}` | cycle via `a.self=a` | Y | Y | OK | — |
| cycle_union_member | `Node{value;next:Node\|null}` | cycle rides non-null arm | Y | Y | OK | — |
| cycle_deeply_nested | `Node{name;a:{b:{c?:Node}}}` | back-edge 3 levels → root | Y | Y | OK | — |
| cycle_under_noncircular_root | `Wrapper{id;node?:Recursive}` | cycle in child under acyclic root | Y | Y | OK | — |
| cycle_mutual | `A{b?:B}`/`B{a?:A}` | mutual cross-type cycle | Y | Y | OK | — |
| dag_shared_acyclic | `Node{label;children:Node[]}` | shared-but-acyclic DAG NOT a cycle → valid | Y | Y | OK | no-false-positive control |
| disarmed_acyclic | `Node{name;next?:Node}` | guard unarmed → acyclic validates | Y | Y | OK | disarmed control |

## DateTime.ts (9 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| date | `Date` | both Invalid-Date forms + string rejected → `date` | Y | Y | OK | hand-authored StandardErrors |
| instant | `Temporal.Instant` | string + wrong-Temporal rejected | Y | Y | OK | dataOnlyDivergent |
| zonedDateTime | `Temporal.ZonedDateTime` | string + `Instant` rejected | Y | Y | OK | single valid (adequate) |
| plainDate | `Temporal.PlainDate` | string + `Instant` rejected | Y | Y | OK | — |
| plainTime | `Temporal.PlainTime` | string + `PlainDate` rejected | Y | Y | OK | — |
| plainDateTime | `Temporal.PlainDateTime` | string + `PlainDate` rejected | Y | Y | OK | — |
| plainYearMonth | `Temporal.PlainYearMonth` | string + `PlainDate` rejected | Y | Y | OK | — |
| plainMonthDay | `Temporal.PlainMonthDay` | string + `PlainDate` rejected | Y | Y | OK | — |
| duration | `Temporal.Duration` | string + `PlainDate` rejected | Y | Y | OK | — |

## Native.ts (4 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| map_string_number | `Map<string,number>` | instanceof + entry K/V; `{key,failed:'mapKey'/'mapValue'}`; NaN→mapValue; wrong-collection rejected | Y | Y | OK | hand-authored StandardErrors |
| set_string | `Set<string>` | instanceof + elem; `{key,failed:'setKey'}`; wrong-collection rejected | Y | Y | OK | — |
| promise_string | `Promise<string>` | thenable passes; non-fn `then` rejected → `promise` | Y | Y | OK | dataOnlyDivergent; thenable correctly in valid |
| awaited_promise | `Awaited<Promise<string>>`→`string` | real Promise fails unwrapped string → `string` | Y | Y | OK | — |

## Object.ts (31 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| simple_interface | `{a:string;b:number}` | atomic props; extra keys pass; NaN/Inf on `b` rejected | Y | Y | OK | — |
| object_as_const_literals | `{name:'john';age:30}` | literal-equality; `{}`→both errors | Y | Y | OK | — |
| object_via_return_type_utility | `ReturnType<makeUser>` | static ReturnType idiom; reflect opted-out | Y | Y | OK | reflect `'not-supported'` documented |
| object_via_property_access | `{id;name}` | reflect-via-property-access infers T | Y | Y | OK | — |
| object_via_array_access | `{id;name}` | reflect-via-array-index infers T | Y | partial | SUSPECT | samples + expected are verbatim clone of object_via_property_access; thin 3-invalid set. Vary one sample so a path-specific regression surfaces |
| interface_with_optional | `{a:string;b?:number}` | optional absent/undefined ok; NaN fails | Y | Y | OK | — |
| interface_with_date | `{date:Date;name:string}` | Date prop; Invalid Date rejected | Y | Y | OK | — |
| interface_with_method | `{name;cb:()=>any}` | method dropped; bad cb NOT rejected | Y | Y | OK | data-only contract honored |
| nested_object | `{a;deep:{b;c}}` | recursive; `['deep','b']` paths | Y | Y | OK | — |
| interface_string_array_prop | `{tags:string[]}` | array prop; `['tags',i]` paths | Y | Y | OK | — |
| circular_interface | `{name;child?:Circular}` | self-recursive; nested child path | Y | Y | OK | — |
| circular_interface_on_array | `{name;children?:Circular[]}` | recursion via array-of-self | Y | partial | OK | only 3 invalid, no deep-cycle invalid (shallow only) |
| circular_interface_on_nested_object | `{name;embedded:{hello;child?:Circular}}` | recursion in required wrapper | Y | partial | OK | 3 invalid, no deep-cycle sample |
| index_signature_string | `{[k:string]:string}` | for-in values string; `{}` valid | Y | Y | OK | — |
| index_signature_named_props | `{a;b;[k]:string\|number}` | named props + index loop | Y | Y | OK | — |
| index_signature_nested | `{[k]:{[k]:number}}` | nested index; NaN leaf rejected | Y | Y | OK | — |
| index_signature_date_value | `{[k]:{[k]:Date}}` | Date leaves; Invalid Date rejected | Y | Y | OK | — |
| index_signature_non_root | `Obj2{b;c:Obj1{a;[k]:string}}` | nested index; `['c','c']` path | Y | Y | OK | — |
| function_top_level | `() => void` | root function; non-fn → `function` | Y | Y | OK | dataOnlyDivergent, skip |
| interface_callable | `{(a,b):string;extra:string}` | callable iface = fn + data props | Y | Y | OK | excess-on-fn not rejected |
| interface_all_optional | `{a?;b?}` | plain-object guard rejects array/Date/Map/Set/RegExp | Y | Y | OK | strong guard coverage |
| class_simple | `class{date;name;method}` | structural class; method dropped | Y | Y | OK | dataOnlyDivergent |
| rpc_error_class | `RpcError<'test-error'>` | branded literal + discriminator | Y | Y | OK | — |
| call_signature_params | `Parameters<(a:number,b:boolean)=>string>` | args tuple; arity/slot errors | Y | Y | OK | — |
| call_signature_params_with_optional | `[number,boolean,string?]` | trailing optional; excess rejected | Y | Y | OK | — |
| call_signature_params_with_rest | `[number,boolean,...Date[]]` | rest slots Date-checked | Y | Y | OK | dataOnlyDivergent |
| record_union_keys | `Record<'a'\|'b',number>` | union-key → required props; extras pass | Y | Y | OK | — |
| union_value_index | `{[k]:string\|number}` | index value union; NaN/bigint fail | Y | Y | OK | — |
| object_with_union_prop | `{kind:'a'\|'b';n:number}` | literal-union prop; missing kind → union | Y | Y | OK | — |
| interface_inheritance | `Child extends Base` | inherited props merged | Y | Y | OK | — |
| class_inheritance | `Sub extends Base` (class) | inherited class props, class kind | Y | Y | OK | dataOnlyDivergent |
| index_signature_number_key | `{[k:number]:string}` | number-key normalises to string keys | Y | Y | OK | — |

## Realworld.ts (6 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| user | `User` | id/email/name/age?/roles-union-array/active/createdAt; bad role → `['roles',0]` union | Y | Y | OK | — |
| order | `Order` (nested) | deep paths exact: `items.0.price`, `customer.email`, `status` union, `total` | Y | Y | OK | each invalid breaks one field |
| blogPost | `BlogPost` | `tags:[1,2]`→two errors; `meta.likes`; `published` boolean | Y | Y | OK | — |
| product | `Product` | currency union; `dimensions.depth`; `price` number | Y | Y | OK | optional dimensions valid present |
| productPage | `ProductPage` | paginated array; `data.0.currency` union; `hasMore` boolean | Y | Y | OK | empty-data valid present |
| registrationForm | `RegistrationForm` | `acceptedTerms:false`→`literal`; `profile.lastName`; `password` string | Y | Y | OK | true-literal token correct |

## TemplateLiteral.ts (7 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| url_with_number_id | `` `api/user/${number}` `` | anchored pattern; prefix/suffix/empty/non-string rejected | Y | Y | OK | negatives/decimals valid, NaN/Inf words rejected |
| multi_segment_url | `` `/api/v${number}/user/${string}/posts/${number}` `` | multi-placeholder positional match | Y | Y | OK | — |
| leading_string_placeholder | `` `${string}/${number}` `` | leading empty-string-allowed span + number | Y | Y | OK | good almost-matches |
| regex_special_chars | `` `(${number})` `` | literal parens escaped | Y | Y | OK | strong almost-match set |
| template_literal_nested_in_object | `{url:TL; method:string}` | TL prop + string prop; deep paths | Y | Y | OK | — |
| template_literal_index_key | `{[k:`` `api/${string}` ``]:number}` | index-key pattern + number value | Y | Y | SUSPECT | key-pattern miss expects `expected:'never'` (only `never` token in file). Plausible (constrained-key record) but confirm the record/index emitter reports `never` not `templateLiteral` for a non-matching key |
| template_literal_union_placeholder | `` `${'a'\|'b'}-${number}` `` | union placeholder distributes → top-level `union` | Y | Y | OK | — |

## Tuple.ts (12 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_number_pair | `[string,number]` | exact arity; too-short per-slot, too-long → `tuple` | Y | Y | OK | strong arity coverage |
| full_mion_tuple | `[Date,number,string,null,string[],bigint]` | 6-slot heterogeneous | Y | partial | SUSPECT | 5-elem (too-short) expects `[5] bigint` (missing-tail-as-undefined), not root `tuple`. Matches the else-branch model but confirm no min-length guard makes it a root `tuple` error |
| tuple_with_optional | `[number,bigint?,boolean?,number?]` | trailing optionals; `[3,'not bigint']`→`[1] bigint` | Y | Y | OK | see Findings: optional-slot token differs from boolean? sibling |
| nested_tuple_in_array | `[string,number][]` | array of tuples; `[i,slot]` paths | Y | partial | OK | no too-LONG inner-tuple sample |
| tuple_rest | `[number,...string[]]` | rest absorbs trailing, each string-checked | Y | Y | OK | dataOnlyDivergent |
| tuple_circular | `[Date,number,string,null,string[],bigint,Self?]` | self-ref via trailing optional | Y | partial | OK | no >7-length / bad-nested-recursion sample |
| tuple_multiple_trailing_optionals | `[number,bigint?,boolean?,number?]` | same type; `[3,1n,'not boolean']`→`[2] union` | Y | Y | SUSPECT | IDENTICAL type/schema as `tuple_with_optional`; within this case `bigint?` miss → `bigint` but `boolean?` miss → `union`. Plausible (boolean expands to `undefined\|true\|false`, bigint stays atomic) but the most fragile token pair in the suite — confirm against optional-slot emit; consider collapsing the two near-duplicate cases |
| tuple_named_labels | `[name:string,age:number]` | labels erase; same as `[string,number]` | Y | partial | SUSPECT | NO too-long sample for a fixed 2-tuple (the exact weak spot). Add `['Alice',30,'extra']` → `[] tuple` |
| tuple_with_non_serializable | `[number,()=>any]` | function slot must be undefined/absent → `[1] undefined` | Y | partial | OK | dataOnlyDivergent; no too-long sample |
| empty_tuple | `[]` | only `[]` valid; any elem/object/non-array → root `tuple` | Y | Y | OK | clean over-length + non-array coverage |
| single_element_tuple | `[string]` | exactly len 1; both `[]` and over-length tested | Y | Y | OK | both arity edges present |
| readonly_tuple | `readonly [string,number]` | readonly erased; over-length tested | Y | Y | OK | — |

## TypeMappings.ts (3 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| key_prefix_rename | `{user_id:number;user_name:string}` (remapped) | renamed keys required; originals fail | Y | Y | OK | StandardErrors index-parallel |
| key_conditional_rename | `{_id:number;name:string;createdAt:Date}` | `id`→`_id` remap; pass-through keys required | Y | Y | OK | — |
| key_filter_via_never | `{id:number;name:string}` (secret dropped) | dropped key absent; extra prop passes | Y | Y | OK | never-drop semantic correct |

## Union.ts (21 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| atomic_union | `Date\|number\|string\|null\|bigint` | OR over atomics; all invalid root `union` | Y | Y | OK | hand-authored StandardErrors |
| string_literal_union | `'UNO'\|'DOS'\|'TRES'` | case-sensitive literals | Y | Y | OK | — |
| large_union_eight_arms | 8-arm hetero w/ subset arms | value-first 8-arm routing | Y | Y | OK | subset survival exercised |
| string_or_number | `string\|number` | OR; NaN/Inf/BigInt rejected | Y | Y | OK | — |
| union_of_array_types | `string[]\|number[]\|boolean[]` | whole-array dispatch; mixed fail | Y | Y | OK | — |
| array_of_union | `(string\|bigint\|boolean\|Date)[]` | per-elem OR; element-path errors | Y | Y | OK | — |
| union_of_object_shapes | `{a;aa}\|{b}\|{c}` | ≥1 arm required-props; extras ignored | Y | Y | OK | — |
| discriminated_union | `{kind:'a';n}\|{kind:'b';s}` | full-arm check gated by discriminant | Y | Y | OK | — |
| circular_union | self-ref `Date\|num\|str\|{a?;b?}\|[]` | cycle to atomic bottom | Y | Y | OK | — |
| union_with_methods | `{name;getName()}\|{age;getAge()}` | methods dropped; bad method NOT rejected | Y | Y | OK | data-only honored |
| intersection_to_object | `{a}&{b}` | intersection → merged object; per-prop paths | Y | Y | OK | — |
| union_with_index_arm | `{a;aa}\|{b}\|{c;[k]:bigint}` | index arm constrains extras to bigint | Y | Y | OK | — |
| union_same_prop_different_types | `{type:'a';prop:bool}\|...` | discriminant pins prop type | Y | Y | OK | — |
| union_mixed_arrays_and_objects | arrays + objects | shape dispatch | Y | Y | OK | — |
| union_merged_property | `{a:bool}\|{a:num}` | effectively `{a:bool\|num}`; NaN rejected | Y | Y | OK | — |
| union_mixed_with_index | `string[]\|{a;aa}\|{b}\|{a;[k]:str}\|{[k]:bigint;b}` | array+index arms; cross-index rejection | Y | Y | OK | — |
| union_with_any_fallback | `string\|any`→`any` | collapses to any; no-op | Y | Y | OK | — |
| union_with_unknown_fallback | `string\|unknown`→`unknown` | collapses to unknown; no-op | Y | Y | OK | — |
| union_subset_small_first | `Small{a}\|Large{a;b}` | both arms reachable; small swallows | Y | Y | OK | — |
| union_subset_nested_levels | `Tiny{x}\|Medium{x;y}\|Large{x;y;z}` | smallest arm swallows | Y | Y | OK | — |
| union_subset_mixed_related_unrelated | `Base{id}\|Extended{id;name}\|Unrelated{value}` | subset pair + disjoint arm; NaN rejected | Y | Y | OK | — |

## Utility.ts (20 cases)

| case key | intended type | what it asserts | faithful? | repr.? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| partial | `Partial<{name;age;createdAt}>` | `{}`+subset valid; non-plain-object guarded; wrong present-prop fails | Y | Y | OK | — |
| required | `Required<{name?;age?;createdAt?}>` | only full valid; `{}`→3 missing errors | Y | Y | OK | relies on full per-prop accumulation (consistent) |
| pick | `Pick<Person,'name'\|'createdAt'>` | only those keys checked; `age` extra passes | Y | Y | OK | — |
| omit | `Omit<Person,'age'>` | name+createdAt checked; `age` dropped | Y | Y | OK | — |
| exclude_atomic | `Exclude<'name'\|'age'\|'createdAt','age'>` | surviving literal union; 'age' fails | Y | Y | OK | — |
| extract_atomic | `Extract<...,'name'\|'createdAt'>` | surviving union; dropped 'age' fails | Y | Y | OK | not a clone of exclude |
| exclude_from_object_union | `Exclude<Shape,{kind:'circle'}>` | circle arm dropped | Y | Y | OK | — |
| non_nullable | `NonNullable<string\|number\|null\|undefined>` | null/undefined dropped; NaN/Inf fail number arm | Y | Y | OK | — |
| return_type | `ReturnType<(a,b)=>Date>`→`Date` | Date; Invalid Date / NaN-date fail | Y | Y | OK | — |
| readonly | `Readonly<{name;age}>` | validates identical to base T | Y | Y | OK | no mutation assertion (correct) |
| intersection_with_required_override | `Partial<Person> & Required<Pick<Person,'name'>>` | name required, rest optional | Y | Y | OK | — |
| omit_keeping_optional | `Omit<{a;b?;c},'a'>`→`{b?;c}` | c required, b optional | Y | Y | OK | explicit-undefined-optional valid |
| keyof_to_literal_union | `keyof Person` | string-literal union; non-member fails | Y | Y | OK | — |
| typeof_variable_query | `typeof config` (widened) | widened object shape validates | Y | Y | OK | — |
| indexed_access_type | `Person['name']`→`string` | atomic string | Y | Y | OK | — |
| conditional_type_resolved | `IsString<'hello'>`→`boolean` | resolves true-branch boolean | Y | Y | OK | 0/1 traps |
| mapped_type_custom | `Nullable<{a;b}>` | each prop `T[K]\|null`; missing prop fails | Y | Y | OK | — |
| mapped_type_with_conditional_value | `{[K in keyof User]:FieldFor<User[K]>}` | per-prop distinct nested shapes; deep paths | Y | Y | OK | — |
| distributive_conditional_over_union | `Wrap<string\|number>`→`{w:string}\|{w:number}` | union of two object arms | Y | Y | OK | — |
| deep_partial_recursive_mapped | `DeepPartial<Settings>` | recursive all-optional; each level guarded | Y | Y | OK | — |

---

## Findings summary

No WRONG cases. The reference contains no wrong expected error or path, no length drift, no missing/divergent call shape, and no data-only-projection mis-assertion (the method/function/symbol-bearing cases — `interface_with_method`, `interface_callable`, `class_simple`, `union_with_methods`, `tuple_with_non_serializable` — all correctly decline to reject the bad non-serializable member). The 6 SUSPECT items, grouped by root cause:

**Emitter-token questions (token plausible, cannot be confirmed by reading the case alone — the only items that would become WRONG if the emitter disagrees):**
- `Atomic.object` — bare `object` primitive errors use `expected:'objectLiteral'`; confirm the Go kindname for the `object` keyword isn't a distinct token (`object`/`nonNullObject`).
- `TemplateLiteral.template_literal_index_key` — a key failing the template-literal key pattern is asserted as `expected:'never'` (the only `never` token in the file); confirm the record/index emitter reports `never`, not `templateLiteral`, for a non-matching key.
- `Tuple.full_mion_tuple` — a too-short (5-elem) array for the 6-slot tuple expects `[5] bigint` (missing-tail-as-undefined) rather than a root `tuple` arity error; confirm no min-length guard.
- `Tuple.tuple_multiple_trailing_optionals` — within one case, an optional `bigint?` slot miss reports `bigint` while an optional `boolean?` slot miss reports `union`; confirm optional-slot expansion (boolean → `undefined|true|false` union vs bigint staying atomic). NB: this is NOT a contradiction with `tuple_with_optional` — both agree `bigint?`→`bigint`.

**Samples too weak / copy-paste drift:**
- `Object.object_via_array_access` — `getSamples`/`getExpectedErrors` are a verbatim clone of the sibling `object_via_property_access` (thin 3-invalid set); vary one sample so a regression unique to the array-access inference path can surface.
- `Array.date_array` — no bare non-array (string/object) invalid sample; non-arrayness only via null/undefined (every sibling array case has a string non-array). Add `'2024'` → `[] array`.
- `Array.string_array_noIsArrayCheck` — single invalid sample; weakest set in the file (justified by the stripped `isArray` guard), and its `mockType` thunk drops the `{noIsArrayCheck}` option the other thunks carry (harmless).
- `Tuple.tuple_named_labels` — a fixed 2-tuple with NO too-long invalid sample (the canonical tuple weak spot); add `['Alice',30,'extra']` → `[] tuple`.

**Minor consistency (benign):**
- `Atomic.literal_symbol_noLiterals` — schema thunks call `RT.symbol()` without the `{noLiterals:true}` option every sibling noLiterals case threads; masked by `factoryThrows`, but inconsistent.

**Representativeness notes (verdict OK, not defects):** `Object.circular_interface_on_array` / `circular_interface_on_nested_object`, `Tuple.tuple_circular` / `nested_tuple_in_array` / `tuple_with_non_serializable` lack a deep-cycle or too-long-arity invalid sample; `Array.array_generic`, `Union` no-op fallbacks, and several single-valid Temporal cases are thin but adequate.
