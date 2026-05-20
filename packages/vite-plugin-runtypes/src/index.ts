import path from 'node:path';
import {ResolverClient} from './resolver-client.ts';
import {rewrite} from './rewrite.ts';
import type {ParsedFnDiagnostic} from './protocol.ts';

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
  // Id of the runtypes metadata virtual module. Consumers import this
  // module to get the type-metadata table. Defaults to
  // "virtual:runtypes-cache".
  virtualModuleId?: string;
  // Id of the precompiled isType-validator virtual module. Consumers
  // import the `get_isType_<hash>(utl)` factories from this module and
  // invoke them to materialise validators. Defaults to
  // "virtual:runtypes-isType".
  isTypeVirtualModuleId?: string;
  // Id of the parsedFns virtual module — consumed by
  // `@mionjs/ts-go-run-types`'s `registerPureFnFactory` to look up
  // {bodyHash, paramNames, code} extracted at build time.
  // Defaults to "virtual:runtypes-parsed-fns".
  parsedFnsVirtualModuleId?: string;
}

const DEFAULT_VIRTUAL = 'virtual:runtypes-cache';
const DEFAULT_ISTYPE_VIRTUAL = 'virtual:runtypes-isType';
const DEFAULT_PARSED_FNS_VIRTUAL = 'virtual:runtypes-parsed-fns';
const DEFAULT_MARKER_MODULE = '@mionjs/ts-go-run-types';

export default function runtypes(options: PluginOptions) {
  const virtualId = options.virtualModuleId ?? DEFAULT_VIRTUAL;
  const resolvedVirtualId = '\0' + virtualId;
  const isTypeVirtualId = options.isTypeVirtualModuleId ?? DEFAULT_ISTYPE_VIRTUAL;
  const resolvedIsTypeVirtualId = '\0' + isTypeVirtualId;
  const parsedFnsVirtualId = options.parsedFnsVirtualModuleId ?? DEFAULT_PARSED_FNS_VIRTUAL;
  const resolvedParsedFnsVirtualId = '\0' + parsedFnsVirtualId;
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

    resolveId(this: any, id: string) {
      // Accept both the bare virtual id and the already-resolved \0-prefixed
      // form. Vitest's SSR module loader sometimes re-asks resolveId with
      // the resolved id (during dep analysis of an importer); returning
      // null there would orphan the module so load() never fires.
      if (id === virtualId || id === resolvedVirtualId) return resolvedVirtualId;
      if (id === isTypeVirtualId || id === resolvedIsTypeVirtualId) return resolvedIsTypeVirtualId;
      if (id === parsedFnsVirtualId || id === resolvedParsedFnsVirtualId) return resolvedParsedFnsVirtualId;
      return null;
    },

    async load(this: any, id: string) {
      if (id !== resolvedVirtualId && id !== resolvedIsTypeVirtualId && id !== resolvedParsedFnsVirtualId) return null;
      // Empty body so `import * as cache from 'virtual:runtypes-cache'`
      // returns an empty namespace until the resolver has produced anything.
      if (!resolver) {
        if (id === resolvedParsedFnsVirtualId) return 'export const parsedFns = {};\n';
        return '// no runtypes resolved yet\n';
      }
      // The Go binary renders all three virtual modules from its in-memory
      // dump in a single call. Full cache (not just scanned-files union) —
      // Vite's load() runs once per import and consumers expect every
      // emitted key to be reachable.
      const dump = await resolver.dump();
      // Surface parsedFn diagnostics on every dump. `this.warn` is the
      // Rollup/Vite plugin context method that emits a build warning
      // without failing the build. Vite collapses duplicate messages
      // within a single build pass.
      for (const diag of dump.parsedFnsDiagnostics ?? []) {
        this.warn(formatTscDiagnostic(diag));
      }
      if (id === resolvedIsTypeVirtualId) {
        return dump.isTypeCacheSource ?? '// no isType validators emitted yet\n';
      }
      if (id === resolvedParsedFnsVirtualId) {
        return dump.parsedFnsCacheSource ?? 'export const parsedFns = {};\n';
      }
      return dump.cacheSource ?? '// no runtypes resolved yet\n';
    },

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;
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
