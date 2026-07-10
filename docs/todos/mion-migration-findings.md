# Findings from the mion → ts-runtypes 0.9 migration spike

**Status:** todo — evidence log. The authoritative requirements + work plan is
[`mion-adoption-requirements.md`](./mion-adoption-requirements.md); this file keeps the
detailed evidence + repro notes behind its items. None block mion (each has a mion-side
workaround on published 0.9.0).
**Created:** 2026-07-10
**Context:** first real wrapper-framework consumer (MionKit/mion branch
`claude/migrate-mion-ts-runtypes-8rvzhn`, see its `migration-docs/`). mion's
`route()`/`hook()` carry `InjectTypeFnArgs<[Params?, Return?], 'verr', 'jsonDecoder',
'jsonEncoder'>` and forward the injected handles to the public factories — the wrapper
story from `markers.ts` works end-to-end on the published packages. The zero-config
site-file transform gate (shipped alongside this note; adoption plan item A1) closed
the one hard gap; the rest are recorded here.

## 1. Cross-file wrapper call sites are not scanned inside the marker package's own program

**Symptom:** a wrapper function with a trailing `InjectTypeFnArgs` param declared in
file A, called from file B, produces **zero sites** when the program is the marker
package's own `tsconfig.test.json` (`scanFiles`/`OpTransform` over the running repo).
The identical wrapper+call in ONE file yields the site, and the identical two-file
fixture works everywhere else.

**Evidence (2026-07-10, dev binary AND published 0.9.0 binary — not a regression):**
- repo `tsconfig.test.json` program: same-file wrapper call → 1 site; cross-file → 0
  sites (real source-condition import AND ambient-overlay variants; serial scan
  `--no-parallel-scan` too; `scanFiles` batching both files too).
- tiny disk project (own tsconfig + ambient overlay): cross-file → 1 site via
  `scanFiles` AND correct injection via `--compile` (verified emitted JS).
- inline-server harness (`withInlineSources`): cross-file → 1 site.
- real consumer (mion repo, published binary, vite plugin): cross-file injection works
  end-to-end (its e2e suite is green).

So only the self-referential program shape fails (marker package sources are program
roots AND the import target). `packages/ts-runtypes-devtools/test/marker-modules.test.ts`
therefore uses a self-contained fixture project; once this is fixed the fixture could
move in-program.

**Fix plan:** reproduce in a Go test (`resolver_test` with a program whose files import
`@ts-runtypes/core` resolved into in-program source roots), instrument `analyzeCall` —
suspicion: `Checker_getResolvedSignature`/`Type_alias` loses the marker alias when the
callee's declaration file and the marker declaration resolve through the self-reference
lane. Add a regression fixture pinning wrapper-in-file-A/call-in-file-B.

## 2. Published `@ts-runtypes/core` d.ts requires Temporal types or `skipLibCheck`

`dist/formats/datetime/temporalFormats.d.ts` references the `Temporal` namespace.
A consumer on TS 5.x with `lib: es2021` and NO `skipLibCheck` fails to compile
(TS2503 ×~40). mion hit this (fixed by adding `skipLibCheck: true` to its root
tsconfig — see mion `migration-docs/04-issues-log.md` #7).

**Fix plan:** make the Temporal references self-guarding (local `type Temporal…`
fallback or `typeof globalThis.Temporal` indirection) so the root export chain never
forces the namespace on consumers, or document the `skipLibCheck`/types requirement in
the website install page.

## 3. CJS consumers under `moduleResolution: nodenext` hit TS1479 (dual-package types)

Runtime CJS is fine (`dist/cjs` + nested `{"type": "commonjs"}` package.json), but the
exports map's single `types` condition points at the ESM-scoped `dist/index.d.ts`, so a
CommonJS-format TS file importing `@ts-runtypes/core` under `nodenext` gets TS1479
("cannot be imported with require"). mion's `build:esm` (`--module NodeNext` on
CJS-format sources) hit this; worked around with `--moduleResolution node10` (see mion
`migration-docs/04-issues-log.md` #8).

**Fix plan:** emit CJS-scoped declarations (`dist/cjs/**/*.d.ts` via the cjs tsconfig,
or `.d.cts`) and split the exports `types` per condition:
`"require": {"types": "./dist/cjs/index.d.ts", "default": "./dist/cjs/index.js"}`.
Add a CJS-consumer typecheck to the pre-publish e2e matrix.

## 4. Frameworks want value-level prepareForJson / restoreFromJson

mion's wire format parses ONE JSON envelope and needs per-route value-level transforms
(deepkit-style `serialize` = typed value → JSON-safe value, `deserialize` = JSON-safe →
typed). With only string-level `createJsonEncoder`/`createJsonDecoder`, mion round-trips
through strings (`dec(JSON.stringify([params]))[0]`, `JSON.parse(enc([undefined,
ret]))[1]`) — correct but pays an extra stringify+parse per direction. The primitives
exist internally (`pj`/`rj`).

**Fix plan:** consider public `createJsonPrepare<T>()` / `createJsonRestore<T>()`
factories (new fnKeys over the existing internal families) per the "Adding a new RT
function family" checklist; decide after mion benchmarks the string round-trip cost.

## 5. Public wire-serialization helpers for cache entries (RPC metadata lane)

mion's client lane replaces deepkit's `serializedTypes` by shipping RunTypes'
OWN cache records over the wire: code-mode `CompiledFnData` is already serializable
(factory body string + `args`/`defaultParamValues` + `rtDependencies`/
`pureFnDependencies` string keys), the public registry covers both ends
(`getRTFnCaches()` to read server-side, `getRTUtils().addToRTCache`/`.addPureFn` to
ingest client-side), and materialization is the existing `new Function('utl', code)`
path. mion will hand-roll: (a) the record projection (strip `createRTFn`/`fn`),
(b) the dependency-closure walk from a set of root hashes, (c) ingest shims for the
noop short-form (family identity via `familyTag`) and `alwaysThrow` records
(rebuild the thrower from `alwaysThrowMessage`).

**Fix plan (nice-to-have):** consider public helpers formalizing (a)-(c) —
`serializeEntryGraph(rootHashes) → WirePayload` / `ingestEntryGraph(payload)` — so
RPC frameworks don't depend on the record internals staying stable; document the
constraint that the producing build must run `emitMode: 'code' | 'both'` and the
CSP note (`new Function` on ingest).

## 6. Marker docs nits surfaced by the wrapper story

- An ALIAS of a marker type (`type MyHandle<H> = InjectTypeFnArgs<…>`) is NOT
  recognised (alias-name + declaring-module match). Verified empirically; mion re-exports
  the original symbols instead. Worth one sentence in the website custom-markers/wrapper
  docs.
- A wrapper's callers used to need the wrapper's package imported BY NAME for the
  plugin's textual pre-filter — including relative-import call sites inside the
  framework itself, which NO textual heuristic can see. Resolved by the zero-config
  site-file gate (adoption plan item A1): the transform now rewrites exactly the
  files the whole-program scan found sites in, whatever the import style.
