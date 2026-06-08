package typefns

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/mionkit/ts-run-types/internal/cache/disk"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// sortedCopy returns a sorted copy of s — cross-family deps are collected in
// map-iteration order, so equality assertions must compare order-independently.
func sortedCopy(in []string) []string {
	out := append([]string(nil), in...)
	sort.Strings(out)
	return out
}

// seedConflictPropUnionLookup registers structural ids for every member of the
// conflict-prop union fixture so both the write path (StructuralForHash on the
// bare member hash) and the read path (HashForStructural) can resolve the
// cross-family `it_big` / `it_dat` edges. Structural ids are arbitrary but must
// be stable across the two renders for the round-trip to hit.
func seedConflictPropUnionLookup(lookup *fakeLookup) {
	lookup.set("uni", "u:union")
	lookup.set("big", "b:bigint")
	lookup.set("dat", "d:date")
	lookup.set("ob1", "o1:obj")
	lookup.set("ob2", "o2:obj")
	lookup.set("pab", "pa:prop")
	lookup.set("pad", "pd:prop")
}

// TestRenderFnModule_DiskCache_CrossFamilyRoundTrip — the core of the perf
// follow-up. A prepareForJson entry for the conflict-prop union
// (`{a:bigint}|{a:Date}`) reaches the cross-family `it_big` / `it_dat`
// discrimination edges. Rendering it once with a wired disk Store persists
// those edges as CrossFamilyRefs; a second render must HIT the disk cache (the
// walker never runs) yet return the SAME crossFamilyDeps the fresh walk
// produced. Without the persistence this is empty on the hit and the demand
// collection pass silently drops the `it_<member>` roots.
func TestRenderFnModule_DiskCache_CrossFamilyRoundTrip(t *testing.T) {
	root := t.TempDir()
	store := disk.New(root, "fp1")
	lookup := newFakeLookup()
	seedConflictPropUnionLookup(lookup)

	runTypes, rootID := buildConflictPropUnionFixture()
	refTable := buildRefTable(runTypes)
	settings := constants.CacheModules["prepareForJson"]
	prefix := innerPrefix(settings)
	opts := RenderOpts{Store: store, Lookup: lookup, RefTable: refTable}

	// First render: walker runs, writes the entry (with CrossFamilyRefs).
	first := renderEntryWithDeps(refTable[rootID], settings, PrepareForJsonEmitter{}, prefix, refTable, opts, "", nil)
	if first.line == "" {
		t.Fatal("first render produced an empty line for the conflict-prop union")
	}
	wantCross := sortedCopy(first.crossFamilyDeps)
	if len(wantCross) == 0 {
		t.Fatalf("fixture precondition: expected the fresh walk to capture cross-family edges, got none")
	}
	for _, want := range []string{"it_big", "it_dat"} {
		if !containsStr(first.crossFamilyDeps, want) {
			t.Fatalf("fresh render missing cross-family edge %q (got %v)", want, first.crossFamilyDeps)
		}
	}

	// The on-disk entry must persist the cross-family edges as CrossFamilyRefs.
	cachePath := filepath.Join(root, "fp1", rootID, settings.Tag+".json")
	raw, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("expected cache file at %s: %v", cachePath, err)
	}
	var entry disk.RTEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("cache file is not valid JSON: %v", err)
	}
	if entry.Format != disk.FormatVersion {
		t.Errorf("cache Format: got %d want %d", entry.Format, disk.FormatVersion)
	}
	if len(entry.CrossFamilyRefs) != len(wantCross) {
		t.Fatalf("persisted CrossFamilyRefs count: got %d (%+v) want %d", len(entry.CrossFamilyRefs), entry.CrossFamilyRefs, len(wantCross))
	}
	gotRefDeps := make([]string, 0, len(entry.CrossFamilyRefs))
	for _, ref := range entry.CrossFamilyRefs {
		if ref.Prefix != "it_" {
			t.Errorf("CrossFamilyRef prefix: got %q want %q", ref.Prefix, "it_")
		}
		// StructuralID must match the lookup's structural id for the bare hash
		// (the drift anchor); the reader revalidates against it.
		if ref.StructuralID != lookup.StructuralForHash(ref.Hash) {
			t.Errorf("CrossFamilyRef sid for %q: got %q want %q", ref.Hash, ref.StructuralID, lookup.StructuralForHash(ref.Hash))
		}
		gotRefDeps = append(gotRefDeps, ref.Prefix+ref.Hash)
	}
	if got := sortedCopy(gotRefDeps); !equalStrSlices(got, wantCross) {
		t.Errorf("reconstructed deps from CrossFamilyRefs: got %v want %v", got, wantCross)
	}

	// Second render: must HIT the disk cache (line came back from disk) and
	// return the SAME crossFamilyDeps. Prove the hit by mutating the on-disk
	// Line to a sentinel — if the walker re-ran we'd never observe it.
	entry.Line = "init('pj_uni','CACHE_SENTINEL',undefined,true);"
	mutated, _ := json.Marshal(entry)
	if err := os.WriteFile(cachePath, mutated, 0o644); err != nil {
		t.Fatal(err)
	}
	second := renderEntryWithDeps(refTable[rootID], settings, PrepareForJsonEmitter{}, prefix, refTable, opts, "", nil)
	if second.line != entry.Line {
		t.Fatalf("second render did not hit the disk cache (line=%q, want the mutated sentinel line)", second.line)
	}
	if got := sortedCopy(second.crossFamilyDeps); !equalStrSlices(got, wantCross) {
		t.Errorf("cache hit lost cross-family edges: got %v want %v", got, wantCross)
	}
}

// TestCrossFamilyItRoots_DiskCacheHit_PreservesRoots — end-to-end at the
// CrossFamilyItRoots seam. With the bypass removed, the collection pass uses the
// disk Store; a warm cache (second invocation) must still surface the same
// `it`-demand roots (the bare member ids of the discrimination edges) as a cold
// run. This is the behaviour the whole follow-up protects: removing the bypass
// must NOT drop union roots on a cached build.
func TestCrossFamilyItRoots_DiskCacheHit_PreservesRoots(t *testing.T) {
	root := t.TempDir()
	store := disk.New(root, "fp1")
	lookup := newFakeLookup()
	seedConflictPropUnionLookup(lookup)

	runTypes, _ := buildConflictPropUnionFixture()
	refTable := buildRefTable(runTypes)
	// CrossFamilyItRoots iterates every non-it family demand-driven; give it a
	// site whose Demand targets prepareForJson (the "mutate" JSON strategy → `pj`)
	// for the union so prepareForJson actually emits the union entry (and thus
	// the it_ discrimination edges).
	dump := protocol.Dump{
		RunTypes: runTypes,
		Sites:    []protocol.Site{{ID: "uni", Demand: []protocol.SiteDemand{{FamilyTag: "pj"}}}},
	}
	opts := RenderOpts{Store: store, Lookup: lookup, RefTable: refTable}

	cold := sortedCopy(CrossFamilyItRoots(dump, opts))
	if len(cold) == 0 {
		t.Fatalf("cold CrossFamilyItRoots produced no roots; fixture/site precondition broken")
	}
	for _, want := range []string{"big", "dat"} {
		if !containsStr(cold, want) {
			t.Fatalf("cold roots missing bare member %q (got %v)", want, cold)
		}
	}

	// Second pass: the per-family entries are now disk-cached, so the walker is
	// skipped — but the persisted CrossFamilyRefs must reproduce the identical
	// root set.
	warm := sortedCopy(CrossFamilyItRoots(dump, opts))
	if !equalStrSlices(cold, warm) {
		t.Errorf("warm (disk-cache-hit) roots differ from cold roots:\ncold: %v\nwarm: %v", cold, warm)
	}
}

// TestRenderFnModule_DiskCache_CrossFamilyHashDriftMiss — when a persisted
// cross-family ref's structural id maps to a DIFFERENT hash in the current
// build (member re-hashed across builds), the whole entry must be a miss and
// the walker re-runs. Mirrors the ChildRefs drift rule for the cross-family
// channel.
func TestRenderFnModule_DiskCache_CrossFamilyHashDriftMiss(t *testing.T) {
	root := t.TempDir()
	store := disk.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("uni", "u:union")

	// Pre-seed a v2 entry whose CrossFamilyRef points at a structural id that
	// the CURRENT lookup resolves to a different hash than the one baked in.
	// `b:bigint` → "freshBig" now, but the ref claims it was "staleBig".
	lookup.set("freshBig", "b:bigint")
	cachePath := filepath.Join(root, "fp1", "uni", "pj.json")
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
		t.Fatal(err)
	}
	stale := disk.RTEntry{
		Format:       disk.FormatVersion,
		StructuralID: "u:union",
		Line:         "init('pj_uni','STALE_CROSS_MARKER',undefined,true);",
		CrossFamilyRefs: []disk.CrossFamilyRef{
			{Prefix: "it_", StructuralID: "b:bigint", Hash: "staleBig"},
		},
	}
	raw, _ := json.Marshal(stale)
	if err := os.WriteFile(cachePath, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	// Render the union via prepareForJson. The drift on the cross-family ref
	// (current hash "freshBig" != baked "staleBig") must reject the cache.
	runTypes, rootID := buildConflictPropUnionFixture()
	refTable := buildRefTable(runTypes)
	// Seed the remaining members so the fresh walk (post-miss) and its rewrite
	// resolve cleanly.
	lookup.set("dat", "d:date")
	lookup.set("ob1", "o1:obj")
	lookup.set("ob2", "o2:obj")
	lookup.set("pab", "pa:prop")
	lookup.set("pad", "pd:prop")

	settings := constants.CacheModules["prepareForJson"]
	rendered := renderEntryWithDeps(refTable[rootID], settings, PrepareForJsonEmitter{}, innerPrefix(settings), refTable, RenderOpts{Store: store, Lookup: lookup, RefTable: refTable}, "", nil)
	if rendered.line == "" {
		t.Fatal("post-miss render produced empty line")
	}
	if contains := rendered.line == stale.Line; contains {
		t.Errorf("cross-family hash drift should miss, but stale line was returned: %q", rendered.line)
	}
	// The fresh walk re-derives the real edges (with the current member hashes).
	for _, want := range []string{"it_dat"} {
		if !containsStr(rendered.crossFamilyDeps, want) {
			t.Errorf("post-miss render missing fresh cross-family edge %q (got %v)", want, rendered.crossFamilyDeps)
		}
	}
}

// TestRenderFnModule_DiskCache_FormatV1IsMiss — a file written under the old v1
// layout (no CrossFamilyRefs field) must be treated as a miss under v2, since a
// v1 hit would return an empty cross-family set and silently break unions. The
// rewrite then produces a v2 file the current build reads back.
func TestRenderFnModule_DiskCache_FormatV1IsMiss(t *testing.T) {
	root := t.TempDir()
	store := disk.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("abc123", "1:atomic")

	cachePath := filepath.Join(root, "fp1", "abc123", "it.json")
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
		t.Fatal(err)
	}
	// Hand-write a v1-shaped file: Format=1, no crossFamilyRefs key.
	v1 := map[string]any{
		"version":      1,
		"structuralID": "1:atomic",
		"line":         "init('it_abc123','V1_STALE_MARKER',undefined,true);",
		"childRefs":    []any{},
	}
	raw, _ := json.Marshal(v1)
	if err := os.WriteFile(cachePath, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	dump := protocol.Dump{RunTypes: []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}}}
	rendered := renderEntryWithDeps(dump.RunTypes[0], constants.CacheModules["isType"], IsTypeEmitter{}, "it_", buildRefTable(dump.RunTypes), RenderOpts{Store: store, Lookup: lookup}, "", nil)
	if rendered.line == v1["line"] {
		t.Errorf("v1 file should be a miss under FormatVersion %d, but the stale v1 line was returned", disk.FormatVersion)
	}

	// After the miss the renderer rewrites a v2 file the current build accepts.
	rewritten, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatal(err)
	}
	var fresh disk.RTEntry
	if err := json.Unmarshal(rewritten, &fresh); err != nil {
		t.Fatal(err)
	}
	if fresh.Format != disk.FormatVersion {
		t.Errorf("rewritten file Format: got %d want %d", fresh.Format, disk.FormatVersion)
	}
}

// equalStrSlices reports element-wise equality of two string slices.
func equalStrSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
