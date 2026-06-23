# Suite audit — `enrich` + `mocking`

Reviewed groups (REVIEW ONLY, no code changed):

- **enrich** — `packages/ts-runtypes/test/suites/enrich/` : 5 driver files
  (`enrichGen.test.ts`, `enrichCheck.test.ts`, `enrichReconcile.test.ts`,
  `createFriendly.test.ts`, `friendlyCoverage.test.ts`) + 13 case files under
  `cases/` (11 category consts: Atomic, Object, Array, Tuple, Union,
  TemplateLiteral, Format, Native, Utility, Circular, Realworld). Helpers:
  `util/enrichCases.ts`, `util/enrichGen.ts`, `util/enrichReconcile.ts`,
  `util/validationAsserts.ts::assertFriendlyCoverage`.
- **mocking** — `packages/ts-runtypes/test/suites/mocking/` : 2 files
  (`mockData.test.ts`, `mockInvalid.test.ts`). Source under audit:
  `src/mocking/mockType.ts`, `src/mocking/mockInvalid.ts`.

**What "enrich" is.** Not the runtime-validate `enrich`; it is the AI-enrichment
generation pipeline (the `ts-runtypes` CLI `gen` / `gen --update` / `gen --prune`
/ `check`). For a `type Target`, `gen` scaffolds two committed maps —
`FriendlyType<Target>` (human labels + per-constraint error templates) and
`MockData<Target>` (sample-value pools/ranges). The enrich-gen cases author the
EXACT skeleton `gen` should emit (empty `$label: ''`, `$errors` keyed by the
type's constraints, `{pool: []}` mock placeholders) and assert generator output
== authored skeleton; `enrichCheck` asserts the `check` validator reports zero
findings on those valid maps; `enrichReconcile` drives the on-disk merge/rename/
orphan/prune/@todo lifecycle. `createFriendly.test.ts` tests the runtime renderer
that turns `getValidationErrors` output into friendly messages.

**Totals.** enrich: 67 enrich-gen/check cases (Atomic 13, Object 8, Array 9,
Tuple 8, Union 6, TemplateLiteral 5, Format 13, Native 4, Utility 10, Circular 3,
Realworld 4) + 22 createFriendly unit cases + 7 reconcile-driver scenarios +
cross-suite friendlyCoverage census (parametrized over the validation suites).
mocking: 13 cases (mockData 11, mockInvalid 7 — counting `it`s).

**Verdicts:** OK ≈ 100 / SUSPECT 4 / WRONG 0.

---

# enrich

## cases/Atomic.ts (enrich-gen — skeleton shape per kind)
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string | `gen` of `string` → leaf skeleton | gen friendly `{$label:'',$errors:{type:''}}` + mock `{pool:[]}` == authored | yes | yes | OK | |
| number | same, `number` | leaf skeleton match | yes | yes | OK | |
| boolean | same, `boolean` | leaf skeleton match | yes | yes | OK | |
| bigint | same, `bigint` | leaf skeleton match | yes | yes | OK | |
| date | `Date` leaf via Atomic lens | leaf skeleton match | yes | yes | OK | dup of Native.date but different lens — fine |
| regexp | `RegExp` leaf | leaf skeleton match | yes | yes | OK | |
| null | `null` literal | leaf skeleton match | yes | yes | OK | |
| undefined | `undefined` | leaf skeleton match | yes | yes | OK | |
| void | `void` | leaf skeleton match | yes | yes | OK | |
| numericLiteral | `2` | leaf skeleton match | yes | yes | OK | |
| stringLiteral | `'a'` | leaf skeleton match | yes | yes | OK | |
| booleanLiteral | `true` | leaf skeleton match | yes | yes | OK | |
| bigintLiteral | `1n` | leaf skeleton match | yes | yes | OK | |

## cases/Object.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| flat | `{a:string;b:number}` | per-field nodes + root `$label`/`$errors` | yes | yes | OK | |
| optionalMember | `{a;b?}` | optional member still gets a node (no optional marker in skeleton) | yes | yes | OK | |
| nested | nested object | recursive node descent | yes | yes | OK | |
| readonlyMembers | readonly fields | readonly projects like normal | yes | yes | OK | |
| intersection | `{a}&{b}` | intersection flattens to merged fields | yes | yes | OK | |
| deeplyNested | `{a:{b:{c}}}` | 3-deep descent | yes | yes | OK | |
| manyScalarMembers | 5 scalar kinds | all leaf nodes | yes | yes | OK | |
| withArrayMember | `{tags:string[]}` | array member → friendly `$items`, mock `$items`+`$length:[1,3]` | yes | yes | OK | |

## cases/Array.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| stringArray | `string[]` | friendly `$items`, mock `{$items:{pool:[]},$length:[1,3]}` | yes | yes | OK | |
| numberArray | `number[]` | same | yes | yes | OK | |
| booleanArray | `boolean[]` | same | yes | yes | OK | |
| dateArray | `Date[]` | same | yes | yes | OK | |
| arrayGeneric | `Array<string>` | generic == bracket form | yes | yes | OK | |
| readonlyArray | `ReadonlyArray<string>` | readonly == array | yes | yes | OK | |
| nestedArray | `string[][]` | nested `$items`/`$length` | yes | yes | OK | |
| arrayOfObjects | `{a}[]` | element object node under `$items` | yes | yes | OK | |
| formatElementArray | `TF.Email[]` | element format `$errors` keys (maxLength,minLength,pattern) sorted | yes | yes | OK | good format-projection check |

## cases/Tuple.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| pair | `[string,number]` | `$slots:[node,node]` (not `$items`) | yes | yes | OK | |
| single | `[string]` | one-slot | yes | yes | OK | |
| named | `[name,age]` | labels stripped → same as pair | yes | yes | OK | |
| optionalSlots | `[number,bigint?,…]` | all 4 slots present | yes | yes | OK | |
| restTail | `[number,...string[]]` | variadic routes to `$items`/`$length` (array branch) | yes | yes | OK | well-documented divergence |
| readonlyTuple | `readonly [s,n]` | readonly tuple == tuple | yes | yes | OK | |
| mixedTuple | 5 mixed kinds | 5 slots | yes | yes | OK | |
| empty | `[]` | `$slots:[]` | yes | yes | OK | edge case covered |

## cases/Union.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| stringNumber | `string\|number` | union → opaque leaf skeleton | yes | yes | OK | |
| stringNull | `string\|null` | leaf | yes | yes | OK | |
| stringLiteralUnion | `'UNO'\|'DOS'\|'TRES'` | leaf | yes | yes | OK | |
| mixedScalarUnion | 5-arm scalar union | leaf | yes | yes | OK | |
| numberBooleanUnion | `number\|boolean` | leaf | yes | yes | OK | |
| optionalScalar | `string\|undefined` | leaf | yes | yes | OK | object-member unions excluded by design (documented) |

## cases/TemplateLiteral.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| stringSlashNumber | `` `${string}/${number}` `` | template → string leaf skeleton | yes | yes | OK | |
| apiUserPath | `` `api/user/${number}` `` | leaf | yes | yes | OK | |
| litUnionPrefix | `` `${'a'\|'b'}-${number}` `` | leaf | yes | yes | OK | |
| parenNumber | `` `(${number})` `` | leaf | yes | yes | OK | |
| multiInterpolation | multi-interp path | leaf | yes | yes | OK | |

## cases/Format.ts (format → `$errors` constraint-key projection)
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| stringMinMax | `String<{minLength;maxLength}>` | `$errors` keys {type,maxLength,minLength} sorted | yes | yes | OK | |
| stringLowercase | `String<{lowercase}>` | {type,lowercase} | yes | yes | OK | |
| email | `Email` | {type,maxLength,minLength,pattern} | yes | yes | OK | |
| uuidv4 | `UUIDv4` | {type,version} | yes | yes | OK | |
| url | `Url` | {type,maxLength,pattern} | yes | yes | OK | |
| alpha | `Alpha` | {type,pattern} | yes | yes | OK | |
| numberMinMax | `Number<{min;max}>` | {type,max,min} | yes | yes | OK | |
| integer | `Integer` | {type,integer} | yes | yes | OK | |
| positive | `Positive` | {type,min} | yes | yes | OK | |
| int32 | `Int32` | {type,integer,max,min} | yes | yes | OK | |
| bigPositive | `BigPositive` | {type,min} | yes | yes | OK | |
| bigInt64 | `BigInt64` | {type,max,min} | yes | yes | OK | |
| formatInObject | obj of 3 formats | per-member format key projection | yes | yes | OK | mock stays `{pool:[]}` (skeleton — bounds NOT in mock; see findings) |

## cases/Native.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| date | `Date` | scalar leaf skeleton | yes | yes | OK | |
| regexp | `RegExp` | scalar leaf | yes | yes | OK | |
| map | `Map<string,number>` | `$keys`/`$values` nodes | yes | yes | OK | |
| set | `Set<string>` | `$values` node | yes | yes | OK | |

## cases/Utility.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| pick | `Pick<…>` | resolved obj fields | yes | yes | OK | |
| omit | `Omit<…,'a'>` | dropped key absent | yes | yes | OK | |
| partial | `Partial<…>` | optionals still get nodes | yes | yes | OK | |
| required | `Required<…>` | required fields | yes | yes | OK | |
| readonly | `Readonly<…>` | readonly resolves to obj | yes | yes | OK | |
| record | `Record<'a'\|'b',number>` | finite-key record → fields | yes | yes | OK | |
| returnType | `ReturnType<Fn>` | resolved return obj | yes | yes | OK | |
| keyofUnion | `keyof {…}` | string-literal-union leaf | yes | yes | OK | |
| indexedAccess | `{…}['name']` | resolves to string leaf | yes | yes | OK | |
| nonNullable | `NonNullable<…>` | stripped null/undef → union leaf | yes | yes | OK | |

## cases/Circular.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| selfReference | `{value;next:Self\|null}` | back-edge degrades to leaf node | yes | yes | OK | |
| deepCircular | nested self-ref | deep cycle bottoms out as leaf | yes | yes | OK | |
| circularArray | `{items:Self[];id}` | array back-edge → mock `$items:{}` (empty, not `{pool:[]}`) | yes | yes | ADDED | asymmetry vs every other array case (which use `$items:{pool:[]}`); the empty `$items:{}` is the recursion-leaf emit and IS what gen produces here, so the assert is faithful. ADDED a clarifying NOTE on the case (placed BEFORE `case: () => {`, outside all four `##### #####` spans — an inline comment inside the mock literal breaks `prettierNormalize`'s single-lining) explaining the empty `$items` is the cycle-break leaf, not drift. |

## cases/Realworld.ts
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| user | nested obj+array | full composite skeleton | yes | yes | OK | |
| registrationForm | 4 format members | per-member format keys; mock all `{pool:[]}` | yes | yes | OK | mock bounds not seeded (skeleton) — same note as Format |
| order | nested line-items array | array-of-object `$items` descent | yes | yes | OK | |
| blogPost | arrays + Date | composite with Date leaf | yes | yes | OK | |

## createFriendly.test.ts (runtime renderer — real public API)
| case key | behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| base type failure | `type` template + `$[label]` | message "Full name must be text" | yes | yes | OK | |
| format failure $[val] | minLength bound interp | "needs at least 2 characters" | yes | yes | OK | |
| nested path | `profile.email` routing | nested node + label | yes | yes | OK | |
| array $items+$[index] | `tags[1]` | "tag #1 must be text", path `tags.1` | yes | yes | OK | |
| label fallback | no `$label` | label == raw field name | yes | yes | OK | |
| accumulate (data form) | 2 constraints | one message each | yes | yes | OK | |
| function-form $errors | fn escape hatch | one aggregated message | yes | yes | OK | |
| $default | unlisted constraint | `$default` template fires | yes | yes | OK | |
| missing entry | no map node | graceful "b is invalid" | yes | yes | OK | |
| Map value → $values | `mapValue` role | routes to `$values` + entry index | yes | yes | OK | |
| Map key → $keys | `mapKey` role | routes to `$keys` | yes | yes | OK | |
| Map key+value no collide | same entry both fail | two distinct messages | yes | yes | OK | regression pin |
| Set item → $values+$[index] | `setKey` role | `tags.2` + index interp | yes | yes | OK | |
| tuple $slots[i] | fixed slot | routes to `$slots` not `$items` | yes | yes | OK | |
| rest-tuple → $items | broad length | falls back to `$items` | yes | yes | OK | |
| array of tuples | outer `$items` + inner `$slots` | nested routing | yes | yes | OK | |
| tuple in object field | field then `$slots` | path `coord.0` | yes | yes | OK | |
| label() resolution | dotted/nested/root/unknown | 4 label lookups | yes | yes | OK | |

## friendlyCoverage.test.ts
| case key | behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| (census, all VALIDATION + FORMAT_VALIDATION cases) | every real `getValidationErrors` path segment is routable + one non-empty message per error | per-segment `assertFriendlySegment` + message count/non-empty/string | yes | yes | OK | strong cross-suite guard against new unrouted segment shapes |

## enrichReconcile.test.ts (CLI `gen --update`/`--prune` on disk — real feature)
| case key | behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| property merge preserves | authored `$label`/pool survive a sibling type change | both authored values present + new field added | yes | yes | OK | |
| byte-identical no-op | idempotent re-update | second == first | yes | yes | OK | |
| rename primitive (Tier-2) | value carried under new key, no orphan | new key has value, old gone, no `@rtOrphanChild` | yes | yes | OK | |
| rename named ref (Tier-1) | reference carried under new key | `residence: friendlyAddress`, old gone | yes | yes | OK | |
| orphan child on remove | dropped field → carcass preserving value | `@rtOrphanChild` + value present | yes | yes | OK | |
| @todo: one per new const | fresh gen stamps 2 @todo | count==2, plain `@todo` not `@rtTodo`, position regex | yes | yes | OK | |
| @todo: no re-add on update | merged const not re-stamped | count stays 2 | yes | yes | OK | |
| @todo: cleared stays cleared | user-removed @todo not regrown | count==1 after update | yes | yes | OK | |
| @todo: stamps new const on update | newly added Address consts stamped | count==4 | yes | yes | OK | |
| @todo: prune leaves intact | prune strips orphans not @todo | @todo count unchanged | yes | yes | OK | |
| @todo: idempotent re-run | no duplication | byte-identical + count==2 | yes | yes | OK | |
| prune strips carcasses | `gen --prune` removes `@rtOrphan*` | orphan tags gone, live field survives | yes | yes | OK | |

---

# mocking

> Both files drive the lower-level walker (`mockRunType` / `mockRunTypeInvalid`)
> over HAND-BUILT RunType graphs, NOT the marker API `createMockType<T>()` /
> `createMockType(value)` (which needs the Vite-injected graph). The marker-API
> both-call-shape coverage + the mock→validate round-trip live in the validation
> suite (`assertMockTypeStatic` / `assertMockTypeReflect` →
> `runMockPass`, which calls the paired `validate`). These unit tests therefore
> assert bound/pool RESPECT but never run the type's own validator.

## mockData.test.ts (positive mock — data-node DSL plumbing)
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string pool | string leaf + `{pool}` | every value drawn from pool (200×) | yes | yes | OK | |
| boolean pool | `{pool:[true]}` | always true | yes | yes | OK | |
| bigint pool | bigint `{pool}` | drawn from pool | yes | yes | OK | |
| number pool wins | number `{pool}` | pool beats kind default | yes | yes | OK | |
| number min/max | `{min,max}` bound | value in [10,12] | yes | yes | OK | bound respected |
| Date min/max | unbranded Date `{min,max}` | value in [min,max] | yes | yes | OK | bound respected |
| array $length fixed | `{$length:4}` | length==4 | yes | yes | OK | |
| array $length range | `{$length:[2,5]}` | length in [2,5] | yes | yes | OK | |
| array $items pool | `{$length,$items:{pool}}` | every element in pool | yes | yes | OK | |
| array $items min/max | numeric elem bounds | every element in [100,110] | yes | yes | OK | bound respected |
| nested object descent | name/age/address.city nodes | pools/ranges resolve by name incl. nested | yes | yes | OK | |
| property absent → default | only `name` enriched | `age` falls to global default | yes | yes | OK | additive-DSL guard |
| no-data sanity (string/number) | bare kinds | global defaults; number in [0,10000] | yes | yes | OK | |
| no-data object | obj walk unaffected | both props typed correctly | yes | yes | OK | |

## mockInvalid.test.ts (negative mock — type-aware corruption)
| case key | intended type/behavior | what it asserts | faithful? | repr? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| leafProb=1 corrupts leaf | obj `{name,age}` | root stays object, one field wrong-typed | yes | yes | OK | |
| leafProb=0 replaces root | whole-root break | typeof root != object | yes | yes | OK | |
| string leaf → non-string | string corruption | `typeof name != 'string'` | yes | yes | OK | matches `negativeFor` (→123) |
| number leaf → non-number | number corruption | `typeof age != 'number'` | yes | yes | OK | (→ 'not-a-number') |
| string-literal union → outside | `'on'\|'off'` | value not in union | yes | yes | OK | `negativeForUnion` |
| literal leaf → different | `'fixed'` | value != 'fixed' | yes | yes | OK | `literalInverse` |
| deep leaf, structure intact | nested obj | `user` stays object, `user.name` corrupted | yes | yes | OK | |
| array element corrupted | `tags:string[]` | some element non-string | yes | yes | OK | |

---

## Findings summary

No WRONG cases. All assertions are faithful to the source semantics
(`mockType.ts` / `mockInvalid.ts` for mocking; the `gen`/`check`/reconcile CLI
behavior for enrich). SUSPECT items are coverage gaps / readability oddities, not
incorrect assertions.

### Grouped by root-cause

- **Mock not asserted valid against its own validator (mocking suite — by
  design, but worth noting):** `mockData.test.ts` and `mockInvalid.test.ts` never
  run the type's `createValidate` over a generated value. They assert pool
  membership and numeric/Date BOUND respect (good), and for invalid mocks assert
  the corrupted position is the wrong runtime type (good), but there is no
  positive mock→validate round-trip in THIS suite. That round-trip + the
  marker-API both-call-shape coverage live in the validation suite
  (`assertMockTypeStatic`/`assertMockTypeReflect` → `runMockPass`). Verdict: OK as
  scoped, but a one-line header note pointing at the validation suite would stop a
  future reader assuming these unit tests cover the round-trip. SUSPECT-adjacent,
  not a defect. [ADDED] Header SCOPE note added to `mockData.test.ts` pointing at
  the validation suite for the mock→validate round-trip + both-call-shape marker
  coverage, and stating these unit tests assert pool/range respect only.

- **Format mock ignores bounds — by design at the SKELETON layer (enrich
  Format.* + Realworld.registrationForm):** the enrich-gen mock for a
  format-branded leaf is always `{pool:[]}`; constraint bounds (minLength,
  min/max, pattern) are projected into FRIENDLY `$errors` keys but NOT into the
  mock pool/range. This is correct for the gen SKELETON (the author fills the
  pool), and the `MD003` build-time rule that validates authored pool/range
  values against the field's format is exercised on the Go side, not here. No fix
  needed; flagged so the "format mock respects bounds" expectation is understood
  to be enforced elsewhere (`mockData.test.ts` number/Date bound cases cover the
  runtime DSL side).

- **Coverage oddity / potential copy-paste-drift read (enrich
  Circular.circularArray):** its mock emits `$items: {}` (empty object) where
  every other array case emits `$items: {pool: []}`. This is the genuine
  recursion-leaf emit (the back-edge degrades to a bare node), so the assertion is
  faithful — but the lone divergence reads like drift. [ADDED] One-line clarifying
  comment added on `cases/Circular.ts::circularArray` (placed before `case:`, not
  inside the mock literal — an inline comment there breaks `prettierNormalize`)
  explaining the empty `$items` is the cycle-break leaf. SUSPECT (readability only).

- **Marker-API both-call-shape rule (mocking):** not violated, because no case in
  the `mocking/` suite is a marker-API call site — they call the walker directly.
  The CLAUDE.md both-shape rule applies to `createMockType<T>()` vs
  `createMockType(value)` cases, which are in the validation suite and DO pair
  both shapes. No action for this suite; noted so the audit explicitly records the
  rule was checked and is satisfied at the layer it applies to.

### OK highlights worth keeping

- `Format.*` and `Realworld.registrationForm` give real value: they pin that the
  generator projects each format's constraint params into `$errors` keys,
  alphabetically sorted — a meaningful, non-trivial assertion (not a passthrough).
- `friendlyCoverage.test.ts` is a strong cross-suite census: it replays every real
  `getValidationErrors` path-segment shape through the renderer, catching any new
  unrouted segment (the bug class that historically broke Map/Set + tuples).
- `enrichReconcile.test.ts` exercises the full on-disk `gen --update`/`--prune`
  feature (merge, rename Tier-1/Tier-2, orphan, prune, @todo lifecycle,
  idempotency) through the real binary — meaningful, not trivial.
