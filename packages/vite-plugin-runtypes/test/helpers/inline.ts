// Test helpers for in-memory inline sources. Each vitest test FILE spawns
// its own long-lived ts-go-run-types process in --inline-server mode, lazily
// on first use. Every withInlineSources call sends a setSources op to the
// SAME process — no per-test spawn, no shared-state races between files.
// The process is killed by an afterAll hook registered on first use, so
// vitest can run files in parallel without interference.
import path from 'node:path';
import fs from 'node:fs';
import {afterAll, type TestAPI} from 'vitest';
import {ResolverClient} from '../../src/resolver-client.js';
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

// Per-test-file lazy singleton. The module is re-evaluated per file by
// vitest's isolation, so each file ends up with its own ResolverClient
// (its own ts-go-run-types child process). The afterAll hook is registered
// once on first use; it closes the client and kills the child.
let _client: ResolverClient | null = null;
let _afterAllRegistered = false;

function getClient(): ResolverClient {
  if (_client) return _client;
  if (!hasBinary()) throw new Error(`ts-go-run-types binary not built: ${BIN}`);
  // --inline-server mode: no startup Program, no handshake. The first
  // setSources call installs state. cwd is repo root so relative source
  // paths in setSources resolve to <repo>/<file>.
  _client = new ResolverClient(BIN, ROOT, '', {serverMode: true});
  if (!_afterAllRegistered) {
    _afterAllRegistered = true;
    afterAll(() => {
      if (_client) {
        _client.close();
        _client = null;
      }
    });
  }
  return _client;
}

export interface WithInlineOpts {
  // When true, sends a `reset` op before installing the new sources.
  // `reset` wipes EVERYTHING: cache, sites, Program, overlay. Useful for
  // tests that assert specific dump shapes and want to be insensitive to
  // earlier tests in the same file. Default is false — structural dedup
  // makes shared cache state safe and faster.
  reset?: boolean;
}

export async function withInlineSources<T>(
  sources: InlineSources,
  fn: (ctx: {client: ResolverClient; sources: InlineSources}) => Promise<T>,
  opts: WithInlineOpts = {}
): Promise<T> {
  const client = getClient();
  if (opts.reset) await client.reset();
  // runtypes.d.ts is always present so caller's fixtures stay terse. The
  // caller can override by including their own "runtypes.d.ts" key.
  const augmented: InlineSources = {'runtypes.d.ts': RUNTYPES_DTS, ...sources};
  await client.setSources(augmented);
  return fn({client, sources: augmented});
}

// Convenience: rewrite a single inline source and return both the patched
// code and the recorded sites. Uses the shared per-file client — no
// per-call spawn or teardown.
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
// render the cache module, and eval it. Pass {reset: true} when the test
// must see a clean dump (atomic's "two strings share a cache id" wants
// exactly one string entry).
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
