# Go-side simplification refactor (iterative) + module reorganization

**Status:** in progress (Phase 0 done)
**Scope:** the **Go code only** — `cmd/` + `internal/` (~52k src LOC / ~29k test / 313 files across 17 top-level `internal/` packages + 6 `cmd/` binaries). **Explicitly NOT** the JS/TS packages, the scripts, the website, or `third_party/` (off-limits).
**Goal:** apply the [Code Simplification & Reduction guide](../CODE-SIMPLIFICATION-GUIDE.md) to the Go pipeline to make it smaller and simpler without changing behavior, then — as a final phase — reorganize the Go packages so their layout clearly reflects the product's areas.

> **This doc specifies HOW, not WHAT.** It is the process, tooling, safety gates, and verification protocol for the refactor. The concrete cuts (which dead func, which abstraction to inline, which package to split) are **discovered iteratively, one step at a time**: plan a single step → implement → verify green → commit → re-plan the next. Do **not** front-load a list of changes here; the per-step planning ritual (below) produces them.

---

## Prime directive (the working agreement)

1. **One step at a time.** Each step is the smallest useful, independently-revertable change. Plan it, do it, prove it green, commit it, then plan the next. No batching "while I'm in here."
2. **Structural ≠ behavioral, never in one commit** (Kent Beck). A commit either changes *what the code does* or *how it's shaped*. Reduction/reorg commits must be provably behavior-neutral.
3. **Green gate every step** (see Verification). If the suite isn't green, the step isn't done.
4. **Behavior-preserving.** This whole effort preserves behavior. If a real bug surfaces, that's a *separate* behavioral commit (and file it per the repo's out-of-scope-findings rule).
5. **Small & reversible beats clever.** If a step feels scary or large, split it.

Everything else follows the [guide](../CODE-SIMPLIFICATION-GUIDE.md) — Part 1 principles, Part 2 safety rules, Part 5 anti-patterns. Read those; they resolve most stay-or-go calls. This doc only adds the **Go-specific tooling**, the **repo-specific verification gate**, and the **iteration protocol**.

---

## A key advantage here: `internal/` has no external consumers

The guide's sharpest caveat (Part 3, "the library caveat") is that a public library's *exported* surface can never be proven dead, because an external importer might use it. **That caveat does not apply to this refactor.** Everything in scope lives under `cmd/` (real `main`s) and `internal/` — and Go forbids importing an `internal/` package from outside the module. So:

- The only entry points are the `cmd/*` mains: `ts-runtypes`, `ts-runtypes-wasm`, `extract-fn-bodies`, `gen-diag-catalog`, `gen-run-type-kind`, `gen-ts-constants`.
- **Every exported symbol in `internal/` is reachable-or-dead from those mains (+ tests).** `deadcode` run from the real mains gives a *true* dead-set for `internal/` — exported symbols included, no deprecation cycle needed.
- The public-API deprecate-don't-delete rule is entirely a concern of the **JS packages** (`ts-runtypes`, `runtypes-devtools`, `ts-runtypes-bin`), which are **out of scope** here.

Net: within this scope you can delete freely once a tool + Chesterton's-Fence check prove a symbol unused. That is exactly why the Go side is a good place to start.

---

## Phase 0 — Baseline & guardrails (once, up front)

- **Confirm green baseline:** `go test ./internal/...`, `go build ./...`, and the full JS gate (`pnpm test`) all pass *before* touching anything. This is the reference point. (JS matters because the Go binary feeds the JS plugin tests — see Verification.)
- **Install the Go tooling** (none is currently configured — there is no `.golangci.yml`, and `deadcode`/`staticcheck`/`golangci-lint` are not on PATH):
  - `go install golang.org/x/tools/cmd/deadcode@latest`
  - `go install honnef.co/go/tools/cmd/staticcheck@latest`
  - `golangci-lint` (meta-linter: aggregates `unused`, `gosimple`, `gocritic`, `gocyclo`, `gocognit`, `dupl`, `unparam`, `ineffassign`, `unconvert`, `depguard`) — decide during Phase 0 whether to add a checked-in `.golangci.yml` or run ad-hoc. A checked-in config that CI can run is preferable (it prevents regressions), but adding a CI lint gate is itself a behavioral change to the build → its own commit.
- **Record baseline metrics** (so "simpler" is measured, not felt) into the Progress log below. Baselines captured at spec time:
  - **Source size:** Go src **51,832 LOC** (~2.04 MiB), test **29,460 LOC** (~1.12 MiB), **313** files, 6 mains, 17 top-level `internal/` packages. Also track per-package LOC.
  - **Binary size** (see the caveat below — this is a *distinct* win from LOC):
    - resolver `bin/ts-runtypes` (per host arch, distributed per-platform to npm consumers): **~29 MiB**.
    - `extract-fn-bodies` (bench helper): ~10 MiB.
    - **WASM `ts-runtypes.wasm` — the highest-value size target** (ships to the browser for `/playground`, gzipped under Cloudflare Pages' 25 MiB file cap): **37.1 MiB raw → 8.2 MiB gzip -9** (8,638,041 B). The **gzipped** number is the cap-relevant, user-facing one (playground load time).
  - **Complexity:** `gocyclo`/`gocognit` top-20 hotspots (start thresholds ~15 cyclomatic / ~20 cognitive).
  - **Speed:** `go build ./...` time, `go test ./internal/...` time.
  - **Dead-set:** initial `deadcode ./cmd/...` and `staticcheck ./...` reports (as the candidate backlog, NOT a commit).

  Capture the sizes with a repeatable snippet so before/after is apples-to-apples: `find cmd internal -name '*.go' ! -name '*_test.go' | xargs cat | wc -lc`; `ls -l bin/ts-runtypes`; `gzip -9 -c <wasm> | wc -c`. Build the binaries fresh (`pnpm rt core build`, and the WASM build) before measuring so the numbers aren't stale.

  > **Caveat — binary size and source LOC measure DIFFERENT wins; don't expect them to track.** Go's linker already does dead-code elimination at link time: a function unreachable from `main` is *already stripped from the binary*, so removing it (the bulk of Pass A1) is **source hygiene with ~0 binary change**. The binary (and especially the WASM) only shrinks when you remove something **reachable** — a whole dependency/import subtree, a reflection/`fmt`-pulling code path, or a reachable abstraction that drags in transitive code. So report the two independently: LOC/file-count for readability wins, binary/WASM-gzip for shipped-size wins. A step can legitimately improve one and not the other.
- **Branch.** Everything below is small commits on a working branch (linear; rebase-not-merge per the repo Git workflow).

---

## Phase A — Iterative simplification passes

Work the passes **cheapest-and-safest first** (they mirror the guide's Pass 1–6). Each pass is a *source of candidate steps*, not a single commit. You may interleave once comfortable, but finish the mechanical dead-code sweep before the judgment-heavy abstraction work.

- **A1 — Automated dead-code sweep** (safest, biggest wins). `deadcode` from the real mains for cross-package/exported reachability; `staticcheck` (`U1000`) for package-local unexported dead code; `ineffassign`/`unparam`/`unconvert` for in-file. Delete in logical chunks ("remove dead funcs in X", "drop unused fields in Y").
- **A2 — Dependency reduction.** `go mod tidy`; `go mod why <module>` for anything suspicious; prefer stdlib. (Most deps are `third_party/` submodule-vendored tsgo — treat those as fixed; focus on genuine `go.mod` requirements.) Optionally add `depguard` to pin the allowed set.
- **A3 — Duplication & wrong-abstraction.** `dupl` (threshold ~100 tokens) to *find* near-duplicates — then apply judgment (guide principle #3): only merge true same-concept duplication; **inline back** abstractions that callers work *around* (flag/option/`mode ==` soup). Read every `dupl` hit; it false-positives on same-shaped-different-meaning branches.
- **A4 — Local simplification.** Prioritized by the `gocyclo`/`gocognit` hotspots: guard clauses over nested pyramids, shrink exported surface, delete speculative generality, apply `gosimple`/`gocritic` suggestions (review, don't bulk-apply). Naming-as-compression.
- **A5 — Structural / feature-level.** Permanently-on/off flags collapsed, dead config surface removed, doc comments added/fixed where their absence hides intent (many `internal/` packages currently have no package doc — see the doc-comment audit).

Each candidate that survives its safety check becomes **one step** via the protocol below.

### The per-step protocol (the heart of this refactor)

For every single change, in order:

1. **Plan the one step** — write a 2–4 line mini-spec *in the Progress log*: the target (file/symbol), the move (delete / inline / flatten / rename), *why* it's safe, and how it'll be verified. If it doesn't fit in a few lines, it's too big — split it.
2. **Chesterton's Fence** — `git blame` / `git log -p` the lines; find the issue/PR/edge-case that put them there. A weird guard is often a bug fix. If no reason survives the look, that's the green light — but you looked.
3. **Characterization test first** if the region is uncovered — pin current behavior (even if weird) before cutting underneath it. The repo's fuzz/property harness (`pnpm rt core fuzz <suite>`) and the resolver's large test corpus are the primary nets.
4. **Implement** — structural-only *or* behavioral-only, never mixed. Delete, don't comment out.
5. **Verify green** (see gate). 
6. **Commit** — one focused commit, message states structural-vs-behavioral. Then return to step 1 for the next.

---

## Verification gate (repo-specific — run every step)

The Go binary is a build input to the JS suite, so Go changes must be proven green on **both** sides:

- `go build ./...` and `go test ./internal/...` — the Go suite (fast; run constantly).
- **Rebuild `bin/ts-runtypes`** then `pnpm test` — the Vite-plugin tests spawn the binary; a Go change that breaks resolution only shows here. (`pnpm rt core build` / `pretest` handles the rebuild + staleness.)
- **Marker coverage rule still holds** — any change touching marker/resolution keeps *both* `getRunTypeId` call shapes covered with a hash-equivalence assertion (CLAUDE.md → Marker test coverage rule).
- **Fuzz where relevant** — `pnpm rt core fuzz <suite>` for changes near value/type/enrich/roundtrip logic; the **noop-predicate soundness corpus** (`internal/resolver/noop_predicate_test.go`) must stay green when touching typefns/noop-elision.
- **Codegen mirrors** — if `internal/constants` (or the diag catalog / run-type-kind) changes, `pnpm rt core codegen all --check` must pass (the Go→TS mirrors regenerate + commit).
- `pnpm rt verify` (build if stale → lint → format check) and `gofmt`/the repo `format` before commit.

A step that can't be shown green by these does not land.

---

## Phase B — Module reorganization (the final phase, after A is done)

**Do this last, on purpose:** optimize first so there's *less* code to move, and so the seams are clearer once the accidental complexity is gone. This phase is **pure structure** — package moves/renames/splits, behavior-neutral, done as its own series of small `git mv` + import-fix steps.

### The intent (owner-stated)

Reorganize the Go packages so the layout **clearly reflects the product's areas**:

1. **Compiler / source transformers** — reading call sites, matching markers, parsing comptime args, resolving types, rewriting source + composing source maps, assembling the emitted virtual modules, the tsc-style batch compile.
2. **Cache generation** — the runtype cache, the demand-driven function caches, the operations registry, structural type-ids, the on-disk cache format.
3. **MockData & FriendlyText generation and reconciliation** — the enrichment codegen/analysis (already the most cohesive area today).

### Current layout → the three areas (a MAP, to ground Phase B — not a locked target)

The concrete target layout is **discovered during Phase B**, one move at a time; this is only the starting hypothesis of how today's packages cluster:

- **Transformers/compiler:** `program`, `marker`, `builders`, `comptimeargs`, `resolver` (**3,876 src / 12,467 test — the giant; a prime split candidate**), `compiled/transform`, `compiled/entrymod`, `compile`, `protocol`, `textpos`, `jsquote`.
- **Cache generation:** `compiled/runtype` (+ `runtype/typeid`), `compiled/typefns` (+ `formats/*`), `compiled/purefns`, `operations`, `cache/disk`, `hashid`.
- **Enrichment (MockData & FriendlyText):** `enrich` (+ `astcheck`, `cldr`, `mirror`).
- **Shared/foundational:** `constants`, `diag`, `testfixtures`.

Notable movers to expect: the opaque **`internal/compiled/`** grab-bag (13 subpackages under a name that describes nothing) likely splits along the transform-vs-cache line; the oversized **`internal/resolver`** is the highest-churn/highest-complexity package and the best candidate to break into cohesive units *after* Phase A has thinned it.

### Phase B constraints

- **`git mv`** every move (preserve history). Renaming an `internal/` package changes its import path → the Go compiler flags every stale import, so fixes are mechanical and provable (`go build ./...` is the checker). One package move per step.
- **Behavior-neutral only** — no logic edits ride a move. If a move tempts a logic change, that's a separate Phase-A-style commit *before or after*, never during.
- **Update the docs that name the layout in the same change:** [CLAUDE.md](../../CLAUDE.md) (the "Pipeline is split across single-purpose packages under `internal/`…" list + every package path it links), [docs/ARCHITECTURE.md](../ARCHITECTURE.md), and any package-path references in `SETUP.md`/READMEs. The `scripts/` that `go run`/`go build` specific `cmd/` paths must track any `cmd/` move too.
- **No public-surface impact** — `internal/` is invisible to consumers, so Phase B ships without a version bump.

---

## Anti-patterns / non-negotiables (Go-specific)

- **No big-bang PR.** The whole point is many tiny green commits. A single "simplify the resolver" mega-diff is the failure mode.
- **Protect essential complexity.** The resolver dispatch, `typefns` emit/noop-elision, the type-id/dedup machinery, and the fuzz harness are *essential* difficulty of the problem — cut *accidental* complexity around them, never gut them. The noop-elision soundness contract (one-directional: predicate-true ⇒ identity) is load-bearing; changing an emit arm means updating its predicate arm in lockstep.
- **Don't reflexively DRY.** `dupl` hits in the per-kind emit arms and per-family predicates are often same-shaped-different-meaning; leave them.
- **`third_party/` is off-limits** — never edit tsgolint/typescript-go; if a change *seems* to need a new exported tsgo symbol, STOP and surface it (CLAUDE.md).
- **Don't chase LOC.** Fewer, clearer lines > fewest lines. Golfed code is complexity.

## Success criteria / when to stop

Success is **measured, not felt** — the branch must show a real before/after delta on these tracked metrics (record both in the Progress log):

- **Size (a first-class success criterion):**
  - **Source:** total Go src LOC + file count down (readability/maintenance win).
  - **Shipped binary:** resolver `bin/ts-runtypes` and — most importantly — the **WASM gzipped** size down or held (the user-facing, Cloudflare-cap-constrained number). Per the caveat above, expect binary wins to come from Pass A2 (deps) and reachable-abstraction collapse, not the A1 dead-code sweep; a net-zero binary change from a pure-hygiene pass is still a valid step, just report it as such.
- **Complexity:** average/max `gocyclo`/`gocognit` on the hot files down.
- **Speed:** `go build` / `go test` time held or improved.
- **Health:** tests still green, fuzz suites green, no new lint suppressions, coverage held.

Phase A stops when the remaining `deadcode`/`staticcheck`/`dupl`/`gocyclo` candidates are all either (a) essential complexity, or (b) low-churn code where the cleanup isn't worth the risk. Phase B stops when a newcomer can point at a package and name which of the three areas it serves.

---

## Progress log (fill one entry per step — this is where the "what" lives)

_Baseline metrics (re-measured in Phase 0 on a fresh build, Linux amd64 container):_

- **Source:** src **51,832 LOC** (2,086,381 B), test **29,460 LOC** (1,177,001 B), **313** files, 6 mains, 17 top-level `internal/` packages.
- **Binaries:** resolver `bin/ts-runtypes` **31,458,401 B** (~30.0 MiB); `extract-fn-bodies` **11,370,228 B** (~10.8 MiB); WASM **38,932,133 B raw / 8,638,598 B gzip -9**.
- **Complexity:** `gocyclo > 15`: **100** funcs (top: `Resolver.dispatch` 61, `scanState.analyzeCall` 49, `ValidateEmitter.emitKindDefault` 43); `gocognit > 20`: **103** funcs (top: `dispatch` 119, `analyzeCall` 73, `CollectFamilyEntries` 67).
- **Speed:** `go build ./...` ~41 s (cold-ish container cache); `go test ./internal/...` ~1 m 40 s; `pnpm test` ~3 m (green: 7,636 tests — two enrich hook-timeout flakes under heavy parallel load pass in isolation).
- **Dead-set:** `deadcode ./cmd/...` **28** unreachable funcs; `deadcode -test` **6** (dead even from tests); `staticcheck` **9** findings (2×U1000, SA4006+SA4017, S1011, 2×ST1005, 2×SA1019).
- **Tooling decision:** `deadcode`/`staticcheck`/`gocyclo`/`gocognit` installed and run ad-hoc (built with `GOTOOLCHAIN=go1.26.0` — the module needs go1.26 types). **No checked-in `.golangci.yml`** — a CI lint gate is a behavioral build change out of scope here; final sweep re-runs the tools to prove no regressions.

| # | Phase/Pass | Step (target + move) | Structural/Behavioral | Verified green | Commit |
|---|---|---|---|---|---|
| 0 | Phase 0 | Baseline captured (metrics above); tooling installed; green baseline confirmed on Go + JS suites | — (doc only) | go build+test, pnpm test | fdd8655 |
| 1 | A2 deps | `go mod tidy`: make the checker/parser/scanner shim requires explicit (were implicit via `replace`). Finding: **no removable deps** — every module requirement is the tsgo shim set + its transitive needs (fixed, vendored); binary-size wins must come from reachable-code cuts, not go.mod. | Structural | go build, go test ./internal/... | 30224203 |
| 2 | A1 dead code | **purefns: delete the never-wired dep-validation API** — `index.go` (Index/NewIndex/Get/Scanned/merge/ValidatePureFnDependencies) + `index_test.go`, the superseded `ExtractFromProgram` wrapper (tests now call `ExtractFromProgramCached(…, nil)`), `extractFromFile`, `siteFromCall`, the `CodeMissingPureFnDep` re-export; stale comments scrubbed (typefns walker + tests). Fence: built 2026-05-16 with wiring explicitly deferred; never wired, no plan exists, runtime backstop (`usePureFn` throws). Consequence filed: [pfe9012-orphaned-diagnostic.md](pfe9012-orphaned-diagnostic.md) (PFE9012 published but unfirable — predates this refactor in effect). | Structural | go build, go vet, go test ./internal/... | (this commit) |
| 3 | A1 dead code | **enrich: delete superseded/unreferenced surface** — `EmitFriendly`/`EmitMock` + `EmitOptions` (superseded by the Skeleton/Closure paths; shape tests MIGRATED to `FriendlySkeleton`/`MockSkeleton`/walker, not dropped), `SortFindings`, `HasError`, `cldr.Known` (+ its own unit test), `mirror.CarcassMatches` (zero refs), `mirror.Index.ValueImports` + `ValueImportInfo`, `mirror.SourceVarOfTranslation` (+ its assertions). Deviation from agent verdict: `NewFamilyClassifier` KEPT — the owner's c74bbcd6 (1 day old) deliberately kept the one-shot-twin tier and a test uses it exactly as the other kept twins. | Structural | go build, go vet, go test ./internal/... | (this commit) |
| 4 | A1 dead code | **accessors + aliases with vanished callers** — `disk.Store.Root`, `Resolver.RTStore` (doc claimed render-side callers that no longer exist), `protocol.TemporalInfoByFormatName` + its private reverse map, `datetime.boundKind.label` (zero refs), `entrymod.Render` alias (tests migrated to `RenderGrouped(graph, nil)`). | Structural | go build, go test ./internal/... | (this commit) |
| 5 | A1/staticcheck | **structural lint fixes** — `union_flat_binary.go`: sentinelWrite initialize-then-always-overwrite → plain `var` decl (SA4006/SA4017; verified NOT a bug — both branches assign before first read); `validate.go`: copy-loop → direct `strings.Join(objectChecks, …)` (S1011, no aliasing — fresh join input). typefns staticcheck now clean. | Structural | go build, staticcheck, go test (typefns + resolver incl. noop corpus) | (this commit) |

---

### On completion
`git mv` this file into `docs/done/` and summarize what shipped (final metrics vs baseline, the resulting package map).
