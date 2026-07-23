---
type: fix
spec: guidelines
status: ready
created: 2026-07-23
---

# Local-setup skill: upgrade a stale Go, don't just warn

## Intent

The web installer's `ensure_go()` was fixed to *upgrade* a present-but-too-old Go (see [docs/done/remove-garble-and-fix-web-go-version.md](../done/remove-garble-and-fix-web-go-version.md), Part A). The **local** setup skill has the exact same latent bug and was left out of that change because the user's request named the web setup specifically. This todo tracks fixing the parallel gap so a contributor whose machine has an older Go (< the repo's `GO_MIN`) gets it upgraded instead of a warning followed by a failing `go build`.

## Direction

The gap lives in the shared `check_dep` helper, not in a Go-specific function:

- [.claude/skills/ts-runtypes-setup/lib/common.sh](../../.claude/skills/ts-runtypes-setup/lib/common.sh) `check_dep()` (around lines 19-53): when the tool is present but `! version_ge cur min`, it runs `warn "... upgrade recommended"` then `return 0` — it never calls `install_$name`. `install_$name` only runs when the binary is **absent**.
- Driven from [.claude/skills/ts-runtypes-setup/setup.sh](../../.claude/skills/ts-runtypes-setup/setup.sh) `check_dep go "$GO_MIN" ...` (around line 359). `GO_MIN`/`GO_INSTALL_VERSION` are defined at the top of that file (lines 56-57).
- Install paths already exist per platform: Linux tarball via `install_go_linux_tarball` (`lib/common.sh`, mirrors the web script's `go.dev/dl/go<ver>.linux-<arch>.tar.gz` → `/usr/local/go` + `export PATH`), macOS via `brew install go` (`pm/brew.sh`).

The fix is a `check_dep` behavior change: on present-but-stale, fall through to `install_$name` (guarded by the check-only flag), not just warn. Because `check_dep` is generic across all deps, weigh whether to (a) make the upgrade-on-stale behavior apply to every dep, or (b) special-case Go — the implementer decides after reading how the other `check_dep` callers expect stale handling. Mind the macOS path: `brew install go` on an existing-but-old Homebrew Go may need `brew upgrade go` instead. Keep shell files ASCII-only (repo rule) and re-run `bash -n` on both edited scripts.

The web fix is a good reference for the shape (extract-install-helper, call on both absent and too-old paths), but the two installers are intentionally separate and evolve independently — do not try to share code between them.

## Done when

- On a host with Go present but older than `GO_MIN`, the local setup skill **errors** (`FAILED=1`) with clear upgrade guidance rather than silently warning — it does NOT auto-upgrade (see the Plan below for why). Absent Go still installs; check-only mode still reports without installing.
- Both `.claude/skills/ts-runtypes-setup/setup.sh` and `lib/common.sh` pass `bash -n` and stay ASCII-only.

---

## Plan — error-on-stale-Go (approved 2026-07-23)

**Decision: on local, a present-but-too-old Go is an ERROR, not an auto-upgrade.** We can't know how Go was installed on a contributor's machine (brew / apt / asdf / gvm / manual), so clobbering `/usr/local/go` (the Linux tarball helper does `rm -rf /usr/local/go`) or running `brew install go` is unsafe and often useless — the active `go` may live elsewhere on `PATH`, so we wouldn't even fix it. Absent Go still installs (nothing to clobber). The generic `check_dep` stays unchanged (other deps keep warn-on-old); the change is Go-specific.

**On "a global way to update Go within Go":** there is no `go` self-update command. Go ≥ 1.21 with `GOTOOLCHAIN=auto` (the default) does auto-download the `go.mod`-required `go1.26.0` toolchain at build time from the bare `go 1.26` directive — so a recent-ish local Go + network already builds the repo without upgrading. We deliberately do NOT rely on that (it needs network + `GOTOOLCHAIN=auto`, and can be disabled): we require an **active** Go ≥ `GO_MIN` and error otherwise, surfacing the manual upgrade paths in the message.

- [lib/common.sh](../../.claude/skills/ts-runtypes-setup/lib/common.sh): add `check_go()` — present-and-current → `ok`; present-but-old → `err` + `FAILED=1` with upgrade guidance; absent → delegate to `check_dep go … 0` (the unchanged install path).
- [setup.sh](../../.claude/skills/ts-runtypes-setup/setup.sh) (~line 359): replace `check_dep go "$GO_MIN" … 0` with `check_go "$GO_MIN"`.
- **Web installer unchanged** — its in-place tarball upgrade is correct for the controlled container (Go at `/usr/local/go` or absent, restricted egress). The two installers are intentionally separate.

**Verification:** `bash -n` both files; ASCII-only; functional test — stub an old `go` on `PATH` and assert `check_go` sets `FAILED=1` + prints the upgrade message, and that the real Go ≥ `GO_MIN` yields `ok` with `FAILED` untouched.

**Shipped 2026-07-23:** `check_go()` added to `lib/common.sh`; the `check_dep go …` call in `setup.sh` swapped for `check_go "$GO_MIN"`. Verified — `bash -n` + ASCII-only on both files; functional test confirms present-and-current (real go1.26.3) → `ok` with `FAILED=0`, present-but-old (stubbed go1.23.0) → `err` + `FAILED=1` with the upgrade message, and absent + `--check` → delegates to `check_dep` (warn, no install, `FAILED` untouched). Generic `check_dep` and the web installer left unchanged. Bundled with the garble-removal change.
