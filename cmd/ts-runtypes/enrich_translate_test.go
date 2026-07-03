package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// translateFixture lays down a project with a friendly source mirror (the
// translate verbs' input) and returns its config + the mirror path.
func translateFixture(t *testing.T, strict bool) (enrichConfig, string) {
	t.Helper()
	dir := t.TempDir()
	strictJSON := "false"
	if strict {
		strictJSON = "true"
	}
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"),
		`{ "compilerOptions": { "rootDir": "src", "plugins": [{ "name": "ts-runtypes",
      "i18n": { "sourceLocale": "en", "locales": ["pl"], "strict": `+strictJSON+` } }] } }`)
	source := filepath.Join(dir, "src", "models.ts")
	writeTestFile(t, source, "export interface User { name: string }\n")
	sourceMirror := filepath.Join(dir, "runtypes", "generated", "friendly", "models.ts")
	writeTestFile(t, sourceMirror,
		"import type { User } from '../../../src/models';\n"+
			"import type { FriendlyType } from 'ts-runtypes';\n\n"+
			"/** @rtType User#u1 @rtIds {name: n1} */\n"+
			"export const friendlyUser: FriendlyType<User> = {\n"+
			"  $label: 'User',\n"+
			"  $errors: {type: 'must be a user'},\n"+
			"  name: {$label: 'Full name', $errors: {type: 'must be text', minLength: {one: 'one char', other: '$[val] chars'}}},\n"+
			"};\n")
	return resolveEnrichConfig(source, ""), sourceMirror
}

// TestBuildTranslateSpec_EndToEnd drives the spec build + scaffold + reconcile
// helpers over a real on-disk project (the non-exiting core of the
// `gen --translate` verbs).
func TestBuildTranslateSpec_EndToEnd(t *testing.T) {
	config, sourceMirror := translateFixture(t, false)
	translationPath := config.translationPathFor("pl", sourceMirror)

	spec, ok := buildTranslateSpec(config, "pl", sourceMirror, translationPath)
	if !ok {
		t.Fatalf("buildTranslateSpec failed")
	}
	if spec.Translate == nil || spec.Translate.Locale != "pl" || spec.Translate.SourceMirrorPath != sourceMirror {
		t.Fatalf("Translate spec wrong: %+v", spec.Translate)
	}
	if len(spec.Consts) != 1 || spec.Consts[0].FriendlyVar != "pl_friendlyUser" {
		t.Fatalf("desired consts wrong: %+v", spec.Consts)
	}

	// Scaffold writes the translation file with PL arms and blank leaves.
	if wrote := writeMirrorFile(spec); !wrote {
		t.Fatalf("scaffold wrote nothing")
	}
	scaffolded, err := os.ReadFile(translationPath)
	if err != nil {
		t.Fatalf("translation file not written: %v", err)
	}
	text := string(scaffolded)
	for _, want := range []string{
		"export const pl_friendlyUser: Translation<User>",
		"minLength: {one: '', few: '', many: '', other: ''}",
		"@rtI18n pl from '",
		"import type { Translation } from 'ts-runtypes';",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("scaffold missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "Full name") {
		t.Errorf("scaffold must not copy source text:\n%s", text)
	}

	// A second create-only run is a no-op; an update run is byte-identical.
	if wrote := writeMirrorFile(spec); wrote {
		t.Errorf("second scaffold must be a create-only no-op")
	}
	if wrote := updateMirrorFile(spec); wrote {
		t.Errorf("update over an unchanged source must be a byte-identical no-op")
	}
}

// TestCheckTranslationFile_Findings covers the completeness gate's findings:
// TR001 missing file, TR002 blanks, TR004 carcasses — and the strict severity
// flip.
func TestCheckTranslationFile_Findings(t *testing.T) {
	config, sourceMirror := translateFixture(t, false)
	translationPath := config.translationPathFor("pl", sourceMirror)

	// Missing file → TR001 (warning when not strict).
	findings := checkTranslationFile(config, "pl", sourceMirror, translationPath, enrich.Warning)
	if len(findings) != 1 || findings[0].Code != "TR001" || findings[0].Severity != enrich.Warning {
		t.Fatalf("want one TR001 warning; got %+v", findings)
	}

	// Scaffold, then poke in an orphan carcass beside a filled leaf.
	spec, _ := buildTranslateSpec(config, "pl", sourceMirror, translationPath)
	writeMirrorFile(spec)
	raw, _ := os.ReadFile(translationPath)
	poked := strings.Replace(string(raw), "type: ''",
		"type: 'a b', /* @rtOrphanChild gone: 'x' */", 1)
	writeTestFile(t, translationPath, poked)

	findings = checkTranslationFile(config, "pl", sourceMirror, translationPath, enrich.Warning)
	codes := map[string]int{}
	for _, finding := range findings {
		codes[finding.Code]++
	}
	if codes["TR002"] != 1 {
		t.Errorf("want TR002 for @todo blanks; got %+v", findings)
	}
	if codes["TR004"] != 1 {
		t.Errorf("want TR004 for the carcass; got %+v", findings)
	}
	if codes["TR001"] != 0 {
		t.Errorf("file exists — no TR001; got %+v", findings)
	}
}

// TestCheckTranslationFile_OutOfDate: a source-mirror edit flips TR003 on
// until a --translate --update run.
func TestCheckTranslationFile_OutOfDate(t *testing.T) {
	config, sourceMirror := translateFixture(t, false)
	translationPath := config.translationPathFor("pl", sourceMirror)
	spec, _ := buildTranslateSpec(config, "pl", sourceMirror, translationPath)
	writeMirrorFile(spec)

	// In sync: no TR003.
	findings := checkTranslationFile(config, "pl", sourceMirror, translationPath, enrich.Warning)
	for _, finding := range findings {
		if finding.Code == "TR003" {
			t.Fatalf("fresh scaffold must not be out of date: %+v", findings)
		}
	}

	// The source gains a constraint → TR003 until updated.
	raw, _ := os.ReadFile(sourceMirror)
	grown := strings.Replace(string(raw), "type: 'must be text',", "type: 'must be text', pattern: 'letters',", 1)
	writeTestFile(t, sourceMirror, grown)

	findings = checkTranslationFile(config, "pl", sourceMirror, translationPath, enrich.Warning)
	sawOutOfDate := false
	for _, finding := range findings {
		if finding.Code == "TR003" {
			sawOutOfDate = true
		}
	}
	if !sawOutOfDate {
		t.Fatalf("want TR003 after a source edit; got %+v", findings)
	}

	// Update, then clean again.
	spec, _ = buildTranslateSpec(config, "pl", sourceMirror, translationPath)
	if wrote := updateMirrorFile(spec); !wrote {
		t.Fatalf("update should reconcile the added constraint")
	}
	updated, _ := os.ReadFile(translationPath)
	if !strings.Contains(string(updated), "pattern: ''") {
		t.Errorf("added constraint not scaffolded:\n%s", updated)
	}
	findings = checkTranslationFile(config, "pl", sourceMirror, translationPath, enrich.Warning)
	for _, finding := range findings {
		if finding.Code == "TR003" {
			t.Errorf("updated translation must be in sync; got %+v", findings)
		}
	}
}
