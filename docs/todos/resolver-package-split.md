# Splitting `internal/compiler/resolver/` — analysis + design options

**Status:** proposed (design round needed before any code moves)
**Origin:** raised during the Go reorg follow-up (2026-07-05). The package is the biggest single unit under `compiler/` (~3.8k src LOC across 11 files); this doc records what it does, why it's big, and the concrete options for subdividing it — so a future change starts from analysis, not a blank page.

## What the package is

`resolver` is the **session orchestrator** — the long-lived object the Go binary hands every request the JS plugin sends over the protocol wire (scanFiles / dump / transform / compile / setSources / resetCache…). A single `*Resolver` (constructed via `NewServer` for server mode or `New` for a one-shot Program) owns and mutates the whole session:

- a tsgo `Program` + a **pool of type-checkers** (the concurrency substrate),
- the accumulated `RunType` cache (dedup across requests — this is what makes HMR incremental),
- the per-file scope map (`scope.go` — which ids each file "sees"),
- the pure-fn file cache, the disk cache handle, the overrides table.

It is big because it is genuinely **one cohesive subsystem with shared mutable state**: request N mutates state request N+1 reads. The files are already cleanly separated by concern:

| file | LOC | role | `*Resolver` methods | free funcs |
|---|---|---|---|---|
| dispatch.go | 1038 | protocol-op switch + per-op orchestration | 13 | 6 |
| scan.go | 1004 | call-site walk, marker match, type resolve | 10 | 8 |
| resolver.go | 401 | struct, options, `New`/`NewServer`, lifecycle | 8 | 4 |
| generate.go | 342 | write cache modules to disk (compile mode) | 5 | 8 |
| overrides.go | 313 | `overrideX<T>(pureFn)` redirect wiring | 3 | 2 |
| scan_parallel.go | 167 | parallel marker-scan across the checker pool | 2 | 0 |
| enrichcheck.go | 131 | enrichment-health pass (checkEnrich) | 1 | 4 |
| render.go | 127 | family render + wire-shape conversion | 4 | 0 |
| relimports.go | 107 | `virtual:rt/*` import path arithmetic | 0 | 7 |
| temporal_guard.go | 92 | TMP001 "Temporal lib not loaded" syntax scan | 0 | 3 |
| scope.go | 59 | per-file id projection | 2 | 0 |

## The hard constraint: Go binds methods to their package

A method `func (resolver *Resolver) dispatch(...)` **must** be declared in the same package as `type Resolver`. You cannot move a method onto `*Resolver` into a subpackage — the compiler forbids it. So the ~48 methods on `*Resolver` (dispatch's 13, scan's 10, …) are **pinned to package `resolver`**. Folders alone cannot separate them. Separating dispatch / scan / render into real packages requires a **state redesign** (below), not a move.

## Option A — extract the stateless helpers (cheap, modest, reversible)

Two files are 100% free functions with **no `*Resolver` receiver**, plus part of a third:

- **relimports.go** (107 LOC) — pure path arithmetic over `virtual:rt/*` specifiers.
- **temporal_guard.go** (92 LOC) — a syntax-only AST scan (checker + node → diagnostics).
- **generate.go free funcs** (~8: `isWithin`, `commonDir`, `materializeModules`, `pruneStaleModules`, `ensureOutDirAvailable`, `isIgnorableOutputEntry`, `unwritableOutDirError`, `generateToDisk`) — filesystem/path helpers.

These could move to a leaf package (e.g. `internal/compiler/resolver/modulepaths` + `internal/compiler/resolver/diagscan`).

**Cost / caveat:** it forces **exporting** currently-private helpers (`relPosix`, `ensureDotPrefix`, `walkTemporalRefs`, `temporalQualifiedName`, …) so the parent can call them — i.e. it *adds* API surface for packages no other area consumes. The files are already single-purpose and well-named, so the readability gain is marginal. **Net: churn-for-churn's-sake unless paired with Option B.** Only `RelativizeUserImports` is already exported (the compile CLI uses it), so a `modulepaths` package has one real external consumer.

## Option B — the real split: state redesign (high value, own design round)

The valuable separation — dispatch / scan / render as distinct packages — needs the `Resolver` god-struct broken into cohesive sub-states with explicit hand-off, e.g.:

- a `session` core (Program, checker pool, caches) that the others borrow,
- `scan` as a package taking `(session, request) → scanResult` (free functions, state passed in),
- `render` as a package taking `(session, demand) → modules`,
- `dispatch` staying thin: decode op → call scan/render → encode response.

This is a **multi-day project that touches the concurrency model** (the checker pool lease protocol, the parallel scan/render commit ordering in `scan_parallel.go`). It must be its own design round with its own test-parity plan (the resolver's golden corpus + the HMR-signal tests are the net). **Do not attempt as a "while I'm in here" move.**

## Recommendation

**Leave the package as-is for now** (Option A alone is not worth the export-surface churn), and treat Option B as a deliberate future design round. The resolver's size is essential complexity, not accidental: it is one stateful orchestrator, and its files are already organized by concern. Revisit when there is appetite for the state redesign — that is where the real clarity win lives, and it is the one thing folders cannot buy cheaply.

If Option A is wanted independently (e.g. to let another `compiler/` package reuse the path arithmetic), scope it to just `modulepaths` (the one file with an already-exported consumer) and skip `temporal_guard` (zero external reuse).
