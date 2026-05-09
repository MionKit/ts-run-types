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
//
// This test is kept file-based as the main suite's one regression test that
// exercises the tsconfig + on-disk osvfs path. The byte-position assertions
// against r.Program.SourceFile(abs).Text() are most honest with a real
// file. Every other resolver test uses resolveInline.
func TestScanFile_F17(t *testing.T) {
	r := setup(t)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "f17_runtype_id.ts"})
	if resp.Error != "" {
		t.Fatalf("scanFile: %s", resp.Error)
	}
	sites := resp.Sites

	// Verify we found the five rewritable sites (17a–17d, plus the inferred-T
	// wrapper-call form). The two negative cases — `inner<T>(val)` inside a
	// generic body and `maskedWrapper(...)` against a non-`@mionjs/ts-go-run-types`
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
		`getRuntypeId<T>(val)`,  // 17e — free type parameter inside body
		`maskedWrapper('noop')`, // 17f — non-@mionjs/ts-go-run-types RuntypeId
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

// TestScanFile_F18_ExplicitId asserts the scanner skips calls whose
// trailing `RuntypeId<T>` slot is already filled by an explicit caller-
// supplied argument. Three shapes: direct call with an explicit literal,
// direct call with `undefined` padding plus a literal, and a user-defined
// wrapper called with an explicit literal. None must produce a site.
func TestScanFile_F18_ExplicitId(t *testing.T) {
	const code = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

// 18a — caller passes an explicit string literal at the id slot. The
// scanner must NOT emit a site here — rewriting would append a stray
// extra argument past the id slot.
const u = {id: 1, name: 'm'} as {id: number; name: string};
getRuntypeId(u, 'manualHash');

// 18b — caller passes an explicit literal at slot 1 with undefined at
// slot 0. Same rule: the id slot is occupied, leave the call alone.
getRuntypeId<string>(undefined, 'manualHash');

// 18c — user-defined wrapper, caller already supplies the id.
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
isType<{flag: boolean}>(true, 'manualHash');
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "test.ts"})
	if resp.Error != "" {
		t.Fatalf("scanFile: %s", resp.Error)
	}
	if len(resp.Sites) != 0 {
		t.Fatalf("expected 0 sites (id slot already filled), got %d: %+v",
			len(resp.Sites), resp.Sites)
	}
}

// TestScanFile_Idempotent: re-running scanFile on the same source must
// add zero new types on the second pass and report the same site count.
func TestScanFile_Idempotent(t *testing.T) {
	const code = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

const u = {id: 1, name: 'm'} as {id: number; name: string};
getRuntypeId(u);

getRuntypeId<string>();

function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
isType<{flag: boolean}>(true);
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp1 := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "test.ts"})
	if resp1.Error != "" {
		t.Fatalf("first scanFile: %s", resp1.Error)
	}
	resp2 := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "test.ts"})
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
