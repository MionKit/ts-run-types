# Flaky: binarySizeEstimate fuzz "no-resize lane never ran"

**Status:** observed (pre-existing), needs a robustness fix
**Severity:** low (test-only flake; no product bug)

## What

[`packages/ts-runtypes/test/fuzz/binary/binarySizeEstimate.integration.test.ts`](../../packages/ts-runtypes/test/fuzz/binary/binarySizeEstimate.integration.test.ts) intermittently fails its coverage-lane guard:

```
AssertionError: no-resize lane never ran: expected 0 to be greater than 0
  expect(report.stats.noGrowChecked, 'no-resize lane never ran').toBeGreaterThan(0);
```

The test asserts the fuzz run actually exercised each lane (in-bounds/no-grow, and the negative control). On some runs the random type/value generation produces no in-bounds no-grow case, so `noGrowChecked` stays 0 and the vacuous-run guard trips.

## Evidence it is pre-existing / unrelated to PFE9012

- Surfaced during the PFE9012 wiring session (2026-07-05) in a full `pnpm test` run, then passed 3/3 in isolation immediately after and in the next full-suite run.
- The fuzz harness ([typeFuzzHarness.ts](../../packages/ts-runtypes/test/fuzz/type/typeFuzzHarness.ts)) types `ts-runtypes` through the ambient `RUNTYPES_DTS` stub (zero pure-fn registrations), so PFE9012's "mechanism present" guard suppresses it there — the diagnostic never enters this test's path. Binary encoders (`tb`/`fb`) record no pure-fn deps either.

## Fix direction

Make the lane guard non-vacuous deterministically instead of relying on random coverage: seed the generator (or inject a fixed pair of in-bounds + oversized cases) so `noGrowChecked` and `negativesExercised` are guaranteed > 0, then let the fuzz add variety on top. Alternatively raise the iteration count until the lanes are statistically certain, but a seeded floor case is the robust fix.
