# JCP001: JSON composites reference primitive entries that were never rendered — FIXED

## Status: fixed (root cause + diagnostic hardening + regression coverage)

## Original evidence (exposed 2026-07-13 while making Error diagnostics halt every lane)

The failOnError work made `buildStart` surface ALL diagnostic families (previously only
`Family.PureFn` was forwarded, everything else was silently dropped). That immediately
exposed 18 pre-existing Error-severity internal diagnostics in the marker package's OWN
test program (`packages/ts-runtypes`, tsconfig.test.json):

```
error JCP001: Internal error: JSON composite `cO2_GyO4sYa` references primitive entry
`Hpn_GyO4sYa` which was never rendered — please file an issue.
```

- Raised at `AssertCompositeSoftDeps` ([ts-go-runtypes/internal/cachegen/typefunctions/json_composite.go](../../ts-go-runtypes/internal/cachegen/typefunctions/json_composite.go),
  `CodeCompositeMissingPrimitive`) when a composite's primitive binding key is absent
  from the rendered entry set.
- 18 occurrences, stable across runs. (The `cO2`/`Hpn` hashes were the compact
  composite / `compactForJson` primitive under the binary version live when the todo
  was filed; the hash inputs fold `constants.Version`, so today's build labels the same
  pair `tHr` / `oQ6`. The mechanism is version-independent.)
- The diagnostic carried an EMPTY site, so nothing pointed at the offending type.

## Root cause (the todo's original suspicion was WRONG)

The todo speculated "a demand/elision interaction where the primitive entry is dropped
(noop-elided or demand-closed away)". That was not it — noop entries ARE rendered, and
the composite site's demand DOES name every primitive (`operations.DemandFor` →
`JsonStrategyFamilies`).

The actual cause: **the `compact`-strategy primitives — `compactForJson` (cj) and
`compactFromJson` (cjr) — implemented neither `DiagCodeProvider` nor
`LeafDiagCodeProvider`**, unlike every sibling primitive (pj/pjs/rj/sj all do). So when a
compact walk hit an unserialisable leaf (function / symbol) at a **propagating** position
— a tuple slot, array element, record value, or callable object — the renderer
(`renderEntryWithDeps`) could not resolve a per-family diag code, fell through to the
silent-skip path, and emitted NO entry (empty argsText). The composite still bound the
(now-missing) primitive via `utl.getRT(cj_<id>).fn`, and `AssertCompositeSoftDeps`
correctly flagged the dangling reference as JCP001.

- **Compact-only.** Reproduced across all seven strategies: clone→PJS003, mutate→PJ003,
  direct→SJ003, strip/preserve→RJ003 all render an alwaysThrow entry; only compact
  (encoder cj + decoder cjr) silently skipped → JCP001. `ukuw` was a theoretical third
  suspect (also lacks `DiagCodeForLeaf`) but its "every leaf is noop-supported" surface
  never yields a root-`CodeNS`, so it never triggers in practice (verified empirically
  across index-signature / union / record shapes).
- **Propagating position only.** A function / symbol at a PROPERTY position is dropped
  with a Warning and the object still renders — no root throw, no JCP001. The breach
  needs the leaf to propagate to the entry root.

## Fix (shipped)

1. **Root cause** — [ts-go-runtypes/internal/cachegen/typefunctions/diag_codes.go](../../ts-go-runtypes/internal/cachegen/typefunctions/diag_codes.go):
   `CompactForJsonEmitter` now delegates its diag codes to `prepareForJsonSafe`
   (cj → pjs) and `CompactFromJsonEmitter` to `restoreFromJson` (cjr → rj) — the SAME
   way their emit already reuses those helpers arm-by-arm (per CLAUDE.md's "delegate
   where the emitter delegates" rule). An unserialisable leaf now renders an alwaysThrow
   entry with the sibling's exact code (PJS003 / RJ003 for functions, PJS005 / RJ005 for
   symbols), matching clone / strip / preserve byte-for-byte. The unserialisable-leaf
   reason is wire-shape-independent, so the shared PJS*/RJ* wording ("Cannot encode
   `Function` to JSON") is correct for compact too. This also un-silences the per-slot
   drop Warnings compact was swallowing (a dropped method now warns PJS011 / RJ011 like
   its sibling).
2. **Diagnostic hardening** — `AssertCompositeSoftDeps` now takes `ProvenanceSites` and
   fans a breach out one diagnostic per demanding `createJsonEncoderFn` / `createJsonDecoderFn`
   call site (anchored file:line:col), and carries the offending type id as a third
   message arg (`JCP001` template `{2}`). A future invariant breach is now reproducible
   from the user's source instead of a file-less internal error with opaque cache keys.
   JCP001 is now purely a "should never happen" tripwire.

## Regression coverage

- Go — [ts-go-runtypes/internal/compiler/resolver/jcp001_compact_test.go](../../ts-go-runtypes/internal/compiler/resolver/jcp001_compact_test.go):
  pins that compact encode/decode over a propagating function / symbol leaf surface the
  SAME root code as clone / preserve and never trip JCP001, plus that a dropped-property
  Warning still fires (matching clone).
- Go — [ts-go-runtypes/internal/cachegen/typefunctions/json_composite_test.go](../../ts-go-runtypes/internal/cachegen/typefunctions/json_composite_test.go):
  extends `TestAssertCompositeSoftDeps_MissingPrimitiveFails` to pin the type-id arg and
  the per-site fan-out.
- FE — [packages/ts-runtypes-devtools/test/runtype-diagnostics.test.ts](../../packages/ts-runtypes-devtools/test/runtype-diagnostics.test.ts):
  two `compact strategy alwaysThrows … with NO JCP001` regressions (function + symbol
  tuple slots) filling the gap next to the existing pj/pjs/rj/sj tuple-slot test.
