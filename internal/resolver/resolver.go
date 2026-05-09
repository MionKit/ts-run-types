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
	// `RuntypeId` from `@mionjs/ts-run-types`.
	Marker marker.Options
}

// Resolver owns a Program and answers type queries against it. The serializer
// cache is shared across queries so type ids stay stable in a single dump.
type Resolver struct {
	Program *program.Program
	cache   *serialize.Cache
	checker *checker.Checker
	done    func()
	sites   []protocol.Site
	marker  marker.Options
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
	}, nil
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
	default:
		return protocol.Response{Error: "unknown op: " + req.Op}
	}
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
