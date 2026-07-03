import path from 'node:path';
import fs from 'node:fs';
import {createUnplugin} from 'unplugin';
import {getExePath} from 'ts-runtypes-bin';
import {renderHeadline} from './diagnosticCatalog.ts';
import {ResolverClient} from './resolver-client.ts';
import {Family, Severity, type Diagnostic} from './protocol.ts';
import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
  type ModuleMode,
} from './runtypes-constants.generated.ts';

// PluginOptions is the host-plugin surface. The CANONICAL place to configure
// the compiler's PROJECT knobs (emitMode, moduleMode, inlineMode, cacheDir,
// hashLength, parallelScan/Render, singleThreaded) is the `ts-runtypes` entry
// under compilerOptions.plugins in tsconfig.json — see the Configuration guide.
// Those keys are accepted here too as a per-build OVERRIDE (forwarded as a flag,
// so they win over tsconfig, tsc-style); reach for them only when one build
// must differ. `binary` / `cwd` / `tsconfig` / `outDir` are genuinely
// host-specific and have no tsconfig equivalent.
export interface PluginOptions {
  // Absolute path to the compiled ts-runtypes binary. Optional: when omitted,
  // the plugin resolves the prebuilt binary for the host platform via the
  // `ts-runtypes-bin` launcher (its `ts-runtypes-binary-<os>-<arch>` optional
  // dependency). Set this only to point at a custom or local build — e.g.
  // in-repo development passes `bin/ts-runtypes`.
  binary?: string;
  // Project root (where tsconfig.json lives). Defaults to the bundler root —
  // Vite's resolved root when running under Vite, else process.cwd().
  cwd?: string;
  // Path to tsconfig.json, relative to cwd. Defaults to "tsconfig.json".
  tsconfig?: string;
  // RunTypes output root, resolved relative to cwd. The build writes the
  // generated cache modules under `<outDir>/types/` (gitignored) and the
  // committed enrichment under `<outDir>/enriched/`. When omitted, the
  // resolver infers `<srcDir>/__runtypes` from the tsconfig (rootDir →
  // common-ancestor of the program's files → baseUrl → cwd). The folder lives
  // in the project (not node_modules) so a dev watcher sees regenerated modules.
  outDir?: string;
  // What the Go binary ships in each RT cache entry's code/factory slots:
  //   - 'code' (default): only the body `code` string; the JS-side
  //     `materializeRTFn` rebuilds the factory via `new Function('utl', code)`
  //     on first lookup. Smallest output for runtimes that allow dynamic code.
  //   - 'functions': only the live `function g_<hash>(utl){…}` factory; the
  //     code string is derived lazily from it only if read. Smallest
  //     factory-bearing output for runtimes that disallow `new Function`
  //     (Cloudflare WorkerD, sandboxed iframes, CSP without `unsafe-eval`).
  //   - 'both': code string AND live factory (the body twice) — for runtimes
  //     that disallow `new Function` yet read `.code`. Test setups use this so
  //     suites cover both materialisation paths on every case.
  emitMode?: 'code' | 'functions' | 'both';
  // Binary `dynamic` cold-start buffer-size estimate knobs. The compiler walks
  // each binary-encoder type at build time and bakes a buffer-size estimate
  // into the entry; `createBinaryEncoder({sizeStrategy: 'dynamic'})` uses it as
  // the initial buffer size (instead of a 16 MiB default) until per-key history
  // warms up. All are optional and fold into the disk cache fingerprint.
  //   - sizeBias (0..1, default 0.8): 0 = tightest (more grows), 1 = most generous.
  //   - sizeItems (default 100): assumed element count for an unbounded collection.
  //   - sizeStringBytes (default 32): assumed byte length of an unbounded string.
  //   - sizeMaxBytes (default 65536): per-type cap so a huge declared bound
  //     never seeds a multi-MB cold buffer.
  sizeBias?: number;
  sizeItems?: number;
  sizeStringBytes?: number;
  sizeMaxBytes?: number;
  // On-disk RT artifact cache location. Default (undefined) wires the
  // cache to `<cwd>/node_modules/.cache/ts-runtypes`. Pass an
  // explicit string to redirect to a custom directory. Pass `false`
  // to disable caching entirely — used by the marker package's own
  // vitest config to keep test runs from populating the project tree
  // with cache artifacts. This is the INTERNAL incremental artifact cache,
  // separate from `outDir` (the importable generated modules).
  cacheDir?: string | false;
  // Parallelism opt-outs. The Go binary parallelizes its marker scan
  // (across the tsgo checker pool) and its per-family entry collection
  // by default; pass `false` to force the corresponding serial path
  // (--no-parallel-scan / --no-parallel-render). Output is equivalent
  // either way — these exist for benchmarking baselines and debugging.
  parallelScan?: boolean;
  parallelRender?: boolean;
  // How cache entries group into modules:
  //   'default'    — runtype nodes ride ONE data bundle (+ per-root facade
  //                  modules); every fn-family / composite / pure-fn entry
  //                  is its own per-entry module. Best chunk-splitting
  //                  granularity in production builds.
  //   'allSingle'  — bundle everything: one module per fn family
  //                  (`fns/<tag>`), one `pf` pure-fn bundle, facades folded
  //                  into the runtypes bundle. Fewest modules / requests;
  //                  family bundles re-fetch wholesale on type edits.
  //   'allModules' — split everything: per-entry fn modules AND per-node
  //                  runtype modules. Escape hatch; measurably slower on
  //                  dense reflection graphs.
  moduleMode?: ModuleMode;
  // Child-inlining policy:
  //   'default'     — the name rule: UNNAMED compounds (arrays, tuples,
  //                   object literals, unions, classes) inline into their
  //                   parents (statement bodies hoist to per-factory context
  //                   fns); NAMED types (alias/interface) and circular types
  //                   stay external as dedupe-worthy shared entries.
  //                   Date/Temporal builtins always inline (atomic emits).
  //   'allInternal' — name-blind: everything except circular types inlines.
  //                   One function per call-site type per family, at the
  //                   cost of duplicating shapes shared across roots.
  inlineMode?: 'default' | 'allInternal';
}

// MARKER_MODULE is the package whose import marks a file as worth scanning;
// files that don't import it are short-circuited as a cheap pre-filter. The
// scanner itself recognises the marker types by a structural brand, so a
// package that re-exports or vendors them (keeping the brand) is recognised
// automatically with no config. Only a fully custom marker brand needs the
// escape hatch: embed the Go resolver directly and pass marker.Options{Specs}.
const MARKER_MODULE = 'ts-runtypes';

// runtypes-devtools is built on unplugin: ONE factory, many bundler entry
// points (runtypes-devtools/vite, /rollup, /webpack, /rspack, /esbuild are
// `unplugin.<bundler>` from this instance). Files-mode: the resolver writes
// the cache modules to real files under <outDir>/types/ at buildStart and the
// transform injects relative imports to them, so every bundler resolves them
// natively — no virtual-module hooks. The Vite-only config + HMR hooks ride
// the `vite` escape hatch.
export const unplugin = createUnplugin<PluginOptions | undefined>((rawOptions) => {
  const options = rawOptions ?? {};
  let resolver: ResolverClient | null = null;
  let cwdAbs = '';
  // The resolved RunTypes output root (<cwd>/__runtypes by default). Set by
  // ensureResolver once cwdAbs is known; modules land under <outDirAbs>/types.
  let outDirAbs = '';
  // Vite's resolved root, captured in configResolved. Stays empty under every
  // other bundler (no equivalent hook), where ensureResolver falls back to
  // options.cwd ?? process.cwd().
  let viteRoot = '';

  // ensureResolver spawns the resolver subprocess + wires the disk cache on
  // first use. Idempotent: under Vite the configResolved hook calls it early
  // (so it can capture Vite's resolved root); under every other bundler
  // buildStart calls it. The resolver's Program root (cwdAbs) is options.cwd
  // when set, else the Vite root, else process.cwd().
  function ensureResolver() {
    if (resolver) return;
    cwdAbs = path.resolve(options.cwd ?? (viteRoot || process.cwd()));
    // Explicit outDir is resolved up front; otherwise leave it empty and let
    // the resolver infer <srcDir>/__runtypes from the tsconfig at buildStart —
    // the plugin can't parse tsconfig without a dep, so the Go side owns the
    // default and echoes the resolved path back from generate().
    outDirAbs = options.outDir ? path.resolve(cwdAbs, options.outDir) : '';
    // tsconfig is the canonical config surface for the Go compiler's project
    // knobs (emitMode, moduleMode, inlineMode, cacheDir, hashLength, …). The
    // plugin forwards a flag ONLY for an option set explicitly here, so an
    // unset option falls through to the tsconfig ts-runtypes plugin entry and
    // the binary's defaults — tsc-style precedence: a forwarded flag overrides
    // tsconfig overrides the default.
    //
    // cacheDir is the one host-resolved knob: `false` forwards an explicit
    // disable (empty --cache-dir), a string forwards that path, and undefined
    // forwards nothing so the binary derives <cwd>/node_modules/.cache/ts-runtypes
    // (the canonical tooling-artifact location, wiped by standard `clean`
    // recipes) or honours a tsconfig cacheDir.
    let cacheDir: string | undefined;
    if (options.cacheDir === false) cacheDir = '';
    else if (typeof options.cacheDir === 'string') cacheDir = options.cacheDir;
    // Surface a config typo at the host boundary (the binary validates the
    // merged value too) — only when the user actually set moduleMode.
    if (
      options.moduleMode !== undefined &&
      options.moduleMode !== MODULE_MODE_DEFAULT &&
      options.moduleMode !== MODULE_MODE_ALL_SINGLE &&
      options.moduleMode !== MODULE_MODE_ALL_MODULES
    ) {
      throw new Error(
        `[runtypes-devtools] unknown moduleMode ${JSON.stringify(options.moduleMode)} — expected '${MODULE_MODE_DEFAULT}' | '${MODULE_MODE_ALL_SINGLE}' | '${MODULE_MODE_ALL_MODULES}'`
      );
    }
    // Explicit path wins; otherwise resolve the host-platform binary from the
    // ts-runtypes-bin launcher (throws with a clear message if none is installed).
    const binaryPath = options.binary ?? getExePath();
    resolver = new ResolverClient(binaryPath, cwdAbs, options.tsconfig ?? 'tsconfig.json', {
      ...(cacheDir !== undefined ? {cacheDir} : {}),
      ...(options.emitMode ? {emitMode: options.emitMode} : {}),
      ...(options.sizeBias !== undefined ? {sizeBias: options.sizeBias} : {}),
      ...(options.sizeItems !== undefined ? {sizeItems: options.sizeItems} : {}),
      ...(options.sizeStringBytes !== undefined ? {sizeStringBytes: options.sizeStringBytes} : {}),
      ...(options.sizeMaxBytes !== undefined ? {sizeMaxBytes: options.sizeMaxBytes} : {}),
      ...(options.inlineMode ? {inlineMode: options.inlineMode} : {}),
      ...(options.parallelScan !== undefined ? {parallelScan: options.parallelScan} : {}),
      ...(options.parallelRender !== undefined ? {parallelRender: options.parallelRender} : {}),
      ...(options.moduleMode ? {moduleMode: options.moduleMode} : {}),
    });
  }

  // ensureOutputDirs writes the VCS-hygiene files once. <outDir>/types holds
  // the generated cache modules (gitignored); <outDir>/enriched holds the
  // committed enrichment (kept). Write-if-absent so we never churn a watched
  // file or clobber a user's edits.
  function ensureOutputDirs() {
    const typesDir = path.join(outDirAbs, 'types');
    const enrichedDir = path.join(outDirAbs, 'enriched');
    fs.mkdirSync(typesDir, {recursive: true});
    fs.mkdirSync(enrichedDir, {recursive: true});
    const gitignore = path.join(typesDir, '.gitignore');
    if (!fs.existsSync(gitignore)) {
      fs.writeFileSync(gitignore, '# Generated by runtypes-devtools — do not edit or commit.\n*\n');
    }
    const gitkeep = path.join(enrichedDir, '.gitkeep');
    if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, '');
  }

  return {
    name: 'runtypes-devtools',
    // Must run BEFORE vite/esbuild's built-in TypeScript transform. The
    // resolver returns byte offsets into the ORIGINAL source — if the
    // plugin saw code after esbuild stripped type syntax, every offset
    // would land past the new EOF. enforce: 'pre' guarantees the
    // resolver sees the raw .ts file.
    enforce: 'pre' as const,

    // buildStart generates the WHOLE program's cache modules to disk up front,
    // before any module resolution runs — so every relative import the
    // transform injects already resolves to a real file. Unified across
    // bundlers; under Vite, configResolved spawns the resolver earlier, so the
    // ensureResolver call here is then a no-op.
    async buildStart(this: any) {
      ensureResolver();
      // generate writes the modules and, when outDirAbs is empty, returns the
      // resolver-inferred <srcDir>/__runtypes. Adopt that resolved path before
      // ensuring the VCS-hygiene files so .gitignore/.gitkeep land in the
      // right tree and every later transform/HMR call reuses it.
      const gen = await resolver!.generate(outDirAbs || undefined);
      if (gen.outDir) outDirAbs = gen.outDir;
      ensureOutputDirs();
      // Pure-fn extraction errors halt the build (files-mode has no virtual
      // fallback, so a generation error is fatal); RT-render diagnostics flow
      // through the per-file transform path.
      surfaceDiagnostics(this, gen.diagnostics ?? [], (d) => d.family === Family.PureFn, {halt: true});
    },

    buildEnd() {
      resolver?.close();
      resolver = null;
    },

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;
      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      // Short-circuit: a file that doesn't reference the marker module
      // can't contain rewritable sites. Cheap textual check before the
      // round-trip to the resolver. We match the module only as a quoted
      // import specifier (`'ts-runtypes`, `"ts-runtypes`, incl. subpaths
      // like `ts-runtypes/schema`) — a bare `includes(MARKER_MODULE)` also
      // fires on path mentions in comments (e.g. `packages/ts-runtypes/…`),
      // which would force the resolver to scan files that never import the
      // markers. `registerPureFnFactory` is checked separately because the
      // marker package's OWN sources call it via relative imports (no
      // package-name string in the file).
      const importsMarkerModule = code.includes(`'${MARKER_MODULE}`) || code.includes(`"${MARKER_MODULE}`);
      if (!importsMarkerModule && !code.includes('registerPureFnFactory')) return null;

      const rel = path.relative(cwdAbs || process.cwd(), id);
      // The Go binary owns the full transform (OpTransform): it scans, applies
      // the call-site rewrites + dedup import block + bindings (relativized to
      // <outDir>/types since outDirAbs is passed), and generates the source map.
      const result = await resolver.transform([rel], outDirAbs);
      // A file outside the buildStart Program may surface new types / pure fns;
      // regenerate so the modules its injected imports point at exist on disk
      // before the bundler resolves them. (write-only-on-change keeps it cheap.)
      if (result.addedRunTypes || result.addedPureFns) await resolver.generate(outDirAbs);
      if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
      const fileResult = result.transformed[rel];
      if (!fileResult) return null;
      // The Go-generated map lets the bundler chain our edits into the
      // composite source map. fileResult.map is our wire SourceMap (protocol.ts)
      // — structurally valid but typed with `sources: (string|null)[]` where the
      // bundler source-map input wants string[]; cast at the boundary.
      return {code: fileResult.code, map: (fileResult.map ?? undefined) as any};
    },

    vite: {
      // configResolved captures Vite's resolved root, then spawns the
      // resolver eagerly. The marker package's vitest relies on the resolver
      // existing as soon as the workspace project initialises (before any
      // test transform), which is exactly when configResolved fires.
      configResolved(cfg: {root: string}) {
        viteRoot = cfg.root;
        ensureResolver();
      },

      // handleHotUpdate is the HMR pivot. When a user file changes: push the
      // new contents into the resolver (full Program rebuild — the biggest HMR
      // cost; tracked in docs/ROADMAP.md), re-scan it, then regenerate the
      // cache modules to disk. Generated module names are content-addressed and
      // written only-on-change, so the watcher reloads exactly the modules whose
      // bytes moved; the re-transformed user file imports any new ones.
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

        let result;
        try {
          result = await resolver.scanFiles([rel]);
        } catch {
          return;
        }
        // Regenerate so any new/changed modules hit disk; the watcher reloads
        // them (the folder lives in the project root, which Vite watches).
        try {
          await resolver.generate(outDirAbs);
        } catch {
          // A regenerate failure shouldn't tear down the dev server mid-edit.
        }

        // Re-emit diagnostics so the editor's problem panel updates as the user
        // types. `halt: false` because HMR shouldn't tear down the dev server on
        // a single bad type — the user is mid-edit; the runtime alwaysThrow
        // factory still carries source context if the type stays bad.
        surfaceDiagnostics(this, result.diagnostics ?? [], () => true, {halt: false});
      },
    },
  };
});

export default unplugin;

// surfaceDiagnostics routes a diagnostic list through the bundler's plugin
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
    ctx.error?.(`runtypes-devtools: ${errorCount} ${noun} — build halted. See warnings above for the call sites.`);
  }
}

// formatTscDiagnostic renders a Diagnostic in the canonical
// `tsc --pretty=false` line format so VS Code's $tsc problem matcher
// recognises it:
//   /abs/path(line,col): error PFE9004: headline text
//     Related: /abs/path(line,col): related message
//
// The user-facing headline is resolved from the generated catalog
// (`./diagnosticCatalog.generated.ts`, sourced from internal/diag) — the
// wire only carries the diagnostic code + optional positional args. Severity
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
  ENTRY_BINDING_PREFIX,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './runtypes-constants.generated.ts';
