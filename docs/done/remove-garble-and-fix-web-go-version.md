---
type: chore
spec: full-plan
status: ready
created: 2026-07-23
---

# Remove garble entirely + fix the Claude-web Go install to upgrade a stale toolchain

## Context / Problem

Two build-tooling fixes, both surfaced from running the repo in the Claude web container:

1. **The Claude web setup never upgrades a too-old preinstalled Go.** The repo requires Go 1.26 (`ts-go-runtypes/go.mod:3` → `go 1.26`, no `toolchain` line). `ensure_go()` in [scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh) only *installs* Go when it's **absent**; when Go is **present but older** than `GO_MIN`, it merely warns and returns — so on a web image that ships an older Go, `go build ./cmd/ts-runtypes` fails against the 1.26 requirement. `GOTOOLCHAIN` auto-download can't be relied on to rescue it (unset repo-wide; needs Go >= 1.21 *and* egress the web env restricts).

2. **Garble should go away completely.** Garble obfuscates the published resolver binaries + the playground wasm to deter reverse-engineering ([scripts/lib/garble.mjs](../../scripts/lib/garble.mjs) header). The repo is open source now, so the entire rationale is gone. Keeping it is pure maintenance overhead (a pinned tool, install steps in two setup scripts + CI, a `mode` split across three workflows, an `RT_GARBLE` knob, cache-key plumbing). **Decision: rip it out everywhere** (published binaries *and* wasm), not just the playground path.

The two share one file ([scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh)); otherwise independent. Can land as one PR or two.

Fuzzing: N/A (build/release tooling, no runtime surface).

---

## Part A — Fix `ensure_go()` to upgrade, not just warn

**File:** [scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh)

The gap (confirmed): lines 206-210 — when `go` is present but `! version_ge cur GO_MIN`, it runs `warn` + `return 0`, never upgrading. Install (lines 212-224, tarball → `/usr/local/go`, `export PATH` at 220) fires **only** in the absent branch. `version_ge` (line 30, `sort -V`) is *correct* — the only defect is warn-instead-of-upgrade.

**Fix direction:**
- Extract the tarball install (arch map + `go.dev/dl/go${GO_INSTALL_VERSION}.linux-${goarch}.tar.gz` + `rm -rf /usr/local/go` + extract + `export PATH="/usr/local/go/bin:$PATH"`, lines 212-224) into a helper, and call it in **both** cases: Go absent, AND Go present-but-`! version_ge`. Sketch:
  ```sh
  if command -v go >/dev/null 2>&1; then
    cur="$(go version … | sed 's/^go//')"
    version_ge "${cur:-0}" "$GO_MIN" && { ok "go $cur (>= $GO_MIN)"; return 0; }
    warn "go $cur present but repo needs >= $GO_MIN — upgrading to $GO_INSTALL_VERSION"
  fi
  [ "$CHECK_ONLY" = 1 ] && { warn "go missing/old - re-run without --check to install"; return 0; }
  install_go_tarball   # prepends /usr/local/go/bin so the new go wins for later steps
  ```
- The `export PATH` prepend must run on the upgrade path too (shadows an old `/usr/bin/go`). `ensure_go` isn't in a subshell (called at line 439), so the export already persists to later steps in the same run (the resolver `go build` at line 360).
- Fix the now-false comments: line 10 (`# only used if Go is somehow absent`), line 202 (`present in the web image`), line 501 (`Go 1.26 - present in the web image`).

**Secondary (verify, may be no-op):** a tarball Go under `/usr/local/go/bin` is only visible to Claude Code's *later* non-login shells if that dir is already on the image's default PATH. Node handles this explicitly (`/etc/profile.d/zz-node26.sh` + `~/.local/bin` symlinks, lines 148-162, "because the harness runs NON-login shells"); Go has no equivalent. If the upgraded Go isn't on later shells' PATH, mirror the Node profile.d/`.local/bin` treatment for Go. Verify in the web container before adding.

---

## Part B — Remove garble everywhere

Verified inventory: **15 live files** (1 deleted, 14 edited); **4 historical files left as-is**. No Go-source or `go.mod` changes (the tree is garble-clean).

**Delete outright**
- [scripts/lib/garble.mjs](../../scripts/lib/garble.mjs) — the whole helper. Purges exports `GARBLE_VERSION`, `GOGARBLE_SCOPE`, `garbleEnabled`, `findGarble`, `requireGarble` (only two importers, both below).

**Collapse the build scripts to the plain `go` path**
- [scripts/release/build-binaries.mjs](../../scripts/release/build-binaries.mjs) — drop the import (20), the `USE_GARBLE`/`GARBLE_EXE` consts (33-34), the `if (USE_GARBLE)` garble branch (93-99); the existing **`else` plain branch (100-106)** — `go build -trimpath -ldflags … -o … ./cmd/ts-runtypes` — becomes the sole path (keep `-trimpath`, which garble used to imply). Simplify the log at 156.
- [container/website/scripts/build-playground.mjs](../../container/website/scripts/build-playground.mjs) — drop the import (24) and collapse the garble machinery to plain wasm: remove `MODE_MARKER`/`.wasm-garble` (39), `useGarble`/`garbleExe`/`GARBLE_WASM` (40-43), `sha256File` (44, now dead), `modeChanged` (84-86) and its term in `wasmMaybeStale` (89), the garble branch of `sameAsDisk` (92-100, keep the `go tool buildid` compare as the whole body), `writeMode` (102-107) and both call sites (132, 138); collapse the build to `run('go', ['build','-o',tmp,WASM_PKG], {env:{GOOS:'js',GOARCH:'wasm'}})` (124-126) and drop the ternary in the note (119). Staleness reverts to mtime pre-check + buildid compare (determinism unchanged — plain wasm was already buildid-compared, not byte-compared).

**Setup scripts — delete the install step + call**
- [scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh) — delete the `# 3b.` banner (228-231), `GARBLE_VERSION` (232), `ensure_garble()` (233-243), and the call site (440).
- [.claude/skills/ts-runtypes-setup/setup.sh](../../.claude/skills/ts-runtypes-setup/setup.sh) — delete the comment (293-296), `GARBLE_VERSION` (297), `ensure_garble()` (298-307), and the call (398).
- [.claude/skills/ts-runtypes-setup/SKILL.md](../../.claude/skills/ts-runtypes-setup/SKILL.md) — drop `, garble` from the deps list in the frontmatter `description` (line 3).

**CI / composite actions**
- [.github/actions/bootstrap/action.yml](../../.github/actions/bootstrap/action.yml) — delete 3 garble-only steps: "Resolve the active Go version (for the garble cache key)" (66-69), "Cache garble" (76-90), "Install garble" (91-94), plus the explanatory comments (61-65, 71-75). **Verify then delete** "Add GOPATH/bin to PATH" (95-97) — garble is the only `go install` target, but confirm nothing else needs GOPATH/bin. **Keep** the Go build-cache restore (46-59, not garble).
- [.github/actions/cache-playground-wasm/action.yml](../../.github/actions/cache-playground-wasm/action.yml) — delete the `mode` input (9-15); in the cache `key` (27) drop the `${{ inputs.mode }}-` prefix AND `'scripts/lib/garble.mjs'` from `hashFiles`; trim the comment (21). (One-time cache miss after merge, then repopulates — expected.)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — drop `with: mode: plain` (231) and the `env: RT_GARBLE: '0'` on the website smoke step (237); simplify comments (227, 233-235).
- [.github/workflows/release-gate.yml](../../.github/workflows/release-gate.yml) — drop `with: mode: plain` (242) and `env: RT_GARBLE: '0'` (253); simplify comments (231, 236, 250).
- [.github/workflows/website-deploy.yml](../../.github/workflows/website-deploy.yml) — drop `with: mode: garble` (91) and the comment (87). The deploy now builds plain like everything else (**intended change**: the deployed wasm is no longer obfuscated).

**Env registry + sample** (the registry is the contract — CLAUDE.md § Environment variables)
- [scripts/lib/env.mjs](../../scripts/lib/env.mjs) — delete the `RT_GARBLE` row (134) and its section comment (133); keep `RT_NPM_PROVENANCE`.
- [.env.sample](../../.env.sample) — delete the `RT_GARBLE` block (108-111); keep the `# === Build/release knobs ===` header (107) for `RT_NPM_PROVENANCE`.

**Misc + prose**
- [scripts/release/manual-publish.mjs](../../scripts/release/manual-publish.mjs) — trim the trailing comment (94) to `// -> dist-binaries/`.
- [SETUP.md](../../SETUP.md) — delete the garble paragraph (333), drop the "obfuscated with garble unless RT_GARBLE=0" parenthetical (353), delete the "garble not found" troubleshooting row (443). **Leave line 450** ("garbled errors" = corrupted output, false positive).

**Leave untouched (historical record):** [CHANGELOG.md](../../CHANGELOG.md) (123, 134), [docs/done/ci-cache-playground-wasm.md](../done/ci-cache-playground-wasm.md), [docs/done/playground-overlay-scope-rename-fix.md](../done/playground-overlay-scope-rename-fix.md), [docs/done/release-pipeline-first-run-fixes.md](../done/release-pipeline-first-run-fixes.md).

---

## Verification

- **No live garble refs left:** `rg -n 'garble|GARBLE|GOGARBLE|RT_GARBLE|obfuscat|\.wasm-garble' -g '!ts-go-runtypes/third_party' -g '!node_modules' -g '!CHANGELOG.md' -g '!docs/done'` returns only the SETUP.md:450 false positive (or nothing).
- **Env contract:** `pnpm run check:env` passes with `RT_GARBLE` gone.
- **Binaries build plain:** `node scripts/release/build-binaries.mjs` produces `dist-binaries/` with no garble installed (larger, un-obfuscated binaries — expected).
- **Wasm builds plain + caches:** `node container/website/scripts/build-playground.mjs` builds once, and a second run reports "wasm up to date" (mtime + buildid gate intact).
- **Web setup (Part A):** in the Claude web container, run `bash scripts/setup-claude-web.sh` and confirm `go version` >= 1.26 afterward (and that the run has no `ensure_garble` step). `--check` reports the stale-Go case without installing.
- **Lint/format:** `pnpm run lint` and `pnpm run check-format` (touches `.mjs` + `.sh` + `.md`).
- **CI:** the two verify jobs + path-gated smoke stay green; `website-deploy` / `release-gate` still build the wasm (now plain).

## Docs

- [SETUP.md](../../SETUP.md) prose updates above (Publishing / troubleshooting).
- No README / ARCHITECTURE change needed (ARCHITECTURE never actually mentions garble; README is clean).
- On implementation, `git mv` this spec into `docs/done/`.

## Out of scope

- **The local-setup skill's Go-upgrade gap.** [.claude/skills/ts-runtypes-setup/setup.sh](../../.claude/skills/ts-runtypes-setup/setup.sh) upgrades Go via the shared `check_dep` helper (`lib/common.sh:19-53`) which has the **same** warn-but-don't-upgrade bug (present-but-old → warn + return, install only when absent). The user's request named the *web* setup; this parallel fix can be folded in or filed separately. Flagged here so it isn't lost.
- Reworking the published-binary size/format beyond dropping obfuscation.

## Done when

- `ensure_go()` in the web setup upgrades a stale preinstalled Go to the repo's required 1.26.x (not just warns), and later steps see it.
- Garble is gone from all 15 live files; `scripts/lib/garble.mjs` deleted; `RT_GARBLE` removed from the registry + sample; the three workflows build wasm plain with no `mode` split; historical docs untouched.
- Binaries + wasm build with no garble present; `check:env`, lint, format, and CI all pass.

---

## Outcome (shipped 2026-07-23)

Implemented as specced; no divergence.

**Part A** — [scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh): extracted `install_go_tarball()` and made `ensure_go()` upgrade a present-but-stale Go (was warn-only), calling the helper on both the absent and too-old paths; refreshed the now-false "present in the web image" comments. The secondary `profile.d`/`~/.local/bin` PATH-persistence step was **not** added (can't confirm the web image's default PATH from a macOS host — left as the spec's "verify, may be no-op").

**Part B** — garble removed from all 15 live files; `scripts/lib/garble.mjs` deleted; `RT_GARBLE` gone from the env registry + `.env.sample`; the three workflows build wasm plain with no `mode` input; the bootstrap action's "Add GOPATH/bin to PATH" step verified garble-only (sole `go install` target) before deletion. Historical docs (`CHANGELOG.md`, `docs/done/*`) left untouched.

**Verification run:** live-code garble sweep clean (only the SETUP.md "garbled errors" false positive remains); `node --check` + no dangling identifiers on all edited `.mjs`; all 5 edited YAML files parse-valid; both setup `.sh` pass `bash -n` and are ASCII-only; `pnpm run check:env` exit 0; **plain wasm build works** (`build-playground.mjs`, staleness gate short-circuits on rerun, no `.wasm-garble` marker written); **plain 7-platform binary build works** (`build-binaries.mjs`); `oxlint` exit 0 (rebuilt the devtools dist clean); `check-format` clean (all edited files are outside its `packages/**` + Go scope, so no formatting obligation); the playground engine suite passes **25/25** against the plain-built wasm.

**Note (minor, local-only):** a dev with a previously *garbled* wasm cached under `.cache/rt-wasm/` keeps an orphan `.wasm-garble` marker; the new staleness gate ignores it, so the cached (garbled-but-functionally-identical) wasm survives until a Go input changes or the cache is wiped. CI is unaffected — the `cache-playground-wasm` key changed (dropped the `mode` prefix + `garble.mjs`), so it misses once and rebuilds plain. No code cleanup added (the marker is inert and the cache is git-ignored).
