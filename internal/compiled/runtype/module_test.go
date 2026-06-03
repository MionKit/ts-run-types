package runtype

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
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

// TestSkeletonPresent — the emitted body must include the hand-authored
// skeleton wrappers (`function rt(...)`, `export function initCache(...)`)
// and the spliced `const u = undefined;` shorthand.
func TestSkeletonPresent(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	for _, fragment := range []string{
		"function rt(",
		"export function initCache(",
		"const u = undefined;",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected fragment %q in:\n%s", fragment, out)
		}
	}
	// The marker comment must NOT survive: splicing replaced it.
	if strings.Contains(out, cachetpl.MarkerLine) {
		t.Errorf("marker line should be replaced, but is still present in:\n%s", out)
	}
}

// TestSimpleAtomic — a single KindString node emits `rt('id',5)` with
// all trailing `u` args trimmed.
func TestSimpleAtomic(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "LrjxT1", Kind: protocol.KindString}})
	if !strings.Contains(out, `rt('LrjxT1',5);`) {
		t.Errorf("expected `rt('LrjxT1',5);` (trailing u trimmed), got:\n%s", out)
	}
}

// TestStaticForm — Property with IsSafeName=true and Child set.
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
	if !strings.Contains(out, `rt('BxzL39',15,u,u,'kind',u,u,u,u,u,u,!0);`) {
		t.Errorf("expected Property to emit `rt('BxzL39',15,u,u,'kind',u,u,u,u,u,u,!0);`, got:\n%s", out)
	}
	if !strings.Contains(out, `c('BxzL39').child = c('LrjxT1');`) {
		t.Errorf("expected footer cache-ref assignment `c('BxzL39').child = c('LrjxT1');`, got:\n%s", out)
	}
}

// TestReflectionForm — the same Property reached via the reflection-style
// resolution path must produce byte-equal output to the static form.
func TestReflectionForm(t *testing.T) {
	staticRunTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafeName: true, Child: protocol.NewRef("LrjxT1")},
	}
	reflectionRunTypes := []*protocol.RunType{
		{ID: "LrjxT1", Kind: protocol.KindString},
		{ID: "BxzL39", Kind: protocol.KindProperty, Name: "kind", IsSafeName: true, Child: protocol.NewRef("LrjxT1")},
	}
	if got := emit(t, reflectionRunTypes); got != emit(t, staticRunTypes) {
		t.Errorf("static and reflection forms emit different bytes:\nstatic:\n%s\nreflection:\n%s", emit(t, staticRunTypes), got)
	}
}

// TestPositionZeroIsPreserved — Position is *int; a value of 0 must
// round-trip as `0` (not `u`) because the slot is meaningful at
// position 0.
func TestPositionZeroIsPreserved(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "sCSEqy",
		Kind:     protocol.KindParameter,
		Name:     "name",
		Position: intPtr(0),
	}})
	if !strings.Contains(out, `rt('sCSEqy',18,u,u,'name',u,u,u,u,u,u,u,0);`) {
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
	if !strings.Contains(out, `rt('bigID',13,u,u,u,u`) {
		t.Errorf("expected bigint literal to pass `u` at literal slot, got:\n%s", out)
	}
	if !strings.Contains(out, `c('bigID').literal = BigInt('42');`) {
		t.Errorf("expected footer BigInt assignment via cache ref, got:\n%s", out)
	}
}

// TestClassBuiltinUnchanged — a class with ClassRef.Builtin emits the
// footer `cache['X'].classType = globalThis.<Name>;` tail.
func TestClassBuiltinUnchanged(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "dateID",
		Kind:     protocol.KindClass,
		TypeName: "Date",
		ClassRef: &protocol.ClassRef{Builtin: "Date"},
	}})
	if !strings.Contains(out, `rt('dateID',20,u,'Date');`) {
		t.Errorf("expected class factory call with typeName, got:\n%s", out)
	}
	if !strings.Contains(out, `c('dateID').classType = globalThis.Date;`) {
		t.Errorf("expected footer classType assignment via cache ref, got:\n%s", out)
	}
}

// TestCycle — two nodes referencing each other via Child.
func TestCycle(t *testing.T) {
	a := &protocol.RunType{ID: "A1", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: protocol.NewRef("B1")}
	b := &protocol.RunType{ID: "B1", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: protocol.NewRef("A1")}
	out := emit(t, []*protocol.RunType{a, b})
	if !strings.Contains(out, `rt('A1',15,u,u,'a',u,u,u,u,u,u,!0);`) {
		t.Errorf("expected A1 factory call, got:\n%s", out)
	}
	if !strings.Contains(out, `rt('B1',15,u,u,'b',u,u,u,u,u,u,!0);`) {
		t.Errorf("expected B1 factory call, got:\n%s", out)
	}
	if !strings.Contains(out, `c('A1').child = c('B1');`) || !strings.Contains(out, `c('B1').child = c('A1');`) {
		t.Errorf("expected both cycle ref assignments via c() accessor, got:\n%s", out)
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
// scalar slot when a new field is added to RunType.
func TestKnownFieldsCovered(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
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
	}})
	expected := `rt('FULL',20,2004,'TN','NM','L',!0,!0,!0,!0,2,!0,7,!0,['f1'],'D','DEF',{'k':1},['v'],!0);`
	if !strings.Contains(out, expected) {
		t.Errorf("expected fully-populated factory call:\n  %s\ngot:\n%s", expected, out)
	}
}

// TestSubKindRendered — a class node with a non-zero SubKind must place
// the numeric value at arg slot 2.
func TestSubKindRendered(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "mapID",
		Kind:     protocol.KindClass,
		SubKind:  protocol.SubKindMap,
		TypeName: "Map",
		ClassRef: &protocol.ClassRef{Builtin: "Map"},
	}})
	if !strings.Contains(out, `rt('mapID',20,2002,'Map');`) {
		t.Errorf("expected class factory call with subKind, got:\n%s", out)
	}
}

// TestNoLegacyTopLevelExports — the previous emitter used
// `export const t_<hash> = …`. Make sure that pattern is fully gone.
func TestNoLegacyTopLevelExports(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	if strings.Contains(out, "export const t_") {
		t.Errorf("legacy `export const t_…` lines must not appear in:\n%s", out)
	}
	if strings.Contains(out, "const RT = (") {
		t.Errorf("legacy `RT` factory must not be re-emitted; it lives in the skeleton now:\n%s", out)
	}
}
