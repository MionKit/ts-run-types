package enrichment

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// Resolved is the result of resolving a named type in a file: the canonical
// top-level RunType node plus the cache lookup the enrichment walkers use to
// follow KindRef sentinels (child slots ride as `{kind:-1, id}` refs).
type Resolved struct {
	// Node is the canonical full RunType for the named type (not a ref).
	Node *protocol.RunType
	// Resolve looks up a KindRef's canonical node by id — pass this as the
	// walkers' EmitOptions.Resolve / DescribeOptions.Resolve.
	Resolve func(id string) *protocol.RunType
}

// ResolveType is the out-of-band resolution bridge: given an already-built
// Program + Resolver and an absolute source path, it finds the type alias /
// interface / class declaration named typeName, asks the checker for its
// declared type, and projects it through the resolver's cache to a canonical
// *protocol.RunType. The returned Resolve closure (cache.NodeByID) lets the
// emit/describe walkers follow ref sentinels in the child slots.
//
// This deliberately reuses the SAME cache as the resolver so projected child
// ids resolve. It never touches the marker scan or the vite render path.
func ResolveType(prog *program.Program, res *resolver.Resolver, absPath, typeName string) (*Resolved, error) {
	if prog == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: program is nil")
	}
	if res == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: resolver is nil")
	}
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: source file not in program: %s", absPath)
	}
	typeChecker := res.Checker()
	if typeChecker == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: resolver has no checker")
	}

	nameNode := findTypeNameNode(sourceFile, typeName)
	if nameNode == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: no type/interface/class named %q in %s", typeName, absPath)
	}

	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: no symbol for %q in %s", typeName, absPath)
	}
	tsType := checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol)
	if tsType == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: no declared type for %q in %s", typeName, absPath)
	}

	cache := res.Cache()
	node := cache.SerializeTopLevel(tsType)
	if node == nil {
		return nil, fmt.Errorf("enrichment.ResolveType: projection produced no node for %q", typeName)
	}
	// The cache hands back a REF graph: a compound node's Children / Child slots
	// are `{kind:-1, id}` sentinels into the type table. The enrichment walkers
	// inspect a parent's Children directly (propertyChildren / isObjectLike) and
	// only deref the per-property Child, so they expect those structural slots to
	// be the canonical nodes inline. inlineNode rewrites the slots to the
	// canonical shape (cycle-guarded; deep cycles keep their ref, which the
	// walkers' own deref still follows via the returned Resolve).
	inlined := inlineNode(node, cache.NodeByID, map[string]bool{})
	return &Resolved{Node: inlined, Resolve: cache.NodeByID}, nil
}

// inlineNode returns a copy of rt with every ref-bearing structural slot
// (Children, Child, Return, Parameters, Index) replaced by the canonical node
// it points at, recursively, so the result matches the fully-inlined shape the
// enrichment walkers were authored against. seen guards genuine cycles: a node
// already on the current path keeps its ref form (Kind == KindRef), which the
// walkers' own deref re-follows at emit time.
func inlineNode(rt *protocol.RunType, resolve func(id string) *protocol.RunType, seen map[string]bool) *protocol.RunType {
	if rt == nil {
		return nil
	}
	if rt.Kind == protocol.KindRef {
		canonical := resolve(rt.ID)
		if canonical == nil || seen[rt.ID] {
			return rt
		}
		return inlineNode(canonical, resolve, seen)
	}
	if rt.ID != "" {
		if seen[rt.ID] {
			return protocol.NewRef(rt.ID)
		}
		seen[rt.ID] = true
		defer delete(seen, rt.ID)
	}

	clone := *rt
	if rt.Child != nil {
		clone.Child = inlineNode(rt.Child, resolve, seen)
	}
	if rt.Return != nil {
		clone.Return = inlineNode(rt.Return, resolve, seen)
	}
	if rt.Index != nil {
		clone.Index = inlineNode(rt.Index, resolve, seen)
	}
	clone.Children = inlineSlice(rt.Children, resolve, seen)
	clone.Parameters = inlineSlice(rt.Parameters, resolve, seen)
	return &clone
}

func inlineSlice(in []*protocol.RunType, resolve func(id string) *protocol.RunType, seen map[string]bool) []*protocol.RunType {
	if in == nil {
		return nil
	}
	out := make([]*protocol.RunType, len(in))
	for i, child := range in {
		out[i] = inlineNode(child, resolve, seen)
	}
	return out
}

// findTypeNameNode walks the source file's top-level statements for a type
// alias, interface, or class declaration whose name matches typeName, and
// returns its name identifier node (the location GetSymbolAtLocation expects).
// Returns nil when no such declaration exists.
func findTypeNameNode(sourceFile *ast.SourceFile, typeName string) *ast.Node {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsTypeAliasDeclaration(statement),
			ast.IsInterfaceDeclaration(statement),
			ast.IsClassDeclaration(statement):
		default:
			continue
		}
		nameNode := statement.Name()
		if nameNode != nil && nameNode.Text() == typeName {
			return nameNode
		}
	}
	return nil
}
