# `ValidateOptions` — backend architecture notes

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `ts-runtypes-devtools`, and `reflectRunTypeId(value)` is now `getRunTypeId(value)`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

> **⚠️ Schema-form options updated.** The schema form is now a `createValidateFn` /
> `createGetValidationErrorsFn` **overload** (`createValidateFn(schema, options)`), not the
> separate `createValidateFor`/`createValidationErrorsFor` functions. Options ride the
> overload call's OWN options slot (read by `extractValidateOptions` like any
> marker), so the `schemaFormOptions` builder-fold and the `CompTimeRunType`
> marker described below were **removed**. The runtime still dispatches on the
> schema's `.id` (so recursive schemas use the builder's id); for a non-recursive
> schema that id equals the reflected-`T` id by convergence, so the options
> variant emitted from the call's Site resolves correctly.

Snapshot of the Go-side changes that landed when `RunTypeOptions` was
renamed to `ValidateOptions` and decoupled from the structural type id.
This is a **working doc for future review** — some pieces here are
known to be removable once tangential issues are addressed; those are
flagged inline under **TO REVISIT**.

## Goal

Make the structural type id a pure function of `T` only. Options the
caller passes to `createValidateFn<T>(…, options)` (and friends) parameterise
the **generated function**, not the **type**. Idempotency invariants:

- Same `T`, any option combination → same `Site.ID`.
- Different `(family, options)` tuples → different cached factories.
- Marker form and schema form converge on the same cached factory
  when they reach the same `(typeid, options)` pair.

The first two are now fully enforced. The third is also enforced
directly: the earlier typeid mismatch (schema vs marker forms hashing
differently) was fixed **at the source** — the leaf builders no longer
brand their no-params return — so `createValidateFor(RT.array(RT.string()))`
and `createValidateFn<string[]>()` resolve to one id. See
[SCHEMA-FORM-TYPEID-CONVERGENCE.md](SCHEMA-FORM-TYPEID-CONVERGENCE.md)
and §3 below.

## 1. `protocol.Site` extended

[internal/protocol/protocol.go](../internal/protocol/protocol.go) — one
new field on the wire shape:

- **`Options []string`** — per-call-site `ValidateOptions` tuple
  (sorted by registry order, true booleans only). Empty for calls
  without options.

> The short-lived `EmitOnly bool` field (a Site that drove variant
> emission with no source rewrite, for the schema-form scan path) has
> been **removed** — §3's typeid mismatch was fixed at the source, so the
> schema form's options now ride on the builder's own Site instead.

## 2. Type id is options-independent

[internal/compiler/resolver/scan.go](../internal/compiler/resolver/scan.go) — the id-
resolution block shrank dramatically. Removed:

- The `noLiterals` type-swap (`Checker_getBaseTypeOfLiteralType` +
  the `UniqueESSymbol` escape hatch).
- The `SerializeArrayWithFlags` call for `noIsArrayCheck`.

What's left is `cache.AssignID(typeArgument)`. `SerializeArrayWithFlags`
was deleted entirely from
[serialize.go](../internal/cachegen/runtype/serialize.go).

## 3. Schema-form options ride on the builder's Site (DONE)

**Primary (only) path:** [`scanCall`](../internal/compiler/resolver/scan.go) — the
InjectRunTypeId-marker walk. `extractValidateOptions` populates
`Site.Options` for the marker forms (`createValidateFn<T>(…, options)`).

**Schema forms** (`createValidateFor(schema, options)` /
`createValidationErrorsFor`) are NOT markers — they read `schema.id` at
runtime. That id is owned by the **builder** call (`RT.array(…)`,
`RT.regexp()`, `RT.object({…})`), which IS a marker and resolves the
id — including recursive interning the type alone can't reproduce. To
make a schema-form `options` call
materialise its variant factory, [`scanCall`](../internal/compiler/resolver/scan.go)
folds the enclosing factory's options onto **that builder's own Site**:
[`schemaFormOptions`](../internal/compiler/resolver/scan.go) checks whether the
builder sits at slot 0 of a `createValidateFor` / `createValidationErrorsFor`
call ([`isSchemaFormFactory`](../internal/compiler/resolver/scan.go) +
[`readValidateOptionsLiteral`](../internal/compiler/resolver/scan.go)) and ORs its
option bits into the builder Site's `Options`. No second Site, no
`EmitOnly`, no rewriter filter.

### Why the duplication is gone

`RT.string()` used to default its generic `P` to `Record<string, never>`,
so it returned the branded `RunType<LeafType<'stringFormat', {}>>` and
`RT.array(RT.string())` resolved to `Array<FormatString<{}>>` — a
DIFFERENT structural id than the marker form's plain `string[]`. The leaf
builders are now **overloaded** so the no-params call returns the plain
base type (`RunType<string>`) and only the params-present call is branded.
`RT.array(RT.string())` now resolves to plain `string[]`, so schema and
marker forms share one id and one variant cache key directly — the old
schema-form scan path (`schemaFormVariantSite` + `EmitOnly` + the
rewriter filter) is gone. Full rationale + the builder list:
[SCHEMA-FORM-TYPEID-CONVERGENCE.md](SCHEMA-FORM-TYPEID-CONVERGENCE.md).

The variant fan-out itself (§4) is independent and stays.

## 4. Variant fan-out in the emitter

[internal/cachegen/typefunctions/module.go](../internal/cachegen/typefunctions/module.go):

- **`collectValidateVariants(sites, enable)`** — groups `dump.Sites` by
  `(typeid, canonical-suffix)`, deduplicating option tuples. Only
  enabled for emitters that honour variants (`supportsValidateVariants`
  gate; today only `ValidateEmitter` and `ValidationErrorsEmitter`).
- **`RenderFnModule`** — inner loop iterates `(RunType, variant)`
  pairs. One plain entry plus N variant entries per id.
- **`renderEntryWithDeps`** — gained `variantSuffix string,
  variantOptions []string`. Cache key shape:
  `<tag><suffix>_<id>` (e.g. `valNA_<id>`); variant factory's printed
  name follows: `g_valNA_<id>`.
- **`Walker.VariantOptions`** ([walker.go](../internal/cachegen/typefunctions/walker.go))
  — new field; renderer primes it on the variant walker only.
  Emitters read via `EmitContext.HasVariantOption(name)`.
- **`Walker.InnerPrefix` stays plain** for variant walkers. Child dep-
  calls resolve to plain `<tag>_<childID>` entries — variants only
  change the ROOT body; children retain normal validation. (This
  matches mion's root-scoped option semantics.)

## 5. Variant bodies

- **`noIsArrayCheck`**: drops the leading `Array.isArray(v)` guard at
  the array's emit root. [istype.go](../internal/cachegen/typefunctions/istype.go)
  + [typeerrors.go](../internal/cachegen/typefunctions/typeerrors.go) — the
  legacy `hasFlag(rt.Flags, "noIsArrayCheck")` is gone, replaced by
  `ctx.HasVariantOption("noIsArrayCheck")`.
- **`noLiterals`**: new
  [`emitLiteralBaseKind`](../internal/cachegen/typefunctions/istype.go)
  helper emits the base-kind validator (`typeof v === 'string'`,
  `Number.isFinite(v)`, etc.) instead of the literal-exact check.
  Symbol-flavoured literals propagate `CodeNS` (unsupported leaf)
  so the alwaysThrow path fires, matching the plain `KindSymbol`
  arm's design.
- **`rootCodeMap.codeFor`** ([diag_codes.go](../internal/cachegen/typefunctions/diag_codes.go))
  — extended to recognise a `KindLiteral` with the `symbol` flag and
  route it to the symbol-root diag code, so the alwaysThrow factory
  wires correctly when `noLiterals` lands on a symbol literal.

**TO REVISIT:** The symbol-literal-with-noLiterals throw is a design
choice inherited from `KindSymbol`'s unsupported status. With
`noLiterals` the user EXPLICITLY opts into the broad
`typeof v === 'symbol'` check, so arguably it's no longer
"misleading". Could revisit the policy — but currently we throw, and
that's tested.

## 6. Disk cache stays plain-only

[renderEntryWithDeps](../internal/cachegen/typefunctions/module.go) — all
three `writeCachedEntry` call sites (unsupported / noop / normal) are
wrapped in `if variantSuffix == ""`. The disk-cache layout key is
`(runType.ID, settings.Tag)` with no variant dimension; persisting
variant lines would alias incorrectly. `tryReadCachedEntry` is
likewise gated to plain-only.

**TO REVISIT:** If variants become hot enough to merit disk caching,
the layout key needs to grow a variant-suffix dimension. Today the
variant body is cheap to re-render, so this is fine.

## 7. Shared opt-token registry

[internal/constants/constants.go](../internal/constants/constants.go):

- **`ValidateOption`** struct (`Name`, `Letter`) and **`ValidateOptions`**
  ordered slice. Declaration order is load-bearing — variant suffix
  concatenates letters in this order so existing variant keys stay
  stable as new options append to the tail.
- **`ValidateVariantSuffix(names []string) string`** — canonical suffix
  builder.
- Mirrored byte-for-byte on the JS side via
  [`validateOptionsConstants.generated.ts`](../packages/ts-go-run-types/src/runtypes/validateOptionsConstants.generated.ts)
  (`buildValidateVariantSuffix`).
- **`gen-ts-constants`** now writes TWO files in one invocation:
  the full registry for the Vite plugin (unchanged shape) and the
  ValidateOptions-only file for the marker package's runtime cache-key
  construction.

## 8. Build-time diagnostics

[internal/diagnostics/codes_marker.go](../internal/diagnostics/codes_marker.go):

- **`MKR004`** (`CodeValidateOptionsNoLiteralsNoop`) — `noLiterals: true`
  requested on a non-literal type. Warning severity.
- **`MKR005`** (`CodeValidateOptionsNoArrayNoop`) — `noIsArrayCheck: true`
  requested on a non-array type. Warning severity.

Emitted by
[`noopValidateOptionDiag`](../internal/compiler/resolver/scan.go), anchored at the
options-literal node. The variant factory is still materialised
(always-emit invariant — JS can't tell at runtime whether an option
is meaningful for a given T), so the diagnostic is the only signal.

## Test coverage

- Go: `TestResolver_ValidateOptions_DoNotChangeID` and
  `TestResolver_ValidateOptions_NoLiteralsNoop` in
  [atomic_test.go](../internal/compiler/resolver/atomic_test.go).
- Go: `TestValidateModule_ArrayNoIsArrayCheck` rewritten to drive the
  variant via `dump.Sites` instead of the legacy `rt.Flags` field.
- JS: [`validateOptionsDispatch.test.ts`](../packages/ts-go-run-types/test/adapters/validateOptionsDispatch.test.ts)
  — type-id idempotency, variant dispatch identity, behaviour
  divergence, schema/marker convergence, combo-variant suffix.
- JS: previously-`'not-supported'` schema-form slots in
  [Array.ts](../packages/ts-go-run-types/test/suites/validation/Array.ts)
  (`string_array_noIsArrayCheck`) are now real `createValidateFor` /
  `createValidationErrorsFor` calls.

## Open questions for future review

1. **Schema-form scan path (§3). DONE.** Builder signatures were
   overloaded so unparameterised builders return plain `RunType<T>`
   instead of `RunType<LeafType<…, {}>>`; the schema-form scan path, the
   `EmitOnly` field, and the rewriter filter were all removed. Schema-form
   options now fold onto the builder's own Site. See §3 and
   [SCHEMA-FORM-TYPEID-CONVERGENCE.md](SCHEMA-FORM-TYPEID-CONVERGENCE.md).
2. **Symbol-literal + noLiterals throw (§5).** Re-examine whether the
   explicit opt-in changes the design rationale enough to allow the
   variant body instead of throwing.
3. **Variant disk caching (§6).** Only if/when re-rendering shows up
   in profiles.
4. **`supportsValidateVariants` gate.** Currently a hard-coded type
   switch on `ValidateEmitter` / `ValidationErrorsEmitter`. If a third family
   ever honours `ValidateOptions`, this becomes a capability method on
   the `Emitter` interface — cheap refactor.
