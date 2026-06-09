package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// initPrefixFor returns the `init('<plainFnHash>_` prefix the demand-driven
// renderer emits for a family's default-variant entries. Slice 4 replaced the
// readable family tag (`it_`, `te_`, `tb_`) with the opaque, version-isolated
// fnHash from the operation registry, so these scope assertions derive the
// prefix through the same helper the emitter uses.
func initPrefixFor(opName string) string {
	return "init('" + operations.PlainHash(opName) + "_"
}

// demand_scope_test.go pins the demand-driven invariant for the migrated
// function families: a function cache contains an entry for a type ONLY when a
// createX call site of that family references it. `te` (typeErrors) is one
// migrated leaf — a type reached only through getRunTypeId (reflection) or
// through createIsType leaves no te_ entry.
//
// `it` (isType) is now demand-scoped too. Because the JSON/binary union
// decoders + typeErrors discriminate members via `it_<member>` cross-family,
// its demand is the createIsType-site closure ∪ the `it_<member>` edges the
// OTHER demanded families reference (collected by typefns.CrossFamilyItRoots,
// seeded via RenderOpts.ExtraRoots). So a reflection-only file emits ZERO it_
// entries, a createIsType file emits them, and a file that ONLY serializes a
// (non-merging) union still gets the per-member it_ entries its decoder needs.
// See docs/DEMAND-DRIVEN-FN-CACHES.md.

func scopeScan(t *testing.T, code string) protocol.Response {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts"},
		IncludeRunTypes: true,
		IncludeCacheSources: []protocol.CacheKind{
			protocol.CacheKindRunType,
			protocol.CacheKindIsType,
			protocol.CacheKindTypeErrors,
		},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// TestDemandScope_TypeErrorsScopedToItsCallSites — te_ entries are emitted only
// for createGetTypeErrors call sites, not for getRunTypeId or createIsType.
func TestDemandScope_TypeErrorsScopedToItsCallSites(t *testing.T) {
	// Reflection only: no te_.
	reflect := scopeScan(t, `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<{a: string; b: number}>();
`)
	if len(reflect.RunTypes) == 0 {
		t.Fatalf("reflection must still project runtypes for getRunTypeId, got none")
	}
	if strings.Contains(reflect.TypeErrorsCacheSource, initPrefixFor("typeErrors")) {
		t.Errorf("typeErrors cache must be empty for a reflection-only file, got:\n%s", reflect.TypeErrorsCacheSource)
	}

	// createIsType demands `it`, not `te` — so still no te_.
	isType := scopeScan(t, `import {createIsType} from '@mionjs/ts-go-run-types';
export const _ = createIsType<{a: string}>();
`)
	if strings.Contains(isType.TypeErrorsCacheSource, initPrefixFor("typeErrors")) {
		t.Errorf("createIsType must NOT emit a te_ entry, got:\n%s", isType.TypeErrorsCacheSource)
	}

	// createGetTypeErrors demands `te`.
	typeErrors := scopeScan(t, `import {createGetTypeErrors} from '@mionjs/ts-go-run-types';
export const _ = createGetTypeErrors<{a: string}>();
`)
	if !strings.Contains(typeErrors.TypeErrorsCacheSource, initPrefixFor("typeErrors")) {
		t.Errorf("createGetTypeErrors must emit a te_ entry, got:\n%s", typeErrors.TypeErrorsCacheSource)
	}
}

// TestDemandScope_TypeErrorsTransitiveChildren — createGetTypeErrors on a parent
// emits te_ entries for the parent AND its non-inlined children (so dependency
// calls resolve), even though only the parent has a call site.
func TestDemandScope_TypeErrorsTransitiveChildren(t *testing.T) {
	resp := scopeScan(t, `import {createGetTypeErrors} from '@mionjs/ts-go-run-types';
interface Child { c: string }
interface Parent { child: Child[] }
export const _ = createGetTypeErrors<Parent>();
`)
	count := strings.Count(resp.TypeErrorsCacheSource, initPrefixFor("typeErrors"))
	if count < 2 {
		t.Errorf("expected the parent + transitive child te_ entries (>=2), got %d:\n%s", count, resp.TypeErrorsCacheSource)
	}
}

// scopeScanBinary mirrors scopeScan but also opts into the toBinary cache body
// so a cross-family test can assert the `it_` seeding driven by a binary-only
// (createBinaryEncoder) file — the binary union decoder references the per-
// member it_ validators, and CrossFamilyItRoots must seed them into the it
// demand.
func scopeScanBinary(t *testing.T, code string) protocol.Response {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts"},
		IncludeRunTypes: true,
		IncludeCacheSources: []protocol.CacheKind{
			protocol.CacheKindRunType,
			protocol.CacheKindIsType,
			protocol.CacheKindToBinary,
		},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// TestDemandScope_ItScopedReflectionOnly — `it` is now demand-scoped: a
// getRunTypeId-only (reflection) file emits ZERO it_ entries (no createIsType
// site, no other family referencing it_ cross-family).
func TestDemandScope_ItScopedReflectionOnly(t *testing.T) {
	resp := scopeScan(t, `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<{a: string; b: number}>();
`)
	if len(resp.RunTypes) == 0 {
		t.Fatalf("reflection must still project runtypes for getRunTypeId, got none")
	}
	if strings.Contains(resp.IsTypeCacheSource, initPrefixFor("isType")) {
		t.Errorf("it is now demand-scoped; a reflection-only file must emit no it_ entries, got:\n%s", resp.IsTypeCacheSource)
	}
}

// TestDemandScope_ItScopedToCreateIsType — a createIsType call site demands the
// `it` family, so its it_ entry is emitted.
func TestDemandScope_ItScopedToCreateIsType(t *testing.T) {
	resp := scopeScan(t, `import {createIsType} from '@mionjs/ts-go-run-types';
export const _ = createIsType<{a: string}>();
`)
	if !strings.Contains(resp.IsTypeCacheSource, initPrefixFor("isType")) {
		t.Errorf("createIsType must emit an it_ entry, got:\n%s", resp.IsTypeCacheSource)
	}
}

// TestDemandScope_ItSeededByCrossFamilyUnion — the cross-family seeding proof: a
// file that ONLY serializes a NON-merging union (conflicting shared prop, so
// the binary union decoder discriminates members via the per-member isType
// validators) and NEVER calls createIsType MUST still emit it_ entries — the
// union members — because CrossFamilyItRoots follows the toBinary entry's
// crossFamilyDeps into the it demand (RenderOpts.ExtraRoots). Without that
// seeding the union round-trip silently corrupts (missing it_<member> ⇒
// `?? true` ⇒ first member always matches).
func TestDemandScope_ItSeededByCrossFamilyUnion(t *testing.T) {
	resp := scopeScanBinary(t, `import {createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createBinaryEncoder<{a: bigint} | {a: Date}>();
`)
	// Sanity: the binary family IS demanded by createBinaryEncoder.
	if !strings.Contains(resp.ToBinaryCacheSource, initPrefixFor("toBinary")) {
		t.Fatalf("createBinaryEncoder must emit tb_ entries, got:\n%s", resp.ToBinaryCacheSource)
	}
	// The proof: no createIsType site, yet the union's per-member it_ entries
	// are seeded from the toBinary entry's cross-family edges.
	if !strings.Contains(resp.IsTypeCacheSource, initPrefixFor("isType")) {
		t.Fatalf("cross-family seeding broken: a createBinaryEncoder-only union file must still emit it_ member entries (CrossFamilyItRoots → ExtraRoots), got:\n%s", resp.IsTypeCacheSource)
	}
}
