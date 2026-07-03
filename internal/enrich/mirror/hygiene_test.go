package mirror

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// TestScanDirtyTags_ScaffoldRoundTrip pins the emitter↔detector loop for the
// @todo flag: the EXACT block ConstBlock stamps on a new const is detected as
// exactly one TagTodo (the @rtType/@rtIds marker never fires), and deleting
// the @todo line — what the user does after filling the data — makes the
// block clean.
func TestScanDirtyTags_ScaffoldRoundTrip(t *testing.T) {
	named := enrich.NamedConst{
		TypeName:    "User",
		TypeID:      "abc123",
		ChildIDs:    map[string]string{"name": "n1"},
		FriendlyVar: "friendlyUser",
	}
	block := ConstBlock("friendlyUser", enrich.FriendlyTypeName, named, "{\n  name: {},\n}")

	findings := ScanDirtyTags(block)
	if len(findings) != 1 {
		t.Fatalf("scaffolded const should carry exactly one dirty tag; got %d: %+v", len(findings), findings)
	}
	if findings[0].Kind != TagTodo {
		t.Errorf("kind = %v, want TagTodo", findings[0].Kind)
	}
	if got := block[findings[0].Start:findings[0].End]; got != TodoTag {
		t.Errorf("finding span = %q, want %q", got, TodoTag)
	}

	cleaned := strings.Replace(block, TodoLine+"\n", "", 1)
	if !strings.Contains(cleaned, RtTypeTag) || !strings.Contains(cleaned, RtIdsTag) {
		t.Fatalf("precondition: cleaned block must keep its reconcile marker:\n%s", cleaned)
	}
	if got := ScanDirtyTags(cleaned); len(got) != 0 {
		t.Errorf("a filled const (marker only) must be clean; got %+v", got)
	}
}

// TestScanDirtyTags_OrphanCarcasses pins the carcass loop: both orphan forms
// are detected (tight spans on the tag token), a @todo PRESERVED INSIDE a
// carcass is not double-reported, and PruneOrphanBlocks — the fix the rule
// points at — leaves the text clean.
func TestScanDirtyTags_OrphanCarcasses(t *testing.T) {
	// Build the const carcass exactly like orphanConstOp: the preserved text
	// (marker + @todo + const) is comment-sanitized so its inner `*/` becomes
	// `* /` and the FIRST ` */` is the carcass terminator.
	preserved := "/** " + RtTypeTag + " Gone#dead */\n" + TodoLine + "\nexport const friendlyGone = {};"
	text := "/* " + OrphanTag + " " + sanitizeForComment(preserved) + " */\n" +
		"export const live = {\n" +
		"  /* " + OrphanChildTag + " old: {}, */ fresh: {},\n" +
		"};\n"

	findings := ScanDirtyTags(text)
	if len(findings) != 2 {
		t.Fatalf("want exactly the two carcass findings (inner @todo folded in); got %d: %+v", len(findings), findings)
	}
	if findings[0].Kind != TagOrphan || text[findings[0].Start:findings[0].End] != OrphanTag {
		t.Errorf("first finding = %+v (%q), want TagOrphan on %q", findings[0], text[findings[0].Start:findings[0].End], OrphanTag)
	}
	if findings[1].Kind != TagOrphanChild || text[findings[1].Start:findings[1].End] != OrphanChildTag {
		t.Errorf("second finding = %+v (%q), want TagOrphanChild on %q", findings[1], text[findings[1].Start:findings[1].End], OrphanChildTag)
	}

	pruned, removed, skipped := PruneOrphanBlocks(text)
	if removed != 2 || len(skipped) != 0 {
		t.Fatalf("prune removed %d (skipped %d), want 2 removed", removed, len(skipped))
	}
	if got := ScanDirtyTags(pruned); len(got) != 0 {
		t.Errorf("pruned text must be clean; got %+v", got)
	}
}

// TestScanDirtyTags_CommentTokenOnly: @todo counts only as a comment token —
// string-literal data never fires, and an identifier tail (@todos) is not the
// tag.
func TestScanDirtyTags_CommentTokenOnly(t *testing.T) {
	text := "export const mockUser = {\n" +
		"  bio: {pool: ['has " + TodoTag + " inside', \"and " + TodoTag + "\", `tpl " + TodoTag + "`]},\n" +
		"};\n" +
		"// " + TodoTag + "s is not the tag\n" +
		"/* neither is " + TodoTag + "X */\n" +
		"// but " + TodoTag + ": this one is\n" +
		"/* and " + TodoTag + " in a block */\n"

	findings := ScanDirtyTags(text)
	if len(findings) != 2 {
		t.Fatalf("want the two real comment tokens only; got %d: %+v", len(findings), findings)
	}
	for _, finding := range findings {
		if finding.Kind != TagTodo {
			t.Errorf("kind = %v, want TagTodo", finding.Kind)
		}
		if got := text[finding.Start:finding.End]; got != TodoTag {
			t.Errorf("span = %q, want %q", got, TodoTag)
		}
	}
}

// TestIsEnrichmentFile pins the scoping guard: marker or DSL annotation →
// enrichment file; plain source (even with a @todo comment) → not.
func TestIsEnrichmentFile(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{"marker", MarkerCommentPrefix + "User#a1 */\nexport const friendlyUser = {};", true},
		{"bare tag in a string literal", "export const RT_TYPE_TAG = '" + RtTypeTag + "';\nexport const T = '" + RtIdsTag + "';", false},
		{"friendly annotation", "import type {" + enrich.FriendlyTypeName + "} from 'ts-runtypes';\nexport const f: " + enrich.FriendlyTypeName + "<User> = {};", true},
		{"mock annotation", "export const m: " + enrich.MockDataName + "<User> = {};", true},
		{"annotation with newline after colon", "export const f:\n  " + enrich.FriendlyTypeName + "<User> = {};", true},
		{"plain source with todo", "// " + TodoTag + ": refactor this\nexport const a = 1;", false},
		// The DSL package's own sources DECLARE and document the bare names
		// (and may carry @todo in prose) — never enrichment files.
		{"dsl declaration file", "// the `" + TodoTag + "`/diagnostic layer enforces this\nexport type " + enrich.FriendlyTypeName + "<T> = {[K in keyof T]?: unknown};\ntype Use = " + enrich.FriendlyTypeName + "<{a: 1}>;", false},
		// A runtime that TAKES a map parameter (createFriendly's own signature)
		// is not a mirror — only the const-declaration shape scaffolds emit is.
		{"parameter annotation", "// blank '' (an unfilled " + TodoTag + ") counts as absent\nexport function createFriendly<T>(map: " + enrich.FriendlyTypeName + "<T>) {\n  return map;\n}", false},
		// A JSDoc CODE EXAMPLE showing the const shape lives inside a comment —
		// masked out, so docs-heavy sources with @todo prose never read as mirrors.
		{"jsdoc code example", "/**\n * Example:\n *   export const friendlyUser: " + enrich.FriendlyTypeName + "<User> = {};\n * then fill the " + TodoTag + " blanks.\n */\nexport function helper() {}", false},
		{"empty", "", false},
	}
	for _, testCase := range cases {
		if got := IsEnrichmentFile(testCase.text); got != testCase.want {
			t.Errorf("%s: IsEnrichmentFile = %v, want %v", testCase.name, got, testCase.want)
		}
	}
}

// TestLineIndex_At pins the 1-based line/col conversion (and clamping).
func TestLineIndex_At(t *testing.T) {
	index := NewLineIndex("ab\ncde\n\nf")
	cases := []struct {
		offset, line, col int
	}{
		{0, 1, 1}, {1, 1, 2}, {2, 1, 3}, // "ab" + the newline itself
		{3, 2, 1}, {5, 2, 3}, // "cde"
		{7, 3, 1},  // empty line
		{8, 4, 1},  // "f"
		{99, 4, 2}, // clamped past the end
		{-1, 1, 1}, // clamped before the start
	}
	for _, testCase := range cases {
		line, col := index.At(testCase.offset)
		if line != testCase.line || col != testCase.col {
			t.Errorf("At(%d) = (%d,%d), want (%d,%d)", testCase.offset, line, col, testCase.line, testCase.col)
		}
	}
}

// TestOrphanBlockPatternSource_JSCompatible guards the Go↔JS pattern contract:
// the exported source carries no Go-only inline flags (the JS side compiles
// the SAME string with the `s` flag), and the derived Go pattern still
// matches both emit forms.
func TestOrphanBlockPatternSource_JSCompatible(t *testing.T) {
	if strings.Contains(OrphanBlockPatternSource, "(?s)") {
		t.Fatalf("OrphanBlockPatternSource must stay (?s)-free for JS reuse: %q", OrphanBlockPatternSource)
	}
	if !orphanBlockPattern.MatchString("/* " + OrphanTag + " x */") {
		t.Errorf("derived pattern must match a const carcass")
	}
	if !orphanBlockPattern.MatchString("/* " + OrphanChildTag + " y, */") {
		t.Errorf("derived pattern must match a field carcass")
	}
}

// TestFamilyClassifier_Attribution pins every attribution path FamilyFor
// walks, in precedence order: carcass-interior annotation, nearest live
// annotation at/after the tag, nearest one before it, the DSL import, Unknown.
func TestFamilyClassifier_Attribution(t *testing.T) {
	dsl := "import type { FriendlyType, MockData } from 'ts-runtypes';\n"
	friendlyConst := "export const friendlyUser: " + enrich.FriendlyTypeName + "<User> = {};\n"
	mockConst := "export const mockUser: " + enrich.MockDataName + "<User> = {};\n"

	cases := []struct {
		name string
		text string
		want []MirrorFamily // per ScanDirtyTags finding, in Start order
	}{
		{
			name: "carcass interior annotation wins over surrounding consts",
			text: dsl + friendlyConst + "/* " + OrphanTag + " export const gone: " + enrich.MockDataName + "<User> = {}; */\n" + friendlyConst,
			want: []MirrorFamily{FamilyMock},
		},
		{
			name: "todo attributes to the nearest annotation after it",
			text: dsl + TodoLine + "\n" + mockConst,
			want: []MirrorFamily{FamilyMock},
		},
		{
			name: "trailing annotation-less carcass falls back to nearest-before",
			text: dsl + mockConst + "/* " + OrphanTag + " export const gone = {}; */\n",
			want: []MirrorFamily{FamilyMock},
		},
		{
			name: "no consts at all: single-family DSL import decides",
			text: "import type { " + enrich.FriendlyTypeName + " } from 'ts-runtypes';\n" + TodoLine + "\n",
			want: []MirrorFamily{FamilyFriendly},
		},
		{
			name: "no consts, both families imported: Unknown",
			text: dsl + TodoLine + "\n",
			want: []MirrorFamily{FamilyUnknown},
		},
		{
			name: "annotation inside an ordinary comment never counts",
			text: dsl + "// example: const x: " + enrich.FriendlyTypeName + "<T> = {}\n" + TodoLine + "\n" + mockConst,
			want: []MirrorFamily{FamilyMock},
		},
	}
	for _, testCase := range cases {
		classifier := NewFamilyClassifier(testCase.text)
		findings := ScanDirtyTags(testCase.text)
		if len(findings) != len(testCase.want) {
			t.Errorf("%s: got %d findings, want %d", testCase.name, len(findings), len(testCase.want))
			continue
		}
		for i, finding := range findings {
			if got := classifier.FamilyFor(finding); got != testCase.want[i] {
				t.Errorf("%s: finding %d (%v) attributed to %v, want %v", testCase.name, i, finding.Kind, got, testCase.want[i])
			}
		}
	}
}

// TestScanDirtyTags_StringLiteralsNeverFire pins the comment-anchoring of the
// hygiene scan: tag patterns embedded in STRING data — exactly what the
// generated diagnostic catalog ships, since its messages describe the tags —
// are not carcasses, and the marker emit form inside a string does not make
// the file an enrichment mirror.
func TestScanDirtyTags_StringLiteralsNeverFire(t *testing.T) {
	catalogLike := "export const DIAG = {\n" +
		"  FT021: {detail: 'example:\\n/* " + OrphanTag + " export const gone = {}; */\\nrun gen --prune'},\n" +
		"  FT022: {detail: \"a /* " + OrphanChildTag + " old: 1, */ example\"},\n" +
		"  FT020: {detail: `fresh scaffold:\n" + MarkerCommentPrefix + "User#a1 */\n" + TodoLine + "`},\n" +
		"};\n"
	if findings := ScanDirtyTags(catalogLike); len(findings) != 0 {
		t.Errorf("tag patterns inside string literals must not fire; got %+v", findings)
	}
	if IsEnrichmentFile(catalogLike) {
		t.Errorf("marker prefix inside a string literal must not mark the file as a mirror")
	}
	if HasMarkerComment(catalogLike) {
		t.Errorf("HasMarkerComment must require a real comment start")
	}

	// The same emit forms as REAL comments still fire / still gate.
	realMirror := MarkerCommentPrefix + "User#a1 */\n" +
		"export const friendlyUser: " + enrich.FriendlyTypeName + "<User> = {};\n" +
		"/* " + OrphanTag + " export const gone = {}; */\n"
	if !HasMarkerComment(realMirror) {
		t.Errorf("real marker comment must be recognised")
	}
	findings := ScanDirtyTags(realMirror)
	if len(findings) != 1 || findings[0].Kind != TagOrphan {
		t.Errorf("real carcass must still fire exactly once; got %+v", findings)
	}

	// Orphan pattern nested INSIDE JSDoc prose is not a carcass either (the
	// outer comment ends at the first */, so the match starts mid-comment).
	jsdocExample := "/** example:\n * /* " + OrphanTag + " export const gone = {}; */\n" +
		"export const a = 1;\n"
	if findings := ScanDirtyTags(jsdocExample); len(findings) != 0 {
		t.Errorf("orphan pattern nested in JSDoc prose must not fire; got %+v", findings)
	}
}
