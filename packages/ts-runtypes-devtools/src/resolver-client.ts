import {spawn, type ChildProcess} from 'node:child_process';
import {createConnection, type Socket} from 'node:net';
import {createInterface, type Interface} from 'node:readline';
import type {Readable, Writable} from 'node:stream';
import type {
  Diagnostic,
  Metrics,
  PureFnSite,
  Replacement,
  Request,
  Response,
  RunType,
  Site,
  TransformResult,
} from './protocol.ts';

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
  // INTERNAL cache override (tests + direct-binary power users; NOT a public
  // plugin knob). The public RT disk cache follows TypeScript's `incremental` /
  // `composite` switch; this forces it via the child's RT_CACHE_DIR env var so
  // parallel spawns stay isolated (each child gets its own value). The Go binary
  // fingerprints non-version build options into a subdir and folds binary
  // version into every typeID hash, so cache files never cross-contaminate
  // between configurations or releases. Three states:
  //   - a path string → child env RT_CACHE_DIR=<path>: force caching on there.
  //   - an empty string → child env RT_CACHE_DIR="": force caching off,
  //     overriding the project's incremental setting.
  //   - undefined → RT_CACHE_DIR not set, so the binary follows the project's
  //     incremental setting (on for an incremental tsconfig, off otherwise; off
  //     in the inline / server test modes, which carry no tsconfig).
  cacheDir?: string;
  // Forwarded as --emit-mode. Selects what each RT entry ships in its
  // code/factory slots: 'code' (default — body string only, factory rebuilt
  // via `new Function`), 'functions' (live factory only, code derived lazily),
  // or 'both' (code string + live factory). Defaults to 'code' when omitted.
  emitMode?: 'code' | 'functions' | 'both';
  // Forwarded as --size-bias / --size-items / --size-string-bytes /
  // --size-max-bytes. Tune the binary `dynamic` cold-start buffer estimate;
  // omitted values fall through to the binary defaults (0.8 / 100 / 32 / 65536).
  sizeBias?: number;
  sizeItems?: number;
  sizeStringBytes?: number;
  sizeMaxBytes?: number;
  // Parallelism opt-outs. The Go binary runs its parallel marker scan
  // and parallel cache renders by default; an explicit `false` forwards
  // --no-parallel-scan / --no-parallel-render to force the serial paths
  // (benchmark baselines, debugging). Undefined or true leave the
  // defaults on.
  parallelScan?: boolean;
  parallelRender?: boolean;
  // Forwarded as --module-mode: how cache entries group into virtual
  // modules — 'default' (runtype bundle + per-entry fn modules),
  // 'allSingle' (per-family bundle modules), or 'allModules' (per-node
  // runtype modules too). Undefined leaves the binary default.
  moduleMode?: string;
  // Forwarded as --inline-mode: the child-inlining policy — 'default'
  // (unnamed non-circular compounds inline into their parents; named and
  // circular types stay external) or 'allInternal' (everything except
  // circular inlines, names ignored). Undefined leaves the binary default.
  inlineMode?: 'default' | 'allInternal';
  // Forwarded as --single-threaded: one checker, serial scan/render. The
  // lint session uses it — per-file interactive scans gain little from the
  // pool, and a light child keeps editor/CI hosts (which may run several
  // lint runtimes side by side) well under process/memory limits.
  singleThreaded?: boolean;
  // Forwarded as --allow-unchecked-patterns: silence the fail-closed
  // FMT004 build error for format patterns whose mockSamples RE2 can't verify
  // (JS-only regex features). Build-lane only — asserts the ts-runtypes lint
  // plugin, which runs the real RegExp, owns that check. Undefined leaves the
  // binary default (off).
  allowUncheckedPatterns?: boolean;
  // Pure-fn build report. `pureFnReport` forwards --pure-fn-report (populate
  // Response.pureFnSites on generate/scan for the in-process callback);
  // `pureFnReportFile` additionally forwards --pure-fn-report-file (write the
  // JSON file to the default `<genDir>/pure-fns-report.json` on generate);
  // `pureFnReportPath` forwards --pure-fn-report-path <path> (write to an
  // explicit path, implying the two above). Off by default so the pipeline
  // pays nothing.
  pureFnReport?: boolean;
  pureFnReportFile?: boolean;
  pureFnReportPath?: string;
}

// WireStats is the cumulative byte + request tally of a connection's stdio
// traffic (UTF-8 wire bytes, both directions). The transform-mode benchmark
// reads it to compare 'go' vs 'edits' wire cost; always-on because the cost of
// counting is negligible beside the JSON encode/decode of the same lines.
export interface WireStats {
  bytesWritten: number;
  bytesRead: number;
  requests: number;
}

// Common JSON-per-line request/response framing. Owns the in-flight request
// queue. The transport is agnostic to whether the streams come from a
// spawned child process or a Unix-socket connection.
class MessageTransport {
  private lines: Interface;
  private queue: Array<(r: Response) => void> = [];
  private closed = false;
  private bytesWritten = 0;
  private bytesRead = 0;
  private requestCount = 0;

  constructor(
    private readonly stdin: Writable,
    stdout: Readable,
    private readonly onClose: () => void
  ) {
    this.lines = createInterface({input: stdout});
    this.lines.on('line', (line) => {
      // + 1 for the newline framing readline stripped — counts the whole line.
      this.bytesRead += Buffer.byteLength(line, 'utf8') + 1;
      const done = this.queue.shift();
      if (!done) return;
      try {
        done(JSON.parse(line));
      } catch (e) {
        done({error: `parse: ${String(e)}`});
      }
    });
  }

  wireStats(): WireStats {
    return {bytesWritten: this.bytesWritten, bytesRead: this.bytesRead, requests: this.requestCount};
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
      const payload = JSON.stringify(req) + '\n';
      this.bytesWritten += Buffer.byteLength(payload, 'utf8');
      this.requestCount += 1;
      this.stdin.write(payload);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }
}

// ScanFilesOptions opts the scanFiles call into returning runTypes / the
// per-entry virtual modules projected over the request's files. Both
// fields are off by default so the rewrite pipeline (which only needs
// site offsets) pays nothing extra.
export interface ScanFilesOptions {
  includeRunTypes?: boolean;
  includeEntryModules?: boolean;
  // Opts the result into the per-op `metrics` block (checker counters,
  // per-phase wall times, Go memory deltas). Bench-harness use; the
  // rewrite pipeline never sets it.
  includeMetrics?: boolean;
  // Opts the response into the enrichment-health pass over the request's
  // files (tag hygiene + FriendlyText/MockData content + breadcrumb drift),
  // returned as Family.Enrich diagnostics. Lint-plugin use; the rewrite
  // pipeline never sets it.
  checkEnrich?: boolean;
  // Opts the response into the RunType-family render diagnostics (VL010,
  // PJ001, …) without the entry-module payload. Lint-plugin use.
  includeRtDiagnostics?: boolean;
}

// ScanFilesResult is the shape returned by scanFiles. Sites are flat —
// every site detected across the request's files, each tagged with .file
// so callers can filter or group. Replacements are byte-range rewrites
// for the user's source (pure-fn factory-arg-to-binding); the Go
// transform applies them (OpTransform) alongside Site insertions. runTypes /
// entryModules are populated only when opted into.
export interface ScanFilesResult {
  sites: Site[];
  replacements?: Replacement[];
  runTypes?: RunType[];
  entryModules?: Record<string, string>;
  diagnostics?: import('./protocol.ts').Diagnostic[];
  // Lint lane only (includeRtDiagnostics): format patterns RE2 couldn't
  // verify, for the lint plugin to validate with the real regex engine.
  uncheckedPatterns?: import('./protocol.ts').UncheckedPattern[];
  // Per-cache HMR signals; see Response.addedRunTypes etc in protocol.ts.
  addedRunTypes?: boolean;
  addedValidate?: boolean;
  addedValidationErrors?: boolean;
  addedPrepareForJson?: boolean;
  addedRestoreFromJson?: boolean;
  addedStringifyJson?: boolean;
  addedPrepareForJsonSafe?: boolean;
  addedHasUnknownKeys?: boolean;
  addedCloneExactShape?: boolean;
  addedUnknownKeyErrors?: boolean;
  addedUnknownKeysToUndefinedWire?: boolean;
  addedToBinary?: boolean;
  addedFromBinary?: boolean;
  addedFormatTransform?: boolean;
  addedPureFns?: boolean;
  // Pure-fn build report DELTA for the rescanned files — present only when the
  // resolver's pure-fn report is enabled. The plugin's update-lane callback
  // source (the changed sites).
  pureFnSites?: PureFnSite[];
  // Present only when the request set includeMetrics.
  metrics?: Metrics;
}

// TransformFilesResult is the shape returned by transform(): one
// TransformResult (rewritten code + source map) per requested file, keyed by
// file path, plus the flat file-tagged sites/replacements and the HMR added*
// signals. The compiler-driven path — Go applies the rewrite + generates the
// map and hands back finished code, so the plugin just plumbs {code, map} to
// Vite. Sites/replacements ride along for the no-op short-circuit + tests.
export interface TransformFilesResult {
  transformed: Record<string, TransformResult>;
  sites: Site[];
  replacements?: Replacement[];
  diagnostics?: Diagnostic[];
  addedRunTypes?: boolean;
  addedPureFns?: boolean;
}

// GenerateResult is the shape returned by generate(): the live manifest of
// module basenames written under <outDir>/types, the output root actually
// written to (the resolver-inferred <srcDir>/__runtypes when none was passed),
// the source files carrying marker sites (the plugin's transform gate), plus
// any diagnostics the full-program render produced (pure-fn extraction errors
// are halt-worthy).
export interface GenerateResult {
  modules: string[];
  outDir: string;
  siteFiles: string[];
  diagnostics?: Diagnostic[];
  // Whole-program pure-fn build report — present only when the resolver's
  // pure-fn report is enabled. The plugin's build-lane callback source; the
  // same records the resolver also writes to `<genDir>/pure-fns-report.json`.
  pureFnSites?: PureFnSite[];
}

// Common operation surface. Spawn-based and socket-based clients both
// implement this interface so consumers can be typed against the connection
// without caring which transport is in use.
export interface ResolverConnection {
  scanFiles(files: string[], opts?: ScanFilesOptions): Promise<ScanFilesResult>;
  transform(files: string[], outDir?: string, opts?: TransformOptions): Promise<TransformFilesResult>;
  generate(outDir?: string): Promise<GenerateResult>;
  dump(): Promise<Response>;
  setSources(sources: Record<string, string>): Promise<void>;
  reset(): Promise<void>;
  tsCompile(): Promise<number>;
  wireStats(): WireStats;
  close(): void;
}

// TransformOptions selects the transform wire mode. `emitEdits: true` is
// 'edits' mode — each TransformResult carries importBlock + edits + sourceHash
// for the FE to apply itself; omitted (or false) is 'go' mode (full code + map).
// `omitSourcesContent` is a 'go'-mode wire trim (drop the embedded original
// source from the map); no effect in 'edits' mode.
export interface TransformOptions {
  emitEdits?: boolean;
  omitSourcesContent?: boolean;
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
    if (opts.includeEntryModules) req.includeEntryModules = true;
    if (opts.includeMetrics) req.includeMetrics = true;
    if (opts.checkEnrich) req.checkEnrich = true;
    if (opts.includeRtDiagnostics) req.includeRtDiagnostics = true;
    const resp = await this.transport.request(req);
    if (resp.error) throw new Error(`scanFiles [${files.join(', ')}]: ${resp.error}`);
    return {
      sites: resp.sites ?? [],
      replacements: resp.replacements,
      runTypes: resp.runTypes,
      entryModules: resp.entryModules,
      diagnostics: resp.diagnostics,
      uncheckedPatterns: resp.uncheckedPatterns,
      addedRunTypes: resp.addedRunTypes,
      addedValidate: resp.addedValidate,
      addedValidationErrors: resp.addedValidationErrors,
      addedPrepareForJson: resp.addedPrepareForJson,
      addedRestoreFromJson: resp.addedRestoreFromJson,
      addedStringifyJson: resp.addedStringifyJson,
      addedPrepareForJsonSafe: resp.addedPrepareForJsonSafe,
      addedHasUnknownKeys: resp.addedHasUnknownKeys,
      addedCloneExactShape: resp.addedCloneExactShape,
      addedUnknownKeyErrors: resp.addedUnknownKeyErrors,
      addedUnknownKeysToUndefinedWire: resp.addedUnknownKeysToUndefinedWire,
      addedToBinary: resp.addedToBinary,
      addedFromBinary: resp.addedFromBinary,
      addedFormatTransform: resp.addedFormatTransform,
      addedPureFns: resp.addedPureFns,
      pureFnSites: resp.pureFnSites,
      metrics: resp.metrics,
    };
  }

  // transform runs the compiler-driven per-file transform (OpTransform). In
  // 'go' mode (default) the Go binary scans, rewrites, injects the dedup import
  // block + bindings, and generates the source map, returning finished code +
  // map per file. In 'edits' mode (opts.emitEdits) it instead returns the raw
  // edit list (importBlock + edits + sourceHash) for the FE applier — a lighter
  // wire. Either way the plugin drives HMR off the same added* signals.
  async transform(files: string[], outDir?: string, opts: TransformOptions = {}): Promise<TransformFilesResult> {
    if (files.length === 0) throw new Error('transform: files must be non-empty');
    const req: Request = {op: 'transform', files};
    if (outDir) req.outDir = outDir;
    if (opts.emitEdits) req.emitEdits = true;
    if (opts.omitSourcesContent) req.omitSourcesContent = true;
    const resp = await this.transport.request(req);
    if (resp.error) throw new Error(`transform [${files.join(', ')}]: ${resp.error}`);
    return {
      transformed: resp.transformed ?? {},
      sites: resp.sites ?? [],
      replacements: resp.replacements,
      diagnostics: resp.diagnostics,
      addedRunTypes: resp.addedRunTypes,
      addedPureFns: resp.addedPureFns,
    };
  }

  // generate runs OpGenerate: the resolver renders the full entry-module set
  // and WRITES it under <outDir>/types/ (write-only-on-change, relativized
  // inter-module imports, stale-file GC), returning the live manifest of
  // module basenames plus the output root it wrote to. The files-mode
  // replacement for the virtual-module load path. Pass an empty outDir to let
  // the resolver infer <srcDir>/__runtypes from the tsconfig; the resolved path
  // comes back in `outDir`.
  async generate(outDir?: string): Promise<GenerateResult> {
    const req: Request = {op: 'generate'};
    if (outDir) req.outDir = outDir;
    const resp = await this.transport.request(req);
    if (resp.error) throw new Error(`generate: ${resp.error}`);
    return {
      modules: resp.generated ?? [],
      outDir: resp.outDir ?? outDir ?? '',
      siteFiles: resp.siteFiles ?? [],
      diagnostics: resp.diagnostics,
      pureFnSites: resp.pureFnSites,
    };
  }

  async dump(): Promise<Response> {
    return this.transport.request({op: 'dump'});
  }

  async setSources(sources: Record<string, string>): Promise<void> {
    const resp = await this.transport.request({op: 'setSources', sources});
    if (resp.error) throw new Error(`setSources: ${resp.error}`);
  }

  // reset wipes ALL resolver state (cache, sites, Program, overlay) — see
  // internal/compiler/resolver/resolver.go:Reset for the contract. The caller must
  // call setSources before the next scanFiles.
  async reset(): Promise<void> {
    const resp = await this.transport.request({op: 'reset'});
    if (resp.error) throw new Error(`reset: ${resp.error}`);
  }

  // tsCompile runs the embedded tsgo through bind + typecheck + Emit() on
  // the current source overlay and returns the wall-time in milliseconds.
  // Does NOT walk markers and does NOT render any ts-runtypes cache
  // modules — purely the TypeScript baseline. Caller must have called
  // setSources first.
  async tsCompile(): Promise<number> {
    const resp = await this.transport.request({op: 'tsCompile'});
    if (resp.error) throw new Error(`tsCompile: ${resp.error}`);
    return resp.tsCompileMs ?? 0;
  }

  // wireStats exposes the connection's cumulative stdio byte + request tally
  // (both directions, UTF-8). The transform-mode benchmark reads it to compare
  // 'go' vs 'edits' wire cost.
  wireStats(): WireStats {
    return this.transport.wireStats();
  }

  close(): void {
    this.transport.close();
  }
}

// buildResolverArgs assembles the resolver child's argv from client options.
// Shared by ResolverClient (which spawns the child itself) and the lint
// session's spawn-shim path (which hands the argv to a pre-spawned launcher
// — see eslint/spawn-shim.ts).
export function buildResolverArgs(cwd: string, tsconfigPath: string, opts: ResolverClientOptions = {}): string[] {
  const args = ['--one-shot', '--cwd', cwd];
  // --tsconfig is meaningless in inline / server modes — the Go binary
  // ignores it. Skip the flag to keep the CLI honest.
  if (!opts.inlineSources && !opts.serverMode && tsconfigPath) {
    args.push('--tsconfig', tsconfigPath);
  }
  if (opts.inlineSources) args.push('--inline-sources-stdin');
  if (opts.serverMode) args.push('--inline-server');
  // cacheDir is NOT a CLI arg — it rides the child's RT_CACHE_DIR env var
  // (set by ResolverClient's spawn) so parallel spawns stay isolated.
  if (opts.emitMode) args.push('--emit-mode', opts.emitMode);
  if (opts.sizeBias !== undefined) args.push('--size-bias', String(opts.sizeBias));
  if (opts.sizeItems !== undefined) args.push('--size-items', String(opts.sizeItems));
  if (opts.sizeStringBytes !== undefined) args.push('--size-string-bytes', String(opts.sizeStringBytes));
  if (opts.sizeMaxBytes !== undefined) args.push('--size-max-bytes', String(opts.sizeMaxBytes));
  if (opts.parallelScan === false) args.push('--no-parallel-scan');
  if (opts.parallelRender === false) args.push('--no-parallel-render');
  if (opts.moduleMode) args.push('--module-mode', opts.moduleMode);
  if (opts.inlineMode) args.push('--inline-mode', opts.inlineMode);
  if (opts.singleThreaded) args.push('--single-threaded');
  // Build-lane only. The lint worker never forwards it: the lint lane always
  // validates the samples (with the real RegExp) regardless of the flag.
  if (opts.allowUncheckedPatterns) args.push('--allow-unchecked-patterns');
  if (opts.pureFnReport) args.push('--pure-fn-report');
  if (opts.pureFnReportFile) args.push('--pure-fn-report-file');
  if (opts.pureFnReportPath) args.push('--pure-fn-report-path', opts.pureFnReportPath);
  return args;
}

// ResolverClient spawns the ts-runtypes binary and drives it over its
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
    const args = buildResolverArgs(cwd, tsconfigPath, opts);
    // cacheDir (internal override) rides the child's RT_CACHE_DIR env, not a
    // CLI arg, so concurrent spawns with different cache dirs don't collide.
    // A path forces the cache on there, '' forces it off; undefined leaves the
    // env untouched so the binary follows the project's incremental setting.
    const env = opts.cacheDir !== undefined ? {...process.env, RT_CACHE_DIR: opts.cacheDir} : process.env;
    this.child = spawn(binary, args, {stdio: ['pipe', 'pipe', 'inherit'], env});
    if (!this.child.stdin || !this.child.stdout) {
      throw new Error('failed to spawn ts-runtypes (no stdio pipes)');
    }
    const stdin = this.child.stdin;
    const stdout = this.child.stdout;
    this.transport = new MessageTransport(stdin, stdout, () => {
      stdin.end();
      this.child.kill();
    });
    // A spawn failure (missing binary, host limits) surfaces as an 'error'
    // event with NO 'exit' — drain in-flight requests instead of hanging
    // callers until their timeout.
    this.child.on('error', (error) => this.transport.markClosed(`spawn failed: ${error.message}`));
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

// ResolverStreamClient drives the same JSON-per-line protocol over caller-
// supplied streams. The lint session's spawn-shim path uses it: the resolver
// child's stdio pipes belong to the pre-spawned launcher process rather than
// a ChildProcess this module owns, so the caller wires close/exit itself.
export class ResolverStreamClient extends ResolverClientBase {
  protected readonly transport: MessageTransport;

  constructor(stdin: Writable, stdout: Readable, onClose: () => void) {
    super();
    this.transport = new MessageTransport(stdin, stdout, onClose);
  }

  // markClosed drains in-flight requests with an error when the underlying
  // process went away (the caller observes the exit, not this class).
  markClosed(reason: string): void {
    this.transport.markClosed(reason);
  }
}

// ResolverSocketClient connects to a daemon-mode `ts-runtypes` process
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
