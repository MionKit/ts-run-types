package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// External-module marker matrix (docs/done/external-module-markers.md). Each row
// defines a type / schema / preset / pure-fn in one module and uses the marker
// in another, asserting the cross-module result converges with the inline twin —
// and that the new hardening diagnostics (CTA004 widened const, PFN002 external
// pure-fn handle) fire where intended.

// scanExternal scans `call.ts` (the consumer) against a marker `.d.ts` overlay,
// following its imports into the other source files in the overlay.
func scanExternal(t *testing.T, dts string, files map[string]string) protocol.Response {
	t.Helper()
	overlay := map[string]string{"runtypes.d.ts": dts}
	for name, source := range files {
		overlay[name] = source
	}
	r := setupInline(t, overlay)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// gateCodes returns the hard marker GATES (CTA0xx / PFNxxx) raised, ignoring the
// advisory MKR no-op warnings (`noLiterals`/`noIsArrayCheck` are no-ops on some
// types and fire MKR004/MKR005 independently of what these tests assert).
func gateCodes(resp protocol.Response) []string {
	var codes []string
	for _, d := range resp.Diagnostics {
		if d.Family == diag.FamilyMarker && (strings.HasPrefix(d.Code, "CTA") || strings.HasPrefix(d.Code, "PFN")) {
			codes = append(codes, d.Code)
		}
	}
	return codes
}

// TestExternalModule_GetRunTypeIdConverges — the InjectRunTypeId reflection
// marker over an IMPORTED type. Per the marker-coverage rule it pairs BOTH
// getRunTypeId shapes (reflection `getRunTypeId(value)` first to dodge the
// known static-then-reflect ordering quirk, then static `getRunTypeId<T>()`)
// and asserts they converge with each other AND with an inline structural twin.
func TestExternalModule_GetRunTypeIdConverges(t *testing.T) {
	const types = `export interface User { name: string; age: number; }`
	const code = `import {getRunTypeId} from 'ts-runtypes';
import type {User} from './types';
declare const u: User;
export const reflectId = getRunTypeId(u);
export const staticId = getRunTypeId<User>();
export const inlineId = getRunTypeId<{name: string; age: number}>();
`
	resp := scanExternal(t, runtypesDTS, map[string]string{"types.ts": types, "call.ts": code})
	if len(resp.Sites) != 3 {
		t.Fatalf("expected 3 getRunTypeId sites, got %d", len(resp.Sites))
	}
	reflectID, staticID, inlineID := resp.Sites[0].ID, resp.Sites[1].ID, resp.Sites[2].ID
	if reflectID != staticID {
		t.Errorf("getRunTypeId shapes must converge for an imported type: reflect ID=%q, static ID=%q", reflectID, staticID)
	}
	if staticID != inlineID {
		t.Errorf("imported type must converge with its inline structural twin: imported ID=%q, inline ID=%q", staticID, inlineID)
	}
}

// TestExternalModule_CreateXConverges — InjectTypeFnArgs over an IMPORTED type,
// across the static form (`createValidate<User>()`) and the value-first schema
// form is exercised in the JS suite; here we pin fnId convergence with the
// inline twin for both validate and the JSON encoder family.
func TestExternalModule_CreateXConverges(t *testing.T) {
	const types = `export interface User { name: string; age: number; }`
	const code = `import {createValidate, createJsonEncoder} from 'ts-runtypes';
import type {User} from './types';
export const importedVal = createValidate<User>();
export const inlineVal = createValidate<{name: string; age: number}>();
export const importedJson = createJsonEncoder<User>();
export const inlineJson = createJsonEncoder<{name: string; age: number}>();
`
	resp := scanExternal(t, runtypesDTS, map[string]string{"types.ts": types, "call.ts": code})
	if codes := gateCodes(resp); len(codes) != 0 {
		t.Fatalf("expected no CTA/PFN gate diagnostics, got %v", codes)
	}
	if len(resp.Sites) != 4 {
		t.Fatalf("expected 4 createX sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].FnId != resp.Sites[1].FnId {
		t.Errorf("createValidate<User> must converge with the inline twin: imported FnId=%q, inline FnId=%q", resp.Sites[0].FnId, resp.Sites[1].FnId)
	}
	if resp.Sites[2].FnId != resp.Sites[3].FnId {
		t.Errorf("createJsonEncoder<User> must converge with the inline twin: imported FnId=%q, inline FnId=%q", resp.Sites[2].FnId, resp.Sites[3].FnId)
	}
}

// TestExternalModule_WholeConstOptionBag — Decision 1 for option bags: a WHOLE
// imported `const` preset (declared `as const`) selects the same fn variant as
// the inlined and the spread-merged equivalents.
func TestExternalModule_WholeConstOptionBag(t *testing.T) {
	const opts = `export const strict = {noLiterals: true, noIsArrayCheck: true} as const;`
	const code = `import {createValidate} from 'ts-runtypes';
import {strict} from './opts';
export const whole = createValidate<string>(undefined, strict);
export const spread = createValidate<string>(undefined, {...strict});
export const inline = createValidate<string>(undefined, {noLiterals: true, noIsArrayCheck: true});
export const none = createValidate<string>();
`
	resp := scanExternal(t, runtypesDTS, map[string]string{"opts.ts": opts, "call.ts": code})
	if codes := gateCodes(resp); len(codes) != 0 {
		t.Fatalf("expected no CTA/PFN gate diagnostics for an `as const` whole-const preset, got %v", codes)
	}
	if len(resp.Sites) != 4 {
		t.Fatalf("expected 4 sites, got %d", len(resp.Sites))
	}
	whole, spread, inline, none := resp.Sites[0].FnId, resp.Sites[1].FnId, resp.Sites[2].FnId, resp.Sites[3].FnId
	if whole != inline {
		t.Errorf("whole imported const must match the inlined variant: whole FnId=%q, inline FnId=%q", whole, inline)
	}
	if whole != spread {
		t.Errorf("whole imported const must match the spread-merged variant: whole FnId=%q, spread FnId=%q", whole, spread)
	}
	if whole == none {
		t.Errorf("whole imported const options were silently dropped: equals the no-options variant %q", none)
	}
}

// TestExternalModule_WidenedConstRejected — the `as const` hardening at the call
// site: a non-`as const` preset (same-module or imported) is widened, so it is
// rejected with CTA004 instead of silently selecting a possibly-wrong variant.
func TestExternalModule_WidenedConstRejected(t *testing.T) {
	cases := map[string]map[string]string{
		"same-module": {"call.ts": `import {createValidate} from 'ts-runtypes';
const loose = {noLiterals: true};
export const bad = createValidate<string>(undefined, loose);
`},
		"cross-module": {
			"opts.ts": `export const loose = {noLiterals: true};`,
			"call.ts": `import {createValidate} from 'ts-runtypes';
import {loose} from './opts';
export const bad = createValidate<string>(undefined, loose);
`},
	}
	for name, files := range cases {
		t.Run(name, func(t *testing.T) {
			resp := scanExternal(t, runtypesDTS, files)
			codes := gateCodes(resp)
			if len(codes) != 1 || codes[0] != diag.CodeCompTimeArgsWidenedConst {
				t.Fatalf("expected exactly one CTA004 gate, got %v", codes)
			}
		})
	}
}

// TestExternalModule_PureFnExternalHandleRejected — Part 2: a PureFunction literal
// reachable as a value (imported OR exported) is rejected with PFN002, so the
// AOT-compiled copy is the only thing that can run.
func TestExternalModule_PureFnExternalHandleRejected(t *testing.T) {
	cases := map[string]map[string]string{
		"imported": {
			"lib.ts": `export const isString = (v: unknown) => typeof v === 'string';`,
			"call.ts": `import {withValidator} from 'ts-runtypes';
import {isString} from './lib';
withValidator<string>(isString);
`},
		"exported-const": {"call.ts": `import {withValidator} from 'ts-runtypes';
export const isString = (v: unknown) => typeof v === 'string';
withValidator<string>(isString);
`},
		"exported-function": {"call.ts": `import {withValidator} from 'ts-runtypes';
export function isString(v: unknown) { return typeof v === 'string'; }
withValidator<string>(isString);
`},
		"export-statement": {"call.ts": `import {withValidator} from 'ts-runtypes';
const isString = (v: unknown) => typeof v === 'string';
export {isString};
withValidator<string>(isString);
`},
	}
	for name, files := range cases {
		t.Run(name, func(t *testing.T) {
			resp := scanExternal(t, pureFunctionDts, files)
			codes := gateCodes(resp)
			if len(codes) != 1 || codes[0] != diag.CodePureFunctionExternalHandle {
				t.Fatalf("expected exactly one PFN002, got %v", codes)
			}
		})
	}
}

// TestExternalModule_PureFnLocalAccepted is the negative control: a
// module-private inline / const / function pure-fn still passes (no PFN002),
// proving the rule rejects only externally-reachable handles.
func TestExternalModule_PureFnLocalAccepted(t *testing.T) {
	cases := map[string]string{
		"inline":         `withValidator<string>((v) => typeof v === 'string');`,
		"local-const":    "const isString = (v: unknown) => typeof v === 'string';\nwithValidator<string>(isString);",
		"local-function": "function isString(v: unknown) { return typeof v === 'string'; }\nwithValidator<string>(isString);",
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			code := "import {withValidator} from 'ts-runtypes';\n" + body + "\n"
			resp := scanExternal(t, pureFunctionDts, map[string]string{"call.ts": code})
			if codes := gateCodes(resp); len(codes) != 0 {
				t.Fatalf("expected no PFN/CTA gate for a module-private pure-fn, got %v", codes)
			}
		})
	}
}
