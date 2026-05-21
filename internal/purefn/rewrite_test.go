package purefn

import (
	"strings"
	"testing"
)

func TestExtract_CapturesFactoryArgBounds(t *testing.T) {
	source := `
declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const _ = registerPureFnFactory('mion', 'foo', function (utl) {
  return function _f(x: number) { return x + 1; };
});`
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	if len(diags) != 0 {
		t.Fatalf("unexpected diags: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	entry := entries[0]
	if entry.FactoryArgStart <= 0 || entry.FactoryArgEnd <= entry.FactoryArgStart {
		t.Fatalf("bad factory-arg bounds: start=%d end=%d", entry.FactoryArgStart, entry.FactoryArgEnd)
	}
	if entry.FilePath == "" {
		t.Fatalf("FilePath should be populated, got empty")
	}
	// Replacements() should produce a single null-out record matching
	// those bounds.
	reps := Replacements(entries)
	if len(reps) != 1 {
		t.Fatalf("expected 1 replacement, got %d (%+v)", len(reps), reps)
	}
	if reps[0].Text != "null" {
		t.Errorf("expected text 'null', got %q", reps[0].Text)
	}
	if reps[0].Start != entry.FactoryArgStart || reps[0].End != entry.FactoryArgEnd {
		t.Errorf("replacement bounds %d..%d don't match entry %d..%d",
			reps[0].Start, reps[0].End, entry.FactoryArgStart, entry.FactoryArgEnd)
	}
	if reps[0].File != entry.FilePath {
		t.Errorf("replacement file %q != entry file %q", reps[0].File, entry.FilePath)
	}
	// Spot-check: applying the replacement to the source should
	// produce text containing `registerPureFnFactory('mion', 'foo', null)`.
	rewritten := source[:reps[0].Start] + reps[0].Text + source[reps[0].End:]
	// The factory-arg byte range includes its leading trivia (the space
	// after the comma), so the rewrite collapses to `'foo',null` rather
	// than `'foo', null` — both forms parse identically.
	if !strings.Contains(rewritten, "registerPureFnFactory('mion', 'foo',null)") {
		t.Errorf("rewritten source missing nulled-out call form:\n%s", rewritten)
	}
}

func TestExtract_NoReplacement_OnFailedExtraction(t *testing.T) {
	// When the factory arg can't be resolved (e.g. it's a function call
	// returning the factory rather than an inline function), the
	// extractor emits PFE9003 and skips the entry entirely. No
	// Replacement should be produced.
	source := `
declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
declare function buildFactory(): any;
export const _ = registerPureFnFactory('mion', 'bad', buildFactory());`
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	if len(entries) != 0 {
		t.Fatalf("expected no entries, got %+v", entries)
	}
	if len(diags) == 0 {
		t.Fatalf("expected PFE9003 diagnostic, got none")
	}
	if len(Replacements(entries)) != 0 {
		t.Fatalf("expected no replacements for failed extraction")
	}
}
