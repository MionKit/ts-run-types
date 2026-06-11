import path from 'node:path';
import {renderHeadline} from './diagnosticCatalog.ts';
import {ResolverClient} from './resolver-client.ts';
import {createScanBatcher, type SiteScanner} from './scan-batcher.ts';
import {rewrite} from './rewrite.ts';
import {Family, Severity, type CacheKind, type Diagnostic} from './protocol.ts';
import {VIRTUAL_RUNTYPES_PREFIX, VIRTUAL_RUNTYPES_EXT} from './runtypes-constants.generated.ts';

export interface PluginOptions {
  // Absolute path to the compiled ts-go-run-types binary.
  binary: string;
  // Project root (where tsconfig.json lives). Defaults to Vite's root.
  cwd?: string;
  // Path to tsconfig.json, relative to cwd. Defaults to "tsconfig.json".
  tsconfig?: string;
  // When true, the Go binary emits the inline `createRTFn` closure on
  // every RT cache entry alongside the body `code` string. Default
  // false — the JS-side `materializeRTFn` rebuilds factories from
  // `code` via `new Function('utl', code)` on first lookup, saving
  // ~the size of one body copy per entry. Set true for runtimes that
  // disallow dynamic code construction (Cloudflare WorkerD, sandboxed
  // iframes, CSP without `unsafe-eval`). Test setups also enable this
  // so suites can cover both materialisation paths on every case.
  emitCacheFunctions?: boolean;
  // On-disk RT artifact cache location. Default (undefined) wires the
  // cache to `<cwd>/node_modules/.cache/ts-go-run-types`. Pass an
  // explicit string to redirect to a custom directory. Pass `false`
  // to disable caching entirely — used by the marker package's own
  // vitest config to keep test runs from populating the project tree
  // with cache artifacts.
  cacheDir?: string | false;
  // Parallelism opt-outs. The Go binary parallelizes its marker scan
  // (across the tsgo checker pool) and its cache-family renders by
  // default; pass `false` to force the corresponding serial path
  // (--no-parallel-scan / --no-parallel-render). Output is equivalent
  // either way — these exist for benchmarking baselines and debugging.
  parallelScan?: boolean;
  parallelRender?: boolean;
}

// MARKER_MODULE is the fixed package every marker brand is declared in.
// Files that don't import this module are short-circuited as a cheap
// pre-filter. The marker module is no longer user-configurable — the
// --marker-name / --marker-module CLI flags went away with the marker
// migration. To use a custom marker, embed the Go resolver directly
// and pass marker.Options{Specs: [...]}.
const MARKER_MODULE = '@mionjs/ts-go-run-types';

// CACHE_FILE_RE matches the ONE remaining on-disk cache module the plugin
// transforms in place: `…/caches/pureFnsCache.ts` (source mode under vitest)
// or `…/caches/pureFnsCache.js` (built dist mode in production). Pure fns
// are a bounded shared library extracted from `registerPureFnFactory`
// calls, so they keep the aggregated overlay; every per-type cache entry
// (fn families + RunType data nodes) is served as a per-entry virtual
// module instead — see the resolveId/load hooks below.
const CACHE_FILE_RE = /[/\\]caches[/\\](pureFnsCache)\.(?:[jt]sx?|c?[mj]s)$/;

const CACHE_KIND_BY_FILE: Record<string, CacheKind> = {
  pureFnsCache: 'pureFns',
};

export default function runtypes(options: PluginOptions) {
  let resolver: ResolverClient | null = null;
  let cwdAbs = '';
  // Batches concurrent per-file transform scans into multi-file
  // dispatches — see scan-batcher.ts. Rebuilt per resolver.
  let scanner: SiteScanner | null = null;
  // Per-entry virtual-module sources keyed by module key (`<fnHash>_<id>`,
  // `t_<id>`). Populated from every scan response's batch-scoped `modules`
  // map; served by the load() hook. Modules are content-addressed
  // (structural, version-salted keys) and immutable, so entries are never
  // invalidated — a type edit mints NEW keys via the re-transformed user
  // file, and orphans simply stop being imported.
  const moduleSources = new Map<string, string>();
  // One pureFns dump shared by every pureFnsCache transform of a build
  // pass (the only aggregate overlay left in module mode). Invalidated
  // whenever session state may have moved: an HMR edit, or a transform
  // scan reporting new pure fns.
  let dumpAllMemo: Promise<Awaited<ReturnType<ResolverClient['dump']>>> | null = null;
  // True once the memoized dump's response has arrived. While it is
  // still in flight, invalidation signals are ignored: the resolver pipe
  // is FIFO, so a scan whose response arrives before the dump's was
  // necessarily REQUESTED before it — the pending dump already sees that
  // scan's types and stays valid.
  let dumpAllSettled = false;
  function dumpAll() {
    if (!dumpAllMemo) {
      dumpAllSettled = false;
      dumpAllMemo = resolver!.dump({includeCacheSources: ['pureFns']}).then(
        (dump) => {
          dumpAllSettled = true;
          return dump;
        },
        (dumpError) => {
          dumpAllMemo = null;
          throw dumpError;
        }
      );
    }
    return dumpAllMemo;
  }
  function invalidateDumpAll() {
    if (dumpAllMemo && !dumpAllSettled) return;
    dumpAllMemo = null;
  }
  // Resolved absolute ids of the three cache modules — stashed when the
  // transform hook first sees each one. handleHotUpdate uses these to
  // look the modules up in Vite's module graph and invalidate them.
  const cacheModuleIds: Partial<Record<CacheKind, string>> = {};

  return {
    name: 'vite-plugin-runtypes',
    // Must run BEFORE vite/esbuild's built-in TypeScript transform. The
    // resolver returns byte offsets into the ORIGINAL source — if the
    // plugin saw code after esbuild stripped type syntax, every offset
    // would land past the new EOF. enforce: 'pre' guarantees the
    // resolver sees the raw .ts file.
    enforce: 'pre' as const,

    configResolved(this: any, cfg: {root: string}) {
      cwdAbs = path.resolve(options.cwd ?? cfg.root);
      // node_modules/.cache is the canonical location for tooling
      // artifacts that a project's standard `clean` workflow already
      // knows to wipe (npm / pnpm both nuke it under common cleanup
      // recipes). Per-fingerprint subdirs live underneath so distinct
      // build configurations stay isolated. `cacheDir: false` disables
      // the cache so the resolver runs without touching disk.
      let cacheDir: string | undefined;
      if (options.cacheDir === false) cacheDir = undefined;
      else if (typeof options.cacheDir === 'string') cacheDir = options.cacheDir;
      else cacheDir = path.join(cwdAbs, 'node_modules', '.cache', 'ts-go-run-types');
      resolver = new ResolverClient(options.binary, cwdAbs, options.tsconfig ?? 'tsconfig.json', {
        cacheDir,
        emitCacheFunctions: options.emitCacheFunctions ?? false,
        parallelScan: options.parallelScan,
        parallelRender: options.parallelRender,
      });
      dumpAllMemo = null;
      moduleSources.clear();
      scanner = createScanBatcher(async (files) => {
        const result = await resolver!.scanFiles(files, {includeModules: true});
        // Module mode: every scan carries the per-entry module sources for
        // its sites' closures — merge them into the serving map (batch-
        // scoped side channel; the per-file projection keeps them intact).
        if (result.modules) {
          for (const [key, source] of Object.entries(result.modules)) moduleSources.set(key, source);
        }
        // New pure fns reaching the session after the pureFns dump was
        // memoized would leave its body stale — drop the memo so the next
        // pureFnsCache transform re-dumps.
        if (result.addedPureFns) invalidateDumpAll();
        return result;
      });
    },

    buildEnd(this: any) {
      resolver?.close();
      resolver = null;
      scanner = null;
      dumpAllMemo = null;
      moduleSources.clear();
    },

    // Per-entry virtual modules — `virtual:runtypes/<key>.js`. resolveId
    // claims the scheme with the `\0` rollup convention (keeps other
    // plugins and the optimizer away); load serves the source from the
    // in-memory map, falling back to a resolveModules round-trip for keys
    // the current session hasn't rendered yet (e.g. a dev-server restart
    // with a warm client graph re-requesting a module before any scan).
    resolveId(this: any, id: string) {
      if (id.startsWith(VIRTUAL_RUNTYPES_PREFIX)) return '\0' + id;
      return null;
    },

    async load(this: any, id: string) {
      if (!id.startsWith('\0' + VIRTUAL_RUNTYPES_PREFIX)) return null;
      const key = id.slice(1 + VIRTUAL_RUNTYPES_PREFIX.length, id.endsWith(VIRTUAL_RUNTYPES_EXT) ? -VIRTUAL_RUNTYPES_EXT.length : undefined);
      let source = moduleSources.get(key);
      if (source === undefined && resolver) {
        const fetched = await resolver.resolveModules([key]);
        for (const [fetchedKey, fetchedSource] of Object.entries(fetched)) moduleSources.set(fetchedKey, fetchedSource);
        source = moduleSources.get(key);
      }
      if (source === undefined) {
        throw new Error(
          `vite-plugin-runtypes: no module for "${key}" — the importing file references a stale virtual module. ` +
            `Re-save the importing file (or restart the dev server) so its imports are rewritten against the current types.`
        );
      }
      return {code: source, map: null};
    },

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;

      // Cache module file? Replace its body in-place with the Go binary's
      // rendered cache source for the matching kind. The on-disk
      // skeleton is the legitimate empty-state fallback when the plugin
      // isn't active; the transform only overlays it when it has data.
      const cacheMatch = CACHE_FILE_RE.exec(id);
      if (cacheMatch) {
        const kind = CACHE_KIND_BY_FILE[cacheMatch[1]];
        cacheModuleIds[kind] = id;
        const dump = await dumpAll();
        // Diagnostic surfacing. The shared all-kinds dump carries EVERY
        // family's render diagnostics, so surfacing must reproduce what
        // the old per-kind dumps exposed:
        //   - `pureFns` cache: PureFn-family diagnostics (identical to
        //     the old pureFns-only dump), halting on Error severity.
        //   - everything else: nothing. The old runType-only dump carried
        //     no family-render diagnostics (the runTypes module render has
        //     no walker), and the other kinds' transforms discarded
        //     theirs. Family-render warnings/errors keep flowing through
        //     the scanFiles paths (handleHotUpdate re-emits on every
        //     edit with soft severity routing) and through the runtime
        //     alwaysThrow factories the suites assert against — blanket
        //     halt-surfacing them here would fail builds on types whose
        //     throw-at-runtime behavior is intentional.
        if (kind === 'pureFns') {
          surfaceDiagnostics(this, dump.diagnostics ?? [], (d) => d.family === Family.PureFn, {halt: true});
        }
        const body = pickCacheSource(dump, kind);
        if (!body) return null;
        return {code: body, map: null};
      }

      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      // Short-circuit: a file that doesn't reference the marker module
      // can't contain rewritable sites. Cheap textual check before the
      // round-trip to the resolver.
      if (!code.includes(MARKER_MODULE)) return null;

      const rel = path.relative(options.cwd ?? process.cwd(), id);
      const result = await rewrite(rel, code, scanner ?? resolver);
      if (result.sites.length === 0 && result.replacements.length === 0) return null;

      return {code: result.code, map: null};
    },

    // handleHotUpdate is the HMR pivot. When a user file changes:
    //   1. Push the new contents into the resolver (full Program rebuild
    //      under the hood — single biggest HMR cost; tracked in
    //      docs/ROADMAP.md as a follow-up for incremental rebind).
    //   2. Re-scan the changed file so the cache is up to date AND we
    //      get per-cache "did this scan change anything?" signals.
    //   3. Invalidate only the cache modules whose backing data grew
    //      (addedRunTypes / addedValidate / addedPureFns), then return
    //      the changed user file batched with those invalidated modules
    //      so Vite ships them in a single HMR message. The cache
    //      module's `accept` callback fires before the user file's swap,
    //      so any new hash id rewritten into the user file already has
    //      a backing rtUtils entry.
    async handleHotUpdate(this: any, ctx: any) {
      if (!resolver) return;
      const file: string = ctx.file;
      if (!file || !/\.[mc]?[jt]sx?$/.test(file)) return;
      // Editing one of the cache module skeletons itself is a developer-
      // tool moment, not a runtime update — let Vite's default HMR
      // handle it (the transform hook will overlay the new body).
      if (CACHE_FILE_RE.test(file)) return;

      const rel = path.relative(cwdAbs || process.cwd(), file);
      const content = typeof ctx.read === 'function' ? await ctx.read() : undefined;
      if (typeof content === 'string') {
        try {
          await resolver.setSources({[rel]: content});
        } catch {
          // setSources can fail if the changed file is outside the
          // resolver's known set (e.g. a config file). Fall through to
          // default HMR — nothing for the resolver to do here.
          return;
        }
      }

      // The program (and therefore the pureFns body) may have moved —
      // force the next cache-module transform to re-dump. Unconditional:
      // setSources swapped the Program, so even an in-flight dump is
      // against stale state.
      dumpAllMemo = null;
      let result;
      try {
        result = await resolver.scanFiles([rel], {includeModules: true});
      } catch {
        return;
      }
      // Merge the rescan's module closures so the re-transformed file's
      // imports resolve without a resolveModules round-trip. Existing keys
      // are content-addressed and immutable — overwriting is a no-op.
      if (result.modules) {
        for (const [key, source] of Object.entries(result.modules)) moduleSources.set(key, source);
      }

      // Every diagnostic flows through one wire field now; the Family
      // discriminator inside each entry tells consumers which subsystem
      // produced it. Re-emit immediately so the editor's problem panel
      // updates as the user types. `halt: false` because HMR shouldn't
      // tear down the dev server on a single bad type — the user is
      // mid-edit and will fix it imminently. Vite's error overlay still
      // appears via `ctx.warn` when annotated correctly; if the type
      // stays bad through a subsequent module evaluation, the runtime
      // alwaysThrow factory carries source context so the call-site is
      // recoverable from the thrown error too.
      surfaceDiagnostics(this, result.diagnostics ?? [], () => true, {halt: false});

      // Module mode: per-entry virtual modules are content-addressed and
      // immutable, so they are NEVER invalidated — a type edit mints new
      // keys, and the changed user file (already in ctx.modules) re-imports
      // them when its transform re-runs. The pureFns aggregate is the only
      // overlay left to invalidate when the scan grew it.
      const invalidated: any[] = [];
      const moduleGraph = ctx.server?.moduleGraph;
      if (moduleGraph && result.addedPureFns) {
        const cacheId = cacheModuleIds['pureFns'];
        const mod = cacheId ? moduleGraph.getModuleById(cacheId) : undefined;
        if (mod) {
          moduleGraph.invalidateModule(mod);
          invalidated.push(mod);
        }
      }
      if (invalidated.length === 0) return;
      return [...(ctx.modules ?? []), ...invalidated];
    },
  };
}

// pickCacheSource pulls the rendered body field matching `kind` off a
// dump response. Centralised so the transform hook stays terse.
function pickCacheSource(
  dump: {
    runTypeCacheSource?: string;
    validateCacheSource?: string;
    validationErrorsCacheSource?: string;
    prepareForJsonCacheSource?: string;
    restoreFromJsonCacheSource?: string;
    stringifyJsonCacheSource?: string;
    prepareForJsonSafeCacheSource?: string;
    hasUnknownKeysCacheSource?: string;
    stripUnknownKeysCacheSource?: string;
    unknownKeyErrorsCacheSource?: string;
    unknownKeysToUndefinedCacheSource?: string;
    unknownKeysToUndefinedWireCacheSource?: string;
    toBinaryCacheSource?: string;
    fromBinaryCacheSource?: string;
    formatTransformCacheSource?: string;
    pureFnsCacheSource?: string;
  },
  kind: CacheKind
): string | undefined {
  if (kind === 'runType') return dump.runTypeCacheSource;
  if (kind === 'validate') return dump.validateCacheSource;
  if (kind === 'validationErrors') return dump.validationErrorsCacheSource;
  if (kind === 'prepareForJson') return dump.prepareForJsonCacheSource;
  if (kind === 'restoreFromJson') return dump.restoreFromJsonCacheSource;
  if (kind === 'stringifyJson') return dump.stringifyJsonCacheSource;
  if (kind === 'prepareForJsonSafe') return dump.prepareForJsonSafeCacheSource;
  if (kind === 'hasUnknownKeys') return dump.hasUnknownKeysCacheSource;
  if (kind === 'stripUnknownKeys') return dump.stripUnknownKeysCacheSource;
  if (kind === 'unknownKeyErrors') return dump.unknownKeyErrorsCacheSource;
  if (kind === 'unknownKeysToUndefined') return dump.unknownKeysToUndefinedCacheSource;
  if (kind === 'unknownKeysToUndefinedWire') return dump.unknownKeysToUndefinedWireCacheSource;
  if (kind === 'toBinary') return dump.toBinaryCacheSource;
  if (kind === 'fromBinary') return dump.fromBinaryCacheSource;
  if (kind === 'formatTransform') return dump.formatTransformCacheSource;
  if (kind === 'pureFns') return dump.pureFnsCacheSource;
  return undefined;
}

// surfaceDiagnostics routes a diagnostic list through Rollup's plugin
// context based on each entry's severity. The split is the rule that
// makes the build fail (or not) on unsupported types:
//
//   - SeverityError diagnostics ALWAYS get `ctx.warn` so the user sees
//     every error in the build log (not just the first one). When
//     `halt: true` AND at least one error was collected, the function
//     then calls `ctx.error()` ONCE with a summary so the build fails
//     with the full error list still visible above the failure.
//   - SeverityWarning / SeverityInfo emit as `ctx.warn` only — these
//     are intentional behaviours the user should know about but that
//     do not require a hard build halt.
//
// `halt: false` is the HMR mode: a bad type during dev shouldn't kill
// the server; the user is mid-edit. The diagnostic still flows to the
// editor's Problems panel via `ctx.warn`.
function surfaceDiagnostics(
  ctx: any,
  diagnostics: Diagnostic[],
  filter: (d: Diagnostic) => boolean,
  options: {halt: boolean}
): void {
  let errorCount = 0;
  for (const diagnostic of diagnostics) {
    if (!filter(diagnostic)) continue;
    ctx.warn?.(formatTscDiagnostic(diagnostic));
    if (diagnostic.severity === Severity.Error) errorCount += 1;
  }
  if (options.halt && errorCount > 0) {
    const noun = errorCount === 1 ? 'unsupported-type error' : 'unsupported-type errors';
    ctx.error?.(`vite-plugin-runtypes: ${errorCount} ${noun} — build halted. See warnings above for the call sites.`);
  }
}

// formatTscDiagnostic renders a Diagnostic in the canonical
// `tsc --pretty=false` line format so VS Code's $tsc problem matcher
// recognises it:
//   /abs/path(line,col): error PFE9004: headline text
//     Related: /abs/path(line,col): related message
//
// The user-facing headline is resolved from the JS-side catalog
// (`packages/ts-go-run-types/src/runtypes/diagnosticCatalog.ts`) — the wire
// only carries the diagnostic code + optional positional args. Severity
// is numeric on the wire — switch on it to pick the human label since
// the canonical line format requires the word, not the digit.
export function formatTscDiagnostic(d: Diagnostic): string {
  const label = severityLabel(d.severity);
  const headline = renderHeadline(d.code, d.args);
  let line = `${d.site.filePath}(${d.site.startLine},${d.site.startCol}): ${label} ${d.code}: ${headline}`;
  if (d.related && d.related.length > 0) {
    for (const r of d.related) {
      line += `\n  Related: ${r.filePath}(${r.startLine},${r.startCol}): ${r.message}`;
    }
  }
  return line;
}

function severityLabel(s: Severity): string {
  switch (s) {
    case Severity.Error:
      return 'error';
    case Severity.Warning:
      return 'warning';
    case Severity.Info:
      return 'info';
    default:
      return 'info';
  }
}

export type {PluginOptions as Options};
export {
  RUNTYPES_VAR_PREFIX,
  RUNTYPES_MODULE_NAME,
  VALIDATE_VAR_PREFIX,
  VALIDATE_MODULE_NAME,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './runtypes-constants.generated.ts';
