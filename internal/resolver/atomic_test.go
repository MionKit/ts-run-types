package resolver_test

import (
	"path/filepath"
	"regexp"
	"testing"

	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// atomicFixturesDir is a separate test-fixtures tree so the per-atomic
// tests are isolated from the broader F1–F16 suite. Retained for the
// two file-loading regression tests (TestAtomic_String_*).
func atomicFixturesDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs("../testfixtures/atomic")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

func atomicSetup(t *testing.T) *resolver.Resolver {
	t.Helper()
	p, err := program.New(program.Options{
		Cwd:            atomicFixturesDir(t),
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
	})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// atomicResolve runs scanFiles on a fixture and returns the RunType entry for
// its first (and only) call site.
func atomicResolve(t *testing.T, r *resolver.Resolver, file string) *protocol.RunType {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
	if resp.Error != "" {
		t.Fatalf("scanFiles %s: %s", file, resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("scanFiles %s returned no sites", file)
	}
	id := resp.Sites[0].ID
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, n := range dump {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("type %q not found in dump for %s", id, file)
	return nil
}

// hashIDPattern is the regex hash ids are expected to satisfy: starts with a
// letter, then alphanumerics, default length 6.
var hashIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{2,15}$`)

func assertHashID(t *testing.T, id string) {
	t.Helper()
	if !hashIDPattern.MatchString(id) {
		t.Fatalf("id %q does not look like a hash id", id)
	}
}

// =========================================================================
// Primitive kinds — id is just the kind number, no payload.
//
// Per the marker test coverage rule (CLAUDE.md), every scenario gets two
// paired tests: a *_Static using `getRuntypeId<T>()` and a *_Reflect using
// `reflectRuntypeId(v)`. Both must resolve to the same atomic Kind; the
// hash equivalence between the two forms is asserted by TestAtomic_String
// (file-based) and TestAtomic_FormEquivalence below.
// =========================================================================

// TestAtomic_String_* are kept file-based as the regression tests that
// exercise the on-disk tsconfig + osvfs path. Both forms share a Kind and
// a hash because both resolve to the same `string` primitive type.
func TestAtomic_String_Static(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "string_static.ts")
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
	assertHashID(t, tn.ID)
}

func TestAtomic_String_Reflect(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "string.ts")
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
	assertHashID(t, tn.ID)
}

func TestAtomic_Number_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<number>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got %d", tn.Kind)
	}
}

func TestAtomic_Number_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: number = 42;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got %d", tn.Kind)
	}
}

func TestAtomic_Boolean_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<boolean>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean, got %d", tn.Kind)
	}
}

func TestAtomic_Boolean_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: boolean;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean, got %d", tn.Kind)
	}
}

func TestAtomic_BigInt_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<bigint>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt, got %d", tn.Kind)
	}
}

func TestAtomic_BigInt_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: bigint = 1n;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt, got %d", tn.Kind)
	}
}

func TestAtomic_Symbol_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<symbol>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindSymbol {
		t.Fatalf("expected KindSymbol, got %d", tn.Kind)
	}
}

func TestAtomic_Symbol_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: symbol = Symbol('x');
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindSymbol {
		t.Fatalf("expected KindSymbol, got %d", tn.Kind)
	}
}

func TestAtomic_Null_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<null>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNull {
		t.Fatalf("expected KindNull, got %d", tn.Kind)
	}
}

func TestAtomic_Null_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: null = null;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNull {
		t.Fatalf("expected KindNull, got %d", tn.Kind)
	}
}

func TestAtomic_Undefined_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<undefined>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUndefined {
		t.Fatalf("expected KindUndefined, got %d", tn.Kind)
	}
}

func TestAtomic_Undefined_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: undefined = undefined;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUndefined {
		t.Fatalf("expected KindUndefined, got %d", tn.Kind)
	}
}

func TestAtomic_Void_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<void>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindVoid {
		t.Fatalf("expected KindVoid, got %d", tn.Kind)
	}
}

func TestAtomic_Void_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: void;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindVoid {
		t.Fatalf("expected KindVoid, got %d", tn.Kind)
	}
}

func TestAtomic_Any_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<any>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindAny {
		t.Fatalf("expected KindAny, got %d", tn.Kind)
	}
}

func TestAtomic_Any_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: any = 1;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindAny {
		t.Fatalf("expected KindAny, got %d", tn.Kind)
	}
}

func TestAtomic_Unknown_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<unknown>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnknown {
		t.Fatalf("expected KindUnknown, got %d", tn.Kind)
	}
}

func TestAtomic_Unknown_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: unknown = 1;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnknown {
		t.Fatalf("expected KindUnknown, got %d", tn.Kind)
	}
}

func TestAtomic_Never_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<never>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got %d", tn.Kind)
	}
}

func TestAtomic_Never_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: never;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got %d", tn.Kind)
	}
}

func TestAtomic_Object_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<object>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObject {
		t.Fatalf("expected KindObject, got %d", tn.Kind)
	}
}

func TestAtomic_Object_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: object = {};
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObject {
		t.Fatalf("expected KindObject, got %d", tn.Kind)
	}
}

// =========================================================================
// Regexp — two reflection outcomes:
//
//   KindRegexp (instance type, kind 12) — produced when the resolver cannot
//   trace the call to a regex-literal source. Examples: an explicit `RegExp`
//   type, a `declare const`, a `let`-bound regex.
//
//   KindLiteral{regexp: {source, flags}} (literal kind 13) — produced when the
//   resolver traces the call to a regex-literal source. Renders at runtime as
//   `/abc/i`. Triggered by inline regex literals, `as const`
//   wraps, and (transitively) `const`-binding chains reachable via `typeof`
//   in static form or via direct identifier reference in reflect form.
//
// See docs/atomic-types.md for the worked example matrix.
// =========================================================================

func TestAtomic_Regexp_Static_RegExpType(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<RegExp>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindRegexp {
		t.Fatalf("expected KindRegexp, got %d", tn.Kind)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "RegExp" {
		t.Fatalf("expected ClassRef.Builtin=RegExp, got %+v", tn.ClassRef)
	}
}

func TestAtomic_Regexp_Reflect_DeclareConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const re: RegExp;
reflectRuntypeId(re);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindRegexp {
		t.Fatalf("expected KindRegexp, got %d", tn.Kind)
	}
}

func TestAtomic_LiteralRegexp_Reflect_DirectLiteral(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i);
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, "abc", "i")
}

func TestAtomic_LiteralRegexp_Reflect_DirectLiteralAsConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i as const);
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, "abc", "i")
}

func TestAtomic_LiteralRegexp_Reflect_ConstBinding(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
reflectRuntypeId(re);
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, "abc", "i")
}

func TestAtomic_LiteralRegexp_Static_TypeofBinding(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
getRuntypeId<typeof re>();
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, "abc", "i")
}

// Trace follows chained const bindings.
func TestAtomic_LiteralRegexp_Reflect_ChainedConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const a = /abc/i;
const b = a;
reflectRuntypeId(b);
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, "abc", "i")
}

// Cross-form hash equivalence: a direct-literal reflect call and a
// typeof-binding static call with the same source+flags must share the same
// cache id. Trace-based equivalent of TestAtomic_FormEquivalence.
func TestAtomic_LiteralRegexp_FormEquivalence(t *testing.T) {
	const reflectForm = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i);
`
	const staticForm = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
getRuntypeId<typeof re>();
`
	r := setupInline(t, map[string]string{
		"reflect.ts": reflectForm,
		"static.ts":  staticForm,
	})
	a := resolveFile(t, r, "reflect.ts")
	b := resolveFile(t, r, "static.ts")
	if a.ID != b.ID {
		t.Fatalf("expected same hash for direct vs typeof regex literal, got %q vs %q", a.ID, b.ID)
	}
}

// Multi-escape: a regex literal with several `\/` escapes must round-trip the
// `\/` bytes into the cache entry's source verbatim (split-on-last-/ logic),
// so the emitter can render it back as a literal `/.../flags` expression.
func TestAtomic_LiteralRegexp_Reflect_MultiEscapedSlashes(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/^https?:\/\/example\/path$/gi);
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, `^https?:\/\/example\/path$`, "gi")
}

func TestAtomic_LiteralRegexp_Static_MultiEscapedSlashes(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const re = /^https?:\/\/example\/path$/gi;
getRuntypeId<typeof re>();
`
	_, tn := resolveInline(t, code)
	assertRegexLiteral(t, tn, `^https?:\/\/example\/path$`, "gi")
}

func assertRegexLiteral(t *testing.T, tn *protocol.RunType, wantSource, wantFlags string) {
	t.Helper()
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	m, ok := tn.Literal.(map[string]any)
	if !ok {
		t.Fatalf("expected literal to be a map, got %T", tn.Literal)
	}
	rx, ok := m["regexp"].(map[string]any)
	if !ok {
		t.Fatalf("expected literal.regexp map, got %v", m["regexp"])
	}
	if rx["source"] != wantSource {
		t.Fatalf("expected regex source=%q, got %v", wantSource, rx["source"])
	}
	if rx["flags"] != wantFlags {
		t.Fatalf("expected regex flags=%q, got %v", wantFlags, rx["flags"])
	}
}

// =========================================================================
// Literal kinds — kind 13 + literal payload.
// =========================================================================

func TestAtomic_LiteralString_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<'hello'>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if tn.Literal != "hello" {
		t.Fatalf("expected literal=\"hello\", got %v (%T)", tn.Literal, tn.Literal)
	}
}

// `as const` preserves the literal at the generic call site.
func TestAtomic_LiteralString_Reflect_AsConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 'hello' as const;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if tn.Literal != "hello" {
		t.Fatalf("expected literal=\"hello\", got %v (%T)", tn.Literal, tn.Literal)
	}
}

// Plain `const` — TS widens the literal type during generic inference.
func TestAtomic_LiteralString_Reflect_PlainConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 'hello';
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString (widened), got %d", tn.Kind)
	}
}

func assertLiteralNumber42(t *testing.T, tn *protocol.RunType) {
	t.Helper()
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	switch v := tn.Literal.(type) {
	case int64:
		if v != 42 {
			t.Fatalf("expected 42, got %d", v)
		}
	case float64:
		if v != 42 {
			t.Fatalf("expected 42, got %v", v)
		}
	default:
		t.Fatalf("expected numeric literal, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralNumber_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<42>();
`
	_, tn := resolveInline(t, code)
	assertLiteralNumber42(t, tn)
}

func TestAtomic_LiteralNumber_Reflect_AsConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 42 as const;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	assertLiteralNumber42(t, tn)
}

func TestAtomic_LiteralNumber_Reflect_PlainConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 42;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber (widened), got %d", tn.Kind)
	}
}

func TestAtomic_LiteralBoolean_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<true>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if v, ok := tn.Literal.(bool); !ok || v != true {
		t.Fatalf("expected literal=true, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralBoolean_Reflect_AsConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = true as const;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if v, ok := tn.Literal.(bool); !ok || v != true {
		t.Fatalf("expected literal=true, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralBoolean_Reflect_PlainConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = true;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean (widened), got %d", tn.Kind)
	}
}

func TestAtomic_LiteralBigInt_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<1n>();
`
	_, tn := resolveInline(t, code)
	assertBigintLiteral(t, tn)
}

func TestAtomic_LiteralBigInt_Reflect_AsConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 1n as const;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	assertBigintLiteral(t, tn)
}

func TestAtomic_LiteralBigInt_Reflect_PlainConst(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 1n;
reflectRuntypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt (widened), got %d", tn.Kind)
	}
}

func assertBigintLiteral(t *testing.T, tn *protocol.RunType) {
	t.Helper()
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	hasBigintFlag := false
	for _, f := range tn.Flags {
		if f == "bigint" {
			hasBigintFlag = true
		}
	}
	if !hasBigintFlag {
		t.Fatalf("expected flags to include 'bigint', got %v", tn.Flags)
	}
}

// LiteralSymbol only has the reflect form: there is no syntax to spell a
// unique-symbol literal in a type-argument position without first naming
// it via `typeof`, which itself requires a value binding to point at.
func TestAtomic_LiteralSymbol_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('hello');
reflectRuntypeId(sym);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	hasSymbolFlag := false
	for _, f := range tn.Flags {
		if f == "symbol" {
			hasSymbolFlag = true
		}
	}
	if !hasSymbolFlag {
		t.Fatalf("expected flags to include 'symbol', got %v", tn.Flags)
	}
	m, ok := tn.Literal.(map[string]any)
	if !ok {
		t.Fatalf("expected literal to be a map, got %T", tn.Literal)
	}
	if name, _ := m["symbol"].(string); name != "sym" {
		t.Fatalf("expected literal.symbol=sym, got %v", m["symbol"])
	}
}

func TestAtomic_LiteralSymbol_Static(t *testing.T) {
	// Static counterpart: spell the unique-symbol type via `typeof sym` in
	// the type argument position. The binding still has to exist.
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('hello');
getRuntypeId<typeof sym>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	hasSymbolFlag := false
	for _, f := range tn.Flags {
		if f == "symbol" {
			hasSymbolFlag = true
		}
	}
	if !hasSymbolFlag {
		t.Fatalf("expected flags to include 'symbol', got %v", tn.Flags)
	}
}

// =========================================================================
// Enums — kind 22 with enum + values + indexType.
// =========================================================================

func TestAtomic_EnumNumeric_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRuntypeId<Color>();
`
	assertEnumNumeric(t, code)
}

func TestAtomic_EnumNumeric_Reflect(t *testing.T) {
	// `const v = Color.Red` (no annotation) — declared type widens to the
	// parent enum `Color`. The counterintuitive trap `const v: Color = …`
	// would narrow to the literal `Color.Red` instead; see docs/atomic-types.md.
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v = Color.Red;
reflectRuntypeId(v);
`
	assertEnumNumeric(t, code)
}

func assertEnumNumeric(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindEnum {
		t.Fatalf("expected KindEnum, got %d", tn.Kind)
	}
	if tn.TypeName != "Color" {
		t.Fatalf("expected typeName=Color, got %q", tn.TypeName)
	}
	if len(tn.EnumVal) != 3 {
		t.Fatalf("expected 3 members, got %d (%v)", len(tn.EnumVal), tn.EnumVal)
	}
	if tn.IndexT == nil || tn.IndexT.Kind != protocol.KindNumber {
		t.Fatalf("expected indexType=number, got %+v", tn.IndexT)
	}
}

func TestAtomic_EnumString_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
getRuntypeId<Color>();
`
	assertEnumString(t, code)
}

func TestAtomic_EnumString_Reflect(t *testing.T) {
	// `const v = Color.Red` (no annotation) — see TestAtomic_EnumNumeric_Reflect.
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v = Color.Red;
reflectRuntypeId(v);
`
	assertEnumString(t, code)
}

func assertEnumString(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindEnum {
		t.Fatalf("expected KindEnum, got %d", tn.Kind)
	}
	if len(tn.EnumVal) != 3 {
		t.Fatalf("expected 3 members, got %d", len(tn.EnumVal))
	}
	if v, ok := tn.EnumVal["Red"].(string); !ok || v != "red" {
		t.Fatalf("expected Red=\"red\", got %v", tn.EnumVal["Red"])
	}
	if tn.IndexT == nil || tn.IndexT.Kind != protocol.KindString {
		t.Fatalf("expected indexType=string, got %+v", tn.IndexT)
	}
}

// =========================================================================
// Date — class instance with ClassRef.Builtin="Date".
// =========================================================================

func TestAtomic_Date_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Date>();
`
	assertDateType(t, code)
}

func TestAtomic_Date_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Date = new Date();
reflectRuntypeId(v);
`
	assertDateType(t, code)
}

func assertDateType(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Date" {
		t.Fatalf("expected typeName=Date, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Date" {
		t.Fatalf("expected ClassRef.Builtin=Date, got %+v", tn.ClassRef)
	}
	if tn.SubKind != protocol.SubKindDate {
		t.Fatalf("expected SubKind=SubKindDate(%d), got %d", protocol.SubKindDate, tn.SubKind)
	}
}

// =========================================================================
// Map<K,V> — class instance with SubKindMap and synthetic
// mapKey/mapValue parameter wrappers on Arguments.
// =========================================================================

func TestAtomic_Map_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Map<string, number>>();
`
	assertMapType(t, code)
}

func TestAtomic_Map_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Map<string, number> = new Map();
reflectRuntypeId(v);
`
	assertMapType(t, code)
}

func assertMapType(t *testing.T, code string) {
	t.Helper()
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Map" {
		t.Fatalf("expected typeName=Map, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Map" {
		t.Fatalf("expected ClassRef.Builtin=Map, got %+v", tn.ClassRef)
	}
	if tn.SubKind != protocol.SubKindMap {
		t.Fatalf("expected SubKind=SubKindMap(%d), got %d", protocol.SubKindMap, tn.SubKind)
	}
	if len(tn.Arguments) != 2 {
		t.Fatalf("expected 2 Arguments wrappers, got %d", len(tn.Arguments))
	}
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	keyWrapper := lookupNode(dump, tn.Arguments[0].ID)
	valueWrapper := lookupNode(dump, tn.Arguments[1].ID)
	if keyWrapper == nil || keyWrapper.Kind != protocol.KindParameter || keyWrapper.SubKind != protocol.SubKindMapKey {
		t.Fatalf("expected key wrapper KindParameter+SubKindMapKey, got %+v", keyWrapper)
	}
	if valueWrapper == nil || valueWrapper.Kind != protocol.KindParameter || valueWrapper.SubKind != protocol.SubKindMapValue {
		t.Fatalf("expected value wrapper KindParameter+SubKindMapValue, got %+v", valueWrapper)
	}
}

// =========================================================================
// Set<T> — class instance with SubKindSet and a synthetic setItem
// parameter wrapper on Arguments.
// =========================================================================

func TestAtomic_Set_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Set<string>>();
`
	assertSetType(t, code)
}

func TestAtomic_Set_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Set<string> = new Set();
reflectRuntypeId(v);
`
	assertSetType(t, code)
}

func assertSetType(t *testing.T, code string) {
	t.Helper()
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Set" {
		t.Fatalf("expected typeName=Set, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Set" {
		t.Fatalf("expected ClassRef.Builtin=Set, got %+v", tn.ClassRef)
	}
	if tn.SubKind != protocol.SubKindSet {
		t.Fatalf("expected SubKind=SubKindSet(%d), got %d", protocol.SubKindSet, tn.SubKind)
	}
	if len(tn.Arguments) != 1 {
		t.Fatalf("expected 1 Arguments wrapper, got %d", len(tn.Arguments))
	}
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	itemWrapper := lookupNode(dump, tn.Arguments[0].ID)
	if itemWrapper == nil || itemWrapper.Kind != protocol.KindParameter || itemWrapper.SubKind != protocol.SubKindSetItem {
		t.Fatalf("expected item wrapper KindParameter+SubKindSetItem, got %+v", itemWrapper)
	}
}

// =========================================================================
// Non-serialisable global (Error) — class with SubKindNonSerializable.
// =========================================================================

func TestAtomic_NonSerializable_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Error>();
`
	assertErrorType(t, code)
}

func TestAtomic_NonSerializable_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Error = new Error();
reflectRuntypeId(v);
`
	assertErrorType(t, code)
}

func assertErrorType(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Error" {
		t.Fatalf("expected typeName=Error, got %q", tn.TypeName)
	}
	if tn.SubKind != protocol.SubKindNonSerializable {
		t.Fatalf("expected SubKind=SubKindNonSerializable(%d), got %d", protocol.SubKindNonSerializable, tn.SubKind)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Error" {
		t.Fatalf("expected ClassRef.Builtin=Error, got %+v", tn.ClassRef)
	}
}

func lookupNode(dump []*protocol.RunType, id string) *protocol.RunType {
	for _, node := range dump {
		if node.ID == id {
			return node
		}
	}
	return nil
}

// =========================================================================
// Structural dedup — two distinct snippets with the same atomic type share
// the same hash id; different shapes get different ids.
// =========================================================================

func TestAtomic_StructuralDedup(t *testing.T) {
	const widened = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'hello';
reflectRuntypeId(v);
`
	const literal = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: 'hello' = 'hello';
reflectRuntypeId(v);
`
	r := setupInline(t, map[string]string{
		"widened.ts": widened,
		"literal.ts": literal,
	})
	a := resolveFile(t, r, "widened.ts")
	b := resolveFile(t, r, "literal.ts")
	if a.ID == b.ID {
		t.Fatalf("expected different ids for string vs \"hello\" literal")
	}
	a2 := resolveFile(t, r, "widened.ts")
	if a.ID != a2.ID {
		t.Fatalf("expected stable id on re-resolve, got %q vs %q", a.ID, a2.ID)
	}
}

// TestAtomic_FormEquivalence proves the static and reflect forms collapse
// to the same cache entry for an equivalent `T`. This is the cross-form
// hash-equivalence assertion required by the marker test coverage rule.
func TestAtomic_FormEquivalence(t *testing.T) {
	const staticForm = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`
	const reflectForm = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'hello';
reflectRuntypeId(v);
`
	r := setupInline(t, map[string]string{
		"static.ts":  staticForm,
		"reflect.ts": reflectForm,
	})
	a := resolveFile(t, r, "static.ts")
	b := resolveFile(t, r, "reflect.ts")
	if a.ID != b.ID {
		t.Fatalf("expected same hash for static vs reflect form of `string`, got %q vs %q", a.ID, b.ID)
	}
}
