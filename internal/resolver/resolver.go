// Package resolver dispatches type-query operations against a Program's
// checker pool. It is the glue between the stdio protocol, the AST walker,
// and the type serializer.
package resolver

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/emit"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/serialize"
	"github.com/mionkit/ts-run-types/internal/walker"
)

// Options controls the resolver's hash budget and the marker-detection
// parameters threaded through to scanFiles.
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
// setSources op to install a Program, then serve scanFiles / dump as normal.
// Subsequent setSources calls swap the Program in place — the structural
// type cache survives across swaps so dedup IDs stay stable.
type Resolver struct {
	Program     *program.Program
	cache       *serialize.Cache
	checker     *checker.Checker
	releaseLease func()
	sites       []protocol.Site
	marker      marker.Options
	opts        Options
}

// New builds a Resolver against prog. Defaults to hashid's default lengths when
// HashLength / LiteralHashLength are zero.
func New(prog *program.Program, opts Options) (*Resolver, error) {
	if prog == nil || prog.TS == nil {
		return nil, errors.New("resolver.New: program is nil")
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		releaseLease()
		return nil, errors.New("resolver.New: no checker available")
	}
	return &Resolver{
		Program: prog,
		cache: serialize.NewCache(typeChecker, serialize.Options{
			HashLength:        opts.HashLength,
			LiteralHashLength: opts.LiteralHashLength,
		}),
		checker:      typeChecker,
		releaseLease: releaseLease,
		marker:       marker.WithDefaults(opts.Marker),
		opts:         opts,
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
// leases a new one from prog, rebinds the cache, and resets the sites slice
// (positions are tied to the old source text). The cache's structural dedup
// table survives the swap so equivalent types reuse their ids.
func (resolver *Resolver) SetProgram(prog *program.Program) error {
	if prog == nil || prog.TS == nil {
		return errors.New("resolver.SetProgram: program is nil")
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		releaseLease()
		return errors.New("resolver.SetProgram: no checker available")
	}
	if resolver.releaseLease != nil {
		resolver.releaseLease()
	}
	resolver.Program = prog
	resolver.checker = typeChecker
	resolver.releaseLease = releaseLease
	resolver.cache.Rebind(typeChecker)
	resolver.sites = resolver.sites[:0]
	return nil
}

// Reset wipes ALL user-supplied resolver state: every interned Type, the
// sites list, the Program, the checker lease, and (because the overlay
// lives inside the Program) the in-memory source map. Equivalent to
// throwing the Resolver away and replacing it with a fresh NewServer —
// except the goroutine / connection stays open. After reset, the resolver
// requires a new setSources before scanFiles will work.
//
// Lib files (lib.d.ts, bundled tsgo declarations) live behind the
// cachedvfs layer in program.New / program.NewInferred — they are byte-
// cached at the FS level and are NOT re-read from disk on the next
// setSources. Only the user's overlay + parsed-AST state is discarded here.
func (resolver *Resolver) Reset() {
	if resolver.releaseLease != nil {
		resolver.releaseLease()
		resolver.releaseLease = nil
	}
	resolver.Program = nil
	resolver.checker = nil
	resolver.cache.Clear()
	resolver.cache.Rebind(nil)
	resolver.sites = resolver.sites[:0]
}

func (resolver *Resolver) Close() {
	if resolver.releaseLease != nil {
		resolver.releaseLease()
		resolver.releaseLease = nil
	}
}

func (resolver *Resolver) Cache() *serialize.Cache { return resolver.cache }

// Sites returns the running list of resolved call-site ids. Callers (CLI,
// plugin) read this at end-of-build to write out the manifest.
func (resolver *Resolver) Sites() []protocol.Site {
	return append([]protocol.Site(nil), resolver.sites...)
}

// Dispatch routes a request to the correct handler.
func (resolver *Resolver) Dispatch(request protocol.Request) protocol.Response {
	before := resolver.cache.Size()
	switch request.Op {
	case protocol.OpScanFiles:
		if resolver.Program == nil {
			return protocol.Response{Error: "scanFiles: no Program loaded — call setSources first"}
		}
		if len(request.Files) == 0 {
			return protocol.Response{Error: "scanFiles: files is required and must be non-empty"}
		}
		sites, err := resolver.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		response := protocol.Response{Sites: sites, Added: resolver.cache.Added(before)}
		if request.IncludeRunTypes || request.IncludeCacheSource {
			scoped := resolver.scopedDump(request.Files)
			if request.IncludeRunTypes {
				response.RunTypes = scoped.RunTypes
			}
			if request.IncludeCacheSource {
				rendered, renderErr := renderModule(scoped)
				if renderErr != nil {
					return protocol.Response{Error: renderErr.Error()}
				}
				response.CacheSource = rendered
			}
		}
		return response
	case protocol.OpDump:
		fullDump := protocol.Dump{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.Sites(),
		}
		rendered, renderErr := renderModule(fullDump)
		if renderErr != nil {
			return protocol.Response{Error: renderErr.Error()}
		}
		return protocol.Response{
			RunTypes:    fullDump.RunTypes,
			Sites:       fullDump.Sites,
			CacheSource: rendered,
		}
	case protocol.OpSetSources:
		if err := resolver.dispatchSetSources(request.Sources); err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{OK: true}
	case protocol.OpReset:
		resolver.Reset()
		return protocol.Response{OK: true}
	case protocol.OpResolveID:
		runType := resolver.ResolveID(request.ID)
		if runType == nil {
			return protocol.Response{}
		}
		return protocol.Response{RunTypes: []*protocol.RunType{runType}}
	default:
		return protocol.Response{Error: "unknown op: " + request.Op}
	}
}

// ResolveID returns the canonical full Type for id, or nil if no such id
// has been interned. Child slots inside the returned Type remain KindRef
// sentinels — callers re-issue ResolveID per id to drill in.
func (resolver *Resolver) ResolveID(id string) *protocol.RunType {
	if id == "" {
		return nil
	}
	return resolver.cache.NodeByID(id)
}

// dispatchSetSources builds an inferred Program from the supplied overlay
// and swaps it into the resolver. Relative file names are resolved against
// the working directory the resolver's previous Program had (or, on first
// call before any Program exists, against os.Getwd at start — but we don't
// have that here; main passes an absCwd via Options for server mode).
func (resolver *Resolver) dispatchSetSources(sources map[string]string) error {
	if sources == nil {
		sources = map[string]string{}
	}
	cwd := resolver.opts.Cwd
	if cwd == "" && resolver.Program != nil {
		cwd = resolver.Program.TS.GetCurrentDirectory()
	}
	if cwd == "" {
		return errors.New("setSources: no cwd configured")
	}
	cwd = tspath.NormalizePath(cwd)
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	for relativePath, content := range sources {
		absolutePath := tspath.ResolvePath(cwd, relativePath)
		overlay[absolutePath] = content
		fileNames = append(fileNames, absolutePath)
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: resolver.opts.SingleThreaded,
		Overlay:        overlay,
	}, fileNames)
	if err != nil {
		return fmt.Errorf("setSources: %w", err)
	}
	return resolver.SetProgram(prog)
}

func (resolver *Resolver) sourceFile(file string) (*ast.SourceFile, error) {
	absolutePath := tspath.ResolvePath(resolver.Program.TS.GetCurrentDirectory(), file)
	sourceFile := resolver.Program.SourceFile(absolutePath)
	if sourceFile == nil {
		return nil, fmt.Errorf("source file not in program: %s", absolutePath)
	}
	return sourceFile, nil
}

// dispatchScanFiles walks every CallExpression in each requested file and
// returns one Site per call whose resolved signature has a trailing
// `RuntypeId<T>` parameter (where T is concretely bound). Sites for every
// file are returned flat, each tagged with .File so callers can filter.
//
// After each per-file scan, recordFileIDs walks the sites' RunType graphs
// and notes the reached wire ids against that file in the cache's per-file
// scope map. The map drives the per-request projection that
// scopedDump uses for IncludeRunTypes / IncludeCacheSource.
func (resolver *Resolver) dispatchScanFiles(files []string) ([]protocol.Site, error) {
	var sites []protocol.Site
	for _, file := range files {
		sourceFile, err := resolver.sourceFile(file)
		if err != nil {
			return nil, err
		}
		fileStart := len(sites)
		walker.ForEachCallExpression(sourceFile, func(call *ast.Node) bool {
			site, ok := resolver.scanCall(file, call)
			if ok {
				sites = append(sites, site)
				resolver.sites = append(resolver.sites, site)
			}
			return true
		})
		resolver.recordFileIDs(file, sites[fileStart:])
	}
	return sites, nil
}

// scanCall inspects one call expression and returns a Site when its
// resolved signature opts into transformer injection via a trailing
// `RuntypeId<T>` parameter with a concretely-bound T.
func (resolver *Resolver) scanCall(file string, call *ast.Node) (protocol.Site, bool) {
	signature := checker.Checker_getResolvedSignature(resolver.checker, call, nil, 0)
	if signature == nil {
		return protocol.Site{}, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return protocol.Site{}, false
	}
	lastIndex := len(parameters) - 1
	lastParam := parameters[lastIndex]
	if lastParam == nil {
		return protocol.Site{}, false
	}
	paramType := checker.Checker_getTypeOfSymbol(resolver.checker, lastParam)
	typeArgument, matched := marker.Detect(paramType, resolver.marker)
	if !matched {
		return protocol.Site{}, false
	}
	if marker.IsFreeTypeParameter(typeArgument) {
		// Call inside a generic wrapper body — `T` is the wrapper's own
		// free type parameter. Skip: no id to inject until the wrapper
		// is itself instantiated at its own call sites.
		return protocol.Site{}, false
	}
	argsCount := 0
	if callExpression := call.AsCallExpression(); callExpression != nil && callExpression.Arguments != nil {
		argsCount = len(callExpression.Arguments.Nodes)
	}
	// Caller has already placed an argument at (or past) the id slot.
	// Never override an explicit pass-through — leave the call untouched.
	if argsCount > lastIndex {
		return protocol.Site{}, false
	}
	// Regex-literal harvest: if we can trace the call to a regex-literal
	// source expression, synthesize a KindLiteral{regexp} entry instead of
	// resolving typeArgument through the type system. TS has no regex-literal type,
	// so this is the only path that produces literal-kind regex entries.
	id := ""
	if source, flags, ok := resolver.resolveRegexLiteralSource(call, lastIndex, argsCount); ok {
		id = resolver.cache.SerializeRegexLiteral(source, flags)
	} else {
		id = resolver.cache.AssignID(typeArgument)
	}
	// call.End() is exclusive (one past the closing `)`). Pos at End()-1 is
	// the closing-paren offset where the TS-side patcher inserts.
	pos := call.End() - 1
	return protocol.Site{
		File:       file,
		Pos:        pos,
		ID:         id,
		ParamIndex: lastIndex,
		ArgsCount:  argsCount,
	}, true
}

// resolveRegexLiteralSource attempts to harvest a regex-literal source from
// the call's argument or type-argument expression. Returns (source, flags, true)
// when a regex literal is reachable; (_, _, false) otherwise — in which case
// the caller falls through to standard type-based resolution.
//
// Two entry points:
//   - reflect form  (argsCount > 0)   — look at the single value argument
//   - static form   (argsCount == 0)  — look at the first type argument (must be `typeof <id>`)
//
// The trace itself: unwrap `as` / parenthesised expressions, then either
// harvest a RegularExpressionLiteral directly, recurse through a TypeQuery,
// or resolve an Identifier to its const variable declaration's initializer.
func (resolver *Resolver) resolveRegexLiteralSource(call *ast.Node, paramIndex, argsCount int) (string, string, bool) {
	callExpression := call.AsCallExpression()
	if callExpression == nil {
		return "", "", false
	}
	var node *ast.Node
	switch {
	case argsCount > 0 && argsCount == paramIndex:
		// Reflect form: T is inferred from the value at slot 0.
		if callExpression.Arguments != nil && len(callExpression.Arguments.Nodes) > 0 {
			node = callExpression.Arguments.Nodes[0]
		}
	case argsCount == 0 && paramIndex == 0:
		// Static form: T is the first type argument.
		if callExpression.TypeArguments != nil && len(callExpression.TypeArguments.Nodes) > 0 {
			node = callExpression.TypeArguments.Nodes[0]
		}
	}
	if node == nil {
		return "", "", false
	}
	return resolver.traceRegexLiteral(node, 0)
}

// traceRegexLiteral walks through AST wrappers, typeof references, and const
// identifier bindings looking for a regex literal at the leaf. Depth-limited
// to defend against pathological inputs the type checker would otherwise
// reject (TS forbids self-referential initializers, but a defensive cap keeps
// the resolver predictable).
func (resolver *Resolver) traceRegexLiteral(node *ast.Node, depth int) (string, string, bool) {
	if node == nil || depth > 16 {
		return "", "", false
	}
	// Unwrap a single layer of `as T` / parens.
	for {
		switch node.Kind {
		case ast.KindAsExpression:
			asExpression := node.AsAsExpression()
			if asExpression == nil {
				return "", "", false
			}
			node = asExpression.Expression
		case ast.KindParenthesizedExpression:
			parenExpression := node.AsParenthesizedExpression()
			if parenExpression == nil {
				return "", "", false
			}
			node = parenExpression.Expression
		default:
			goto unwrapped
		}
		if node == nil {
			return "", "", false
		}
	}
unwrapped:
	switch node.Kind {
	case ast.KindRegularExpressionLiteral:
		literal := node.AsRegularExpressionLiteral()
		if literal == nil {
			return "", "", false
		}
		source, flags := splitRegexLiteralText(literal.Text)
		return source, flags, true
	case ast.KindTypeQuery:
		typeQuery := node.AsTypeQueryNode()
		if typeQuery == nil {
			return "", "", false
		}
		return resolver.traceRegexLiteral(typeQuery.ExprName, depth+1)
	case ast.KindIdentifier:
		symbol := resolver.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return "", "", false
		}
		for _, declaration := range symbol.Declarations {
			if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
				continue
			}
			// Only `const` bindings are traceable: `let`/`var` can be
			// reassigned, so the initializer no longer determines the value
			// at the call site.
			parent := declaration.Parent
			if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
				continue
			}
			variableDecl := declaration.AsVariableDeclaration()
			if variableDecl == nil || variableDecl.Initializer == nil {
				continue
			}
			return resolver.traceRegexLiteral(variableDecl.Initializer, depth+1)
		}
	}
	return "", "", false
}

// recordFileIDs walks every RunType transitively reachable from `sites` and
// notes the visited wire ids against `file` in the per-file scope map. The
// resulting map drives the "scanned files" semantics for IncludeRunTypes /
// IncludeCacheSource — see scopedDump.
func (resolver *Resolver) recordFileIDs(file string, sites []protocol.Site) {
	if file == "" || len(sites) == 0 {
		return
	}
	visited := make(map[string]struct{})
	var walk func(id string)
	walk = func(id string) {
		if id == "" {
			return
		}
		if _, seen := visited[id]; seen {
			return
		}
		visited[id] = struct{}{}
		resolver.cache.RecordFileID(file, id)
		node := resolver.cache.NodeByID(id)
		if node == nil {
			return
		}
		// Walk every ref-carrying slot. Inline scalar RunTypes (no .ID) don't
		// reach further nodes, so following them is safe but pointless —
		// RecordFileID is a no-op for empty ids anyway.
		if node.Child != nil {
			walk(node.Child.ID)
		}
		if node.Index != nil {
			walk(node.Index.ID)
		}
		if node.Return != nil {
			walk(node.Return.ID)
		}
		if node.IndexT != nil {
			walk(node.IndexT.ID)
		}
		for _, child := range node.Children {
			if child != nil {
				walk(child.ID)
			}
		}
		for _, parameter := range node.Parameters {
			if parameter != nil {
				walk(parameter.ID)
			}
		}
		for _, typeArgument := range node.TypeArguments {
			if typeArgument != nil {
				walk(typeArgument.ID)
			}
		}
		for _, argument := range node.Arguments {
			if argument != nil {
				walk(argument.ID)
			}
		}
		for _, extendsArgument := range node.ExtendsArguments {
			if extendsArgument != nil {
				walk(extendsArgument.ID)
			}
		}
		for _, implement := range node.Implements {
			if implement != nil {
				walk(implement.ID)
			}
		}
		// Decorators — surviving object-literal types from a collapsed
		// `primitive & {brand}` intersection. Reachable from the
		// branded primitive node, not from any structural slot, so the
		// walker has to follow them explicitly or the brand object
		// disappears from the per-file projection.
		for _, decorator := range node.Decorators {
			if decorator != nil {
				walk(decorator.ID)
			}
		}
		// SafeUnionChildren — same ref objects as Children (already
		// walked), but follow explicitly for safety in case any future
		// pass surfaces nodes here that Children misses.
		for _, child := range node.SafeUnionChildren {
			if child != nil {
				walk(child.ID)
			}
		}
	}
	for _, site := range sites {
		walk(site.ID)
	}
}

// scopedDump builds a protocol.Dump covering only the supplied files —
// the request's per-call projection, not a session-wide accumulation.
// RunTypes are sorted by id (cache guarantees) and sites are filtered to
// the same file allowlist. Callers wanting the full in-memory cache use
// dispatchDump instead.
func (resolver *Resolver) scopedDump(files []string) protocol.Dump {
	ids := resolver.cache.IDsForUnion(files)
	runTypes := resolver.cache.NodesForIDs(ids)
	allowed := make(map[string]struct{}, len(files))
	for _, file := range files {
		allowed[file] = struct{}{}
	}
	sites := make([]protocol.Site, 0, len(resolver.sites))
	for _, site := range resolver.sites {
		if _, ok := allowed[site.File]; ok {
			sites = append(sites, site)
		}
	}
	return protocol.Dump{RunTypes: runTypes, Sites: sites}
}

// renderModule emits the JS cache module for dump to a string. The emit
// layer is the single source of truth; the plugin no longer renders the
// module on the JS side.
func renderModule(dump protocol.Dump) (string, error) {
	var buf bytes.Buffer
	if err := emit.RunTypesModule(&buf, dump); err != nil {
		return "", fmt.Errorf("renderModule: %w", err)
	}
	return buf.String(), nil
}

// splitRegexLiteralText converts the raw RegExp literal text (e.g. "/abc/i")
// into its source ("abc") and flags ("i"). The text always starts with `/`,
// ends with `/<flags>`, and flags never contain `/`.
func splitRegexLiteralText(text string) (source, flags string) {
	if !strings.HasPrefix(text, "/") {
		return text, ""
	}
	body := text[1:]
	lastSlash := strings.LastIndex(body, "/")
	if lastSlash < 0 {
		return body, ""
	}
	return body[:lastSlash], body[lastSlash+1:]
}
