package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// composerCTADTS overlays the composer builders with their real CompTimeArgs
// param brands — the variadic `tuple` (const T + CompTimeArgs<T>), the
// spread-form `union` (CompTimeArgs<readonly [...T]>), the variadic `func`
// (const P + CompTimeArgs<P>), and the simple-generic `array`
// (CompTimeArgs<RunType<T>>). The point of these tests is to prove tsgo DETECTS
// the CompTimeArgs brand on each of those param shapes — including the awkward
// `(readonly [...T]) & brand` and `T & brand` intersections — and runs the
// literal validation (a builder call / array-of-builders / const-ref passes; a
// dynamic or spread child raises a CTA diagnostic). No Go production code is
// involved: the brand is recognised by marker.DetectAny (alias name or
// brand-property fallback) and validated by the existing isBuilderCallPredicate.
const composerCTADTS = `declare module '@mionjs/ts-go-run-types' {
  export interface RunType<T = unknown> { readonly id: string; }
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type TypeFromRT<R> = R extends RunType<infer T> ? T : never;
  export type MapTuple<T extends readonly RunType[]> = {-readonly [K in keyof T]: TypeFromRT<T[K]>};
  export function string(id?: InjectRunTypeId<string>): RunType<string>;
  export function number(id?: InjectRunTypeId<number>): RunType<number>;
  export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean>;
  export function array<T>(item: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
  export function tuple<const T extends readonly RunType[]>(items: CompTimeArgs<T>, id?: InjectRunTypeId<MapTuple<T>>): RunType<MapTuple<T>>;
  export function union<T extends readonly RunType[]>(members: CompTimeArgs<readonly [...T]>, id?: InjectRunTypeId<MapTuple<T>[number]>): RunType<MapTuple<T>[number]>;
  export function func<const P extends readonly RunType[] = []>(params?: CompTimeArgs<P>, id?: InjectRunTypeId<(...args: MapTuple<P>) => void>): RunType<(...args: MapTuple<P>) => void>;
}
`

// scanComposerCTA scans a single test.ts against composerCTADTS and returns the
// CTA-family diagnostics (CompTimeArgs gate only — MKR/other codes filtered out).
func scanComposerCTA(t *testing.T, code string) []diag.Diagnostic {
	t.Helper()
	r := setupInline(t, map[string]string{"runtypes.d.ts": composerCTADTS, "test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var cta []diag.Diagnostic
	for _, d := range filterDiagsByFamily(resp.Diagnostics, diag.FamilyMarker) {
		if strings.HasPrefix(d.Code, "CTA") {
			cta = append(cta, d)
		}
	}
	return cta
}

// TestComposerCTA_BuilderChildrenAccepted is the positive proof across every
// param shape: a composer fed builder-call children (directly, as an
// array-of-builders, or via a module-scope const bound to one) raises NO CTA
// diagnostic. Covers array (simple generic), tuple (const T), union (spread
// brand), and func (const P) in one pass.
func TestComposerCTA_BuilderChildrenAccepted(t *testing.T) {
	const code = `import {array, tuple, union, func, string, number} from '@mionjs/ts-go-run-types';
const s = string();
const _arr = array(string());
const _arrConst = array(s);
const _tup = tuple([string(), number()]);
const _uni = union([string(), number()]);
const _fn = func([string(), number()]);
const _fn0 = func();
void _arr; void _arrConst; void _tup; void _uni; void _fn; void _fn0;
`
	if cta := scanComposerCTA(t, code); len(cta) != 0 {
		t.Fatalf("expected no CTA diagnostics for builder-call children, got %d: %+v", len(cta), cta)
	}
}

// TestComposerCTA_DynamicArrayChildRejected proves a dynamic (ternary) schema
// passed to a simple-generic composer (array) raises a CTA forbidden-construct
// diagnostic — i.e. tsgo detects CompTimeArgs on `CompTimeArgs<RunType<T>>`.
func TestComposerCTA_DynamicArrayChildRejected(t *testing.T) {
	const code = `import {array, string} from '@mionjs/ts-go-run-types';
declare const cond: boolean;
const _bad = array(cond ? string() : string());
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for dynamic array child, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diag.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diag.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}

// TestComposerCTA_TupleSpreadRejected proves the const-tuple brand
// (`CompTimeArgs<T>`) is detected by tsgo: a spread element inside the items
// array is a forbidden construct.
func TestComposerCTA_TupleSpreadRejected(t *testing.T) {
	const code = `import {tuple, string} from '@mionjs/ts-go-run-types';
declare const parts: [import('@mionjs/ts-go-run-types').RunType<string>];
const _bad = tuple([...parts]);
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for tuple spread, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diag.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diag.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}

// TestComposerCTA_UnionSpreadRejected is the load-bearing detection proof for
// the awkward `CompTimeArgs<readonly [...T]>` param: if tsgo failed to recognise
// the brand on that intersection-of-spread-tuple, the spread child below would
// scan silently. It must raise a CTA forbidden-construct instead.
func TestComposerCTA_UnionSpreadRejected(t *testing.T) {
	const code = `import {union, string} from '@mionjs/ts-go-run-types';
declare const members: [import('@mionjs/ts-go-run-types').RunType<string>];
const _bad = union([...members]);
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for union spread, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diag.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diag.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}

// TestComposerCTA_FuncDynamicParamsRejected proves the variadic func params
// brand (`CompTimeArgs<P>`, const P) is detected: a const bound to a ternary
// (non-builder, non-literal) traces to a forbidden construct.
func TestComposerCTA_FuncDynamicParamsRejected(t *testing.T) {
	const code = `import {func, string} from '@mionjs/ts-go-run-types';
declare const cond: boolean;
const dyn = cond ? [string()] : [string()];
const _bad = func(dyn);
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for dynamic func params, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diag.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diag.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}
