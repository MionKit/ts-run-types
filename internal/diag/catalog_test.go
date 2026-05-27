package diag

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDefinitions_AllRegisteredCodesHaveFamilyAndSeverity(t *testing.T) {
	if len(Definitions) == 0 {
		t.Fatal("expected at least one registered Definition")
	}
	for code, def := range Definitions {
		if def.Code != code {
			t.Errorf("code %q: Definition.Code mismatch (%q)", code, def.Code)
		}
		if def.Family == 0 {
			t.Errorf("code %q: Family unset", code)
		}
		if def.Severity == 0 {
			t.Errorf("code %q: Severity unset", code)
		}
		if def.Title == "" {
			t.Errorf("code %q: Title empty", code)
		}
	}
}

func TestNew_PopulatesFamilyAndSeverityFromCatalog(t *testing.T) {
	d := New(CodeMarkerFunctionCallArg, Site{FilePath: "/a/b.ts", StartLine: 1, StartCol: 2}, "hi")
	if d.Code != CodeMarkerFunctionCallArg {
		t.Errorf("Code: got %q want %q", d.Code, CodeMarkerFunctionCallArg)
	}
	if d.Family != FamilyMarker {
		t.Errorf("Family: got %d want %d", d.Family, FamilyMarker)
	}
	if d.Severity != SeverityWarning {
		t.Errorf("Severity: got %d want %d", d.Severity, SeverityWarning)
	}
}

func TestNew_PanicsOnUnknownCode(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on unknown code")
		}
	}()
	New("ZZZZ999", Site{}, "x")
}

func TestDiagnostic_MarshalJSON_NumericSeverityAndFamily(t *testing.T) {
	d := New(CodeMarkerFunctionCallArg, Site{FilePath: "/a/b.ts", StartLine: 3, StartCol: 4}, "msg")
	out, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, `"severity":2`) {
		t.Errorf("expected numeric severity (warning=2) in JSON: %s", s)
	}
	if !strings.Contains(s, `"family":2`) {
		t.Errorf("expected numeric family (marker=2) in JSON: %s", s)
	}
	if strings.Contains(s, `"severity":"warning"`) {
		t.Errorf("severity must be numeric, not string: %s", s)
	}
}

func TestFormatTsc_RendersHumanLabelForSeverity(t *testing.T) {
	d := New(CodeMarkerFunctionCallArg, Site{FilePath: "/a/b.ts", StartLine: 5, StartCol: 7}, "the message")
	line := FormatTsc(d)
	if !strings.Contains(line, "/a/b.ts(5,7): warning MKR001: the message") {
		t.Errorf("unexpected canonical line: %q", line)
	}
}

func TestFormatTsc_AppendsRelatedLines(t *testing.T) {
	d := New(CodeBodyHashCollision,
		Site{FilePath: "/a.ts", StartLine: 1, StartCol: 1},
		"dup",
		Related{Site: Site{FilePath: "/b.ts", StartLine: 9, StartCol: 9}, Message: "first here"},
	)
	line := FormatTsc(d)
	if !strings.Contains(line, "\n  Related: /b.ts(9,9): first here") {
		t.Errorf("missing related line in: %q", line)
	}
}

func TestSeverityLabel(t *testing.T) {
	if SeverityLabel(SeverityError) != "error" {
		t.Errorf("error label")
	}
	if SeverityLabel(SeverityWarning) != "warning" {
		t.Errorf("warning label")
	}
	if SeverityLabel(SeverityInfo) != "info" {
		t.Errorf("info label")
	}
}
