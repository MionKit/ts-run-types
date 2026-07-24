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

Proposed variants for the number knob:

- `isFinite` (default, current behaviour) — `Number.isFinite(v)`; rejects NaN + Infinity.
  Matches zod (`.finite()`) and TypeBox.
- `typeof` — `typeof v === 'number'`; accepts NaN + Infinity. Matches ajv, typia, and
  raw JSON Schema `{ "type": "number" }`.
- `nonNaN` — `typeof v === 'number' && !Number.isNaN(v)`; rejects NaN, accepts Infinity.
  A middle ground; note it matches no audited competitor exactly (see Open questions).

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
`rejectCircularRefs`. `numberValidate` belongs there, next to its siblings, and the
Go-side registry it feeds (`constants.ValidateOptions`, `ts-go-runtypes/internal/constants/constants.go:208`)
is explicitly table-driven for adding knobs (`constants.go:200-207`: append registry entry
→ add TS field → teach emitter → regen mirror). Scope fits exactly — the number check is
emitted only in validate/validationErrors (encoders/decoders emit none).

For the **project-wide, set-once migration** need, do NOT add a per-knob global flag. Add
**one** `validate?: ValidateOptions` defaults object to the compilation config
(`PluginOptions` in `packages/ts-runtypes-devtools/src/unplugin.ts`, and the `tsRuntypesPlugin`
struct in `ts-go-runtypes/cmd/ts-runtypes/config.go`), and have the scanner merge it with
each call site: `effective = { ...globalDefaults, ...callSiteLiteral }`, per-site wins. The
same `ValidateOptions` interface then serves both surfaces, and every future alignment knob
is just a new field on that one interface — available per-site AND as a project default with
no new plumbing.

**Caching — rides the existing fnHash variant, NO new fingerprint field, NO per-knob flag.**
Per-site `ValidateOptions` don't fold into the typeid; they fork the fnHash variant
(`scan.go:634-635`), keyed like `valNA_<id>`. Feed the *effective* (merged) option set into
`ValidateVariantSuffix`/`FnHashFor` (`ts-go-runtypes/internal/cachegen/operations/fnhash.go`)
and the cache key already encodes the choice: changing the global default changes the
effective set → changes the fnHash → different key, so stale entries are never cross-read.
This is exactly why the defaults-object route beats a separate global flag — a global flag
changes the body *without* changing the fnHash and would need a `diskcache` fingerprint bump
(like `emitMode`); routing through the per-site option set makes the existing key machinery
self-protecting. The one object still plumbs tsconfig/plugin → `resolver.Options` → scanner,
but it's one object, not N flags.

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

- **Tri-state doesn't fit the boolean-presence token scheme.** The registry contributes a
  single letter iff an option is *present* (`ValidateVariantSuffix`, `constants.go:222`), and
  the extractor reads `<option>: true` (`scan.go:1092`). `numberValidate` has three values, so
  the extractor must read a **string** initializer and the suffix must encode it — cleanest:
  default `isFinite` → no letter (keeps existing `val_<id>` keys stable), `typeof`/`nonNaN` →
  distinct letters. Update the collision-guard enumeration (`fnhash.go:116+`) to cover the new
  values.
- **Scanner must seed every val/verr site from the global defaults**, including sites with no
  options literal (today `extractValidateOptions`, `scan.go:1094`, returns only what the
  literal carries). Overlay defaults first, then the literal.
- **No-op diagnostics must not fire for defaulted options.** MKR004/MKR005
  (`ts-go-runtypes/internal/diagnostics/codes_marker.go:38-39`) fire when `noLiterals` /
  `noIsArrayCheck` land on a type they don't apply to (`scan.go:622-627`). A project-wide
  default hits every non-array/non-literal site, so these must fire only for an **explicit
  per-site** no-op, not a defaulted one. `numberValidate` on a non-number type is likewise a
  silent no-op when defaulted.
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

## Open questions (for the implementer / a follow-up decision)

- **Name of the global defaults object.** `validate` vs `validateDefaults` vs `validateOptions`
  on the compilation config. It carries a `ValidateOptions` value; pick the clearest.
- **Tri-state token letters.** Which letters encode `typeof` / `nonNaN` in the variant suffix
  (default `isFinite` omitted). Keep them out of collision with `L`/`A` and future knobs.
- **Variant naming.** Semantic names (`typeof`/`isFinite`/`nonNaN`) are proposed over library
  names (`zod`/`ajv`) because library semantics drift and are opt-in (zod's `.finite()`).
  Confirm the set; in particular `nonNaN` maps to no audited competitor exactly, so decide
  whether it earns a slot in v1 or is deferred.
- **Scope of "number".** This todo covers only the base `number` kind. Bigint, Date, and
  numeric formats are explicitly out of scope here.

## Done when

- `numberValidate` is a field on the per-call-site `ValidateOptions` bag, and a project-wide
  `validate` defaults object on the compilation config (plugin options + tsconfig plugin entry)
  sets the default for every validate/validationErrors call site, with per-site options
  overriding it.
- The emitted validate / validationErrors code changes accordingly across all 4 sites (object
  props, array/tuple elements, index signatures, union-inline leaves, numeric-literal base
  variants).
- Default is unchanged (`isFinite`) when neither surface sets the option, and existing
  `val_<id>` / `valN…_<id>` cache keys stay stable for the default.
- Distinct settings don't cross-read the cache (the effective option set forks the fnHash;
  no fingerprint bump required).
- Vitest coverage under `packages/` pins each variant's emitted output, exercising both
  `getRunTypeId` call shapes where the marker API is involved, plus a runtime check that a
  `typeof`-configured validator accepts `NaN`/`Infinity` and an `isFinite` one rejects them,
  AND a global-default-vs-per-site-override case; Go tests
  (`go -C ts-go-runtypes test ./internal/...`) updated for the new emit arms and fnHash subsets.
- Docs updated: README/ARCHITECTURE options tables (the `ValidateOptions` bag + the new
  compilation-config defaults object), the website options docs, and a note in the alignment
  report that the divergence is now configurable.
