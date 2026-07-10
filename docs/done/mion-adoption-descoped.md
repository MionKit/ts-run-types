# mion adoption — descoped items (solve at the consumer/mion level)

**Status:** DONE — the scope-decision record for the mion-adoption PR
(`claude/mion-migration-implementation-fgfbda`). See
[`mion-adoption.md`](./mion-adoption.md) for what shipped.
**Principle:** ts-runtypes ships the *tools*; mion owns its own integration. Anything below
is intentionally NOT implemented in ts-runtypes. The tool that covers each case already
exists; the remaining work is mion's to do on its side. The old working trackers
(`mion-adoption-requirements.md`, `mion-migration-findings.md`) were removed when this
landed, so nothing partial or follow-up remains in `docs/todos/`.

---

## Discarded — solved at the mion level

### A2 — pin mion's exact marker *type shape* in our tests
- **Why consumer-level:** the shape being pinned (the `MionRouteTypes` conditional, the
  `hasReturnData` arity probe, the `[Params?, Return?]` pair) is *mion's* type composition,
  not a ts-runtypes tool. ts-runtypes already pins the generic guarantees a wrapper depends
  on: multi-key injection **order**, duplicate rejection (MKR006), and static-vs-reflection
  **form equivalence** (`multifn_keys_test.go`).
- **Tool offered:** unbounded multi-family `InjectTypeFnArgs` + those generic injection tests.
  mion's own e2e is the right place to guard mion's specific type gymnastics.

### A3 — cross-file wrapper sites inside a *self-referential* program
- **Why consumer-level:** this edge only appears when the marker package's own sources are
  BOTH the program roots AND the import target (ts-runtypes' own `tsconfig.test.json`). A
  published consumer imports `@ts-runtypes/core` as a dependency, never as source roots, so
  it cannot hit this. It's an internal test-ergonomics quirk, not a user-facing gap.
- **Tool offered:** wrapper detection works for every real consumer shape (pinned by
  `wrapper-zero-config` + `wrapper-multi-fn` + the node_modules third-party test).

### A4 — marker-alias sugar + a wrapper *recipe* page
- **Why consumer-level:** the verbatim marker works and is documented; recognizing a
  one-level alias (`type RouteHandle<H> = InjectTypeFnArgs<…>`) is cosmetic sugar mion
  doesn't need (it re-exports the symbols, which works). The wrapper recipe is covered by
  the new website guide section ("Asking for several functions at once").
- **Tool offered:** the marker + the guide + a compilable example.

> **A5.1 (multi-slot injection) is IMPLEMENTED in this PR**, not descoped — every marker
> parameter in a signature injects, so `fn(a?: Inject…, b?: Inject…)` fills both. It is the
> tool that makes A5.3's "add another param" workaround real. See the done write-up.

### A5.3 — a `'rt'` / `'rtId'` reflection key inside `InjectTypeFnArgs`
- **Why consumer-level:** reflection metadata (the runtype graph) does not belong on the
  fn-args marker. mion detects what it needs at runtime, with no reflection marker:
  parameter count from `handler.length`, void-return from the validate arity probe
  (`verr([undefined, undefined]).length === 0`). And because **multi-slot injection (A5.1)
  now ships**, a wrapper that wants the runtype graph simply declares a **separate**
  `InjectRunTypeId` parameter alongside its `InjectTypeFnArgs` one — both inject. So the
  fn-args marker stays fn-only. (A fn-only site does not emit the runtype bundle, so deriving
  `getRunType` from the fn handle's embedded typeId is intentionally unsupported — mion adds
  the reflection param instead.)
- **Tool offered:** a separate `InjectRunTypeId` parameter (injects via multi-slot) + the
  runtime probes above.

### B2 — string-input coercion for header params (`"42"` → 42)
- **Why consumer-level:** which fields are headers and how loosely to coerce is transport
  policy. mion coerces header strings before it validates. Not a type-system concern.
- **Tool offered:** validate / decode over the already-coerced, correctly-typed value.

### B3 — `T | RpcError` union with a registered class serializer
- **Why consumer-level:** a union of a class-with-serializer and primitives already
  round-trips through `jsonEncoder`/`jsonDecoder`. The old special-casing of `RpcError` was a
  mion-side optimization mion is dropping in favor of letting the standard union
  encode/decode handle it. No new tool is required.
- **Tool offered:** union serialization + `registerClassSerializer`; mion registers
  `RpcError` and tests its own error-union.

### C1 — public `serializeEntryGraph` / `ingestEntryGraph` wire helpers
- **Why consumer-level:** the building blocks are already public: `getRTFnCaches()` to read
  server-side, `getRTUtils().addToRTCache` / `.addPureFn` to ingest client-side, and
  `getRTFn` to materialize (`new Function`). The dependency-closure walk and the versioned
  wire payload are mion's client-lane design decisions.
- **Tool offered:** the public RT registry + already-serializable code-mode records.

### C2 — runtype-row serialization for reflection-needing clients
- **Why consumer-level:** runtypes are already serializable data. A client that also wants
  `getRunType` graphs serializes the rows it needs through the same public registry. mion
  builds this on top.
- **Tool offered:** serializable cache records + the public registry.

### E2 — jest / plain-tsc consumer recipe
- **Why consumer-level:** `--compile` already produces runnable output for bundler-less
  consumers; wiring it into jest (a transformer, or compile-then-run-over-emitted-JS) is
  mion's build config.
- **Tool offered:** the `--compile` batch mode.

---

## Deferred (not mion's job, but out of scope for this PR)

### E3 — a `Bun.plugin` loader for `@mionkit/bun`
- A transpile-on-load bun loader would be a genuine future ts-runtypes package, not
  something mion should hand-roll. Deferred to a follow-up package; `--compile` is the
  documented bun path in the meantime. Tracked as a ROADMAP idea, not a mion-adoption todo.

---

## Pending decision (see PR discussion)

- **E1** — library-publish recipe for precompiled internal routes. The compiler tool
  (`--compile`) already emits exactly what a library needs (rewritten JS + a real
  `__runtypes/` dir). The only ts-runtypes concern is verifying that when a *consumer* also
  generates cache entries for the same types a precompiled library shipped, the
  content-addressed keys make the duplicate modules harmless. Decision pending: verify +
  state that (small), or discard the whole recipe as mion's build concern.
