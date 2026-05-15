package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// runtypesDTS mirrors internal/testfixtures/runtypes.d.ts — the fake
// `@mionjs/ts-go-run-types` module declaration. setupInline always
// overlays it under the test cwd so caller snippets stay terse, the
// same trick the FE helper uses (packages/vite-plugin-runtypes/test/helpers/inline.ts:30).
const runtypesDTS = `declare module '@mionjs/ts-go-run-types' {
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
  export function getRuntypeId<T>(id?: RuntypeId<T>): RuntypeId<T>;
  export function reflectRuntypeId<T>(value: T, id?: RuntypeId<T>): RuntypeId<T>;
}
`

// setupInline builds a Resolver over an in-memory overlay of TypeScript
// sources. Mirrors withInlineSources in helpers/inline.ts so Go tests can
// keep their snippet right next to the assertions instead of jumping to a
// fixture file.
func setupInline(t *testing.T, sources map[string]string) *resolver.Resolver {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources)+1)
	fileNames := make([]string, 0, len(sources)+1)
	if _, ok := sources["runtypes.d.ts"]; !ok {
		abs := tspath.ResolvePath(cwd, "runtypes.d.ts")
		overlay[abs] = runtypesDTS
		fileNames = append(fileNames, abs)
	}
	for rel, code := range sources {
		abs := tspath.ResolvePath(cwd, rel)
		overlay[abs] = code
		fileNames = append(fileNames, abs)
	}
	p, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// resolveInline pins code to test.ts in an in-memory program, scans it,
// and returns the resolver plus the Type entry for the first call site.
// Tests that need to dump the full type list after the scan use the
// returned resolver; tests that only check the root type ignore it.
func resolveInline(t *testing.T, code string) (*resolver.Resolver, *protocol.Type) {
	t.Helper()
	r := setupInline(t, map[string]string{"test.ts": code})
	tn := resolveFile(t, r, "test.ts")
	return r, tn
}
