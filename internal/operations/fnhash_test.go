package operations

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/constants"
)

// expectedCanonicalKeyCount is a canary: 12 AxisNone ops (7 public leaf + 5
// internal primitives) × 1, plus 2 ValidateOptions ops × 4 subsets, plus
// jsonEncoder's 3 + jsonDecoder's 2 strategies = 12 + 8 + 5. If this trips,
// an operation was added/removed without updating the count (and you should
// re-confirm the collision guard still holds).
const expectedCanonicalKeyCount = 12 + 8 + 5

func TestFnHashCollisionFree(t *testing.T) {
	// Runs at init too, but assert here so the failure is a test, not a panic.
	mustBeCollisionFree()

	keys := allCanonicalKeys()
	if len(keys) != expectedCanonicalKeyCount {
		t.Fatalf("canonical key count = %d, want %d (operation set changed?)", len(keys), expectedCanonicalKeyCount)
	}

	seen := make(map[string]string, len(keys))
	for _, key := range keys {
		hash := FnHash(key)
		if len(hash) != FnHashLen {
			t.Errorf("FnHash(%q) = %q has length %d, want %d", key, hash, len(hash), FnHashLen)
		}
		if other, dup := seen[hash]; dup {
			t.Errorf("collision: %q and %q both hash to %q", other, key, hash)
		}
		seen[hash] = key
	}
}

func TestFnHashDeterministic(t *testing.T) {
	validate, _ := ByName("validate")
	a := FnHashFor(validate, []string{"noLiterals"}, "")
	b := FnHashFor(validate, []string{"noLiterals"}, "")
	if a != b {
		t.Fatalf("FnHashFor not deterministic: %q vs %q", a, b)
	}
}

func TestCanonicalOptionOrderIndependent(t *testing.T) {
	validate, _ := ByName("validate")
	forward := Canonical(validate, []string{"noLiterals", "noIsArrayCheck"}, "")
	reverse := Canonical(validate, []string{"noIsArrayCheck", "noLiterals"}, "")
	if forward != reverse {
		t.Fatalf("Canonical is option-order-dependent: %q vs %q", forward, reverse)
	}
	if FnHashFor(validate, []string{"noLiterals", "noIsArrayCheck"}, "") != FnHashFor(validate, []string{"noIsArrayCheck", "noLiterals"}, "") {
		t.Fatal("FnHashFor is option-order-dependent")
	}
}

func TestCanonicalDistinguishesOptionSets(t *testing.T) {
	validate, _ := ByName("validate")
	plain := FnHashFor(validate, nil, "")
	noLiterals := FnHashFor(validate, []string{"noLiterals"}, "")
	if plain == noLiterals {
		t.Fatal("plain and noLiterals validate must hash differently")
	}
}

func TestFnHashVersionSensitive(t *testing.T) {
	original := constants.Version
	defer func() { constants.Version = original }()

	constants.Version = "v1.test"
	one := FnHash("validate|")
	constants.Version = "v2.test"
	two := FnHash("validate|")
	if one == two {
		t.Fatalf("FnHash not version-sensitive: %q == %q across versions", one, two)
	}
}

func TestByFnKey(t *testing.T) {
	cases := map[string]string{
		"val":          "validate",
		"verr":          "validationErrors",
		"jsonEncoder": "jsonEncoder",
		"jsonDecoder": "jsonDecoder",
		"tb":          "toBinary",
	}
	for fnKey, wantName := range cases {
		op, ok := ByFnKey(fnKey)
		if !ok {
			t.Errorf("ByFnKey(%q) not found", fnKey)
			continue
		}
		if op.Name != wantName {
			t.Errorf("ByFnKey(%q).Name = %q, want %q", fnKey, op.Name, wantName)
		}
	}
	if _, ok := ByFnKey("prepareForJson"); ok {
		t.Error("internal primitive prepareForJson must not be reachable by FnKey")
	}
}

func TestByFamilyTag(t *testing.T) {
	op, ok := ByFamilyTag("pj")
	if !ok || op.Name != "prepareForJson" {
		t.Fatalf("ByFamilyTag(\"pj\") = %+v, %v; want prepareForJson", op, ok)
	}
	// Composite operations have no family tag and must not be indexed.
	if _, ok := ByFamilyTag(""); ok {
		t.Error("empty family tag must not resolve")
	}
}

func TestPlainHashMatchesDefaultVariant(t *testing.T) {
	validate, _ := ByName("validate")
	if PlainHash("validate") != FnHashFor(validate, nil, "") {
		t.Fatal("PlainHash must equal the default-variant fnHash")
	}
	// jsonEncoder's plain form is its default strategy.
	jsonEncoder, _ := ByName("jsonEncoder")
	if PlainHash("jsonEncoder") != FnHashFor(jsonEncoder, nil, jsonEncoder.DefaultStrategy) {
		t.Fatal("PlainHash for a composite must equal its default-strategy fnHash")
	}
}
