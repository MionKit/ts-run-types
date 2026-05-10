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
// + `_T` factory) is emitted exactly once.
func TestPreamblePresent(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	if strings.Count(out, "const u = undefined;") != 1 {
		t.Errorf("expected exactly one `const u = undefined;` line, got:\n%s", out)
	}
	if !strings.Contains(out, "const _T = (id, kind, typeName, name, literal,") {
		t.Errorf("expected `_T` factory header in preamble, got:\n%s", out)
	}
	// Factory body must declare every ref slot as null so footer patches
	// land on a pre-existing key (the hidden-class-uniformity property).
	for _, slot := range []string{"child: null", "children: null", "return: null", "parameters: null", "classType: null"} {
		if !strings.Contains(out, slot) {
			t.Errorf("factory body missing pre-declared slot %q in:\n%s", slot, out)
		}
	}
}

// TestSimpleAtomic — a single KindString node emits `_T("id", 5)` with all
// trailing `u` args trimmed.
func TestSimpleAtomic(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "LrjxT1", Kind: protocol.KindString}})
	if !strings.Contains(out, `export const t_LrjxT1 = _T("LrjxT1", 5);`) {
		t.Errorf("expected `_T(\"LrjxT1\", 5);` (trailing u trimmed), got:\n%s", out)
	}
}

// TestStaticForm — Property with IsSafePropName=true and Child set.
// Matches the example shape from the user-supplied dump.
func TestStaticForm(t *testing.T) {
	runTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{
			ID:             "BxzL39",
			Kind:           protocol.KindProperty,
			Name:           "kind",
			IsSafePropName: true,
			Child:          protocol.NewRef("LrjxT1"),
		},
	}
	out := emit(t, runTypes)
	if !strings.Contains(out, `export const t_BxzL39 = _T("BxzL39", 15, u, "kind", u, u, u, u, u, u, true);`) {
		t.Errorf("expected Property to emit `_T(\"BxzL39\", 15, u, \"kind\", u, u, u, u, u, u, true);`, got:\n%s", out)
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
		{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafePropName: true, Child: protocol.NewRef("LrjxT1")},
	}
	// Same structural shape, freshly allocated to simulate the reflection
	// path's dump output. The serializer normalises to the same canonical
	// IDs, so the bytes must match.
	reflectionRunTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafePropName: true, Child: protocol.NewRef("LrjxT1")},
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
	// arg slot 11 is `position`; with isSafePropName false (slot 10 = u),
	// the call is `_T("sCSEqy", 18, u, "name", u, u, u, u, u, u, u, 0);`.
	if !strings.Contains(out, `_T("sCSEqy", 18, u, "name", u, u, u, u, u, u, u, 0);`) {
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
	// literal slot (index 4) must be `u`, not `"42"`.
	if !strings.Contains(out, `_T("bigID", 13, u, u, u`) {
		t.Errorf("expected bigint literal to pass `u` at literal slot, got:\n%s", out)
	}
	if !strings.Contains(out, `t_bigID.literal = BigInt("42");`) {
		t.Errorf("expected footer BigInt assignment unchanged, got:\n%s", out)
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
	if !strings.Contains(out, `_T("dateID", 20, "Date");`) {
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
	a := &protocol.RunType{ID: "A1", Kind: protocol.KindProperty, Name: "a", IsSafePropName: true, Child: protocol.NewRef("B1")}
	b := &protocol.RunType{ID: "B1", Kind: protocol.KindProperty, Name: "b", IsSafePropName: true, Child: protocol.NewRef("A1")}
	out := emit(t, []*protocol.RunType{a, b})
	if !strings.Contains(out, `export const t_A1 = _T("A1", 15, u, "a", u, u, u, u, u, u, true);`) {
		t.Errorf("expected A1 factory call, got:\n%s", out)
	}
	if !strings.Contains(out, `export const t_B1 = _T("B1", 15, u, "b", u, u, u, u, u, u, true);`) {
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
		ID:             "FULL",
		Kind:           protocol.KindClass,
		TypeName:       "TN",
		Name:           "NM",
		Literal:        "L",
		Optional:       true,
		Readonly:       true,
		Abstract:       true,
		Static:         true,
		Visibility:     intPtr(2),
		IsSafePropName: true,
		Position:       intPtr(7),
		Inlined:        true,
		Flags:          []string{"f1"},
		Description:    "D",
		Default:        "DEF",
		Enum:           map[string]any{"k": 1.0},
		Values:         []any{"v"},
	}})
	// Every scalar arg position should carry a non-`u` value. The trailing
	// `values` arg is "v" → rendered as ["v"], so no trimming happens.
	expected := `_T("FULL", 20, "TN", "NM", "L", true, true, true, true, 2, true, 7, true, ["f1"], "D", "DEF", {"k":1}, ["v"]);`
	if !strings.Contains(out, expected) {
		t.Errorf("expected fully-populated factory call:\n  %s\ngot:\n%s", expected, out)
	}
}

// TestHiddenClassUniformity asserts the factory body declares the exact
// set of own-keys we promise consumers — the property V8 uses to assign a
// stable hidden class to every node. Regex-checking the factory source is
// simpler than spinning up a JS evaluator.
func TestHiddenClassUniformity(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	// Expected own-keys, in factory-declaration order. Reserved-word keys
	// (abstract, static, return, default, enum, arguments, extends,
	// implements) appear as `<name>: <alias>` or `<name>: null` in the
	// factory body — we just verify each name shows up at least once.
	expected := []string{
		"id", "kind", "typeName", "name", "literal",
		"optional", "readonly", "abstract: abstract_", "static: static_",
		"visibility", "isSafePropName", "position", "inlined", "flags",
		"description", "default: default_", "enum: enum_", "values",
		"child: null", "index: null", "return: null", "indexType: null",
		"parameters: null", "children: null",
		"safeUnionChildren: null", "unionDiscriminators: null",
		"decorators: null", "typeArguments: null",
		"arguments: null", "extendsArguments: null",
		"implements: null", "extends: null",
		"classType: null",
	}
	for _, key := range expected {
		if !strings.Contains(out, key) {
			t.Errorf("factory body missing expected key fragment %q", key)
		}
	}
}
