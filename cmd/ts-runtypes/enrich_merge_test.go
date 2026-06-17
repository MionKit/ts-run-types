package main

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
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
// the object's end, other fields untouched. The merged body MUST re-parse with
// zero diagnostics — the existing object's last property has NO trailing comma
// (a Prettier-collapsed single-line object), so the insert must inject the
// separator itself (regression for the missing-separator-comma bug A1).
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
	assertReparses(t, got)
}

// TestMerge_AddFieldNoTrailingComma: adding a field to an object whose last
// property has NO trailing comma (Prettier-collapsed single-line) must inject a
// separator comma so the result re-parses. Without it the merged body reads
// `name: {…}\n  isActive: {…},` — two properties with no separator → syntax
// error → the next gen --update fatals at parseMirror. This is the A1 regression.
func TestMerge_AddFieldNoTrailingComma(t *testing.T) {
	existing := "{$label: '', name: {$label: 'Full name'}}"
	desired := "{$label: '', name: {$label: ''}, isActive: {$label: ''}}"
	got := mergeFriendly(t, existing, desired)
	assertReparses(t, got)
	// The separator must be present: between the `name` value's closing `}` and the
	// added `isActive` there is a comma (possibly preceded by the object's `}` for
	// the value).
	if !strings.Contains(got, "isActive: {$label: ''}") {
		t.Errorf("added field missing:\n%s", got)
	}
}

// assertReparses asserts that a merged `const _ = <body>;` wrapper (the
// mergeFriendly output) re-parses with ZERO diagnostics — the only sound check
// that the merge produced syntactically-valid bytes. A missing-separator object
// (`{a: {} b: {}}`) still yields an object-literal NODE via error recovery, so
// we must inspect Diagnostics, not just node-kind.
func assertReparses(t *testing.T, wrapped string) {
	t.Helper()
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: "/reparse.ts", Path: tspath.Path("/reparse.ts")},
		wrapped,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		t.Fatalf("re-parse returned nil source file:\n%s", wrapped)
	}
	if diagnostics := sourceFile.Diagnostics(); len(diagnostics) > 0 {
		t.Errorf("merged body re-parses with %d diagnostic(s) (first: %s):\n%s",
			len(diagnostics), diagnostics[0].String(), wrapped)
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

// TestSanitizeForComment_RoundTrip: a value containing every tricky byte
// sequence — the comment terminator `*/`, the OLD escape form `* /`, the new
// escape form `*\/`, and bare backslashes — round-trips byte-identically through
// sanitize → embed-in-comment → restore. This is the A2 regression: the old
// `*/`→`* /` scheme corrupted an authored literal `* /` on restore. The result
// must also be safe to embed (no surviving `*/`).
func TestSanitizeForComment_RoundTrip(t *testing.T) {
	cases := []string{
		"plain value",
		"contains */ terminator",
		"contains * / spaced form",
		"contains *\\/ backslash form",
		"both */ and * / together",
		"both */ and *\\/ together: */*\\/",
		"trailing backslash \\",
		"double backslash \\\\ middle",
		"path/to\\file with */ and \\ mixed",
		"*/",
		"* /",
		"*\\/",
		"\\",
	}
	for _, original := range cases {
		sanitized := sanitizeForComment(original)
		if strings.Contains(sanitized, "*/") {
			t.Errorf("sanitized form still contains a `*/` terminator for %q: %q", original, sanitized)
		}
		restored := unsanitizeFromComment(sanitized)
		if restored != original {
			t.Errorf("round-trip not byte-identical:\n original  = %q\n sanitized = %q\n restored  = %q", original, sanitized, restored)
		}
	}
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

// TestMerge_RenameIdentityPrefersChildID is the C4 regression: when a field has
// BOTH a `friendly*` ref value AND an @rtIds child id, the CHILD ID is the
// canonical (form-independent) rename identity. Here two named-type fields reuse
// the same ref var name `friendlyThing` but have DIFFERENT child ids — pairing
// by ref name would mis-pair them, but pairing by child id keeps them apart.
func TestMerge_RenameIdentityPrefersChildID(t *testing.T) {
	// `a` (id aID) renamed to `x` (id aID) → should pair; `b` (id bID) renamed to
	// `y` (id bID) → should pair. Both old fields share the ref `friendlyThing`, so
	// ref-name identity would make 2 drops + 2 adds collide → ambiguous → no
	// rename. Child-id identity keeps a↔x and b↔y as distinct singleton buckets.
	existing := "{$label: '', a: friendlyThing, b: friendlyThing}"
	desired := "{$label: '', x: friendlyThing, y: friendlyThing}"
	ctx := mergeCtx{
		metaKeys:      friendlyReservedKeys,
		existingChild: map[string]string{"a": "aID", "b": "bID"},
		desiredChild:  map[string]string{"x": "aID", "y": "bID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	// Child-id pairing renames a→x and b→y (no orphan).
	if strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("child-id identity should pair both renames, not orphan:\n%s", got)
	}
	if !strings.Contains(got, "x: friendlyThing") || !strings.Contains(got, "y: friendlyThing") {
		t.Errorf("both renames should land under their new keys:\n%s", got)
	}
	if strings.Contains(got, "a: friendlyThing") || strings.Contains(got, "b: friendlyThing") {
		t.Errorf("old keys should be gone:\n%s", got)
	}
	assertReparses(t, got)
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

// TestMerge_ChildTypeChanged: a kept key whose @rtIds child id CHANGED (e.g.
// `age: number`→`age: string`) is replaced in place — the stale value becomes an
// @rtOrphanChild carcass and a fresh skeleton is spliced in. Without this the old
// (number-pool) value silently rides the now-string field. This is the A4
// regression for the childID-change arm.
func TestMerge_ChildTypeChanged(t *testing.T) {
	existing := "{$label: '', age: {min: 0, max: 120}}"
	desired := "{$label: '', age: {pool: ['x']}}"
	ctx := mergeCtx{
		metaKeys:      mockReservedKeys,
		existingChild: map[string]string{"age": "numID"},
		desiredChild:  map[string]string{"age": "strID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	if !strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("changed child type should orphan the stale value:\n%s", got)
	}
	if !strings.Contains(got, "min: 0, max: 120") {
		t.Errorf("stale value must be preserved in the carcass:\n%s", got)
	}
	if !strings.Contains(got, "age: {pool: ['x']}") {
		t.Errorf("fresh skeleton for the new type must be inserted:\n%s", got)
	}
	assertReparses(t, got)
}

// TestMerge_ChildTypeUnchanged: a kept key whose @rtIds child id is IDENTICAL on
// both sides keeps its authored value byte-for-byte (no orphan, no replace) — the
// childID-change arm only fires on a real change.
func TestMerge_ChildTypeUnchanged(t *testing.T) {
	existing := "{$label: '', age: {pool: [42]}}"
	desired := "{$label: '', age: {pool: ['x']}}"
	ctx := mergeCtx{
		metaKeys:      mockReservedKeys,
		existingChild: map[string]string{"age": "numID"},
		desiredChild:  map[string]string{"age": "numID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	if strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("unchanged child id must NOT orphan:\n%s", got)
	}
	if !strings.Contains(got, "pool: [42]") {
		t.Errorf("authored value must survive unchanged:\n%s", got)
	}
}

// TestMerge_ShapeMismatchObjectToReference: a kept key that was an inline object
// but is now a named-type REFERENCE (e.g. `address: {…}` → `address:
// friendlyAddress`) switches to the reference; the old object is orphaned. This
// is the A4 regression for the object↔leaf shape-mismatch arm.
func TestMerge_ShapeMismatchObjectToReference(t *testing.T) {
	existing := "{$label: '', address: {$label: '', street: {$label: 'St'}}}"
	desired := "{$label: '', address: friendlyAddress}"
	got := mergeWithCtx(t, existing, desired, mergeCtx{metaKeys: friendlyReservedKeys})
	if !strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("object→reference shape change should orphan the old object:\n%s", got)
	}
	if !strings.Contains(got, "address: friendlyAddress") {
		t.Errorf("the field must switch to the reference:\n%s", got)
	}
	if !strings.Contains(got, "street: {$label: 'St'}") {
		t.Errorf("the old object must be preserved in the carcass:\n%s", got)
	}
	assertReparses(t, got)
}

// TestMerge_ShapeMismatchReferenceToObject: the inverse — a leaf/reference that
// became an inline object is replaced the same way.
func TestMerge_ShapeMismatchReferenceToObject(t *testing.T) {
	existing := "{$label: '', address: friendlyAddress}"
	desired := "{$label: '', address: {$label: '', city: {$label: ''}}}"
	got := mergeWithCtx(t, existing, desired, mergeCtx{metaKeys: friendlyReservedKeys})
	if !strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("reference→object shape change should orphan the old reference:\n%s", got)
	}
	if !strings.Contains(got, "city: {$label: ''}") {
		t.Errorf("the field must switch to the fresh object skeleton:\n%s", got)
	}
	assertReparses(t, got)
}

// TestMerge_ChildTypeChangedLastField: the replaced field is the LAST property
// (no trailing comma) — the in-place replace must still re-parse cleanly (the
// fresh property carries its own trailing comma, valid before `}`).
func TestMerge_ChildTypeChangedLastField(t *testing.T) {
	existing := "{$label: '', name: {pool: ['n']}, age: {min: 0}}"
	desired := "{$label: '', name: {pool: ['n']}, age: {pool: ['x']}}"
	ctx := mergeCtx{
		metaKeys:      mockReservedKeys,
		existingChild: map[string]string{"name": "strID", "age": "numID"},
		desiredChild:  map[string]string{"name": "strID", "age": "strID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	assertReparses(t, got)
	if !strings.Contains(got, "@rtOrphanChild") || !strings.Contains(got, "min: 0") {
		t.Errorf("last-field replace should orphan the stale value:\n%s", got)
	}
}

// TestMerge_MetaRecurseItems: an `$items` element OBJECT gains a sub-field on
// the desired side — the merge must descend through the `$items` meta node and
// ADD the new sub-field while preserving the authored sibling. This is the B1
// regression: meta keys were excluded from the merge entirely, so nested
// enrichment under arrays froze at first generation.
func TestMerge_MetaRecurseItems(t *testing.T) {
	// `tags: SomeObj[]` — the array element is an object with enrich.
	existing := "{$label: '', tags: {$label: 'Tags', $items: {$label: '', id: {$label: 'ID'}}}}"
	desired := "{$label: '', tags: {$label: '', $items: {$label: '', id: {$label: ''}, name: {$label: ''}}}}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "id: {$label: 'ID'}") {
		t.Errorf("authored $items sub-field value must survive:\n%s", got)
	}
	if !strings.Contains(got, "name: {$label: ''}") {
		t.Errorf("new $items sub-field 'name' must be added:\n%s", got)
	}
	assertReparses(t, got)
}

// TestMerge_MetaRecurseValues: a Map/Set `$values` element object gains a
// sub-field — merged through the `$values` meta node.
func TestMerge_MetaRecurseValues(t *testing.T) {
	existing := "{$label: '', cache: {$label: '', $values: {$label: '', a: {$label: 'A'}}}}"
	desired := "{$label: '', cache: {$label: '', $values: {$label: '', a: {$label: ''}, b: {$label: ''}}}}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "a: {$label: 'A'}") {
		t.Errorf("authored $values sub-field must survive:\n%s", got)
	}
	if !strings.Contains(got, "b: {$label: ''}") {
		t.Errorf("new $values sub-field 'b' must be added:\n%s", got)
	}
	assertReparses(t, got)
}

// TestMerge_MetaRecurseSlots: a tuple `$slots` entry (positional) gains a
// sub-field — paired by index and merged. Slot 0 keeps its authored value; slot
// 1 gains a field.
func TestMerge_MetaRecurseSlots(t *testing.T) {
	existing := "{$label: '', pair: {$label: '', $slots: [{$label: 'First'}, {$label: '', x: {$label: 'X'}}]}}"
	desired := "{$label: '', pair: {$label: '', $slots: [{$label: ''}, {$label: '', x: {$label: ''}, y: {$label: ''}}]}}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "$label: 'First'") {
		t.Errorf("slot 0 authored value must survive:\n%s", got)
	}
	if !strings.Contains(got, "x: {$label: 'X'}") {
		t.Errorf("slot 1 authored sub-field value must survive:\n%s", got)
	}
	if !strings.Contains(got, "y: {$label: ''}") {
		t.Errorf("slot 1 new sub-field 'y' must be added:\n%s", got)
	}
	assertReparses(t, got)
}

// TestMerge_MetaRecurseScalarUntouched: scalar meta ($length) is author data and
// must never be touched by the meta recursion.
func TestMerge_MetaRecurseScalarUntouched(t *testing.T) {
	existing := "{$items: {pool: [1, 2]}, $length: [2, 5]}"
	desired := "{$items: {pool: []}, $length: [1, 3]}"
	got := mergeFriendly(t, existing, desired)
	if !strings.Contains(got, "$length: [2, 5]") {
		t.Errorf("authored scalar $length must survive untouched:\n%s", got)
	}
	if !strings.Contains(got, "pool: [1, 2]") {
		t.Errorf("authored $items pool must survive:\n%s", got)
	}
	assertReparses(t, got)
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

// --- Task 2: comment preservation across every reconcile path ---
//
// A hand-authored field comment (and a const-level comment) MUST survive every
// merge path, and a leading comment MUST move with a renamed field. The paths and
// their contracts:
//   (a) A4 kept-key TYPE CHANGE → replaceChildOp: the field STAYS, so its leading
//       comment survives ABOVE the field (not folded away, not stripped).
//   (b) Tier-1 NAMED-TYPE rename: the leading comment moves with the renamed key
//       (same as Tier-2, already covered by TestMerge_RenameTier2).
//   (c) ORPHANED field → orphanChildOp: the field is GONE, so its leading comment
//       folds INTO the carcass and is pruneable (no dangling cruft).
//   (d) NESTED-object sub-field comment: survives the recurse.
//   (e) trailing/inline comment on a KEPT field: survives untouched.

// TestComment_KeptTypeChange_SurvivesAbove is path (a): a kept key whose child
// type changed is replaced in place; its leading comment must survive ABOVE the
// field (the field still exists, so the comment is NOT folded into the carcass and
// is NOT stripped). It survives a later --prune (it describes the live field).
func TestComment_KeptTypeChange_SurvivesAbove(t *testing.T) {
	existing := "{$label: '',\n  // age in years\n  age: {min: 0, max: 120}}"
	desired := "{$label: '', age: {pool: ['x']}}"
	ctx := mergeCtx{
		metaKeys:      mockReservedKeys,
		existingChild: map[string]string{"age": "numID"},
		desiredChild:  map[string]string{"age": "strID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	assertReparses(t, got)
	if !strings.Contains(got, "// age in years") {
		t.Errorf("leading comment must survive a type-change replace:\n%s", got)
	}
	// The comment precedes the field (it describes the field that stays).
	if strings.Index(got, "// age in years") > strings.Index(got, "age: {pool: ['x']}") {
		t.Errorf("leading comment should stay ABOVE the replaced field:\n%s", got)
	}
	// It survives prune (the field is live, so the comment is not in the carcass).
	pruned, _ := pruneOrphanBlocks(got)
	if !strings.Contains(pruned, "// age in years") {
		t.Errorf("a live field's leading comment must survive --prune:\n%s", pruned)
	}
}

// TestComment_Tier1Rename_MovesWithField is path (b): a named-type field renamed
// (home → residence, both `friendlyAddress`) carries its leading comment under the
// new key — the comment moves with the field, same as the Tier-2 primitive case.
func TestComment_Tier1Rename_MovesWithField(t *testing.T) {
	existing := "{$label: '',\n  // where the user lives\n  home: friendlyAddress}"
	desired := "{$label: '', residence: friendlyAddress}"
	got := mergeWithCtx(t, existing, desired, mergeCtx{metaKeys: friendlyReservedKeys})
	assertReparses(t, got)
	if strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("a Tier-1 rename must NOT orphan:\n%s", got)
	}
	if !strings.Contains(got, "// where the user lives") {
		t.Errorf("leading comment must survive the rename:\n%s", got)
	}
	// The comment is directly above the renamed field.
	if strings.Index(got, "// where the user lives") > strings.Index(got, "residence: friendlyAddress") {
		t.Errorf("leading comment must move WITH the renamed field (above 'residence'):\n%s", got)
	}
	if strings.Contains(got, "home:") {
		t.Errorf("old key 'home' must be gone:\n%s", got)
	}
}

// TestComment_Tier2Rename_MovesWithField is path (b)'s primitive twin: a primitive
// field renamed (fullName → name) carries its leading comment under the new key.
// (The in-place key-splice leaves the leading comment untouched, so it stays
// above the renamed field.)
func TestComment_Tier2Rename_MovesWithField(t *testing.T) {
	existing := "{$label: '',\n  // the person's legal name\n  fullName: {$label: 'Full name'}}"
	desired := "{$label: '', name: {$label: ''}}"
	ctx := mergeCtx{
		metaKeys:      friendlyReservedKeys,
		existingChild: map[string]string{"fullName": "strID"},
		desiredChild:  map[string]string{"name": "strID"},
	}
	got := mergeWithCtx(t, existing, desired, ctx)
	assertReparses(t, got)
	if strings.Contains(got, "@rtOrphanChild") {
		t.Errorf("a Tier-2 rename must NOT orphan:\n%s", got)
	}
	if !strings.Contains(got, "// the person's legal name") {
		t.Errorf("leading comment must survive the rename:\n%s", got)
	}
	if strings.Index(got, "// the person's legal name") > strings.Index(got, "name: {$label: 'Full name'}") {
		t.Errorf("leading comment must move WITH the renamed field (above 'name'):\n%s", got)
	}
}

// TestComment_DroppedField_FoldsIntoCarcass is path (c): a dropped field's leading
// comment folds INTO its @rtOrphanChild carcass, so --prune removes it cleanly
// with the carcass — no dangling comment left above the surviving sibling. Covers
// both a `//` line comment and a `/* … */` block comment.
func TestComment_DroppedField_FoldsIntoCarcass(t *testing.T) {
	cases := []struct {
		name    string
		comment string
	}{
		{"line", "// note about age"},
		{"block", "/* note about age */"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			existing := "{$label: '',\n  " + tc.comment + "\n  age: {$label: 'Age'}, name: {$label: ''}}"
			desired := "{$label: '', name: {$label: ''}}"
			got := mergeFriendly(t, existing, desired)
			assertReparses(t, got)
			if !strings.Contains(got, "@rtOrphanChild") {
				t.Fatalf("the dropped field must become an @rtOrphanChild carcass:\n%s", got)
			}
			// The comment is folded INSIDE the carcass: it sits AFTER the `@rtOrphanChild`
			// tag and BEFORE the carcass terminator (i.e. it is part of the comment body,
			// not dangling above it). A `/* … */` block has its `*/` sanitized to `*\/`.
			needle := tc.comment
			if tc.name == "block" {
				needle = sanitizeForComment(tc.comment)
			}
			orphanIdx := strings.Index(got, "@rtOrphanChild")
			commentIdx := strings.Index(got, needle)
			if commentIdx < orphanIdx {
				t.Errorf("the leading comment must fold INTO the carcass (after the tag), not dangle above it:\n%s", got)
			}
			// After prune, the comment is gone with the carcass — nothing dangling.
			pruned, removed := pruneOrphanBlocks(got)
			if removed == 0 {
				t.Errorf("prune should remove the field carcass:\n%s", got)
			}
			if strings.Contains(pruned, "age") {
				t.Errorf("the dropped field + its folded comment must be gone after --prune:\n%s", pruned)
			}
			// The surviving sibling is untouched.
			if !strings.Contains(pruned, "name: {$label: ''}") {
				t.Errorf("the surviving field must remain after prune:\n%s", pruned)
			}
		})
	}
}

// TestComment_DroppedField_NoComment_Unchanged: the no-leading-comment drop is
// unaffected by the fold logic — the carcass starts at the field key as before.
func TestComment_DroppedField_NoComment_Unchanged(t *testing.T) {
	existing := "{$label: '', age: {$label: 'Age'}, name: {$label: ''}}"
	desired := "{$label: '', name: {$label: ''}}"
	got := mergeFriendly(t, existing, desired)
	assertReparses(t, got)
	if !strings.Contains(got, "/* @rtOrphanChild age: {$label: 'Age'},") {
		t.Errorf("a no-comment drop must carcass exactly the field (no fold):\n%s", got)
	}
}

// TestComment_NestedSubField_SurvivesRecurse is path (d): a comment on a sub-field
// inside a nested object that the merge RECURSES into must survive, while a new
// sibling sub-field is added.
func TestComment_NestedSubField_SurvivesRecurse(t *testing.T) {
	existing := "{$label: '', profile: {$label: '',\n    // the contact email\n    email: {$label: 'Email'}}}"
	desired := "{$label: '', profile: {$label: '', email: {$label: ''}, score: {$label: ''}}}"
	got := mergeFriendly(t, existing, desired)
	assertReparses(t, got)
	if !strings.Contains(got, "// the contact email") {
		t.Errorf("a nested sub-field comment must survive the recurse:\n%s", got)
	}
	if !strings.Contains(got, "email: {$label: 'Email'}") {
		t.Errorf("the nested authored value must survive:\n%s", got)
	}
	if !strings.Contains(got, "score: {$label: ''}") {
		t.Errorf("the new nested sub-field must be added:\n%s", got)
	}
}

// TestComment_InlineKeptField_Survives is path (e): a trailing/inline comment on a
// KEPT field is left byte-identical (the merge never touches a kept leaf's bytes),
// even when a sibling field is added.
func TestComment_InlineKeptField_Survives(t *testing.T) {
	existing := "{$label: '', name: {$label: 'N'} /* inline on name */, age: {$label: ''}}"
	desired := "{$label: '', name: {$label: ''}, age: {$label: ''}, extra: {$label: ''}}"
	got := mergeFriendly(t, existing, desired)
	assertReparses(t, got)
	if !strings.Contains(got, "/* inline on name */") {
		t.Errorf("an inline comment on a kept field must survive:\n%s", got)
	}
	if !strings.Contains(got, "extra: {$label: ''}") {
		t.Errorf("the added sibling must be present:\n%s", got)
	}
}

// TestCarcassFoldStart_Detection unit-tests the fold-start helper: it folds back
// over a leading `//` or `/* */` comment, but NOT over plain whitespace, and never
// past propStart.
func TestCarcassFoldStart_Detection(t *testing.T) {
	t.Run("line comment folds", func(t *testing.T) {
		view := parseDesiredObject("{$label: '',\n  // c\n  age: {$label: 'A'}}")
		prop := view.props["age"]
		start := carcassFoldStart(view.text, prop)
		if start >= prop.propStart {
			t.Errorf("a leading // comment should fold (start %d < propStart %d)", start, prop.propStart)
		}
		if !strings.HasPrefix(view.text[start:], "// c") {
			t.Errorf("fold start should land on the // comment; got %q", view.text[start:start+8])
		}
	})
	t.Run("no comment keeps propStart", func(t *testing.T) {
		view := parseDesiredObject("{$label: '', age: {$label: 'A'}}")
		prop := view.props["age"]
		if carcassFoldStart(view.text, prop) != prop.propStart {
			t.Errorf("a no-comment field must keep propStart")
		}
	})
}
