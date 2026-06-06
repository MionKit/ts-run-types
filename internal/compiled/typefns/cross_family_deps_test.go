package typefns

import (
	"bytes"
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// valKey returns the validate cache key `<validate-fnHash>_<id>` the emitter now
// produces for a same-family / cross-family validate lookup. Slice 4 replaced the
// readable `val_` tag prefix with the opaque, version-isolated fnHash from the
// operation registry; tests derive the expected key through the same helper the
// emitter uses so they stay correct across binary versions.
func valKey(id string) string { return operations.PlainHash("validate") + "_" + id }

// itVariantKey returns the validate cache key for the ValidateOptions variant
// identified by `optionNames` — `<variant-fnHash>_<id>` (e.g. the noIsArrayCheck
// variant). Mirrors variantKey for the validate family without depending on the
// CacheModuleSettings plumbing.
func itVariantKey(optionNames []string, id string) string {
	itOp, _ := operations.ByName("validate")
	return operations.FnHashFor(itOp, optionNames, "") + "_" + id
}

// buildRefTable indexes every RunType by id so renderEntryWithDeps and the
// walker can deref the KindRef child slots (the wire form every composite
// uses — see internal/protocol). Mirrors the per-request table RenderFnModule
// builds.
func buildRefTable(runTypes []*protocol.RunType) map[string]*protocol.RunType {
	table := make(map[string]*protocol.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		table[rt.ID] = rt
	}
	return table
}

func containsStr(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// buildConflictPropUnionFixture builds a union of two objectLiteral members
// that share a property name with different (conflicting) value types:
//
//	{ a: bigint }  |  { a: Date }
//
// The encoder discriminates the conflicting `a` slot at runtime via the
// validate validators of the two candidate types — emitting
// `val_<bigintID>` / `val_<dateID>` cross-family lookups (a synthesized
// sub-union over the property). This is the union shape that exercises the
// cross-family `registerRTLookup("val_<member>")` path in BOTH the
// prepareForJson and toBinary encoders (a clean discriminated union of plain
// objects instead merges into a single `[-1, v]` branch and emits no
// per-member dispatch on the JSON side). Returns the run-types and the union
// root id.
func buildConflictPropUnionFixture() ([]*protocol.RunType, string) {
	bigint := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	date := &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	propABig := &protocol.RunType{ID: "pab", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	propADat := &protocol.RunType{ID: "pad", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("dat")}
	obj1 := &protocol.RunType{ID: "ob1", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pab")}}
	obj2 := &protocol.RunType{ID: "ob2", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pad")}}
	union := &protocol.RunType{
		ID:                "uni",
		Kind:              protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*protocol.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	return []*protocol.RunType{bigint, date, propABig, propADat, obj1, obj2, union}, "uni"
}

// assertUnionCrossFamily renders the union root for the given encoder family
// and asserts the cross-family discrimination edges land in CrossFamilyDeps
// (not RTDependencies). The discriminated `a` slot resolves to the two
// candidate validate validators `val_big` / `val_dat`.
func assertUnionCrossFamily(t *testing.T, emitter Emitter, settings constants.CacheModuleSettings) {
	t.Helper()
	runTypes, rootID := buildConflictPropUnionFixture()
	refTable := buildRefTable(runTypes)
	prefix := innerPrefix(settings)

	rendered := renderEntryWithDeps(refTable[rootID], settings, emitter, prefix, refTable, RenderOpts{}, "", nil)
	if rendered.line == "" {
		t.Fatalf("%T: expected a non-empty entry line for the conflict-prop union", emitter)
	}

	for _, want := range []string{valKey("big"), valKey("dat")} {
		if !containsStr(rendered.crossFamilyDeps, want) {
			t.Errorf("%T: CrossFamilyDeps %v missing cross-family edge %q", emitter, rendered.crossFamilyDeps, want)
		}
		// Cross-family edges MUST stay out of the same-family dependency
		// list — the dangling-dep cascade keys on RTDependencies and would
		// wrongly drop this entry if an `val_*` (foreign-family) hash leaked
		// in.
		if containsStr(rendered.deps, want) {
			t.Errorf("%T: cross-family edge %q must NOT appear in RTDependencies %v", emitter, want, rendered.deps)
		}
	}
}

// TestCrossFamilyDeps_UnionPrepareForJson — the prepareForJson encoder for a
// union whose members discriminate a conflicting property at runtime records
// the `val_<candidate>` lookups as cross-family edges, separate from the
// (empty here) same-family RTDependencies.
func TestCrossFamilyDeps_UnionPrepareForJson(t *testing.T) {
	assertUnionCrossFamily(t, PrepareForJsonEmitter{}, constants.CacheModules["prepareForJson"])
}

// TestCrossFamilyDeps_UnionToBinary — same as the prepareForJson sibling but
// for the toBinary encoder, which also discriminates the conflicting slot via
// the candidate validate validators.
func TestCrossFamilyDeps_UnionToBinary(t *testing.T) {
	assertUnionCrossFamily(t, ToBinaryEmitter{}, constants.CacheModules["toBinary"])
}

// TestCrossFamilyDeps_ValidateSameFamilyOnly — a plain object with a nested
// object property compiles the nested child as a same-family dependency call
// (`val_<child>` funnelled through registerRTLookup by emitDepCall). Because
// the lookup's prefix matches the walker's own InnerPrefix it is recorded in
// RTDependencies, NOT CrossFamilyDeps. This pins the no-regression guarantee
// for the same-family path: registerRTLookup's prefix gate keeps same-family
// edges out of the cross-family list.
func TestCrossFamilyDeps_ValidateSameFamilyOnly(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	innerProp := &protocol.RunType{ID: "ip", Kind: protocol.KindPropertySignature, Name: "n", IsSafeName: true, Child: makeRef("num")}
	inner := &protocol.RunType{ID: "inner", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("ip")}}
	outerPropA := &protocol.RunType{ID: "opa", Kind: protocol.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	outerPropB := &protocol.RunType{ID: "opb", Kind: protocol.KindPropertySignature, Name: "b", IsSafeName: true, Child: makeRef("inner")}
	outer := &protocol.RunType{ID: "outer", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("opa"), makeRef("opb")}}

	runTypes := []*protocol.RunType{str, num, innerProp, inner, outerPropA, outerPropB, outer}
	refTable := buildRefTable(runTypes)
	settings := constants.CacheModules["validate"]
	prefix := innerPrefix(settings)

	rendered := renderEntryWithDeps(refTable["outer"], settings, ValidateEmitter{}, prefix, refTable, RenderOpts{}, "", nil)
	if rendered.line == "" {
		t.Fatal("expected a non-empty validate entry line for the nested-object fixture")
	}
	if !containsStr(rendered.deps, valKey("inner")) {
		t.Errorf("expected same-family child dep %q in RTDependencies, got %v", valKey("inner"), rendered.deps)
	}
	if len(rendered.crossFamilyDeps) != 0 {
		t.Errorf("same-family-only validate entry must have empty CrossFamilyDeps, got %v", rendered.crossFamilyDeps)
	}
}

// TestCrossFamilyDeps_CaptureIsByteIdentical — capturing cross-family edges
// must not perturb the emitted module bytes. Renders the conflict-prop union's
// prepareForJson module and asserts the validator body (with the `val_big` /
// `val_dat` dispatch) is present byte-for-byte; capture is a pure side-channel
// on the walker, so the spliced `init(…)` output is unchanged.
func TestCrossFamilyDeps_CaptureIsByteIdentical(t *testing.T) {
	runTypes, _ := buildConflictPropUnionFixture()
	dump := protocol.Dump{RunTypes: runTypes}

	var buf bytes.Buffer
	if err := PrepareForJsonModule(&buf, dump, RenderOpts{EmitCreateRTFn: true}); err != nil {
		t.Fatalf("PrepareForJsonModule: %v", err)
	}
	out := buf.String()

	// The exact validator body the union root emits — unchanged by the
	// cross-family capture. Sub-union dispatch over the conflicting `a` slot
	// uses the candidate validate lookups. Keys are the opaque per-family fnHashes
	// (prepareForJson for the root, validate for the discriminator lookups).
	pjUni := operations.PlainHash("prepareForJson") + "_uni"
	itBig := valKey("big")
	itDat := valKey("dat")
	wantBody := "function " + pjUni + "(v){if (typeof v === 'object' && v !== null) " +
		"{if ((" + itBig + "?.fn(v.a) ?? true)) {v.a = v.a.toString();v.a = [0, v.a]} " +
		"else if ((typeof v.a === 'object' && v.a !== null && (" + itDat + "?.fn(v.a) ?? true))) " +
		"{v.a = [1, v.a]};v = [-1, v]} else { throw new Error(fuEncErr) } return v}"
	if !strings.Contains(out, wantBody) {
		t.Errorf("expected the union validator body unchanged after capture:\nwant substring:\n%s\ngot module:\n%s", wantBody, out)
	}

	// The cross-family lookups appear in the closure prologue as getRT
	// context-item declarations exactly as before (the registration the
	// capture piggy-backs on).
	for _, want := range []string{"const " + itBig + " = utl.getRT('" + itBig + "')", "const " + itDat + " = utl.getRT('" + itDat + "')"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected getRT prologue %q in rendered module:\n%s", want, out)
		}
	}

	// Determinism: a second render produces byte-identical output.
	var buf2 bytes.Buffer
	if err := PrepareForJsonModule(&buf2, dump, RenderOpts{EmitCreateRTFn: true}); err != nil {
		t.Fatalf("PrepareForJsonModule (second render): %v", err)
	}
	if buf2.String() != out {
		t.Error("module render is non-deterministic after cross-family capture")
	}
}

// TestRecordCrossFamilyDep_DedupAndPrefixGate exercises the recorder directly:
// it dedups, drops same-family (prefix-matching) ids, and no-ops when the
// walker has no InnerPrefix set (hand-constructed walkers in unit tests).
func TestRecordCrossFamilyDep_DedupAndPrefixGate(t *testing.T) {
	rt := &protocol.RunType{Kind: protocol.KindString, ID: "root"}
	w := NewWalker(rt, "pj_root", PrepareForJsonEmitter{})
	w.InnerPrefix = "pj_"

	// Same-family (matches InnerPrefix) — ignored.
	w.recordCrossFamilyDep("pj_child")
	// Cross-family — recorded, and deduped on repeat.
	w.recordCrossFamilyDep("val_a")
	w.recordCrossFamilyDep("val_a")
	w.recordCrossFamilyDep("tb_b")

	got := append([]string(nil), w.CrossFamilyDeps...)
	sort.Strings(got)
	want := []string{"tb_b", "val_a"} // sorted: tb_ < val_
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("expected cross-family deps %v, got %v", want, w.CrossFamilyDeps)
	}

	// No InnerPrefix set ⇒ records nothing (everything looks same-family-ish
	// / unknowable, so the recorder stays conservative).
	noPrefix := NewWalker(rt, "pj_root", PrepareForJsonEmitter{})
	noPrefix.recordCrossFamilyDep("val_a")
	if len(noPrefix.CrossFamilyDeps) != 0 {
		t.Fatalf("expected no captures when InnerPrefix is empty, got %v", noPrefix.CrossFamilyDeps)
	}
}
