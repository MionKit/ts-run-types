package main

import (
	"strings"
	"testing"
)

// TestIndexOrphanCarcasses recovers an @rtOrphan carcass's preserved inner text
// and indexes it by (type id, form) so a reappearing const can restore it.
func TestIndexOrphanCarcasses(t *testing.T) {
	src := "import type { A } from './a';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
		"\n" +
		"/* @rtOrphan /** @rtType B#bID @rtIds {y: yid} *\\/\n" +
		"export const friendlyB: FriendlyType<B> = {\n" +
		"  $label: '',\n" +
		"  y: {$label: 'Year'},\n" +
		"}; */\n"

	index := parseMirror("/rt/gen/a.ts", []byte(src))
	carcass, ok := index.orphanCarcasses[typeFormKey("bID", true)]
	if !ok {
		t.Fatalf("friendly carcass not indexed; have %d carcasses", len(index.orphanCarcasses))
	}
	if !strings.Contains(carcass.inner, "export const friendlyB") {
		t.Errorf("carcass inner missing the const: %q", carcass.inner)
	}
	if !strings.Contains(carcass.inner, "y: {$label: 'Year'}") {
		t.Errorf("carcass inner should preserve the authored value: %q", carcass.inner)
	}
	// The restore reverses the comment-sanitization (`*\/` → `*/`).
	restored := unsanitizeFromComment(carcass.inner)
	if !strings.Contains(restored, "@rtType B#bID @rtIds {y: yid} */") {
		t.Errorf("restored marker should end in `*/`: %q", restored)
	}
}

// TestOrphanConstOp wraps a whole const (with its marker) in an @rtOrphan block,
// preserving the original verbatim and swallowing the trailing newline.
func TestOrphanConstOp(t *testing.T) {
	src := "/** @rtType B#bID @rtIds {y: yid} */\n" +
		"export const friendlyB: FriendlyType<B> = {\n" +
		"  $label: '',\n" +
		"  y: {$label: 'Year'},\n" +
		"};\n"
	index := parseMirror("/rt/gen/a.ts", []byte(src))
	entry := index.byTypeForm[typeFormKey("bID", true)]
	if entry == nil {
		t.Fatalf("friendlyB not indexed")
	}
	op := orphanConstOp(index.raw, entry)
	if !strings.HasPrefix(op.text, "/* @rtOrphan ") {
		t.Errorf("orphan op text should open with the tag: %q", op.text)
	}
	if !strings.Contains(op.text, "export const friendlyB") {
		t.Errorf("orphan op should preserve the const: %q", op.text)
	}
	// The marker's own `*/` must be sanitized so the outer block stays well-formed.
	if strings.Count(op.text, "*/") != 1 {
		t.Errorf("orphan op must have exactly one `*/` (its own terminator): %q", op.text)
	}
}

// TestSyncBreadcrumbClause_KeepsHandAuthoredName: the breadcrumb sync must NOT
// drop a type name still referenced by a HAND-AUTHORED (non-enrichment) const in
// the same file, even when the enrichment const for the orphaned type goes away.
// This is the A3 regression: the clause was recomputed from enrichment consts
// only, dropping `KeepMe` and breaking the hand-authored `const widget`.
func TestSyncBreadcrumbClause_KeepsHandAuthoredName(t *testing.T) {
	src := "import type { DropMe, KeepMe } from '../../src/models';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
		"\n" +
		"/** @rtType DropMe#dropID */\n" +
		"export const friendlyDropMe: FriendlyType<DropMe> = { $label: '' };\n" +
		"\n" +
		"// hand-authored, not enrichment-owned — still uses KeepMe\n" +
		"export const widget: KeepMe = { kind: 'k' };\n"

	index := parseMirror("/rt/gen/models.ts", []byte(src))

	// Orphan the enrichment const friendlyDropMe (simulate its source type gone).
	orphanedEntry := index.byTypeForm[typeFormKey("dropID", true)]
	if orphanedEntry == nil {
		t.Fatalf("friendlyDropMe not indexed")
	}

	var ops []spliceOp
	spec := mirrorWrite{sourceFile: "/src/models.ts", consts: nil, wantFriendly: true}
	syncBreadcrumbClause(&ops, index, spec, []*constEntry{orphanedEntry})

	merged := string(applySplices(index.raw, ops))
	// KeepMe must survive in the breadcrumb (the hand-authored const still uses it).
	names, _, ok := parseBreadcrumb(merged)
	if !ok {
		t.Fatalf("breadcrumb missing after sync:\n%s", merged)
	}
	hasKeep := false
	for _, name := range names {
		if name == "KeepMe" {
			hasKeep = true
		}
	}
	if !hasKeep {
		t.Errorf("KeepMe was dropped from breadcrumb despite hand-authored use; got %v:\n%s", names, merged)
	}
}

// TestSyncBreadcrumbClause_DropsUnusedName: the complement — a breadcrumb name
// with NO surviving use (only the orphaned enrichment const referenced it) IS
// dropped. Confirms the ADD-only safety is a guard, not a blanket keep-all.
func TestSyncBreadcrumbClause_DropsUnusedName(t *testing.T) {
	src := "import type { DropMe, KeepMe } from '../../src/models';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
		"\n" +
		"/** @rtType DropMe#dropID */\n" +
		"export const friendlyDropMe: FriendlyType<DropMe> = { $label: '' };\n" +
		"\n" +
		"/** @rtType KeepMe#keepID */\n" +
		"export const friendlyKeepMe: FriendlyType<KeepMe> = { $label: '' };\n"

	index := parseMirror("/rt/gen/models.ts", []byte(src))
	dropEntry := index.byTypeForm[typeFormKey("dropID", true)]
	if dropEntry == nil {
		t.Fatalf("friendlyDropMe not indexed")
	}

	var ops []spliceOp
	// KeepMe survives because friendlyKeepMe (an enrichment const, NOT orphaned)
	// is still in index.consts; DropMe should drop (its only const is orphaned).
	spec := mirrorWrite{sourceFile: "/src/models.ts", consts: nil, wantFriendly: true}
	syncBreadcrumbClause(&ops, index, spec, []*constEntry{dropEntry})

	merged := string(applySplices(index.raw, ops))
	names, _, _ := parseBreadcrumb(merged)
	hasDrop, hasKeep := false, false
	for _, name := range names {
		if name == "DropMe" {
			hasDrop = true
		}
		if name == "KeepMe" {
			hasKeep = true
		}
	}
	if hasDrop {
		t.Errorf("DropMe should be dropped (no surviving use); got %v:\n%s", names, merged)
	}
	if !hasKeep {
		t.Errorf("KeepMe should survive (live enrichment const); got %v:\n%s", names, merged)
	}
}

// TestOrphanConsts_OutModeSkipsJudgement: in single-file --out mode the
// source-declaration orphan judgement is SKIPPED — every const across many
// source files lands in one mirror, but the breadcrumb resolves only one source,
// so judging against it would wrongly orphan a still-existing cross-file type.
// This is the C1 guard.
func TestOrphanConsts_OutModeSkipsJudgement(t *testing.T) {
	// A mirror with a breadcrumb to a source that does NOT declare the const's type
	// — normally orphanConsts would orphan friendlyGone (source missing → no-op),
	// but in --out mode it must skip entirely regardless.
	src := "import type { Local } from './local';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
		"\n" +
		"/** @rtType Gone#goneID */\n" +
		"export const friendlyGone: FriendlyType<Gone> = { $label: '' };\n"

	index := parseMirror("/rt/gen/out.ts", []byte(src))
	var ops []spliceOp
	// out != "" → judgement skipped; desired set empty so friendlyGone is unwanted.
	spec := mirrorWrite{mirrorPath: "/rt/gen/out.ts", out: "/rt/gen/out.ts", consts: nil, wantFriendly: true}
	orphaned := orphanConsts(&ops, index, spec)
	if len(orphaned) != 0 || len(ops) != 0 {
		t.Errorf("--out mode must skip the orphan judgement; got %d orphaned, %d ops", len(orphaned), len(ops))
	}
}

// TestPruneOrphanBlocks strips both orphan-child (inline) and orphan-const
// (whole block) carcasses, leaving the live content intact.
func TestPruneOrphanBlocks(t *testing.T) {
	src := "export const friendlyA = {\n" +
		"  x: {$label: ''},\n" +
		"  /* @rtOrphanChild old: {$label: 'Old'}, */\n" +
		"};\n" +
		"\n" +
		"/* @rtOrphan /** @rtType B#bID *\\/\n" +
		"export const friendlyB = { y: {$label: ''} }; */\n" +
		"\n" +
		"export const friendlyC = { z: {$label: ''} };\n"

	pruned, removed := pruneOrphanBlocks(src)
	if removed != 2 {
		t.Fatalf("removed = %d, want 2", removed)
	}
	if strings.Contains(pruned, "@rtOrphan") {
		t.Errorf("orphan tags should be gone:\n%s", pruned)
	}
	if !strings.Contains(pruned, "x: {$label: ''}") || !strings.Contains(pruned, "friendlyC") {
		t.Errorf("live content must survive:\n%s", pruned)
	}
	// The inline orphan-child line is removed cleanly — no leftover blank gap with
	// a dangling indent.
	if strings.Contains(pruned, "  \n") {
		t.Errorf("dangling indented blank line left behind:\n%q", pruned)
	}

	// No orphans → unchanged, zero removed.
	clean := "export const x = 1;\n"
	out, n := pruneOrphanBlocks(clean)
	if n != 0 || out != clean {
		t.Errorf("clean text should be untouched; n=%d out=%q", n, out)
	}
}

// TestPruneOrphanBlocks_MalformedCarcassSkipped is the C2 guard: a hand-edited
// whole-const carcass whose terminator is misplaced so the non-greedy match
// spans into the NEXT live const must be SKIPPED (not removed) so prune never
// eats live code. Here the first carcass's own ` */` was deleted, so the regex
// match runs to the SECOND carcass's terminator, swallowing the live
// friendlyLive const between them.
func TestPruneOrphanBlocks_MalformedCarcassSkipped(t *testing.T) {
	src := "/* @rtOrphan /** @rtType A#aID *\\/\n" +
		"export const friendlyA = { a: {$label: ''} };\n" + // terminator removed here
		"export const friendlyLive = { live: {$label: ''} };\n" +
		"/* @rtOrphan /** @rtType B#bID *\\/\n" +
		"export const friendlyB = { b: {$label: ''} }; */\n"

	pruned, removed := pruneOrphanBlocks(src)
	// The malformed first match (which spans friendlyLive) is skipped → 0 removed,
	// and the live const survives intact.
	if !strings.Contains(pruned, "friendlyLive") {
		t.Errorf("malformed carcass prune ate the live const:\n%s", pruned)
	}
	if removed != 0 {
		t.Errorf("a carcass spanning a live statement must be skipped; removed=%d", removed)
	}
}

// TestCarcassCrossesStatement covers the per-tag thresholds directly.
func TestCarcassCrossesStatement(t *testing.T) {
	// A well-formed whole-const carcass wraps exactly one declaration → fine.
	if carcassCrossesStatement("/* @rtOrphan\nexport const friendlyA = {}; */") {
		t.Errorf("a single-const @rtOrphan carcass must not be flagged")
	}
	// Two declarations in a whole-const carcass → ate the next one.
	if !carcassCrossesStatement("/* @rtOrphan\nexport const a = {};\nexport const b = {}; */") {
		t.Errorf("a two-const @rtOrphan carcass must be flagged")
	}
	// A field carcass should wrap NO declaration; one means it spilled.
	if !carcassCrossesStatement("/* @rtOrphanChild old: {},\nexport const leak = {}; */") {
		t.Errorf("an @rtOrphanChild carcass containing a declaration must be flagged")
	}
	if carcassCrossesStatement("/* @rtOrphanChild old: {$label: 'Old'}, */") {
		t.Errorf("a clean @rtOrphanChild field carcass must not be flagged")
	}
}
