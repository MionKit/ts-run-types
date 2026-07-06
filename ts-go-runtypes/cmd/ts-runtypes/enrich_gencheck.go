package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// driftFinding is one breadcrumb-drift issue for the gen --check report.
// Mirrors the enrichment.Finding shape (Code / Severity / Message) but is
// file-anchored; Line/Col are the 1-based position of the breadcrumb import
// (zero for file-level findings like GE000).
type driftFinding struct {
	File     string              `json:"file"`
	Severity enrichment.Severity `json:"severity"`
	Code     string              `json:"code"`
	Message  string              `json:"message"`
	Args     []string            `json:"args,omitempty"`
	Line     int                 `json:"line,omitempty"`
	Col      int                 `json:"col,omitempty"`
}

// runGenCheck implements `gen --check [<mirror-file-or-dir>] [--json]`: it
// reads each mirror file's `import type { … } from '<src>'` breadcrumb,
// resolves <src> relative to the mirror file, and reports drift:
//
//   - GE001 (warning) — the mirror file's location no longer matches the
//     computed mirror-of(resolved src): cosmetic drift after an IDE rename.
//   - GE002 (error)   — the breadcrumb resolves to a non-existent file (the
//     source was deleted → orphaned mirror).
//   - GE003 (error)   — the resolved source exists but no longer declares an
//     imported type (renamed/removed type).
//
// GE002/GE003 detection is shared with `check` and the resolver's checkEnrich
// pass (mirror.CheckBreadcrumbDrift); GE001 lives here because only the CLI
// knows the project's enrich-dir config.
//
// The argument is a single mirror .ts file or a directory to walk. With no
// argument, it walks the enrich dir resolved from the current directory's
// tsconfig. Exits 1 when any Error finding is present.
func runGenCheck(positional []string, enrichDirFlag string, asJSON bool) {
	var targets []string
	if len(positional) > 0 {
		candidate := tspath.NormalizePath(mustAbs(positional[0]))
		config := resolveEnrichConfig(candidate, enrichDirFlag)
		// A path OUTSIDE the enrich dir is a SOURCE file (the `gen <source> --check`
		// form): check ITS mirrors, not the source file itself — whose own
		// `import type { … }` lines would otherwise be misread as breadcrumbs. A
		// source file has one mirror per family (plus, transitionally, a pre-split
		// combined file at the legacy path). A path inside the enrich dir (a mirror
		// file, or the dir) is scanned directly.
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && !isUnder(config.EnrichDir, candidate) {
			targets = []string{
				config.mirrorPath(familyFriendly, candidate),
				config.mirrorPath(familyMock, candidate),
				config.legacyMirrorPath(candidate),
			}
		} else {
			targets = []string{candidate}
		}
	} else {
		cwd, err := os.Getwd()
		if err != nil {
			fatal("gen --check: getwd: %v", err)
		}
		// Resolve the enrich dir from cwd's tsconfig — the default scan root.
		config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), enrichDirFlag)
		targets = []string{config.EnrichDir}
	}

	var mirrorFiles []string
	for _, target := range targets {
		files, err := collectMirrorFiles(target)
		if err != nil {
			fatal("gen --check: %v", err)
		}
		mirrorFiles = append(mirrorFiles, files...)
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
	}
	if asJSON {
		encoded, encodeErr := json.MarshalIndent(findings, "", "  ")
		if encodeErr != nil {
			fatal("gen --check: encode json: %v", encodeErr)
		}
		fmt.Println(string(encoded))
	} else {
		for _, finding := range findings {
			fmt.Printf("%s: [%s %s] %s\n", finding.File, finding.Code, finding.Severity.String(), finding.Message)
		}
	}
	fmt.Fprintf(os.Stderr, "gen --check: %d mirror file(s), %d finding(s)\n", len(mirrorFiles), len(findings))
	if hasError {
		os.Exit(1)
	}
	os.Exit(0)
}

// isUnder reports whether path is dir itself or lies within it (neither escaping
// with ".." nor on a different volume).
func isUnder(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}
	return rel == "." || !strings.HasPrefix(rel, "..")
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
		return []driftFinding{{
			File:     mirrorFile,
			Severity: enrichment.Error,
			Code:     diagnostics.CodeGenMirrorUnreadable,
			Message:  "cannot read mirror file: " + err.Error(),
			Args:     []string{err.Error()},
		}}
	}
	text := string(contents)
	breadcrumb, hasBreadcrumb := mirror.ParseBreadcrumb(text)
	if !hasBreadcrumb {
		return nil
	}
	lineIndex := mirror.NewLineIndex(text)

	// GE002 / GE003 — the shared source-existence + type-declaration checks.
	var findings []driftFinding
	for _, drift := range mirror.CheckBreadcrumbDrift(mirrorFile, text, nil) {
		line, col := lineIndex.At(drift.Start)
		findings = append(findings, driftFinding{
			File:     mirrorFile,
			Severity: drift.Severity(),
			Code:     drift.Code,
			Message:  drift.Message,
			Args:     drift.Args,
			Line:     line,
			Col:      col,
		})
		if drift.Code == diagnostics.CodeGenSourceMissing {
			// Can't judge location drift without the source.
			return findings
		}
	}

	// GE001 — cosmetic location drift: the mirror file is not where the source's
	// computed mirror path would put it. CLI-only (needs the enrich config).
	// The expected location depends on the file's FAMILY, read off its path
	// segment under the enrich root (friendly/ or mock/); a file at neither
	// segment is a pre-split combined mirror (or a hand-moved one) and drifts
	// against both family paths.
	resolvedSource := mirror.ResolveBreadcrumb(mirrorFile, breadcrumb.Spec)
	config := resolveEnrichConfig(resolvedSource, enrichDirFlag)
	family, ok := mirrorFamilyOf(config.EnrichDir, mirrorFile)
	if !ok {
		line, col := lineIndex.At(breadcrumb.Start)
		expectedFriendly := config.mirrorPath(familyFriendly, resolvedSource)
		expectedMock := config.mirrorPath(familyMock, resolvedSource)
		findings = append(findings, driftFinding{
			File:     mirrorFile,
			Severity: enrichment.Warning,
			Code:     diagnostics.CodeGenMirrorDrift,
			Message: fmt.Sprintf("mirror location drift: source maps to the per-family files %s + %s but this file is %s — re-run gen to migrate/relocate",
				expectedFriendly, expectedMock, mirrorFile),
			Args: []string{expectedFriendly + " + " + expectedMock, mirrorFile},
			Line: line,
			Col:  col,
		})
		return findings
	}
	expectedMirror := config.mirrorPath(family, resolvedSource)
	if tspath.NormalizePath(expectedMirror) != tspath.NormalizePath(mirrorFile) {
		line, col := lineIndex.At(breadcrumb.Start)
		findings = append(findings, driftFinding{
			File:     mirrorFile,
			Severity: enrichment.Warning,
			Code:     diagnostics.CodeGenMirrorDrift,
			Message:  fmt.Sprintf("mirror location drift: source maps to %s but this file is %s — re-run gen to relocate", expectedMirror, mirrorFile),
			Args:     []string{expectedMirror, mirrorFile},
			Line:     line,
			Col:      col,
		})
	}

	return findings
}

// mirrorFamilyOf reads a mirror file's family off its path: the first segment
// of its path relative to the enrich root must be a known family dir. ok=false
// for a file outside the enrich root or at the pre-split combined location.
func mirrorFamilyOf(enrichDir, mirrorFile string) (string, bool) {
	rel, err := filepath.Rel(enrichDir, mirrorFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", false
	}
	first := filepath.ToSlash(rel)
	if idx := strings.Index(first, "/"); idx >= 0 {
		first = first[:idx]
	}
	if first == familyFriendly || first == familyMock {
		return first, true
	}
	return "", false
}
