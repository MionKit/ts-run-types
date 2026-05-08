// Package walker finds AST nodes at byte positions within a source file.
// The resolver translates (file, pos) query coordinates into the concrete node
// whose type the caller wants resolved — a CallExpression, Identifier, or a
// type-argument TypeNode.
package walker

import (
	"github.com/microsoft/typescript-go/shim/ast"
)

// NodeAt returns the deepest node whose range [Pos, End) contains the given
// byte offset. Returns nil if pos is outside the source file or the file is
// nil. Ties are broken by preferring the innermost (smallest) node.
func NodeAt(sourceFile *ast.SourceFile, pos int) *ast.Node {
	if sourceFile == nil {
		return nil
	}
	root := sourceFile.AsNode()
	if root == nil || pos < root.Pos() || pos >= root.End() {
		return nil
	}
	var best *ast.Node = root
	var visit ast.Visitor
	visit = func(n *ast.Node) bool {
		if n == nil {
			return false
		}
		if pos >= n.Pos() && pos < n.End() {
			best = n
			n.ForEachChild(visit)
		}
		return false
	}
	root.ForEachChild(visit)
	return best
}

// CallExpressionAt walks up from the node at pos and returns the nearest
// enclosing CallExpression, or nil if none exists. Useful when the caller
// points at the call's opening paren, the callee, or any argument.
func CallExpressionAt(sourceFile *ast.SourceFile, pos int) *ast.Node {
	n := NodeAt(sourceFile, pos)
	for n != nil {
		if n.Kind == ast.KindCallExpression {
			return n
		}
		n = n.Parent
	}
	return nil
}

// ForEachCallExpression invokes cb for every CallExpression in sourceFile,
// in depth-first source order. cb is also called for nested calls (an outer
// call's arguments may contain inner calls — both visit). Stops descending
// into a node if cb returns false.
func ForEachCallExpression(sourceFile *ast.SourceFile, cb func(*ast.Node) bool) {
	if sourceFile == nil {
		return
	}
	root := sourceFile.AsNode()
	if root == nil {
		return
	}
	var visit ast.Visitor
	visit = func(n *ast.Node) bool {
		if n == nil {
			return false
		}
		if n.Kind == ast.KindCallExpression {
			if !cb(n) {
				return false
			}
		}
		n.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
}
