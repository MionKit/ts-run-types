package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// compositeBodyFor renders one composite entry's factory body for the given
// tag over a plain object type, returning the cached-args text (which embeds
// the prologue + inner fn in emitMode both).
func compositeBodyFor(t *testing.T, tag string) string {
	t.Helper()
	composite, ok := constants.JsonCompositeByTag(tag)
	if !ok {
		t.Fatalf("unknown composite tag %q", tag)
	}
	runType := &protocol.RunType{ID: "obj1", Kind: protocol.KindObjectLiteral}
	entry := collectJsonCompositeEntry(runType, tag, composite, RenderOpts{EmitMode: constants.EmitBoth}, nil)
	if entry == nil {
		t.Fatalf("no composite entry rendered for %q", tag)
	}
	return entry.ArgsText
}

// The composite prologue binds each primitive with a DIRECT
// `utl.getRT(key).fn` read — no guarded resolver IIFE, no inline
// identity/stringify fallback. Noop primitives register with the family
// noop fn pre-set runtime-side (entryTuple.ts familyMeta) and getRT
// materializes before returning, so the read is always live.
func TestJsonComposite_DirectFnBind_DecoderStrip(t *testing.T) {
	body := compositeBodyFor(t, "jdST")
	rjKey := operations.PlainHash("restoreFromJson") + "_obj1"
	ukuwKey := operations.PlainHash("unknownKeysToUndefinedWire") + "_obj1"
	for _, want := range []string{
		"const rjFn = utl.getRT('" + rjKey + "').fn",
		"const ukuwFn = utl.getRT('" + ukuwKey + "').fn",
		"return rjFn(ukuwFn(JSON.parse(s)));",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("jdST body missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "e ? e.fn") || strings.Contains(body, "(function(") {
		t.Errorf("jdST body must carry no guarded resolver IIFE or inline fallback:\n%s", body)
	}
}

func TestJsonComposite_DirectFnBind_EncoderDirect(t *testing.T) {
	body := compositeBodyFor(t, "jeDI")
	sjKey := operations.PlainHash("stringifyJson") + "_obj1"
	if !strings.Contains(body, "const sjFn = utl.getRT('"+sjKey+"').fn") {
		t.Errorf("jeDI body missing direct sjFn bind:\n%s", body)
	}
	if strings.Contains(body, "JSON.stringify(x)") {
		t.Errorf("the inline stringify fallback must be gone (sj noop registers fn = JSON.stringify runtime-side):\n%s", body)
	}
}

// The compact encoder wraps the new compactForJson (cj) walking primitive with
// native JSON.stringify; the compact decoder wraps compactFromJson (cjr) around
// JSON.parse. Same DIRECT `utl.getRT(key).fn` bind shape as the other strategies.
func TestJsonComposite_DirectFnBind_CompactEncoder(t *testing.T) {
	body := compositeBodyFor(t, "jeCO")
	cjKey := operations.PlainHash("compactForJson") + "_obj1"
	for _, want := range []string{
		"const cjFn = utl.getRT('" + cjKey + "').fn",
		"return JSON.stringify(cjFn(v));",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("jeCO body missing %q:\n%s", want, body)
		}
	}
}

func TestJsonComposite_DirectFnBind_CompactDecoder(t *testing.T) {
	body := compositeBodyFor(t, "jdCO")
	cjrKey := operations.PlainHash("compactFromJson") + "_obj1"
	for _, want := range []string{
		"const cjrFn = utl.getRT('" + cjrKey + "').fn",
		"return cjrFn(JSON.parse(s));",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("jdCO body missing %q:\n%s", want, body)
		}
	}
}

// AssertCompositeSoftDeps — the build-time belt for the demand invariant:
// a composite whose primitive never rendered surfaces as an Error diag
// (JCP001) instead of a runtime `undefined.fn` TypeError.
func TestAssertCompositeSoftDeps_MissingPrimitiveFails(t *testing.T) {
	rjKey := operations.PlainHash("restoreFromJson") + "_obj1"
	graph := entrymod.Graph{}
	graph.Add(&entrymod.Entry{
		Key: "jd1_obj1", Kind: entrymod.KindTypeFn, FamilyTag: "jdPR",
		ArgsText: "'jd1_obj1'", SoftDeps: []string{rjKey},
	})
	var sink []diag.Diagnostic
	AssertCompositeSoftDeps(graph, &sink)
	if len(sink) != 1 || sink[0].Code != diag.CodeCompositeMissingPrimitive {
		t.Fatalf("expected one %s diagnostic, got %+v", diag.CodeCompositeMissingPrimitive, sink)
	}
	if sink[0].Severity != diag.SeverityError {
		t.Fatalf("invariant breach must be Error severity, got %v", sink[0].Severity)
	}

	// Present primitive (even a noop short-form entry) satisfies the assert.
	graph.Add(&entrymod.Entry{Key: rjKey, Kind: entrymod.KindTypeFn, FamilyTag: "rj", ArgsText: "'" + rjKey + "'"})
	sink = nil
	AssertCompositeSoftDeps(graph, &sink)
	if len(sink) != 0 {
		t.Fatalf("present primitive must not diag, got %+v", sink)
	}

	// A KindMissing stub registers NOTHING at runtime — still a breach.
	graph2 := entrymod.Graph{}
	graph2.Add(&entrymod.Entry{
		Key: "jd1_obj2", Kind: entrymod.KindTypeFn, FamilyTag: "jdPR",
		ArgsText: "'jd1_obj2'", SoftDeps: []string{"stub1"},
	})
	graph2.Add(&entrymod.Entry{Key: "stub1", Kind: entrymod.KindMissing})
	sink = nil
	AssertCompositeSoftDeps(graph2, &sink)
	if len(sink) != 1 {
		t.Fatalf("KindMissing stub dep must diag, got %+v", sink)
	}
}
