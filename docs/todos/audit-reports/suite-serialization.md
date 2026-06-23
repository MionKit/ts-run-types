# Suite audit — `serialization`

- **Suite group:** `packages/ts-runtypes/test/suites/serialization/`
- **Case-def files:** 17 (Arrays, Atomic, CircularGuard, CircularRefs, DateTime, ExtraParams, Functions, Iterables, LargeObjects, Objects, Others, Realworld, Records, TemplateLiterals, Tuples, Unions, UtilityTypes)
- **Total cases:** 152
- **OK:** 114 &nbsp; **SUSPECT:** 36 &nbsp; **WRONG:** 2

Audit method: each case driven by `util/serializationAsserts.ts` (6 JSON encoder×decoder pairings + binary + value-first schema round-trips) against the `SerializationCase` shape (`types.ts`), comparison via `util/equalsHelpers.ts`. Drop-vs-throw line per CLAUDE.md "validate contract — serializable data only": non-serializable at a PROPERTY = silent drop (Warning, `deserializedValues` shows removal); at a ROOT/propagating position (array elem, tuple slot, union member, fn param/return) = `alwaysThrow` (`factoryThrows: true`, empty values).

---

## Arrays.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| array | `string[]` | populated + empty array round-trip | yes | yes | OK | — |
| array_date | `Date[]` | per-element Date→ISO / 8-byte binary; empty | yes | yes | OK | — |
| undefined_in_array | `undefined[]` | undefined slots → null on wire | yes | mostly | OK | single sample; adequate |
| multi_dimensional | `string[][]` | ragged + empty inner/outer | yes | yes | OK | — |
| non_serializable_in_array | `symbol[]` | propagating non-serializable elem → `factoryThrows` | yes | yes | OK | correct THROW (not drop) |
| array_circular | `type CA = CA[]` | recursive element walk, nested empty arrays | yes | yes | OK | acyclic samples; recursion exercised |

## Atomic.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string | `string` | empty + multibyte UTF-8 | yes | yes | OK | strong samples |
| number | `number` | int/neg/frac/extremes round-trip | yes | partial | SUSPECT | notes claim "fixed 8 bytes" but no `getBinaryByteSizes` set → byte-width contract unasserted |
| number_not_supported | Inf/NaN edge | JSON→null, binary native, direct unparseable | yes | yes | OK | flags consistent |
| regexp | `RegExp` | flag combos `/src/flags` | yes | yes | OK | — |
| bigint | `bigint` | decimal-string transform | yes | partial | SUSPECT | only `[1n]` — no negative/zero/>64-bit |
| boolean | `boolean` | identity | yes | partial | SUSPECT | only `[true]`; omits `false` |
| any | `any` | best-effort JSON | yes | yes | OK | `roundTripBestEffort` |
| not_supported_any | `any` edge | undefined/Date/bigint don't survive | yes | yes | OK | — |
| null | `null` | identity | yes | yes | OK | sole inhabitant |
| undefined | `undefined` | rebind to undefined | yes | yes | OK | — |
| date | `Date` | ISO/epoch round-trip | yes | partial | SUSPECT | one `.000Z` ts; no ms/epoch-0/invalid; no `getBinaryByteSizes:[8]` despite "fixed 8-byte" note |
| enum_color | string enum | underlying-string, `idDivergent` | yes | yes | OK | divergence justified |
| symbol | `symbol` | unsupported → `factoryThrows` | yes | yes | OK | — |
| object | `object` primitive | best-effort, schema not-supported | yes | yes | OK | — |
| void | `void` | undefined rebind | yes | yes | OK | — |
| never | `never` | `factoryThrows` | yes | yes | OK | — |
| literal_string | `'hello'` | plain string | yes | yes | OK | sole inhabitant |
| literal_number | `42` | plain number | yes | yes | OK | — |
| literal_boolean | `true` | plain boolean | yes | yes | OK | sole inhabitant (unlike `boolean`) |

## CircularGuard.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| cycle_object_property | recursive `next?` | real cycle → `CircularReferenceError` | yes | yes | OK | `node.next = node` |
| cycle_array_element | recursive `children[]` | cycle via array elem throws | yes | yes | OK | — |
| cycle_tuple_slot | recursive `tail?:[Node]` | cycle via tuple slot throws | yes | yes | OK | — |
| cycle_index_signature | `{[k]:Node}` | cycle via index value throws | yes | yes | OK | — |
| cycle_union_member | `next: Node\|null` | cycle via union member throws | yes | yes | OK | — |
| cycle_deeply_nested | cycle behind plain levels | deep cycle throws | yes | yes | OK | — |
| cycle_under_noncircular_root | cycle in child under acyclic root | throws | yes | yes | OK | — |
| cycle_mutual | A↔B mutual cycle | mutual cycle throws | yes | yes | OK | real cross-type cycle |
| dag_shared_acyclic | shared-but-acyclic DAG | no throw (shared ≠ cycle) | yes | yes | OK | correct control |
| disarmed_acyclic | guard off, acyclic | no throw | yes | yes | OK | control |

## CircularRefs.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| circular_types | `{name;child?:Self}` | recursive optional-child, acyclic node | yes | mostly | OK | single sample, recurses once; could add leaf base |
| circular_union_array | `(Self\|Date\|number\|string)[]` | recursive union-array, Date revived | yes | yes | OK | strong |
| circular_tuple | `{list:[bigint,Self?]}` | obj→tuple recursion, bigint per level | yes | yes | OK | depth 4 + base |
| circular_index | `{index:{[k]:Self}}` | obj→record recursion | yes | yes | OK | — |
| circular_deep | self-ref 4 plain levels down | re-enters once + base | yes | yes | OK | — |
| circular_tuple_complex | root recursive tuple | schema `not-supported` (TS2589) | yes | yes | OK | opt-out justified |
| object_with_circular_array | `{a;deep?;d?:Self[]}` | obj→array-of-self recursion | yes | partial | SUSPECT | single sample, recurses once, no absent-`d` base case |

## DateTime.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| date | `Date` | ISO + 8-byte epoch | partial | weak | SUSPECT | `.000Z` hides ms; no epoch-0/pre-1970/invalid-Date→null; no `getBinaryByteSizes:[8]` despite "fixed 8-byte" claim |
| instant | `Temporal.Instant` | UTC-string + numeric binary | yes | ok | OK | two samples incl epoch-0 |
| zonedDateTime | `Temporal.ZonedDateTime` | `[TZ]`-string + string-binary | yes | weak | SUSPECT | only UTC zone; offset/annotation fidelity untested — add non-UTC IANA zone |
| plainDate | `Temporal.PlainDate` | `YYYY-MM-DD` + numeric | yes | ok | OK | — |
| plainTime | `Temporal.PlainTime` | `HH:MM:SS` + numeric | yes | weak | SUSPECT | both whole-second; no fractional sub-second sample |
| plainDateTime | `Temporal.PlainDateTime` | `…THH:MM:SS` + numeric | yes | weak | SUSPECT | single whole-second sample |
| plainYearMonth | `Temporal.PlainYearMonth` | `YYYY-MM` + numeric | yes | weak | SUSPECT | single sample |
| plainMonthDay | `Temporal.PlainMonthDay` | `MM-DD` + string-binary | yes | weak | SUSPECT | single sample; add leap-day `02-29` |
| duration | `Temporal.Duration` | `P…` ISO + string-binary | yes | ok | OK | incl `PT0S` zero edge |

## ExtraParams.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| extras_passthrough_compatible | `{declared:string}` | extra survives mutate+preserve only; stripped elsewhere | yes | yes | OK | canonical strip-vs-preserve; both `getTestData` + `getTestDataForStringify` set |
| extras_throws_bigint | `{declared:string}` | bigint extra → mutate `JSON.stringify` throws; others strip | yes | yes | OK | `jsonStringifyThrows` correct |
| extras_dropped_symbol | `{declared:string}` | symbol extra dropped in all paths | yes | weak | OK | converges both paths → does NOT isolate strip-vs-preserve, but faithful |
| extras_dropped_function | `{declared:string}` | fn extra dropped in all paths | yes | weak | OK | same convergence note |
| nested_extras_in_declared_child | `{outer:{declared:string}}` | nested extra preserve vs strip through composite | yes | yes | OK | proper nested case |

## Functions.ts

| case key | intended type | function position | drop/throw | correct? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| parameters | `Parameters<fn>=[number,boolean,string]` | sliced (none) | round-trip | yes | OK | — |
| optional_params | `[Date, boolean?]` | sliced | round-trip | yes | OK | optional present+absent |
| function_return | `ReturnType<fn>=Date` | return (none) | round-trip | yes | OK | — |
| function_with_rest_parameters | `[number,boolean,...Date[]]` | sliced | round-trip | yes | OK | rest empty+populated |
| function_with_date_parameters | `[Date, boolean?]` | sliced | round-trip | yes | OK | near-dup of optional_params |
| required_function_return | `ReturnType<fn>=bigint` | return | round-trip | yes | OK | — |
| function_with_only_rest_parameters | `[...number[]]` | sliced | round-trip | yes | OK | — |
| non_serializable_params | `[number,boolean,(()=>null)?]` | fn in TUPLE SLOT (propagating) | THROW (`factoryThrows`) | yes | OK | correct THROW (not drop) |
| function_promise_return_type | `ReturnType<fn>=Promise<Date>` | Promise root | THROW | yes | OK | — |
| function_return_type_is_function | `ReturnType<fn>=()=>Date` | fn at ROOT | THROW | yes | OK | correct THROW |
| call_signature_params | `Parameters<{(a,b):string}>=[number,boolean]` | sliced | round-trip | yes | OK | — |
| call_signature_return | `ReturnType<{(a,b):string}>=string` | return | round-trip | yes | OK | — |

Note: this file slices every function via `Parameters<>`/`ReturnType<>` or places it at a propagating position. The PROPERTY-position silent-drop of a method (`{name; onClick:()=>void}` → drop `onClick`, keep `name`) is covered in Objects.ts / Unions.ts, not here.

## Iterables.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| set_string | `Set<string>` | array-on-wire, rehydrate Set | NO (vacuous) | partial | SUSPECT | see ROOT CAUSE: helper collapses Set→`{}`; no dup elem for dedup |
| set_small_object | `Set<SmallObject>` (Date+bigint) | element Date/bigint transforms | NO (vacuous) | yes | SUSPECT | element transforms unverified by comparison |
| objects_with_nested_sets | `{a;b:Set;c:Set}` | nested Sets round-trip | NO (vacuous for sets) | partial | SUSPECT | b≡c copy-paste; set contents unverified |
| map_string_number | `Map<string,number>` | entries round-trip | NO (vacuous) | partial | SUSPECT | no dup/collision key |
| map_string_small_object | `Map<string,SmallObject>` | value Date/bigint transforms | NO (vacuous) | yes | SUSPECT | value transforms unverified |
| map_small_object_number | `Map<SmallObject,number>` | OBJECT KEYS w/ Date/bigint | NO (vacuous) | yes | SUSPECT | key-encoding (headline edge) entirely unverified |
| objects_with_nested_maps | `{a;b:Map<string,{sm}>}` | nested Map round-trip | NO (vacuous for map) | partial | SUSPECT | key1≡key2 payloads; map unverified |
| map_with_bigint_keys | `Map<bigint,number>` | bigint keys → string → BigInt | NO (vacuous) | yes | SUSPECT | bigint-key restore unverified |
| map_with_date_values | `Map<string,Date>` | Date values round-trip | NO (vacuous) | partial | SUSPECT | Date-value restore unverified |

## LargeObjects.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| wide_interface | 30-field record (3 Date, 2 bigint, nested) | wide-object round-trip + transforms | yes | yes | OK | genuinely wide; one sample (all fields populated) |
| object_union_5 | 5-member discriminated union | union dispatch round-trip | partial | weak | SUSPECT | only `product` arm sampled; 4 arms + their Date fields untested |
| mixed_union_atomic_and_large_objects | `string\|number\|ProductEvent\|UserEvent` | atomic short-circuit + object envelope | partial | weak | SUSPECT | only ProductEvent sampled; advertised string/number short-circuit never hit |
| deep_nested | 5-level nested object/array tree | deep encode amplifies per-prop cost | yes | yes | OK | genuinely deep; single sample |
| large_class_union | 3-member class union (Date+bigint each) | class→plain-object decode | partial | weak | SUSPECT | only LargeClassA sampled; B/C arms + bigints untested |

## Objects.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| interface | object w/ Date/bigint/optional/weird-key | Date+bigint round-trip, optional both ways | yes | yes | OK | — |
| many_optional_props | 32 optional numbers | sparse subsets + empty | yes | yes | OK | — |
| class | class instance + method | instance→plain obj, method dropped | yes | yes | OK | method on prototype, drop automatic |
| extended_class | subclass (own+inherited) | inherited field walked | yes | yes | OK | — |
| non_serializable_class | class + ctor fields + method | instance→plain obj, method dropped | yes | partial | SUSPECT | description promises "deserialize-fn registered" reconstruction path never exercised |
| undefined_in_object | `{a;b;c:undefined}` | undefined prop omitted on wire | yes | yes | OK | `deserializedValues` drops `c` |
| optional_properties_order | `{a;b?}` | optional present+absent, order kept | yes | yes | OK | — |
| all_optional_fields | `{a?;b?}` | any subset incl empty | yes | yes | OK | — |
| extras_passthrough_unsafe | object + top-level & nested extras | mutate+preserve keeps; others strip | yes | yes | OK | strongest extras case; raw vs cleaned distinct |
| interface_circular | self-ref `child?` | recursive object round-trip | yes | partial | SUSPECT | child never absent — optional-recursion base case unexercised |
| interface_circular_array | self-ref `children?:Self[]` | recursion via optional array | yes | yes | OK | empty+populated |
| interface_circular_deep | self-ref in nested `embedded`, bigint | deep recursion + bigint | yes | yes | OK | — |
| interface_root_not_circular | acyclic root embedding circular child | resolves + bigint | yes | yes | OK | — |
| interface_multiple_circular | root → 2 circular interfaces (bigint+Date) | several circular types coexist | yes | partial | SUSPECT | `ciRoort`, `ciDate.embedded/.deep` never populated — only ciChild recurses |
| interface_with_methods | `{name; methodProp:()=>any}` | fn PROPERTY dropped, name survives | yes | yes | OK | correct DROP (no `factoryThrows`) |

## Others.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| promise_jsonStringify_error | `Promise<string>` root | non-serializable root → `factoryThrows` | yes | yes | OK | — |
| non_serializable | `Int8Array` root | root → `factoryThrows` | yes | yes | OK | — |
| non_serializable_interface | `{a:Int8Array}` | PROPERTY non-serializable → DROP (`{}`) | yes | yes | OK | correct DROP, `deserializedValues:[{}]` |
| non_serializable_array | `Int8Array[]` | propagating elem → `factoryThrows` | yes | yes | OK | correct THROW |
| non_serializable_tuple | `[Int8Array]` | propagating slot → `factoryThrows` | yes | yes | OK | correct THROW |

## Realworld.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| user | User (roles union[], age?, createdAt:string) | 2 records, optional + union arm | yes | yes | OK | dates are `string` by file design |
| order | Order (nested customer/items/addr, status union, note?) | nested + alt union arm | yes | yes | OK | — |
| blogPost | BlogPost (tags[], author, publishedAt?, meta) | post + optional publishedAt | yes | yes | OK | — |
| product | Product (currency union, categories[], dimensions?) | product + optional dimensions | yes | yes | OK | currency only ever `'USD'` (minor) |
| productPage | ProductPage (data:Product[], paging) | non-empty + empty data | yes | yes | OK | — |
| registrationForm | RegistrationForm (`acceptedTerms:true`, profile.age?) | form + optional profile.age | yes | yes | OK | literal `true` correct |

## Records.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| index_property | `{[k:string]:string}` | string record + empty `{}` | yes | mostly | OK | only empty-record coverage in file |
| index_property_and_prop | `{a;[k:string]:string}` | declared + dynamic, open record | yes | yes | OK | — |
| index_property_extra | `{a;b;[k:string]:string\|number}` | union-valued dynamic keys | yes | weak | SUSPECT | single sample; number-arm vs string-arm not split |
| multiple_index_props | `{[k:string];[k:number];[abc:symbol]:Date}` | string+number survive, symbol dropped | partial | NO | WRONG | `[k:number]` index never exercised — no numeric-key sample; number-key→string headline untested |
| index_property_nested | `{[k]:{[k]:number}}` | two-level dynamic keys | yes | weak | SUSPECT | single sample, one outer key, no empty |
| index_property_nested_date | `{[k]:{[k]:Date}}` | nested Date leaf transform | yes | weak | SUSPECT | single sample, identical Dates |
| index_property_bigint | `{[k:string]:bigint}` | bigint values → decimal | yes | mostly | OK | multi-entry; no empty / byte-size |
| index_property_non_root | `{b;c:{a;[k]:string}}` | nested index sig under fixed root | yes | weak | SUSPECT | single sample, one dynamic key |

## TemplateLiterals.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| url_string | `` `api/users/${number}` `` | string-subtype wire; int/neg/frac/max-safe | yes | yes | OK | strong spread |
| url_in_object | `{url:tmpl; method:string}` | property + plain string | yes | yes | OK | — |
| url_index_key | `{[k:`api/${string}`]:number}` | template-literal key record + empty | yes | yes | OK | empty covered |
| url_index_key_with_named | `{meta; [k:tmpl]:string\|number}` | intersection record + named sibling | yes | yes | OK | — |

## Tuples.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| tuple | `[Date,number,string,null,string[],bigint]` | heterogeneous slots, per-slot transforms | yes | yes | OK | one sample but fully heterogeneous |
| tuple_with_optional | `[number,bigint?,boolean?,number?]` | trailing optionals, padding | partial | weak | SUSPECT | optional bigint `undefined` in both samples → bigint-slot transform never exercised |
| tuple_rest_parameter | `[number,...bigint[]]` | rest bigint transform, empty+populated | yes | yes | OK | — |
| tuple_with_non_serializable | `[number,()=>any]` | fn slot (propagating) → `factoryThrows` | yes | yes | OK | correct THROW |
| tuple_circular | root recursive tuple | recursion, schema `not-supported` (TS2589) | yes | yes | OK | opt-out justified |
| interface_circular_tuple | `{name; parent?:[string,Self]}` | obj↔tuple cycle, value-first schema present | yes | yes | OK | complements tuple_circular |

## Unions.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| union | `Date\|number\|string\|null\|bigint` | per-kind wire transforms | yes | yes | OK | all 5 members sampled |
| union_array | `string[]\|number[]\|boolean[]\|Date[]` | union of arrays; `[]` ambiguity | yes | yes | OK | all arms + empty |
| with_discriminator | `(string\|bigint\|boolean\|Date)[]` | array of scalar union | yes | mostly | OK | key/title drift (no real discriminator) |
| union_object_with_discriminator | `{a;aa}\|{b}\|{c:bigint}\|{d?}` | structural object union | yes | partial | SUSPECT | `{b:number}` arm never sampled; title says "discriminator" but type is structural |
| union_with_discriminator_property | `{type:'a'}\|{'b'}\|{'c';time:Date}\|{type:boolean}` | true discriminated union | yes | yes | OK | all arms incl non-literal |
| union_mixed_with_discriminator | `str[]\|num[]\|bool[]\|{a;aa}\|{b}\|{c:bigint;aa}` | array-vs-object then structural | partial | NO | WRONG | only 2 of 6 members sampled; num[]/bool[]/`{b}`/bigint-`{c}` untested |
| union_index_property_with_discriminator | `str[]\|{a;aa}\|{b}\|{a;[k]:str}\|{[k]:bigint;b:bigint}` | index-sig record union | partial | NO | SUSPECT | 3 of 5 members sampled; string-record arm + `{b:number}` untested |
| circular_union_with_discriminator | `UnionC = Date\|number\|string\|{a?;b?}\|UnionC[]` | self-ref union recursion | yes | yes | OK | all arms sampled; title drift only |
| union_with_methods | `{name;getName()}\|{age;getAge()}\|{active;isActive()}` | methods dropped at prop, data restored | yes | yes | OK | all 3 arms, methods stripped |
| union_with_any | `number\|{name}\|any` | `T\|any` collapses to any | yes | yes | OK | `roundTripBestEffort` |
| union_with_non_serializable | `Date\|number\|string\|(()=>any)` | fn arm dropped under DataOnly | yes | partial | SUSPECT | no function value sampled; the "matches no surviving member" claim untested; `factoryThrows` unset |
| union_extra_bigint_prop_throws | `{a:string}\|{b:number}` | bigint extra → stringify throws; safe strips | yes | yes | OK | intent is extra-contract |
| union_extra_symbol_prop_drops | `{a:string}\|{b:number}` | symbol extra dropped | yes | yes | OK | `deserializedValues` correct |
| shared_prop_same_type | `{kind:'created';at:Date;by}\|{kind:'updated';at:Date;reviewers}` | shared Date transform once per arm | yes | yes | OK | both arms |
| shared_prop_divergent_date_string | `{kind:'event';when:Date}\|{kind:'note';when:string}` | divergent shared `when` keyed on tag | yes | yes | OK | transforms must not compose |
| shared_prop_divergent_bigint_number | `{form:'big';id:bigint}\|{form:'small';id:number}` | divergent `id`, big arm > MAX_SAFE_INTEGER | yes | yes | OK | lossless-bigint load-bearing |
| shared_prop_no_discriminator_structural | `{a:string;b:number}\|{a:boolean;c:Date}` | structural dispatch, Date on `c` | yes | yes | OK | both arms |

## UtilityTypes.ts

| case key | intended type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| awaited | `Awaited<Promise<{a;b;c:Date}>>` | resolved object + Date unwrap | yes | yes | OK | — |
| exclude_atomic | `Exclude<'name'\|'age'\|number,'age'>` | `'name'\|number`, both arms | yes | yes | OK | `'age'` absent |
| exclude_objects | `Exclude<Shape,Circle>` | `Square\|Triangle`, both arms | yes | yes | OK | — |
| required_properties | `Required<{name?;age?;createdAt?:Date}>` | all-present (only valid shape) | yes | ok | OK | weak by nature, correct |
| extract_atomic | `Extract<'name'\|'age'\|'createdAt','name'\|'createdAt'>` | `'name'\|'createdAt'` | yes | weak | SUSPECT | only `'name'` sampled; `'createdAt'` arm never exercised |
| extract_objects | `Extract<Shape,ToExtract>` | `Square\|Triangle` | yes | weak | SUSPECT | only `square` sampled; `triangle` arm never exercised |
| partial_properties | `Partial<{name;age;createdAt:Date}>` | each prop alone + `{}` | yes | yes | OK | exemplary optionality coverage |
| pick_properties | `Pick<…,'name'\|'createdAt'>` | only kept keys present | yes | yes | OK | dropped keys absent |
| omit_properties | `Omit<…,'email'>` | email-less object | yes | yes | OK | — |
| record_type | `Record<string,Date>` | multi-key Date map + `{}` | yes | yes | OK | — |

---

## Findings summary

### WRONG (2)

- **Declared union member never sampled** — `Unions.union_mixed_with_discriminator` (only 2 of 6 members fed; number[]/boolean[]/`{b}`/bigint-`{c}` arms untested, so member-selection and the bigint transform on the missing arm can't fail the test); `Records.multiple_index_props` (the `[key:number]` index signature is declared but no numeric-key sample exists, so the number-key→string-on-wire behavior — the case's headline claim — is never exercised; only string + symbol keys are sampled).

### SUSPECT — grouped by root cause (36)

- **Vacuous Map/Set comparison (helper defect, 9 cases — all of Iterables):** `util/equalsHelpers.ts` `normalizeForComparison` has no Map/Set branch. The decoder restores genuine `Map`/`Set` instances (per the case descriptions, `new Set(v)` / `new Map(...)`), which have zero enumerable own keys, so the object branch reduces both restored and reference to `{}` and `toEqual` passes trivially. Every Iterables round-trip therefore asserts only "encode/decode didn't throw" — entry contents, key encoding (string/number/bigint/object), Set dedup, insertion order, Map-vs-object identity, and per-element Date/bigint transforms are all unverified. `deepCloneForRoundTrip` *does* handle Map/Set (masking the gap on the input side). FIX at the helper: add a Map/Set branch normalizing to a sorted `[key,value]` / element array (tagged by container kind) and recurse. `set_string`, `set_small_object`, `objects_with_nested_sets`, `map_string_number`, `map_string_small_object`, `map_small_object_number`, `objects_with_nested_maps`, `map_with_bigint_keys`, `map_with_date_values`.

- **Union member / variant not fully sampled (5 cases):** `Unions.union_object_with_discriminator` (skips `{b}` arm), `Unions.union_index_property_with_discriminator` (3 of 5 arms), `LargeObjects.object_union_5` (1 of 5), `LargeObjects.mixed_union_atomic_and_large_objects` (atomic string/number short-circuit never hit), `LargeObjects.large_class_union` (1 of 3 class arms — B/C bigint+Date fields untested). FIX: add one sample per unsampled arm (+ matching `deserializedValues` for the class union).

- **Sample too weak / single value hides the edge (12 cases):** Atomic `number` (no `getBinaryByteSizes` to lock the int8/16/32/float64 width claim), `bigint` (`[1n]` only), `boolean` (`[true]` only), `date` (one `.000Z`, no ms/epoch/invalid, no 8-byte lock); DateTime `date` (same), `zonedDateTime` (UTC-only), `plainTime`/`plainDateTime`/`plainYearMonth`/`plainMonthDay` (single whole-second / no leap-day); Records `index_property_extra`/`index_property_nested`/`index_property_nested_date`/`index_property_non_root` (single-entry, no empty record, union/transform arms not split); Tuples `tuple_with_optional` (optional bigint slot `undefined` in every sample → its transform never runs). FIX: add edge samples / byte-size locks as noted per row.

- **Recursion base case / breadth not exercised (3 cases):** `Objects.interface_circular` (recursive `child` never absent), `Objects.interface_multiple_circular` (`ciRoort` and `ciDate.embedded/.deep` edges never populated — only one circular type actually recurses), `CircularRefs.object_with_circular_array` (single sample recurses once; no absent-`d` base). FIX: add a leaf/absent-child sample and a deeper sample.

- **Claim asserted only in prose (2 cases):** `Objects.non_serializable_class` (description promises a "deserialize-fn registered" reconstruction path that no sample tests — only the unregistered drop runs), `Unions.union_with_non_serializable` (the `(()=>any)` arm's "matches no surviving member" / dropped-vs-throw boundary is never fed a function value, and `factoryThrows` is unset). FIX: either add a sample exercising the claim or trim the description to what runs.

### Cosmetic (not counted against verdicts)

- **Title/key drift on untagged unions:** several `*_with_discriminator` keys/titles in Unions.ts (`with_discriminator`, `union_object_with_discriminator`, `union_mixed_with_discriminator`, `union_index_property_with_discriminator`, `circular_union_with_discriminator`) describe structural unions with NO literal discriminant on the wire. Misleading naming; rename to "structural union" or fix titles.
- **Near-duplicate cases:** Functions `function_with_date_parameters` ≈ `optional_params` (same resolved `[Date, boolean?]` + same data); Iterables `objects_with_nested_sets` b≡c and `objects_with_nested_maps` key1≡key2 carry identical payloads.

### Confirmed CORRECT (highlights)

The drop-vs-throw contract is modeled faithfully everywhere it is exercised: PROPERTY-position non-serializables DROP with `deserializedValues` showing removal (Objects `class`/`non_serializable_class`/`interface_with_methods`, Others `non_serializable_interface`, Unions `union_with_methods`/`union_extra_symbol_prop_drops`); ROOT/propagating non-serializables THROW via `factoryThrows` (Others `non_serializable`/`_array`/`_tuple`/`promise_*`, Arrays `non_serializable_in_array`, Tuples `tuple_with_non_serializable`, Functions `non_serializable_params`/`function_promise_return_type`/`function_return_type_is_function`, Atomic `symbol`/`never`). CircularGuard feeds genuine cycles and asserts `CircularReferenceError` correctly (with proper DAG + disarmed controls). ExtraParams correctly distinguishes raw `getTestData` (extras retained) from cleaned `getTestDataForStringify` (extras stripped) for the strip-vs-preserve pairings, and pairs bigint extras with `jsonStringifyThrows`.
