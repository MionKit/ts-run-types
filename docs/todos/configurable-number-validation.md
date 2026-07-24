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
"behaviour alignment" knobs (later candidates: optional-vs-`undefined` handling, whether
to emit `Array.isArray` guards, object plain-guard strictness, etc.), so the config
surface should be designed to grow.

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

**Config shape — recommendation: a nested `validateBehaviour` object, not a top-level flag.**
Mirror the existing `size` option, which is the near-exact precedent (a nested object that
is *also* a build-time, fingerprinted compile option — the same combination this needs):

- Plugin surface: `validateBehaviour?: { numberValidate?: 'typeof' | 'isFinite' | 'nonNaN' }`
  on `PluginOptions` (`packages/ts-runtypes-devtools/src/unplugin.ts`, alongside `size` at
  `:67`), added to the `PLUGIN_OPTION_KEY_TABLE` parity guard
  (`packages/ts-runtypes-devtools/src/plugin-option-keys.ts`).
- tsconfig surface (canonical home for compiler knobs): a `ValidateBehaviour *validateBehaviourConfig`
  pointer field on the `tsRuntypesPlugin` struct
  (`ts-go-runtypes/cmd/ts-runtypes/config.go`, like `Size`/`I18n`), pointer so an absent key
  stays dormant on the current default. Regenerate the key mirror
  (`pnpm rtx core codegen pluginkeys`).

Grouping under `validateBehaviour` (rather than a bare `numberValidate`) keeps the coming
alignment knobs together instead of scattering flat flags across the option namespace —
exactly why `size` groups its four sizing knobs. i18n (`config.go:99,163`) is the same
nested-object shape and is the user's cited model; adopt its shape (nested + Go pointer for
dormancy) but not its plumbing lane (i18n is an enrichment/CLI option, not a build option).

**Caching — fold into the disk-cache fingerprint, NOT the fnHash.**
`numberValidate` is a global, project-wide setting that changes emitted validate bytes
uniformly, so it behaves like `emitMode`/`size`: add it to `FingerprintInputs` and bump the
version tag in `ts-go-runtypes/internal/cachegen/diskcache/fingerprint.go`, thread it through
`resolver.Options` → `RenderOpts` (`resolver.go`, `render.go`), and merge it tsc-style in
`buildconfig.go` (explicit flag > tsconfig entry > default). Do **not** fork the per-call-site
fnHash — that mechanism (`rejectCircularRefs`, via `Canonical`'s `~C` suffix) is for options
that vary between call sites within one build, which this is not. Forward it as a CLI flag in
`buildResolverArgs` (`packages/ts-runtypes-devtools/src/resolver-client.ts`, like `--emit-mode`).

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
and in `numberformat.go` — do not touch the format emitter; the flag only swaps the base.
Note the base swap is partly masked for constrained formats (`Number.isInteger` and bounded
comparisons already reject NaN/Infinity), so the observable change concentrates on the plain
`number` kind and unbounded floats.

**Watch-outs the implementer should expect:**

- Byte-exact tests pin the current `Number.isFinite(v)` output and must be updated to match
  whichever default/variant they exercise: `ts-go-runtypes/internal/cachegen/typefunctions/module_test.go`
  (~`:186,486,627,675,736`) and `union_inline_leaf_test.go:219-220`.
- Purity needs no change — `Number`, `isNaN`, `isFinite`, `Number.isInteger` are already
  allowlisted (`purefunctions/purityrules.go`), and `typeof` is inherently pure.
- The noop predicate is unaffected: `number` is non-noop for validate/validationErrors and
  the JSON/binary noop verdicts don't read the validate expression
  (`typefunctions/noop_types.go`) — but re-run the noop corpus test to confirm.

## Open questions (for the implementer / a follow-up decision)

- **Variant naming.** Semantic names (`typeof`/`isFinite`/`nonNaN`) are proposed over
  library names (`zod`/`ajv`) because library semantics drift and are opt-in (zod's
  `.finite()`). Confirm the set; in particular `nonNaN` maps to no audited competitor
  exactly, so decide whether it earns a slot in v1 or is deferred.
- **Scope of "number".** This todo covers only the base `number` kind. Bigint, Date, and
  numeric formats are explicitly out of scope here.

## Done when

- A project can set the number-validation variant via `validateBehaviour.numberValidate`
  at both config surfaces (plugin options + tsconfig plugin entry), and the emitted
  validate / validationErrors code changes accordingly across all 4 sites (object props,
  array/tuple elements, index signatures, union-inline leaves, numeric-literal base variants).
- Default is unchanged (`isFinite`) when the key is absent.
- Distinct settings don't cross-read the disk cache (fingerprint folds the option in).
- Vitest coverage under `packages/` pins each variant's emitted output, exercising both
  `getRunTypeId` call shapes where the marker API is involved, plus a runtime check that a
  `typeof`-configured validator accepts `NaN`/`Infinity` and an `isFinite` one rejects them;
  Go tests (`go -C ts-go-runtypes test ./internal/...`) updated for the new emit arms.
- Docs updated: README/ARCHITECTURE CLI-flag + options tables, the website options docs, and
  a note in the alignment report that the divergence is now configurable.
