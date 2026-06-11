package runtype

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/compiled/entrymod"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// emit collects + renders the per-entry modules for runTypes and returns the
// concatenated sources in sorted-basename order (deterministic, so the
// byte-equality tests below stay stable).
func emit(t *testing.T, runTypes []*protocol.RunType) string {
	t.Helper()
	modules := emitModules(t, runTypes)
	basenames := make([]string, 0, len(modules))
	for basename := range modules {
		basenames = append(basenames, basename)
	}
	sort.Strings(basenames)
	var all strings.Builder
	for _, basename := range basenames {
		all.WriteString(modules[basename])
		all.WriteString("\n")
	}
	return all.String()
}

func emitModules(t *testing.T, runTypes []*protocol.RunType) map[string]string {
	t.Helper()
	graph := CollectEntries(protocol.Dump{RunTypes: runTypes})
	modules, err := entrymod.Render(graph)
	if err != nil {
		t.Fatalf("entrymod.Render: %v", err)
	}
	return modules
}

func intPtr(n int) *int { return &n }

// TestModuleShape — one module per runtype, tuple head [0,deps,<ini|u>,…],
// fixed export name.
func TestModuleShape(t *testing.T) {
	modules := emitModules(t, []*protocol.RunType{{ID: "x1", Kind: protocol.KindString}})
	source, ok := modules["x1"]
	if !ok {
		t.Fatalf("expected module basename x1, got %v", modules)
	}
	want := "const u=undefined;\nconst deps=()=>[e];\nexport const e=[0,deps,u,'x1',5];\n"
	if source != want {
		t.Errorf("module shape mismatch:\n got: %q\nwant: %q", source, want)
	}
}

// TestSimpleAtomic — a single KindString node emits args `'id',5` with
// all trailing `u` args trimmed.
func TestSimpleAtomic(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "LrjxT1", Kind: protocol.KindString}})
	if !strings.Contains(out, `export const e=[0,deps,u,'LrjxT1',5];`) {
		t.Errorf("expected `[0,deps,u,'LrjxT1',5]` (trailing u trimmed), got:\n%s", out)
	}
}

// TestStaticForm — Property with IsSafeName=true and Child set: the child ref
// patches through the per-entry ini(rtu) body and the child module is
// imported.
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
	modules := emitModules(t, runTypes)
	property := modules["BxzL39"]
	if !strings.Contains(property, `export const e=[0,deps,ini,'BxzL39',15,u,u,'kind',u,u,u,u,u,u,!0];`) {
		t.Errorf("expected Property tuple `[0,deps,ini,'BxzL39',15,…,!0]`, got:\n%s", property)
	}
	if !strings.Contains(property, `c('BxzL39').child = c('LrjxT1');`) {
		t.Errorf("expected ini ref assignment `c('BxzL39').child = c('LrjxT1');`, got:\n%s", property)
	}
	if !strings.Contains(property, `import {e as d1} from 'virtual:rt/LrjxT1.js';`) {
		t.Errorf("expected child module import, got:\n%s", property)
	}
	if !strings.Contains(property, "const deps=()=>[d1,e];") {
		t.Errorf("expected leaves-first deps thunk, got:\n%s", property)
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
	if !strings.Contains(out, `export const e=[0,deps,u,'sCSEqy',18,u,u,'name',u,u,u,u,u,u,u,0];`) {
		t.Errorf("expected position 0 to render as `0`, got:\n%s", out)
	}
}

// TestFooterLiteralPassesUForLiteralArg — bigint literal: the `literal`
// tuple arg is `u` (the ini body handles the construction).
func TestFooterLiteralPassesUForLiteralArg(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:      "bigID",
		Kind:    protocol.KindLiteral,
		Literal: "42",
		Flags:   []string{"bigint"},
	}})
	if !strings.Contains(out, `,'bigID',13,u,u,u,u`) {
		t.Errorf("expected bigint literal to pass `u` at literal slot, got:\n%s", out)
	}
	if !strings.Contains(out, `c('bigID').literal = BigInt('42');`) {
		t.Errorf("expected ini BigInt assignment via cache ref, got:\n%s", out)
	}
}

// TestClassBuiltinUnchanged — a class with ClassRef.Builtin emits the
// `c('X').classType = globalThis.<Name>;` ini line.
func TestClassBuiltinUnchanged(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "dateID",
		Kind:     protocol.KindClass,
		TypeName: "Date",
		ClassRef: &protocol.ClassRef{Builtin: "Date"},
	}})
	if !strings.Contains(out, `export const e=[0,deps,ini,'dateID',20,u,'Date'];`) {
		t.Errorf("expected class tuple with typeName, got:\n%s", out)
	}
	if !strings.Contains(out, `c('dateID').classType = globalThis.Date;`) {
		t.Errorf("expected ini classType assignment via cache ref, got:\n%s", out)
	}
}

// TestCycle — two nodes referencing each other via Child: both modules import
// each other (SCC members share a level) and both ini bodies patch refs
// through the registry, never through the imported binding.
func TestCycle(t *testing.T) {
	a := &protocol.RunType{ID: "A1", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: protocol.NewRef("B1")}
	b := &protocol.RunType{ID: "B1", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: protocol.NewRef("A1")}
	modules := emitModules(t, []*protocol.RunType{a, b})
	moduleA, moduleB := modules["A1"], modules["B1"]
	if !strings.Contains(moduleA, `import {e as d1} from 'virtual:rt/B1.js';`) {
		t.Errorf("A1 must import its cycle peer, got:\n%s", moduleA)
	}
	if !strings.Contains(moduleB, `import {e as d1} from 'virtual:rt/A1.js';`) {
		t.Errorf("B1 must import its cycle peer, got:\n%s", moduleB)
	}
	// Cycle members share a level → alphabetical: A1 before B1 in both thunks.
	if !strings.Contains(moduleA, "const deps=()=>[e,d1];") {
		t.Errorf("A1 deps thunk should order [A1,B1] (self first alphabetically), got:\n%s", moduleA)
	}
	if !strings.Contains(moduleB, "const deps=()=>[d1,e];") {
		t.Errorf("B1 deps thunk should order [A1,B1], got:\n%s", moduleB)
	}
	if !strings.Contains(moduleA, `c('A1').child = c('B1');`) || !strings.Contains(moduleB, `c('B1').child = c('A1');`) {
		t.Errorf("expected both cycle ref assignments via c() accessor:\nA1:\n%s\nB1:\n%s", moduleA, moduleB)
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
	expected := `export const e=[0,deps,u,'FULL',20,2004,'TN','NM','L',!0,!0,!0,!0,2,!0,7,!0,['f1'],'D','DEF',{'k':1},['v'],!0];`
	if !strings.Contains(out, expected) {
		t.Errorf("expected fully-populated tuple:\n  %s\ngot:\n%s", expected, out)
	}
}

// TestSubKindRendered — a class node with a non-zero SubKind must place
// the numeric value at the subKind slot.
func TestSubKindRendered(t *testing.T) {
	out := emit(t, []*protocol.RunType{{
		ID:       "mapID",
		Kind:     protocol.KindClass,
		SubKind:  protocol.SubKindMap,
		TypeName: "Map",
		ClassRef: &protocol.ClassRef{Builtin: "Map"},
	}})
	if !strings.Contains(out, `export const e=[0,deps,ini,'mapID',20,2002,'Map'];`) {
		t.Errorf("expected class tuple with subKind, got:\n%s", out)
	}
}

// TestNoLegacyTopLevelExports — the previous emitters used
// `export const t_<hash> = …` / `rt(…)` skeleton calls. Make sure neither
// pattern survives in per-entry modules.
func TestNoLegacyTopLevelExports(t *testing.T) {
	out := emit(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString}})
	if strings.Contains(out, "export const t_") {
		t.Errorf("legacy `export const t_…` lines must not appear in:\n%s", out)
	}
	if strings.Contains(out, "rt(") {
		t.Errorf("legacy `rt(…)` skeleton calls must not appear in:\n%s", out)
	}
}
