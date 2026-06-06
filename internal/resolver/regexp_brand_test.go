package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TestRegexpBrand_ConvergesWithTypeFirst proves the value-first regexp brand —
// `RegexLiteralType<source, flags>`, whose source/flags ride as literal type args
// and are read off the TYPE by typeid.RegexLiteralFromType — resolves to the SAME
// structural id as the type-first AST-harvested form (`createIsType<typeof reg>()`
// where `const reg = /abc/i`). Both route through cache.SerializeRegexLiteral, so
// the value-first and type-first regex literals converge on one cache entry with
// NO AST harvest needed for the brand path.
func TestRegexpBrand_ConvergesWithTypeFirst(t *testing.T) {
	const dts = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export interface RunType<T = unknown> {id: string; readonly __rtType?: {t: T}}
  export type RegexLiteralType<S extends string, F extends string = ''> = RegExp & {readonly __rtRegexSource: S; readonly __rtRegexFlags: F};
  export interface StringPatternArgs {source: string; flags?: string; mockSamples: readonly string[]}
  export function createIsType<T>(schema: RunType<T>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
  export function createIsType<T>(val?: T, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
  export function regexp<const A extends StringPatternArgs>(pattern: CompTimeArgs<A>, id?: InjectRunTypeId<RegexLiteralType<A['source'], A extends {flags: infer F extends string} ? F : ''>>): RunType<RegexLiteralType<A['source'], A extends {flags: infer F extends string} ? F : ''>>;
}
`
	const code = `import {createIsType, regexp} from '@mionjs/ts-go-run-types';
const reg = /abc/i;
createIsType<typeof reg>();
createIsType(regexp({source: 'abc', flags: 'i', mockSamples: ['abc']}));
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// Site[0] = type-first `createIsType<typeof reg>()` (AST harvest); Site[1] =
	// `createIsType(regexp({...}))` (the nested regexp builder is enclosed, so the
	// createIsType call carries the brand-reflected id).
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 Sites, got %d: %+v", len(resp.Sites), resp.Sites)
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("regexp brand id %q != type-first AST-harvest id %q — must converge via SerializeRegexLiteral",
			resp.Sites[1].ID, resp.Sites[0].ID)
	}
}
