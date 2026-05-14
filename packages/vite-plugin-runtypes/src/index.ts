import path from 'node:path';
import {ResolverClient} from './resolver-client.js';
import {rewrite} from './rewrite.js';
import {renderCacheModule} from './render-cache.js';
import type {Site, Type} from './protocol.js';

export interface PluginOptions {
  // Absolute path to the compiled ts-run-types binary.
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
  // Accumulated across all transform() calls — cleared on resolver restart.
  // Keyed by hash id (mion's quickHash).
  const types = new Map<string, Type>();
  const sites: Site[] = [];

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

    load(this: any, id: string) {
      if (id !== resolvedVirtualId) return null;
      return renderCacheModule({
        types: Array.from(types.values()),
        sites,
      });
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

      for (const s of result.sites) {
        sites.push({file: rel, pos: s.pos, id: s.id, paramIndex: s.paramIndex});
      }
      const dump = await resolver.dump();
      for (const t of dump.types ?? []) {
        if (t.id !== undefined) types.set(t.id, t);
      }

      return {code: result.code, map: null};
    },
  };
}

export type {PluginOptions as Options};
export {renderCacheModule};
