// Per-test-file setup. Wired via vitest.config.ts `setupFiles`. Runs
// once per test file (inside the worker), so the afterAll registered
// here applies to every test in every file automatically.
//
// In this package the resolver is owned by the vite-plugin instance
// installed in vitest's vite pipeline — the plugin spawns + closes
// the binary itself via its `configResolved` / `buildEnd` hooks. No
// per-file reset is needed today (each test file's transform happens
// once at vite-load time; the resolver's cumulative cache is harmless
// to subsequent tests because the rewrite IDs are deterministic
// hashes of type structure).
//
// File kept so the wiring matches `packages/runtypes-devtools/test/
// setup.ts` and so future expansions (multiple test files needing
// state isolation) drop in cleanly.

// Temporal polyfill for the test runtime. Node < 26 has no global
// `Temporal` (it shipped unflagged in Node 26 / ES2026); the sandbox runs
// Node 22, so Temporal mock + serialization tests would otherwise throw at
// `Temporal.PlainDate.from(...)`. Install the polyfill as the global so the
// emitted runtime code (which references `Temporal.*` / `globalThis.Temporal`)
// resolves. Production consumers on Node 26+ use the native global; this is a
// test-only devDependency.
import {Temporal} from 'temporal-polyfill';

if (typeof (globalThis as {Temporal?: unknown}).Temporal === 'undefined') {
  (globalThis as {Temporal?: unknown}).Temporal = Temporal;
}
