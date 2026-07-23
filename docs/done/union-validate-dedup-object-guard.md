# Deduplicate the object guard in union `validate` / `getValidationErrors`

**Type:** chore · **Spec:** full-plan
**Status:** DONE — shipped on branch `claude/implement-todo-nb81k1`.
**Created:** 2026-07-22 · **Completed:** 2026-07-23

## Outcome — what shipped

Implemented with a **parent-is-union pull** (the owner's steer during planning),
which turned out cleaner than the scoped-signal / textual strip the Fix direction
below sketched:

- New `EmitContext.ParentIsUnion()` helper
  ([emitter.go](../../ts-go-runtypes/internal/cachegen/typefunctions/emitter.go)) —
  reads the immediate parent stack frame's kind. `compileNode` resolves refs
  before `pushStack`, so the parent frame is the real resolved type, never a ref.
- `emitObjectValidate`
  ([validate.go](../../ts-go-runtypes/internal/cachegen/typefunctions/validate.go))
  drops its leading `typeof v === 'object' && v !== null` term (`parts[0]`) when
  `ctx.ParentIsUnion()` and the shape is non-callable. The `[object Object]` brand
  guard (`parts[1]`) and every property check survive. Only object-literal /
  plain-class arms reach `emitObjectValidate`, so arrays / tuples / index-sig /
  Date / Map / Set (opaque calls with no strippable prefix) are untouched.
- `emitUnionValidate` — comments only; its shared root guard is unchanged and is
  now the sole `typeof===object` enforcer for the object arms, which come back
  guard-free from `CompileChild`.
- **Nested property objects keep their own guard automatically** — their parent
  frame is the outer object, not the union — so no read-once bookkeeping is needed
  (this is the subtle case the pull design gets right structurally).

**`getValidationErrors` needed no code change.** `emitUnionValidationErrors`
([validationerrors.go:995](../../ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go))
delegates to `if (!val_<hash>.fn(v)) …`, so its object emitter is never invoked
under a union — it rides the improved `val_` entry transitively. A parent-is-union
check there would be dead code.

**Noop predicate: no change.** `isNoopForValidate`
([noop_types.go:541](../../ts-go-runtypes/internal/cachegen/typefunctions/noop_types.go))
keys only on `rt.Kind` (any/unknown); it has NO union arm and never inspects guard
text, so dropping per-arm guards can't move any union's noop verdict. The
"keep its IsNoopType arm in sync" note in Done-when was moot for validate.

**Tests:** Go shape tests in
[module_test.go](../../ts-go-runtypes/internal/cachegen/typefunctions/module_test.go)
(`TestValidateModule_Union*`: single-object, multi-object, all-optional
brand-guard-survives, nested-keeps-guard, mixed array+object — each asserts the
object guard appears exactly once and the edge cases survive). Full Go suite
(`go -C ts-go-runtypes test ./internal/...`) and full JS suite (`pnpm test`, 8073
passed) green, incl. the noop-predicate corpus. No docs (internal codegen size
win, no user-facing surface); not a fuzz candidate (semantics unchanged, the JS
Union accept/reject suite is the oracle).

### Serialization emitters — recorded verdicts (the "also check")

All already emit ONE root object guard (they merge object members behind a single
guard via `buildFlatLayout`); only `validate` duplicated:

| Emitter | file:line | Verdict |
| --- | --- | --- |
| `emitUnionPrepareForJsonFlat` | union_flat.go:133 | already single-guard |
| `emitUnionStringifyJsonFlat` | union_flat.go:445 | already single-guard |
| `emitUnionRestoreFromJsonFlat` | union_flat.go:312 | n/a (decode by wire index) |
| `emitUnionToBinaryFlat` | union_flat_binary.go:76 | already single-guard |
| `emitUnionFromBinaryFlat` | union_flat_binary.go:255 | n/a (decode) |
| `emitUnionPrepareForJsonSafe` | json_prepare_safe.go:825 | already single-guard (`objectGuard` once) |
| `emitUnionCloneExactShape` | clone_exact_shape.go:498 | bails (CodeNS) on object members |
| `unknownkeys_*` unions | unknownkeys_union.go:59 | already single-guard (all delegate here) |

---

_Original spec below, preserved for history._

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
guard then dispatches), but confirm rather than assume. **Confirmed:** every
emitter below already emits a single root guard (only `validate` duplicated) — the
one-line verdicts are recorded in the table under Outcome above. Emitters scanned:

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

- [x] Union validators emit the object guard once; behavior (accept/reject set)
  unchanged; `getValidationErrors` rides the improved `val_` entry.
- [x] Each serialization union emitter above has a recorded verdict (all already
  single-guard — table under Outcome; nothing to fix).
- [x] Go + JS suites green, incl. the noop-predicate corpus. (Validate's
  `IsNoopType` has no union arm and never inspects guard text, so nothing to keep
  in sync there — the corpus stays green.)
</content>
