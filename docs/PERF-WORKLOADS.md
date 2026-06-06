# Go-side Performance Workloads — Analysis (Step 1)

> Status: baseline analysis of commit `pre-optimization` on branch `claude/relaxed-noether-drk9rc`.
> Scope: everything the Go binary does per protocol operation — job categories, execution order,
> complexity, every full-tree loop, existing memoization, and the ranked optimization candidates
> that Step 3 consumes. Profile shares come from the benchmark/profiling system added in Step 2.
> A post-optimization companion ([PERF-OPTIMIZATIONS.md](PERF-OPTIMIZATIONS.md)) records what was
> changed and the measured effect.

Cardinality symbols used throughout:

| symbol | meaning |
| --- | --- |
| `F` | files in a scanFiles request |
| `A` | AST nodes per file |
| `C` | CallExpressions per file |
| `P` | parameters per resolved signature |
| `N` | RunType nodes interned in the session cache |
| `n` | RunType nodes in one request's scoped projection |
| `T` | distinct `*checker.Type` pointers reached from marker roots |
| `S` | accumulated sites in the session (`resolver.sites`) |
| `B` | bytes of one source file |
| `K` | cache families requested (≤16) |
| `M` | entries emitted by one family render |
| `D` | same-family deps per entry |
| `E` | edges (ref slots) across cached nodes |

## 1. Protocol operations (the job categories)

Wire = newline-delimited JSON over stdio/unix-socket. Decode loop: `cmd/ts-go-run-types/main.go:serveRequests` → `resolver.Dispatch` (`internal/resolver/dispatch.go:19`) → `json.Encoder` (unbuffered stdout).

| op | purpose | handler |
| --- | --- | --- |
| `scanFiles` | find marker call sites in F files, intern types, emit Sites (+ optional cache sources) | `dispatch.go:22` |
| `dump` | eager-scan all program files, return full cache (+ cache sources; all 16 when unfiltered) | `dispatch.go:230` |
| `setSources` | build a fresh inferred Program from an overlay map, swap it in | `dispatch.go:395` |
| `reset` | wipe Program/checker/cache/sites/purefn index | `dispatch.go:400` |
| `resolveID` | return one canonical node by wire id | `dispatch.go:403` |
| `tsCompile` | timed pure-tsgo bind+check+emit baseline (`TsCompileMs`) | `dispatch.go:409` |

Client flows that matter:

- **Vite build/dev**: one `program.New` (tsconfig) at startup; `scanFiles([file])` per transformed user file (no `includeCacheSources`); `dump({includeCacheSources:[kind]})` once per imported cache module (≤16 dumps); HMR re-runs scanFiles per changed file.
- **Bench/test inline-server**: cycles of `reset → setSources → scanFiles(includeCacheSources)`. Every cycle pays full Program construction.

## 2. scanFiles pipeline — order, loops, complexity

Phases in execution order. "Loops" lists every iteration the phase performs over AST/type/RunType structures.

### 2.1 Program + checker (once per Program, not per scan)

`program.New` / `NewInferred` (`internal/program/program.go:37,87`) → `compiler.NewProgram` + `BindSourceFiles` + one `GetTypeChecker` lease. Dominated by tsgo parse/bind/check of user files **plus all lib `.d.ts`**. This is the `tsCompileMs`-shaped share — unoptimizable internally (third_party), but *how often we pay it* is ours: `NewInferred` constructs a fresh `bundled.WrapFS(cachedvfs.From(osvfs.FS()))` and host per call, so **every `setSources` re-reads and re-parses every lib file from scratch** (the FS byte-cache dies with the Program).

### 2.2 Marker scan + site detection — `dispatchScanFiles` (`internal/resolver/scan.go:103`)

Per file:
- `forEachCallExpression` (`scan.go:860`): full AST walk, O(A). **AST walk #1.**
- `scanCall` (`scan.go:153`) per CallExpression:
  - `Checker_getResolvedSignature` — forces checker resolution of **every** call in the file (checker memoizes per node).
  - `marker.DetectAny` (`internal/marker/marker.go:152`) per parameter: loops 5 specs; per spec an alias match, a union-member loop, and — for *every non-matching* spec with a brand — `Checker_getPropertyOfType` on the param type. ≈5 checker property lookups per parameter of every call. **No memoization by param type pointer.** O(C·P·5) checker calls.
  - On match: `enclosedByInjectionMarker` (`scan.go:501`) — ancestor walk re-resolving each ancestor call's signature (memoized by checker).
  - Diagnostics use `scanLineCol` (`scan.go:801`): **O(B) byte scan per line/col conversion** (no line index; tsgo has one internally).
- `recordFileIDs` (`internal/resolver/scope.go:11`): DFS over the RunType graph reachable from the file's sites — O(n+E) per file, fresh `visited` map. **RunType walk #1.**

### 2.3 Type projection — `Cache.AssignID` (`internal/compiled/runtype/serialize.go:365`)

Two-level memo: `byPtr` (pointer) → `byStructural` (shape). Miss path:
- `typeid.Computer.Compute` (`internal/compiled/runtype/typeid/typeid.go:47`): recursive walk over the `checker.Type` graph building the **structural id string — O(subtree) text per node, parents embed full child ids**. Pointer-memoized per Computer. Cycle anchors run a second bare-token sub-walk (`structuralSignature`, memoized). **checker.Type walk #1 (+#2 for cycles).**
- `hashid.Dict.Unique` (`internal/hashid/hashid.go:92`): stores the **salted structural string twice** (entries + reverse maps); `cache.byStructural`/`byID` store the unsalted string twice more → ≈4 copies of O(subtree) text retained per node. This is the main retention driver.
- `projectType` (`serialize.go:449`): recursive projection into `protocol.RunType` nodes — checker property/signature walks per node, `fmt.Sscanf/Sprintf` number parsing (`parseNumberLiteral`), `regexp.MatchString` per property name (`isSafeName`). **checker.Type walk #3** (once per new node, then memoized).

### 2.4 Per-dispatch response prep (`dispatch.go:33-64`) — every scanFiles, even cache-less ones

- `cache.Added(before)` — O(added).
- **15 × `AnyXxxSupported(added)`** (e.g. `internal/compiled/typefns/validate.go:121`): 15 separate passes over the added slice; each `Supports` is shallow (kind/subkind switch). O(15·added). **RunType pass #2.**
- `extractPureFnsForScan` (`dispatch.go:57` → `internal/compiled/purefns/walker.go:90`): **full AST walk #2 over the same files** (own `findCalls` visitor) with a cheap callee-name pre-filter before signature resolution.
- `resolver.rtRenderOpts(...)` built **unconditionally** (`dispatch.go:64`), which costs:
  - `buildProvenanceSites` (`internal/resolver/render.go:67`): for **all S session sites** — `sourceFile` lookup + `scanLineCol` O(B) byte scan each → O(S·B) per dispatch.
  - `fullRefTable` (`render.go:47`): `cache.Dump()` — sort of all N ids O(N log N) + **`protocol.PopulateFamily` recursive re-stamp over every node and its ref slots O(N+E)** (`internal/protocol/family.go:121`; pure function of Kind/SubKind, recomputed on every Dump/Added/NodeByID/NodesForIDs call) + building a fresh N-entry map. **RunType pass #3.**
  - In the real Vite transform flow no cache source is requested, so all of this work is **discarded**.

### 2.5 Scoped projection — `scopedDump` (`internal/resolver/scope.go:124`)

`IDsForUnion` set-union + sort O(n log n); site filter O(S); `NodesForIDs` O(n) (PopulateFamily again per node).

### 2.6 Cache-family renders — `RenderFnModule` (`internal/compiled/typefns/module.go:360`) × K families

Per requested family:
- demand collection `collectFamilyDemand` O(S·demands).
- worklist: per (root,variant) + transitive plain children → `renderEntryWithDeps` (`module.go:683`):
  - disk-cache `tryReadCachedEntry` (read+JSON-decode per entry) or **`Walker.Compile`** (`internal/compiled/typefns/walker.go:425`): recursive walk of the entry's RunType subtree dispatching the family emitter; string code built by concatenation up the tree (O(depth·|code|) copying); `UpdateDependencies`/`recordCrossFamilyDep` are O(D) linear scans per add. **RunType walk #4 (per entry × per family).**
  - inside JSON-family emits, the *full-subtree predicates* run repeatedly (see §3).
- dangling-dep fixpoint O(M·D·rounds); DFS topo sort O(M+D); `strings.Builder` body assembly; `cachetpl.Splice`.

### 2.7 validate's cross-family seeding — `CrossFamilyValRoots` (`module.go:304`)

Before every validate render: **13 additional full family renders to `io.Discard`** (validationErrors, all JSON families, unknown-keys group, binary pair, formatTransform) purely to harvest `val_<member>` edges. With a disk store, each is a read+decode per entry; without one (default test/bench path, and any run with no `--cache-dir`), each is a full Walker compile of every demanded entry in that family. Requesting `['validate']` therefore compiles ~14 families; requesting all kinds compiles the 13 *twice* (once discarded, once real).

### 2.8 purefns render, diagnostics flush, JSON encode

`renderPureFnsModule` (OpDump path re-extracts over **all program files**); response marshal via stdlib `encoding/json` with custom `MarshalJSON` (`internal/protocol/protocol.go:610`); `Added` carries **full RunType nodes on every scanFiles although the JS client only reads the `added*` booleans** (`packages/vite-plugin-runtypes/src/resolver-client.ts:203-218`) — pure wire/marshal waste.

### 2.9 dump-specific: `scanAllProgramFiles` (`scan.go:44`)

First dump scans **every Program source file** — including all lib/ambient `.d.ts`, which cannot contain marker call sites — through the full §2.2 machinery (AST walk + `getResolvedSignature` per call).

## 3. Traversal catalog (the §3.1 join targets)

Full-subtree walks over the **RunType tree** (all pure functions of the canonical node — parent-independent by the canonical-node rule, hence memoizable by `rt.ID`):

| # | function | file:line | computes | called from | memo? |
| --- | --- | --- | --- | --- | --- |
| T1 | `isJsonCompatible` / `jsonCompatRecursive` / `objectChildrenCompat` | `typefns/json_compat.go:40,44,180` | union wrap-or-not (native JSON round-trip) | `json_prepare_safe.go:847`, `union_flat_layout.go:119,138` — per union member, per family render | none; fresh `visited` map per call |
| T2 | `isExtraProof` / `extraProofRecursive` | `typefns/json_prepare_safe.go:563,567` | "object can carry undeclared keys" | `json_prepare_safe.go:314` (per property!), `:625`, `:643` | none; fresh map per call |
| T3 | `Walker.Compile` noop/unsupported outcome | `typefns/walker.go:425` | per-(entry,family) body, isNoop, isUnsupported | every family render; ×14 inside validate via §2.7 | disk store only (plain variants) |
| T4 | `protocol.PopulateFamily` | `protocol/family.go:121` | Family/NotSupported stamps | every `Dump`/`Added`/`NodeByID`/`NodesForIDs` | none — idempotent recompute |
| T5 | `recordFileIDs` walk | `resolver/scope.go:11` | per-file reachable id set | per scanned file | per-file visited only |
| T6 | 15 × `AnyXxxSupported` | per-family files (e.g. `validate.go:121`) | "any added node supported" | every scanFiles dispatch | shallow per node, but 15 passes |
| T7 | union helpers: `finalizeUnion` / safe-order / discriminators | `runtype/union_safeorder.go` (serialize-time) | SafeUnionChildren, UnionDiscriminators | once per union node at projection | computed once ✓ |

Full walks over the **TS AST**: §2.2 marker scan and §2.4 purefns extraction — two independent visitors over identical files per scanFiles request.

Full walks over the **checker.Type graph**: `typeid.Compute` (+cycle sub-walk) and `projectType` — both pointer-memoized; acceptable.

## 4. Existing memoization (do not re-add)

`Cache.byPtr/byStructural/byID/fileTypeIDs/inProgress/circularIDs` (`serialize.go:58-106`); `typeid.Computer.cache/sigCache`; `hashid.Dict` reverse map; `marker.packageNameCache` (sync.Map, dir→pkg name); checker-internal node-links memo for `getResolvedSignature`; disk RT store (`internal/cache/disk`) incl. FormatVersion-2 cross-family edges; CodeNS sentinel propagation (replaced an earlier `subtreeFullySupported` pre-walk — see ROADMAP).

## 5. Go-technique findings (tagged inefficiencies)

| id | site | issue | technique |
| --- | --- | --- | --- |
| G1 | `scan.go:801 scanLineCol` | O(B) byte scan per conversion; O(S·B) per dispatch via provenance | precompute per-file line index (or reuse tsgo scanner's) |
| G2 | `dispatch.go:64` | rtRenderOpts/provenance/refTable built when no cache requested | lazy build, only when `anyCache` |
| G3 | `render.go:47 fullRefTable` | rebuilt O(N log N + N) per dispatch | maintain incrementally on Cache (append-only id→node map already exists as `nodes`) |
| G4 | `family.go:121 PopulateFamily` | recursive re-stamp per Dump/Added call | stamp once at intern time |
| G5 | `serialize.go:1369 parseNumberLiteral` | `fmt.Sscanf`+`Sprintf` round-trip | `strconv` |
| G6 | `serialize.go:1396 isSafeName` | regexp per property | byte-loop |
| G7 | `json_compat.go:216 literalFlavour` | map alloc per call for ≤2 flags | linear scan |
| G8 | `hashid.Dict` + `Cache` | ≈4 retained copies of O(subtree) structural text per node | store salted form once; consider fixed-width strong hash as dedup key |
| G9 | `protocol.Response.Added` | full nodes marshalled per scan; JS reads only booleans | omit unless explicitly requested |
| G10 | `main.go:131` | unbuffered stdout encoder | bufio + flush per response |
| G11 | `walker.go` dep recording | O(D) linear scan per add | small-set map alongside slice |
| G12 | `marker.go:152 DetectAny` | 5 specs × brand property lookups per param, no memo | memoize verdict by `*checker.Type` |
| G13 | `program.go:87 NewInferred` | fresh FS/host per setSources → libs re-read+re-parsed per bench cycle | share base FS (and investigate `NewCachedFSCompilerHost` shim) |
| G14 | `scan.go:44 scanAllProgramFiles` | scans lib/ambient `.d.ts` for call sites | skip declaration files |

## 6. Ranked candidate list (Step 3 input) — profile-ranked

Measured on the Step-2 system (commit `9b395b0` baselines, see `bench/results/`):

- **Render/all micro-bench**: `RenderFnModule` 38.7% CPU cum and **80.9% of alloc_space** (527MB); `renderValidateModule` 20% CPU of which **`CrossFamilyValRoots` 16%** (13 discarded renders); GC workers ≈35% CPU (churn-bound); `purefns.findCalls` 8.7% CPU — OpDump re-extracts purefns over ALL program files per dump (`render.go:renderPureFnsModule` with `ranExtraction=false`).
- **ScanWithCaches/large**: `Walker.dispatch` 34.6% of alloc objects (per-node `EmitContext` + `orderedItems` maps + dep strings); `Walker.Compile` 17% CPU.
- **Macro validation suite (real tsconfig, 2254 sites)**: Go dispatch 511ms = markerScan 402ms (79%; inside it `checker.getResolvedSignature` ≈21% of total CPU — tsgo's lazy checking, the work we exist to force) + **prep 80ms (16%)** (provenance `scanLineCol` byte scans + fullRefTable + 15 added-passes) + renders 21ms.
- **Micro per-case**: wall 5.2ms vs Go-side 0.46ms — ≈4.7ms request/response encode+IPC gap (`Added` payload, unbuffered stdout, Node parse).

Execution order for Step 3 (re-ranked by measured share × risk):

| # | candidate | measured share | gain axis | risk |
| --- | --- | --- | --- | --- |
| O1 (C2) | Per-dispatch entry-render cache + validate-last ordering → kill `CrossFamilyValRoots`'s 13 duplicate renders when those families render anyway | 16% CPU of render dispatch + alloc cut | CPU+alloc | medium |
| O2 (C1+G1) | Lazy rtRenderOpts/provenance/refTable when no cache requested; per-file line index for `scanLineCol` | prep = 16% of macro dispatch | CPU | low |
| O3 (new) | Memoize purefns extraction per session file-set (OpDump path) | 8.7% CPU render bench | CPU | low |
| O4 (C12+) | Render alloc micro-pass: `joinArgs` prealloc, lazy `orderedItems`, `strconv` for Sprintf, quoteJS sizing | GC ≈35% CPU is churn-bound | alloc | trivial |
| O5 (C3) | Canonical-node facts table for T1/T2 (`isJsonCompatible`/`isExtraProof`) | inside Walker share | CPU | low |
| O6 (C5) | `DetectAny` memo by param-type pointer | part of scanCall's ~9% non-checker share | CPU | low |
| O7 (C8+G10) | Gate `Added` payload behind request flag; buffered stdout | 4.7ms/req IPC gap | wire/alloc | low |
| O8 (C9) | hashid salted-copy dedup (single stored copy) | retention (≈4× structural text) | retained mem | low |
| O9 (C6+C7) | Fold 15 `AnyXxxSupported` passes; PopulateFamily once at intern | minor | CPU | low |
| — (C4) | Single AST walk for marker scan + purefns per scanFiles | bundled with O3/O6 evidence | CPU | medium |
| — (C10) | Shared base FS across `NewInferred` | bench/HMR loop | CPU | medium |
| — (C11) | Skip `.d.ts` in scanAllProgramFiles | first dump | CPU | low |
| — (C13) | Structural id → fixed-width hash key | retention | high — deferred |

## 7. Memory model notes

Long-lived daemon: cache + dict + sites grow monotonically per session (by design — structural dedup across builds). Two axes tracked by the bench system: allocation churn (`TotalAlloc`/`Mallocs` deltas) and retention (`HeapAlloc`/`HeapInuse` after op). Retention is dominated by structural-id text (G8) and canonical RunType nodes; churn by per-dispatch rebuilds (G2/G3/G4) and render string assembly.
