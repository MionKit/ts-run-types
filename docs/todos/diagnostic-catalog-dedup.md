# Diagnostic catalog duplication — drift risk and the codegen fix

**Status:** known duplication. The missing-code drift was reconciled (this PR); the
wording divergence and the duplication itself are deferred to a `gen:diag-catalog`
codegen, tracked below.

The human-readable text for every diagnostic (a `headline` + optional `detail`,
rendered from a Go-emitted `Code` + positional args) is duplicated across two
hand-maintained files. This documents why the duplication exists, how the two
copies drifted, what was already fixed, and the codegen that should remove the
duplication for good.

## Where the code lives

- Build-time copy (the plugin's diagnostic renderer) — [`packages/runtypes-devtools/src/diagnosticCatalog.ts`](../../packages/runtypes-devtools/src/diagnosticCatalog.ts)
- Runtime copy / canonical source (the marker package's `alwaysThrow` factory) — [`packages/ts-runtypes/src/runtypes/diagnosticCatalog.ts`](../../packages/ts-runtypes/src/runtypes/diagnosticCatalog.ts)
- The wire `Code`s themselves (Go) — [`internal/diag/codes_runtype.go`](../../internal/diag/codes_runtype.go)

The header comment at the top of the devtools copy is the canonical explanation;
this doc expands on it.

## Why the catalog is duplicated

The catalog (`Code` + args → rendered message) is consumed at two different times,
by two consumers that cannot share an import:

- **Build time** — the plugin (`runtypes-devtools`) renders diagnostics reported by
  the Go binary, via the bundler's `this.warn` / `this.error`. Runs only on a
  developer's machine, as a devDependency.
- **Runtime** — the marker package (`ts-runtypes`) `alwaysThrow` factory puts the
  message into a thrown `Error`. This code ships inside the user's app.

Dependency direction blocks sharing one copy:

- the marker package ships to production, so it cannot depend on a build-only
  devDependency (`runtypes-devtools` is not installed at runtime); and
- the plugin importing the marker package's catalog would pull the marker
  package's whole runtime surface into the build tool.

So the simplest decoupling is to duplicate one plain data file. `ts-runtypes` is
the canonical copy; the devtools copy is meant to mirror it.

## How the two copies drifted

Three independent kinds of drift accumulated:

1. **Missing codes — FIXED (this PR).** `CLS001` existed only in the runtime copy,
   so the build-time renderer had no text for a Warning the Go binary actually
   emits (`emitClassSerializerWarning` in
   [`internal/compiled/typefns/class_serializer.go`](../../internal/compiled/typefns/class_serializer.go)).
   `FMT002` and `JCP001` existed only in the build-time copy. All three are now
   present in both files (ported verbatim, additive — no behavior change).
2. **Divergent wording — DEFERRED.** `FMT001` is present in both copies but worded
   differently:
   - devtools: `TypeFormat mockSample "{0}" does not match its pattern /{1}/ — fix the sample or the pattern.`
   - ts-runtypes: `` Format mockSample `{0}` does not match its pattern `{1}` — mocking would produce an invalid value. ``

   Neither is wrong; they simply disagree. (There may be other shared codes whose
   wording has drifted — a full audit is part of the cutover, not done here.)
3. **Different ordering — DEFERRED.** The two files group and order their families
   differently (e.g. the Format family sits near the top of the devtools copy and
   near the bottom of the canonical copy), so a naive line-by-line merge is not
   possible.

## The fix — a `gen:diag-catalog` codegen

Pick one canonical source (the `ts-runtypes` catalog) and **generate** the devtools
copy from it, mirroring the existing `gen:ts-constants` pattern (a Go generator
emits the TS, then prettier formats it — see [`cmd/gen-ts-constants`](../../cmd/gen-ts-constants/)).
With a single source:

- wording can never diverge — there is one place to edit;
- a new `Code` is authored once and both copies pick it up;
- the generated devtools copy can be a literal (or a thin re-export shaped to avoid
  the runtime-dependency problem above).

A one-time hand-merge of the two ~600-line files was deliberately avoided: it is
both error-prone (independent reordering + per-code wording decisions) and
temporary (the copies would drift again). The codegen is the durable fix.

### Steps

1. Add `cmd/gen-diag-catalog` (or extend `cmd/gen-ts-constants`) that reads the
   canonical catalog and emits the devtools copy.
2. Add a `gen:diag-catalog` package script and run it wherever `gen:ts-constants`
   runs; prettier-format the output (the raw generator emits double-quoted strings).
3. Reconcile the `FMT001` wording (and any other shared-code drift) once, in the
   canonical file, as part of the cutover.
4. Optionally add a CI check / test asserting the generated copy is up to date
   (compare regenerated output against the committed file).
