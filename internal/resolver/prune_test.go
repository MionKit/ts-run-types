package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/operations"
)

// prune_test.go pins the emission-side completion of noop elision
// (pruneUnreachableTypeFnEntries): the demand machinery renders a short-form
// entry for every primitive a composite site demands, but once the composite
// elides its binding the orphan must not be EMITTED either — only modules the
// plugin can actually reach (rewrite-injected bindings + their transitive
// import closure) leave the resolver.

// TestPrune_ElidedPrimitivesNotEmitted — a plain JSON-compatible DTO through
// createJsonDecoder (default strip): rj is identity, the jdST composite
// elides it, and the rj module must disappear from the payload while the live
// ukuw half stays imported.
func TestPrune_ElidedPrimitivesNotEmitted(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoder} from '@mionjs/ts-go-run-types';
type PlainDTO = {a: string; b?: number};
export const dec = createJsonDecoder<PlainDTO>();
`)
	if hasFamilyEntry(resp, "restoreFromJson") {
		t.Errorf("noop rj entry must be pruned once the composite elides it, got %v", familyEntryKeys(resp, "restoreFromJson"))
	}
	if !hasFamilyEntry(resp, "unknownKeysToUndefinedWire") {
		t.Error("ukuw does real work for an object DTO — its module must survive the prune")
	}
	if !hasFamilyEntry(resp, "jsonDecoder") {
		t.Error("the jdST composite is the injected binding — it must always be emitted")
	}
	if all := allEntrySources(resp); strings.Contains(all, "rjFn") {
		t.Errorf("no emitted module may still bind rjFn:\n%s", all)
	}
}

// TestPrune_LivePrimitivesStayEmitted is the control: a Date-bearing DTO
// keeps its rj entry (real `new Date(v)` rebuild) referenced by the composite
// and therefore emitted.
func TestPrune_LivePrimitivesStayEmitted(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoder} from '@mionjs/ts-go-run-types';
type Stamped = {a: string; at: Date};
export const dec = createJsonDecoder<Stamped>();
`)
	if !hasFamilyEntry(resp, "restoreFromJson") {
		t.Error("rj must stay emitted when the decoder needs the Date rebuild")
	}
	if all := allEntrySources(resp); !strings.Contains(all, "rjFn") {
		t.Error("the jdST composite must keep its rjFn binding for a Date-bearing DTO")
	}
}

// TestPrune_KeepsDirectlyDemandedNoopRoots — a rewrite-injected binding must
// always resolve, even when its entry is the noop short-form: createValidate
// over `any` collapses to identity, but the site imports `__rt_<val>_<id>`
// directly, so the module must survive the prune.
func TestPrune_KeepsDirectlyDemandedNoopRoots(t *testing.T) {
	resp := scopeScan(t, `import {createValidate} from '@mionjs/ts-go-run-types';
export const isAnything = createValidate<any>();
`)
	keys := familyEntryKeys(resp, "validate")
	if len(keys) != 1 {
		t.Fatalf("expected exactly the demanded val entry to survive, got %v", keys)
	}
	if module := entryModule(resp, keys[0]); !strings.Contains(module, ",true]") {
		t.Errorf("the surviving val entry for `any` must be the noop short-form:\n%s", module)
	}
	if resp.Sites[0].FnId+"_"+resp.Sites[0].ID != keys[0] {
		t.Errorf("surviving key %q must be the site's own injected binding %q", keys[0], resp.Sites[0].FnId+"_"+resp.Sites[0].ID)
	}
}

// TestPrune_ReflectionAndPureFnModulesUntouched — non-typefn kinds are
// unconditional roots: a reflection-only file keeps its facade + runtype
// bundle payload.
func TestPrune_ReflectionAndPureFnModulesUntouched(t *testing.T) {
	resp := scopeScan(t, `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const id = getRunTypeId<{a: string}>();
`)
	if entryModule(resp, "runtypes") == "" {
		t.Error("the runtype data bundle must never be pruned")
	}
	if resp.Sites[0].ID == "" || entryModule(resp, resp.Sites[0].ID) == "" {
		t.Error("the reflection facade for the demanded root must never be pruned")
	}
}

// TestPrune_AlwaysThrowPrimitiveSurvives — an unsupported root (symbol) makes
// rj an alwaysThrow entry, which is live, not noop: the composite keeps its
// binding and the module must stay emitted so createJsonDecoder<symbol>()
// throws with the RJ code at factory-creation time instead of silently
// decoding garbage.
func TestPrune_AlwaysThrowPrimitiveSurvives(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoder} from '@mionjs/ts-go-run-types';
export const dec = createJsonDecoder<symbol>();
`)
	if !hasFamilyEntry(resp, "restoreFromJson") {
		t.Error("the alwaysThrow rj entry must survive the prune — it is live, not noop")
	}
	if all := allEntrySources(resp); !strings.Contains(all, "rjFn") {
		t.Error("the jdST composite must keep its rjFn binding to the alwaysThrow entry")
	}
}

// TestPrune_MixedSitesDoNotCrossContaminate — two decoder sites in one file,
// one over a plain DTO (rj noop → elided) and one over a Date-bearing DTO
// (rj live): exactly the live rj survives, keyed to the Date-bearing type,
// proving liveness is per-entry rather than per-family.
func TestPrune_MixedSitesDoNotCrossContaminate(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoder} from '@mionjs/ts-go-run-types';
type PlainDTO = {a: string; b?: number};
type Stamped = {a: string; at: Date};
export const decPlain = createJsonDecoder<PlainDTO>();
export const decStamped = createJsonDecoder<Stamped>();
`)
	keys := familyEntryKeys(resp, "restoreFromJson")
	if len(keys) != 1 {
		t.Fatalf("expected exactly the Date-bearing rj entry to survive, got %v", keys)
	}
	var stampedID string
	for _, runType := range resp.RunTypes {
		if runType != nil && runType.TypeName == "Stamped" {
			stampedID = runType.ID
		}
	}
	if stampedID == "" {
		t.Fatal("Stamped runtype missing from the response")
	}
	if want := operations.PlainHash("restoreFromJson") + "_" + stampedID; keys[0] != want {
		t.Errorf("surviving rj key %q must belong to the Date-bearing type (%q)", keys[0], want)
	}
}
