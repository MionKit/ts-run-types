import path from "node:path";
import { ResolverClient } from "./resolver-client.js";
import { DEFAULT_MARKERS, rewrite, type Marker } from "./rewrite.js";
import { renderCacheModule } from "./render-cache.js";
import type { Site, Type } from "./protocol.js";

export interface PluginOptions {
  // Absolute path to the compiled ts-run-types binary.
  binary: string;
  // Project root (where tsconfig.json lives). Defaults to Vite's root.
  cwd?: string;
  // Path to tsconfig.json, relative to cwd. Defaults to "tsconfig.json".
  tsconfig?: string;
  // Marker calls to scan for. Defaults to getTypeInfo / isType / router.
  markers?: readonly Marker[];
  // Id of the virtual module the plugin emits. Consumers import this module
  // to get the type-metadata table. Defaults to "virtual:runtypes-cache".
  virtualModuleId?: string;
}

const DEFAULT_VIRTUAL = "virtual:runtypes-cache";

export default function runtypes(options: PluginOptions) {
  const virtualId = options.virtualModuleId ?? DEFAULT_VIRTUAL;
  const resolvedVirtualId = "\0" + virtualId;
  const markers = options.markers ?? DEFAULT_MARKERS;

  let resolver: ResolverClient | null = null;
  // Accumulated across all transform() calls — cleared on resolver restart.
  // Keyed by hash id (mion's quickHash).
  const types = new Map<string, Type>();
  const sites: Site[] = [];

  return {
    name: "vite-plugin-runtypes",

    configResolved(this: any, cfg: { root: string }) {
      const cwd = path.resolve(options.cwd ?? cfg.root);
      resolver = new ResolverClient(options.binary, cwd, options.tsconfig ?? "tsconfig.json");
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
      // Render the deepkit-shaped, fully-knotted cache module from our
      // accumulated types + sites. Mirrors `internal/emit/tsmodule.go` so the
      // virtual-module path produces byte-identical output to what the Go
      // binary writes via `--out-ts`.
      return renderCacheModule({
        types: Array.from(types.values()),
        sites,
      });
    },

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;
      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      if (!markers.some((m) => code.includes(m.name + "("))) return null;

      // Vite gives us absolute paths; the resolver expects paths relative to
      // its cwd.
      const rel = path.relative(options.cwd ?? process.cwd(), id);
      const result = await rewrite(rel, code, markers, resolver);
      if (result.sites.length === 0) return null;

      for (const s of result.sites) {
        sites.push({ file: rel, pos: s.pos, id: s.id });
      }
      const dump = await resolver.dump();
      for (const t of dump.types ?? []) {
        if (t.id !== undefined) types.set(t.id, t);
      }

      return { code: result.code, map: null };
    },
  };
}

export type { Marker, PluginOptions as Options };
export { DEFAULT_MARKERS };
export { renderCacheModule };
