package typefns

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

func newTestWalker() *Walker {
	rt := &protocol.RunType{Kind: protocol.KindString, ID: "root"}
	return NewWalker(rt, "it_root", IsTypeEmitter{})
}

func TestNewWalker_DepsSlicesNonNilEmpty(t *testing.T) {
	w := newTestWalker()
	if w.RTDependencies == nil {
		t.Fatal("RTDependencies must be initialized as non-nil empty slice (rendered as `[]`, not `null`)")
	}
	if len(w.RTDependencies) != 0 {
		t.Fatalf("expected RTDependencies len 0, got %d", len(w.RTDependencies))
	}
	if w.PureFnDependencies == nil {
		t.Fatal("PureFnDependencies must be initialized as non-nil empty slice")
	}
	if len(w.PureFnDependencies) != 0 {
		t.Fatalf("expected PureFnDependencies len 0, got %d", len(w.PureFnDependencies))
	}
}

func TestUpdateDependencies_AppendsOnce(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childB", false)
	if len(w.RTDependencies) != 2 {
		t.Fatalf("expected 2 deps, got %d (%v)", len(w.RTDependencies), w.RTDependencies)
	}
	if w.RTDependencies[0] != "childA" || w.RTDependencies[1] != "childB" {
		t.Fatalf("expected [childA childB], got %v", w.RTDependencies)
	}
}

func TestUpdateDependencies_DedupesRepeats(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	if len(w.RTDependencies) != 1 {
		t.Fatalf("expected 1 dep after repeated adds, got %d (%v)", len(w.RTDependencies), w.RTDependencies)
	}
}

func TestUpdateDependencies_SkipsNoopChildren(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childNoop", true)
	w.UpdateDependencies("childReal", false)
	if len(w.RTDependencies) != 1 {
		t.Fatalf("expected only the non-noop child, got %v", w.RTDependencies)
	}
	if w.RTDependencies[0] != "childReal" {
		t.Fatalf("expected [childReal], got %v", w.RTDependencies)
	}
}

// AddPureFnDependency is now record-only: it appends the triple and
// dedupes. Validation against the actual `registerPureFnFactory` call
// happens at end-of-compilation via purefns.ValidatePureFnDependencies,
// so the cases that previously asserted "missing source file" /
// "wrong namespace" errors moved to internal/purefns/index_test.go.

func TestAddPureFnDependency_RecordsTriple(t *testing.T) {
	w := newTestWalker()
	w.AddPureFnDependency("mion", "asJSONString", "/abs/run-types-pure-fns.ts")
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
	got := w.PureFnDependencies[0]
	if got.Namespace != "mion" || got.FunctionName != "asJSONString" || got.FilePath != "/abs/run-types-pure-fns.ts" {
		t.Fatalf("triple mismatch: got %+v", got)
	}
}

func TestAddPureFnDependency_NoValidationAtCallSite(t *testing.T) {
	// The whole point of the optimization: appending is O(1) and does
	// NOT touch the filesystem. Pass a nonsense filePath — it should
	// still record cleanly. The eventual diagnostic surfaces later in
	// purefns.ValidatePureFnDependencies.
	w := newTestWalker()
	w.AddPureFnDependency("mion", "asJSONString", "/this/path/does/not/exist.ts")
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected the triple to be recorded regardless of filePath validity, got %v", w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_DedupesFullTriple(t *testing.T) {
	w := newTestWalker()
	for i := 0; i < 3; i++ {
		w.AddPureFnDependency("mion", "asJSONString", "/abs/pure-fns.ts")
	}
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep after 3 identical appends, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_DifferentFilePathIsDistinctEntry(t *testing.T) {
	// Same (ns, fn) but different filePath — both entries recorded.
	// Resolution to a "real" file happens later in
	// purefns.ValidatePureFnDependencies via lazy index expansion.
	w := newTestWalker()
	w.AddPureFnDependency("mion", "asJSONString", "/a.ts")
	w.AddPureFnDependency("mion", "asJSONString", "/b.ts")
	if len(w.PureFnDependencies) != 2 {
		t.Fatalf("expected 2 distinct entries by filePath, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
}
