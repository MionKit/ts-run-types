# Load the circular-reference walker only when a type can cycle

Status: **DONE — shipped 2026-07-17** on branch
`claude/demand-driven-builtin-pure-fns-1vnwip`. `findCycle` moved into the
`rt::findCycle` pure fn ([circular-pure-fns.ts](../../packages/ts-runtypes/src/runtypes/circular-pure-fns.ts),
kind/subKind values inlined so the body stays self-contained under `new
Function`); `circular.ts` sheds the walker + the `RunTypeKind` import, keeping only
the arm flag, error class, `formatCircularPath`, `typeGraphIsCircular`, and
`CircularPath`. `maybeGuardCircular` fetches the walker via
`utils.getPureFn('rt::findCycle')` and threads it into the guard wrappers;
`wireCircularRunTypeDeps` appends `rt::findCycle` to guarded cyclable entries'
SoftDeps (demand by type shape). Rode the general delivery mechanism from
[demand-driven-builtin-pure-fns.md](./demand-driven-builtin-pure-fns.md). The
original spec text is preserved below for reference.

## Problem

The circular-reference guard's walker is bundled into **every** app that uses
any `createX` factory, even though it does real work only when the app both
arms the guard (`setRejectCircularRefs(true)` or a per-call
`{rejectCircularRefs: true}`) **and** validates/encodes a type that can actually
contain a cycle. Both are rare; most apps never cycle.

The code lives in
[circular.ts](../../packages/ts-runtypes/src/runtypes/circular.ts) and is pulled
in statically by
[entryTuple.ts](../../packages/ts-runtypes/src/runtypes/entryTuple.ts) (line 49),
which is core runtime — so it can never be tree-shaken away.

Measured cost of the always-shipped walker: **~5.0 KB minified / ~1.8 KB gzip**,
including the [runTypeKind.ts](../../packages/ts-runtypes/src/runTypeKind.ts)
enum tables it drags in.

The build already knows which types can cycle. The Go resolver computes
`CircularGuardTypeIDs` and, in `wireCircularRunTypeDeps`
([resolver/dispatch.go](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go)),
links the RunType **data** bundle into the dependency closure of exactly the
guarded fn entries whose type cycles. So the *data* is already demand-driven —
only the walker *code* is static.

## Goal

Move the walker so it is loaded **only** into bundles that have at least one
cycle-capable `createX` type — by making it a pure function
(`rt::findCycle`) delivered through the same on-demand cache-entry machinery
every other pure function uses. No public API change; the guard behaves exactly
as today when armed.

## What moves, what stays

The heavy part of `circular.ts` is one function; the rest is small and stays put.

**Moves into the pure function `rt::findCycle` (loaded on demand):**

- `findCycle(value, rt)` — the ~200-line value/RunType co-walker, **and** its
  `RunTypeKind` / `RunTypeSubKind` dependency (verified: those enums are used
  *only* inside `findCycle`'s walkers, nowhere else in the file). Moving it out
  is what sheds both the walker and the enum tables from the base bundle.

**Stays static (small, always present):**

- `setRejectCircularRefs` / `isRejectCircularRefsEnabled` — the arm flag (public
  API, exported from [index.ts](../../packages/ts-runtypes/src/index.ts)).
- `CircularReferenceError` + `formatCircularPath` — the error the encoders throw
  (public API).
- `typeGraphIsCircular(rt)` — the per-type gate that decides whether to wrap.
  It is enum-free (it only reads the boolean `node.isCircular` and walks ref
  slots), so keeping it static costs ~35 lines and preserves the precise
  per-type check (no wasted walks on non-cyclable types).
- `CircularPath` type.
- The per-family guard wrappers (`circularGuards`) and `maybeGuardCircular` in
  `entryTuple.ts` — these stay, but fetch the walker from the registry instead
  of importing it (below).

## The circular-specific twist: demand is type-shape, not a body reference

For a normal built-in pure fn (e.g. `rt::newRunTypeErr`), demand is a **text
reference** — the emitted validator body literally contains
`utl.getPureFn('rt::newRunTypeErr')`, so the resolver records it from the body.

`rt::findCycle` is different: **no emitted body ever calls it.** It is called
only from the runtime guard wrapper (`maybeGuardCircular`), which is core code,
not generated. So its demand cannot be discovered from body text. Instead the
resolver wires it by **type shape**, reusing the machinery that already exists:

> Extend `wireCircularRunTypeDeps` so that for every guarded fn entry whose type
> cycles — the exact set it already computes — it appends `rt::findCycle` to
> that entry's `SoftDeps`, right alongside the RunType data-bundle dep it
> already appends.

The guarded families are unchanged (`circularGuardedFamilyTags`: `val`, `verr`,
`tb`, and the four `createJsonEncoder` composites `jeCL`/`jeMU`/`jeDI`/`jeCO`).
Result: the walker's pure-fn module registers precisely when a cycle-capable
`createX` entry registers, and never otherwise.

## Runtime resolution

`maybeGuardCircular` already receives `utils`, so it can pull the walker from
the registry when arming the guard. The gate stays; only the source of
`findCycle` changes.

```ts
// entryTuple.ts (sketch)
function maybeGuardCircular(fnName, fn, rt, utils) {
  if (!rt) return fn;
  const guard = circularGuards[fnName];
  if (!guard || !typeGraphIsCircular(rt)) return fn;       // per-type gate, unchanged
  const findCycle = utils.getPureFn('rt::findCycle');       // on-demand walker
  if (!findCycle) return fn;                                // fail-open (see soundness)
  return guard(fn, rt, findCycle);                          // wrappers take it as a param
}
```

The `circularGuards` closures change only in that they receive `findCycle` as a
parameter instead of closing over the import. Because `typeGraphIsCircular(rt)`
is true exactly when Go wired `rt::findCycle` into this entry, the lookup is
guaranteed to hit whenever the gate passes — the `if (!findCycle)` branch is a
defensive fail-open, not a normal path.

## Prerequisite: how the walker body reaches a consumer bundle

For an app that consumes the published package (dist + `.d.ts`, no source to
extract from), the `rt::findCycle` body has to travel through the binary. That
is exactly the general problem solved by
[demand-driven-builtin-pure-fns.md](./demand-driven-builtin-pure-fns.md)
(built-in pure-fn bodies emitted from a generated table, delivered via
`SoftDeps` + the tuple deps thunk, disk-cache format bump). **That mechanism is
a hard prerequisite for the consumer win** — this doc is one consumer of it, and
the only additional Go work here is the `wireCircularRunTypeDeps` extension
above.

Standalone alternative (only if circular must land before the general
mechanism): ship the walker as a real dist module on its own subpath and have
the emitted `virtual:rt/pf/rt/findCycle.js` re-export from it, so it is a real
pure-fn entry whose body is a shipped file imported only when demanded. This
avoids the table but adds a new package subpath and the "a generated virtual
module imports a real package file" novelty, and it special-cases circular.
Prefer the general table; keep this in pocket. Owner decides in the PR.

## Soundness (why build-time gating is safe)

Same one-directional contract as the noop-elision predicate:

- The guard only engages on a **real emitted-entry hit** — every
  identity-fallback path in `resolveEntryTupleFn` returns before the guard — so
  the resolver has seen every guardable type at build time.
- The per-type gate `typeGraphIsCircular(rt)` stays, and Go's build-time
  circularity check (`closureHasCircular`) drives the wiring, so the two agree:
  gate true ⇒ walker wired ⇒ walker present.
- Value-first `circular()` / `self()` schemas are covered because ids are
  structural — a schema resolving to an emitted entry carries exactly the
  circularity Go computed for it.
- The only residual risk is one-directional and harmless-leaning: an emitter bug
  that ships no walker for a cyclable type makes the guard **silently absent**
  (a cycle would go undetected) — never a crash, never a false cycle report.
  Pin it with a Go test, mirroring the noop-predicate corpus test.

## Expected win

- Minimal validate/encode apps (the common case): **−~5.0 KB minified** — the
  walker and the `RunTypeKind` tables leave the base bundle. The arm flag +
  error class stay (~0.3 KB), so `setRejectCircularRefs` and
  `CircularReferenceError` remain importable with no walker attached.
- Apps that actually have a cycle-capable type pay for the walker **only then**,
  and only once (single app-wide `rt::findCycle` entry).

## Test plan

- **JS** — existing CircularGuard suites must stay green with the walker moved:
  [validation/CircularGuard*](../../packages/ts-runtypes/test/suites/validation/),
  serialization, format-validation, format-serialization, and
  [CircularGuardModes](../../packages/ts-runtypes/test/suites/validation/CircularGuardModes.test.ts)
  (global flag + per-call override). Cover armed-guard behavior across all four
  guarded families and, per the marker test-coverage rule, both `getRunTypeId`
  call shapes where a test reflects a type.
- **Go** — a resolver test asserting `wireCircularRunTypeDeps` appends
  `rt::findCycle` to the `SoftDeps` of a guarded entry over a cyclable type and
  appends nothing for a non-cyclable one; plus the soundness tripwire (every
  cyclable guarded entry ships the walker).
- **E2E** (verdaccio lane, `pnpm rtx release e2e`) — a published-consumer app
  that arms the guard and round-trips a circular type, asserting the cycle is
  detected, across the bundler matrix. A companion size assertion: a
  non-cyclable validate-only app's bundle contains no walker / `RunTypeKind`
  code.

## Rollout

1. (Prerequisite) demand-driven built-in pure-fn delivery
   ([companion spec](./demand-driven-builtin-pure-fns.md)) — or the standalone
   subpath alternative above if circular must go first.
2. Split `circular.ts`: move `findCycle` into the walker pure-fn source; keep
   the flag, error class, `typeGraphIsCircular`, and `CircularPath` static.
3. `entryTuple.ts`: `maybeGuardCircular` fetches `rt::findCycle` from the
   registry; the `circularGuards` wrappers take `findCycle` as a parameter.
4. Go: extend `wireCircularRunTypeDeps` to also append `rt::findCycle`; add the
   resolver + soundness tests.
5. Docs (README / ARCHITECTURE circular section, website serialization guide)
   and move this spec to `docs/done/`.
