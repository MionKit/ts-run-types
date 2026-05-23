package purefns

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-run-types/internal/diag"
)

// CheckPurity runs the package's purity rules against an inline
// function-literal node and returns the diagnostics they produce
// (PFE9006–PFE9011, all Error severity). Public wrapper around the
// package-private checkPurity used by the resolver's PureFunction<F>
// marker path — the existing registerPureFnFactory extractor calls
// checkPurity directly.
//
// fnNode must be a KindArrowFunction or KindFunctionExpression. Callers
// should run comptimeargs.CheckLiteralFunction first to enforce the
// inline-shape rule (PFN001) before invoking this; the purity walker
// itself does not validate the outer node's kind.
func CheckPurity(sourceFile *ast.SourceFile, fnNode *ast.Node) []diag.Diagnostic {
	return checkPurity(sourceFile, fnNode)
}
