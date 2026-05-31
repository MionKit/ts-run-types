# `IsTypeOptions` — backend architecture notes

Snapshot of the Go-side changes that landed when `RunTypeOptions` was
renamed to `IsTypeOptions` and decoupled from the structural type id.
This is a **working doc for future review** — some pieces here are
known to be removable once tangential issues are addressed; those are
flagged inline under **TO REVISIT**.

## Goal

Make the structural type id a pure function of `T` only. Options the
caller passes to `createIsType<T>(…, options)` (and friends) parameterise
the **generated function**, not the **type**. Idempotency invariants:

- Same `T`, any option combination → same `Site.ID`.
- Different `(family, options)` tuples → different cached factories.
- Marker form and schema form converge on the same cached factory
  when they reach the same `(typeid, options)` pair.

The first two are now fully enforced. The third is enforced
post-hoc via the schema-form scan path (see §3) — but only because of
a typeid mismatch that should be fixable upstream (see **TO REVISIT**
in §3).

## 1. `protocol.Site` extended

[internal/protocol/protocol.go](../internal/protocol/protocol.go) — two
new fields on the wire shape:

- **`Options []string`** — per-call-site `IsTypeOptions` tuple
  (sorted by registry order, true booleans only). Empty for calls
  without options.
- **`EmitOnly bool`** — marks a Site that drives variant emission but
  corresponds to NO source rewrite. The Vite-plugin rewriter filters
  these out in [rewrite.ts](../packages/vite-plugin-runtypes/src/rewrite.ts);
  the emitter consumes them like any other Site.

**TO REVISIT:** `EmitOnly` exists solely to support the schema-form
scan path. If §3's typeid mismatch is fixed at the source, the
schema-form scan can go away — and with it, `EmitOnly`. See §3.

## 2. Type id is options-independent

[internal/resolver/scan.go](../internal/resolver/scan.go) — the id-
resolution block shrank dramatically. Removed:

- The `noLiterals` type-swap (`Checker_getBaseTypeOfLiteralType` +
  the `UniqueESSymbol` escape hatch).
- The `SerializeArrayWithFlags` call for `noIsArrayCheck`.

What's left is `cache.AssignID(typeArgument)` plus the structural
regex-literal harvest. `SerializeArrayWithFlags` was deleted entirely
from [serialize.go](../internal/compiled/runtype/serialize.go).

## 3. Two scan paths feed `dump.Sites`

**Primary path:** [`scanCall`](../internal/resolver/scan.go) — the
InjectRunTypeId-marker walk. `extractIsTypeOptions` populates
`Site.Options`.

**Schema-form path (new):**
[`schemaFormVariantSite`](../internal/resolver/scan.go) — after a
successful `scanCall`, checks whether the call sits at slot 0 of an
enclosing `createIsTypeFor` / `createTypeErrorsFor` whose options
literal carries true booleans. If yes, emits a SECOND Site with:

- `ID = <builder's already-resolved id>`
- `Options = <enclosing call's options>`
- `EmitOnly = true`

[`isSchemaFormFactory`](../internal/resolver/scan.go) detects the
enclosing call via signature-declaration name match + package-name
gate (same gate the InjectRunTypeId scanner uses).

### Why this exists

`RT.array(RT.string())` resolves to TS type `Array<FormatString<{}>>`
(branded) while the marker form `createIsType<string[]>()` resolves to
`string[]` (plain). The Go side respects TS structural identity — two
different TS types, two different `cache.AssignID` results. So the
schema-form factory and the marker-form factory live under
**different cache keys**.

For the plain case this is invisible — both validators behave
identically on the same payloads, and the test suite passes because
behaviour matches even when the cache identities differ.

For the **variant** case it matters: the marker form's
`{noIsArrayCheck: true}` emits `itNA_<markerID>` against the plain
`string[]` id. The schema form's lookup, with the SAME option, builds
`itNA_<schemaID>` against the branded id — which doesn't exist in the
cache. The schema-form scan path emits the missing variant entry.

### TO REVISIT

**This whole scan path is a workaround for a typeid mismatch that
should be fixable upstream.** The builder signature for `RT.string()`
is:

```ts
export function string<const P extends StringParams = Record<string, never>>(
  …,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>,
): RunType<LeafType<'stringFormat', P>>;
```

The `LeafType<'stringFormat', P>` brand is what gives the schema form
its distinct typeid. If the builder's `T` was sharpened so that
`RT.string()` (no params) returns a `RunType<string>` and only
`RT.string({maxLength: 5})` returns the branded form — then `RT.array(
RT.string())` would resolve to plain `string[]` and the schema form
would land on the marker form's cache key directly. The schema-form
scan path + `EmitOnly` Site mechanism would no longer be needed.

If that refinement lands, **remove**:

- `schemaFormVariantSite` and its helpers (`isSchemaFormFactory`,
  `readIsTypeOptionsLiteral`) in
  [scan.go](../internal/resolver/scan.go).
- `Site.EmitOnly` field in
  [protocol.go](../internal/protocol/protocol.go).
- The `EmitOnly` filter in
  [rewrite.ts](../packages/vite-plugin-runtypes/src/rewrite.ts).
- The extra-Site append in `dispatchScanFiles`'s callback.

The variant fan-out itself (§4) is independent and stays.

## 4. Variant fan-out in the emitter

[internal/compiled/typefns/module.go](../internal/compiled/typefns/module.go):

- **`collectIsTypeVariants(sites, enable)`** — groups `dump.Sites` by
  `(typeid, canonical-suffix)`, deduplicating option tuples. Only
  enabled for emitters that honour variants (`supportsIsTypeVariants`
  gate; today only `IsTypeEmitter` and `TypeErrorsEmitter`).
- **`RenderFnModule`** — inner loop iterates `(RunType, variant)`
  pairs. One plain entry plus N variant entries per id.
- **`renderEntryWithDeps`** — gained `variantSuffix string,
  variantOptions []string`. Cache key shape:
  `<tag><suffix>_<id>` (e.g. `itNA_<id>`); variant factory's printed
  name follows: `g_itNA_<id>`.
- **`Walker.VariantOptions`** ([walker.go](../internal/compiled/typefns/walker.go))
  — new field; renderer primes it on the variant walker only.
  Emitters read via `EmitContext.HasVariantOption(name)`.
- **`Walker.InnerPrefix` stays plain** for variant walkers. Child dep-
  calls resolve to plain `<tag>_<childID>` entries — variants only
  change the ROOT body; children retain normal validation. (This
  matches mion's root-scoped option semantics.)

## 5. Variant bodies

- **`noIsArrayCheck`**: drops the leading `Array.isArray(v)` guard at
  the array's emit root. [istype.go](../internal/compiled/typefns/istype.go)
  + [typeerrors.go](../internal/compiled/typefns/typeerrors.go) — the
  legacy `hasFlag(rt.Flags, "noIsArrayCheck")` is gone, replaced by
  `ctx.HasVariantOption("noIsArrayCheck")`.
- **`noLiterals`**: new
  [`emitLiteralBaseKind`](../internal/compiled/typefns/istype.go)
  helper emits the base-kind validator (`typeof v === 'string'`,
  `Number.isFinite(v)`, etc.) instead of the literal-exact check.
  Symbol-flavoured literals propagate `CodeNS` (unsupported leaf)
  so the alwaysThrow path fires, matching the plain `KindSymbol`
  arm's design.
- **`rootCodeMap.codeFor`** ([diag_codes.go](../internal/compiled/typefns/diag_codes.go))
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

[renderEntryWithDeps](../internal/compiled/typefns/module.go) — all
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

- **`IsTypeOption`** struct (`Name`, `Letter`) and **`IsTypeOptions`**
  ordered slice. Declaration order is load-bearing — variant suffix
  concatenates letters in this order so existing variant keys stay
  stable as new options append to the tail.
- **`IsTypeVariantSuffix(names []string) string`** — canonical suffix
  builder.
- Mirrored byte-for-byte on the JS side via
  [`isTypeOptionsConstants.generated.ts`](../packages/ts-go-run-types/src/runtypes/isTypeOptionsConstants.generated.ts)
  (`buildIsTypeVariantSuffix`).
- **`gen-ts-constants`** now writes TWO files in one invocation:
  the full registry for the Vite plugin (unchanged shape) and the
  IsTypeOptions-only file for the marker package's runtime cache-key
  construction.

## 8. Build-time diagnostics

[internal/diag/codes_marker.go](../internal/diag/codes_marker.go):

- **`MKR004`** (`CodeIsTypeOptionsNoLiteralsNoop`) — `noLiterals: true`
  requested on a non-literal type. Warning severity.
- **`MKR005`** (`CodeIsTypeOptionsNoArrayNoop`) — `noIsArrayCheck: true`
  requested on a non-array type. Warning severity.

Emitted by
[`noopIsTypeOptionDiag`](../internal/resolver/scan.go), anchored at the
options-literal node. The variant factory is still materialised
(always-emit invariant — JS can't tell at runtime whether an option
is meaningful for a given T), so the diagnostic is the only signal.

## Test coverage

- Go: `TestResolver_IsTypeOptions_DoNotChangeID` and
  `TestResolver_IsTypeOptions_NoLiteralsNoop` in
  [atomic_test.go](../internal/resolver/atomic_test.go).
- Go: `TestIsTypeModule_ArrayNoIsArrayCheck` rewritten to drive the
  variant via `dump.Sites` instead of the legacy `rt.Flags` field.
- JS: [`isTypeOptionsDispatch.test.ts`](../packages/ts-go-run-types/test/adapters/isTypeOptionsDispatch.test.ts)
  — type-id idempotency, variant dispatch identity, behaviour
  divergence, schema/marker convergence, combo-variant suffix.
- JS: previously-`'not-supported'` schema-form slots in
  [Array.ts](../packages/ts-go-run-types/test/suites/validation/Array.ts)
  (`string_array_noIsArrayCheck`) are now real `createIsTypeFor` /
  `createTypeErrorsFor` calls.

## Open questions for future review

1. **Schema-form scan path (§3).** Most impactful cleanup target.
   Refine builder signatures so unparameterised builders return plain
   `RunType<T>` instead of `RunType<LeafType<…, {}>>` — then the
   schema-form scan path, `EmitOnly`, and the rewriter filter all
   become removable.
2. **Symbol-literal + noLiterals throw (§5).** Re-examine whether the
   explicit opt-in changes the design rationale enough to allow the
   variant body instead of throwing.
3. **Variant disk caching (§6).** Only if/when re-rendering shows up
   in profiles.
4. **`supportsIsTypeVariants` gate.** Currently a hard-coded type
   switch on `IsTypeEmitter` / `TypeErrorsEmitter`. If a third family
   ever honours `IsTypeOptions`, this becomes a capability method on
   the `Emitter` interface — cheap refactor.
