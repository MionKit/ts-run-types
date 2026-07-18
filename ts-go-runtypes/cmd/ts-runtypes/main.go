// Command ts-runtypes answers compile-time type-reflection queries for
// runtypes. It holds a typescript-go Program + checker in memory and
// speaks newline-delimited JSON on stdio, or writes the dump straight to
// disk via --out-json / --out-modules.
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"runtime/pprof"
	"strings"
	"sync"

	"github.com/microsoft/typescript-go/shim/tspath"

	// Blank-import the format-emitter aggregator so every concrete
	// format (stringFormat, uuid, …) registers with the formats
	// registry before the resolver starts handing out RunTypes.
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/batchcompile"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

const usage = `ts-runtypes — compile-time type resolver for runtypes

Usage:
    ts-runtypes [OPTIONS]

Options:
    --tsconfig PATH     tsconfig.json to load (default: ./tsconfig.json)
    --cwd PATH          working directory (default: $PWD)
    --one-shot          read requests from stdin until EOF, emit dump to stdout
    --daemon            listen on a Unix socket for persistent serving
    --socket PATH       socket path (default: /tmp/ts-runtypes.sock)
    --out-json PATH     after stdin is drained, write the cache as JSON to PATH
    --out-modules DIR   after stdin is drained, write every per-entry virtual
                        module to DIR/<basename>.js (debugging aid)
    --compile           tsc-like batch compile: transform every marker file,
                        emit .js via tsgo with source maps composed back to the
                        ORIGINAL source, and write the generated cache modules
                        to disk. Emits to the tsconfig outDir; no stdio protocol.
    --gen-dir DIR  where --compile writes the cache modules
                        (default <cwd>/__runtypes). Also readable as the
                        "genDir" key in the tsconfig ts-runtypes
                        plugin entry (the flag overrides it, tsc-style).
    --hash-length N     short-id length for type hashes (default 7)
    --single-threaded   force single-checker mode (useful for tests);
                        also disables the parallel scan + renders
    --no-parallel-scan  disable the parallel marker scan (parallel is the
                        default: multi-file scanFiles requests analyze
                        call sites concurrently across the checker pool)
    --no-parallel-render disable the parallel cache renders (parallel is
                        the default: requested non-validate cache families
                        render concurrently; validate always renders last)
    --module-mode MODE  virtual-module grouping: default (runtype bundle +
                        per-entry fn modules), allSingle (per-family bundle
                        modules — fewest modules), or allModules (per-node
                        runtype modules too — the pre-bundle layout)
    --emit-mode MODE    fn-entry code/factory slots: code (body string only,
                        the default), functions (live factory only), or both
    --inline-mode MODE  child-inlining policy: default (unnamed non-circular
                        compounds inline into their parents, named types stay
                        external) or allInternal (everything except circular
                        types inlines, names ignored)
    --inline-sources-stdin   read {"sources":{relpath:content}} from stdin
                             before the request stream; build an inferred
                             Program whose source files come from that map
                             (no tsconfig glob, no disk reads for those paths)
    --inline-server     persistent inline-sources server: start with no
                        Program, accept setSources / resetCache / scanFiles /
                        dump ops; used by long-lived test daemons
    -h, --help          show help

The on-disk RT artifact cache (per-(typeID, fnTag) files under
<cwd>/node_modules/.cache/ts-runtypes/<optsFingerprint>/...) follows TypeScript's
own incremental switch: it is enabled when the loaded tsconfig sets
"incremental" or "composite", and disabled otherwise. The internal RT_CACHE_DIR
environment variable overrides this for tests and direct-binary use: set it to a
path to force the cache on at that location, or to an empty string to force it
off. Binary version is folded into every typeID hash so cross-version files
never collide.
`

func main() {
	// Out-of-band enrichment subcommands (describe / gen) are argv-driven and
	// handled before flag.Parse. The plugin spawns the binary with a --flag as
	// os.Args[1], which never matches, so the build path is untouched.
	if dispatchEnrichCommand() {
		return
	}

	flag.Usage = func() { fmt.Fprint(os.Stderr, usage) }

	var (
		tsconfigPath           string
		cwdFlag                string
		oneShot                bool
		daemon                 bool
		socketPath             string
		outJSON                string
		outModulesDir          string
		compileMode            bool
		genDir                 string
		hashLength             int
		singleThreaded         bool
		noParallelScan         bool
		noParallelRender       bool
		inlineSourcesStdin     bool
		inlineServer           bool
		emitMode               string
		inlineMode             string
		moduleMode             string
		allowUncheckedPatterns bool
		sizeBias               float64
		sizeItems              int
		sizeStringBytes        int
		sizeMaxBytes           int
		pprofCPU               string
		pprofHeap              string
		help                   bool
		version                bool
	)
	flag.StringVar(&tsconfigPath, "tsconfig", "", "tsconfig.json path")
	flag.StringVar(&cwdFlag, "cwd", "", "working directory")
	flag.BoolVar(&oneShot, "one-shot", false, "one-shot stdio mode")
	flag.BoolVar(&daemon, "daemon", false, "daemon Unix-socket mode")
	flag.StringVar(&socketPath, "socket", "/tmp/ts-runtypes.sock", "Unix socket path")
	flag.StringVar(&outJSON, "out-json", "", "write cache as JSON to PATH after stdin EOF")
	flag.StringVar(&outModulesDir, "out-modules", "", "write per-entry virtual modules to DIR after stdin EOF")
	flag.BoolVar(&compileMode, "compile", false,
		"compile mode: transform + emit .js with composed source maps + generated caches to disk (tsc-like); uses the tsconfig outDir")
	flag.StringVar(&genDir, "gen-dir", "",
		"where compile writes the generated cache modules (default <cwd>/__runtypes); the emitted .js import them by relative path")
	flag.IntVar(&hashLength, "hash-length", 0, "short-id length for type hashes (0 = default 7)")
	flag.BoolVar(&singleThreaded, "single-threaded", false, "single-threaded mode")
	flag.BoolVar(&noParallelScan, "no-parallel-scan", false,
		"disable the parallel marker scan (parallel is the default)")
	flag.BoolVar(&noParallelRender, "no-parallel-render", false,
		"disable the parallel cache renders (parallel is the default)")
	flag.BoolVar(&inlineSourcesStdin, "inline-sources-stdin", false,
		"read {\"sources\":{relpath:content}} from stdin before the request stream")
	flag.BoolVar(&inlineServer, "inline-server", false,
		"persistent inline-sources server: start with no Program; accept setSources / resetCache ops")
	flag.StringVar(&emitMode, "emit-mode", string(constants.EmitCode),
		"what each cache entry ships in its code/factory slots: "+
			"code (default — body string only; the JS side rebuilds the factory via `new Function` on first lookup), "+
			"functions (live factory only; code derived lazily if read — smallest factory-bearing output), or "+
			"both (code + factory, for runtimes that disallow dynamic code like Cloudflare WorkerD / CSP without unsafe-eval).")
	flag.StringVar(&inlineMode, "inline-mode", string(constants.InlineModeDefault),
		"child-inlining policy: default (unnamed compounds inline, named external) | allInternal (everything except circular inlines)")
	flag.StringVar(&moduleMode, "module-mode", constants.ModuleModeDefault,
		"virtual-module grouping: default (runtype bundle + per-entry fn modules), "+
			"allSingle (per-family bundle modules — fewest modules), or "+
			"allModules (per-node runtype modules too — the pre-bundle layout)")
	flag.BoolVar(&allowUncheckedPatterns, "allow-unchecked-patterns", false,
		"silence the fail-closed FMT004 build error for format patterns whose mockSamples "+
			"RE2 can't verify (JS-only regex features); asserts the ts-runtypes JS linter owns the check")
	flag.Float64Var(&sizeBias, "size-bias", constants.DefaultSizeBias,
		"binary `dynamic` cold-start size bias in [0,1]: 0 = tightest (more grows), 1 = most generous (default 0.8)")
	flag.IntVar(&sizeItems, "size-items", constants.DefaultSizeItems,
		"assumed element count for an unbounded collection (array/Map/Set) in the binary cold-start estimate (default 100)")
	flag.IntVar(&sizeStringBytes, "size-string-bytes", constants.DefaultSizeStringBytes,
		"assumed UTF-8 byte length of an unbounded string in the binary cold-start estimate (default 32)")
	flag.IntVar(&sizeMaxBytes, "size-max-bytes", constants.DefaultSizeMaxBytes,
		"per-type cap on the binary cold-start estimate so a huge declared bound never seeds a multi-MB buffer (default 65536)")
	flag.StringVar(&pprofCPU, "pprof-cpu", "",
		"write a CPU profile to PATH, covering the whole serve loop (started at boot, stopped at exit)")
	flag.StringVar(&pprofHeap, "pprof-heap", "",
		"write a heap profile to PATH at exit (after a final GC)")
	flag.BoolVar(&help, "help", false, "show help")
	flag.BoolVar(&help, "h", false, "show help")
	flag.BoolVar(&version, "version", false, "print version (binary + pinned tsgo revision) and exit")
	flag.Parse()

	// Which flags the user actually passed. The build-config merge layers the
	// tsconfig plugin entry UNDER any explicitly-set flag (tsc precedence), so
	// it must tell an explicit value from an absent flag.
	setFlags := map[string]bool{}
	flag.Visit(func(f *flag.Flag) { setFlags[f.Name] = true })

	if help {
		flag.Usage()
		return
	}

	if version {
		fmt.Printf("ts-runtypes %s (tsgo %s)\n", constants.Version, constants.TsgoVersion)
		return
	}

	if pprofCPU != "" {
		cpuFile, err := os.Create(pprofCPU)
		if err != nil {
			fatal("pprof-cpu: %v", err)
		}
		if err := pprof.StartCPUProfile(cpuFile); err != nil {
			fatal("pprof-cpu: %v", err)
		}
		defer func() {
			pprof.StopCPUProfile()
			cpuFile.Close()
		}()
	}
	if pprofHeap != "" {
		defer func() {
			heapFile, err := os.Create(pprofHeap)
			if err != nil {
				fmt.Fprintf(os.Stderr, "pprof-heap: %v\n", err)
				return
			}
			defer heapFile.Close()
			runtime.GC()
			if err := pprof.WriteHeapProfile(heapFile); err != nil {
				fmt.Fprintf(os.Stderr, "pprof-heap: %v\n", err)
			}
		}()
	}

	cwd := cwdFlag
	if cwd == "" {
		d, err := os.Getwd()
		if err != nil {
			fatal("getwd: %v", err)
		}
		cwd = d
	}
	absCwd, err := filepath.Abs(cwd)
	if err != nil {
		fatal("abs(cwd): %v", err)
	}

	// Layer the build config: an on-disk tsconfig (the default mode) supplies
	// the project knobs as a base, explicitly-set flags override them. The
	// inline / server modes carry no tsconfig, so they run on flags + defaults
	// alone (hasTsconfig=false also withholds the node_modules cache default).
	hasTsconfig := !inlineServer && !inlineSourcesStdin
	var plugin tsRuntypesPlugin
	if hasTsconfig {
		plugin, _ = resolveBuildPlugin(absCwd, tsconfigPath)
		// A misspelt key is otherwise silently ignored, so the option appears
		// to have no effect. Warn on stderr (the host inherits it into the
		// build log) listing the unrecognised keys.
		if unknown := unknownPluginKeys(absCwd, tsconfigPath); len(unknown) > 0 {
			fmt.Fprintf(os.Stderr, "ts-runtypes: ignoring unknown ts-runtypes plugin key(s) in tsconfig: %v\n", unknown)
		}
	}
	merged := mergeBuildOptions(buildFlags{
		set:                    setFlags,
		hashLength:             hashLength,
		singleThreaded:         singleThreaded,
		noParallelScan:         noParallelScan,
		noParallelRender:       noParallelRender,
		genDir:                 genDir,
		emitMode:               emitMode,
		inlineMode:             inlineMode,
		moduleMode:             moduleMode,
		allowUncheckedPatterns: allowUncheckedPatterns,
		sizeBias:               sizeBias,
		sizeItems:              sizeItems,
		sizeStringBytes:        sizeStringBytes,
		sizeMaxBytes:           sizeMaxBytes,
	}, plugin, absCwd)

	// Stdio decoder/encoder is built up front because in inline-sources mode
	// we consume one handshake line from stdin BEFORE constructing the
	// Program, then keep the same decoder for the request loop so any bytes
	// buffered by the JSON decoder past the handshake aren't lost. Stdout is
	// buffered (flushed once per response in serveRequests) so a large
	// response doesn't degrade into many small pipe writes.
	stdinDec := json.NewDecoder(bufio.NewReader(os.Stdin))
	stdoutBuf := bufio.NewWriter(os.Stdout)
	stdoutEnc := json.NewEncoder(stdoutBuf)

	// Validate the MERGED values: a bad mode can arrive from tsconfig as
	// readily as from a flag, so the check sits after the merge.
	switch merged.moduleMode {
	case constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules:
	default:
		fatal("module-mode: unknown value %q (expected %s | %s | %s)",
			merged.moduleMode, constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules)
	}

	if !constants.EmitMode(merged.emitMode).Valid() {
		fmt.Fprintf(os.Stderr, "ts-runtypes: invalid emit-mode %q (want code | functions | both)\n", merged.emitMode)
		os.Exit(2)
	}
	if !constants.InlineMode(merged.inlineMode).Valid() {
		fmt.Fprintf(os.Stderr, "ts-runtypes: invalid inline-mode %q (want default | allInternal)\n", merged.inlineMode)
		os.Exit(2)
	}

	// RT disk cache: the internal RT_CACHE_DIR env var is the only control
	// (the public cacheDir plugin/tsconfig knob was dropped). Three states:
	// unset → the cache follows the project's incremental/composite setting
	// (CacheFollowsIncremental, resolved against the loaded Program); set to a
	// path → force the cache on at that path; set to "" → force it off.
	cacheDirOverride, cacheDirSet := os.LookupEnv("RT_CACHE_DIR")

	// tsconfig `genDir` (raw, pre-default) rides into the resolver so the
	// build lane's resolveOutDir agrees with the CLI lanes; when unset the
	// resolver keeps its <srcDir>/__runtypes inference.
	tsconfigGenDir := strings.TrimSpace(plugin.GenDir)
	if tsconfigGenDir != "" && !filepath.IsAbs(tsconfigGenDir) {
		tsconfigGenDir = filepath.Join(absCwd, tsconfigGenDir)
	}
	resolverOpts := resolver.Options{
		HashLength:              merged.hashLength,
		Marker:                  marker.Options{},
		Cwd:                     absCwd,
		TsconfigGenDir:          tsconfigGenDir,
		SingleThreaded:          merged.singleThreaded,
		DisableParallelScan:     merged.disableParallelScan,
		DisableParallelRender:   merged.disableParallelRender,
		CacheDir:                normalizeCacheDir(cacheDirOverride, absCwd),
		CacheFollowsIncremental: !cacheDirSet,
		EmitMode:                constants.EmitMode(merged.emitMode),
		InlineMode:              constants.InlineMode(merged.inlineMode),
		ModuleMode:              merged.moduleMode,
		AllowUncheckedPatterns:  merged.allowUncheckedPatterns,
		SizeBias:                merged.sizeBias,
		SizeItems:               merged.sizeItems,
		SizeStringBytes:         merged.sizeStringBytes,
		SizeMaxBytes:            merged.sizeMaxBytes,
	}

	// Compile mode is a batch build, not a stdio session: it drives the two-pass
	// transform + tsgo emit + map composition itself and returns. Requires a
	// tsconfig (the inline / server overlay modes have no emit options to honor).
	if compileMode {
		if !hasTsconfig {
			fatal("compile: requires a tsconfig (not compatible with --inline-server / --inline-sources-stdin)")
		}
		compileResult, compileErr := batchcompile.Run(batchcompile.Options{
			Cwd:          absCwd,
			TsconfigPath: tsconfigPath,
			// merged.genDir layers the flag over the tsconfig
			// `genDir` entry over the <cwd>/__runtypes default.
			GenDir:       merged.genDir,
			ResolverOpts: resolverOpts,
		})
		if compileErr != nil {
			fatal("compile: %v", compileErr)
		}
		errorCount := 0
		for _, d := range compileResult.Diagnostics {
			fmt.Fprintln(os.Stderr, diagnostics.FormatDebug(d))
			if d.Severity == diagnostics.SeverityError {
				errorCount++
			}
		}
		fmt.Fprintf(os.Stderr, "ts-runtypes: compiled %d file(s), %d cache module(s)\n",
			len(compileResult.EmittedFiles), len(compileResult.Caches))
		if errorCount > 0 {
			os.Exit(1)
		}
		return
	}

	var r *resolver.Session
	switch {
	case inlineServer:
		// Persistent server mode: no startup Program. The client installs
		// one via setSources, and may swap it many times before EOF / socket
		// disconnect. resolver.NewServer cannot fail (no checker lease yet).
		r = resolver.NewServer(resolverOpts)
	case inlineSourcesStdin:
		var handshake struct {
			Sources map[string]string `json:"sources"`
		}
		if err := stdinDec.Decode(&handshake); err != nil {
			fatal("inline-sources handshake decode: %v", err)
		}
		overlay := make(map[string]string, len(handshake.Sources))
		fileNames := make([]string, 0, len(handshake.Sources))
		for rel, content := range handshake.Sources {
			abs := tspath.ResolvePath(tspath.NormalizePath(absCwd), rel)
			overlay[abs] = content
			fileNames = append(fileNames, abs)
		}
		p, err := program.NewInferred(program.Options{
			Cwd:            absCwd,
			SingleThreaded: merged.singleThreaded,
			Overlay:        overlay,
		}, fileNames)
		if err != nil {
			fatal("program (inferred): %v", err)
		}
		r, err = resolver.New(p, resolverOpts)
		if err != nil {
			fatal("resolver: %v", err)
		}
	default:
		p, err := program.New(program.Options{
			Cwd:            absCwd,
			TsconfigPath:   tsconfigPath,
			SingleThreaded: merged.singleThreaded,
		})
		if err != nil {
			fatal("program: %v", err)
		}
		r, err = resolver.New(p, resolverOpts)
		if err != nil {
			fatal("resolver: %v", err)
		}
	}
	defer r.Close()

	switch {
	case daemon:
		runDaemon(r, socketPath)
	default:
		serveRequests(r.Dispatch, stdinDec, stdoutEnc, stdoutBuf.Flush)
	}

	// Optional file outputs after stdin is drained. Both formats share one
	// resolver state so file emissions are consistent with the JSON the
	// caller already saw on stdout.
	dump := protocol.Dump{
		RunTypes: r.Cache().Dump(),
		Sites:    r.Sites(),
	}
	if outJSON != "" {
		if err := writeFile(outJSON, dump.WriteJSON); err != nil {
			fatal("out-json: %v", err)
		}
	}
	if outModulesDir != "" {
		// Re-dispatch a dump so the modules flow through the same pipeline
		// (cross-family fixpoint, cascade, stubs) the wire response uses.
		response := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if response.Error != "" {
			fatal("out-modules: %s", response.Error)
		}
		for basename, source := range response.EntryModules {
			target := filepath.Join(outModulesDir, basename+".js")
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				fatal("out-modules: %v", err)
			}
			if err := os.WriteFile(target, []byte(source), 0o644); err != nil {
				fatal("out-modules: %v", err)
			}
		}
	}
}

func runOneShot(dispatch func(protocol.Request) protocol.Response, in io.Reader, out io.Writer) {
	outBuf := bufio.NewWriter(out)
	serveRequests(dispatch, json.NewDecoder(bufio.NewReader(in)), json.NewEncoder(outBuf), outBuf.Flush)
}

// serveRequests drains the request stream, dispatching each and encoding
// the response. flush runs after every response so the buffered writer's
// bytes reach the client before the next read blocks.
func serveRequests(dispatch func(protocol.Request) protocol.Response, dec *json.Decoder, enc *json.Encoder, flush func() error) {
	for {
		var req protocol.Request
		if err := dec.Decode(&req); err != nil {
			if err == io.EOF {
				break
			}
			_ = enc.Encode(protocol.Response{Error: fmt.Sprintf("decode: %v", err)})
			_ = flush()
			continue
		}
		resp := dispatch(req)
		if err := enc.Encode(resp); err != nil {
			fatal("encode: %v", err)
		}
		if err := flush(); err != nil {
			fatal("flush: %v", err)
		}
	}
}

func runDaemon(r *resolver.Session, socketPath string) {
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		fatal("listen: %v", err)
	}
	defer listener.Close()

	fmt.Fprintf(os.Stderr, "ts-runtypes daemon listening on %s\n", socketPath)

	// One Session serves every connection, so dispatches are serialized:
	// the resolver session state (cache, sites, scan bookkeeping — and the
	// parallel scan inside a dispatch) assumes one op at a time. Without
	// this, two connections issuing ops concurrently raced on shared maps.
	var dispatchMutex sync.Mutex
	dispatch := func(request protocol.Request) protocol.Response {
		dispatchMutex.Lock()
		defer dispatchMutex.Unlock()
		return r.Dispatch(request)
	}

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Fprintf(os.Stderr, "accept: %v\n", err)
			continue
		}
		go func(c net.Conn) {
			defer c.Close()
			runOneShot(dispatch, c, c)
		}(conn)
	}
}

func writeFile(path string, fn func(io.Writer) error) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	bw := bufio.NewWriter(f)
	if err := fn(bw); err != nil {
		return err
	}
	return bw.Flush()
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
