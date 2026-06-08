package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// demand_scope_test.go pins the demand-driven invariant for the migrated LEAF
// families: a function cache contains an entry for a type ONLY when a createX
// call site of that family references it. `te` (typeErrors) is the first
// migrated leaf — a type reached only through getRunTypeId (reflection) or
// through createIsType leaves no te_ entry. (`it` itself stays all-emit because
// the JSON/binary union decoders depend on it_ cross-family — see
// constants.MigratedFamilies and docs/DEMAND-DRIVEN-FN-CACHES.md.)

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
	if strings.Contains(reflect.TypeErrorsCacheSource, "init('te_") {
		t.Errorf("typeErrors cache must be empty for a reflection-only file, got:\n%s", reflect.TypeErrorsCacheSource)
	}

	// createIsType demands `it`, not `te` — so still no te_.
	isType := scopeScan(t, `import {createIsType} from '@mionjs/ts-go-run-types';
export const _ = createIsType<{a: string}>();
`)
	if strings.Contains(isType.TypeErrorsCacheSource, "init('te_") {
		t.Errorf("createIsType must NOT emit a te_ entry, got:\n%s", isType.TypeErrorsCacheSource)
	}

	// createGetTypeErrors demands `te`.
	typeErrors := scopeScan(t, `import {createGetTypeErrors} from '@mionjs/ts-go-run-types';
export const _ = createGetTypeErrors<{a: string}>();
`)
	if !strings.Contains(typeErrors.TypeErrorsCacheSource, "init('te_") {
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
	count := strings.Count(resp.TypeErrorsCacheSource, "init('te_")
	if count < 2 {
		t.Errorf("expected the parent + transitive child te_ entries (>=2), got %d:\n%s", count, resp.TypeErrorsCacheSource)
	}
}

// TestDemandScope_ItStaysAllEmit documents the cross-family constraint: `it`
// is NOT demand-scoped (the JSON/binary union decoders need it_ cross-family),
// so a reflection-only file still carries it_ entries today. This guards the
// constraint until the all-families migration lets `it` be scoped safely.
func TestDemandScope_ItStaysAllEmit(t *testing.T) {
	resp := scopeScan(t, `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<{a: string; b: number}>();
`)
	if !strings.Contains(resp.IsTypeCacheSource, "init('it_") {
		t.Fatalf("it is intentionally all-emit (shared cross-family dep); expected it_ entries, got:\n%s", resp.IsTypeCacheSource)
	}
}
