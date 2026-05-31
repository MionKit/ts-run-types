# Schema-form ⇄ marker-form typeid convergence

> **⚠️ Note (package reorganized):** the value-first surface moved `src/define/` →
> **`src/schema/`** — `define.ts` is now `atomic.ts` (leaf builders), `compose.ts`
> holds the composers + `object`, and `static.ts` holds the type helpers (incl.
> `LeafType`); `TypeFromRT` is now `Static`. File line numbers below are approximate.

> **Status: LANDED — schema form is now a `createIsType` overload.** Convergence
> still holds (`createIsType(RT.array(RT.string()))` resolves the same id as
> `createIsType<string[]>()`), but the mechanism changed when `CompTimeRunType`
> ref-tracing + demand emission were reverted. The schema form is no longer a
> separate `createIsTypeFor` function; it is an OVERLOAD of `createIsType` /
> `createGetTypeErrors` taking a `RunType<T>` first arg. `T` is reflected off the
> trailing `InjectRunTypeId<T>` like the type-first marker (so options ride the
> call's OWN slot — no `schemaFormOptions` builder-fold, which was removed), while
> the runtime dispatches on the schema's `.id` (`isRunTypeSchema` in
> createRTFunctions.ts) so a recursive schema still uses the builder's correct,
> emit-all-emitted id rather than a reflected-`T` id that can diverge. Regex
> literals now carry `source`/`flags` in the type via the decomposed
> `regexp({source, flags?, mockSamples})` brand, so the builder no longer needs to
> own a uniquely-AST-derived id for that case. Sections below describing
> `schemaFormOptions` / `CompTimeRunType` / the builder-fold are historical.

## Problem

`createIsType<string[]>()` and `createIsTypeFor(RT.array(RT.string()))`
should resolve to the **same** structural type id — they validate the
same `string[]`. Today they don't:

| call | resolved TS type the scanner sees | structural id |
| --- | --- | --- |
| `createIsType<string[]>()` | `string[]` | `dZPrjl` |
| `createIsTypeFor(RT.array(RT.string()))` | `Array<FormatString<{}>>` | `C0wQGO` |

The same divergence exists for **every parameterised format builder
when called with no params** — `RT.number()`, `RT.bigint()`,
`RT.date()`, every `RT.temporal.*()`. As long as the validators behave
identically on the wire the cache duplication is invisible; it only
broke open when the `IsTypeOptions` refactor introduced variant cache
entries keyed by the marker-form id, and the schema-form lookup
missed them.

The reaction at the time was a Go-side workaround (the
schema-form scan path + `EmitOnly` Site mechanism — see
[IS-TYPE-OPTIONS.md §3](IS-TYPE-OPTIONS.md)). That solved the symptom
but left the underlying duplication in the cache.

## Root cause

The parameterised format builders default their generic `P` to
`Record<string, never>`:

```ts
// packages/ts-go-run-types/src/schema/atomic.ts:158-163
export function string<const P extends StringParams = Record<string, never>>(
  formatParams: P = {} as P,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>
): RunType<LeafType<'stringFormat', P>> {
  return builderResult(id, {type: 'string', formatParams});
}
```

`LeafType<'stringFormat', P>` resolves to
`TypeFormat<string, 'stringFormat', P>` =
`string & {readonly __rtFormatName: 'stringFormat'; readonly __rtFormatParams: P}`
([packages/ts-go-run-types/src/runtypes/typeFormat.ts:38-51](../packages/ts-go-run-types/src/runtypes/typeFormat.ts)).

The Go scanner detects those two sentinel properties in
[internal/compiled/runtype/typeid/formats.go:31-58](../internal/compiled/runtype/typeid/formats.go)
and attaches a `FormatAnnotation{Name: "stringFormat", Params: nil}`
to the resolved RunType. **That annotation feeds into the structural
hash**, so `RT.string()` and plain `string` get different ids — even
though no format params were ever supplied.

The default is the bug. `RT.string()` should not carry a brand at all.

## The fix — overload-based return type narrowing

Replace the defaulted-generic signature with two overloads: one for the
no-params call returning the plain base type, one for the
params-present call returning the branded type. Implementation stays
one function with a runtime discriminator on the first arg.

### Template (applied to `string`)

```ts
export function string(id?: InjectRunTypeId<string>): RunType<string>;
export function string<const P extends StringParams>(
  formatParams: P,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>
): RunType<LeafType<'stringFormat', P>>;
export function string(
  formatParamsOrId?: StringParams | InjectRunTypeId<string>,
  id?: InjectRunTypeId<string>
): RunType<string> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'string', formatParams});
}
```

After the fix:
- `RT.string()` → overload 1 → `RunType<string>` → cache.AssignID
  resolves to plain `string` id.
- `RT.string({maxLength: 5})` → overload 2 → `RunType<LeafType<…>>` →
  branded id (unchanged from today).
- `RT.array(RT.string())` → item is `RunType<string>` → T = `string` →
  `RunType<string[]>` → same id as `createIsType<string[]>()`.

### Patcher slot-index handling

Each overload has its own `lastIndex`. The Go scanner derives
`Site.ParamIndex = lastIndex` from the **resolved signature for THIS
call site** — overload 1 gives `lastIndex=0`, overload 2 gives
`lastIndex=1`. The Vite-plugin rewriter
([rewrite.ts:78-79](../packages/vite-plugin-runtypes/src/rewrite.ts))
pads with `undefined` as needed:

- `RT.string()` → 0 args, paramIndex 0, padding 0 → patches to
  `RT.string("<hash>")`.
- `RT.string({maxLength: 5})` → 1 arg, paramIndex 1, padding 0 →
  patches to `RT.string({maxLength: 5}, "<hash>")`.

No patcher changes needed.

## Builders to fix

All ten parameterised format builders that default `P`. Same shape,
same fix.

### In [define.ts](../packages/ts-go-run-types/src/schema/atomic.ts)

| line | builder | branded type today | should be |
| --- | --- | --- | --- |
| 158 | `string` | `LeafType<'stringFormat', P>` | overload: `string` ↔ `LeafType<…>` |
| 166 | `number` | `LeafType<'numberFormat', P>` | overload: `number` ↔ `LeafType<…>` |
| 174 | `bigint` | `LeafType<'bigintFormat', P>` | overload: `bigint` ↔ `LeafType<…>` |
| 182 | `date` | `LeafType<'nativeDate', P>` | overload: `Date` ↔ `LeafType<…>` |

### In `temporalBuilder` (factory at [define.ts:290-295](../packages/ts-go-run-types/src/schema/atomic.ts))

The factory produces six members of `temporal.*`. Each one currently
returns `RunType<LeafType<'temporal<Name>', P>>` for any P (including
the defaulted `Record<string, never>`). Same fix: overload the factory
to return the plain `Temporal.X` instance type for the no-params call,
or refactor the six exports to individual two-overload functions.

| line | builder | branded type today | should be (no-params) |
| --- | --- | --- | --- |
| 300 | `temporal.instant` | `LeafType<'temporalInstant', P>` | `Temporal.Instant` |
| 301 | `temporal.zonedDateTime` | `LeafType<'temporalZonedDateTime', P>` | `Temporal.ZonedDateTime` |
| 302 | `temporal.plainDate` | `LeafType<'temporalPlainDate', P>` | `Temporal.PlainDate` |
| 303 | `temporal.plainTime` | `LeafType<'temporalPlainTime', P>` | `Temporal.PlainTime` |
| 304 | `temporal.plainDateTime` | `LeafType<'temporalPlainDateTime', P>` | `Temporal.PlainDateTime` |
| 305 | `temporal.plainYearMonth` | `LeafType<'temporalPlainYearMonth', P>` | `Temporal.PlainYearMonth` |

### Builders that already converge — DO NOT touch

These builders already return a plain (unbranded) type and produce the
same structural id as their marker-form equivalent. No change needed:

- `boolean`, `symbol`, `any`, `unknown`, `never`, `voidType`
  ([define.ts:191-258](../packages/ts-go-run-types/src/schema/atomic.ts))
- `literal<V>` ([define.ts:200-205](../packages/ts-go-run-types/src/schema/atomic.ts))
- `regexp` ([atomic.ts](../packages/ts-go-run-types/src/schema/atomic.ts))
  — a plain `RegExp` leaf (`KindRegexp`, any RegExp instance)
- `classType<Instance>` ([define.ts:269-274](../packages/ts-go-run-types/src/schema/atomic.ts))
- Every composer in [compose.ts](../packages/ts-go-run-types/src/schema/compose.ts)
  (`array`, `tuple`, `union`, `intersection`, `record`, `map`, `set`,
  `lazy`, `promise`, `func`) — they propagate `T` from
  `RunType<T>` items, so the convergence flows transparently from the
  fixed leaves.
- Every utility in [utility.ts](../packages/ts-go-run-types/src/schema/utility.ts)
  (`partial`, `required`, `readonlyType`, `nonNullable`, `pick`,
  `omit`, `exclude`, `extract`, `returnType`, `parameters`) — same
  propagation.
- `object`, `propMod`, `optional` — already converge or operate at the
  composition layer.

## Go-side amendments after the fix

Once the builders converge, the following workarounds become dead
code and should be removed.

### 1. Schema-form scan path — folded onto the builder Site, not deleted

[internal/resolver/scan.go](../internal/resolver/scan.go):

- **Replaced** `schemaFormVariantSite` with `schemaFormOptions`: rather
  than emit a second `EmitOnly` Site, it returns the enclosing
  `createIsTypeFor` / `createTypeErrorsFor` options, which `scanCall` ORs
  onto the **builder's own** injection Site before returning it. The
  builder owns the id (the only id correct for AST-harvested regex
  literals and recursively-interned schemas); the option set just rides
  along, so the emitter materialises the variant under the converged id.
- **Kept** `isSchemaFormFactory` (resolved-signature name + package gate)
  and `readIsTypeOptionsLiteral` (options-literal parser) — both are used
  by `schemaFormOptions`.
- **Removed** the extra-Site append block in `dispatchScanFiles`'s
  callback — one Site per call again.

> Why not delete outright (as first sketched): the overloads fix the
> *id duplication*, but schema-form functions have no `InjectRunTypeId`
> slot, so the scanner never sees their options on the normal path. The
> fold is what lets a standalone `createIsTypeFor(schema, {opt})`
> materialise its variant. Making `createIsTypeFor` itself a marker was
> tried and rejected: deriving its id from the schema's *type* loses the
> regex `source`/`flags` (type is just `RegExp`) and diverges on
> recursive consts.

### 2. `Site.EmitOnly` field

[internal/protocol/protocol.go](../internal/protocol/protocol.go):

- **Delete** the `EmitOnly bool` field on `protocol.Site`.
- **Remove** the field doc comment.

[packages/vite-plugin-runtypes/src/protocol.ts](../packages/vite-plugin-runtypes/src/protocol.ts):

- **Delete** the mirror `emitOnly?: boolean` field on the TS `Site`
  interface.

### 3. Rewriter filter

[packages/vite-plugin-runtypes/src/rewrite.ts](../packages/vite-plugin-runtypes/src/rewrite.ts):

- **Remove** the `.filter((site) => !site.emitOnly)` in the edit-list
  construction. The full Sites list goes back to feeding the patcher
  directly.

### 4. Test reactivation that depends on the schema-form path

[packages/ts-go-run-types/test/suites/validation/Array.ts](../packages/ts-go-run-types/test/suites/validation/Array.ts)
— the `string_array_noIsArrayCheck` case currently passes BECAUSE of
the schema-form scan path. After the fix it'll pass for a simpler
reason: schema-form and marker-form share the cache key directly.
Tests don't need to change.

### What does NOT change

The bulk of the `IsTypeOptions` refactor is independent of this fix
and stays as-is:

- The variant fan-out in [module.go](../internal/compiled/typefns/module.go)
  (`collectIsTypeVariants`, the per-(typeid, variant) inner loop,
  variant cache-key construction).
- The `IsTypeVariantSuffix` table in
  [constants.go](../internal/constants/constants.go) and its JS
  mirror.
- The JS-side `buildVariantKey` / `lookupRTFn` variant arg in
  [rtUtils.ts](../packages/ts-go-run-types/src/runtypes/rtUtils.ts).
- The split `createRTFunction` / `createRTFunctionWithOptions` in
  [createRTFunctions.ts](../packages/ts-go-run-types/src/createRTFunctions.ts).
- The no-op option diagnostics MKR004 / MKR005.

## Risks to verify before flipping

1. **Overload resolution priority.** Verify TS picks overload 1 for
   `RT.string()` and overload 2 for `RT.string({maxLength: 5})` —
   not overload 2 with `formatParams: undefined`. Overload 2's first
   param is `formatParams: P` (no `?`), so this should be guaranteed,
   but worth a quick TS playground check before committing.
2. **Existing call sites** that may rely on `RT.string()` being typed
   as `RunType<FormatString<{}>>` (assignability into a typed
   variable, brand-aware downstream code). Grep for direct uses of
   `LeafType<'stringFormat'`, `FormatString<` etc. in test suites
   and product code.
3. **`Static<typeof RT.string()>`** changes from
   `FormatString<{}>` to plain `string`. Any test asserting the
   former needs updating. This is a **semantic improvement** (the
   unparameterised builder reflects the actual plain type), but it
   IS a public-surface type change.
4. **The `LeafTypeByFormatName` registry** in
   [leafTypes.ts](../packages/ts-go-run-types/src/schema/static.ts)
   stays untouched — it's used by params-present overload 2. The
   no-params overload 1 just doesn't go through it.

## Suggested order of operations

1. Spike on one builder (`string`) in a branch. Verify TS overload
   resolution, run the full test suite, observe whether
   `createIsTypeFor(RT.string()) === createIsType<string>()`.
2. If green, repeat for `number`, `bigint`, `date`.
3. Refactor `temporalBuilder` to overload the factory's return type
   per call shape (or split into six explicit two-overload exports).
4. Run the full Go + JS test suite. The `string_array_noIsArrayCheck`
   suite case + the `isTypeOptionsDispatch.test.ts` schema-form
   convergence tests are the canaries.
5. Delete the Go-side workarounds listed in §1-§3 above. Add a Go
   test that asserts `dump.Sites` contains NO `EmitOnly` entries for
   the schema-form fixtures (compile-time guard once the field is
   gone).
6. Update [IS-TYPE-OPTIONS.md](IS-TYPE-OPTIONS.md) §3 "TO REVISIT" to
   "DONE — see [SCHEMA-FORM-TYPEID-CONVERGENCE.md]".
