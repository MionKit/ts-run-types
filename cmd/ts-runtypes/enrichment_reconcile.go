package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// friendlyReservedKeys / mockReservedKeys are the META keys each family's nodes
// carry alongside their field children — never treated as renamable/mergeable
// fields. Any `$`-prefixed key is meta by construction (a reserved-key field
// collision is a documented diagnostic, not a normal field); the mock family
// additionally reserves the bare leaf keys pool/min/max.
var friendlyReservedKeys = map[string]bool{
	"$label": true, "$errors": true, "$items": true,
	"$slots": true, "$keys": true, "$values": true,
}

var mockReservedKeys = map[string]bool{
	"$items": true, "$length": true, "$optional": true,
	"$slots": true, "$keys": true, "$values": true, "$size": true,
	"pool": true, "min": true, "max": true,
}

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
// error), reconciles it against spec's desired const set (property merge per
// matched const + append new consts), then applies the edits via the descending
// splicer. Orphan-const handling + import sync land in M7. Returns false on a
// byte-identical no-op (idempotent re-run).
func reconcileMirror(spec mirrorWrite, existingBytes []byte) bool {
	index := parseMirror(spec.mirrorPath, existingBytes)

	var ops []spliceOp
	var addedConsts []enrichment.NamedConst

	for _, named := range spec.consts {
		if spec.wantFriendly {
			reconcileOneConst(&ops, &addedConsts, index, named, true)
		}
		if spec.wantMock {
			reconcileOneConst(&ops, &addedConsts, index, named, false)
		}
	}

	// New consts (no existing match) are appended after applying the in-place
	// property-merge splices, so their byte offsets do not collide with the
	// splice ops (which all index the original bytes).
	merged := applySplices(index.raw, ops)
	appended := appendNewConsts(merged, spec, addedConsts)

	if string(appended) == string(existingBytes) {
		return false // idempotent no-op
	}
	writeReconciled(spec.mirrorPath, appended)
	return true
}

// reconcileOneConst reconciles ONE friendly-or-mock const: it finds the matching
// existing const by @rtType id (fallback var name), and either property-merges
// it (recording splice ops) or, when there is no match, queues it for append.
// addedConsts dedups so a friendly+mock pair queues a single NamedConst once.
func reconcileOneConst(ops *[]spliceOp, addedConsts *[]enrichment.NamedConst, index *mirrorIndex, named enrichment.NamedConst, friendly bool) {
	varName := named.MockVar
	body := named.Mock
	metaKeys := mockReservedKeys
	if friendly {
		varName = named.FriendlyVar
		body = named.Friendly
		metaKeys = friendlyReservedKeys
	}

	existing := findExistingConst(index, named, varName, friendly)
	if existing == nil {
		queueNewConst(addedConsts, named)
		return
	}
	if existing.body == nil {
		// The existing const's initializer is not an object literal (a function
		// form, or hand-edited to something exotic) — leave it untouched.
		return
	}

	// Refresh the @rtType / @rtIds marker when it drifted (a structural-id change
	// after a field add/remove regenerates the id), so the next reconcile matches
	// by id again instead of the var-name fallback.
	refreshMarker(ops, index.raw, existing, named)

	existingView := newObjectView(string(index.raw), index.sourceFile, existing.body)
	desiredView := parseDesiredObject(body)
	if desiredView == nil {
		return
	}
	renames := computeRenames(existingView, desiredView, metaKeys, named.ChildIDs)
	mergeObject(ops, existingView, desiredView, metaKeys, renames)
}

// refreshMarker emits a splice to bring the existing const's @rtType/@rtIds
// marker in line with the desired type id + child-id map, when they differ.
// When the existing const has a marker block, it is replaced; when it has none
// (a hand-authored file), a fresh marker is inserted before the const keyword.
// No op when the marker already matches (idempotent).
func refreshMarker(ops *[]spliceOp, raw []byte, existing *constEntry, named enrichment.NamedConst) {
	desired := markerComment(named.TypeName, named.TypeID, named.ChildIDs)
	if desired == "" {
		return
	}
	if existing.markerStart != existing.markerEnd {
		// Replace the existing marker block (range already includes its newline).
		current := string(raw[existing.markerStart:existing.markerEnd])
		if current == desired {
			return // identical — no-op
		}
		*ops = append(*ops, spliceOp{start: existing.markerStart, end: existing.markerEnd, text: desired})
		return
	}
	// No existing marker — insert one just before the `export`/`const` keyword.
	*ops = append(*ops, spliceOp{start: existing.tokenStart, end: existing.tokenStart, text: desired})
}

// findExistingConst returns the existing const matching named for the requested
// friendly/mock form. Match precedence:
//
//  1. by (@rtType id, form) — the structural-id match, robust against a
//     positional var-name swap (friendlyBox vs friendlyBox2) pairing the wrong
//     consts.
//  2. by var name — the fallback when the type's structural id CHANGED (a field
//     added/removed regenerates the id, but the var name friendly<Name> is
//     stable), or the existing const carried no marker.
//
// isFriendly selects the friendly (true) vs mock (false) lookup form.
func findExistingConst(index *mirrorIndex, named enrichment.NamedConst, varName string, isFriendly bool) *constEntry {
	if named.TypeID != "" {
		if entry, ok := index.byTypeForm[typeFormKey(named.TypeID, isFriendly)]; ok {
			return entry
		}
	}
	if entry, ok := index.byVar[varName]; ok {
		return entry
	}
	return nil
}

// queueNewConst records a NamedConst for append exactly once (a friendly+mock
// pair reconciled separately must not queue it twice).
func queueNewConst(addedConsts *[]enrichment.NamedConst, named enrichment.NamedConst) {
	for _, existing := range *addedConsts {
		if existing.TypeID != "" && existing.TypeID == named.TypeID {
			return
		}
		if existing.FriendlyVar == named.FriendlyVar {
			return
		}
	}
	*addedConsts = append(*addedConsts, named)
}

// appendNewConsts appends the const blocks for newly-desired consts (no existing
// match) to the merged bytes. Each block carries its @rtType/@rtIds marker.
// Import sync for cross-file references the new consts introduce lands in M7;
// here we only append the const declarations. Returns merged unchanged when
// there is nothing to add.
func appendNewConsts(merged []byte, spec mirrorWrite, addedConsts []enrichment.NamedConst) []byte {
	if len(addedConsts) == 0 {
		return merged
	}
	var blocks []string
	for _, named := range addedConsts {
		if spec.wantFriendly {
			blocks = append(blocks, constBlock(named.FriendlyVar, "FriendlyType", named, named.Friendly))
		}
		if spec.wantMock {
			blocks = append(blocks, constBlock(named.MockVar, "MockData", named, named.Mock))
		}
	}
	if len(blocks) == 0 {
		return merged
	}
	var builder strings.Builder
	builder.Write(merged)
	if len(merged) > 0 && merged[len(merged)-1] != '\n' {
		builder.WriteString("\n")
	}
	builder.WriteString("\n")
	builder.WriteString(strings.Join(blocks, "\n"))
	return []byte(builder.String())
}

// writeReconciled writes the reconciled bytes back to the mirror file, creating
// parent dirs as needed, and reports the change.
func writeReconciled(mirrorPath string, content []byte) {
	if err := os.MkdirAll(filepath.Dir(mirrorPath), 0o755); err != nil {
		fatal("gen --update: mkdir %s: %v", filepath.Dir(mirrorPath), err)
	}
	if err := os.WriteFile(mirrorPath, content, 0o644); err != nil {
		fatal("gen --update: write %s: %v", mirrorPath, err)
	}
	fmt.Printf("gen --update: reconciled %s\n", mirrorPath)
}

// pruneMirrorFile is implemented in milestone M8. For M1 it is a placeholder.
func pruneMirrorFile(mirrorFile string) int {
	_ = mirrorFile
	return 0
}
