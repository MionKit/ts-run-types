package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TestPerFileScope_Accumulates verifies that scanFile responses scoped to
// "files scanned since the last reset/setSources" grow as additional files
// are scanned. The first call sees only file A's types; the second sees
// both A and B. Sites remain per-file (rewriter contract).
func TestPerFileScope_Accumulates(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})

	respA := r.Dispatch(protocol.Request{
		Op:                 protocol.OpScanFile,
		File:               "a.ts",
		IncludeRunTypes:    true,
		IncludeCacheSource: true,
	})
	if respA.Error != "" {
		t.Fatalf("scanFile a.ts: %s", respA.Error)
	}
	if len(respA.Sites) != 1 {
		t.Fatalf("scanFile a.ts: expected 1 site, got %d", len(respA.Sites))
	}
	idA := respA.Sites[0].ID
	if !containsID(respA.RunTypes, idA) {
		t.Fatalf("scanFile a.ts: runTypes union missing primary id %q", idA)
	}
	if respA.CacheSource == "" {
		t.Fatalf("scanFile a.ts: expected non-empty cacheSource")
	}
	if !strings.Contains(respA.CacheSource, "export const __runtypes = new Map([") {
		t.Fatalf("scanFile a.ts: cacheSource does not contain expected JS preamble:\n%s", respA.CacheSource)
	}

	respB := r.Dispatch(protocol.Request{
		Op:                 protocol.OpScanFile,
		File:               "b.ts",
		IncludeRunTypes:    true,
		IncludeCacheSource: true,
	})
	if respB.Error != "" {
		t.Fatalf("scanFile b.ts: %s", respB.Error)
	}
	if len(respB.Sites) != 1 {
		t.Fatalf("scanFile b.ts: expected 1 site, got %d", len(respB.Sites))
	}
	idB := respB.Sites[0].ID
	// Union semantics: the second response must include BOTH files' ids,
	// because the response is scoped to every file scanned in this session.
	if !containsID(respB.RunTypes, idA) {
		t.Fatalf("scanFile b.ts: union runTypes missing a.ts's id %q", idA)
	}
	if !containsID(respB.RunTypes, idB) {
		t.Fatalf("scanFile b.ts: union runTypes missing b.ts's id %q", idB)
	}
	// resp.Sites stays per-file: it's what the rewriter consumes to know
	// where to inject ids in THIS file's source. Sharing two files' sites
	// in one response would break that contract.
	for _, site := range respB.Sites {
		if site.File != "b.ts" {
			t.Fatalf("scanFile b.ts: site for unexpected file %q", site.File)
		}
	}
}

// TestPerFileScope_CrossFileDedup: two files referencing the same shape
// produce the same wire id, and the union slice contains it exactly once.
func TestPerFileScope_CrossFileDedup(t *testing.T) {
	const src = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	r := setupInline(t, map[string]string{"a.ts": src, "b.ts": src})

	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "a.ts"})
	if respA.Error != "" {
		t.Fatalf("scanFile a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFile,
		File:            "b.ts",
		IncludeRunTypes: true,
	})
	if respB.Error != "" {
		t.Fatalf("scanFile b.ts: %s", respB.Error)
	}
	if respA.Sites[0].ID != respB.Sites[0].ID {
		t.Fatalf("expected shared id across files, got %q vs %q",
			respA.Sites[0].ID, respB.Sites[0].ID)
	}
	stringCount := 0
	for _, runType := range respB.RunTypes {
		if runType != nil && runType.Kind == protocol.KindString {
			stringCount++
		}
	}
	if stringCount != 1 {
		t.Fatalf("expected exactly one KindString entry across union, got %d", stringCount)
	}
}

// TestPerFileScope_ResetWipesAssociation: after reset the per-file map is
// empty, so a subsequent scanFile on a fresh setSources sees only the new
// file's types — none of the previous session's ids leak through the union.
func TestPerFileScope_ResetWipesAssociation(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "a.ts"})
	if respA.Error != "" {
		t.Fatalf("scanFile a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "b.ts"})
	if respB.Error != "" {
		t.Fatalf("scanFile b.ts: %s", respB.Error)
	}
	idA := respA.Sites[0].ID
	idB := respB.Sites[0].ID

	r.Reset()
	// setSources rebuilds the Program; the inline helper used a fresh tmpdir,
	// so we replay setSources with only a.ts (b.ts no longer relevant) via
	// the resolver's dispatch path (mirrors the FE flow).
	respSet := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: map[string]string{"runtypes.d.ts": runtypesDTS, "a.ts": aSrc},
	})
	if respSet.Error != "" {
		t.Fatalf("setSources after reset: %s", respSet.Error)
	}

	respAfter := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFile,
		File:            "a.ts",
		IncludeRunTypes: true,
	})
	if respAfter.Error != "" {
		t.Fatalf("scanFile a.ts after reset: %s", respAfter.Error)
	}
	// Reset must have wiped both per-file entries; the union should NOT
	// include any id that was unique to b.ts (idB) from the previous
	// session. Note: idA may still be present because a.ts was re-scanned.
	if containsID(respAfter.RunTypes, idB) {
		t.Fatalf("scanFile after reset leaked b.ts's id %q into union", idB)
	}
	if !containsID(respAfter.RunTypes, idA) {
		t.Fatalf("scanFile after reset missing the just-scanned a.ts id %q", idA)
	}
}

// TestPerFileScope_SetSourcesWipesAssociation: same as reset, but the
// boundary is a setSources call (which also rebuilds the Program and so
// must drop the per-file scope).
func TestPerFileScope_SetSourcesWipesAssociation(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "a.ts"})
	if respA.Error != "" {
		t.Fatalf("scanFile a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "b.ts"})
	if respB.Error != "" {
		t.Fatalf("scanFile b.ts: %s", respB.Error)
	}
	idB := respB.Sites[0].ID

	// Hot-swap to a Program containing only a.ts. The setSources path
	// rebuilds the Program AND clears the per-file scope, so the next
	// scanFile starts from "no files visited yet".
	respSet := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: map[string]string{"runtypes.d.ts": runtypesDTS, "a.ts": aSrc},
	})
	if respSet.Error != "" {
		t.Fatalf("setSources: %s", respSet.Error)
	}

	respAfter := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFile,
		File:            "a.ts",
		IncludeRunTypes: true,
	})
	if respAfter.Error != "" {
		t.Fatalf("scanFile a.ts after setSources: %s", respAfter.Error)
	}
	if containsID(respAfter.RunTypes, idB) {
		t.Fatalf("scanFile after setSources leaked b.ts's id %q into union", idB)
	}
}

// TestDump_AlwaysIncludesCacheSource asserts the dump op always populates
// CacheSource — the plugin's load() relies on it as the rendered virtual
// module body, with no fallback path.
func TestDump_AlwaysIncludesCacheSource(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	r := setupInline(t, map[string]string{"test.ts": code})
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "test.ts"}); resp.Error != "" {
		t.Fatalf("scanFile: %s", resp.Error)
	}
	dumpResp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dumpResp.Error != "" {
		t.Fatalf("dump: %s", dumpResp.Error)
	}
	if dumpResp.CacheSource == "" {
		t.Fatalf("dump: expected populated cacheSource")
	}
	if !strings.Contains(dumpResp.CacheSource, "export const __runtypes") {
		t.Fatalf("dump cacheSource missing __runtypes export:\n%s", dumpResp.CacheSource)
	}
}

func containsID(runTypes []*protocol.RunType, id string) bool {
	for _, runType := range runTypes {
		if runType != nil && runType.ID == id {
			return true
		}
	}
	return false
}
