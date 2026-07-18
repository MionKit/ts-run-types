package typefunctions

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// refTableOf indexes hand-built nodes by id (the walker/skeleton deref refs).
func refTableOf(nodes ...*protocol.RunType) map[string]*protocol.RunType {
	table := make(map[string]*protocol.RunType, len(nodes))
	for _, node := range nodes {
		table[node.ID] = node
	}
	return table
}

// TestBuildCircularSkeleton_SelfReference pins the linked-list shape:
// `Node {name; next?: Node}` — one tracked node with a single `.next` edge back
// to itself.
func TestBuildCircularSkeleton_SelfReference(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	pName := &protocol.RunType{ID: "pName", Kind: protocol.KindProperty, Name: "name", Child: makeRef("str")}
	pNext := &protocol.RunType{ID: "pNext", Kind: protocol.KindProperty, Name: "next", Optional: true, Child: makeRef("node")}
	node := &protocol.RunType{ID: "node", Kind: protocol.KindObject, IsCircular: true, Children: []*protocol.RunType{makeRef("pName"), makeRef("pNext")}}
	refTable := refTableOf(str, pName, pNext, node)

	skeleton := BuildCircularSkeleton(node, refTable)
	if skeleton == nil {
		t.Fatal("expected a skeleton for a self-referential type")
	}
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','next']],t:0}]]}`; got != want {
		t.Fatalf("self-ref skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_ArrayElement pins the `Tree {children: Tree[]}` shape:
// the circular edge iterates array elements (`a`) then returns to node 0.
func TestBuildCircularSkeleton_ArrayElement(t *testing.T) {
	arr := &protocol.RunType{ID: "arr", Kind: protocol.KindArray, Child: makeRef("tree")}
	pKids := &protocol.RunType{ID: "pKids", Kind: protocol.KindProperty, Name: "children", Child: makeRef("arr")}
	tree := &protocol.RunType{ID: "tree", Kind: protocol.KindObject, IsCircular: true, Children: []*protocol.RunType{makeRef("pKids")}}
	refTable := refTableOf(arr, pKids, tree)

	skeleton := BuildCircularSkeleton(tree, refTable)
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','children'],['a']],t:0}]]}`; got != want {
		t.Fatalf("array-element skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_Mutual pins the two-type cycle `A{b?:B}` / `B{a?:A}`:
// node 0 = A, node 1 = B, with cross edges A.b→1 and B.a→0, both tracked.
func TestBuildCircularSkeleton_Mutual(t *testing.T) {
	pB := &protocol.RunType{ID: "pB", Kind: protocol.KindProperty, Name: "b", Optional: true, Child: makeRef("b")}
	pA := &protocol.RunType{ID: "pA", Kind: protocol.KindProperty, Name: "a", Optional: true, Child: makeRef("a")}
	a := &protocol.RunType{ID: "a", Kind: protocol.KindObject, IsCircular: true, Children: []*protocol.RunType{makeRef("pB")}}
	b := &protocol.RunType{ID: "b", Kind: protocol.KindObject, IsCircular: true, Children: []*protocol.RunType{makeRef("pA")}}
	refTable := refTableOf(pB, pA, a, b)

	skeleton := BuildCircularSkeleton(a, refTable)
	// a is node 0 (root); b is node 1. Both tracked; a.b→1, b.a→0.
	if got, want := skeleton.JSLiteral(), `{c:[1,1],e:[[{p:[['k','b']],t:1}],[{p:[['k','a']],t:0}]]}`; got != want {
		t.Fatalf("mutual skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_CycleUnderNonCircularRoot pins the case where the
// guarded root is NOT itself circular (`Wrapper{node?: Recursive}`): node 0 = the
// wrapper (UNtracked, c[0]=0), reaching the circular Recursive at node 1.
func TestBuildCircularSkeleton_CycleUnderNonCircularRoot(t *testing.T) {
	pNext := &protocol.RunType{ID: "pNext", Kind: protocol.KindProperty, Name: "next", Optional: true, Child: makeRef("rec")}
	rec := &protocol.RunType{ID: "rec", Kind: protocol.KindObject, IsCircular: true, Children: []*protocol.RunType{makeRef("pNext")}}
	pNode := &protocol.RunType{ID: "pNode", Kind: protocol.KindProperty, Name: "node", Optional: true, Child: makeRef("rec")}
	wrapper := &protocol.RunType{ID: "wrap", Kind: protocol.KindObject, Children: []*protocol.RunType{makeRef("pNode")}}
	refTable := refTableOf(pNext, rec, pNode, wrapper)

	skeleton := BuildCircularSkeleton(wrapper, refTable)
	// Root (wrapper) is untracked; it reaches Recursive (node 1) via `.node`;
	// Recursive self-loops via `.next`.
	if got, want := skeleton.JSLiteral(), `{c:[0,1],e:[[{p:[['k','node']],t:1}],[{p:[['k','next']],t:1}]]}`; got != want {
		t.Fatalf("cycle-under-noncircular-root skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_Acyclic returns nil for a type that cannot cycle —
// the armed factory then emits no guard (a harmless duplicate of the plain body).
func TestBuildCircularSkeleton_Acyclic(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	pName := &protocol.RunType{ID: "pName", Kind: protocol.KindProperty, Name: "name", Child: makeRef("str")}
	plain := &protocol.RunType{ID: "plain", Kind: protocol.KindObject, Children: []*protocol.RunType{makeRef("pName")}}
	refTable := refTableOf(str, pName, plain)

	if skeleton := BuildCircularSkeleton(plain, refTable); skeleton != nil {
		t.Fatalf("expected nil skeleton for an acyclic type, got %s", skeleton.JSLiteral())
	}
}

// TestBuildCircularSkeleton_DeeplyNested pins that acyclic intermediate objects
// collapse into a single multi-segment edge path (`{a: {b: {c?: Node}}}`).
func TestBuildCircularSkeleton_DeeplyNested(t *testing.T) {
	pC := &protocol.RunType{ID: "pC", Kind: protocol.KindProperty, Name: "c", Optional: true, Child: makeRef("node")}
	inner := &protocol.RunType{ID: "inner", Kind: protocol.KindObject, Children: []*protocol.RunType{makeRef("pC")}}
	pBmid := &protocol.RunType{ID: "pB", Kind: protocol.KindProperty, Name: "b", Child: makeRef("inner")}
	mid := &protocol.RunType{ID: "mid", Kind: protocol.KindObject, Children: []*protocol.RunType{makeRef("pB")}}
	pA := &protocol.RunType{ID: "pA", Kind: protocol.KindProperty, Name: "a", Child: makeRef("mid")}
	node := &protocol.RunType{ID: "node", Kind: protocol.KindObject, IsCircular: true, Children: []*protocol.RunType{makeRef("pA")}}
	refTable := refTableOf(pC, inner, pBmid, mid, pA, node)

	skeleton := BuildCircularSkeleton(node, refTable)
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','a'],['k','b'],['k','c']],t:0}]]}`; got != want {
		t.Fatalf("deeply-nested skeleton = %s, want %s", got, want)
	}
}
