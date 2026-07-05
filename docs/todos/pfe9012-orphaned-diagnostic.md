# PFE9012 "RT depends on missing pure-fn" is published but can never fire

**Status:** open — decision needed (retire the code vs wire the validation)
**Found during:** the Go simplification refactor ([go-simplification-refactor.md](go-simplification-refactor.md), Phase A1 dead-code sweep)
**Predates the refactor:** yes — the condition existed before any refactor commit; the sweep only made it explicit.

## What was found

`purefns.ValidatePureFnDependencies` (with its `Index` support type, then at `internal/compiled/purefns/index.go`) was the ONLY producer of the `PFE9012` / `diag.CodeMissingPureFnDep` diagnostic — and it had **zero production callers**. It was built in commit `68cd944e` (2026-05-16, "perf(purefn): defer pure-fn dep validation; one walk per file via Index") whose message explicitly deferred the wiring: *"Out of scope: plumbing collected Walker.PureFnDependencies … into the resolver. The validation API is ready; wiring the data through is a follow-up."* That follow-up never happened — no docs/todos entry, no ROADMAP mention, and `deadcode` reports the whole call path unreachable from every `cmd/` main.

The refactor deleted the unwired API (`index.go` + its tests) as dead code — recoverable from git at the commit that carries this file. What remains inconsistent:

- **PFE9012 stays published** in the diag registry (`internal/diag/codes_purefn.go` const + catalog row, `internal/diag/messages.go` template) and therefore in both generated artifacts: `packages/runtypes-devtools/src/diagnosticCatalog.generated.ts` and the website's `diagnostics-catalog.json`. The catalog documents a build-time error **no code path can emit**.
- **Runtime backstop exists:** a dep on an unregistered pure-fn still fails loudly — `usePureFn` throws `Pure function not found` (`packages/ts-runtypes/src/runtypes/rtUtils.ts`).

## Decision to make (either is a small, self-contained change)

1. **Retire PFE9012** — remove the const + catalog row + message template, run `pnpm rt core codegen all` to regenerate the TS catalog mirror + website JSON. Honest catalog; keeps the runtime-throw semantics as the contract.
2. **Wire the deferred validation** — resurrect `index.go` from git history and call `ValidatePureFnDependencies` at end-of-compilation in the resolver (dispatch/dump path), threading `Walker.PureFnDependencies` through, so PFE9012 fires at build time as originally designed.

Option 1 is the low-cost, consistency-restoring move; option 2 is a feature decision (build-time detection of missing pure-fn deps) that should be weighed against its cost on every dump.
