package parsedfn

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/program"
)

func parseToTable(t *testing.T, source string) (*ast.SourceFile, symbolTable) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	filePath := tspath.ResolvePath(cwd, "case.ts")
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        map[string]string{filePath: source},
	}, []string{filePath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	sourceFile := prog.SourceFile(filePath)
	if sourceFile == nil {
		t.Fatalf("source file not parsed")
	}
	return sourceFile, buildSymbolTable(sourceFile)
}

// findIdent returns the first Identifier with the given text in sourceFile,
// excluding declaration names. Used to fetch a "use site" identifier whose
// reference we want to trace.
func findIdent(sourceFile *ast.SourceFile, name string) *ast.Node {
	var found *ast.Node
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || found != nil {
			return false
		}
		if node.Kind == ast.KindIdentifier && node.Text() == name {
			parent := node.Parent
			// Skip declaration sites — we want a reference.
			if parent != nil {
				if parent.Kind == ast.KindVariableDeclaration {
					if parent.AsVariableDeclaration().Name() == node {
						node.ForEachChild(visit)
						return false
					}
				}
				if parent.Kind == ast.KindFunctionDeclaration {
					if parent.AsFunctionDeclaration().Name() == node {
						node.ForEachChild(visit)
						return false
					}
				}
			}
			found = node
			return false
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return found
}

func TestTrace_StringLiteralDirect(t *testing.T) {
	sf, table := parseToTable(t, `const x = "literal"; export const y = x;`)
	use := findIdent(sf, "x")
	if use == nil {
		t.Fatalf("no use of x")
	}
	lit, reason := resolveStringArg(table, use)
	if lit == nil {
		t.Fatalf("expected string literal, got reason=%q", reason)
	}
	if lit.Text() != "literal" {
		t.Errorf("expected literal text, got %q", lit.Text())
	}
}

func TestTrace_LetRejected(t *testing.T) {
	sf, table := parseToTable(t, `let x = "literal"; export const y = x;`)
	use := findIdent(sf, "x")
	if use == nil {
		t.Fatalf("no use of x")
	}
	lit, reason := resolveStringArg(table, use)
	if lit != nil {
		t.Fatalf("let bindings must not trace, got %q", lit.Text())
	}
	if reason == "" {
		t.Errorf("expected non-empty reason")
	}
}

func TestTrace_VarRejected(t *testing.T) {
	sf, table := parseToTable(t, `var x = "literal"; export const y = x;`)
	use := findIdent(sf, "x")
	if use == nil {
		t.Fatalf("no use of x")
	}
	lit, _ := resolveStringArg(table, use)
	if lit != nil {
		t.Errorf("var bindings must not trace, got %q", lit.Text())
	}
}

func TestTrace_IdentifierChain(t *testing.T) {
	sf, table := parseToTable(t, `const a = "deep"; const b = a; const c = b; export const x = c;`)
	use := findIdent(sf, "c")
	if use == nil {
		t.Fatalf("no use of c")
	}
	lit, reason := resolveStringArg(table, use)
	if lit == nil {
		t.Fatalf("expected traced string literal, got reason=%q", reason)
	}
	if lit.Text() != "deep" {
		t.Errorf("expected `deep`, got %q", lit.Text())
	}
}

func TestTrace_CallExpressionRejected(t *testing.T) {
	sf, table := parseToTable(t, `declare function getNs(): string; const x = getNs(); export const y = x;`)
	use := findIdent(sf, "x")
	if use == nil {
		t.Fatalf("no use of x")
	}
	lit, _ := resolveStringArg(table, use)
	if lit != nil {
		t.Errorf("call initializer must not trace, got %q", lit.Text())
	}
}

func TestTrace_FunctionDeclTracedAsFactory(t *testing.T) {
	sf, table := parseToTable(t, `function myFactory() { return function() {}; } export const y = myFactory;`)
	use := findIdent(sf, "myFactory")
	if use == nil {
		t.Fatalf("no use of myFactory")
	}
	fn, reason := resolveFactoryArg(table, use)
	if fn == nil {
		t.Fatalf("expected traced function, got reason=%q", reason)
	}
	if fn.Kind != ast.KindFunctionDeclaration {
		t.Errorf("expected KindFunctionDeclaration, got %d", fn.Kind)
	}
}

func TestTrace_ConstAssignedFunctionExpression(t *testing.T) {
	sf, table := parseToTable(t, `const f = function () { return function() {}; }; export const y = f;`)
	use := findIdent(sf, "f")
	if use == nil {
		t.Fatalf("no use of f")
	}
	fn, _ := resolveFactoryArg(table, use)
	if fn == nil || fn.Kind != ast.KindFunctionExpression {
		t.Errorf("expected FunctionExpression, got %+v", fn)
	}
}

func TestTrace_ConstAssignedArrow(t *testing.T) {
	sf, table := parseToTable(t, `const f = () => () => 1; export const y = f;`)
	use := findIdent(sf, "f")
	if use == nil {
		t.Fatalf("no use of f")
	}
	fn, _ := resolveFactoryArg(table, use)
	if fn == nil || fn.Kind != ast.KindArrowFunction {
		t.Errorf("expected ArrowFunction, got %+v", fn)
	}
}

func TestTrace_UndeclaredIdentifierRejected(t *testing.T) {
	sf, table := parseToTable(t, `export const y = somethingNotDeclared;`)
	use := findIdent(sf, "somethingNotDeclared")
	if use == nil {
		t.Fatalf("no use of somethingNotDeclared")
	}
	lit, reason := resolveStringArg(table, use)
	if lit != nil {
		t.Errorf("undeclared ident must not trace")
	}
	if reason == "" {
		t.Errorf("expected reason mentioning undeclared identifier")
	}
}

func TestTrace_FunctionExpressionDirect(t *testing.T) {
	// arg passed inline — no tracing needed, must accept directly.
	sf, table := parseToTable(t, `declare function reg(ns: string, fn: string, factory: any): any; export const x = reg('ns', 'fn', function () { return function() {}; });`)
	_ = sf
	// We can't easily isolate the arg via findIdent — but resolveFactoryArg
	// accepts FunctionExpression / ArrowFunction directly without table.
	// Smoke-test by passing a synthesized expectation: trace from a non-Identifier
	// node should immediately succeed if it's a function-like.
	_ = table
	// This test is mainly a placeholder ensuring the direct path works in extract.go's
	// integration test (TestExtract_HappyPath_*). Skip with a noop.
	t.Skip("direct-pass behavior covered by integration tests in TestExtract_HappyPath_*")
}
