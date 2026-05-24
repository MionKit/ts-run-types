# Temporal implementation — live progress tracker

> Working notes for the autonomous Temporal build. Branch
> `claude/temporal-api-support` (base: `claude/datetime-format-refactor-LSl3c`).
> Full design: [temporal-support.md](./temporal-support.md). **Delete this file
> before the final PR** (or fold remaining items into ROADMAP).

## The 8 types + canonical strings + scale

| Type | SubKind (proposed) | toJSON example | from | compare scale |
| --- | --- | --- | --- | --- |
| Instant | 2101 | `1969-07-20T20:17:00Z` | `Temporal.Instant.from` | epochNanoseconds (BigInt) |
| ZonedDateTime | 2102 | `…-08:00[America/Los_Angeles]` | `…from` | epochNanoseconds (BigInt) |
| PlainDate | 2103 | `2006-08-24` | `…from` | `PlainDate.compare` |
| PlainTime | 2104 | `19:39:09.068` | `…from` | `PlainTime.compare` |
| PlainDateTime | 2105 | `1995-12-07T15:00:00` | `…from` | `PlainDateTime.compare` |
| PlainYearMonth | 2106 | `2020-10` | `…from` | `PlainYearMonth.compare` |
| PlainMonthDay | 2107 | `07-14` | `…from` | (no compare — equality only) |
| Duration | 2108 | `P1Y1M1DT1H1M1.1S` | `…from` | (length, no bounds) |

## Plan / checklist (update as we go)

- [ ] **Phase 0 (blocking spike)**: how does `Temporal.*` resolve in patched
  tsgo? Check `third_party/tsgolint/typescript-go` bundled libs. If absent →
  ambient overlay `.d.ts` (preferred, low blast radius). Prototype
  namespace-qualified detection (symbol parent == `Temporal`) with an
  id-stability test for Date/Map/Set.
- [ ] SubKinds 2101–2108 in `internal/protocol/subkind.go` + JS
  `runTypeKind.ts` + `gen:ts-constants`.
- [ ] Shared builtin table (Go) keyed by qualified identity → {SubKind, Builtin
  string for classType}. Replace scattered `case "Date"` switches
  (serialize.go ×2, typeid.go ×2) WITHOUT changing Date/Map/Set ids (golden test).
- [ ] Scanner: detect `Temporal.X`, set Kind=Class + SubKind + ClassRef.Builtin
  = `"Temporal.X"` (so `globalThis.Temporal.X` footer works).
- [ ] Per RT-fn arm (each w/ test before moving on):
  - [ ] isType (`v instanceof Temporal.X`)
  - [ ] getTypeErrors
  - [ ] prepareForJson (no-op) / prepareForJsonSafe(+Preserve)
  - [ ] stringifyJson (`'"'+v.toJSON()+'"'`)
  - [ ] restoreFromJson (`v = Temporal.X.from(v)`)
  - [ ] toBinary / fromBinary (string-encoded v1)
  - [ ] unknownKeys family (no-op like Date)
- [ ] JS mock builders per type + mockType dispatch + RunTypeSubKind mirror.
- [ ] (Phase 2) Temporal format family w/ min/max via `.compare` + `Temporal.Now`.
      OPTIONAL — only if time permits; plain types first.
- [ ] Tests: Go scanner/id/emit + JS isType/getTypeErrors/serialization/binary/mock.
- [ ] Docs (ROADMAP rows), remove this tracker, open PR.

## Decisions made autonomously (report in PR)

### Phase 0 spike RESULTS (resolved both blocking unknowns)
- **lib**: setting `CompilerOptions.Lib` explicitly BREAKS all lib loading in the
  inferred-program path (even `Date` → `any`). tsgo only auto-loads the default
  lib when `Lib` is empty. → DO NOT use `Lib`. Instead provide an **ambient
  overlay `.d.ts`** declaring `declare namespace Temporal { … }` (same technique
  fixtures use to fake the marker package). Production consumers get Temporal
  from their own tsconfig `lib`; our scanner only needs the symbol shape. The
  `Options.Lib` field I added is reverted/unused — REMOVE before PR.
- **detection signal**: `tsType.Symbol().Parent.Name == "Temporal"` +
  `symbol.Name == "<TypeName>"`. Empirically: `Temporal.PlainDate` →
  symbol="PlainDate", parent="Temporal", flags=Object, KindOf=30
  (ObjectLiteral, so must be promoted to KindClass like Date/Map/Set). `Date`
  control → symbol="Date", parent="", KindOf=20.
- **type shape**: each Temporal type is `interface X` + `const X: XConstructor`
  with `prototype: X` — identical to how `Date` is declared. `instanceof
  Temporal.X` works.
- **methods confirmed in lib**: all 8 have `toJSON(): string` + `from(...)`.
  `compare` on all except PlainMonthDay. Instant/ZonedDateTime have
  `epochNanoseconds: bigint`.
- **classType footer**: `ClassRef.Builtin = "Temporal.X"` → `globalThis.Temporal.X`
  (valid JS, no special casing needed in module.go).
- **test overlay**: needs a real Temporal ambient `.d.ts` (a fuller version of
  the spike's minimal one) so fixtures resolve the types.

## Open questions for the user (report at end)
- (record here)
