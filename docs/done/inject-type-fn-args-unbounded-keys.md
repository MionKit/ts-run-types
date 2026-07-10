# `InjectTypeFnArgs` — unbounded fn-key list + duplicate rejection

> **Status: DONE (shipped 2026-07-10).** Implements the two features called out
> for the mion migration follow-up (branch
> `claude/mion-migration-implementation-fgfbda`):
> 1. `InjectTypeFnArgs<T, …>` accepts **any list of function families** (no fixed
>    three-key cap) and rejects **repeated families** with a build error.
> 2. **Config-free marker resolution in third-party libraries / node_modules** —
>    verified to already be delivered by the merged site-file gate (A1); the
>    most performant option, kept as-is (no d.ts pattern-scan added).
>
> This is a partial delivery of adoption-plan **A5** (enhancer #2 — raise the
> Fn-key cap) plus a new duplicate-family rule. A5's other two enhancers,
> multi-SLOT injection (#1) and the `'rt'` reflection key (#3), were explicitly
> out of scope and remain open in
> [`mion-adoption-requirements.md`](../todos/mion-adoption-requirements.md).

## Feature 1 — any list of functions, no fixed length, error on repeats

**Requirement (repo owner):** `InjectTypeFnArgs` should accept any list of
functions with no fixed length, and emit an error if a function family is
repeated.

**Context.** The multi-family mechanism already existed (the scanner reads every
type argument after `T` via `marker.fnKeysFromAlias`, injects one entry tuple
per family in declaration order, and `createStandardSchema` ships a two-family
`'val','verr'` marker). The only limit was the **type alias arity**: `markers.ts`
declared `InjectTypeFnArgs<T, F1, F2, F3>`, so a fourth key was a TypeScript
error before the scanner ever ran. There was also no duplicate-family check.

**What shipped.**

- **Widened alias arity — effectively unbounded.** `markers.ts`'s
  `InjectTypeFnArgs` now declares `F1` required + `F2`…`F12` optional. A
  TypeScript type alias cannot declare a variadic type-parameter list, so a
  truly unbounded comma-form is impossible; `F1`…`F12` comfortably exceeds the
  ~11 distinct public families, and with the duplicate rule the *meaningful*
  maximum is the number of distinct families — so the cap is effectively
  unbounded while keeping the ergonomic comma syntax mion and
  `createStandardSchema` already use. The four test overlays that mirror the
  public marker API were updated in lockstep:
  `ts-go-runtypes/internal/testfixtures/runtypes.d.ts`,
  `packages/ts-runtypes-devtools/test/helpers/inline.ts` (`RUNTYPES_DTS`),
  `packages/ts-runtypes-devtools/test/compile-cli.test.ts`,
  `packages/ts-runtypes-devtools/test/eslint/fixture.ts`.

- **Duplicate-family rule — MKR006.** New Error diagnostic
  `CodeMarkerDuplicateFnKey = "MKR006"`. The scanner
  (`resolver.dedupeFnKeys`, called in `analyzeCall` in
  `ts-go-runtypes/internal/compiler/resolver/scan.go`) detects a repeated key
  in a marker's family list, emits MKR006 naming the first repeated family (via
  `Diagnostic.Args`), and dedupes the list before computing fnIds so the emitted
  output stays sound even if a host surfaces the diagnostic as non-fatal. The
  code is registered in `internal/diagnostics/codes_marker.go` (title),
  `messages.go` (headline + detail), and `prose.go` (website Summary/Fix +
  a firing Example); the diagnostic catalog was regenerated
  (`pnpm run gen:diag-catalog`).

**Tests.**

- Go — `ts-go-runtypes/internal/compiler/resolver/multifn_keys_test.go`:
  four-distinct-key injection (exact ordered fnIds + demand for all four
  families), static-vs-reflection form equivalence (marker-coverage rule),
  mion's verbatim three-family shape, and the duplicate-key → MKR006 case. The
  duplicate is deliberately NOT the first key (`'huk', 'verr', 'suk', 'verr'`)
  so `Args == ["verr"]` pins first-repeated-key reporting rather than a naive
  "report the first key"; the deduped fnIds keep first-occurrence order
  (`huk, verr, suk`). The MKR006 prose Example also runs through
  `diag_examples_test.go`.
- Go — `packages/ts-runtypes/test/features/injectTypeFnArgs-arity.test.ts`:
  a type-level regression guard resolving the REAL `@ts-runtypes/core` marker
  via the `source` condition (six- and twelve-family aliases). Every other test
  resolves an independent overlay copy, so this is the only guard that fails
  `pnpm --filter @ts-runtypes/core typecheck:test` (wired into `pnpm run
  typecheck` and CI) if `markers.ts` is ever narrowed below the declared arity —
  verified by temporarily reverting to `F3` and observing `TS2707`.
- JS — `packages/ts-runtypes-devtools/test/marker-diagnostics.test.ts`: a
  four-family marker scans clean and injects four handles; a repeated family
  (again not first) surfaces MKR006 (Error, `args == ['verr']`) with the site
  deduped from four keys to three. `packages/ts-runtypes-devtools/test/wrapper-multi-fn.test.ts`:
  an end-to-end transform of a mion-shaped `route()` wrapper (three families)
  whose consumer never names `@ts-runtypes/core` — the injected value is an
  ordered array of three distinct bindings imported from real on-disk modules,
  and the wrapper's forwarded factory calls stay pass-throughs.

**Docs.** `packages/ts-runtypes/src/markers.ts` comment (multi-family + duplicate
rule), `docs/ARCHITECTURE.md` (the `InjectTypeFnArgs` section), website
`container/website/content/2.guide/6.compiler-markers.md` ("Asking for several
functions at once") + a compilable example
`packages/examples/src/guide/markers-multi-family.ts`.

## Feature 2 — config-free markers in third-party libraries (verified, not rebuilt)

**Requirement (repo owner):** resolve markers in third-party libraries including
node_modules with no config; the scan must live entirely inside the compiler
(bundlers commonly skip node_modules in dev, so detection must not depend on the
bundler); choosing the **most performant** option matters most.

**Finding — already delivered, and it is the performant option.** PR #212 (A1,
merged into `main`) solved this with the resolver's **site-file set**: `generate`
runs the whole-program scan (`sess.scanAllProgramFiles`), every marker call site
carries its `.File`, and `OpGenerate` returns the sorted unique file list as
`protocol.Response.SiteFiles`. The plugin adopts that set and gates its per-file
transform on an O(1) lookup. Detection therefore happens **100% inside the Go
compiler** via the type checker (it resolves a wrapper's signature and sees the
trailing marker regardless of import style), so a bundler excluding node_modules
in dev is irrelevant, and a consumer calling a wrapper from *any* package —
node_modules included — is transformed with zero configuration. It even catches
call sites that reach a wrapper through relative imports, which no textual
heuristic can see.

**Why not the d.ts / .ts pattern-scan.** The alternative (scan imported
libraries' declaration files for marker types) is strictly *less* performant and
less accurate: the whole-program scan must run anyway to generate the cache
modules, so the site-file set is a free byproduct of work already done, whereas a
d.ts tree walk is extra per-plugin resolution and is only a heuristic (entry
`d.ts` files are often bare re-exports with no marker string). The scan is also
already tuned — `scanAllProgramFiles` skips declaration files, which are the
largest ASTs in the program and can never hold a rewritable call site. So the
most performant solution was to keep the merged site-file gate and add no d.ts
scan. Pinned by
`packages/ts-runtypes-devtools/test/wrapper-zero-config.test.ts` (existing),
the new `wrapper-multi-fn.test.ts` (a multi-family wrapper through the same
zero-config path), and — the strongest form — the new
`packages/ts-runtypes/test/third_party_markers/third-party-node-modules.test.ts`:
a REAL `node_modules/@acme/router` package (its own `package.json` + `index.d.ts`
declaring the `route()` marker) and a consumer that imports it and never names
`@ts-runtypes/core`; the consumer's call site is still detected and injected,
proving the compiler resolves markers declared in an installed third-party
package with zero configuration.
