package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// temporal_emit_test.go asserts each RT-fn family emits the right code for a
// Temporal type: validate (instanceof), restore (Temporal.X.from), stringify
// (toJSON), binary (serString/desString + from). One representative type per
// assertion keeps it fast; the scan test already covers all 8 detect.

// scanTemporalModules scans `<fnName><Temporal.<typeName>>(<extraArgs>)` in
// module mode and returns the response plus the site id. Demand-driven
// families only render when the call site demands them, so the caller picks
// the createX whose demand maps to the family under assertion.
func scanTemporalModules(t *testing.T, fnName, typeName, extraArgs string) (protocol.Response, string) {
	t.Helper()
	code := `import {` + fnName + `} from '@mionjs/ts-go-run-types';
export const _ = ` + fnName + `<Temporal.` + typeName + `>(` + extraArgs + `);
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeModules: true})
	if resp.Error != "" {
		t.Fatalf("scan %s: %s", typeName, resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected one site for %s<Temporal.%s>, got %d", fnName, typeName, len(resp.Sites))
	}
	return resp, resp.Sites[0].ID
}

// temporalModuleBody returns the rendered module body for opName's plain
// entry over the given type id, failing when it's absent from the closure.
func temporalModuleBody(t *testing.T, resp protocol.Response, opName, typeID string) string {
	t.Helper()
	key := operations.PlainHash(opName) + "_" + typeID
	body := resp.Modules[key]
	if body == "" {
		t.Fatalf("module %q missing from response (have %v)", key, keysOf(resp.Modules))
	}
	return body
}

func TestTemporal_EmitValidate(t *testing.T) {
	cases := map[string]string{
		"PlainDate":     "instanceof Temporal.PlainDate",
		"Instant":       "instanceof Temporal.Instant",
		"ZonedDateTime": "instanceof Temporal.ZonedDateTime",
		"Duration":      "instanceof Temporal.Duration",
	}
	for typeName, want := range cases {
		t.Run(typeName, func(t *testing.T) {
			resp, typeID := scanTemporalModules(t, "createValidate", typeName, "")
			body := temporalModuleBody(t, resp, "validate", typeID)
			if !strings.Contains(body, want) {
				t.Fatalf("%s validate missing %q:\n%s", typeName, want, body)
			}
		})
	}
}

func TestTemporal_EmitRestoreFromJson(t *testing.T) {
	// rj is demand-driven: createJsonDecoder (default strip → [rj, ukuw]) seeds it.
	resp, typeID := scanTemporalModules(t, "createJsonDecoder", "PlainDate", "")
	body := temporalModuleBody(t, resp, "restoreFromJson", typeID)
	if !strings.Contains(body, "Temporal.PlainDate.from(") {
		t.Fatalf("restoreFromJson missing Temporal.PlainDate.from:\n%s", body)
	}
}

func TestTemporal_EmitStringifyJson(t *testing.T) {
	// sj is demand-driven: only createJsonEncoder(direct) → [sj] seeds it.
	resp, typeID := scanTemporalModules(t, "createJsonEncoder", "Instant", "undefined, {strategy: 'direct'}")
	body := temporalModuleBody(t, resp, "stringifyJson", typeID)
	if !strings.Contains(body, ".toJSON()") {
		t.Fatalf("stringifyJson missing toJSON():\n%s", body)
	}
}

func TestTemporal_EmitBinaryRoundTripShape(t *testing.T) {
	// Numeric-packed type: the emitter dispatches to the serializer's
	// serTemporal*/desTemporal* methods — the byte layout lives in the runtime
	// dataView.ts, asserted end-to-end in JS (test/adapters/temporal.test.ts).
	// tb/fb are demand-driven: seed each via the matching binary createX.
	to, toID := scanTemporalModules(t, "createBinaryEncoder", "PlainDateTime", "")
	if body := temporalModuleBody(t, to, "toBinary", toID); !strings.Contains(body, ".serTemporalPlainDateTime(") {
		t.Fatalf("toBinary missing serTemporalPlainDateTime():\n%s", body)
	}
	from, fromID := scanTemporalModules(t, "createBinaryDecoder", "PlainDateTime", "")
	if body := temporalModuleBody(t, from, "fromBinary", fromID); !strings.Contains(body, ".desTemporalPlainDateTime()") {
		t.Fatalf("fromBinary missing desTemporalPlainDateTime():\n%s", body)
	}

	// String-fallback type (Duration): keeps serString(toJSON()) / from(desString()).
	durTo, durToID := scanTemporalModules(t, "createBinaryEncoder", "Duration", "")
	if body := temporalModuleBody(t, durTo, "toBinary", durToID); !strings.Contains(body, ".serString(") || !strings.Contains(body, ".toJSON()") {
		t.Fatalf("Duration toBinary missing serString(toJSON()):\n%s", body)
	}
	durFrom, durFromID := scanTemporalModules(t, "createBinaryDecoder", "Duration", "")
	if body := temporalModuleBody(t, durFrom, "fromBinary", durFromID); !strings.Contains(body, "Temporal.Duration.from(") || !strings.Contains(body, ".desString()") {
		t.Fatalf("Duration fromBinary missing from(desString()):\n%s", body)
	}
}

func TestTemporal_RunTypeDataModuleCarriesClassType(t *testing.T) {
	// The data-node module (graph demand via createMockType) must wire the
	// runtime constructor through initEntry — zero imports, globalThis only.
	resp, typeID := scanTemporalModules(t, "createMockType", "PlainDate", "")
	body := resp.Modules["t_"+typeID]
	if body == "" {
		t.Fatalf("data module t_%s missing from response (have %v)", typeID, keysOf(resp.Modules))
	}
	if !strings.Contains(body, "globalThis.Temporal.PlainDate") {
		t.Fatalf("data module missing classType wiring globalThis.Temporal.PlainDate:\n%s", body)
	}
}
