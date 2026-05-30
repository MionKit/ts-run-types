package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// native_date_format_test.go covers the FormatDate (native Date) family:
// the brand is lifted off the `Date & {brand}` intersection onto a
// KindClass/SubKindDate node, min/max bounds validate the same way as the
// string formats (both date+time components allowed), and the emitted
// isType carries the bound comparison over the Date's getTime().

// scanNativeDate builds a getRunTypeId<TypeFormat<Date, 'nativeDate', P>>()
// snippet and returns the emitted isType source, the scanned RunTypes,
// and any FMT002 diagnostics.
func scanNativeDate(t *testing.T, params string) (string, []*protocol.RunType, []diag.Diagnostic) {
	t.Helper()
	code := `import {getRunTypeId} from '@mionjs/ts-go-run-types';
` + typeFormatBrandDecl + `
export const _ = getRunTypeId<TypeFormat<Date, 'nativeDate', ` + params + `>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeRunTypes:     true,
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindIsType},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var diags []diag.Diagnostic
	for _, d := range resp.Diagnostics {
		if d.Code == diag.CodeFMTInvalidParams {
			diags = append(diags, d)
		}
	}
	return resp.IsTypeCacheSource, resp.RunTypes, diags
}

// findNativeDate returns the RunType carrying the nativeDate annotation.
func findNativeDate(runTypes []*protocol.RunType) *protocol.RunType {
	for _, rt := range runTypes {
		if rt.FormatAnnotation != nil && rt.FormatAnnotation.Name == "nativeDate" {
			return rt
		}
	}
	return nil
}

func TestNativeDate_BrandLiftedOntoDateNode(t *testing.T) {
	_, runTypes, diags := scanNativeDate(t, `{min: 'now-P1Y'; max: 'now'}`)
	if len(diags) != 0 {
		t.Fatalf("valid bounds should not diagnose, got %+v", diags)
	}
	node := findNativeDate(runTypes)
	if node == nil {
		t.Fatal("no RunType carrying the nativeDate annotation")
	}
	if node.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %v", node.Kind)
	}
	if node.SubKind != protocol.SubKindDate {
		t.Fatalf("expected SubKindDate, got %v", node.SubKind)
	}
}

func TestNativeDate_IsTypeEmitsBoundCheck(t *testing.T) {
	source, _, _ := scanNativeDate(t, `{min: '2020-01-01T00:00:00'; max: 'now'}`)
	if !strings.Contains(source, "instanceof Date") {
		t.Fatalf("expected base Date check in emitted isType, got:\n%s", source)
	}
	if !strings.Contains(source, ".getTime()") {
		t.Fatalf("expected getTime() bound comparison in emitted isType, got:\n%s", source)
	}
}

func TestNativeDate_ParamValidation(t *testing.T) {
	cases := []struct {
		name    string
		params  string
		wantErr bool
	}{
		{"relative both components ok", `{min: 'now-P1DT2H'}`, false},
		{"absolute ok", `{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}`, false},
		{"bare now ok", `{max: 'now'}`, false},
		{"malformed duration", `{min: 'now+P'}`, true},
		{"bad absolute literal", `{min: 'not-a-date'}`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, diags := scanNativeDate(t, tc.params)
			if (len(diags) > 0) != tc.wantErr {
				t.Fatalf("params %s: got %+v wantErr %v", tc.params, diags, tc.wantErr)
			}
		})
	}
}
