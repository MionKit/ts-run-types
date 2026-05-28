package typeid_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype/typeid"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// The test overlay extends the standard runtypes.d.ts with a TypeFormat
// alias that lowers to a base-and-brand intersection. tsgo widens it the
// same way the production @mionjs/ts-go-type-formats type will — two
// sentinel properties carrying the format name and the literal params —
// so the scanner exercises the real detection path, not a parallel one.
const runtypesWithFormatsDTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function reflectRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type TypeFormat<Base, Name extends string, Params> = Base & {
    readonly __rtFormatName: Name;
    readonly __rtFormatParams: Params;
  };
}
`

// runFormatScan builds an in-memory program with the format-aware .d.ts
// overlay, scans the supplied code, and returns the root call site's
// RunType. Sibling of rootFor in structural_test.go — kept separate so
// the format-specific .d.ts doesn't leak into the shared overlay.
func runFormatScan(t *testing.T, code string) *protocol.RunType {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	dtsPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	testPath := tspath.ResolvePath(cwd, "test.ts")
	overlay := map[string]string{
		dtsPath:  runtypesWithFormatsDTS,
		testPath: code,
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, []string{dtsPath, testPath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)
	scanResp := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if scanResp.Error != "" {
		t.Fatalf("scanFiles: %s", scanResp.Error)
	}
	if len(scanResp.Sites) == 0 {
		t.Fatalf("scanFiles returned no sites")
	}
	dump := res.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, node := range dump {
		if node.ID == scanResp.Sites[0].ID {
			return node
		}
	}
	t.Fatalf("root id %q not in dump", scanResp.Sites[0].ID)
	return nil
}

func TestFormatAnnotation_PopulatedOnBrandedString(t *testing.T) {
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type FixtureFormat = TypeFormat<string, 'fixture', {tag: 1}>;
getRunTypeId<FixtureFormat>();
`)
	if root.Kind != protocol.KindString {
		t.Fatalf("expected branded primitive to surface as KindString, got %v", root.Kind)
	}
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation to be populated, got nil")
	}
	if root.FormatAnnotation.Name != "fixture" {
		t.Fatalf("expected format name %q, got %q", "fixture", root.FormatAnnotation.Name)
	}
	if got, ok := root.FormatAnnotation.Params["tag"]; !ok || got != float64(1) {
		t.Fatalf("expected params.tag == 1, got %v (ok=%v)", got, ok)
	}
	if len(root.Decorators) != 0 {
		t.Fatalf("format brand must NOT appear in Decorators, got %d entries", len(root.Decorators))
	}
}

func TestFormatAnnotation_Idempotency_SameParamsSameID(t *testing.T) {
	rootA := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type FmtA = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<FmtA>();
`)
	rootB := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type FmtB = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<FmtB>();
`)
	if rootA.ID != rootB.ID {
		t.Fatalf("expected identical FormatAnnotation params to produce identical ids; got %q vs %q", rootA.ID, rootB.ID)
	}
}

func TestFormatAnnotation_DistinctParamsDistinctID(t *testing.T) {
	root10 := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type Fmt10 = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Fmt10>();
`)
	root20 := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type Fmt20 = TypeFormat<string, 'fixture', {maxLength: 20}>;
getRunTypeId<Fmt20>();
`)
	if root10.ID == root20.ID {
		t.Fatalf("expected distinct params to produce distinct ids; both got %q", root10.ID)
	}
}

func TestFormatAnnotation_KeyOrderIndependent(t *testing.T) {
	rootAB := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type FmtAB = TypeFormat<string, 'fixture', {a: 1, b: 2}>;
getRunTypeId<FmtAB>();
`)
	rootBA := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type FmtBA = TypeFormat<string, 'fixture', {b: 2, a: 1}>;
getRunTypeId<FmtBA>();
`)
	if rootAB.ID != rootBA.ID {
		t.Fatalf("expected key-order independence; got %q vs %q", rootAB.ID, rootBA.ID)
	}
}

func TestFormatAnnotation_BareKindDistinctFromBrand(t *testing.T) {
	rootBare := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
getRunTypeId<string>();
`)
	rootBranded := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
type Branded = TypeFormat<string, 'fixture', {maxLength: 10}>;
getRunTypeId<Branded>();
`)
	if rootBare.ID == rootBranded.ID {
		t.Fatalf("expected plain `string` and a TypeFormat-branded variant to differ; both got %q", rootBare.ID)
	}
	if rootBranded.FormatAnnotation == nil {
		t.Fatalf("branded variant must carry FormatAnnotation")
	}
	if rootBare.FormatAnnotation != nil {
		t.Fatalf("plain string must NOT carry FormatAnnotation, got %+v", rootBare.FormatAnnotation)
	}
}

func TestFormatAnnotation_StructuralKey_Canonicalises(t *testing.T) {
	a := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "fixture",
		Params: map[string]any{"a": 1.0, "b": 2.0},
	})
	b := typeid.FormatAnnotationStructuralKey(&protocol.FormatAnnotation{
		Name:   "fixture",
		Params: map[string]any{"b": 2.0, "a": 1.0},
	})
	if a != b {
		t.Fatalf("FormatAnnotationStructuralKey must be key-order-independent: %q vs %q", a, b)
	}
	if typeid.FormatAnnotationStructuralKey(nil) != "" {
		t.Fatalf("nil annotation must yield empty key")
	}
}
