package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// breadcrumbPattern matches a mirror file's source breadcrumb:
// `import type { A, B } from '<spec>'`. Group 1 is the comma-separated type
// names, group 2 the module specifier. It is intentionally line-oriented and
// tolerant — only the FIRST such line (the source breadcrumb) is read; the
// ts-runtypes DSL import and any cross-file value imports are ignored.
var breadcrumbPattern = regexp.MustCompile(`(?m)^import\s+type\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]`)

// driftFinding is one breadcrumb-drift issue for the gen --check report. Mirrors
// the enrichment.Finding shape (Code / Severity / Message) but is file-anchored
// for the plain-text report.
type driftFinding struct {
	File     string
	Severity enrichment.Severity
	Code     string
	Message  string
}

// runGenCheck implements `gen --check [<mirror-file-or-dir>]`: it reads each
// mirror file's `import type { … } from '<src>'` breadcrumb, resolves <src>
// relative to the mirror file, and reports drift:
//
//   - GE001 (warning) — the mirror file's location no longer matches the
//     computed mirror-of(resolved src): cosmetic drift after an IDE rename.
//   - GE002 (error)   — the breadcrumb resolves to a non-existent file (the
//     source was deleted → orphaned mirror).
//   - GE003 (error)   — the resolved source exists but no longer declares an
//     imported type (renamed/removed type).
//
// The argument is a single mirror .ts file or a directory to walk. With no
// argument, it walks the enrich dir resolved from the current directory's
// tsconfig. Exits 1 when any Error finding is present.
func runGenCheck(positional []string, enrichDirFlag string) {
	target := ""
	if len(positional) > 0 {
		target = tspath.NormalizePath(mustAbs(positional[0]))
	} else {
		cwd, err := os.Getwd()
		if err != nil {
			fatal("gen --check: getwd: %v", err)
		}
		// Resolve the enrich dir from cwd's tsconfig — the default scan root.
		config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), enrichDirFlag)
		target = config.EnrichDir
	}

	mirrorFiles, err := collectMirrorFiles(target)
	if err != nil {
		fatal("gen --check: %v", err)
	}

	var findings []driftFinding
	for _, mirrorFile := range mirrorFiles {
		findings = append(findings, checkMirrorFile(mirrorFile, enrichDirFlag)...)
	}
	sort.SliceStable(findings, func(left, right int) bool {
		if findings[left].File != findings[right].File {
			return findings[left].File < findings[right].File
		}
		return findings[left].Code < findings[right].Code
	})

	hasError := false
	for _, finding := range findings {
		if finding.Severity == enrichment.Error {
			hasError = true
		}
		fmt.Printf("%s: [%s %s] %s\n", finding.File, finding.Code, finding.Severity.String(), finding.Message)
	}
	fmt.Fprintf(os.Stderr, "gen --check: %d mirror file(s), %d finding(s)\n", len(mirrorFiles), len(findings))
	if hasError {
		os.Exit(1)
	}
	os.Exit(0)
}

// collectMirrorFiles returns the .ts mirror files to check: target itself when
// it is a file, or every .ts file under it when it is a directory. A missing
// target yields an empty list (nothing to check), not an error.
func collectMirrorFiles(target string) ([]string, error) {
	info, err := os.Stat(target)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("stat %s: %w", target, err)
	}
	if !info.IsDir() {
		return []string{target}, nil
	}
	var files []string
	walkErr := filepath.Walk(target, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".ts") {
			files = append(files, tspath.NormalizePath(path))
		}
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}
	sort.Strings(files)
	return files, nil
}

// checkMirrorFile reads one mirror file's breadcrumb and returns its drift
// findings. A mirror file with no readable breadcrumb yields nothing (it is not
// a generated mirror, or has no source link to check).
func checkMirrorFile(mirrorFile, enrichDirFlag string) []driftFinding {
	contents, err := os.ReadFile(mirrorFile)
	if err != nil {
		return []driftFinding{{File: mirrorFile, Severity: enrichment.Error, Code: "GE000", Message: "cannot read mirror file: " + err.Error()}}
	}
	typeNames, sourceSpec, ok := parseBreadcrumb(string(contents))
	if !ok {
		return nil
	}

	// Resolve the breadcrumb specifier relative to the mirror file's directory.
	resolvedSource := resolveBreadcrumb(mirrorFile, sourceSpec)

	var findings []driftFinding

	// GE002 — the source no longer exists (deleted → orphaned mirror).
	info, statErr := os.Stat(resolvedSource)
	if statErr != nil || info.IsDir() {
		findings = append(findings, driftFinding{
			File:     mirrorFile,
			Severity: enrichment.Error,
			Code:     "GE002",
			Message:  fmt.Sprintf("breadcrumb source %q resolves to a non-existent file (%s) — orphaned mirror; delete it or re-run gen", sourceSpec, resolvedSource),
		})
		return findings // can't check declarations or location without the source
	}

	// GE003 — the source exists but no longer declares an imported type.
	sourceText, readErr := os.ReadFile(resolvedSource)
	if readErr == nil {
		for _, typeName := range typeNames {
			if !sourceDeclaresType(string(sourceText), typeName) {
				findings = append(findings, driftFinding{
					File:     mirrorFile,
					Severity: enrichment.Error,
					Code:     "GE003",
					Message:  fmt.Sprintf("source %s no longer declares type %q — re-run gen", resolvedSource, typeName),
				})
			}
		}
	}

	// GE001 — cosmetic location drift: the mirror file is not where the source's
	// computed mirror path would put it.
	config := resolveEnrichConfig(resolvedSource, enrichDirFlag)
	expectedMirror := config.mirrorPath(resolvedSource)
	if tspath.NormalizePath(expectedMirror) != tspath.NormalizePath(mirrorFile) {
		findings = append(findings, driftFinding{
			File:     mirrorFile,
			Severity: enrichment.Warning,
			Code:     "GE001",
			Message:  fmt.Sprintf("mirror location drift: source maps to %s but this file is %s — re-run gen to relocate", expectedMirror, mirrorFile),
		})
	}

	return findings
}

// parseBreadcrumb extracts the type names and module specifier from a mirror
// file's first `import type { … } from '<spec>'` line. The ts-runtypes DSL
// import (`import type { FriendlyType, MockData } from 'ts-runtypes'`) is skipped
// so the SOURCE breadcrumb is the one returned. ok=false when no source
// breadcrumb is present.
func parseBreadcrumb(contents string) (typeNames []string, sourceSpec string, ok bool) {
	for _, match := range breadcrumbPattern.FindAllStringSubmatch(contents, -1) {
		spec := strings.TrimSpace(match[2])
		if spec == "ts-runtypes" {
			continue // the DSL-types import, not the source breadcrumb
		}
		names := splitImportNames(match[1])
		if len(names) == 0 {
			continue
		}
		return names, spec, true
	}
	return nil, "", false
}

// splitImportNames parses the `{ A, B as C }` body of an import clause into the
// imported type names (the original name before any `as` alias).
func splitImportNames(clause string) []string {
	var names []string
	for _, part := range strings.Split(clause, ",") {
		name := strings.TrimSpace(part)
		if name == "" {
			continue
		}
		// `Original as Alias` — the source declares the Original name.
		if idx := strings.Index(name, " as "); idx >= 0 {
			name = strings.TrimSpace(name[:idx])
		}
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

// resolveBreadcrumb resolves a module specifier (as written in the breadcrumb,
// extension stripped) relative to the mirror file's directory, appending ".ts"
// (the source is a .ts; a .d.ts-origin mirror still tracks the .ts/.d.ts source,
// and we probe both). Returns the .ts candidate; the caller's Stat falls through
// to GE002 when neither exists.
func resolveBreadcrumb(mirrorFile, spec string) string {
	base := filepath.Join(filepath.Dir(mirrorFile), filepath.FromSlash(spec))
	tsCandidate := tspath.NormalizePath(base + ".ts")
	if _, err := os.Stat(tsCandidate); err == nil {
		return tsCandidate
	}
	dtsCandidate := tspath.NormalizePath(base + ".d.ts")
	if _, err := os.Stat(dtsCandidate); err == nil {
		return dtsCandidate
	}
	// Neither exists — return the .ts candidate so GE002 reports a concrete path.
	return tsCandidate
}

// sourceDeclaresType reports whether sourceText declares typeName as an
// interface, type alias, class, or enum (with or without an `export` modifier).
// A textual scan — sufficient for the breadcrumb drift check, which only asks
// "does this name still exist as a declaration?".
func sourceDeclaresType(sourceText, typeName string) bool {
	pattern := regexp.MustCompile(`(?m)(^|\b)(export\s+)?(declare\s+)?(abstract\s+)?(interface|type|class|enum)\s+` + regexp.QuoteMeta(typeName) + `\b`)
	return pattern.MatchString(sourceText)
}
