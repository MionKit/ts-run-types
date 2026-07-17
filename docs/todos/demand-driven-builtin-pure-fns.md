# Demand-driven built-in pure functions (and the circular guard on the same rails)

Status: **TODO — agreed spec** (owner discussion 2026-07-17, branch
`claude/circular-bundle-optimization-pvwqrw`). No code has landed yet.

## Problem — code that ships to every app whether it is used or not

The pure-function *demand tracking* is already build-time and per-entry, but the
pure-function *code delivery* for package-owned functions is still "import
everything up front". Three pieces of runtime code ship regardless of use:

| What | Size (minified / gzip) | Ships when | Actually needed when |
| --- | --- | --- | --- |
| `rt::` built-ins ([pure-fns-utils.ts](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts)) | 1.6 KB / 0.7 KB | always (side-effect import in [index.ts](../../packages/ts-runtypes/src/index.ts), "Side-effect import" comment block) | an emitted body references one (`verr`, unknown-keys families) |
| `rtFormats::` bodies ([string-formats-pure-fns.ts](../../packages/ts-runtypes/src/formats/string/string-formats-pure-fns.ts) + [dateTime-pure-fns.ts](../../packages/ts-runtypes/src/formats/datetime/dateTime-pure-fns.ts)) | 9.7 KB / 2.3 KB | app imports `ts-runtypes/formats`, all-or-nothing | only the formats the app's types actually use |
| circular-reference walker ([circular.ts](../../packages/ts-runtypes/src/runtypes/circular.ts)) | 5.0 KB / 1.8 KB (drags in [runTypeKind.ts](../../packages/ts-runtypes/src/runTypeKind.ts)) | always (static import in [entryTuple.ts](../../packages/ts-runtypes/src/runtypes/entryTuple.ts)) | a createX type can actually contain a cycle AND the guard is armed |

Why bundlers cannot fix this themselves:

- `entryTuple.ts` → `resolveEntryTupleFn` → `maybeGuardCircular` → `findCycle`
  is a live reference chain on every createX path (the per-call
  `{rejectCircularRefs: true}` option can arm the guard through plain data, no
  import needed), so the walker is semantically reachable code.
- `registerPureFnFactory(…)` calls are top-level side effects; a bundler must
  keep them once the registering file is imported, and `index.ts` /
  `formats/index.ts` always import them.

Supporting evidence found during the investigation:

- **Demand is already tracked.** Every Go emission of
  `utl.getPureFn('<ns>::<fn>')` is paired with `ctx.AddPureFnDependency(…)`
  today (4 direct sites in
  [validationerrors.go](../../ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go),
  [unknownkeys_errors.go](../../ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_errors.go),
  [unknownkeys_shared.go](../../ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go),
  plus `PureFnAlias` in
  [formats/emit.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go)
  covering every `rtFormats::` reference). But the pairing is a manual
  convention with no enforcement, and a miss is currently invisible because the
  side-effect import registers everything anyway.
- **The tracked list goes nowhere at runtime.** The tuple's
  `pureFnDependencies` slot has zero runtime consumers; fn-entry module
  `SoftDeps` carry only cross-family edges
  ([typefunctions/module.go](../../ts-go-runtypes/internal/cachegen/typefunctions/module.go),
  the `SoftDeps: crossFamilyDeps` construction). Registration is satisfied by
  the side-effect import instead.
- **The Go side already distrusts that lane.** The comment in
  [formats/emit.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go)
  ("pf_formatErr … isn't part of a consumer's program … would resolve to
  undefined") contradicts the runtime reality (index.ts does import the file)
  and led to `formatErr` being inlined as a workaround. The comment must be
  fixed either way.
- **Three of the six `rt::` built-ins appear dead**: `rt::asJSONString` (no
  production emission site), `rt::formatErr` (inlined, see above),
  `rt::sanitizeCompiledFn` (no consumers found anywhere). Roughly half of the
  always-shipped 1.6 KB. Needs one final usage sweep before deletion.
- **Formats are a runtime footgun today**: an app validating an `Email` field
  that forgets the value import of `ts-runtypes/formats` gets
  `pf_isEmail === undefined` inside the emitted body — a runtime TypeError
  (confirm exact failure mode during implementation). After this change the
  import is no longer needed for validation at all.

## Goal

Package-owned pure-function code is included in an app bundle **only when the
build demands it**, delivered through the same cache-entry machinery user pure
functions already use. No public API changes, no changes to emitted body bytes.

Non-goals:

- **User ("external") pure fns stay registration-driven.** Their register call
  site is the demand: we cannot statically know who calls
  `getPureFnByKey(wireReceivedKey)` at runtime, so pruning "unused" user
  registrations would break the API contract. (Their bodies are already
  cache-only — the rewrite replaces the factory argument with the entry-module
  binding.)
- The mocking registries riding `formats/index.ts` (mockStringFormat etc.) are
  a separate, non-pure-fn lane and are untouched here.

## Design

### A. One choke point for pure-fn references: `ctx.UsePureFn(ns, fnName)`

Promote [formats/emit.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go)'s
`PureFnAlias` pattern into a shared `EmitContext` method that does all three
steps at once: record the dependency, hoist the deduped
`const <alias> = utl.getPureFn('<ns>::<fn>')` prologue line, return the alias.

```go
// the ONLY way an emitter references a pure fn
fnVar := ctx.UsePureFn("rt", "hasUnknownKeysFromArray")
return objectGuard(v, fnVar+"("+v+", "+conditional+")")
```

Migrate the 4 direct call sites; `PureFnAlias` becomes a thin wrapper. A raw
`utl.getPureFn` string anywhere else in the emitters is then a review smell.

Safety net: a corpus tripwire test (same pattern as
[noop_predicate_test.go](../../ts-go-runtypes/internal/compiler/resolver/noop_predicate_test.go))
renders the fixture corpus and asserts every `getPureFn('…')` /
`usePureFn('…')` key found in a rendered live body is present in that entry's
recorded dependency list. This matters because after this spec lands, a missed
recording is no longer masked — it becomes a missing import.

### B. Built-in bodies move into the binary via a generated table

For a published consumer the package is dist + `.d.ts` — there is nothing for
the extractor to extract, which is the whole reason the side-effect-import lane
exists. Replace that lane with a **codegen step** (a `pnpm rtx core codegen`
family member with a `--check` CI lane, like the existing generated mirrors):

- runs the existing pure-fn extractor
  ([purefunctions](../../ts-go-runtypes/internal/cachegen/purefunctions/)) over
  the built-in source files in `packages/ts-runtypes/src/`,
- emits a generated Go table:
  `builtinPureFns: key → {code, paramNames, bodyHash, pureFnDependencies}`,
- the resolver serves entries from this table whenever a built-in key is
  demanded.

The TS files stay the single authored, type-checked source of truth; the table
is how bodies reach consumers. Transitive built-in → built-in deps (e.g.
`isDateString_YMD` → `isDateString`) come out of the extractor exactly as they
do for user fns, so the existing SoftDeps closure over pure-fn entries keeps
working.

Precedence rule: in-repo programs (this repo's own tests resolve the package
`src/`) would extract the same registrations live — the program extractor must
skip the built-in files (or the table wins on key clash) so there is exactly
one producer per key.

### C. Demanded built-ins ride the module graph like every other entry

The recorded pure-fn deps of a live-rendered fn entry are appended to that
entry's `SoftDeps`. The assembler then does what it already does for
cross-family edges: emit the import and put the binding in the deps thunk
(slot 1), which `initFromTuple` registers before anything materializes.

```js
import {__rt_pf$2Frt$2FnewRunTypeErr} from 'virtual:rt/pf/rt/newRunTypeErr.js';
export const __rt_ve1_abc = ['verr', () => [__rt_pf$2Frt$2FnewRunTypeErr], , 've1_abc',
  /* … ArgsText unchanged, body still says utl.getPureFn('rt::newRunTypeErr') … */];
```

Key property: **the emitted body does not change by a single byte.** Bodies
stay self-contained (`new Function('utl', code)` in `code` emitMode cannot see
module bindings — the constraint documented in
[purefn_aliases.go](../../ts-go-runtypes/internal/cachegen/typefunctions/purefn_aliases.go)),
and the registry is guaranteed populated before any body runs because deps
register first. This was the decisive argument against passing the imported
tuple as a second `getPureFn` argument.

Hardening that becomes possible once delivery is build-owned:

- a demanded built-in key **missing from the table is a build error**, not a
  `KindMissing` stub (stubs currently exist precisely because "the runtime
  registers pure fns at their own call sites" — that excuse disappears);
- the PFE9012 built-in-namespace exemption in
  [purefunctions/index.go](../../ts-go-runtypes/internal/cachegen/purefunctions/index.go)
  flips: `rt::` / `rtFormats::` deps are validated against the table instead of
  being taken on faith.

### D. Disk cache: persist the pure-fn refs (FormatVersion v13 → v14)

Warm entries rebuild `SoftDeps` from persisted fields
([diskcache/format.go](../../ts-go-runtypes/internal/cachegen/diskcache/format.go):
`ChildRefs`, `CrossFamilyRef`). Add a parallel `PureFnRefs` field so warm
entries recover their pure-fn edges without re-rendering, and bump
`diskcache.FormatVersion` (the version history in format.go is the changelog).
`ArgsText` is untouched — only the new field is added.

### E. Dist ships hollow registration files; side-effect imports stay

The side-effect imports in `index.ts` and `formats/index.ts` are **kept** — but
the dist build hollows the built-in registration files so they cost scaffolding
bytes only (~0.3 KB instead of 1.6 + 9.7 KB):

- every factory body is removed; the marker comment `/** <ns>::<name> */`
  plus the `null` factory value and padding newlines **inside the comment**
  keep the file's line count identical to `src/` (stack traces and maps line
  up with the source);
- `.d.ts` output is unchanged.

Shape (exact formatting is an implementation detail of the hollow transform;
the padding and the null ride with the marker comment so each fn reads as one
deliberate block):

```ts
export const pf_newRunTypeErr = registerPureFnFactory('rt::newRunTypeErr', null /** rt::newRunTypeErr
(hollowed — the body ships via the pure-fn cache when demanded)


*/);
```

Runtime change this needs: `registerCore` in
[pureFn.ts](../../packages/ts-runtypes/src/runtypes/pureFn.ts) currently
**throws** for a null/absent factory with no cache entry. The null lane becomes
an inert no-op (return a harmless placeholder; a later `getPureFn` miss should
say "known built-in, not demanded by this build — is the plugin active?"). When
the cache entry already arrived through a deps thunk, today's code already
returns it untouched (null is falsy, so no override) — that stays.

Why keep the imports at all: upgraded apps keep working with **zero code
changes and no double-shipping** — an app still importing `ts-runtypes/formats`
bundles the hollow scaffolding, not 9.7 KB of duplicate bodies. The import
becomes unnecessary for validation (docs update), but never harmful.

### F. Cleanup rides along

- Delete `rt::asJSONString`, `rt::formatErr`, `rt::sanitizeCompiledFn` after a
  final usage sweep (tests, website, devtools dist).
- Fix the stale "would resolve to undefined" comment in `formats/emit.go`.

### G. Follow-up: the circular guard on the same rails

Once A–E exist, the circular-reference walker becomes one more demand-delivered
built-in (`rt::findCycle`) — the original motivation for this work. It is
specced on its own in
[circular-guard-on-demand.md](./circular-guard-on-demand.md): the walker moves
into a pure fn, its demand is wired by **type shape** (`wireCircularRunTypeDeps`
appends `rt::findCycle` to the same guarded-entry `SoftDeps` it already uses for
the RunType data bundle) rather than a body reference, and `maybeGuardCircular`
resolves it via `utl.getPureFn('rt::findCycle')` instead of the static import.
The only thing it needs from this spec is the delivery mechanism (B–E).

## What does NOT change

- Public API: `registerPureFn*`, `getPureFn`/`usePureFn`/`getPureFnByKey`,
  `setRejectCircularRefs`, per-call `{rejectCircularRefs}` — all unchanged.
- Emitted body bytes and `ArgsText` — unchanged (mode parity untouched).
- User pure-fn lane and the `cfn::` override lane — unchanged (overrides
  already ride `SoftDeps`, the model this spec generalizes).
- The no-plugin path — without the plugin there are no emitted entries, only
  identity fallbacks, so nothing ever looks a built-in up.

## Expected wins

- Every bundle: −1.6 KB (`rt::` built-ins, now demand-only) and −5.0 KB
  (walker, now cycle-capable-types-only), minified.
- Formats apps: 9.7 KB all-or-nothing becomes per-format (an Email-only app
  ships a few hundred bytes), and the forgot-the-import runtime footgun is
  eliminated.
- A verifiable contract (build error / PFE9012) replaces the on-faith
  side-effect registration lane.

## Test plan

- Go: table codegen `--check`; `UsePureFn` migration; SoftDeps wiring incl.
  transitive built-in closure; demanded-but-missing-builtin build error;
  PFE9012 flip; disk-cache v14 warm/cold parity (mirror
  module_disk_crossfamily_test); corpus tripwire from section A.
- JS: existing suites must stay green with the side-effect lane hollowed —
  especially the CircularGuard suites (validation / serialization / format-*)
  and unknown-keys/validationErrors suites; `registerCore` null-lane unit
  tests. Marker-API tests cover BOTH `getRunTypeId` call shapes per the marker
  test coverage rule.
- E2E (verdaccio lane, `pnpm rtx release e2e`): a published consumer app that
  (1) uses `verr`/unknown-keys without importing anything beyond the root,
  (2) validates a format type WITHOUT importing `ts-runtypes/formats`,
  (3) round-trips a circular type with the guard armed — across the bundler
  matrix.
- Size assertion (optional): a bench/e2e check that a minimal validate-only
  app's bundle contains no `rtFormats::` or walker code.

## Rollout order (each phase independently landable)

1. `ctx.UsePureFn` + corpus tripwire (no behavior change).
2. Built-in table codegen + resolver serving + SoftDeps wiring + missing-key
   build error + PFE9012 flip + disk v14. Side-effect imports still present
   (registration is now redundant but harmless — proves parity).
3. Hollow dist transform + `registerCore` null lane. Bundles shrink here.
4. Dead built-in deletion + `formats/emit.go` comment fix.
5. Docs: website formats guide (import no longer needed for validation),
   ARCHITECTURE.md pure-fn + circular sections, CLAUDE.md pointers.
6. Circular walker migration — its own spec
   ([circular-guard-on-demand.md](./circular-guard-on-demand.md)) — then move
   this spec to `docs/done/`.

## Open implementation details (settle in their PRs)

- Exact hollow-block formatting (owner preference: null + padding ride inside
  the marker comment) and whether the transform drops the argument entirely
  (then `registerCore` treats `undefined` like `null`).
- The inert placeholder `registerCore` returns for a hollowed call.
- Table codegen home (`scripts/` vs a Go generator) and generated-file naming,
  following the existing generated-mirror conventions.
- Namespace note: the anonymous lane also injects `rt::<contentHash>` keys —
  collision with built-in names is practically impossible (hash charset), but
  the table producer should assert no clash anyway.
