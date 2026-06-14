package typefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// DataOnly union-member drop: a union with non-serializable members must
// project to the union of its data members (symbol / function / Promise /
// non-serializable / never dropped), matching DataOnly<T>. An all-stripped
// union (DataOnly = never) still renders an alwaysThrow factory.

func unionDump(members ...*protocol.RunType) protocol.Dump {
	refs := make([]*protocol.RunType, 0, len(members))
	all := make([]*protocol.RunType, 0, len(members)+1)
	for _, member := range members {
		refs = append(refs, makeRef(member.ID))
		all = append(all, member)
	}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          refs,
		SafeUnionChildren: refs,
	}
	all = append(all, union)
	return protocol.Dump{RunTypes: all}
}

func mkDate() *protocol.RunType {
	return &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
}
func mkSym() *protocol.RunType { return &protocol.RunType{ID: "sym", Kind: protocol.KindSymbol} }
func mkStr() *protocol.RunType { return &protocol.RunType{ID: "str", Kind: protocol.KindString} }
func mkFn() *protocol.RunType  { return &protocol.RunType{ID: "fn", Kind: protocol.KindFunction} }

// unionEntryWorks reports whether the rendered module contains a real union
// factory body (`<hash>_uni(v){…}`). An alwaysThrow union has no such body —
// it is a short tuple ending in a `[..] Cannot …` message instead.
func unionEntryWorks(rendered string) bool {
	return strings.Contains(rendered, "_uni(v){")
}

// jsonFamilies are the flat-union families that share buildFlatLayout; binary
// (toBinary/fromBinary) shares it too and is covered by the same change.
var jsonFamilies = []string{"validate", "prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson"}

func TestDataOnlyUnion_DropsStrippedMember(t *testing.T) {
	dump := unionDump(mkDate(), mkSym())
	for _, fam := range jsonFamilies {
		out := renderModule(t, dump, fam)
		if !unionEntryWorks(out) {
			t.Errorf("[%s] Date|symbol union should drop symbol and render a working factory; got:\n%s", fam, out)
		}
	}
	// The surviving member is Date — validate must check it.
	if out := renderModule(t, dump, "validate"); !strings.Contains(out, "instanceof Date") {
		t.Errorf("expected the union to validate Date; got:\n%s", out)
	}
}

func TestDataOnlyUnion_AllStrippedStillThrows(t *testing.T) {
	dump := unionDump(mkSym(), mkFn())
	for _, fam := range jsonFamilies {
		out := renderModule(t, dump, fam)
		if unionEntryWorks(out) {
			t.Errorf("[%s] all-stripped union (symbol|fn) should alwaysThrow, not render a body; got:\n%s", fam, out)
		}
	}
}

// Date | string | symbol must keep two members and reindex them gap-free
// (Date=0, string=1); the dropped symbol must NOT leave a [2,…] arm.
func TestDataOnlyUnion_ReindexesGapFree(t *testing.T) {
	out := renderModule(t, unionDump(mkDate(), mkStr(), mkSym()), "stringifyJson")
	for _, want := range []string{"'[0,'", "'[1,'"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected wire index fragment %s in reindexed union; got:\n%s", want, out)
		}
	}
	if strings.Contains(out, "'[2,'") {
		t.Errorf("dropped symbol (original index 2) must not leave a [2,…] arm; got:\n%s", out)
	}
}

// Nested fix: (Date | symbol)[] — the element union drops symbol to Date, so
// the array encodes instead of alwaysThrowing.
func TestDataOnlyUnion_NestedInArray(t *testing.T) {
	date := mkDate()
	sym := mkSym()
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("dat"), makeRef("sym")},
		SafeUnionChildren: []*protocol.RunType{makeRef("dat"), makeRef("sym")},
	}
	arr := &protocol.RunType{ID: "arr", Kind: protocol.KindArray, Child: makeRef("uni")}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{date, sym, union, arr}}

	out := renderModule(t, dump, "stringifyJson")
	// The array entry must be a real factory (arr inner fn), not alwaysThrow.
	if !strings.Contains(out, "_arr(v){") {
		t.Errorf("(Date|symbol)[] should encode (element union drops symbol); got:\n%s", out)
	}
}
