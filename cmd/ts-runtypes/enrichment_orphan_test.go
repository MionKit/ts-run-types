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
		"/* @rtOrphan /** @rtType B#bID @rtIds {y: yid} * /\n" +
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
	// The restore reverses the comment-sanitization (`* /` → `*/`).
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

// TestPruneOrphanBlocks strips both orphan-child (inline) and orphan-const
// (whole block) carcasses, leaving the live content intact.
func TestPruneOrphanBlocks(t *testing.T) {
	src := "export const friendlyA = {\n" +
		"  x: {$label: ''},\n" +
		"  /* @rtOrphanChild old: {$label: 'Old'}, */\n" +
		"};\n" +
		"\n" +
		"/* @rtOrphan /** @rtType B#bID * /\n" +
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
