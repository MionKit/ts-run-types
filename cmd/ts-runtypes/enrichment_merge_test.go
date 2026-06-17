package main

import (
	"strings"
	"testing"
)

// mergeFriendly parses an existing friendly object body + a desired friendly
// skeleton body, runs the merge, applies the splices, and returns the result.
// It is the unit-test driver for the property merge (no CLI, no files).
func mergeFriendly(t *testing.T, existingBody, desiredBody string) string {
	t.Helper()
	existing := parseDesiredObject(existingBody)
	desired := parseDesiredObject(desiredBody)
	if existing == nil || desired == nil {
		t.Fatalf("failed to parse bodies")
	}
	var ops []spliceOp
	mergeObject(&ops, existing, desired, friendlyReservedKeys, nil)
	return string(applySplices([]byte(existing.text), ops))
}

// TestMerge_KeepLeafValues: a field present in both as a leaf keeps its authored
// value + formatting byte-for-byte.
func TestMerge_KeepLeafValues(t *testing.T) {
	existing := "{$label: 'User', name: {$label: 'Full name'}, age: {$label: 'Age'}}"
	desired := "{$label: '', name: {$label: ''}, age: {$label: ''}}"
	got := mergeFriendly(t, existing, desired)
	// Wrapped as `const _ = <body>;` — assert the values survive.
	if !strings.Contains(got, "name: {$label: 'Full name'}") {
		t.Errorf("authored 'Full name' not preserved:\n%s", got)
	}
	if !strings.Contains(got, "age: {$label: 'Age'}") {
		t.Errorf("authored 'Age' not preserved:\n%s", got)
	}
	if !strings.Contains(got, "$label: 'User'") {
		t.Errorf("authored root $label not preserved:\n%s", got)
	}
}

// TestMerge_AddField: a desired-only field is inserted as a fresh skeleton at
// the object's end, other fields untouched.
func TestMerge_AddField(t *testing.T) {
	existing := "{$label: '', name: {$label: 'Full name'}}"
	desired := "{$label: '', name: {$label: ''}, isActive: {$label: ''}}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "name: {$label: 'Full name'}") {
		t.Errorf("existing field not preserved:\n%s", got)
	}
	if !strings.Contains(got, "isActive: {$label: ''}") {
		t.Errorf("added field 'isActive' missing:\n%s", got)
	}
}

// TestMerge_OrphanChild: an existing-only field is commented out in place with
// @rtOrphanChild, its value preserved, and the trailing comma swallowed (no
// dangling separator).
func TestMerge_OrphanChild(t *testing.T) {
	existing := "{$label: '', name: {$label: 'Full name'}, age: {$label: 'Age in years'}, isActive: {$label: ''}}"
	desired := "{$label: '', name: {$label: ''}, isActive: {$label: ''}}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("orphan tag missing:\n%s", got)
	}
	if !strings.Contains(got, "age: {$label: 'Age in years'}") {
		t.Errorf("orphaned value not preserved:\n%s", got)
	}
	// No dangling `,` directly before isActive's comment region — the result must
	// parse (a re-parse yields zero diagnostics).
	reparse := parseDesiredObject(strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(got), "const _ ="), ";"))
	if reparse == nil {
		t.Errorf("merged body does not re-parse as an object literal:\n%s", got)
	}
}

// TestMerge_IdempotentNoOp: merging the desired skeleton against a structurally
// matching (but Prettier-formatted) existing body yields ZERO splice ops.
func TestMerge_IdempotentNoOp(t *testing.T) {
	existing := "{ $label: 'User', name: { $label: 'Full name' }, age: { $label: 'Age' } }"
	desired := "{$label: '', name: {$label: ''}, age: {$label: ''}}"
	existingView := parseDesiredObject(existing)
	desiredView := parseDesiredObject(desired)
	var ops []spliceOp
	mergeObject(&ops, existingView, desiredView, friendlyReservedKeys, nil)
	if len(ops) != 0 {
		t.Errorf("expected zero ops on a structurally-matching body; got %d: %s", len(ops), describeSpliceOps(ops))
	}
}

// TestMerge_NestedRecurse: a nested object field gains a new sub-field while its
// sibling's authored value survives.
func TestMerge_NestedRecurse(t *testing.T) {
	existing := "{$label: '', profile: {$label: '', email: {$label: 'Email'}}}"
	desired := "{$label: '', profile: {$label: '', email: {$label: ''}, score: {$label: ''}}}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "email: {$label: 'Email'}") {
		t.Errorf("nested authored value not preserved:\n%s", got)
	}
	if !strings.Contains(got, "score: {$label: ''}") {
		t.Errorf("nested added field 'score' missing:\n%s", got)
	}
}
