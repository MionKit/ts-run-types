package runtype

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TestVersionEmbedded_HashesDifferAcrossVersions — the same structural
// type, hashed by two Caches built under different constants.Version
// values, must produce different short hashes. This is the contract
// that lets the on-disk JIT cache key by typeID without an extra
// per-version path component.
func TestVersionEmbedded_HashesDifferAcrossVersions(t *testing.T) {
	originalVersion := constants.Version
	t.Cleanup(func() { constants.Version = originalVersion })

	constants.Version = "v-test-A"
	cacheA := NewCache(nil, Options{})
	idA := cacheA.SerializeAtomicKind(protocol.KindString)

	constants.Version = "v-test-B"
	cacheB := NewCache(nil, Options{})
	idB := cacheB.SerializeAtomicKind(protocol.KindString)

	if idA == "" || idB == "" {
		t.Fatalf("expected non-empty ids, got %q / %q", idA, idB)
	}
	if idA == idB {
		t.Errorf("typeID stable across versions: both %q (version embedding broken)", idA)
	}
}

// TestVersionEmbedded_IdempotentWithinVersion — within a single
// constants.Version, repeat serializations must still produce the
// same short hash (the idempotence invariant the disk cache relies on).
func TestVersionEmbedded_IdempotentWithinVersion(t *testing.T) {
	originalVersion := constants.Version
	t.Cleanup(func() { constants.Version = originalVersion })

	constants.Version = "v-idem-fixture"
	cache := NewCache(nil, Options{})
	first := cache.SerializeAtomicKind(protocol.KindString)
	second := cache.SerializeAtomicKind(protocol.KindString)
	if first == "" {
		t.Fatal("empty id")
	}
	if first != second {
		t.Errorf("non-idempotent typeID: first=%q second=%q", first, second)
	}
}

// TestStructuralForHash_Roundtrip — the reverse map the disk-cache
// layer relies on must return the unsalted structural id for every
// interned wire id, even though dict.Unique sees the version-salted
// form.
func TestStructuralForHash_Roundtrip(t *testing.T) {
	originalVersion := constants.Version
	t.Cleanup(func() { constants.Version = originalVersion })
	constants.Version = "v-roundtrip"

	cache := NewCache(nil, Options{})
	id := cache.SerializeAtomicKind(protocol.KindString)
	structural := cache.StructuralForHash(id)
	if structural == "" {
		t.Fatalf("StructuralForHash(%q) returned empty", id)
	}
	if back := cache.HashForStructural(structural); back != id {
		t.Errorf("HashForStructural roundtrip failed: %q → %q → %q", id, structural, back)
	}
	// Crucially: the structural string must NOT contain the version
	// prefix. The disk layer compares structural ids across builds, so
	// any version leakage here would break cross-version verification.
	if testContains(structural, constants.Version) {
		t.Errorf("structural id leaked version prefix: %q (Version=%q)", structural, constants.Version)
	}
}

// testContains is a local substring check kept here (instead of
// importing strings) so the file's import block stays minimal.
func testContains(haystack, needle string) bool {
	if needle == "" {
		return false
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
