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
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/serialize"
	"github.com/mionkit/ts-run-types/internal/walker"
)

// Resolver owns a Program and answers type queries against it. The serializer
// cache is shared across queries so type ids stay stable in a single dump.
type Resolver struct {
	Program *program.Program
	cache   *serialize.Cache
	checker *checker.Checker
	done    func()
	sites   []protocol.Site
}

func New(p *program.Program) (*Resolver, error) {
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
		cache:   serialize.NewCache(),
		checker: c,
		done:    done,
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
	case "resolveAnnotation":
		id, err := r.resolveAnnotation(req.File, req.Pos)
		return respond(id, err, r.cache.Added(before))
	case "resolveSymbol":
		id, err := r.resolveSymbol(req.File, req.Pos)
		return respond(id, err, r.cache.Added(before))
	case "resolveTypeArgument":
		id, err := r.resolveTypeArgument(req.File, req.CallPos, req.Index)
		return respond(id, err, r.cache.Added(before))
	case "resolveArgumentInferred":
		id, err := r.resolveArgumentInferred(req.File, req.CallPos, req.Index)
		return respond(id, err, r.cache.Added(before))
	case "dump":
		return protocol.Response{
			Types: r.cache.Dump(),
			Sites: r.Sites(),
		}
	default:
		return protocol.Response{Error: "unknown op: " + req.Op}
	}
}

func respond(id int, err error, added []*protocol.Type) protocol.Response {
	if err != nil {
		return protocol.Response{Error: err.Error()}
	}
	return protocol.Response{ID: id, HasID: true, Added: added}
}

func (r *Resolver) sourceFile(file string) (*ast.SourceFile, error) {
	abs := tspath.ResolvePath(r.Program.TS.GetCurrentDirectory(), file)
	sf := r.Program.SourceFile(abs)
	if sf == nil {
		return nil, fmt.Errorf("source file not in program: %s", abs)
	}
	return sf, nil
}

// recordSite stores a resolved id under (file, pos) for the manifest. The
// numeric id is the canonical identifier used by all downstream consumers.
func (r *Resolver) recordSite(file string, pos int, ref *protocol.Type) int {
	id := ref.ID
	r.sites = append(r.sites, protocol.Site{File: file, Pos: pos, ID: id})
	return id
}

func (r *Resolver) resolveAnnotation(file string, pos int) (int, error) {
	sf, err := r.sourceFile(file)
	if err != nil {
		return 0, err
	}
	node := walker.NodeAt(sf, pos)
	if node == nil {
		return 0, fmt.Errorf("no node at %s:%d", file, pos)
	}
	t := r.checker.GetTypeFromTypeNode(node)
	if t == nil {
		return 0, fmt.Errorf("node at %s:%d is not a type node", file, pos)
	}
	return r.recordSite(file, pos, r.cache.Serialize(r.checker, t)), nil
}

func (r *Resolver) resolveSymbol(file string, pos int) (int, error) {
	sf, err := r.sourceFile(file)
	if err != nil {
		return 0, err
	}
	node := walker.NodeAt(sf, pos)
	if node == nil {
		return 0, fmt.Errorf("no node at %s:%d", file, pos)
	}
	t := r.checker.GetTypeAtLocation(node)
	return r.recordSite(file, pos, r.cache.Serialize(r.checker, t)), nil
}

func (r *Resolver) resolveTypeArgument(file string, callPos, idx int) (int, error) {
	sf, err := r.sourceFile(file)
	if err != nil {
		return 0, err
	}
	call := walker.CallExpressionAt(sf, callPos)
	if call == nil {
		return 0, fmt.Errorf("no CallExpression at %s:%d", file, callPos)
	}
	ce := call.AsCallExpression()
	if ce.TypeArguments == nil || len(ce.TypeArguments.Nodes) <= idx {
		return 0, fmt.Errorf("no type argument %d at %s:%d", idx, file, callPos)
	}
	typeNode := ce.TypeArguments.Nodes[idx]
	t := r.checker.GetTypeFromTypeNode(typeNode)
	return r.recordSite(file, callPos, r.cache.Serialize(r.checker, t)), nil
}

func (r *Resolver) resolveArgumentInferred(file string, callPos, idx int) (int, error) {
	sf, err := r.sourceFile(file)
	if err != nil {
		return 0, err
	}
	call := walker.CallExpressionAt(sf, callPos)
	if call == nil {
		return 0, fmt.Errorf("no CallExpression at %s:%d", file, callPos)
	}
	ce := call.AsCallExpression()
	if ce.Arguments == nil || len(ce.Arguments.Nodes) <= idx {
		return 0, fmt.Errorf("no argument %d at %s:%d", idx, file, callPos)
	}
	argNode := ce.Arguments.Nodes[idx]
	t := r.checker.GetTypeAtLocation(argNode)
	return r.recordSite(file, callPos, r.cache.Serialize(r.checker, t)), nil
}
