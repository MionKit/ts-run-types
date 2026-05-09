package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// ---- OpResolveID -------------------------------------------------------------
//
// Round-trip through OpResolveID on an inline array snippet: the site id
// resolves to a KindArray whose Type slot is a KindRef sentinel; resolving
// that ref in turn yields the KindString leaf. Asserts the op's contract —
// child slots stay as refs so payloads stay bounded — and that NodeByID
// returns nil for unknown ids.

const resolveIDArrayCode = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const xs: string[] = ['a', 'b'];
getRuntypeId(xs);
`

func TestResolveID_ArrayRoundTrip(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": resolveIDArrayCode})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "test.ts"})
	if resp.Error != "" {
		t.Fatalf("scanFile: %s", resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("scanFile returned no sites")
	}
	siteID := resp.Sites[0].ID

	root := resolveID(t, r, siteID)
	if root.Kind != protocol.KindArray {
		t.Fatalf("expected root KindArray, got kind=%d", root.Kind)
	}
	if root.Type == nil || root.Type.Kind != protocol.KindRef {
		t.Fatalf("expected root.Type to be a KindRef sentinel, got %+v", root.Type)
	}

	child := resolveID(t, r, root.Type.ID)
	if child.Kind != protocol.KindString {
		t.Fatalf("expected child KindString, got kind=%d", child.Kind)
	}
}

func TestResolveID_UnknownReturnsEmpty(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": resolveIDArrayCode})
	r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "test.ts"})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpResolveID, ID: "does-not-exist"})
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if len(resp.Types) != 0 {
		t.Fatalf("expected empty types for unknown id, got %d", len(resp.Types))
	}
}

func TestResolveID_EmptyIDReturnsEmpty(t *testing.T) {
	r := setupInline(t, map[string]string{})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpResolveID, ID: ""})
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if len(resp.Types) != 0 {
		t.Fatalf("expected empty types for empty id, got %d", len(resp.Types))
	}
}

// resolveID issues OpResolveID and returns the single Type entry. Fails the
// test when no entry comes back so callers can dot-chain into it safely.
func resolveID(t *testing.T, r interface {
	Dispatch(protocol.Request) protocol.Response
}, id string) *protocol.Type {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpResolveID, ID: id})
	if resp.Error != "" {
		t.Fatalf("resolveID(%q): %s", id, resp.Error)
	}
	if len(resp.Types) != 1 {
		t.Fatalf("resolveID(%q): expected 1 type, got %d", id, len(resp.Types))
	}
	return resp.Types[0]
}
