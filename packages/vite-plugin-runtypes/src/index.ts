import path from 'node:path';
import {ResolverClient} from './resolver-client.ts';
import {rewrite} from './rewrite.ts';

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
  // Id of the virtual module the plugin emits. Consumers import this module
  // to get the type-metadata table. Defaults to "virtual:runtypes-cache".
  virtualModuleId?: string;
}

const DEFAULT_VIRTUAL = 'virtual:runtypes-cache';
const DEFAULT_MARKER_MODULE = '@mionjs/ts-go-run-types';

export default function runtypes(options: PluginOptions) {
  const virtualId = options.virtualModuleId ?? DEFAULT_VIRTUAL;
  const resolvedVirtualId = '\0' + virtualId;
  const markerModule = options.markerModule ?? DEFAULT_MARKER_MODULE;

  let resolver: ResolverClient | null = null;

  return {
    name: 'vite-plugin-runtypes',

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
      if (id === virtualId) return resolvedVirtualId;
      return null;
    },

    async load(this: any, id: string) {
      if (id !== resolvedVirtualId) return null;
      // Empty body so `import * as cache from 'virtual:runtypes-cache'`
      // returns an empty namespace until the resolver has produced anything.
      if (!resolver) return '// no runtypes resolved yet\n';
      // The Go binary renders the JS cache module from its in-memory dump.
      // Full cache (not just scanned-files union) — Vite's load() runs once
      // per import and consumers expect every emitted id to be reachable.
      const dump = await resolver.dump();
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

export type {PluginOptions as Options};
export {
  RUNTYPES_VAR_PREFIX,
  RUNTYPES_MODULE_NAME,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './runtypes-constants.generated.ts';
