import path from 'node:path';
import {renderHeadline} from './diagnosticCatalog.ts';
import {ResolverClient} from './resolver-client.ts';
import {createScanBatcher, type SiteScanner} from './scan-batcher.ts';
import {rewrite} from './rewrite.ts';
import {Family, Severity, type Diagnostic} from './protocol.ts';
import {ENTRY_MODULE_SUFFIX, VIRTUAL_MODULE_PREFIX} from './runtypes-constants.generated.ts';

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
  // (across the tsgo checker pool) and its per-family entry collection
  // by default; pass `false` to force the corresponding serial path
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

// Rollup convention: prefix resolved virtual ids with \0 so other plugins
// (and Vite's own resolver) leave them alone. The public specifier the
// rewrite injects stays the bare `virtual:rt/<basename>.js`.
const RESOLVED_VIRTUAL_PREFIX = '\0' + VIRTUAL_MODULE_PREFIX;

export default function runtypes(options: PluginOptions) {
  let resolver: ResolverClient | null = null;
  let cwdAbs = '';
  // Batches concurrent per-file transform scans into multi-file
  // dispatches — see scan-batcher.ts. Rebuilt per resolver.
  let scanner: SiteScanner | null = null;
  // One full dump shared by every virtual-module load of a build pass.
  // The dump carries the complete `entryModules` map (every cache entry
  // the session knows), so N module loads share one wire payload.
  // Invalidated whenever session state may have moved: an HMR edit, or
  // a transform scan reporting new types.
  let dumpAllMemo: Promise<Awaited<ReturnType<ResolverClient['dump']>>> | null = null;
  // True once the memoized dump's response has arrived. While it is
  // still in flight, invalidation signals are ignored: the resolver pipe
  // is FIFO, so a scan whose response arrives before the dump's was
  // necessarily REQUESTED before it — the pending dump already sees that
  // scan's types and stays valid.
  let dumpAllSettled = false;
  // One-shot guard for surfacing the dump's diagnostics: virtual-module
  // loads share the memoized dump, and re-warning the same diagnostics on
  // every entry load would flood the terminal.
  let dumpDiagnosticsSurfaced = false;
  function dumpAll() {
    if (!dumpAllMemo) {
      dumpAllSettled = false;
      dumpDiagnosticsSurfaced = false;
      dumpAllMemo = resolver!.dump().then(
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
      scanner = createScanBatcher(async (files) => {
        const result = await resolver!.scanFiles(files);
        // New types reaching the session after the dump was memoized
        // would leave the entryModules map stale — drop the memo so the
        // next virtual-module load re-dumps.
        if (result.addedRunTypes || result.addedPureFns) invalidateDumpAll();
        return result;
      });
    },

    buildEnd(this: any) {
      resolver?.close();
      resolver = null;
      scanner = null;
      dumpAllMemo = null;
    },

    // Every cache entry is its own virtual module: `virtual:rt/<basename>.js`.
    // Entry modules are side-effect-free (a tuple export plus imports) and
    // content-addressed — ids embed the binary version, so a given module's
    // source never changes and Rollup may tree-shake unreferenced ones freely.
    resolveId(this: any, source: string) {
      if (source.startsWith(VIRTUAL_MODULE_PREFIX)) {
        return {id: '\0' + source, moduleSideEffects: false};
      }
      return null;
    },

    async load(this: any, id: string) {
      if (!id.startsWith(RESOLVED_VIRTUAL_PREFIX)) return null;
      if (!resolver) return null;
      let basename = id.slice(RESOLVED_VIRTUAL_PREFIX.length);
      if (basename.endsWith(ENTRY_MODULE_SUFFIX)) basename = basename.slice(0, -ENTRY_MODULE_SUFFIX.length);
      const dump = await dumpAll();
      // Surface the dump's diagnostics once per memoized dump. Pure-fn
      // extraction errors halt the build (same contract the pureFns cache
      // transform enforced pre-migration); RT-render diagnostics flow through
      // the scanFiles path during transforms, so only PureFn-family entries
      // are halt-checked here.
      if (!dumpDiagnosticsSurfaced) {
        dumpDiagnosticsSurfaced = true;
        surfaceDiagnostics(this, dump.diagnostics ?? [], (d) => d.family === Family.PureFn, {halt: true});
      }
      const source = dump.entryModules?.[basename];
      if (source === undefined) {
        this.error?.(
          `vite-plugin-runtypes: no entry module for "${basename}" — the import was injected by a marker rewrite, ` +
            `but the resolver session doesn't know that entry. This usually means the importing file was rewritten ` +
            `against a different resolver session (stale dev-server state); restarting the dev server resolves it.`
        );
        return null;
      }
      return {code: source, map: null};
    },

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;
      if (id.startsWith(RESOLVED_VIRTUAL_PREFIX)) return null;
      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      // Short-circuit: a file that doesn't reference the marker module
      // can't contain rewritable sites. Cheap textual check before the
      // round-trip to the resolver. `registerPureFnFactory` is checked
      // separately because the marker package's OWN sources call it via
      // relative imports (no package-name string in the file) — and with
      // per-entry modules the factory-arg rewrite at those sites IS the
      // runtime registration of the built-in pure fns.
      if (!code.includes(MARKER_MODULE) && !code.includes('registerPureFnFactory')) return null;

      const rel = path.relative(options.cwd ?? process.cwd(), id);
      const result = await rewrite(rel, code, scanner ?? resolver);
      if (result.sites.length === 0 && result.replacements.length === 0) return null;

      return {code: result.code, map: null};
    },

    // handleHotUpdate is the HMR pivot. When a user file changes:
    //   1. Push the new contents into the resolver (full Program rebuild
    //      under the hood — single biggest HMR cost; tracked in
    //      docs/ROADMAP.md as a follow-up for incremental rebind).
    //   2. Re-scan the changed file so the session is up to date and the
    //      editor's problem panel refreshes.
    //   3. Drop the dump memo. Entry modules themselves never need
    //      invalidating — they are content-addressed (an edited type is a
    //      NEW id, so the re-transformed user file imports a new virtual
    //      module and the old one simply goes unreferenced).
    async handleHotUpdate(this: any, ctx: any) {
      if (!resolver) return;
      const file: string = ctx.file;
      if (!file || !/\.[mc]?[jt]sx?$/.test(file)) return;

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

      // The program (and therefore every entry-module body) may have moved —
      // force the next virtual-module load to re-dump. Unconditional:
      // setSources swapped the Program, so even an in-flight dump is
      // against stale state.
      dumpAllMemo = null;
      let result;
      try {
        result = await resolver.scanFiles([rel]);
      } catch {
        return;
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
    },
  };
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
  VIRTUAL_MODULE_PREFIX,
  ENTRY_MODULE_SUFFIX,
  ENTRY_EXPORT_NAME,
  ENTRY_BINDING_PREFIX,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './runtypes-constants.generated.ts';
