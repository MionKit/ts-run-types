package resolver

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/walker"
)

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
// scopedDump uses for IncludeRunTypes / IncludeCacheSources.
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
