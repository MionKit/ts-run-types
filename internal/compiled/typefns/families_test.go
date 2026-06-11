package typefns

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/constants"
)

// TestFamilies_RegistryRoundTrip — every registry row resolves a real
// CacheModules entry, FamilyByKey round-trips it, and validate stays the
// LAST row (the registry order is load-bearing — see the Families doc).
func TestFamilies_RegistryRoundTrip(t *testing.T) {
	if len(Families) != 14 {
		t.Fatalf("expected 14 type-walking families, got %d", len(Families))
	}
	for _, spec := range Families {
		if spec.Settings.Tag == "" {
			t.Fatalf("family %q resolved empty settings — CacheModules key drift", spec.Key)
		}
		if FamilyByKey(spec.Key).Settings.Tag != spec.Settings.Tag {
			t.Fatalf("FamilyByKey(%q) returned a different family", spec.Key)
		}
	}
	if last := Families[len(Families)-1].Key; last != "validate" {
		t.Fatalf("validate must be the LAST registry row, got %q", last)
	}
}

// TestFamilies_EveryCacheModulesFamilyHasRow — every type-walking
// constants.CacheModules entry (everything except runTypes/pureFns, which
// aren't typefns families) has a registry row.
func TestFamilies_EveryCacheModulesFamilyHasRow(t *testing.T) {
	for key := range constants.CacheModules {
		if key == "runTypes" || key == "pureFns" {
			continue
		}
		found := false
		for _, spec := range Families {
			if spec.Key == key {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("CacheModules family %q has no Families registry row", key)
		}
	}
}

// TestFamilyByKey_PanicsOnUnknown — resolver wiring is static, so a typo
// must die loudly at lookup time rather than render an empty family.
func TestFamilyByKey_PanicsOnUnknown(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatalf("FamilyByKey on an unknown key must panic")
		}
	}()
	FamilyByKey("notAFamily")
}
