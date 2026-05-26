package main

import (
	"os"
	"testing"
)

// TestRunTypeKindFileInSync is the single source-of-truth check that
// `packages/ts-go-run-types/src/runTypeKind.ts` matches what the
// generator produces from the current protocol consts. If someone
// adds a Kind*/SubKind* in internal/protocol/ but forgets to
// regenerate, this test fails with a hint to run the codegen script.
//
// It also implicitly covers: the AST walker found every const (a
// silent miss would manifest as a content diff), the JS-side names
// match the override map, and the file header / type-alias exports
// are present.
func TestRunTypeKindFileInSync(t *testing.T) {
	expected, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	actual, err := os.ReadFile(runTypeKindOutputPath())
	if err != nil {
		t.Fatalf("read %s: %v", runTypeKindOutputPath(), err)
	}
	if string(actual) != expected {
		t.Errorf("%s is stale — regenerate via `pnpm run gen:run-type-kind` "+
			"(or `go run ./cmd/gen-run-type-kind > <path>`)",
			runTypeKindOutputPath())
	}
}

// TestParseConstsFoundEntries is a sanity check that the AST walker
// returned a non-empty list for both files. Guards against a future
// refactor of `parseConsts` silently regressing to "found 0 consts"
// (which would still produce a syntactically-valid but useless TS
// file with empty objects).
func TestParseConstsFoundEntries(t *testing.T) {
	cases := []struct {
		label              string
		file, typeName     string
		prefix             string
		minimumExpectedLen int
	}{
		{
			label:              "ReflectionKind",
			file:               repoRoot() + "/internal/protocol/protocol.go",
			typeName:           "ReflectionKind",
			prefix:             "Kind",
			minimumExpectedLen: 30,
		},
		{
			label:              "ReflectionSubKind",
			file:               repoRoot() + "/internal/protocol/subkind.go",
			typeName:           "ReflectionSubKind",
			prefix:             "SubKind",
			minimumExpectedLen: 5,
		},
	}
	for _, tc := range cases {
		entries, err := parseConsts(tc.file, tc.typeName, tc.prefix)
		if err != nil {
			t.Errorf("%s: parse %s: %v", tc.label, tc.file, err)
			continue
		}
		if len(entries) < tc.minimumExpectedLen {
			t.Errorf("%s: parsed %d entries from %s, expected at least %d — did parseConsts miss a const block?",
				tc.label, len(entries), tc.file, tc.minimumExpectedLen)
		}
	}
}
