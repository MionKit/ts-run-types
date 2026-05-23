package purefns

import "github.com/mionkit/ts-run-types/internal/diag"

// Type aliases to the central diag package — kept on purefns so test
// fixtures and any in-package callers can continue to write the bare names
// without importing diag themselves. Constants are re-exported so PFE9xxx
// code references stay short.
type (
	Diagnostic = diag.Diagnostic
)

const (
	CodeNamespaceNotLiteral  = diag.CodeNamespaceNotLiteral
	CodeFunctionIDNotLiteral = diag.CodeFunctionIDNotLiteral
	CodeFactoryNotInline     = diag.CodeFactoryNotInline
	CodeBodyHashCollision    = diag.CodeBodyHashCollision
	CodeDestructuredParam    = diag.CodeDestructuredParam

	CodePurityThis          = diag.CodePurityThis
	CodePurityAwait         = diag.CodePurityAwait
	CodePurityYield         = diag.CodePurityYield
	CodePurityDynamicImport = diag.CodePurityDynamicImport
	CodePurityForbidden     = diag.CodePurityForbidden
	CodePurityClosure       = diag.CodePurityClosure

	CodeMissingPureFnDep    = diag.CodeMissingPureFnDep
	CodePurityDepNotLiteral = diag.CodePurityDepNotLiteral
)
