package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TestPerRequestScope_FilesOnly verifies that scanFiles responses are
// scoped to the request's Files slice, NOT to every file scanned in the
// session. scanFiles([a]) → only a's ids; scanFiles([b]) → only b's ids;
// scanFiles([a, b]) → union of both. The cache holds entries for every
// scanned file (dump exposes the whole thing), but the request's
// runTypes/cacheSource projection only sees the listed files.
func TestPerRequestScope_FilesOnly(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})

	respA := r.Dispatch(protocol.Request{
		Op:                 protocol.OpScanFiles,
		Files:              []string{"a.ts"},
		IncludeRunTypes:    true,
		IncludeCacheSource: true,
	})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	idA := respA.Sites[0].ID

	// scanFiles([b]) — the projection should NOT include a's ids, even though
	// a was scanned just above and the cache still holds those entries.
	respB := r.Dispatch(protocol.Request{
		Op:                 protocol.OpScanFiles,
		Files:              []string{"b.ts"},
		IncludeRunTypes:    true,
		IncludeCacheSource: true,
	})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idB := respB.Sites[0].ID
	if containsID(respB.RunTypes, idA) {
		t.Fatalf("scanFiles([b.ts]) leaked a.ts's id %q into the response — projection must be request-scoped", idA)
	}
	if !containsID(respB.RunTypes, idB) {
		t.Fatalf("scanFiles([b.ts]) missing its own id %q", idB)
	}
	// cacheSource scoping mirrors runTypes scoping.
	if strings.Contains(respB.CacheSource, idA) {
		t.Fatalf("scanFiles([b.ts]) cacheSource mentions a.ts's id %q; projection must be request-scoped", idA)
	}

	// scanFiles([a, b]) — single request, both files, both ids present.
	respAB := r.Dispatch(protocol.Request{
		Op:                 protocol.OpScanFiles,
		Files:              []string{"a.ts", "b.ts"},
		IncludeRunTypes:    true,
		IncludeCacheSource: true,
	})
	if respAB.Error != "" {
		t.Fatalf("scanFiles [a, b]: %s", respAB.Error)
	}
	if !containsID(respAB.RunTypes, idA) {
		t.Fatalf("scanFiles([a, b]) missing a.ts's id %q", idA)
	}
	if !containsID(respAB.RunTypes, idB) {
		t.Fatalf("scanFiles([a, b]) missing b.ts's id %q", idB)
	}
	// Sites in the response cover BOTH files (flat, each tagged with .File).
	gotA, gotB := false, false
	for _, site := range respAB.Sites {
		switch site.File {
		case "a.ts":
			gotA = true
		case "b.ts":
			gotB = true
		}
	}
	if !gotA || !gotB {
		t.Fatalf("scanFiles([a, b]) sites must cover both files, got gotA=%v gotB=%v sites=%+v", gotA, gotB, respAB.Sites)
	}
}

// TestPerRequestScope_DedupAcrossRequestedFiles: two files in one request
// referencing the same shape produce a single wire id and the union slice
// contains it exactly once.
func TestPerRequestScope_DedupAcrossRequestedFiles(t *testing.T) {
	const src = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	r := setupInline(t, map[string]string{"a.ts": src, "b.ts": src})

	resp := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts", "b.ts"},
		IncludeRunTypes: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 sites (one per file), got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("expected identical id across files, got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
	stringCount := 0
	for _, runType := range resp.RunTypes {
		if runType != nil && runType.Kind == protocol.KindString {
			stringCount++
		}
	}
	if stringCount != 1 {
		t.Fatalf("expected exactly one KindString entry across union, got %d", stringCount)
	}
}

// TestPerRequestScope_ResetWipesFileRecords: after reset + setSources, a
// scanFiles([a]) projection contains only a's ids — no leak from the
// pre-reset session.
func TestPerRequestScope_ResetWipesFileRecords(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idA := respA.Sites[0].ID
	idB := respB.Sites[0].ID

	r.Reset()
	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: map[string]string{"runtypes.d.ts": runtypesDTS, "a.ts": aSrc},
	}); resp.Error != "" {
		t.Fatalf("setSources after reset: %s", resp.Error)
	}

	respAfter := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts"},
		IncludeRunTypes: true,
	})
	if respAfter.Error != "" {
		t.Fatalf("scanFiles a.ts after reset: %s", respAfter.Error)
	}
	if containsID(respAfter.RunTypes, idB) {
		t.Fatalf("scanFiles after reset leaked b.ts's id %q from prior session", idB)
	}
	if !containsID(respAfter.RunTypes, idA) {
		t.Fatalf("scanFiles after reset missing the just-scanned a.ts id %q", idA)
	}
}

// TestPerRequestScope_SetSourcesWipesFileRecords: same boundary, via
// setSources rather than reset. setSources rebuilds the Program and so
// must drop the per-file record map.
func TestPerRequestScope_SetSourcesWipesFileRecords(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}}); resp.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", resp.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idB := respB.Sites[0].ID

	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: map[string]string{"runtypes.d.ts": runtypesDTS, "a.ts": aSrc},
	}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}

	respAfter := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts"},
		IncludeRunTypes: true,
	})
	if respAfter.Error != "" {
		t.Fatalf("scanFiles a.ts after setSources: %s", respAfter.Error)
	}
	if containsID(respAfter.RunTypes, idB) {
		t.Fatalf("scanFiles after setSources leaked b.ts's id %q from prior session", idB)
	}
}

// TestDump_FullCacheRegardlessOfPriorScans guards against the per-request
// scoping change accidentally narrowing dump's payload. dump must return
// the full in-memory cache (every type that's been projected, every site
// that's been recorded), regardless of which subset of files the latest
// scanFiles call asked about.
func TestDump_FullCacheRegardlessOfPriorScans(t *testing.T) {
	const aSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const bSrc = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idA := respA.Sites[0].ID
	idB := respB.Sites[0].ID

	dumpResp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dumpResp.Error != "" {
		t.Fatalf("dump: %s", dumpResp.Error)
	}
	if !containsID(dumpResp.RunTypes, idA) {
		t.Fatalf("dump missing a.ts's id %q (expected full in-memory cache)", idA)
	}
	if !containsID(dumpResp.RunTypes, idB) {
		t.Fatalf("dump missing b.ts's id %q (expected full in-memory cache)", idB)
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
