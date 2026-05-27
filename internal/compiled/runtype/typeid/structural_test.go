package typeid_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

const runtypesDTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRuntypeId<T> = string & {readonly __mionInjectRuntypeIdBrand?: T};
  export function getRuntypeId<T>(id?: InjectRuntypeId<T>): InjectRuntypeId<T>;
  export function reflectRuntypeId<T>(value: T, id?: InjectRuntypeId<T>): InjectRuntypeId<T>;
}
`

// inlineResolver builds an in-memory program around the supplied snippet
// and returns a resolver ready for OpScanFiles / OpDump.
func inlineResolver(t *testing.T, code string) *resolver.Resolver {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	dtsPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	testPath := tspath.ResolvePath(cwd, "test.ts")
	overlay := map[string]string{
		dtsPath:  runtypesDTS,
		testPath: code,
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, []string{dtsPath, testPath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)
	return res
}

// rootFor scans test.ts and returns the RunType node for the first
// (and only) call site.
func rootFor(t *testing.T, code string) (*resolver.Resolver, *protocol.RunType) {
	t.Helper()
	res := inlineResolver(t, code)
	scanResp := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if scanResp.Error != "" {
		t.Fatalf("scanFiles: %s", scanResp.Error)
	}
	if len(scanResp.Sites) == 0 {
		t.Fatalf("scanFiles returned no sites")
	}
	dump := res.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, node := range dump {
		if node.ID == scanResp.Sites[0].ID {
			return res, node
		}
	}
	t.Fatalf("root id %q not in dump", scanResp.Sites[0].ID)
	return nil, nil
}

// TestStructural_DateAndMapShareNothing — Date and Map<string, number>
// must produce different cache entries (different SubKind, different
// structural id, different hash).
func TestStructural_DateAndMapShareNothing(t *testing.T) {
	_, dateNode := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Date>();
`)
	_, mapNode := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Map<string, number>>();
`)
	if dateNode.ID == mapNode.ID {
		t.Fatalf("expected Date and Map to have distinct ids, both got %q", dateNode.ID)
	}
	if dateNode.SubKind != protocol.SubKindDate {
		t.Fatalf("Date: expected SubKindDate, got %d", dateNode.SubKind)
	}
	if mapNode.SubKind != protocol.SubKindMap {
		t.Fatalf("Map: expected SubKindMap, got %d", mapNode.SubKind)
	}
}

// TestStructural_NonSerializableNotDeduplicatedWithObjectLiteral —
// `Error` (now a non-serialisable class) and a hand-rolled `{message:
// string; name: string}` object literal carry different shapes and
// MUST NOT collapse to the same cache id. Regression test for the
// `subKind || kind` prefix rule.
func TestStructural_NonSerializableNotDeduplicatedWithObjectLiteral(t *testing.T) {
	_, errorNode := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Error>();
`)
	_, plainNode := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type ErrorShape = {message: string; name: string};
getRuntypeId<ErrorShape>();
`)
	if errorNode.ID == plainNode.ID {
		t.Fatalf("non-serializable Error must not share id with a plain object literal of same shape")
	}
	if errorNode.SubKind != protocol.SubKindNonSerializable {
		t.Fatalf("Error: expected SubKindNonSerializable, got %d", errorNode.SubKind)
	}
}

// TestStructural_MapDistinctElementTypes — two Map instantiations with
// different value types must NOT collapse, because the SubKindMapValue
// child's structural id differs.
func TestStructural_MapDistinctElementTypes(t *testing.T) {
	_, mapStringNumber := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Map<string, number>>();
`)
	_, mapStringString := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Map<string, string>>();
`)
	if mapStringNumber.ID == mapStringString.ID {
		t.Fatalf("Map<string,number> must not share id with Map<string,string>")
	}
}

// TestStructural_HashIdLooksLikeIdentifier sanity-checks that the
// subKind-tagged nodes still get short, identifier-safe hash ids the
// emitter can use verbatim as JS const names.
func TestStructural_HashIdLooksLikeIdentifier(t *testing.T) {
	_, mapNode := rootFor(t, `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Map<string, number>>();
`)
	if mapNode.ID == "" || strings.ContainsAny(mapNode.ID, "{}[]:") {
		t.Fatalf("hash id %q is not identifier-safe", mapNode.ID)
	}
}
