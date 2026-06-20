# Cross-file state leak: merged-prop union `NeedsSubWrap` corrupted by other files

**Status:** confirmed bug, root cause not yet pinned. Pre-existing (reproduces on
`main`); surfaced while adding DataOnly union-drop coverage. Not caused by the
DataOnly alignment change, but it constrains how that feature can be tested.

## Symptom

When certain types are compiled in one test file, an UNRELATED object-merged
union in a different file serializes incorrectly: a merged property that should
NOT carry a sub-union envelope gets one. Example from the serialization suite
(`test/suites/serialization/Unions.ts`):

- `Discriminated union` = `{type:'a';otherProp:boolean} | {type:'b';otherProp:number} | {type:'c';otherProp:string;time:Date} | {type:boolean;otherProp:string}`
- `Shared prop structural` = `{a:string;b:number} | {a:boolean;c:Date}`

Both fail with the merged prop wrapped, e.g. encode produces
`{a: [0, 'hello'], b: 7}` instead of `{a: 'hello', b: 7}`. The merged prop's
candidates are all JSON-natural (string / number / boolean), so
`FlatMergedProp.NeedsSubWrap` (union_flat_layout.go) should be FALSE, yet it is
computed TRUE — which means `isJsonCompatible` returned false for a primitive
candidate it should accept.

## How to reproduce

In `packages/ts-runtypes`, with the full suite green, add a test file that
compiles any of these alwaysThrow collapse types and run `pnpm test`:

```ts
createJsonEncoder<Map<string, symbol>>(); // or Set<symbol>, [string, symbol]
```

→ `serialization/Unions.test.ts` "Discriminated union" + "Shared prop structural"
start failing (clone-preserve / clone-strip / schema-json variants). Remove the
file and the suite is green again. The trigger is the collapse CONTAINER types
(`Map<string,symbol>` / `Set<symbol>` / `[string,symbol]`); bare `symbol[]`
(already in Arrays.ts) and all-stripped unions (`symbol | (()=>void)`) do NOT
trip it.

A second, related sensitivity: making `dataOnlyUnionMembers`
(union_strip.go) return a freshly-allocated slice instead of the canonical
`rt.SafeUnionChildren` made the SAME cases fail when `Unions.test` runs in
ISOLATION (a small resolver session). Returning the canonical slice unchanged
when nothing is stripped fixed the isolation case but NOT the cross-file case —
so both are facets of the same latent state dependency in the merged-prop /
`isJsonCompatible` path.

## What's likely going on

The inline resolver server is reused across test-file scans. `isJsonCompatible`
memoizes verdicts in a `FactsTable` keyed by structural id (json_compat.go), and
the session `cache.Cache` interns RunTypes across files (Clear/Rebind between
scans). The cross-file corruption of a primitive's `isJsonCompatible` verdict
points at either (a) a `FactsTable` / structural-id desync across
Clear/Rebind, or (b) a structural-id reuse/collision where a stale verdict from a
collapse type (`symbol`-bearing) is read for a primitive in another file.

The fix is NOT understood yet and lives in the resolver/cache layer
(`internal/resolver`, `internal/compiled/runtype`, json_compat.go's facts
caching), not in the typefns emit. This needs a focused investigation with a
deterministic Go-level repro (drive two scans through one resolver session and
diff the rendered merged-prop layout).

## Impact

User-facing correctness risk: compiling one module that uses a collapse type
could, in principle, corrupt the serializer emitted for an object-merged union in
another module of the same build. Severity depends on how often the trigger
co-occurs with a vulnerable merged union; the test suite hits it because both
live under one resolver session.

## Workaround in place

`packages/ts-runtypes/test/dataonly-union-drop.test.ts` covers the DataOnly
union-drop behavior but deliberately does NOT assert the collapse CONTAINER types
(`Map<string,symbol>` / `Set<symbol>` / `[string,symbol]`) to avoid tripping this
leak; that contract is covered by the Go emitter tests
(`internal/compiled/typefns/union_dataonly_test.go`) and existing suites
(`Arrays.ts` `symbol[]`, `Functions.ts`). Restore those FE assertions once the
leak is fixed.

## Not in scope

- The DataOnly alignment change itself (Phase 1/2) — landed and green.
