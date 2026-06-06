package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// demandRuntypesDTS overlays a richer `@mionjs/ts-go-run-types` than the shared
// runtypesDTS: it declares the RunType interface, the CompTimeRunType /
// CompTimeArgs aliases, a couple of value-first builders (returning RunType<…>),
// and the schema-form createIsTypeFor. Exercises the demand-collection path
// (CompTimeRunType detection + IsBuilderCall return-type detection).
const demandRuntypesDTS = `declare module '@mionjs/ts-go-run-types' {
  export interface RunType<T = unknown> { readonly id: string; }
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type CompTimeRunType<T> = RunType<T>;
  export interface IsTypeOptions { noLiterals?: boolean; noIsArrayCheck?: boolean; }
  export function string(id?: InjectRunTypeId<string>): RunType<string>;
  export function array<T>(item: RunType<T>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createIsType<T>(val?: T, options?: CompTimeArgs<IsTypeOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
  export function createIsTypeFor<T>(schema: CompTimeRunType<T>, options?: CompTimeArgs<IsTypeOptions>): (v: unknown) => boolean;
}
`

func scanForDemands(t *testing.T, code string) (*resolver.Resolver, protocol.Response) {
	t.Helper()
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": demandRuntypesDTS,
		"test.ts":       code,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return r, resp
}

// TestDemand_SchemaForm_InlineBuilder is the load-bearing probe: it proves
//   - CompTimeRunType<T> = RunType<T> (a pure alias) is detected by the marker
//     scanner via the alias symbol name (no phantom brand), and
//   - IsBuilderCall recognises string() by its RunType<…> return type,
//
// then asserts the recorded demand id equals the builder's own injection-site id
// (i.e. the runtime `schema.id`).
func TestDemand_SchemaForm_InlineBuilder(t *testing.T) {
	const code = `import {string, createIsTypeFor} from '@mionjs/ts-go-run-types';
createIsTypeFor(string());
`
	r, resp := scanForDemands(t, code)
	demands := r.Demands()
	if len(demands) != 1 {
		t.Fatalf("expected 1 demand, got %d: %+v", len(demands), demands)
	}
	// createIsTypeFor is not a marker (no Site); only string() emits a Site.
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 builder site (string()), got %d: %+v", len(resp.Sites), resp.Sites)
	}
	if demands[0].ID != resp.Sites[0].ID {
		t.Fatalf("demand id %q != builder site id %q", demands[0].ID, resp.Sites[0].ID)
	}
	if tn := typeByID(dump(r), demands[0].ID); tn == nil || tn.Kind != protocol.KindString {
		t.Fatalf("demanded id is not KindString: %+v", tn)
	}
}

// TestDemand_SchemaForm_ConstRef proves the schema reference is traced through a
// module-scope const binding to the builder that created it.
func TestDemand_SchemaForm_ConstRef(t *testing.T) {
	const code = `import {string, createIsTypeFor} from '@mionjs/ts-go-run-types';
const s = string();
createIsTypeFor(s);
`
	r, _ := scanForDemands(t, code)
	demands := r.Demands()
	if len(demands) != 1 {
		t.Fatalf("expected 1 demand, got %d: %+v", len(demands), demands)
	}
	if tn := typeByID(dump(r), demands[0].ID); tn == nil || tn.Kind != protocol.KindString {
		t.Fatalf("demanded id is not KindString: %+v", tn)
	}
}

// TestDemand_SchemaForm_ComposedArray proves a composed builder resolves to the
// composite's id (the array), not its child.
func TestDemand_SchemaForm_ComposedArray(t *testing.T) {
	const code = `import {string, array, createIsTypeFor} from '@mionjs/ts-go-run-types';
createIsTypeFor(array(string()));
`
	r, _ := scanForDemands(t, code)
	demands := r.Demands()
	if len(demands) != 1 {
		t.Fatalf("expected 1 demand, got %d: %+v", len(demands), demands)
	}
	if tn := typeByID(dump(r), demands[0].ID); tn == nil || tn.Kind != protocol.KindArray {
		t.Fatalf("demanded id is not KindArray: %+v", tn)
	}
}

// TestDemand_SchemaForm_WrapperFreeTypeSkipped proves a user wrapper carrying a
// CompTimeRunType param is recognised by the brand (not by name), while the
// inner createIsTypeFor(schema) — whose T is the wrapper's free type parameter —
// is skipped (like MKR003), so only the concrete outer call demands.
func TestDemand_SchemaForm_WrapperFreeTypeSkipped(t *testing.T) {
	const code = `import {string, createIsTypeFor} from '@mionjs/ts-go-run-types';
import type {CompTimeRunType} from '@mionjs/ts-go-run-types';
function myFor<T>(schema: CompTimeRunType<T>) { return createIsTypeFor(schema); }
myFor(string());
`
	r, _ := scanForDemands(t, code)
	demands := r.Demands()
	if len(demands) != 1 {
		t.Fatalf("expected 1 demand (outer myFor only), got %d: %+v", len(demands), demands)
	}
	if tn := typeByID(dump(r), demands[0].ID); tn == nil || tn.Kind != protocol.KindString {
		t.Fatalf("demanded id is not KindString: %+v", tn)
	}
}

// TestDemand_MarkerForm_NonBuilderDemands proves a marker-form factory
// (createIsType<T>()) marks its id used, so demand-gated emission still renders
// it (preserves current behavior + keeps user wrappers working).
func TestDemand_MarkerForm_NonBuilderDemands(t *testing.T) {
	const code = `import {createIsType} from '@mionjs/ts-go-run-types';
createIsType<string>();
`
	r, _ := scanForDemands(t, code)
	demands := r.Demands()
	if len(demands) != 1 {
		t.Fatalf("expected 1 demand from createIsType<string>(), got %d: %+v", len(demands), demands)
	}
	if tn := typeByID(dump(r), demands[0].ID); tn == nil || tn.Kind != protocol.KindString {
		t.Fatalf("demanded id is not KindString: %+v", tn)
	}
}

// TestDemand_BuilderOnly_NoDemand proves a builder that is never validated
// interns (emits a Site) but records NO demand — the core saving.
func TestDemand_BuilderOnly_NoDemand(t *testing.T) {
	const code = `import {string} from '@mionjs/ts-go-run-types';
const s = string();
void s;
`
	r, resp := scanForDemands(t, code)
	if got := len(r.Demands()); got != 0 {
		t.Fatalf("builder-only const should record no demand, got %d: %+v", got, r.Demands())
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("builder should still emit a Site (interned for rewrite)")
	}
}

// isTypeSourceFor scans code with the isType cache source projection and
// returns (builder site id, rendered isType module body).
func isTypeSourceFor(t *testing.T, code string) (string, string) {
	t.Helper()
	r := setupInline(t, map[string]string{"runtypes.d.ts": demandRuntypesDTS, "test.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"test.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindIsType},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("expected a builder Site for string()")
	}
	return resp.Sites[0].ID, resp.IsTypeCacheSource
}

// TestDemand_Gating_BuilderOnlyEmitsNoFactory proves the core saving: a builder
// that is never validated produces NO isType factory in the rendered module.
func TestDemand_Gating_BuilderOnlyEmitsNoFactory(t *testing.T) {
	id, source := isTypeSourceFor(t, `import {string} from '@mionjs/ts-go-run-types';
const s = string();
void s;
`)
	if strings.Contains(source, "it_"+id) {
		t.Fatalf("builder-only type %q must NOT have an isType factory; source:\n%s", id, source)
	}
}

// TestDemand_Gating_SchemaFormEmitsFactory proves a createIsTypeFor'd builder
// DOES get its isType factory rendered.
func TestDemand_Gating_SchemaFormEmitsFactory(t *testing.T) {
	id, source := isTypeSourceFor(t, `import {string, createIsTypeFor} from '@mionjs/ts-go-run-types';
createIsTypeFor(string());
`)
	if !strings.Contains(source, "it_"+id) {
		t.Fatalf("schema-form-demanded type %q must have an isType factory; source:\n%s", id, source)
	}
}

// TestDemand_SchemaForm_DynamicRefMKR006 proves a dynamic (ternary) schema
// reference can't be resolved to a static builder → MKR006, no demand.
func TestDemand_SchemaForm_DynamicRefMKR006(t *testing.T) {
	const code = `import {string, createIsTypeFor} from '@mionjs/ts-go-run-types';
declare const cond: boolean;
const s = cond ? string() : string();
createIsTypeFor(s);
`
	r, resp := scanForDemands(t, code)
	if got := len(r.Demands()); got != 0 {
		t.Fatalf("expected 0 demands for dynamic ref, got %d", got)
	}
	found := false
	for _, d := range resp.Diagnostics {
		if d.Code == diag.CodeSchemaFormUnresolved {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected MKR006 diagnostic, got %+v", resp.Diagnostics)
	}
}
