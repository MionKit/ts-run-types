---
type: chore
spec: guidelines
status: ready
created: 2026-07-24
---

# CLI architecture: consolidate on tsgo-style subcommands

**Sequencing: implement AFTER [tsconfig-alignment.md](tsconfig-alignment.md). It
must inherit that todo's single config-resolution seam untouched.**

## Intent

Exactly one user-facing binary exists (`ts-runtypes`; the WASM build is forced
separate by its compile target, and the other `cmd/` mains are internal `go run`
codegen and test tools). But the binary's mode dispatch mixes two conventions:
enrich rides tsgo-style `args[0]` subcommands (`describe`/`gen`/`check`,
`main.go:108`), while resolver modes are flag-selected (`--compile`,
`--inline-server`, `--inline-sources-stdin`, `--daemon`; declarations at
`main.go:146-203`, dispatch at `:367-456`). tsgo itself is an `args[0]` switch
(`--lsp` / `--api`) falling through to a single default tsc command (vendored
`cmd/tsgo/main.go:17-32`), and [ROADMAP.md](../ROADMAP.md):178 already envisions a
`ts-runtypes build` SUBCOMMAND. Consolidating on one convention makes the tool
read like tsc: one command, one config, the mode as the first word.

Cleanups to fold in: the `--one-shot` flag is inert (declared `main.go:148`,
never read; the JS side always passes it, `resolver-client.ts:486`), and
`docs/done/transform-cli-compile-command.md` still documents the pre-rename
`--run-types-gen-dir` flag name.

## Direction

The implementer plans the details. Verified constraints and pointers:

- Candidate shape (adjust as needed): default = the tsc-like project scan
  (today's default stdio serve); `compile` (today `--compile`); `serve` (today
  `--inline-server`); `build` (ROADMAP:178); enrich stays `describe`/`gen`/
  `check`. Decide whether `--inline-sources-stdin` and `--daemon` become
  subcommands, merge, or retire — daemon mode currently has no production JS
  caller. Per-subcommand `flag.NewFlagSet`, like tsgo's lsp/api.
- The JS argv assembly is a single seam: `buildResolverArgs`
  (`resolver-client.ts:485-516`). Binary and JS packages version in lockstep
  (exact-pinned), so the argv contract can change atomically; decide whether to
  keep old flags as aliases for one release anyway.
- Shared knobs (`--tsconfig`, `--cwd`, `--emit-mode`, …) must mean the same thing
  under every subcommand; config resolution stays the one seam from
  tsconfig-alignment.
- Out of scope: merging the WASM main (build-target constraint) or the internal
  `go run` codegen tools into the binary.

## Done when

- One dispatch convention: `args[0]` subcommands with per-subcommand FlagSets;
  the flag-modes and the dead `--one-shot` are gone.
- The JS spawn layer is migrated; README and website CLI docs updated.
- The config-resolution seam from tsconfig-alignment is untouched.
- Existing suites stay green.
