# Fix the all-stripped-union `unionJsonNoop` false positive

Status: **implemented** on branch `claude/agitated-sutherland-3af6ce` (2026-07-04).
Scope: `internal/compiled/typefns/noop_types.go` (predicate guard) +
`internal/resolver/noop_predicate_test.go` (corpus pin). Found while pinning
[noop-predicate-pj-mismatch.md](noop-predicate-pj-mismatch.md); confirmed to be a
REAL runtime corruption (not just predicate hygiene) — see below.

## The finding

`unionJsonNoop` in
[internal/compiled/typefns/noop_types.go](../../internal/compiled/typefns/noop_types.go)
returned `true` (identity) for a union in which EVERY member is
DataOnly-stripped — e.g. `ArrayBuffer | SharedArrayBuffer` (both
`SubKindNonSerializable`). But such a union is NOT the identity: its DataOnly
projection is `never`, so `dataOnlyUnionMembers`
([union_strip.go](../../internal/compiled/typefns/union_strip.go)) keeps the
original member list, `buildFlatLayout` buckets the non-serializable members
(the empty-layout noop arm never fires), and the union entry renders a live
guard-chain that dispatches to per-member encoders which throw (PJ002 /
`[VL001] Cannot validate …`) — real code on `pj`, `rj`, AND `cjr` (compact,
whose union arm delegates to the shared rule).

The predicate `continue`d past every stripped member and fell through to
`return true`, so verdict = noop while ground truth = live-throwing code.

## Why it was a REAL bug (confirmed)

Unlike the [pj objectLiteral tripwire](noop-predicate-pj-mismatch.md), this one
does not fire the renderer tripwire (the tripwire compares the predicate against
the *inlined* body; the union externalizes its members). Instead the FALSE
`true` fed the walker's **dispatch gate**, which elides a noop child's dep call
as empty code. Rendering `createJsonEncoder<{x: ArrayBuffer | SharedArrayBuffer; y: number}>(undefined, {strategy: 'mutate'})`:

- **Before the fix** — the gate saw `unionJsonNoop = true` and dropped the `v.x`
  transform. The whole encoder then had no live primitive, so the JSON composite
  collapsed to the noop short-form (`['jeMU', … , true]`) and the runtime
  substituted **native `JSON.stringify`**. Encoding `{x: someBuffer, y: 1}`
  silently produced `{"x":{},"y":1}` — NO throw, a serialized empty object where
  the DataOnly contract requires an encode-time throw. Silent data corruption.
- **After the fix** — the union is correctly non-noop, so `Holder`'s entry is
  `function(v){ v.x = <union>.fn(v.x); return v }` and the union dispatch throws
  PJ002 at runtime, as the all-stripped ⇒ alwaysThrow contract requires.

## What shipped

- **Predicate fix.** `unionJsonNoop` now mirrors `dataOnlyUnionMembers`'s
  all-stripped fallback: it counts stripped members up front and, when the union
  has members and `strippedCount == len(children)`, returns `false` (the
  projection is `never` ⇒ alwaysThrow, not identity). The mixed-survivor path and
  the genuinely-degenerate all-dangling / empty case (no stripped member —
  `isStrippedUnionMember(nil)` is false — dangling refs emit nothing on both
  halves) stay `true`. Fixed the stale doc comment that claimed the all-stripped
  layout "emits nothing".
- **Corpus pin (predicate).** Added `type AllStrippedUnion = ArrayBuffer | SharedArrayBuffer`
  (referenced via `getRunTypeId`) to `noopCorpusSource`. It fails
  `TestNoopPredicate_SoundAgainstEmitters` on `pj` / `rj` / `cjr` before the fix,
  passes after.
- **Behavioral pin (runtime).** Added a gate-elision regression test to
  [dataonly-union-drop.test.ts](../../packages/ts-runtypes/test/dataonly-union-drop.test.ts)
  (the "collapse-to-never / empty still throws" suite): a NAMED, externalized
  all-stripped union at a nested property (`{x: ArrayBuffer | SharedArrayBuffer; y}`)
  must throw for every encoder strategy (mutate / clone / direct / binary),
  never silently round-trip the native as `{}`. This drives the FULL vite-plugin
  pipeline through the actual dispatch gate — the path the corpus test (which
  fully inlines) cannot exercise. The existing root-position cases stay; this
  covers the nested + externalized path.

## Verification

- `go test ./internal/...` green; the corpus test fails on `AllStrippedUnion`
  (all three families) when the guard is reverted, passes with it.
- Full `pnpm --filter ts-runtypes test` green (7323 passed / 7 skipped), zero
  tripwire. The union-heavy serialization + `validation/Union` + roundtrip-fuzz
  suites are unaffected (the guard only fires for FULLY-stripped unions; mixed
  unions fall through unchanged).
- The corruption was reproduced directly, both on the render output (without the
  fix the nested-union encoder collapses to the native-`JSON.stringify`
  short-form; with it, it dep-calls the throwing union encoder) AND end-to-end:
  the new behavioral test returns `{"x":{},"y":1}` without the fix (test fails)
  and throws `[PJ002]` / `[PJS002]` with it (test passes).
