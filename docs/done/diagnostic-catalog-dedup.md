# Diagnostic catalog duplication — resolved by dropping the runtime copy

**Status:** RESOLVED. The diagnostic catalog now lives in **one** place,
the `runtypes-devtools` plugin, and is consumed only at build time. The
shipped marker package no longer carries a copy. This doc records why the
duplication existed and how it was removed.

## The old shape (two hand-maintained TS copies)

The human-readable text for every diagnostic (a `headline`, rendered from a
Go-emitted `Code` + positional args) used to be duplicated across two
hand-maintained TS files that drifted (missing codes, divergent `FMT001`
wording, different ordering):

- a **build-time** copy in the plugin (`runtypes-devtools`), used to render
  diagnostics into the build log / IDE; and
- a **runtime** copy in the marker package (`ts-runtypes`), used by the
  `alwaysThrow` factory to build the `Error` it throws.

They couldn't share an import (the marker package ships to production and can't
depend on the build-only plugin; the plugin can't drag the marker package's
runtime surface into the build tool), so the text was copied by hand.

## The fix — remove the runtime copy

The plugin copy is the one that's actually needed: it is the single place that
turns a diagnostic `Code` (+ args) into displayed text during compilation. It
stays, unchanged. The wire between the Go binary and the plugin still carries
**only the code** (+ args + site) — no message text.

The runtime copy existed only so the `alwaysThrow` factory could render its
throw message at runtime. That's unnecessary: the message is fully known at
build time. So the **Go emitter now writes the complete throw message directly
into the `alwaysThrow` entry** (`[CODE] Cannot <verb> \`<kind>\` <suffix>. (at
site)`), and the runtime factory throws that string verbatim:

- `internal/compiled/typefns/alwaysthrow_message.go` — the only diagnostic
  wording the Go binary owns: the 8 formulaic root-throw families (the only
  codes that ever become a runtime throw). This is emit-time wording, not a
  general catalog.
- `packages/ts-runtypes/src/runtypes/diagnosticCatalog.ts` — **deleted**;
  `alwaysThrowFactory(message)` now just throws the embedded string. The marker
  package ships with zero diagnostic-catalog code and keeps its
  zero-runtime-dependencies property.

This also fixes a latent bug: the old runtime render passed no args, so
placeholders like `` `{0}` `` were never substituted in runtime throw messages.

Disk cache format bumped to **v10** (the `alwaysThrow` tuple slot now holds the
rendered message, was a bare code + site hint).

## Why this isn't re-introducing duplication

The plugin catalog and the Go emitter's throw wording are different layers with
different jobs:

- the plugin catalog renders **every** code for the **build log** (the user's
  primary signal — an `alwaysThrow` is an Error that halts the build); and
- the Go emitter renders **only** the 8 root-throw families, for the
  **runtime** throw that fires only if unsupported code somehow ships.

The 8 formulaic strings are trivial and stable; the runtime throw is a backstop
that need not byte-match the build-log headline. There is no longer a
full-catalog runtime copy to drift.
