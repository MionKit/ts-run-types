package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrich"
	"github.com/mionkit/ts-runtypes/internal/enrich/cldr"
	"github.com/mionkit/ts-runtypes/internal/enrich/mirror"
)

// runGenTranslate implements the `gen --translate <locale|all> [<src>]` verbs:
// scaffold (create-only), --update (the i18n reconcile), and --prune (strip
// carcasses from the locale's translation files). The desired side is always
// the friendly SOURCE MIRROR — no Program/checker is built; translate is a
// pure file-to-file transform.
func runGenTranslate(translateValue string, positional []string, update, prune bool, enrichDirFlag string) {
	config, sourceMirrors := translateTargets(positional, enrichDirFlag)
	locales := resolveTranslateLocales(translateValue, config)

	var written, skipped, pruned int
	for _, locale := range locales {
		for _, sourceMirror := range sourceMirrors {
			translationPath := config.translationPathFor(locale, sourceMirror)
			if prune {
				pruned += pruneMirrorFile(translationPath)
				continue
			}
			spec, ok := buildTranslateSpec(config, locale, sourceMirror, translationPath)
			if !ok {
				skipped++
				continue
			}
			var wrote bool
			if update {
				wrote = updateMirrorFile(spec)
			} else {
				wrote = writeMirrorFile(spec)
			}
			if wrote {
				written++
			} else {
				skipped++
			}
		}
	}
	if prune {
		fmt.Fprintf(os.Stderr, "gen --translate --prune: %d orphan block(s) removed\n", pruned)
	} else if written == 0 {
		fmt.Printf("gen --translate: nothing to write — translation file(s) already up to date\n")
	}
	os.Exit(0)
}

// translateTargets resolves the enrich config + the friendly source mirror set
// for a translate invocation: `<src>` (a source .ts) maps to its friendly
// mirror; no positional walks every mirror under the friendly family root.
func translateTargets(positional []string, enrichDirFlag string) (enrichConfig, []string) {
	if len(positional) > 0 {
		src := tspath.NormalizePath(mustAbs(positional[0]))
		config := resolveEnrichConfig(src, enrichDirFlag)
		return config, []string{config.mirrorPath(familyFriendly, src)}
	}
	cwd, err := os.Getwd()
	if err != nil {
		fatal("gen --translate: getwd: %v", err)
	}
	config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), enrichDirFlag)
	sourceMirrors, err := collectMirrorFiles(filepath.Join(config.EnrichDir, familyFriendly))
	if err != nil {
		fatal("gen --translate: %v", err)
	}
	return config, sourceMirrors
}

// resolveTranslateLocales expands the --translate value: a concrete tag is
// used as-is; `all` fans out over the tsconfig i18n.locales entries.
func resolveTranslateLocales(translateValue string, config enrichConfig) []string {
	if translateValue != "all" {
		return []string{translateValue}
	}
	if len(config.I18nLocales) == 0 {
		fatal("gen --translate all: no locales configured — add i18n.locales to the ts-runtypes tsconfig plugin entry")
	}
	return config.I18nLocales
}

// buildTranslateSpec assembles the mirror.Spec for one (locale, source mirror)
// pair. ok=false (with a stderr note) when the source mirror is missing,
// unparseable, or carries no source breadcrumb / friendly consts.
func buildTranslateSpec(config enrichConfig, locale, sourceMirror, translationPath string) (mirror.Spec, bool) {
	sourceBytes, err := os.ReadFile(sourceMirror)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gen --translate: skipping %s: %v\n", sourceMirror, err)
		return mirror.Spec{}, false
	}
	index, err := mirror.ParseMirror(sourceMirror, sourceBytes)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gen --translate: skipping %s: %v\n", sourceMirror, err)
		return mirror.Spec{}, false
	}
	breadcrumb, ok := index.Breadcrumb()
	if !ok {
		fmt.Fprintf(os.Stderr, "gen --translate: skipping %s: no source breadcrumb\n", sourceMirror)
		return mirror.Spec{}, false
	}
	declFile := mirror.ResolveBreadcrumb(sourceMirror, breadcrumb)

	arms := cldr.Categories(locale)
	sourceSpec := mirror.ImportSpecifier(translationPath, sourceMirror)
	consts := index.TranslationConsts(locale, arms, sourceSpec, declFile)
	if len(consts) == 0 {
		return mirror.Spec{}, false
	}

	// Cross-file value imports: a reference to another mirror's const resolves
	// to the SIBLING translation file — same relative specifier (both trees
	// shift down identically), locale-prefixed var. VarDeclFile maps each such
	// var to its home translation file and MirrorPathFor is identity; intra-file
	// vars map to declFile so the header emitter skips them.
	varDeclFile := map[string]string{}
	for _, named := range consts {
		varDeclFile[named.FriendlyVar] = declFile
	}
	for _, valueImport := range index.ValueImports() {
		targetTranslation := tspath.NormalizePath(
			filepath.Join(filepath.Dir(translationPath), filepath.FromSlash(valueImport.Specifier)) + ".ts")
		for _, name := range valueImport.Names {
			if !strings.HasPrefix(name, "friendly") {
				continue // mock/value helpers never ride into translations
			}
			varDeclFile[mirror.TranslationVarName(locale, name)] = targetTranslation
		}
	}

	return mirror.Spec{
		MirrorPath:    translationPath,
		SourceFile:    declFile,
		Consts:        consts,
		VarDeclFile:   varDeclFile,
		WantFriendly:  true,
		WantMock:      false,
		MirrorPathFor: func(path string) string { return path },
		Translate:     &mirror.TranslateSpec{Locale: locale, SourceMirrorPath: sourceMirror},
	}, true
}

// translationFinding is one `check --translate` completeness finding.
type translationFinding struct {
	File     string
	Severity enrich.Severity
	Code     string
	Message  string
}

// todoBlankPattern counts unfilled template leaves (`: ”` — a @todo blank) in
// a translation file. Rough by design: the completeness gate reports work
// remaining, it does not parse.
var todoBlankPattern = regexp.MustCompile(`:\s*''`)

// runCheckTranslate implements `check --translate <locale|all>`: the
// non-writing completeness gate. Findings: TR001 missing translation file,
// TR002 unfilled @todo blanks, TR003 out of date vs the source mirror (a
// reconcile would change it), TR004 orphan carcasses awaiting --prune.
// Severity is Warning unless tsconfig i18n.strict is true (then everything is
// an Error and the exit code drives CI).
func runCheckTranslate(translateValue string, enrichDirFlag string) {
	cwd, err := os.Getwd()
	if err != nil {
		fatal("check --translate: getwd: %v", err)
	}
	config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), enrichDirFlag)
	locales := resolveTranslateLocales(translateValue, config)
	sourceMirrors, err := collectMirrorFiles(filepath.Join(config.EnrichDir, familyFriendly))
	if err != nil {
		fatal("check --translate: %v", err)
	}

	severity := enrich.Warning
	if config.I18nStrict {
		severity = enrich.Error
	}

	var findings []translationFinding
	checkedFiles := 0
	for _, locale := range locales {
		for _, sourceMirror := range sourceMirrors {
			translationPath := config.translationPathFor(locale, sourceMirror)
			checkedFiles++
			findings = append(findings, checkTranslationFile(config, locale, sourceMirror, translationPath, severity)...)
		}
	}
	sort.SliceStable(findings, func(left, right int) bool {
		if findings[left].File != findings[right].File {
			return findings[left].File < findings[right].File
		}
		return findings[left].Code < findings[right].Code
	})

	hasError := false
	for _, finding := range findings {
		if finding.Severity == enrich.Error {
			hasError = true
		}
		fmt.Printf("%s: [%s %s] %s\n", finding.File, finding.Code, finding.Severity.String(), finding.Message)
	}
	fmt.Fprintf(os.Stderr, "check --translate: %d translation file(s), %d finding(s)\n", checkedFiles, len(findings))
	if hasError {
		os.Exit(1)
	}
	os.Exit(0)
}

// checkTranslationFile produces the completeness findings for one (locale,
// source mirror) pair.
func checkTranslationFile(config enrichConfig, locale, sourceMirror, translationPath string, severity enrich.Severity) []translationFinding {
	var findings []translationFinding

	translationBytes, err := os.ReadFile(translationPath)
	if err != nil {
		findings = append(findings, translationFinding{
			File: translationPath, Severity: severity, Code: "TR001",
			Message: fmt.Sprintf("missing translation for locale %q — run: ts-runtypes gen --translate %s", locale, locale),
		})
		return findings
	}

	if blanks := len(todoBlankPattern.FindAllString(string(translationBytes), -1)); blanks > 0 {
		findings = append(findings, translationFinding{
			File: translationPath, Severity: severity, Code: "TR002",
			Message: fmt.Sprintf("%d unfilled @todo blank template(s) — untranslated leaves fall through to the source language", blanks),
		})
	}

	// TR003 — a dry-run reconcile that would change the file means the source
	// FriendlyType moved since the last --translate --update.
	if spec, ok := buildTranslateSpec(config, locale, sourceMirror, translationPath); ok {
		if _, changed, reconcileErr := mirror.Reconcile(spec, translationBytes, readSourceFile); reconcileErr == nil && changed {
			findings = append(findings, translationFinding{
				File: translationPath, Severity: severity, Code: "TR003",
				Message: fmt.Sprintf("out of date vs %s — run: ts-runtypes gen --translate %s --update", sourceMirror, locale),
			})
		}
	}

	if orphans := strings.Count(string(translationBytes), "@rtOrphan"); orphans > 0 {
		findings = append(findings, translationFinding{
			File: translationPath, Severity: severity, Code: "TR004",
			Message: fmt.Sprintf("%d orphan carcass(es) awaiting review — restore or strip with gen --translate %s --prune", orphans, locale),
		})
	}
	return findings
}
