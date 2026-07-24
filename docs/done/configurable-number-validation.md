---
type: feature
spec: guidelines
status: ready
created: 2026-07-24
---

# Configurable number-validation behaviour (align emitted validate code with other libraries)

## Intent

RunTypes validators hard-code `Number.isFinite(v)` for the `number` kind, so they reject
`NaN`, `Infinity`, and `-Infinity` everywhere. Most other libraries only check
`typeof v === 'number'` and accept the non-finite values. That divergence is a migration
speed-bump for teams moving onto RunTypes from a looser library: a payload their old
validator accepted now fails.

Make the emitted number check **configurable** so a project can opt its validators into
another library's number semantics. This is the first of a planned family of
"behaviour alignment" knobs (later candidates: optional-vs-`undefined` handling, object
plain-guard strictness, etc.), so the config surface should be designed to grow **without
adding a new flag per knob**.

The knob is `ValidateOptions.numberMode`, with three variants:

- `isFinite` (default, current behaviour) — `Number.isFinite(v)`; rejects NaN + Infinity.
  Matches zod (`.finite()`) and TypeBox.
- `typeof` — `typeof v === 'number'`; accepts NaN + Infinity. Matches ajv, typia, and
  raw JSON Schema `{ "type": "number" }`.
- `notNaN` — `typeof v === 'number' && !Number.isNaN(v)`; rejects NaN, accepts Infinity.
  A middle ground; matches no audited competitor exactly, kept as a reasonable option.

Keep `isFinite` the default: the existing
[cross-library alignment report](../cross-library-validation-alignment-report.md)
recommends it as the safer default for JSON/persistence use cases, and RunTypes sits with
the majority (zod + TypeBox) rather than being the strict outlier.

## Direction

The implementer investigates and pins the exact plumbing; these are the verified anchors.

**Config home — extend the existing `ValidateOptions` bag, and expose ONE defaults object
(not separate flags).** There is already a purpose-built home for validate-behaviour
toggles: the per-call-site `ValidateOptions` bag
(`packages/ts-runtypes/src/createRTFunctions.ts:25`) — `noLiterals`, `noIsArrayCheck`,
`rejectCircularRefs`. `numberMode` belongs there, next to its siblings, and the
Go-side registry it feeds (`constants.ValidateOptions`, `ts-go-runtypes/internal/constants/constants.go:208`)
is table-driven for adding knobs (`constants.go:200-207`: append registry entry
→ add TS field → teach emitter → regen mirror). Scope fits exactly — the number check is
emitted only in validate/validationErrors (encoders/decoders emit none).

For the **project-wide, set-once migration** need, do NOT add a per-knob global flag. Add
**one** `validate?: Partial<ValidateOptions>` defaults object to the compilation config
(`PluginOptions` in `packages/ts-runtypes-devtools/src/unplugin.ts`, and the `tsRuntypesPlugin`
struct in `ts-go-runtypes/cmd/ts-runtypes/config.go`), and have the scanner merge it into
each validate/validationErrors call site.

**Merge is per FIELD, site-wins-per-field — a partial global object only fills the fields it
declares.** For every `ValidateOptions` field independently: `effective[field] =
siteHasField ? siteValue : globalHasField ? globalDefault : unset`. A global `{numberMode:
'typeof'}` must NEVER clobber a site's `noLiterals`/`noIsArrayCheck` (or any field it does not
itself declare), and a site's per-field value always wins over the global default for that
field. This is the load-bearing contract as more fields join the object later — do not
implement it as a whole-object override.

**Caching — rides the existing fnHash variant, NO new fingerprint field, NO per-knob flag.**
Per-site `ValidateOptions` don't fold into the typeid; they fork the fnHash variant
(`scan.go:634-635`), keyed like `valNA_<id>`. Feed the *effective* (merged) option set into
`ValidateVariantSuffix`/`FnHashFor` (`ts-go-runtypes/internal/cachegen/operations/fnhash.go`)
and the cache key already encodes the choice: changing the global default changes the
effective set → changes the fnHash → different key, so stale entries are never cross-read.
This is exactly why the defaults-object route beats a separate global flag — a global flag
changes the body *without* changing the fnHash and would need a `diskcache` fingerprint bump
(like `emitMode`); routing through the per-site option set makes the existing key machinery
self-protecting.

**Emit sites — branch exactly these 4 base-number checks (all in the validate lane):**

1. `ts-go-runtypes/internal/cachegen/typefunctions/validate.go:217-221` — `emitKindDefault`
   `KindNumber` arm. Primary; also feeds the union-inline leaf path.
2. `ts-go-runtypes/internal/cachegen/typefunctions/validate.go:1490-1494` — `emitLiteralBaseKind`
   widened numeric-literal variant.
3. `ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go:190-196` — errors-path
   `KindNumber` arm.
4. `ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go:150-158` — `baseKindGuard`;
   must branch in lockstep with site 1 or validate vs validationErrors diverge for
   format-branded numbers.

Encoders/decoders emit no number validation (byte read/write only) — leave them. Number
**formats** (int, min/max, multipleOf) AND-chain *after* the base check at `validate.go:200`
and in `numberformat.go` — do not touch the format emitter; the option only swaps the base.
Note the base swap is partly masked for constrained formats (`Number.isInteger` and bounded
comparisons already reject NaN/Infinity), so the observable change concentrates on the plain
`number` kind and unbounded floats.

**Watch-outs the implementer should expect:**

- **The enum doesn't fit the boolean-presence token scheme.** The registry contributes a
  single letter iff an option is *present* (`ValidateVariantSuffix`, `constants.go:222`), and
  the extractor reads `<option>: true` (`scan.go:1092`). `numberMode` has three values, so
  the extractor must read a **string** initializer (mirror `extractStrategyOption`,
  `scan.go:976`) and the suffix must encode it. Chosen encoding: model the two non-default
  values as internal canonical option names appended to the registry — default `isFinite` →
  no name/letter (keeps existing `val_<id>` keys stable), `typeof`/`notNaN` → distinct
  letters. The power-set collision guard (`fnhash.go:116+`) then covers them automatically.
- **Scanner seeds every val/verr site from the global default per field**, including sites
  with no options literal (today `extractValidateOptions`, `scan.go:1094`, returns only what
  the literal carries). Apply the per-field merge above.
- **No numberMode no-op diagnostic.** Unlike `noLiterals`/`noIsArrayCheck`, whose no-op check
  (MKR004/MKR005, `codes_marker.go:38-39`, fired at `scan.go:622-627`) is a cheap ROOT-kind
  test, "does this type contain no number anywhere" is a whole-graph question. Skip a
  numberMode no-op in v1 — which also sidesteps the "a global default fires the warning on
  every non-number site" problem entirely.
- Byte-exact tests pin the current `Number.isFinite(v)` output and must be updated:
  `ts-go-runtypes/internal/cachegen/typefunctions/module_test.go` (~`:186,486,627,675,736`)
  and `union_inline_leaf_test.go:219-220`. The fnHash subset tests
  (`operations/fnhash_test.go`) exercise the ValidateOptions subsets — extend for the new
  option.
- Purity needs no change — `Number`, `isNaN`, `isFinite`, `Number.isInteger` are already
  allowlisted (`purefunctions/purityrules.go`), and `typeof` is inherently pure.
- The noop predicate is unaffected: `number` is non-noop for validate/validationErrors and
  the JSON/binary noop verdicts don't read the validate expression
  (`typefunctions/noop_types.go`) — but re-run the noop corpus test to confirm.

## Settled decisions

- **Variant set:** all three ship in v1 — `isFinite` (default), `typeof`, `notNaN`.
- **Field name:** `numberMode` (reads `validateOptions.numberMode`).
- **Global object name:** `validate` on the compilation config, a `Partial<ValidateOptions>`.
- **Token letters:** `isFinite` → none; `typeof`/`notNaN` → two distinct letters (e.g. `T` /
  `M`), out of collision with `L`/`A`.
- **Out of scope:** the base `number` kind only — bigint, Date, and numeric formats are
  unchanged.

## Done when

- `numberMode` is a field on the per-call-site `ValidateOptions` bag, and a project-wide
  `validate` (`Partial<ValidateOptions>`) defaults object on the compilation config (plugin
  options + tsconfig plugin entry) sets the default for every validate/validationErrors call
  site, merged **per field** with per-site options winning per field.
- The emitted validate / validationErrors code changes accordingly across all 4 sites (object
  props, array/tuple elements, index signatures, union-inline leaves, numeric-literal base
  variants).
- Default is unchanged (`isFinite`) when neither surface sets the option, and existing
  `val_<id>` / `valN…_<id>` cache keys stay stable for the default.
- Distinct settings don't cross-read the cache (the effective option set forks the fnHash;
  no fingerprint bump required).
- Vitest coverage under `packages/` pins each variant's emitted output, exercising both
  factory call shapes (static `createValidateFn<T>()` and value-first `createValidateFn(value)`)
  and both `getRunTypeId` shapes where the marker API is involved, plus a runtime check that a
  `typeof`-configured validator accepts `NaN`/`Infinity` and an `isFinite` one rejects them,
  a `notNaN` one rejects `NaN` but accepts `Infinity`, AND a global-default / per-site-override
  case; Go tests (`go -C ts-go-runtypes test ./internal/...`) updated for the new emit arms and
  fnHash subsets.
- Docs updated: README/ARCHITECTURE options tables (the `ValidateOptions` bag + the new
  compilation-config defaults object), the website options docs, and a note in the alignment
  report that the divergence is now configurable.

## Plan — approved implementation (2026-07-24)

Encoding: the `ValidateOptions` axis is boolean-name-set machinery. Encode the two non-default
`numberMode` values as **internal canonical option names** (`numberTypeof`, `numberNotNaN`)
appended to `constants.ValidateOptions` with distinct letters; default `isFinite` maps to
neither (existing keys stay byte-stable). A `numberMode string` field on the scanner's
`validateOptions` bag carries the raw site value (`""` = unset) for tri-state precedence; after
the per-field merge it collapses to the synthetic name in `enabled`, and everything downstream
(`Names()`, `ValidateVariantSuffix`, `FnHashFor`, wire `Options []string`, walker
`VariantOptions`, `HasVariantOption`, generated `VALIDATE_OPTION_LETTERS`, collision guard)
works unchanged.

**Go — scanner/model:** `constants/constants.go` (two registry entries + `NumberModeOptionName(value)`
mapping); `resolver/scan.go` (`numberMode` field on `validateOptions`; string arm in
`extractValidateOptions`; per-field merge with `sess.opts.ValidateDefaults` in `analyzeCall`,
site-wins-per-field); `resolver/resolver.go` (`Options.ValidateDefaults struct{ NumberMode string }`).

**Go — global plumbing (mirror `size`):** `cmd/ts-runtypes/config.go` (`Validate *validatePluginConfig`
`json:"validate"` + sub-struct `{ NumberMode string \`json:"numberMode"\` }`); `main.go`
(`--number-mode` flag → `resolver.Options.ValidateDefaults`); `buildconfig.go` (`mergeBuildOptions`:
flag > `plugin.Validate.NumberMode` > "").

**Go — emitter:** `typefunctions/emitter.go` `EmitContext.NumberMode()` helper; branch the 4 sites
(`isFinite`→`Number.isFinite(v)`, `typeof`→`typeof v === 'number'`, `notNaN`→`(typeof v === 'number'
&& !Number.isNaN(v))`); thread `ctx` into `emitLiteralBaseKind` + `baseKindGuard` (callers have it).

**Regenerated mirrors:** `pnpm rtx core codegen fnhashes` (letters + variants) and `pnpm rtx core
codegen pluginkeys` (`validate` key) — both drift-gated by `codegen all --check`.

**JS:** `createRTFunctions.ts` (`ValidateOptions.numberMode?: 'isFinite'|'typeof'|'notNaN'`);
`fnHash.ts` (`FnHashOptions.numberMode?: string` + value→synthetic-name mapping in
`validateVariantToken`); `unplugin.ts` (`PluginOptions.validate` + flatten in `ensureResolver`);
`plugin-option-keys.ts` (`validate: true`); `resolver-client.ts` (`ResolverClientOptions.numberMode`
+ `--number-mode` in `buildResolverArgs`). Rebuild devtools dist.

**Fixture overlays:** add `numberMode` to `ts-runtypes-devtools/test/helpers/inline.ts:39` and
`ts-go-runtypes/internal/testfixtures/runtypes.d.ts`.

**Tests:** Go — emitted-body per mode across positions (`typefunctions/module_test.go`, updating the
`Number.isFinite` pins), scanner string-read + per-field merge (`resolver/atomic_test.go`), fnHash
subsets (`operations/fnhash_test.go`). JS — `validateOptionsDispatch.test.ts` (distinct fns +
behaviour + suffix), `rt-validate.test.ts` (emitted body), `tsconfig-config.test.ts` (global default
+ precedence + per-site override), `resolver-args.test.ts` (`--number-mode` argv),
`getFnHash.test.ts` (JS↔Go parity). Both factory shapes + both `getRunTypeId` shapes per the marker
rule. **Not a fuzz candidate** (a fixed deterministic accept/reject switch; no round-trip/oracle
property).

**Known trade-off:** a project-wide non-default `numberMode` materializes the variant key on every
validate site including number-free types (byte-identical body) — a harmless duplicate entry, like a
no-op `noLiterals` variant (`scan.go:845`). Not worth a scan-time type walk in v1.

**Docs:** README/ARCHITECTURE options tables; `container/website/content/` options docs (house voice,
`<code-import>` example); alignment-report note.
