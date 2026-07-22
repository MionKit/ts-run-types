# Deduplicate the object guard in union `validate` / `getValidationErrors`

Status: **READY.** Bytes-only emitter win (smaller generated validators), no
semantic change. Planned for the next release.

## Problem

For a union of object types (discriminated unions, and any union with two or
more object/interface/class members) the `validate` emitter wraps the member
OR-chain in ONE shared `typeof v === "object" && v !== null` guard **and then
re-emits that exact guard inside every arm**. We should keep only the root check
and drop the per-member repeat.

Given:

```ts
type MyType =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect';   width: number; height: number }
  | { kind: 'text';   content: string };
```

we currently emit the guard at the root **and** in all three arms:

```js
function nPZ_Ge6Au0u(v) {
  return (
    typeof v === "object" &&
    v !== null &&
    ((typeof v === "object" && v !== null && v.kind === "circle" && Number.isFinite(v.radius)) ||
     (typeof v === "object" && v !== null && v.kind === "rect"   && Number.isFinite(v.width) && Number.isFinite(v.height)) ||
     (typeof v === "object" && v !== null && v.kind === "text"   && typeof v.content === "string"))
  );
}
```

Target — one guard at the root, arms carry only their own discriminant +
property checks:

```js
function nPZ_Ge6Au0u(v) {
  return (
    typeof v === "object" &&
    v !== null &&
    ((v.kind === "circle" && Number.isFinite(v.radius)) ||
     (v.kind === "rect"   && Number.isFinite(v.width) && Number.isFinite(v.height)) ||
     (v.kind === "text"   && typeof v.content === "string"))
  );
}
```

## Where it lives

`emitUnionValidate` in
[validate.go](../../ts-go-runtypes/internal/cachegen/typefunctions/validate.go)
(currently `validate.go:737`) already lifts a shared guard out, but a comment
there records a deliberate decision to **keep** the inner guards (judged
"fragile ... interface vs index sig vs class"). Each arm's guard comes from
`emitObjectValidate` (`validate.go:1118`), which always prepends
`typeof v === 'object' && v !== null` as its first AND-term. That prefix is
exactly what the shared outer guard already establishes — hence the duplication.

`getValidationErrors` needs no separate work: its union arm delegates to the
validate boolean (`emitUnionValidationErrors`,
[validationerrors.go:995](../../ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go),
emits `if (!val_<hash>.fn(v)) <err>`), so fixing the shared `val_` entry
improves both families at once.

## Fix direction

Emit the object arms **without** their leading `typeof === 'object' && !== null`
term and rely on the single shared root guard. Prefer a structural guard-free
variant of `emitObjectValidate` (a scoped arg / helper, not a persistent context
flag that would leak into standalone object entries) over textual string-surgery.

Watch the non-homogeneous member bucket — `isObjectLikeKind`
([kinds.go:12](../../ts-go-runtypes/internal/cachegen/typefunctions/kinds.go))
also covers arrays/tuples (no strippable prefix — leave them alone) and
all-optional / index-signature objects insert a `[object Object]` brand guard
**after** the typeof term that must survive. Leave the standalone (non-union)
object entry path untouched — it still needs its own root guard.

Out of scope (file separately if wanted): collapsing the OR-chain to a
`switch (v.<discriminant>)` when a discriminant exists.

## Also check: do serialization functions have the same duplication?

Verify the JSON/binary union emitters don't repeat the object guard per member
the way validate does. First read suggests they don't (they route through the
flat merged-prop / discriminant layout `buildFlatLayout`, which emits a single
guard then dispatches), but confirm rather than assume. Emitters to scan, and
record a one-line verdict for each when done:

- `union_flat.go` — `emitUnionPrepareForJsonFlat` / `...StringifyJsonFlat` /
  `...RestoreFromJsonFlat`
- `union_flat_binary.go` — `emitUnionToBinaryFlat` / `emitUnionFromBinaryFlat`
- `json_prepare_safe.go` — `emitUnionPrepareForJsonSafe`
- `clone_exact_shape.go` — `emitUnionCloneExactShape` (bails on object members;
  likely nothing to do)
- the `unknownkeys_*` union emitters

Grep helper: `objectGuard`
([quote.go:58](../../ts-go-runtypes/internal/cachegen/typefunctions/quote.go)).

## Done when

- Union validators emit the object guard once; behavior (accept/reject set)
  unchanged; `getValidationErrors` rides the improved `val_` entry.
- Each serialization union emitter above has a recorded verdict (already
  single-guard, or fixed).
- Go + JS suites green, incl. the noop-predicate corpus (union validate arm is
  changing shape — keep its `IsNoopType` arm in sync).
</content>
