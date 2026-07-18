# gen-run-type-kind: fix the sync-test path + generate the devtools ReflectionKind mirror

Status: **DONE — shipped 2026-07-18** on branch `claude/purefn-cache-emitmode-iuzkpz`
(follow-up found while running the full Go suite during the pure-fn emitMode work).

## What was wrong

`TestRunTypeKindFileInSync` in `cmd/gen-run-type-kind/gen_test.go` read the generated
file via `runTypeKindOutputPath()`, which resolved to `ts-go-runtypes/packages/…`
(the Go **module** root) instead of the monorepo root — so it failed
deterministically whenever run. Root cause: `repoRoot()` = `runtime.Caller` + `../..`
returns the Go module dir (`ts-go-runtypes/`), which is correct for its
`internal/protocol/*.go` reads but wrong for `packages/…`, which lives one level up.
A past migration moved the Go tree into `ts-go-runtypes/` but left `packages/` at the
repo root ([docs/done/go-tree-subdir-migration.md](./go-tree-subdir-migration.md)),
and the output path's depth was never bumped.

**Why it never surfaced:** CI runs `go test ./internal/...` only — never `./cmd/...`
(`go vet ./cmd/...` compiles the test but doesn't run it). The actual drift guard is
`pnpm rtx core codegen kind --check` (ci.yml + release-gate.yml), which regenerates via
stdout→file at the *correct* repo-root path and git-diffs, so the broken Go test was
never needed. It only fired when the whole `go test ./...` was run locally.

## The deeper issue the owner flagged

The devtools plugin had its **own** `ReflectionKind` enum in
`packages/ts-runtypes-devtools/src/protocol.ts`, hand-maintained ("to keep the plugin
dep-free"), mirroring the same Go `internal/protocol.ReflectionKind` as the generated
`packages/ts-runtypes/src/runTypeKind.ts` — but **unguarded**, so it could silently
drift from the Go protocol while `runTypeKind.ts` stayed in lockstep. This diverged at
the migration; the devtools mirror should be generated from the same source too.

## What shipped

1. **Path fix.** `repoRoot()` split into `moduleRoot()` (`../..`, for the
   `internal/protocol/` reads) and `monorepoRoot()` (`filepath.Dir(moduleRoot())`, for
   the `packages/…` writes). Both output-path helpers use `monorepoRoot()`.
2. **Devtools mirror is now generated.** `gen-run-type-kind` writes **two** files from
   one protocol parse — the marker `runTypeKind.ts` (unchanged shape) AND a new
   `packages/ts-runtypes-devtools/src/reflectionKind.generated.ts` carrying
   `enum ReflectionKind { … }` + `export const KIND_REF = -1` (the `-1` sentinel rides
   as a const, not an enum member, matching the plugin's long-standing shape). `main.go`
   now writes both files directly (was: print marker to stdout); `protocol.ts` imports +
   re-exports `ReflectionKind`/`KIND_REF` from the generated file, so every existing
   `import {ReflectionKind} from './protocol.ts'` site is unchanged.
3. **The sync test covers both files** and now resolves the correct path, plus a new
   `TestGenerateDevtoolsMatchesRunTypeKind` cross-checks that every enum value equals the
   marker's `RunTypeKind` value (catches a generator-logic drift a per-file check would
   miss). `TestParseConstsFoundEntries` updated to `moduleRoot()`.
4. **rtx wiring.** The `kind` codegen job drops `stdoutTo` (the tool writes both files)
   and lists both under `outputs`/`fmt`, so `pnpm rtx core codegen kind --check` (CI)
   drift-checks both. Both generated files are oxfmt-stable, so the Go test's raw
   string compare and the codegen `--check` (format-then-diff) agree.

## Follow-up (same PR): the two sibling issues, now fixed

1. **`cmd/gen-fn-hashes` path + missing test.** It had the SAME `repoRoot()` =
   module-root pattern (a structurally-wrong `fnHashesOutputPath()`, dead because
   `main()` prints to stdout) AND a `main.go` doc comment falsely claiming a
   `gen_test.go` existed. Fixed: `repoRoot()` → `monorepoRoot()` (`../../..`), and
   added `gen_test.go` (`TestFnHashesFileInSync` + `TestCollectEntriesNonEmpty`).
   The fn-hashes generator emits string values, so oxfmt reflows it (wrapping,
   trailing commas) — a raw byte-compare isn't viable, so the test is a
   format-agnostic **containment** check (every fnKey/fnHash the registry produces
   appears in the committed file); `pnpm rtx core codegen fnhashes --check` remains
   the exact byte gate. Stale `pnpm run gen:fn-hashes` doc references updated to
   `pnpm rtx core codegen fnhashes`.

2. **Devtools `REFLECTION_SUB_KIND` completed + unified.** It was a hand-written
   7-entry partial in `gen-ts-constants` (silently dropping `none` + all 8 Temporal
   sub-kinds) whose doc claimed a faithful mirror — and it was entirely unused, so
   not a functional bug, only a drift-prone inconsistency. Fixed by moving sub-kind
   generation into `gen-run-type-kind` (which already AST-parses `subkind.go`): the
   devtools `reflectionKind.generated.ts` now carries the FULL `REFLECTION_SUB_KIND`
   map + `ReflectionSubKind` type alongside `ReflectionKind`/`KIND_REF`, re-exported
   from `protocol.ts`; `writeReflectionSubKind` was removed from `gen-ts-constants`.
   `TestGenerateDevtoolsMatchesRunTypeKind` now cross-checks the sub-kind values
   against the marker's `RunTypeSubKind` too, so the partial-mirror class of bug
   can't recur.

## Still out of scope

- `fnHashesOutputPath()` is now correct but the fn-hashes generator still relies on
  oxfmt post-formatting (its Go test is a containment check, not byte-exact) — the
  exact gate stays `codegen fnhashes --check`. This is inherent to a generator that
  emits string literals oxfmt reflows.
