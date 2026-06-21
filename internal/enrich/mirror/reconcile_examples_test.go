package mirror

// Worked-example tests for the enrich-mirror reconciler — readable, one scenario
// each, showing the committed mirror a user edited and what `gen --update`
// produces. They double as documentation of the reconciler's behaviour on the
// common edits. (The property test next door proves the same invariants hold over
// random edit sequences; these spell out the headline cases in plain sight.)

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// friendlySpec builds a friendly-only desired set (one const per case keeps the
// example readable; the mock form behaves identically).
func friendlySpec(consts ...enrich.NamedConst) Spec {
	return Spec{
		MirrorPath:   "/rt/models.ts",
		SourceFile:   "/src.ts",
		WantFriendly: true,
		Consts:       consts,
	}
}

// mustReconcile runs the real Reconcile and returns the new mirror text.
func mustReconcile(t *testing.T, spec Spec, existing string, readSource func(string) (string, error)) string {
	t.Helper()
	out, _, err := Reconcile(spec, []byte(existing), readSource)
	if err != nil {
		t.Fatalf("Reconcile error: %v", err)
	}
	return string(out)
}

// sourceDeclaring fakes the breadcrumb source file: it declares the given type
// names so the orphan judgement sees them as still-present.
func sourceDeclaring(names ...string) func(string) (string, error) {
	return func(string) (string, error) {
		var b strings.Builder
		for _, name := range names {
			b.WriteString("export interface " + name + " {}\n")
		}
		return b.String(), nil
	}
}

func requireContains(t *testing.T, text, want string) {
	t.Helper()
	if !strings.Contains(text, want) {
		t.Errorf("expected the mirror to contain %q, got:\n%s", want, text)
	}
}

func requireMissing(t *testing.T, text, bad string) {
	t.Helper()
	if strings.Contains(text, bad) {
		t.Errorf("expected the mirror NOT to contain %q, got:\n%s", bad, text)
	}
}

// Rename a FIELD (name -> fullName). The reconciler pairs the dropped `name` with
// the added `fullName` by their shared field-type id and carries the authored
// label across — no orphan, no empty twin.
func TestExample_RenameField_carriesValue(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  $label: '',\n" +
		"  name: {$label: 'Full name'},\n" +
		"};\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{$label: '', fullName: {$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"fullName": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "fullName: {$label: 'Full name'}") // value carried to the new key
	requireMissing(t, out, "@rtOrphan")                        // no orphan trail
	requireMissing(t, out, "name: {$label")                    // old key gone (it became fullName)
}

// Rename a whole INTERFACE (User -> Account). Same shape => same structural id, so
// the reconciler carries the ENTIRE tree and just rewrites the name in three
// places (var, annotation, marker) plus the breadcrumb. No orphan, no regenerated
// empty twin. (Before the fix this crashed with "overlapping splice ops".)
func TestExample_RenameInterface_carriesTreeAndRenames(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/** @rtType User#shapeId @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  $label: 'A person',\n" +
		"  name: {$label: 'Full name'},\n" +
		"};\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "Account", DeclFile: "/src.ts", FriendlyVar: "friendlyAccount",
		Friendly: "{$label: '', name: {$label: ''}}",
		TypeID:   "shapeId", ChildIDs: map[string]string{"name": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("Account"))

	requireContains(t, out, "export const friendlyAccount: FriendlyType<Account>") // var + annotation renamed
	requireContains(t, out, "@rtType Account#shapeId")                             // marker renamed (same id)
	requireContains(t, out, "import type { Account }")                             // breadcrumb renamed
	requireContains(t, out, "$label: 'A person'")                                  // root label carried
	requireContains(t, out, "name: {$label: 'Full name'}")                         // field carried
	requireMissing(t, out, "@rtOrphan")                                            // no orphan tree
	requireMissing(t, out, "friendlyUser")                                         // old const fully gone
}

// Change a field's TYPE (age: number -> string). The old value can't carry to a
// different type, so it is preserved verbatim in a prunable @rtOrphanChild carcass
// and a fresh skeleton replaces it. This is preservation, not garbage — `gen
// --prune` removes the carcass.
func TestExample_ChangeFieldType_parksOldValueInCarcass(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/** @rtType User#u1 @rtIds {age: numId} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  $label: '',\n" +
		"  age: {$label: 'Years old'},\n" +
		"};\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{$label: '', age: {$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"age": "strId"}, // age is now a string
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "@rtOrphanChild")      // old value parked in a carcass...
	requireContains(t, out, "$label: 'Years old'") // ...preserved verbatim (prune to drop it)
}

// Add a field. A fresh skeleton is inserted; existing authored values are
// untouched.
func TestExample_AddField_insertsFreshSkeleton(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  $label: '',\n" +
		"  name: {$label: 'Full name'},\n" +
		"};\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{$label: '', name: {$label: ''}, email: {$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"name": "strId", "email": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "name: {$label: 'Full name'}") // existing value untouched
	requireContains(t, out, "email:")                      // new field added
	requireMissing(t, out, "@rtOrphan")
}

// Delete a field. It is commented out as @rtOrphanChild — the authored value is
// preserved (restorable / prunable), never silently dropped.
func TestExample_DeleteField_orphanChildsIt(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId, nickname: strId} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  $label: '',\n" +
		"  name: {$label: 'Full name'},\n" +
		"  nickname: {$label: 'Nickname'},\n" +
		"};\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{$label: '', name: {$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"name": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "name: {$label: 'Full name'}") // surviving field untouched
	requireContains(t, out, "@rtOrphanChild")              // deleted field commented out...
	requireContains(t, out, "$label: 'Nickname'")          // ...with its value preserved
}

// Two DIFFERENT named types with the SAME shape (A and B share a structural id)
// are kept as DISTINCT consts and never conflate — emission and matching are by
// NAME, the id is only a change-detection signal.
func TestExample_TwoSameShapeTypes_stayDistinct(t *testing.T) {
	existing := "import type { A, B } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/** @rtType A#sameId @rtIds {x: strId} */\n" +
		"export const friendlyA: FriendlyType<A> = {$label: 'the A', x: {$label: 'x of A'}};\n\n" +
		"/** @rtType B#sameId @rtIds {x: strId} */\n" +
		"export const friendlyB: FriendlyType<B> = {$label: 'the B', x: {$label: 'x of B'}};\n"

	body := "{$label: '', x: {$label: ''}}"
	spec := friendlySpec(
		enrich.NamedConst{TypeName: "A", DeclFile: "/src.ts", FriendlyVar: "friendlyA", Friendly: body, TypeID: "sameId", ChildIDs: map[string]string{"x": "strId"}},
		enrich.NamedConst{TypeName: "B", DeclFile: "/src.ts", FriendlyVar: "friendlyB", Friendly: body, TypeID: "sameId", ChildIDs: map[string]string{"x": "strId"}},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("A", "B"))

	// Both consts survive with their OWN authored labels — no conflation, no orphan.
	requireContains(t, out, "the A")
	requireContains(t, out, "the B")
	requireContains(t, out, "x of A")
	requireContains(t, out, "x of B")
	requireMissing(t, out, "@rtOrphan")
}

// A whole-const @rtOrphan carcass (deleted type C) coexists with TWO new types A
// and B that share C's shape (same structural id). Restore-by-id made BOTH A and B
// restore C's one carcass → two splices over the SAME byte range → the
// "overlapping splice ops — internal error" crash. Restore-by-NAME leaves the
// carcass inert and scaffolds A and B fresh. (Cluster A: the crash.)
func TestExample_SameShapeNewTypes_noDoubleRestoreCrash(t *testing.T) {
	existing := "import type { A, B } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/* @rtOrphan /** @rtType C#shape *\\/\n" +
		"export const friendlyC: FriendlyType<C> = {$label: 'old C label'}; */\n"

	body := "{$label: ''}"
	spec := friendlySpec(
		enrich.NamedConst{TypeName: "A", DeclFile: "/src.ts", FriendlyVar: "friendlyA", Friendly: body, TypeID: "shape"},
		enrich.NamedConst{TypeName: "B", DeclFile: "/src.ts", FriendlyVar: "friendlyB", Friendly: body, TypeID: "shape"},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("A", "B")) // must NOT crash

	requireContains(t, out, "export const friendlyA: FriendlyType<A>") // A scaffolded under its own name
	requireContains(t, out, "export const friendlyB: FriendlyType<B>") // B scaffolded under its own name
	requireContains(t, out, "/* @rtOrphan")                            // C's carcass left intact
	requireContains(t, out, "old C label")                             // C's preserved value untouched
}

// A NEW type A with the SAME shape as a deleted-type carcass C must scaffold under
// ITS OWN name and leave C's carcass inert — restore-by-id wrongly revived
// friendlyC (the old name) for A's reconcile, which then re-orphaned next pass
// (churn). The reconcile must also be a single-pass FIXED POINT. (Cluster A: churn.)
func TestExample_NewTypeSameShapeAsCarcass_doesNotReviveOldConst(t *testing.T) {
	existing := "import type { A } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/* @rtOrphan /** @rtType C#shape *\\/\n" +
		"export const friendlyC: FriendlyType<C> = {$label: 'old C'}; */\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "A", DeclFile: "/src.ts", FriendlyVar: "friendlyA", Friendly: "{$label: ''}", TypeID: "shape",
	})
	src := sourceDeclaring("A")
	out := mustReconcile(t, spec, existing, src)

	requireContains(t, out, "export const friendlyA: FriendlyType<A>") // A under its OWN name, not revived as C
	requireContains(t, out, "/* @rtOrphan")                            // C's carcass stays a carcass
	requireContains(t, out, "old C")                                   // C's value preserved, inert

	out2 := mustReconcile(t, spec, out, src)
	if out != out2 {
		t.Errorf("not a fixed point — the carcass churned across a second --update:\n--- first ---\n%s\n--- second ---\n%s", out, out2)
	}
}

// The legitimate case still works: the SAME named type B reappears (deleted, then
// re-added with the same name) → its @rtOrphan carcass restores VERBATIM, recovering
// the authored value. (Restore-by-name keeps this; only the cross-name restores go.)
func TestExample_DeletedTypeReappears_restoresByName(t *testing.T) {
	existing := "import type { A } from '../src';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
		"/* @rtOrphan /** @rtType B#bId *\\/\n" +
		"export const friendlyB: FriendlyType<B> = {$label: 'Authored B'}; */\n"

	spec := friendlySpec(enrich.NamedConst{
		TypeName: "B", DeclFile: "/src.ts", FriendlyVar: "friendlyB", Friendly: "{$label: ''}", TypeID: "bId",
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("B"))

	requireContains(t, out, "export const friendlyB: FriendlyType<B> = {$label: 'Authored B'}") // restored verbatim
	requireMissing(t, out, "@rtOrphan")                                                         // carcass un-commented
}
