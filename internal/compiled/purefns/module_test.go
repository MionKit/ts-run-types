package purefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/compiled/entrymod"
)

func TestCollectEntries_EmptyInput(t *testing.T) {
	if graph := CollectEntries(nil); len(graph) != 0 {
		t.Fatalf("expected empty graph for nil entries, got %d", len(graph))
	}
}

func TestCollectEntries_SingleEntry(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:    "mion",
		FunctionName: "asJSONString",
		ParamNames:   []string{},
		Code:         "return function _f() {};",
		BodyHash:     "aBcDeFgHiJkLmN",
	}})
	entry := graph["mion::asJSONString"]
	if entry == nil {
		t.Fatalf("expected an entry keyed by 'mion::asJSONString', got %v", graph)
	}
	if entry.Kind != entrymod.KindPureFn {
		t.Errorf("Kind: got %v want KindPureFn", entry.Kind)
	}
	// 6-arg tail: key, bodyHash, paramNames, code, pureFnDependencies, createPureFn.
	// createPureFn is the inline `function(utl){<code>}` literal templated from `code`.
	want := "'mion::asJSONString','aBcDeFgHiJkLmN',[],'return function _f() {};',[],function(){return function _f() {};}"
	if entry.ArgsText != want {
		t.Errorf("ArgsText mismatch:\n got: %s\nwant: %s", entry.ArgsText, want)
	}
	if len(entry.Deps) != 0 {
		t.Errorf("no-dep entry should have empty Deps, got %v", entry.Deps)
	}
}

func TestCollectEntries_WithDependencies(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:          "mion",
		FunctionName:       "consumer",
		ParamNames:         []string{"x"},
		Code:               "return function _f(x){return utl.getPureFn('mion::dep')(x);};",
		BodyHash:           "h1",
		PureFnDependencies: []string{"mion::dep", "other::helper"},
	}})
	entry := graph["mion::consumer"]
	if entry == nil {
		t.Fatal("missing entry")
	}
	if !strings.Contains(entry.ArgsText, `['mion::dep','other::helper']`) {
		t.Errorf("dep array not rendered correctly:\n%s", entry.ArgsText)
	}
	if len(entry.SoftDeps) != 2 || entry.SoftDeps[0] != "mion::dep" || entry.SoftDeps[1] != "other::helper" {
		t.Errorf("module SoftDeps should carry the pure-fn dep keys, got %v", entry.SoftDeps)
	}
}

func TestCollectEntries_QuoteEscapes(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:    "test",
		FunctionName: "withQuote",
		ParamNames:   []string{"x"},
		Code:         "return 'has \\'inner\\'';",
		BodyHash:     "abc1234567890_",
	}})
	entry := graph["test::withQuote"]
	if entry == nil {
		t.Fatal("missing entry")
	}
	if !strings.Contains(entry.ArgsText, `['x']`) {
		t.Errorf("paramNames not rendered correctly:\n%s", entry.ArgsText)
	}
	if !strings.Contains(entry.ArgsText, `\\`) {
		t.Errorf("backslashes not escaped in code field:\n%s", entry.ArgsText)
	}
}

func TestCollectEntries_RenderedModuleShape(t *testing.T) {
	graph := CollectEntries([]Entry{
		{Namespace: "a", FunctionName: "x", Code: "return 1;", BodyHash: "h1", ParamNames: []string{}},
		{Namespace: "b", FunctionName: "y", Code: "return utl.usePureFn('a::x')();", BodyHash: "h2",
			ParamNames: []string{}, PureFnDependencies: []string{"a::x"}},
	})
	modules, err := entrymod.Render(graph)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	consumer, ok := modules["pf/b/y"]
	if !ok {
		t.Fatalf("expected module basename pf/b/y, got %v", keysOf(modules))
	}
	if !strings.Contains(consumer, "import {__rt_pf$2Fa$2Fx} from 'virtual:rt/pf/a/x.js';") {
		t.Errorf("pure-fn dep import missing:\n%s", consumer)
	}
	if !strings.Contains(consumer, "export const __rt_pf$2Fb$2Fy=[2,()=>[__rt_pf$2Fa$2Fx],,'b::y',") {
		t.Errorf("tuple head should be [2,()=>[__rt_<dep>],<hole>,'<key>',…]:\n%s", consumer)
	}
}

func TestReplacements_SwapsFactoryArgForBinding(t *testing.T) {
	entries := []Entry{{
		Namespace:       "mion",
		FunctionName:    "foo",
		FilePath:        "/abs/a.ts",
		FactoryArgStart: 50,
		FactoryArgEnd:   100,
	}}
	got := Replacements(entries, false)
	if len(got) != 1 {
		t.Fatalf("expected 1 replacement, got %d (%+v)", len(got), got)
	}
	if got[0].File != "/abs/a.ts" || got[0].Start != 50 || got[0].End != 100 {
		t.Errorf("unexpected replacement bounds: %+v", got[0])
	}
	if got[0].Text != "__rt_pf$2Fmion$2Ffoo" {
		t.Errorf("Text should be the entry-module binding, got %q", got[0].Text)
	}
	if got[0].ImportFrom != "virtual:rt/pf/mion/foo.js" {
		t.Errorf("ImportFrom should be the virtual specifier, got %q", got[0].ImportFrom)
	}
}

func TestReplacements_SkipsEntriesWithoutBounds(t *testing.T) {
	// Synthetic entries (e.g. those built in fixtures above) lack
	// FactoryArgStart/End. Replacements must skip them so we don't
	// emit zero-width or nonsensical rewrites.
	entries := []Entry{
		{Namespace: "a", FunctionName: "b", FilePath: "/x.ts"},                      // missing bounds
		{Namespace: "c", FunctionName: "d", FactoryArgStart: 10, FactoryArgEnd: 20}, // missing FilePath
	}
	if got := Replacements(entries, false); len(got) != 0 {
		t.Errorf("expected zero replacements for malformed entries, got %+v", got)
	}
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
