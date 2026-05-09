// Test helpers for in-memory inline sources. The Go binary runs as a
// long-lived daemon spawned by vitest's globalSetup (scripts/vitest-global-setup.mjs),
// listening on a Unix socket whose path is in TS_GO_RUN_TYPES_SOCKET. Each
// withInlineSources call connects (or reuses the singleton connection),
// sends `setSources` to swap the in-memory overlay, and the user's
// callback then drives scanFile / dump as usual. No process spawn per test.
import path from 'node:path';
import fs from 'node:fs';
import type {TestAPI} from 'vitest';
import {ResolverSocketClient} from '../../src/resolver-client.js';
import {rewrite} from '../../src/rewrite.js';
import {renderCacheModule} from '../../src/render-cache.js';
import type {Site, Type} from '../../src/protocol.js';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'bin/ts-go-run-types');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// Mirror of internal/testfixtures/runtypes.d.ts. Always overlaid by
// `withInlineSources` so per-test fixtures don't have to redeclare the
// fake `@mionjs/ts-go-run-types` module.
export const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
  export function getRuntypeId<T>(value?: T, id?: RuntypeId<T>): RuntypeId<T>;
}
`;

export type InlineSources = Record<string, string>;

// Module-scope lazy singleton. Each vitest test FILE gets its own module
// graph (isolate: true), so this lives once per file. The daemon process
// itself is shared across files via the Unix socket exported by globalSetup.
let _client: ResolverSocketClient | null = null;
let _connecting: Promise<ResolverSocketClient> | null = null;

async function getClient(): Promise<ResolverSocketClient> {
  if (_client) return _client;
  if (_connecting) return _connecting;
  const sock = process.env.TS_GO_RUN_TYPES_SOCKET;
  if (!sock) {
    throw new Error(
      'TS_GO_RUN_TYPES_SOCKET not set — vitest globalSetup did not spawn the daemon. Check scripts/vitest-global-setup.mjs.'
    );
  }
  _connecting = ResolverSocketClient.connect(sock).then((c) => {
    _client = c;
    _connecting = null;
    return c;
  });
  return _connecting;
}

export interface WithInlineOpts {
  // When true, sends a `resetCache` op before installing the new sources.
  // Useful for tests that assert specific dump shapes or want isolation
  // from prior calls in the same suite. Defaults to false — the cache is
  // structurally idempotent, so leaving it populated is safe and faster.
  resetCache?: boolean;
}

export async function withInlineSources<T>(
  sources: InlineSources,
  fn: (ctx: {client: ResolverSocketClient; sources: InlineSources}) => Promise<T>,
  opts: WithInlineOpts = {}
): Promise<T> {
  const client = await getClient();
  if (opts.resetCache) await client.resetCache();
  // runtypes.d.ts is always present so caller's fixtures stay terse. The
  // caller can override by including their own "runtypes.d.ts" key.
  const augmented: InlineSources = {'runtypes.d.ts': RUNTYPES_DTS, ...sources};
  await client.setSources(augmented);
  return fn({client, sources: augmented});
}

// Convenience: rewrite a single inline source and return both the patched
// code and the recorded sites. The shared client stays open — no per-call
// teardown.
export async function rewriteInline(
  file: string,
  code: string,
  opts: WithInlineOpts = {}
): Promise<{out: string; sites: Site[]}> {
  return withInlineSources({[file]: code}, async ({client, sources}) => {
    const {code: out, sites} = await rewrite(file, sources[file], client);
    return {out, sites};
  }, opts);
}

// Cache shape produced by evaluating the rendered runtypes-cache module.
// Mirrors what `virtual:runtypes-cache` exports at runtime.
export interface EvaluatedCache {
  __runtypes: Map<string, Type & Record<string, any>>;
  __sites: Site[];
}

// Full pipeline: rewrite every entry in `sources`, dump the resolver,
// render the cache module, and eval it. Returns the live cache map.
// The atomic suite uses this; pass {resetCache: true} when a test must see
// a clean dump (the dedup test wants exactly one `string` entry).
export async function evalCacheFor(
  sources: InlineSources,
  opts: WithInlineOpts = {}
): Promise<EvaluatedCache> {
  return withInlineSources(
    sources,
    async ({client, sources: augmented}) => {
      const sites: Site[] = [];
      for (const [file, code] of Object.entries(augmented)) {
        if (file === 'runtypes.d.ts') continue; // shim, no callsites
        const result = await rewrite(file, code, client);
        for (const s of result.sites) {
          sites.push({file, pos: s.pos, id: s.id, paramIndex: s.paramIndex});
        }
      }
      const dump = await client.dump();
      const types = dump.types ?? [];
      const js = renderCacheModule({types, sites, language: 'js'}).replace(
        /export const /g,
        'result.'
      );
      const factory = new Function(`const result = {}; ${js}; return result;`);
      return factory() as EvaluatedCache;
    },
    opts
  );
}

// Look up the resolved Type for a given source file in an evaluated cache.
// Throws if no site was recorded or the id is missing — both indicate the
// source under test didn't match the marker the way the test expected.
export function getTypeFor(cache: EvaluatedCache, file: string): Type {
  const site = cache.__sites.find((s) => s.file === file);
  if (!site) throw new Error(`no site recorded for ${file}`);
  const t = cache.__runtypes.get(site.id);
  if (!t) throw new Error(`type ${site.id} not in cache for ${file}`);
  return t;
}

// Sugar so each test file doesn't repeat the gating boilerplate.
export const runIfBinary = (it: TestAPI): TestAPI['skip'] | TestAPI =>
  hasBinary() ? it : it.skip;
