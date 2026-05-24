# Plan — DateTime format refactor: dedicated file, min/max params, relative `now±P`, and native `Date` formats

Status: **DRAFT for review — do not implement yet.**
Branch: `claude/datetime-format-refactor-LSl3c`

This plan covers two deliverables, sharing one set of **static** params so a later Temporal family can reuse them:

1. **String date/time/dateTime formats** — extract out of `stringFormats.ts` into their own file, add per-format `min`/`max` (absolute same-format literal **or** relative `now±P` ISO-8601 duration), validate every param Go-side with an error diagnostic on invalid input.
2. **Native `Date` formats** — new format family operating on the JS `Date` object, reusing the **same** param shapes (`min`/`max`/relative), emitting checks inside `isType` / `getTypeErrors`. No new serialisation work (Date serialisation is already covered).

---

## 0. Confirmed decisions (from clarifying questions)

- **Scope:** string formats **and** native `Date` now, in one plan; native `Date` is Phase 2 here. Temporal is explicitly out of scope but the param shapes are designed to be reused by it later.
- **min/max shape:** each bound is **either**
  - an **absolute literal in the field's own format** (no mixing — e.g. a `YYYY-MM-DD` field takes `min: '2020-01-01'`, a `HH:mm` field takes `min: '08:30'`), **or**
  - a **relative** value `now`, `now+P…`, or `now-P…` (ISO-8601 duration).
- **Relative grammar:** `now` optionally followed by `+`/`-` and a full ISO-8601 duration. Validated Go-side; evaluated at runtime against `Date.now()` in the emitted check.
- **Duration component restriction (key constraint):** the relative duration may only use **components that belong to the field's own kind**:
  - **date** formats → date-only components allowed (`Y`, `M`, `W`, `D`); **time components rejected** (no `T…`, no `H`/`M`(minute)/`S`).
  - **time** formats → time-only components allowed (`H`, `M`(minute), `S`, and the `T` designator); **date components rejected**.
  - **dateTime** → both allowed.
  - **native `Date`** → both allowed (treated as `dateTimeKind`), since a Date carries both — **confirmed**.
  - Invalid component usage emits an **error diagnostic** at build time.

### Resolved follow-up decisions
1. **Native Date duration kind:** allow both date+time components (`dateTimeKind`). ✅
2. **Absolute-bound codegen:** **bake a precomputed numeric epoch** at build time (fewer pure fns, faster). Relative bounds use a runtime pure fn. ✅
3. **Go package layout:** new package `internal/compiled/typefns/formats/datetime/` for date / time / dateTime / nativeDate emitters + shared `bounds.go`. The three existing string emitters (`date.go`, `time.go`, `datetime.go`) **move** out of the `string` package into it. ✅
4. **Public subpath:** root re-export only via `@mionjs/ts-go-run-types/formats` (non-breaking). ✅
5. **`now` alone** allowed (= current instant). ✅
6. **Number bounds disallowed** — bounds are string-only (absolute literal or relative); no epoch-number mixing. ✅

> Note on ISO-8601 `M` ambiguity: `M` before `T` = months (date), `M` after `T` = minutes (time). The validator must parse the duration with the `T` boundary in mind so it can reject cross-kind components precisely.

---

## 1. Background — how formats work today (grounding)

End-to-end flow for an existing parameterised format (verified in code):

| Phase | Location |
|---|---|
| Type alias the user writes | `packages/ts-go-run-types/src/formats/string/stringFormats.ts` |
| Brand carrier (`__rtFormatName` + `__rtFormatParams`) | `src/runtypes/typeFormat.ts:36` |
| Go scanner lifts brand → `FormatAnnotation` | `internal/compiled/runtype/typeid/formats.go` |
| Param validation → diagnostic | emitter's `ValidateParams(...)` (e.g. `internal/compiled/typefns/formats/string/stringformat.go:321`), codes in `internal/diag/codes_runtype.go:122` (`FMT001/002/003`) |
| `isType` codegen | emitter's `EmitIsTypeCheck(...)` |
| `getTypeErrors` codegen | emitter's `EmitTypeErrorsCheck(...)` |
| pure-fn dependency wiring | `pureFnAlias(...)` in `internal/compiled/typefns/formats/string/shared.go` |
| JS runtime pure fns | `src/formats/string/string-formats-pure-fns.ts` |
| Emitter registry | `internal/compiled/typefns/formats/registry.go` (Emitter / ParamValidator interfaces) |
| Go↔TS constants mirror | `internal/constants/constants.go` → `pnpm run gen:ts-constants` → `packages/vite-plugin-runtypes/src/runtypes-constants.generated.ts` |

Current date/time emitters (`internal/compiled/typefns/formats/string/{date,time,datetime}.go`) only **select a pure-fn wrapper** for the requested layout and emit `cpf_isX(value)`. They take **no `min`/`max`** today. They each **already implement `ValidateParams`** — but only to check the `format` enum is a known layout (`date.go:61`, `time.go:49`, `datetime.go:75`). We **extend** those existing methods with min/max validation rather than adding new ones. `ValidateParams` is invoked centrally from `internal/compiled/typefns/istype.go:183`, which emits one `diag.CodeFMTInvalidParams` (`FMT002`) per returned message — so new bound checks surface through the exact same path. The error-push codegen helper is `formatErrCall(...)` in `internal/compiled/typefns/formats/string/shared.go:44` (will move/share with the new package). Registry dispatch is keyed on `(Kind, Name)` (`registry.go:141`).

Current TS surface (in `stringFormats.ts`):
- `FormatStringDate<P>` — `format: DateFmt` only.
- `FormatStringTime<P>` — `format: TimeFmt` only.
- `FormatStringDateTime<P>` — nested `{date, time, splitChar}`.

Native `Date`: recognised structurally as a builtin class (`SubKindDate = 2001`, `Builtin: "Date"` in protocol), but **no format/validator family** exists for it.

---

## 2. Shared param design (used by string + native Date, future Temporal)

Add a single shared params module so all date-ish families reference the same types.

**New file:** `packages/ts-go-run-types/src/formats/datetime/dateTimeParams.ts`

```ts
// Relative spec — 'now' | 'now+P…' | 'now-P…' (ISO-8601 duration).
// Branded as a string literal at the type level; Go validates the grammar
// AND the per-kind component restriction.
export type RelativeNow = `now` | `now+P${string}` | `now-P${string}`;

// A single bound is either an absolute literal (string, in the field's own
// format) or a relative spec. Number is NOT allowed (no epoch mixing) to
// keep the 'no mixing' rule.
export type DateBound = string;     // 'YYYY-MM-DD' literal or RelativeNow
export type TimeBound = string;     // 'HH:mm[:ss…]' literal or RelativeNow
export type DateTimeBound = string; // full datetime literal or RelativeNow

export interface MinMax<Bound extends string> {
  min?: Bound;
  max?: Bound;
}
```

Rationale: keep bounds as `string` at the type level (TS can't fully encode "valid in this layout"), and do the real validation Go-side where we already own the calendar logic. This is consistent with how the codebase already defers format validation to Go (per `stringFormats.ts` header comment + CLAUDE.md).

---

## 3. Phase 1 — extract & extend string date/time/dateTime

### 3a. TS: move types into their own file

**New file:** `packages/ts-go-run-types/src/formats/datetime/stringDateTimeFormats.ts`

Move out of `stringFormats.ts` (lines ~157–200):
- `DateFmt`, `FormatParams_Date`, `DEFAULT_DATE_PARAMS`, `FormatStringDate`
- `TimeFmt`, `FormatParams_Time`, `DEFAULT_TIME_FORMAT_PARAMS`, `FormatStringTime`
- `FormatParams_DateTime`, `DEFAULT_DATE_TIME_PARAMS`, `FormatStringDateTime`

Extend each params interface with `min`/`max` from the shared module:

```ts
import {MinMax, DateBound, TimeBound, DateTimeBound} from './dateTimeParams.ts';

export interface FormatParams_Date extends MinMax<DateBound> { format: DateFmt; }
export interface FormatParams_Time extends MinMax<TimeBound> { format: TimeFmt; }
export interface FormatParams_DateTime extends MinMax<DateTimeBound> {
  date: FormatParams_Date; time: FormatParams_Time; splitChar: string;
}
```

(Keep `FormatStringDate`/`Time`/`DateTime` aliases and defaults; `min`/`max` are optional so defaults are unchanged.)

**Edit `stringFormats.ts`:** remove the moved blocks; leave a short comment pointer. Keep UUID/IP/Domain/Email/URL/StringFormat where they are.

**Edit `src/formats/index.ts`:** add `export type * from './datetime/stringDateTimeFormats.ts';` and `export type * from './datetime/dateTimeParams.ts';`. Re-exports keep the public `@mionjs/ts-go-run-types/formats` surface identical (no breaking import-path change for users who import the named types from the subpath root).

> Decision point for you: do we keep re-exporting from the formats subpath root only (recommended, non-breaking), or also expose a new `…/formats/datetime` subpath? Default: root re-export only.

### 3b. Go: relative-duration + bound validation helpers

**New file:** `internal/compiled/typefns/formats/datetime/bounds.go` (new `datetimefmt`-style package, or co-locate under `stringfmt` — see decision below).

Responsibilities (pure Go, no codegen):
- `parseRelative(spec string) (offset, kind, ok)` — parse `now`, `now±P…`, returning the ISO-8601 duration broken into date-part vs time-part components (split on `T`).
- `validateBound(bound string, kind boundKind) []string` — `kind ∈ {dateKind, timeKind, dateTimeKind}`:
  - if `now…`: parse duration; **reject** components not allowed for `kind` (date field with any time component → error; time field with any date component → error).
  - else: parse as an **absolute literal in the field's layout** (reuse the same calendar/time validity rules the pure fns encode) → error if it doesn't parse in that exact layout.
- `validateMinMax(min, max string, kind)` — if both are absolute, check `min <= max`; if either is relative, skip ordering (can't compare statically) but still validate each individually.

Diagnostics use existing `diag.CodeFMTInvalidParams` (`FMT002`) with precise messages, e.g.:
- `FormatStringDate: min duration 'now+PT1H' uses time components, not allowed for a date format`
- `FormatStringTime: max '25:00' is not a valid HH:mm time`
- `FormatStringDate: min '2020-13-01' is not a valid YYYY-MM-DD date`

### 3c. Go: add `ValidateParams` to date/time/dateTime emitters

- `date.go`: implement `ValidateParams` → read `min`/`max`, call `validateBound(..., dateKind)`. Also validate `format` is a known `DateFmt` (today an unknown format silently emits `""`; switch to `FMT003 CodeFMTUnknownFormat` or `FMT002`).
- `time.go`: same with `timeKind`.
- `datetime.go`: validate top-level `min`/`max` with `dateTimeKind`, and nested `date.format`/`time.format`.

Confirm the registry actually invokes `ParamValidator` for these emitters (it does for stringformat/uuid via the `ParamValidator` interface check in `registry.go`); since they'll now implement the interface, diagnostics will surface through the same scan path exercised by `internal/resolver/format_param_validation_test.go`.

### 3d. Go: emit min/max checks in `isType` / `getTypeErrors`

The existing emitters produce `cpf_isDateString_YMD(v)`. Extend so that when `min`/`max` are present, the check ANDs a comparison.

Approach — **compare via `Date.parse`/numeric epoch at runtime**, computed inside the emitted JS:
- For **absolute** bounds: bake the parsed bound as a constant the comparison uses (either a literal numeric epoch baked at compile time, or the literal string re-parsed at runtime — baking the number is cheaper and avoids per-call parsing).
- For **relative** bounds: emit `Date.now() + <offsetMillis>` for fixed-length components, but **calendar components (Y/M/W/D, months especially) are not fixed-length** → emit a small pure fn `cpf_applyRelative(nowMs, spec)` that adds the duration to "now" using `Date` arithmetic (UTC), so `now+P1M` means "one calendar month from now". This pure fn lives in the JS pure-fns file and is wired via `pureFnAlias`.

New pure fns to add to a date/time pure-fns file (see 3e):
- `cpf_relativeNowMs(spec)` → returns epoch ms for a `now±P…` spec (calendar-correct).
- `cpf_dateStrToMs(value, layout)` / `cpf_timeStrToMs(...)` → convert the validated value string to a comparable number for the bound check. (For time-only formats, compare seconds-of-day.)

Emitted `isType` for `FormatStringDate<{format:'YYYY-MM-DD', min:'2020-01-01', max:'now+P1Y'}>` becomes roughly:
```js
cpf_isDateString_YMD(v) && (cpf_dateStrToMs(v) >= 1577836800000) && (cpf_dateStrToMs(v) <= cpf_relativeNowMs('now+P1Y'))
```
`getTypeErrors` mirrors it with `formatErrorPush(...)` per failed sub-check, tagging `formatPath: ['min']` / `['max']` so error reporting points at the offending param (consistent with how stringformat pushes `formatPath`).

> Decision point: bake absolute bounds as precomputed numeric constants (recommended, faster, fewer pure fns) vs. re-parse the literal at runtime via a pure fn (smaller emitted code, keeps all logic in JS). Default: **bake numeric constant for absolute, pure fn for relative**.

### 3e. JS: split date/time pure fns into their own file

Currently date+time pure fns live in `src/formats/string/string-formats-pure-fns.ts`. To match "move them to their own file":

**New file:** `packages/ts-go-run-types/src/formats/datetime/dateTime-pure-fns.ts`
- Move the `isDateString*`, `isHours/isMinutes/isSeconds/isSecondsWithMs/isTimeZone/isTimeString_*` registrations here.
- Add the new `relativeNowMs`, `dateStrToMs`, `timeStrToMs` (and a `dateTimeStrToMs`) pure fns.
- Leave UUID/IP/string pure fns in the original file.
- Import the new file for side-effects from `src/formats/index.ts` (ordering: before any format module that references them, same pattern as today).

**Go-side path constant:** add `typeDateTimePureFnFilePath = "packages/ts-go-run-types/src/formats/datetime/dateTime-pure-fns.ts"` and have the date/time/dateTime emitters register their pure-fn deps against the **new** path (today `shared.go` hardcodes the string path). The string-format emitters keep the old path.

> ⚠️ The Go-side path string MUST exactly match the new JS file location or the pure-fn extractor won't ship the fn. This is the most error-prone step.

---

## 4. Phase 2 — native `Date` formats

### 4a. TS surface

**New file:** `packages/ts-go-run-types/src/formats/datetime/dateFormats.ts`

```ts
import {TypeFormat} from '../../runtypes/typeFormat.ts';
import {MinMax, DateTimeBound} from './dateTimeParams.ts';

// Native JS Date object, min/max as absolute ISO literal or now±P.
// Base is `Date` (extend TypeFormatBase to allow it — see 4c).
export interface FormatParams_NativeDate extends MinMax<DateTimeBound> {
  // optional: require integer ms, reject NaN dates, etc. (NaN always rejected)
}
export type FormatDate<P extends FormatParams_NativeDate = {}> =
  TypeFormat<Date, 'nativeDate', P, 'nativeDate'>;
```

Optional convenience aliases: `FormatDatePast = FormatDate<{max:'now'}>`, `FormatDateFuture = FormatDate<{min:'now'}>`.

> Per-kind duration rule for native Date: since a `Date` carries both date and time, **both** component kinds are allowed (treated like `dateTimeKind`). Confirm this is what you want, or restrict to date-only.

### 4b. Go emitter

**New file:** `internal/compiled/typefns/formats/datetime/nativeDate.go`
- `Name() "nativeDate"`, `Kind() protocol.KindClass` (Date is a builtin class, not a string). Registry dispatch is keyed on `(Kind, Name)` (`registry.go:141`), and `LookupForRunType` keys off `rt.Kind` + `rt.FormatAnnotation.Name` (`registry.go:177`) — so the emitter is reachable as long as the scanner attaches a `FormatAnnotation{Name:"nativeDate"}` to the Date-kinded RunType. **Main unknown to resolve at implementation time:** confirm `internal/compiled/runtype/typeid/formats.go` lifts the `__rtFormatName`/`__rtFormatParams` brand off a `Date & {…}` intersection (it already lifts the brand off `string & {…}`; the intersection mechanism should be identical) AND that the host `istype.go`/`typeerrors.go` walk calls `formats.LookupForRunType` for `KindClass` builtins, not only for string/number kinds. If the class arm doesn't currently consult the format registry, add that lookup there.
- `EmitIsTypeCheck`: base check `v instanceof Date && !isNaN(v.getTime())`, then `&& v.getTime() >= <minMs>` / `<= <maxMs>` reusing `relativeNowMs` for relative bounds. No string parsing needed (it's already a Date).
- `EmitTypeErrorsCheck`: mirror with `formatErrorPush`.
- `ValidateParams`: reuse `validateBound(..., dateTimeKind)` from Phase 1 (`bounds.go`) — shared logic, no duplication.

### 4c. Wiring for a non-string base

- `TypeFormatBase` in `typeFormat.ts:18` is `string | number | bigint` → **add `Date`**.
- Scanner: ensure `__rtFormatName`/`__rtFormatParams` brand on a `Date & {...}` intersection is detected the same way (the brand is an intersection so it should lift; verify in `runtype/typeid/formats.go`).
- Registry dispatch by `Kind()` must route a Date-kinded value to this emitter. **Investigate** how kind routing works for class/builtin during planning-to-implementation; this is the main unknown for Phase 2.

### 4d. Serialisation

No work — confirmed Date serialisation is already handled by the default serialisers. The new format only adds validation in `isType`/`getTypeErrors`.

---

## 5. Constants / generated mirror

- If any new format **name** strings or sub-kinds are added to `internal/constants/constants.go`, run `pnpm run gen:ts-constants` and commit the regenerated `runtypes-constants.generated.ts` (do not hand-edit it).
- Format name strings used: existing `date`/`time`/`dateTime` (unchanged) + new `nativeDate`. Keep Go `.Name()` and TS `__rtFormatName` literal in sync.

---

## 6. Tests (paired static + reflection — mandatory per CLAUDE.md)

For **every** new scenario, write **two** tests: `getRunTypeId<T>()`/`createIsType<T>()` (static) and a `reflectRunTypeId(value)` (reflection) form, and at least one paired hash-equivalence assertion per suite.

### ⭐ ESSENTIAL — param-validation coverage (must-have, not optional)

These are the **core acceptance tests** for this feature and MUST exist before the work is considered done. For **date**, **time**, **dateTime**, AND **native Date**, cover the full matrix below — for **both** absolute and relative (`now±P`) bounds:

1. **Same-format-only enforcement (the key rule):**
   - **date** format with a **time component** in a relative bound (e.g. `min:'now+PT1H'`, `min:'now+P0DT5M'`) → **must emit `FMT002`**.
   - **time** format with a **date component** in a relative bound (e.g. `max:'now+P1D'`, `max:'now-P1Y'`) → **must emit `FMT002`**.
   - **date** format with an **absolute literal in the wrong layout** (e.g. a `YYYY-MM-DD` field given `min:'08:30'` or `min:'2020-01-01T00:00'`) → **must emit `FMT002`**.
   - **time** format with an absolute **date** literal (e.g. an `HH:mm` field given `min:'2020-01-01'`) → **must emit `FMT002`**.
   - **dateTime** / **native Date**: both component kinds accepted → these same inputs must **NOT** emit a diagnostic (positive control proving the restriction is per-kind, not blanket).
2. **Valid bounds do NOT emit** (negative control for every kind): date+date-components, time+time-components, absolute literal in the correct layout, and bare `now`.
3. **Malformed bound value** → `FMT002`: invalid calendar/time literal (`'2020-13-01'`, `'25:00'`), malformed duration (`'now+P'`, `'now+1Y'` missing `P`, `'nowP1Y'`).
4. **min > max** for two absolute bounds in the same layout → `FMT002`. (Relative-vs-anything ordering is not statically checkable → assert it is **skipped**, not falsely flagged.)

Implement these as a **table-driven** Go test (one row per matrix cell, asserting presence/absence of `FMT002` and ideally the message substring) in a new `internal/resolver/datetime_bound_validation_test.go`, plus direct unit tests on `bounds.go` (`parseRelative`, `validateBound`, `validateMinMax`) covering the same matrix at the function level. The Go binary is the source of truth for validation, so the Go layer is where these essential tests live; the JS adapter tests below mirror the runtime behaviour but the diagnostics matrix is asserted Go-side.

### Go (`internal/`)
- New/extended fixtures under `internal/testfixtures/` for: date min/max absolute, date min/max relative, time min/max, dateTime min/max, native Date min/max, and **invalid** cases (cross-kind duration, bad literal, min>max).
- Extend `internal/resolver/format_param_validation_test.go` (or the new `datetime_bound_validation_test.go`) to assert the new `FMT002` diagnostics fire for each invalid case, and do NOT fire for valid ones — see the **ESSENTIAL** matrix above.
- Bound-parser unit tests for `bounds.go` (component-restriction matrix: date×time-component → error, etc.).

### JS (`packages/ts-go-run-types/test/`)
- Add cases to `test/suites/format-validation-suite.ts` with `valid`/`invalid` samples and `expectedFormatErrors` for min/max (absolute + relative).
- Add `it(...)` entries in `test/adapters/formatIsType.test.ts` and `formatGetTypeErrors.test.ts` (one per case, no parameterisation — matches existing style + coverage guard).
- Relative-bound runtime tests need deterministic "now": stub `Date.now()` / fake timers in the relevant spec so `now±P` comparisons are reproducible.

### Build/run discipline (from CLAUDE.md)
- Rebuild Go binary before JS plugin tests: `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`.
- `go test ./internal/...` for Go; `pnpm test` for JS.
- Rebuild `vite-plugin-runtypes` only if its `src` changes (not expected here).
- Run `pnpm run lint` + `pnpm run format` before committing.

---

## 7. Docs

- Update `docs/ROADMAP.md` (date/time min/max, relative `now±P`, native Date family).
- Update `docs/ARCHITECTURE.md` if the relative-duration evaluation model is worth recording.
- README format catalog: add min/max + relative + `FormatDate` examples.

---

## 8. Suggested commit sequence

1. Add shared `dateTimeParams.ts` + move string date/time/dateTime types into `datetime/stringDateTimeFormats.ts`; update `index.ts` re-exports. (TS-only, no behaviour change.)
2. Move date/time pure fns into `datetime/dateTime-pure-fns.ts`; update Go path constant + `index.ts` side-effect import. Verify existing tests still green.
3. Go `bounds.go` relative/absolute validator + unit tests.
4. Add `ValidateParams` + min/max codegen to date/time/dateTime emitters; pure fns `relativeNowMs`/`*StrToMs`; Go + JS tests.
5. Phase 2: native `Date` family (TS + emitter + `TypeFormatBase` Date + scanner/registry wiring + tests).
6. Constants regen (if needed), docs, lint/format.

---

## 9. Implementation outcome (resolved)

Both phases are implemented, tested, and committed.

**Phase 2 code-level unknown — resolved.** `FormatDate<P>` lowers to
`Date & {brand}`, which tsgo keeps as a **real `TypeFlagsIntersection`**
of two object members (the `Date` interface + the sentinel-bearing brand
object), so it flows through `collapseIntersection`. The previous code
sent that case to the object×object merge, losing both the `Date`
identity and the brand. Fix: `splitBuiltinClassBrand` in
`internal/compiled/runtype/intersection_collapse.go` detects a recognised
builtin-class member (Date/Map/Set/RegExp) alongside a format-brand
member, projects the class (reusing `projectClass` → `SubKindDate` +
`ClassRef`) and lifts the `FormatAnnotation`. The host `istype`/
`typeerrors` class arm already AND-chains a registered format emitter's
check after the base `instanceof Date` check (the splice was kind-agnostic
on `CodeE`/`CodeS`), so no host-emitter change was needed beyond a
`baseKindGuard` entry for `KindClass` so the typeErrors bound check only
runs on a valid Date.

The `nativeDate` emitter (`internal/compiled/typefns/formats/datetime/
nativeDate.go`) compares the Date's `getTime()` against baked absolute
epochs / `cpf_relativeNowKey` relative bounds (dateTimeKind — both
component groups allowed). `TypeFormatBase` was widened to include `Date`.
