# Go-side Performance Optimizations — Applied Changes (Step 3)

Companion to [PERF-WORKLOADS.md](PERF-WORKLOADS.md) (the Step-1 baseline analysis). This
records every accepted optimization, its mechanism, and the measured effect; plus the
candidates that were evaluated and deliberately NOT applied. Functionality is unchanged —
the FE suites (89 files / 5503 tests) pass untouched after every commit, and all Go tests
pass (two Go test helpers were adapted: `setupInline` widened to `testing.TB` for
benchmarks; no assertion was weakened).

Measurement system: `internal/resolver/bench_test.go` (go benchmarks, compared with
`benchstat -count=6`, all quoted deltas p=0.002 unless noted), and
`scripts/bench-compile.mjs` (per-case micro tier + whole-suite macro tier over the four FE
suites). Raw result files land in the gitignored `bench/results/` (regenerate via the
Reproduce section below); the baseline was captured at commit `9b395b0`, the final run at
the Step-4 wrap-up commit. The aggregated numbers in this doc are the durable record.

## Cumulative result (final vs pre-optimization baseline)

Go micro-benchmarks (warm checker, our pipeline isolated):

| benchmark | time | B/op | allocs/op |
| --- | --- | --- | --- |
| geomean (all) | **-26.6%** | **-10.0%** | **-15.2%** |
| Render/all (16-family dump render) | **-49.7%** | -20.4% | -41.1% |
| Scan_WarmCache/object·union | -42…-44% | -20% | -8…-9% |
| Scan_ColdCache/* | -19…-22% | -3…-4% | -10…-14% |
| ScanWithCaches/large | -30.8% | -20.3% | -37.6% |

Macro suites (real `tsconfig.test.json` Program, one scanFiles over each suite's data
files with `includeCacheSources: all` — Go dispatch wall time):

| suite | Go dispatch | of which prep | render | alloc churn |
| --- | --- | --- | --- | --- |
| validation (2254 sites) | 490 → 371ms (**-24%**) | 79.6 → 1.7ms | 22.3 → 16.5ms | 101 → 98MB |
| serialization (1503 sites) | 554 → 488ms (**-12%**) | 26.5 → 1.2ms | 42.6 → 29.1ms | 166 → 154MB |
| format-validation | 134 → 102ms (**-24%**) | 17.0 → 0.6ms | 10.0 → 8.4ms | 35 → 34MB |
| format-serialization | 48 → 45ms (-6%) | 2.1 → 0.5ms | 4.2 → 7.9ms | 13 → 12MB |

The unchanged bulk of macro time is `markerScanMs` — dominated by tsgo's lazy
`getResolvedSignature` checking (≈21% of total CPU), which is the work the binary exists
to force and is out of scope (third_party).

Retention: the hashid dicts' salted-copy share (5.6MB ≈ 3% of process on the serialization
macro) is gone from the inuse_space profile.

Per-case micro tier (per-type synthetic compiles): top cases improved 25–32% wall; the
suite-wide geomean is ≈-2.4% because each unit is dominated by tsgo program-build (~4.5ms
of a ~5.5ms unit) and sub-millisecond Go-side readings sit inside that tier's noise floor
— the go-benchmarks above are the statistically sound per-change gate.

## Accepted optimizations (one commit each, in order)

| commit | change | measured effect at accept time |
| --- | --- | --- |
| `d94c299` | **Per-dispatch entry-render cache + validate-last ordering.** Real family renders (live DiagSink) memoize compiled entries; `CrossFamilyValRoots`' 13 collection passes hit the memo whenever those families were requested anyway. Writes gated on a live DiagSink (a diag-suppressed pass must never seed an entry a real render would reuse — its diagnostics would drop) and skipped for validate itself (renders last, no reader). | Render/all -20.9%, ScanWithCaches/large -20.1% time / -30% allocs |
| `3081903` | **Lazy render prep; Family stamped at intern; line-map provenance.** `rtRenderOpts` (provenance + ref table + memos) built only when a render runs; `PopulateFamily` stamped once at `putNode` intern (the per-Dump recursive re-stamp removed); the walkers' RefTable is the cache's live `NodesView()` map instead of a per-dispatch rebuilt+sorted copy; `scanLineCol` uses the SourceFile's lazily-cached `ECMALineMap()` + binary search instead of an O(file-bytes) walk per conversion. | Scan_WarmCache -19…-38%; macro validation prep 79.6 → 1.8ms (dispatch -20%) |
| `858db9e` | **Per-Program purefns extraction memo** (`purefns.FileCache`). OpDump re-extracted EVERY program file on EVERY dump; raw per-file results are now cached for the Program's lifetime, the cross-file fold (dedup + PFE9004) still re-runs so set-dependent diagnostics stay exact. | Render/all -36.0% on top of the above |
| `2bc4dba` | **Allocation micro-pass**: reused per-walker `InlineContext`; LIFO `EmitContext` pool (parent ctx stays checked out while children compile — reuse can't alias a live frame); lazy `orderedItems` map; `joinArgs` exact prealloc; `literalFlavour` linear scan; `parseNumberLiteral` via strconv; `isSafeName` byte loop (regexp dropped). | geomean -5.6% time; Scan_ColdCache -12…-15% |
| `149169c` | **Per-dispatch facts table** memoizing the two full-subtree predicates `isJsonCompatible` / `isExtraProof` by node ID. Only completed top-level verdicts are stored (context-free: a predicate names the node's full reachable set); in-walk intermediate values never stored so cycle-back assumptions can't leak. | macro render: serialization 42.6→34.7ms, format-validation 14.4→10.5ms; micro neutral |
| `30f21e0` | **`marker.DetectAny` memo by param-type pointer** (5 spec checks + brand-property checker lookups per parameter of every resolved call). Dies with the Program. | Scan_WarmCache -3…-8%; macro markerScan validation -11ms, format-validation -10ms |
| `b9dbebf` | **`Added` payload gated behind `includeRunTypes`; buffered stdout.** The JS clients read only the `added*` booleans — full node graphs were marshalled+piped per scan for nothing. | micro wall geomean -2.7% (avg case 6.08→5.87ms); Go-side flat (win is encode/IPC) |
| `f430c76` | **Version salt folded into the rolling hash** (`Dict.UniqueSalted`): byte-identical hashes, but the dicts retain the bare structural string (backing shared with `byStructural`) instead of a fresh `Version|structural` concatenation per entry. | serialization-macro retention: uniqueDict's 5.6MB (~3%) gone from inuse_space |
| `9702091` | **Skip declaration files in `scanAllProgramFiles`** — `.d.ts` cannot contain call expressions; the first dump walked every lib AST for nothing. | first-dump AST walk over lib files eliminated |

## Workload-document deltas (what changed vs PERF-WORKLOADS.md §2–§3)

- §2.4 per-dispatch prep: now built lazily; line/col via per-file cached line map; the
  15 `AnyXxxSupported` passes remain (measured minor — see "not applied").
- §2.6 renders: `RenderOpts` gained `EntryCache` (per-dispatch compiled-entry memo) and
  `Facts` (per-dispatch predicate memo); `RefTable` is the cache's live map.
- §2.7 `CrossFamilyValRoots`: still exists, but its 13 collection passes are memo hits
  whenever those families render in the same dispatch (the all-kinds dump and the FE
  test/bench shape). validate renders last in `familyRenders`.
- §2.8: purefns extraction is per-file memoized per Program; `Added` is no longer on the
  wire by default; stdout buffered.
- §2.9 dump eager-scan: skips declaration files.
- §3 traversal catalog: T1/T2 memoized per dispatch (facts table); T4 stamped at intern;
  the AnyXxx (T6) passes and the marker-scan/purefns double AST walk (§2.2+§2.4) remain —
  measured below the action floor after the other fixes.

## Evaluated and NOT applied (cost/benefit didn't clear the bar)

| candidate | why not |
| --- | --- |
| Fold the 15 `AnyXxxSupported` passes into one (O9/C6) | shallow per-node switches; µs-scale per dispatch after O2 — not worth the table machinery |
| Single AST walk for marker scan + purefns (C4) | purefns' callee-name pre-filter already skips signature resolution; the duplicate walk is a small slice of checker-bound markerScan; medium-risk restructuring |
| Shared base FS / host across `NewInferred` (C10) | benefits only the reset+setSources bench loop; cross-Program state risk not worth it |
| Structural id → fixed-width hash key (C13) | remaining retention (`collectionID` strings ≈6% of process) is real but the change touches dedup semantics + disk-cache verification; deferred until a workload demands it |
| EmitContext full pooling beyond LIFO reuse | parent-held contexts make general pooling alias-prone; LIFO variant captured most of the win safely |

## Reproduce

```
go test ./internal/resolver -bench=. -benchmem -run='^$' -count=6   # micro
node scripts/bench-compile.mjs --quick                              # suite tiers
node scripts/bench-compare.mjs bench/results/baseline.json bench/results/<label>.json
bin/ts-go-run-types --pprof-cpu cpu.out --pprof-heap heap.out ...   # profiles
```
