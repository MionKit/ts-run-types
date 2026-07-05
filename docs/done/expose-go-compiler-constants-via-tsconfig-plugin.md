# Expose Go-compiler tunables through the tsconfig plugin entry

**Status: done.** The consolidation's core goal landed (tsconfig is the
canonical project-config surface, read on the build path with tsc-style
precedence); the remaining maximal extras were resolved as decisions/docs rather
than code and will not be implemented, so this record lives here in `done/`. See
**What shipped** below; the original scoping note follows it verbatim.

> **Superseded (cacheDir):** the `cacheDir` plugin key / `--cache-dir` flag
> described below were later removed by
> [cache-align-with-typescript-incremental.md](cache-align-with-typescript-incremental.md).
> The RT disk cache now follows TypeScript's `incremental` / `composite` switch
> instead of a knob of ours; the internal `RT_CACHE_DIR` env var is the only
> override. Read the mentions of `cacheDir` below as historical.

## What shipped

The build path now reads `compilerOptions.plugins[name=ts-runtypes]` and merges
it under the CLI flags with **tsc-style precedence** (an explicitly-set flag,
via `flag.Visit`, beats the tsconfig entry, which beats the built-in default):

- `cmd/ts-runtypes/config.go` — `tsRuntypesPlugin` extended with `hashLength`,
  `cacheDir`, `singleThreaded`, `parallelScan`, `parallelRender` (pointer-typed
  so an absent key differs from an explicit `false`/`0`); `resolveBuildPlugin`
  reads the entry from the build path's tsconfig.
- `cmd/ts-runtypes/buildconfig.go` — testable `mergeBuildOptions` layers
  tsconfig under explicitly-set flags; the binary now derives the
  `<cwd>/node_modules/.cache/ts-runtypes` cache default in tsconfig mode (the
  host plugin no longer injects it).
- `cmd/ts-runtypes/main.go` — wires the merge into the build path; warns on
  stderr for unknown plugin keys (`unknownPluginKeys`, known set derived from
  the struct's json tags by reflection so it can't drift).
- `packages/runtypes-devtools` — the host plugin forwards a flag ONLY when the
  user set the option explicitly, so an unset option falls through to tsconfig;
  `cacheDir:false` forwards an explicit disable.
- Docs: a new [Configuration guide](../../container/website/content/2.guide/9.configuration.md),
  a README **Configuration** section, an ARCHITECTURE "Configuration surface"
  note, and the marker note in `unplugin.ts` corrected.
- Tests: Go unit tests for the merge/precedence + unknown-key detection, and a
  default-mode integration test (`packages/runtypes-devtools/test/tsconfig-config.test.ts`)
  that drives `moduleMode` purely through tsconfig and proves flag-over-tsconfig
  precedence (both `getRunTypeId` shapes, with hash equivalence).

### Open-question resolutions

1. **Marker customisation (B / Q1):** NOT a new config surface. The scanner
   already recognises marker types by a structural brand (`matchedByBrand`),
   so a package that re-exports or vendors the markers (keeping the brand) is
   recognised automatically. A `markerModules` key would only help the fragile
   name-compatible-but-brand-incompatible case, so it was prototyped and
   reverted as redundant. Documented the brand behaviour + the embed-the-resolver
   escape hatch instead; corrected the stale note in `unplugin.ts`.
2. **Runtime serialization defaults (D / Q2):** resolved as the **documented
   recipe**, not a new emission path. The init-module path would invent a new
   global-side-effect injection mechanism for marginal benefit; the guide shows
   the one-line `setSerializationOptions({...})` startup call instead. The
   init-module emission stays a deferred option (see
   [binary-buffer-sizing.md](../todos/binary-buffer-sizing.md)).
3. **`conditions` (B):** NOT a plugin key. tsgo already honours
   `compilerOptions.customConditions` natively on the build path (program.New
   parses the full tsconfig), so a plugin-entry `conditions` would just
   duplicate it. Documented the native key.
4. **`PluginOptions` migration (Q4):** kept the project knobs on `PluginOptions`
   as per-build **overrides** (tsc-style: a forwarded flag wins) rather than
   removing/deprecating them; the host now forwards them only when set. The
   interface JSDoc points at tsconfig as the canonical surface.
5. **Unknown keys (Q5):** a lightweight **stderr warning** at build start, not
   a new `CFG0xx` diagnostic family. A structured family can graduate later.

### Not done (deliberately deferred)

- The runtime serialization init-module emission path (recipe shipped instead).
- A `markerModules` / `markerSpecs` public surface (redundant with the brand
  fallback; escape hatch documented).
- A `CFG0xx` diagnostic family for config errors (stderr warning shipped).
- No disk-fingerprint bump was needed: every newly-exposed option changes site
  detection, module grouping, or the cache location rather than a cached
  entry's body (`hashLength` / `emitMode` / `inlineMode` were already folded in).

---

The idea: make `compilerOptions.plugins[name=ts-runtypes]` in **tsconfig.json**
the single canonical config surface for every Go-compiler tunable, and shrink
the Vite plugin's `PluginOptions` down to just the Vite-host-specific knobs
(`binary` path override, `cwd` resolution). Today the Vite plugin re-implements
a parallel option surface in TypeScript — that's the wrong place. Build tools
come and go (Vite, esbuild, future webpack / rspack); tsconfig is the place
TypeScript projects already configure language-level behaviour, and the Go
binary already partially reads it.

## Today's state (the half-built picture)

The plumbing exists, but only on one half of the binary:

- [`cmd/ts-runtypes/config.go`](../../cmd/ts-runtypes/config.go) ALREADY
  defines `tsRuntypesPlugin` (lines 42–51) and decodes `enrichDir`,
  `moduleMode`, `emitMode`, `inlineMode` from
  `compilerOptions.plugins[name=ts-runtypes]`. The struct comment explicitly
  flags this: *"The remaining plugin options are read and stored for
  completeness (and future use) but are not acted on by gen yet."*
- The reader is called **only from the enrichment subcommands**
  ([`enrich_cli.go`](../../cmd/ts-runtypes/enrich_cli.go),
  [`enrich_gencheck.go`](../../cmd/ts-runtypes/enrich_gencheck.go),
  [`enrich_reconcile.go`](../../cmd/ts-runtypes/enrich_reconcile.go)) via
  `resolveEnrichConfig`. The **build path** in
  [`cmd/ts-runtypes/main.go`](../../cmd/ts-runtypes/main.go) — the one the
  Vite plugin actually invokes for scan/dump — never opens the tsconfig
  plugin entry; it takes everything from CLI flags the Vite plugin
  constructs.
- The Vite plugin's `PluginOptions`
  ([`packages/vite-plugin-runtypes/src/index.ts`](../../packages/vite-plugin-runtypes/src/index.ts))
  re-declares `emitMode`, `moduleMode`, `inlineMode`, `cacheDir`,
  `parallelScan`, `parallelRender`, `tsconfig`, `cwd`, `binary`. None of
  them are looked up in tsconfig; the user configures the same knob in two
  places, with no precedence story.

So the architecture is already split-brain. The fix is to consolidate, not to
add a third config surface.

## Target architecture

One canonical config surface, layered by precedence:

1. **CLI flags** (the binary's `--module-mode` etc., used by tests and
   debugging). Highest precedence. Never deprecate — they remain the
   in-process plumbing the Vite plugin / esbuild plugin / future hosts use
   to forward effective config to the binary.
2. **`tsconfig.json` → `compilerOptions.plugins[name=ts-runtypes]`.** The
   user-facing canonical surface for everything that is a *project*
   property: `moduleMode`, `emitMode`, `inlineMode`, `cacheDir`,
   `hashLength`, `parallelScan` / `parallelRender`, `singleThreaded`,
   `enrichDir` (already), marker specs (if exposed), runtime
   serialization defaults (if exposed), `conditions` (already on
   `program.Options`).
3. **Host-plugin options** (`PluginOptions` in
   `vite-plugin-runtypes`; whatever equivalent in a future esbuild plugin).
   Narrow surface: ONLY the things that are properties of the *host*, not
   the *project* — e.g. `binary` (path to a custom resolver build, useful
   in dev), `cwd` (Vite root override when it diverges from tsconfig dir).
   These DO NOT exist in tsconfig because they're build-tool specific.
4. **Built-in defaults** baked into the binary. Lowest precedence.

The Go binary already implements (1) and (4); (2) is implemented for the
enrichment path only and needs to extend into the build path; (3) needs to
shrink to only what's host-specific.

## Why this is worth doing

- **One config place.** Users today must know that `emitMode` goes in
  vite.config.ts AND that `enrichDir` goes in tsconfig.json. Same knob,
  two homes, no precedence rule. Collapsing to tsconfig (with a documented
  precedence chain) ends that.
- **Cross-host portability.** When we eventually ship an esbuild / rspack
  / webpack plugin, it inherits the config surface for free. The host
  plugin just translates "find the tsconfig, hand its path to the
  binary" — the binary does the rest.
- **Editor / language-service alignment.** A future RunTypes language
  service (or a forked tsserver plugin) can read the same entry. Putting
  the config anywhere else means writing a second reader.
- **Internal constants stay internal.** The Go side already separates
  "user-facing tunable" from "wire-format constant"; the tsconfig entry
  is the right place to draw that line VISIBLY, so the reader stops on
  the public ones and the wire-format ones never need a CLI flag.

## What to inventory (the sweep)

The list below is the seed — the agent's first job is to harden it by reading
the four anchor files
([`internal/constants/constants.go`](../../internal/constants/constants.go),
[`internal/cachegen/hashid/hashid.go`](../../internal/cachegen/hashid/hashid.go),
[`internal/compiler/resolver/resolver.go`](../../internal/compiler/resolver/resolver.go),
[`cmd/ts-runtypes/main.go`](../../cmd/ts-runtypes/main.go)) plus the runtime
options in
[`packages/ts-runtypes/src/runtypes/dataView.ts`](../../packages/ts-runtypes/src/runtypes/dataView.ts)
and looking for tunables this list misses.

### A. CLI flags the build path accepts but tsconfig does not yet expose

Source: [`cmd/ts-runtypes/main.go`](../../cmd/ts-runtypes/main.go).

- `--hash-length` → `resolver.Options.HashLength` (default
  `hashid.DefaultLength = 7`). Folded into the disk fingerprint
  ([`internal/cachegen/diskcache/fingerprint.go`](../../internal/cachegen/diskcache/fingerprint.go))
  so changing it never collides with the existing cache. Surface as
  `hashLength?: number` on the tsconfig entry.
- `--single-threaded` → `resolver.Options.SingleThreaded`. Currently exposed
  via the Vite plugin's `parallelScan` / `parallelRender` halves; the whole-
  process serial switch lives only as a CLI flag. Decide whether to expose
  `singleThreaded?: boolean` on the tsconfig entry (collapses both fan-out
  paths) or to keep it CLI-only (it's mostly for debugging).
- `--cache-dir` → `resolver.Options.CacheDir`. Today the Vite plugin
  re-derives this in JS; move the canonical knob to tsconfig.
- `--inline-server` / `--inline-sources-stdin` / `--socket` / `--out-json` /
  `--out-modules` / `--pprof-cpu` / `--pprof-heap` — host / debugging
  flags. NOT user-facing; explicitly out of scope.
- `--daemon` / `--one-shot` — implied by the host's process model; don't
  expose.

### B. `resolver.Options` fields with neither a CLI flag nor a tsconfig key

Source: [`internal/compiler/resolver/resolver.go`](../../internal/compiler/resolver/resolver.go).

- `Marker marker.Options` — selects which type alias the scanner treats as
  the id-injection sentinel. Zero values default to `InjectRunTypeId` from
  `ts-runtypes`. Decide whether to expose `markerSpecs?: Array<{name,
  module}>` on the tsconfig entry, letting users register custom marker
  types without embedding the Go binary. The plugin source today says "to
  use a custom marker, embed the Go resolver directly"
  ([packages/vite-plugin-runtypes/src/index.ts:83](../../packages/vite-plugin-runtypes/src/index.ts#L83))
  — answering this question retires that note.
- `program.Options.Conditions` — package-export resolution conditions
  ([`internal/compiler/program/program.go`](../../internal/compiler/program/program.go)). The
  enrichment CLI hard-codes `["source"]`; the resolver pipeline ignores
  user-supplied conditions today. Decide whether the tsconfig entry
  exposes `conditions?: string[]` so consumers can pick `worker` /
  `browser` / custom conditions without editing the rest of tsconfig.

### C. Internal constants that decide cache / id / wire shape

Source: [`internal/constants/constants.go`](../../internal/constants/constants.go),
[`internal/cachegen/hashid/hashid.go`](../../internal/cachegen/hashid/hashid.go).

These deliberately ride the disk fingerprint OR the typeID hash OR the wire
identifiers — changing them without isolating caches is unsafe. Each one
needs a "is this really configurable, or is it baked into the wire format?"
call. The tsconfig entry is the right surface for the safe ones; the rest
are reference-only.

- `hashid.DefaultLength = 7` — already CLI-configurable as `--hash-length`;
  expose on tsconfig too (see A).
- `hashid.hashIncrement = 2`, `hashid.MaxCollisions = 22` — collision-extend
  policy. NOT user-configurable: changing either shifts every id in the
  cache and breaks reproducibility across consumer machines. Document as
  "baked, don't touch."
- `constants.CacheModules` — the registry of every emitted cache-module
  shape. Internal — never expose.
- `constants.jsonCompositeTags` — per-strategy tag suffix. Wire-format
  identifier; never expose.
- `constants.ValidateOptions` (the `noLiterals` / `noIsArrayCheck`
  registry). These are CALL-SITE options on `createValidate<T>()`, NOT
  project-wide knobs — they ride the variant suffix. Project-wide
  defaults probably don't make sense; revisit only if a real use case
  appears.
- `constants.JsonStrategyFamilies` — the `direct` / `clone` / `mutate` /
  `strip` / `preserve` strategy map. Already exposed through call-site
  `JsonStrategy<'…'>` options. Project-wide default? Probably not (each
  encoder picks its own); but document the strategy set somewhere
  user-readable.
- `constants.VirtualModulePrefix`, `EntryModuleSuffix`,
  `EntryBindingPrefix`, `PureFnModuleDir`, `RunTypesBundleBasename`,
  `FnsBundleDir`. Wire identifiers Vite + the runtime tuple decoder
  depend on; NEVER expose.
- `constants.TupleKindRunType` / `TupleKindPureFn` / `TupleKindMissing` /
  `TupleKindRunTypeBundle` / `TupleKindRunTypeFacade` — tuple slot-0
  discriminators. Internal protocol; never expose.

### D. Runtime constants in the marker package

Source:
[`packages/ts-runtypes/src/runtypes/dataView.ts`](../../packages/ts-runtypes/src/runtypes/dataView.ts)
(`SerializationOptions` + `DEFAULTS`).

These are runtime knobs the encoder/decoder consults at execution time. They
have a `patchSerializationOptions` escape hatch already but no compile-time
config story. Decide whether the tsconfig entry exposes them under a nested
`runtime?: { … }` block; the binary would emit a tiny `__rt_serializationDefaults`
init module that calls `patchSerializationOptions` once on first import:

- `defaultBufferSize` (default `2 ** 14` = 16 KiB cold-start fallback; the
  `dynamic` strategy normally seeds from the per-type compile-time estimate
  instead). Lowered from 16 MiB in
  [binary-encoder-sizing-redesign.md](binary-encoder-sizing-redesign.md);
  surfacing it on the tsconfig entry makes that change actionable without
  a runtime patch call.
- `sizeMultiplier` (default 2, "k sigma of headroom"). Same story.
- `maxStrCacheLength` (default 64). Threshold for string-bytes caching.
- `maxCacheSize` (default 1000). Half-LRU eviction trigger.

These are NOT in the disk fingerprint today (they're runtime-only) so they
need a separate emission path — likely the tiny generated init module
mentioned above, injected only when any of them is non-default.

### E. Disk-fingerprint inputs

Source:
[`internal/cachegen/diskcache/fingerprint.go`](../../internal/cachegen/diskcache/fingerprint.go).

`FingerprintInputs` covers `HashLength`, `EmitMode`, `InlineMode` today
(tag v4). Anything NEW that lands on the tsconfig entry AND changes Go-side
output MUST be folded in — otherwise stale cache entries from a previous
config load. The sweep needs to verify each newly-exposed option for this.

## Work to do, in order

1. **Wire the existing reader into the build path.** Today
   `findTsRuntypesPlugin` is called only by enrichment subcommands. Add a
   call from `main.go`'s build path (one-shot / daemon / inline-server) so
   the resolver picks up `moduleMode` / `emitMode` / `inlineMode` /
   `enrichDir` from tsconfig BEFORE applying CLI overrides. The reader
   already exists; this is a few lines of glue plus a precedence rule:
   CLI flag wins over tsconfig wins over default.
2. **Extend `tsRuntypesPlugin` with the rest of the inventory.** Add
   `hashLength`, `cacheDir`, `singleThreaded`, `parallelScan`,
   `parallelRender`, and (per the decisions in B/D) `markerSpecs`,
   `conditions`, `runtime` nested block.
3. **Shrink `PluginOptions` in
   [`packages/vite-plugin-runtypes/src/index.ts`](../../packages/vite-plugin-runtypes/src/index.ts).**
   Keep ONLY: `binary`, `cwd`, `tsconfig` (the path), maybe `cacheDir` as
   an explicit override knob for test isolation. Remove `emitMode`,
   `moduleMode`, `inlineMode`, `parallelScan`, `parallelRender` — let
   them flow through tsconfig. Deprecate gradually if needed (a one-cycle
   warning) so we don't break consumers on the same release.
4. **Fingerprint propagation.** For each newly-exposed option that
   perturbs Go output, add to `FingerprintInputs` (tag bump v5 or later).
5. **Runtime defaults.** For (D), decide between the init-module path and
   a documented `patchSerializationOptions` recipe; if the former, wire
   it through the entry-module assembler.

## What the website docs need

The website docs ([container/website/content/](../../container/website/content/))
do NOT mention `PluginOptions` OR the tsconfig plugin entry today. Both
gaps need closing as part of the same pass — but with the consolidation
above, there's only ONE config page to write, not two.

Proposed structure (subject to bikeshedding):

- A new page under `container/website/content/2.guide/` —
  `8.configuration.md` or similar. Voice: plain, user-focused (see the
  docs-style rules in
  [CLAUDE.md](../../CLAUDE.md#website-docs-style-container/websitecontent)).
  No deep internals; show ONE `tsconfig.json` example with every option,
  one fenced code block per option with the default and a one-paragraph
  "when to change it" note. NO em-dashes; short frontmatter description.
- The page should explicitly call out the precedence chain (CLI > tsconfig
  > defaults) and the small host-plugin surface (Vite-only knobs).
- Cross-link from `container/website/content/2.guide/3.serialization.md`
  (where binary / JSON strategies are introduced) and from
  `container/website/content/2.guide/5.validation.md` (where
  `ValidateOptions` is introduced) to the new page.
- Mention the "embed the Go binary directly" escape hatch only at the
  bottom, in a note callout — real, but secondary.

## Open questions (decide before designing)

1. **Marker customisation: public surface or escape hatch?** Today the
   plugin says "to use a custom marker, embed the Go resolver directly."
   If we expose `markerSpecs?: Array<{name, module}>` on the tsconfig
   entry, we're promising it as a contract. Worth it? Or do we keep the
   escape-hatch story and document it better?
2. **Should the runtime knobs (D) live under a nested `runtime?: { … }`**
   on the tsconfig entry, or surface them flat? Nested is cleaner; flat
   is easier to migrate from existing `patchSerializationOptions`
   snippets.
3. **Per-package tsconfigs in a monorepo.** With multiple tsconfigs (one
   per workspace package), each with its own ts-runtypes plugin entry,
   the on-disk cache namespaces correctly (fingerprint folds the relevant
   options in), but the **typeIDs at runtime** diverge if `hashLength` is
   different — a `User` from package A and a `User` from package B will
   not share a cache key. Document the gotcha even if we don't change
   the behaviour.
4. **`PluginOptions` deprecation cadence.** Do we ship one release that
   accepts BOTH `emitMode` on `PluginOptions` (with a warning) and on
   tsconfig, then drop the `PluginOptions` form a release later? Or do
   we cut it in one move and document the migration? Either is fine; the
   warning path is friendlier.
5. **Validation severity for unknown keys** on the tsconfig plugin entry.
   Today unknown keys are silently ignored
   ([config.go:217](../../cmd/ts-runtypes/config.go#L217)). Should we add
   a build-time warning (a new diagnostic family, e.g. `CFG0xx`)?

## Sketched approach

1. **Inventory pass.** Read-only walk of the five anchor files plus
   `internal/diag/*`; produce a table tagging each constant `expose-tsconfig` /
   `host-plugin-only` / `keep-internal` / `decide-later`. Output: a short
   table in this file, not in code.
2. **Reader extension.** Add the new fields to `tsRuntypesPlugin` +
   `enrichConfig`; promote `enrichConfig` (or introduce a sibling
   `buildConfig`) for the build path so the main resolver options pick
   them up.
3. **Build-path wiring.** Call the reader in `main.go` once at startup,
   layer the CLI flags over it, hand the merged options to
   `resolver.NewServer` / `resolver.New`.
4. **`PluginOptions` shrink.** Edit
   [`packages/vite-plugin-runtypes/src/index.ts`](../../packages/vite-plugin-runtypes/src/index.ts);
   one release with a deprecation warning, then drop.
5. **Fingerprint propagation.** Update `FingerprintInputs`; tag bump.
6. **Runtime defaults.** Either an init module emit path or a docs recipe;
   decide per open question (2).
7. **Website docs.** Write the new guide page; cross-link.

## Documentation impact (when this lands)

- `container/website/content/2.guide/` — new configuration page covering
  the canonical tsconfig surface, the small Vite host-plugin surface, and
  the precedence chain. Voice rules apply (plain language, no em-dashes,
  short frontmatter — see
  [CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container/websitecontent)).
- `README.md` — quick-start example shows the tsconfig plugin entry, not
  a verbose `runtypes({ … })` block.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — if any newly-exposed
  option changes execution semantics (e.g. marker customisation), the
  rationale belongs here.
- JSDoc on the shrunken `PluginOptions` in
  [`packages/vite-plugin-runtypes/src/index.ts`](../../packages/vite-plugin-runtypes/src/index.ts)
  — every removed field needs a deprecation note pointing at the tsconfig
  entry, for the migration window.
- The diagnostic catalog page (see
  [document-compiler-diagnostic-catalog.md](document-compiler-diagnostic-catalog.md))
  needs entries for any new `CFG0xx` codes once question (5) is decided.

## Not in scope here

- Building a separate `runtypes.config.ts` file format. The tsconfig
  entry IS the config surface; a third format is the problem this todo
  exists to fix, not the solution.
- Per-call-site overrides for things that ALREADY have per-call-site
  shape (e.g. `ValidateOptions` on `createValidate`). The tsconfig entry
  is for whole-project defaults, not per-call configuration.
- Adding new tunables that don't exist in the Go binary today. This todo
  is about EXPOSING existing knobs, not inventing new ones.
- Documenting compiler diagnostics — that's its own todo, see
  [document-compiler-diagnostic-catalog.md](document-compiler-diagnostic-catalog.md).
