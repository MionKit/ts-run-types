package purefns

import "github.com/microsoft/typescript-go/shim/ast"

// Shared types used by the factory-local dep extractor in deps.go.
// The previous file-level symbol-table + traceIdentifier helpers
// have been moved to internal/comptimeargs — call
// `comptimeargs.ResolveLiteralString` for the checker-driven
// string-literal trace and `comptimeargs.CheckLiteralFunction` for
// the inline-function trace.

// maxTraceDepth bounds the factory-local identifier-chasing recursion
// inside deps.resolveDeclLocal so a `const a = b; const b = c; ...`
// chain (or a self-referential cycle) can't loop forever. Distinct
// from comptimeargs.DepthCap because the factory-local scope is
// guaranteed bounded by the factory body's nesting, so a smaller cap
// is fine here.
const maxTraceDepth = 8

// symbolTable maps identifier name → declaration node within a single
// scope. Built per-factory by buildFactoryLocalTable for the dep
// extractor — the file-level trace is now delegated to comptimeargs.
type symbolTable map[string]*ast.Node
