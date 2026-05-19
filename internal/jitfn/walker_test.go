package jitfn

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

func newTestWalker() *Walker {
	rt := &protocol.RunType{Kind: protocol.KindString, ID: "root"}
	return NewWalker(rt, "isType_root", IsTypeEmitter{})
}

func TestNewWalker_DepsSlicesNonNilEmpty(t *testing.T) {
	w := newTestWalker()
	if w.JitDependencies == nil {
		t.Fatal("JitDependencies must be initialized as non-nil empty slice (rendered as `[]`, not `null`)")
	}
	if len(w.JitDependencies) != 0 {
		t.Fatalf("expected JitDependencies len 0, got %d", len(w.JitDependencies))
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
	if len(w.JitDependencies) != 2 {
		t.Fatalf("expected 2 deps, got %d (%v)", len(w.JitDependencies), w.JitDependencies)
	}
	if w.JitDependencies[0] != "childA" || w.JitDependencies[1] != "childB" {
		t.Fatalf("expected [childA childB], got %v", w.JitDependencies)
	}
}

func TestUpdateDependencies_DedupesRepeats(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	if len(w.JitDependencies) != 1 {
		t.Fatalf("expected 1 dep after repeated adds, got %d (%v)", len(w.JitDependencies), w.JitDependencies)
	}
}

func TestUpdateDependencies_SkipsNoopChildren(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childNoop", true)
	w.UpdateDependencies("childReal", false)
	if len(w.JitDependencies) != 1 {
		t.Fatalf("expected only the non-noop child, got %v", w.JitDependencies)
	}
	if w.JitDependencies[0] != "childReal" {
		t.Fatalf("expected [childReal], got %v", w.JitDependencies)
	}
}
