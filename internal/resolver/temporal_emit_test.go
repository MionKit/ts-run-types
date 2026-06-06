package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// temporal_emit_test.go asserts each RT-fn family emits the right code for a
// Temporal type: isType (instanceof), restore (Temporal.X.from), stringify
// (toJSON), binary (serString/desString + from). One representative type per
// assertion keeps it fast; the scan test already covers all 8 detect.

// emitSourcesFor scans getRunTypeId<Temporal.<typeName>>() requesting every
// cache source, and returns the response.
func emitSourcesFor(t *testing.T, typeName string, kinds ...protocol.CacheKind) *protocol.Response {
	t.Helper()
	code := `import {createIsType} from '@mionjs/ts-go-run-types';
export const _ = createIsType<Temporal.` + typeName + `>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeCacheSources: kinds})
	if resp.Error != "" {
		t.Fatalf("scan %s: %s", typeName, resp.Error)
	}
	return &resp
}

func TestTemporal_EmitIsType(t *testing.T) {
	cases := map[string]string{
		"PlainDate":     "instanceof Temporal.PlainDate",
		"Instant":       "instanceof Temporal.Instant",
		"ZonedDateTime": "instanceof Temporal.ZonedDateTime",
		"Duration":      "instanceof Temporal.Duration",
	}
	for typeName, want := range cases {
		t.Run(typeName, func(t *testing.T) {
			resp := emitSourcesFor(t, typeName, protocol.CacheKindIsType)
			if !strings.Contains(resp.IsTypeCacheSource, want) {
				t.Fatalf("%s isType missing %q:\n%s", typeName, want, resp.IsTypeCacheSource)
			}
		})
	}
}

func TestTemporal_EmitRestoreFromJson(t *testing.T) {
	resp := emitSourcesFor(t, "PlainDate", protocol.CacheKindRestoreFromJson)
	if !strings.Contains(resp.RestoreFromJsonCacheSource, "Temporal.PlainDate.from(") {
		t.Fatalf("restoreFromJson missing Temporal.PlainDate.from:\n%s", resp.RestoreFromJsonCacheSource)
	}
}

func TestTemporal_EmitStringifyJson(t *testing.T) {
	resp := emitSourcesFor(t, "Instant", protocol.CacheKindStringifyJson)
	if !strings.Contains(resp.StringifyJsonCacheSource, ".toJSON()") {
		t.Fatalf("stringifyJson missing toJSON():\n%s", resp.StringifyJsonCacheSource)
	}
}

func TestTemporal_EmitBinaryRoundTripShape(t *testing.T) {
	// Numeric-packed type: the emitter dispatches to the serializer's
	// serTemporal*/desTemporal* methods — the byte layout lives in the runtime
	// dataView.ts, asserted end-to-end in JS (test/adapters/temporal.test.ts).
	to := emitSourcesFor(t, "PlainDateTime", protocol.CacheKindToBinary)
	if !strings.Contains(to.ToBinaryCacheSource, ".serTemporalPlainDateTime(") {
		t.Fatalf("toBinary missing serTemporalPlainDateTime():\n%s", to.ToBinaryCacheSource)
	}
	from := emitSourcesFor(t, "PlainDateTime", protocol.CacheKindFromBinary)
	if !strings.Contains(from.FromBinaryCacheSource, ".desTemporalPlainDateTime()") {
		t.Fatalf("fromBinary missing desTemporalPlainDateTime():\n%s", from.FromBinaryCacheSource)
	}

	// String-fallback type (Duration): keeps serString(toJSON()) / from(desString()).
	durTo := emitSourcesFor(t, "Duration", protocol.CacheKindToBinary)
	if !strings.Contains(durTo.ToBinaryCacheSource, ".serString(") || !strings.Contains(durTo.ToBinaryCacheSource, ".toJSON()") {
		t.Fatalf("Duration toBinary missing serString(toJSON()):\n%s", durTo.ToBinaryCacheSource)
	}
	durFrom := emitSourcesFor(t, "Duration", protocol.CacheKindFromBinary)
	if !strings.Contains(durFrom.FromBinaryCacheSource, "Temporal.Duration.from(") || !strings.Contains(durFrom.FromBinaryCacheSource, ".desString()") {
		t.Fatalf("Duration fromBinary missing from(desString()):\n%s", durFrom.FromBinaryCacheSource)
	}
}

func TestTemporal_RunTypeCacheCarriesClassType(t *testing.T) {
	resp := emitSourcesFor(t, "PlainDate", protocol.CacheKindRunType)
	if !strings.Contains(resp.RunTypeCacheSource, "globalThis.Temporal.PlainDate") {
		t.Fatalf("runType cache missing classType wiring globalThis.Temporal.PlainDate:\n%s", resp.RunTypeCacheSource)
	}
}
