# mion adoption — full upstream requirements plan

**Status:** todo — umbrella tracker for everything ts-runtypes still needs so mion can
ship 0.9 on `@ts-runtypes/*` with no workarounds. Evidence for each gap lives in
[`mion-migration-findings.md`](./mion-migration-findings.md); this doc is the
requirements + work plan.
**Created:** 2026-07-10
**Context:** the mion migration spike (MionKit/mion branch
`claude/migrate-mion-ts-runtypes-8rvzhn`, `migration-docs/` there) proved the core
integration end-to-end on published 0.9.0: `route()`/`hook()` carry one trailing
`InjectTypeFnArgs<[Params?, Return?], 'verr', 'jsonDecoder', 'jsonEncoder'>` marker,
forward the injected handles to the public factories, and a basic route dispatches with
validation + Date revival + response serialization (its vitest e2e is green). Everything
below is ordered by what mion needs next, each item with current state → work →
acceptance.

The mion-side consumers of these items are tracked in mion `migration-docs/03`
(phase 6): client metadata lane, bun lane, header coercion, jest/tsc packages,
publishing mion's own precompiled internal routes.

---

## Workstream A — wrapper-framework support (the `route()` foundation)

### A1. `markerModules` plugin option — DONE on this branch
Shipped in this PR: `PluginOptions.markerModules` + regression test
(`packages/ts-runtypes-devtools/test/marker-modules.test.ts`) + website/ARCHITECTURE
docs. mion's `@mionkit/devtools` already forwards it and drops its gate shim on the
first release that includes it. **Remaining: none (release it).**

### A2. Pin mion's exact marker shape in the fixture suite
- **Current:** the wrapper story is regression-tested for a single-family wrapper with
  `Parameters<H>`. mion's production shape is stronger — every `route()`/`hook()`
  carries:

  ```ts
  type MionParams<H>     = H extends (ctx: any, ...rest: infer P) => any ? P : never;
  type MionReturn<H>     = Awaited<ReturnType<H>>;
  type MionRouteTypes<H> =
    IsAnyOrUnknown<MionReturn<H>> extends true ? [MionParams<H>?, MionReturn<H>?]
    : [MionReturn<H>] extends [void | undefined] ? [MionParams<H>?]   // return slot DROPPED
    : [MionParams<H>?, MionReturn<H>?];

  id?: InjectTypeFnArgs<MionRouteTypes<H>, 'verr', 'jsonDecoder', 'jsonEncoder'>
  ```

  Its integration rests on THREE behaviours that are correct today but pinned by
  nothing in this repo (only by mion's own downstream e2e). All three can regress
  through upstream-only events — a tsgo submodule bump (conditional/`infer`/`Awaited`
  eagerness), a scanner change (multi-key handling, free-type-param gate), or a `verr`
  emitter arm change — and two of the three fail SILENTLY:
  1. **3-key injection array order.** The injected value is an array of handles in
     declaration order; mion destructures positionally and forwards each to its
     factory. Factories don't verify the handle's family — a reordered array would
     validate with the encoder and encode with the validator, with no error anywhere.
     No fixture today uses more than 2 keys, and the one 2-key consumer
     (`createStandardSchema`) resolves internally rather than via public forwarding.
  2. **Conditional-T resolution at inferred-H call sites.** `H` inferred from an
     arrow literal, then `ReturnType`/`Awaited`, the non-distributive
     `[R] extends [void|undefined]` bracket form and the `unknown extends R`
     any-guard, resolving to a concrete tuple-with-optional-members. The ingredients
     are covered separately (ROADMAP's `Parameters<>`, F17's inferred wrappers);
     the composed form is not. Failure modes: MKR003 at every mion call site, or a
     different resolved shape demanding the wrong cache entry.
  3. **Tuple-arity verdicts — the `hasReturnData` probe.** mion detects void handlers
     at runtime with `verr([undefined, undefined]).length === 0`, leaning on two
     emitter behaviours (visible in the emitted validator:
     `if (!Array.isArray(v) || v.length > 2) {nRT(…)} else {if (v[0] !== undefined)
     {…}}`): a 1-tuple validator REJECTS a length-2 input (`v.length > 1`), and a
     pair validator ACCEPTS `[undefined, undefined]` (optional slots skip on
     undefined). Relaxing extra-member rejection or tightening optional-slot
     undefined acceptance flips `canReturnData` for every mion route at registration,
     silently. The codec twins ride along: `enc([undefined, ret])` must emit
     `[null,<R>]` (absent optional slot → JSON null) and `dec('[[…]]')[0]` must
     revive params.
  Note (2026-07-10, verified): the conditional itself is OPTIONAL — a plain
  `[MionParams<H>?, MionReturn<H>?]` compiles and validates params-only even for
  void returns (`[P?, void?]` is fine); its only job is the void signal feeding
  `hasReturnData` (without it the probe passes for void routes too). The slots
  being OPTIONAL is the load-bearing part (a required pair's emitted validator
  checks slot 1 unconditionally). A2 pins whichever alias mion ships; A5
  supersedes the whole pattern.
- **Work:**
  - Go resolver test: a wrapper fixture with the verbatim `MionRouteTypes`
    conditional and three consumer call sites (value-returning, `void`,
    `async (): Promise<Date>`); assert one site each, `FnIds` length 3 in declaration
    order, demand rows for all three families, and distinct resolved ids for the
    1-tuple (void) vs pair shapes.
  - devtools e2e (self-contained fixture project like `marker-modules.test.ts` until
    A3 lets it move in-program): after transform, forward each injected element to
    its factory and assert per-slot behaviour (errors array / revived Date / encoded
    string — misordering fails loudly); assert the probe verdicts on both shapes;
    assert `[null, …]` optional-slot encoding + decode revival; assert the wrapper's
    own forwarded 3-key call stays an untouched pass-through (no MKR003).
- **Acceptance:** any upstream change breaking injection order, the conditional
  resolution, the arity/optional-slot verdicts, or multi-key pass-through fails this
  repo's CI instead of surfacing as a silent mion misbehaviour downstream — same
  philosophy as the noop-predicate corpus.

### A3. Cross-file wrapper sites are not scanned in self-referential programs
- **Current:** wrapper declared in file A, called from file B → 0 sites when the
  program roots include the marker package's own sources (this repo's
  `tsconfig.test.json`). Same fixture works in every consumer-shaped program, via
  `--compile`, and in the inline server. Both dev and published binaries affected —
  a long-standing edge, not a regression (evidence: findings §1).
- **Work:** Go repro fixture; instrument `analyzeCall` (`resolver/scan.go`) —
  suspicion is `Checker_getResolvedSignature`/`Type_alias` dropping the marker alias
  when the callee declaration + marker declaration resolve through the self-reference
  lane. Fix; move the marker-modules test fixture in-program afterwards.
- **Acceptance:** `scanFiles(['B'])` yields the site with the wrapper in A inside the
  marker package's own test program; monorepo consumers that source-link
  `@ts-runtypes/core` (pnpm workspace `source` condition) can't hit it either.

### A4. Marker-alias ergonomics + wrapper docs page
- **Current:** an alias (`type RouteHandle<H> = InjectTypeFnArgs<…>`) is silently NOT
  recognised (alias-symbol name + declaring-module match). mion writes the full
  3-key generic in every signature; re-exports work, aliases don't — verified.
- **Work (either/both):** (a) resolve one level of alias chain in `aliasForSpec` so
  framework-named aliases work, with a fixture; or (b) document the verbatim rule +
  the whole wrapper recipe (trailing optional param, forwarding as pass-through,
  multi-key arrays, `markerModules`) as a first-class website guide page — today the
  recipe only exists in `markers.ts` comments and mion's migration docs.
- **Acceptance:** a framework author can build a `route()`-style wrapper from the
  website docs alone; if (a) lands, an aliased marker fixture injects.

### A5. Multiple marker slots per signature — `RTParams` / `RTResponse` for RPC wrappers (design in ROADMAP, then implement)
- **The requirement (mion's author):** a route wants TWO independent groups of
  compiled functions — one over the params tuple, one over the return type —
  presented as plain objects, mirroring mion's old reflection API:
  `RTParams {validate, getValidationErrors, jsonDecoder, …}` and
  `RTResponse {validate, jsonEncoder, …}`. No pair-wrapping in runtime calls, no
  conditional type mapping, no runtime probing: read `isNoop` / the return kind off
  the entries to decide behaviour (a void route simply gets an empty/noop response
  group).
- **Why it needs upstream work — the one-slot constraint:** independent
  `createValidate<MionParams<H>>()` calls cannot live inside the wrapper's generic
  body (free type parameter — the scanner resolves call sites in SOURCE once, not
  per instantiation; that is the MKR003 gate and the reason forwarding exists), and
  a call site has exactly ONE trailing injection slot. So with 0.9 semantics the
  only single-call encoding of both sides is one T covering both — the pair.
- **What the pair costs (all empirically pinned, 2026-07-10):**
  - The slots must be OPTIONAL: the emitted validator for a required pair checks
    slot 1 unconditionally (`if (typeof v[1] !== 'string') nRT(…)`), so
    `verr([params])` fails on the missing return at request time. The optional pair
    (`if (v[1] !== undefined) {…}`) is what makes params-only validation work.
  - The void-conditional in mion's current alias is NOT structurally needed —
    `[P?, void?]` compiles and validates params-only fine — but dropping it loses
    the runtime void signal (`verr([undefined, undefined])` passes for `void?`
    slots too), so `hasReturnData` needs a type-level check or a metadata source.
  - Every runtime call wraps/unwraps (`verr([params])`,
    `JSON.parse(enc([undefined, ret]))[1]`), and the 3-fnKey marker ceiling caps a
    route at three families TOTAL across both sides.
- **Chosen mechanism (mion's author): MULTIPLE marker slots per signature.** Lift
  the "only the trailing slot is recognised" rule: every parameter whose type is an
  `InjectTypeFnArgs` marker is its own injection slot, each with its OWN `T` and its
  own family list. The type splitting stays in ordinary wrapper aliases (no Go-side
  function-type projection needed — `MionParams<H>`/`MionReturn<H>` already resolve
  at call sites), and per-slot multi-family keys keep the parameter count sane:

  ```ts
  // inside @mionkit/router — compiled once; slots filled at each USER call site
  export function route<H extends Handler>(
    handler: H,
    opts?: RouteOptions,
    paramsFns?: InjectTypeFnArgs<MionParams<H>, 'val', 'verr', 'jsonDecoder'>,
    responseFns?: InjectTypeFnArgs<MionReturn<H>, 'val', 'jsonEncoder'>
  ) {
    const injectedParams = paramsFns as unknown as readonly unknown[] | undefined;
    const injectedResponse = responseFns as unknown as readonly unknown[] | undefined;
    const RTParams = {
      validate: createValidate(undefined, undefined, injectedParams?.[0] as never),
      getErrors: createGetValidationErrors(undefined, undefined, injectedParams?.[1] as never),
      jsonDecoder: createJsonDecoder(undefined, undefined, injectedParams?.[2] as never),
    };
    const RTResponse = {
      validate: createValidate(undefined, undefined, injectedResponse?.[0] as never),
      jsonEncoder: createJsonEncoder(undefined, undefined, injectedResponse?.[1] as never),
    };
    return {handler, RTParams, RTResponse};
  }

  // user call site — the rewrite fills BOTH slots:
  // route((ctx, user) => ..., undefined, [__rt_val_P, __rt_verr_P, __rt_dec_P],
  //                                      [__rt_val_R, __rt_enc_R])
  ```

- **Work:** ROADMAP design entry, then:
  1. Scanner: recognise EVERY `InjectTypeFnArgs`/`InjectRunTypeId` parameter as an
     injection slot (drop the `paramIndex == lastIndex` gate in
     `resolver/scan.go`); resolve `T` + fn keys per slot; per-slot MKR003
     free-type-parameter checks; one Site now carries multiple slot injections.
  2. Injector: splice one value per marker slot in parameter order, padding skipped
     optional non-marker params with `undefined` (the injector already pads interior
     slots for the trailing case — generalise it).
  3. Pass-through per slot: an argument explicitly supplied at a marker index leaves
     THAT slot untouched (a wrapper forwarding all slots stays fully untouched, as
     today); diagnostics for partially-supplied marker args.
  4. Design points to settle: void/never/undefined ROOT types on the response slot
     should emit noop-flagged entries (so `RTResponse` reads as noop — "check isNoop
     and decide"), never alwaysThrow — verify + pin current root-void family
     behaviour; interaction with `CompTimeFnArgs` options params in multi-slot
     signatures; whether the per-marker 3-family cap needs raising (two slots ×3
     covers mion today).
  5. Docs: ARCHITECTURE "one trailing slot" sections + the website wrapper guide
     (A4) get the multi-slot story.
- **Alternative considered (not chosen):** a single structured handle where the
  resolver projects a FUNCTION-typed `T` into per-side groups. More Go-side
  machinery, less flexible family selection, and a new marker; multi-slot keeps the
  splitting in userland type aliases.
- **Acceptance:** mion's `route()` declares the two marker params above and deletes
  `MionRouteTypes`' conditional, the hasReturnData probe, and every pair
  wrap/unwrap; `route(handler)` AND `route(handler, opts)` call sites both receive
  both injected arrays; explicit forwarding stays pass-through; a void route reads
  as noop from the response entries; fixtures cover both slots' families and
  supersede A2's pair-shape pins.

## Workstream B — dispatch data-path parity

### B1. Public value-level JSON prepare/restore factories (mion perf)
- **Current:** mion's wire model parses ONE JSON envelope per request and stringifies
  ONE per response, so per-route transforms must be value-level. Only string-level
  `createJsonEncoder/Decoder` are public, so mion round-trips
  (`dec(JSON.stringify([params]))[0]`; `JSON.parse(enc([undefined, ret]))[1]`) —
  correct, but one extra stringify+parse per direction on the hot path. The families
  already exist as internal registry ops with emitters: `pj` (prepareForJson), `pjs`
  (safe variant), `rj` (restoreFromJson) — `operations.go:115-118`.
- **Work:** expose `createPrepareForJson<T>()` and `createRestoreFromJson<T>()`
  (final naming open) with fnKeys `pj`/`rj` following the "Adding a new RT function
  family" checklist minus the emitters (already exist): operations registry public
  entries (mind the FnHashLen=3 collision guard), demand plumbing
  (`familyAddedFlags`, `typefunctions.Families` public exposure), runtime `familyMeta`
  rows, factory wrappers + noop identity fallbacks, docs + website factory reference,
  paired-shape tests per the marker rule.
- **Acceptance:** mion's `FunctionReflection` drops all `JSON.stringify`/`JSON.parse`
  shims (`deserializeParams = restore(parsedParams)`, `serializeReturn =
  prepare(value)`), pinned by a benchmark showing the round-trip cost gone
  (`pnpm rtx bench` lane or mion's own bench).

### B2. String-input coercion for header params (deepkit `loosely` parity)
- **Current:** deepkit-mion coerced header strings (`"42"` → 42, `"true"` → true) for
  header hooks. No equivalent option; mion 0.9 ships header params as strings only
  and validation of non-string header params fails (mion issues log §4).
- **Work:** decide the shape: a `ValidateOptions`/decode strategy flag (`coerce:
  'strings'`), a jsonDecoder strategy variant, or keeping it consumer-side (mion
  coerces before validate — zero upstream work, documented recommendation). Small
  design note first; implement only if upstream-shaped.
- **Acceptance:** a documented answer mion can point users to; if implemented, a
  header-shaped fixture (string in, number/boolean out) in the suite.

### B3. Verify + pin `T | RpcError` union returns with a registered class serializer
- **Current:** mion's old lane special-cased Error/RpcError in return unions. In
  ts-runtypes, classes ride `registerClassSerializer`; whether a UNION of
  class-with-serializer + primitives round-trips through `jsonEncoder/Decoder` the way
  mion's wire needs is untested here.
- **Work:** fixture: `route` returning `Data | RpcError` with `RpcError` registered;
  pin encode/decode + validate behaviour for both branches; document the recipe
  (mion registers `RpcError` in `@mionkit/runtype`).
- **Acceptance:** the union round-trip test is green in the suite and referenced from
  the website classes/serializers page; mion deletes its "union error hack" note.

## Workstream C — client metadata lane (`serializedTypes` v2)

### C1. Public wire-serialization helpers for cache-entry graphs
- **Current:** code-mode `CompiledFnData` is already serializable data (factory body
  string, param names, `rtDependencies`/`pureFnDependencies` string keys) and the
  public registry covers both ends (`getRTFnCaches()` read; `getRTUtils()
  .addToRTCache/.addPureFn` ingest; `getRTFn` materializes via
  `new Function('utl', code)`). mion's client lane (its migration-docs/02 → "Client
  metadata lane") hand-rolls: record projection (strip `createRTFn`/`fn`),
  dependency-closure walk from root hashes, ingest shims for noop short-forms
  (family identity via `familyTag`) and `alwaysThrow` records
  (`alwaysThrowMessage`), and key capture via `getRunTypeId(undefined, handle)`.
- **Work:** formalize as public API so frameworks don't depend on record internals:
  `serializeEntryGraph(rootKeys) → WirePayload` + `ingestEntryGraph(payload)` (names
  open) in `@ts-runtypes/core`; include pure-fn records (skipping the self-registered
  built-in `rt::` ones), define the payload as a versioned JSON shape, and decide the
  integrity story (entries are content-addressed; `bodyHash` exists for pure fns).
  Document the two hard constraints: producer must build with `emitMode: 'code' |
  'both'`, and ingest materializes with `new Function` (CSP `unsafe-eval`; the
  build-time alternative stays for CSP-restricted clients).
- **Acceptance:** a round-trip test: register entries in one context, serialize the
  graph for a root set, ingest in a fresh isolate (no plugin), and the materialized
  validate/encode/decode behave identically; mion's client rebuilds its
  `FunctionReflection` from the payload using only public API.

### C2 (optional extension). Runtype-row serialization for reflection-needing clients
- **Current:** the fn-entry graph is enough for validate/encode/decode. Clients that
  also want `getRunType` graphs or FriendlyText rendering need the runtype data-bundle
  rows — equally serializable data, not included in C1's minimal payload.
- **Work:** optional `includeRunTypes` flag on the C1 payload; defer until a concrete
  client feature needs it.

## Workstream D — packaging / distribution fixes (bite mion's builds today)

### D1. Published d.ts must not require Temporal types
- **Current:** `dist/formats/datetime/temporalFormats.d.ts` references the `Temporal`
  namespace → TS2503 for `skipLibCheck: false` consumers on stock TS 5.x libs (mion
  hit it; worked around with `skipLibCheck: true`).
- **Work:** self-guard the Temporal references (local fallback types or
  `typeof globalThis.Temporal` indirection) so the root export chain never forces the
  namespace; keep `./formats/temporal` opt-in.
- **Acceptance:** a consumer typecheck with `skipLibCheck: false` + `lib: es2021`
  passes in the pre-publish e2e.

### D2. CJS-scoped declarations for `nodenext` consumers (TS1479)
- **Current:** runtime CJS works (`dist/cjs` + nested `{"type":"commonjs"}`), but the
  single `types` condition points at the ESM-scoped d.ts → TS1479 for CommonJS-format
  TS consumers under `moduleResolution: nodenext` (mion's esm build hit it; worked
  around with `node10` resolution).
- **Work:** emit `dist/cjs/**/*.d.ts` (or `.d.cts`) and split `types` per condition
  (`"require": {"types": …, "default": …}`) across all subpaths.
- **Acceptance:** a CJS+nodenext consumer typecheck lane in the pre-publish e2e.

## Workstream E — build-tool coverage for mion's runtimes

### E1. Library-publish recipe: precompiled internal routes in shipped packages
- **Current:** mion's own `client.routes.ts` (routes defined INSIDE `@mionkit/router`)
  can't receive injection in consumers' builds (published dist is never transformed),
  so mion ships them with validation/serialization disabled. `--compile` already
  produces exactly what's needed (rewritten JS + relative imports into real
  `__runtypes/types` files), but there is no documented "library build" recipe:
  compile-then-declarations ordering, shipping the `__runtypes` dir in `files`,
  cache-module dedupe when the CONSUMER also generates entries for the same types.
- **Work:** document the recipe (website guide + a fixture in the e2e image building a
  small library with `--compile` and consuming it from an app build); resolve the
  dedupe question (content-addressed keys should make duplicate modules harmless —
  verify and state it).
- **Acceptance:** a packed library with precompiled marker calls works inside an app
  build with the plugin active, with no double-registration warnings; mion re-enables
  validation on its internal routes.

### E2. Jest / plain-tsc consumer story (mion still has jest lanes)
- **Current:** the plugin needs a bundler transform; bundler-less consumers use
  `--compile`. Works, but the recipe (compile → run jest over emitted JS, or a
  documented jest transformer wrapper) is unwritten; ROADMAP already lists the
  generalized "pre-process build mode" as pending.
- **Work:** document the `--compile`+jest recipe now; fold into the ROADMAP build-mode
  item for the real solution.
- **Acceptance:** a documented, tested path mion can use for its remaining jest
  packages during their migration window.

### E3. Bun loader story (`@mionkit/bun`)
- **Current:** mion's bun lane used a deepkit transpile-on-load plugin; nothing
  equivalent exists for ts-runtypes (unplugin has no bun adapter).
- **Work:** decide between (a) a `Bun.plugin` loader that calls the resolver per file
  (one-shot/daemon, like the old deepkit loader — dev-friendly) and (b) documenting
  `--compile` as the bun path (build-time, works today). (b) first; (a) as a
  follow-up package if demand shows up.
- **Acceptance:** mion's bun e2e (`bunHttp.test.ts`) passes on the documented path.

## Suggested order / release mapping (lockstep versioning)

1. **0.9.1 (patch):** A1 release (already on this branch), D1, D2 — unblocks mion
   removing its shim + tsconfig workarounds. A2 rides along (tests only).
2. **0.10.0 (minor):** A5 (multi-slot markers — the RTParams/RTResponse target
   shape; ROADMAP design first, it also subsumes most of A2's pins), B1 (new public
   fnKeys → cache-affecting), C1 (new public API), B3 fixture+docs, E1 recipe. This
   is the release mion's client lane, route-API cleanup and perf pass target.
3. **Backlog / as-needed:** A3 (scanner edge), A4 (docs or alias support), B2
   (decision note), C2, E2/E3 recipes.

Each shipped item moves its section into `docs/done/` per repo convention; mion-side
uptake for every item is tracked in mion `migration-docs/03-migration-plan.md` phase 6.
