package cachetpl

import (
	"strings"
	"testing"
)

func TestSpliceInto_HappyPath(t *testing.T) {
	skeleton := "before\n  // #### REPLACE HERE ####\nafter\n"
	got, err := spliceInto(skeleton, "rt('a');\nrt('b');")
	if err != nil {
		t.Fatalf("spliceInto: %v", err)
	}
	want := "before\nrt('a');\nrt('b');\nafter\n"
	if got != want {
		t.Errorf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestSpliceInto_EmptyBody(t *testing.T) {
	skeleton := "before\n  // #### REPLACE HERE ####\nafter\n"
	got, err := spliceInto(skeleton, "")
	if err != nil {
		t.Fatalf("spliceInto: %v", err)
	}
	want := "before\nafter\n"
	if got != want {
		t.Errorf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestSpliceInto_BodyMissingTrailingNewline(t *testing.T) {
	skeleton := "before\n// #### REPLACE HERE ####\nafter\n"
	got, err := spliceInto(skeleton, "x();")
	if err != nil {
		t.Fatalf("spliceInto: %v", err)
	}
	if !strings.Contains(got, "x();\nafter") {
		t.Errorf("body should be terminated with newline before 'after', got:\n%s", got)
	}
}

func TestSpliceInto_MissingMarker(t *testing.T) {
	if _, err := spliceInto("no marker here\n", "body"); err == nil {
		t.Fatal("expected error for missing marker")
	}
}

func TestSpliceInto_DuplicateMarker(t *testing.T) {
	skeleton := "// #### REPLACE HERE ####\nmiddle\n// #### REPLACE HERE ####\n"
	if _, err := spliceInto(skeleton, "body"); err == nil {
		t.Fatal("expected error for duplicate marker")
	}
}

func TestSplice_EmbeddedSkeletonsLoadable(t *testing.T) {
	// Sanity check: every named skeleton resolves through the embedded FS
	// and contains the marker.
	for _, name := range []string{SkeletonRunTypes, SkeletonValidate, SkeletonPureFns} {
		out, err := Splice(name, "/* generated */")
		if err != nil {
			t.Errorf("Splice(%q): %v", name, err)
			continue
		}
		if !strings.Contains(out, "/* generated */") {
			t.Errorf("Splice(%q) did not inject body, got:\n%s", name, out)
		}
		if strings.Contains(out, MarkerLine) {
			t.Errorf("Splice(%q) left the marker in place", name)
		}
	}
}
