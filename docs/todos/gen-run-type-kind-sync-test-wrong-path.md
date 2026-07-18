# `TestRunTypeKindFileInSync` resolves the wrong output path (pre-existing)

Status: **TODO — found 2026-07-18** while running the full Go suite during the
pure-fn emitMode work. Pre-existing (predates that change); NOT gating CI, so it
has been latently broken.

## Symptom

```
go -C ts-go-runtypes test ./cmd/...
--- FAIL: TestRunTypeKindFileInSync (0.00s)
    gen_test.go:25: read .../ts-go-runtypes/packages/ts-runtypes/src/runTypeKind.ts:
        open .../ts-go-runtypes/packages/ts-runtypes/src/runTypeKind.ts: no such file or directory
```

## Root cause

[`cmd/gen-run-type-kind/gen.go`](../../ts-go-runtypes/cmd/gen-run-type-kind/gen.go)'s
`repoRoot()` uses `runtime.Caller(0)` + `../..`, which resolves to the **Go module
root** (`ts-go-runtypes/`), not the **monorepo root** (`/…/ts-run-types`):

```go
func repoRoot() string {
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", ".."))
}
```

That is correct for its `internal/protocol/*.go` reads (they live under the Go
module), but wrong for `runTypeKindOutputPath()`:

```go
func runTypeKindOutputPath() string {
	return filepath.Join(repoRoot(), "packages", "ts-runtypes", "src", "runTypeKind.ts")
}
```

`packages/ts-runtypes/src/runTypeKind.ts` lives at the **monorepo root**, one
level above the Go module, so the join yields a non-existent
`ts-go-runtypes/packages/...` path and the sync test always fails when run. It
resolves via `runtime.Caller`, so the failure is CWD-independent (not a "run from
the wrong dir" artifact).

## Why it went unnoticed

CI runs `go test ./internal/...` only ([ci.yml](../../.github/workflows/ci.yml),
[release-gate.yml](../../.github/workflows/release-gate.yml)); `go vet ./cmd/...`
compiles but never executes the test. So `./cmd/...` tests never run in the gate.
The production generator itself is fine — `scripts/rt.mjs`'s `kind` codegen job
pipes `go run ./cmd/gen-run-type-kind` stdout to the correct
`packages/ts-runtypes/src/runTypeKind.ts` (script-relative to the repo root), so
`runTypeKind.ts` is generated correctly; only the in-Go **sync guard** is broken.

## Fix plan

Give the output path its own monorepo-root anchor rather than reusing the
module-root `repoRoot()`. Either:

- add a `monorepoRoot()` = `filepath.Join(repoRoot(), "..")` and use it in
  `runTypeKindOutputPath()`, or
- pass the output path in explicitly (the test can locate it relative to
  `runtime.Caller` with the correct depth: `../../../packages/...`).

Then either add `./cmd/gen-run-type-kind` to a Go test lane, or keep it out of CI
but ensure the guard passes locally so it stays a usable staleness check.

Keep this scoped to `cmd/gen-run-type-kind` — no `internal/` or protocol change.
