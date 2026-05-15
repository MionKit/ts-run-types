package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// ---- F19 — array of object literal -------------------------------------------

func TestF19_ArrayOfObject(t *testing.T) {
	r := setup(t)
	root := resolveFile(t, r, "f19_array_of_object.ts")
	types := dump(r)
	if root.Kind != protocol.KindArray {
		t.Fatalf("expected KindArray, got %+v", root)
	}
	elem := deref(types, root.Type)
	if elem == nil || elem.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected element KindObjectLiteral, got %+v", elem)
	}
	x := findMember(types, elem, "x")
	if x == nil {
		t.Fatalf("missing 'x' property on element; types=%+v", elem.Types)
	}
	xType := deref(types, x.Type)
	if xType == nil || xType.Kind != protocol.KindNumber {
		t.Fatalf("x.type expected KindNumber, got %+v", xType)
	}
}

// ---- F20 — array of array ----------------------------------------------------

func TestF20_ArrayOfArray(t *testing.T) {
	r := setup(t)
	root := resolveFile(t, r, "f20_array_of_array.ts")
	types := dump(r)
	if root.Kind != protocol.KindArray {
		t.Fatalf("expected outer KindArray, got %+v", root)
	}
	inner := deref(types, root.Type)
	if inner == nil || inner.Kind != protocol.KindArray {
		t.Fatalf("expected inner KindArray, got %+v", inner)
	}
	leaf := deref(types, inner.Type)
	if leaf == nil || leaf.Kind != protocol.KindString {
		t.Fatalf("expected leaf KindString, got %+v", leaf)
	}
}

// ---- F21 — recursive self ----------------------------------------------------
//
// The cycle path is Tree → Property("children") → Array → Tree. Walking it
// must terminate via the cache by id equality, not by infinite recursion.

func TestF21_RecursiveSelf(t *testing.T) {
	r := setup(t)
	root := resolveFile(t, r, "f21_recursive_self.ts")
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected root KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if countByID(types, rootID) != 1 {
		t.Fatalf("expected Tree to appear exactly once in cache, got %d", countByID(types, rootID))
	}
	children := findMember(types, root, "children")
	if children == nil {
		t.Fatalf("missing 'children' property; types=%+v", root.Types)
	}
	arr := deref(types, children.Type)
	if arr == nil || arr.Kind != protocol.KindArray {
		t.Fatalf("children.type expected KindArray, got %+v", arr)
	}
	back := deref(types, arr.Type)
	if back == nil {
		t.Fatalf("array element ref did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected cycle to close on rootID=%s, got %s", rootID, back.ID)
	}
}

// ---- F22 — recursive mutual --------------------------------------------------

func TestF22_RecursiveMutual(t *testing.T) {
	r := setup(t)
	root := resolveFile(t, r, "f22_recursive_mutual.ts")
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected A KindObjectLiteral, got %+v", root)
	}
	aID := root.ID

	bProp := findMember(types, root, "b")
	if bProp == nil {
		t.Fatalf("A missing 'b' property; types=%+v", root.Types)
	}
	b := deref(types, bProp.Type)
	if b == nil || b.Kind != protocol.KindObjectLiteral {
		t.Fatalf("b expected KindObjectLiteral, got %+v", b)
	}
	bID := b.ID

	aProp := findMember(types, b, "a")
	if aProp == nil {
		t.Fatalf("B missing 'a' property; types=%+v", b.Types)
	}
	back := deref(types, aProp.Type)
	if back == nil {
		t.Fatalf("B.a ref did not resolve")
	}
	if back.ID != aID {
		t.Fatalf("expected B.a to close cycle on A id=%s, got %s", aID, back.ID)
	}
	if countByID(types, aID) != 1 {
		t.Fatalf("expected A to appear exactly once in cache, got %d", countByID(types, aID))
	}
	if countByID(types, bID) != 1 {
		t.Fatalf("expected B to appear exactly once in cache, got %d", countByID(types, bID))
	}
}

func countByID(types []*protocol.Type, id string) int {
	n := 0
	for _, t := range types {
		if t.ID == id {
			n++
		}
	}
	return n
}
