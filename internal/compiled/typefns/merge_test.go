package typefns

import "testing"

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
