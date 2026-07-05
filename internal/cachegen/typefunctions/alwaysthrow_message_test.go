package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diag"
)

func TestRootThrowHeadline_PerFamily(t *testing.T) {
	cases := []struct {
		code, kind, want string
	}{
		{diag.CodePJNeverRoot, "Never", "Cannot encode `Never` to JSON."},
		{diag.CodeRJSymbolRoot, "Symbol", "Cannot decode `Symbol` from JSON."},
		{diag.CodeSJFunctionRoot, "Function", "Cannot stringify `Function` to a JSON string."},
		{diag.CodeTBNonSerializableRoot, "Map", "Cannot serialise `Map` to binary."},
		{diag.CodeFBArrayElement, "Function", "Cannot deserialise `Function` from binary."},
		{diag.CodeVLSymbolRoot, "Symbol", "Cannot validate `Symbol`."},
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
		diag.CodeVLNonSerializableRoot, diag.CodeVLSymbolRoot,
		diag.CodeVENonSerializableRoot, diag.CodeVESymbolRoot,
		diag.CodePJNeverRoot, diag.CodePJNonSerializableRoot, diag.CodePJFunctionRoot, diag.CodePJArrayElement, diag.CodePJSymbolRoot,
		diag.CodePJSNeverRoot, diag.CodePJSNonSerializableRoot, diag.CodePJSFunctionRoot, diag.CodePJSArrayElement, diag.CodePJSSymbolRoot,
		diag.CodeRJNeverRoot, diag.CodeRJNonSerializableRoot, diag.CodeRJFunctionRoot, diag.CodeRJArrayElement, diag.CodeRJSymbolRoot,
		diag.CodeSJNeverRoot, diag.CodeSJNonSerializableRoot, diag.CodeSJFunctionRoot, diag.CodeSJArrayElement, diag.CodeSJSymbolRoot,
		diag.CodeTBNeverRoot, diag.CodeTBNonSerializableRoot, diag.CodeTBFunctionRoot, diag.CodeTBArrayElement, diag.CodeTBNonSerializableElem, diag.CodeTBSymbolRoot,
		diag.CodeFBNeverRoot, diag.CodeFBNonSerializableRoot, diag.CodeFBFunctionRoot, diag.CodeFBArrayElement, diag.CodeFBNonSerializableElem, diag.CodeFBSymbolRoot,
	} {
		if _, ok := rootThrowWording[code]; !ok {
			t.Errorf("root-throw code %q has no throw wording", code)
		}
	}
}

func TestBuildAlwaysThrowMessage_WithProvenance(t *testing.T) {
	msg := buildAlwaysThrowMessage(diag.CodeTBFunctionRoot, "Function", []diag.Site{{FilePath: "src/a.ts", StartLine: 7, StartCol: 3}})
	if !strings.HasPrefix(msg, "[TB003] Cannot serialise `Function` to binary.") {
		t.Errorf("unexpected message prefix: %q", msg)
	}
	if !strings.Contains(msg, "(at src/a.ts:7:3)") {
		t.Errorf("expected site suffix, got: %q", msg)
	}
}
