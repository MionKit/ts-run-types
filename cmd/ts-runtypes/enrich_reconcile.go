package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// orphanBlockPattern matches both `/* @rtOrphan … */` (whole-const carcass) and
// `/* @rtOrphanChild … */` (a single dropped field) block comments. The body is
// non-greedy up to the first ` */`; the carcass's own inner `*/` was
// comment-sanitized to `* /` when it was written, so the first ` */` is its true
// terminator.
var orphanBlockPattern = regexp.MustCompile(`(?s)/\* @rtOrphan(?:Child)? .*? \*/`)

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

// collectPruneTargets resolves the --prune argument: an explicit mirror .ts file
// or a directory to walk, used AS-IS (you point --prune directly at the committed
// file/dir to sweep), or — with no argument — the enrich dir resolved from the
// current directory's tsconfig. Unlike --check, --prune never redirects a path
// through mirrorPath: a file argument is always the thing to prune, so it must not
// depend on enrich-dir resolution recognizing it (which broke a mirror in a
// non-default enrich dir pruned without --enrich-dir).
func collectPruneTargets(positional []string, enrichDirFlag string) []string {
	var target string
	if len(positional) > 0 {
		target = tspath.NormalizePath(mustAbs(positional[0]))
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
	var addedConsts []enrich.NamedConst

	// Property-merge (or queue-as-new / restore-from-carcass) each desired const.
	for _, named := range spec.consts {
		if spec.wantFriendly {
			reconcileOneConst(&ops, &addedConsts, index, named, true)
		}
		if spec.wantMock {
			reconcileOneConst(&ops, &addedConsts, index, named, false)
		}
	}

	// Orphan-const: an existing owned const NOT in the desired set whose source
	// type is no longer declared → @rtOrphan it (conservatively; see orphanConsts).
	orphanedEntries := orphanConsts(&ops, index, spec)

	// Breadcrumb clause sync: recompute the type-name list from the surviving
	// consts (existing minus orphaned, plus added) declared in THIS source file,
	// replacing only the `{ … }` clause and keeping `from '<src>'` byte-identical.
	syncBreadcrumbClause(&ops, index, spec, orphanedEntries)

	// Apply the in-place splices first (all index the ORIGINAL bytes), then append
	// new consts + any cross-file imports they introduce.
	merged := applySplices(index.raw, ops)
	appended := appendNewConsts(merged, spec, index, addedConsts)

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
func reconcileOneConst(ops *[]spliceOp, addedConsts *[]enrich.NamedConst, index *mirrorIndex, named enrich.NamedConst, friendly bool) {
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
		// Restore-on-reappear: if an @rtOrphan carcass exists for this (id, form),
		// un-comment it (restoring its preserved value) instead of regenerating.
		// The inner text was comment-sanitized when orphaned (`*/`→`* /`); reverse
		// it so the restored const is byte-identical to the pre-orphan original.
		if carcass := findCarcass(index, named, friendly); carcass != nil {
			*ops = append(*ops, spliceOp{start: carcass.start, end: carcass.end, text: unsanitizeFromComment(carcass.inner) + "\n"})
			return
		}
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
	ctx := mergeCtx{
		metaKeys:      metaKeys,
		existingChild: existing.childIDs,
		desiredChild:  named.ChildIDs,
	}
	mergeObject(ops, existingView, desiredView, ctx)
}

// refreshMarker emits a splice to bring the existing const's @rtType/@rtIds
// marker in line with the desired type id + child-id map, when they differ.
// When the existing const has a marker block, it is replaced; when it has none
// (a hand-authored file), a fresh marker is inserted before the const keyword.
// No op when the marker already matches (idempotent).
func refreshMarker(ops *[]spliceOp, raw []byte, existing *constEntry, named enrich.NamedConst) {
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
func findExistingConst(index *mirrorIndex, named enrich.NamedConst, varName string, isFriendly bool) *constEntry {
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
func queueNewConst(addedConsts *[]enrich.NamedConst, named enrich.NamedConst) {
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
// match, no restorable carcass) to the merged bytes, each carrying its
// @rtType/@rtIds marker, and ensures any cross-file value imports those consts
// reference are present (added after the existing import block). Returns merged
// unchanged when there is nothing to add.
func appendNewConsts(merged []byte, spec mirrorWrite, index *mirrorIndex, addedConsts []enrich.NamedConst) []byte {
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

	body := strings.Join(blocks, "\n")
	withImports := ensureCrossFileImports(merged, spec, index, body)

	var builder strings.Builder
	builder.Write(withImports)
	if len(withImports) > 0 && withImports[len(withImports)-1] != '\n' {
		builder.WriteString("\n")
	}
	builder.WriteString("\n")
	builder.WriteString(body)
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

// pruneMirrorFile strips every `@rtOrphan` / `@rtOrphanChild` block comment (the
// commented-out carcasses the reconcile left behind) from one mirror file,
// rewriting it in place. It returns the number of blocks removed (0 → file
// untouched, not rewritten). This is the ONLY path that truly deletes content.
func pruneMirrorFile(mirrorFile string) int {
	bytes, err := os.ReadFile(mirrorFile)
	if err != nil {
		if os.IsNotExist(err) {
			return 0
		}
		fatal("gen --prune: read %s: %v", mirrorFile, err)
	}
	pruned, removed := pruneOrphanBlocks(string(bytes))
	if removed == 0 {
		return 0
	}
	if err := os.WriteFile(mirrorFile, []byte(pruned), 0o644); err != nil {
		fatal("gen --prune: write %s: %v", mirrorFile, err)
	}
	fmt.Printf("gen --prune: %s — removed %d orphan block(s)\n", mirrorFile, removed)
	return removed
}

// pruneOrphanBlocks removes every `@rtOrphan` / `@rtOrphanChild` block comment
// from text and returns the cleaned text + the count removed. A removed block
// takes its OWN trailing newline with it; a leading-whitespace-only line left
// dangling (the block sat on its own line, indented) is also cleaned so no blank
// gap remains. Returns (text, 0) when there is nothing to prune.
func pruneOrphanBlocks(text string) (string, int) {
	matches := orphanBlockPattern.FindAllStringIndex(text, -1)
	if len(matches) == 0 {
		return text, 0
	}
	var builder strings.Builder
	cursor := 0
	removed := 0
	for _, match := range matches {
		start, end := match[0], match[1]
		// Malformed-carcass guard: a hand-edited carcass whose ` */` terminator is
		// missing/misplaced makes the non-greedy match span PAST its own content into
		// the next live const, swallowing it. Reject (skip + warn) such a block so
		// prune never eats a live statement; the user fixes the carcass by hand.
		if carcassCrossesStatement(text[start:end]) {
			fmt.Fprintf(os.Stderr,
				"gen --prune: skipping a malformed orphan carcass that appears to span a live statement boundary — fix it by hand:\n%.120s…\n",
				text[start:end])
			continue
		}
		// Extend start back over leading spaces/tabs on the block's own line so an
		// indented orphan line is removed cleanly (no orphaned indentation).
		lineStart := start
		for lineStart > 0 && (text[lineStart-1] == ' ' || text[lineStart-1] == '\t') {
			lineStart--
		}
		if lineStart == 0 || text[lineStart-1] == '\n' {
			start = lineStart // the block began the line — drop the indentation too
		}
		// Swallow a single trailing newline so the line disappears entirely.
		if end < len(text) && text[end] == '\n' {
			end++
		}
		builder.WriteString(text[cursor:start])
		cursor = end
		removed++
	}
	builder.WriteString(text[cursor:])
	return builder.String(), removed
}

// statementBoundaryPattern matches a newline-anchored `export const`/`export
// type`/`export interface`/`export class`/`export enum`/`export function`
// declaration — a top-level statement boundary.
var statementBoundaryPattern = regexp.MustCompile(`(?m)^\s*export\s+(const|type|interface|class|enum|function|namespace)\s`)

// carcassCrossesStatement reports whether a matched orphan block body spans MORE
// live statements than it legitimately should: an `@rtOrphan` (whole-const)
// carcass wraps exactly ONE `export …` declaration (its own preserved const), so
// >1 means its terminator ate the next live const; an `@rtOrphanChild` (field)
// carcass wraps NO statement, so any `export …` declaration means it spilled
// past the field. block is the full `/* @rtOrphan… */` match.
func carcassCrossesStatement(block string) bool {
	count := len(statementBoundaryPattern.FindAllStringIndex(block, -1))
	if strings.HasPrefix(block, "/* @rtOrphanChild") {
		return count > 0
	}
	return count > 1
}
