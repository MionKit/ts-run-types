package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// The per-call `{rejectCircularRefs}` override is a runtime-only flag — it must NOT
// fold into the injected fnHash, so a circular-checking validator and a plain
// one for the same type share a single compiled entry. `noLiterals` (a real
// ValidateOptions variant) DOES fork the hash; rejectCircularRefs rides alongside it
// without changing it.
func TestRejectCircularRefsExcludedFromFnHash(t *testing.T) {
	const src = `import {createValidate} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
createValidate<Node>();
createValidate<Node>(undefined, {rejectCircularRefs: true});
createValidate<Node>(undefined, {noLiterals: true});
createValidate<Node>(undefined, {noLiterals: true, rejectCircularRefs: true});
`
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}

	fnIDAt := func(needle string) string {
		idx := strings.Index(src, needle)
		if idx < 0 {
			t.Fatalf("needle %q not found", needle)
		}
		closeParen := idx + len(needle) - 1
		for _, site := range resp.Sites {
			if site.Pos == closeParen {
				return site.FnId
			}
		}
		t.Fatalf("no site at close-paren %d for %q; sites=%+v", closeParen, needle, resp.Sites)
		return ""
	}

	plain := fnIDAt("createValidate<Node>()")
	circular := fnIDAt("createValidate<Node>(undefined, {rejectCircularRefs: true})")
	noLiterals := fnIDAt("createValidate<Node>(undefined, {noLiterals: true})")
	noLiteralsCircular := fnIDAt("createValidate<Node>(undefined, {noLiterals: true, rejectCircularRefs: true})")

	if plain == "" || noLiterals == "" {
		t.Fatalf("expected non-empty fnIds, got plain=%q noLiterals=%q", plain, noLiterals)
	}
	if plain != circular {
		t.Fatalf("rejectCircularRefs forked the fnHash: plain=%q rejectCircularRefs=%q", plain, circular)
	}
	if noLiterals != noLiteralsCircular {
		t.Fatalf("rejectCircularRefs forked the noLiterals fnHash: %q vs %q", noLiterals, noLiteralsCircular)
	}
	if plain == noLiterals {
		t.Fatalf("sanity: noLiterals should change the fnHash but matched plain (%q)", plain)
	}
}
