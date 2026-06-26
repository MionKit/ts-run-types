package mirror

import (
	"regexp"
	"strings"

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

// Reconcile parses + indexes the existing mirror bytes (error on syntax error),
// reconciles them against spec's desired const set (property merge per matched
// const + append new consts + orphan-const handling + breadcrumb-clause sync),
// then applies the edits via the descending splicer. It NEVER writes to disk:
// it returns the new bytes, whether they differ from existing (false on a
// byte-identical no-op / idempotent re-run), and any error.
//
// readSource is injected so the orphan judgement can read the breadcrumb source
// without the pure package touching the filesystem.
func Reconcile(spec Spec, existing []byte, readSource func(string) (string, error)) ([]byte, bool, error) {
	index, err := ParseMirror(spec.MirrorPath, existing)
	if err != nil {
		return nil, false, err
	}

	var ops []spliceOp
	var addedConsts []enrich.NamedConst

	// Const-rename pre-pass: a whole type renamed (User → Account) keeps its
	// structural id (the id is name-independent) but changes its var name +
	// annotation. Pair each such existing const with the renamed desired const by
	// their UNIQUE shared id+form and CARRY it — rewrite var/annotation/marker in
	// place and merge the body — instead of orphaning the old const and
	// regenerating an empty new one. Renamed consts are excluded from the merge /
	// append / orphan passes below (which would otherwise double-process them into
	// overlapping splices).
	renames := computeConstRenames(index, spec)
	renamedExisting := map[*constEntry]bool{}
	renamedDesiredVar := map[string]bool{}
	for _, rename := range renames {
		emitConstRename(&ops, index, rename)
		renamedExisting[rename.existing] = true
		renamedDesiredVar[renameDesiredVar(rename)] = true
	}

	// Property-merge (or queue-as-new / restore-from-carcass) each desired const
	// not already handled as a rename.
	for _, named := range spec.Consts {
		if spec.WantFriendly && !renamedDesiredVar[named.FriendlyVar] {
			reconcileOneConst(&ops, &addedConsts, index, named, true)
		}
		if spec.WantMock && !renamedDesiredVar[named.MockVar] {
			reconcileOneConst(&ops, &addedConsts, index, named, false)
		}
	}

	// Orphan-const: an existing owned const NOT in the desired set (by name) and
	// NOT renamed, whose source type is no longer declared → @rtOrphan it
	// (conservatively; see orphanConsts).
	orphanedEntries := orphanConsts(&ops, index, spec, readSource, renamedExisting)

	// Breadcrumb clause sync: recompute the type-name list from the surviving
	// consts (existing minus orphaned/renamed, plus added/renamed-to) declared in
	// THIS source file, replacing only the `{ … }` clause and keeping
	// `from '<src>'` byte-identical.
	syncBreadcrumbClause(&ops, index, spec, orphanedEntries, renamedExisting)

	// Apply the in-place splices first (all index the ORIGINAL bytes), then append
	// new consts + any cross-file imports they introduce.
	merged, err := applySplices(index.raw, ops)
	if err != nil {
		return nil, false, err
	}
	appended := appendNewConsts(merged, spec, index, addedConsts)

	if string(appended) == string(existing) {
		return appended, false, nil // idempotent no-op
	}
	return appended, true, nil
}

// reconcileOneConst reconciles ONE friendly-or-mock const: it finds the matching
// existing const by @rtType id (fallback var name), and either property-merges
// it (recording splice ops) or, when there is no match, queues it for append.
// addedConsts dedups so a friendly+mock pair queues a single NamedConst once.
func reconcileOneConst(ops *[]spliceOp, addedConsts *[]enrich.NamedConst, index *Index, named enrich.NamedConst, friendly bool) {
	varName := named.MockVar
	body := named.Mock
	metaKeys := mockReservedKeys
	if friendly {
		varName = named.FriendlyVar
		body = named.Friendly
		metaKeys = friendlyReservedKeys
	}

	existing := findExistingConst(index, varName)
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
	desired := MarkerComment(named.TypeName, named.TypeID, named.ChildIDs)
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

// findExistingConst returns the existing const with the given var name, or nil.
// Matching is BY NAME — the emission identity: `friendly<Name>` / `mock<Name>`
// mirror the source's NAMED types, so two same-shape types A and B (which share a
// structural id) stay distinct consts. The id is deliberately NOT used to match
// here (an id match would conflate A and B, and would also match a renamed const
// that is simultaneously orphaned-by-name → overlapping splices). A const whose
// name CHANGED (a whole-type rename) is paired separately by computeConstRenames,
// which uses the shared id purely as the change-detection signal.
func findExistingConst(index *Index, varName string) *constEntry {
	if entry, ok := index.byVar[varName]; ok {
		return entry
	}
	return nil
}

// constRename links an existing const to the desired const it was RENAMED into:
// same structural id + form, but a new type name (so a new var + annotation).
type constRename struct {
	existing *constEntry
	desired  enrich.NamedConst
	friendly bool
}

// renameDesiredVar is the var name the renamed const takes (friendly or mock form).
func renameDesiredVar(rename constRename) string {
	if rename.friendly {
		return rename.desired.FriendlyVar
	}
	return rename.desired.MockVar
}

// computeConstRenames pairs a DROPPED existing const (its var name no longer in
// the desired set) with an ADDED desired const (its var name not present in the
// mirror) that share a UNIQUE structural id, per form. A 1:1 id match is a rename:
// the whole tree is carried and only the name changes. An id shared by >1 drop or
// >1 add is ambiguous (e.g. two same-shape types renamed at once) and falls
// through to the safe orphan + append path. Consts with no id never pair.
func computeConstRenames(index *Index, spec Spec) []constRename {
	var renames []constRename
	for _, friendly := range []bool{true, false} {
		if friendly && !spec.WantFriendly {
			continue
		}
		if !friendly && !spec.WantMock {
			continue
		}
		desiredVars := desiredVarsForForm(spec, friendly)
		existingVars := existingVarsForForm(index, friendly)

		dropByID := map[string][]*constEntry{}
		for _, entry := range index.consts {
			if entry.isFriendly != friendly || entry.typeID == "" || desiredVars[entry.varName] {
				continue
			}
			dropByID[entry.typeID] = append(dropByID[entry.typeID], entry)
		}
		addByID := map[string][]enrich.NamedConst{}
		for _, named := range spec.Consts {
			if named.TypeID == "" {
				continue
			}
			varName := named.MockVar
			if friendly {
				varName = named.FriendlyVar
			}
			if existingVars[varName] {
				continue
			}
			addByID[named.TypeID] = append(addByID[named.TypeID], named)
		}
		for id, drops := range dropByID {
			if adds := addByID[id]; len(drops) == 1 && len(adds) == 1 {
				renames = append(renames, constRename{existing: drops[0], desired: adds[0], friendly: friendly})
			}
		}
	}
	return renames
}

// desiredVarsForForm collects the desired var names of one form (friendly/mock).
func desiredVarsForForm(spec Spec, friendly bool) map[string]bool {
	out := map[string]bool{}
	for _, named := range spec.Consts {
		if friendly {
			out[named.FriendlyVar] = true
		} else {
			out[named.MockVar] = true
		}
	}
	return out
}

// existingVarsForForm collects the existing const var names of one form.
func existingVarsForForm(index *Index, friendly bool) map[string]bool {
	out := map[string]bool{}
	for _, entry := range index.consts {
		if entry.isFriendly == friendly {
			out[entry.varName] = true
		}
	}
	return out
}

// emitConstRename carries a renamed const: it rewrites the var identifier, the
// `Wrapper<Name>` annotation type name and the @rtType marker (name + id), then
// merges the desired body INTO the existing one. A pure rename leaves the body
// byte-identical (authored values preserved verbatim); a rename that also changed
// a field merges that field too. No orphan carcass, no fresh empty twin. The
// emitted ops cover disjoint regions (marker / var / annotation / body fields), so
// they never overlap.
func emitConstRename(ops *[]spliceOp, index *Index, rename constRename) {
	existing := rename.existing
	named := rename.desired
	desiredVar, body, metaKeys := named.MockVar, named.Mock, mockReservedKeys
	if rename.friendly {
		desiredVar, body, metaKeys = named.FriendlyVar, named.Friendly, friendlyReservedKeys
	}

	if existing.varNameStart != existing.varNameEnd && existing.varName != desiredVar {
		*ops = append(*ops, spliceOp{start: existing.varNameStart, end: existing.varNameEnd, text: desiredVar})
	}
	if existing.annoNameStart != existing.annoNameEnd && named.TypeName != "" && existing.typeName != named.TypeName {
		*ops = append(*ops, spliceOp{start: existing.annoNameStart, end: existing.annoNameEnd, text: named.TypeName})
	}
	refreshMarker(ops, index.raw, existing, named)

	if existing.body != nil {
		existingView := newObjectView(string(index.raw), index.sourceFile, existing.body)
		if desiredView := parseDesiredObject(body); desiredView != nil {
			mergeObject(ops, existingView, desiredView, mergeCtx{
				metaKeys:      metaKeys,
				existingChild: existing.childIDs,
				desiredChild:  named.ChildIDs,
			})
		}
	}
}

// queueNewConst records a NamedConst for append exactly once. Identity is the
// var-name PAIR (friendly + mock): the same NamedConst is reconciled separately for
// its friendly and mock forms and must not queue twice, but two DIFFERENT named
// types that happen to share a structural id (TypeID) are distinct consts and must
// BOTH append — so the dedup keys on the names, never on the shared id.
func queueNewConst(addedConsts *[]enrich.NamedConst, named enrich.NamedConst) {
	for _, existing := range *addedConsts {
		if existing.FriendlyVar == named.FriendlyVar && existing.MockVar == named.MockVar {
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
func appendNewConsts(merged []byte, spec Spec, index *Index, addedConsts []enrich.NamedConst) []byte {
	if len(addedConsts) == 0 {
		return merged
	}
	var blocks []string
	for _, named := range addedConsts {
		if spec.WantFriendly {
			blocks = append(blocks, ConstBlock(named.FriendlyVar, "FriendlyType", named, named.Friendly))
		}
		if spec.WantMock {
			blocks = append(blocks, ConstBlock(named.MockVar, "MockData", named, named.Mock))
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

// PruneOrphanBlocks removes every `@rtOrphan` / `@rtOrphanChild` block comment
// from text and returns the cleaned text, the count removed, and the malformed
// carcass snippets it SKIPPED. A removed block takes its OWN trailing newline
// with it; a leading-whitespace-only line left dangling (the block sat on its
// own line, indented) is also cleaned so no blank gap remains. A malformed
// carcass whose terminator spans a live statement boundary is collected into
// skipped (left in place) so prune never eats live code — the caller warns.
// Returns (text, 0, nil) when there is nothing to prune.
func PruneOrphanBlocks(text string) (string, int, []string) {
	matches := orphanBlockPattern.FindAllStringIndex(text, -1)
	if len(matches) == 0 {
		return text, 0, nil
	}
	var builder strings.Builder
	var skipped []string
	cursor := 0
	removed := 0
	for _, match := range matches {
		start, end := match[0], match[1]
		// Malformed-carcass guard: a hand-edited carcass whose ` */` terminator is
		// missing/misplaced makes the non-greedy match span PAST its own content into
		// the next live const, swallowing it. Reject (skip) such a block so prune
		// never eats a live statement; the caller surfaces it and the user fixes the
		// carcass by hand.
		if carcassCrossesStatement(text[start:end]) {
			skipped = append(skipped, text[start:end])
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
	return builder.String(), removed, skipped
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
