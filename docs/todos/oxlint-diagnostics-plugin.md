# OXlint plugin for RunTypes — compiler diagnostics + enrichment-file hygiene

**Status:** spec / investigation (not started)
**Owner:** TBD
**Related:** [`internal/diag/`](../../internal/diag), [`internal/enrich/`](../../internal/enrich), [`packages/runtypes-devtools/src/unplugin.ts`](../../packages/runtypes-devtools/src/unplugin.ts), [`packages/runtypes-devtools/src/resolver-client.ts`](../../packages/runtypes-devtools/src/resolver-client.ts)

## 1. Problem

A single OXlint plugin (`oxlint-plugin-runtypes`) should host **two rule families** that surface RunTypes-specific problems in the editor and at commit time.

**Family A — compiler diagnostics (type-aware).** The RunTypes Go binary already emits a rich set of typed diagnostics — errors, warnings, info — for every non-fatal condition the compiler detects: unsupported types at a call site, non-serializable properties silently dropped from a validator/codec, marker misuse, pure-fn extraction problems. The catalog lives in [`internal/diag/`](../../internal/diag) (families `PureFn` / `Marker` / `RunType`; codes like `PFE9004`, `MKR001`, `VL010`, `SJ001`). Today these only surface **during a Vite / Rollup build**, re-emitted as `tsc`-style lines via `ctx.warn` / `ctx.error` ([`unplugin.ts` `formatTscDiagnostic`](../../packages/runtypes-devtools/src/unplugin.ts)). There is **no live in-editor integration**.

**Family B — enrichment-file hygiene (syntactic).** The enrichment workflow ([`internal/enrich/`](../../internal/enrich), the `ts-runtypes gen` CLI) scaffolds committed, type-keyed `FriendlyType<T>` / `MockData<T>` maps into a mirror directory. Freshly-scaffolded consts carry a `@todo` placeholder line; consts/fields whose source type was deleted or renamed are commented out as `@rtOrphan` / `@rtOrphanChild` carcasses. A **clean** enrichment file has neither. We want lint rules that **forbid `@todo`, `@rtOrphan`, and `@rtOrphanChild` in generated enrichment files**, so a team can **enforce clean, finished enrichment on every commit** (and see the same warnings live in the editor).

**Goal:** ship one OXlint plugin covering both families, delivered live in the editor via OXlint's LSP and enforceable at commit time via the existing husky/lint-staged gate. OXlint is the target because it is the linter surface where these belong, and its type-aware backend (tsgolint) already builds on the *same* typescript-go shim we build on.

## 2. How compiler diagnostics work today (our side)

The pipeline is already end-to-end structured; we only lack an editor transport.

- **Producer (Go).** Every subsystem constructs `diag.Diagnostic` via `diag.New(code, site, args...)` ([`internal/diag/catalog.go`](../../internal/diag/catalog.go)): stable `Code`, `Family` (`PureFn`/`Marker`/`RunType`), `Severity` (`Error`/`Warning`/`Info`), positional `Args`, a `Site` (1-based line/col start + end), optional `Related`.
- **Position source.** [`internal/textpos/textpos.go`](../../internal/textpos/textpos.go) builds sites as **1-based line, 1-based column**.
- **Transport.** Diagnostics ride on `protocol.Response.Diagnostics` ([`internal/protocol/protocol.go`](../../internal/protocol/protocol.go)), attached during `OpScanFiles` / `OpDump` / `OpGenerate` in [`internal/resolver/dispatch.go`](../../internal/resolver/dispatch.go). The wire carries only `code + args`, not the rendered message.
- **Consumer (JS).** [`resolver-client.ts`](../../packages/runtypes-devtools/src/resolver-client.ts) already exposes `scanFiles()` (returns `diagnostics`), `setSources()` (in-memory overlay), `reset()`, over **two transports**: `ResolverClient` (spawn + stdio) and `ResolverSocketClient` (Unix-socket **daemon**). `unplugin.ts` resolves `code + args → headline` through the vendored [`diagnosticCatalog.ts`](../../packages/runtypes-devtools/src/diagnosticCatalog.ts) and emits `tsc`-format lines.

Everything Family A needs is already produced and reachable from Node; the only missing piece is a bridge into the editor's diagnostics surface.

## 3. How tsgolint + OXlint work (their side)

- **tsgolint is a standalone Go binary OXlint spawns** in a `headless` mode. OXlint (Rust) writes a **JSON payload to stdin** and reads back a **binary length-prefixed frame stream on stdout** (5-byte header: `u32` LE length + 1 message-type byte, then JSON; types `0=error`, `1=diagnostic`, `2=timing`).
- **Diagnostic wire shape:** `{ kind, range: {pos, end}, message: {id, description, help}, file_path, rule, fixes[], suggestions[] }`. `range` is `{pos, end}` **UTF-16 tsgo scanner offsets** — not byte offsets, not line/col. **No severity on the wire**; OXlint assigns severity from *its own rule config* and converts UTF-16 offsets to UTF-8 spans.
- **A tsgolint rule** is a Go value `rule.Rule{ Name, Run }` returning AST-kind → listeners, reporting via `ctx.ReportNode/ReportRange` using `ctx.TypeChecker`. Rules are **compiled into the tsgolint binary** (hard-coded `allRules` slice).
- **Distribution:** esbuild-style per-platform packages (`@oxlint-tsgolint/<os>-<arch>`), launched via `optionalDependencies` — the same pattern our `ts-runtypes-bin` uses. OXlint locates the binary by name (`try_find_tsgolint_executable`).

### The load-bearing constraint

**OXlint has no third-party "external analyzer / custom binary" extension point.** The tsgolint integration is a hard-coded special case with a private, undocumented, unversioned protocol; there is no config to point OXlint at a different backend. We **cannot be a second tsgolint**, and impersonating it means replacing/forking it. The **only supported** way to inject diagnostics into OXlint is its **JS-plugin API**.

## 4. The one supported injection point: OXlint JS plugins

- OXlint ships an **ESLint-v9-compatible JS plugin API** (alpha as of March 2026; oxlint-core itself is stable/GA). A plugin is `{ meta, rules }`; each rule's `create(context)` returns an AST visitor and reports via `context.report(...)`.
- **`context.report` accepts a bare location** instead of an AST node: `context.report({ loc: { line, column }, message })` (oxc PR #16859). `line` is **1-based**, `column` is **0-based**. This is the hook for **externally-computed diagnostics** — the AST visitor is only the *trigger*; the diagnostic's position and text can come from anywhere (our Go binary for Family A; a comment scan for Family B). It also sidesteps the UTF-16 offset math the native tsgolint protocol requires.
- **Config** ([`.oxlintrc.json`](https://oxc.rs/docs/guide/usage/linter/config-file-reference)): custom plugins are referenced from a top-level **`jsPlugins`** array (local path, npm package, or `{ name, specifier }`); rules are enabled/severity-tuned under `rules` keyed by `<namespace>/<rule>`; `overrides` scope rules to file globs.
- **IDE flow is automatic.** OXlint ships an official VS Code extension (`oxc.oxc-vscode`) and an LSP server (`oxc_language_server`, run via `oxlint --lsp`). JS-plugin diagnostics **flow through the LSP to the editor's Problems panel live** (`textDocument/publishDiagnostics`, `run: onType`) with no extra editor wiring on our part. The same LSP serves Zed, JetBrains, Neovim, etc.

## 5. Design options (Family A transport)

| # | Approach | Live in IDE? | Fits OXlint target? | Effort | Verdict |
|---|----------|:---:|:---:|:---:|---|
| **A** | **OXlint JS plugin adapter** → shells to our binary, re-reports via `context.report({loc})` | ✅ (via oxc LSP) | ✅ native | Medium | **Recommended** — only supported injection point; reuses everything we have |
| B | Native tsgolint rules (upstream/fork) | ✅ | ✅ but not ours to ship | Very high | Rejected — our diagnostics are a byproduct of the whole resolve/emit pipeline, not per-node AST rules; can't be reimplemented standalone without duplicating the resolver. |
| C | Our own tiny LSP (`publishDiagnostics`) | ✅ | ❌ parallel to OXlint | Med-high | Documented fallback (§11) — editor-portable, immune to plugin-alpha churn, but a new distribution/editor-config surface. |
| D | VS Code extension (`createDiagnosticCollection`) | ✅ | ❌ VS Code-only | Medium | Rejected as primary — not editor-portable, not "OXlint". |
| E | tsc-style task `problemMatcher` on `formatTscDiagnostic` output | ❌ (task-run only) | ❌ | Low | Rejected — not live. |

## 6. Family A — compiler-diagnostics rules (JS-plugin adapter)

A thin adapter that treats our Go binary as the diagnostics engine and republishes findings through `context.report`. **No new diagnostics logic** — pure transport + mapping.

### 6.1 Runtime flow

Use OXlint's `createOnce` + `before`/`after` lifecycle so one resolver connection serves the whole run:

1. **`before` (once):** lazily connect a resolver — prefer a **persistent daemon** (`ResolverSocketClient`, our `--daemon` mode) so the tsgo `Program` is built once and survives across keystrokes; fall back to spawned `ResolverClient` for a one-shot CLI run. **Binary: resolve the user's *own* installed binary** via `ts-runtypes-bin`'s `getExePath()` — `ts-runtypes-bin` is a **peerDependency**, not a pinned/direct dep, so the lint-time binary is the exact one already in the consumer's `package.json` (the same one their build uses). See §6.4.
2. **Per file:** read the buffer text OXlint is linting (`context.sourceCode.text` — the **unsaved** editor text); push it as an overlay via `setSources({ [absPath]: text })` (mirrors tsgolint's `source_overrides`); call `scanFiles([absPath])` diagnostics-only (do **not** opt into `includeRunTypes`/`includeEntryModules`); map each returned `diag.Diagnostic` and `context.report(...)`.
3. **`after`:** tear down a spawned client; keep the daemon warm.

### 6.2 Diagnostic → `context.report` mapping

- **Message:** the wire is intentionally short — the Go binary ships only `code + args`, never the rendered text. Resolve `code + args → headline` by **reusing the existing autogenerated dictionary**, do **not** vendor a fourth hand-copy: the canonical prose lives in [`diagnosticCatalog.ts`](../../packages/runtypes-devtools/src/diagnosticCatalog.ts) and is fused with the Go catalog's severity/family by [`gen:diag-catalog`](../../scripts/gen-diag-catalog.mjs) (`renderHeadline` is the render entry point). Prefix with the code, e.g. `"[VL010] non-serializable property 'onClick' is dropped from the validator"`. See §6.4 for how the plugin consumes it without duplication, and §6.5 for the unknown-code fallback when the binary emits a code the installed catalog lacks.
- **Location:** `loc: { line: site.startLine, column: site.startCol - 1 }` (our col is 1-based; OXlint `loc.column` is 0-based). Emit the `{ start, end }` form when `endLine`/`endCol` exist for a real range squiggle.
- **Related locations:** append to the message (`"\n  related: <file>(<line>,<col>): <msg>"`) — OXlint plugins have no first-class related-location field today.

### 6.3 Severity fidelity

OXlint assigns severity **per rule name from config**, but our diagnostics carry **per-instance** severity, and error-vs-warning controls whether a CI `oxlint` run fails. Route each diagnostic to a rule whose name encodes its tier:

- `runtypes/error` — every `Severity.Error`; default `error`.
- `runtypes/warn` — every `Severity.Warning`; default `warn`.
- `runtypes/info` — every `Severity.Info`; default `warn` or `off`.

The specific code + family live in the **message**, so users still see exactly what fired. (Alternative: one rule per concern for category tuning — but a concern mixes severities, weakening the error/warn gate. Severity-tier routing is the safer default. **Decide in §12.**)

### 6.4 Dependency posture — peer the binary, reuse the catalog

Two firm constraints, both because **the wire codes, the message dictionary, and the binary are version-coupled**: a new diagnostic code shipped by binary vX only renders correctly against the catalog generated from vX. If the plugin pinned its *own* binary or its *own* copy of the catalog, they could drift from the version the user's build actually runs, producing wrong or `[unknown code]` messages in the editor. So:

- **Binary → peerDependency.** Declare `ts-runtypes-bin` (the platform launcher) as a **peerDependency**; resolve the executable at runtime with `getExePath()`. This uses the consumer's already-installed binary — the same one `runtypes-devtools` drives at build time — instead of a second, independently-versioned copy. (`runtypes-devtools` resolves the binary the same way, at [`unplugin.ts:178`](../../packages/runtypes-devtools/src/unplugin.ts).) Allow an explicit `binary` option override, exactly as devtools does.
- **Catalog → reuse, don't copy.** Consume the existing dictionary rather than adding a fourth copy (marker runtime, devtools, and the generated artifact already exist). Cleanest: either import `renderHeadline` + the catalog from a shared surface (`runtypes-devtools` or a small extracted module), or extend [`gen:diag-catalog`](../../scripts/gen-diag-catalog.mjs) to emit a module this plugin imports. Whichever, the plugin must **not** re-transcribe wording, and the catalog it renders against must be the one generated for the user's binary version.

Practically this means the OXlint plugin is a **thin, near-dependency-free package**: its real inputs (the binary and the message dictionary) come from what the consumer already has installed. **This resolves §12 #1.**

### 6.5 Version alignment — two layers

Because the wire codes, catalog, and binary are version-coupled (§6.4), the plugin must handle the case where the user's installed binary emits a code the installed catalog doesn't know — and, more broadly, where the binary and the catalog are on different versions at all. Two complementary layers, **neither of which hard-fails the lint run**:

- **Layer 1 — eager alignment check (once per run / daemon boot, advisory).** In `before`, read the binary version — `getExePath()` then `binary --version` (which prints `ts-runtypes <version> (tsgo <rev>)`, where `<version>` is `constants.Version`, stamped at build to match the npm version), or piggyback a version field on the daemon handshake so it's free — and compare it to the `catalogVersion` (the version of the package the plugin imports the catalog from). If they differ, emit **one** advisory warning: *"ts-runtypes binary vX vs catalog vY — align them (e.g. `pnpm up`) or some diagnostics may render incompletely."* This catches the **whole** skew class deterministically at startup, instead of the user hitting a confusing `[unknown code]` only on the one file that happens to trigger a newly-added diagnostic.
- **Layer 2 — lazy per-diagnostic fallback (graceful degradation).** Independently, when a specific `code` is absent from the catalog, still render it — `[<code>] (message unavailable — update ts-runtypes-bin / the catalog to matching versions)` — carrying the real `loc`. A diagnostic is **never silently dropped**; this also covers the edge where versions nominally match but a code is still missing.

**Comparison validity & strictness.** Everything publishes in **lockstep, exact-equal** (`ts-runtypes` / `runtypes-devtools` / `ts-runtypes-bin` + the per-platform binary packages), so a healthy install has all versions identical — which makes a plain version compare a valid alignment test, and any difference a genuine signal. Warn on any mismatch, but do **not** hard-fail: a patch bump is usually harmless, and a linked / `workspace:*` dev setup will differ legitimately. Consider gating the warning on a major/minor difference if patch-level noise proves annoying.

**Where to surface Layer 1.** The startup warning is not tied to a file/`loc`, and `context.report` requires a location — so emit it as a plain `console.warn` (visible in oxlint's output and the LSP trace), not forced onto some file's line 1.

**Catalog source (feeds `catalogVersion`).** To make Layer 1 cheap and meaningful, import the catalog from a package whose version tracks the binary in lockstep — ideally the **core `ts-runtypes` marker package** (always installed, already carries the catalog for its runtime `alwaysThrow`, lockstep-versioned) or a small extracted catalog module — **not** the heavy Vite plugin. `catalogVersion` is then that package's version.

## 7. Family B — enrichment-file hygiene rules (syntactic)

This is the **new ask**: forbid the "dirty-state" enrichment tags in generated files so commits stay clean.

### 7.1 What the tags mean (verified against source)

| Tag | Form | Who writes it | Clean file? |
|-----|------|---------------|:---:|
| `@todo` | plain line `// @todo: generated skeleton — fill in real data, then delete this line` ([`mirror/helpers.go:84`](../../internal/enrich/mirror/helpers.go)) | scaffolder, on **new** consts only; **never** re-added on `--update`; user deletes after filling | ❌ forbid |
| `@rtOrphan` | block `/* @rtOrphan <preserved const> */` ([`mirror/orphan.go:98`](../../internal/enrich/mirror/orphan.go)) | reconcile, when a const's source type was deleted/renamed; removed only by `gen --prune` | ❌ forbid |
| `@rtOrphanChild` | inline block `/* @rtOrphanChild <old field> */` ([`mirror/merge.go:405`](../../internal/enrich/mirror/merge.go)) | reconcile, when a field was dropped; removed only by `gen --prune` | ❌ forbid |
| `@rtType` | `/** @rtType <Name>#<id> ... */` ([`mirror/index.go`](../../internal/enrich/mirror/index.go)) | compiler, on **every live const** — structural identity | ✅ **must NOT flag** |
| `@rtIds` | `@rtIds {field: id, ...}` on the marker line | compiler, on every live const — rename tracking | ✅ **must NOT flag** |

A **clean** file (ready to commit) has **no `@todo` and no `@rtOrphan`/`@rtOrphanChild`**. `@rtType`/`@rtIds` are legitimate on every enrichment const and must never be reported.

### 7.2 Why this is a *syntactic* rule (no resolver needed)

Crucially, the dirty tags are **pure comment patterns**, and the existing Go checks do **not** detect them:

- `ts-runtypes check` ([`enrich_check.go`](../../cmd/ts-runtypes/enrich_check.go)) validates `FriendlyType`/`MockData` map **content** against the type (codes FT002/FT003/FT005/MD001) — it has **zero** references to `@todo`/`@rtOrphan`, and it *skips* orphaned consts (unresolvable `T` → `continue`).
- `gen --check` ([`enrich_gencheck.go`](../../cmd/ts-runtypes/enrich_gencheck.go)) detects breadcrumb **drift** by resolving the source (codes GE001/GE002/GE003) — not the `@rtOrphan` tag.
- `gen --prune` is the only thing that touches the tags, and it **removes** them (`PruneOrphanBlocks`, regex `(?s)/\* @rtOrphan(?:Child)? .*? \*/`); it ignores `@todo`.

So detecting the dirty tags is genuinely new work, and it is a **text-level comment scan** — no type checker, no Go binary, no resolver daemon. This makes Family B fully in-process and fast: a rule visits `Program` once and scans `context.sourceCode.getAllComments()` (or the raw text) for the patterns, reporting at each match's location.

### 7.3 Rules

- **`runtypes/no-enrichment-todo`** — reports any `@todo` scaffold line still present. Message: `"unfilled @todo placeholder — fill in the value, then delete the @todo line"`. Default severity `error`.
- **`runtypes/no-orphan-carcass`** — reports any `@rtOrphan` or `@rtOrphanChild` block. Message: `"stale @rtOrphan carcass — run \`ts-runtypes gen --prune\` to remove it (or restore the type)"`. Default severity `error`. (Optionally split into `no-orphan-const` / `no-orphan-field`. **Decide in §12.**)

Both default to `error` so commits are blocked on a dirty file, per the stated goal; users can relax to `warn` in `.oxlintrc.json`. Auto-fix: offer carcass removal only as an OXlint **suggestion** (not an auto-applied fix) since it is destructive (loses the preserved value); prefer pointing at `gen --prune`. No fix for `@todo` (needs human data).

### 7.4 File scoping — only fire on generated enrichment files

Enrichment files are regular `.ts` files in a **mirror directory** (default `runtypes/generated/`, configurable via `enrichDir` / `--enrich-dir`; see [`cmd/ts-runtypes/config.go`](../../cmd/ts-runtypes/config.go)) — **not** a `.rt.ts` extension. Two robust scoping signals, use both:

1. **Config glob** (primary gate): an OXlint `overrides` entry restricting these rules to the enrich-dir glob, e.g. `runtypes/generated/**/*.ts`.
2. **Marker guard** (defense in depth): the rule no-ops unless the file contains an `@rtType`/`@rtIds` marker (present on every real enrichment const, absent from hand-written code) — so an accidentally broad glob can't flag arbitrary source.

### 7.5 Keep tag literals in sync with Go (no drift)

The `@todo` string and the orphan regex are **defined in Go** ([`mirror/helpers.go`](../../internal/enrich/mirror/helpers.go), [`mirror/orphan.go`](../../internal/enrich/mirror/orphan.go), [`mirror/reconcile.go`](../../internal/enrich/mirror/reconcile.go)). The JS rule must not hardcode a divergent copy. Export the three patterns (todo marker, orphan/orphanChild regex, `@rtType`/`@rtIds` guard) through the **existing** Go→TS constant-sync mechanism (`gen:ts-constants` → [`cmd/gen-ts-constants`](../../cmd/gen-ts-constants) → `runtypes-constants.generated.ts`) and import them in the rule. This is a hard requirement — a drifted literal silently stops enforcing.

## 8. Family C (optional / future) — enrichment semantic validity

The FT/MD content-validity findings (`check`) and GE breadcrumb-drift findings (`gen --check`) are *also* about enrichment health but need the Go binary and are currently **CLI-only** (`enrich.Finding`, dispatched before the request loop — **not** a stdio `Op`, **not** on `protocol.Response.Diagnostics`). Surfacing them through the plugin would take one of:

- **(a)** the plugin shells `ts-runtypes check <file> --json` per enrichment file and maps the `enrich.Finding[]` JSON (`{code, severity, path, message}`) to `context.report`; or
- **(b)** add an `OpCheck` (and/or `OpGenCheck`) to the resolver protocol so the daemon serves these like Family A.

Out of scope for the initial ask (which is tag hygiene) but a natural follow-up; flagged so the plugin's rule namespace is designed with room for it (e.g. `runtypes/enrichment-field`, `runtypes/enrichment-drift`).

## 9. IDE integration

Zero bespoke editor code for either family. Once the plugin is in `jsPlugins` and the rules are enabled, the **oxc VS Code extension + `oxc_language_server`** publish our diagnostics to the Problems panel and inline squiggles live on edit; the same LSP covers Zed / JetBrains / Neovim / Helix. Family B needs no resolver, so it lights up instantly even in a lint-only install.

## 10. Commit-time enforcement

The user's explicit goal for Family B is a **clean-files-on-commit** gate. Wiring:

- **Add OXlint to the repo** (`oxlint` is not currently a dependency — the repo lints with ESLint today) and a `.oxlintrc.json` referencing the plugin, with an `overrides` block scoping Family B to the enrich-dir glob.
- **Pre-commit:** [`.husky/pre-commit`](../../.husky/pre-commit) already runs `lint-staged`. Add a `lint-staged` entry for the enrich-dir glob (e.g. `runtypes/generated/**/*.ts`) that runs `oxlint` (or a `pnpm run lint:enrich` wrapper). `oxlint` exits non-zero on `error`-severity findings, matching husky's fail semantics — a `@todo`/carcass blocks the commit.
- **CI:** run the same `oxlint` invocation in the lint job so the gate holds for pushes that bypass the hook.
- Family A (type-aware) can run in the same `oxlint` invocation for changed source files; the daemon warm-up cost is per-run.

Because Family B is pure text, a grep/Go fallback gate is trivial, but routing it through OXlint keeps **one rule set, one config** for both live-editor and commit-time — which is the point of targeting OXlint.

```jsonc
// .oxlintrc.json (consumer project)
{
  "jsPlugins": ["./node_modules/oxlint-plugin-runtypes/dist/index.js"],
  "rules": {
    "runtypes/error": "error",
    "runtypes/warn": "warn",
    "runtypes/info": "off"
  },
  "overrides": [
    {
      "files": ["runtypes/generated/**/*.ts"],
      "rules": {
        "runtypes/no-enrichment-todo": "error",
        "runtypes/no-orphan-carcass": "error"
      }
    }
  ]
}
```

## 11. Fallback / complement — our own LSP

If OXlint's JS-plugin alpha proves too immature (§13), wrap the resolver in a minimal LSP publishing `textDocument/publishDiagnostics` (Family A from `scanFiles`; Family B from the same comment scan). Editor-portable and immune to OXlint churn, at the cost of a new binary mode + per-editor config. The two paths are **not** mutually exclusive: build the `diag → {loc, message, severity}` mapping and the comment-scan detector **transport-agnostic** so an LSP sink can be added later without rework.

## 12. Open questions / decisions

1. **Package deps — DECIDED (§6.4, §6.5):** `ts-runtypes-bin` is a **peerDependency** resolved via `getExePath()` (the user's own binary); the message catalog is **reused** (shared import / `gen:diag-catalog`), never re-copied; `catalogVersion` for the alignment check comes from the catalog's source package. Remaining sub-questions: (a) import the catalog from the **core `ts-runtypes` marker package** (lockstep-versioned, always installed — leaning yes) or a small extracted catalog module, not the heavy Vite plugin; (b) get the `ResolverClient`/`ResolverSocketClient` from `runtypes-devtools` directly, or factor it into a small shared module so a lint-only install doesn't pull the Vite plugin (leaning shared module). Family B needs neither client nor binary.
2. **Scan op (Family A):** reuse `scanFiles` (diagnostics-only) or add a lean `OpDiagnostics`? Measure before adding an op.
3. **Severity mapping (Family A):** severity-tier rules (§6.3, recommended) vs concern rules.
4. **Orphan rule granularity (Family B):** one `no-orphan-carcass` vs split const/field rules.
5. **`@todo` strictness:** forbid *any* `@todo` in enrichment files, or only the exact scaffold line? (Leaning: any `@todo` token in an enrich-dir file — authors shouldn't hand-add todos there either.)
6. **File-scoping default:** enrich-dir glob is configurable per project; the plugin can't know it. Ship the marker-guard (§7.4) as the always-on gate and document the `overrides` glob as the recommended primary scope.
7. **Family C:** ship now via `check --json` shelling, later via `OpCheck`, or defer entirely?
8. **Daemon lifecycle (Family A) in the LSP loop:** one shared daemon keyed by tsconfig/cwd; eviction on config change; debounce/cache by file-text hash.

## 13. Risks

- **OXlint JS plugins are alpha** (2026-03). API/`context.report({loc})` may shift; some `sourceCode` methods are unimplemented. Mitigate by keeping the mapping/detector transport-agnostic (§11).
- **Custom *type-aware* rules inside JS plugins are unsupported** by OXlint — but Family A is **not** a type-aware rule; it shells to our own engine and only reports positions. Family B is plain syntax. Both are allowed. State this so reviewers don't conflate them.
- **Double type-checking cost (Family A only):** our binary builds its own tsgo `Program`, independent of tsgolint. Per-file + daemon-warmed in the editor, acceptable; document expected latency.
- **Tag-literal drift (Family B):** a hardcoded JS copy of the `@todo`/orphan patterns silently stops matching if Go changes them. §7.5's constant-sync is the mitigation and a hard requirement.
- **Version coupling (Family A):** wire codes + catalog + binary must be the same version. Peering the binary and reusing the version-matched catalog (§6.4) is the structural mitigation; the two-layer alignment handling (§6.5) — an eager startup version-compare warning plus a per-code `[unknown code]` fallback render — surfaces any mismatch without silently dropping a message or hard-failing the run.
- **Distribution:** ensure `ts-runtypes-bin`'s `getExePath()` resolves in a lint-only install and fails with a clear "install `ts-runtypes-bin`" message when the peer is absent (Family A). Family B needs no binary.

## 14. Milestones

1. **Spike (Family B first — no binary):** `jsPlugins` plugin with `no-enrichment-todo` + `no-orphan-carcass`, comment-scan detection, marker guard, enrich-dir `overrides`. Prove a `@todo` blocks a commit and shows live in VS Code. Fastest path to value.
2. **Constant sync:** export the tag patterns from Go via `gen:ts-constants`; import in the rule.
3. **Family A spike:** spawn `ResolverClient`, one file, prove `context.report({loc})` renders a RunTypes compiler diagnostic in VS Code.
4. **Family A mapping layer:** transport-agnostic `diag.Diagnostic → {loc, message, severity-tier}` with catalog rendering + col conversion + related formatting + the §6.5 unknown-code fallback and eager version-alignment warning.
5. **Family A daemon path:** persistent `ResolverSocketClient`, source overlay, per-run lifecycle, debounce/cache.
6. **Config + commit gate + docs:** `.oxlintrc.json` recipe, lint-staged entry, CI job, website docs.
7. **(Optional) Family C** (`check`/`gen --check` surfacing) and **(optional) LSP sink** reusing the shared layers.

## 15. Testing (PR-readiness gate)

Per [CLAUDE.md](../../CLAUDE.md):

- **Vitest** under `packages/oxlint-plugin-runtypes`:
  - *Family B:* fixture enrichment files (scaffolded-with-`@todo`, orphan carcass, clean file, and a file with legit `@rtType`/`@rtIds` only) → assert the rules fire on the dirty tags, **do not** fire on `@rtType`/`@rtIds`, and no-op outside the enrich scope. Assert reported `loc` + message.
  - *Family A:* drive the mapping with recorded resolver responses for the pure-mapping tests (col conversion, severity routing, related formatting); add one integration test that spawns `bin/ts-runtypes` on a fixture and asserts the reported `loc`/message.
  - *Version alignment (§6.5):* an **unknown-code fallback** test (feed a diagnostic whose `code` is absent from the catalog → assert it still renders `[<code>] (message unavailable …)` with the real `loc`, and is not dropped); and a **version-mismatch** test (binary version ≠ `catalogVersion` → assert the single advisory `console.warn` fires once and the run does not fail).
- **Marker coverage rule:** any test exercising the marker API must cover **both** `getRunTypeId<T>()` and `getRunTypeId(value)` shapes with a hash-equivalence assertion — applies to Family A fixtures (unsupported-type/lossy diagnostics fire from marker call sites).
- **Constant-sync guard:** a test asserting the JS-imported tag patterns match the Go-emitted literals (guards §7.5 drift).
- **Docs:** website page under [`container/website/content/`](../../container/website/content) (follow docs-style rules); note the OXlint integration in [README.md](../../README.md); update the enrichment docs to mention the hygiene gate.
- On implementation, `git mv` this file into [`docs/done/`](../done) (or [`docs/partially/`](../partially)), updated to match what shipped.

## 16. References

**Our code — Family A**
- [`internal/diag/catalog.go`](../../internal/diag/catalog.go) — `Diagnostic`/`Severity`/`Family`/`Site`/`Related`
- [`internal/textpos/textpos.go`](../../internal/textpos/textpos.go) — 1-based line/col site builder
- [`internal/protocol/protocol.go`](../../internal/protocol/protocol.go) — `Response.Diagnostics` wire
- [`internal/resolver/dispatch.go`](../../internal/resolver/dispatch.go) — diagnostics attach point
- [`packages/runtypes-devtools/src/resolver-client.ts`](../../packages/runtypes-devtools/src/resolver-client.ts) — `ResolverClient`/`ResolverSocketClient`, `scanFiles`/`setSources`
- [`packages/runtypes-devtools/src/unplugin.ts`](../../packages/runtypes-devtools/src/unplugin.ts) — `formatTscDiagnostic`/`surfaceDiagnostics`
- [`packages/runtypes-devtools/src/diagnosticCatalog.ts`](../../packages/runtypes-devtools/src/diagnosticCatalog.ts) — canonical prose + `renderHeadline`
- [`scripts/gen-diag-catalog.mjs`](../../scripts/gen-diag-catalog.mjs) + [`cmd/gen-diag-catalog`](../../cmd/gen-diag-catalog) — `gen:diag-catalog` autogenerated dictionary (reuse, don't copy)
- [`packages/runtypes-devtools/src/unplugin.ts:178`](../../packages/runtypes-devtools/src/unplugin.ts) — `getExePath()` binary resolution pattern

**Our code — Family B (enrichment)**
- [`internal/enrich/mirror/helpers.go`](../../internal/enrich/mirror/helpers.go) — `@todo` line + `@rtType`/`@rtIds` marker emit
- [`internal/enrich/mirror/orphan.go`](../../internal/enrich/mirror/orphan.go) — `@rtOrphan` emit + `PruneOrphanBlocks`
- [`internal/enrich/mirror/merge.go`](../../internal/enrich/mirror/merge.go) — `@rtOrphanChild` emit
- [`internal/enrich/mirror/reconcile.go`](../../internal/enrich/mirror/reconcile.go) — `orphanBlockPattern` regex, prune
- [`cmd/ts-runtypes/enrich_check.go`](../../cmd/ts-runtypes/enrich_check.go) — `check` (FT/MD content validity; does **not** touch the tags)
- [`cmd/ts-runtypes/enrich_gencheck.go`](../../cmd/ts-runtypes/enrich_gencheck.go) — `gen --check` (GE breadcrumb drift)
- [`cmd/ts-runtypes/config.go`](../../cmd/ts-runtypes/config.go) — `enrichDir` (default `runtypes/generated`)
- [`cmd/gen-ts-constants`](../../cmd/gen-ts-constants) — Go→TS constant sync (`gen:ts-constants`)
- [`.husky/pre-commit`](../../.husky/pre-commit) + `lint-staged` in [`package.json`](../../package.json) — commit gate

**tsgolint / OXlint (external)**
- tsgolint headless protocol: `oxc-project/tsgolint` — `cmd/tsgolint/{headless.go,payload.go,main.go}`, `internal/rule/rule.go`
- OXlint JS plugins (alpha): https://oxc.rs/docs/guide/usage/linter/js-plugins.html · https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha
- `context.report({ loc })` no-node injection: https://github.com/oxc-project/oxc/pull/16859
- Type-aware linting: https://oxc.rs/docs/guide/usage/linter/type-aware.html
- Config reference: https://oxc.rs/docs/guide/usage/linter/config-file-reference
- LSP + editors: `oxc_language_server`; VS Code `oxc.oxc-vscode`; https://oxc.rs/docs/guide/usage/linter/editors
