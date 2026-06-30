# Missing benchmark features

**Status:** all items below are scoping notes, not started. Captured from review of
the benchmark suite; no investigation done or design committed yet.

Three missing pieces parked here so they aren't lost:

1. A **compile-time benchmark** — full-suite TS check + RT transform vs typia
   tsgo. The build-time wall-clock axis the project's "compile-time tool" pitch
   needs numbers for.
2. A **format-serialization benchmark** — would showcase how format constraints
   shrink **binary** payloads.
3. **Small / very-small screen** layout for the benchmark table.

---

## 1. Compile-time benchmark — full-suite TS check + RT transform vs typia tsgo

The idea: a **third** benchmark axis next to runtime throughput (`bench`) and
type-instantiation cost (`bench:typecost`) that measures the **wall-clock
compile-time cost** every user pays at build time: the TypeScript type-check
PLUS the RunTypes emit / transform pass, compared to the same suite under typia
(the only other contender whose validators are derived from TS types at build
time, so the only fair head-to-head). Same suite, same per-case granularity, same
isolated-per-competitor layout the runtime bench already enforces.

### Why this matters

Today the benchmark story is split between two axes:

1. **Runtime throughput** ([`container/benchmarks/`](../../container/benchmarks/),
   `pnpm run bench`) — validations / sec, per case, ts-runtypes vs zod /
   typebox / ajv / typia. The headline metric, but it doesn't cost the user
   anything until production traffic hits.
2. **Type-instantiation cost**
   ([`container/benchmarks/typecost/typecost.mjs`](../../container/benchmarks/typecost/typecost.mjs),
   `pnpm run bench:typecost`) — `program.getInstantiationCount()` per case,
   baseline-subtracted, the marginal cost of resolving each form's static type.
   Captures the editor / `tsc` cost, but in **TS instantiations**, not seconds.

What's missing is the axis a CI run actually feels: **how many seconds does the
full build pipeline take, end to end, when ts-runtypes (or typia) is wired in.**

For ts-runtypes that pipeline is:

- tsgo type-check of the user's code (the inferred `T` at every `createValidate<T>()`
  call site is fully resolved, just like in `bench:typecost`),
- Go-resolver scan + emit (the Vite plugin spawns
  [`bin/ts-runtypes`](../../cmd/ts-runtypes/) per affected entry, walks the
  type graph, writes the per-entry `virtual:rt/*` modules + their disk-cache
  fingerprint),
- Vite bundle of the rewritten source.

For typia the equivalent path is:

- tsgo type-check (same as above — `typia.createIs<T>()` resolves the same
  literal `T`),
- the `ttsc` / `@ttsc/unplugin` esbuild adapter runs typia's **Go-native
  transform** that rewrites each `typia.createIs<T>()` call into a generated
  validator body (the project's `bench:typia` competitor already wires this;
  see [`container/benchmarks/competitors/typia/esbuild.config.mjs`](../../container/benchmarks/competitors/typia/esbuild.config.mjs)),
- esbuild bundle.

These are the only two libraries in the suite whose **build-time** cost is
non-trivially affected by the type the user wrote. The others are runtime-only:
zod / typebox / ajv carry a fixed import cost and then their schema is just
ordinary user JS, so their compile-time number is essentially the **baseline**
(plain `tsc` over the same probe). The benchmark needs them anyway — as the
no-transform baseline column — to show the **delta** the transforming
libraries pay over a vanilla type-check.

This is the metric a user opening a docs page can grok in one line:

> "How many seconds does adding ts-runtypes / typia to my build cost me, vs.
> plain `tsc`, on each shape?"

Without it, the project's pitch about being a **compile-time** tool has no
build-time number attached.

### What to measure (full suite, per case)

Same suite the runtime bench uses: every case in
[`container/benchmarks/shared/cases/`](../../container/benchmarks/shared/cases/)
(`validation` + `format-validation` + `realworld`, ~263 cases). One row per case,
columns per competitor — identical shape to the existing
[`results/<name>.json`](../../container/benchmarks/results/) + the aggregator,
so the docs site can render it the same way the runtime + typecost panels are
rendered today.

Per (case, competitor), the cell records the **wall-clock cost** of building a
self-contained probe that:

1. imports the competitor's runtime (the same bind-mounted competitor
   `node_modules` the runtime bench uses — for ts-runtypes also the bind-mounted
   `bin/ts-runtypes` + first-party packages, see
   [`scripts/benchmarks.sh`](../../scripts/benchmarks.sh) `mount_args`),
2. authors the case's literal `T` (or the case's schema, for the schema-form
   libraries) verbatim, exactly the way `typecost.mjs` extracts it today,
3. declares the case's first valid sample as `const x: T = <sample>` to force
   structural assignment (the cost a user pays on every concrete value),
4. builds the probe end-to-end through the competitor's actual build pipeline,
   not a synthetic compiler-API call:

   - **ts-runtypes** — Vite build with `vite-plugin-runtypes` configured the
     way the ts-runtypes competitor configures it, so the Go resolver is
     actually spawned per case;
   - **typia** — esbuild + `@ttsc/unplugin` typia transform, same config as
     [`competitors/typia/esbuild.config.mjs`](../../container/benchmarks/competitors/typia/esbuild.config.mjs);
   - **zod / typebox / ajv** — plain Vite (or plain `tsc --noEmit`) over the
     same probe, as the no-transform baseline column.

The cell stores both wall-clock and a process-CPU-time number so the table
can show the user-felt number (wall) and a noise-resistant number (CPU) side by
side, with the option of reporting the apples-to-apples cases only (the cases
every form supports) the way the runtime bench already does.

### Cold vs warm caches

ts-runtypes's whole compile-time pitch is the **disk cache**: after the first
build, downstream rebuilds reuse the per-entry virtual modules + per-fn cache
entries unchanged (see CLAUDE.md → Rewrite mechanics + Disk cache format v9).
A single-number benchmark that doesn't distinguish cold from warm hides this.
Report TWO numbers per cell, same as `bench` reports correctness + throughput
separately:

- **Cold** — fresh container, fresh `.vite/` + fresh `.docdata` cache dirs, the
  Go resolver runs for every case. This is the absolute upper bound and the
  most honest number for "first-time CI".
- **Warm** — same probe rebuilt with the disk cache already populated. The
  marginal cost of a no-op rebuild.

For typia the analogous distinction is its `ttsc` plugin compile cache (the
`.ttsc` named volume already documented in
[`container/benchmarks/README.md`](../../container/benchmarks/README.md)); the
first cold run for typia today is ~200s plugin compile, which would dominate
the cold column. Either subtract that one-time cost (it's a constant, not
per-case) or carve it into a separate "tool warm-up" cell so the per-case
numbers stay comparable. Decide before designing; probably: report the
plugin-compile time as a one-line preamble and start the wall-clock at "plugin
ready, suite starts".

### Where the bench lives

Same shape as `typecost/`:

```
container/benchmarks/
  compiletime/
    compiletime.mjs           # the driver, mirrors typecost.mjs structure
    tsconfig.json
  results/
    ts-runtypes.compiletime.json
    typia.compiletime.json
    zod.compiletime.json
    typebox.compiletime.json
    ajv.compiletime.json
```

Driver responsibilities (one `.mjs` per the existing pattern, no new package):

1. **Extract** the case's literal `T` (ts-runtypes, typia) or schema EXPR
   (zod, typebox) from the same competitor `cases.ts` files `typecost.mjs`
   already reads — REUSE the extraction helpers (`extractTypeForm`,
   `extractSchemaCompetitor`, `extractTsGo`, `extractPreamble`,
   `unwrapThunk`, …) directly. No second source of truth.
2. **Assemble** a probe per (case, competitor) into the right competitor
   directory so `node_modules` resolution + each competitor's `exports` map
   work natively (same trick `typecost.mjs` uses with one probe path per
   competitor dir).
3. **Build** the probe through the competitor's real build pipeline:
   - ts-runtypes: spawn `vite build` (or run Vite programmatically) with the
     ts-runtypes competitor's `vite.config.ts` pinned to the probe entry;
   - typia: spawn esbuild with the typia competitor's esbuild config pinned
     to the probe entry;
   - zod / typebox / ajv: spawn `tsc --noEmit` over the probe (or the same
     `vite build` minus the rewrite plugin — TBD, see open questions).
4. **Time** each build with `process.hrtime.bigint()` (wall) +
   `process.cpuUsage()` (CPU). Subtract a baseline build of a trivial probe
   the same way `typecost.mjs` subtracts a baseline instantiation count, so
   the number is the marginal cost of THAT case's type, not the import
   scaffolding.
5. **Write** results to `results/<competitor>.compiletime.json` shaped like
   the other per-competitor results files (`{competitor, cases:[{key, group,
   name, cold_ms, warm_ms, cold_cpu_ms, warm_cpu_ms}], total}`), so
   [`aggregate.mjs`](../../container/benchmarks/aggregate.mjs) can join by
   case key the same way it joins the runtime + typecost columns.

#### Reuse, don't reinvent

The existing benchmark infrastructure already solves the hard problems —
isolated competitor dirs, bind-mount overlays, the `--rm` per-competitor
container, the per-case totality check — and the new axis MUST inherit them
unchanged. Concretely:

- **One probe per competitor dir.** Already the pattern: see `PROBE_TSGO` /
  `PROBE_TYPIA` / `PROBE_ZOD` / `PROBE_TYPEBOX` in `typecost.mjs`. Reuse them.
- **Mounts.** `scripts/benchmarks.sh:mount_args` already mounts
  `bin/ts-runtypes` + first-party packages for the ts-runtypes competitor and
  the typia `.ttsc` named volume for typia. Reuse them.
- **Suite extraction.** All the AST helpers (`unwrapExpr`, `findMapObject`,
  `unwrapThunk`, `extractTypeForm`, `extractSchemaCompetitor`, the realworld
  preamble handling) are already correct in `typecost.mjs`. Lift them into a
  shared file under `container/benchmarks/_lib/` if the new driver wants
  them; do NOT copy-paste.
- **Container image.** Same shared `ghcr.io/mionkit/tsrt-website:latest`
  image the runtime + typecost bench already use; no new image, no new
  Containerfile.

### Reporting

A new section in the website docs (under
[`container/website/content/`](../../container/website/content/), wherever the
existing runtime + typecost panels live) with one table per group
(validation / format-validation / realworld), showing per-case cold + warm
ms per competitor + apples-to-apples totals on the subset every column
measured. Same voice rules apply (no em-dashes, plain language, etc. —
[CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container/websitecontent)).

Headline line in the top-level "Benchmarks" page (rough shape; numbers fake):

> Compile-time cost per case (full validation suite, 263 cases):
>
> ```
> ts-runtypes     ~Xms cold  ~Yms warm    transform on
> typia           ~Ams cold  ~Bms warm    transform on (Δ vs baseline)
> zod             ~Cms baseline           no transform
> typebox         ~Dms baseline           no transform
> ajv             ~Ems baseline           no transform
> ```

The point of the table is **not** to beat typia on cold builds (typia's `ttsc`
toolchain has been tuned for years and runs a native-Go transform too); it's
to put real numbers next to the claim that ts-runtypes is a compile-time tool,
and to make the **warm** column the real story — that's where the disk cache
earns its keep.

### Open questions (decide before writing)

1. **What's the baseline build for ts-runtypes / typia.** Plain `tsc --noEmit`
   over the same probe? Or Vite-without-the-plugin? The first is simpler but
   skips the bundler cost entirely; the second is fair to the real-build
   number but conflates Vite's own cost with the transform. Likely: report
   BOTH — a "TS type-check only" baseline (just `tsc --noEmit`) so each
   competitor's delta is "what the transform adds on top of `tsc`", AND a
   bundler-included number so the absolute wall-clock matches a real `vite
   build`.
2. **Per-case or per-batch.** Each case as its own one-file build is the
   cleanest signal (the existing `typecost.mjs` does this), but Vite +
   esbuild have non-trivial startup costs that get amortized over batches.
   Likely: per-case is the right unit (matches `typecost.mjs`); the startup
   cost is what the baseline-subtract is for.
3. **Cold cache definition for ts-runtypes.** Today the disk cache lives at
   the Vite plugin's configured cache dir; "cold" means "wipe that dir
   before each case". Fast on macOS, slower in podman over a bind mount. May
   need an in-memory cache dir for the bench so the cold number isn't
   dominated by filesystem latency on the runner. Probably mount a `tmpfs`
   for the cache dir in the bench container.
4. **Typia plugin warm-up.** Mentioned above; treat it as a one-line
   preamble cost reported separately, NOT folded into per-case cold cells.
5. **Process isolation.** Each per-case build should be its own child
   process so the Vite / esbuild module graphs don't leak between cases
   (typecost.mjs reuses the compiler host on purpose — opposite trade-off
   there, because the type-check has no per-case state of its own). Likely:
   spawn a fresh node child per case for the wall-clock cells; reuse the
   shared driver process only for orchestration.
6. **Variance handling.** Wall-clock numbers wobble more than instantiation
   counts. Per the existing `bench` harness, run each case N times and
   report median (drop top + bottom). Default N=5 for cold (the slow
   number), N=10 for warm. Configurable via env.
7. **What about format-validation.** The shared `format-validation` group
   tests format brands (`Email`, `Slug`, `IPv4`, …) which ts-runtypes
   bakes into the structural type via the marker library's format types
   (see [`packages/ts-runtypes/src/formats/`](../../packages/ts-runtypes/src/formats/)).
   For ts-runtypes the build-time cost is "resolve the brand at the call
   site + emit a tiny check"; for typia it's "tag intersection, transform
   generates the check". Both should land in this bench unchanged — they're
   regular cases.
8. **typia plugin compile is huge and could distort the docs.** Worth
   showing it (it's reality), but in a separate "tool startup" section,
   not folded into per-case numbers. Mirror the way `bench` already calls
   it out in its README.

### Sketched approach

1. **Lift extraction helpers.** Move the AST helpers from
   `container/benchmarks/typecost/typecost.mjs` into a small
   `container/benchmarks/_lib/extract-cases.mjs` so both `typecost.mjs` and
   the new `compiletime/compiletime.mjs` consume the same parser. Behaviour-
   preserving move; the existing typecost tests (if any) keep passing.
2. **Scaffold the driver.** `container/benchmarks/compiletime/compiletime.mjs`
   alongside the existing `typecost/typecost.mjs`. Reuse the bench's existing
   `RESULTS_DIR` + `RT_BENCH_CASE` env conventions.
3. **Wire per-competitor builds.** Each competitor exposes a small helper
   `buildProbe(probePath): Promise<void>` in its competitor dir (ts-runtypes
   via Vite + the plugin; typia via esbuild + ttsc; zod/typebox/ajv via plain
   `tsc --noEmit`). The driver imports each competitor's helper and spawns it
   per case. Keeps the per-competitor build mechanics where they already live.
4. **`pnpm run bench:compiletime`.** Add the script next to
   `bench:typecost` + `bench:serialization`. Wire it into `bench:website` so
   the docs site regenerates with every aggregate run.
5. **Aggregate.** Extend
   [`aggregate.mjs`](../../container/benchmarks/aggregate.mjs) to join the
   new `<name>.compiletime.json` results into the comparison table the way
   it already joins runtime + typecost results.
6. **Website panel.** New panel under whatever
   `container/website/content/N.benchmarks/` page hosts the runtime +
   typecost panels; same voice rules.

### Not in scope (compile-time bench)

- A "RunTypes vs `tsc` baseline" benchmark that strips the plugin entirely.
  The "no transform" zod / typebox / ajv columns ARE the baseline already.
- Adding NEW cases or NEW competitors. The bench reuses the existing 263
  cases + the existing competitor list 1:1 — anything new is a separate
  todo.
- Optimisation work that arises from looking at the numbers. The bench is a
  measurement tool; the optimisations land in their own todos.
- HMR / dev-server cost. The plugin's HMR path is already characterised in
  the architecture doc; that's a different timing question (per-edit
  rebuild latency), not the per-case end-to-end build cost this todo
  measures. Separate todo if it comes up.

---

## 2. Format-serialization benchmark (missing)

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
- A new page `container/website/content/7.benchmarks/<n>.serialization-formats.md` with
  `::bench-table{bench="serialization-formats"}` — it reuses the stacked "verdict"
  layout already built in [`container/website/app/components/content/BenchTable.vue`](../../container/website/app/components/content/BenchTable.vue)
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

## 3. Benchmark table on small / very-small screens

The stacked verdict cell (round-trip headline + `↑enc ↓dec` + bytes) is taller per row
than the old single-value cell, and the case column can get wide — both hurt on narrow
viewports. The structure is already prepared for this (the case column has its own
`<col>`; cell text is CSS-driven), so it's a styling pass, no logic change.

In [`container/website/app/components/content/BenchTable.vue`](../../container/website/app/components/content/BenchTable.vue) (CSS):

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

---

## Documentation impact (when these land)

When any of the items above ship, the docs need a coordinated update so users find
the new pages / table layout / metrics without spelunking.

### Compile-time benchmark (item 1)

- [`container/benchmarks/README.md`](../../container/benchmarks/README.md) —
  add a "Compile-time cost (`bench:compiletime`)" section next to the
  existing "Type-checking cost (`bench:typecost`)" section. Document cold vs
  warm, the typia plugin warm-up carve-out, the baseline build choice (open
  question 1), and which competitors actually transform vs which are
  baseline-only.
- [`README.md`](../../README.md) — one line under the headline metrics so
  the project pitch can say "compile-time cost benchmarked end to end" with
  a link.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — cross-link the warm-cache
  story to the existing "Rewrite mechanics" + "disk cache" notes so the bench
  is explained in terms of the architecture that makes the warm number work.
- The website "Benchmarks" pages get a new panel (one per group), per the
  Reporting section above.

### Format-serialization benchmark (item 2)

- A new page at `container/website/content/7.benchmarks/<n>.serialization-formats.md`
  is the bulk of item (2); the file IS the documentation, so the work and
  the docs are inseparable. Voice rules apply: plain language, no em-dashes,
  short frontmatter (see
  [CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container/websitecontent)).
- `container/website/content/2.guide/2.type-formats.md` — extend with a
  short "binary size" paragraph linking to the new benchmark; today the
  format guide talks about validation savings but not wire savings.
- `container/website/content/2.guide/3.serialization.md` — cross-link the
  new benchmark; the serialization guide is the right entry point for
  someone wondering "does binary actually win on payload size."
- [`README.md`](../../README.md) — if the format-binary delta is as
  headline-worthy as the motivation section claims, one sentence in the
  project pitch with a link, once measured.
- The binary-buffer-sizing todo
  ([binary-buffer-sizing.md](binary-buffer-sizing.md)) and the new
  benchmark page should cross-link: the benchmark proves the win, the
  buffer-sizing notes explain the cost.

### Small-screen table layout (item 3)

- Styling pass on
  [`container/website/app/components/content/BenchTable.vue`](../../container/website/app/components/content/BenchTable.vue);
  no Markdown doc changes, but a screenshot in the section's README (if any)
  may want refreshing.
