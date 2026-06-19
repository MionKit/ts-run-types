package resolver

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// typesSubdir is the child of the RunTypes output root that holds the
// generated cache modules (the gitignored half). The committed enrichment
// half lives under a sibling `enriched/` dir handled by the enrich path.
const typesSubdir = "types"

// moduleFileExt is the on-disk extension for a generated entry module. The
// module basename (the cache key, e.g. `val_Foo1234`, `fns/val`, `pf/rt/foo`)
// becomes <typesDir>/<basename>.js — slashed basenames nest into subdirs.
const moduleFileExt = ".js"

// generateToDisk materializes every entry-module source under
// <outDir>/types/, prunes generated files no longer in the set, and returns
// the sorted manifest of live basenames. It is the filesystem analogue of
// shipping Response.EntryModules over the wire.
func generateToDisk(outDir string, modules map[string]string) ([]string, error) {
	typesDir := filepath.Join(outDir, typesSubdir)
	if err := os.MkdirAll(typesDir, 0o755); err != nil {
		return nil, err
	}
	// Rewrite the inter-module virtual:rt imports baked into each module to
	// paths relative to that module, so the on-disk files resolve natively in
	// any bundler (the wire sources still use virtual specifiers).
	onDisk := make(map[string]string, len(modules))
	for basename, source := range modules {
		onDisk[basename] = relativizeModuleImports(basename, source)
	}
	if _, err := materializeModules(typesDir, onDisk); err != nil {
		return nil, err
	}
	if err := pruneStaleModules(typesDir, onDisk); err != nil {
		return nil, err
	}
	manifest := make([]string, 0, len(onDisk))
	for basename := range onDisk {
		manifest = append(manifest, basename)
	}
	sort.Strings(manifest)
	return manifest, nil
}

// workingDir is the resolver's configured cwd — the base every relative file
// path and outDir resolves against — falling back to the Program's current
// directory.
func (resolver *Resolver) workingDir() string {
	if resolver.opts.Cwd != "" {
		return resolver.opts.Cwd
	}
	if resolver.Program != nil && resolver.Program.TS != nil {
		return resolver.Program.TS.GetCurrentDirectory()
	}
	return ""
}

// absPath resolves p against the resolver's working dir when relative, so the
// generate/transform relative-path math (filepath.Rel) sees consistent bases
// regardless of whether the caller passed absolute or cwd-relative paths.
func (resolver *Resolver) absPath(p string) string {
	if p == "" || filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(resolver.workingDir(), p)
}

// materializeModules writes each entry-module source to
// typesDir/<basename>.js, creating parent dirs for slashed basenames. It is
// write-only-on-change: a file whose on-disk bytes already equal the new
// source is left untouched, so a dev file-watcher is not retriggered for
// content-addressed modules that did not change. Returns the basenames it
// actually (re)wrote, sorted.
func materializeModules(typesDir string, modules map[string]string) ([]string, error) {
	written := make([]string, 0)
	for basename, source := range modules {
		path := filepath.Join(typesDir, filepath.FromSlash(basename)+moduleFileExt)
		if existing, err := os.ReadFile(path); err == nil && string(existing) == source {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, []byte(source), 0o644); err != nil {
			return nil, err
		}
		written = append(written, basename)
	}
	sort.Strings(written)
	return written, nil
}

// pruneStaleModules deletes any *.js under typesDir whose basename is not in
// the live module set — the GC that keeps the generated tree equal to the
// current build's output when a type (and its call sites) goes away. A
// missing typesDir is a no-op.
func pruneStaleModules(typesDir string, live map[string]string) error {
	if _, err := os.Stat(typesDir); os.IsNotExist(err) {
		return nil
	}
	return filepath.WalkDir(typesDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, moduleFileExt) {
			return nil
		}
		rel, relErr := filepath.Rel(typesDir, path)
		if relErr != nil {
			return relErr
		}
		basename := filepath.ToSlash(strings.TrimSuffix(rel, moduleFileExt))
		if _, ok := live[basename]; ok {
			return nil
		}
		return os.Remove(path)
	})
}
