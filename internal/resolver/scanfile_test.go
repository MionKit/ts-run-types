package resolver_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// scanFixture is the shared driver behind the F17 / F17b regression tests.
// It dispatches a scanFiles op against `fixture` and asserts that every
// `want` needle produces a site whose Pos lands on the trailing `)` of
// the matching call, with a non-negative ParamIndex and a hash-shaped id.
// Each `neg` needle must NOT produce a site.
func scanFixture(
	t *testing.T,
	fixture string,
	want []struct{ needle, desc string },
	neg []string,
) {
	t.Helper()
	r := setup(t)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{fixture}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	sites := resp.Sites

	abs := filepath.Join(fixturesDir(t), fixture)
	sf := r.Program.SourceFile(abs)
	if sf == nil {
		t.Fatalf("source file not loaded: %s", abs)
	}
	src := sf.Text()

	if len(sites) < len(want) {
		t.Fatalf("expected at least %d sites, got %d: %+v", len(want), len(sites), sites)
	}

	for _, w := range want {
		callStart := strings.Index(src, w.needle)
		if callStart < 0 {
			t.Fatalf("needle %q not found in source", w.needle)
		}
		expectedClose := callStart + len(w.needle) - 1
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

	for _, n := range neg {
		start := strings.Index(src, n)
		if start < 0 {
			t.Fatalf("negative-case needle %q not found", n)
		}
		closePos := start + len(n) - 1
		for _, s := range sites {
			if s.Pos == closePos {
				t.Fatalf("negative case %q at pos %d unexpectedly produced site", n, closePos)
			}
		}
	}
}

// TestScanFile_F17_StaticGetRuntypeId walks the f17 fixture (static form
// only) and asserts the scanner picks up exactly the four expected call
// sites in source order, with the right param-index and a hash-shaped id.
// The two negative cases (call inside a generic body; user-defined
// `RuntypeId_Local` wrapper) must be excluded.
//
// This is the main suite's one file-based regression for the tsconfig +
// on-disk osvfs path. Every other resolver test uses resolveInline.
func TestScanFile_F17_StaticGetRuntypeId(t *testing.T) {
	scanFixture(t,
		"f17_runtype_id.ts",
		[]struct{ needle, desc string }{
			{"getRuntypeId<{id: number; name: string}>()", "17a: static, explicit object type"},
			{"getRuntypeId<string>()", "17b: static, primitive type"},
			{"isType<{flag: boolean}>(true)", "17c: user wrapper, explicit T"},
			{"nameOf({kind: 'node', value: 42})", "17d: user wrapper, inferred T"},
		},
		[]string{
			"getRuntypeId<T>()",      // 17e — free type parameter inside body
			"maskedWrapper('noop')", // 17f — non-@mionjs/ts-go-run-types RuntypeId
		},
	)
}

// TestScanFile_F17b_ReflectRuntypeId is the reflection-form sibling of
// the F17 test. Same expectations: four positive sites against the
// reflectRuntypeId fixture; the free-T body call and the foreign-alias
// wrapper must be skipped.
func TestScanFile_F17b_ReflectRuntypeId(t *testing.T) {
	scanFixture(t,
		"f17b_reflect_runtype_id.ts",
		[]struct{ needle, desc string }{
			{"reflectRuntypeId(u)", "17ba: reflect, T inferred from object literal"},
			{"reflectRuntypeId(s)", "17bb: reflect, T inferred from primitive"},
			{"isType<{flag: boolean}>(true)", "17bc: user wrapper, explicit T"},
			{"nameOf({kind: 'node', value: 42})", "17bd: user wrapper, inferred T"},
		},
		[]string{
			"reflectRuntypeId<T>(val)", // 17be — free type parameter inside body
			"maskedWrapper('noop')",    // 17bf — non-@mionjs/ts-go-run-types RuntypeId
		},
	)
}

// TestScanFile_F18_ExplicitId_Static asserts the scanner skips calls whose
// trailing `RuntypeId<T>` slot is already filled by an explicit caller-
// supplied argument in the static form.
func TestScanFile_F18_ExplicitId_Static(t *testing.T) {
	const code = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

// 18a — caller passes an explicit string literal at the id slot. The
// scanner must NOT emit a site here — rewriting would append a stray
// extra argument past the id slot.
getRuntypeId<{id: number; name: string}>('manualHash');

// 18b — caller passes an explicit literal at the id slot for a primitive.
getRuntypeId<string>('manualHash');

// 18c — user-defined wrapper, caller already supplies the id.
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
isType<{flag: boolean}>(true, 'manualHash');
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 0 {
		t.Fatalf("expected 0 sites (id slot already filled), got %d: %+v",
			len(resp.Sites), resp.Sites)
	}
}

// TestScanFile_F18_ExplicitId_Reflect is the reflection-form sibling.
func TestScanFile_F18_ExplicitId_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

// 18ba — direct reflect call with an explicit literal in the id slot.
const u = {id: 1, name: 'm'} as {id: number; name: string};
reflectRuntypeId(u, 'manualHash');

// 18bb — reflect on a primitive with explicit literal.
const s: string = 'hello';
reflectRuntypeId(s, 'manualHash');

// 18bc — user-defined wrapper, caller already supplies the id.
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
isType<{flag: boolean}>(true, 'manualHash');
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 0 {
		t.Fatalf("expected 0 sites (id slot already filled), got %d: %+v",
			len(resp.Sites), resp.Sites)
	}
}

// TestScanFile_Idempotent_Static: re-running scanFiles on a static-form
// source must add zero new types and report the same site count.
func TestScanFile_Idempotent_Static(t *testing.T) {
	const code = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

getRuntypeId<{id: number; name: string}>();

getRuntypeId<string>();

function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
isType<{flag: boolean}>(true);
`
	assertIdempotent(t, code)
}

// TestScanFile_Idempotent_Reflect is the reflection-form sibling.
func TestScanFile_Idempotent_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

const u = {id: 1, name: 'm'} as {id: number; name: string};
reflectRuntypeId(u);

const s: string = 'hello';
reflectRuntypeId(s);

function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
isType<{flag: boolean}>(true);
`
	assertIdempotent(t, code)
}

func assertIdempotent(t *testing.T, code string) {
	t.Helper()
	r := setupInline(t, map[string]string{"test.ts": code})
	resp1 := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp1.Error != "" {
		t.Fatalf("first scanFiles: %s", resp1.Error)
	}
	resp2 := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp2.Error != "" {
		t.Fatalf("second scanFiles: %s", resp2.Error)
	}
	if len(resp2.Added) != 0 {
		t.Fatalf("expected zero added on idempotent re-scan, got %d", len(resp2.Added))
	}
	if len(resp1.Sites) != len(resp2.Sites) {
		t.Fatalf("expected same site count on re-scan, got %d vs %d",
			len(resp1.Sites), len(resp2.Sites))
	}
}
