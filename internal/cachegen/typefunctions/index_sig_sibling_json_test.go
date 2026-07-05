package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// G1: an object that mixes a named property with an index signature whose VALUE
// type differs (e.g. `{p0: number; [k: number]: bigint}`) must NOT apply the
// index value's transform to the named property. The JSON families walk every
// own key with a for-in loop, so the loop has to skip declared sibling keys (the
// named prop owns its own transform / decode). Binary already does this (F1);
// the clone (prepareForJsonSafe) path always did via its declared-key skip. This
// pins the mutate (prepareForJson), restore (restoreFromJson), and direct
// (stringifyJson) walks, which previously corrupted the named prop on the wire
// round-trip (a `number` becoming a `bigint`).

func mixedIndexSigObject() protocol.Dump {
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	big := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	idxKey := &protocol.RunType{ID: "ik", Kind: protocol.KindNumber}
	p0 := &protocol.RunType{ID: "p0", Kind: protocol.KindPropertySignature, Name: "p0", IsSafeName: true, Child: makeRef("num")}
	idx := &protocol.RunType{ID: "idx", Kind: protocol.KindIndexSignature, Index: makeRef("ik"), Child: makeRef("big")}
	obj := &protocol.RunType{ID: "obj", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("p0"), makeRef("idx")}}
	return protocol.Dump{RunTypes: []*protocol.RunType{num, big, idxKey, p0, idx, obj}}
}

func TestG1_JsonIndexSigSkipsSiblingNamedProp(t *testing.T) {
	dump := mixedIndexSigObject()
	// prepareForJson / restoreFromJson / stringifyJson all walk own keys with a
	// for-in; each must guard the index loop with the sibling-named Set skip.
	for _, fam := range []string{"prepareForJson", "restoreFromJson", "stringifyJson"} {
		out := renderModule(t, dump, fam)
		if !strings.Contains(out, "siblingNamed_idx.has(") {
			t.Errorf("[%s] index-sig for-in loop must skip declared sibling keys (siblingNamed_idx.has) so the named prop is not transformed by the index value; got:\n%s", fam, out)
		}
		// The skip set is published once with the declared name.
		if !strings.Contains(out, "siblingNamed_idx = new Set(['p0'])") {
			t.Errorf("[%s] expected the published sibling-names set new Set(['p0']); got:\n%s", fam, out)
		}
	}
}

// droppedPropIndexSigObject builds `{p0?: symbol; p1: boolean; [k: number]:
// "red"}`. The `p0` value is DataOnly-stripped, so the projection drops it — but
// its KEY must still be skipped by the index for-in, or the index arm copies it
// back into the result (G6: the clone encoder kept `p0`, disagreeing with binary
// which dropped it).
func droppedPropIndexSigObject() protocol.Dump {
	sym := &protocol.RunType{ID: "sym", Kind: protocol.KindSymbol}
	boolean := &protocol.RunType{ID: "bool", Kind: protocol.KindBoolean}
	litRed := &protocol.RunType{ID: "red", Kind: protocol.KindLiteral, Literal: "red"}
	idxKey := &protocol.RunType{ID: "ik", Kind: protocol.KindNumber}
	p0 := &protocol.RunType{ID: "p0", Kind: protocol.KindPropertySignature, Name: "p0", IsSafeName: true, Optional: true, Child: makeRef("sym")}
	p1 := &protocol.RunType{ID: "p1", Kind: protocol.KindPropertySignature, Name: "p1", IsSafeName: true, Child: makeRef("bool")}
	idx := &protocol.RunType{ID: "idx", Kind: protocol.KindIndexSignature, Index: makeRef("ik"), Child: makeRef("red")}
	obj := &protocol.RunType{ID: "obj", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("p0"), makeRef("p1"), makeRef("idx")}}
	return protocol.Dump{RunTypes: []*protocol.RunType{sym, boolean, litRed, idxKey, p0, p1, idx, obj}}
}

// TestG6_CloneIndexSigSkipsDroppedSiblingProp — the clone encoder
// (prepareForJsonSafe) index for-in must skip the DROPPED `p0` key, not only the
// kept `p1`. Before the fix the skip set was the kept-props list, so `p0` fell
// through to the index arm and was copied back into the clone while every other
// family dropped it.
func TestG6_CloneIndexSigSkipsDroppedSiblingProp(t *testing.T) {
	dump := droppedPropIndexSigObject()
	out := renderModule(t, dump, "prepareForJsonSafe")

	if !strings.Contains(out, "=== 'p0'") {
		t.Errorf("clone index-sig for-in must skip the DROPPED sibling key 'p0'; got:\n%s", out)
	}
	if !strings.Contains(out, "=== 'p1'") {
		t.Errorf("clone index-sig for-in must still skip the kept sibling key 'p1'; got:\n%s", out)
	}
	// The dropped prop is never written back into the clone.
	if strings.Contains(out, "_r['p0']") || strings.Contains(out, "_r[\"p0\"]") {
		t.Errorf("dropped prop 'p0' must not be assigned into the clone; got:\n%s", out)
	}
}

// TestG6_BinaryAndCloneSkipSameSiblingKeys — binary already skipped the dropped
// key via collectSiblingNamedKeys; pin that both paths agree on the skip set so
// the clone can't drift back (the cross-wire disagreement that surfaced G6).
func TestG6_BinaryAndCloneSkipSameSiblingKeys(t *testing.T) {
	dump := droppedPropIndexSigObject()
	binOut := renderModule(t, dump, "toBinary")
	if !strings.Contains(binOut, "siblingNamed_idx = new Set(['p0','p1'])") {
		t.Errorf("binary sibling-names set must include the dropped 'p0' and kept 'p1'; got:\n%s", binOut)
	}
}
