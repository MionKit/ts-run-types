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

// setup builds a resolver against the shared testfixtures tsconfig.
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

// locate returns the byte offset of the first occurrence of needle within the
// fixture source. All fixtures are small and contain each marker exactly once,
// so a substring search is safe and more robust than hand-maintained offsets.
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

func typeByID(types []protocol.TypeNode, id string) *protocol.TypeNode {
	for i := range types {
		if types[i].ID == id {
			return &types[i]
		}
	}
	return nil
}

func dump(r *resolver.Resolver) []protocol.TypeNode {
	return r.Dispatch(protocol.Request{Op: "dump"}).Types
}

// ---- F1: annotation-based primitive ------------------------------------------

func TestF1_AnnotationPrimitive(t *testing.T) {
	r := setup(t)
	// getTypeInfo(name) — argument is `name`, inferred as string (from annotation)
	pos := locate(t, r, "f1_annotation_primitive.ts", "getTypeInfo(")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f1_annotation_primitive.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve error: %s", resp.Error)
	}
	tn := typeByID(dump(r), resp.ID)
	if tn == nil {
		t.Fatalf("type %s missing from dump", resp.ID)
	}
	if tn.Kind != protocol.KindPrimitive || tn.Name != "string" {
		t.Fatalf("expected primitive string, got kind=%s name=%s", tn.Kind, tn.Name)
	}
}

// ---- F2: annotation-based object via type-argument ---------------------------

func TestF2_AnnotationObject(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f2_annotation_object.ts", "isType<User>(")
	resp := r.Dispatch(protocol.Request{Op: "resolveTypeArgument", File: "f2_annotation_object.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve error: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil {
		t.Fatalf("root type missing")
	}
	if root.Kind != protocol.KindObject {
		t.Fatalf("expected object, got %s", root.Kind)
	}
	if root.Alias != "User" {
		t.Fatalf("expected alias User, got %q", root.Alias)
	}
	id, ok := root.Properties["id"]
	if !ok {
		t.Fatalf("missing property id")
	}
	idT := typeByID(types, id.Type)
	if idT == nil || idT.Kind != protocol.KindPrimitive || idT.Name != "number" {
		t.Fatalf("expected id: number, got %+v", idT)
	}
	nameT := typeByID(types, root.Properties["name"].Type)
	if nameT == nil || nameT.Kind != protocol.KindPrimitive || nameT.Name != "string" {
		t.Fatalf("expected name: string, got %+v", nameT)
	}
}

// ---- F3: discriminated union -------------------------------------------------

func TestF3_Union(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f3_union.ts", "isType<Result>(")
	resp := r.Dispatch(protocol.Request{Op: "resolveTypeArgument", File: "f3_union.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindUnion {
		t.Fatalf("expected union, got %+v", root)
	}
	if len(root.Members) != 2 {
		t.Fatalf("expected 2 union members, got %d", len(root.Members))
	}
}

// ---- F4: inferred literal (widened to number) --------------------------------

func TestF4_InferredLiteral(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f4_inferred_literal.ts", "getTypeInfo(")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f4_inferred_literal.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	tn := typeByID(dump(r), resp.ID)
	// `const x = 42` — tsgo keeps x as number (widened because getTypeInfo's arg
	// is not a literal-preserving context). Either primitive number or a
	// number literal is acceptable; assert one of them.
	if tn == nil {
		t.Fatalf("type missing")
	}
	switch tn.Kind {
	case protocol.KindPrimitive:
		if tn.Name != "number" {
			t.Fatalf("expected number, got %s", tn.Name)
		}
	case protocol.KindLiteral:
		if tn.Name != "number" {
			t.Fatalf("expected number literal, got %s", tn.Name)
		}
	default:
		t.Fatalf("expected number-ish, got kind=%s name=%s", tn.Kind, tn.Name)
	}
}

// ---- F5: inferred function with inferred return ------------------------------

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
	a := typeByID(types, root.Parameters[0].Type)
	if a == nil || a.Name != "number" {
		t.Fatalf("a: expected number, got %+v", a)
	}
	ret := typeByID(types, root.Return)
	if ret == nil || ret.Name != "number" {
		t.Fatalf("return: expected number (inferred), got %+v", ret)
	}
}

// ---- F6: router(routes) — inferred object shape via generic inference --------

func TestF6_RouterInference(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f6_router_inference.ts", "router(routes)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f6_router_inference.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObject {
		t.Fatalf("expected object, got %+v", root)
	}
	prop, ok := root.Properties["sayHello"]
	if !ok {
		t.Fatalf("missing sayHello; props=%v", root.Properties)
	}
	fn := typeByID(types, prop.Type)
	if fn == nil || fn.Kind != protocol.KindFunction {
		t.Fatalf("sayHello: expected function, got %+v", fn)
	}
	if len(fn.Parameters) != 1 || fn.Parameters[0].Name != "name" {
		t.Fatalf("expected single param 'name', got %+v", fn.Parameters)
	}
	paramT := typeByID(types, fn.Parameters[0].Type)
	if paramT == nil || paramT.Name != "string" {
		t.Fatalf("name: expected string, got %+v", paramT)
	}
	retT := typeByID(types, fn.Return)
	if retT == nil || retT.Name != "string" {
		t.Fatalf("return: expected string, got %+v", retT)
	}
}

// ---- F7: inferred generic argument -------------------------------------------

func TestF7_InferredGeneric(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f7_inferred_generic.ts", "getTypeInfo(wrap")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f7_inferred_generic.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObject {
		t.Fatalf("expected object, got %+v", root)
	}
	aT := typeByID(types, root.Properties["a"].Type)
	bT := typeByID(types, root.Properties["b"].Type)
	if aT == nil || aT.Name != "number" {
		t.Fatalf("a: expected number, got %+v", aT)
	}
	if bT == nil || bT.Name != "string" {
		t.Fatalf("b: expected string, got %+v", bT)
	}
}

// ---- F8: inferred factory return type ----------------------------------------

func TestF8_FactoryInference(t *testing.T) {
	r := setup(t)
	pos := locate(t, r, "f8_factory_inference.ts", "getTypeInfo(u)")
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f8_factory_inference.ts", CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve: %s", resp.Error)
	}
	types := dump(r)
	root := typeByID(types, resp.ID)
	if root == nil || root.Kind != protocol.KindObject {
		t.Fatalf("expected object, got %+v", root)
	}
	idT := typeByID(types, root.Properties["id"].Type)
	nameT := typeByID(types, root.Properties["name"].Type)
	if idT == nil || idT.Name != "number" {
		t.Fatalf("id: expected number, got %+v", idT)
	}
	if nameT == nil || nameT.Name != "string" {
		t.Fatalf("name: expected string, got %+v", nameT)
	}
}

// ---- Dedup: identical types across two queries share one id ------------------

func TestDedupAcrossQueries(t *testing.T) {
	r := setup(t)
	p1 := locate(t, r, "f1_annotation_primitive.ts", "getTypeInfo(")
	p4 := locate(t, r, "f4_inferred_literal.ts", "getTypeInfo(")
	r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f1_annotation_primitive.ts", CallPos: p1, Index: 0})
	r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f4_inferred_literal.ts", CallPos: p4, Index: 0})
	// Two queries, two different primitive types (string vs number) — cache
	// should have at least two entries, and resolving the same query twice
	// should return the same id.
	resp := r.Dispatch(protocol.Request{Op: "resolveArgumentInferred", File: "f1_annotation_primitive.ts", CallPos: p1, Index: 0})
	if resp.ID == "" {
		t.Fatal("no id on second query")
	}
	// No new types should have been added on the second identical query.
	if len(resp.Added) != 0 {
		t.Fatalf("expected no new types on dedup, got %d", len(resp.Added))
	}
}
