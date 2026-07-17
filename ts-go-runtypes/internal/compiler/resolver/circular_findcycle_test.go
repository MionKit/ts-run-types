package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Coverage for the circular-walker-on-demand wiring: wireCircularRunTypeDeps
// appends the built-in `rt::findCycle` pure fn to the SoftDeps of exactly the
// guarded fn entries whose type can cycle (demand by TYPE SHAPE — no emitted body
// references the walker), and serveBuiltinPureFns delivers it from the table. The
// soundness contract mirrors the noop-predicate corpus test: gate true (a guarded
// cyclable entry) ⇒ walker wired ⇒ walker present.

const findCycleSpecifier = "virtual:rt/pf/rt/findCycle.js"

func scanModules(t *testing.T, code string) *protocol.Response {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", resp.Diagnostics)
	}
	return &resp
}

func findCycleServed(resp *protocol.Response) bool {
	_, ok := resp.EntryModules["pf/rt/findCycle"]
	return ok
}

func findCycleImporters(resp *protocol.Response) int {
	n := 0
	for _, mod := range resp.EntryModules {
		if strings.Contains(mod, findCycleSpecifier) {
			n++
		}
	}
	return n
}

// TestFindCycle_WiredForCyclableGuardedEntries — a self-referential type with two
// guarded factories (validate, getValidationErrors) pulls the walker in, imported
// by both entries, and served from the built-in table.
func TestFindCycle_WiredForCyclableGuardedEntries(t *testing.T) {
	resp := scanModules(t, `import {createValidate, createGetValidationErrors} from '@ts-runtypes/core';
type Node = {v: number; next?: Node};
export const v = createValidate<Node>();
export const e = createGetValidationErrors<Node>();
`)
	if !findCycleServed(resp) {
		t.Fatalf("rt::findCycle not served for a cyclable guarded type\nmodules: %v", keys(resp.EntryModules))
	}
	if got := findCycleImporters(resp); got < 2 {
		t.Errorf("expected both guarded entries (val, verr) to import rt::findCycle, got %d importer(s)", got)
	}
}

// TestFindCycle_NotWiredForAcyclicType — the demand-driven property: a type that
// cannot cycle pulls in no walker at all.
func TestFindCycle_NotWiredForAcyclicType(t *testing.T) {
	resp := scanModules(t, `import {createValidate, createGetValidationErrors} from '@ts-runtypes/core';
type Flat = {a: string; b: number};
export const v = createValidate<Flat>();
export const e = createGetValidationErrors<Flat>();
`)
	if findCycleServed(resp) {
		t.Error("rt::findCycle served for an acyclic type — demand leaked")
	}
	if got := findCycleImporters(resp); got != 0 {
		t.Errorf("acyclic type must import no walker, got %d importer(s)", got)
	}
}

// TestFindCycle_NotWiredForUnguardedFamily — a decoder (createJsonDecoder) is not
// a guarded family (its input is serialized data that cannot cycle), so even over
// a cyclable type it pulls in no walker.
func TestFindCycle_NotWiredForUnguardedFamily(t *testing.T) {
	resp := scanModules(t, `import {createJsonDecoder} from '@ts-runtypes/core';
type Node = {v: number; next?: Node};
export const d = createJsonDecoder<Node>();
`)
	if findCycleServed(resp) {
		t.Error("rt::findCycle served for a decoder-only file — only guarded families should wire it")
	}
}

// TestFindCycle_EncoderIsGuarded — createBinaryEncoder ('tb') is a guarded family,
// so a cyclable type wires the walker onto its entry.
func TestFindCycle_EncoderIsGuarded(t *testing.T) {
	resp := scanModules(t, `import {createBinaryEncoder} from '@ts-runtypes/core';
type Node = {v: number; next?: Node};
export const enc = createBinaryEncoder<Node>();
`)
	if !findCycleServed(resp) {
		t.Fatalf("rt::findCycle not served for a cyclable createBinaryEncoder\nmodules: %v", keys(resp.EntryModules))
	}
	if got := findCycleImporters(resp); got == 0 {
		t.Error("the tb entry over a cyclable type must import rt::findCycle")
	}
}
