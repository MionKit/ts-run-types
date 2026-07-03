package mirror

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// The friendly SOURCE MIRROR fixture: two consts (Address referenced by User),
// count-bearing constraints as en plurals, a plain-string constraint, and an
// authored function-form $errors on one field.
const sourceMirrorFixture = `import type { User, Address } from '../../src/models';
import type { FriendlyType } from 'ts-runtypes';

/** @rtType Address#a1 @rtIds {street: s1} */
export const friendlyAddress: FriendlyType<Address> = {
  $label: 'Address',
  $errors: {type: 'must be an address'},
  street: {$label: 'Street', $errors: {type: 'must be text'}},
};

/** @rtType User#u1 @rtIds {name: n1, home: a1} */
export const friendlyUser: FriendlyType<User> = {
  $label: 'User',
  $errors: {type: 'must be a user'},
  name: {$label: 'Full name', $errors: {
    type: 'must be text',
    minLength: {one: 'at least $[val] character', other: 'at least $[val] characters'},
    pattern: 'letters only',
  }},
  nickname: {$label: 'Nickname', $errors: (failed) => 'custom ' + Object.keys(failed).join(',')},
  home: friendlyAddress,
};
`

const plArms = "one, few, many, other"

var plArmsList = []string{"one", "few", "many", "other"}

const sourceMirrorPath = "/proj/runtypes/generated/friendly/models.ts"
const translationPath = "/proj/runtypes/generated/i18n/pl/models.ts"

// desiredFor parses a source mirror text and builds the pl desired set.
func desiredFor(t *testing.T, sourceText string) []enrich.NamedConst {
	t.Helper()
	index := mustParse(t, sourceMirrorPath, sourceText)
	return index.TranslationConsts("pl", plArmsList, "../../../friendly/models", "/proj/src/models.ts")
}

// translateSpec bundles the pl translation Spec over a desired set.
func translateSpec(consts []enrich.NamedConst) Spec {
	return Spec{
		MirrorPath:    translationPath,
		SourceFile:    "/proj/src/models.ts",
		Consts:        consts,
		VarDeclFile:   map[string]string{},
		WantFriendly:  true,
		WantMock:      false,
		MirrorPathFor: func(declFile string) string { return declFile },
		Translate:     &TranslateSpec{Locale: "pl", SourceMirrorPath: sourceMirrorPath},
	}
}

// readerFor fakes the orphan oracle's source read.
func readerFor(sourceText string) func(string) (string, error) {
	return func(path string) (string, error) { return sourceText, nil }
}

// scaffoldTranslation runs the create-only path over an empty file.
func scaffoldTranslation(t *testing.T, sourceText string) string {
	t.Helper()
	content, _, err := Scaffold(translateSpec(desiredFor(t, sourceText)), "")
	if err != nil {
		t.Fatalf("Scaffold: %v", err)
	}
	return content
}

// reconcileTranslation runs the full Reconcile over an existing translation.
func reconcileTranslation(t *testing.T, sourceText, existing string) (string, bool) {
	t.Helper()
	out, changed, err := Reconcile(translateSpec(desiredFor(t, sourceText)), []byte(existing), readerFor(sourceText))
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	return string(out), changed
}

func TestTranslate_ScaffoldShape(t *testing.T) {
	content := scaffoldTranslation(t, sourceMirrorFixture)

	for _, want := range []string{
		// Header: the .ts type breadcrumb + the Translation DSL import.
		"import type { Address, User } from '",
		"import type { Translation } from 'ts-runtypes';",
		// Locale-prefixed consts, Translation annotations, @rtI18n breadcrumbs.
		"export const pl_friendlyAddress: Translation<Address> = {",
		"export const pl_friendlyUser: Translation<User> = {",
		"@rtType User#u1 @rtIds {home: a1, name: n1} @rtI18n pl from '../../../friendly/models'",
		// String leaves blanked — never the source text.
		"$label: ''",
		"type: ''",
		// The plural reseeds with the TARGET locale's arms (pl), not the source's.
		"minLength: {" + strings.ReplaceAll(plArms, ", ", ": '', ") + ": ''}",
		// Plain-string constraints stay strings.
		"pattern: ''",
		// Function-form $errors copied verbatim.
		"$errors: (failed) => 'custom ' + Object.keys(failed).join(',')",
		// Const references renamed to translation siblings.
		"home: pl_friendlyAddress,",
	} {
		if !strings.Contains(content, want) {
			t.Errorf("scaffold missing %q:\n%s", want, content)
		}
	}
	for _, ban := range []string{"'User'", "'Full name'", "at least", "letters only", "FriendlyType<"} {
		if strings.Contains(content, ban) {
			t.Errorf("scaffold must not copy source text %q:\n%s", ban, content)
		}
	}
	// The scaffold parses cleanly and indexes as translation consts.
	index, err := ParseMirror(translationPath, []byte(content))
	if err != nil {
		t.Fatalf("scaffold does not parse: %v\n%s", err, content)
	}
	if index.byVar["pl_friendlyUser"] == nil || index.byVar["pl_friendlyAddress"] == nil {
		t.Errorf("scaffold consts not indexed:\n%s", content)
	}
}

func TestTranslate_UpdateIsIdempotentAndPreservesAuthoredWork(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	// The translator fills some leaves.
	authored := strings.Replace(scaffolded, "street: {$label: ''", "street: {$label: 'Ulica'", 1)
	authored = strings.Replace(authored, "one: ''", "one: 'co najmniej $[val] znak'", 1)

	out, changed := reconcileTranslation(t, sourceMirrorFixture, authored)
	if changed {
		t.Errorf("unchanged source must be a byte-identical no-op; got:\n%s", out)
	}
	if !strings.Contains(out, "co najmniej $[val] znak") || !strings.Contains(out, "Ulica") {
		t.Errorf("authored translation lost:\n%s", out)
	}
}

func TestTranslate_SourceAddsConstraintKey(t *testing.T) {
	// The source gains a maxLength plural on name — the translation must gain a
	// blank plural with PL arms inside $errors (the load-bearing $errors descent).
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	grown := strings.Replace(sourceMirrorFixture,
		"pattern: 'letters only',",
		"pattern: 'letters only',\n    maxLength: {one: 'max $[val] char', other: 'max $[val] chars'},", 1)

	out, changed := reconcileTranslation(t, grown, scaffolded)
	if !changed {
		t.Fatalf("source-added constraint must change the translation")
	}
	if !strings.Contains(out, "maxLength: {one: '', few: '', many: '', other: ''}") {
		t.Errorf("added constraint not scaffolded with target arms:\n%s", out)
	}

	// And a plain-string addition arrives as a blank string.
	grownString := strings.Replace(sourceMirrorFixture,
		"pattern: 'letters only',",
		"pattern: 'letters only',\n    allowedChars: 'a-z only',", 1)
	out, _ = reconcileTranslation(t, grownString, scaffolded)
	if !strings.Contains(out, "allowedChars: ''") {
		t.Errorf("added string constraint not scaffolded blank:\n%s", out)
	}
}

func TestTranslate_SourceDropsConstraintKey(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	// The translator filled the pattern template first.
	authored := strings.Replace(scaffolded, "pattern: ''", "pattern: 'tylko litery'", 1)
	shrunk := strings.Replace(sourceMirrorFixture, "\n    pattern: 'letters only',", "", 1)

	out, changed := reconcileTranslation(t, shrunk, authored)
	if !changed {
		t.Fatalf("source-dropped constraint must change the translation")
	}
	if !strings.Contains(out, "/* @rtOrphanChild pattern: 'tylko litery' */") {
		t.Errorf("dropped constraint must orphan (value preserved):\n%s", out)
	}
}

func TestTranslate_AsymmetricArmsNeverOrphanedOrRenamed(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	// The translator prunes `few`, fills `many`, and hand-adds `two` (their
	// language, their call) — the reconcile must keep all of that verbatim.
	authored := strings.Replace(scaffolded,
		"minLength: {one: '', few: '', many: '', other: ''}",
		"minLength: {one: '', many: 'dużo znaków', two: 'para', other: ''}", 1)

	out, changed := reconcileTranslation(t, sourceMirrorFixture, authored)
	if changed {
		t.Fatalf("locale-owned arms must not churn; got:\n%s", out)
	}
	if !strings.Contains(out, "minLength: {one: '', many: 'dużo znaków', two: 'para', other: ''}") {
		t.Errorf("arm set was edited:\n%s", out)
	}
	if strings.Contains(out, "@rtOrphanChild") {
		t.Errorf("an arm was orphaned:\n%s", out)
	}
}

func TestTranslate_OnlyMandatoryOtherArmReinserted(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	// The translator pruned arms down past the mandatory backstop: only `other`
	// is ever re-inserted — a pruned one/few/many stays pruned (locale-owned).
	pruned := strings.Replace(scaffolded,
		"minLength: {one: '', few: '', many: '', other: ''}",
		"minLength: {one: 'znak'}", 1)

	out, changed := reconcileTranslation(t, sourceMirrorFixture, pruned)
	if !changed {
		t.Fatalf("the missing `other` backstop must be re-scaffolded")
	}
	if !strings.Contains(out, "one: 'znak'") {
		t.Errorf("filled arm lost:\n%s", out)
	}
	if !strings.Contains(out, "other: ''") {
		t.Errorf("mandatory `other` not re-inserted:\n%s", out)
	}
	for _, pruned := range []string{"few: ''", "many: ''"} {
		if strings.Contains(out, pruned) {
			t.Errorf("pruned arm %q must stay pruned:\n%s", pruned, out)
		}
	}
}

func TestTranslate_FunctionFormUntouched(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	// The source's nickname gains a record key — but the translation's $errors
	// is the verbatim-copied arrow: opaque, never merged into.
	grown := strings.Replace(sourceMirrorFixture,
		"nickname: {$label: 'Nickname', $errors: (failed) => 'custom ' + Object.keys(failed).join(',')},",
		"nickname: {$label: 'Nickname', $errors: (failed) => 'custom two ' + Object.keys(failed).join(',')},", 1)

	out, _ := reconcileTranslation(t, grown, scaffolded)
	if !strings.Contains(out, "$errors: (failed) => 'custom ' + Object.keys(failed).join(',')") {
		t.Errorf("translation's arrow must stay byte-identical (its form wins):\n%s", out)
	}
}

func TestTranslate_SpliceNonOverlapInOneErrors(t *testing.T) {
	// The source drops `pattern` AND the translation's plural is missing its
	// mandatory `other` arm — an orphan-child and an in-plural arm insert inside
	// ONE $errors record must stay non-overlapping under the fatal-on-overlap
	// splicer.
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	pruned := strings.Replace(scaffolded,
		"minLength: {one: '', few: '', many: '', other: ''}",
		"minLength: {one: 'znak'}", 1)
	shrunk := strings.Replace(sourceMirrorFixture, "\n    pattern: 'letters only',", "", 1)

	out, changed := reconcileTranslation(t, shrunk, pruned)
	if !changed {
		t.Fatalf("expected changes")
	}
	if !strings.Contains(out, "@rtOrphanChild pattern") {
		t.Errorf("dropped key not orphaned:\n%s", out)
	}
	if !strings.Contains(out, "one: 'znak'") || !strings.Contains(out, "other: ''") {
		t.Errorf("arm state wrong after combined ops:\n%s", out)
	}
}

func TestTranslate_FieldAddDropFollowsSource(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	authored := strings.Replace(scaffolded,
		"pl_friendlyUser: Translation<User> = {\n  $label: '',",
		"pl_friendlyUser: Translation<User> = {\n  $label: 'Użytkownik',", 1)

	// Source drops `name` (its id leaves @rtIds) and adds `email`.
	changedSource := strings.Replace(sourceMirrorFixture,
		"/** @rtType User#u1 @rtIds {name: n1, home: a1} */", "/** @rtType User#u2 @rtIds {email: e1, home: a1} */", 1)
	changedSource = strings.Replace(changedSource,
		"  name: {$label: 'Full name', $errors: {\n    type: 'must be text',\n    minLength: {one: 'at least $[val] character', other: 'at least $[val] characters'},\n    pattern: 'letters only',\n  }},\n", "", 1)
	changedSource = strings.Replace(changedSource,
		"  home: friendlyAddress,",
		"  email: {$label: 'Email', $errors: {type: 'must be an email', pattern: 'invalid email'}},\n  home: friendlyAddress,", 1)

	out, _ := reconcileTranslation(t, changedSource, authored)
	if !strings.Contains(out, "email: {$label: '', $errors: {type: '', pattern: ''}}") {
		t.Errorf("source-added field not scaffolded blank:\n%s", out)
	}
	if !strings.Contains(out, "@rtOrphanChild") || !strings.Contains(out, "name:") {
		t.Errorf("source-dropped field not orphaned (value preserved):\n%s", out)
	}
	if !strings.Contains(out, "Użytkownik") {
		t.Errorf("authored root label lost:\n%s", out)
	}
}

func TestTranslate_ConstRenameCarriesAcrossLocales(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)
	authored := strings.Replace(scaffolded, "street: {$label: ''", "street: {$label: 'Ulica'", 1)

	// The source renames Address → Location (same structural id a1).
	renamed := strings.ReplaceAll(sourceMirrorFixture, "Address", "Location")
	renamed = strings.ReplaceAll(renamed, "friendlyLocation", "friendlyLocation") // keep var consistent

	out, changed := reconcileTranslation(t, renamed, authored)
	if !changed {
		t.Fatalf("source rename must carry into the translation")
	}
	if !strings.Contains(out, "export const pl_friendlyLocation: Translation<Location>") {
		t.Errorf("translation const not renamed in place:\n%s", out)
	}
	if strings.Contains(out, "@rtOrphan ") {
		t.Errorf("a rename must never orphan:\n%s", out)
	}
	if !strings.Contains(out, "street: {$label: 'Ulica'") {
		t.Errorf("authored value lost across the rename:\n%s", out)
	}
	if !strings.Contains(out, "@rtI18n pl from '../../../friendly/models'") {
		t.Errorf("@rtI18n breadcrumb lost on marker refresh:\n%s", out)
	}
	if !strings.Contains(out, "home: pl_friendlyLocation,") {
		t.Errorf("intra-file reference not renamed:\n%s", out)
	}
}

func TestTranslate_OrphanWhenSourceConstGone(t *testing.T) {
	scaffolded := scaffoldTranslation(t, sourceMirrorFixture)

	// The source mirror drops friendlyAddress entirely (User inlines home).
	shrunk := `import type { User } from '../../src/models';
import type { FriendlyType } from 'ts-runtypes';

/** @rtType User#u9 @rtIds {name: n1} */
export const friendlyUser: FriendlyType<User> = {
  $label: 'User',
  $errors: {type: 'must be a user'},
  name: {$label: 'Full name', $errors: {type: 'must be text'}},
};
`
	out, changed := reconcileTranslation(t, shrunk, scaffolded)
	if !changed {
		t.Fatalf("expected the orphan pass to fire")
	}
	if !strings.Contains(out, "/* @rtOrphan ") || !strings.Contains(out, "pl_friendlyAddress") {
		t.Errorf("stale translation const must be @rtOrphan'd:\n%s", out)
	}
}
