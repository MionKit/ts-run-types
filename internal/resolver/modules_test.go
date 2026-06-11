package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Module-mode closure assembly (scanFiles + IncludeModules, OpResolveModules).
//
// Marker coverage note: per the repo's marker test rule, fn-entry scenarios
// pair the static form (`createValidate<T>()`) with the reflection form
// (`createValidate(value)`); both must demand the same module closure.

// scanModules dispatches a module-mode scan and fails the test on any error.
func scanModules(t *testing.T, sources map[string]string, files ...string) protocol.Response {
	t.Helper()
	r := setupInline(t, sources)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: files, IncludeModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// siteFor returns the single site recorded for file, failing otherwise.
func siteFor(t *testing.T, resp protocol.Response, file string) protocol.Site {
	t.Helper()
	var found []protocol.Site
	for _, site := range resp.Sites {
		if strings.HasSuffix(site.File, file) {
			found = append(found, site)
		}
	}
	if len(found) != 1 {
		t.Fatalf("want 1 site for %s, got %d (%+v)", file, len(found), found)
	}
	return found[0]
}

// keyPosition returns dep's index within deps, or -1.
func keyPosition(deps []string, key string) int {
	for index, dep := range deps {
		if dep == key {
			return index
		}
	}
	return -1
}

func TestModules_ValidateClosureLeafsFirst_Static(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address }
export const isUser = createValidate<User>();`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	if len(site.Deps) == 0 {
		t.Fatalf("site.Deps empty — closure not assembled")
	}
	valHash := operations.PlainHash("validate")
	rootKey := valHash + "_" + site.ID
	rootPos := keyPosition(site.Deps, rootKey)
	if rootPos != len(site.Deps)-1 {
		t.Fatalf("root %q must be LAST in deps %v", rootKey, site.Deps)
	}
	// Every dep key must have a rendered module in the response map.
	for _, dep := range site.Deps {
		source, ok := resp.Modules[dep]
		if !ok || source == "" {
			t.Fatalf("dep %q has no module body; modules=%v", dep, keysOf(resp.Modules))
		}
		if !strings.HasPrefix(source, "'use strict';\nconst u = undefined;\n") {
			t.Fatalf("module %q missing wrapper prologue:\n%s", dep, source)
		}
		if !strings.Contains(source, "export const entry = ['"+dep+"'") {
			t.Fatalf("module %q array must lead with its own key:\n%s", dep, source)
		}
	}
	// The root's module must carry the validate family tag at slot 1 and a
	// same-family child dep (Address's validator), which must sort BEFORE
	// the root (leafs-first).
	rootSource := resp.Modules[rootKey]
	if !strings.Contains(rootSource, "','val','") {
		t.Fatalf("root module missing family tag 'val':\n%s", rootSource)
	}
	childKey := ""
	for _, dep := range site.Deps {
		if dep != rootKey && strings.HasPrefix(dep, valHash+"_") {
			childKey = dep
		}
	}
	if childKey == "" {
		t.Fatalf("no same-family child entry for Address in deps %v", site.Deps)
	}
	if keyPosition(site.Deps, childKey) > rootPos {
		t.Fatalf("child %q must precede root %q in %v", childKey, rootKey, site.Deps)
	}
}

func TestModules_ValidateClosureLeafsFirst_Reflect(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address }
const u: User = {name: 'x', address: {city: 'y'}};
export const isUser = createValidate(u);`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	rootKey := operations.PlainHash("validate") + "_" + site.ID
	if keyPosition(site.Deps, rootKey) != len(site.Deps)-1 {
		t.Fatalf("reflect-form root %q must be last in %v", rootKey, site.Deps)
	}
	if _, ok := resp.Modules[rootKey]; !ok {
		t.Fatalf("reflect-form root module missing")
	}
}

func TestModules_FormEquivalence_SameClosure(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
export interface User { name: string }
export const a = createValidate<User>();`,
		"b.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
import type {User} from './a';
const u: User = {name: 'x'};
export const b = createValidate(u);`,
	}, "a.ts", "b.ts")
	siteA := siteFor(t, resp, "a.ts")
	siteB := siteFor(t, resp, "b.ts")
	if siteA.ID != siteB.ID {
		t.Fatalf("static/reflect ids differ: %q vs %q", siteA.ID, siteB.ID)
	}
	if len(siteA.Deps) != len(siteB.Deps) {
		t.Fatalf("closures differ: %v vs %v", siteA.Deps, siteB.Deps)
	}
	for index := range siteA.Deps {
		if siteA.Deps[index] != siteB.Deps[index] {
			t.Fatalf("closures differ at %d: %v vs %v", index, siteA.Deps, siteB.Deps)
		}
	}
}

func TestModules_JsonDecoderCompositePrimitives(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createJsonDecoder} from '@mionjs/ts-go-run-types';
interface Circle { kind: 'circle'; radius: number }
interface Square { kind: 'square'; side: number }
type Shape = Circle | Square;
export const decode = createJsonDecoder<Shape>();`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	decoderOp, _ := operations.ByName("jsonDecoder")
	compositeKey := operations.FnHashFor(decoderOp, nil, "strip") + "_" + site.ID
	if site.FnId+"_"+site.ID != compositeKey {
		t.Fatalf("site fnId %q must be the strip composite hash", site.FnId)
	}
	compositePos := keyPosition(site.Deps, compositeKey)
	if compositePos != len(site.Deps)-1 {
		t.Fatalf("composite root %q must be last in deps %v", compositeKey, site.Deps)
	}
	// The composite's strip primitives (restoreFromJson + ukuWire) must be in
	// the closure and precede it.
	for _, primitive := range []string{"restoreFromJson", "unknownKeysToUndefinedWire"} {
		key := operations.PlainHash(primitive) + "_" + site.ID
		position := keyPosition(site.Deps, key)
		if position == -1 {
			t.Fatalf("primitive %q missing from deps %v", key, site.Deps)
		}
		if position > compositePos {
			t.Fatalf("primitive %q must precede composite in %v", key, site.Deps)
		}
		if resp.Modules[key] == "" {
			t.Fatalf("primitive %q has no module body", key)
		}
	}
	// The composite module's array must carry its primitive refs as deps.
	if !strings.Contains(resp.Modules[compositeKey], "['"+operations.PlainHash("restoreFromJson")+"_"+site.ID+"','"+operations.PlainHash("unknownKeysToUndefinedWire")+"_"+site.ID+"']") {
		t.Fatalf("composite module must list primitive deps:\n%s", resp.Modules[compositeKey])
	}
}

func TestModules_CrossFamilyValEdges(t *testing.T) {
	// Conflict-prop union — `{a: bigint} | {a: Date}` — forces the encoder's
	// union dispatch to discriminate members via cross-family `val_<member>`
	// lookups (the CrossFamilyValRoots scenario). The closure must pull the
	// validate entries AND order them before the prepareForJson root that
	// references them.
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
interface WithBigint { a: bigint }
interface WithDate { a: Date }
type Conflict = WithBigint | WithDate;
export const encode = createJsonEncoder<Conflict>(undefined, {strategy: 'mutate'});`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	pjRootKey := operations.PlainHash("prepareForJson") + "_" + site.ID
	pjPos := keyPosition(site.Deps, pjRootKey)
	if pjPos == -1 {
		t.Fatalf("prepareForJson root %q missing from deps %v", pjRootKey, site.Deps)
	}
	valPrefix := operations.PlainHash("validate") + "_"
	var valKeys []string
	for index, dep := range site.Deps {
		if !strings.HasPrefix(dep, valPrefix) {
			continue
		}
		valKeys = append(valKeys, dep)
		if index > pjPos {
			t.Fatalf("cross-family edge %q must precede its referencing root %q in %v", dep, pjRootKey, site.Deps)
		}
		source := resp.Modules[dep]
		if source == "" {
			t.Fatalf("val module %q missing body", dep)
		}
		if !strings.Contains(source, "','val','") {
			t.Fatalf("cross-family module %q must carry the val family tag:\n%s", dep, source)
		}
	}
	if len(valKeys) < 2 {
		t.Fatalf("expected val_ member entries for both conflict members, got %v in %v", valKeys, site.Deps)
	}
	// The pj root's body references the val_ entries via getRT — the module
	// must be self-consistent with the closure it shipped. Inside the entry
	// array the body is a single-quoted JS string, so apostrophes arrive
	// escaped (`utl.getRT(\'<key>\')`).
	pjSource := resp.Modules[pjRootKey]
	for _, valKey := range valKeys {
		if !strings.Contains(pjSource, `utl.getRT(\'`+valKey+`\')`) {
			t.Fatalf("pj root body must getRT %q:\n%s", valKey, pjSource)
		}
	}
}

func TestModules_ValidateOptionsVariantKey(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
export const isArr = createValidate<string[]>(undefined, {noIsArrayCheck: true});`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	validateOp, _ := operations.ByName("validate")
	variantKey := operations.FnHashFor(validateOp, []string{"noIsArrayCheck"}, "") + "_" + site.ID
	if keyPosition(site.Deps, variantKey) == -1 {
		t.Fatalf("variant root %q missing from deps %v", variantKey, site.Deps)
	}
	source := resp.Modules[variantKey]
	if !strings.Contains(source, "','val','") {
		t.Fatalf("variant module must carry the BASE family tag 'val':\n%s", source)
	}
}

func TestModules_CircularTypeTerminates(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
interface Node { value: string; next?: Node }
export const isNode = createValidate<Node>();`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	if len(site.Deps) == 0 {
		t.Fatalf("circular closure came back empty")
	}
	for _, dep := range site.Deps {
		if resp.Modules[dep] == "" {
			t.Fatalf("dep %q missing module", dep)
		}
	}
}

func TestModules_GraphDemandSite_DataClosure(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {createMockType} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address; created: Date }
export const mockUser = createMockType<User>();`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	if site.FnId != "" {
		t.Fatalf("graph-demand site must have no fnId, got %q", site.FnId)
	}
	if len(site.Demand) != 1 || site.Demand[0].FamilyTag != "t" {
		t.Fatalf("graph-demand site must demand family 't', got %+v", site.Demand)
	}
	rootKey := "t_" + site.ID
	if keyPosition(site.Deps, rootKey) != len(site.Deps)-1 {
		t.Fatalf("data root %q must be last in %v", rootKey, site.Deps)
	}
	for _, dep := range site.Deps {
		if !strings.HasPrefix(dep, "t_") {
			t.Fatalf("data closure must be all t_ keys, got %q in %v", dep, site.Deps)
		}
	}
	rootSource := resp.Modules[rootKey]
	if !strings.Contains(rootSource, "function initEntry(rtUtils)") {
		t.Fatalf("root data module must gate its footer in initEntry:\n%s", rootSource)
	}
	if !strings.Contains(rootSource, "s.children = [") {
		t.Fatalf("root data module footer must assign children:\n%s", rootSource)
	}
	if !strings.Contains(rootSource, ",initEntry];") {
		t.Fatalf("initEntry must ride as the trailing array slot:\n%s", rootSource)
	}
	// The Date node's module must self-contain its classType runtime value.
	var sawClassType bool
	for _, dep := range site.Deps {
		if strings.Contains(resp.Modules[dep], "s.classType = globalThis.Date;") {
			sawClassType = true
		}
	}
	if !sawClassType {
		t.Fatalf("no data module carries the Date classType assignment")
	}
}

func TestModules_GetRunTypeIdSite_NoModules(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"test.ts": `import {getRunTypeId} from '@mionjs/ts-go-run-types';
interface User { name: string }
export const id = getRunTypeId<User>();`,
	}, "test.ts")
	site := siteFor(t, resp, "test.ts")
	if len(site.Deps) != 0 {
		t.Fatalf("bare-id reflection site must have no deps, got %v", site.Deps)
	}
	if len(resp.Modules) != 0 {
		t.Fatalf("bare-id-only scan must render no modules, got %v", keysOf(resp.Modules))
	}
}

func TestModules_ResolveModulesOp(t *testing.T) {
	r := setupInline(t, map[string]string{
		"test.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address }
export const isUser = createValidate<User>();`,
	})
	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}, IncludeModules: true})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	site := siteFor(t, scan, "test.ts")
	rootKey := operations.PlainHash("validate") + "_" + site.ID

	resolved := r.Dispatch(protocol.Request{Op: protocol.OpResolveModules, Keys: []string{rootKey, "zzzz_nope"}})
	if resolved.Error != "" {
		t.Fatalf("resolveModules: %s", resolved.Error)
	}
	if _, ok := resolved.Modules["zzzz_nope"]; ok {
		t.Fatalf("unknown key must be omitted, got %v", keysOf(resolved.Modules))
	}
	rootSource, ok := resolved.Modules[rootKey]
	if !ok {
		t.Fatalf("requested key %q missing from resolveModules response %v", rootKey, keysOf(resolved.Modules))
	}
	if rootSource != scan.Modules[rootKey] {
		t.Fatalf("resolveModules body differs from scanFiles body for %q", rootKey)
	}
	// Transitive deps of a requested key ride along so the plugin caches the
	// whole closure from one round-trip.
	for _, dep := range site.Deps {
		if _, ok := resolved.Modules[dep]; !ok {
			t.Fatalf("transitive dep %q missing from resolveModules response", dep)
		}
	}
}

func keysOf(modules map[string]string) []string {
	keys := make([]string, 0, len(modules))
	for key := range modules {
		keys = append(keys, key)
	}
	return keys
}
