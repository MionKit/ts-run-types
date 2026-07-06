# Move the Go tree into `ts-go-runtypes/` (root cleanup)

**Status:** todo (investigated, plan agreed, not started)
**Created:** 2026-07-06
**Area:** Repo layout / build orchestration / CI / docs — NO Go source changes
**Driver:** cosmetic root tidiness (single Go subdir instead of `cmd/` + `internal/` + `third_party/` + four `go.*` files loose at root)

## Summary

Relocate the entire Go side of the monorepo into a single `ts-go-runtypes/`
subdirectory so the repo root reads as "a JS workspace with the Go resolver tucked
away", rather than a mixed-language root. What moves:

```
ts-go-runtypes/
  cmd/              (was ./cmd)
  internal/         (was ./internal)   ← still holds the TS testfixtures
  third_party/      (was ./third_party) ← the tsgolint + typescript-go submodules
  go.mod  go.sum  go.work  go.work.sum
```

`bin/` **stays at the repo root** — it is gitignored build *output* consumed by the
JS test suite, not Go source, and hardcoded as `bin/ts-runtypes` in several JS
callers. Keeping it at root minimises churn and keeps the JS-consumed artifact where
the JS expects it.

### Is it worth it? (recorded verdict)

Feasible and **low intellectual risk** but **broad mechanical cost + a small
permanent tax**. The recommendation from the investigation was **lean-no for pure
cleanliness**, because:

- The root is not cluttered *by Go* — Go already lives in exactly three named dirs;
  the long root listing is the JS side (`packages/`, `scripts/`, `container/`,
  `node_modules/`) + ~12 dotfiles, none of which move.
- The move does **not decouple** the trees — the side-channel architecture
  deliberately interleaves them (JS `typecheck` compiles TS *inside* `internal/`; JS
  tests read `.go` files by relative path; gen scripts emit into `packages/`). A
  subdir draws a prettier line at the root; the coupling stays.
- It adds permanent `go -C ts-go-runtypes` / `cwd` indirection to every Go
  invocation and a new "ran go from the wrong dir" failure class.

**Do it only if** there is a forward-looking driver: a second Go module, a
multi-module `go.work`, or wanting a hard OSS-contributor boundary. This doc exists
so the plan is ready if that call is made; it is not a recommendation to proceed now.

## Why the Go compiler side is a non-event

The module path `github.com/mionkit/ts-runtypes` (`go.mod`) is **decoupled from
filesystem location**. Move `cmd/`, `internal/`, `third_party/` and the four `go.*`
files *together* and:

- every `github.com/mionkit/ts-runtypes/internal/...` import stays valid →
  **zero Go source edits**;
- `go.mod`'s `replace` directives are relative (`./third_party/tsgolint/shim/...`) →
  still valid;
- `go.work`'s `use (. ./third_party/tsgolint ./third_party/tsgolint/typescript-go)`
  is relative → still valid.

So nothing in Go breaks. **100% of the risk is in shell/CI/doc paths**, which the
compiler cannot catch — they only surface by running the full suite + a clean-clone
CI pass. Treat the verification step as the real gate.

## The single lever: a `GO_ROOT` constant

Add one constant to [`scripts/lib/env.mjs`](../../scripts/lib/env.mjs) next to
`REPO_ROOT`:

```js
export const GO_ROOT = join(REPO_ROOT, 'ts-go-runtypes');
```

Then route **every** `go`/`gofmt` invocation through it. Two safe patterns:

- **`cwd: GO_ROOT`** on the spawn (preferred for `go build`/`go test`/`go vet`),
  keeping any `-o <bin>` output path **absolute** (e.g. `join(REPO_ROOT, 'bin/…')`)
  so the binary still lands in the root `bin/`. The `./cmd/...` / `./internal/...`
  package specs are then correct relative to `GO_ROOT` and **do not change**.
- **`go -C ts-go-runtypes …`** where changing the whole process cwd is awkward.

⚠️ **`go run` with file arguments:** scripts that call
`go run ./cmd/extract-fn-bodies --file <groupFile>` pass a data path as a *program*
argument. Changing the go process cwd/`-C` reinterprets any **relative** `--file`
against the new dir. Absolutize such args (`path.resolve(REPO_ROOT, groupFile)`)
before the spawn. Audit each `go run` call for relative path args.

## Blast-radius inventory (edit list)

### A. Git submodules — the fiddly part (do FIRST, in isolation)

- [`.gitmodules`](../../.gitmodules): `path = third_party/tsgolint` →
  `path = ts-go-runtypes/third_party/tsgolint` (`url` and `ignore = dirty` unchanged).
- Move with `git mv third_party ts-go-runtypes/third_party` **after** the dir exists,
  then `git submodule sync` so `.git/config` + `.git/modules/` bookkeeping updates.
  The nested `typescript-go` submodule rides along under the parent.
- `ignore = dirty` means `git status` will NOT show submodule-path mistakes — verify
  explicitly with `git submodule status` and a clean-clone dry run
  (`git clone --recurse-submodules` into a temp dir).

### B. `go.*` files — move, do not edit

`go.mod`, `go.sum`, `go.work`, `go.work.sum` → `ts-go-runtypes/`. Relative `replace`
and `use` paths stay correct (see above). No content edits.

### C. Build / release / gen scripts (route through `GO_ROOT`)

| File | What references the Go path |
|---|---|
| [`scripts/core/build.mjs`](../../scripts/core/build.mjs) | `GO_PKG='./cmd/ts-runtypes'`, `EXTRACT_PKG='./cmd/extract-fn-bodies'`, `git -C third_party/tsgolint` (`goVersionLdflags`), every `run('go', ['build', …])`. `GO_BIN` (absolute, root `bin/`) stays. |
| [`scripts/release/build-binaries.mjs`](../../scripts/release/build-binaries.mjs) | `GO_PKG='./cmd/ts-runtypes'`, `cwd: REPO_ROOT` (→ `GO_ROOT`) at L84, `git -C .../third_party/tsgolint` at L49 |
| [`scripts/release/preflight.mjs`](../../scripts/release/preflight.mjs) | L24 `go build -o bin/ts-runtypes ./cmd/ts-runtypes`, L29 `go test ./internal/...` |
| [`scripts/core/gen-diagnostics-catalog.mjs`](../../scripts/core/gen-diagnostics-catalog.mjs) | L95 `go run ./cmd/gen-diag-catalog` |
| [`scripts/core/smoke.mjs`](../../scripts/core/smoke.mjs) | L26 `BIN = join(REPO_ROOT, 'bin/ts-runtypes')` (stays; bin at root) |
| [`scripts/website/suite-data/export-validation.mjs`](../../scripts/website/suite-data/export-validation.mjs) | L59 `BIN`, L159 `go run ./cmd/extract-fn-bodies --file …` ⚠️ file arg |
| [`scripts/website/suite-data/export-serialization.mjs`](../../scripts/website/suite-data/export-serialization.mjs) | L65 `BIN`, L163 `go run ./cmd/extract-fn-bodies --file …` ⚠️ file arg |
| [`scripts/website/bench-data/gen-serialization.mjs`](../../scripts/website/bench-data/gen-serialization.mjs) | L122 `BIN`, L204 `go run ./cmd/extract-fn-bodies` ⚠️ file arg |
| [`scripts/website/bench-data/bench.mjs`](../../scripts/website/bench-data/bench.mjs) | L32-33 linux bins under root `bin/` (stay) |
| [`container/website/scripts/build-playground.mjs`](../../container/website/scripts/build-playground.mjs) | L36 `WASM_PKG='./cmd/ts-runtypes-wasm'`, L38 `WASM_INPUTS=['cmd/ts-runtypes-wasm','internal','go.mod','go.sum']` (invalidation inputs → prefix or `cwd`) |

### D. `package.json` scripts

- L33 `gen:ts-constants`: `go run ./cmd/gen-ts-constants`
- L34 `gen:run-type-kind`: `go run ./cmd/gen-run-type-kind > packages/ts-runtypes/src/runTypeKind.ts` (output redirect stays at root; go needs `-C`)
- L36 `format`: `gofmt -w cmd internal` → `gofmt -w ts-go-runtypes/cmd ts-go-runtypes/internal`
- L37 `check-format`: `gofmt -l cmd internal` (twice) → same prefix
- L43 `typecheck`: `tsc -p internal/testfixtures/tsconfig.json` + `internal/testfixtures/atomic/tsconfig.json` → new prefix

> Note the CLAUDE.md rule: `pnpm run format`'s scope is a hard contract. Updating the
> `gofmt` paths here is a path rename of the *same* scope, not a widening — keep it to
> `ts-go-runtypes/cmd` + `ts-go-runtypes/internal`.

### E. CI

- [`.github/actions/bootstrap/action.yml`](../../.github/actions/bootstrap/action.yml):
  L16 `cd third_party/tsgolint/typescript-go`, L17 `git apply ../patches/*.patch`
  (relative to that dir — still fine once the `cd` prefix updates), L24
  `git -C third_party/tsgolint rev-parse`, L41 `hashFiles('go.mod', 'go.sum')` →
  `hashFiles('ts-go-runtypes/go.mod', 'ts-go-runtypes/go.sum')`.
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml): L58 gofmt, L66-67
  `go vet ./cmd/... ./internal/...`, L69 `go test ./internal/...` (add a
  `working-directory: ts-go-runtypes` or `-C`).
- [`.github/workflows/release-gate.yml`](../../.github/workflows/release-gate.yml):
  L52 `go test ./internal/...`, L53-61 gofmt + vet.

### F. Cross-tree couplings the compiler will NOT catch (highest-risk)

- [`packages/ts-runtypes-devtools/test/eslint/prefilter.test.ts`](../../packages/ts-runtypes-devtools/test/eslint/prefilter.test.ts)
  L25-26 read Go source by relative path:
  `../../../../internal/enrichment/mirror/tags.go` and `.../names.go` →
  `../../../../ts-go-runtypes/internal/...`. **Constant-sync test; a broken path
  reads empty and the test silently loses its guard.** Verify it still finds content.
- [`packages/ts-runtypes-devtools/test/helpers/inline.ts`](../../packages/ts-runtypes-devtools/test/helpers/inline.ts)
  L22-23 `ROOT = resolve(__dirname, '../../../..')`, `BIN = resolve(ROOT, 'bin/ts-runtypes')`.
  `bin/` stays at root → `BIN` unchanged. The comment at L26 ("Mirror of
  internal/testfixtures/runtypes.d.ts") is prose only.
- `internal/testfixtures/*.ts` + `internal/testfixtures/tsconfig.json` +
  `internal/testfixtures/atomic/tsconfig.json` are compiled by the **JS** `typecheck`
  script (see D, L43). Confirm those tsconfigs' own `include`/`extends`/`paths` still
  resolve after the move (they may reference `../../..` up to repo root or the marker
  package).

### G. Config / ignore

- [`tsconfig.json`](../../tsconfig.json) L26 `exclude: [… "third_party", "bin"]` →
  `"ts-go-runtypes/third_party"` (bin stays).
- [`vitest.config.ts`](../../vitest.config.ts) — any `third_party` exclude used to
  stop vite walking the submodule (grep the config; update prefix).
- [`.gitignore`](../../.gitignore) L2 `/bin/` (stays), L33 `/dist-binaries/` (stays).
  No change unless a `go.work.sum`-style ignore exists — it does not today.

### H. Setup scripts + skill (repo detection, submodule init, staleness, build)

- [`scripts/setup-claude-web.sh`](../../scripts/setup-claude-web.sh): L43
  `-d "$1/cmd/ts-runtypes"` (repo-detection probe), L237/L250 `third_party/tsgolint`,
  L277 `third_party/tsgolint/typescript-go`, L320 `find "$REPO_DIR/cmd"
  "$REPO_DIR/internal" -newer "$bin"` (staleness), L324 `go build -o bin/ts-runtypes
  ./cmd/ts-runtypes`.
- [`.claude/skills/ts-runtypes-setup/setup.sh`](../../.claude/skills/ts-runtypes-setup/setup.sh):
  L145-159 submodule init, L187-188 typescript-go + patches dirs, L256-265 build.
- The `SessionStart` hook check (`scripts/setup-claude-web.sh` path probes) must still
  detect the repo — the `-d cmd/ts-runtypes` probe becomes `-d ts-go-runtypes/cmd/ts-runtypes`.

### I. Docs (high volume, mechanical, prose-only edits)

Reference counts (path mentions to re-prefix): README ~34, SETUP ~16,
CLAUDE.md ~37, `docs/ARCHITECTURE.md` ~83, `docs/ROADMAP.md` ~11. Plus:

- CLAUDE.md encodes the layout as guidance ("our Go code lives ONLY in `cmd/` and
  `internal/`", the `internal/…` linkified package map, the `third_party/` OFF-LIMITS
  section, Rewrite-mechanics file links). All those links + framing need the new
  prefix. This is the single largest edit surface.
- `container/website/content/2.guide/10.linting.md` L129 shows `"binary":
  "./bin/ts-runtypes"` in a config example — `bin/` stays at root, so this is
  **unchanged** (double-check it is the root path, not a Go-tree path).
- `container/benchmarks/README.md` mentions `bin/ts-runtypes` (root, unchanged).

### J. Existing `docs/todos/` + `docs/done/` specs (stale path references)

Other spec docs hardcode Go paths — mostly as **clickable relative links**
(`[reconcile.go](../../internal/enrichment/mirror/reconcile.go)`), of which there are
**~246** across `docs/todos/` + `docs/done/`. They break (point at nonexistent paths)
after the move. Policy by category:

- **Active `docs/todos/` — MUST update.** These specs get implemented *later* against
  the new layout, so their links must resolve. Today:
  - [`class-serializer-optional-serialize.md`](class-serializer-optional-serialize.md)
    — ~11 links into `../../internal/cachegen/typefunctions/…` and
    `../../internal/diagnostics/…`. Re-prefix the link *targets* to
    `../../ts-go-runtypes/internal/…`.
  - `go-tree-subdir-migration.md` (this doc) — intentionally carries **both** pre- and
    post-move paths (it describes the transition); leave as-is. Per the PR-readiness
    rule, `git mv` it into `docs/done/` when the migration ships.
  - `oxc-migration-followups.md`, `website-build-site-zip-path-bug.md` — no Go paths;
    skip.
- **Archived `docs/done/` (~60 files) — optional, deferrable.** These are historical
  records wired into **no tooling**, so broken links there have **zero build impact**
  (purely cosmetic). Recommended if you want the archive to stay clickable: one
  scripted sweep re-prefixing only the **link targets** —
  `](../../internal/` → `](../../ts-go-runtypes/internal/` (same for `/cmd/`,
  `/third_party/`) — leaving all prose untouched. Watch two quirks:
  `VALIDATE-OPTIONS.md` uses a single-`../` depth (`../internal/…`, already broken
  pre-move), and the sweep must not touch `github.com/mionkit/ts-runtypes/internal/…`
  module-path strings that appear in fenced code.
- **No `docs/partially/` dir exists today.** If one is created before this ships,
  apply the same policy as `docs/todos/`.

## Ordered execution plan

1. **Branch is `claude/go-file-organization-mw0we9`.** Confirm clean tree.
2. **Submodule relocation in its own commit** (Section A). Create `ts-go-runtypes/`,
   `git mv third_party ts-go-runtypes/third_party`, edit `.gitmodules`,
   `git submodule sync`, then verify with `git submodule status` + a
   `git clone --recurse-submodules` dry run into a temp dir. Re-apply tsgolint patches
   into the moved `typescript-go` and confirm the working tree matches pre-move.
3. **Move the Go tree** (Section B): `git mv cmd ts-go-runtypes/cmd`,
   `git mv internal ts-go-runtypes/internal`, `git mv go.mod go.sum go.work
   go.work.sum ts-go-runtypes/`. From `ts-go-runtypes/`, run `go build ./cmd/...`
   and `go test ./internal/...` to prove the Go side is intact **before touching any
   JS**. (This is the cheap early-exit: if Go is green here, every remaining edit is
   just path plumbing.)
4. **Add `GO_ROOT`** to `scripts/lib/env.mjs` (Section: single lever).
5. **Scripts + package.json** (Sections C, D) — route each `go`/`gofmt` call through
   `GO_ROOT`; absolutize `go run` file args.
6. **CI** (Section E).
7. **Cross-tree couplings** (Section F) + **config/ignore** (Section G) +
   **setup scripts** (Section H).
8. **Docs** (Section I) — mechanical re-prefix; fan out one agent per doc if desired,
   then diff the reference counts to confirm nothing was missed. **Also update the
   existing spec docs** (Section J): re-prefix the active `docs/todos/` links now
   (`class-serializer-optional-serialize.md`); the `docs/done/` archive sweep is
   optional and can be a follow-up.
9. **Verify** (below), then commit in logical chunks (submodule move / Go move /
   tooling / CI / docs) so the history is bisectable.

## Verification gate (the real test — nothing here is caught by `go build` alone)

Run from a **clean state** to catch path breakage the compiler hides:

- `cd ts-go-runtypes && go build ./cmd/ts-runtypes && go test ./internal/... && go vet ./cmd/... ./internal/...`
- `pnpm run pretest` (rebuilds `bin/ts-runtypes` via the moved paths) then `pnpm test`
  — the FE suite spawns the binary and runs the `prefilter.test.ts` constant-sync
  (Section F) that reads `.go` files by relative path.
- `pnpm run check-format` (gofmt over the new `ts-go-runtypes/{cmd,internal}` paths).
- `pnpm run typecheck` (compiles the moved `internal/testfixtures` tsconfigs).
- `pnpm run lint`.
- `pnpm rtx core codegen all --check` (gen:ts-constants / gen:run-type-kind /
  gen:diag-catalog all shell into `go run ./cmd/...`).
- **Clean-clone dry run**: `git clone --recurse-submodules` into a temp dir and run
  `scripts/setup-claude-web.sh` (or the setup skill) end-to-end — this is the only
  check that exercises submodule init + patch apply + build from a virgin tree.
- Green CI on a push (the bootstrap composite action is not exercised locally).
- **Doc-link sanity (optional):** grep for surviving `](../../internal/`,
  `](../../cmd/`, `](../../third_party/` across `docs/` (and `](../internal/…`) to
  confirm no active-todo link still points at the old layout; `docs/done/` hits are
  acceptable if the archive sweep (Section J) was deferred.

## Rollback

Every step is a pure `git mv` + text edit; revert the branch. The one stateful piece
is the submodule bookkeeping (`.git/config` / `.git/modules/`) — if a clone dry run
misbehaves, `git submodule deinit -f .` then re-`git submodule update --init
--recursive` against the reverted `.gitmodules` restores it.

## Open decisions (confirm before starting)

- **`bin/` at root** (assumed here) vs. moving it under `ts-go-runtypes/bin/`. Root
  is recommended: it is JS-consumed output, hardcoded in JS callers, and gitignored.
- **Subdir name** `ts-go-runtypes/` (assumed) vs. a shorter `go/`. `ts-go-runtypes/`
  matches the naming voice of the rest of the repo; `go/` is terser but generic.
