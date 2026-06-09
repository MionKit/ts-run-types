package typefns

import "testing"

// TestEntryRenderCache_Merge pins the shard-merge semantics the parallel
// render path relies on: nil-safety on both sides, disjoint union, and
// idempotent same-key overwrites.
func TestEntryRenderCache_Merge(t *testing.T) {
	var nilCache *EntryRenderCache
	nilCache.Merge(NewEntryRenderCache()) // must not panic
	target := NewEntryRenderCache()
	target.Merge(nil) // must not panic

	target.put("valAB_x1", entryRender{line: "a"})
	shard := NewEntryRenderCache()
	shard.put("pjCD_x2", entryRender{line: "b"})
	target.Merge(shard)
	if entry, ok := target.get("valAB_x1"); !ok || entry.line != "a" {
		t.Fatalf("merge dropped pre-existing entry: %+v ok=%v", entry, ok)
	}
	if entry, ok := target.get("pjCD_x2"); !ok || entry.line != "b" {
		t.Fatalf("merge missed shard entry: %+v ok=%v", entry, ok)
	}

	// Same-key merge (only possible when both shards compiled the same
	// (family, variant, type), which yields the same compiled entry) —
	// last write wins and the cache stays consistent.
	duplicate := NewEntryRenderCache()
	duplicate.put("pjCD_x2", entryRender{line: "b"})
	target.Merge(duplicate)
	if entry, ok := target.get("pjCD_x2"); !ok || entry.line != "b" {
		t.Fatalf("idempotent same-key merge broke entry: %+v ok=%v", entry, ok)
	}
}

// TestFactsTable_Merge pins the predicate-shard merge: nil-safety,
// per-kind union, and conflict-free same-key verdicts.
func TestFactsTable_Merge(t *testing.T) {
	var nilTable *FactsTable
	nilTable.Merge(NewFactsTable()) // must not panic
	target := NewFactsTable()
	target.Merge(nil) // must not panic

	target.verdicts[factJsonCompat]["idA"] = true
	shard := NewFactsTable()
	shard.verdicts[factJsonCompat]["idB"] = false
	shard.verdicts[factExtraProof]["idA"] = true
	target.Merge(shard)

	if verdict, ok := target.verdicts[factJsonCompat]["idA"]; !ok || !verdict {
		t.Fatalf("merge dropped pre-existing verdict")
	}
	if verdict, ok := target.verdicts[factJsonCompat]["idB"]; !ok || verdict {
		t.Fatalf("merge missed shard verdict for idB")
	}
	if verdict, ok := target.verdicts[factExtraProof]["idA"]; !ok || !verdict {
		t.Fatalf("merge missed extra-proof shard verdict")
	}

	// Same key, same value (verdicts are pure functions of the node) —
	// merging again must not flip anything.
	repeat := NewFactsTable()
	repeat.verdicts[factJsonCompat]["idA"] = true
	target.Merge(repeat)
	if verdict := target.verdicts[factJsonCompat]["idA"]; !verdict {
		t.Fatalf("idempotent merge flipped a verdict")
	}
}
