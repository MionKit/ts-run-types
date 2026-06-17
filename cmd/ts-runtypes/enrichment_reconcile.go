package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/microsoft/typescript-go/shim/tspath"
)

// updateMirrorFile reconciles an EXISTING committed mirror file against the
// freshly regenerated desired set (the `gen --update` path). Unlike
// writeMirrorFile (create-only — append missing exports, never touch present
// ones), this parses the existing file's AST, matches each existing const to
// its desired counterpart by the `@rtType` structural id, runs a fine-grained
// property merge that PRESERVES authored leaf values + formatting, and applies
// the edits via a descending splicer.
//
// It returns true when it changed the file, false on a byte-identical no-op
// (idempotent re-run). An empty / missing file falls back to the create-only
// fresh-file path so a first `gen --update` seeds the mirror.
func updateMirrorFile(spec mirrorWrite) bool {
	existingBytes, err := os.ReadFile(spec.mirrorPath)
	if err != nil {
		if !os.IsNotExist(err) {
			fatal("gen --update: read %s: %v", spec.mirrorPath, err)
		}
		// Missing file → seed it via the ordinary create-only path.
		return writeMirrorFile(spec)
	}
	if len(existingBytes) == 0 {
		return writeMirrorFile(spec)
	}
	return reconcileMirror(spec, existingBytes)
}

// runGenPrune implements `gen --prune [<mirror-file-or-dir>]`: it walks the
// mirror file(s) (reusing the gen --check file collection) and strips every
// comment block/line tagged @rtOrphan / @rtOrphanChild, along with the
// commented-out code lines they tag. It reports what was removed. This is the
// only path that truly deletes content.
func runGenPrune(positional []string, enrichDirFlag string) {
	mirrorFiles := collectPruneTargets(positional, enrichDirFlag)

	var totalRemoved int
	for _, mirrorFile := range mirrorFiles {
		removed := pruneMirrorFile(mirrorFile)
		totalRemoved += removed
	}
	fmt.Fprintf(os.Stderr, "gen --prune: %d mirror file(s), %d orphan block(s) removed\n", len(mirrorFiles), totalRemoved)
	os.Exit(0)
}

// collectPruneTargets resolves the --prune argument the same way --check does:
// a single mirror .ts file, a directory to walk, or (with no argument) the
// enrich dir resolved from the current directory's tsconfig. A source file
// passed directly (outside the enrich dir) resolves to ITS mirror.
func collectPruneTargets(positional []string, enrichDirFlag string) []string {
	var target string
	if len(positional) > 0 {
		candidate := tspath.NormalizePath(mustAbs(positional[0]))
		config := resolveEnrichConfig(candidate, enrichDirFlag)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && !isUnder(config.EnrichDir, candidate) {
			target = config.mirrorPath(candidate)
		} else {
			target = candidate
		}
	} else {
		cwd, err := os.Getwd()
		if err != nil {
			fatal("gen --prune: getwd: %v", err)
		}
		config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), enrichDirFlag)
		target = config.EnrichDir
	}
	files, err := collectMirrorFiles(target)
	if err != nil {
		fatal("gen --prune: %v", err)
	}
	return files
}

// reconcileMirror parses + indexes the existing mirror file (fatal on syntax
// error), then reconciles it against spec's desired const set. The property
// merge + splice land in milestones M5+; M2 establishes the parse + index.
func reconcileMirror(spec mirrorWrite, existingBytes []byte) bool {
	index := parseMirror(spec.mirrorPath, existingBytes)
	_ = index
	return false
}

// pruneMirrorFile is implemented in milestone M8. For M1 it is a placeholder.
func pruneMirrorFile(mirrorFile string) int {
	_ = mirrorFile
	return 0
}
