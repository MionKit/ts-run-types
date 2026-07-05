# Align the RT disk cache with TypeScript's `incremental` (drop our own cache flag)

**Status: shipped.** The RT on-disk artifact cache now follows TypeScript's own
`incremental` / `composite` switch instead of a knob of ours. The public
`cacheDir` surface (plugin option, tsconfig key, and `--cache-dir` flag) is gone;
the internal `RT_CACHE_DIR` env var is the sole override, retained for tests and
direct-binary power users.

## Motivation (as scoped)

We used to expose our OWN knob to enable / disable / locate the on-disk RT
artifact cache: the plugin `cacheDir?: string | false` option, the tsconfig
`cacheDir` key, and the `--cache-dir` flag. That was one more config param than
we needed. TypeScript already owns the on/off switch for exactly this concept:
**`incremental`** (and `composite`). Driving our cache off THAT means fewer
knobs, and behaviour that matches the mental model users already have from `tsc`.

## What shipped

1. **The user-facing cache surface is removed.** No plugin `cacheDir` option
   (`PluginOptions` in [unplugin.ts](../../packages/runtypes-devtools/src/unplugin.ts)),
   no tsconfig `cacheDir` key (`tsRuntypesPlugin` in
   [config.go](../../cmd/ts-runtypes/config.go)), no `--cache-dir` flag
   ([main.go](../../cmd/ts-runtypes/main.go)). A tsconfig still carrying a
   `cacheDir` key now gets the standard unknown-key stderr warning.

2. **The cache follows `CompilerOptions.IsIncremental()`.** The `program`
   package surfaces it via `Program.IsIncremental()`
   ([program.go](../../internal/program/program.go)), read from the fully parsed
   config so an `incremental`/`composite` inherited through `extends` counts. The
   resolver's enable+locate decision lives in `cacheLocation`
   ([resolver.go](../../internal/resolver/resolver.go)), fed by the new
   `Options.CacheFollowsIncremental`: incremental/composite → cache on, else off.
   `New` passes `prog.IsIncremental()`; `NewServer` (inline-server, no Program)
   passes `false`, so the inline / server modes stay cache-off as before.

3. **Location is hardcoded** at `<cwd>/node_modules/.cache/ts-runtypes` (the
   canonical tooling-cache location, wiped by standard `clean` recipes). We did
   NOT co-locate near `tsBuildInfoFile`: dropping a multi-file cache tree into an
   `outDir` like `dist/` is more surprising than the well-known `node_modules`
   spot. `IsIncremental()` is surfaced; `TsBuildInfoFile` deliberately is not.

4. **Invalidation matches incremental semantics** with no active pruning needed.
   Entries are content-addressed: the binary version folds into every typeID hash
   and non-version options fingerprint into a subdir
   ([disk.go](../../internal/cachegen/diskcache/disk.go),
   [fingerprint.go](../../internal/cachegen/diskcache/fingerprint.go)), plus a
   `FormatVersion` header check. A changed type writes a NEW entry and the stale
   one is never read again (the same non-pruning behaviour as `tsc`'s
   `.tsbuildinfo`), and cross-version / cross-config files never collide. Bounded
   by `node_modules/.cache` being wiped by `clean`.

## The internal control (the crux decision)

The public knob is gone; the **internal control is `RT_CACHE_DIR`** (env var,
3-state) — matching the repo's `RT_`-prefixed env-registry convention
([lib-env.sh](../../scripts/lib-env.sh)):

- unset → follow the project's incremental setting (the normal flow),
- a path → force the cache on there (overrides incremental),
- an empty string → force the cache off (overrides incremental).

An env var (not a retained hidden flag) was necessary because two *plugin*
consumers need to control the cache and can't reach a CLI flag: the compile-time
benchmark ([compiletime.mjs](../../container/benchmarks/compiletime/compiletime.mjs))
forces the cache on at a wipeable path for cold-start measurement, and the
serialization benchmark forces it off under a read-only mount. `RT_CACHE_DIR`
flows through the plugin's spawned resolver child. The internal
`ResolverClientOptions.cacheDir` ([resolver-client.ts](../../packages/runtypes-devtools/src/resolver-client.ts))
is kept for the disk-cache end-to-end tests and forwards it as **per-spawn child
env** so parallel test spawns stay isolated (the disk-cache suite runs several
clients concurrently against different temp dirs). `resolver.Options.CacheDir`
(the resolved path string) is unchanged in meaning: an explicit location override.

## Test / bench replacements for the old `cacheDir: false`

Everything that used `cacheDir: false` for hermetic runs was migrated:

- The marker package's [vitest.config.ts](../../packages/ts-runtypes/vitest.config.ts)
  and the build tests ([build-split](../../packages/runtypes-devtools/test/build-split.test.ts),
  [build-rollup](../../packages/runtypes-devtools/test/build-rollup.test.ts),
  [build-sourcemap](../../packages/runtypes-devtools/test/build-sourcemap.test.ts))
  now rely on `incremental: false` in
  [tsconfig.test.json](../../packages/ts-runtypes/tsconfig.test.json) (it
  inherited `incremental: true` from the root), so they are cache-off with no knob.
- [cache-disk.test.ts](../../packages/runtypes-devtools/test/cache-disk.test.ts)
  and [tsconfig-config.test.ts](../../packages/runtypes-devtools/test/tsconfig-config.test.ts)
  keep the internal `ResolverClientOptions.cacheDir` (now → child `RT_CACHE_DIR`).
- [gen-serialization-bench.mjs](../../scripts/gen-serialization-bench.mjs)
  forwards `RT_BENCH_CACHE_DIR` to `RT_CACHE_DIR`.

## Coverage

- Go: `TestCacheLocation` ([cache_location_test.go](../../internal/resolver/cache_location_test.go))
  pins the enable+locate decision; `TestNormalizeCacheDir` + the updated
  `buildconfig_test.go` cover the CLI translation and the removed key.
- JS: the disk-cache suite exercises the `RT_CACHE_DIR` force-on path end-to-end;
  the build/tsconfig suites cover the incremental-off path.
- End-to-end: an incremental tsconfig writes `node_modules/.cache/ts-runtypes`,
  a non-incremental one writes nothing, and `RT_CACHE_DIR` overrides both.
