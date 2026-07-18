# Make the pure-fn cache respect `emitMode`

Status: **TODO — agreed** (owner request 2026-07-18, follow-up from the
demand-driven built-in pure-fn work,
[docs/done/demand-driven-builtin-pure-fns.md](../done/demand-driven-builtin-pure-fns.md)).
No code landed yet.

## Problem — pure-fn tuples ship the body twice, ignoring `emitMode`

The plugin's **`emitMode`** option (`code` | `functions` | `both`; binary
`--emit-mode`) selects what each **type-fn** entry ships in its code/factory
slots — `code` (default) ships only the body STRING and the runtime rebuilds the
factory via `new Function('utl', code)`; `functions` ships only the live
`createRTFn` closure; `both` ships both (for CSP runtimes that read `.code`). The
gating lives in
[typefunctions/module.go](../../ts-go-runtypes/internal/cachegen/typefunctions/module.go)
(the `codeArg`/`createRTFnArg` slots, ~lines 601–607):

```go
codeArg := "undefined"
if opts.EmitMode.EmitsCode() { codeArg = quoteJS(factoryBody) }
createRTFnArg := "u"
if opts.EmitMode.EmitsFactory() { createRTFnArg = createRTFn }
```

**Pure-fn entries ignore `emitMode` entirely.**
[purefunctions/module.go](../../ts-go-runtypes/internal/cachegen/purefunctions/module.go)'s
`CollectEntries(entries []Entry)` (no `opts` parameter) always emits BOTH forms:

```go
args := []string{
    jsquote.Single(entry.Key()),
    jsquote.Single(entry.BodyHash),
    paramNamesJS(entry.ParamNames),
    jsquote.Single(entry.Code),                    // slot 3: the body as a STRING
    depKeysJS(entry.PureFnDependencies),
    createPureFnJS(entry.Code, entry.ParamNames),  // slot 5: a LIVE function(<params>){<code>} literal
}
```

So `entry.Code` is emitted **twice** in every pure-fn tuple — once quoted, once
inside a live function literal — regardless of `emitMode`. At runtime
`initPureFunction`
([rtUtils.ts](../../packages/ts-runtypes/src/runtypes/rtUtils.ts)) only ever uses
the live closure (`compiled.fn = compiled.createPureFn(rtUtils)`); the `code`
string is metadata (bodyHash provenance / a `.code` reader), never materialized
for a pure fn. `registerPureFnTuple`
([entryTuple.ts](../../packages/ts-runtypes/src/runtypes/entryTuple.ts)) copies the
`createPureFn` slot straight through.

Consequences:

- **Wasted bytes.** A `code`-mode build (which drops the live closure for every
  type-fn to save bytes) still ships the live closure for every pure fn — the
  body twice. This now includes the on-demand built-in bodies (`rt::findCycle`,
  the format validators, …), which route through the same `CollectEntries`.
- **Inconsistent CSP story.** `code` mode means "I accept `new Function`". Pure
  fns silently opt out — always shipping a live literal — so the mode's contract
  isn't uniform across the two lanes.

There is no reason for the pure-fn lane to ignore `emitMode`; it predates the
option and was never revisited.

## Goal

Pure-fn entries honor `emitMode` exactly like type-fn entries:

| mode | pure-fn `code` slot | pure-fn `createPureFn` slot |
| --- | --- | --- |
| `code` (default) | body string | dropped (hole); runtime rebuilds via `new Function` |
| `functions` | dropped (hole) | live `function(<params>){<code>}` |
| `both` | body string | live `function(<params>){<code>}` (today's behavior) |

No change to emitted body BYTES within a slot, no public API change, byte-parity
across the two transform wire modes preserved.

## Design

1. **Thread `emitMode` into `purefunctions.CollectEntries`.** Add an
   `emitMode constants.EmitMode` (or a small `opts`) parameter and gate the two
   slots with `EmitsCode()` / `EmitsFactory()`, mirroring the type-fn precedent.
   Three call sites pass it:
   [render.go](../../ts-go-runtypes/internal/compiler/resolver/render.go) (program
   pure fns) and
   [dispatch.go](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go)
   (`serveBuiltinPureFns` + the scanFiles path). The built-in table
   ([builtinpurefns](../../ts-go-runtypes/internal/cachegen/builtinpurefns/))
   needs no change — it stores `code`/`paramNames`, and delivery flows through
   `CollectEntries`, so built-ins inherit the gating for free.

2. **Runtime: a code-mode pure-fn materializer.** When the `createPureFn` slot is
   absent (a hole in `code` mode), `initPureFunction` must build the factory from
   `code` + `paramNames` lazily. The factory literal is
   `function(<paramNames>){<code>}`, so the reconstruction is
   `new Function(...record.paramNames, record.code)` (contrast the type-fn helper
   `new Function('utl', code)` — the pure-fn factory's params are the recorded
   `paramNames`, usually `[]` or `[utl]`). Cache the result on the entry like
   `entryCode` does today. `registerPureFnTuple` sets `createPureFn` from the slot
   when present, else installs a lazy `new Function` builder. Symmetric with the
   type-fn `code`-slot handling.

3. **`functions` mode drops the `code` string.** Set the `code` slot to a hole;
   a `.code` reader in `functions` mode derives it from `createPureFn.toString()`
   if ever needed (same lazy derivation type-fns already do via `entryCode`).

4. **CSP contract becomes uniform.** After this, a `code`-mode pure fn uses
   `new Function` (not CSP-safe without `unsafe-eval`) exactly like a `code`-mode
   type-fn — so a CSP consumer already on `functions`/`both` keeps working, and
   the built-in pure fns (incl. `rt::findCycle`) follow the same rule instead of
   being unconditionally CSP-safe. Document this in the emitMode section of
   [docs/ARCHITECTURE.md](../ARCHITECTURE.md) and CLAUDE.md (the built-in-pure-fn
   bullet currently claims built-ins are "CSP-safe with no `unsafe-eval`
   regardless of emitMode" — that becomes "in `functions`/`both`, like every
   other entry").

## What does NOT change

- Emitted body bytes within a slot; the `bodyHash`/`paramNames`/deps slots.
- The disk fingerprint already folds `emitMode` in (tag on
  [diskcache/fingerprint.go](../../ts-go-runtypes/internal/cachegen/diskcache/fingerprint.go)),
  so modes never cross-read; pure fns are rendered per-session, not per-entry
  disk-cached, so there is no new cross-read surface — but confirm during
  implementation.
- The user pure-fn lane's registration/rewrite contract and the `cfn::` override
  lane.

## Test plan

- **Go:** extend the mode-parity coverage (mirror
  [transform-modes.test.ts](../../packages/ts-runtypes-devtools/test/transform-modes.test.ts)
  / the type-fn emitMode tests) to a pure-fn corpus — assert `code` mode omits the
  live literal, `functions` mode omits the `code` string, `both` ships both, and
  all three are byte-stable. Cover a built-in (e.g. `rt::newRunTypeErr`) so the
  table-served path is exercised.
- **JS:** `initPureFunction` builds a working fn from a `code`-only tuple
  (`new Function(...paramNames, code)`), materialized lazily and cached; a
  `functions`-only tuple runs from the live closure with no `code` string; both
  round-trip identically. Include a pure fn with `paramNames = ['utl']` (a
  composing factory) and one with `[]`. Marker-API tests unaffected.
- **E2E (optional):** a `code`-mode build of a validate+format app shows the
  pure-fn bodies appear once (string), not twice; a CSP `functions`-mode build has
  no `new Function` in any pure-fn path.

## Rollout

1. Thread `emitMode` into `CollectEntries` + gate the two slots (Go).
2. Runtime `code`-mode pure-fn materializer in `initPureFunction` /
   `registerPureFnTuple` (JS).
3. Mode-parity tests (Go + JS).
4. Docs: emitMode sections in ARCHITECTURE.md + the CLAUDE.md built-in bullet
   (CSP wording), then move this spec to `docs/done/`.
