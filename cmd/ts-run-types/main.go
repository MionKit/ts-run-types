// Command ts-run-types answers compile-time type-reflection queries for
// mion runtypes. It holds a typescript-go Program + checker in memory and
// speaks newline-delimited JSON on stdio, or exposes a single dump mode.
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

	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

const usage = `ts-run-types — compile-time type resolver for mion runtypes

Usage:
    ts-run-types [OPTIONS]

Options:
    --tsconfig PATH     tsconfig.json to load (default: ./tsconfig.json)
    --cwd PATH          working directory (default: $PWD)
    --one-shot          read requests from stdin until EOF, emit dump to stdout
    --daemon            listen on a Unix socket for persistent serving
    --socket PATH       socket path (default: /tmp/ts-run-types.sock)
    --single-threaded   force single-checker mode (useful for tests)
    -h, --help          show help
`

func main() {
	flag.Usage = func() { fmt.Fprint(os.Stderr, usage) }

	var (
		tsconfigPath   string
		cwdFlag        string
		oneShot        bool
		daemon         bool
		socketPath     string
		singleThreaded bool
		help           bool
	)
	flag.StringVar(&tsconfigPath, "tsconfig", "", "tsconfig.json path")
	flag.StringVar(&cwdFlag, "cwd", "", "working directory")
	flag.BoolVar(&oneShot, "one-shot", false, "one-shot stdio mode")
	flag.BoolVar(&daemon, "daemon", false, "daemon Unix-socket mode")
	flag.StringVar(&socketPath, "socket", "/tmp/ts-run-types.sock", "Unix socket path")
	flag.BoolVar(&singleThreaded, "single-threaded", false, "single-threaded mode")
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

	p, err := program.New(program.Options{
		Cwd:            absCwd,
		TsconfigPath:   tsconfigPath,
		SingleThreaded: singleThreaded,
	})
	if err != nil {
		fatal("program: %v", err)
	}

	r, err := resolver.New(p)
	if err != nil {
		fatal("resolver: %v", err)
	}
	defer r.Close()

	switch {
	case daemon:
		runDaemon(r, socketPath)
	case oneShot:
		runOneShot(r, os.Stdin, os.Stdout)
	default:
		// If stdin is attached to a terminal we still default to one-shot — the
		// binary is meant to be driven programmatically.
		runOneShot(r, os.Stdin, os.Stdout)
	}
}

func runOneShot(r *resolver.Resolver, in io.Reader, out io.Writer) {
	dec := json.NewDecoder(bufio.NewReader(in))
	enc := json.NewEncoder(out)

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

	// End-of-stream dump so callers that forgot to request one still get the
	// full table — useful for smoke tests and `bin/ts-run-types < queries`.
	_ = enc.Encode(protocol.Dump{
		Types: r.Cache().Dump(),
	})
}

func runDaemon(r *resolver.Resolver, socketPath string) {
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		fatal("listen: %v", err)
	}
	defer listener.Close()

	fmt.Fprintf(os.Stderr, "ts-run-types daemon listening on %s\n", socketPath)

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

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
