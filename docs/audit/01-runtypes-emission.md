# 01 — runTypes emission (reflection AST cache): mion vs ts-go-run-types port audit

> Date: 2026-05-29 · Method: static source comparison. Go + JS tests **counted, not executed** (no build/run per audit rules).

## 1. Verdict

⚠️ **Ported with gaps (mostly by-design).** ts-go-run-types projects every `*checker.Type` into a `protocol.RunType` discriminated union that mirrors mion's deepkit-derived `RunType`/`ReflectionKind` model, deduped by a Go port of mion's `_createTypeId` (`internal/compiled/runtype/typeid/typeid.go`). All reflection kinds a downstream RT consumer actually needs for the serialisable-data contract are covered (atomic / literal / objectLiteral / class / union / intersection-collapsed / tuple / array / templateLiteral / function / method / property / parameter / indexSignature / callSignature / enum / promise / Map / Set / regexp). The divergences are overwhelmingly deliberate: live-JS-value fields (`function`, `classType`, `enum`, non-literal `default`, `TypeInfer.set`) are never captured, and `infer` / standalone `rest` / standalone `enumMember` / `typeParameter` are eagerly resolved by tsgo before projection (and `enumMember` is a throwing stub even in mion). The only items worth flagging as latent risk are: `inlined`/`isCircular`/`brand`/`description` declared in the protocol but **never populated**, and the `KindObjectLiteral`↔`KindObject` numbering swap which is correct but fragile.

## 2. Scope & sources

**mion (ORIGINAL)**
- `packages/run-types/src/types.ts` — `RunType` interface, `SrcType`, `RunTypeFamily`, `FormatAnnotation` (lines 26–183).
- `packages/run-types/src/constants.kind.ts` — `ReflectionKindName` (0–35, re-exporting deepkit's `ReflectionKind`), `ReflectionSubKind` (date/map/set/nonSerializable/params/mapKey/mapValue/setItem), `getReflectionName`.
- `packages/run-types/src/createRunType.ts` — per-kind node dispatch (`createRunType` switch, lines 156–298; `initClassRunType` 304–322).
- `packages/run-types/src/lib/typeId.ts` — `_createTypeId` structural-id algorithm.
- `packages/run-types/src/lib/baseRunTypes.ts` — `isCircular`, `isJitInlined` (57–61), `getTypeID`, `checkIsCircularAndGetRefId`.
- Deepkit `Type` field shapes inferred from mion's node files + typeId.ts field reads (the `@deepkit/type` `.d.ts` is a peer dep not present on disk; `constants.kind.ts` is the authoritative kind enumeration for this audit).

**ts-go-run-types (PORT)**
- `internal/protocol/protocol.go` — `RunType` struct (all fields, 84–260), `ReflectionKind`/`Kind*` (34–75), `KindRef=-1`, `ClassRef`, `FormatAnnotation`, `Dump`.
- `internal/protocol/subkind.go` — `ReflectionSubKind` + `NonSerializableGlobals`.
- `internal/compiled/runtype/serialize.go` — `*checker.Type` → `RunType` projection, pointer+structural dedup (`assignID` 423–462), cycle slot-reservation (455–457).
- `internal/compiled/runtype/module.go` — JSON dump + self-wired TS renderer (footer ref-knotting, bigint/symbol/regexp/classType specials).
- `internal/compiled/runtype/{heritage,modifiers,intersection_collapse,safename,union_safeorder}.go`.
- `internal/compiled/runtype/typeid/{typeid,intersection_collapse,formats}.go` — structural id + format annotation folding.
- JS consumers: `packages/ts-go-run-types/src/runtypes/types.ts` (`RunType` shape), `src/runTypeKind.ts` (generated kind mirror), `src/caches/runTypesCache.ts` (19-arg `rt(...)` skeleton), `src/runtypes/rtUtils.ts`.

**Cache tag / API:** `runType` (per overview §"Cache-tag ↔ family map"). Public surface: `virtual:runtypes-cache` module body (`RunTypeCacheSource`) + `runtypes-cache.json` `Dump`; consumed by every downstream RT family via `rtUtils.useRunType(id)`.

## 3. Per-kind / per-feature comparison

### 3a. Reflection kinds

mion kind numbering (deepkit, `constants.kind.ts`) and ts-go numbering (`protocol.go` / `runTypeKind.ts`) **agree on all 0–35**, including mion's deliberate name swaps: `4 = objectLiteral` (deepkit's "object" renamed) and `30 = objectLiteral`-on-deepkit renamed to "object". ts-go reproduces both: `KindObject=4`, `KindObjectLiteral=30` (`protocol.go:39,65`), and `runTypeKind.ts:27,54` carries the same `object:4` / `objectLiteral:30`.

| Kind (#) | mion behaviour | ts-go-run-types behaviour | Match? | Notes |
|---|---|---|---|---|
| never(0) any(1) unknown(2) void(3) | atomic nodes | `KindNever/Any/Unknown/Void`; nil type → `internEmpty(KindUnknown)` | ✅ | serialize.go:509–519, 425 |
| object(4) | bare `object` primitive | `TypeFlagsNonPrimitive` → `KindObject` | ✅ | serialize.go:610–612 |
| string(5) number(6) boolean(7) symbol(8) bigint(9) | atomic | direct flag arms | ✅ | serialize.go:560–573 |
| null(10) undefined(11) | atomic | direct | ✅ | serialize.go:521–525 |
| regexp(12) | `RegexpRunType` | `RegExp` symbol → `KindRegexp` + `ClassRef{Builtin:"RegExp"}` | ✅ | serialize.go:751–753 |
| literal(13) | string/number/bool/bigint/unique-symbol; `literal` value | same; bigint→string+`flags:["bigint"]`, symbol→`{symbol:desc}`+`flags:["symbol"]` | ✅ | serialize.go:527–558; module.go footer rehydrates |
| templateLiteral(14) | open-form spans → regex | `{templateLiteral:{texts,placeholders}}` on `Literal`; spans = literal/number/string/bigint/any/unknown | ✅ | serialize.go:645–712 |
| property(15) propertySignature(32) | member, `type`/optional/readonly/visibility | `KindProperty`(class)/`KindPropertySignature`(iface); `Child` (undefined-stripped when optional) | ✅ | serialize.go:1075–1132 |
| method(16) methodSignature(33) | member w/ signature | property w/ single call-sig + no members → `KindMethod`/`KindMethodSignature` | ✅ | serialize.go:1096–1103 |
| function(17) | `TypeFunction` | bare callable, no own props → `KindFunction`; `parameters`+`return` | ✅ (structural) | `function` JS value never emitted — §5#1 by-design |
| parameter(18) | member of param list | `KindParameter` + `position`+`optional`+`rest` flag+`defaultVal`; also synthetic Map/Set arg wrappers w/ subKinds | ✅ | serialize.go:1134–1171; 939–990 |
| promise(19) | `PromiseRunType` | `Promise` symbol + typeArg → `KindPromise`, `Child` | ✅ | serialize.go:744–750 |
| class(20) | `ClassRunType`/Date/Map/Set/nonSerializable | `KindClass` + `ClassRef` + subKind + `arguments`/`extendsArguments`/`implements`; statics appended | ✅ | serialize.go:862–931 |
| typeParameter(21) | **throws** "not implemented" | not projected (tsgo resolves generics before projection) | ⚠️ | §5#6 by-design; parity — mion errors too |
| enum(22) | `EnumRunType`; `enum`/`values`/`indexType` | `KindEnum` + `enumVal` map + `values` + synthetic `indexType` (string/number/union) | ✅ | serialize.go:1177–1212 |
| union(23) | `UnionRunType`; discriminator passes | `KindUnion` + `children` + `safeUnionChildren` + `unionDiscriminators` | ✅ | serialize.go:596–603; union_safeorder.go |
| intersection(24) | `IntersectionRunType` (live node) | **collapsed in Go** to primitive+`decorators` / objectLiteral / never | ⚠️ | §4 — consumers never see raw `KindIntersection` |
| array(25) | `ArrayRunType` | array-like + typeArg → `KindArray`, `Child` | ✅ | serialize.go:733–740 |
| tuple(26) tupleMember(27) | `TupleRunType`/`TupleMemberRunType` | `KindTuple` + `children` of `KindTupleMember` (position/optional/rest/variadic/label name) | ✅ | serialize.go:782–837 |
| enumMember(28) standalone | `EnumMemberRunType` — **throws "not supported"** (stub) | not projected (folded into `enum.values`; `enumLiteral` → enum + `flags:["enumMember:<n>"]`) | ✅ | §5#7 — parity: mion node is a non-functional stub (enumMember.ts) |
| rest(29) standalone | `RestParamsRunType` | folded to `flags:["rest"]` on tupleMember / parameter, no standalone `KindRest` node | ⚠️ | §5#5 by-design |
| indexSignature(31) | `IndexSignatureRunType`; `index`/`type` | `KindIndexSignature` + `Index` (key) + `Child` (value) + readonly | ✅ | serialize.go:1039–1058 |
| infer(34) | **throws** "not supported" | reserved in enum, never projected (tsgo resolves conditionals) | ✅ | §5#4 — parity: mion errors too |
| callSignature(35) | `CallSignatureRunType` | `KindCallSignature` child on object literals | ✅ | serialize.go:1059–1072 |
| **SubKinds** date/map/set/nonSerializable/mapKey/mapValue/setItem | numeric subkinds on class/param | mirrored exactly (subkind.go); `params`(1701) deliberately **not** mirrored | ✅ | params wrapper is a deepkit-iteration artifact mion only needs because it lacks a `parameters` slot |

### 3b. Carried-field coverage

| Field | mion source | ts-go protocol | Populated? | Notes |
|---|---|---|---|---|
| `id` | runtime `getTypeID()` (`StrNumber`) | `ID` (hash of structural id) | ✅ always | protocol.go:88 |
| `kind` / `subKind` | `kind` / `subKind` | `Kind` / `SubKind` | ✅ | protocol.go:89,95 |
| `typeName` | `typeName` | `TypeName` | ✅ alias/symbol name | serialize.go:498–499, 867, 1180 |
| `typeArguments` | `typeArguments` | `TypeArguments` | ✅ on aliased generics | serialize.go:500–505 |
| `optional` / `readonly` | `optional` / `readonly` | `Optional` / `Readonly` | ✅ | serialize.go:1090; modifiers.go |
| `isAbstract` / `isStatic` / `visibility` | `abstract`/`static`/`visibility` | `IsAbstract`/`IsStatic`/`Visibility` | ✅ class members | modifiers.go:61–77 |
| `inlined` | derived (`isJitInlined`) | `Inlined` | ❌ **never set** | §5#2 — declared, no writer |
| `isCircular` | `BaseRunType.isCircular` | `IsCircular` | ❌ **never set** | §5#3 — comment at protocol.go:107–119 admits serializer doesn't auto-set |
| `flags` | (no direct mion equiv) | `Flags` | ✅ | bigint/symbol/regexp/rest/variadic/nonLiteralDefault/enumMember markers |
| `description` | JSDoc (deepkit `description`) | `Description` | ❌ **never set** ("v2") | §5#8 |
| `defaultVal` / default | `default: () => any` | `DefaultVal` (literal only) | ⚠️ partial | non-literal → `flags:["nonLiteralDefault"]` (modifiers.go:84–104); §4 |
| `classRef` | `classType` (live ctor) | `ClassRef{Builtin|Name|Module}` | ✅ builtin only | user-class `Module` never wired (§4); `Name` recorded |
| `literal` | `literal` | `Literal` | ✅ | incl. bigint/symbol/regexp/templateLiteral encodings |
| `enumVal` / `values` / `indexType` | `enum` / `values` / `indexType` | `EnumVal` / `Values` / `IndexT` | ✅ | serialize.go:1187–1209 |
| `parameters` / `return` | `parameters` / `return` | `Parameters` / `Return` | ✅ | serialize.go:1134–1171 |
| `children` | `types` | `Children` | ✅ | union/intersection-merged/tuple/objectLiteral/class |
| `index` / `child` | `index` / `type` | `Index` / `Child` | ✅ | protocol.go:171–174 |
| `unionDiscriminators` | `FlattenedProp[]` | `UnionDiscriminators` (ref-only) | ✅ minimal | §4 — strictly-new field only |
| `safeUnionChildren` | sort output (transient) | `SafeUnionChildren` | ✅ | union_safeorder.go:38 |
| `decorators` | `decorators` | `TypeMeta` | ✅ brand objects | format brands lifted out → `FormatAnnotation` |
| `formatAnnotation` | `FormatAnnotation` | `FormatAnnotation{Name,Params}` | ✅ | folded into structural id (typeid/formats.go:379) |
| `extendsArguments`/`implements`/`arguments`/`extends` | deepkit class fields + iface extends | same names | ✅ | serialize.go:908–921, 855–858; heritage.go |
| `isSafeName` | `isSafeName` helper | `IsSafeName` | ✅ | safename.go (regex, minus mion's numeric-key short-circuit) |
| `position` | property index | `Position` (*int) | ✅ param/tupleMember | protocol.go:156 |
| `brand` (number) | `TypeNumber.brand` | `Brand` (*int) | ❌ **never set** ("v1: never set") | §5#9 — number brand subtypes out of scope |
| `parent` back-ref | `parent` | — | ⚠️ **not emitted** | §4 — singleton nodes can't carry parent |

### 3c. Structural-id / dedup parity vs `_createTypeId`

| Aspect | mion `lib/typeId.ts` | ts-go `typeid/typeid.go` | Match? |
|---|---|---|---|
| Atomic id = `String(kind)` | yes (40–62) | yes (130–137) | ✅ |
| Literal = `${kind}:${value}` | 63–66 | 116 (`:` + literalString) | ✅ |
| Collection = `${kind}{c1,c2}` / tuple `[...]` | 105–116 | `collectionID` (488–493) | ✅ |
| Member = `${name}${opt?}:${childId}` | 118–134 | `memberID` (495–497) + `readonlyBit` | ✅ (+readonly, see below) |
| Function/method/callSig = signature shape | 136–148 | `signatureID` (359–372) | ✅ |
| Class Date/Map/Set → subKind id | `computeClassTypeId` (150–178) | objectID Date/Map/Set arms (226–249) | ✅ |
| Cycle ref token `$<kind>_<i><name>` | `checkCircularAndGetRefId` (192–202) | `cycleRef` (66–84) | ⚠️ enhanced |
| `subKind || kind` numeric prefix | yes | yes (`collectionID(int)`) | ✅ |
| Format id appended | `computeDeepkitFormatID` (205–225) | `FormatAnnotationStructuralKey` folded in intersection collapse (typeid/formats.go:379, intersection_collapse.go:92) | ✅ |
| **enum id** | bare `String(kind)` (collides!) | `KindEnum:<typeName>,<member=value…>` | ⚠️ **deliberately stricter** (typeid.go:139–147) |
| **readonly in member id** | not present in `_createTypeId` | `#ro` suffix added | ⚠️ **deliberately stricter** (typeid.go:349) |

Two intentional divergences (enum disambiguation, readonly suffix, and the cycle-ref `declarationPosToken` fallback at typeid.go:93–105) are **correct adaptations to AOT/project-global dedup**: mion gets a fresh `Type` object per call so collisions can't happen at runtime, but a project-global cache must distinguish `{readonly a}` from `{a}` and `enum A` from `enum B`. Documented in-code (typeid.go:139–144, 304–311, 72–83). These are improvements, not gaps.

## 4. Intentional deviations (by design)

1. **Intersections collapsed in Go** — `KindIntersection`(24) never reaches the wire. `internal/compiled/runtype/intersection_collapse.go` reduces `string & {__brand}` → primitive + `TypeMeta`, object×object → merged `KindObjectLiteral`, incompatible → `KindNever`. Mion keeps a live `IntersectionRunType`. Rationale: tsgo already eagerly collapses most intersections, and `GetTypeArguments` crashes on intersection types (collapse comment lines 116–121). Structural-id side mirrored (`typeid/intersection_collapse.go`).

2. **Live-JS-value fields never captured** (`docs/ROADMAP.md:37–44`, verified): `TypeFunction.function`, `TypeClass.classType`, `TypeEnum.enum`, non-literal `default`, `TypeInfer.set`, `RTContainer`. Structural shape (signature, members, `values`) is emitted instead. For builtins, `ClassRef.Builtin` lets the footer wire `t.classType = globalThis.<Name>` (module.go:280–282) with zero runtime imports; **user-class constructor wiring is explicitly not planned** (ROADMAP:40) — `ClassRef.Name`/`Module` are recorded but the footer never emits an import for them.

3. **`parent` back-reference not emitted** — canonical nodes are shared singletons (one per structural id), so a stored `parent` is wrong for any node under >1 parent (`CLAUDE.md` "Never store parent-relative data"; ROADMAP:102). Consumers rebuild parent links while walking from a root.

4. **`unionDiscriminators` carries only the strictly-new field** (a ref to the discriminator property), parallel to `safeUnionChildren`; mion's full `FlattenedProp` (`unionItem`/`unionIndex`/`typeID`/`compiledName`) is reconstructible from surrounding wire data (ROADMAP:108–125; protocol.go:186–205). Both detection passes (shared-name + unique-prop) ported to `union_safeorder.go`, scoped to the parent union.

5. **JSON-lossy literal encodings** (all rehydrated in the `.ts` footer, ROADMAP:97–106): bigint → decimal string + `flags:["bigint"]` → `BigInt(...)`; symbol → `{symbol:desc}` + `flags:["symbol"]` → `Symbol(desc)` (identity not preserved); regexp literal → `{regexp:{source,flags}}` → `/source/flags`; symbol-keyed prop names → synthetic `@@<name>` + `flags:["symbol"]`. module.go:284–314 / footerLiteralExpr.

6. **`params` subKind (1701) not mirrored** — a deepkit-iteration artifact; ts-go carries `parameters` directly on the function node (subkind.go:12–17).

## 5. Gaps, mismatches & missed optimisations

1. **`TypeFunction.function` not emitted.** Sev **Low** (by-design ⚠️). Evidence: ROADMAP:39; serialize.go projects only `parameters`+`return` (1134–1171). Impact: validators/serializers can't *call* the function — irrelevant to structural validation, which is the contract. Fix: none (permanent).

2. **`Inlined` declared but never populated.** Sev **Low** (latent ❌). Evidence: `grep '.Inlined ='` over `internal/compiled/runtype` + `internal/resolver` → **0 hits**; field at protocol.go:106; ROADMAP:63 ("already in the protocol, just not populated"). Impact: today the RT compiler treats every composite as non-inlined by default (`typefns/inlining.go`, per protocol.go:111–118), so anonymous non-circular composites get their own factory — slightly less optimal codegen, not a correctness bug. Fix: derive `inlined: true` from "no alias symbol" as ROADMAP suggests.

3. **`IsCircular` never auto-set by the serializer.** Sev **Low–Med** (latent ❌). Evidence: `grep '.IsCircular ='` → **0 hits**; protocol.go:107–119 explicitly admits "The serializer does NOT yet auto-set this field." Impact: circular types still work end-to-end because composites are non-inlined by default (same mechanism as #2); the field is dead until a circular-detection pass lands. Note: the *structural-id* cycle handling IS implemented (typeid.go `cycleRef`), so dedup/cache-key correctness is unaffected — only the inlining hint is missing. Fix: flip the inlining predicate to "inline unless circular" once a detection pass sets the flag.

4. **`infer`(34) not projected.** Sev **Low** (by-design ⚠️). Evidence: ROADMAP:93; not in serialize switch; mion *throws* on it (createRunType.ts:273–276). Impact: none — tsgo resolves conditional types before projection; would only matter for a hypothetical "unresolved form" op. **Parity** (mion has no working support either).

5. **Standalone `rest`(29) Type variant not projected.** Sev **Low** (by-design ⚠️). Evidence: ROADMAP:94; rest folded into `flags:["rest"]` on tupleMember (serialize.go:817–819) and parameter (1146–1148). Impact: a consumer wanting a dedicated `TypeRest` node sees a flagged member instead; the rest semantics (variadic element type) are still present via the member's `Child`. Fix: emit `KindRest` wrapper when a consumer needs it.

6. **`typeParameter`(21) not projected.** Sev **Low** (by-design ⚠️). Evidence: not in serialize switch; mion *throws* "TypeParameter not implemented" (createRunType.ts:285–290). Impact: none — generics are resolved/instantiated by tsgo before projection. **Parity.**

7. **Standalone `enumMember`(28) nodes not projected.** Sev **Low** (by-design ⚠️). Evidence: ROADMAP:95; values folded into `enum.values`/`enumVal`; `enumLiteral` tagged `flags:["enumMember:<name>"]` (serialize.go:578–584). Impact: none for validation. **Parity** — mion's `EnumMemberRunType` is a stub whose every emit method throws "not supported" (nodes/atomic/enumMember.ts).

8. **`Description` (JSDoc) never set.** Sev **Low** (❌, marked "v2"). Evidence: protocol.go:258–259 "v2"; `grep '.Description ='` → 0 hits. Impact: JSDoc comments unavailable to consumers (e.g. OpenAPI generation, error messages). Deepkit/mion carry `description`. Fix: read leading JSDoc off the declaration node.

9. **`Brand` (number brand subtype) never set.** Sev **Low** (by-design ⚠️). Evidence: protocol.go:124–125 "v1: never set"; ROADMAP:88 lists number brands (`int`/`uint8`/`Range`) as out-of-scope for isType, tracked for the constraints library. Impact: branded numbers validate as plain `number`. Fix: deferred to the validation-constraints library.

10. **`originTypes` / `indexAccessOrigin` not projected.** Sev **Low** (❌, planned). Evidence: ROADMAP:64–65; `grep originTypes|indexAccessOrigin` → 0 hits in serialize/typeid. mion's `createRunTypes` walks both (createRunType.ts:106–129). Impact: alias-unwrapping provenance and `T["key"]` origin tracking unavailable — not needed by the current RT families. Fix: walk the alias chain / handle `TypeFlagsIndexedAccess` when needed.

**Not a gap (verified parity):** the `KindObjectLiteral`/`KindObject` name swap is reproduced correctly (protocol.go:39,65; runTypeKind.ts:27,54); SubKind numeric values match byte-for-byte (subkind.go vs constants.kind.ts:51–62); `NonSerializableGlobals` mirrors mion's list (subkind.go:39–70).

## 6. Test-coverage comparison

> Counts are **registration counts, counted not executed** (audit rule). JS suites under `packages/vite-plugin-runtypes/test/` use a custom `runTest(label, sources, assert)` harness (not bare `it()`), so `runTest(` occurrences are the case count.

**Go — projection / reflection / structural-id (counted):**
- `internal/resolver/*_test.go`: **261** `func Test*` across 20 files. Most relevant to emission: `atomic_test.go` (77), `intersection_collapse_test.go` (22), `union_safeorder_test.go` (19), `collection_test.go` (12), `circular_test.go` (12), `extends_test.go` (13), `member_test.go` (8), `function_test.go` (11), `modifier_utilities_test.go` (11), `implements_test.go` (5), `intersection_typeid_test.go` (4), `resolveid_test.go` (4), `format_param_validation_test.go` (4). `inline_test.go` has **0** top-level `Test*` (only helper funcs `setupInline`/`resolveInline`) — exercised indirectly.
- `internal/compiled/runtype/*_test.go` (+ `typeid/`): **32** `func Test*` — `module_test.go` (12, renderer/footer), `typeid/formats_test.go` (8), `typeid/formats_regexp_test.go` (5), `typeid/structural_test.go` (4), `version_test.go` (3).

**JS (counted):**
- `packages/ts-go-run-types/test/runtypes.test.ts`: **4** `it()` — only the marker-helper runtime backstop (`getRunTypeId`/`reflectRunTypeId` throw + injected-id round-trip, paired static/reflect per CLAUDE.md). **Does not assert reflection-AST shape directly.**
- `packages/vite-plugin-runtypes/test/*.test.ts`: **188** `runTest(` total. Emission-relevant: atomic (53), wrapping (17), intersection (16), union (14), circular (12), rewrite (11), functions (11), modifier-utilities (11), collections (8), members (8), extends (10), intersection-modifiers (10), implements (6), scope-bounded (1). Diagnostics/HMR suites use `it()` (cache-disk 3, runtype-diagnostics 3).
- `packages/vite-plugin-runtypes/test/collections.test.ts` directly asserts the *emitted* `RunType` shape fields this audit covers — `kind`, `readonly`, `isSafeName`, `optional`, `position` — proving end-to-end field round-trip through the cache module.

**mion specs with no direct ts-go counterpart:** mion has per-node `.spec.ts` for every node category (atomic/collection/member/function/native — ~40 spec files). ts-go does not replicate node-level unit specs for the *reflection model itself* (it has no per-node classes); coverage is end-to-end (resolver projection tests + vite round-trip) plus structural-id unit tests. The reflection shape has **no dedicated JS shape-assertion suite** beyond the collection/atomic round-trips — see follow-up #1.

**Skipped/TODO:** none found marked `.skip`/`it.todo` in the emission path. ROADMAP marks `infer`/standalone-`rest`/standalone-`enumMember`/`inlined`/`isCircular`/`description`/`brand` as pending (see §5) — these are unimplemented, not skipped tests. **Unverified:** exact executed pass/fail (tests not run per rule); ROADMAP:16 claims "201/201" plugin tests but that figure is **unverified** here.

## 7. Recommended follow-ups

Prioritised:

1. **(Med) Add a dedicated reflection-AST shape suite** asserting `runTypesCache` entries for representative kinds (literal-bigint/symbol/regexp footer rehydration, union `safeUnionChildren`+`unionDiscriminators`, intersection-collapse decorators, Map/Set subKind args, class heritage). Today shape coverage is incidental to collection/atomic round-trips; `runtypes.test.ts` only covers the marker helper.
2. **(Med) Populate `IsCircular`** via a serializer circular-detection pass and flip `typefns/inlining.go` to "inline unless circular" — recovers the codegen optimisation §5#2/#3 describe. The structural-id side already detects cycles, so the data is half-present.
3. **(Low) Populate `Inlined`** from "no alias symbol" (ROADMAP:63) — cheap, unblocks the same inlining win.
4. **(Low) Emit `Description`** from leading JSDoc — enables OpenAPI/doc consumers; deepkit parity.
5. **(Low) Document the `infer`/`typeParameter`/standalone-`enumMember` non-projection as permanent parity** in `docs/UNSUPPORTED-KINDS.md` (mion's own nodes throw/stub), so they're not re-litigated as gaps.
6. **(Low) Verify the "201/201" plugin-test claim** in ROADMAP:16 against an actual run (out of scope here; flagged unverified).
