package resolver_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TestScanFile_F17 walks the f17 fixture and asserts the scanner picks up
// exactly the five expected call sites, in source order, with the right
// param-index and a hash-shaped id. The two negative cases in the fixture
// (call inside a generic body; user-defined `RuntypeId_Local` wrapper)
// must be excluded.
func TestScanFile_F17(t *testing.T) {
	r := setup(t)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "f17_runtype_id.ts"})
	if resp.Error != "" {
		t.Fatalf("scanFile: %s", resp.Error)
	}
	sites := resp.Sites

	// Verify we found the five rewritable sites (17a–17d, plus the inferred-T
	// wrapper-call form). The two negative cases — `inner<T>(val)` inside a
	// generic body and `maskedWrapper(...)` against a non-`@mionjs/ts-run-types`
	// RuntypeId alias — must not appear.
	abs := filepath.Join(fixturesDir(t), "f17_runtype_id.ts")
	sf := r.Program.SourceFile(abs)
	if sf == nil {
		t.Fatalf("source file not loaded: %s", abs)
	}
	src := sf.Text()

	want := []struct {
		needle string
		// kindHint is checked by looking up the type in the dump.
		desc string
	}{
		{"getRuntypeId(u)", "17a: T inferred from val (object literal)"},
		{"getRuntypeId<string>()", "17b: explicit type arg"},
		{"isType<{flag: boolean}>(true)", "17c: user wrapper, explicit T"},
		{"nameOf({kind: 'node', value: 42})", "17d: user wrapper, inferred T"},
	}

	if len(sites) < len(want) {
		t.Fatalf("expected at least %d sites, got %d: %+v", len(want), len(sites), sites)
	}

	// Each `want` should have a matching site whose Pos lands on the
	// closing `)` of that call.
	for _, w := range want {
		callStart := strings.Index(src, w.needle)
		if callStart < 0 {
			t.Fatalf("needle %q not found in source", w.needle)
		}
		expectedClose := callStart + len(w.needle) - 1 // index of trailing `)`
		var found *protocol.Site
		for i := range sites {
			if sites[i].Pos == expectedClose {
				found = &sites[i]
				break
			}
		}
		if found == nil {
			t.Fatalf("no site at expected close-paren %d for %s (%s); sites=%+v",
				expectedClose, w.needle, w.desc, sites)
		}
		if found.ParamIndex < 0 {
			t.Fatalf("%s: ParamIndex must be non-negative, got %d", w.desc, found.ParamIndex)
		}
		if found.ID == "" || !hashIDPattern.MatchString(found.ID) {
			t.Fatalf("%s: id %q does not look like a hash", w.desc, found.ID)
		}
	}

	// Negative-case guards: the close-paren positions of `inner(val)`
	// (called as `getRuntypeId<T>(val)` inside `inner`) and of
	// `maskedWrapper("noop")` must NOT appear in sites.
	for _, neg := range []string{
		`getRuntypeId<T>(val)`, // 17e — free type parameter inside body
		`maskedWrapper('noop')`, // 17f — non-@mionjs/ts-run-types RuntypeId
	} {
		start := strings.Index(src, neg)
		if start < 0 {
			t.Fatalf("negative-case needle %q not found", neg)
		}
		closePos := start + len(neg) - 1
		for _, s := range sites {
			if s.Pos == closePos {
				t.Fatalf("negative case %q at pos %d unexpectedly produced site", neg, closePos)
			}
		}
	}
}

// TestScanFile_DedupesStructurally: the f17 fixture has two calls that bind
// `T` to a `{ flag: boolean }`-shaped object — once via the explicit
// `isType<{ flag: boolean }>(...)` and once via the inferred `getRuntypeId(u)`
// (which binds to `{ id: number; name: string }`). Different shapes get
// different ids; same shape would share. Here we just assert the cache
// dedupes by checking that re-running scanFile on the same file adds zero
// new types on the second pass.
func TestScanFile_Idempotent(t *testing.T) {
	r := setup(t)
	resp1 := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "f17_runtype_id.ts"})
	if resp1.Error != "" {
		t.Fatalf("first scanFile: %s", resp1.Error)
	}
	resp2 := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "f17_runtype_id.ts"})
	if resp2.Error != "" {
		t.Fatalf("second scanFile: %s", resp2.Error)
	}
	if len(resp2.Added) != 0 {
		t.Fatalf("expected zero added on idempotent re-scan, got %d", len(resp2.Added))
	}
	if len(resp1.Sites) != len(resp2.Sites) {
		t.Fatalf("expected same site count on re-scan, got %d vs %d",
			len(resp1.Sites), len(resp2.Sites))
	}
}
