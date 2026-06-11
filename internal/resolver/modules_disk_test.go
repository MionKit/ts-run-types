package resolver_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/cache/disk"
	"github.com/mionkit/ts-run-types/internal/compiled/typefns"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// Module-mode disk cache (v5) at the resolver seam: per-(typeID, fnHash)
// files under Options.CacheDir, read back through the renderKey path on
// later dispatches. Round-trip fidelity + staleness = miss.
//
// Marker coverage note: the fixture pairs the static form
// (`createValidate<User>()`) with the reflection form
// (`createValidate(user)`); both resolve the same id, so the disk entries
// and per-site closures must coincide.

// diskFixtureSources is the shared two-form validate fixture: User nests
// Address so the root entry persists a same-family dep ref.
func diskFixtureSources() map[string]string {
	return map[string]string{
		"a.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
export interface Address { city: string }
export interface User { name: string; address: Address }
export const isUser = createValidate<User>();`,
		"b.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
import type {User} from './a';
const user: User = {name: 'x', address: {city: 'y'}};
export const isUserReflect = createValidate(user);`,
	}
}

// setupDiskResolver builds a single-threaded resolver with the disk store
// rooted under cacheDir (shared across resolvers to model warm rebuilds).
func setupDiskResolver(t *testing.T, cacheDir string) *resolver.Resolver {
	t.Helper()
	return setupInlineWith(t, diskFixtureSources(), func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.CacheDir = cacheDir
	})
}

// scanDiskModules runs the module-mode scan over both fixture files.
func scanDiskModules(t *testing.T, r *resolver.Resolver) protocol.Response {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts", "b.ts"}, IncludeModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// rootEntryPath is the v5 on-disk location for one (typeID, fnHash) entry.
func rootEntryPath(r *resolver.Resolver, typeID, fnHash string) string {
	return filepath.Join(r.RTStore().Root(), typeID, fnHash+".json")
}

// readDiskEntry parses one persisted RTEntry.
func readDiskEntry(t *testing.T, path string) disk.RTEntry {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("expected cache file at %s: %v", path, err)
	}
	var entry disk.RTEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("cache file is not valid JSON: %v", err)
	}
	return entry
}

// writeDiskEntry persists a (tampered) RTEntry back to path.
func writeDiskEntry(t *testing.T, path string, entry disk.RTEntry) {
	t.Helper()
	raw, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal tampered entry: %v", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatalf("write tampered entry: %v", err)
	}
}

// TestModulesDisk_RoundTripPersistsV5AndHits — a module-mode scan with a
// wired CacheDir persists one v5 file per fn entry, keyed by fnHash (NOT the
// family tag); a second scan is byte-identical (Site.Deps + Modules); and a
// FRESH resolver over the same sources + store actually READS the files —
// proven by surfacing a sentinel line planted on disk.
func TestModulesDisk_RoundTripPersistsV5AndHits(t *testing.T) {
	cacheDir := t.TempDir()
	r := setupDiskResolver(t, cacheDir)
	cold := scanDiskModules(t, r)

	staticSite := siteFor(t, cold, "a.ts")
	reflectSite := siteFor(t, cold, "b.ts")
	if staticSite.ID != reflectSite.ID {
		t.Fatalf("static/reflect ids differ: %q vs %q", staticSite.ID, reflectSite.ID)
	}
	valHash := operations.PlainHash("validate")
	rootKey := valHash + "_" + staticSite.ID

	// v5 layout: <store>/<typeID>/<fnHash>.json — and NOT the legacy
	// family-tag basename.
	rootPath := rootEntryPath(r, staticSite.ID, valHash)
	entry := readDiskEntry(t, rootPath)
	if legacy := filepath.Join(r.RTStore().Root(), staticSite.ID, "val.json"); fileExists(legacy) {
		t.Errorf("v5 must key files by fnHash, found legacy tag basename %s", legacy)
	}
	if entry.Format != disk.FormatVersion {
		t.Errorf("persisted Format: got %d want %d", entry.Format, disk.FormatVersion)
	}
	if entry.StructuralID == "" {
		t.Errorf("persisted entry missing StructuralID")
	}
	// Line is the entry ARRAY literal — wrapping it must reproduce the
	// served module byte-for-byte.
	if want := cold.Modules[rootKey]; typefns.WrapEntryModule(entry.Line) != want {
		t.Errorf("WrapEntryModule(Line) != served module:\nline: %s\nwant: %s", entry.Line, want)
	}
	// Every dep (the Address child here) persists as a prefix-carrying
	// CrossFamilyRef; ChildRefs is no longer written.
	if len(entry.ChildRefs) != 0 {
		t.Errorf("v5 must not write ChildRefs, got %+v", entry.ChildRefs)
	}
	if len(entry.CrossFamilyRefs) != 1 || entry.CrossFamilyRefs[0].Prefix != valHash+"_" {
		t.Fatalf("expected one same-family dep ref with prefix %q, got %+v", valHash+"_", entry.CrossFamilyRefs)
	}
	childID := entry.CrossFamilyRefs[0].Hash
	if keyPosition(staticSite.Deps, valHash+"_"+childID) == -1 {
		t.Errorf("persisted dep ref %q not in the site closure %v", valHash+"_"+childID, staticSite.Deps)
	}
	if !fileExists(rootEntryPath(r, childID, valHash)) {
		t.Errorf("child entry file missing for %s", childID)
	}

	// Warm pass on the SAME resolver: byte-identical Deps + Modules.
	warm := scanDiskModules(t, r)
	warmStatic := siteFor(t, warm, "a.ts")
	if strings.Join(warmStatic.Deps, ",") != strings.Join(staticSite.Deps, ",") {
		t.Fatalf("warm Deps differ:\ncold: %v\nwarm: %v", staticSite.Deps, warmStatic.Deps)
	}
	for key, source := range cold.Modules {
		if warm.Modules[key] != source {
			t.Fatalf("warm module %q differs from cold render", key)
		}
	}

	// Hit-path proof on a FRESH resolver sharing the store: plant a sentinel
	// array literal in the root entry — if the walker re-ran we'd never see it.
	entry.Line = "['DISK_SENTINEL_" + rootKey + "']"
	writeDiskEntry(t, rootPath, entry)
	fresh := setupDiskResolver(t, cacheDir)
	hit := scanDiskModules(t, fresh)
	hitSource := hit.Modules[rootKey]
	if !strings.Contains(hitSource, "DISK_SENTINEL_") {
		t.Fatalf("fresh resolver did not hit the disk cache — sentinel missing:\n%s", hitSource)
	}
	if hitSource != typefns.WrapEntryModule(entry.Line) {
		t.Fatalf("hit module must be the wrapped persisted line:\n%s", hitSource)
	}
}

// TestModulesDisk_DepHashDriftFallsBackToFreshCompile — a persisted dep ref
// whose structural id now maps to a DIFFERENT hash must miss the whole
// entry: the walker re-runs (sentinel never surfaces) and the rewritten
// file carries the corrected ref.
func TestModulesDisk_DepHashDriftFallsBackToFreshCompile(t *testing.T) {
	cacheDir := t.TempDir()
	r := setupDiskResolver(t, cacheDir)
	cold := scanDiskModules(t, r)
	site := siteFor(t, cold, "a.ts")
	valHash := operations.PlainHash("validate")
	rootKey := valHash + "_" + site.ID
	rootPath := rootEntryPath(r, site.ID, valHash)

	entry := readDiskEntry(t, rootPath)
	if len(entry.CrossFamilyRefs) != 1 {
		t.Fatalf("fixture precondition: expected one dep ref, got %+v", entry.CrossFamilyRefs)
	}
	realChildHash := entry.CrossFamilyRefs[0].Hash
	entry.Line = "['DRIFT_SENTINEL']"
	entry.CrossFamilyRefs[0].Hash = "driftd"
	writeDiskEntry(t, rootPath, entry)

	fresh := setupDiskResolver(t, cacheDir)
	resp := scanDiskModules(t, fresh)
	source := resp.Modules[rootKey]
	if strings.Contains(source, "DRIFT_SENTINEL") {
		t.Fatalf("dep-hash drift must be a miss, but the stale line was served:\n%s", source)
	}
	if source != cold.Modules[rootKey] {
		t.Fatalf("post-miss recompile must reproduce the original module:\ncold: %s\ngot:  %s", cold.Modules[rootKey], source)
	}
	// The miss rewrites the file with the corrected ref.
	rewritten := readDiskEntry(t, rootPath)
	if len(rewritten.CrossFamilyRefs) != 1 || rewritten.CrossFamilyRefs[0].Hash != realChildHash {
		t.Errorf("rewritten entry must restore the real dep hash %q, got %+v", realChildHash, rewritten.CrossFamilyRefs)
	}
	if strings.Contains(rewritten.Line, "DRIFT_SENTINEL") {
		t.Errorf("rewritten entry still carries the stale line: %q", rewritten.Line)
	}
}

// TestModulesDisk_FormatMismatchFallsBackToFreshCompile — a file written
// under an older FormatVersion must miss (stale layout) and be rewritten as
// v5 by the fresh compile.
func TestModulesDisk_FormatMismatchFallsBackToFreshCompile(t *testing.T) {
	cacheDir := t.TempDir()
	r := setupDiskResolver(t, cacheDir)
	cold := scanDiskModules(t, r)
	site := siteFor(t, cold, "a.ts")
	valHash := operations.PlainHash("validate")
	rootKey := valHash + "_" + site.ID
	rootPath := rootEntryPath(r, site.ID, valHash)

	entry := readDiskEntry(t, rootPath)
	entry.Format = disk.FormatVersion - 1
	entry.Line = "['STALE_FORMAT_SENTINEL']"
	writeDiskEntry(t, rootPath, entry)

	fresh := setupDiskResolver(t, cacheDir)
	resp := scanDiskModules(t, fresh)
	source := resp.Modules[rootKey]
	if strings.Contains(source, "STALE_FORMAT_SENTINEL") {
		t.Fatalf("format mismatch must be a miss, but the stale line was served:\n%s", source)
	}
	if source != cold.Modules[rootKey] {
		t.Fatalf("post-miss recompile must reproduce the original module")
	}
	rewritten := readDiskEntry(t, rootPath)
	if rewritten.Format != disk.FormatVersion {
		t.Errorf("rewritten entry Format: got %d want %d", rewritten.Format, disk.FormatVersion)
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
