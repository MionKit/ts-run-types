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
	// Extract any literal RunTypeOptions object passed at a slot before
	// the id slot. Today only `noLiterals: true` is honored; other
	// fields are reserved (see createIsType.ts RunTypeOptions). Options
	// are folded into the id hash by swapping the resolved type below,
	// so `(T, {})` and `(T, {noLiterals: true})` resolve distinct ids.
	options := extractRunTypeOptions(call, lastIndex, argsCount)
	// noLiterals semantics (literal.ts:28-54): the literal node swaps to
	// its base-kind runtype for validation purposes. We mirror this at
	// resolver time by walking the literal type up to its base type
	// before assigning the id — the existing emit code then handles
	// the base kind unchanged, no per-arm noLiterals branching needed.
	//
	// Two escape hatches are needed because tsgo's
	// getBaseTypeOfLiteralType doesn't cover them:
	//   1. Unique ESSymbol → plain symbol (KindSymbol). tsgo returns
	//      the type unchanged for TypeFlagsUniqueESSymbol because
	//      there's no `c.esSymbolType` lookup in that switch arm.
	//   2. Regex-literal harvest is suppressed here so a `typeof reg`
	//      with `reg = /abc/i` resolves through the normal type-checker
	//      path to the generic RegExp class (KindRegexp).
	id := ""
	if options.NoLiterals {
		flags := checker.Type_flags(typeArgument)
		if flags&checker.TypeFlagsUniqueESSymbol != 0 {
			// Escape hatch #1.
			id = resolver.cache.SerializeAtomicKind(protocol.KindSymbol)
		} else {
			typeArgument = checker.Checker_getBaseTypeOfLiteralType(resolver.checker, typeArgument)
		}
	}
	if id == "" && !options.NoLiterals {
		// Regex-literal harvest — TS has no regex-literal type, so the
		// marker scanner reconstructs one from the AST when it can.
		if source, flags, ok := resolver.resolveRegexLiteralSource(call, lastIndex, argsCount); ok {
			id = resolver.cache.SerializeRegexLiteral(source, flags)
		}
	}
	if id == "" {
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
// Dispatch rule (now signature-shape-agnostic, since marker functions
// can have user-options slots between the value/type and the id):
//   - If TypeArguments has nodes → static form. Harvest from the first
//     type argument. Works for any signature whose user supplied <T>
//     explicitly, regardless of how many value args came before the id.
//   - Else if a reflect-form pattern applies (the value at the slot the
//     id occupies came from the user, paramIndex==argsCount-1 layout
//     for `reflectRuntypeId(value)`) → harvest from Arguments[paramIndex].
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
	case callExpression.TypeArguments != nil && len(callExpression.TypeArguments.Nodes) > 0:
		// Static form: user supplied <T> explicitly. Use that node
		// regardless of how many value args were passed (those are
		// user options, not T).
		node = callExpression.TypeArguments.Nodes[0]
	case argsCount > 0 && argsCount == paramIndex:
		// Reflect form: T inferred from the value at slot
		// (paramIndex-1) — the last user value before the id slot.
		if callExpression.Arguments != nil && len(callExpression.Arguments.Nodes) >= argsCount {
			node = callExpression.Arguments.Nodes[argsCount-1]
		}
	}
	if node == nil {
		return "", "", false
	}
	return resolver.traceRegexLiteral(node, 0)
}

// runTypeOptions mirrors the JS-side RunTypeOptions interface
// (packages/ts-go-run-types/src/createIsType.ts). Resolver-side
// representation is a Go struct so the rest of the pipeline can read
// fields without re-walking the AST.
type runTypeOptions struct {
	NoLiterals bool
}

// extractRunTypeOptions reads literal options from the first argument
// of a marker call when the signature has a `RunTypeOptions` slot
// before the id slot. The argument must be an object literal — variable
// references / spreads / function calls are ignored (return zero
// options) because the resolver runs at build time and can't evaluate
// arbitrary expressions. This matches mion's compile-time-baked
// options model (baseRunTypes.ts:82-86 hashes options into the JIT
// cache key).
//
// Layout convention: when the trailing param is `id?: RuntypeId<T>` at
// `lastIndex`, slot 0 is reserved for options. We harvest from
// args[0] specifically. Functions whose options live elsewhere would
// need a different harvest rule — none exist today.
func extractRunTypeOptions(call *ast.Node, lastIndex, argsCount int) runTypeOptions {
	var opts runTypeOptions
	// Options live before the id slot. If lastIndex==0 the function
	// has no options param at all (e.g. getRuntypeId<T>(id?)).
	if lastIndex == 0 || argsCount == 0 {
		return opts
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		return opts
	}
	if len(callExpression.Arguments.Nodes) == 0 {
		return opts
	}
	first := callExpression.Arguments.Nodes[0]
	if first == nil || first.Kind != ast.KindObjectLiteralExpression {
		return opts
	}
	objectLiteral := first.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return opts
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil || property.Kind != ast.KindPropertyAssignment {
			continue
		}
		propertyAssignment := property.AsPropertyAssignment()
		if propertyAssignment == nil {
			continue
		}
		name := propertyAssignment.Name()
		if name == nil {
			continue
		}
		initializer := propertyAssignment.Initializer
		if initializer == nil {
			continue
		}
		switch name.Text() {
		case "noLiterals":
			if initializer.Kind == ast.KindTrueKeyword {
				opts.NoLiterals = true
			}
		}
	}
	return opts
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
