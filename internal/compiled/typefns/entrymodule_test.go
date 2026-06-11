package typefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

func TestFormatEntryArray_NormalEntry(t *testing.T) {
	slots := EntrySlots{
		Key:       "aB3x_Lrjx",
		FamilyTag: "val",
		TypeName:  "User",
		Code:      "return function aB3x_Lrjx(v){return typeof v === 'string'}",
		RTDeps:    []string{"aB3x_pQ7w"},
		PureFnDeps: []protocol.PureFnDep{
			{Namespace: "mion", FunctionName: "newRunTypeErr"},
		},
	}
	got := FormatEntryArray(slots)
	want := `['aB3x_Lrjx','val','User','return function aB3x_Lrjx(v){return typeof v === \'string\'}',false,['aB3x_pQ7w'],['mion::newRunTypeErr']]`
	if got != want {
		t.Fatalf("normal entry mismatch:\nwant %s\ngot  %s", want, got)
	}
}

func TestFormatEntryArray_PureFnDepsAreFullStrings(t *testing.T) {
	// The aggregate path abbreviates aliased pure-fns to `k_<alias>` consts
	// declared in the skeleton's module scope; per-entry modules have no such
	// scope, so EVERY dep must be the full quoted string.
	slots := EntrySlots{
		Key: "k_x", FamilyTag: "verr", TypeName: "T", Code: "c",
		PureFnDeps: []protocol.PureFnDep{
			{Namespace: "mion", FunctionName: "newRunTypeErr"},         // aliased as k_nRT in skeletons
			{Namespace: "mion", FunctionName: "getUnknownKeysFromArray"}, // aliased as k_gUKFA
		},
	}
	got := FormatEntryArray(slots)
	if strings.Contains(got, "k_nRT") || strings.Contains(got, "k_gUKFA") {
		t.Fatalf("entry array must not reference skeleton-scoped k_ consts: %s", got)
	}
	if !strings.Contains(got, "'mion::newRunTypeErr'") || !strings.Contains(got, "'mion::getUnknownKeysFromArray'") {
		t.Fatalf("entry array must carry full pure-fn key strings: %s", got)
	}
}

func TestFormatEntryArray_NoopShortForm(t *testing.T) {
	slots := EntrySlots{Key: "aB3x_Tm91", FamilyTag: "val", TypeName: "Date", IsNoop: true}
	got := FormatEntryArray(slots)
	want := `['aB3x_Tm91','val','Date',u,true]`
	if got != want {
		t.Fatalf("noop short form mismatch:\nwant %s\ngot  %s", want, got)
	}
}

func TestFormatEntryArray_NoTrailingNoise(t *testing.T) {
	// A code-bearing entry with no deps trims everything after isNoop=false…
	slots := EntrySlots{Key: "k_x", FamilyTag: "rj", TypeName: "T", Code: "c"}
	got := FormatEntryArray(slots)
	want := `['k_x','rj','T','c']`
	if got != want {
		t.Fatalf("trim mismatch:\nwant %s\ngot  %s", want, got)
	}
}

func TestFormatEntryArray_AlwaysThrow(t *testing.T) {
	slots := EntrySlots{
		Key: "aB3x_Zk44", FamilyTag: "val", TypeName: "symbol",
		ThrowCode: "VL002", ThrowSite: "src/api.ts:14:22",
	}
	got := FormatEntryArray(slots)
	want := `['aB3x_Zk44','val','symbol',u,false,u,u,u,'VL002','src/api.ts:14:22']`
	if got != want {
		t.Fatalf("alwaysThrow form mismatch:\nwant %s\ngot  %s", want, got)
	}
}

func TestFormatEntryArray_CreateRTFnSlot(t *testing.T) {
	slots := EntrySlots{
		Key: "k_x", FamilyTag: "val", TypeName: "T", Code: "body",
		CreateRTFn: "function g_k_x(utl){body}",
	}
	got := FormatEntryArray(slots)
	want := `['k_x','val','T','body',false,u,u,function g_k_x(utl){body}]`
	if got != want {
		t.Fatalf("createRTFn form mismatch:\nwant %s\ngot  %s", want, got)
	}
}

func TestWrapEntryModule(t *testing.T) {
	got := WrapEntryModule(`['k','val','T','c']`)
	want := "'use strict';\nconst u = undefined;\nexport const entry = ['k','val','T','c'];\n"
	if got != want {
		t.Fatalf("module wrapper mismatch:\nwant %q\ngot  %q", want, got)
	}
}
