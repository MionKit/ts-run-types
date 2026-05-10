package resolver_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

func fixturesDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs("../testfixtures")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

func setup(t *testing.T) *resolver.Resolver {
	t.Helper()
	p, err := program.New(program.Options{
		Cwd:            fixturesDir(t),
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
	})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	r, err := resolver.New(p)
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

func locate(t *testing.T, r *resolver.Resolver, file, needle string) int {
	t.Helper()
	abs := filepath.Join(fixturesDir(t), file)
	sf := r.Program.SourceFile(abs)
	if sf == nil {
		t.Fatalf("source file not loaded: %s", abs)
	}
	idx := strings.Index(sf.Text(), needle)
	if idx < 0 {
		t.Fatalf("needle %q not found in %s", needle, file)
	}
	return idx
}

func typeByID(types []*protocol.Type, id int) *protocol.Type {
	for _, t := range types {
		if t.ID == id {
			return t
		}
	}
	return nil
}

// deref walks a single ref slot to the actual Type entry in `types`.
func deref(types []*protocol.Type, ref *protocol.Type) *protocol.Type {
	if ref == nil {
		return nil
	}
	if ref.Kind == protocol.KindRef {
		return typeByID(types, ref.ID)
	}
	return ref
}

func dump(r *resolver.Resolver) []*protocol.Type {
	return r.Dispatch(protocol.Request{Op: "dump"}).Types
}

// findMember walks an objectLiteral / class root and returns the named member.
func findMember(types []*protocol.Type, root *protocol.Type, name string) *protocol.Type {
	for _, ref := range root.Types {
		m := deref(types, ref)
		if m != nil && m.Name == name {
			return m
		}
	}
	return nil
}

// ---- F1 — annotation primitive -----------------------------------------------

func TestF1_AnnotationPrimitive(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f1_annotation_primitive.ts", "getTypeInfo(")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f1_annotation_primitive.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	tn := typeByID(dump(r), resp.ID)
	if tn == nil {
		t.Fatalf("type %d missing", resp.ID)
	}
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
}

// ---- F2 — annotation object alias `User` -------------------------------------

func TestF2_AnnotationObject(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f2_annotation_object.ts", "isType<User>(")
	resp := r.Dispatch(protocol.Request{Op: "resolveTypeArgument", File: "f2_annotation_object.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	if root.TypeName != "User" {
		t.Fatalf("expected typeName=User, got %q", root.TypeName)
	}
	id := findMember(types, root, "id")
	name := findMember(types, root, "name")
	if id == nil || name == nil {
		t.Fatalf("missing id/name members; types=%+v", root.Types)
	}
	if id.Kind != protocol.KindPropertySignature || name.Kind != protocol.KindPropertySignature {
		t.Fatalf("expected propertySignature kind, got id=%d name=%d", id.Kind, name.Kind)
	}
	idT := deref(types, id.Type)
	nameT := deref(types, name.Type)
	if idT == nil || idT.Kind != protocol.KindNumber {
		t.Fatalf("id.type expected number, got %+v", idT)
	}
	if nameT == nil || nameT.Kind != protocol.KindString {
		t.Fatalf("name.type expected string, got %+v", nameT)
	}
}

// ---- F3 — discriminated union ------------------------------------------------

func TestF3_Union(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f3_union.ts", "isType<Result>(")
	resp := r.Dispatch(protocol.Request{Op: "resolveTypeArgument", File: "f3_union.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	root := typeByID(dump(r), resp.ID)
	if root == nil || root.Kind != protocol.KindUnion {
		t.Fatalf("expected union, got %+v", root)
	}
	if len(root.Types) != 2 {
		t.Fatalf("expected 2 union members, got %d", len(root.Types))
	}
}

// ---- F4 — inferred literal (number) ------------------------------------------

func TestF4_InferredLiteral(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f4_inferred_literal.ts", "getTypeInfo(")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f4_inferred_literal.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	tn := typeByID(dump(r), resp.ID)
	switch tn.Kind {
	case protocol.KindNumber:
		// widened
	case protocol.KindLiteral:
		// literal preserved — still acceptable
	default:
		t.Fatalf("expected number-ish, got kind=%d", tn.Kind)
	}
}

// ---- F5 — inferred function with inferred return -----------------------------

func TestF5_InferredFunction(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f5_inferred_function.ts", "getTypeInfo(add)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f5_inferred_function.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindFunction {
		t.Fatalf("expected function, got %+v", root)
	}
	if len(root.Parameters) != 2 {
		t.Fatalf("expected 2 params, got %d", len(root.Parameters))
	}
	a := deref(types, root.Parameters[0])
	if a == nil || a.Kind != protocol.KindParameter || a.Name != "a" {
		t.Fatalf("first param expected parameter:a, got %+v", a)
	}
	aType := deref(types, a.Type)
	if aType == nil || aType.Kind != protocol.KindNumber {
		t.Fatalf("param a type expected number, got %+v", aType)
	}
	ret := deref(types, root.Return)
	if ret == nil || ret.Kind != protocol.KindNumber {
		t.Fatalf("return expected number, got %+v", ret)
	}
}

// ---- F6 — router(routes) inferred from generic R -----------------------------

func TestF6_RouterInference(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f6_router_inference.ts", "router(routes)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f6_router_inference.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	sayHello := findMember(types, root, "sayHello")
	if sayHello == nil {
		t.Fatalf("missing sayHello member")
	}
	// Is methodSignature (single call sig + no own props in the property type) OR propertySignature whose .type is a function.
	var fn *protocol.Type
	switch sayHello.Kind {
	case protocol.KindMethodSignature:
		fn = sayHello
	case protocol.KindPropertySignature:
		fn = deref(types, sayHello.Type)
	default:
		t.Fatalf("sayHello has unexpected kind %d", sayHello.Kind)
	}
	if fn == nil {
		t.Fatalf("sayHello has no function shape")
	}
	if len(fn.Parameters) != 1 {
		t.Fatalf("expected 1 param, got %d", len(fn.Parameters))
	}
	pname := deref(types, fn.Parameters[0])
	if pname == nil || pname.Name != "name" {
		t.Fatalf("expected param name=name, got %+v", pname)
	}
	pT := deref(types, pname.Type)
	if pT == nil || pT.Kind != protocol.KindString {
		t.Fatalf("name param expected string, got %+v", pT)
	}
	ret := deref(types, fn.Return)
	if ret == nil || ret.Kind != protocol.KindString {
		t.Fatalf("return expected string, got %+v", ret)
	}
}

// ---- F7 — inferred generic ---------------------------------------------------

func TestF7_InferredGeneric(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f7_inferred_generic.ts", "getTypeInfo(wrap")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f7_inferred_generic.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	a := findMember(types, root, "a")
	b := findMember(types, root, "b")
	if a == nil || b == nil {
		t.Fatalf("missing a/b properties")
	}
	if deref(types, a.Type).Kind != protocol.KindNumber {
		t.Fatalf("a expected number, got %+v", deref(types, a.Type))
	}
	if deref(types, b.Type).Kind != protocol.KindString {
		t.Fatalf("b expected string, got %+v", deref(types, b.Type))
	}
}

// ---- F8 — factory inference --------------------------------------------------

func TestF8_FactoryInference(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f8_factory_inference.ts", "getTypeInfo(u)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f8_factory_inference.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	id := findMember(types, root, "id")
	name := findMember(types, root, "name")
	if id == nil || deref(types, id.Type).Kind != protocol.KindNumber {
		t.Fatalf("id expected number, got %+v", id)
	}
	if name == nil || deref(types, name.Type).Kind != protocol.KindString {
		t.Fatalf("name expected string, got %+v", name)
	}
}

// ---- Dedup -------------------------------------------------------------------

func TestDedupAcrossQueries(t *testing.T) {
	r := setup(t)
	p1 := locate(t, r, "f1_annotation_primitive.ts", "getTypeInfo(")
	p4 := locate(t, r, "f4_inferred_literal.ts", "getTypeInfo(")
	r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f1_annotation_primitive.ts", CallPos: p1, Index: 0})
	r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f4_inferred_literal.ts", CallPos: p4, Index: 0})
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f1_annotation_primitive.ts", CallPos: p1, Index: 0})
	if len(resp.Added) != 0 {
		t.Fatalf("expected no new types on dedup, got %d", len(resp.Added))
	}
}

// ---- F12 — array (`string[]`) ------------------------------------------------

func TestF12_Array(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f12_array.ts", "getTypeInfo(xs)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f12_array.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindArray {
		t.Fatalf("expected array, got %+v", root)
	}
	elem := deref(types, root.Type)
	if elem == nil || elem.Kind != protocol.KindString {
		t.Fatalf("array element expected string, got %+v", elem)
	}
}

// ---- F13 — tuple (`[number, string?]`) ---------------------------------------

func TestF13_Tuple(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f13_tuple.ts", "getTypeInfo(tup)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f13_tuple.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindTuple {
		t.Fatalf("expected tuple, got %+v", root)
	}
	if len(root.Types) != 2 {
		t.Fatalf("expected 2 tuple members, got %d", len(root.Types))
	}
	first := deref(types, root.Types[0])
	second := deref(types, root.Types[1])
	if first == nil || first.Kind != protocol.KindTupleMember || deref(types, first.Type).Kind != protocol.KindNumber {
		t.Fatalf("first member expected tupleMember:number, got %+v", first)
	}
	if second == nil || second.Kind != protocol.KindTupleMember {
		t.Fatalf("second member expected tupleMember, got %+v", second)
	}
	if !second.Optional {
		t.Fatalf("second member expected optional=true")
	}
	if deref(types, second.Type).Kind != protocol.KindString {
		t.Fatalf("second member type expected string, got %+v", deref(types, second.Type))
	}
}

// ---- F14 — promise (`Promise<number>`) ---------------------------------------

func TestF14_Promise(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f14_promise.ts", "getTypeInfo(p)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f14_promise.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindPromise {
		t.Fatalf("expected promise, got %+v", root)
	}
	val := deref(types, root.Type)
	if val == nil || val.Kind != protocol.KindNumber {
		t.Fatalf("promise value expected number, got %+v", val)
	}
}

// ---- F15 — class -------------------------------------------------------------

func TestF15_Class(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f15_class.ts", "isType<User>(")
	resp := r.Dispatch(protocol.Request{Op: "resolveTypeArgument", File: "f15_class.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindClass {
		t.Fatalf("expected class, got %+v", root)
	}
	if root.TypeName != "User" {
		t.Fatalf("expected class typeName=User, got %q", root.TypeName)
	}
	id := findMember(types, root, "id")
	greet := findMember(types, root, "greet")
	if id == nil || id.Kind != protocol.KindProperty {
		t.Fatalf("id expected class property, got %+v", id)
	}
	if greet == nil || greet.Kind != protocol.KindMethod {
		t.Fatalf("greet expected class method, got %+v", greet)
	}
}

// ---- F16 — index signature ---------------------------------------------------

func TestF16_IndexSignature(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f16_index_signature.ts", "isType<M>(")
	resp := r.Dispatch(protocol.Request{Op: "resolveTypeArgument", File: "f16_index_signature.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	var idx *protocol.Type
	for _, ref := range root.Types {
		m := deref(types, ref)
		if m != nil && m.Kind == protocol.KindIndexSignature {
			idx = m
			break
		}
	}
	if idx == nil {
		t.Fatalf("expected at least one indexSignature, got types=%+v", root.Types)
	}
	if deref(types, idx.Index).Kind != protocol.KindString {
		t.Fatalf("index expected string, got %+v", deref(types, idx.Index))
	}
	if deref(types, idx.Type).Kind != protocol.KindNumber {
		t.Fatalf("value expected number, got %+v", deref(types, idx.Type))
	}
}
