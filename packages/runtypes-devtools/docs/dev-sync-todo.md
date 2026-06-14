# Dev-sync revision backlog (enrich-at-build + two-way HMR)

Status: **deferred — main files-mode feature has landed.** This note captures
the enrichment-at-build and two-way dev-sync work so it isn't lost. Ship the
straightforward pieces first; harden the intricate enriched ⇄ HMR direction
behind the test matrix below.

## What already landed (the "main feature")

- Virtual modules are gone. The resolver writes every cache module to real
  files under `<outDir>/types/` at `buildStart` (`OpGenerate`), and the
  transform injects relative imports to them. Cross-bundler resolution is
  native; HMR rides the watched project folder.
- `<outDir>` defaults to `<srcDir>/runtypes`, inferred from tsconfig
  (rootDir-at-or-below-cwd → common-ancestor of program files → baseUrl → cwd).
- `buildStart` already scaffolds the output tree and VCS-hygiene files:
  `runtypes/types/.gitignore` (`*`) and `runtypes/enriched/.gitkeep`.

## What is still CLI-driven (to move into the build)

Enrichment (`FriendlyType<T>` / `MockData<T>` scaffolds + reconcile) is today
only available via the `ts-runtypes gen` subcommand. The decision (locked with
the user) is to run a **full enrich sync at every `buildStart`**, then keep it
live during dev (additive only), with prune + explicit re-sync staying
on-demand via the CLI.

### Why it's deferred

The reconcile file-I/O is a large, well-tested cluster in `package main`
(`enrich_reconcile.go`, `enrich_merge.go`, `enrich_orphan.go`,
`enrich_splice.go`, `enrich_index.go`, `enrich_literalview.go`, plus
`enrich_cli.go`'s `writeMirrorFile` / `groupByDeclFile` / `constBlock` /
`markerComment`). It is tightly interconnected (shared `mirrorWrite`,
`spliceOp`, `mirrorIndex`, `constEntry` types) and uses `fatal()` (print+exit)
in ~13 places. Driving it in-process from the resolver requires lifting it into
a reusable package without `os.Exit`, which is exactly the intricate work to do
carefully rather than rush.

## Plan to land it

### 1. Extract reconcile I/O → `internal/enrich/mirror`

Move the cluster above into a new `internal/enrich/mirror` package callable from
BOTH the CLI and the resolver dispatch:

- Replace every `fatal(...)` with returned `error` values; the CLI wraps them
  with its existing `fatal`, the resolver surfaces them as diagnostics.
- Lift the shared types (`mirrorWrite`, `spliceOp`, `mirrorIndex`,
  `constEntry`, `objectView`, `propView`, `mergeCtx`) into the package.
- Keep the `enrichConfig` (mirror-path resolution, `EnrichDir`) as an input
  struct so the resolver can pass `<outDir>/enriched` and the CLI can pass its
  tsconfig-derived dir. The `enrichDir` default unifies onto `<outDir>/enriched`
  (currently `runtypes/generated`).
- Reuse the existing `internal/enrich` library (`ResolveTypeRaw`, `EmitClosure`,
  `EmitFriendly`, `EmitMock`) unchanged — only the file-I/O reconcile moves.

### 2. New op: `OpEnrichSync`

- Input: `OutDir` (enriched root = `<outDir>/enriched`).
- Behavior: for the whole program, compute the closure of every reflected
  NAMED type and scaffold-new + reconcile-existing the mirror files. Additive
  only: new fields added; deletes become commented `@rtOrphan` /
  `@rtOrphanChild` blocks (never removed); renames matched via `@rtIds`;
  authored values + `@todo` preserved. Deterministic output (sorted keys, fixed
  formatting) so a no-change build produces no git diff.
- `prune` / `check` / `describe` stay CLI-only (prune is the one destructive op).

### 3. Plugin wiring

- `buildStart`: after `generate`, call `resolver.enrichSync(<outDir>/enriched)`.
- `vite.handleHotUpdate` (type edit → enriched, additive): after regenerating
  `types/`, run the SAME reconcile over the affected mirror(s). Reuses the
  `@rtType` / `@rtIds` structural matching + `@rtOrphan` commenting — no new
  merge logic.
- Watch `<outDir>/enriched/**` (enriched edit → HMR): a manual edit propagates
  through the bundler's normal module graph (real, imported files HMR
  natively). Add a light import/shape sanity check.

## Test matrix to add (focused first, exhaustive later)

- **buildStart scaffold:** a new type → its friendly+mock mirror appears under
  `enriched/`; authored values on an existing mirror survive a rebuild
  (reconcile preserves values + `@todo`).
- **Type edit → enriched (additive):** in a watching build, add a field to a
  type → the mirror gains the new field; remove a field → it becomes a
  commented `@rtOrphan` block (never hard-deleted); rename → matched via
  `@rtIds`, value carried over.
- **Enriched edit → HMR:** manually edit an enriched file → HMR fires and the
  consuming module re-evaluates; a broken import in the enriched file surfaces a
  diagnostic rather than a silent failure.
- **Determinism:** two consecutive buildStart syncs produce byte-identical
  `enriched/` (no spurious git diff).
- **Cross-file refs:** a friendly/mock const referencing another mirror file's
  const keeps its cross-file value import after reconcile.

## Hardening backlog (the riskiest surface)

- Enriched → HMR import-integrity: cross-file reference validity, drift
  diagnostics when an enriched file references a type that no longer exists.
- Conflict handling when BOTH a type and its enriched mirror change in the same
  HMR tick.
- Batching enriched writes through the existing `scan-batcher.ts` window so a
  burst of type edits doesn't thrash the mirror files.
- Read-only FS detection for the enriched dir (parallel to the types-dir case).
