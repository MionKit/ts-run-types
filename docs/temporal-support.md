# Temporal API support

> **Status: implemented.** All eight [TC39 Temporal](https://tc39.es/proposal-temporal/)
> types are validated, serialized (JSON + binary), and mockable, and the six
> orderable types support min/max bounds via the `FormatTemporalX<{min,max}>`
> family (opt-in subpath `@mionjs/ts-go-run-types/formats/temporal`). The
> sections below were written as the design spec and remain accurate as the
> design record.
>
> Companion docs: [ARCHITECTURE.md](./ARCHITECTURE.md) (execution model),
> [ROADMAP.md](./ROADMAP.md) (scope), and the native-`Date` work in this repo
> (the closest existing template — see §3).

## 0. Requirement: the Temporal lib must be in your `tsconfig`

Temporal support is **opt-in via your TypeScript `lib` configuration**. The
Go scanner reads types through TypeScript's lib definitions, so it can only
see `Temporal.PlainDate` as a real type when the Temporal namespace is loaded:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "lib": ["ES2023", "ESNext.Temporal"], // ← add ESNext.Temporal
  },
}
```

**If the Temporal lib is missing, `Temporal.*` resolves to `any`.** Rather than
silently emit a validator that accepts any value, the scanner detects a
`Temporal.<Name>` reference that degraded to `any` and raises a **build
error**:

```
TMP001: Temporal type 'Temporal.PlainDate' resolved to 'any' — add
"ESNext.Temporal" to compilerOptions.lib.
```

This makes the behaviour **defined**: either Temporal types are loaded and
validate correctly, or you get a loud build error telling you how to enable
them. There is no silent no-op. (When the lib IS loaded the guard costs
nothing — it only inspects calls whose written `Temporal.*` syntax resolved
to `any`.)

At **runtime**, validating/serializing a Temporal value requires the host to
provide the global `Temporal` object (native in Node 26+ and current
browsers).

## 1. What Temporal is and why now

Temporal reached **Stage 4** at the TC39 March 2026 meeting and is part of
**ECMAScript 2026**. It ships **unflagged in Node.js 26** (V8 14.6, released
May 2026) and in Chrome 144 / Firefox; Safari is partial. Since this repo's
Go side targets Go ≥ 1.26 and the runtime targets modern Node, Temporal is a
realistic first-class target rather than a polyfill-only concern.

Temporal replaces the legacy `Date` with eight immutable, well-specified
types. Each is a **builtin class** the same way `Date` / `Map` / `Set` are —
which is the entire reason this is tractable: the repo already has a complete
machine for builtin classes (`SubKindDate` and friends), and Temporal types
slot into the same seams.

### 1.1 The eight types and their canonical string forms

Every Temporal type round-trips losslessly through `toString()`/`toJSON()` →
`Type.from(string)`. This is the single most important fact for serialization:
**Temporal serialization is string-based, exactly like `Date.toJSON()`** (which
the repo already special-cases — see §3.2).

| Type                      | `toJSON()` example                                       | Reconstruct via                   |
| ------------------------- | -------------------------------------------------------- | --------------------------------- |
| `Temporal.Instant`        | `1969-07-20T20:17:00Z`                                   | `Temporal.Instant.from(s)`        |
| `Temporal.ZonedDateTime`  | `1995-12-07T03:24:30.0000035-08:00[America/Los_Angeles]` | `Temporal.ZonedDateTime.from(s)`  |
| `Temporal.PlainDate`      | `2006-08-24`                                             | `Temporal.PlainDate.from(s)`      |
| `Temporal.PlainTime`      | `19:39:09.068346205`                                     | `Temporal.PlainTime.from(s)`      |
| `Temporal.PlainDateTime`  | `1995-12-07T15:00:00`                                    | `Temporal.PlainDateTime.from(s)`  |
| `Temporal.PlainYearMonth` | `2020-10`                                                | `Temporal.PlainYearMonth.from(s)` |
| `Temporal.PlainMonthDay`  | `07-14`                                                  | `Temporal.PlainMonthDay.from(s)`  |
| `Temporal.Duration`       | `P1Y1M1DT1H1M1.1S`                                       | `Temporal.Duration.from(s)`       |

Notes that affect validation/serialization design:

- All eight expose `toJSON()` (returns the canonical string) and a static
  `from(stringOrObject)`. `from` **throws** on an invalid string — useful for a
  cheap validity check, but a throwing validator is not how `isType` works
  (isType returns a boolean), so see §4.1.
- `ZonedDateTime` carries an **IANA time zone id** in `[...]` and optionally a
  `[u-ca=calendar]` annotation; its string is the richest.
- `Duration` is the same ISO-8601 duration grammar this repo **already parses**
  for relative `now±P…` format bounds (`internal/compiled/typefns/formats/datetime/bounds.go`).
- `instanceof` works per-type (`x instanceof Temporal.PlainDate`), giving the
  base validity check a direct analogue to `v instanceof Date`.

Sources: [tc39/proposal-temporal](https://github.com/tc39/proposal-temporal),
[Temporal docs](https://tc39.es/proposal-temporal/docs/),
[Socket: Temporal → Stage 4](https://socket.dev/blog/tc39-advances-temporal-to-stage-4),
[NodeSource: Temporal in Node 26](https://nodesource.com/blog/javascript-temporal-history-nodejs-26).

## 2. The existing machine Temporal must plug into

### 2.1 SubKind system

`internal/protocol/subkind.go` defines the second discriminator
(`ReflectionSubKind`) mirrored to JS in
`packages/ts-go-run-types/src/runTypeKind.ts` (`RunTypeSubKind`) and the
generated `packages/vite-plugin-runtypes/src/runtypes-constants.generated.ts`.
Current values:

```
SubKindNone            0
SubKindMapKey          1801   SubKindMapValue 1802   SubKindSetItem 1803
SubKindDate            2001
SubKindMap             2002
SubKindSet             2003
SubKindNonSerializable 2004
```

A builtin class is encoded as `Kind=KindClass` + a `SubKind`, plus a
`ClassRef{Builtin: "<name>"}` so the cache footer can wire
`t.classType = globalThis.<name>` (`internal/compiled/runtype/module.go:281`).

**Temporal needs new SubKind values** — one per type (eight), e.g.
`SubKindTemporalInstant`, `SubKindTemporalPlainDate`, … Pick a fresh numeric
block (Temporal isn't in mion, so we own the numbering — propose `2101`–`2108`,
documented as ts-go-run-types-specific in `subkind.go`). Each new value must be
added in three places kept in lockstep (a `gen:ts-constants` run handles the
generated mirror):

1. `internal/protocol/subkind.go`
2. `packages/ts-go-run-types/src/runTypeKind.ts` (`RunTypeSubKind`)
3. the generated constants file via `pnpm run gen:ts-constants`

### 2.2 The RT-function families (full list)

Every family is rendered by a Go emitter under
`internal/compiled/typefns/`; the cache module names/prefixes live in
`internal/constants/constants.go`. A new builtin class needs a deliberate arm
(or an explicit "fall through to NonSerializable-style throw") in **each**:

| Family                                                                                      | Emitter file                                            | What a builtin-class arm must do                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `isType`                                                                                    | `istype.go`                                             | base validity predicate (boolean expr)                                |
| `getTypeErrors`                                                                             | `typeerrors.go`                                         | push a typed error on failure (statement)                             |
| `prepareForJson`                                                                            | `json_prepare.go`                                       | produce a JSON-serializable form                                      |
| `prepareForJsonSafe` / `…Preserve`                                                          | `json_prepare_safe.go`, `json_prepare_safe_preserve.go` | safe (non-mutating) variants                                          |
| `restoreFromJson`                                                                           | `json_restore.go`                                       | reconstruct the instance from JSON                                    |
| `stringifyJson`                                                                             | `json_stringify.go`                                     | emit JSON text directly                                               |
| `toBinary` / `fromBinary`                                                                   | `binary_to.go`, `binary_from.go`                        | byte-symmetric encode/decode                                          |
| `formatTransform`                                                                           | `formattransform.go`                                    | format-fn value transform (only if a Temporal format family is added) |
| `hasUnknownKeys`, `stripUnknownKeys`, `unknownKeyErrors`, `unknownKeysToUndefined`(+`Wire`) | `unknownkeys_*.go`                                      | almost certainly **no-op** for an atomic builtin (no extra keys)      |
| `pureFns`                                                                                   | (registry, not a per-type emitter)                      | any helper pure fns the validators call                               |
| `mock`                                                                                      | JS-side `packages/ts-go-run-types/src/mocking/`         | produce a random valid instance                                       |

The unknown-keys family is the only group that is a confirmed no-op for
Temporal types (verified against the Date arms: `hasUnknownKeys` returns the
literal `false`, the strip/errors/to-undefined variants emit nothing —
Temporal types are leaf/atomic from the validator's POV, no own enumerable
data properties to police).

The cache-module names + var prefixes/tags for each family live in
`internal/constants/constants.go` (`it`/`te`/`pj`/`rj`/`sj`/`pjs`/`pjsp`/
`huk`/`suk`/`uke`/`uku`/`ukuw`/`tb`/`fb`/`fmt`/`pureFns`); the protocol
`CacheKind` constants mirror them in `internal/protocol/protocol.go`. A new
SubKind needs **no** new cache module — it reuses every existing family;
only the per-family emit arms (§3.2) change.

### 2.3 Builtin-class detection sites (every place that switches on a class name)

These are the sites that hard-code `"Date"`/`"Map"`/`"Set"`/`"RegExp"` /
`"Promise"` or consult `protocol.IsNonSerializableSymbol`. **Each must learn
the Temporal class names** (preferably via one shared lookup table, see §5.1):

| Site                                                                                            | Role                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `internal/compiled/runtype/serialize.go:785` (`case "Date","Map","Set"` in `projectObjectType`) | promotes lib.d.ts interface → KindClass     |
| `internal/compiled/runtype/serialize.go:899` (`case "Date"` in `projectClass`)                  | assigns `SubKind` + `ClassRef.Builtin`      |
| `internal/compiled/runtype/typeid/typeid.go:228` (`case "Date"` in `Compute`)                   | structural-id prefix (SubKind)              |
| `internal/compiled/runtype/typeid/typeid.go:454` (`case "Date","Map","Set"` in `KindOf`)        | kind classification                         |
| `internal/protocol/protocol.go:271` (`ClassRef.Builtin` doc + values)                           | wire field; doc lists allowed builtin names |
| `internal/compiled/runtype/intersection_collapse.go` (`builtinClassNames`)                      | format-brand lift over a builtin (see §3)   |
| `internal/compiled/runtype/typeid/intersection_collapse.go` (`builtinClassNamesID`)             | id-side mirror of the above                 |
| every emitter arm in §2.2 that has a `case protocol.SubKindDate:`                               | per-family behaviour                        |
| JS `packages/ts-go-run-types/src/mocking/mockType.ts:170` (`subKind === RunTypeSubKind.date`)   | mock dispatch                               |

### 2.4 classType footer wiring (nested-namespace wrinkle)

`module.go:281` emits `t.classType = globalThis.<Builtin>`. For Temporal the
constructor is **namespaced**: `globalThis.Temporal.PlainDate`. Setting
`ClassRef.Builtin = "Temporal.PlainDate"` produces `globalThis.Temporal.PlainDate`,
which is valid JS — so the footer needs **no special casing** as long as the
`Builtin` string carries the dotted path. (Double-check the JS runtime's
`classType` consumer tolerates a namespaced constructor; it only needs the
constructor reference for `instanceof` and mock typing.)

## 3. The closest template: native `Date` format support (already in-tree)

The recently-added `FormatDate` work is the blueprint for two things Temporal
needs: (a) treating a builtin class as a first-class validated type, and (b)
carrying optional format/bounds metadata on it.

### 3.1 Brand-lift over a builtin class

`FormatDate<P>` lowers to `Date & {brand}`, a real intersection. The collapse
detects "builtin-class member + format-brand member" and projects the class +
lifts the annotation, in BOTH:

- `internal/compiled/runtype/intersection_collapse.go` → `splitBuiltinClassBrand`
- `internal/compiled/runtype/typeid/intersection_collapse.go` → `splitBuiltinClassBrandID`

`builtinClassNames` / `builtinClassNamesID` already include `Date/Map/Set/RegExp`.
**Adding Temporal class names to these two tables is what lets a
`FormatTemporalX<P>` brand work** — the same machinery, no new collapse logic.

`TypeFormatBase` in `packages/ts-go-run-types/src/runtypes/typeFormat.ts` was
widened from `string|number|bigint` to add `Date`; it would add the Temporal
types if a Temporal format family is offered.

### 3.2 The per-family Date arms (the exact pattern to mirror)

| Family          | Date arm (verbatim behaviour)                                                 | Temporal analogue                                     |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| isType          | `(v instanceof Date && !isNaN(v.getTime()))` (`istype.go:296`)                | `v instanceof Temporal.PlainDate` (+ optional bounds) |
| getTypeErrors   | `if (!(v instanceof Date)                                                     |                                                       | isNaN(v.getTime())) <pushErr>` (`typeerrors.go:326`) | same shape, per type |
| prepareForJson  | **no-op** `""` — JSON.stringify calls `Date.toJSON()` (`json_prepare.go:220`) | **no-op** — Temporal types have `toJSON()` too        |
| restoreFromJson | `v = new Date(v)` (`json_restore.go:177`)                                     | `v = Temporal.<T>.from(v)`                            |
| stringifyJson   | `'"'+v.toJSON()+'"'` (`json_stringify.go:219`)                                | `'"'+v.toJSON()+'"'` (identical)                      |
| toBinary        | `view.setFloat64(index, v.getTime(), …)` (`binary_to.go:278`)                 | **string-based** — see §4.4                           |
| fromBinary      | `new Date(view.getFloat64(…))` (`binary_from.go:188`)                         | `Temporal.<T>.from(<decoded string>)`                 |
| mock            | `mockDate(min,max)` (`mockType.ts:171`, `mockUtils.ts:55`)                    | per-type mock builder                                 |

The serialization story is the encouraging part: **prepareForJson is a no-op
and stringifyJson is `toJSON()` for every Temporal type** — byte-identical to
Date. Only `restoreFromJson` differs (must call the right `Temporal.<T>.from`),
and binary needs a string path instead of the float64 epoch path.

## 4. Per-concern design

### 4.1 isType / getTypeErrors

Base check per type: `v instanceof Temporal.<T>`. Temporal instances are always
valid (unlike `Date`, there is no "Invalid Temporal" — `from` throws rather
than producing a NaN-like object), so **no secondary validity check is needed**
for the base case. This is simpler than Date.

Optional refinement (only if a Temporal format family is added): min/max bounds
analogous to `FormatDate`. The comparison key differs per type:

- `Instant` / `ZonedDateTime` → `.epochNanoseconds` (a **BigInt**) — compare
  BigInts, not numbers. This matters: the existing `relativeNowKey` pure fn
  works in `number` ms; Temporal exact types are nanosecond-precision BigInt.
- `PlainDate`/`PlainTime`/`PlainDateTime`/`YearMonth`/`MonthDay` → use
  `Temporal.<T>.compare(a, b)` (every Temporal type ships a static `compare`),
  which sidesteps key extraction entirely. **Recommendation: emit
  `Temporal.<T>.compare(v, bound) >= 0` rather than inventing numeric keys.**
- Relative `now±P…` bounds map naturally: `Temporal.Now.plainDateISO()` /
  `Temporal.Now.instant()` plus `.add(Temporal.Duration.from('P…'))`.

This is a clean future extension but should be a **separate phase** after the
plain type support, since it needs a new format family + the brand-lift tables
from §3.1.

### 4.2 prepareForJson / prepareForJsonSafe(+Preserve) / stringifyJson

No-op prepare + `'"'+v.toJSON()+'"'` stringify, identical to Date, for all
eight types. The safe/preserve variants follow Date's arms. Low risk.

### 4.3 restoreFromJson

`v = Temporal.<T>.from(v)` — the ONE place the type identity matters on the
decode side. The emitter arm must select the correct `from` based on the
node's SubKind. `from` throwing on malformed input is acceptable here (decode
of corrupt data is an error path).

### 4.4 toBinary / fromBinary

Date packs as an 8-byte float64 epoch. Temporal can't reuse that:

- Exact types are **nanosecond BigInt** — a float64 epoch-ms loses precision.
- Plain types have no single epoch.

Two options, to be decided during implementation:

1. **String encoding** (recommended for v1): write `toJSON()` as a
   length-prefixed UTF-8 string; read back via `Temporal.<T>.from(str)`. Reuses
   the existing string binary primitives, byte-symmetric, lossless. Slightly
   larger than 8 bytes but correct for all eight types.
2. **Typed packing** (later optimization): e.g. `Instant`/`ZonedDateTime` as
   two BigInt64 halves of `epochNanoseconds` + a string time-zone id;
   `PlainDate` as packed y/m/d ints. More compact, much more code, eight
   bespoke encoders. Defer.

Per the repo's binary contract (`binary_to.go` / `binary_from.go` must stay
byte-symmetric and the round-trip is the only test), v1 should pick option 1.

### 4.5 mock generation

JS-side, in `packages/ts-go-run-types/src/mocking/`. Add a per-SubKind builder
mirroring `mockDate` (`mockUtils.ts:55`) and dispatch it from
`mockType.ts:170`'s `class` arm. Each builder produces a random valid instance,
e.g. `Temporal.PlainDate.from({year, month, day})` with randomized fields, or
`Temporal.Instant.fromEpochMilliseconds(random(...))`. Honor any min/max mock
options if the format family lands.

### 4.6 pureFns

If min/max bounds use `Temporal.<T>.compare` and `Temporal.Now.*`, those are
inline calls — no new pure fns strictly required. Note that **`Temporal` is
already on the pure-fn allowlist** (`internal/compiled/purefns/purityrules.go:66`),
so any validator/pure-fn body may already reference `Temporal.*` without
tripping the purity checker. This is an existing, deliberate hook.

## 5. The hard problems / open questions

### 5.1 Scanner detection of namespaced types (the main unknown)

`Date` is a top-level lib.d.ts interface; its `tsType.Symbol().Name == "Date"`.
**`Temporal.PlainDate` is a member of the `Temporal` namespace**, so the bare
`symbol.Name` is `"PlainDate"` — which would (a) collide with any user type
literally named `PlainDate`, and (b) not by itself tell the scanner it's the
Temporal one.

Detection must therefore be **namespace-qualified**, not bare-name. Options to
evaluate during implementation:

- Walk the symbol's parent / containing namespace symbol and require it to be
  `Temporal` (and ideally that the declaration's source file is a lib/ambient
  `.d.ts`, mirroring how the marker scanner gates `InjectRunTypeId` by the
  declaring `package.json`).
- Build the qualified name (`Temporal.PlainDate`) and match against a single
  shared table (see below).

**Recommendation:** introduce one shared `builtinClasses` table (Go) keyed by a
_qualified_ identity (namespace + name) → `{SubKind, BuiltinForClassType}`, and
replace the scattered `case "Date"` switches (§2.3) with lookups against it.
This both fixes the collision risk and removes the "keep N switch statements in
sync" hazard the codebase already warns about for the two intersection
collapses.

### 5.2 lib resolution — Temporal isn't in the configured lib

`tsconfig.json` sets `"lib": ["ES2023"]` (and the marker package adds `"dom"`).
**Temporal is ES2026** — it will not resolve from globals under ES2023. The
scanner would never see a `Temporal.*` type today. Options:

- Bump `lib` to include the Temporal-bearing lib (`ES2026`/`ESNext` once tsgo's
  bundled lib ships it) — affects the whole project's global surface.
- Ship an **ambient overlay** `.d.ts` declaring the `Temporal` namespace for
  the scanner (mirrors how `internal/testfixtures/runtypes.d.ts` fakes the
  marker package). This is the lower-blast-radius choice and lets tests run
  without a tsgo lib bump.
- Confirm what the **patched tsgo** (`third_party/tsgolint/typescript-go`)
  bundles for libs — its lib version, not the host Node, governs what the
  checker resolves. **This must be checked first; it gates everything else.**

### 5.3 ZonedDateTime calendar/timezone fidelity

`ZonedDateTime.toJSON()` includes the IANA tz id and may include a calendar
annotation. `from()` round-trips it, so string serialization is lossless — but
mock generation and any min/max comparison must not assume the ISO calendar.
Keep v1 mock to the ISO calendar + a fixed tz (e.g. UTC) and document the
limitation.

### 5.4 Duration is not a point in time

`Temporal.Duration` is the odd one out: it's a length, not an instant. It has
no `compare` against "now", min/max bounds are nonsensical in the date sense,
and it's the same grammar as the format-bound durations. Validation = `v
instanceof Temporal.Duration`; serialization = `toString()`/`from()`. Treat it
as a plain serializable type with **no bounds support**.

### 5.5 Structural-id stability

Adding SubKinds changes nothing for existing types (new numbers), but the
qualified-name detection refactor (§5.1) must produce **identical ids** for
`Date`/`Map`/`Set` as today, or every existing cache hash shifts. The refactor
must be proven id-stable for the current builtins (golden-hash test) before
adding Temporal.

## 6. Suggested phasing

1. **Phase 0 — lib/scanner spike (blocking).** Determine how `Temporal.*`
   resolves in the patched tsgo (§5.2), and prototype namespace-qualified
   detection (§5.1) with an id-stability test for existing builtins.
2. **Phase 1 — plain types, value-only (no formats).** New SubKinds; shared
   builtin table; isType/getTypeErrors (`instanceof`), prepare/stringify/restore
   (`toJSON`/`from`), string-based binary, mock. All eight types.
3. **Phase 2 — Temporal format family (`FormatTemporalX<P>`).** Add the names to
   the §3.1 brand-lift tables + `TypeFormatBase`; min/max via `Temporal.<T>.compare`
   and `Temporal.Now.*` + `Duration.from`; reuse the existing relative-duration
   grammar. Mirrors the `FormatDate` work.
4. **Phase 3 — binary packing optimization (optional).** Bespoke compact
   encoders for the high-volume types (Instant/ZonedDateTime/PlainDate).

## 7. Test surface (mirror the Date suites)

- Go: structural-id + scanner fixtures (qualified detection, id stability), per
  per-family emit assertions (one per RT-fn, per type), the essential
  param-validation matrix if Phase 2 lands. Mirror
  `internal/resolver/native_date_format_test.go` and the serialization
  round-trip suites.
- JS: mirror the Date entries in `packages/ts-go-run-types/test/suites/serialization/`
  (the `date` case wires `unsafeEncoder`/`safeEncoder`/`safeDecoder`/
  `binaryEncoder`/`binaryDecoder` + `getTestData` with a `new Date(...)`) — add
  one analogous case per Temporal type with `getTestData: () => ({values:
[Temporal.<T>.from('…')]})`. Plus isType/getTypeErrors with real Temporal
  instances, round-trip equality via `Temporal.<T>.equals` (Temporal instances
  are not deep-equal by value the way Dates compare — use the type's own
  `equals`/`compare`), binary round-trip, and mock validity. Paired static +
  reflection per the marker-coverage rule in CLAUDE.md. Relative-bound tests
  need a pinned clock — **verify Temporal.Now honors `vi.setSystemTime`** (it
  reads the host clock; if fake timers don't intercept it, inject the "now"
  differently).

## 8. Effort summary

| Area                                              | New / changed      | Risk                        |
| ------------------------------------------------- | ------------------ | --------------------------- |
| SubKinds (×8) + JS mirror + gen                   | small, mechanical  | low                         |
| Shared builtin table + replace scattered switches | medium refactor    | **medium** (id stability)   |
| Namespace-qualified scanner detection             | new logic          | **high** (the main unknown) |
| lib resolution / ambient overlay                  | config or overlay  | **high** (gates everything) |
| isType / getTypeErrors arms (×8)                  | small per type     | low                         |
| prepare / stringify / restore arms (×8)           | small, Date-shaped | low                         |
| binary arms (×8, string-based)                    | medium             | low–medium                  |
| mock builders (×8)                                | small per type     | low                         |
| Temporal format family (Phase 2)                  | medium             | medium                      |

The serialization/validation per-type work is genuinely small and well-templated
by `Date`. **The cost and risk live almost entirely in two upstream gates: lib
resolution (§5.2) and namespace-qualified detection (§5.1).** Those should be
spiked first; if either proves impractical with the patched tsgo, the whole
effort stalls regardless of how clean the per-family arms are.
