# Align the RT disk cache with TypeScript's `incremental` (drop our own cache flag)

**Status:** todo / not started. **Lightweight on purpose — the implementer investigates the details.**

## Motivation

We currently expose our OWN knob to enable / disable / locate the on-disk RT artifact cache: the plugin `cacheDir?: string | false` option, the tsconfig `cacheDir` key, and the `--cache-dir` flag. That is one more config param than we need. TypeScript already owns the on/off switch for exactly this concept — **`incremental`** (and `composite`), plus `tsBuildInfoFile` for the location. Drive our cache off THAT instead of our own flag: when the project is incremental, we cache; when it isn't, we don't. Fewer knobs, and the behaviour matches the mental model users already have from `tsc`. (Supersedes the parked "make `cacheDir` a boolean" idea.)

## Current state (verified)

- Our cache is per-`(typeID, fnTag)` JSON under `<cacheDir>/<fingerprint>/…` (a rebuild skips the walker for unchanged types); the binary version is folded into every typeID hash and non-version options are fingerprinted into the subdir, so entries never cross-contaminate. Default location `<cwd>/node_modules/.cache/ts-runtypes`, on in tsconfig mode, off in inline/server modes. Enable/locate/disable lives in `resolveCacheDir` ([cmd/ts-runtypes/buildconfig.go](../../cmd/ts-runtypes/buildconfig.go)), the plugin option ([unplugin.ts](../../packages/runtypes-devtools/src/unplugin.ts) + [resolver-client.ts](../../packages/runtypes-devtools/src/resolver-client.ts)), and the tsconfig key ([config.go](../../cmd/ts-runtypes/config.go)).
- **tsgo already parses what we need**: `core.CompilerOptions.Incremental` (Tristate), `.TsBuildInfoFile` (string), and `IsIncremental()` (true when `incremental` OR `composite`) — in the parsed config `program.New` already builds ([internal/program/program.go](../../internal/program/program.go)). We just don't read them yet; `program.New` doesn't surface them.

## What to do (roughly)

1. Remove the user-facing cache surface: the plugin `cacheDir` option, the tsconfig `cacheDir` key, the `--cache-dir` flag.
2. Drive the cache on/off off `CompilerOptions.IsIncremental()`: incremental/composite → cache on, else off. Surface `Incremental` (+ maybe `TsBuildInfoFile`) from the `program` package so the cache-enable decision can read it.
3. Hardcode the location (node_modules/.cache/ts-runtypes) OR derive it near `tsBuildInfoFile` when set — investigate which is less surprising.
4. Make our cache files "reflect incremental behaviour": confirm invalidation/pruning matches incremental semantics (stale entries removed on change, cross-version safe — the fingerprint + version fold already help; verify there are no gaps).

## Investigation points / gotchas

- **Tests need a controllable cache location.** [cache-disk.test.ts](../../packages/runtypes-devtools/test/cache-disk.test.ts) spawns `ResolverClient` with `--cache-dir` pointed at a temp dir to assert cache files appear, round-trip across two clients, and split by fingerprint. Removing `--cache-dir` entirely breaks it — keep a low-level / internal control (a retained flag not surfaced in the plugin/tsconfig, or an env var) for tests + power users, or restructure those tests. **Decide the boundary between "public knob" (gone) and "internal control" (kept)** — this is the crux of the change.
- **Inline / server modes** carry no tsconfig, so no `incremental` — keep them cache-off (as today; `hasTsconfig` already gates the default).
- **Disable-for-tests today**: the marker package's own [packages/ts-runtypes/vitest.config.ts](../../packages/ts-runtypes/vitest.config.ts), several plugin build tests, and [scripts/gen-serialization-bench.mjs](../../scripts/gen-serialization-bench.mjs) currently set `cacheDir: false` for hermetic runs. Each needs a replacement (fixture `incremental: false`, or the internal control above).
- The internal `resolver.Options.CacheDir` (the resolved path string) can stay as-is — only the ENABLE decision + the user-facing input change.

## Related

[buildconfig.go](../../cmd/ts-runtypes/buildconfig.go) (`resolveCacheDir`), [config.go](../../cmd/ts-runtypes/config.go), [main.go](../../cmd/ts-runtypes/main.go), [internal/program/program.go](../../internal/program/program.go), [internal/resolver/resolver.go](../../internal/resolver/resolver.go), [unplugin.ts](../../packages/runtypes-devtools/src/unplugin.ts), [resolver-client.ts](../../packages/runtypes-devtools/src/resolver-client.ts), [cache-disk.test.ts](../../packages/runtypes-devtools/test/cache-disk.test.ts), [tsconfig-config.test.ts](../../packages/runtypes-devtools/test/tsconfig-config.test.ts).
