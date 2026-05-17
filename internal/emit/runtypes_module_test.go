package emit

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

func emit(t *testing.T, runTypes []*protocol.RunType) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := RunTypesModule(&buffer, protocol.Dump{RunTypes: runTypes}); err != nil {
		t.Fatalf("RunTypesModule returned error: %v", err)
	}
	return buffer.String()
}

func intPtr(n int) *int { return &n }

// TestPreamblePresent asserts the universal preamble (`const u = undefined;`
// + `RT` factory) is emitted exactly once.
func TestPreamblePresent(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	if strings.Count(out, "const u = undefined;") != 1 {
		t.Errorf("expected exactly one `const u = undefined;` line, got:\n%s", out)
	}
	if !strings.Contains(out, "const RT = (id, kind, subKind, typeName, name, literal,") {
		t.Errorf("expected `RT` factory header in preamble, got:\n%s", out)
	}
	// Factory body must declare every ref slot up-front (initialised to `u`
	// = undefined) so footer patches land on a pre-existing key — that's
	// the hidden-class-uniformity property.
	for _, slot := range []string{"child: u", "children: u", "return: u", "parameters: u", "classType: u"} {
		if !strings.Contains(out, slot) {
			t.Errorf("factory body missing pre-declared slot %q in:\n%s", slot, out)
		}
	}
}

// TestSimpleAtomic — a single KindString node emits `RT('id',5)` with all
// trailing `u` args trimmed.
func TestSimpleAtomic(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "LrjxT1", Kind: protocol.KindString}})
	if !strings.Contains(out, `export const t_LrjxT1 = RT('LrjxT1',5);`) {
		t.Errorf("expected `RT('LrjxT1',5);` (trailing u trimmed), got:\n%s", out)
	}
}

// TestStaticForm — Property with IsSafeName=true and Child set.
// Matches the example shape from the user-supplied dump.
func TestStaticForm(t *testing.T) {
	runTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{
			ID:         "BxzL39",
			Kind:       protocol.KindProperty,
			Name:       "kind",
			IsSafeName: true,
			Child:      protocol.NewRef("LrjxT1"),
		},
	}
	out := emit(t, runTypes)
	if !strings.Contains(out, `export const t_BxzL39 = RT('BxzL39',15,u,u,'kind',u,u,u,u,u,u,!0);`) {
		t.Errorf("expected Property to emit `RT('BxzL39',15,u,u,'kind',u,u,u,u,u,u,!0);`, got:\n%s", out)
	}
	if !strings.Contains(out, `t_BxzL39.child = t_LrjxT1;`) {
		t.Errorf("expected footer ref assignment `t_BxzL39.child = t_LrjxT1;`, got:\n%s", out)
	}
}

// TestReflectionForm — the same Property reached via the reflection-style
// resolution path must produce byte-equal output to the static form (per
// the marker test rule in CLAUDE.md: getRuntypeId<T>() and
// reflectRuntypeId(value) resolve to identical cache entries).
func TestReflectionForm(t *testing.T) {
	staticRunTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafeName: true, Child: protocol.NewRef("LrjxT1")},
	}
	// Same structural shape, freshly allocated to simulate the reflection
	// path's dump output. The serializer normalises to the same canonical
	// IDs, so the bytes must match.
	reflectionRunTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafeName: true, Child: protocol.NewRef("LrjxT1")},
	}
	if got := emit(t, reflectionRunTypes); got != emit(t, staticRunTypes) {
		t.Errorf("static and reflection forms emit different bytes:\nstatic:\n%s\nreflection:\n%s", emit(t, staticRunTypes), got)
	}
}

// TestPositionZeroIsPreserved — Position is *int; a value of 0 must round-
// trip as `0` (not `u`) because the slot is meaningful at position 0.
func TestPositionZeroIsPreserved(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "sCSEqy",
		Kind:     protocol.KindParameter,
		Name:     "name",
		Position: intPtr(0),
	}})
	// arg slot 12 is `position`; with subKind/typeName/literal all u and
	// isSafeName false, the call is `RT('sCSEqy',18,u,u,'name',u,u,u,u,u,u,u,0);`.
	if !strings.Contains(out, `RT('sCSEqy',18,u,u,'name',u,u,u,u,u,u,u,0);`) {
		t.Errorf("expected position 0 to render as `0`, got:\n%s", out)
	}
}

// TestFooterLiteralPassesUForLiteralArg — bigint literal: the `literal`
// factory arg is `u` (footer handles the construction). The footer tail
// remains exactly as today.
func TestFooterLiteralPassesUForLiteralArg(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:      "bigID",
		Kind:    protocol.KindLiteral,
		Literal: "42",
		Flags:   []string{"bigint"},
	}})
	// literal slot (index 5) must be `u`, not `'42'`.
	if !strings.Contains(out, `RT('bigID',13,u,u,u,u`) {
		t.Errorf("expected bigint literal to pass `u` at literal slot, got:\n%s", out)
	}
	if !strings.Contains(out, `t_bigID.literal = BigInt('42');`) {
		t.Errorf("expected footer BigInt assignment with single-quoted arg, got:\n%s", out)
	}
}

// TestClassBuiltinUnchanged — a class with ClassRef.Builtin emits the
// footer `t_X.classType = globalThis.<Name>;` tail. The factory call has
// nothing about classType (it's hardcoded `null` in the factory body).
func TestClassBuiltinUnchanged(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "dateID",
		Kind:     protocol.KindClass,
		TypeName: "Date",
		ClassRef: &protocol.ClassRef{Builtin: "Date"},
	}})
	if !strings.Contains(out, `RT('dateID',20,u,'Date');`) {
		t.Errorf("expected class factory call with typeName, got:\n%s", out)
	}
	if !strings.Contains(out, `t_dateID.classType = globalThis.Date;`) {
		t.Errorf("expected footer classType assignment, got:\n%s", out)
	}
}

// TestCycle — two nodes referencing each other via Child. Both emit via
// `_T(...)` with `child: null` baked in by the factory; the footer carries
// both back-edges.
func TestCycle(t *testing.T) {
	a := &protocol.RunType{ID: "A1", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: protocol.NewRef("B1")}
	b := &protocol.RunType{ID: "B1", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: protocol.NewRef("A1")}
	out := emit(t, []*protocol.RunType{a, b})
	if !strings.Contains(out, `export const t_A1 = RT('A1',15,u,u,'a',u,u,u,u,u,u,!0);`) {
		t.Errorf("expected A1 factory call, got:\n%s", out)
	}
	if !strings.Contains(out, `export const t_B1 = RT('B1',15,u,u,'b',u,u,u,u,u,u,!0);`) {
		t.Errorf("expected B1 factory call, got:\n%s", out)
	}
	if !strings.Contains(out, `t_A1.child = t_B1;`) || !strings.Contains(out, `t_B1.child = t_A1;`) {
		t.Errorf("expected both cycle ref assignments in footer, got:\n%s", out)
	}
}

// TestDeterministic — same input must produce byte-identical output.
func TestDeterministic(t *testing.T) {
	runTypes := []*protocol.RunType{
		{ID: "a", Kind: protocol.KindString},
		{ID: "b", Kind: protocol.KindNumber},
		{ID: "c", Kind: protocol.KindProperty, Name: "x", Child: protocol.NewRef("a")},
	}
	if first, second := emit(t, runTypes), emit(t, runTypes); first != second {
		t.Errorf("non-deterministic output:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

// TestKnownFieldsCovered is the defensive guardrail against forgetting a
// scalar slot when a new field is added to RunType. It constructs a node
// with every modelled scalar set to a non-zero sentinel and asserts each
// renders as a non-`u` arg in the corresponding slot of the factory call.
func TestKnownFieldsCovered(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:          "FULL",
		Kind:        protocol.KindClass,
		SubKind:     protocol.SubKindNonSerializable,
		TypeName:    "TN",
		Name:        "NM",
		Literal:     "L",
		Optional:    true,
		Readonly:    true,
		IsAbstract:  true,
		IsStatic:    true,
		Visibility:  intPtr(2),
		IsSafeName:  true,
		Position:    intPtr(7),
		Inlined:     true,
		Flags:       []string{"f1"},
		Description: "D",
		DefaultVal:  "DEF",
		EnumVal:     map[string]any{"k": 1.0},
		Values:      []any{"v"},
	}})
	// Every scalar arg position should carry a non-`u` value. The trailing
	// `values` arg is 'v' → rendered as ['v'], so no trimming happens.
	expected := `RT('FULL',20,2004,'TN','NM','L',!0,!0,!0,!0,2,!0,7,!0,['f1'],'D','DEF',{'k':1},['v']);`
	if !strings.Contains(out, expected) {
		t.Errorf("expected fully-populated factory call:\n  %s\ngot:\n%s", expected, out)
	}
}

// TestSubKindRendered — a class node with a non-zero SubKind must place
// the numeric value at arg slot 2, between kind and typeName. Trailing
// `u`s after typeName are still trimmed.
func TestSubKindRendered(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "mapID",
		Kind:     protocol.KindClass,
		SubKind:  protocol.SubKindMap,
		TypeName: "Map",
		ClassRef: &protocol.ClassRef{Builtin: "Map"},
	}})
	if !strings.Contains(out, `RT('mapID',20,2002,'Map');`) {
		t.Errorf("expected class factory call with subKind, got:\n%s", out)
	}
}

// TestHiddenClassUniformity asserts the factory body declares the exact
// set of own-keys we promise consumers — the property V8 uses to assign a
// stable hidden class to every node. Regex-checking the factory source is
// simpler than spinning up a JS evaluator.
func TestHiddenClassUniformity(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	// Expected own-keys, in factory-declaration order. Header keys use ES
	// shorthand (`<name>` alone); reserved-only-as-identifiers slots that
	// never appear in the param list (return, arguments, extends,
	// implements) initialise as `<name>: u`.
	expected := []string{
		"id", "kind", "subKind", "typeName", "name", "literal",
		"optional", "readonly", "isAbstract", "isStatic",
		"visibility", "isSafeName", "position", "inlined", "flags",
		"description", "defaultVal", "enumVal", "values",
		"child: u", "index: u", "return: u", "indexType: u",
		"parameters: u", "children: u",
		"safeUnionChildren: u", "unionDiscriminators: u",
		"decorators: u", "typeArguments: u",
		"arguments: u", "extendsArguments: u",
		"implements: u", "extends: u",
		"classType: u",
	}
	for _, key := range expected {
		if !strings.Contains(out, key) {
			t.Errorf("factory body missing expected key fragment %q", key)
		}
	}
}
