package typefns

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
