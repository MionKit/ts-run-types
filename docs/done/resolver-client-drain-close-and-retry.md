# ResolverClient: drain on close + respawn-retry (buildEnd hard-close kills in-flight requests)

**Status:** done — implemented 2026-07-20 on this branch (all four fix-plan points).
`MessageTransport.close()` drains in-flight requests (bounded by a 5s timer) before
`stdin.end()`/`kill()`; `ResolverClient.send()` respawns the child once per loss and
replays the interrupted request (exact-reason match on the transport-injected
`resolver exited` / `spawn failed` strings, deduped across concurrent callers, lifetime
budget of 3, never after an intentional `close()`, `serverMode` excluded — its child
state can't be replayed); the unplugin refcounts `buildStart`/`buildEnd` pairs and
closes the shared resolver only when the LAST container tears down; regression suite in
`packages/ts-runtypes-devtools/test/resolver-lifecycle.test.ts` (drain, fail-fast after
intentional close, post-death respawn, in-flight replay, two-container refcount).
**Created:** 2026-07-20

## Problem

The unplugin lifecycle hard-closes the resolver while requests can still be in flight:

- [packages/ts-runtypes-devtools/src/unplugin.ts](../../packages/ts-runtypes-devtools/src/unplugin.ts)
  `buildEnd() { resolver?.close(); }` — no drain.
- `close()` (transport close hook in
  [packages/ts-runtypes-devtools/src/resolver-client.ts](../../packages/ts-runtypes-devtools/src/resolver-client.ts))
  runs `stdin.end()` + `child.kill()` immediately. In `--one-shot` mode the binary exits 0
  on stdin EOF with no output, so the death is silent (stderr is `inherit`; a panic would
  be visible).
- The child `exit` handler then rejects the pending request with
  `generate: resolver exited`; every later request gets `resolver is closed`.

Why this races: one plugin instance (one factory closure, ONE resolver child) serves
multiple vite environment plugin containers (`client` + `ssr`), and each container fires
`buildStart`/`buildEnd` independently; under vitest multi-project runs, a sibling
project's early completion or aborted init also closes servers while other work is live.
Whichever container reaches `buildEnd` first kills the shared child under the others.
Purely timing-dependent, so it presents as CI flake.

## Failure signature (as consumers see it)

A vitest/vite build fails with `Error: generate: resolver exited` (from
`ResolverClient`) and ZERO resolver output — no Go panic, no diagnostics — either as a
startup `AggregateError: Failed to initialize projects`, or mid-run where ONE project's
spec files all fail transform (`resolver is closed`) while sibling projects stay green.
Identical trees pass locally and pass on re-run (pure timing). Consumer triage until a
release carries this fix: re-run the job on this signature — there is nothing to debug
in the consumer's code, and it is not memory pressure (see Evidence).

## Evidence (mion CI, MionKit/mion PR #123, 2026-07-20)

Two failures with identical signature on trees that pass locally and pass CI on re-run:

- **Run 29711086477** — 4-project vitest invocation; the devtools project's `buildStart`
  generate died 0.6s into init: `AggregateError: Failed to initialize projects` +
  `Error: generate: resolver exited` at `ResolverClient.generate` ← `buildStart`, zero
  resolver output.
- **Run 29712576457** — docs-only delta from a green run; the router project's resolver
  died ~1.4s into the test phase while serving transform-lane generates (first rejection
  on `@ts-runtypes/core/src/formats/string/string-formats-pure-fns.ts`), then 12 spec
  files failed `resolver is closed`; sibling projects in the same invocation finished
  green (408/408 tests). The sibling `core` project completed ~0.7s before the death —
  consistent with a lifecycle-driven close, not a crash.
- Not memory pressure: both 4-project invocations sampled locally peak ~1.5 GB total
  (resolver children ~130 MB each) — far under any runner limit, and the kill signature
  (silent, no OOM trace in-process) matches the stdin-EOF exit path exactly.

## Fix plan

1. **Drain on close:** `close()` stops accepting new requests, awaits in-flight requests
   settling (bounded, a few seconds), THEN `stdin.end()` / `kill()`.
2. **Respawn-retry:** when the transport closes between a request being sent and its
   reply (`markClosed` with requests pending), `ResolverClient.generate`/`transform`
   respawn the child once and retry that request — per-request server ops are stateless
   across spawns (the program rebuilds), so a single retry is safe and turns this failure
   class into a warning.
3. **Correct lifecycle mapping for multi-container hosts:** close only on FINAL teardown
   — refcount `buildStart`/`buildEnd` per environment container, or move the close to the
   vite server/watcher close hook — instead of the first `buildEnd`.
4. **Regression tests (plugin suite):** (a) issue a generate and call `close()`
   concurrently; assert the request settles (drained result or clean retry), never a
   `generate: resolver exited` rejection; (b) two-container simulation where one
   container tears down mid-transform of the other.

Consumer note: this defect and its incident record are UPSTREAM-owned — the
consumer-side flake doc that briefly lived in mion (`docs/todos/ci-resolver-exit-flake.md`)
is absorbed into this spec (the Failure signature section above). Consumers pick the fix
up with their next `@ts-runtypes/devtools` bump; until then the triage is re-run on
signature.
