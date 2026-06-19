package resolver

import (
	"errors"
	"fmt"
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
		return nil, unwritableOutDirError(typesDir, err)
	}
	// Rewrite the inter-module virtual:rt imports baked into each module to
	// paths relative to that module, so the on-disk files resolve natively in
	// any bundler (the wire sources still use virtual specifiers).
	onDisk := make(map[string]string, len(modules))
	for basename, source := range modules {
		onDisk[basename] = relativizeModuleImports(basename, source)
	}
	if _, err := materializeModules(typesDir, onDisk); err != nil {
		return nil, unwritableOutDirError(typesDir, err)
	}
	if err := pruneStaleModules(typesDir, onDisk); err != nil {
		return nil, unwritableOutDirError(typesDir, err)
	}
	manifest := make([]string, 0, len(onDisk))
	for basename := range onDisk {
		manifest = append(manifest, basename)
	}
	sort.Strings(manifest)
	return manifest, nil
}

// unwritableOutDirError wraps a write failure in the output tree with an
// actionable message. Files-mode has NO virtual-module fallback — a writable
// project dir is required at build time — so a permission / read-only-FS
// failure here is fatal and the user needs to know exactly why and how to fix
// it (point `outDir` at a writable path, or build where the tree is writable).
func unwritableOutDirError(typesDir string, err error) error {
	lower := strings.ToLower(err.Error())
	if errors.Is(err, fs.ErrPermission) || strings.Contains(lower, "read-only") || strings.Contains(lower, "permission denied") {
		return fmt.Errorf("cannot write generated RunTypes modules under %s: %w — files-mode needs a writable output dir; set the plugin's `outDir` to a writable path or build where the project tree is writable", typesDir, err)
	}
	return fmt.Errorf("writing generated RunTypes modules under %s: %w", typesDir, err)
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

// outputDirName is the project-folder name the files-mode output lands under
// when no explicit outDir is configured: <srcDir>/runtypes/{types,enriched}.
const outputDirName = "runtypes"

// resolveOutDir turns the request's (possibly empty) OutDir into the absolute
// output root. An explicit value is absolutized as-is; an empty value infers
// <srcDir>/runtypes from the tsconfig so a consumer that can't parse tsconfig
// (the dependency-free plugin) gets a sensible default it can adopt.
func (resolver *Resolver) resolveOutDir(requested string) string {
	if requested != "" {
		return resolver.absPath(requested)
	}
	return filepath.Join(resolver.inferSrcDir(), outputDirName)
}

// inferSrcDir picks the project's source root — the base for the default
// files-mode output dir. Preference order mirrors how a human reads a
// tsconfig: an explicit rootDir wins; else the common-ancestor directory of
// the program's own root files (the matched include set, node_modules
// excluded); else baseUrl; else the working dir.
func (resolver *Resolver) inferSrcDir() string {
	cwd := resolver.workingDir()
	if resolver.Program == nil || resolver.Program.TS == nil {
		return cwd
	}
	options := resolver.Program.TS.Options()
	// rootDir wins only when it sits at or below the working dir. A rootDir
	// ABOVE cwd (e.g. tsconfig.test.json's `rootDir: "../.."`, set wide to
	// type-check sibling packages) is an emit-root signal, not a source-root
	// one — honoring it would drop the output tree outside the project. In
	// that case fall through to the common-ancestor of the actual files.
	if options != nil && options.RootDir != "" {
		if rootDir := resolver.absPath(options.RootDir); isWithin(cwd, rootDir) {
			return rootDir
		}
	}
	if ancestor := commonDir(resolver.projectRootFiles()); ancestor != "" {
		return ancestor
	}
	if options != nil && options.BaseUrl != "" {
		return resolver.absPath(options.BaseUrl)
	}
	return cwd
}

// isWithin reports whether target is base itself or a descendant of it. Both
// are compared as forward-slash paths so the prefix test is separator-safe.
func isWithin(base, target string) bool {
	if base == "" {
		return false
	}
	base = strings.TrimSuffix(filepath.ToSlash(base), "/")
	target = strings.TrimSuffix(filepath.ToSlash(target), "/")
	return target == base || strings.HasPrefix(target, base+"/")
}

// projectRootFiles is the program's own root file set (the tsconfig-matched
// include list, or the inferred program's explicit file names), with
// node_modules-resolved entries dropped so a dependency .d.ts can't drag the
// common-ancestor up to a shared parent.
func (resolver *Resolver) projectRootFiles() []string {
	if resolver.Program == nil || resolver.Program.TS == nil {
		return nil
	}
	commandLine := resolver.Program.TS.CommandLine()
	if commandLine == nil {
		return nil
	}
	files := make([]string, 0)
	for _, name := range commandLine.FileNames() {
		if name == "" || strings.Contains(filepath.ToSlash(name), "/node_modules/") {
			continue
		}
		files = append(files, name)
	}
	return files
}

// commonDir returns the deepest directory that contains every path's parent
// directory, or "" when the paths share no meaningful common root (spread
// across the filesystem). Operates on forward-slash segments — tsgo paths are
// already normalized that way.
func commonDir(paths []string) string {
	var segmented [][]string
	for _, p := range paths {
		if p == "" {
			continue
		}
		dir := filepath.ToSlash(filepath.Dir(p))
		segmented = append(segmented, strings.Split(dir, "/"))
	}
	if len(segmented) == 0 {
		return ""
	}
	common := segmented[0]
	for _, segments := range segmented[1:] {
		limit := min(len(common), len(segments))
		matched := 0
		for matched < limit && common[matched] == segments[matched] {
			matched++
		}
		common = common[:matched]
	}
	// A lone leading "" means the paths only share the filesystem root — not a
	// useful source dir, so let the caller fall through to baseUrl/cwd.
	if len(common) <= 1 {
		return ""
	}
	return strings.Join(common, "/")
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
