# Flaky: binarySizeEstimate fuzz "no-resize lane never ran"

Status: **implemented** on branch `claude/strange-jennings-c18876` (2026-07-05).
Scope: fuzz-harness robustness only ([sizeFuzzRunner.ts](../../packages/ts-runtypes/test/fuzz/binary/sizeFuzzRunner.ts) + its integration test). No product-code change.

## What

[`packages/ts-runtypes/test/fuzz/binary/binarySizeEstimate.integration.test.ts`](../../packages/ts-runtypes/test/fuzz/binary/binarySizeEstimate.integration.test.ts) intermittently failed its coverage-lane guard:

```
AssertionError: no-resize lane never ran: expected 0 to be greater than 0
  expect(report.stats.noGrowChecked, 'no-resize lane never ran').toBeGreaterThan(0);
```

Surfaced during the PFE9012 wiring session (2026-07-05) in a full `pnpm test` run, then passed 3/3 in isolation immediately after and in the next full-suite run.

## Root cause (corrected)

The original hypothesis — "random type/value generation produces no in-bounds no-grow case" — was **wrong**. The fuzz RNG is fully seeded ([seededRng.ts](../../packages/ts-runtypes/test/fuzz/core/seededRng.ts) `withSeededRandom`), so for the test's fixed seed (`0xc0ffee`, 80 iters) the generated types/values are reproducible. Measured in isolation:

- `noGrowChecked` is a **deterministic 63** (8/8 runs); across 20 other seeds the min is 47. It is **never near 0**.
- So `noGrowChecked === 0` cannot come from coverage — it requires **every one of the 80 iterations to hit a `skipped` branch**.

The only non-deterministic input is the resolver child process. `runOne` skips a case when `compileType` returns a `resolverError`, and the cascade is the amplifier: when a client's child dies (crash / failed spawn under full-suite load), its `MessageTransport` is `markClosed`, so **every subsequent request on that client throws** (`resolver is closed`) and skips. One early death per config cascades to skipping the rest of that config; if it happens across all six configs, all 80 skip → `noGrowChecked === 0` → the guard trips with a **misleading** message (it reads as a coverage bug, but the resolver was simply unavailable).

A second finding surfaced during the investigation and was **also fixed** here: `negativesExercised` was mildly non-deterministic (e.g. 23 on the first `runSizeFuzz` call in a process, then a stable 22). Root cause: the oracle's `coldStart()` ([sizeOracle.ts](../../packages/ts-runtypes/test/fuzz/binary/sizeOracle.ts)) reset only `sizeHistory`, not the serializer's other warm map, `stringBytesCache`. On a cache **miss** `serString` reserves worst-case UTF-8 (`MAX_VARINT + 3*charLength`); on a **hit** it reserves the exact cached byte length (tighter). So the first "cold" encode of a value grew the buffer while later ones — reading the now-warm cache — reserved tight and fit. Confirmed by encoding a fixed `/[\w]+/` at seed 12 with `coldStart()` before each call: capacity `24, 12, 12, 12, …`. This is not a product bug (warm-cache tightening is by design), but for the oracle it (a) made the negative lane non-deterministic and (b) could let a warm cache's tight reserve **mask a worst-case under-allocation** the in-bounds lane exists to catch.

## What shipped

In [sizeFuzzRunner.ts](../../packages/ts-runtypes/test/fuzz/binary/sizeFuzzRunner.ts) (items 1-3) and [sizeOracle.ts](../../packages/ts-runtypes/test/fuzz/binary/sizeOracle.ts) (item 4):

1. **Deterministic floor (`runFloor`)** — before the random fuzz, compile a fixed always-eligible type `{ tag: string; items: string[] }` under `SIZE_CONFIGS[0]` (seed 82) and run both lanes. Its in-bounds mock fits the cold buffer (no resize) and its oversized mock inflates an unbounded position far past the tiny seed (grow), so it deterministically drives one no-resize check and one grow. Its counts fold into `stats`, so `noGrowChecked` / `negativesExercised` are `> 0` **by construction** whenever the resolver is reachable — the random fuzz just piles variety on top. This is the todo's requested "seeded floor case", verified to fire both lanes repeatably (config 0 only — config 2's generous bounds don't grow, so the floor pins config 0).

2. **Respawn-on-resolver-death (`runOneWithRespawn`, `RESOLVER_RETRIES = 3`)** — a `resolverError` now flags `OneResult.resolverFailed`; the per-config loop (and the soak loop) close the dead client and retry on a fresh one instead of cascading. A single transient crash costs a respawn, not the rest of the config. `runFloor` retries the same way across its own fresh clients.

3. **Honest failure for a genuinely-dead resolver** — if `runFloor` can't compile a trivial type across all `RESOLVER_RETRIES + 1` attempts, it throws `size fuzz could not compile its floor type … the resolver appears unavailable … This is an environment failure, not a size regression.` — replacing the misleading "no-resize lane never ran" with the real cause. And if the floor's oversized value ever stops growing, it throws a dedicated "negative control lost its teeth (mock-sizing regression?)" — the real product regression the guard exists to catch.

4. **True cold start in `coldStart()`** — reset `stringBytesCache` alongside `sizeHistory` so every checked encode reserves worst-case UTF-8, exactly like a fresh process's first encode. This removes the second finding's non-determinism (a fixed `/[\w]+/` at seed 12 now yields a stable capacity 24 across encodes instead of `24, 12, 12, …`) and strengthens the in-bounds soundness check (no warm-cache tight reserve can mask a worst-case under-allocation).

The integration test's guard assertions are unchanged (now satisfied deterministically); only their explanatory comment was updated.

## Verification

Because the flake is environmental, it was reproduced deterministically by making `bin/ts-runtypes` a pass-through wrapper that fails spawns on demand (vitest's own resolver setup, which runs with the gate env unset, was unaffected):

- **Baseline** — `runSizeFuzz` now reports `noGrowChecked = 64` (floor 1 + fuzz 63): the floor lifts the count.
- **Startup death** — first 2 spawns die → the run still succeeds (`runFloor` recovers on a later attempt).
- **Mid-run death** — spawn #1 (first main-loop client) dies → the config keeps running via respawn, no cascade.
- **Permanent death** — every spawn dies → `runSizeFuzz` rejects with `/resolver appears unavailable/`, not the vacuous guard.
- Integration test: deterministic pass 4/4 in isolation; full `test/fuzz/binary/` suite green; soak path (`RT_FUZZ_SIZE_SOAK_MS`) exercises the same floor+respawn wiring.
- True-cold determinism: a two-pass diff of all 63 checked types over the default seed shows **0 flips** (was 2 regexp flips) with the in-bounds lane still growing **0** values in either pass — soundness intact, no masked under-allocation revealed. `runSizeFuzz` at the default seed now reports a stable `negativesExercised = 25` (was 22/23) across repeats.
