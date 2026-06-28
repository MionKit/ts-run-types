# Architecture

RunTypes is a compile-time **type resolver** targeting **TypeScript 7 / tsgo**. It provides a native side-channel into tsgo's type checker for tools (Vite plugin, codegen, test harness) that need to know a TypeScript type at a specific call site without relying on the legacy custom-transformer API (which the Go port does not expose; see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)).

## Big picture

```
  .ts source                   Go resolver                  JSON type table
  ┌─────────┐    scanFiles    ┌──────────────┐   TypeNode   ┌───────────────┐
  │  app.ts │ ─────────────▶ │  ts-runtypes │ ───────────▶ │  site → id    │
  └─────────┘                │  (typescript- │              │  id   → node  │
       ▲                     │   go checker) │              └───────────────┘
       │ rewrites calls      └──────┬───────┘                       │
       │                            │                               │
  ┌─────────┐                       │ spawns (stdio JSON)           │ virtual
  │  Vite   │ ◀─────────────────────┘                               │ module
  │  plugin │ ────────────────────────────────────────────────────▶ │ import
  └─────────┘                                                       ▼
                                                             runtime / RT
```

### Three lifecycles

1. **Build lifecycle** (Vite, Rollup, CI codegen): Go resolver is spawned once, receives one `scanFiles` query per source file, dumps the full table at end-of-build, is torn down.
2. **Query lifecycle**: every source file with calls to `InjectRunTypeId<T>`-marked functions is sent to `scanFiles`. The resolver walks every CallExpression, asks tsgo for the resolved signature, and returns one site per call whose trailing parameter type is the sentinel marker.
3. **Runtime lifecycle**: the rewritten source passes the site id as the trailing argument; the library's runtime helper does a `Map.get(id)`. No reflection work happens at runtime.

## Execution model — what we replace and what we don't

We **do not replace `tsc`**, and we do not implement a compiler. The Vite plugin is a normal `transform()` plugin running inside Vite/Rollup's pipeline, and the Go binary is a separate process used solely for _type resolution at call sites_ — it emits no JavaScript.

Concretely, at build time:

| Stage                                  | Tool                                                                        | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking the project              | Whatever the user's tsconfig points at — `tsc`, `vue-tsc`, the editor, etc. | Unchanged. We don't type-check on the user's behalf.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| TS → JS emit                           | Vite's default (esbuild)                                                    | Unchanged. We never write `.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Type-id injection at marked call sites | **runtypes-devtools** + **RunTypes** Go binary                    | The plugin's `transform()` hook spawns the binary, asks "what `T` is bound at each `InjectRunTypeId<T>` call?", and rewrites those calls in-place via byte-offset insertions.                                                                                                                                                                                                                                                                                                                |
| Entry-module emission                  | **runtypes-devtools** (`virtual:rt/<key>.js`)                            | One virtual ES module per cache entry — demand-driven function factories (validate, JSON, binary, unknown-keys, formats), JSON composites, pure fns — rendered by the Go side and keyed by hash. Reflection nodes are denser: they ride as rows of the single data bundle `virtual:rt/runtypes.js` with a per-root facade module, so each node exists exactly once app-wide. The rewrite injects the matching imports per user file, so bundlers code-split and tree-shake entries natively. |
| Runtime metadata access                | Entry tuples + the `rtUtils` registry                                       | Each module exports one positional tuple; on first use a factory registers the tuple's dependency closure (a recursive deps()-thunk walk — children first, then the runtype bundle's combined footer initializer) and resolves by its exact cache key — `getRunType(id)` for reflection nodes, `getRT('<fnHash>_<typeId>')` for function entries. No reflection work happens at runtime.                                                                                                     |

### Why a separate Go binary

`tsc` (the JavaScript build) shipped a [custom-transformer API](https://github.com/itsdouges/typescript-transformer-handbook) that runtime-type libraries (`ts-runtime`, `typia`, `deepkit`, and others) hooked into. That API let a Node-side program walk the AST and rewrite source _with access to the checker_ before `tsc` emitted JS.

`tsgo` — the Go port that will become TypeScript 7 — **does not currently expose any plugin or transformer API to user code**. The compiler is now a single statically-linked Go binary that runs as a CLI; you cannot load a Node plugin into it, and the checker's symbol-resolution machinery lives behind Go's `internal/` visibility wall (which Go enforces at the compiler level — see the "Shims" section below).

Tracking issue: [microsoft/typescript-go#516 — Plugin support](https://github.com/microsoft/typescript-go/issues/516). As of this writing, no roadmap.

That leaves two choices for type-aware tooling against TypeScript 7:

1. **Wait** for an official API. Unbounded timeline.
2. **Reach into tsgo's checker at the Go level** via a side-channel. That's what this project does, using the [oxc-project/tsgolint](https://github.com/oxc-project/tsgolint) shim layer (also used by oxc's TypeScript linter for the same reason). When #516 lands, we swap the shim for the official API and leave the Vite plugin, marker, cache, and runtime untouched.

### Where each process runs

```
┌───────────────────────────────────────────────────────────────────────┐
│  Vite dev server  /  rollup build  (Node.js)                          │
│                                                                       │
│  ┌────────────────┐   transform(file)    ┌────────────────────────┐   │
│  │  Vite core     │ ───────────────────▶ │  runtypes-devtools  │   │
│  │  (esbuild)     │                      │  (Node)                │   │
│  │                │   ◀── rewritten src  └─────────┬──────────────┘   │
│  └────────────────┘                                │ stdio JSON       │
│                                                    ▼                  │
└───────────────────────────────────────────────┬───────────────────────┘
                                                │
                            spawn() one child   │
                                                ▼
                                  ┌──────────────────────────┐
                                  │  bin/ts-runtypes  (Go)  │
                                  │  ─────────────────────   │
                                  │  tsgo Program + Checker  │
                                  │  via shim/* imports      │
                                  └──────────────────────────┘
```

The Go binary is a long-lived child process during a build session: spawned once, fed one `scanFiles` request per `.ts` file, dumped at the end of the build, then torn down. The plugin can also run it as a Unix-socket daemon for HMR scenarios where the build session outlives a single Vite invocation.

The user's tsconfig drives both worlds: the binary parses it to bootstrap the same `Program` view tsgo would use, so what we resolve as type `T` is exactly what tsgo resolves.

### Configuration surface

The same tsconfig is also the canonical config surface for the compiler's project options. On the build path (`cmd/ts-runtypes/main.go`) the binary reads the `compilerOptions.plugins[name=ts-runtypes]` entry (`resolveBuildPlugin` in `config.go`) and merges it under the CLI flags with **tsc-style precedence** — an explicitly-set flag (tracked via `flag.Visit`) wins over the tsconfig entry, which wins over the built-in default (`mergeBuildOptions` in `buildconfig.go`). The host plugins therefore forward a `--flag` only for an option the user set explicitly, so an unset host option falls through to tsconfig. The inline / server test modes carry no tsconfig, so they run on flags + defaults alone. Recognised keys: `emitMode`, `moduleMode`, `inlineMode`, `hashLength`, `cacheDir`, `singleThreaded`, `parallelScan`, `parallelRender`, `enrichDir`; an unknown key is ignored with a stderr warning (the known set is derived from the struct's json tags by reflection, so it can't drift). Newly-exposed options need no disk-fingerprint bump: they change site detection, module grouping, or the cache location rather than a cached entry's body (the body-affecting `hashLength` / `emitMode` / `inlineMode` were already folded in).

## The sentinel marker

Detection is anchored on a single TypeScript type alias exported from the `ts-runtypes` package:

```ts
export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
```

A function opts into compile-time id injection by declaring `id?: InjectRunTypeId<T>` as its **trailing parameter**. The transformer rewrites every call site of such a function, injecting the resolved hash id at that slot. This includes:

- The static helper `getRunTypeId<T>(id?)` shipped from `ts-runtypes` — explicit type, no value.
- The reflection helper `getRunTypeId<T>(value, id?)` — `T` inferred from a runtime value.
- Any user-defined wrapper that propagates the marker — `function validate<T>(v, id?: InjectRunTypeId<T>)`.

Detection requires both:

1. The trailing parameter type alias must be named `InjectRunTypeId`.
2. The alias must be declared in `ts-runtypes`. Either inside `declare module "ts-runtypes" { ... }` or in a file whose enclosing on-disk `package.json` has `"name": "ts-runtypes"`. This rules out accidental collisions with same-named user types declared elsewhere. The marker set is fixed at the binary's defaults — there is no CLI override for either knob.

A call inside a generic body where the marker's `T` is the wrapper's own free type parameter is **skipped** — there's no concrete `T` to assign an id to yet. The wrapper must propagate the marker via its own signature, and the injection happens at the wrapper's call sites instead.

### The second marker — `InjectTypeFnArgs<T, Fn>` and demand-driven caches

`InjectRunTypeId<T>` covers **reflection-only** sites (`getRunTypeId` static + value-first forms, value-first RT builders, `createMockType`) and injects a bare `"<typeId>"` string. The `createX<T>()` factory family (`createValidate`, `createGetValidationErrors`, the unknown-keys group, `createJsonEncoder`/`createJsonDecoder`, `createBinaryEncoder`/`createBinaryDecoder`) instead declares a trailing `InjectTypeFnArgs<T, Fn>` marker, whose second type argument `Fn` names the function family (`'val'`, `'verr'`, `'jsonEncoder'`, …). For those sites the transformer injects a `["<typeId>", "<fnHash>"]` **tuple**:

- `typeId` — the structural-id hash of `T`, same as the reflection cache.
- `fnHash` — an **opaque precomputed hash** (length 3, `hash(operationName + sorted comptime-args)`) the scanner computes from `Fn` plus the relevant `CompTimeFnArgs` literal (the `ValidateOptions` bag for `it`/`te`; the JSON strategy for the encoder/decoder), via the operations registry in [`internal/operations`](../internal/operations/) (`FnHashFor`/`PlainHash`/`Canonical`). Go computes every fnHash — the runtime treats it as an opaque lookup-key prefix and never hashes anything. The injected tuple is the complete demand: it tells the backend exactly what to emit and gives the runtime the exact lookup key, so the runtime no longer re-derives a variant key. The cache key is `<fnHash>_<typeId>`. The canonicalizer is property-order-independent (like the structural type-id, which already sorts object members).

The `[typeId, fnHash]` literals are computed by `CompTimeFnArgs<T>` — the fn-selecting variant of `CompTimeArgs<T>` (both in [`packages/ts-runtypes/src/markers.ts`](../packages/ts-runtypes/src/markers.ts)): it validates literals identically (CTA0xx) but also marks the parameter whose literal value selects the `createX` variant. Plain `CompTimeArgs<T>` stays for other literal params (pure-fn keys, builder configs).

Both markers accept a **spread of a statically-resolvable container fragment** inside their object / array literal — `object({...base, name: string()})`, `createJsonDecoder<T>({...preset, strategy: 'mutate'})`. The operand must resolve (via the const-chain trace) to a literal container of the matching kind: an object literal for an object spread, an array literal for an array spread; a dynamic value or a shape mismatch stays a CTA0xx error. The spread-operand trace follows **import aliases** (`comptimeargs.ResolveSpreadContainer`, the same cross-module hop the regex-literal trace uses), so an imported shared fragment merges too. For builders the merge is free — TypeScript performs the type-level spread, so the scanner reflects the merged type with no Go-side value-merge. For the `CompTimeFnArgs` option bags the value IS read from the AST, so `eachOptionProperty` (in [`internal/resolver/scan.go`](../internal/resolver/scan.go)) descends into spreads **in source order, last-write-wins** — a spread-merged options preset selects exactly the same fnHash variant as the fully-inlined equivalent (the soundness contract: relaxing the validator and teaching the option reader to merge land together).

**Whole-const args resolve cross-module too**, for parity with the spread form. A WHOLE imported `const` used as a builder child or option bag — `object({inner: importedConst})`, `createValidate(undefined, importedPreset)` — resolves through its import alias, not just `{...importedConst}`. The literal-value walk (`traceIdentifier`) uses `resolveConstInitializerCrossModule`, and `eachOptionProperty` follows an identifier options bag through the same hop; the same-module-only `resolveConstInitializer` is kept for the pure-fn / string-literal traces, which deliberately do NOT cross modules. The guard that keeps this sound is the **`as const` rule (CTA004)**: when a comptime arg resolves to a `const` bound to an **object literal**, the const's TYPE must carry literal values — a widened member (`{strategy: 'mutate'}` inferred as `{strategy: string}` for want of `as const`) is rejected, because the build reads the value from the AST while TypeScript resolves the overload against the type, and a widened type lets the two pick different fn variants. The check is shallow and object-only: a property typed as an object (a value-first builder result like `number()`) is left alone, so only flat option bags / literal-valued objects trip it.

Because each function site now carries structured demand, the per-family cache modules are **demand-driven**: a family emits factories only for the types its own `createX` call sites request. A hash isn't reversible, so demand is no longer reverse-parsed from `fnId` — the scanner computes it and carries it on `protocol.Site.Demand []SiteDemand{FamilyTag, VariantSuffix, Options, FnHash}`, closed transitively by `collectFamilyDemand` in [`internal/compiled/typefns/module.go`](../internal/compiled/typefns/module.go). All function families are demand-driven (no "migrated families" gate — the gate is simply `len(dump.Sites) > 0`). A file whose only marker call is `getRunTypeId<T>()` emits **zero** function-cache entries — the reflection cache is untouched, every function family is empty for it.

The renderable RT "operations" — the 11 public `createX` ops + 5 internal-only primitives — and the fnHash machinery (`FnHashFor`/`PlainHash`/`Canonical`/`DemandFor`, `FnHashLen = 3`, plus an `init()` collision guard that fails the build if the closed operation/option set ever collides at that length — a collision is an internal bug, never auto-grown) live in the single-source-of-truth package [`internal/operations`](../internal/operations/).

JSON encoder/decoder composition is **Go-emitted**, not assembled at runtime: one COMPOSITE cache entry per (typeId, strategy), keyed by the composite fnHash (see [`internal/compiled/typefns/json_composite.go`](../internal/compiled/typefns/json_composite.go)), wraps the underlying primitives with native JSON. So `createJsonEncoder`/`createJsonDecoder` collapse to the same pure `resolveTupleEntry` lookup as binary — no runtime strategy branching. Per-strategy composite tags live in `constants.jsonCompositeTags` (deliberately NOT in `CacheModules`, so the generated TS mirror is untouched). The encoder strategy set is `clone` | `mutate` | `direct` — `clone` (default) is shape-derived and strips undeclared keys by construction (wraps `prepareForJsonSafe`), so there is no separate strip variant; `mutate` transforms in place and preserves extras; `direct` is single-pass.

Disk cache format is **v10** (keys embed fnHash; the payload is the tuple `ArgsText` for per-entry modules — with default-valued tails trimmed off, see `typefns.trimArgsTail` — plus a persisted `IsNoop` bit). v10 embeds the `alwaysThrow` runtime throw message directly in the entry's final tuple slot (`[CODE] Cannot … (at site)`, rendered by the Go emitter) so the shipped marker package throws it without carrying a diagnostic catalog; the Go↔plugin wire still carries only the diagnostic code, and the build-time diagnostic catalog (code → headline, for the build log / IDE) lives once in runtypes-devtools. The plugin's **`emitMode`** option (`code` | `functions` | `both`; mirrored as the binary's `--emit-mode` flag, validated against `constants.EmitMode`) selects what each fn entry ships in its code/factory slots: `code` (default) ships only the body string (runtime rebuilds the factory via `new Function`); `functions` ships only the live `createRTFn` closure (code derived lazily from `createRTFn.toString()` via `entryCode` if ever read); `both` ships both (the body twice — for CSP runtimes that also read `.code`). The disk fingerprint ([`internal/cache/disk/fingerprint.go`](../internal/cache/disk/fingerprint.go), tag v4) folds `emitMode` in so the three modes never cross-read. The [compile-time benchmark](../container/benchmarks/README.md#compile-time-cost-benchcompiletime) wipes this cache before its transform build, so it measures the honest from-scratch resolve rather than a cache hit.

`it` (validate) is the one **cross-family** dependency: the JSON and binary union decoders discriminate members at runtime via `val_<member>.fn(value)` and `validationErrors` delegates child checks to `val_` too. Those edges ride each entry's module dependencies (`SoftDeps` — imported but never cascade-dropped, because the emitted bodies guard the lookups with `?.fn(…) ?? true`), and the resolver renders the referenced foreign entries to fixpoint (`resolveCrossFamilyEdges` in [`internal/resolver/dispatch.go`](../internal/resolver/dispatch.go)). A file that only serializes a union therefore still gets the per-member `val_` entries its decoder needs at runtime — they arrive through the union entry's import closure.

**Custom per-type overrides — `overrideX<T>(pureFn)`** are the WRITE side of the same `(family, typeId)` routing `createX` reads. A user registers a custom **pure function** for one `T`; every `createX<T>()` then returns it instead of the Go-emitted body. The override fn rides the existing pure-fn pipeline (purity gate, body hashing, cache, virtual-module emission) as a **`cfn`** — keyed `cfn::<CodeHash(body)>`, content-addressed so identical bodies dedup. The cfn's hash is then **folded into the structural type id** of `T` as a `|cfn:<family>:<hash>` suffix (mirroring the format-annotation fold in [`internal/compiled/runtype/typeid/`](../internal/compiled/runtype/typeid/)). Folding rather than swapping the entry body is what keeps the cache **idempotent**: an overridden type gets a DISTINCT id from its un-overridden twin, so no `<fnHash>_<typeId>` key is ever reused with two different bodies across builds, and because type ids propagate structurally the override reaches **every containing type** (`overrideJsonEncoder<string>` shifts `{a, b: string}`'s id and the body emitted for its `b` field). A whole-program collection pass (`ensureOverrides` in [`internal/resolver/overrides.go`](../internal/resolver/overrides.go)) runs **before any id is minted** — the map is global, an override anywhere shifts ids everywhere — extracting cfns and installing the override map on the cache (`Cache.SetOverrides`). At emit time the type-fn entry for an overridden `(family, typeId)` is a thin **redirect** (`buildRedirectEntry`): `return utl.usePureFn('cfn::<hash>')`, with the cfn on `SoftDeps`; the walker forces a dependency call at an overridden child so containing types reference the redirect rather than inlining the structural body. Overriding a JSON composite redirects every strategy tag and **prunes** the now-dead internal primitives (pj/sj/rj/ukuw) for that type — which is also the escape valve for a wire format the structural emitter can't produce (the primitive would `alwaysThrow` otherwise). Diagnostics: **OVR001** (two overrides of one `(type, family)` with different bodies — order-dependent, an error; same body dedups silently), **OVR002** (a build tripwire: `AssertOverrideCfn` fails the build if a redirect's cfn module didn't render, rather than a runtime `usePureFn` throw), **OVR010** (a Warning that overriding `validate` — the cross-family-shared family above — also changes how decoders narrow unions containing `T`). The override fn's own purity reuses the `PureFunction` marker layer (PFN001 not-inline / PFN002 external-handle / PFE9006-9011 purity). The **literal-only rule** governs every `PureFunction<F>` literal — the build extracts and AOT-compiles the body, so the only accepted form is an **inline** arrow / function expression (modulo `as`/parens/`satisfies` wrappers). A named reference is rejected even when it's a module-private `const f = …` / `function f(){}` (PFN001 "inline it"), because any named binding is a handle something else could reach; an imported or exported binding is the same problem made worse and gets the more specific PFN002. Detection: inline literal → accept; imported symbol (`SymbolFlagsAlias`) → PFN002 "imported"; a local binding that's exported (`export` modifier, `Symbol.ExportSymbol`, or an `export {…}` specifier resolving back to it) → PFN002 "exported"; any other named/non-function node → PFN001. Composition between pure-fns stays available through the factory's `utl` (`utl.usePureFn('ns::id')`, tracked as a dependency), so the literal-only rule never blocks reuse — it only forbids a raw value handle. Runtime is unchanged: a redirect is an ordinary type-fn entry whose `createRTFn` returns a pure fn.

**Noop elision is semantic, not shape-based** ([`internal/compiled/typefns/noop_types.go`](../internal/compiled/typefns/noop_types.go)). `Finalize`'s `"" / "return v"` check only sees inlined code; "is this entry the family identity?" is decided by per-family predicates over the TYPE GRAPH (cycle-safe greatest fixpoint, memoized in `FactsTable`; pj/rj/pjs implement the optional `NoopTypePredicate` capability today). Consumers: (1) the walker's dispatch gate composes around external children the predicate proves identity — no dep call, no import (this is also what collapses circular identity bodies: the cycle re-entry dispatches, gates, and the traversal folds away); (2) JSON composites read their primitives' RENDERED `entrymod.Entry.IsNoop` flags (collected after the family merge) and elide dead bindings — `return JSON.parse(s)` instead of `rjFn(JSON.parse(s))`. SOUNDNESS CONTRACT (one-directional): predicate true ⇒ the emitted body is identity — a false negative only costs bytes, a false positive silently skips a transform. Every arm mirrors its emitter's per-kind dispatch, pinned mechanically by the corpus test ([`internal/resolver/noop_predicate_test.go`](../internal/resolver/noop_predicate_test.go)); when adding a kind or changing an emit arm, keep the predicate in sync (the corpus test fails loudly on the unsound direction). Families without a predicate (sj/tb/fb always do real work; the unknown-keys group has none yet) keep plain dep-call behavior.

**Adding a new RT function family:** add an entry to the [`internal/operations`](../internal/operations/) registry (Name + FamilyTag + Axis + FnKey), add a row to `typefns.Families` ([`internal/compiled/typefns/families.go`](../internal/compiled/typefns/families.go)) plus a `familyAddedFlags` row in [`internal/resolver/dispatch.go`](../internal/resolver/dispatch.go), add its tag to the runtime `familyMeta` table in [`packages/ts-runtypes/src/runtypes/entryTuple.ts`](../packages/ts-runtypes/src/runtypes/entryTuple.ts) (fnID / args / defaultParamValues / noop identity), and give its `createX` an `InjectTypeFnArgs<T, '<fnKey>'>` trailing param (plus a `CompTimeFnArgs` option slot if it has comptime options) reading the injected entry tuple. `FamilySpec.Collect`/`FamilySpec.AnySupported` cover the per-family wrappers. Cross-family references work automatically — record them as walker cross-family deps and they ride the entry's SoftDeps into the resolver fixpoint (the `it` precedent).

## Package layout

```
cmd/ts-runtypes/             CLI entry point
internal/program/                tsconfig + VFS bootstrap
internal/resolver/               op dispatch (scanFiles, dump, …); AST call-walk (walk.go + scan.go)
internal/marker/                 InjectRunTypeId<T> / InjectTypeFnArgs<T, Fn> sentinel detection (name + module check)
internal/builders/               value-first builder-call recognition (return-type keyed)
internal/comptimeargs/           CompTimeArgs literal validation + extraction (CTA0xx)
internal/operations/             single source of truth for RT operations + fnHash computation
internal/compiled/runtype/       *checker.Type → protocol.RunType projection + per-entry tuple collection + typeid/
internal/compiled/typefns/       per-fn AOT emitters (validate, validationErrors, JSON, binary, formats, …)
internal/compiled/purefns/       pure-fn helpers emitted inline
internal/protocol/               stdio JSON request/response types
internal/constants/              cross-package constants, mirrored to TS via cmd/gen-ts-constants
internal/diag/                   diagnostic codes (codes_runtype.go, codes_*.go)
internal/cache/disk/             persistent disk cache (FormatVersion, fingerprinting)
internal/compiled/entrymod/      per-entry virtual-module assembly (ordering, imports, stubs)
internal/hashid/                 structural-id hashing (quickHash rolling hash → short ids)
internal/jsquote/                canonical JS string-literal quoting
internal/textpos/                byte offset → line/column conversion for diagnostics
internal/testfixtures/           fixture .ts + shared tsconfig
packages/ts-runtypes/        ts-runtypes — markers, createX factories, schema builders, formats, mocking
packages/runtypes-devtools/   JS side — drives scanFiles, patches calls
third_party/tsgolint/            git submodule — shim layer into typescript-go
docs/                            this file
```

### internal/program

Wraps the [`oxc-project/tsgolint`](https://github.com/oxc-project/tsgolint) shim packages into a simple `program.New(Options)` that:

- layers an optional overlay VFS on top of `osvfs` + `cachedvfs` + `bundled`
- parses the supplied tsconfig via `tsoptions.GetParsedCommandLineOfConfigFile`
- builds a `compiler.Program` and calls `BindSourceFiles()`

`NewInferred` is a second constructor that skips tsconfig for one-shot queries on loose files.

### internal/resolver

Owns both the AST call-walk and op dispatch. `walk.go` contains `NodeAt`, `CallExpressionAt`, and `ForEachCallExpression` (depth-first visitor over every `CallExpression` in a source file). `scan.go` handles the `scanFiles` op logic. Dispatches six operations (see `Op*` constants in [`internal/protocol/protocol.go`](../internal/protocol/protocol.go)):

| op           | semantics                                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanFiles`  | Walks every CallExpression in file. For each whose resolved signature has a trailing marker param with bound T, returns a `Site{Pos, ID, ParamIndex, ArgsCount, Demand}`. Opt-in `includeEntryModules` projects the per-entry virtual modules scoped to just the requested files. |
| `dump`       | Returns the full cache (every RunType) + the running Sites slice + the rendered cache module sources.                                                                                                                                                                             |
| `setSources` | Replaces the resolver's in-memory source overlay and rebuilds the Program (drives test harnesses and the daemon's HMR path).                                                                                                                                                      |
| `reset`      | Wipes all resolver state: cache, sites, Program, checker.                                                                                                                                                                                                                         |
| `resolveId`  | Returns the canonical full RunType for a hash id; child slots stay `KindRef` stubs, the caller re-issues `resolveId` per id to drill in.                                                                                                                                          |
| `tsCompile`  | Runs the embedded tsgo through bind + typecheck + emit without the marker scan — a pure-TS latency baseline for benchmarks.                                                                                                                                                       |

`Pos` is the byte offset of the closing `)` of the call — the TS-side patcher inserts at that offset. `ParamIndex` is the 0-based slot the injected id goes into; `ArgsCount` is the number of arguments the user already wrote (so the patcher knows whether to pad with `undefined`).

**Reflect-form annotation honoring.** When the value argument is a const-bound identifier with a written type annotation (`const v: T = literal; createValidate(v);`), the resolver reads the annotation directly via `Checker_getTypeFromTypeNode` instead of trusting TypeScript's control-flow-analysis apparent type for `v`. Without this, CFA narrows the binding to its initializer's narrowest type (e.g. `Color.Red` for an enum or `'hello'` for a union), and the reflect-form hash would diverge from the static `createValidate<T>()` form. The walk only fires in the reflect form (no explicit type arguments) and only for `Identifier` arguments — property accesses, function calls, and element accesses don't go through const-binding CFA and don't exhibit the trap.

**Function-call argument warning.** The resolver flags `createValidate(getX())` (and any other reflect-form marker call with a `CallExpression` argument) as an anti-pattern: the function is invoked at runtime purely so the type checker can infer `T` from its return type, even though the value is discarded. The validator still works, but the recommended replacement is the static form using `ReturnType<typeof fn>`. The warning surfaces on the response's `markerDiagnostics` channel and the Vite plugin re-emits it through `this.warn` in canonical `tsc --pretty=false` format so VS Code's `$tsc` problem matcher picks it up.

### internal/marker

`Detect(t *checker.Type, opts Options) (typeArg, ok)` — given the type of a function's trailing parameter, returns whether it matches the configured marker (name + declaring-module check) and extracts the single type argument `T`. `IsFreeTypeParameter(t)` filters out calls inside generic bodies.

### internal/compiled/runtype

The `runtype` serializer (`internal/compiled/runtype/serialize.go`) interns `*checker.Type` → stable hash id (e.g. `abc123`). `AssignID(t)` is the public entry point used by the marker scanner; `Serialize(t)` returns a `KindRef` sentinel pointing at the cached entry. Recursion is broken by reserving the id before descending. Structural dedup means two distinct AST types that share the same shape end up with the same id. The `module.go` file renders both output formats (JSON dump and the self-wired TS module). The `typeid/` subdirectory holds the structural-id computation.

### internal/protocol

Pure struct definitions shared between the Go resolver and the TS plugin. Stdio protocol is newline-delimited JSON; one `Request` in, one `Response` out, EOF terminates. The daemon mode wraps a Unix-socket accept loop around the same handler, one client at a time.

### packages/ts-runtypes (`ts-runtypes`)

The public runtime package, three entry points:

- `.` — the markers (`InjectRunTypeId<T>`, `InjectTypeFnArgs<T, Fn>`, `CompTimeArgs<T>` / `CompTimeFnArgs<T>`, `PureFunction`), the reflection helpers `getRunTypeId<T>()` (static — explicit type argument, no value; throws if the plugin didn't inject an id) and `getRunTypeId(value)` (`T` inferred from the value), and the full `createX` factory surface: `createValidate` / `createGetValidationErrors`, the unknown-keys group (`createHasUnknownKeys` / `createStripUnknownKeys` / `createUnknownKeyErrors` / `createUnknownKeysToUndefined`), `createFormatTransform`, `createJsonEncoder` / `createJsonDecoder`, `createBinaryEncoder` / `createBinaryDecoder` / `createBinarySizer`, `createMockType`, plus the runtime registries (`registerPureFnFactory`, `registerClassSerializer`, `registerMockingFunction`, `registerFormatPattern`) and the DataView serializer helpers.
- `./schema` — the value-first NON-format builders (`boolean()`, `literal()`, `object({...})`, `array()`, `union()`, the utility builders, …) returning live `RunType<T>` nodes; `Static<T>` recovers the TS type. Each builder converges on the same structural id as its type-first equivalent. (The format builders — `string()` / `number()` / `email()` / … — and the `temporal.*` family moved to `./formats` + `./formats/temporal`.)
- `./formats` — the type-format aliases (`TF.String`, `TF.Email`, `TF.UUIDv4/v7`, `TF.Number`, `TF.BigInt`, `TF.StringDate/Time/DateTime`, `TF.Date`, fixed-width int presets, …) AND their value-first builders (`TF.email()`, `TF.int32()`, …), namespaced as `import * as TF from 'ts-runtypes/formats'`; plus their mock / pure-fn / pattern registrations. The Temporal family (`TFT.Instant` / `TFT.PlainDate` / …) is on the `./formats/temporal` subpath (`TFT`). Format **validation** happens at build time on the Go side; the runtime only carries mocking + transform helpers.

Cache access goes through the runtime registry (`getRTUtils()` in `src/runtypes/rtUtils.ts`): each marker call site receives its entry-module tuple, `initFromTuple` (in `src/runtypes/entryTuple.ts`) registers the tuple's dependency closure (reflection nodes by typeId from the data bundle's rows, function factories by the `<fnHash>_<typeId>` key, pure fns by `<ns>::<fn>`), and the factories resolve via `resolveEntryTupleFn` / `getRunType(id)` with a noop fallback when a type has no supported entry (the Go side emits a resolvable `KindMissing` stub module for dropped entries).

### packages/runtypes-devtools

- `ResolverClient` — spawns the Go binary, serialises outstanding queries, parses line-delimited responses.
- The byte-offset rewrite and its source map live in **Go** (the `transform` package — [transform.go](../internal/compiled/transform/transform.go) + [editbuffer.go](../internal/compiled/transform/editbuffer.go); see Rewrite mechanics below). `EditBuffer` is the from-scratch string-editor + source-map generator that replaced `magic-string`, so the published plugin has **no runtime dependencies**; its map matches magic-string's `hires: 'boundary'` segmentation, so the bundler's composite-map chain is byte-for-byte equivalent.
- `unplugin.ts` — the cross-bundler factory + glue. Short-circuits any file that doesn't reference the marker module (or `registerPureFnFactory`) as a cheap pre-filter. Its `transform` hook calls `OpTransform` per file and forwards the returned `{code, map}`; at `buildStart` it runs `OpGenerate` to write the cache modules to disk under `<outDir>/types/`, and the bundler resolves the injected **relative** imports natively (no `resolveId`/`load` virtual-module hooks — the Go side is the single renderer). The `moduleMode` option (forwarded as `--module-mode`) selects the grouping: `default` (per-entry fn modules + the runtype data bundle), `allSingle` (one bundle module per fn family + `pf` bundle + facades folded into the runtypes bundle — fewest modules), or `allModules` (per-node runtype modules, the pre-bundle layout).

## Slot injection and padding

The id is injected at the trailing `InjectRunTypeId<T>` slot. The Go binary returns `ParamIndex` + `ArgsCount` per site; the TS-side `buildInsertion()` pads with `undefined` whenever the caller wrote fewer arguments than `paramIndex`:

```
getRunTypeId<T>()           →   getRunTypeId<T>(undefined, __rt_<hash>)
getRunTypeId(val)           →   getRunTypeId(val, __rt_<hash>)
validate<T>(v)              →   validate<T>(v, __rt_<fnHash>_<hash>)
```

(each `__rt_…` binding is the entry-module tuple imported at the top of the
file; `getRunTypeId` still RETURNS the id string, so the public contract is
unchanged)

`getRunTypeId<T>()` (static form, no value) is padded with one `undefined` so the injected id lands in the trailing slot 1 — the same slot the reflection form `getRunTypeId(val)` appends to after its value at slot 0. The padding mechanism also covers user-defined wrappers with additional intermediate parameters.

## Rewrite mechanics

> **Files-mode (landed).** The mechanism below was originally served as
> **virtual modules** (`virtual:rt/<key>.js`, the plugin's `resolveId`/`load`).
> It now writes every cache module to a **real file** under `<outDir>/types/`
> (default `<srcDir>/__runtypes`, inferred from tsconfig) at `buildStart`
> (`OpGenerate`), and the transform injects **relative** imports to those files
> — so every bundler resolves them natively with no per-bundler virtual-module
> plumbing. `virtual:rt/<key>.js` is still the INTERNAL render specifier; it is
> relativized at the resolver layer (post-render for inter-module imports,
> post-`Apply` for user code), which keeps the transform/entrymod golden corpus
> byte-stable. Read "virtual module" below as "real file under `<outDir>/types/`".
> Build-time enrichment (`<outDir>/enriched/`) and two-way dev sync are deferred
> (not yet implemented).

- Rewrites are positioned by **UTF-8 byte offsets, not string indices** — tsgo positions count bytes. The Go `transform` package ([transform.go](../internal/compiled/transform/transform.go)) applies edits through the in-house `EditBuffer` ([editbuffer.go](../internal/compiled/transform/editbuffer.go) — the from-scratch editor + source-map generator ported from `magic-string`, keeping the published plugin dependency-free; `OpTransform` returns finished code + a real source map and the user's original lines/columns survive the injected import block + bindings) and converts every resolver offset via `makeByteToChar` before indexing. Don't index the source string with a raw resolver offset; multibyte source characters will misalign the inserted hash.
- **Module grouping is configurable** via the plugin's `moduleMode` option (mirrored as the binary's `--module-mode` flag; values in [internal/constants/constants.go](../internal/constants/constants.go)): `default` is described below; `allSingle` bundles EVERYTHING (one module per fn family under `fns/<tag>` with one NAMED export per entry (the same `__rt_` binding name every module mode exports under) plus one `pf` pure-fn bundle, and the reflection facades fold into the runtypes bundle; `Site.Module` / `Replacement.ImportFrom` point the rewrite's clauses at the bundle specifier (the clause shape is the same named import everywhere), and the family bundles join the runtypes bundle as mutable modules invalidated in `handleHotUpdate`); `allModules` splits everything (per-node runtype modules, tuple kind 0 — the pre-bundle layout, kept as an escape hatch; measured slower on dense reflection graphs). The grouping layer is `entrymod.RenderGrouped` + `Resolver.moduleGrouping`; per-entry renderers are identical across modes.
- **Child inlining is configurable** via the plugin's `inlineMode` option (binary `--inline-mode`; values in [internal/constants/constants.go](../internal/constants/constants.go)): `default` applies the NAME RULE — unnamed compounds (arrays/tuples/object literals/unions/classes) inline into their parents (blocks hoist to per-factory context fns — `ctxFn<N>` — instead of per-call IIFEs) while named types (alias or interface) and circular types stay external as dedupe-worthy shared entries (Date/Temporal builtins always inline — atomic emits); `allInternal` is name-blind — everything except circular types inlines. The walker carries its own cycle breaker (`inlineWouldCycle`): a node already on the walk stack always goes external, because `IsCircular` flags only the serializer's re-entry node and union flattening can re-enter a cycle through an unflagged anonymous wrapper (e.g. the `U | undefined` of an optional `a?: U` prop). The two modes never share disk caches (fingerprint folds inlineMode in).
- **Every cache entry is its own virtual module** (default mode) — `virtual:rt/<key>.js` (`<fnHash>_<typeId>` for function entries and JSON composites, `pf/<ns>/<fn>` for pure fns) — EXCEPT runtype nodes, which ride as headless ROWS of THE single data bundle `virtual:rt/runtypes.js` (tuple kind 4: content-hash key, rows array, ONE combined `ini` footer), with a tiny per-reflection-root facade `virtual:rt/<rootId>.js` (kind 5: imports the bundle, carries the root id) so the rewrite's binding-only injection is unchanged. Each node row exists exactly once app-wide, and runtype emission is demand-driven on REFLECTION sites — a createX-only file emits zero runtype modules. Every module exports ONE positional tuple under its BINDING NAME (`__rt_<key>`, identifier-escaped — the same name in the export, every import clause, and the call-site binding; imports never rename): `[kindOrFamilyTag, depsThunk|hole, ini|hole, …legacy positional args]`. Absent slots are JS array HOLES, not a `u`/`undefined` alias (the runtime reads tuples by index, so a hole is indistinguishable from undefined); there is no `const u=undefined;` line. The assembler lives in [internal/compiled/entrymod/entrymod.go](../internal/compiled/entrymod/entrymod.go); the runtime consumer in [packages/ts-runtypes/src/runtypes/entryTuple.ts](../packages/ts-runtypes/src/runtypes/entryTuple.ts) — those two files are the tuple-layout sync boundary. Constants (virtual prefix, binding prefix) come from [internal/constants/constants.go](../internal/constants/constants.go) (mirrored to TS via `pnpm run gen:ts-constants`).
- **Imports and `deps()` carry DIRECT dependencies only** — never the flattened transitive closure (flattening was quadratic text on dense graphs: 6x wire payload / 4x render time on the real suites). Both lists are leaves-first, alphabetical within a dependency level (Tarjan SCC collapse for recursive types), never self (consumers already hold the tuple; dep-less entries leave the deps slot a JS array HOLE — `[tag,,ini,…]` — instead of a thunk), and `deps()` is a lazy THUNK inlined straight into the slot (`()=>[d1]`, no named `const deps=`) — so module-level import cycles never hit TDZ. The runtime's `initFromTuple` walks the thunks RECURSIVELY (post-order, processed-keys guard) in two phases: register every unseen tuple in the closure (children before parents), then run runtype `ini` footers — refs always resolve. `ini` bodies patch through the registry (`c(id)`), never through imported bindings.
- The rewrite injects one deduped import block at offset 0 per user file plus the entry-module BINDING at each call site (`createValidate<T>(__rt_<fnHash>_<id>)`) — no id strings ride along; ids derive from the tuple (slot 3). Entry modules are content-addressed (ids embed the binary version), so they are immutable and never need HMR invalidation — except the runtype data bundle, the ONE mutable module (its rows are the union of reflection demand): the plugin invalidates it in `handleHotUpdate` when a scan reports `addedRunTypes`. The Vite plugin serves bodies verbatim from the `entryModules` map on the resolver's `dump` response. Tests can short-circuit by setting `includeEntryModules: true` on `scanFiles` to receive the same map scoped to **just the files in that request** (per-request projection, not session-wide accumulation — callers wanting everything in memory use `dump`). Demanded entries that get dropped (unsupported kinds, dangling deps) still emit a resolvable `KindMissing` stub module; the runtime degrades to the family identity fn, preserving the old silent-degrade semantics.
- **Builtin classes project atomically** — `Date` / `Map` / `Set` / `RegExp` / Temporal / the non-serializable set stop at subKind + classRef (+ Map/Set element `Arguments`); their lib members are never walked or interned (`projectClass` in [internal/compiled/runtype/serialize.go](../internal/compiled/runtype/serialize.go)). Every consumer keys on subKind — don't reintroduce member expansion.
- Types are **deduplicated twice** in [internal/compiled/runtype/](../internal/compiled/runtype/) — pointer identity (same `*checker.Type` reached via two paths) AND structural id (two distinct `Type` objects with the same shape). Both collapse to a single cache entry.
- **Never store parent-relative data on a canonical node**. Cache entries are shared singletons (one per structural id), so any field whose meaning depends on which parent referenced the node — `parent` back-link, "my slot index in MY parent", "I'm a discriminator for THIS parent union" — is silently wrong the moment that node appears under more than one parent. If a relationship is parent-scoped, store it on the **parent** (e.g. `RunType.UnionDiscriminators` lives on the union, not on the property), or have the consumer build the back-link at walk time from a known root. See [docs/ROADMAP.md](./ROADMAP.md) → "JSON shape — known limitations" for the `parent` row and the union discriminator wire shape rationale.

## Reflection shape

The protocol's `RunType` is the canonical reflection-shape discriminated union. Specifically:

- **Numeric `ReflectionKind`** is declared in a stable order (never=0, any=1, …, callSignature=35) so the integer values are wire-safe across releases. Sentinel `-1` is reserved for ref slots.
- **Container shape**: `KindObjectLiteral.children` is an array of `KindPropertySignature`/`KindMethodSignature`/`KindIndexSignature`/`KindCallSignature` nodes; `KindFunction.parameters` is an array of `KindParameter` nodes; tuple elements are wrapped as `KindTupleMember`.
- **Annotations carried**: `id`, `typeName`, `typeArguments`, `optional`, `readonly`, `abstract`, `static`, `flags`, `default` (literal-only), `classRef` (builtin provenance for lazy-import), `formatAnnotation` (type-format name + canonicalised params), `unionDiscriminators` (parent-scoped, on the union node). Declared in the protocol but **not yet populated**: `inlined`, `isCircular`, `description` — tracked in [docs/ROADMAP.md](./ROADMAP.md) ("Reflection features that need AST-level scanning", status snapshot). The old number `brand` is subsumed by `typeMeta`.
- **Knotted output**: the runtime artifact pre-resolves cycles via a footer of direct child-slot assignments, so `getRunType(id)` hands back a fully-knotted `RunType` graph — no adapter layer needed. Canonical nodes never carry `parent` back-links (cache entries are shared singletons, one per structural id; parent-scoped data lives on the parent — see CLAUDE.md "Never store parent-relative data on a canonical node"). Consumers needing parent pointers build them at walk time from a known root.

Lossy mappings are recorded in [docs/ROADMAP.md](./ROADMAP.md). Highlights:

- Symbol-keyed property names → synthetic `@@<name>` strings + `flags: ["symbol"]`.
- Function/closure-valued `default` → omitted with `flags: ["nonLiteralDefault"]` marker.
- `bigint` literal values → string with `flags: ["bigint"]` (consumer parses with `BigInt(…)`).
- `parent` is never stored on a canonical node (in JSON or the `.ts` artifact); consumers build back-links at walk time. See ROADMAP "JSON shape — known limitations".

Implemented: `templateLiteral` (regex-compile at RT-build time); the full type-format families — string (`TF.String`/`Email`/`UUID`/`URL`/`Domain`/`IP`/…), number/bigint incl. fixed-width binary presets, string date/time/dateTime with min/max bounds, native `Date` bounds, and all 8 `Temporal.*` types (Go: `internal/compiled/typefns/formats/`; JS: `packages/ts-runtypes/src/formats/`); regex literals via AST-trace from `const`-bound initializers. Generic type-metadata is surfaced via `typeMeta` (any `atomic & { obj }` intersection; renamed from `decorators`, subsumes the old number `brand`). Still deferred: `infer`, TS `@decorator`-syntax capture, validating constraint decorators (`MinLength<5>`-style beyond the format brand scanner), runtime-only fields (`function`, `classType`, `enum`).

### Member types and cycle resolution

Member types are the family of nodes that own exactly one child slot — `Array<T>`, `TupleMember`, `Property`, `PropertySignature`, `Parameter`, `IndexSignature` (which adds an `index` key slot alongside its `type`). `Promise<T>` is modeled as a native type with the same single-child shape. They show up everywhere a parent composite needs to point at "the type of this slot".

The wire format keeps these slots small via the `KindRef = -1` sentinel: every child RunType returned by `serialize.Cache.Serialize` is a `{kind: -1, id: "<hash>"}` stub. The canonical full RunType lives once in the cache, keyed by id. JSON consumers detect the sentinel and dereference manually; the runtime derefs during tuple registration (each runtype entry module's `ini` patches its ref slots through the registry) and hands consumers a fully-knotted graph.

Cycles close at two layers without special-case code:

- **Serializer**: the `runtype` serializer in [`internal/compiled/runtype/serialize.go`](../internal/compiled/runtype/serialize.go) reserves the id and inserts a placeholder cache entry **before** projecting the type's children. A recursive walk that re-enters the same `*checker.Type` hits the `byPtr` lookup and gets back the reserved id immediately — no infinite recursion, no second projection.
- **Emit**: the runtype data bundle ([`internal/compiled/runtype/entries.go`](../internal/compiled/runtype/entries.go) + [`internal/compiled/entrymod`](../internal/compiled/entrymod/)) carries one scalar-only row per reflection-demanded node plus ONE combined `ini(rtu)` of direct property assignments (`c('<hash>').child = c('<otherHash>');`). Registration is two-phase — every row registers before the `ini` runs — so back-edges work without forward-reference errors; recursion needs no per-node modules at all because all rows share the bundle. The Vite plugin serves the rendered module strings from the resolver's `dump` response — there's no JS-side renderer to mirror.

Callers walking a member type's child ref can ask the resolver for the canonical RunType via the `resolveId` op (see `OpResolveID` in `internal/protocol/protocol.go`). The returned RunType's child slots remain `KindRef` sentinels — the caller drills in by re-issuing `resolveId` per id.

## Factory reference

The full set of AOT factories. The JIT compiler is replaced by AOT Go emit, so every cache that would otherwise compile at first call is emitted at build time:

| RunTypes (AOT)                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createValidate<T>()`                                                                                                                                                                    |
| `createGetValidationErrors<T>()`                                                                                                                                                         |
| internal `pj`/`pjs`/`rj`/`sj` primitives behind `createJsonEncoder` (strategies `clone`/`mutate`/`direct`) and `createJsonDecoder` (`strip`/`preserve`)                                  |
| `createBinaryEncoder` / `createBinaryDecoder` / `createBinarySizer` (wire spec: typed-int packing, `[index, value]` union encoding; `sizeStrategy: 'dynamic' \| 'precalculate' \| 'initialSize' \| 'intoBuffer'` specialises the returned fn; returns a zero-copy `Uint8Array` view of the written bytes (`intoBuffer` aliases the caller's buffer). `dynamic` seeds its cold-start buffer from a **compile-time, format-aware per-type size estimate** baked into the `tb` entry's trailing tuple slot — `EstimateBinarySize` in [`internal/compiled/typefns/binary_size_estimate.go`](../internal/compiled/typefns/binary_size_estimate.go), tuned by the `sizeBias`/`sizeItems`/`sizeStringBytes`/`sizeMaxBytes` options; runtime history still refines it. The emitted per-write reserves match the format width (packed-int width, exact `serLength` varint) so an in-bounds value over a fixed-width type never grows the cold buffer — pinned by the size fuzz lane, `binarySizeEstimate.integration.test.ts`) |
| first-class factories: `createHasUnknownKeys` / `createStripUnknownKeys` / `createUnknownKeyErrors` / `createUnknownKeysToUndefined`                                                     |
| `createFormatTransform<T>()` (trim / case / replace transforms)                                                                                                                          |
| `createMockType<T>()` — full MockOptions surface, format-aware via the per-kind mock registry                                                                                            |
| `getRunTypeId<T>()` / `getRunTypeId(value)` + `getRTUtils().getRunType(id)`; value-first `./schema` builders return live `RunType<T>` nodes                                              |
| Pure-fn registry (`registerPureFnFactory`, `rtFormats` namespace), with Go-side purity validation (PFE9xxx diagnostics)                                                                  |
| `./formats` brand aliases — string/number/bigint/date-time families, native-`Date` bounds, `Temporal.*`, and custom pattern registration; validation moved to build time                |
| function-shaped work uses `Parameters<typeof fn>` / `ReturnType<typeof fn>`, which tsgo resolves eagerly at the site                                                                     |
| type-level tuple slicing (`Tail<Parameters<typeof fn>>`-style conditional types resolve to concrete tuples at the marker site) — see ROADMAP "function-params router conveniences"       |

Notes:

- Emitting JS ahead of time IS the Go compiler's job, so there is no `toJSCode`-style runtime code generator.
- Types come from the tsgo checker at build time, not from bytecode embedded in the emitted JS, so type-only imports and `typeof` work normally — no `reflection: true` tsconfig or `@reflection never` tags needed.
- `RunTypeOptions.strictTypes` is not wired yet — compose `createValidate` + `createHasUnknownKeys` until it lands (ROADMAP "`strictTypes` validate option").
- Symbols, functions and other non-serialisable members are **dropped** under the serializable-data contract instead of validated (CLAUDE.md "validate contract").
- Decoders return `DataOnly<T>` rather than over-promising bare `T`.

## Shims — reaching into tsgo's `internal/`

### The visibility problem

`microsoft/typescript-go` keeps almost everything we need under `internal/*`:

```
github.com/microsoft/typescript-go/internal/checker
github.com/microsoft/typescript-go/internal/ast
github.com/microsoft/typescript-go/internal/parser
github.com/microsoft/typescript-go/internal/compiler
...
```

Go enforces an [`internal` visibility rule](https://go.dev/doc/go1.4#internalpackages) at the compiler level: a package whose path contains `…/internal/…` may only be imported by code rooted in the same module. So **no external Go program is allowed to import `internal/checker`** — including this one. The TypeScript team did that deliberately: they want freedom to refactor those packages.

A _shim_ is a thin, **publicly-importable** wrapper package that lives outside `internal/` and re-exports the symbols inside. The shim is what makes external Go consumers (this project, the [oxc TypeScript linter](https://github.com/oxc-project/tsgolint), and others) possible.

### Two techniques, mixed

The shim files (under [`third_party/tsgolint/shim/*`](../third_party/tsgolint/shim/), auto-generated by tsgolint's `tools/gen_shims`) use **two complementary techniques**:

**(1) Type aliases** for types, methods, and exported functions:

```go
// shim/checker/shim.go (excerpt)
package checker

import "github.com/microsoft/typescript-go/internal/checker"

type Checker     = checker.Checker     // full method set preserved
type AccessFlags = checker.AccessFlags
const AccessFlagsNone = checker.AccessFlagsNone
```

A type alias preserves the _whole_ method set of the underlying type. Once `Checker` is aliased, every exported method on it — `Checker.GetTypeAtLocation`, `Checker.GetResolvedSignature`, etc. — is callable from outside with no further plumbing. This covers ~80% of the surface.

**(2) `//go:linkname` directives** for unexported helpers we still need:

```go
// shim/vfs/osvfs/shim.go (excerpt)
//go:linkname FS github.com/microsoft/typescript-go/internal/vfs/osvfs.FS
func FS() vfs.FS
```

`//go:linkname` is a Go-runtime escape hatch that says "treat the name on the left as an alias of the symbol on the right at link time," bypassing visibility entirely. It's officially discouraged (and required `-gcflags=-checklinkname=0` for a while) but it's the only way to call genuinely unexported helpers. The shim uses it sparingly — type aliases do the heavy lifting wherever possible.

### How we wire the shim into this module

[`go.mod`](../go.mod) maps the shim import paths into our vendored tsgolint submodule via `replace` directives:

```go
replace (
  github.com/microsoft/typescript-go/shim/ast      => ./third_party/tsgolint/shim/ast
  github.com/microsoft/typescript-go/shim/checker  => ./third_party/tsgolint/shim/checker
  github.com/microsoft/typescript-go/shim/compiler => ./third_party/tsgolint/shim/compiler
  ...
)
```

So when [`internal/program/program.go`](../internal/program/) writes `import "github.com/microsoft/typescript-go/shim/checker"`, it picks up the aliased `internal/checker` from the typescript-go that tsgolint vendors. We never write `internal/*` import paths ourselves — Go would refuse to compile if we did.

### Patches we layer on top

A handful of upstream `internal` symbols that tsgolint _wants_ to alias are themselves unexported (lowercase) in typescript-go. For those, [`third_party/tsgolint/patches/*.patch`](../third_party/tsgolint/patches/) apply small visibility lifts to the nested typescript-go submodule (e.g. uppercase a method name, or expose a constructor). The bootstrap step (`git apply --3way ../patches/*.patch`) applies them on a fresh checkout.

[SETUP.md → Patching tsgolint's typescript-go](../SETUP.md#patching-tsgolints-typescript-go) documents how to add a new patch.

### Maintenance model

- The oxc-project tsgolint repo tracks typescript-go via renovate. Whenever typescript-go bumps, tsgolint regenerates its shim and we pick it up via `git submodule update`. Drift is bounded and automatable.
- The runtime cost of going through a shim is **zero**: aliases and `//go:linkname` are link-time, not runtime constructs.
- When [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516) lands with an official transformer/linter API, we replace the shim imports with that API — call sites in [`internal/program`](../internal/program/), [`internal/marker`](../internal/marker/), and [`internal/resolver`](../internal/resolver/) change; everything else (sentinel detection, structural ids, hash dictionary, cache emission, Vite plugin) stays put.

## Build and test

```bash
# One-time setup:
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && \
  git am --3way --no-gpg-sign ../patches/*.patch)

# Build the resolver:
go build -o bin/ts-runtypes ./cmd/ts-runtypes

# Go test suite — covers atomic reflection kinds + scanFiles detection over the
# fixture suite:
go test ./internal/...

# JS test suites — spawn the real Go binary and assert the full round-trip:
pnpm -C packages/ts-runtypes install
pnpm -C packages/ts-runtypes test
pnpm -C packages/runtypes-devtools install
pnpm -C packages/runtypes-devtools test
```

## Workspace self-imports in tests

Two independent resolvers see `import { … } from 'ts-runtypes'` inside the marker package's own tests, and both must land on the same target:

1. **Vitest / Vite** — runtime resolution. Driven by `resolve.conditions: ['source']` in [`vitest.config.ts`](../packages/ts-runtypes/vitest.config.ts).
2. **tsgo** — the Go-side TypeScript checker invoked by [`runtypes-devtools`](../packages/runtypes-devtools/) to compute runtype ids. Driven by `customConditions: ["source"]` in [`tsconfig.test.json`](../packages/ts-runtypes/tsconfig.test.json).

Both conditions select the `"source": "./src/index.ts"` entry on the marker package's `package.json` `exports` map. External consumers (without `source` in their conditions) fall through to the normal `"types"` / `"import"` / `"require"` entries, getting the built `dist/`. The `"source"` lane is opt-in and workspace-internal.

### Why two condition flags, not one resolver

Vite's resolver and tsgo's resolver are unrelated implementations. Vite reads `resolve.conditions` from `vitest.config.ts`. tsgo reads `customConditions` from the tsconfig it was launched with. Neither sees the other's setting. Wiring both is required for consistent behavior across the runtime path (vitest loads the test module) and the type-checking path (tsgo's marker scan walks call sites).

### How the marker gate plays into this

[`internal/marker/marker.go`](../internal/marker/marker.go) gates whether a `InjectRunTypeId<T>` reference counts as the marker by checking that the alias' declaration lives inside the configured marker package. The check accepts two forms:

1. The declaration is inside an ambient `declare module "<module>" { … }` block (used by [`internal/testfixtures/runtypes.d.ts`](../internal/testfixtures/runtypes.d.ts) and any other synthetic fixture without a real package.json on disk).
2. The declaration's file belongs to an on-disk package whose `package.json` `"name"` equals `<module>`. The check walks parent directories from the declaration file looking for the nearest `package.json` and reads its name. The on-disk directory name is irrelevant — only the `"name"` field matters.

Form 2 is what makes the source-condition path work. When tsgo resolves `ts-runtypes` to `packages/ts-runtypes/src/index.ts`, the marker scanner walks up that path, finds `packages/ts-runtypes/package.json`, reads `"name": "ts-runtypes"`, and accepts. The same check accepts files from `node_modules/ts-runtypes/dist/index.d.ts` for external consumers (its enclosing `package.json` has the same name).

An earlier version of `DeclaredInModule` matched by **file-path string** instead of by `package.json` name — accepting any path containing `/ts-runtypes/`. That worked for `node_modules` consumers but failed for workspace self-imports, where the on-disk directory (`packages/ts-runtypes/`) doesn't contain the published name. To work around it, the marker package shipped a `test/runtypes.d.ts` ambient overlay file mirroring the public API. The package.json walk removed that workaround — there's no overlay file for `ts-runtypes` anymore.

The Go test suite still needs `internal/testfixtures/runtypes.d.ts` because the fixture files live under the monorepo's `internal/` tree, which doesn't have its own `package.json` and shouldn't pretend to be the marker package. The ambient-module form (gate form 1) is the right tool for synthetic fixtures.

## Validate contract — serializable data only

`createValidate<T>()` and `createGetValidationErrors<T>()` validate **serializable data**, not the full TypeScript type. Non-serialisable members (functions, methods, symbols, symbol-keyed properties, getters/setters with no backing data) are **silently dropped** from the validated shape with a build-time **Warning** diagnostic (VL010/VL011/VL012/VL013, VE010/…). This is by design — JSON drops them on the wire anyway, so validating against a JSON-shaped projection of `T` is the right semantic for the typical use case (RPC, persistence, network IO).

Consequence: `interface User { name: string; onClick: () => void }` produces a validator that only checks `name`. A user passing `{name: 'x', onClick: 'not-a-fn'}` will see `isUser(value)` return `true` — the schema **does not enforce** `onClick`. The VL010 warning at build time is the only build-time signal of this; do **not** treat it as an error.

This same rule applies to the JSON / binary serialisation families: a property that can't be serialised silently drops at the **property** position (with a per-family Warning code), while at the **root** or other propagating positions (array element, tuple slot, union member, function param/return) it generates an `alwaysThrow` factory (its throw message rendered at build time and embedded in the entry) with an **Error**-severity diagnostic — calling that factory throws at runtime, so the build halts.

The clean line: **Warning = expected drop, the user should know but it's fine**. **Error = will throw at runtime, build must fail**.

**Decoders return the data-only projection.** `createJsonDecoder<T>()` and `createBinaryDecoder<T>()` return `DataOnly<T>` (the `// #region dataonly-extract` type in [`src/runtypes/dataOnly.ts`](../packages/ts-runtypes/src/runtypes/dataOnly.ts)), NOT bare `T`. A decoded value is reconstructed from JSON/bytes, so it can only ever hold serialisable data — the old `=> T` over-promised methods/`Promise`s/symbols the value doesn't have (calling them type-checked but threw). On a clean DTO `DataOnly<T> ≡ T`, so nothing changes. The projection lives on the **factory overload return** (`JsonDecoderFn<DataOnly<T>>` / `BinaryDecoderFn<DataOnly<T>>`), not on the `JsonDecoderFn`/`BinaryDecoderFn` aliases (those stay `=> T`). **Encoders are unchanged** (they take `T` as input). This is purely a type-level annotation: no runtime or emitter change.

Future direction (out of scope for the current code): we may refine the return type to `ValidateFn<DataOnly<T>>` (where `DataOnly<T>` strips non-serialisable members from the type), rename `createValidate` → `createIsDataType`, or introduce a separate stricter `createIsFullType` that errors instead of dropping. Discuss in [docs/ROADMAP.md](./ROADMAP.md) before changing — current callers depend on the silent-drop semantics.

**Where these drops show up cross-library:** the [cross-library validation alignment report](./cross-library-validation-alignment-report.md) audits where the benchmark competitors (zod, TypeBox, ajv, typia) disagree with ts-runtypes about what counts as valid. The serializable-data drops above are the one place ts-runtypes is intentionally *different* (typia validates function-valued props where we drop them); every other divergence is a competitor being looser than ts-runtypes (ajv/typia accept `NaN`/`Infinity` as numbers, typia accepts Invalid Date), with ts-runtypes always backed by at least one other library.

## Circular-reference guard — opt-in, value-level

The validators / encoders are straight-line walkers with no cycle protection: a runtime **value** that contains a reference cycle (`a.next = a`) makes them recurse until the stack overflows. `setRejectCircularRefs(true)` ([`src/runtypes/circular.ts`](../packages/ts-runtypes/src/runtypes/circular.ts)) arms a guard on the four live-object families — `createValidate`, `createGetValidationErrors`, `createJsonEncoder`, `createBinaryEncoder` (decoders take serialized input, which can't cycle). Off by default; a per-call `{rejectCircularRefs: true}` option on each factory overrides the global flag for that one instance. `rejectCircularRefs` is **runtime-only** — it is deliberately not one of the Go scanner's `ValidateOptions` and the JSON axis hashes only `strategy`, so it never folds into the `fnHash` (a checking and a plain factory for the same `T` share one compiled entry; pinned by `TestRejectCircularRefsExcludedFromFnHash`).

The guard needs the type's reflection **RunType graph** at runtime to pair each value object with its node. createX sites don't normally ship that graph (only `getRunTypeId` reflection sites do), so rather than add a second injection marker — which would break the "exactly one trailing marker" invariant below — the graph rides as a **hidden dependency** of the function entry:

- **Build** ([`internal/compiled/runtype/entries.go`](../internal/compiled/runtype/entries.go), [`internal/resolver/dispatch.go`](../internal/resolver/dispatch.go)): for a type whose reflected closure contains a circular node (`RunType.IsCircular`, set by the serializer's back-edge detection), `CollectEntries` adds its graph as **rows** of the shared data bundle (no facade), and `wireCircularRunTypeDeps` appends the bundle key to the guarded fn entries' `SoftDeps`. Non-circular types and non-guarded families emit nothing — fully demand-driven / pay-for-use.
- **Runtime** ([`entryTuple.ts`](../packages/ts-runtypes/src/runtypes/entryTuple.ts) `resolveEntryTupleFn`): `initFromTuple` already walks the entry's dep closure, so the RunType graph self-registers; the factory recovers the typeId from its entry key, looks up the node, and (when armed + the graph can cycle) wraps the compiled fn. `findCycle` then DFS-walks `(value, RunType)` with add-on-descent / delete-on-ascent identity tracking — shared DAGs pass, only a true back-edge flags. Policy per family: `validate` → `false`, `getValidationErrors` → a `{expected:'circular'}` entry, encoders → throw `CircularReferenceError` (matching `JSON.stringify`).

## Limitations

- The shim locks us into tsgo's internal API surface. A renovate-driven sync on the tsgolint submodule keeps it current.
- Concurrency: `Cache` is not safe for concurrent use; the resolver holds one checker per process and serialises requests.
- A signature carries exactly one injection marker, in the trailing parameter slot — `InjectRunTypeId<T>` for reflection sites or `InjectTypeFnArgs<T, Fn>` for factory sites. Multiple markers per call (or non-trailing position) is a follow-up.
