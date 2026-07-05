# RESOLVED: facts-cache poisoning via unresolved Map/Set inner ref

**Status:** FIXED. Root cause pinned and fixed in `json_compat.go`
(`isJsonCompatible` now resolves a raw ref before walking it). Regression test:
`internal/cachegen/typefunctions/json_compat_ref_test.go`. This was pre-existing
(reproduced on `main`); it surfaced while adding DataOnly union-drop FE coverage.

## The symptom

Compiling a `Map<K,V>` / `Set<V>` via the `clone` JSON strategy in the same
scan as an object-merged union corrupted that union's serializer: a merged
property whose candidates are all JSON-natural (e.g. `a: string | boolean`) was
wrongly given a `[idx, value]` sub-union envelope, so the round-trip produced
`{a: [0, 'hello'], b: 7}` instead of `{a: 'hello', b: 7}`. Cases hit in the
suite: `Discriminated union` and `Shared prop structural`
(`test/suites/serialization/Unions.ts`), and only their `clone` variants.

## The exact chain (root cause)

1. `mapKeyValueTypes` / `setItemType` (json_prepare_safe.go helpers) return
   `wrapper.Child` — an UNRESOLVED `KindRef`, not the resolved inner type.
2. `emitNativeIterablePrepareForJsonSafe` (the Map/Set handler for the `clone`
   strategy) calls `isJsonCompatible(t)` on each of those raw refs.
3. `jsonCompatRecursive` had no `KindRef` arm, so an unresolved ref fell through
   to its default `return false`, and `isJsonCompatible` memoized
   `factJsonCompat[<ref.id>] = false`. A ref's id IS the target type's
   structural id — so this poisoned, say, `string`'s verdict with `false`.
4. The `FactsTable` is shared across every type a family renders in one dispatch
   (and only the `prepareForJsonSafe`/clone family takes this path — hence only
   the clone variants broke). A later merged-prop union reading
   `isJsonCompatible(string)` got the poisoned `false` → `NeedsSubWrap` wrongly
   true → the spurious envelope.

So nothing leaked across truly separate scans; the failure needed the poison and
a vulnerable union co-located in one batched dispatch, which is why suite
file-grouping (and the added Map/Set test) decided whether it showed.

## The fix

`isJsonCompatible` resolves its input ref up front
(`rt = ctx.ResolveRef(rt)`), so a raw `KindRef` becomes the real type before the
walk + memoization. One line, robust for any caller. A latent footgun remains
worth noting: `mapKeyValueTypes` / `setItemType` still return unresolved refs,
so other consumers of those inner types should resolve before use.
