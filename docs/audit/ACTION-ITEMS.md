# Audit follow-up — action items (for review)

> **Date:** 2026-05-29 · being implemented on `claude/practical-lamport-lSRis` (PR #55).
>
> Derived from your review of the [port audit](00-overview.md) (docs/audit/01–10) plus the
> design decisions you confirmed. Each task below is something you flagged as **needing action**.
> Decisions you confirmed as *by-design / no action* are collected in the last section so the
> corresponding audit findings are explicitly closed.
>
> Each task: **What & why · Scope (files) · Acceptance criteria · Open questions**.

## Implementation status

- [x] **T9** — stale comments + residual stale docs removed.
- [x] **T5** — dead `isFnParams` binary abstraction dropped (binary round-trip 129/129).
- [x] **T1 / T1b** — `IsCircular` populated + surfaced in the cache (repurposed the dead
      `inlined` slot #13 → `isCircular`); dead `Inlined` field removed. Go + JS suites green.
- [x] **T4** — Set error-path now `{key: safe(item), index}` (getTypeErrors + unknownKeyErrors); wrong "set.ts doesn't override" comment fixed.
- [ ] **T3** — array-element non-serializable → throw (consistency).
- [ ] **T2** — `decorators` → `typeMeta` rename + surface generic intersection metadata.
- [ ] **T8** — reflection-shape JS test suite.
- [ ] **T6** — string-format mock generators + transforms + activate `it.todo`s.
- [ ] **T7** — custom class serializer/deserializer registry (needs your 4 API answers).

---

## T1 — Populate `IsCircular` and inline non-circular composites

- **Source:** audit item 01 §5#2/#3. Your call: *"we could set isCircular, that is handy; isInlined depends on the runtype prop emitted… so does not make sense."*
- **What & why:** `protocol.RunType.IsCircular` is declared but never written, so `inlining.go` treats **every** composite as non-circular-but-still-not-inlined → every object/tuple/union gets its own dependency-call factory even when it's a simple anonymous shape. Add a serializer-side circular-detection pass that sets `IsCircular`, then flip the inlining predicate to **"inline unless circular"**. The structural-id side already detects cycles (`typeid.go` `cycleRef`), so the signal is half-present — we just need to surface it on the node.
- **Scope:** `internal/compiled/runtype/serialize.go` (set `IsCircular` during projection), `internal/compiled/typefns/inlining.go` (`DefaultIsRTInlined` → inline unless `IsCircular`/named).
- **Acceptance:** circular types still validate/serialize correctly (existing CIRCULAR suites stay green); a self-referential type has `isCircular:true` in the cache (add one assertion); at least one anonymous non-circular composite now inlines (smaller emitted body); Go + JS suites green.
- **Open questions:** none — `isInlined` stays unpopulated by design (see T1b).

### T1b (tiny, optional) — remove the dead `Inlined` field
- Since inlining is driven by `IsCircular` + "named", the `Inlined` bool has no writer and no reader. Either **delete it** from `protocol.RunType` (+ `runtypes/types.ts`) or leave a `// reserved — not populated` note. Your call.

---

## T2 — Surface the intersection-metadata mechanism + rename `decorators` → `typeMeta`

- **Source:** audit items 01 §5#9 (`Brand`) + 10 (general decorators), refined in review.
- **Concept (confirmed):** this is deepkit's "type decorator" / branded-type pattern — a **type-level metadata intersection** (`Base & { meta }`), **not** TS `@decorator` syntax. The mechanism is **already half-built**: `intersection_collapse.go:88–104` collapses `atomic & { obj }` to the atomic kind and lifts the surviving object literal into `RunType.Decorators`. Formats are the *specialised* branded case (sentinel keys `__rtFormatName`/`__rtFormatParams` → lifted to `FormatAnnotation` instead). So this task is **surface + rename + idempotent-hash**, not build-from-scratch.
- **What & why:**
  1. **Rename the field `decorators` → `typeMeta`** end-to-end (Go `RunType.Decorators` → `TypeMeta`; JSON wire tag `decorators` → `typeMeta`; footer renderer; JS `RunType.decorators` → `typeMeta`) — "decorators" collides with JS `@decorator`s.
  2. **Keep the no-marker behaviour:** any object literal surviving an `atomic & { obj }` collapse is lifted to `typeMeta` (current logic) — no brand marker required.
  3. **Expose as plain metadata** (resolved literal object), not only as serialized `RunType` nodes, so consumers read `{ currency: 'USD' }` directly.
  4. **Fold `typeMeta` into the structural id idempotently** so `number & { currency: 'USD' }` caches stably regardless of key order.
  5. **Retire the dead number `Brand *int` field** — a branded number is just a `typeMeta` entry.
- **Scope:** `internal/protocol/protocol.go` (`Decorators` → `TypeMeta`, json tag, drop `Brand`), `internal/compiled/runtype/intersection_collapse.go` (lift + comments), `internal/compiled/runtype/serialize.go`, `internal/compiled/runtype/typeid/intersection_collapse.go` (idempotent hash), `internal/compiled/runtype/module.go` (footer field name), `packages/ts-go-run-types/src/runtypes/types.ts` (`decorators` → `typeMeta`), and the audit docs referencing the `decorators` field. Formats untouched (still `FormatAnnotation`).
- **Acceptance:** `type Money = number & { currency: 'USD' }` projects kind=`number` with `typeMeta` carrying `{ currency: 'USD' }` as plain data; existing format brands unchanged; same metadata ⇒ same hash; the field is named `typeMeta` everywhere (no `decorators`/`Brand` remnants); fixtures + tests (generic metadata + format-still-works).
- **Resolved decisions (from review):**
  1. **No marker** — lift *any* `atomic & { obj }` (keep current behaviour).
  2. **Rename `decorators` → `typeMeta`** (avoid JS `@decorator` confusion).
  3. **`typeMeta` is opaque metadata** (passed through; formats stay the validating specialisation).
  4. **TS `@decorator` (`@serializable`/`@component`) capture is OUT OF SCOPE** for now — separate future task if ever wanted.

---

## T3 — Make array-element non-serializable **throw**, per the unified rule

- **Source:** audit item 02 §5#3. Your stated rule: *"if something can be emitted or not is purely controlled by the not-supported code block — skipped in props, **will throw in any other place**."*
- **What & why:** array elements are a non-property (positional) position, so by your rule a `symbol[]` / `(()=>void)[]` should **throw** at factory creation (the `CodeNS → alwaysThrow` path used for tuple slots and union members). Today `istype.go` emits `return false` for a non-serializable array element instead — a third path inconsistent with the rule. Align it (and check `typeerrors.go` / `json_*.go` / `binary_*.go` for the same array-element carve-out).
- **Scope:** `internal/compiled/typefns/istype.go` (array-element arm, ~387 + `isNonSerializableElementKind`), and the matching arms in `typeerrors.go`, `json_prepare*.go`, `json_restore.go`, `json_stringify.go`, `binary_to.go`, `binary_from.go`.
- **Acceptance:** `createIsType<symbol[]>()` (and the other families) throw at factory creation with the family's `XX003`/`XX005` code, matching tuple/union member behaviour; `ARRAY.symbol_array` suite cases updated from "always-false" to "throws".
- **Open questions:** confirm you want the **throw** (consistent rule) vs keeping the current always-reject `()=>false`. The always-reject never yields a false positive, so this is a consistency fix, not a correctness fix — low priority.

---

## T4 — Restore the Set (and verify Map) error-path locator info

- **Source:** audit items 03 §5 + 04 §5. Your call: *"could you expand on Set bare-index vs mion `{key,index}` … as long as we do not lose info in the new package then is OK, but I think we might be missing functionality and info here."*
- **Expanded finding (you were right):** mion's Set member error path is `{key: safeIterableKey(item), index}` — it carries the **stringified item value** (`key`), which is the meaningful locator for an *unordered* Set (the index alone is iteration-order noise). The port emits a **bare numeric index** (`typeerrors.go` Set arm → `SetChildPathLiteral(idxVar)`), so error consumers can't tell *which item* failed. The pure-fn `cpf_safeIterableKey` already exists and is already used for the **Map** path — it's simply not applied to **Set**. (Map value/key paths already carry `{key,index}`; only the segment name differs — `mapValue` vs mion `mapVal` — which you're fine with.)
- **What & why:** emit `{key: <sIK>(item), index}` for Set members in `getTypeErrors` and `unknownKeyErrors`, matching mion's information content (no behavioural change to validation pass/fail — only the error-path payload gains the item locator). Also fix the **incorrect Go comment** in `typeerrors.go`/`errors.go` claiming "set.ts doesn't override `getStaticPathLiteral`" (it does).
- **Scope:** `internal/compiled/typefns/typeerrors.go` (Set arm ~1012), `internal/compiled/typefns/unknownkeys_errors.go` (uke Set arm); confirm Map already carries `{key,index}`.
- **Acceptance:** a failing `Set<T>` element produces an error whose `path` segment includes the stringified item key + index; tests assert the richer shape; the stale comment is corrected. Keep the new segment names (`mapValue`, `objectLiteral`) but **document** the rename in `docs/UNSUPPORTED-KINDS.md`/error-shape docs so consumers know they differ from mion.
- **Open questions:** keep the new names (documented) — confirm. And: do you want the **Map value** segment renamed back to `mapVal` for closer mion parity, or keep `mapValue` (you said names are fine — I'll keep `mapValue` unless you say otherwise)?

---

## T5 — Drop the dead `isFnParams` binary abstraction

- **Source:** audit item 06 §5. Your call: *"we can drop isFnParams, that was an abstraction we are not used anymore."*
- **What & why:** `binary_to.go`'s tuple encoder threads an `isFnParams` flag that is hardcoded `false` (it was the seam for the never-ported `allParamsOptional` / `paramsSlice` router conveniences). Remove the flag and its dead branches to simplify the bitmap logic; this also formally confirms `allParamsOptional`/`paramsSlice` stay unported (router-layer, out of scope — matches ROADMAP).
- **Scope:** `internal/compiled/typefns/binary_to.go` (+ `binary_from.go` if it mirrors the flag), `union_flat_binary.go` if referenced.
- **Acceptance:** flag + dead branches gone; `emitTupleToBinary` uses `resolved.Optional` only; binary round-trip suites unchanged & green.
- **Open questions:** none.

---

## T6 — String type-format: port pending mock generators + transform gaps, activate stubbed tests

- **Source:** audit item 07 §5/§6. Your call: *"string formats, let's migrate pending mock generation and transform gaps."*
- **What & why:** the string-format surface has two real gaps + the largest block of *tests left behind*:
  - **Mock generation** — per-format mock generators are stubbed (`formatMockType.test.ts` ~42 `it.todo` across formats; the string ones especially). Implement them in `src/mocking/mockStringFormat.ts` (per-format in-range sample generation) and activate the `it.todo`s.
  - **Transform gaps** — value-transform formats not fully ported (e.g. `Lowercase`/`Uppercase` transformers, StringFormat `replace`/`replaceAll`, email lowercase). Implement the transforms (`createFormatTransform`/`fmt` family + Go side as needed).
  - **Format error tests** — `formatGetTypeErrors.test.ts` has ~29 `it.todo` (FormatString minLength/maxLength/allowed-disallowed chars+values, Alpha/Numeric/AlphaNumeric, UUIDv7, StringDate/Time layouts, IP/URL/email-punycode, registerFormatPattern). The validation code is wired; activate the error-shape tests.
- **Scope:** `src/mocking/mockStringFormat.ts`, `src/formats/string/*`, `internal/compiled/typefns/formats/string/*.go` (if a transform needs Go emit), `test/adapters/{formatMockType,formatGetTypeErrors}.test.ts`, `test/suites/format-*-suite.ts`.
- **Acceptance:** zero `it.todo` for string formats in `formatMockType` and `formatGetTypeErrors`; transforms (lowercase/uppercase/replace) implemented + round-trip tested; format mock values validate against their own format.
- **Open questions:**
  1. Some string-format **sub-validations** the audit flagged as gaps (URL domain/IP sub-checks, `FormatUrlSocialMedia`, email transforms) — in scope for this task or a separate one?
  2. **T6b (confirm scope):** the same `it.todo` mock/error stubs also exist for **number** and **bigint** formats (audit items 08/09). Extend T6 to cover them, or keep this string-only and track 08/09 separately?

---

## T7 — Custom class serializer/deserializer registry (NEW feature)

- **Source:** audit item 10 (you raised it as possibly missing). Your call: *"users should be able to register custom functions that will be called when serializing and deserializing classes … driven by class name, so two different classes with the same name is not supported."*
- **What & why (confirmed gap):** classes can't go over the wire, and the port currently **does not** reconstruct user-class instances — `json_restore.go` rebuilds `Date`/`Map`/`Set`/`RegExp` but a user class restores as a **plain object** (no prototype), and there's **no registration hook**. (Note: I searched mion's `run-types` source and found no existing registry there — so this is a *desired* feature to design, not a verbatim port.) Add a name-keyed registry of `{serialize, deserialize}` that the JSON and binary families call for `KindClass` user classes.
- **Scope:**
  - JS: new `src/runtypes/classSerializerRegistry.ts` + `registerClassSerializer(name, {serialize, deserialize})` export from `index.ts`.
  - Go emit: `KindClass` (user class) arms in `json_prepare*.go` / `json_restore.go` / `json_stringify.go` / `binary_to.go` / `binary_from.go` emit a runtime lookup `utl.getClassSerializer(<className>)` and call serialize on encode / deserialize on decode; fall back to current behaviour (or a clear throw/warn) when unregistered.
  - Wire: ensure the class **name** reaches the runtime (already on the node via `typeName` / `ClassRef.Name` — verify).
- **Acceptance:** a user class `Foo` with a registered serializer round-trips through `createJsonEncoder/Decoder` **and** the binary pair, reconstructing a real `Foo` instance; an unregistered class follows the agreed policy; lookup is by class name (documented: duplicate names unsupported); new adapter test suite.
- **Open questions (need your input before building):**
  1. **API shape** — `registerClassSerializer('Foo', {serialize:(v)=>…, deserialize:(raw)=>new Foo(…)})`? Should `serialize` return JSON-ready data (then the normal JSON pipeline runs) or the final string?
  2. **Unregistered policy** — for a class with no registered serializer: throw at factory creation (treat as non-serialisable, like the unified rule), warn + fall back to plain-object, or current silent plain-object?
  3. **Scope of families** — JSON + binary both (I assume yes); does `isType`/`getTypeErrors` need any class-instance awareness, or do they keep validating structural shape only?
  4. **Builtins** — keep the current built-in handling (`Date` etc. via `classRef`) and layer the registry only over *user* classes?

---

## Confirmed by-design — NO action (closing the related audit findings)

These were flagged by the audit but you've confirmed them as intentional; recording so they're not re-litigated:

- **isType / getTypeErrors validate serializable DATA only.** Functions, symbols, and the non-serializable set are intentionally **never** part of the validated/serialized shape (JSON drops them anyway). The refactor — *warn* on dropped property-position members, *throw* in any other position — is the deliberate, more-type-safe model. ⇒ **Promise-as-thenable, symbol/function/non-serializable drops, function arity-guard omission are all by-design** (T3 is only a consistency nit *within* this model). Audit 02 §5#1/#2, 03 §5, 04 §5#4/#5 → closed.
- **Union flattening is an improvement, not a regression.** Serialization flattens object properties, so union *serialization* only needs an `is-object` check + the flattened-prop pass — no per-member full isType. The flat `[-1, mergedObject]` / `0xFF` envelope is the **new, better algorithm**; mion-wire compatibility is not a goal. Flattening is **serialization-only**; `isType`/`getTypeErrors` still check each union member individually. ⇒ Audit 05/06 "union wire divergence (High)" → **closed as by-design**.
- **`strictTypes` is not required.** It was only used for unions, and union flattening removes that need. ⇒ Audit 02 §5#4 → closed (won't plumb).
- **Error-segment renames are fine** (`mapValue`, `objectLiteral`, `checkNonRTProps` from the Jit→RT rename) — keep them; just **document** the differences from mion (folded into T4). The *info loss* for Set is the only real issue (T4).
- **`allParamsOptional` / `paramsSlice`** binary router conveniences stay **unported** (router-layer). T5 removes the leftover seam.
- **Reflection-shape omissions** are deliberate: `description` omitted; `default` literal-only (no runtime capacity); `infer`/`typeParameter`/standalone `enumMember`/standalone `rest` not projected (resolved/stubbed); live-JS-value fields (`function`/`classType`/`enum`/`TypeInfer.set`) never captured. ⇒ Audit 01 §4/§5 → closed (except `IsCircular` = T1 and `Brand`→`decorators` = T2).

## T8 — Reflection-shape JS test suite (approved)

- **Source:** audit item 01 follow-up #1. Your call: *"yes please add a reflection test suite."*
- **What & why:** no dedicated JS suite asserts the emitted `runTypesCache` entry *shapes* — coverage is incidental via isType/serialization round-trips, and `runtypes.test.ts` only tests the marker helper. Add a suite that drives the cache and asserts the projected `RunType` shape for representative kinds: literal bigint/symbol/regexp footer rehydration, union `safeUnionChildren` + `unionDiscriminators`, intersection-collapse `typeMeta` (post-T2), Map/Set subKind args, class heritage (`extends`/`implements`/`arguments`), tuple-member flags (optional/rest), enum `values`/`indexType`, template-literal projection.
- **Scope:** new shape-assertion suite following the existing `vite-plugin-runtypes/test/collections.test.ts` pattern (which already asserts emitted `RunType` fields off the materialised `virtual:runtypes-cache`), or a marker-package `test/reflectionShape.test.ts`.
- **Acceptance:** ≥1 assertion per representative kind against the actual cache entry; suite green; fails if projection shape regresses.

## T9 — Delete stale test comments + remaining stale docs (approved — doing now)

- **Source:** audit items 01/02 + your call: *"yes please delete stale test comments and any stale documentation in roadmap, or architecture."*
- **What & why:** remove stale `it.todo`/"every case is it.todo"/template-literal comments in `validation-suite.ts` (~lines 1473-1476, 6954-6956) that describe states no longer true; sweep `docs/ROADMAP.md` + `docs/ARCHITECTURE.md` for residual stale claims the Phase-0 pass missed (hard test counts like "201/201", contradicted out-of-scope lists, lingering old paths).
- **Scope:** `packages/ts-go-run-types/test/suites/validation-suite.ts` (comments only — no behavioural change), `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.
- **Acceptance:** no misleading "todo/not-implemented" comments for shipped features; ROADMAP/ARCHITECTURE free of contradicted claims; suites still green (comment-only edits).

---

### Suggested order (if you approve)
T9 + T5 (cleanups — T9 doing now) → T1 (inlining win) → T4 (Set path, infra exists) → T3 (consistency) → T8 (reflection suite) → T6 (string-format tests/mocks) → T2 (`typeMeta` rename + surface) → T7 (class serialization — largest). **T7 is the only task still needing your design answers** (its 4 open questions); T2 is now resolved.
