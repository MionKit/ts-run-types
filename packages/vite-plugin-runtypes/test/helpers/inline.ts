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
import {type Site, type RunType} from '../../src/protocol.ts';
// The production module-mode registrar — imported from the marker package's
// source so evalCacheFor registers entry tuples with the exact two-pass
// semantics consumers get at runtime.
import {initDependencies} from '../../../ts-go-run-types/src/runtypes/registrar.ts';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'bin/ts-go-run-types');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// Mirror of internal/testfixtures/runtypes.d.ts. Always overlaid by
// `withInlineSources` so per-test fixtures don't have to redeclare the
// fake `@mionjs/ts-go-run-types` module.
export const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type InjectRunTypeData<T> = string & {readonly __mionInjectRunTypeDataBrand?: T};
  export function createMockType<T>(val?: T, options?: unknown, id?: InjectRunTypeData<T>): () => T;
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __mionCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __mionInjectTypeFnArgsBrand?: T; readonly __mionInjectTypeFnArgsFn?: Fn};
  export type PureFunction<F> = F & {readonly __mionPureFunctionBrand?: never};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function reflectRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export interface ValidateOptions {
    noLiterals?: boolean;
    noIsArrayCheck?: boolean;
  }
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidate<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
  export function createGetValidationErrors<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'verr'>): (value: unknown, path?: unknown[], errors?: unknown[]) => unknown[];
  export function deserializeValidate<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
  export function createBinaryEncoder<T>(val?: T, options?: any, id?: InjectTypeFnArgs<T, 'tb'>): (value: unknown) => unknown;
  export function createBinaryDecoder<T>(val?: T, options?: any, id?: InjectTypeFnArgs<T, 'fb'>): (input: unknown) => unknown;
  export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate' | 'direct'};
  export type JsonDecoderOptions = {strategy?: 'strip' | 'preserve'};
  export function createJsonEncoder<T>(val?: T, options?: CompTimeFnArgs<JsonEncoderOptions>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (value: unknown) => string | undefined;
  export function createJsonDecoder<T>(val?: T, options?: CompTimeFnArgs<JsonDecoderOptions>, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (serialized: string) => unknown;
  export interface RTUtils {
    usePureFn(key: CompTimeArgs<string>): any;
    getPureFn(key: CompTimeArgs<string>): any;
    getCompiledPureFn(key: CompTimeArgs<string>): any;
    hasPureFn(key: CompTimeArgs<string>): boolean;
    findCompiledPureFn(fnName: CompTimeArgs<string>): any;
  }
  export function registerPureFnFactory(
    namespace: CompTimeArgs<string>,
    functionID: CompTimeArgs<string>,
    factory: PureFunction<(utl: RTUtils) => any> | null
  ): any;
}
`;

export type InlineSources = Record<string, string>;

// Shape of the daemon-response capture attached to `task.meta.mionRunTypes`.
// Read by `scripts/runtypes-logs-reporter.mjs` when `pnpm test:logs` runs.
// `responses` is an array because a single test may call `evalCacheFor`
// multiple times; outside that path the field is silently absent.
export interface RunTypesMeta {
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
const metaStore = new AsyncLocalStorage<RunTypesMeta>();

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
  // emitCacheFunctions:true mirrors the sibling `ts-go-run-types` vitest
  // config — every cache module rendered during the test run carries
  // BOTH the body string AND the inline `createRTFn` closure so the
  // helper's diagnostic-style tests can assert against either form.
  // Per-test cases that need the production default (no inline
  // factory) flip this back in their scanFiles request when needed.
  stash.client = new ResolverClient(BIN, ROOT, '', {serverMode: true, emitCacheFunctions: true});
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
  // scopes its runTypes / runTypeCacheSource response to the request's
  // files, independent of anything else in the cache. Kept for tests
  // that want a guaranteed-empty global cache (e.g. dump assertions).
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
// `byHash` is the module-local `cache` object returned by `initCache()` —
// flat `{[rawHash]: RunType}`. `sites` is pulled straight off the
// daemon response.
export interface EvaluatedCache {
  byHash: Record<string, RunType>;
  sites: Site[];
}

// Full pipeline (module mode): scan every test source in ONE scanFiles
// request, then fetch the per-node `t_<id>` data modules for every site's
// type via resolveModules (which pulls each transitive ref closure too).
// The module tuples are registered through the REAL runtime registrar
// (initDependencies — two-pass declare-then-link, runtime values via each
// module's gated initEntry) against a local stub registry, so the shapes
// the tests assert on are exactly what production consumers see.
export async function evalCacheFor(sources: InlineSources, opts: WithInlineOpts = {}): Promise<EvaluatedCache> {
  return withInlineSources(
    sources,
    async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      if (files.length === 0) throw new Error('evalCacheFor: no source files to scan');
      const response = await client.scanFiles(files, {includeModules: true});
      recordResponse(response);
      const sites = response.sites ?? [];
      const ids = [...new Set(sites.map((site) => site.id))];
      if (ids.length === 0) return {byHash: {}, sites};
      const dataModules = await client.resolveModules(ids.map((id) => `t_${id}`));
      return {byHash: evalDataModules(dataModules), sites};
    },
    opts
  );
}

// evalDataModules evaluates per-node `t_<id>` module sources into entry
// tuples and registers them through the production registrar against a
// data-only stub rtUtils. Returns the populated `{[id]: RunType}` table.
function evalDataModules(modules: Record<string, string>): Record<string, RunType> {
  const table: Record<string, RunType> = {};
  const stub = {
    hasRunType: (id: string) => table[id] !== undefined,
    addRunType(id: string, runType: RunType) {
      table[id] = runType;
      return runType;
    },
    useRunType(id: string): RunType {
      const entry = table[id];
      if (!entry) throw new Error(`stub useRunType: no entry for ${id}`);
      return entry;
    },
    hasRTFn: () => false,
    addToRTCache() {},
    alwaysThrowFactory: (code: string) => () => {
      throw new Error(`stub alwaysThrow ${code}`);
    },
  };
  const tuples = Object.values(modules).map(evalEntryModule);
  initDependencies(stub as unknown as Parameters<typeof initDependencies>[0], tuples as Parameters<typeof initDependencies>[1]);
  return table;
}

// evalEntryModule evaluates one per-entry virtual-module source (pure data:
// prologue + optional initEntry fn + `export const entry = […]`) into its
// tuple via `new Function` — `export` stripped so the body runs as a script.
export function evalEntryModule(source: string): unknown[] {
  const stripped = source.replace(/^export const entry = /m, 'const entry = ');
  return new Function(`${stripped}\nreturn entry;`)() as unknown[];
}

// Look up the resolved RunType for a given source file in an evaluated cache.
// Throws if no site was recorded or the id is missing — both indicate the
// source under test didn't match the marker the way the test expected.
export function getTypeFor(cache: EvaluatedCache, file: string): RunType {
  const site = cache.sites.find((s) => s.file === file);
  if (!site) throw new Error(`no site recorded for ${file}`);
  const t = cache.byHash[site.id];
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
    const meta: RunTypesMeta = {title, sources, mode: 'inline', responses: []};
    (task.meta as Record<string, unknown>).mionRunTypes = meta;
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
    const meta: RunTypesMeta = {title, sources: resolved, mode: 'file', paths: files, responses: []};
    (task.meta as Record<string, unknown>).mionRunTypes = meta;
    await metaStore.run(meta, () => Promise.resolve(fn(resolved)));
  });
}
