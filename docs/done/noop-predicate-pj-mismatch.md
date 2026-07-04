# Fix the `pj` noop-predicate false positive the renderer tripwire keeps catching

Status: **implemented** on branch `claude/agitated-sutherland-3af6ce` (2026-07-04).
Scope: `internal/compiled/typefns/noop_types.go` (predicate arm) +
`internal/resolver/noop_predicate_test.go` (corpus pin). No runtime / emitter
change — output was already correct (the tripwire self-heals by shipping the
live body); this removes the stderr noise and closes the predicate drift.

## The finding (as reported)

Every vitest run that boots the Vite plugin printed:

```
ts-runtypes: noop-predicate mismatch for pj_X9VR731 (objectLiteral): IsNoopType claims
identity but the compiled body is not — shipping the live body; fix the predicate arm
to mirror the emitter
```

Emitted from the protective tripwire in
[internal/compiled/typefns/module.go](../../internal/compiled/typefns/module.go):
the `pj` (prepareForJson / mutate-encode) family's `IsNoopType` predicate
returned TRUE (identity) for an objectLiteral whose compiled body is NOT the
identity — a FALSE POSITIVE.

## Root cause

`X9VR731` is the anonymous `{a: Int8Array}` object from
[serialization/Others.ts](../../packages/ts-runtypes/test/suites/serialization/Others.ts)
(confirmed: an unfixed control binary prints `pj_X9VR731 (objectLiteral)`
verbatim). It is an objectLiteral whose sole property value is a directly
DataOnly-stripped kind — a non-serializable native (`Int8Array`) — but one that
`JSON.stringify` would serialize AS DATA rather than drop.

The `pj` emitter handles that case specially. `emitPropertyPrepareForJson`
(json_prepare.go) drops a directly-stripped property, but when the value
`jsonStringifyLeaks` (a `Promise` or a non-serializable native — typed array /
ArrayBuffer / DataView) it emits `delete v.<name>` so the live-object mutate
output matches the data-only projection the other strategies produce. That
`delete` is REAL code — the object is NOT identity on encode.

The predicate's `KindProperty` arm in `jsonNoopRecursive`
([noop_types.go](../../internal/compiled/typefns/noop_types.go)) returned `true`
for EVERY `isStrippedUnionMember` value in BOTH json modes, so it missed the
prepare-side `delete`. The restore / compact decoders read already-parsed JSON
(the key is gone) and drop the slot with empty code, so they stay correctly
noop — the drift was prepare-only.

## What shipped

- **Predicate fix.** The `KindProperty` / `KindPropertySignature` arm now
  mirrors the emitter arm-by-arm: on the prepare side (`noopModePrepare`) a
  stripped-but-leaking value (`jsonStringifyLeaks(resolved)`) returns `false`
  (non-identity — the `delete` is real code); the restore side keeps returning
  `true`. Reuses the emitter's own `jsonStringifyLeaks` helper so the arm cannot
  drift.
- **Corpus pin.** Added two clean shapes to `noopCorpusSource` in
  `noop_predicate_test.go`: `{a: ArrayBuffer}` (non-serializable-native leak)
  and `{p: Promise<number>; b: number}` (Promise leak). Both reproduce the
  false positive before the fix and pass after. `ArrayBuffer` is used instead of
  `Int8Array` deliberately — `Int8Array<ArrayBufferLike>` interns its type-arg
  union `ArrayBufferLike` (see the follow-up finding below), which is unrelated
  noise for pinning this arm.

## Verification

- `go test ./internal/...` green; the corpus test
  (`TestNoopPredicate_SoundAgainstEmitters`) fails on both leak objects when the
  fix is reverted, passes with it.
- Full `pnpm --filter ts-runtypes test` green (7322 passed / 7 skipped) with the
  rebuilt binary; the `pj_X9VR731` tripwire is gone. An unfixed control binary
  over the same suite prints it — confirming the suite is a real witness and the
  fix removes it.

## Follow-up (fixed separately)

While pinning the exact production type (`Int8Array`), the corpus surfaced a
DISTINCT predicate false positive: an all-stripped union (e.g. `ArrayBuffer |
SharedArrayBuffer`) makes `unionJsonNoop` return `true` while the union renders
a live throwing guard-chain. That one does NOT fire this tripwire but DID cause
silent runtime corruption via the dispatch gate (an all-stripped union child was
elided, collapsing the encoder to native `JSON.stringify` instead of throwing).
Fixed and documented in
[noop-predicate-allstripped-union.md](noop-predicate-allstripped-union.md).
