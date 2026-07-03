# OXlint plugin for RunTypes — compiler diagnostics + enrichment-file health

**Status:** SHIPPED
**Home package:** [`packages/runtypes-devtools`](../../packages/runtypes-devtools) — the existing [`./eslint` subpath export](../../packages/runtypes-devtools/package.json), as specced. No new package.
**Docs:** [website Linting guide](../../container/website/content/2.guide/10.linting.md) · [ARCHITECTURE → The lint surface](../ARCHITECTURE.md#the-lint-surface--one-pass-oxlintESLint-transport) · [README → Linting](../../README.md#linting-oxlint--eslint)

One lint plugin surfaces every RunTypes problem live in the editor (OXlint `jsPlugins` → oxc language server; the same module is an ESLint v9 flat-config plugin) and blocks dirty enrichment files at commit time. This document records what shipped, including where the implementation deliberately departed from the original investigation.

## The architectural pivot: Go detects everything, JS only transports

The original spec split detection: Family A (compiler diagnostics) from the Go binary, Family B (enrichment tag hygiene) as a JS text scan inside the rule, Family C (enrichment semantic validity) deferred or shelled per file. During implementation the owner redirected to a **single-pass, Go-side design**, and that is what shipped:

- **Go detects all three families.** Tag hygiene (`@todo`, `@rtOrphan`, `@rtOrphanChild`) is detected by [`internal/enrich/mirror/hygiene.go`](../../internal/enrich/mirror/hygiene.go) — the SAME package that emits the tags, deriving detection from the same [`tags.go`](../../internal/enrich/mirror/tags.go) constants the emitters use, so the §7.5 emitter/detector drift class is impossible by construction (the old plan to sync regex literals into JS died with it; only the cheap pre-filter guard strings are mirrored via `gen:ts-constants`). Content validity (FT002/FT003/FT005/MD001) runs through the shared [`internal/enrich/astcheck`](../../internal/enrich/astcheck/) walk (extracted from the `check` CLI, now position-anchored: each finding's dotted path resolves to the property NAME node). Breadcrumb drift (GE002/GE003) lives in [`mirror/drift.go`](../../internal/enrich/mirror/drift.go), overlay-FS aware; GE001 (location drift) stays CLI-only in `gen --check` because only the CLI knows the project's enrich-dir config.
- **One protocol pass returns everything.** `scanFiles` gained two opt-in request flags ([`internal/protocol/protocol.go`](../../internal/protocol/protocol.go)): `checkEnrich` (append the enrichment findings as `FamilyEnrich = 4` diagnostics, served from [`internal/resolver/enrichcheck.go`](../../internal/resolver/enrichcheck.go)) and `includeRtDiagnostics` (run the RunType render for its diagnostics — VL010, PJ001, … — exactly as `includeEntryModules` would, but drop the module payload from the wire). The lint worker sends `setSources` (the HMR pivot: buffer text overlay, imports from disk) + one `scanFiles` with both flags; the response is the full diagnostic picture a build would surface. Both flags default off, so the rewrite pipeline pays nothing.
- **CLI parity for free.** `ts-runtypes check <file> [--json]` now reports tag hygiene + content validity + GE002/GE003 with 1-based positions and exits 1 on errors; `gen --check` gained `--json`. CI can gate on the binary alone, no node linter required.
- **Codes joined the one catalog.** ENR001 (todo), ENR002/ENR003 (orphan const/field), FT/MD/GE registered in [`internal/diag/codes_enrich.go`](../../internal/diag/codes_enrich.go) with headline templates in [`diagnosticCatalog.ts`](../../packages/runtypes-devtools/src/diagnosticCatalog.ts); `enrich.Finding` grew `Args` so wording stays JS-side (`code + args` wire rule). The website diagnostics page gets the new "Enrichment files" subsystem via `gen:diag-catalog`.

## Decisions (from the §12 open questions)

1. **Package placement:** in `runtypes-devtools` on the `./eslint` subpath — as specced. No `./oxlint` alias; the guide documents that the one entry serves both hosts.
2. **Scan op:** reuse `scanFiles` with the two opt-in flags; no new op needed.
3. **Severity mapping (Family A): severity-tier rules** — `runtypes/error`, `runtypes/warn`, `runtypes/info`, each diagnostic routed by its own severity so oxlint's per-rule severity keeps the error/warn CI gate faithful; the code + family ride in the message (`"[VL010] …"`).
4. **Orphan granularity: one rule** — `runtypes/no-orphan-carcass` covers `@rtOrphan` + `@rtOrphanChild`; the message says which.
5. **`@todo` strictness: any `@todo` comment token** in an enrichment file (identifier-boundary checked; string literals never count; a `@todo` preserved INSIDE a carcass is not double-reported — the carcass finding covers it).
6. **File scoping:** the guard is Go-side and authoritative ([`mirror.IsEnrichmentFile`](../../internal/enrich/mirror/hygiene.go)): the marker EMIT form (`/** @rtType ` prefix) or the ANNOTATION form (`: FriendlyType<` / `: MockData<`, colon introducer required). Dogfooding forced both tightenings — the DSL package's own sources declare the bare names and carry `@todo` in prose, and files holding the tag string literals must not read as mirrors. The JS pre-filter ([`prefilter.ts`](../../packages/runtypes-devtools/src/eslint/prefilter.ts)) mirrors the same signals purely to skip resolver round trips; a consumer `overrides` glob remains available as an extra fence.
7. **Family C: INCLUDED** (owner decision) — via the same protocol pass, not per-file shelling: rules `runtypes/enrichment-field` (FT/MD content) and `runtypes/enrichment-drift` (GE codes).

## The rules

| Rule | Source | Default (`configs.recommended`) |
| --- | --- | --- |
| `runtypes/error` | any compiler diagnostic with Error severity | error |
| `runtypes/warn` | Warning severity | warn |
| `runtypes/info` | Info severity | off |
| `runtypes/no-enrichment-todo` | ENR001 | error |
| `runtypes/no-orphan-carcass` | ENR002, ENR003 | error |
| `runtypes/enrichment-field` | FT002, FT003, FT005, MD001 (+ future enrich codes) | error |
| `runtypes/enrichment-drift` | GE000, GE002, GE003 | error |

Routing, message rendering (catalog + `[CODE]` prefix + inline related locations + the §6.5 unknown-code fallback — a diagnostic is never silently dropped), and the 1-based→0-based column conversion live in the transport-agnostic [`diagnosticRouting.ts`](../../packages/runtypes-devtools/src/eslint/diagnosticRouting.ts), reusable by a future LSP sink unchanged.

## Runtime plumbing (the part the spec could not foresee)

- **Sync bridge.** Lint rule visitors are synchronous; the resolver clients are async. [`session.ts`](../../packages/runtypes-devtools/src/eslint/session.ts) blocks the rule thread on `Atomics.wait` against a worker thread ([`lint-worker.ts`](../../packages/runtypes-devtools/src/eslint/lint-worker.ts)) that owns ONE `--inline-server --single-threaded` resolver for the whole run (hand-rolled synckit pattern, zero new dependencies). Results memoize per (file, text-hash), so the several rules sharing a file pay one pass and LSP re-lints of unchanged files replay instantly. Engine failures are never silent: connection-level failures go sticky and report once per file (`engineErrorClaims`).
- **The fork discovery.** oxlint hosts the Rust linter inside its Node process and reserves ~29 GB of virtual address space once linting starts — after which `fork()` (Node's `child_process` on Linux) fails with ENOMEM, so the resolver could never spawn lazily. Shipped fix: the plugin entry top-level-awaits a prewarm; the worker starts at plugin LOAD (VSZ still ~3 GB) and pre-spawns the tiny [`spawn-shim.ts`](../../packages/runtypes-devtools/src/eslint/spawn-shim.ts) launcher; the first linted file hands it `{exec, args}` over its own pipes (stdout inherited by the resolver, stdin relayed), so the protocol then flows worker ⇄ resolver with the shim as a byte pump. `RT_LINT_PRESPAWN=0` opts out; a `settings.runtypes.socket` (persistent `--daemon`) skips children entirely; plain ESLint also works via the direct-spawn fallback.
- **Fidelity caveat (documented, ROADMAP'd):** the per-file pass builds an inferred Program (imports resolve from disk; tsconfig `compilerOptions` are not applied), same trade the HMR path already makes. Lib-sensitive codes (TMP001) can differ from a build.

## Commit-time enforcement (shipped in this repo)

`oxlint@1.68.0` is a root devDependency; the root [`.oxlintrc.json`](../../.oxlintrc.json) loads the plugin from the built dist with the four enrichment rules on (severity tiers stay off at repo root — the repo's own fixtures exercise error cases deliberately). `pnpm run lint` now ends with `pnpm run lint:runtypes` (so the CI lint step gates), and lint-staged runs `oxlint` over every staged `.ts` file. Consumers follow the recipe in the [Linting guide](../../container/website/content/2.guide/10.linting.md).

## Testing (all shipped)

- **Go:** emitter↔detector round-trips for the tags (scaffold output detected, pruned output clean, comment-token-only matching, carcass-interior `@todo` folded), guard cases incl. the DSL-declaration negative, `LineIndex`, JS-compatible pattern contract ([`hygiene_test.go`](../../internal/enrich/mirror/hygiene_test.go)); the one-pass protocol contract with position cross-checks, opt-in + guard gates, and overlay-FS GE002 ([`internal/resolver/enrichcheck_test.go`](../../internal/resolver/enrichcheck_test.go)).
- **Vitest** ([`packages/runtypes-devtools/test/eslint/`](../../packages/runtypes-devtools/test/eslint)): routing units (severity tiers, enrich code → rule table, column conversion, related formatting, unknown-code fallback); prefilter gates + the Go↔TS constant-sync guard (reads `tags.go` and compares byte-for-byte); integration through the real `bin/ts-runtypes` (MKR001/MKR003/VL011 at exact positions, dirty/clean/drift mirrors, session cache replay, virtual-buffer + scope no-ops) — covering BOTH `getRunTypeId` shapes with the hash-equivalence assertion per the marker coverage rule; session failure paths (fast sticky engine errors); and an end-to-end run of the REAL `oxlint` CLI over a fixture project asserting rule ids, positions, and exit-1 gating.

## Follow-ups (tracked in [ROADMAP](../ROADMAP.md))

LSP sink (`runtypes-devtools/lsp`) over the same routing layer; tsconfig-fidelity lint mode; GE001 through the protocol once the resolver reads enrich-dir config; oxlint suggestions for carcass removal.
