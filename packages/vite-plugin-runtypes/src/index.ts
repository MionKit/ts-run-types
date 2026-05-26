import path from 'node:path';
import {ResolverClient} from './resolver-client.ts';
import {rewrite} from './rewrite.ts';
import type {CacheKind, MarkerDiagnostic, PureFnDiagnostic} from './protocol.ts';

export interface PluginOptions {
  // Absolute path to the compiled ts-go-run-types binary.
  binary: string;
  // Project root (where tsconfig.json lives). Defaults to Vite's root.
  cwd?: string;
  // Path to tsconfig.json, relative to cwd. Defaults to "tsconfig.json".
  tsconfig?: string;
  // Marker type alias name. Defaults to "RuntypeId".
  markerName?: string;
  // Package the marker is declared in. Defaults to "@mionjs/ts-go-run-types".
  // Files that don't import the marker module are short-circuited.
  markerModule?: string;
}

const DEFAULT_MARKER_MODULE = '@mionjs/ts-go-run-types';

// CACHE_FILE_RE matches the three on-disk cache module files the plugin
// transforms in place: `…/caches/runTypesCache.ts` (source mode under
// vitest) or `…/caches/runTypesCache.js` (built dist mode in production).
// The same regex matches both flavours so the plugin doesn't have to
// resolve the package's `exports` map at startup. Anchored on the
// `/caches/` parent dir to avoid colliding with same-named files
// outside the marker package.
const CACHE_FILE_RE =
  /[/\\]caches[/\\](runTypesCache|isTypeCache|getTypeErrorsCache|prepareForJsonCache|restoreFromJsonCache|stringifyJsonCache|prepareForJsonSafeCache|prepareForJsonSafePreserveCache|hasUnknownKeysCache|stripUnknownKeysCache|unknownKeyErrorsCache|unknownKeysToUndefinedCache|unknownKeysToUndefinedWireCache|toBinaryCache|fromBinaryCache|pureFnsCache)\.(?:[jt]sx?|c?[mj]s)$/;

const CACHE_KIND_BY_FILE: Record<string, CacheKind> = {
  runTypesCache: 'runType',
  isTypeCache: 'isType',
  getTypeErrorsCache: 'typeErrors',
  prepareForJsonCache: 'prepareForJson',
  restoreFromJsonCache: 'restoreFromJson',
  stringifyJsonCache: 'stringifyJson',
  prepareForJsonSafeCache: 'prepareForJsonSafe',
  prepareForJsonSafePreserveCache: 'prepareForJsonSafePreserve',
  hasUnknownKeysCache: 'hasUnknownKeys',
  stripUnknownKeysCache: 'stripUnknownKeys',
  unknownKeyErrorsCache: 'unknownKeyErrors',
  unknownKeysToUndefinedCache: 'unknownKeysToUndefined',
  unknownKeysToUndefinedWireCache: 'unknownKeysToUndefinedWire',
  toBinaryCache: 'toBinary',
  fromBinaryCache: 'fromBinary',
  pureFnsCache: 'pureFns',
};

export default function runtypes(options: PluginOptions) {
  const markerModule = options.markerModule ?? DEFAULT_MARKER_MODULE;

  let resolver: ResolverClient | null = null;
  let cwdAbs = '';
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
    enforce: 'pre',

    configResolved(this: any, cfg: {root: string}) {
      cwdAbs = path.resolve(options.cwd ?? cfg.root);
      // node_modules/.cache is the canonical location for tooling
      // artifacts that a project's standard `clean` workflow already
      // knows to wipe (npm / pnpm both nuke it under common cleanup
      // recipes). Per-fingerprint subdirs live underneath so distinct
      // build configurations stay isolated.
      const cacheDir = path.join(cwdAbs, 'node_modules', '.cache', 'ts-go-run-types');
      resolver = new ResolverClient(options.binary, cwdAbs, options.tsconfig ?? 'tsconfig.json', {
        markerName: options.markerName,
        markerModule: options.markerModule,
        cacheDir,
      });
    },

    buildEnd(this: any) {
      resolver?.close();
      resolver = null;
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
        const dump = await resolver.dump({includeCacheSources: [kind]});
        // PureFn diagnostics flow alongside pureFnsCacheSource only —
        // surface them on that one transform call so each diagnostic is
        // emitted exactly once per build pass.
        if (kind === 'pureFns') {
          for (const diag of dump.pureFnsDiagnostics ?? []) {
            this.warn(formatTscDiagnostic(diag));
          }
        }
        const body = pickCacheSource(dump, kind);
        if (!body) return null;
        return {code: body, map: null};
      }

      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      // Short-circuit: a file that doesn't reference the marker module
      // can't contain rewritable sites. Cheap textual check before the
      // round-trip to the resolver.
      if (!code.includes(markerModule)) return null;

      const rel = path.relative(options.cwd ?? process.cwd(), id);
      const result = await rewrite(rel, code, resolver);
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
    //      (addedRunTypes / addedIsType / addedPureFns), then return
    //      the changed user file batched with those invalidated modules
    //      so Vite ships them in a single HMR message. The cache
    //      module's `accept` callback fires before the user file's swap,
    //      so any new hash id rewritten into the user file already has
    //      a backing jitUtils entry.
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

      let result;
      try {
        result = await resolver.scanFiles([rel], {includeCacheSources: ['all']});
      } catch {
        return;
      }

      // PureFn diagnostics from this scan — surface immediately so
      // the editor's problem panel updates as the user types.
      for (const diag of result.pureFnsDiagnostics ?? []) {
        this.warn?.(formatTscDiagnostic(diag));
      }
      // Marker-scanner diagnostics (e.g. function-call-argument
      // anti-pattern). Same surface as pureFns above.
      for (const diag of result.markerDiagnostics ?? []) {
        this.warn?.(formatTscDiagnostic(diag));
      }

      const invalidated: any[] = [];
      const moduleGraph = ctx.server?.moduleGraph;
      if (moduleGraph) {
        const kindsToInvalidate: CacheKind[] = [];
        if (result.addedRunTypes) kindsToInvalidate.push('runType');
        if (result.addedIsType) kindsToInvalidate.push('isType');
        if (result.addedTypeErrors) kindsToInvalidate.push('typeErrors');
        if (result.addedPrepareForJson) kindsToInvalidate.push('prepareForJson');
        if (result.addedRestoreFromJson) kindsToInvalidate.push('restoreFromJson');
        if (result.addedStringifyJson) kindsToInvalidate.push('stringifyJson');
        if (result.addedPrepareForJsonSafe) kindsToInvalidate.push('prepareForJsonSafe');
        if (result.addedPrepareForJsonSafePreserve) kindsToInvalidate.push('prepareForJsonSafePreserve');
        if (result.addedHasUnknownKeys) kindsToInvalidate.push('hasUnknownKeys');
        if (result.addedStripUnknownKeys) kindsToInvalidate.push('stripUnknownKeys');
        if (result.addedUnknownKeyErrors) kindsToInvalidate.push('unknownKeyErrors');
        if (result.addedUnknownKeysToUndefined) kindsToInvalidate.push('unknownKeysToUndefined');
        if (result.addedUnknownKeysToUndefinedWire) kindsToInvalidate.push('unknownKeysToUndefinedWire');
        if (result.addedToBinary) kindsToInvalidate.push('toBinary');
        if (result.addedFromBinary) kindsToInvalidate.push('fromBinary');
        if (result.addedPureFns) kindsToInvalidate.push('pureFns');
        for (const kind of kindsToInvalidate) {
          const cacheId = cacheModuleIds[kind];
          if (!cacheId) continue;
          const mod = moduleGraph.getModuleById(cacheId);
          if (!mod) continue;
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
    isTypeCacheSource?: string;
    typeErrorsCacheSource?: string;
    prepareForJsonCacheSource?: string;
    restoreFromJsonCacheSource?: string;
    stringifyJsonCacheSource?: string;
    prepareForJsonSafeCacheSource?: string;
    prepareForJsonSafePreserveCacheSource?: string;
    hasUnknownKeysCacheSource?: string;
    stripUnknownKeysCacheSource?: string;
    unknownKeyErrorsCacheSource?: string;
    unknownKeysToUndefinedCacheSource?: string;
    unknownKeysToUndefinedWireCacheSource?: string;
    toBinaryCacheSource?: string;
    fromBinaryCacheSource?: string;
    pureFnsCacheSource?: string;
  },
  kind: CacheKind
): string | undefined {
  if (kind === 'runType') return dump.runTypeCacheSource;
  if (kind === 'isType') return dump.isTypeCacheSource;
  if (kind === 'typeErrors') return dump.typeErrorsCacheSource;
  if (kind === 'prepareForJson') return dump.prepareForJsonCacheSource;
  if (kind === 'restoreFromJson') return dump.restoreFromJsonCacheSource;
  if (kind === 'stringifyJson') return dump.stringifyJsonCacheSource;
  if (kind === 'prepareForJsonSafe') return dump.prepareForJsonSafeCacheSource;
  if (kind === 'prepareForJsonSafePreserve') return dump.prepareForJsonSafePreserveCacheSource;
  if (kind === 'hasUnknownKeys') return dump.hasUnknownKeysCacheSource;
  if (kind === 'stripUnknownKeys') return dump.stripUnknownKeysCacheSource;
  if (kind === 'unknownKeyErrors') return dump.unknownKeyErrorsCacheSource;
  if (kind === 'unknownKeysToUndefined') return dump.unknownKeysToUndefinedCacheSource;
  if (kind === 'unknownKeysToUndefinedWire') return dump.unknownKeysToUndefinedWireCacheSource;
  if (kind === 'toBinary') return dump.toBinaryCacheSource;
  if (kind === 'fromBinary') return dump.fromBinaryCacheSource;
  if (kind === 'pureFns') return dump.pureFnsCacheSource;
  return undefined;
}

// formatTscDiagnostic renders a diagnostic (pure-fn or marker) in the
// canonical `tsc --pretty=false` line format so VS Code's $tsc problem
// matcher recognises it:
//   /abs/path(line,col): error PFE9001: message
//     Related: /abs/path(line,col): related message
export function formatTscDiagnostic(diag: PureFnDiagnostic | MarkerDiagnostic): string {
  let line = `${diag.site.filePath}(${diag.site.startLine},${diag.site.startCol}): ${diag.category} ${diag.code}: ${diag.message}`;
  const related = 'related' in diag ? diag.related : undefined;
  if (related && related.length > 0) {
    for (const r of related) {
      line += `\n  Related: ${r.filePath}(${r.startLine},${r.startCol}): ${r.message}`;
    }
  }
  return line;
}

export type {PluginOptions as Options};
export {
  RUNTYPES_VAR_PREFIX,
  RUNTYPES_MODULE_NAME,
  ISTYPE_VAR_PREFIX,
  ISTYPE_MODULE_NAME,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './runtypes-constants.generated.ts';
