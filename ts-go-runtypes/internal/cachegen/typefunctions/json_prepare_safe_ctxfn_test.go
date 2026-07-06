package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// A mixed-optionality object safe-clone at ROOT must splice its accumulator
// block directly as the factory body — not hoist it into a context fn and
// return `return ctxFn0(v)`. The context-fn indirection only earns its keep
// in an expression slot (a union clause); at a return slot it's dead weight.
func TestPrepareForJsonSafe_RootObjectSplicesBlockNoCtxFn(t *testing.T) {
	strRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	boolRT := &protocol.RunType{ID: "bool", Kind: protocol.KindBoolean}
	arrRT := &protocol.RunType{ID: "arr", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindRef}}

	propID := &protocol.RunType{ID: "pId", Kind: protocol.KindPropertySignature, Name: "id", IsSafeName: true, Child: &protocol.RunType{ID: "num", Kind: protocol.KindRef}}
	propName := &protocol.RunType{ID: "pName", Kind: protocol.KindPropertySignature, Name: "name", IsSafeName: true, Child: &protocol.RunType{ID: "str", Kind: protocol.KindRef}}
	propTags := &protocol.RunType{ID: "pTags", Kind: protocol.KindPropertySignature, Name: "tags", IsSafeName: true, Child: &protocol.RunType{ID: "arr", Kind: protocol.KindRef}}
	propActive := &protocol.RunType{ID: "pActive", Kind: protocol.KindPropertySignature, Name: "active", IsSafeName: true, Optional: true, Child: &protocol.RunType{ID: "bool", Kind: protocol.KindRef}}

	obj := &protocol.RunType{
		ID:   "MyType",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "pId", Kind: protocol.KindRef},
			{ID: "pName", Kind: protocol.KindRef},
			{ID: "pTags", Kind: protocol.KindRef},
			{ID: "pActive", Kind: protocol.KindRef},
		},
	}

	w := NewWalker(obj, "pjs_MyType", PrepareForJsonSafeEmitter{})
	w.InnerPrefix = "pjs_"
	w.RefTable = map[string]*protocol.RunType{
		"str": strRT, "num": numRT, "bool": boolRT, "arr": arrRT,
		"pId": propID, "pName": propName, "pTags": propTags, "pActive": propActive,
		"MyType": obj,
	}
	decl, noop, unsupported := w.Compile()
	if noop || unsupported {
		t.Fatalf("expected a real body, got noop=%v unsupported=%v", noop, unsupported)
	}

	want := "function pjs_MyType(v){const _r={id:v.id,name:v.name,tags:v.tags};" +
		"if (v.active !== undefined) _r['active']=v.active;return _r;}"
	if decl != want {
		t.Errorf("root object safe-clone body mismatch:\nwant %q\ngot  %q", want, decl)
	}
	if strings.Contains(decl, "ctxFn") {
		t.Errorf("root object body must not hoist into a ctxFn:\n%s", decl)
	}
	if ctx := w.ContextLines(); ctx != "" {
		t.Errorf("root object must register no context fn, got:\n%s", ctx)
	}
}

// A mixed-optionality object nested at a property expression slot hoists into
// EXACTLY ONE context fn — the block itself — never a ctxFn that just calls
// another ctxFn (the old double-hoist: buildSafeObjectLiteral pre-hoisted, then
// the walker wrapped the resulting `return ctxFn0(v)` again).
func TestPrepareForJsonSafe_NestedObjectSingleCtxFn(t *testing.T) {
	strRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}

	innerX := &protocol.RunType{ID: "iX", Kind: protocol.KindPropertySignature, Name: "x", IsSafeName: true, Child: &protocol.RunType{ID: "num", Kind: protocol.KindRef}}
	innerY := &protocol.RunType{ID: "iY", Kind: protocol.KindPropertySignature, Name: "y", IsSafeName: true, Optional: true, Child: &protocol.RunType{ID: "num", Kind: protocol.KindRef}}
	inner := &protocol.RunType{ // unnamed inline object → inlines into parent
		ID:   "inner",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "iX", Kind: protocol.KindRef},
			{ID: "iY", Kind: protocol.KindRef},
		},
	}
	propA := &protocol.RunType{ID: "pA", Kind: protocol.KindPropertySignature, Name: "a", IsSafeName: true, Child: &protocol.RunType{ID: "str", Kind: protocol.KindRef}}
	propB := &protocol.RunType{ID: "pB", Kind: protocol.KindPropertySignature, Name: "b", IsSafeName: true, Child: &protocol.RunType{ID: "inner", Kind: protocol.KindRef}}
	outer := &protocol.RunType{
		ID:   "Outer",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "pA", Kind: protocol.KindRef},
			{ID: "pB", Kind: protocol.KindRef},
		},
	}

	w := NewWalker(outer, "pjs_Outer", PrepareForJsonSafeEmitter{})
	w.InnerPrefix = "pjs_"
	w.RefTable = map[string]*protocol.RunType{
		"str": strRT, "num": numRT,
		"iX": innerX, "iY": innerY, "inner": inner,
		"pA": propA, "pB": propB, "Outer": outer,
	}
	decl, _, _ := w.Compile()
	ctx := w.ContextLines()

	if !strings.Contains(decl, "b:ctxFn0(v)") {
		t.Errorf("nested object should hoist into a single ctxFn0 call:\n%s", decl)
	}
	if strings.Contains(decl, "ctxFn1") || strings.Contains(ctx, "ctxFn1") {
		t.Errorf("nested object must not double-hoist (no ctxFn1):\ndecl=%s\nctx=%s", decl, ctx)
	}
	// The single ctxFn must BE the block, not a wrapper calling another ctxFn.
	if strings.Contains(ctx, "return ctxFn") {
		t.Errorf("ctxFn0 must contain the clone block, not `return ctxFnN(...)`:\n%s", ctx)
	}
	if !strings.Contains(ctx, "const _r={x:v.b.x};") {
		t.Errorf("ctxFn0 body should be the accumulator block:\n%s", ctx)
	}
}
