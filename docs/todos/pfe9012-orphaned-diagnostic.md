# Wire PFE9012: build-time "RT depends on missing pure-fn" validation

**Status:** planned — owner decision (2026-07-05): KEEP the validation API and wire it; surface through the existing lint plugin.
**Origin:** found during the Go simplification refactor ([go-simplification-refactor.md](../done/go-simplification-refactor.md), Phase A1). The API was built in `68cd944e` (2026-05-16) with the resolver wiring explicitly deferred, and the follow-up never happened. The refactor briefly deleted it as dead code; it is now **restored** at [internal/cachegen/purefunctions/index.go](../../internal/cachegen/purefunctions/index.go) (marked `KEPT-UNWIRED`, tests in `index_test.go`) pending this wiring.

## What exists today (all live except the last step)

- **Purity validation is fully wired and unrelated to this gap:** every `registerPureFnFactory` call site is checked at extraction time — inline-literal shape (PFN001/PFN002, PFE9005), no `this`/`await`/`yield`/dynamic-`import` (PFE9006–9009), allow-listed globals only (PFE9010), no closure over outer bindings (PFE9011), cross-file body-hash collisions (PFE9004), literal dep args (PFE9013).
- **Dep recording:** while rendering RT function entries, the typefunctions walker records every `utl.getPureFn(<ns>, <fn>)` reference as a `protocol.PureFnDep` (`Walker.AddPureFnDependency`, record-only) and emits it into the entry tuple (`pureFnDepsJS`, module.go).
- **The validator:** `purefunctions.ValidatePureFnDependencies(checker, markerOpts, deps, idx, lookup)` checks each dep against an `Index` of the program-wide extraction in O(1), lazily extracting any dep `FilePath` the main scan didn't cover, and returns one deduped **PFE9012** diagnostic per missing `namespace::fnName`.
- **The catalog entry:** PFE9012 is already published (diag registry, `messages.go` template, generated TS catalog + website JSON) — no codegen change needed once it fires.
- **The gap:** nothing calls the validator, so a dangling reference today surfaces only at **runtime** (`usePureFn` throws `Pure function not found`).

## Implementation plan

1. **Collect the deps at render time.** The render path already runs every typefunctions walker; have it aggregate `walker.PureFnDependencies` into a deduped `[]protocol.PureFnDep` alongside the entries it returns (resolver `render.go` / the typefunctions module collector — small plumbing, the data is already on the walker).
2. **Validate at end-of-render in the resolver.** Where the dump/scan paths already call `collectProgramPureFns` (dispatch.go): build the `Index` via `purefunctions.NewIndex(entries, walkFiles)`, run `ValidatePureFnDependencies` over the aggregated deps (pass `resolver.Program` as the `SourceFileLookup` so lazy expansion works), and append the returned diagnostics to the response — same channel the purity/collision diagnostics already ride.
3. **Gate it exactly like the other RT-family diagnostics.** Run when the request opts in via `IncludeRtDiagnostics` (the lint plugin's scan flag) or renders entries anyway (`IncludeEntryModules` / dump / compile). This makes the check "part of the linter plugin" for free: the runtypes-devtools OXlint/ESLint plugin is pure transport over the resolver's scan flags, so PFE9012 lands in editors with zero JS-side changes; ordinary builds surface it through the Vite plugin's warn channel. PFE9012 is **Error** severity — a build that references an unregistered pure fn should fail, matching the catalog's published contract.
4. **Site attribution (nice-to-have, second step):** deps currently carry no source position (`diag.Site{}`), so the first iteration reports file-less errors with the full `namespace::fnName` + expected file path in the message args. Follow-up: thread the `utl.getPureFn` call-site position through `AddPureFnDependency` so the editor squiggle lands on the referencing factory.

## Tests (PR-readiness gate)

- Go: the restored `index_test.go` already pins the validator core (hit / miss / lazy expansion / dedup / never-reparse). Add one resolver-level test: a fixture whose compiled RT function references `utl.getPureFn('rt','missing')` with no registration → dump/scan response carries PFE9012; and the converse (registration present → no diagnostic).
- JS: extend the lint-plugin routing test (`packages/runtypes-devtools/test/eslint/prefilter.test.ts` pattern, which already covers PFE9004) so PFE9012 routes to the pure-fn rule bucket.
- Website docs: the diagnostics catalog already lists PFE9012; add the hand-written prose summary (it is in the `still need a hand-written summary` backlog of `gen-diag-catalog`).
