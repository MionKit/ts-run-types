import {spawn, type ChildProcess} from 'node:child_process';
import {createConnection, type Socket} from 'node:net';
import {createInterface, type Interface} from 'node:readline';
import type {Readable, Writable} from 'node:stream';
import type {CacheKind, Replacement, Request, Response, RunType, Site} from './protocol.ts';

export interface ResolverClientOptions {
  // Optional marker overrides forwarded to the Go binary's CLI flags.
  markerName?: string;
  markerModule?: string;
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
  // Base directory for the on-disk JIT artifact cache (forwarded as
  // --cache-dir). Typically `<projectRoot>/node_modules/.cache/ts-go-run-types`.
  // The Go binary fingerprints non-version build options into a subdir
  // and folds binary version into every typeID hash, so cache files
  // never cross-contaminate between configurations or releases. Empty
  // / undefined disables caching (test paths and inline-source one-shots
  // skip this).
  cacheDir?: string;
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
}

// ScanFilesResult is the shape returned by scanFiles. Sites are flat —
// every site detected across the request's files, each tagged with .file
// so callers can filter or group. Replacements are byte-range rewrites
// for the user's source (pure-fn factory-arg-to-null); the plugin
// applies them in `rewrite.ts` alongside Site insertions. runTypes /
// runTypeCacheSource / isTypeCacheSource / pureFnsCacheSource are
// populated only when the corresponding kind was opted into via
// includeCacheSources (or `'all'`).
export interface ScanFilesResult {
  sites: Site[];
  replacements?: Replacement[];
  runTypes?: RunType[];
  runTypeCacheSource?: string;
  isTypeCacheSource?: string;
  typeErrorsCacheSource?: string;
  prepareForJsonCacheSource?: string;
  restoreFromJsonCacheSource?: string;
  stringifyJsonCacheSource?: string;
  prepareForJsonSafeCacheSource?: string;
  prepareForJsonSafePreserveCacheSource?: string;
  hasUnknownKeysCacheSource?: string;
  stripUnknownKeysCacheSource?: string;
  unknownKeyErrorsCacheSource?: string;
  unknownKeysToUndefinedCacheSource?: string;
  unknownKeysToUndefinedWireCacheSource?: string;
  pureFnsCacheSource?: string;
  pureFnsDiagnostics?: import('./protocol.ts').PureFnDiagnostic[];
  markerDiagnostics?: import('./protocol.ts').MarkerDiagnostic[];
  // Per-cache HMR signals; see Response.addedRunTypes etc in protocol.ts.
  addedRunTypes?: boolean;
  addedIsType?: boolean;
  addedTypeErrors?: boolean;
  addedPrepareForJson?: boolean;
  addedRestoreFromJson?: boolean;
  addedStringifyJson?: boolean;
  addedPrepareForJsonSafe?: boolean;
  addedPrepareForJsonSafePreserve?: boolean;
  addedHasUnknownKeys?: boolean;
  addedStripUnknownKeys?: boolean;
  addedUnknownKeyErrors?: boolean;
  addedUnknownKeysToUndefined?: boolean;
  addedUnknownKeysToUndefinedWire?: boolean;
  addedPureFns?: boolean;
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
    const resp = await this.transport.request(req);
    if (resp.error) throw new Error(`scanFiles [${files.join(', ')}]: ${resp.error}`);
    return {
      sites: resp.sites ?? [],
      replacements: resp.replacements,
      runTypes: resp.runTypes,
      runTypeCacheSource: resp.runTypeCacheSource,
      isTypeCacheSource: resp.isTypeCacheSource,
      typeErrorsCacheSource: resp.typeErrorsCacheSource,
      prepareForJsonCacheSource: resp.prepareForJsonCacheSource,
      restoreFromJsonCacheSource: resp.restoreFromJsonCacheSource,
      stringifyJsonCacheSource: resp.stringifyJsonCacheSource,
      prepareForJsonSafeCacheSource: resp.prepareForJsonSafeCacheSource,
      prepareForJsonSafePreserveCacheSource: resp.prepareForJsonSafePreserveCacheSource,
      hasUnknownKeysCacheSource: resp.hasUnknownKeysCacheSource,
      stripUnknownKeysCacheSource: resp.stripUnknownKeysCacheSource,
      unknownKeyErrorsCacheSource: resp.unknownKeyErrorsCacheSource,
      unknownKeysToUndefinedCacheSource: resp.unknownKeysToUndefinedCacheSource,
      unknownKeysToUndefinedWireCacheSource: resp.unknownKeysToUndefinedWireCacheSource,
      pureFnsCacheSource: resp.pureFnsCacheSource,
      pureFnsDiagnostics: resp.pureFnsDiagnostics,
      markerDiagnostics: resp.markerDiagnostics,
      addedRunTypes: resp.addedRunTypes,
      addedIsType: resp.addedIsType,
      addedTypeErrors: resp.addedTypeErrors,
      addedPrepareForJson: resp.addedPrepareForJson,
      addedRestoreFromJson: resp.addedRestoreFromJson,
      addedStringifyJson: resp.addedStringifyJson,
      addedPrepareForJsonSafe: resp.addedPrepareForJsonSafe,
      addedPrepareForJsonSafePreserve: resp.addedPrepareForJsonSafePreserve,
      addedHasUnknownKeys: resp.addedHasUnknownKeys,
      addedStripUnknownKeys: resp.addedStripUnknownKeys,
      addedUnknownKeyErrors: resp.addedUnknownKeyErrors,
      addedUnknownKeysToUndefined: resp.addedUnknownKeysToUndefined,
      addedUnknownKeysToUndefinedWire: resp.addedUnknownKeysToUndefinedWire,
      addedPureFns: resp.addedPureFns,
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
    if (opts.markerName) args.push('--marker-name', opts.markerName);
    if (opts.markerModule) args.push('--marker-module', opts.markerModule);
    if (opts.inlineSources) args.push('--inline-sources-stdin');
    if (opts.serverMode) args.push('--inline-server');
    if (opts.cacheDir) args.push('--cache-dir', opts.cacheDir);
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
