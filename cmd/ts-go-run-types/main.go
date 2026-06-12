// Command ts-go-run-types answers compile-time type-reflection queries for
// mion runtypes. It holds a typescript-go Program + checker in memory and
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
	"sync"

	"github.com/microsoft/typescript-go/shim/tspath"

	// Blank-import the format-emitter aggregator so every concrete
	// format (stringFormat, uuid, …) registers with the formats
	// registry before the resolver starts handing out RunTypes.
	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

const usage = `ts-go-run-types — compile-time type resolver for mion runtypes

Usage:
    ts-go-run-types [OPTIONS]

Options:
    --tsconfig PATH     tsconfig.json to load (default: ./tsconfig.json)
    --cwd PATH          working directory (default: $PWD)
    --one-shot          read requests from stdin until EOF, emit dump to stdout
    --daemon            listen on a Unix socket for persistent serving
    --socket PATH       socket path (default: /tmp/ts-go-run-types.sock)
    --out-json PATH     after stdin is drained, write the cache as JSON to PATH
    --out-modules DIR   after stdin is drained, write every per-entry virtual
                        module to DIR/<basename>.js (debugging aid)
    --hash-length N     short-id length for type hashes (default 6)
    --literal-hash-length N  short-id length for literal-typed hashes (default 5)
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
    --inline-sources-stdin   read {"sources":{relpath:content}} from stdin
                             before the request stream; build an inferred
                             Program whose source files come from that map
                             (no tsconfig glob, no disk reads for those paths)
    --inline-server     persistent inline-sources server: start with no
                        Program, accept setSources / resetCache / scanFiles /
                        dump ops; used by long-lived test daemons
    --cache-dir PATH    base directory for the on-disk RT artifact cache
                        (typically node_modules/.cache/ts-go-run-types).
                        Per-(typeID, fnTag) files under
                        <cache-dir>/<optsFingerprint>/<typeID>/<fnTag>.json
                        let subsequent builds skip the walker for unchanged
                        types. Binary version is folded into every typeID
                        hash so cross-version files never collide.
                        Empty disables caching.
    -h, --help          show help
`

func main() {
	flag.Usage = func() { fmt.Fprint(os.Stderr, usage) }

	var (
		tsconfigPath       string
		cwdFlag            string
		oneShot            bool
		daemon             bool
		socketPath         string
		outJSON            string
		outModulesDir      string
		hashLength         int
		literalHashLength  int
		singleThreaded     bool
		noParallelScan     bool
		noParallelRender   bool
		inlineSourcesStdin bool
		inlineServer       bool
		cacheDir           string
		emitCacheFunctions bool
		moduleMode         string
		pprofCPU           string
		pprofHeap          string
		help               bool
	)
	flag.StringVar(&tsconfigPath, "tsconfig", "", "tsconfig.json path")
	flag.StringVar(&cwdFlag, "cwd", "", "working directory")
	flag.BoolVar(&oneShot, "one-shot", false, "one-shot stdio mode")
	flag.BoolVar(&daemon, "daemon", false, "daemon Unix-socket mode")
	flag.StringVar(&socketPath, "socket", "/tmp/ts-go-run-types.sock", "Unix socket path")
	flag.StringVar(&outJSON, "out-json", "", "write cache as JSON to PATH after stdin EOF")
	flag.StringVar(&outModulesDir, "out-modules", "", "write per-entry virtual modules to DIR after stdin EOF")
	flag.IntVar(&hashLength, "hash-length", 0, "short-id length for type hashes (0 = default 6)")
	flag.IntVar(&literalHashLength, "literal-hash-length", 0, "short-id length for literal hashes (0 = default 5)")
	flag.BoolVar(&singleThreaded, "single-threaded", false, "single-threaded mode")
	flag.BoolVar(&noParallelScan, "no-parallel-scan", false,
		"disable the parallel marker scan (parallel is the default)")
	flag.BoolVar(&noParallelRender, "no-parallel-render", false,
		"disable the parallel cache renders (parallel is the default)")
	flag.BoolVar(&inlineSourcesStdin, "inline-sources-stdin", false,
		"read {\"sources\":{relpath:content}} from stdin before the request stream")
	flag.BoolVar(&inlineServer, "inline-server", false,
		"persistent inline-sources server: start with no Program; accept setSources / resetCache ops")
	flag.StringVar(&cacheDir, "cache-dir", "",
		"base directory for the on-disk RT artifact cache (empty disables)")
	flag.BoolVar(&emitCacheFunctions, "emit-create-rt-fn", false,
		"emit the inline createRTFn closure on every cache entry alongside the body string. "+
			"Default false — the JS side rebuilds the factory from `code` via `new Function` on first lookup. "+
			"Set true for runtimes that disallow dynamic code (Cloudflare WorkerD, browser CSP without unsafe-eval).")
	flag.StringVar(&moduleMode, "module-mode", constants.ModuleModeDefault,
		"virtual-module grouping: default (runtype bundle + per-entry fn modules), "+
			"allSingle (per-family bundle modules — fewest modules), or "+
			"allModules (per-node runtype modules too — the pre-bundle layout)")
	flag.StringVar(&pprofCPU, "pprof-cpu", "",
		"write a CPU profile to PATH, covering the whole serve loop (started at boot, stopped at exit)")
	flag.StringVar(&pprofHeap, "pprof-heap", "",
		"write a heap profile to PATH at exit (after a final GC)")
	flag.BoolVar(&help, "help", false, "show help")
	flag.BoolVar(&help, "h", false, "show help")
	flag.Parse()

	if help {
		flag.Usage()
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

	// Stdio decoder/encoder is built up front because in inline-sources mode
	// we consume one handshake line from stdin BEFORE constructing the
	// Program, then keep the same decoder for the request loop so any bytes
	// buffered by the JSON decoder past the handshake aren't lost. Stdout is
	// buffered (flushed once per response in serveRequests) so a large
	// response doesn't degrade into many small pipe writes.
	stdinDec := json.NewDecoder(bufio.NewReader(os.Stdin))
	stdoutBuf := bufio.NewWriter(os.Stdout)
	stdoutEnc := json.NewEncoder(stdoutBuf)

	switch moduleMode {
	case constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules:
	default:
		fatal("--module-mode: unknown value %q (expected %s | %s | %s)",
			moduleMode, constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules)
	}

	resolverOpts := resolver.Options{
		HashLength:            hashLength,
		LiteralHashLength:     literalHashLength,
		Marker:                marker.Options{},
		Cwd:                   absCwd,
		SingleThreaded:        singleThreaded,
		DisableParallelScan:   noParallelScan,
		DisableParallelRender: noParallelRender,
		CacheDir:              cacheDir,
		EmitCreateRTFn:        emitCacheFunctions,
		ModuleMode:            moduleMode,
	}

	var r *resolver.Resolver
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
			SingleThreaded: singleThreaded,
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
			SingleThreaded: singleThreaded,
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

func runDaemon(r *resolver.Resolver, socketPath string) {
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		fatal("listen: %v", err)
	}
	defer listener.Close()

	fmt.Fprintf(os.Stderr, "ts-go-run-types daemon listening on %s\n", socketPath)

	// One Resolver serves every connection, so dispatches are serialized:
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
