// Test helpers for in-memory inline sources. The Go binary supports
// `--inline-sources-stdin`: tests can hand it `{file: content}` instead of
// pointing it at on-disk fixtures. This file wraps that handshake so tests
// can read like the Deepkit `ts.transform`-style examples — the TS source
// lives next to the assertions.
import path from 'node:path';
import fs from 'node:fs';
import type {TestAPI} from 'vitest';
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

export async function withInlineSources<T>(
  sources: InlineSources,
  fn: (ctx: {client: ResolverClient; sources: InlineSources}) => Promise<T>
): Promise<T> {
  if (!hasBinary()) throw new Error(`ts-go-run-types binary not built: ${BIN}`);
  // runtypes.d.ts is always present so caller's fixtures stay terse. The
  // caller can override by including their own "runtypes.d.ts" key.
  const augmented: InlineSources = {'runtypes.d.ts': RUNTYPES_DTS, ...sources};
  // cwd just has to be a real existing directory; inline mode ignores
  // tsconfig and uses the inferred-Program path, so ROOT is fine.
  const client = new ResolverClient(BIN, ROOT, '', {inlineSources: augmented});
  try {
    return await fn({client, sources: augmented});
  } finally {
    client.close();
  }
}

// Convenience: rewrite a single inline source and return both the patched
// code and the recorded sites. Closes the resolver before returning. For
// tests that just want "what came out and where".
export async function rewriteInline(
  file: string,
  code: string
): Promise<{out: string; sites: Site[]}> {
  return withInlineSources({[file]: code}, async ({client, sources}) => {
    const {code: out, sites} = await rewrite(file, sources[file], client);
    return {out, sites};
  });
}

// Cache shape produced by evaluating the rendered runtypes-cache module.
// Mirrors what `virtual:runtypes-cache` exports at runtime.
export interface EvaluatedCache {
  __runtypes: Map<string, Type & Record<string, any>>;
  __sites: Site[];
}

// Full pipeline: rewrite every entry in `sources`, dump the resolver,
// render the cache module, and eval it. Returns the live cache map.
// Used by the atomic suite where each test wants to assert against the
// post-eval reflection Type, not the wire-level dump.
export async function evalCacheFor(sources: InlineSources): Promise<EvaluatedCache> {
  return withInlineSources(sources, async ({client, sources: augmented}) => {
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
  });
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

// re-export so test files don't need their own import.
export {ResolverClient};
