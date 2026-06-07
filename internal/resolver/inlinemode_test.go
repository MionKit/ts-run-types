package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// inlinemode_test.go covers the --inline-mode allInternal policy end to end:
// unnamed compounds inline into their parents (no per-child cache entry, the
// loop hoists to a context fn), named compounds keep the external
// dependency-call path, and cross-family `val_<member>` edges keep rendering
// the member entries an inlined union's discriminators need.

// setupInlineModeAllInternal is setupInline with InlineMode allInternal.
func setupInlineModeAllInternal(t testing.TB, sources map[string]string) *resolver.Resolver {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.InlineMode = constants.InlineModeAllInternal
	})
}

// pairedArraySource exercises both marker forms (static + reflection) per
// the marker test coverage rule, over a parent embedding an UNNAMED array.
const pairedArraySource = `import {createValidate, getRunTypeId, reflectRunTypeId} from '@mionjs/ts-go-run-types';
type Parent = {tags: string[]};
export const isParent = createValidate<Parent>();
export const staticId = getRunTypeId<Parent>();
const p = {tags: ['a']} as Parent;
export const reflectedId = reflectRunTypeId(p);
`

// valEntryKeys returns the entryModules keys belonging to the validate
// family (prefix `<plainValidateHash>_`).
func valEntryKeys(resp protocol.Response) []string {
	prefix := operations.PlainHash("validate") + "_"
	var keys []string
	for name := range resp.EntryModules {
		if strings.HasPrefix(name, prefix) {
			keys = append(keys, name)
		}
	}
	return keys
}

func TestInlineMode_AllInternal_UnnamedArrayDropsChildEntry(t *testing.T) {
	// Default mode: parent + the demanded string[] child = 2 val entries.
	defaultResolver := setupInline(t, map[string]string{"a.ts": pairedArraySource})
	defaultResp := scanWithModules(t, defaultResolver, []string{"a.ts"})
	defaultKeys := valEntryKeys(defaultResp)
	if len(defaultKeys) < 2 {
		t.Fatalf("default mode should emit parent + external array entries, got %v", defaultKeys)
	}

	// allInternal: the unnamed array inlines — exactly ONE val entry (the
	// parent), whose body hoists the element loop into a context fn.
	r := setupInlineModeAllInternal(t, map[string]string{"a.ts": pairedArraySource})
	resp := scanWithModules(t, r, []string{"a.ts"})
	keys := valEntryKeys(resp)
	if len(keys) != 1 {
		t.Fatalf("allInternal should emit ONE val entry (the parent), got %v", keys)
	}
	parent := resp.EntryModules[keys[0]]
	if !strings.Contains(parent, "ctxFn0(") {
		t.Errorf("parent body should hoist the array loop to a context fn:\n%s", parent)
	}
	if strings.Contains(parent, ".fn(v.tags)") {
		t.Errorf("parent must not emit an external dep call for the unnamed array:\n%s", parent)
	}
}

func TestInlineMode_AllInternal_NamedArrayStaysExternal(t *testing.T) {
	source := `import {createValidate, getRunTypeId, reflectRunTypeId} from '@mionjs/ts-go-run-types';
type Tags = string[];
type Parent = {tags: Tags};
export const isParent = createValidate<Parent>();
export const staticId = getRunTypeId<Parent>();
const p = {tags: ['a']} as Parent;
export const reflectedId = reflectRunTypeId(p);
`
	r := setupInlineModeAllInternal(t, map[string]string{"a.ts": source})
	resp := scanWithModules(t, r, []string{"a.ts"})
	keys := valEntryKeys(resp)
	if len(keys) != 2 {
		t.Fatalf("named alias array must stay a separate external entry (parent + Tags), got %v", keys)
	}
	combined := strings.Join(moduleSources(resp), "\n")
	if !strings.Contains(combined, ".fn(v.tags)") {
		t.Errorf("parent should call the named array through the external dep path:\n%s", combined)
	}
}

// The highest-severity allInternal risk: an inlined unnamed UNION still
// discriminates members via cross-family `val_<member>` lookups at runtime.
// Those edges must keep riding SoftDeps so resolveCrossFamilyEdges renders
// the member validate entries even though no site demands them directly.
func TestInlineMode_AllInternal_InlinedUnionKeepsCrossFamilyValMembers(t *testing.T) {
	source := `import {createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const enc = createBinaryEncoder<{u: {a: bigint} | {a: Date}}>();
`
	r := setupInlineModeAllInternal(t, map[string]string{"a.ts": source})
	resp := scanWithModules(t, r, []string{"a.ts"})
	valKeys := valEntryKeys(resp)
	if len(valKeys) < 2 {
		t.Fatalf("inlined union's member val_ entries must render via the cross-family fixpoint, got %v (modules: %v)", valKeys, moduleNames(resp))
	}
	// The tb parent's body must resolve those members through getRT —
	// the cross-family guard survives inlining.
	var tbParent string
	tbPrefix := operations.PlainHash("toBinary") + "_"
	for name, source := range resp.EntryModules {
		if strings.HasPrefix(name, tbPrefix) {
			tbParent = source
			break
		}
	}
	if tbParent == "" {
		t.Fatalf("missing toBinary parent entry; modules: %v", moduleNames(resp))
	}
	// The body rides inside a single-quoted JS string, so the getRT quotes
	// are escaped (`getRT(\'CiE_x\')`) in the module source.
	sawMemberLookup := false
	for _, key := range valKeys {
		if strings.Contains(tbParent, `utl.getRT(\'`+key+`\')`) {
			sawMemberLookup = true
			break
		}
	}
	if !sawMemberLookup {
		t.Errorf("tb parent should resolve val_<member> via getRT for union discrimination:\n%s", tbParent)
	}
}

func moduleSources(resp protocol.Response) []string {
	sources := make([]string, 0, len(resp.EntryModules))
	for _, source := range resp.EntryModules {
		sources = append(sources, source)
	}
	return sources
}
