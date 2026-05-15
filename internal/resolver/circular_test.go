package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// Circular-type tests adapted from mion's circularRefs.spec.ts at
// /home/user/mion/packages/run-types/src/nodes/collection/circularRefs.spec.ts.
// Mion's spec exercises JIT validation behaviour; this suite exercises only
// the structural projection — that our serializer walks every shape without
// infinite recursion, lands one canonical RunType per recursive type in the
// cache, and that the back-edge closes via id equality (the wire-level
// equivalent of mion's runtime referential equality).
//
// Each scenario has paired *_Static / *_Reflect tests per the marker test
// coverage rule (CLAUDE.md).

// ---- F29 — Circular object with optional self-reference ---------------------
//
//	interface Circular {
//	    n: number;
//	    s: string;
//	    c?: Circular;
//	    d?: Date;
//	}

func TestF29_CircularObject_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface Circular {
  n: number;
  s: string;
  c?: Circular;
  d?: Date;
}
getRuntypeId<Circular>();
`
	r, root := resolveInline(t, code)
	assertF29CircularObject(t, r, root)
}

func TestF29_CircularObject_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface Circular {
  n: number;
  s: string;
  c?: Circular;
  d?: Date;
}
declare const value: Circular;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF29CircularObject(t, r, root)
}

func assertF29CircularObject(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected Circular to appear exactly once in cache, got %d", got)
	}

	nMember := findMember(types, root, "n")
	if nMember == nil || deref(types, nMember.Child).Kind != protocol.KindNumber {
		t.Fatalf("n expected number, got %+v", nMember)
	}
	sMember := findMember(types, root, "s")
	if sMember == nil || deref(types, sMember.Child).Kind != protocol.KindString {
		t.Fatalf("s expected string, got %+v", sMember)
	}

	cMember := findMember(types, root, "c")
	if cMember == nil {
		t.Fatalf("missing 'c' property; types=%+v", root.Children)
	}
	if !cMember.Optional {
		t.Fatalf("c expected Optional=true, got %+v", cMember)
	}
	back := deref(types, cMember.Child)
	if back == nil {
		t.Fatalf("c.child did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected c.child to close cycle on rootID=%s, got %s", rootID, back.ID)
	}

	dMember := findMember(types, root, "d")
	if dMember == nil || !dMember.Optional {
		t.Fatalf("d expected optional, got %+v", dMember)
	}
	if dt := deref(types, dMember.Child); dt == nil || dt.Kind != protocol.KindClass || dt.TypeName != "Date" {
		t.Fatalf("d.child expected KindClass Date, got %+v", dt)
	}
}

// ---- F30 — Circular array + union -------------------------------------------
//
//	type CuArray = (CuArray | Date | number | string)[];
//
// Union projection exists in serialize.go (TypeFlagsUnion branch) and the
// recursion path runs through Array → Union → CuArray. This test asserts the
// cycle still closes through the union member that loops back. Union is
// otherwise out of scope for top-level coverage and gets its own ticket
// later — here we only verify the cycle-safety property.

func TestF30_CircularArrayUnion_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type CuArray = (CuArray | Date | number | string)[];
getRuntypeId<CuArray>();
`
	r, root := resolveInline(t, code)
	assertF30CircularArrayUnion(t, r, root)
}

func TestF30_CircularArrayUnion_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type CuArray = (CuArray | Date | number | string)[];
declare const value: CuArray;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF30CircularArrayUnion(t, r, root)
}

func assertF30CircularArrayUnion(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindArray {
		t.Fatalf("expected outer KindArray, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CuArray to appear exactly once in cache, got %d", got)
	}

	union := deref(types, root.Child)
	if union == nil || union.Kind != protocol.KindUnion {
		t.Fatalf("expected element KindUnion, got %+v", union)
	}

	// Walk the union; one constituent must close back on rootID, and the
	// expected scalars / Date must all appear.
	wantKinds := map[protocol.ReflectionKind]bool{
		protocol.KindNumber: false,
		protocol.KindString: false,
	}
	var hasDate, hasBackEdge bool
	for _, ref := range union.Children {
		member := deref(types, ref)
		if member == nil {
			continue
		}
		if member.ID == rootID {
			hasBackEdge = true
			continue
		}
		if member.Kind == protocol.KindClass && member.TypeName == "Date" {
			hasDate = true
			continue
		}
		if _, ok := wantKinds[member.Kind]; ok {
			wantKinds[member.Kind] = true
		}
	}
	if !hasBackEdge {
		t.Fatalf("expected one union member to close cycle on rootID=%s; union=%+v", rootID, union.Children)
	}
	if !hasDate {
		t.Fatalf("expected Date constituent in union; union=%+v", union.Children)
	}
	for kind, found := range wantKinds {
		if !found {
			t.Fatalf("expected union to contain kind=%d", kind)
		}
	}
}

// ---- F31 — Circular object with tuple ---------------------------------------
//
//	interface CircularTuple {
//	    tuple: [bigint, CircularTuple?];
//	}

func TestF31_CircularTuple_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface CircularTuple {
  tuple: [bigint, CircularTuple?];
}
getRuntypeId<CircularTuple>();
`
	r, root := resolveInline(t, code)
	assertF31CircularTuple(t, r, root)
}

func TestF31_CircularTuple_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface CircularTuple {
  tuple: [bigint, CircularTuple?];
}
declare const value: CircularTuple;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF31CircularTuple(t, r, root)
}

func assertF31CircularTuple(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CircularTuple to appear exactly once in cache, got %d", got)
	}

	tupleProp := findMember(types, root, "tuple")
	if tupleProp == nil {
		t.Fatalf("missing 'tuple' property; types=%+v", root.Children)
	}
	tuple := deref(types, tupleProp.Child)
	if tuple == nil || tuple.Kind != protocol.KindTuple {
		t.Fatalf("tuple.child expected KindTuple, got %+v", tuple)
	}
	if len(tuple.Children) != 2 {
		t.Fatalf("expected 2 tuple members, got %d", len(tuple.Children))
	}

	first := deref(types, tuple.Children[0])
	if first == nil || first.Kind != protocol.KindTupleMember {
		t.Fatalf("first member expected KindTupleMember, got %+v", first)
	}
	if first.Position == nil || *first.Position != 0 {
		t.Fatalf("first member expected Position=0, got %+v", first.Position)
	}
	if firstType := deref(types, first.Child); firstType == nil || firstType.Kind != protocol.KindBigInt {
		t.Fatalf("first member.child expected KindBigInt, got %+v", firstType)
	}

	second := deref(types, tuple.Children[1])
	if second == nil || second.Kind != protocol.KindTupleMember {
		t.Fatalf("second member expected KindTupleMember, got %+v", second)
	}
	if !second.Optional {
		t.Fatalf("second member expected Optional=true, got %+v", second)
	}
	if second.Position == nil || *second.Position != 1 {
		t.Fatalf("second member expected Position=1, got %+v", second.Position)
	}
	back := deref(types, second.Child)
	if back == nil {
		t.Fatalf("second tuple member child did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected second tuple member to close cycle on rootID=%s, got %s", rootID, back.ID)
	}
}

// ---- F32 — Circular object with index property ------------------------------
//
//	interface CircularIndex {
//	    index: {[key: string]: CircularIndex};
//	}

func TestF32_CircularIndex_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface CircularIndex {
  index: {[key: string]: CircularIndex};
}
getRuntypeId<CircularIndex>();
`
	r, root := resolveInline(t, code)
	assertF32CircularIndex(t, r, root)
}

func TestF32_CircularIndex_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface CircularIndex {
  index: {[key: string]: CircularIndex};
}
declare const value: CircularIndex;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF32CircularIndex(t, r, root)
}

func assertF32CircularIndex(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CircularIndex to appear exactly once in cache, got %d", got)
	}

	indexProp := findMember(types, root, "index")
	if indexProp == nil {
		t.Fatalf("missing 'index' property; types=%+v", root.Children)
	}
	indexObj := deref(types, indexProp.Child)
	if indexObj == nil || indexObj.Kind != protocol.KindObjectLiteral {
		t.Fatalf("index.child expected KindObjectLiteral, got %+v", indexObj)
	}

	var indexSig *protocol.RunType
	for _, ref := range indexObj.Children {
		member := deref(types, ref)
		if member != nil && member.Kind == protocol.KindIndexSignature {
			indexSig = member
			break
		}
	}
	if indexSig == nil {
		t.Fatalf("expected one KindIndexSignature on index object; children=%+v", indexObj.Children)
	}
	if idxKey := deref(types, indexSig.Index); idxKey == nil || idxKey.Kind != protocol.KindString {
		t.Fatalf("index signature key expected KindString, got %+v", idxKey)
	}
	back := deref(types, indexSig.Child)
	if back == nil {
		t.Fatalf("index signature value did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected index signature value to close cycle on rootID=%s, got %s", rootID, back.ID)
	}
}

// ---- F33 — Circular object with deep nested anonymous objects ---------------
//
//	interface CircularDeep {
//	    deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
//	}
//
// Cycle path: CircularDeep → deep1 → ObjectLiteral → deep2 → ObjectLiteral →
// deep3 → ObjectLiteral → deep4 (optional) → CircularDeep. Each intermediate
// inline-object layer is a distinct anonymous shape, but the root must still
// appear exactly once.

func TestF33_CircularDeep_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}
getRuntypeId<CircularDeep>();
`
	r, root := resolveInline(t, code)
	assertF33CircularDeep(t, r, root)
}

func TestF33_CircularDeep_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}
declare const value: CircularDeep;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF33CircularDeep(t, r, root)
}

func assertF33CircularDeep(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CircularDeep to appear exactly once in cache, got %d", got)
	}

	deep1 := walkProp(t, types, root, "deep1", false)
	deep2 := walkProp(t, types, deep1, "deep2", false)
	deep3 := walkProp(t, types, deep2, "deep3", false)
	deep4Member := findMember(types, deep3, "deep4")
	if deep4Member == nil {
		t.Fatalf("missing 'deep4' property; types=%+v", deep3.Children)
	}
	if !deep4Member.Optional {
		t.Fatalf("deep4 expected Optional=true, got %+v", deep4Member)
	}
	back := deref(types, deep4Member.Child)
	if back == nil {
		t.Fatalf("deep4.child did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected deep4.child to close cycle on rootID=%s, got %s", rootID, back.ID)
	}
}

// walkProp drills from `parent` into the named property's resolved child
// object. Fails the test on a missing property or a non-object-literal
// child. Used by the F33 deep-walk assertion.
func walkProp(t *testing.T, types []*protocol.RunType, parent *protocol.RunType, name string, expectOptional bool) *protocol.RunType {
	t.Helper()
	member := findMember(types, parent, name)
	if member == nil {
		t.Fatalf("missing %q property on %s; children=%+v", name, parent.ID, parent.Children)
	}
	if expectOptional && !member.Optional {
		t.Fatalf("%s.%s expected Optional=true, got %+v", parent.ID, name, member)
	}
	child := deref(types, member.Child)
	if child == nil || child.Kind != protocol.KindObjectLiteral {
		t.Fatalf("%s.%s child expected KindObjectLiteral, got %+v", parent.ID, name, child)
	}
	return child
}
