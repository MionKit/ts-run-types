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

// atomicResolve runs scanFile on a fixture and returns the Type entry for
// its first (and only) call site. Atomic fixtures are written to contain
// exactly one `getRuntypeId<T>(...)` call; if that assumption changes the
// suite needs updating.
func atomicResolve(t *testing.T, r *resolver.Resolver, file string) *protocol.Type {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: file})
	if resp.Error != "" {
		t.Fatalf("scanFile %s: %s", file, resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("scanFile %s returned no sites", file)
	}
	id := resp.Sites[0].ID
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).Types
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
// =========================================================================

func TestAtomic_String(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "string.ts")
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
	assertHashID(t, tn.ID)
}

func TestAtomic_Number(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "number.ts")
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got %d", tn.Kind)
	}
}

func TestAtomic_Boolean(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "boolean.ts")
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean, got %d", tn.Kind)
	}
}

func TestAtomic_BigInt(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "bigint.ts")
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt, got %d", tn.Kind)
	}
}

func TestAtomic_Symbol(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "symbol.ts")
	if tn.Kind != protocol.KindSymbol {
		t.Fatalf("expected KindSymbol, got %d", tn.Kind)
	}
}

func TestAtomic_Null(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "null.ts")
	if tn.Kind != protocol.KindNull {
		t.Fatalf("expected KindNull, got %d", tn.Kind)
	}
}

func TestAtomic_Undefined(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "undefined.ts")
	if tn.Kind != protocol.KindUndefined {
		t.Fatalf("expected KindUndefined, got %d", tn.Kind)
	}
}

func TestAtomic_Void(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "void.ts")
	if tn.Kind != protocol.KindVoid {
		t.Fatalf("expected KindVoid, got %d", tn.Kind)
	}
}

func TestAtomic_Any(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "any.ts")
	if tn.Kind != protocol.KindAny {
		t.Fatalf("expected KindAny, got %d", tn.Kind)
	}
}

func TestAtomic_Unknown(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "unknown.ts")
	if tn.Kind != protocol.KindUnknown {
		t.Fatalf("expected KindUnknown, got %d", tn.Kind)
	}
}

func TestAtomic_Never(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "never.ts")
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got %d", tn.Kind)
	}
}

func TestAtomic_Object(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "object.ts")
	if tn.Kind != protocol.KindObject {
		t.Fatalf("expected KindObject, got %d", tn.Kind)
	}
}

// =========================================================================
// Regexp instance type (kind 12) — distinct from a regexp literal.
// =========================================================================

func TestAtomic_Regexp(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "regexp.ts")
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
	tn := atomicResolve(t, atomicSetup(t), "literal_string.ts")
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if tn.Literal != "hello" {
		t.Fatalf("expected literal=\"hello\", got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralNumber(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "literal_number.ts")
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
	tn := atomicResolve(t, atomicSetup(t), "literal_boolean.ts")
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if v, ok := tn.Literal.(bool); !ok || v != true {
		t.Fatalf("expected literal=true, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralBigInt(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "literal_bigint.ts")
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
	tn := atomicResolve(t, atomicSetup(t), "literal_symbol.ts")
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
	tn := atomicResolve(t, atomicSetup(t), "enum_numeric.ts")
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
	tn := atomicResolve(t, atomicSetup(t), "enum_string.ts")
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
	tn := atomicResolve(t, atomicSetup(t), "date.ts")
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
	a := atomicResolve(t, r, "string.ts")
	b := atomicResolve(t, r, "literal_string.ts")
	// They're different types (string vs "hello" literal), so different ids.
	if a.ID == b.ID {
		t.Fatalf("expected different ids for string vs \"hello\" literal")
	}
	// Re-resolving the same atomic type should return the exact same id.
	a2 := atomicResolve(t, r, "string.ts")
	if a.ID != a2.ID {
		t.Fatalf("expected stable id on re-resolve, got %q vs %q", a.ID, a2.ID)
	}
}
