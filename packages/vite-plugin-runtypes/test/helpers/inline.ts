// Test helpers for in-memory inline sources.
//
// Process model: one ts-go-run-types process per VITEST WORKER (not per
// test file). Vitest's default `pool: 'forks'` spawns one Node child per
// worker; each worker can run multiple test files sequentially. Within a
// single worker we share one ts-go-run-types subprocess and clear its
// state between test files via a `reset` op. Across workers, each worker
// has its own subprocess — no inter-process shared state, parallel-file
// execution stays safe.
//
// The singleton is stashed on `globalThis` because vitest's `isolate: true`
// resets the module graph per file (so a module-scope `let` would re-spawn
// the process every file). Module-scope state is fresh per file; the
// global slot survives.
import path from 'node:path';
import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {it, type TestAPI} from 'vitest';
import {ResolverClient} from '../../src/resolver-client.ts';
import {rewrite} from '../../src/rewrite.ts';
import type {Site, RunType} from '../../src/protocol.ts';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'bin/ts-go-run-types');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// Mirror of internal/testfixtures/runtypes.d.ts. Always overlaid by
// `withInlineSources` so per-test fixtures don't have to redeclare the
// fake `@mionjs/ts-go-run-types` module.
export const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
  export function getRuntypeId<T>(id?: RuntypeId<T>): RuntypeId<T>;
  export function reflectRuntypeId<T>(value: T, id?: RuntypeId<T>): RuntypeId<T>;
}
`;

export type InlineSources = Record<string, string>;

// Shape of the daemon-response capture attached to `task.meta.mionRuntypes`.
// Read by `scripts/runtypes-logs-reporter.mjs` when `pnpm test:logs` runs.
// `responses` is an array because a single test may call `evalCacheFor`
// multiple times; outside that path the field is silently absent.
export interface RuntypesMeta {
  title: string;
  sources: InlineSources;
  mode: 'inline' | 'file';
  paths?: Record<string, string>;
  responses: unknown[];
}

// AsyncLocalStorage bridge between runTest/runFiles (which know the test's
// `task.meta` object) and evalCacheFor (which knows the daemon response).
// The helpers run `fn(sources)` inside `metaStore.run(meta, ...)`, so any
// await-chained call from inside the test can read the same meta via
// `metaStore.getStore()` and push onto its `responses` array.
const metaStore = new AsyncLocalStorage<RuntypesMeta>();

function recordResponse(response: unknown): void {
  const meta = metaStore.getStore();
  if (meta) meta.responses.push(response);
}

// Per-worker singleton stash. Survives vitest's per-file module isolation
// because `globalThis` lives on the underlying Node process. Two slots:
//   client      — the spawned ResolverClient (or null if not yet spawned).
//   atExitWired — process-exit hook only registered once per worker.
interface WorkerStash {
  client: ResolverClient | null;
  atExitWired: boolean;
}
const STASH_KEY = '__tsGoRunTypesWorkerStash' as const;
type GlobalWithStash = typeof globalThis & {[STASH_KEY]?: WorkerStash};

function workerStash(): WorkerStash {
  const g = globalThis as GlobalWithStash;
  if (!g[STASH_KEY]) {
    g[STASH_KEY] = {client: null, atExitWired: false};
  }
  return g[STASH_KEY]!;
}

function getClient(): ResolverClient {
  const stash = workerStash();
  if (stash.client) return stash.client;
  if (!hasBinary()) throw new Error(`ts-go-run-types binary not built: ${BIN}`);
  // --inline-server: no startup Program, no handshake. cwd = repo root so
  // setSources keys like "user.ts" resolve to <repo>/user.ts.
  stash.client = new ResolverClient(BIN, ROOT, '', {serverMode: true});
  if (!stash.atExitWired) {
    stash.atExitWired = true;
    // Best-effort cleanup if the worker exits without going through the
    // setupFiles afterAll hook (uncaught throws, vitest forcing termination).
    process.once('exit', () => {
      const s = (globalThis as GlobalWithStash)[STASH_KEY];
      if (s?.client) s.client.close();
    });
  }
  return stash.client;
}

// resetSharedClient wipes resolver state between test files. Invoked by
// the setupFiles entry's afterAll — kept here so the setup module doesn't
// reach into the stash directly.
export async function resetSharedClient(): Promise<void> {
  const {client} = workerStash();
  if (client) await client.reset();
}

export interface WithInlineOpts {
  // When true, sends a `reset` op before installing the new sources.
  // `reset` wipes EVERYTHING (cache, sites, Program, overlay). With
  // per-request projection, most tests don't need it: scanFiles already
  // scopes its runTypes / cacheSource response to the request's files,
  // independent of anything else in the cache. Kept for tests that want
  // a guaranteed-empty global cache (e.g. dump assertions).
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
// code and the recorded sites. Uses the shared per-worker client.
export async function rewriteInline(
  file: string,
  code: string,
  opts: WithInlineOpts = {}
): Promise<{out: string; sites: Site[]}> {
  return withInlineSources(
    {[file]: code},
    async ({client, sources}) => {
      const {code: out, sites} = await rewrite(file, sources[file], client);
      return {out, sites};
    },
    opts
  );
}

// Cache shape produced by evaluating the rendered runtypes-cache module.
// Mirrors what `virtual:runtypes-cache` exports at runtime.
export interface EvaluatedCache {
  __runtypes: Map<string, RunType>;
  __sites: Site[];
}

// Full pipeline: scan every test source in ONE scanFiles request. The
// Go side projects runTypes / cacheSource over exactly those files,
// independent of anything else in the cache. The rendered module body
// is evaluated through `new Function` and returned as `{__runtypes,
// __sites}`.
export async function evalCacheFor(sources: InlineSources, opts: WithInlineOpts = {}): Promise<EvaluatedCache> {
  return withInlineSources(
    sources,
    async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      if (files.length === 0) throw new Error('evalCacheFor: no source files to scan');
      const response = await client.scanFiles(files, {includeCacheSource: true});
      recordResponse(response);
      const {cacheSource} = response;
      if (!cacheSource) throw new Error('evalCacheFor: resolver returned no cacheSource');
      const js = cacheSource.replace(/export const /g, 'result.');
      const factory = new Function(`const result = {}; ${js}; return result;`);
      return factory() as EvaluatedCache;
    },
    opts
  );
}

// Look up the resolved RunType for a given source file in an evaluated cache.
// Throws if no site was recorded or the id is missing — both indicate the
// source under test didn't match the marker the way the test expected.
export function getTypeFor(cache: EvaluatedCache, file: string): RunType {
  const site = cache.__sites.find((s) => s.file === file);
  if (!site) throw new Error(`no site recorded for ${file}`);
  const t = cache.__runtypes.get(site.id);
  if (!t) throw new Error(`type ${site.id} not in cache for ${file}`);
  return t;
}

// Sugar so each test file doesn't repeat the gating boilerplate.
export const runIfBinary = (it: TestAPI): TestAPI['skip'] | TestAPI => (hasBinary() ? it : it.skip);

// name -> absolute path on disk. Used by runFiles to load real fixture
// files instead of inline string literals.
export type FilePaths = Record<string, string>;

/** Skip-gated test that hoists (title, sources) so they are addressable as data for future docs generation. */
export function runTest(title: string, sources: InlineSources, fn: (sources: InlineSources) => void | Promise<void>): void {
  const register = runIfBinary(it);
  register(title, async ({task}) => {
    const meta: RuntypesMeta = {title, sources, mode: 'inline', responses: []};
    (task.meta as Record<string, unknown>).mionRuntypes = meta;
    await metaStore.run(meta, () => Promise.resolve(fn(sources)));
  });
}

/** Like runTest, but each value is an absolute path to a fixture file. Missing files fail loudly. */
export function runFiles(title: string, files: FilePaths, fn: (sources: InlineSources) => void | Promise<void>): void {
  const register = runIfBinary(it);
  register(title, async ({task}) => {
    const resolved: InlineSources = {};
    for (const [name, abs] of Object.entries(files)) {
      if (!fs.existsSync(abs)) throw new Error(`runFiles: missing fixture file for "${name}": ${abs}`);
      resolved[name] = fs.readFileSync(abs, 'utf8');
    }
    const meta: RuntypesMeta = {title, sources: resolved, mode: 'file', paths: files, responses: []};
    (task.meta as Record<string, unknown>).mionRuntypes = meta;
    await metaStore.run(meta, () => Promise.resolve(fn(resolved)));
  });
}
