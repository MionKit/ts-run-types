package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

func TestRootThrowHeadline_PerFamily(t *testing.T) {
	cases := []struct {
		code, kind, want string
	}{
		{diagnostics.CodePJNeverRoot, "Never", "Cannot encode `Never` to JSON."},
		{diagnostics.CodeRJSymbolRoot, "Symbol", "Cannot decode `Symbol` from JSON."},
		{diagnostics.CodeSJFunctionRoot, "Function", "Cannot stringify `Function` to a JSON string."},
		{diagnostics.CodeTBNonSerializableRoot, "Map", "Cannot serialise `Map` to binary."},
		{diagnostics.CodeFBArrayElement, "Function", "Cannot deserialise `Function` from binary."},
		{diagnostics.CodeVLSymbolRoot, "Symbol", "Cannot validate `Symbol`."},
	}
	for _, c := range cases {
		if got := rootThrowHeadline(c.code, c.kind); got != c.want {
			t.Errorf("rootThrowHeadline(%q, %q) = %q, want %q", c.code, c.kind, got, c.want)
		}
	}
}

// TestRootThrowWording_CoversEveryAlwaysThrowCode pins completeness: every
// root-throw diag code (the only codes that become alwaysThrow runtime entries)
// must have throw wording, so no alwaysThrow falls back to the generic line.
func TestRootThrowWording_CoversEveryAlwaysThrowCode(t *testing.T) {
	for _, code := range []string{
		diagnostics.CodeVLNonSerializableRoot, diagnostics.CodeVLSymbolRoot,
		diagnostics.CodeVENonSerializableRoot, diagnostics.CodeVESymbolRoot,
		diagnostics.CodePJNeverRoot, diagnostics.CodePJNonSerializableRoot, diagnostics.CodePJFunctionRoot, diagnostics.CodePJArrayElement, diagnostics.CodePJSymbolRoot,
		diagnostics.CodePJSNeverRoot, diagnostics.CodePJSNonSerializableRoot, diagnostics.CodePJSFunctionRoot, diagnostics.CodePJSArrayElement, diagnostics.CodePJSSymbolRoot,
		diagnostics.CodeRJNeverRoot, diagnostics.CodeRJNonSerializableRoot, diagnostics.CodeRJFunctionRoot, diagnostics.CodeRJArrayElement, diagnostics.CodeRJSymbolRoot,
		diagnostics.CodeSJNeverRoot, diagnostics.CodeSJNonSerializableRoot, diagnostics.CodeSJFunctionRoot, diagnostics.CodeSJArrayElement, diagnostics.CodeSJSymbolRoot,
		diagnostics.CodeTBNeverRoot, diagnostics.CodeTBNonSerializableRoot, diagnostics.CodeTBFunctionRoot, diagnostics.CodeTBArrayElement, diagnostics.CodeTBNonSerializableElem, diagnostics.CodeTBSymbolRoot,
		diagnostics.CodeFBNeverRoot, diagnostics.CodeFBNonSerializableRoot, diagnostics.CodeFBFunctionRoot, diagnostics.CodeFBArrayElement, diagnostics.CodeFBNonSerializableElem, diagnostics.CodeFBSymbolRoot,
	} {
		if _, ok := rootThrowWording[code]; !ok {
			t.Errorf("root-throw code %q has no throw wording", code)
		}
	}
}

func TestBuildAlwaysThrowMessage_WithProvenance(t *testing.T) {
	msg := buildAlwaysThrowMessage(diagnostics.CodeTBFunctionRoot, "Function", []diagnostics.Site{{FilePath: "src/a.ts", StartLine: 7, StartCol: 3}})
	if !strings.HasPrefix(msg, "[TB003] Cannot serialise `Function` to binary.") {
		t.Errorf("unexpected message prefix: %q", msg)
	}
	if !strings.Contains(msg, "(at src/a.ts:7:3)") {
		t.Errorf("expected site suffix, got: %q", msg)
	}
}
