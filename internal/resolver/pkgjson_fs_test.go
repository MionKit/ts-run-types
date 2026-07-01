package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// Regression: the marker module-of-origin gate must read package.json through
// the resolver's OVERLAY / virtual filesystem, not os.ReadFile. A ts-runtypes
// package whose files (incl. package.json) exist ONLY in the overlay — the wasm
// playground and in-memory scans — must still be recognised as module
// "ts-runtypes". Before the fix, os.ReadFile couldn't see the overlay package.json,
// the gate failed, the marker's type argument was lost, and the call's T resolved
// to `unknown` (kind 2). Now it resolves to the real object (kind 30).
func TestMarkerGate_ReadsOverlayPackageJson(t *testing.T) {
	const idx = `
export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
export declare function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
`
	const callCode = `import {createValidate} from 'ts-runtypes';
createValidate<{a: string}>();
`
	// Everything (including package.json) lives ONLY in the in-memory overlay —
	// nothing is written to the real disk.
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"):                         ``, // suppress the fake ambient
		tspath.ResolvePath(cwd, "node_modules/ts-runtypes/package.json"): `{"name":"ts-runtypes","exports":{".":"./index.d.ts"}}`,
		tspath.ResolvePath(cwd, "node_modules/ts-runtypes/index.d.ts"):   idx,
		tspath.ResolvePath(cwd, "call.ts"):                               callCode,
	}
	fileNames := make([]string, 0, len(overlay))
	for path := range overlay {
		fileNames = append(fileNames, path)
	}

	p, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, fileNames)
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)

	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scan error: %s", resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("no site produced")
	}
	site := resp.Sites[0]
	if site.FnId == "" {
		t.Errorf("createValidate site lost its fnId — the InjectTypeFnArgs marker wasn't recognised from the overlay package")
	}
	kind := -1
	for _, rt := range resp.RunTypes {
		if rt.ID == site.ID {
			kind = int(rt.Kind)
		}
	}
	if kind != int(protocol.KindObjectLiteral) {
		t.Errorf("call T resolved to kind %d, want %d (ObjectLiteral) — the marker gate did not read the overlay package.json",
			kind, protocol.KindObjectLiteral)
	}
}
