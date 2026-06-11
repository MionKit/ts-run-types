import {spawn, type ChildProcess} from 'node:child_process';
import {createConnection, type Socket} from 'node:net';
import {createInterface, type Interface} from 'node:readline';
import type {Readable, Writable} from 'node:stream';
import type {CacheKind, Metrics, Replacement, Request, Response, RunType, Site} from './protocol.ts';

export interface ResolverClientOptions {
  // When set, the resolver is spawned with --inline-sources-stdin and the
  // map is written as the first stdin line (JSON `{"sources": …}`) before
  // any request. Keys are paths relative to `cwd`; values are TS source.
  // No on-disk tsconfig is needed in this mode — the Go side builds an
  // inferred Program whose root files are exactly the overlay keys.
  inlineSources?: Record<string, string>;
  // When true, spawns with --inline-server: no startup Program, no
  // handshake. The client is expected to install state via setSources
  // before calling scanFiles. The same connection persists across many
  // setSources / reset cycles, so a single child process can serve every
  // test in a vitest file.
  serverMode?: boolean;
  // Base directory for the on-disk RT artifact cache (forwarded as
  // --cache-dir). Typically `<projectRoot>/node_modules/.cache/ts-go-run-types`.
  // The Go binary fingerprints non-version build options into a subdir
  // and folds binary version into every typeID hash, so cache files
  // never cross-contaminate between configurations or releases. Empty
  // / undefined disables caching (test paths and inline-source one-shots
  // skip this).
  cacheDir?: string;
  // Forwarded as --emit-create-rt-fn. When true the Go renderer
  // emits the inline `createRTFn` closure on every RT entry; when
  // false (default) the entry carries only the body `code` string and
  // the JS side reconstructs the factory via `new Function`.
  emitCacheFunctions?: boolean;
  // Parallelism opt-outs. The Go binary runs its parallel marker scan
  // and parallel cache renders by default; an explicit `false` forwards
  // --no-parallel-scan / --no-parallel-render to force the serial paths
  // (benchmark baselines, debugging). Undefined or true leave the
  // defaults on.
  parallelScan?: boolean;
  parallelRender?: boolean;
}

// Common JSON-per-line request/response framing. Owns the in-flight request
// queue. The transport is agnostic to whether the streams come from a
// spawned child process or a Unix-socket connection.
class MessageTransport {
  private lines: Interface;
  private queue: Array<(r: Response) => void> = [];
  private closed = false;

  constructor(
    private readonly stdin: Writable,
    stdout: Readable,
    private readonly onClose: () => void
  ) {
    this.lines = createInterface({input: stdout});
    this.lines.on('line', (line) => {
      const done = this.queue.shift();
      if (!done) return;
      try {
        done(JSON.parse(line));
      } catch (e) {
        done({error: `parse: ${String(e)}`});
      }
    });
  }

  // markClosed is called by external close hooks (child 'exit', socket
  // 'close') to drain pending requests with an error.
  markClosed(reason: string): void {
    this.closed = true;
    while (this.queue.length) this.queue.shift()!({error: reason});
  }

  // writeUnframed writes raw bytes without queuing — used for the
  // inline-sources handshake which the Go side reads before entering the
  // request loop.
  writeUnframed(payload: string): void {
    this.stdin.write(payload);
  }

  async request(req: Request): Promise<Response> {
    if (this.closed) throw new Error('resolver is closed');
    return new Promise<Response>((resolve) => {
      this.queue.push(resolve);
      this.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }
}

// ScanFilesOptions opts the scanFiles call into returning runTypes / one
// or more pre-rendered cache module bodies projected over the request's
// files. Both fields are off by default so the rewrite pipeline (which
// only needs site offsets) pays nothing extra. Pass `['all']` to
// includeCacheSources for the legacy "give me everything" behavior.
export interface ScanFilesOptions {
  includeRunTypes?: boolean;
  includeCacheSources?: CacheKind[];
  // Module mode: assemble each site's per-entry module closure (Site.deps)
  // and return the rendered module sources in the result's `modules` map.
  includeModules?: boolean;
  // Opts the result into the per-op `metrics` block (checker counters,
  // per-phase wall times, Go memory deltas). Bench-harness use; the
  // rewrite pipeline never sets it.
  includeMetrics?: boolean;
}

// ScanFilesResult is the shape returned by scanFiles. Sites are flat —
// every site detected across the request's files, each tagged with .file
// so callers can filter or group. Replacements are byte-range rewrites
// for the user's source (pure-fn factory-arg-to-null); the plugin
// applies them in `rewrite.ts` alongside Site insertions. runTypes /
// runTypeCacheSource / validateCacheSource / pureFnsCacheSource are
// populated only when the corresponding kind was opted into via
// includeCacheSources (or `'all'`).
export interface ScanFilesResult {
  sites: Site[];
  replacements?: Replacement[];
  runTypes?: RunType[];
  runTypeCacheSource?: string;
  validateCacheSource?: string;
  validationErrorsCacheSource?: string;
  prepareForJsonCacheSource?: string;
  restoreFromJsonCacheSource?: string;
  stringifyJsonCacheSource?: string;
  prepareForJsonSafeCacheSource?: string;
  hasUnknownKeysCacheSource?: string;
  stripUnknownKeysCacheSource?: string;
  unknownKeyErrorsCacheSource?: string;
  unknownKeysToUndefinedCacheSource?: string;
  unknownKeysToUndefinedWireCacheSource?: string;
  toBinaryCacheSource?: string;
  fromBinaryCacheSource?: string;
  formatTransformCacheSource?: string;
  pureFnsCacheSource?: string;
  // Module mode: per-entry virtual-module sources covering every key in the
  // request sites' deps closures. Batch-scoped (not per-file projected) —
  // the plugin merges them into its serving map.
  modules?: Record<string, string>;
  diagnostics?: import('./protocol.ts').Diagnostic[];
  // Per-cache HMR signals; see Response.addedRunTypes etc in protocol.ts.
  addedRunTypes?: boolean;
  addedValidate?: boolean;
  addedValidationErrors?: boolean;
  addedPrepareForJson?: boolean;
  addedRestoreFromJson?: boolean;
  addedStringifyJson?: boolean;
  addedPrepareForJsonSafe?: boolean;
  addedHasUnknownKeys?: boolean;
  addedStripUnknownKeys?: boolean;
  addedUnknownKeyErrors?: boolean;
  addedUnknownKeysToUndefined?: boolean;
  addedUnknownKeysToUndefinedWire?: boolean;
  addedToBinary?: boolean;
  addedFromBinary?: boolean;
  addedFormatTransform?: boolean;
  addedPureFns?: boolean;
  // Present only when the request set includeMetrics.
  metrics?: Metrics;
}

// DumpOptions opts the dump call into returning only a subset of
// cache-module bodies. With no opts, dump returns every cache source
// (legacy "give me everything" behavior). Passing a non-empty
// `includeCacheSources` restricts the response to the requested kinds —
// the Vite plugin uses this to ask for just the cache it's serving in
// a given transform() call.
export interface DumpOptions {
  includeCacheSources?: CacheKind[];
}

// Common operation surface. Spawn-based and socket-based clients both
// implement this interface so consumers can be typed against the connection
// without caring which transport is in use.
export interface ResolverConnection {
  scanFiles(files: string[], opts?: ScanFilesOptions): Promise<ScanFilesResult>;
  dump(opts?: DumpOptions): Promise<Response>;
  setSources(sources: Record<string, string>): Promise<void>;
  reset(): Promise<void>;
  tsCompile(): Promise<number>;
  resolveModules(keys: string[]): Promise<Record<string, string>>;
  close(): void;
}

// Mixed-in ops implementation shared between the two clients. Inheritance
// keeps the method definitions in one place and `this.transport` lookup
// happens at call time, so field-initializer ordering isn't a concern.
abstract class ResolverClientBase implements ResolverConnection {
  protected abstract readonly transport: MessageTransport;

  async scanFiles(files: string[], opts: ScanFilesOptions = {}): Promise<ScanFilesResult> {
    if (files.length === 0) throw new Error('scanFiles: files must be non-empty');
    const req: Request = {op: 'scanFiles', files};
    if (opts.includeRunTypes) req.includeRunTypes = true;
    if (opts.includeCacheSources?.length) req.includeCacheSources = opts.includeCacheSources;
    if (opts.includeModules) req.includeModules = true;
    if (opts.includeMetrics) req.includeMetrics = true;
    const resp = await this.transport.request(req);
    if (resp.error) throw new Error(`scanFiles [${files.join(', ')}]: ${resp.error}`);
    return {
      sites: resp.sites ?? [],
      replacements: resp.replacements,
      runTypes: resp.runTypes,
      modules: resp.modules,
      runTypeCacheSource: resp.runTypeCacheSource,
      validateCacheSource: resp.validateCacheSource,
      validationErrorsCacheSource: resp.validationErrorsCacheSource,
      prepareForJsonCacheSource: resp.prepareForJsonCacheSource,
      restoreFromJsonCacheSource: resp.restoreFromJsonCacheSource,
      stringifyJsonCacheSource: resp.stringifyJsonCacheSource,
      prepareForJsonSafeCacheSource: resp.prepareForJsonSafeCacheSource,
      hasUnknownKeysCacheSource: resp.hasUnknownKeysCacheSource,
      stripUnknownKeysCacheSource: resp.stripUnknownKeysCacheSource,
      unknownKeyErrorsCacheSource: resp.unknownKeyErrorsCacheSource,
      unknownKeysToUndefinedCacheSource: resp.unknownKeysToUndefinedCacheSource,
      unknownKeysToUndefinedWireCacheSource: resp.unknownKeysToUndefinedWireCacheSource,
      toBinaryCacheSource: resp.toBinaryCacheSource,
      fromBinaryCacheSource: resp.fromBinaryCacheSource,
      formatTransformCacheSource: resp.formatTransformCacheSource,
      pureFnsCacheSource: resp.pureFnsCacheSource,
      diagnostics: resp.diagnostics,
      addedRunTypes: resp.addedRunTypes,
      addedValidate: resp.addedValidate,
      addedValidationErrors: resp.addedValidationErrors,
      addedPrepareForJson: resp.addedPrepareForJson,
      addedRestoreFromJson: resp.addedRestoreFromJson,
      addedStringifyJson: resp.addedStringifyJson,
      addedPrepareForJsonSafe: resp.addedPrepareForJsonSafe,
      addedHasUnknownKeys: resp.addedHasUnknownKeys,
      addedStripUnknownKeys: resp.addedStripUnknownKeys,
      addedUnknownKeyErrors: resp.addedUnknownKeyErrors,
      addedUnknownKeysToUndefined: resp.addedUnknownKeysToUndefined,
      addedUnknownKeysToUndefinedWire: resp.addedUnknownKeysToUndefinedWire,
      addedToBinary: resp.addedToBinary,
      addedFromBinary: resp.addedFromBinary,
      addedFormatTransform: resp.addedFormatTransform,
      addedPureFns: resp.addedPureFns,
      metrics: resp.metrics,
    };
  }

  async dump(opts: DumpOptions = {}): Promise<Response> {
    const req: Request = {op: 'dump'};
    if (opts.includeCacheSources?.length) req.includeCacheSources = opts.includeCacheSources;
    return this.transport.request(req);
  }

  async setSources(sources: Record<string, string>): Promise<void> {
    const resp = await this.transport.request({op: 'setSources', sources});
    if (resp.error) throw new Error(`setSources: ${resp.error}`);
  }

  // reset wipes ALL resolver state (cache, sites, Program, overlay) — see
  // internal/resolver/resolver.go:Reset for the contract. The caller must
  // call setSources before the next scanFiles.
  async reset(): Promise<void> {
    const resp = await this.transport.request({op: 'reset'});
    if (resp.error) throw new Error(`reset: ${resp.error}`);
  }

  // tsCompile runs the embedded tsgo through bind + typecheck + Emit() on
  // the current source overlay and returns the wall-time in milliseconds.
  // Does NOT walk markers and does NOT render any ts-go-run-types cache
  // modules — purely the TypeScript baseline. Caller must have called
  // setSources first.
  async tsCompile(): Promise<number> {
    const resp = await this.transport.request({op: 'tsCompile'});
    if (resp.error) throw new Error(`tsCompile: ${resp.error}`);
    return resp.tsCompileMs ?? 0;
  }

  // resolveModules renders the per-entry virtual modules for the requested
  // keys (plus their transitive closures). Unknown keys are omitted — the
  // caller owns the missing-module error message. Used as the plugin
  // load() hook's cache-miss fallback.
  async resolveModules(keys: string[]): Promise<Record<string, string>> {
    const resp = await this.transport.request({op: 'resolveModules', keys});
    if (resp.error) throw new Error(`resolveModules [${keys.join(', ')}]: ${resp.error}`);
    return resp.modules ?? {};
  }

  close(): void {
    this.transport.close();
  }
}

// ResolverClient spawns the ts-go-run-types binary and drives it over its
// JSON-per-line stdio protocol. The child process is kept alive until
// `close()` so the Program + checker pool are amortised across queries.
//
// Three modes:
//   - default: --one-shot against an on-disk tsconfig.
//   - opts.inlineSources: --one-shot --inline-sources-stdin, source map
//     written as the handshake line before any request.
//   - opts.serverMode: --one-shot --inline-server, no startup Program;
//     the caller drives setSources / reset / scanFiles / dump over stdin
//     for the lifetime of the process.
export class ResolverClient extends ResolverClientBase {
  private child: ChildProcess;
  protected readonly transport: MessageTransport;

  constructor(binary: string, cwd: string, tsconfigPath: string, opts: ResolverClientOptions = {}) {
    super();
    const args = ['--one-shot', '--cwd', cwd];
    // --tsconfig is meaningless in inline / server modes — the Go binary
    // ignores it. Skip the flag to keep the CLI honest.
    if (!opts.inlineSources && !opts.serverMode && tsconfigPath) {
      args.push('--tsconfig', tsconfigPath);
    }
    if (opts.inlineSources) args.push('--inline-sources-stdin');
    if (opts.serverMode) args.push('--inline-server');
    if (opts.cacheDir) args.push('--cache-dir', opts.cacheDir);
    if (opts.emitCacheFunctions) args.push('--emit-create-rt-fn');
    if (opts.parallelScan === false) args.push('--no-parallel-scan');
    if (opts.parallelRender === false) args.push('--no-parallel-render');
    this.child = spawn(binary, args, {stdio: ['pipe', 'pipe', 'inherit']});
    if (!this.child.stdin || !this.child.stdout) {
      throw new Error('failed to spawn ts-go-run-types (no stdio pipes)');
    }
    const stdin = this.child.stdin;
    const stdout = this.child.stdout;
    this.transport = new MessageTransport(stdin, stdout, () => {
      stdin.end();
      this.child.kill();
    });
    if (opts.inlineSources) {
      // Handshake: write the source map as a single JSON line before any
      // requests can be queued. The Go side blocks on this before building
      // its Program, so request() calls made by the caller right after the
      // constructor naturally land after the handshake on the wire.
      this.transport.writeUnframed(JSON.stringify({sources: opts.inlineSources}) + '\n');
    }
    this.child.on('exit', () => this.transport.markClosed('resolver exited'));
  }
}

// ResolverSocketClient connects to a daemon-mode `ts-go-run-types` process
// over a Unix socket. Kept for future use cases (shared daemon across
// workers); the current vitest setup uses ResolverClient with serverMode.
export class ResolverSocketClient extends ResolverClientBase {
  private socket: Socket;
  protected readonly transport: MessageTransport;

  private constructor(socket: Socket) {
    super();
    this.socket = socket;
    this.transport = new MessageTransport(socket, socket, () => {
      socket.end();
      socket.destroy();
    });
    socket.on('close', () => this.transport.markClosed('socket closed'));
    socket.on('error', (e) => this.transport.markClosed(`socket error: ${e.message}`));
  }

  static async connect(socketPath: string): Promise<ResolverSocketClient> {
    return new Promise((resolve, reject) => {
      const sock = createConnection(socketPath);
      sock.once('connect', () => resolve(new ResolverSocketClient(sock)));
      sock.once('error', reject);
    });
  }
}
