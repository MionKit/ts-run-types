# Transform wire modes — call-site edits + FE apply vs full-file Go transform (+ benchmarks)

**Status:** spec / investigation (not started)
**Owner:** TBD
**Related:** [`internal/protocol/protocol.go`](../../internal/protocol/protocol.go) (`OpScanFiles`, `OpTransform`, `Site`, `Replacement`, `TransformResult`, `SourceMap`), [`internal/resolver/dispatch.go`](../../internal/resolver/dispatch.go), [`internal/compiled/transform/transform.go`](../../internal/compiled/transform/transform.go) + [`editbuffer.go`](../../internal/compiled/transform/editbuffer.go), [`packages/runtypes-devtools/src/unplugin.ts`](../../packages/runtypes-devtools/src/unplugin.ts), [`resolver-client.ts`](../../packages/runtypes-devtools/src/resolver-client.ts), [`scan-batcher.ts`](../../packages/runtypes-devtools/src/scan-batcher.ts), [docs/ARCHITECTURE.md → Rewrite mechanics](../ARCHITECTURE.md)

## 1. Problem

### 1.1 How we got here (git-verified)

1. **JS-side rewrite era.** The plugin called `scanFiles`, got call-site data back, and applied the rewrite itself: `rewrite.ts` + MagicString (`46ad74e0`), then the zero-dependency in-house JS `EditBuffer` (`6307b227` — map output validated **byte-for-byte** against `magic-string@0.30.21` `hires: 'boundary'`).
2. **Go-transform era (today).** `a38c4498` → `67a9610d` → `7031676c` ported the rewrite + source-map generation into Go behind **`OpTransform`**; the plugin's `transform` hook became a thin wrapper: send file path, receive fully rewritten source + map ([`unplugin.ts` `transform()`](../../packages/runtypes-devtools/src/unplugin.ts)).

The port was justified as "Go executes the transform faster" — which is true of the string-editing itself. **What it didn't price in is the wire.** The daemon speaks newline-delimited JSON over stdio ([`resolver-client.ts`](../../packages/runtypes-devtools/src/resolver-client.ts): `JSON.stringify(req) + '\n'` / `JSON.parse(line)`), so per transformed file the response line carries:

- `transformed[file].code` — the **entire rewritten source**, JSON-escaped (every quote/newline/non-ASCII inflates);
- `transformed[file].map.sourcesContent` — the **entire ORIGINAL source a second time** ([`editbuffer.go:135`](../../internal/compiled/transform/editbuffer.go) embeds `[]*string{&content}`);
- `transformed[file].map.mappings` — `hires: 'boundary'` maps segment per token boundary, i.e. **dense**, often a significant fraction of the source size again;
- plus `sites` + `replacements` + diagnostics (the dispatch attaches sites/replacements to the transform response too).

Conservatively **≥ 2–3× the file's bytes cross the pipe for every transformed file**, then get `JSON.parse`d on the JS side — against a call-site payload that is O(sites), typically a few hundred bytes. On large files / many-marker projects (cold dev-server start transforms every marker file; edits re-transform), IPC + JSON encode/decode dominates the Go-side speed win the port was meant to capture.

### 1.2 The ask

Re-introduce the **call-sites + modified-chunks wire mode** (JS side applies the edits and produces the source map) **without dropping the Go full-transform mode** — both stay supported, selectable, and **benchmarked against each other** so the default is chosen on data, not vibes. The two modes also serve different hosts: full-Go transform is the natural path for a plugin-free CLI or any non-JS host; the edits mode is the light path for bundler-integrated dev loops (Vite/Rollup/webpack/Rspack/esbuild via unplugin, Rolldown next) — this feeds the strategic goal of a compiler-driven core decoupled from any one bundler.

## 2. What exists today (evidence — most of the machinery survives)

- **The wire types never left.** `OpScanFiles` still returns `Site[]` (`pos` byte offset, `id`, `paramIndex`, `argsCount`, `fnId`/`fnIds`, `trailingComma`, `module`) and `Replacement[]` (`start`, `end`, `text`, `importFrom`) — [`protocol.go`](../../internal/protocol/protocol.go). The edits mode is a wire **subset** (drop `code` + `map`), not an addition.
- **`scanFiles` is still exercised on the hot path** — [`unplugin.ts` `handleHotUpdate`](../../packages/runtypes-devtools/src/unplugin.ts) uses it for HMR, and [`scan-batcher.ts`](../../packages/runtypes-devtools/src/scan-batcher.ts) still ships the concurrency batcher whose docstring literally describes "the minimal scan surface the **rewrite pipeline** needs".
- **The JS applier exists in git history.** `rewrite.ts` + `edit-buffer.ts` as of `6307b227` (pre-`7031676c`), including the magic-string map-parity test suite — resurrectable.
- **Byte→UTF-16 conversion exists on both sides.** tsgo positions are UTF-8 byte offsets; Go's `makeByteToChar` ([`transform.go`](../../internal/compiled/transform/transform.go)) converts them to **UTF-16 code-unit offsets** (it consumes the `[]uint16` encoding and iterates code points exactly like JS `for…of`) — it is the Go port of the old JS logic. The Go side can therefore emit char-addressed edits directly.
- **Files-mode context:** cache modules are real files under `<outDir>/types/` written by `OpGenerate`; the rewrite injects a deduped import block + per-site bindings with **relative** paths to them. Whatever mode applies the edits must produce identical imports.
- **FE→Go already carries near-zero bytes.** The steady-state transform request is `{op: 'transform', files, outDir}` — file paths only, no source text ([`resolver-client.ts` `transform()`](../../packages/runtypes-devtools/src/resolver-client.ts)). The resolver reads the bytes itself from its tsgo Program/overlay (the `OpTransform` contract in [`protocol.go`](../../internal/protocol/protocol.go)); source text crosses FE→Go only via `setSources` (HMR pushes edited content, tests/fuzz harnesses), `--inline-sources-stdin`, or `--inline-server`. Consequence: the bundler-supplied `code` string is used **only** for the marker-import pre-filter today — the returned code is rebuilt wholesale from the resolver's view, so the entire wire bloat is Go→FE.

## 3. Design

### 3.1 Plugin option

```ts
// PluginOptions
transformMode?: 'go' | 'edits'; // default: decided by §4 benchmarks
```

- **`'go'`** — today's path: `resolver.transform()` → full `code` + `map`.
- **`'edits'`** — plugin calls the edits op (§3.2), applies the returned chunks with the resurrected JS `EditBuffer`, generates the map JS-side (`hires: 'boundary'` — the two implementations are already proven byte-equal, §2), and returns `{code, map}` to the bundler itself.

Both modes keep the surrounding behaviour identical: the marker-import short-circuit, `regenerate()` on `addedRunTypes`/`addedPureFns`, diagnostics surfacing, and the HMR path (`scanFiles` + `generate`) are mode-independent.

### 3.2 Wire: how the edits travel

Two options; **lean (b)**, decide during implementation:

- **(a) Resurrect the full JS rewrite** from git history — zero wire change (`sites` + `replacements` as-is); JS re-derives binding names, the import block, comma splicing, module targeting.
  *Against:* since `46ad74e0` the rewrite grew real logic — `fnIds` multi-function arrays, `moduleMode` bundle targeting (`Site.Module`), relative import-path computation into `<outDir>/types/`, pure-fn `Replacement` splicing, `trailingComma` handling. Reviving a second implementation of *naming + assembly* recreates a Go↔JS sync boundary that `7031676c` deliberately killed.
- **(b) Go computes a flat edit list; JS applies it blindly.** New request knob (e.g. `Request.IncludeEdits` on `scanFiles`, or a dedicated `OpTransformEdits`) returning per file:

  ```jsonc
  "edits": {
    "<file>": [ {"start": 0, "end": 0, "text": "import {…} from './__runtypes/types/…';\n…"},   // import block
                {"start": 1234, "end": 1234, "text": ", __rt_ab1_cd2ef34"} ]                     // per-site splice
  }
  ```

  `start`/`end` are **UTF-16 code-unit offsets** (Go already has `makeByteToChar`; the JS applier indexes strings natively). All naming/assembly stays single-sourced in the existing Go transform — the same code path that renders `OpTransform` output produces the edit list *instead of* applying it, so the two modes cannot drift by construction. The JS side is ~100 lines: sort, apply via `EditBuffer`, `generateMap`.

  The wire unit is a hard contract: **UTF-16 code units, never bytes, never runes** — astral-plane characters make the three diverge; pin with a multibyte fixture.

  **Source-consistency precondition (new in `'edits'` mode).** The edits are computed against the **resolver's** bytes (Program/overlay — the request carries file paths only, §2), but the FE applies them to the `code` string the bundler handed the hook. `'go'` mode never faces this: it returns code rebuilt wholesale from the resolver's view and ignores the incoming `code` beyond the pre-filter (which also means edits from any *earlier* `enforce: 'pre'` plugin are silently discarded today — an inherent, currently-harmless property of the disk-read model). In `'edits'` mode, "resolver bytes == bundler bytes" becomes a hard correctness precondition: any divergence (an upstream pre-plugin's edit, a stale overlay) lands every offset in the wrong place. **Guard:** the edits response carries a cheap non-cryptographic content hash (FNV/xxhash — algorithm is an implementation detail, but it must be computed over the exact string the offsets index) of the source per file; the applier hashes the received `code`, and on mismatch falls back to `setSources({[file]: code})` + re-request — one FE→Go source upload (1×) still beats the standing 2–3× Go→FE of full-transform mode, and `setSources` triggers a full Program rebuild, so the fallback must stay the exception: emit a debug/warn line when it fires (persistent firing = a plugin-ordering problem the user should fix). HMR already pushes edited content via `setSources`, so the common dev-loop divergence is pre-covered.

### 3.3 Quick win worth testing first: drop `sourcesContent` from the Go map

The bundler hands the plugin the original `code` and composes chained source maps itself — it does not need the original source embedded in our map. Elide `sourcesContent` (or gate behind an option) in `'go'` mode and the heaviest single wire item disappears **without any mode work**. Verify no consumer depends on self-contained maps (the playground's transformed-source view, devtools e2e map tests) before flipping the default. This is milestone 0 and also narrows the benchmark question to "full code vs edits", isolating the real variable.

### 3.4 Host/bundler support matrix

| Host | `'go'` (full transform) | `'edits'` (FE apply) |
|---|:---:|:---:|
| Vite / Rollup / Rolldown / webpack / Rspack / esbuild (unplugin) | ✅ | ✅ (expected dev-loop winner) |
| Plugin-free CLI (`ts-runtypes` transforming on disk), non-JS hosts | ✅ (only option) | ❌ (needs a JS applier) |

`'go'` therefore can never be removed — it is the universal/no-bundler path; `'edits'` is a per-host optimization.

## 4. Benchmarks (explicit requirement — both modes, kept)

- **Measure:** per-file transform latency end-to-end (plugin hook entry → `{code, map}` ready), cold full-build wall time, HMR update loop; **wire bytes both directions**; Go-side JSON-encode and JS-side `JSON.parse` shares; peak RSS both processes.
- **Sweep:** file size × marker-site density × project file count; both `transformMode`s; `sourcesContent` on/off within `'go'`.
- **Across hosts:** at least Vite and one non-Vite unplugin target (esbuild or Rollup), plus the no-bundler CLI path as the `'go'`-only baseline.
- **Instrumentation:** byte counters belong in [`resolver-client.ts`](../../packages/runtypes-devtools/src/resolver-client.ts) (count written/read line lengths — cheap, no Go changes); per-phase Go timings can ride the existing `Metrics` block (`IncludeMetrics`) if finer splits are needed.
- **Where it lives:** a new verb in the bench container ([`scripts/benchmarks.sh`](../../scripts/benchmarks.sh), e.g. `bench:transform-wire`, fixtures under `container/benchmarks/`), reusing the compiletime harness's repeat/median infra for stable numbers. Remember the standing rule: changing `container/benchmarks/_deps` requires republishing the GHCR bench image.
- **Deliverable:** a results table (optionally a website benchmarks page via the existing gen-bench-docs flow) and a **data-driven default** for `transformMode`, with the crossover documented (e.g. "edits wins above N KiB / M sites").

## 5. Correctness gates

- **Mode-parity corpus test (the load-bearing one):** run both modes over the full plugin fixture corpus and assert **identical output `code` and identical source maps**. Byte-equal maps are attainable — the Go EditBuffer was validated byte-for-byte against the JS implementation when ported (`6307b227` / `67a9610d`); design (b) makes code-equality structural. Any intentional divergence must be decoded-mappings-equivalent and documented.
- Multibyte / astral-plane fixture pinning the UTF-16 offset contract (§3.2).
- **Source-hash guard fixture (§3.2):** a transform where the bundler-supplied `code` deliberately diverges from the resolver's bytes (simulating an upstream `enforce: 'pre'` plugin) — assert the mismatch is detected, the `setSources` + re-request fallback produces correct output, and the debug/warn line is emitted. Plus the happy path: matching hash applies edits with zero extra round-trips.
- The e2e vite-build composite source-map test (breakpoints land on original lines) must run in **both** modes.
- **Marker test coverage rule applies:** parity fixtures must cover both call shapes — static `getRunTypeId<T>()` and value-first `getRunTypeId(value)` — plus multi-fn `createX` sites (`fnIds`), `trailingComma` sites, pure-fn `Replacement`s, and `moduleMode: allSingle` bundle targeting.
- Go tests for the new op/knob in [`internal/resolver`](../../internal/resolver) + [`internal/compiled/transform`](../../internal/compiled/transform); `go test ./internal/...`.

## 6. Risks / open questions

1. **Drift between modes** — killed structurally by design (b) + the parity corpus; this is the reason to prefer (b) over resurrecting the JS naming logic.
2. **Default choice** — do not pre-commit; the benchmark decides. Plausible outcome: `'edits'` default under bundlers, `'go'` for CLI (which has no choice).
3. **`sourcesContent` elision** — confirm bundler map-chaining fills original content downstream in dev AND build; check the playground's use of transform output.
4. **Option naming** — `transformMode: 'go' | 'edits'` vs `'full' | 'sites'`; also whether the knob belongs in tsconfig `ts-runtypes` plugin config (project-level) or plugin options only (host-level). Lean host-level: it's an IPC/host concern, not a project semantic — it must NOT fold into disk-cache fingerprints (same artifacts either way).
5. **Daemon/socket client** — `ResolverSocketClient` gets the same treatment (same wire, same win).
6. **Response trimming in `'go'` mode** — while here: the transform response also carries full `sites`/`replacements` the thin wrapper only uses for emptiness checks; a `hasRewrites` boolean would trim further. Cheap, optional.
7. **Upstream pre-plugin compatibility** — both modes assume our plugin sees pristine source: `'go'` silently clobbers an earlier pre-plugin's edits, `'edits'` detects-and-recovers via the hash guard (§3.2). Document the plugin-ordering requirement on the website configuration page either way; decide whether `'go'` mode should at least *detect* (compare incoming `code` length/hash against the resolver's) and warn instead of clobbering silently.

## 7. Milestones

1. **Instrument + quick win:** wire-byte counters in `resolver-client.ts`; `sourcesContent` elision experiment; capture baseline numbers (these motivate everything after — land first).
2. **Wire:** edits payload per §3.2(b) behind a request knob, including the per-file source content hash; Go tests incl. UTF-16 fixtures.
3. **Plugin:** `transformMode` option; resurrect the JS `EditBuffer` (+ its map test-suite) from `6307b227`; the ~100-line applier; mode-parity corpus test; e2e both modes.
4. **Benchmarks:** `bench:transform-wire` in the bench container; sweep + results table; pick and set the default.
5. **Docs:** [ARCHITECTURE.md → Rewrite mechanics](../ARCHITECTURE.md) (it currently documents Go-owns-the-transform as the only path), README plugin options, website configuration page (option + guidance), CLAUDE.md rewrite-mechanics highlights if the sync boundaries move.
6. On implementation, `git mv` this file into [`docs/done/`](../done) (or [`docs/partially/`](../partially)) updated to match what shipped.
