# Pure-fn build report: expose generated pure-fn sites to host tooling (cross-bundle transport)

**Status:** DONE — shipped as designed. The report is gated by the `pureFnReport`
project option (plugin / tsconfig / `--pure-fn-report[-file|-path]` CLI flags) and
the SHARED unplugin `onPureFnReport(sites, phase)` callback; the resolver writes
`<genDir>/types/pure-fns-report.json` on generate and populates `Response.pureFnSites` on
generate (whole program) + scanFiles (delta). See the ARCHITECTURE.md pure-fn
section ("Pure-fn build report") and the website configuration page. Tests:
`ts-go-runtypes/internal/cachegen/purefunctions/report_test.go`,
`ts-go-runtypes/internal/compiler/resolver/pure_fn_report_test.go`,
`packages/ts-runtypes-devtools/test/pure-fn-report.test.ts`,
`packages/ts-runtypes/test/third_party/third-party-pure-fn-report.test.ts`.
**Created:** 2026-07-19

## Motivation

mion's `serverMapFrom(subRequest, mapper)` is a client-orchestration primitive (the
GraphQL-alternative story): the developer declares a mapper **inline in client flow
code**, but the function **executes on the server** (it maps one route's output into
another route's input inside a routesFlow). Client and server are two builds of one
codebase, compiled together and deployed together.

The 0.10.0 anonymous pure-fn lane (`registerAnonymousPureFn` +
`PureFunction<F>`/`InjectPureFnHash<F>`, wrappable — see
[third-party-anonymous-pure-fns.test.ts](../../packages/ts-runtypes/test/third_party/third-party-anonymous-pure-fns.test.ts),
which names a mion-style proxy as the motivating case) gives mion the **extraction**
half for free: at a `serverMapFrom` call site the plugin rewrites the mapper argument
to the generated `__rt_pf…` entry binding and injects the content hash `'rt::<hash>'`.
But registration lands only in **the bundle that builds the call site** (the client).
There is no supported way for host tooling to learn, in structured form, *which pure
fns this build generated and from which call sites*, so mion cannot relocate the
mapper bodies into the **server** bundle at build time.

The transport itself is mion's job (harvest → manifest → inject into the server
build; the wire still carries only `rt::<hash>`, the server never evaluates
client-supplied code). What ts-runtypes is missing is the **reporting surface** the
harvest step consumes. Without it mion would have to regex-parse rewritten source for
`serverMapFrom(__rt_pf…, 'rt::<hash>')` (couples mion to the rewrite's text format)
or read `<genDir>/types/pf/*` module files (no call-site/callee linkage — cannot tell
a serverMapFrom mapper from any other registered pure fn; and in `allSingle` module
mode there are no per-entry pf files at all). Both are brittle; the resolver already
holds every piece of the data.

**Scope guard:** ts-runtypes provides the REPORT only. What consumers do with it
(relocating bodies, trimming the emitting bundle, manifest formats) is their
responsibility, not this package's.

## Verified current state (2026-07-19)

- **Call-site linkage exists on the wire but is anonymous.** The pure-fn extractor
  emits one `Replacement{file, start, end, text, importFrom}` per accepted registrar
  call ([protocol.go:698](../../ts-go-runtypes/internal/protocol/protocol.go), JS
  mirror [protocol.ts](../../packages/ts-runtypes-devtools/src/protocol.ts)): `text`
  is the `__rt_pf…` binding, `importFrom` the `rtmod:/pf/…` specifier. Nothing says
  **which callee** the site invoked (`serverMapFrom` vs `registerAnonymousPureFn` vs
  any other wrapper) or which package declared it.
- **Entry payload exists only as rendered JS.** `purefunctions.CollectEntries`
  ([module.go](../../ts-go-runtypes/internal/cachegen/purefunctions/module.go)) holds
  the structured entry (key, `paramNames`, `code`, `pureFnDependencies`, emitMode
  gating), but the response ships it only as rendered ES-module text
  (`entryModules` / files under `<genDir>/types/`) — machine-hostile for a harvester.
- **Module layout varies by `moduleMode`.** Per-entry `pf/<ns>/<fn>` modules in
  `default`/`allModules`; ONE `pf` bundle in `allSingle` (`Site.Module` already
  models this for fn entries). Any file-based report must be layout-independent.
- **HMR signal exists**: `Response.addedPureFns` flips when a pure-fn body appears or
  changes; the vite adapter's `handleHotUpdate` already consumes it.
- **Callee identity is already computed Go-side.** The extractor resolves the callee
  declaration to find the marker-carrying signature; the nearest-`package.json`
  name walk already exists for marker gating
  ([marker.go](../../ts-go-runtypes/internal/compiler/marker/marker.go)). Reporting
  `calleeName` + `calleeModule` is serialization, not new analysis.
- **Two consumption lanes exist and both must be served**: the unplugin-based
  bundler plugin (vite/rollup/rolldown/esbuild/rspack/webpack adapters over ONE
  [unplugin.ts](../../packages/ts-runtypes-devtools/src/unplugin.ts) factory) and
  the CLI batch lane (`--compile`,
  [batchcompile](../../ts-go-runtypes/internal/compiler/batchcompile/)). A
  vite-only hook would leave every other adapter and the CLI without the feature.

## Fix plan

1. **Go protocol — structured pure-fn site report.** New response section (gated by a
   request flag, e.g. `includePureFnReport`, so the normal rewrite pipeline pays
   nothing):

   ```
   pureFnSites: [{
     file, start, end,          // call-site span (byte offsets, as Replacement)
     key,                       // registry key: "rt::<hash>" | "<ns>::<name>"
     calleeName,                // e.g. "serverMapFrom", "registerAcmePureFn"
     calleeModule,              // nearest package.json name of the declaring file
     lane,                      // "named" | "anonymous"
     form,                      // "direct" | "factory" (wrapped vs as-is)
     module,                    // basename of the generated module the entry rides
                                //   in (per-entry pf/<ns>/<fn>, or the single pf
                                //   bundle in allSingle — mirrors Site.Module)
     paramNames, code,          // entry payload (emitMode-honoring)
     pureFnDependencies,        // transitive pure-fn deps (keys)
   }]
   ```

   Populate from the extractor's site records joined with the purefunctions cache.
   Mirror in the JS `protocol.ts` types. The report is **self-contained** (`code` +
   `paramNames` inline) precisely so consumers never read generated module files —
   that is what makes it stable across every `moduleMode`.

2. **Primary delivery: resolver-emitted JSON file, written with the generated
   modules.** When enabled, the `generate` op writes the full report as ONE JSON
   file alongside the pure-fn cache output (exact placement decided at
   implementation: `<genDir>/pure-fns-report.json` next to `types/`, or inside
   `types/` with a name that can never collide with a module basename). Constraints:
   - MUST be excluded from the `generated` module manifest and never resolvable as
     an `rtmod:/` specifier (it is data, not a module).
   - Layout-independent by construction (self-contained records, `module` field for
     consumers that do want the linkage) — one report shape regardless of
     `moduleMode` per-entry vs `allSingle` bundling.
   - Rewritten whenever generate runs (including watch-mode re-generates), so a
     separate build (mion's server pass), a non-JS host, or the CLI batch lane
     (`--compile`) reads it from disk with zero in-process coupling.
   - Enablement follows the option-parity direction
     ([option-parity-tsconfig-plugin.md](option-parity-tsconfig-plugin.md)): one
     project-semantic option settable in BOTH the tsconfig entry and the bundler
     plugin (+ CLI flag), e.g. `pureFnReport: true | '<path>'`.

3. **Secondary delivery: unplugin-level callback for in-process consumers.** On the
   SHARED unplugin factory ([unplugin.ts](../../packages/ts-runtypes-devtools/src/unplugin.ts))
   — NOT a vite-only hook — so every adapter (vite/rollup/rolldown/esbuild/rspack/
   webpack) gets it identically:
   `onPureFnReport?: (sites: PureFnSite[], phase: 'build' | 'update') => void`,
   fired from universal hooks: once after the buildStart whole-program scan +
   generate, and again with the delta wherever the adapter learns of file changes
   (vite `handleHotUpdate` via `addedPureFns`; watch-mode rebuilds elsewhere). The
   callback receives the same records as the JSON file — one data source, two
   delivery channels.

4. **Tests** (FE, [packages/ts-runtypes-devtools/test/](../../packages/ts-runtypes-devtools/test/)
   + third-party fixtures under
   [packages/ts-runtypes/test/third_party/](../../packages/ts-runtypes/test/third_party/)):
   - Report covers **both lanes** (named `registerPureFn*` with `ns::name`-style
     keys, anonymous with `rt::<hash>`) and **both forms** (direct wrap, factory).
   - Wrapper attribution: the `@acme/toolkit` wrapper fixture asserts
     `calleeName: 'registerAcmePureFn'`, `calleeModule: '@acme/toolkit'` — including
     the wrapper-only file that names neither the primitive nor '@ts-runtypes/core'.
   - JSON file round-trips (write → parse → keys match injected hashes) under BOTH
     `moduleMode: 'default'` (per-entry pf modules) and `'allSingle'` (one pf
     bundle) — identical report shape, correct `module` field in each.
   - Report file never collides with module output nor appears in the module
     manifest.
   - Non-vite adapter coverage: at least one rollup-driven test consumes
     `onPureFnReport` (the fixtures already drive the rollup adapter).
   - Update lane: editing a pure-fn body re-fires the callback with the changed
     site only, and the JSON file is rewritten.

5. **Docs**: ARCHITECTURE.md (pure-fn section) + the website plugin-options page, per
   the PR-readiness gate.

Out of scope here (consumer-side, deliberately NOT ts-runtypes work): relocating
bodies between bundles, manifest formats beyond this report, and trimming the
emitting bundle's unused pure-fn modules.

## Consumer sketch (context only — lives in mion, not here)

mion's plugin: read the report (callback under vite, or the JSON file from the
client build's genDir) filtered to
`calleeModule === '@mionjs/client' && calleeName === 'serverMapFrom'` → write its
own `.mion/server-mappers.json` → server build exposes a virtual module that
`addPureFn`s each `{key, code, paramNames}` → router dispatch resolves
`getPureFnByKey(bodyHash)`. Wire carries only the hash; the server executes only
functions its own build baked in.

## Acceptance criteria

- Host tooling can enumerate every generated pure fn of a build with call-site file,
  callee attribution, registry key, and entry payload — without parsing rewritten
  source or generated module text.
- Works on EVERY consumption lane: any unplugin adapter (callback) AND plugin-free /
  CLI-batch / separate-process consumers (the JSON file).
- Report shape is identical across `moduleMode` settings; per-record `module` field
  carries the actual layout.
- Zero cost when the option is off (flag-gated end to end).
- Third-party wrapper fixtures pin the attribution fields; update lane covered.
