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
	mergeObject(&ops, existing, desired, mergeCtx{metaKeys: friendlyReservedKeys})
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
	mergeObject(&ops, existingView, desiredView, mergeCtx{metaKeys: friendlyReservedKeys})
	if len(ops) != 0 {
		t.Errorf("expected zero ops on a structurally-matching body; got %d: %s", len(ops), describeSpliceOps(ops))
	}
}

// mergeWithCtx runs the merge with a full ctx (child-id maps) and returns the
// result — the driver for rename tests that need Tier-2 @rtIds identity.
func mergeWithCtx(t *testing.T, existingBody, desiredBody string, ctx mergeCtx) string {
	t.Helper()
	existing := parseDesiredObject(existingBody)
	desired := parseDesiredObject(desiredBody)
	if existing == nil || desired == nil {
		t.Fatalf("failed to parse bodies")
	}
	var ops []spliceOp
	mergeObject(&ops, existing, desired, ctx)
	return string(applySplices([]byte(existing.text), ops))
}

// TestMerge_RenameTier1: a named-type field renamed (home → residence) shares the
// `friendlyAddress` reference identity → the value is carried under the new key.
func TestMerge_RenameTier1(t *testing.T) {
	existing := "{$label: '', home: friendlyAddress}"
	desired := "{$label: '', residence: friendlyAddress}"
	got := mergeWithCtx(t, existing, desired, mergeCtx{metaKeys: friendlyReservedKeys})
	if !strings.Contains(got, "residence: friendlyAddress") {
		t.Errorf("Tier-1 rename should carry value under new key 'residence':\n%s", got)
	}
	if strings.Contains(got, "home:") {
		t.Errorf("old key 'home' should be gone:\n%s", got)
	}
	if strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("a rename must NOT orphan the field:\n%s", got)
	}
}

// TestMerge_RenameTier2: a primitive field renamed (fullName → name) shares its
// @rtIds child id → the authored value is carried under the new key.
func TestMerge_RenameTier2(t *testing.T) {
	existing := "{$label: '', fullName: {$label: 'Full name'}}"
	desired := "{$label: '', name: {$label: ''}}"
	ctx := mergeCtx{
		metaKeys:      friendlyReservedKeys,
		existingChild: map[string]string{"fullName": "strID"},
		desiredChild:  map[string]string{"name": "strID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	if !strings.Contains(got, "name: {$label: 'Full name'}") {
		t.Errorf("Tier-2 rename should carry authored value under new key 'name':\n%s", got)
	}
	if strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("a Tier-2 rename must NOT orphan:\n%s", got)
	}
}

// TestMerge_RenameAmbiguousFallback: two primitive fields share the SAME child
// id (e.g. both string) — the identity is ambiguous, so NO rename; the drop is
// orphaned and the add inserted.
func TestMerge_RenameAmbiguousFallback(t *testing.T) {
	existing := "{$label: '', oldA: {$label: 'A'}, oldB: {$label: 'B'}}"
	desired := "{$label: '', newA: {$label: ''}, newB: {$label: ''}}"
	// All four share id "strID" → 2 drops + 2 adds in one bucket → ambiguous.
	ctx := mergeCtx{
		metaKeys:      friendlyReservedKeys,
		existingChild: map[string]string{"oldA": "strID", "oldB": "strID"},
		desiredChild:  map[string]string{"newA": "strID", "newB": "strID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	if !strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("ambiguous identity should fall through to orphan-child:\n%s", got)
	}
	if !strings.Contains(got, "newA: {$label: ''}") || !strings.Contains(got, "newB: {$label: ''}") {
		t.Errorf("ambiguous adds should be inserted fresh:\n%s", got)
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
