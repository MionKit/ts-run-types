package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// AnonymousNamespace is the reserved pure-fn namespace every anonymous
// `registerAnonymousPureFn(fn, hash?)` pure fn is registered under. The
// function name is the code-only body hash (CodeHash), so its cache key is
// `rt::<CodeHash(body)>` — content-addressed, so two structurally-identical
// bodies collapse to one module and inject the same `"rt::<hash>"` id (whether
// registered directly or through a library wrapper).
const AnonymousNamespace = "rt"

// anonymousPureFnCalleeName is the well-known identifier the walker uses as a
// cheap pre-filter before resolving signatures, mirroring
// `pureFnFactoryCalleeName` for the named lane. It is NOT the contract — the
// marker brands are. A framework wrapper under a DIFFERENT callee name (a
// renamed import, or a library's own `registerXPureFn`) reaches the brand check
// through the secondary pre-filter `firstArgIsInlineFunction` (the anonymous
// lane's factory argument is always an inline function literal). Only a call
// that matches NEITHER cheap filter is missed by extraction.
const anonymousPureFnCalleeName = "registerAnonymousPureFn"

// firstArgIsInlineFunction is the secondary extraction pre-filter for the
// anonymous lane: the call's first argument is an inline arrow/function
// expression — the `PureFunction<F>` factory shape. This lets renamed imports
// and branded wrapper factories reach the (authoritative) brand check without
// paying signature resolution on every unrelated call; false positives (any
// other `foo(() => …)` call) are rejected there.
func firstArgIsInlineFunction(callExpr *ast.CallExpression) bool {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return false
	}
	firstArg := callExpr.Arguments.Nodes[0]
	return firstArg.Kind == ast.KindArrowFunction || firstArg.Kind == ast.KindFunctionExpression
}

// isAnonymousPureFnCall reports whether call is a `registerAnonymousPureFn`
// registration that should be extracted. Two-layer check mirroring
// `isPureFnFactoryCall`:
//
//  1. Cheap: the callee is an identifier whose text equals the well-known
//     `registerAnonymousPureFn` name, OR the first argument is an inline
//     function literal (renamed imports and branded wrapper factories). Avoids
//     signature resolution on unrelated calls.
//  2. Brand verify: the resolved signature has ≥2 parameters where slot 0 carries
//     `PureFunction<F>` and slot 1 carries `InjectPureFnHash<F>`. Module-of-origin
//     is implicit in the brand check (markers only match aliases declared in the
//     `ts-runtypes` package), so a user's own same-named function is rejected here
//     even if it passes the name filter.
func isAnonymousPureFnCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) bool {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindIdentifier {
		return false
	}
	if callee.Text() != anonymousPureFnCalleeName && !firstArgIsInlineFunction(callExpr) {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) < 2 {
		return false
	}
	return paramHasMarker(typeChecker, markerOpts, parameters[0], marker.KindPureFunction) &&
		paramHasMarker(typeChecker, markerOpts, parameters[1], marker.KindInjectPureFnHash)
}
