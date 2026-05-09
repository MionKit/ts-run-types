// Package resolver dispatches type-query operations against a Program's
// checker pool. It is the glue between the stdio protocol, the AST walker,
// and the type serializer.
package resolver

import (
	"context"
	"errors"
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/serialize"
	"github.com/mionkit/ts-run-types/internal/walker"
)

// Options controls the resolver's hash budget and the marker-detection
// parameters threaded through to scanFile.
type Options struct {
	HashLength        int
	LiteralHashLength int
	// Marker selects which type alias the scanner treats as the
	// transformer's id-injection sentinel. Zero values default to
	// `RuntypeId` from `@mionjs/ts-go-run-types`.
	Marker marker.Options
	// Cwd is the working directory used when SetSources builds an inferred
	// Program. Required for server-mode resolvers; ignored when a Program
	// is supplied to New(). When unset, SetSources falls back to the
	// existing Program's GetCurrentDirectory.
	Cwd string
	// SingleThreaded forces single-checker mode on Programs built by
	// SetSources. Mirrors program.Options.SingleThreaded.
	SingleThreaded bool
}

// Resolver owns a Program and answers type queries against it. The serializer
// cache is shared across queries so type ids stay stable in a single dump.
//
// Program-less resolvers (built via NewServer) are valid: they accept the
// setSources op to install a Program, then serve scanFile / dump as normal.
// Subsequent setSources calls swap the Program in place — the structural
// type cache survives across swaps so dedup IDs stay stable.
type Resolver struct {
	Program *program.Program
	cache   *serialize.Cache
	checker *checker.Checker
	done    func()
	sites   []protocol.Site
	marker  marker.Options
	opts    Options
}

// New builds a Resolver against p. Defaults to hashid's default lengths when
// HashLength / LiteralHashLength are zero.
func New(p *program.Program, opts Options) (*Resolver, error) {
	if p == nil || p.TS == nil {
		return nil, errors.New("resolver.New: program is nil")
	}
	c, done := p.TS.GetTypeChecker(context.Background())
	if c == nil {
		done()
		return nil, errors.New("resolver.New: no checker available")
	}
	return &Resolver{
		Program: p,
		cache: serialize.NewCache(c, serialize.Options{
			HashLength:        opts.HashLength,
			LiteralHashLength: opts.LiteralHashLength,
		}),
		checker: c,
		done:    done,
		marker:  marker.WithDefaults(opts.Marker),
		opts:    opts,
	}, nil
}

// NewServer builds a Resolver with no Program. Callers (the --inline-server
// CLI path) install one later via the setSources op. The cache is created
// up front with a nil checker; Rebind is called on first SetProgram.
func NewServer(opts Options) *Resolver {
	return &Resolver{
		cache: serialize.NewCache(nil, serialize.Options{
			HashLength:        opts.HashLength,
			LiteralHashLength: opts.LiteralHashLength,
		}),
		marker: marker.WithDefaults(opts.Marker),
		opts:   opts,
	}
}

// SetProgram swaps the underlying Program. Releases the previous checker,
// leases a new one from p, rebinds the cache, and resets the sites slice
// (positions are tied to the old source text). The cache's structural dedup
// table survives the swap so equivalent types reuse their ids.
func (r *Resolver) SetProgram(p *program.Program) error {
	if p == nil || p.TS == nil {
		return errors.New("resolver.SetProgram: program is nil")
	}
	c, done := p.TS.GetTypeChecker(context.Background())
	if c == nil {
		done()
		return errors.New("resolver.SetProgram: no checker available")
	}
	if r.done != nil {
		r.done()
	}
	r.Program = p
	r.checker = c
	r.done = done
	r.cache.Rebind(c)
	r.sites = r.sites[:0]
	return nil
}

// Reset wipes ALL user-supplied resolver state: every interned Type, the
// sites list, the Program, the checker lease, and (because the overlay
// lives inside the Program) the in-memory source map. Equivalent to
// throwing the Resolver away and replacing it with a fresh NewServer —
// except the goroutine / connection stays open. After reset, the resolver
// requires a new setSources before scanFile will work.
//
// Lib files (lib.d.ts, bundled tsgo declarations) live behind the
// cachedvfs layer in program.New / program.NewInferred — they are byte-
// cached at the FS level and are NOT re-read from disk on the next
// setSources. Only the user's overlay + parsed-AST state is discarded here.
func (r *Resolver) Reset() {
	if r.done != nil {
		r.done()
		r.done = nil
	}
	r.Program = nil
	r.checker = nil
	r.cache.Clear()
	r.cache.Rebind(nil)
	r.sites = r.sites[:0]
}

func (r *Resolver) Close() {
	if r.done != nil {
		r.done()
		r.done = nil
	}
}

func (r *Resolver) Cache() *serialize.Cache { return r.cache }

// Sites returns the running list of resolved call-site ids. Callers (CLI,
// plugin) read this at end-of-build to write out the manifest.
func (r *Resolver) Sites() []protocol.Site {
	return append([]protocol.Site(nil), r.sites...)
}

// Dispatch routes a request to the correct handler.
func (r *Resolver) Dispatch(req protocol.Request) protocol.Response {
	before := r.cache.Size()
	switch req.Op {
	case protocol.OpScanFile:
		if r.Program == nil {
			return protocol.Response{Error: "scanFile: no Program loaded — call setSources first"}
		}
		sites, err := r.dispatchScanFile(req.File)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{Sites: sites, Added: r.cache.Added(before)}
	case protocol.OpDump:
		return protocol.Response{
			Types: r.cache.Dump(),
			Sites: r.Sites(),
		}
	case protocol.OpSetSources:
		if err := r.dispatchSetSources(req.Sources); err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{OK: true}
	case protocol.OpReset:
		r.Reset()
		return protocol.Response{OK: true}
	default:
		return protocol.Response{Error: "unknown op: " + req.Op}
	}
}

// dispatchSetSources builds an inferred Program from the supplied overlay
// and swaps it into the resolver. Relative file names are resolved against
// the working directory the resolver's previous Program had (or, on first
// call before any Program exists, against os.Getwd at start — but we don't
// have that here; main passes an absCwd via Options for server mode).
func (r *Resolver) dispatchSetSources(sources map[string]string) error {
	if sources == nil {
		sources = map[string]string{}
	}
	cwd := r.opts.Cwd
	if cwd == "" && r.Program != nil {
		cwd = r.Program.TS.GetCurrentDirectory()
	}
	if cwd == "" {
		return errors.New("setSources: no cwd configured")
	}
	cwd = tspath.NormalizePath(cwd)
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	for rel, content := range sources {
		abs := tspath.ResolvePath(cwd, rel)
		overlay[abs] = content
		fileNames = append(fileNames, abs)
	}
	p, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: r.opts.SingleThreaded,
		Overlay:        overlay,
	}, fileNames)
	if err != nil {
		return fmt.Errorf("setSources: %w", err)
	}
	return r.SetProgram(p)
}

func (r *Resolver) sourceFile(file string) (*ast.SourceFile, error) {
	abs := tspath.ResolvePath(r.Program.TS.GetCurrentDirectory(), file)
	sf := r.Program.SourceFile(abs)
	if sf == nil {
		return nil, fmt.Errorf("source file not in program: %s", abs)
	}
	return sf, nil
}

// dispatchScanFile walks every CallExpression in file and returns one Site
// per call whose resolved signature has a trailing `RuntypeId<T>` parameter
// (where T is concretely bound). The transformer reads the returned sites
// and patches each call to pass the corresponding id at the trailing slot.
func (r *Resolver) dispatchScanFile(file string) ([]protocol.Site, error) {
	sf, err := r.sourceFile(file)
	if err != nil {
		return nil, err
	}
	var sites []protocol.Site
	walker.ForEachCallExpression(sf, func(call *ast.Node) bool {
		site, ok := r.scanCall(file, call)
		if ok {
			sites = append(sites, site)
			r.sites = append(r.sites, site)
		}
		return true
	})
	return sites, nil
}

// scanCall inspects one call expression and returns a Site when its
// resolved signature opts into transformer injection via a trailing
// `RuntypeId<T>` parameter with a concretely-bound T.
func (r *Resolver) scanCall(file string, call *ast.Node) (protocol.Site, bool) {
	sig := checker.Checker_getResolvedSignature(r.checker, call, nil, 0)
	if sig == nil {
		return protocol.Site{}, false
	}
	params := checker.Signature_parameters(sig)
	if len(params) == 0 {
		return protocol.Site{}, false
	}
	lastIdx := len(params) - 1
	last := params[lastIdx]
	if last == nil {
		return protocol.Site{}, false
	}
	paramType := checker.Checker_getTypeOfSymbol(r.checker, last)
	tArg, matched := marker.Detect(paramType, r.marker)
	if !matched {
		return protocol.Site{}, false
	}
	if marker.IsFreeTypeParameter(tArg) {
		// Call inside a generic wrapper body — `T` is the wrapper's own
		// free type parameter. Skip: no id to inject until the wrapper
		// is itself instantiated at its own call sites.
		return protocol.Site{}, false
	}
	id := r.cache.AssignID(tArg)
	// call.End() is exclusive (one past the closing `)`). Pos at End()-1 is
	// the closing-paren offset where the TS-side patcher inserts.
	pos := call.End() - 1
	argsCount := 0
	if ce := call.AsCallExpression(); ce != nil && ce.Arguments != nil {
		argsCount = len(ce.Arguments.Nodes)
	}
	return protocol.Site{
		File:       file,
		Pos:        pos,
		ID:         id,
		ParamIndex: lastIdx,
		ArgsCount:  argsCount,
	}, true
}
