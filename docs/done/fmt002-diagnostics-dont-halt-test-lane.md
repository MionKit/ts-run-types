# FMT002 param-invariant errors don't halt the vitest/transform lane — DONE

## Original finding (mion migration, 2026-07-12)

Contradictory format params — `Number<{min: 10; gt: 5}>`, `min > max`, `multipleOf <= 0`,
`float` + `multipleOf`, … — are validated at build time in Go and reported as FMT002 with
SeverityError. But in the vitest/dev-transform lane the plugin only forwarded diagnostics
via `ctx.warn`, so `createValidate<Number<{min: 10, gt: 5}>>()` silently returned a
working (but semantically contradictory) validator; nothing failed until a full
`vite build`. The old mion runtime threw from the factory for these invariants; that
coverage became unreachable in the test lane (mion deleted 7 such tests during the spec
migration).

Root cause found while fixing: `buildStart` filtered `generate()` diagnostics to
`Family.PureFn` only, and the per-file transform path dropped its diagnostics entirely —
the "RT diagnostics flow through the transform path" handoff was never completed. Error
diagnostics only failed real `vite build`s via the rollup lane surfacing.

## What shipped (direction: behave like a type error in the plugin, all lanes)

- **`buildStart` now surfaces EVERY diagnostic family** and halts on Error severity per
  the new plugin option **`failOnError` (default `true`)** — so `vitest`, dev serve, and
  `vite build` all fail loudly, with each diagnostic warn-logged (file/line/code/param)
  BEFORE the halting summary. Pure-fn extraction errors keep halting unconditionally
  (files-mode has no fallback for a failed generation).
- **The per-file transform paths** (`'edits'` and `'go'`) surface Error-severity
  diagnostics for files entering the program after buildStart and halt under the same
  option — a bad type in a mid-session file fails that file's transform.
- **HMR (`handleHotUpdate`) still never hard-fails** mid-edit (warnings only); the halt
  re-applies on the next build/test run.
- **Documented opt-out**: `failOnError: false` for programs that deliberately contain
  error-case types. The marker package's own vitest config uses it (its alwaysThrow
  suites pin runtime throws for root-position symbols/functions) — that config comment
  is the canonical usage example.
- mion side: `mionVitePlugin` forwards options verbatim to `@ts-runtypes/devtools/vite`,
  so mion inherits the strict default on its next dependency bump with no wrapper change
  (its own error-suite projects can pass `failOnError: false` the same way).

## Acceptance shipped

FE suite `packages/ts-runtypes-devtools/test/fail-on-error.test.ts` (self-contained
fixture programs driven through the rollup entry's hooks):

- default strict: `buildStart` rejects on an Error-severity program (VL002 root symbol —
  same lane as FMT002), with the diagnostic named in the warn log first;
- `failOnError: false`: same program boots, diagnostics surface as warnings, transforms
  still run (healthy sites inject; getRunTypeId pinned in both call shapes);
- Warning-severity programs never halt under the strict default (the Warning/Error line).

## Exposed along the way

Surfacing all families revealed 18 pre-existing Error-severity JCP001 internal
diagnostics in the marker package's own test program (composites referencing
never-rendered primitives) — bisected to pre-exist on main; filed separately as
[docs/todos/jcp001-composites-reference-unrendered-primitives.md].
