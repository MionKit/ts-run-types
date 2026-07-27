package main

import (
	"os"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
)

// TestTypeFormatsFileInSync asserts the committed typeFormats.generated.ts
// carries every format the registry currently produces — a fast,
// format-agnostic drift guard: add, rename, or re-kind a format emitter without
// regenerating and this fails.
//
// It is a CONTAINMENT check, not a raw byte compare: oxfmt reflows the emitted
// TS in ways the generator doesn't replicate, so a literal `Generate() ==
// committed` would false-fail on formatting. The exact byte-for-byte guard
// (after formatting) is `pnpm rtx core codegen typeformats --check`, which CI
// runs; this test is the cheap Go-level companion that needs no node/oxfmt and
// pins the names + kinds themselves. The blank import of formats/all lives in
// gen.go, so the registry is populated in this test binary too.
func TestTypeFormatsFileInSync(t *testing.T) {
	committed, err := os.ReadFile(typeFormatsOutputPath())
	if err != nil {
		t.Fatalf("read %s: %v", typeFormatsOutputPath(), err)
	}
	src := string(committed)
	for _, emitter := range formats.Registered() {
		name := emitter.Name()
		if !strings.Contains(src, name+":") {
			t.Errorf("format %q missing its key from %s — regenerate via `pnpm rtx core codegen typeformats`",
				name, typeFormatsOutputPath())
		}
		if !strings.Contains(src, jsStr(name)) {
			t.Errorf("format name %s missing its value from the committed table — regenerate via `pnpm rtx core codegen typeformats`",
				jsStr(name))
		}
		want := "kind: RunTypeKind." + kindJsName(emitter.Kind())
		if !strings.Contains(src, want) {
			t.Errorf("format %q kind reference %q missing from the committed table — regenerate via `pnpm rtx core codegen typeformats`",
				name, want)
		}
	}
}

// TestRegisteredNonEmpty guards against a registry-walk regression that silently
// produces an empty table (a valid-but-useless file). Mirrors gen-fn-hashes'
// TestCollectEntriesNonEmpty and gen-run-type-kind's TestParseConstsFoundEntries.
func TestRegisteredNonEmpty(t *testing.T) {
	if got := len(formats.Registered()); got < 12 {
		t.Errorf("formats.Registered() returned %d emitters, expected the full format set (>=12)", got)
	}
}
