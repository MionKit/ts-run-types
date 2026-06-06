package resolver_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Micro-benchmarks for the resolver pipeline. Inner-loop companions to the
// suite-level harness in scripts/bench-compile.mjs — these isolate OUR
// pipeline phases against a warm checker so `benchstat` deltas reflect
// Go-side changes, not tsgo program-construction noise.
//
// Run:  go test ./internal/resolver -bench=. -benchmem -run='^$' -count=10
// Compare: benchstat old.txt new.txt
//
// Stationarity: every iteration that mutates resolver state first restores
// a fixed starting point (SetProgram resets sites/scannedFiles and clears
// the pointer cache; Cache().Clear() additionally drops the structural
// table + hash dicts). Dump-based render benchmarks are stationary as-is.

const benchAtomicTS = `import {createValidate, getRunTypeId} from '@mionjs/ts-go-run-types';
export const a = createValidate<string>();
export const b = createValidate<number>();
export const c = createValidate<boolean>();
export const d = getRunTypeId<string[]>();
`

const benchObjectTS = `import {createValidate, createGetValidationErrors, createJsonEncoder, createJsonDecoder} from '@mionjs/ts-go-run-types';
interface Address {street: string; city: string; zip?: string}
interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
  tags: string[];
  address: Address;
  friends: User[];
  createdAt: Date;
  meta: {[key: string]: string};
}
export const v = createValidate<User>();
export const e = createGetValidationErrors<User>();
export const enc = createJsonEncoder<User>();
export const dec = createJsonDecoder<User>();
`

const benchUnionTS = `import {createValidate, createJsonEncoder, createJsonDecoder, createBinaryEncoder, createBinaryDecoder} from '@mionjs/ts-go-run-types';
type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; size: number} | {kind: 'rect'; w: number; h: number};
type Mixed = string | number | Date | {a: string} | string[];
export const v = createValidate<Shape>();
export const je = createJsonEncoder<Shape>();
export const jd = createJsonDecoder<Shape>();
export const be = createBinaryEncoder<Mixed>();
export const bd = createBinaryDecoder<Mixed>();
`

// benchLargeTS is a generated 48-property object (mixed kinds, nested
// blocks, arrays, optionals, a union and a Date per block) that stresses
// projection, structural-id text building, and the per-family walkers.
var benchLargeTS = func() string {
	var sb strings.Builder
	sb.WriteString("import {createValidate, createGetValidationErrors, createJsonEncoder, createJsonDecoder} from '@mionjs/ts-go-run-types';\n")
	sb.WriteString("interface Big {\n")
	for i := 0; i < 12; i++ {
		fmt.Fprintf(&sb, "  s%d: string; n%d: number; o%d?: {a: string; b: number[]; c: 'x' | 'y' | %d}; d%d: Date;\n", i, i, i, i, i)
	}
	sb.WriteString("}\n")
	sb.WriteString("export const v = createValidate<Big>();\n")
	sb.WriteString("export const e = createGetValidationErrors<Big>();\n")
	sb.WriteString("export const enc = createJsonEncoder<Big>();\n")
	sb.WriteString("export const dec = createJsonDecoder<Big>();\n")
	return sb.String()
}()

var benchFixtures = []struct {
	name string
	code string
}{
	{"atomic", benchAtomicTS},
	{"object", benchObjectTS},
	{"union", benchUnionTS},
	{"large", benchLargeTS},
}

func benchScanRequest(files []string, kinds []protocol.CacheKind) protocol.Request {
	return protocol.Request{Op: protocol.OpScanFiles, Files: files, IncludeCacheSources: kinds}
}

// BenchmarkScan_ColdCache measures the full our-side pipeline per scan —
// AST walk, marker detection, structural-id computation, projection,
// purefn extraction, response prep — with a warm checker and a cold
// resolver cache. No cache sources requested (the Vite transform shape).
func BenchmarkScan_ColdCache(b *testing.B) {
	for _, fixture := range benchFixtures {
		b.Run(fixture.name, func(b *testing.B) {
			r := setupInline(b, map[string]string{"a.ts": fixture.code})
			prog := r.Program
			files := []string{"a.ts"}
			if resp := r.Dispatch(benchScanRequest(files, nil)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := r.SetProgram(prog); err != nil {
					b.Fatalf("SetProgram: %v", err)
				}
				r.Cache().Clear()
				if resp := r.Dispatch(benchScanRequest(files, nil)); resp.Error != "" {
					b.Fatalf("scan: %s", resp.Error)
				}
			}
		})
	}
}

// BenchmarkScan_WarmCache is BenchmarkScan_ColdCache with the structural
// table kept — every AssignID recomputes the structural id (the pointer
// cache is dropped by SetProgram) but hits byStructural, so projection
// and hash-dict work are excluded. The delta against ColdCache isolates
// projection + dict cost.
func BenchmarkScan_WarmCache(b *testing.B) {
	for _, fixture := range benchFixtures {
		b.Run(fixture.name, func(b *testing.B) {
			r := setupInline(b, map[string]string{"a.ts": fixture.code})
			prog := r.Program
			files := []string{"a.ts"}
			if resp := r.Dispatch(benchScanRequest(files, nil)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := r.SetProgram(prog); err != nil {
					b.Fatalf("SetProgram: %v", err)
				}
				if resp := r.Dispatch(benchScanRequest(files, nil)); resp.Error != "" {
					b.Fatalf("scan: %s", resp.Error)
				}
			}
		})
	}
}

// BenchmarkRender measures the dump-driven cache renders over a session
// holding all bench fixtures. `validate` exposes the CrossFamilyValRoots
// collection passes; `all` renders every family (the cache-module
// transform shape). Stationary: the session is scanned once, renders are
// pure reads.
func BenchmarkRender(b *testing.B) {
	sources := map[string]string{
		"object.ts": benchObjectTS,
		"union.ts":  benchUnionTS,
		"large.ts":  benchLargeTS,
	}
	variants := []struct {
		name  string
		kinds []protocol.CacheKind
	}{
		{"validateOnly", []protocol.CacheKind{protocol.CacheKindValidate}},
		{"runTypeOnly", []protocol.CacheKind{protocol.CacheKindRunType}},
		{"all", []protocol.CacheKind{protocol.CacheKindAll}},
	}
	for _, variant := range variants {
		b.Run(variant.name, func(b *testing.B) {
			r := setupInline(b, sources)
			if resp := r.Dispatch(benchScanRequest([]string{"object.ts", "union.ts", "large.ts"}, nil)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			req := protocol.Request{Op: protocol.OpDump, IncludeCacheSources: variant.kinds}
			if resp := r.Dispatch(req); resp.Error != "" {
				b.Fatalf("warmup dump: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if resp := r.Dispatch(req); resp.Error != "" {
					b.Fatalf("dump: %s", resp.Error)
				}
			}
		})
	}
}

// BenchmarkScanWithCaches measures the scanFiles-with-cache-sources shape
// the bench harness and tests drive (scan + scoped projection + per-family
// renders in one dispatch), per fixture, all families.
func BenchmarkScanWithCaches(b *testing.B) {
	kinds := []protocol.CacheKind{protocol.CacheKindAll}
	for _, fixture := range benchFixtures {
		b.Run(fixture.name, func(b *testing.B) {
			r := setupInline(b, map[string]string{"a.ts": fixture.code})
			prog := r.Program
			files := []string{"a.ts"}
			if resp := r.Dispatch(benchScanRequest(files, kinds)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := r.SetProgram(prog); err != nil {
					b.Fatalf("SetProgram: %v", err)
				}
				r.Cache().Clear()
				if resp := r.Dispatch(benchScanRequest(files, kinds)); resp.Error != "" {
					b.Fatalf("scan: %s", resp.Error)
				}
			}
		})
	}
}
