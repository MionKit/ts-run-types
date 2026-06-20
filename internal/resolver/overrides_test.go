package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// overrideDTS declares the markers + a single overrideX twin (overrideValidate)
// plus getRunTypeId, enough to exercise the type-id fold end to end.
const overrideDTS = `declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createJsonEncoder<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: unknown) => string | undefined;
  export function overrideValidate<T>(fn: PureFunction<(v: unknown) => boolean>, id?: InjectTypeFnArgs<T, 'val'>): void;
  export function overrideJsonEncoder<T>(fn: PureFunction<(v: unknown) => string>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): void;
}
`

// idByKind scans call.ts, dumps, and returns the wire id of the first node with
// the given kind (and that node, for further assertions).
func idByKind(t *testing.T, files map[string]string, kind protocol.ReflectionKind) (string, *protocol.RunType) {
	t.Helper()
	r := setupInline(t, files)
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}}); resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, node := range r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes {
		if node.Kind == kind {
			return node.ID, node
		}
	}
	t.Fatalf("no node of kind %d in dump", kind)
	return "", nil
}

// TestOverride_FoldsTypeIDAndPropagates is the core idempotency guarantee: an
// overrideValidate<string> shifts string's structural id (folds the cfn body
// hash) AND every containing type's id (propagation), so no cache key is ever
// reused with a different body across the override / no-override builds.
func TestOverride_FoldsTypeIDAndPropagates(t *testing.T) {
	without := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {getRunTypeId} from 'ts-runtypes';
getRunTypeId<string>();
getRunTypeId<{a: number; b: string}>();
`,
	}
	with := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {getRunTypeId, overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => typeof v === 'string');
getRunTypeId<string>();
getRunTypeId<{a: number; b: string}>();
`,
	}

	plainString, _ := idByKind(t, without, protocol.KindString)
	overriddenString, stringNode := idByKind(t, with, protocol.KindString)
	if plainString == overriddenString {
		t.Fatalf("override did not shift string's id: both %q", overriddenString)
	}
	if stringNode.Overrides["val"] == "" {
		t.Fatalf("overridden string node missing Overrides[val]: %+v", stringNode.Overrides)
	}

	plainStruct, _ := idByKind(t, without, protocol.KindObjectLiteral)
	overriddenStruct, _ := idByKind(t, with, protocol.KindObjectLiteral)
	if plainStruct == overriddenStruct {
		t.Fatalf("override did not propagate to the containing struct: both %q", overriddenStruct)
	}
}

// TestOverride_EmitsRedirectAndCfnModule proves the override is functional: a
// createValidate over a struct whose `string` field is overridden emits a
// validate redirect that calls the cfn (utl.usePureFn('cfn::…')) for that field,
// and the cfn module carries the user's body — propagation through the emitter.
func TestOverride_EmitsRedirectAndCfnModule(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createValidate, overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => typeof v === 'string');
export const isObj = createValidate<{a: number; b: string}>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	validateSources := familyEntrySources(resp, "validate")
	if !strings.Contains(validateSources, "usePureFn(") || !strings.Contains(validateSources, "cfn::") {
		t.Fatalf("validate family missing cfn redirect:\n%s", validateSources)
	}
	all := allEntrySources(resp)
	if !strings.Contains(all, "typeof v === 'string'") {
		t.Fatalf("cfn module missing the override body:\n%s", all)
	}
}

// TestOverride_JsonEncoderComposite proves the headline use case: a hand-tuned
// JSON encoder replaces the composite entry with a cfn redirect.
func TestOverride_JsonEncoderComposite(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createJsonEncoder, overrideJsonEncoder} from 'ts-runtypes';
overrideJsonEncoder<{id: number}>((v) => '{"id":' + (v as {id: number}).id + '}');
export const enc = createJsonEncoder<{id: number}>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	all := allEntrySources(resp)
	if !strings.Contains(all, "usePureFn(") || !strings.Contains(all, "cfn::") {
		t.Fatalf("json encoder composite missing cfn redirect:\n%s", all)
	}
	if !strings.Contains(all, `'{"id":'`) {
		t.Fatalf("cfn module missing the override body:\n%s", all)
	}
	// The composite redirect references no primitives, so the structural
	// prepareForJsonSafe (clone's primitive) is pruned for the overridden type.
	if hasFamilyEntry(resp, "prepareForJsonSafe") {
		t.Fatalf("overridden json encoder must prune its primitives, but pjs entries were emitted:\n%s", familyEntrySources(resp, "prepareForJsonSafe"))
	}
}

// TestOverride_DuplicateConflictEmitsOVR001 — two overrideValidate<string> with
// DIFFERENT bodies is a hard error; the same body dedups silently.
func TestOverride_DuplicateConflictEmitsOVR001(t *testing.T) {
	conflicting := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => typeof v === 'string');
overrideValidate<string>((v) => v !== null);
`,
	}
	r := setupInline(t, conflicting)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	found := false
	for _, d := range resp.Diagnostics {
		if d.Code == diag.CodeDuplicateOverride {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected OVR001 for conflicting overrides, got %+v", resp.Diagnostics)
	}

	sameBody := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => typeof v === 'string');
overrideValidate<string>((v) => typeof v === 'string');
`,
	}
	r2 := setupInline(t, sameBody)
	resp2 := r2.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	for _, d := range resp2.Diagnostics {
		if d.Code == diag.CodeDuplicateOverride {
			t.Fatalf("same-body re-override should dedup silently, got OVR001")
		}
	}
}

// TestOverride_ValidateEmitsOVR010 — overriding validate warns about its
// cross-family reach (decoders); overriding a non-shared family does not, and
// the happy path never trips the OVR002 missing-cfn assert.
func TestOverride_ValidateEmitsOVR010(t *testing.T) {
	codes := func(files map[string]string) map[string]int {
		r := setupInline(t, files)
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		out := map[string]int{}
		for _, d := range resp.Diagnostics {
			out[d.Code]++
		}
		return out
	}

	valCodes := codes(map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createValidate, overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => typeof v === 'string');
export const isString = createValidate<string>();
`,
	})
	if valCodes[diag.CodeOverrideValidateCrossFamily] == 0 {
		t.Fatalf("expected OVR010 for a validate override, got %+v", valCodes)
	}
	if valCodes[diag.CodeOverrideMissingCfn] != 0 {
		t.Fatalf("happy path tripped OVR002: %+v", valCodes)
	}

	jsonCodes := codes(map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createJsonEncoder, overrideJsonEncoder} from 'ts-runtypes';
overrideJsonEncoder<{id: number}>((v) => '{"id":' + (v as {id: number}).id + '}');
export const enc = createJsonEncoder<{id: number}>();
`,
	})
	if jsonCodes[diag.CodeOverrideValidateCrossFamily] != 0 {
		t.Fatalf("OVR010 should fire only for validate overrides, got %+v", jsonCodes)
	}
	if jsonCodes[diag.CodeOverrideMissingCfn] != 0 {
		t.Fatalf("json happy path tripped OVR002: %+v", jsonCodes)
	}
}

// TestOverride_AbsentLeavesIDsUnchanged guards the no-override path: a file with
// no overrideX call produces exactly the same ids it did before the feature
// (the fold is inert when the override map is empty).
func TestOverride_AbsentLeavesIDsUnchanged(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {getRunTypeId} from 'ts-runtypes';
getRunTypeId<string>();
`,
	}
	id, node := idByKind(t, files, protocol.KindString)
	if id == "" {
		t.Fatalf("string id empty")
	}
	if len(node.Overrides) != 0 {
		t.Fatalf("un-overridden string carries Overrides: %+v", node.Overrides)
	}
}
