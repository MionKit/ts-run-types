package purefn

import "github.com/microsoft/typescript-go/shim/ast"

// maxTraceDepth bounds the identifier-chasing recursion so a `const a = b;
// const b = c; ...` chain (or a self-referential cycle) can't loop forever.
const maxTraceDepth = 8

// traceTarget is what we found at the end of an Identifier chain. Exactly
// one of StringLiteral / Function is set on a successful trace. If neither
// is set, the trace failed — Reason carries a short diagnostic snippet.
type traceTarget struct {
	StringLiteral *ast.Node // KindStringLiteral or KindNoSubstitutionTemplateLiteral
	Function      *ast.Node // KindFunctionExpression | KindArrowFunction | KindFunctionDeclaration
	Reason        string
}

// symbolTable maps identifier name → declaration node within a single source
// file. Built lazily per file by buildSymbolTable.
type symbolTable map[string]*ast.Node

// buildSymbolTable walks sourceFile's top-level statements and indexes every
// `const x = ...` variable declaration and `function x() {...}` declaration
// by name. `let` / `var` are intentionally skipped — mutable bindings make
// the value at the call site indeterminate. Imports are also skipped.
func buildSymbolTable(sourceFile *ast.SourceFile) symbolTable {
	table := symbolTable{}
	if sourceFile == nil {
		return table
	}
	sourceFile.AsNode().ForEachChild(func(stmt *ast.Node) bool {
		switch stmt.Kind {
		case ast.KindVariableStatement:
			vs := stmt.AsVariableStatement()
			if vs.DeclarationList == nil {
				return false
			}
			declList := vs.DeclarationList.AsVariableDeclarationList()
			// Only `const` declarations are eligible; let / var are mutable.
			if declList.Flags&ast.NodeFlagsConst == 0 {
				return false
			}
			for _, decl := range declList.Declarations.Nodes {
				varDecl := decl.AsVariableDeclaration()
				if varDecl.Name() == nil || varDecl.Name().Kind != ast.KindIdentifier {
					continue // destructuring on the LHS — skip
				}
				if varDecl.Initializer == nil {
					continue
				}
				table[varDecl.Name().Text()] = decl
			}
		case ast.KindFunctionDeclaration:
			fnDecl := stmt.AsFunctionDeclaration()
			if fnDecl.Name() != nil {
				table[fnDecl.Name().Text()] = stmt
			}
		}
		return false
	})
	return table
}

// resolveStringArg traces argNode to a string literal. Returns the literal
// node (KindStringLiteral) on success, or nil + reason on failure.
func resolveStringArg(table symbolTable, argNode *ast.Node) (*ast.Node, string) {
	target, reason := traceIdentifier(table, argNode, maxTraceDepth)
	if target.StringLiteral != nil {
		return target.StringLiteral, ""
	}
	if reason != "" {
		return nil, reason
	}
	return nil, "not a string literal or local const string"
}

// resolveFactoryArg traces argNode to a function-like declaration.
func resolveFactoryArg(table symbolTable, argNode *ast.Node) (*ast.Node, string) {
	target, reason := traceIdentifier(table, argNode, maxTraceDepth)
	if target.Function != nil {
		return target.Function, ""
	}
	if reason != "" {
		return nil, reason
	}
	return nil, "not an inline function/arrow or local function/const-assigned function"
}

// traceIdentifier is the shared recursion. Returns a traceTarget; check
// .StringLiteral / .Function fields on the caller side.
func traceIdentifier(table symbolTable, node *ast.Node, depth int) (traceTarget, string) {
	if node == nil {
		return traceTarget{}, "argument missing"
	}
	if depth <= 0 {
		return traceTarget{}, "tracing depth exceeded"
	}
	switch node.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return traceTarget{StringLiteral: node}, ""
	case ast.KindFunctionExpression, ast.KindArrowFunction, ast.KindFunctionDeclaration:
		return traceTarget{Function: node}, ""
	case ast.KindIdentifier:
		name := node.Text()
		decl, found := table[name]
		if !found {
			return traceTarget{}, "identifier `" + name + "` not declared in this file"
		}
		switch decl.Kind {
		case ast.KindFunctionDeclaration:
			return traceTarget{Function: decl}, ""
		case ast.KindVariableDeclaration:
			varDecl := decl.AsVariableDeclaration()
			if varDecl.Initializer == nil {
				return traceTarget{}, "const `" + name + "` has no initializer"
			}
			return traceIdentifier(table, varDecl.Initializer, depth-1)
		}
		return traceTarget{}, "binding `" + name + "` is not a const literal or function"
	}
	// Anything else (call, property access, template literal with substitutions,
	// binary expression, etc.) is not a traceable literal-or-function.
	return traceTarget{}, "expression is not a literal or function reference"
}
