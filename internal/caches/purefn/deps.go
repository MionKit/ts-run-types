package purefn

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
)

// pureFnDepMethods is the set of jitUtils methods whose first argument
// identifies a pure-function dependency. Mirrors the runtime tracking
// proxy in pureFn.ts that used to discover these dynamically.
//
// All four key-style methods take a single `"<namespace>::<fnName>"`
// composite key. `findCompiledPureFn` is the bare-name overload — its
// argument is just the fnName, cross-namespace.
var pureFnDepMethods = map[string]bool{
	"getPureFn":         true,
	"usePureFn":         true,
	"getCompiledPureFn": true,
	"hasPureFn":         true,
	"findCompiledPureFn": true,
}

// extractDeps walks factoryFn's body for `<utlName>.<method>(<keyLit>)`
// patterns where <method> is one of the pureFnDepMethods entries and
// <keyLit> is a string literal (resolved against a factory-local symbol
// table and the file-level table as fallbacks). Returns the sorted,
// deduped list of dependency keys plus any diagnostics for arguments
// that couldn't be statically resolved.
//
// When utlName is empty (factory has no first parameter), returns
// (nil, nil) — the caller is free to register the entry without deps.
//
// For findCompiledPureFn the literal is a bare fnName; we emit it with
// an empty namespace prefix (`"::" + fnName`) so the runtime's
// cross-namespace resolver (mion's findCompiledPureFn) treats it the
// same way as a suffix match. This mirrors the historical behaviour of
// the tracking proxy.
func extractDeps(sourceFile *ast.SourceFile, factoryFn *ast.Node, fileTable symbolTable, utlName string) ([]string, []Diagnostic) {
	if utlName == "" {
		return nil, nil
	}
	localTable := buildFactoryLocalTable(factoryFn)
	depSet := map[string]bool{}
	var diags []Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			handleCall(sourceFile, node, fileTable, localTable, utlName, depSet, &diags)
		}
		node.ForEachChild(visit)
		return false
	}
	body := factoryFn.Body()
	if body == nil {
		return nil, nil
	}
	body.ForEachChild(visit)
	if len(depSet) == 0 {
		return nil, diags
	}
	deps := make([]string, 0, len(depSet))
	for key := range depSet {
		deps = append(deps, key)
	}
	sort.Strings(deps)
	return deps, diags
}

// handleCall checks one CallExpression. When the callee is one of the
// recognised `<utlName>.<method>(...)` shapes, resolves the first
// argument to a string literal and records it; otherwise it's a no-op.
func handleCall(
	sourceFile *ast.SourceFile,
	call *ast.Node,
	fileTable, localTable symbolTable,
	utlName string,
	depSet map[string]bool,
	diags *[]Diagnostic,
) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindPropertyAccessExpression {
		return
	}
	propAccess := callee.AsPropertyAccessExpression()
	if propAccess == nil {
		return
	}
	receiver := propAccess.Expression
	if receiver == nil || receiver.Kind != ast.KindIdentifier || receiver.Text() != utlName {
		return
	}
	methodName := propAccess.Name()
	if methodName == nil || methodName.Kind != ast.KindIdentifier {
		return
	}
	method := methodName.Text()
	if !pureFnDepMethods[method] {
		return
	}
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return
	}
	arg := callExpr.Arguments.Nodes[0]
	literal, _ := resolveDepArg(localTable, fileTable, arg)
	if literal == nil {
		*diags = append(*diags, Diagnostic{
			Code:     CodePurityDepNotLiteral,
			Category: "error",
			Message:  "pure-fn dependency arg to `" + utlName + "." + method + "` must be a string literal or a local const string in the same scope",
			Site:     siteFromNode(sourceFile, arg),
		})
		return
	}
	depKey := literal.Text()
	if method == "findCompiledPureFn" {
		// Bare fnName; no namespace available statically. Use the
		// `"::" + fnName` form so the runtime's suffix-matching
		// findCompiledPureFn resolves it across all registered
		// namespaces — same semantics the tracking proxy used to
		// record.
		depKey = "::" + depKey
	}
	depSet[depKey] = true
}

// resolveDepArg traces argNode through the factory-local table first
// (covers `const FOO = 'mion::foo'; utl.getPureFn(FOO)` inside the
// factory) and falls back to the file-level table when there's no hit.
// Returns the literal node + reason; nil literal means the argument
// couldn't be traced.
func resolveDepArg(localTable, fileTable symbolTable, argNode *ast.Node) (*ast.Node, string) {
	target, reason := traceWithLocal(localTable, fileTable, argNode, maxTraceDepth)
	if target.StringLiteral != nil {
		return target.StringLiteral, ""
	}
	if reason != "" {
		return nil, reason
	}
	return nil, "not a string literal or local const"
}

// traceWithLocal mirrors traceIdentifier but consults localTable before
// fileTable. Identifiers found in localTable shadow the file-level
// binding; absent there, we re-enter via fileTable. The two tables are
// disjoint in practice — local const declarations don't appear in the
// file-level table because buildSymbolTable only walks top-level
// statements — so the precedence is enforceable without a merged map.
func traceWithLocal(localTable, fileTable symbolTable, node *ast.Node, depth int) (traceTarget, string) {
	if node == nil {
		return traceTarget{}, "argument missing"
	}
	if depth <= 0 {
		return traceTarget{}, "tracing depth exceeded"
	}
	switch node.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return traceTarget{StringLiteral: node}, ""
	case ast.KindIdentifier:
		name := node.Text()
		if decl, found := localTable[name]; found {
			return resolveDeclLocal(localTable, fileTable, decl, depth)
		}
		if decl, found := fileTable[name]; found {
			return resolveDeclLocal(localTable, fileTable, decl, depth)
		}
		return traceTarget{}, "identifier `" + name + "` not declared in scope"
	}
	return traceTarget{}, "expression is not a literal or const reference"
}

func resolveDeclLocal(localTable, fileTable symbolTable, decl *ast.Node, depth int) (traceTarget, string) {
	switch decl.Kind {
	case ast.KindVariableDeclaration:
		varDecl := decl.AsVariableDeclaration()
		if varDecl == nil || varDecl.Initializer == nil {
			return traceTarget{}, "binding has no initializer"
		}
		return traceWithLocal(localTable, fileTable, varDecl.Initializer, depth-1)
	}
	return traceTarget{}, "binding is not a const literal"
}

// buildFactoryLocalTable indexes every `const x = <literal>` declared
// at any nesting level inside factoryFn's body, mapping name →
// VariableDeclaration node. `let` and `var` are intentionally skipped —
// mutable bindings can't be reduced to a literal at scan time.
//
// Why walk past function boundaries? The dep extractor walks the whole
// factory body looking for utl.<method>(...) calls; if a `const KEY =
// 'mion::foo'` lives in an outer block but the call lives in a nested
// arrow, both should resolve to the same value. Pure-fn semantics
// guarantee no rebinding, so the simple top-down walk is correct.
func buildFactoryLocalTable(factoryFn *ast.Node) symbolTable {
	table := symbolTable{}
	body := factoryFn.Body()
	if body == nil {
		return table
	}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindVariableStatement {
			vs := node.AsVariableStatement()
			if vs.DeclarationList != nil {
				declList := vs.DeclarationList.AsVariableDeclarationList()
				if declList.Flags&ast.NodeFlagsConst != 0 {
					for _, decl := range declList.Declarations.Nodes {
						varDecl := decl.AsVariableDeclaration()
						if varDecl.Name() != nil && varDecl.Name().Kind == ast.KindIdentifier && varDecl.Initializer != nil {
							table[varDecl.Name().Text()] = decl
						}
					}
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	body.ForEachChild(visit)
	return table
}
