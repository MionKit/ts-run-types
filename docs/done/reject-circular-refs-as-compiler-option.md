# `rejectCircularRefs` as a real compiler option (inline the cycle check)

Status: **DONE — shipped 2026-07-18.** `rejectCircularRefs` is now a compile-time
option that forks the fnHash on the four guarded families; the global
`setRejectCircularRefs` toggle and the `rt::findCycle` co-walker + its RunType
data bundle are gone. Supersedes the type-shape-gated design in
[docs/done/circular-guard-on-demand.md](./circular-guard-on-demand.md). The
original exploration text is preserved below; **what actually shipped differs in
three deliberate ways** (owner-approved):

1. **One orthogonal fnHash suffix, not three axes.** Rather than extend
   `AxisValidateOptions`, invent a `tb` axis, and thread the option into the JSON
   composite + its primitives, the change adds a `CircularGuarded bool` to
   `operations.Operation` and appends `circularCanonicalSuffix` (`~C`) uniformly
   in `Canonical` (fnhash.go). The guard rides at the composite / factory level,
   so the composed JSON primitives (pj/pjs/cj/sj) stay plain — untouched. The
   generated `fnHashes.generated.ts` grows a `C`-suffixed variant per guarded
   family and existing hashes are byte-stable (no prefix churn for consumers).
2. **No conditional normalization (acyclic types).** Circularity is unknown at
   fnHash-injection time, so an armed acyclic type mints a harmless duplicate
   entry (byte-identical body under a distinct key), exactly like a no-op
   `noLiterals`. Accepted as the pay-for-use tradeoff; a follow-up could add a
   post-scan normalization pass if the duplication ever matters.
3. **`findCycle(value, skeleton)` — paths, no ancestor stack.** Open
   question 4's concern (an ancestor stack threaded through the traversal) is
   avoided: `BuildCircularSkeleton` (circular_skeleton.go) bakes the pruned
   cycle-edge PATH graph into the armed factory, and `rt::findCycle`
   (circular-pure-fns.ts) does its own restricted DFS over just those edges with a
   descent stack LOCAL to the pure fn. Nothing is threaded through the emitted
   validator, so child inlining and union arm-trying can't interfere.

Answers to the open questions, as resolved: (1) dropping the global toggle is
accepted; (2) fnHash-prefix churn is a non-issue because existing hashes stay put
and only new `C` variants are added to the generated table; (3) `findCycle`
is a built-in PURE FN taking the paths list in its context (like hasUnknownKeys's
propNames); (4) navigate via baked paths with a self-local stack — no ancestor
stack.

---

## Idea

Today the circular guard is a **separate second walk** of the value: `rt::findCycle`
DFS-walks `(value, RunType)` with a descent stack, entirely apart from the
validate/encode traversal, and it only exists because `rejectCircularRefs` is a
**runtime** flag the build can't see. Consequence (see the companion done-spec):
the walker + the type's RunType data bundle ship for any cyclable type reaching a
guarded factory, whether or not the guard is ever armed.

The proposed alternative: **inline the cycle check into every emitted function**,
at the build-time-known circular re-entry points, and make `rejectCircularRefs` a
normal compile-time option like `noLiterals`:

- The resolver already knows where a type's back-edges are (`RunType.IsCircular`).
  At each such re-entry point the emitter threads an **ancestor list** through the
  recursive descent (add-on-descent / delete-on-ascent, exactly the identity
  discipline `findCycle` uses today) and emits a check:
  `rt::findCycle(value, ancestors)` — walk the parent chain until the parent
  is null (root reached, no cycle) or the current value is found among the
  ancestors (a back-edge → cycle). `findCycle` is tiny (a membership / walk
  up a linked ancestor frame), inlinable or a small built-in pure fn; the ~200-line
  `rt::findCycle` co-walker goes away.
- Because the shape is already baked into the emitted validator/encoder, the cycle
  check needs **no RunType graph at runtime** — so both the walker code AND the
  RunType data bundle that cyclable types ship today for the guard leave the
  bundle.
- `rejectCircularRefs` folds into the family's fnHash, so a checking factory and a
  plain factory for the same `T` compile to **different bodies / different
  entries**, and demand is per-option like every other compiler option — the exact
  granularity the type-shape design couldn't reach.

## The core question: does it mint new function ids, per family?

**Yes — and not uniformly.** The four guarded families span **three different
fnHash axes** ([operations.go](../../ts-go-runtypes/internal/cachegen/operations/operations.go)),
so there is no single place to add the option:

| family | tag | current Axis | what adding `rejectCircularRefs` needs |
| --- | --- | --- | --- |
| validate | `val` | `AxisValidateOptions` | add a letter to the `ValidateOptions` bag ([constants.go](../../ts-go-runtypes/internal/constants/constants.go) `ValidateOptions` = `{noLiterals:L, noIsArrayCheck:A}`) → a new variant suffix (e.g. `validate|C`, `validate|LC`, …) |
| getValidationErrors | `verr` | `AxisValidateOptions` | same bag, same new suffixes |
| createBinaryEncoderFn | `tb` | **`AxisNone`** | `tb` has NO option axis today — it needs a brand-new axis (or a bag) built from scratch |
| createJsonEncoderFn | `jeCL`/`jeMU`/`jeDI`/`jeCO` | `AxisJsonStrategy` | orthogonal to `strategy` → the composite fnHash must fold `strategy × {reject on/off}`, and the change must reach the **composed primitives** (`pj`/`pjs`/`cj`, all `AxisNone`) that actually walk the value |

Consequences of that:

1. **fnHash variant space grows, per family.** `operations.AllFnHashes`
   ([fnhash.go](../../ts-go-runtypes/internal/cachegen/operations/fnhash.go):95) pre-enumerates
   every `(op, subset/strategy)` into the generated `fnHashes.generated.ts` table.
   Adding the option **doubles** the `ValidateOptions` subsets (val/verr: 4 → 8),
   introduces a new tb axis, and doubles the jsonEncoder strategy set. The
   generated table grows and the per-family fnHash **prefixes shift** — and those
   prefixes are a **published contract** kept deliberately stable (see the
   `fnHashSalt` note: the version is intentionally excluded so a consumer like
   mion's `JIT_FUNCTION_IDS` pins `family → prefix` once and never re-pins). This
   is the biggest downstream cost: it moves constants external consumers depend on.

2. **Cache entries: bounded by demand, but two failure modes.**
   - A cyclable type used **both** checking and plain ships **two entries per
     guarded family** (the whole point — pay-for-use precision).
   - An **acyclic** type compiled with `rejectCircularRefs: true` emits a body
     **identical** to the plain variant (nothing to inline) but under a **different
     key** → a redundant duplicate entry. Avoiding it needs a **conditional axis**:
     the option must normalize away (collapse to the plain fnHash) when the type
     can't cycle. The axis system folds options **unconditionally** today, so this
     is new machinery (precedent-ish: MKR004 already warns "`noLiterals` has no
     effect here", but it does not currently collapse the key).

3. **Disk format.** No new field needed (the option rides the fnHash key like
   `noLiterals`), but the generated fnHash mirror regenerates and the version
   history notes the axis addition.

## The unavoidable API consequence: the global runtime toggle can't survive

`setRejectCircularRefs(true)` / `isRejectCircularRefsEnabled()` are a **process-wide
runtime** switch, and today the documented primary way to arm. Once the check is
baked into the emitted body at build time, a body either has the checks or it does
not — you cannot turn them on at runtime. So one of:

- **Drop the global flag** — `rejectCircularRefs` becomes **per-call comptime
  only** (`createValidateFn<T>({rejectCircularRefs: true})`). This is a **breaking
  API change** and removes the "arm everything at once" ergonomic.
- **Keep a runtime toggle** by always emitting the checks and gating them on a
  runtime flag read inside the body — but that ships the checks unconditionally,
  defeating the entire pay-for-use goal.

There is no build-time-visible equivalent of the global flag, so making
`rejectCircularRefs` a compiler option effectively means **removing the global
arm** and making it per-call. That is the central design decision this change
forces.

## What's required (checklist)

- **Emitters (every guarded family):** thread an ancestor stack through the
  recursive descent in the walker
  ([typefunctions/walker.go](../../ts-go-runtypes/internal/cachegen/typefunctions/walker.go))
  and emit the `findCycle` check at each `IsCircular` re-entry point —
  across `validate`, `validationErrors`, the JSON walking primitives
  (`pj`/`pjs`/`cj`) that the `je*` composites wrap, and `toBinary`. This is a
  change to **every emitted body for a cyclable type**, and to the dep-call
  threading (the ancestor list must cross same-family dep-call boundaries).
- **fnHash axes:** extend `AxisValidateOptions` (val/verr); design a new axis for
  `tb`; fold the option into the JSON composite fnHash and propagate the variant
  demand to the composed primitives. Regenerate `fnHashes.generated.ts` and note
  the prefix churn for consumers.
- **Conditional normalization:** collapse the option to the plain key for acyclic
  types so they never double.
- **Scanner:** capture the per-call `{rejectCircularRefs: true}` comptime option
  into `Site.Demand` (it is currently read nowhere) and route it to the variant
  suffix.
- **Runtime:** the small `findCycle` helper (built-in pure fn or inlined);
  delete `rt::findCycle` and the `maybeGuardCircular` wrapper +
  `wireCircularRunTypeDeps`' bundle/walker wiring; **remove or repurpose**
  `setRejectCircularRefs` / `isRejectCircularRefsEnabled` /
  `CircularReferenceError` stays (encoders still throw it) / `typeGraphIsCircular`
  gate is no longer needed at runtime.
- **Noop interaction:** a circular type is never noop today; confirm the inlined
  checks don't perturb the noop predicates, and that the checking variant is never
  elided.
- **Docs + tests:** ARCHITECTURE circular section rewrite; the CircularGuard suites
  move from a runtime-armed model to a comptime-option model (per-call only);
  fnHash mirror + variant tests; mode-parity.

## Wins vs. costs

**Wins:** true pay-for-use (only checking, cyclable types compile any cycle code);
one traversal instead of two when armed (faster); the ~5 KB walker AND the RunType
data bundle both leave every non-armed bundle; `rejectCircularRefs` behaves like a
normal compiler option.

**Costs:** a cross-cutting emitter change across every guarded family + the
composed JSON primitives; three different fnHash axes to extend (one built from
scratch for `tb`); a conditional-normalization mechanism to avoid acyclic
duplication; churn in the **published fnHash prefix constants** external consumers
pin; and the **loss of the global `setRejectCircularRefs` runtime toggle** (a
breaking API change). Cyclable types used both ways double their entries.

## Open questions

- Is dropping the global `setRejectCircularRefs` acceptable, or is the runtime
  toggle a hard requirement? (This alone likely decides go/no-go.)
- Is the fnHash-prefix churn tolerable for downstream consumers (mion), or does it
  need a compatibility shim / version gate?
- `findCycle` inlined vs. a built-in pure fn — bytes vs. dedup.
- Does the ancestor-stack threading interact badly with child inlining
  (`inlineMode`) and union arm-trying (where the same value is walked against
  multiple arms)?
