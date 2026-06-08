# Autodocs generation — tooling notes

Lightweight reminder of two `tsc` levers worth wiring into the automatic-docs
pipeline. Not implemented yet — parked here so the option isn't forgotten.

Context: generating docs that show what each value-first builder _resolves to_
(e.g. `RT.email()` → `FormatEmail` → `string & {brand}`, or `Static<typeof
RT.union([...])>` → the concrete union) means resolving types through the
checker. The Go binary already does this for validators, but a docs pass that
runs `tsc` over the example surface can use these two flags.

## 1. Incremental — make regeneration fast

`tsc --incremental` writes a `.tsbuildinfo` cache and on the next run only
re-checks the files that changed. For an autodocs job that re-runs on every edit,
this turns a multi-second full type-check into a near-instant delta.

```bash
tsc --noEmit --incremental -p tsconfig.docs.json   # 2nd run reads .tsbuildinfo
```

Caveat (learned the hard way): the cache also makes a run report **near-zero
work**, so it's useless for _measuring_ cost. When benchmarking, force a full
check with `--incremental false` (or delete the `.tsbuildinfo`).

## 2. Extended diagnostics — the KPIs to track

`--extendedDiagnostics` prints `tsc`'s internal work breakdown. The useful KPIs
for a docs/type-perf budget (most → least actionable):

```bash
tsc --noEmit --incremental false --extendedDiagnostics -p tsconfig.docs.json
```

- **Instantiations** — generic substitutions performed. **Deterministic** (same
  code → same count, any machine), so it's the reliable signal — assert a ceiling
  in CI and a builder change that 10×s the checker cost fails loudly.
- **Memory used** — peak heap; the headline "is this getting heavy" number.
- **Types** — distinct types created; tracks surface growth.
- **Check time / Total time** — wall-clock; useful but noisy (machine/load), so
  treat as confirmation of the deterministic counts, not the primary gate.

Idea: run this over a representative `examples.ts` of every builder and fail the
docs job if `Instantiations` / `Memory` cross a budget — cheap guard that the
documented surface stays light (the whole point of the no-`infer` rule).

## Going deeper (only if a hot spot shows up)

`--generateTrace ./trace` emits `trace.json` (load in Perfetto / `chrome://tracing`)

- `types.json`; `npx @typescript/analyze-trace ./trace` ranks the hottest
  types/files. That's the tool for finding _which_ builder is expensive, not just
  how much.
