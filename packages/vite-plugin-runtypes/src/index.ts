import path from 'node:path';
import {ResolverClient} from './resolver-client.ts';
import {rewrite} from './rewrite.ts';
import type {CacheKind, ParsedFnDiagnostic} from './protocol.ts';

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
const CACHE_FILE_RE = /[/\\]caches[/\\](runTypesCache|isTypeCache|parsedFnsCache)\.(?:[jt]sx?|c?[mj]s)$/;

const CACHE_KIND_BY_FILE: Record<string, CacheKind> = {
  runTypesCache: 'runType',
  isTypeCache: 'isType',
  parsedFnsCache: 'parsedFns',
};

export default function runtypes(options: PluginOptions) {
  const markerModule = options.markerModule ?? DEFAULT_MARKER_MODULE;

  let resolver: ResolverClient | null = null;

  return {
    name: 'vite-plugin-runtypes',
    // Must run BEFORE vite/esbuild's built-in TypeScript transform. The
    // resolver returns byte offsets into the ORIGINAL source — if the
    // plugin saw code after esbuild stripped type syntax, every offset
    // would land past the new EOF. enforce: 'pre' guarantees the
    // resolver sees the raw .ts file.
    enforce: 'pre',

    configResolved(this: any, cfg: {root: string}) {
      const cwd = path.resolve(options.cwd ?? cfg.root);
      resolver = new ResolverClient(options.binary, cwd, options.tsconfig ?? 'tsconfig.json', {
        markerName: options.markerName,
        markerModule: options.markerModule,
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
        const dump = await resolver.dump({includeCacheSources: [kind]});
        // ParsedFn diagnostics flow alongside parsedFnsCacheSource only —
        // surface them on that one transform call so each diagnostic is
        // emitted exactly once per build pass.
        if (kind === 'parsedFns') {
          for (const diag of dump.parsedFnsDiagnostics ?? []) {
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
      if (result.sites.length === 0) return null;

      return {code: result.code, map: null};
    },
  };
}

// pickCacheSource pulls the rendered body field matching `kind` off a
// dump response. Centralised so the transform hook stays terse.
function pickCacheSource(
  dump: {runTypeCacheSource?: string; isTypeCacheSource?: string; parsedFnsCacheSource?: string},
  kind: CacheKind
): string | undefined {
  if (kind === 'runType') return dump.runTypeCacheSource;
  if (kind === 'isType') return dump.isTypeCacheSource;
  if (kind === 'parsedFns') return dump.parsedFnsCacheSource;
  return undefined;
}

// formatTscDiagnostic renders a parsedFn diagnostic in the canonical
// `tsc --pretty=false` line format so VS Code's $tsc problem matcher
// recognises it:
//   /abs/path(line,col): error PFE9001: message
//     Related: /abs/path(line,col): related message
export function formatTscDiagnostic(diag: ParsedFnDiagnostic): string {
  let line = `${diag.site.filePath}(${diag.site.startLine},${diag.site.startCol}): ${diag.category} ${diag.code}: ${diag.message}`;
  if (diag.related && diag.related.length > 0) {
    for (const related of diag.related) {
      line += `\n  Related: ${related.filePath}(${related.startLine},${related.startCol}): ${related.message}`;
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
