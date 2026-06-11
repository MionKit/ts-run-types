package runtype

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

func TestRenderRunTypeEntryModule_LeafNoFooter(t *testing.T) {
	node := &protocol.RunType{ID: "Str0", Kind: protocol.KindString}
	got := RenderRunTypeEntryModule(node)
	want := "'use strict';\nconst u = undefined;\nexport const entry = ['Str0','t'," +
		"2];\n"
	// Kind value comes from the protocol enum; assert structurally instead of
	// hardcoding the byte when the literal differs.
	if !strings.HasPrefix(got, "'use strict';\nconst u = undefined;\nexport const entry = ['Str0','t',") {
		t.Fatalf("leaf module prologue/slots mismatch:\n%s", got)
	}
	if strings.Contains(got, "initEntry") {
		t.Fatalf("leaf without footer must not emit initEntry:\n%s", got)
	}
	_ = want
}

func TestRenderRunTypeEntryModule_FooterGatedInInitEntry(t *testing.T) {
	object := &protocol.RunType{
		ID:       "Lrjx",
		Kind:     protocol.KindObjectLiteral,
		TypeName: "User",
		Children: []*protocol.RunType{protocol.NewRef("n4Ku"), protocol.NewRef("aD7w")},
	}
	got := RenderRunTypeEntryModule(object)
	for _, want := range []string{
		"function initEntry(rtUtils) {",
		"const c = (id) => rtUtils.useRunType(id);",
		"const s = c('Lrjx');",
		"s.children = [c('n4Ku'), c('aD7w')];",
		",initEntry];",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("footer module missing %q:\n%s", want, got)
		}
	}
}

func TestRenderRunTypeEntryModule_RuntimeValuesSelfContained(t *testing.T) {
	date := &protocol.RunType{
		ID:       "Tm91",
		Kind:     protocol.KindClass,
		SubKind:  protocol.SubKindDate,
		TypeName: "Date",
		ClassRef: &protocol.ClassRef{Builtin: "Date"},
	}
	got := RenderRunTypeEntryModule(date)
	if !strings.Contains(got, "s.classType = globalThis.Date;") {
		t.Fatalf("classType runtime value must ride initEntry:\n%s", got)
	}

	bigintLiteral := &protocol.RunType{
		ID:      "bG55",
		Kind:    protocol.KindLiteral,
		Literal: "9007199254740993",
		Flags:   []string{"bigint"},
	}
	got = RenderRunTypeEntryModule(bigintLiteral)
	if !strings.Contains(got, "s.literal = BigInt('9007199254740993');") {
		t.Fatalf("bigint literal must ride initEntry:\n%s", got)
	}
	// The positional literal slot stays u — the footer patches it, exactly as
	// the aggregate renderer's footerLiteral handling.
	if strings.Contains(got, "'9007199254740993','t'") {
		t.Fatalf("footer-only literal must not be inlined positionally:\n%s", got)
	}
}

func TestRefDeps_CollectsRefSlotsExcludesSelf(t *testing.T) {
	node := &protocol.RunType{
		ID:   "Q8r2",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			protocol.NewRef("n4Ku"),
			protocol.NewRef("Q8r2"), // self-recursion — excluded
		},
		Child:             protocol.NewRef("pQ7w"),
		SafeUnionChildren: []*protocol.RunType{protocol.NewRef("n4Ku")}, // dup — deduped
	}
	got := RefDeps(node)
	// Slot visit order: Child before Children (forEachRefSlot's fixed order).
	want := []string{"pQ7w", "n4Ku"}
	if len(got) != len(want) {
		t.Fatalf("RefDeps mismatch: want %v got %v", want, got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("RefDeps mismatch: want %v got %v", want, got)
		}
	}
}

func TestRefDeps_RecursesIntoInlineNodes(t *testing.T) {
	inline := &protocol.RunType{
		ID:    "in00",
		Kind:  protocol.KindProperty,
		Child: protocol.NewRef("deep"),
	}
	node := &protocol.RunType{
		ID:       "root",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{inline},
	}
	got := RefDeps(node)
	if len(got) != 1 || got[0] != "deep" {
		t.Fatalf("inline-node refs must be collected: %v", got)
	}
}
