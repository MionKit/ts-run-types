package sourcerewrite

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// goldenCase mirrors the JSON written by testdata/gen_golden.mjs — the inputs
// (file/code/sites/replacements) plus the REAL JS rewrite's outputs
// (expectedCode/expectedMap) that the Go port must reproduce byte-for-byte.
type goldenCase struct {
	File         string                 `json:"file"`
	Code         string                 `json:"code"`
	Sites        []protocol.Site        `json:"sites"`
	Replacements []protocol.Replacement `json:"replacements"`
	ExpectedCode string                 `json:"expectedCode"`
	ExpectedMap  *protocol.SourceMap    `json:"expectedMap"`
}

// TestApply_Golden loads every testdata/*.json oracle, runs Apply, and asserts
// the rewritten code AND the full source map match the JS pipeline exactly. The
// `mappings` string is the load-bearing field — UTF-16 column math /
// boundary segmentation must reproduce magic-string's hires:'boundary' output.
func TestApply_Golden(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join("testdata", "*.json"))
	if err != nil {
		t.Fatalf("glob testdata: %v", err)
	}
	if len(paths) == 0 {
		t.Fatal("no golden testdata/*.json found — run testdata/gen_golden.mjs")
	}
	for _, path := range paths {
		path := path
		name := filepath.Base(path)
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read %s: %v", path, err)
			}
			var tc goldenCase
			if err := json.Unmarshal(raw, &tc); err != nil {
				t.Fatalf("unmarshal %s: %v", path, err)
			}

			gotCode, gotMap := Apply(tc.File, tc.Code, tc.Sites, tc.Replacements)

			if gotCode != tc.ExpectedCode {
				t.Errorf("code mismatch\n got: %q\nwant: %q", gotCode, tc.ExpectedCode)
			}

			if tc.ExpectedMap == nil {
				if gotMap != nil {
					t.Errorf("expected nil map, got %+v", gotMap)
				}
				return
			}
			if gotMap == nil {
				t.Fatalf("expected map, got nil")
			}

			// The mappings string is the hard part — compare it explicitly so a
			// failure points straight at it.
			if gotMap.Mappings != tc.ExpectedMap.Mappings {
				t.Errorf("mappings mismatch\n got: %q\nwant: %q", gotMap.Mappings, tc.ExpectedMap.Mappings)
			}
			if gotMap.Version != tc.ExpectedMap.Version {
				t.Errorf("version: got %d, want %d", gotMap.Version, tc.ExpectedMap.Version)
			}
			if !stringSlicesEqual(gotMap.Sources, tc.ExpectedMap.Sources) {
				t.Errorf("sources: got %v, want %v", gotMap.Sources, tc.ExpectedMap.Sources)
			}
			if !stringSlicesEqual(gotMap.Names, tc.ExpectedMap.Names) {
				t.Errorf("names: got %v, want %v", gotMap.Names, tc.ExpectedMap.Names)
			}
			if !ptrStringSlicesEqual(gotMap.SourcesContent, tc.ExpectedMap.SourcesContent) {
				t.Errorf("sourcesContent mismatch\n got: %s\nwant: %s",
					dumpPtrSlice(gotMap.SourcesContent), dumpPtrSlice(tc.ExpectedMap.SourcesContent))
			}

			// Belt-and-braces: the full marshaled map must be byte-identical too.
			gotJSON, _ := json.Marshal(gotMap)
			wantJSON, _ := json.Marshal(tc.ExpectedMap)
			if string(gotJSON) != string(wantJSON) {
				t.Errorf("marshaled map mismatch\n got: %s\nwant: %s", gotJSON, wantJSON)
			}
		})
	}
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func ptrStringSlicesEqual(a, b []*string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if (a[i] == nil) != (b[i] == nil) {
			return false
		}
		if a[i] != nil && *a[i] != *b[i] {
			return false
		}
	}
	return true
}

func dumpPtrSlice(s []*string) string {
	out, _ := json.Marshal(s)
	return string(out)
}
