package runtype

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/virtualmodules"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// A createX (FnId-bearing) site over a circular type is flagged so its RunType
// graph rides the bundle; a reflection-only site (FnId empty) is NOT — its
// graph already ships via reflectionRoots.
func TestCircularGuardTypeIDs(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "circ", Kind: protocol.KindObject, IsCircular: true},
			{ID: "plain", Kind: protocol.KindObject},
		},
		Sites: []protocol.Site{
			{ID: "circ", FnId: "va1"},  // createX site over a circular type
			{ID: "plain", FnId: "va1"}, // createX site over a non-circular type
			{ID: "circ"},               // reflection-only site (FnId empty)
		},
	}
	got := CircularGuardTypeIDs(dump)
	if !got["circ"] {
		t.Fatalf("expected circ flagged for a circular createX site, got %v", got)
	}
	if got["plain"] {
		t.Fatalf("non-circular type must not be flagged, got %v", got)
	}
	if len(got) != 1 {
		t.Fatalf("expected exactly one flagged type, got %v", got)
	}
}

// A circular type referenced ONLY by a createX site (no reflection site) still
// emits the data bundle (so the runtime guard has a graph to walk) — but no
// facade, since the fn entry imports the bundle directly.
func TestCircularCreateXEmitsBundleWithoutFacade(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "circ", Kind: protocol.KindObject, IsCircular: true}},
		Sites:    []protocol.Site{{ID: "circ", FnId: "va1"}},
	}
	graph := CollectEntries(dump)
	bundles, facades := 0, 0
	for _, entry := range graph {
		switch entry.Kind {
		case virtualmodules.KindRunTypeBundle:
			bundles++
		case virtualmodules.KindRunTypeFacade:
			facades++
		}
	}
	if bundles != 1 {
		t.Fatalf("expected exactly one runtype bundle for a circular createX site, got %d", bundles)
	}
	if facades != 0 {
		t.Fatalf("expected no facade for a createX-only circular site, got %d", facades)
	}
}

// A non-circular type referenced only by a createX site emits NOTHING — the
// reflection runtype graph stays demand-driven (createX-only files pay zero
// reflection payload, the pre-existing contract).
func TestNonCircularCreateXEmitsNoBundle(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "plain", Kind: protocol.KindObject}},
		Sites:    []protocol.Site{{ID: "plain", FnId: "va1"}},
	}
	graph := CollectEntries(dump)
	if len(graph) != 0 {
		t.Fatalf("expected no runtype modules for a non-circular createX-only site, got %d", len(graph))
	}
}
