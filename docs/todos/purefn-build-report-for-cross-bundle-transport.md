# Pure-fn build report: expose generated pure-fn sites to the host plugin (cross-bundle transport)

**Status:** todo — design agreed with mion (the motivating consumer), ready to implement.
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
There is no supported way for a host plugin to learn, in structured form, *which pure
fns this build generated and from which call sites*, so mion cannot relocate the
mapper bodies into the **server** bundle at build time.

The transport itself is mion's job (harvest → manifest → inject into the server
build; the wire still carries only `rt::<hash>`, the server never evaluates
client-supplied code). What ts-runtypes is missing is the **reporting surface** the
harvest step consumes. Without it mion would have to regex-parse rewritten source for
`serverMapFrom(__rt_pf…, 'rt::<hash>')` (couples mion to the rewrite's text format)
or read `<genDir>/types/pf/*` module files (no call-site/callee linkage — cannot tell
a serverMapFrom mapper from any other registered pure fn). Both are brittle; the
resolver already holds every piece of the data.

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
- **HMR signal exists**: `Response.addedPureFns` flips when a pure-fn body appears or
  changes; `handleHotUpdate` already consumes it.
- **Callee identity is already computed Go-side.** The extractor resolves the callee
  declaration to find the marker-carrying signature; the nearest-`package.json`
  name walk already exists for marker gating
  ([marker.go](../../ts-go-runtypes/internal/compiler/marker/marker.go)). Reporting
  `calleeName` + `calleeModule` is serialization, not new analysis.

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
     paramNames, code,          // entry payload (emitMode-honoring)
     pureFnDependencies,        // transitive pure-fn deps (keys)
   }]
   ```

   Populate from the extractor's site records joined with the purefunctions cache.
   Mirror in the JS `protocol.ts` types.

2. **Plugin surface.** Two consumers, one data source:
   - `PluginOptions.onPureFnReport?: (sites: PureFnSite[], phase: 'build' | 'hmr') => void`
     — fired once after the buildStart whole-program scan + generate, and again with
     the delta on every `handleHotUpdate` that reports `addedPureFns`.
   - `PluginOptions.pureFnManifest?: string` — optional path; the plugin writes the
     full report as JSON there at buildStart (and rewrites on HMR deltas). This is
     the cross-build channel: a separate server build (or any non-vite consumer)
     reads the client build's manifest from disk.

3. **Tests** (FE, [packages/ts-runtypes-devtools/test/](../../packages/ts-runtypes-devtools/test/)
   + third-party fixtures under
   [packages/ts-runtypes/test/third_party/](../../packages/ts-runtypes/test/third_party/)):
   - Report covers **both lanes** (named `registerPureFn*` with `mionjs::name`-style
     keys, anonymous with `rt::<hash>`) and **both forms** (direct wrap, factory).
   - Wrapper attribution: the `@acme/toolkit` wrapper fixture asserts
     `calleeName: 'registerAcmePureFn'`, `calleeModule: '@acme/toolkit'` — including
     the wrapper-only file that names neither the primitive nor '@ts-runtypes/core'.
   - Manifest file round-trips (write → parse → keys match injected hashes).
   - HMR: editing a pure-fn body re-fires the callback with the changed site only.

4. **Docs**: ARCHITECTURE.md (pure-fn section) + the website plugin-options page, per
   the PR-readiness gate.

5. **Optional follow-up (separate decision, do NOT bundle into this change):** an
   *extract-only* lane for wrappers whose host bundle never runs the body (mion's
   client only needs the hash; today the rewrite imports the pf module into the
   client bundle — dead bytes). Likely a marker variant or wrapper-signature option;
   needs its own design pass.

## Consumer sketch (context only — lives in mion, not here)

mion's plugin: harvest via `onPureFnReport` filtered to
`calleeModule === '@mionjs/client' && calleeName === 'serverMapFrom'` → write
`.mion/server-mappers.json` (via `pureFnManifest` or its own writer) → server build
exposes a virtual module that `addPureFn`s each `{key, code, paramNames}` → router
dispatch resolves `getPureFnByKey(bodyHash)`. Wire carries only the hash; the server
executes only functions its own build baked in.

## Acceptance criteria

- A host plugin can enumerate every generated pure fn of a build with call-site file,
  callee attribution, registry key, and entry payload — without parsing rewritten
  source or generated module text.
- Zero cost when neither `onPureFnReport` nor `pureFnManifest` is set (flag-gated).
- Third-party wrapper fixtures pin the attribution fields; HMR delta covered.
