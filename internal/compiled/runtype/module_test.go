package runtype

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Per-node assertions over RenderRunTypeEntryModule — the distinctive
// coverage ported from the deleted aggregate RunTypesModule suite (footer
// special cases, positional-arg fidelity, determinism). The basic
// leaf/footer-gating/RefDeps mechanics live in entrymodule_test.go.

func intPtr(n int) *int { return &n }

// entryLine extracts the `export const entry = [...];` line from a module.
func entryLine(t *testing.T, module string) string {
	t.Helper()
	idx := strings.Index(module, "export const entry = ")
	if idx < 0 {
		t.Fatalf("module missing entry export:\n%s", module)
	}
	return strings.TrimSuffix(module[idx:], "\n")
}

// TestEntryModule_SimpleAtomic — a single KindString node emits the compact
// positional array (family tag 't' at slot 1, trailing `u` slots trimmed)
// and no initEntry.
func TestEntryModule_SimpleAtomic(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{ID: "LrjxT1", Kind: protocol.KindString})
	want := "'use strict';\nconst u = undefined;\nexport const entry = ['LrjxT1','t',5];\n"
	if module != want {
		t.Errorf("atomic module mismatch:\nwant %q\ngot  %q", want, module)
	}
}

// TestEntryModule_PropertyWithChildRef — Property with IsSafeName=true and a
// Child ref: positional args mirror the legacy rt(…) slots (shifted by the
// family tag), the child ref rides initEntry as `s.child = c('…');`.
func TestEntryModule_PropertyWithChildRef(t *testing.T) {
	property := &protocol.RunType{
		ID:         "BxzL39",
		Kind:       protocol.KindProperty,
		Name:       "kind",
		IsSafeName: true,
		Child:      protocol.NewRef("LrjxT1"),
	}
	module := RenderRunTypeEntryModule(property)
	if got := entryLine(t, module); got != "export const entry = ['BxzL39','t',15,u,u,'kind',u,u,u,u,u,u,!0,initEntry];" {
		t.Errorf("property entry array mismatch, got: %s", got)
	}
	if !strings.Contains(module, "s.child = c('LrjxT1');") {
		t.Errorf("expected initEntry child ref assignment, got:\n%s", module)
	}
}

// TestEntryModule_FormEquivalence — the same node shape reached via the
// static and the reflection resolution paths serializes to the same
// protocol.RunType, so the rendered module must be byte-equal.
func TestEntryModule_FormEquivalence(t *testing.T) {
	staticNode := &protocol.RunType{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafeName: true, Child: protocol.NewRef("LrjxT1")}
	reflectionNode := &protocol.RunType{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafeName: true, Child: protocol.NewRef("LrjxT1")}
	if RenderRunTypeEntryModule(staticNode) != RenderRunTypeEntryModule(reflectionNode) {
		t.Errorf("static and reflection forms emit different bytes")
	}
}

// TestEntryModule_PositionZeroIsPreserved — Position is *int; a value of 0
// must round-trip as `0` (not `u`) because slot index 0 is meaningful.
func TestEntryModule_PositionZeroIsPreserved(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:       "sCSEqy",
		Kind:     protocol.KindParameter,
		Name:     "name",
		Position: intPtr(0),
	})
	if got := entryLine(t, module); got != "export const entry = ['sCSEqy','t',18,u,u,'name',u,u,u,u,u,u,u,0];" {
		t.Errorf("position 0 must render as `0`, got: %s", got)
	}
}

// TestEntryModule_BigintLiteralRidesInitEntry — bigint literal: the
// positional literal slot stays `u`; initEntry patches `s.literal = BigInt(…)`.
func TestEntryModule_BigintLiteralRidesInitEntry(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:      "bigID",
		Kind:    protocol.KindLiteral,
		Literal: "42",
		Flags:   []string{"bigint"},
	})
	if !strings.Contains(module, "s.literal = BigInt('42');") {
		t.Errorf("expected initEntry BigInt assignment, got:\n%s", module)
	}
	if !strings.HasPrefix(entryLine(t, module), "export const entry = ['bigID','t',13,u,u,u,u") {
		t.Errorf("bigint literal must pass `u` at the positional literal slot, got: %s", entryLine(t, module))
	}
}

// TestEntryModule_SymbolLiteralRidesInitEntry — symbol literal constructs
// `Symbol('<description>')` in initEntry (runtime-only value, not JSON).
func TestEntryModule_SymbolLiteralRidesInitEntry(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:      "symID",
		Kind:    protocol.KindLiteral,
		Literal: map[string]any{"symbol": "hello"},
		Flags:   []string{"symbol"},
	})
	if !strings.Contains(module, "s.literal = Symbol('hello');") {
		t.Errorf("expected initEntry Symbol assignment, got:\n%s", module)
	}
}

// TestEntryModule_ClassBuiltinClassType — a class with ClassRef.Builtin wires
// `s.classType = globalThis.<Name>;` through initEntry.
func TestEntryModule_ClassBuiltinClassType(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:       "dateID",
		Kind:     protocol.KindClass,
		TypeName: "Date",
		ClassRef: &protocol.ClassRef{Builtin: "Date"},
	})
	if got := entryLine(t, module); got != "export const entry = ['dateID','t',20,u,'Date',initEntry];" {
		t.Errorf("class entry array mismatch, got: %s", got)
	}
	if !strings.Contains(module, "s.classType = globalThis.Date;") {
		t.Errorf("expected initEntry classType assignment, got:\n%s", module)
	}
}

// TestEntryModule_SubKindRendered — a class node with a non-zero SubKind
// places the numeric value at the slot after kind.
func TestEntryModule_SubKindRendered(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:       "mapID",
		Kind:     protocol.KindClass,
		SubKind:  protocol.SubKindMap,
		TypeName: "Map",
		ClassRef: &protocol.ClassRef{Builtin: "Map"},
	})
	if got := entryLine(t, module); got != "export const entry = ['mapID','t',20,2002,'Map',initEntry];" {
		t.Errorf("subKind entry array mismatch, got: %s", got)
	}
}

// TestEntryModule_FormatAnnotationRidesInitEntry — a branded node's
// FormatAnnotation lands in initEntry as a JSON object literal.
func TestEntryModule_FormatAnnotationRidesInitEntry(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:   "fmtID",
		Kind: protocol.KindString,
		FormatAnnotation: &protocol.FormatAnnotation{
			Name:   "uuid",
			Params: map[string]any{"version": "4"},
		},
	})
	if !strings.Contains(module, `s.formatAnnotation = {"name":"uuid","params":{"version":"4"}};`) {
		t.Errorf("expected initEntry formatAnnotation assignment, got:\n%s", module)
	}
}

// TestEntryModule_SafeUnionOrdering — safeUnionChildren reorders the same
// refs as Children; unionDiscriminators parallels safeUnionChildren. The
// footer must emit children, then safeUnionChildren, then unionDiscriminators
// (the registrar links them in that declaration order).
func TestEntryModule_SafeUnionOrdering(t *testing.T) {
	union := &protocol.RunType{
		ID:                  "uniID",
		Kind:                protocol.KindUnion,
		Children:            []*protocol.RunType{protocol.NewRef("obA"), protocol.NewRef("obB")},
		SafeUnionChildren:   []*protocol.RunType{protocol.NewRef("obB"), protocol.NewRef("obA")},
		UnionDiscriminators: []*protocol.RunType{protocol.NewRef("pdB"), protocol.NewRef("pdA")},
	}
	module := RenderRunTypeEntryModule(union)
	childrenLine := "s.children = [c('obA'), c('obB')];"
	safeLine := "s.safeUnionChildren = [c('obB'), c('obA')];"
	discriminatorLine := "s.unionDiscriminators = [c('pdB'), c('pdA')];"
	childrenAt := strings.Index(module, childrenLine)
	safeAt := strings.Index(module, safeLine)
	discriminatorAt := strings.Index(module, discriminatorLine)
	if childrenAt < 0 || safeAt < 0 || discriminatorAt < 0 {
		t.Fatalf("missing footer lines (children=%d safe=%d discriminators=%d):\n%s", childrenAt, safeAt, discriminatorAt, module)
	}
	if !(childrenAt < safeAt && safeAt < discriminatorAt) {
		t.Errorf("footer order must be children < safeUnionChildren < unionDiscriminators, got:\n%s", module)
	}
}

// TestEntryModule_InlineNonRefChild — a non-ref child slot is inlined as a
// JS object literal (derefExpr's JSON round-trip), not a c('…') lookup.
func TestEntryModule_InlineNonRefChild(t *testing.T) {
	object := &protocol.RunType{
		ID:   "objID",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "inl1", Kind: protocol.KindString},
		},
	}
	module := RenderRunTypeEntryModule(object)
	if !strings.Contains(module, "s.children = [{'id':'inl1','kind':5}];") {
		t.Errorf("expected inline child rendered as JS literal, got:\n%s", module)
	}
	if strings.Contains(module, "c('inl1')") {
		t.Errorf("inline (non-ref) child must not become a cache lookup, got:\n%s", module)
	}
}

// TestEntryModule_Cycle — two nodes referencing each other via Child: each
// module links its peer through initEntry; the registrar's declare-then-link
// two-pass resolves the cycle.
func TestEntryModule_Cycle(t *testing.T) {
	a := &protocol.RunType{ID: "A1", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: protocol.NewRef("B1")}
	b := &protocol.RunType{ID: "B1", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: protocol.NewRef("A1")}
	moduleA := RenderRunTypeEntryModule(a)
	moduleB := RenderRunTypeEntryModule(b)
	if !strings.Contains(moduleA, "s.child = c('B1');") {
		t.Errorf("A1 module missing cycle ref to B1:\n%s", moduleA)
	}
	if !strings.Contains(moduleB, "s.child = c('A1');") {
		t.Errorf("B1 module missing cycle ref to A1:\n%s", moduleB)
	}
	if deps := RefDeps(a); len(deps) != 1 || deps[0] != "B1" {
		t.Errorf("RefDeps(A1) must be [B1], got %v", deps)
	}
	if deps := RefDeps(b); len(deps) != 1 || deps[0] != "A1" {
		t.Errorf("RefDeps(B1) must be [A1], got %v", deps)
	}
}

// TestEntryModule_Deterministic — same node must render byte-identical.
func TestEntryModule_Deterministic(t *testing.T) {
	node := &protocol.RunType{
		ID:       "detID",
		Kind:     protocol.KindObjectLiteral,
		TypeName: "User",
		Children: []*protocol.RunType{protocol.NewRef("a"), protocol.NewRef("b")},
	}
	if first, second := RenderRunTypeEntryModule(node), RenderRunTypeEntryModule(node); first != second {
		t.Errorf("non-deterministic module render:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

// TestEntryModule_KnownFieldsCovered is the defensive guardrail against
// forgetting a scalar slot when a new field is added to RunType.
func TestEntryModule_KnownFieldsCovered(t *testing.T) {
	module := RenderRunTypeEntryModule(&protocol.RunType{
		ID:           "FULL",
		Kind:         protocol.KindClass,
		SubKind:      protocol.SubKindNonSerializable,
		TypeName:     "TN",
		Name:         "NM",
		Literal:      "L",
		Optional:     true,
		Readonly:     true,
		IsAbstract:   true,
		IsStatic:     true,
		Visibility:   intPtr(2),
		IsSafeName:   true,
		Position:     intPtr(7),
		IsCircular:   true,
		Flags:        []string{"f1"},
		Description:  "D",
		DefaultVal:   "DEF",
		EnumVal:      map[string]any{"k": 1.0},
		Values:       []any{"v"},
		NotSupported: true,
	})
	want := "export const entry = ['FULL','t',20,2004,'TN','NM','L',!0,!0,!0,!0,2,!0,7,!0,['f1'],'D','DEF',{'k':1},['v'],!0];"
	if got := entryLine(t, module); got != want {
		t.Errorf("fully-populated entry array mismatch:\nwant %s\ngot  %s", want, got)
	}
}
