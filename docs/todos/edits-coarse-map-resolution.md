# `edits`-mode coarse source map — `mapResolution: 'boundary' | 'lines'`

**Status:** spec / idea (**deferred**, low priority) — surfaced by the transform-wire benchmark ([docs/done/transform-wire-modes.md → Benchmark findings](../done/transform-wire-modes.md#benchmark-findings)). Subordinate to the [transform CLI + wire architecture](./transform-cli-compile-command.md).
**Related:** [`packages/runtypes-devtools/src/apply-edits.ts`](../../packages/runtypes-devtools/src/apply-edits.ts), [`edit-buffer.ts`](../../packages/runtypes-devtools/src/edit-buffer.ts), [`internal/compiled/transform/edits.go`](../../internal/compiled/transform/edits.go), [`unplugin.ts`](../../packages/runtypes-devtools/src/unplugin.ts)

## Decision (2026-07-04, review)

Deferred and de-prioritised. The benchmark showed the FE map walk never dominates a real (concurrent) build, so the coarse map is a niche win. Two line-count-preserving variants that would have made the map builder trivial were **evaluated and rejected**:

- **comment-out the replaced function** (`fn(){…}` → `/** fn(){…} */`) — killed by the nested `*/` hazard (`*/` occurs in regexes, strings, existing comments); the escaping fix is its own per-char scan, plus it carries dead comment bytes.
- **newline-pad the replacement** (`binding` + N `\n` to match the span's newlines) — hazard-free, but adds strippable blank-line runs to the output for no substantial gain.

Conclusion: if this is ever built, keep the current char-edit wire (do NOT preserve line count), let the multi-line pure-fn collapse be handled by the map builder's **line-delta tracking** (jump the original-line cursor past collapsed lines — `O(rare replacements)`), and apply a uniform **per-edit refinement** (a segment at each line start + one after each edit) rather than a `single-vs-multi-edit` flag the client can derive itself. Note the FE needs **no** byte↔UTF-16 conversion — Go ships UTF-16 offsets (see the architecture doc).

## 1. Problem

`transformMode: 'edits'` (the default) moves source-map generation from Go to the FE: `applyEdits` runs the `EditBuffer`, whose `generateMap` walks the WHOLE file char-by-char to emit `hires: 'boundary'` segments (one per token run), matching `'go'` mode byte-for-byte.

The transform-wire benchmark showed this map walk is `edits`'s only real cost: it is O(file size) and, on a single very large file (~92 KiB) over a fast local pipe, it (~4.2 ms) roughly cancels `edits`'s wire savings. It never dominates a real (concurrent) build, but it is the ceiling on `edits`'s per-file win, and it is pure map-granularity overhead.

The rewrite's edits are SPARSE: one prepended import line plus a handful of mid-line binding splices. So the generated map is "shift everything down by the import block; columns unchanged except on the few edited lines." A **line-granular** map (a segment at each line start, plus one at each edit) is correct for the bundler's map-chaining and costs almost nothing to generate — no per-token walk.

## 2. The idea

A plugin option `mapResolution?: 'boundary' | 'lines'` (default `'boundary'`), honoured in `'edits'` mode only:

- `'boundary'` (default) — today's behaviour: byte-identical to `'go'`, full token-boundary granularity.
- `'lines'` — the FE generates a coarse line-anchored map: for each generated line, one segment mapping its column 0 back to the corresponding original line/column, plus one segment per edited line at the edit. Cheap (O(lines), not O(chars)); still a valid v3 map the bundler can chain.

`ComputeEdits` already ships everything the FE needs (the import block is the only newline-adder, edits are single-line). A line-granular `generateMap` variant in `edit-buffer.ts` is a small addition.

## 3. Why it is NOT free / why it is parked

- **It breaks the mode-parity guarantee.** The whole safety argument for `'edits'` is "byte-identical to `'go'` by construction," pinned by the mode-parity corpus. A coarse map is deliberately NOT byte-equal, so it needs its OWN correctness story: a test that debugger breakpoints still land on the right ORIGINAL lines through the bundler's composite map (decoded-equivalent, not byte-equal).
- **Marginal payoff.** The cost it removes only bites on very large single files transformed sequentially; real builds transform concurrently, where `edits` already wins or ties (benchmark). So this is a niche optimisation, not a default.
- **Surface cost.** A third knob + a second map path + its own e2e test in both resolutions.

## 4. If built

- `edit-buffer.ts`: a `generateMap({resolution})` branch or a sibling `generateLineMap`.
- `apply-edits.ts` + `unplugin.ts`: thread `mapResolution` through; option on `PluginOptions` (host-level, like `transformMode`).
- Tests: decoded-mappings-equivalent breakpoint test (NOT byte-equal) in `'lines'` mode; re-run the e2e composite-map build in `'lines'`.
- Bench: add `mapResolution` as a fourth sweep dimension in `transform-wire.mjs` to quantify the apply-cost drop.
- Docs: configuration page + ARCHITECTURE rewrite-mechanics note that `'lines'` is decoded-equivalent, not byte-equal, to `'go'`.
