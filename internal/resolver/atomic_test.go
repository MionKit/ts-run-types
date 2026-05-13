package resolver_test

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// atomicFixturesDir is a separate test-fixtures tree so the per-atomic
// tests are isolated from the broader F1–F16 suite.
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

// atomicLocate finds a substring within a fixture file and returns its byte offset.
func atomicLocate(t *testing.T, r *resolver.Resolver, file, needle string) int {
	t.Helper()
	abs := filepath.Join(atomicFixturesDir(t), file)
	sf := r.Program.SourceFile(abs)
	if sf == nil {
		t.Fatalf("source file not loaded: %s", abs)
	}
	idx := strings.Index(sf.Text(), needle)
	if idx < 0 {
		t.Fatalf("needle %q not found in %s", needle, file)
	}
	return idx
}

// resolveSite drives an atomic fixture: most use `getTypeInfo(v)`
// (resolveArgumentInferred) — for `isType<T>(...)` cases the test passes
// `useTypeArg=true` to read the type-argument instead.
func resolveSite(t *testing.T, r *resolver.Resolver, file, needle string, useTypeArg bool) *protocol.Type {
	t.Helper()
	pos := atomicLocate(t, r, file, needle)
	op := "resolveArgumentInferred"
	if useTypeArg {
		op = "resolveTypeArgument"
	}
	resp := r.Dispatch(protocol.Request{Op: op, File: file, CallPos: pos, Index: 0})
	if resp.Error != "" {
		t.Fatalf("resolve %s: %s", file, resp.Error)
	}
	all := r.Dispatch(protocol.Request{Op: "dump"}).Types
	for _, n := range all {
		if n.ID == resp.ID {
			return n
		}
	}
	t.Fatalf("type %q not found in dump", resp.ID)
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
// =========================================================================

func TestAtomic_String(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "string.ts", "getTypeInfo(", false)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
	assertHashID(t, tn.ID)
}

func TestAtomic_Number(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "number.ts", "getTypeInfo(", false)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got %d", tn.Kind)
	}
}

func TestAtomic_Boolean(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "boolean.ts", "isType<boolean>(", true)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean, got %d", tn.Kind)
	}
}

func TestAtomic_BigInt(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "bigint.ts", "isType<bigint>(", true)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt, got %d", tn.Kind)
	}
}

func TestAtomic_Symbol(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "symbol.ts", "isType<symbol>(", true)
	if tn.Kind != protocol.KindSymbol {
		t.Fatalf("expected KindSymbol, got %d", tn.Kind)
	}
}

func TestAtomic_Null(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "null.ts", "isType<null>(", true)
	if tn.Kind != protocol.KindNull {
		t.Fatalf("expected KindNull, got %d", tn.Kind)
	}
}

func TestAtomic_Undefined(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "undefined.ts", "isType<undefined>(", true)
	if tn.Kind != protocol.KindUndefined {
		t.Fatalf("expected KindUndefined, got %d", tn.Kind)
	}
}

func TestAtomic_Void(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "void.ts", "isType<void>(", true)
	if tn.Kind != protocol.KindVoid {
		t.Fatalf("expected KindVoid, got %d", tn.Kind)
	}
}

func TestAtomic_Any(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "any.ts", "isType<any>(", true)
	if tn.Kind != protocol.KindAny {
		t.Fatalf("expected KindAny, got %d", tn.Kind)
	}
}

func TestAtomic_Unknown(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "unknown.ts", "isType<unknown>(", true)
	if tn.Kind != protocol.KindUnknown {
		t.Fatalf("expected KindUnknown, got %d", tn.Kind)
	}
}

func TestAtomic_Never(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "never.ts", "isType<never>(", true)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got %d", tn.Kind)
	}
}

func TestAtomic_Object(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "object.ts", "isType<object>(", true)
	if tn.Kind != protocol.KindObject {
		t.Fatalf("expected KindObject, got %d", tn.Kind)
	}
}

// =========================================================================
// Regexp instance type (kind 12) — distinct from a regexp literal.
// =========================================================================

func TestAtomic_Regexp(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "regexp.ts", "isType<RegExp>(", true)
	if tn.Kind != protocol.KindRegexp {
		t.Fatalf("expected KindRegexp, got %d", tn.Kind)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "RegExp" {
		t.Fatalf("expected ClassRef.Builtin=RegExp, got %+v", tn.ClassRef)
	}
}

// =========================================================================
// Literal kinds — kind 13 + literal payload.
// =========================================================================

func TestAtomic_LiteralString(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "literal_string.ts", `isType<"hello">(`, true)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if tn.Literal != "hello" {
		t.Fatalf("expected literal=\"hello\", got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralNumber(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "literal_number.ts", "isType<42>(", true)
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

func TestAtomic_LiteralBoolean(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "literal_boolean.ts", "isType<true>(", true)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if v, ok := tn.Literal.(bool); !ok || v != true {
		t.Fatalf("expected literal=true, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralBigInt(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "literal_bigint.ts", "isType<1n>(", true)
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

func TestAtomic_LiteralSymbol(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "literal_symbol.ts", "isType<typeof sym>(", true)
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
		// tsgo's UniqueESSymbol gives us the binding's name; verify it matches the source.
		t.Fatalf("expected literal.symbol=sym, got %v", m["symbol"])
	}
}

// =========================================================================
// Enums — kind 22 with enum + values + indexType.
// =========================================================================

func TestAtomic_EnumNumeric(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "enum_numeric.ts", "isType<Color>(", true)
	if tn.Kind != protocol.KindEnum {
		t.Fatalf("expected KindEnum, got %d", tn.Kind)
	}
	if tn.TypeName != "Color" {
		t.Fatalf("expected typeName=Color, got %q", tn.TypeName)
	}
	if len(tn.Enum) != 3 {
		t.Fatalf("expected 3 members, got %d (%v)", len(tn.Enum), tn.Enum)
	}
	// indexType for a numeric enum should be number.
	if tn.IndexT == nil || tn.IndexT.Kind != protocol.KindNumber {
		t.Fatalf("expected indexType=number, got %+v", tn.IndexT)
	}
}

func TestAtomic_EnumString(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "enum_string.ts", "isType<Color>(", true)
	if tn.Kind != protocol.KindEnum {
		t.Fatalf("expected KindEnum, got %d", tn.Kind)
	}
	if len(tn.Enum) != 3 {
		t.Fatalf("expected 3 members, got %d", len(tn.Enum))
	}
	if v, ok := tn.Enum["Red"].(string); !ok || v != "red" {
		t.Fatalf("expected Red=\"red\", got %v", tn.Enum["Red"])
	}
	if tn.IndexT == nil || tn.IndexT.Kind != protocol.KindString {
		t.Fatalf("expected indexType=string, got %+v", tn.IndexT)
	}
}

// =========================================================================
// Date — class instance with ClassRef.Builtin="Date".
// =========================================================================

func TestAtomic_Date(t *testing.T) {
	tn := resolveSite(t, atomicSetup(t), "date.ts", "isType<Date>(", true)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Date" {
		t.Fatalf("expected typeName=Date, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Date" {
		t.Fatalf("expected ClassRef.Builtin=Date, got %+v", tn.ClassRef)
	}
}

// =========================================================================
// Structural dedup — two distinct fixtures with the same atomic type share
// the same hash id.
// =========================================================================

func TestAtomic_StructuralDedup(t *testing.T) {
	r := atomicSetup(t)
	a := resolveSite(t, r, "string.ts", "getTypeInfo(", false)
	b := resolveSite(t, r, "literal_string.ts", `isType<"hello">(`, true)
	// They're different types (string vs "hello" literal), so different ids.
	if a.ID == b.ID {
		t.Fatalf("expected different ids for string vs \"hello\" literal")
	}
	// Re-resolving the same atomic type should return the exact same id.
	a2 := resolveSite(t, r, "string.ts", "getTypeInfo(", false)
	if a.ID != a2.ID {
		t.Fatalf("expected stable id on re-resolve, got %q vs %q", a.ID, a2.ID)
	}
}
