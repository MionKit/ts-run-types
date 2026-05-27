// Command ts-go-run-types answers compile-time type-reflection queries for
// mion runtypes. It holds a typescript-go Program + checker in memory and
// speaks newline-delimited JSON on stdio, or writes the dump straight to
// disk via --out-json / --out-ts.
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

	"github.com/microsoft/typescript-go/shim/tspath"

	"github.com/mionkit/ts-run-types/internal/compiled/runtype"
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
    --out-ts   PATH     after stdin is drained, write the runtime cache JS module to PATH
    --hash-length N     short-id length for type hashes (default 6)
    --literal-hash-length N  short-id length for literal-typed hashes (default 5)
    --marker-name NAME  marker type alias (default InjectRuntypeId)
    --marker-module M   package the marker is declared in (default @mionjs/ts-go-run-types)
    --single-threaded   force single-checker mode (useful for tests)
    --inline-sources-stdin   read {"sources":{relpath:content}} from stdin
                             before the request stream; build an inferred
                             Program whose source files come from that map
                             (no tsconfig glob, no disk reads for those paths)
    --inline-server     persistent inline-sources server: start with no
                        Program, accept setSources / resetCache / scanFiles /
                        dump ops; used by long-lived test daemons
    --cache-dir PATH    base directory for the on-disk JIT artifact cache
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
		outTS              string
		hashLength         int
		literalHashLength  int
		markerName         string
		markerModule       string
		singleThreaded     bool
		inlineSourcesStdin bool
		inlineServer       bool
		cacheDir           string
		help               bool
	)
	flag.StringVar(&tsconfigPath, "tsconfig", "", "tsconfig.json path")
	flag.StringVar(&cwdFlag, "cwd", "", "working directory")
	flag.BoolVar(&oneShot, "one-shot", false, "one-shot stdio mode")
	flag.BoolVar(&daemon, "daemon", false, "daemon Unix-socket mode")
	flag.StringVar(&socketPath, "socket", "/tmp/ts-go-run-types.sock", "Unix socket path")
	flag.StringVar(&outJSON, "out-json", "", "write cache as JSON to PATH after stdin EOF")
	flag.StringVar(&outTS, "out-ts", "", "write runtime cache JS module to PATH after stdin EOF")
	flag.IntVar(&hashLength, "hash-length", 0, "short-id length for type hashes (0 = default 6)")
	flag.IntVar(&literalHashLength, "literal-hash-length", 0, "short-id length for literal hashes (0 = default 5)")
	flag.StringVar(&markerName, "marker-name", "", "marker type alias (default InjectRuntypeId)")
	flag.StringVar(&markerModule, "marker-module", "", "marker package (default @mionjs/ts-go-run-types)")
	flag.BoolVar(&singleThreaded, "single-threaded", false, "single-threaded mode")
	flag.BoolVar(&inlineSourcesStdin, "inline-sources-stdin", false,
		"read {\"sources\":{relpath:content}} from stdin before the request stream")
	flag.BoolVar(&inlineServer, "inline-server", false,
		"persistent inline-sources server: start with no Program; accept setSources / resetCache ops")
	flag.StringVar(&cacheDir, "cache-dir", "",
		"base directory for the on-disk JIT artifact cache (empty disables)")
	flag.BoolVar(&help, "help", false, "show help")
	flag.BoolVar(&help, "h", false, "show help")
	flag.Parse()

	if help {
		flag.Usage()
		return
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
	// buffered by the JSON decoder past the handshake aren't lost.
	stdinDec := json.NewDecoder(bufio.NewReader(os.Stdin))
	stdoutEnc := json.NewEncoder(os.Stdout)

	resolverOpts := resolver.Options{
		HashLength:        hashLength,
		LiteralHashLength: literalHashLength,
		Marker: marker.Options{
			Name:   markerName,
			Module: markerModule,
		},
		Cwd:            absCwd,
		SingleThreaded: singleThreaded,
		CacheDir:       cacheDir,
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
		serveRequests(r, stdinDec, stdoutEnc)
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
	if outTS != "" {
		if err := writeFile(outTS, func(w io.Writer) error { return runtype.RunTypesModule(w, dump) }); err != nil {
			fatal("out-ts: %v", err)
		}
	}
}

func runOneShot(r *resolver.Resolver, in io.Reader, out io.Writer) {
	serveRequests(r, json.NewDecoder(bufio.NewReader(in)), json.NewEncoder(out))
}

func serveRequests(r *resolver.Resolver, dec *json.Decoder, enc *json.Encoder) {
	for {
		var req protocol.Request
		if err := dec.Decode(&req); err != nil {
			if err == io.EOF {
				break
			}
			_ = enc.Encode(protocol.Response{Error: fmt.Sprintf("decode: %v", err)})
			continue
		}
		resp := r.Dispatch(req)
		if err := enc.Encode(resp); err != nil {
			fatal("encode: %v", err)
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

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Fprintf(os.Stderr, "accept: %v\n", err)
			continue
		}
		go func(c net.Conn) {
			defer c.Close()
			runOneShot(r, c, c)
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
