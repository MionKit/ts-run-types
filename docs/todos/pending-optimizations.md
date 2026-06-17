# Pending optimizations — format-serialization benchmark + small-screen table

**Status:** not started. Captured from review of the serialization benchmark page;
no investigation done yet — these are scoping notes for a future session, not a plan.

Two unrelated follow-ups parked here so they aren't lost:

1. A **format-serialization benchmark** (currently missing), which would showcase how
   format constraints shrink **binary** payloads.
2. **Small / very-small screen** layout for the benchmark table.

---

## 1. Format-serialization benchmark (missing)

We have a format-**validation** benchmark but **no format-serialization benchmark**.
That gap hides the single most compelling binary-codec story, so it's worth adding.

### Why it matters (the binary payload story)

The binary codec has to reserve a **worst-case width** when it doesn't know a value's
range. An unconstrained `number` or `bigint` rides the wire as a fixed **8 bytes**,
because any double / 64-bit int is possible. But once the type carries a format
constraint — fixed-width (`int8`/`int16`/`int32`, `uint8`/`uint16`/`uint32`, the
`bigInt64` family) or `min`/`max` bounds that pin the value into a known range — the
encoder can pack it into **far fewer bytes** (e.g. `uint8` → 1 byte, a `{min: 0, max:
1000}` number → 2 bytes instead of 8). For records full of small integers this is a
large, headline reduction on the wire that nothing else in the suite surfaces.

So the benchmark isn't just "more coverage" — it's the page that proves format-aware
sizing pays for itself. Payload size should be the headline metric, with binary as the
strategy that wins big when constraints are present.

### Scope / what to build

- A new benchmark over the **format-serialization** suite (mirror how the serialization
  benchmark loads the serialization suite). Driver: [`scripts/gen-serialization-bench.mjs`](../../scripts/gen-serialization-bench.mjs)
  — likely a `--suite format-serialization` variant, the same way the suite exporters
  take a `--suite` flag (see [`scripts/export-serialization-suite.mjs`](../../scripts/export-serialization-suite.mjs)).
- A new page `website/content/7.benchmarks/<n>.serialization-formats.md` with
  `::bench-table{bench="serialization-formats"}` — it reuses the stacked "verdict"
  layout already built in [`website/app/components/content/BenchTable.vue`](../../website/app/components/content/BenchTable.vue)
  (round-trip headline + enc/dec + bytes; the bytes tier is exactly where the format win
  shows). No new component work expected.
- Cases should pair an **unconstrained** number/bigint against its **format-constrained**
  twin (same value, with `min`/`max` or a fixed-width format) so the byte-count delta is
  read off directly.

### Possible deeper item (verify first)

Whether the codec already derives byte width from `min`/`max` bounds (not just from the
fixed-width `int*`/`uint*` formats) is **unverified**. If a `FormatNumber<{min, max}>`
still packs the full 8 bytes today, the real optimization is teaching the binary emitter
to choose the narrowest width that covers `[min, max]`. Relevant code:
[`packages/ts-runtypes/src/createRTFBinary.ts`](../../packages/ts-runtypes/src/createRTFBinary.ts),
[`internal/compiled/typefns/binary_to.go`](../../internal/compiled/typefns/binary_to.go).
The benchmark above is the right way to measure it either way.

---

## 2. Benchmark table on small / very-small screens

The stacked verdict cell (round-trip headline + `↑enc ↓dec` + bytes) is taller per row
than the old single-value cell, and the case column can get wide — both hurt on narrow
viewports. The structure is already prepared for this (the case column has its own
`<col>`; cell text is CSS-driven), so it's a styling pass, no logic change.

In [`website/app/components/content/BenchTable.vue`](../../website/app/components/content/BenchTable.vue) (CSS):

- **Clamp the first column** (`.bench-cell--case`): `max-width` + `text-overflow:
  ellipsis` + keep the full title on `title=`/hover so long case names don't blow out
  the row.
- **Tame row height when collapsed**: the 3-tier `.bench-val-col` makes rows ~3 lines
  tall; tighten `line-height` / `gap` (and consider a denser variant) so a long table
  isn't exhausting to scroll on mobile.
- **Shrink column text** at small widths (cell font-size, the `↑enc ↓dec` and bytes
  tiers) via a `@media (max-width: 380px)` (and a mid breakpoint) block.
- Make sure the sticky link-speed bar (`.bench-bw-bar`) wraps cleanly and stays
  thumb-reachable.

Applies to every bench page, but the serialization verdict table is where it bites most.
