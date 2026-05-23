package purefns

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Index is a lookup-only view of an extraction result. The resolver
// builds one after ExtractFromProgram and reuses it for dep validation
// — every check is O(1). Carries:
//
//   - byKey: every successful registration the extractor saw, keyed by
//     "<namespace>::<functionName>". Same map shape consumers see in
//     virtual:runtypes-pure-fns.
//   - scanned: every absolute filePath that has already been parsed
//     for registerPureFnFactory call sites. Gates the lazy expansion
//     in ValidatePureFnDependencies — a file in this set never gets
//     re-parsed.
//
// Not safe for concurrent use; build per-dump.
type Index struct {
	byKey   map[string]Entry
	scanned map[string]bool
}

// NewIndex builds the lookup view from an extraction result. `files`
// is the slice ExtractFromProgram was called with — every file in it
// counts as scanned even when it contributed zero registrations, so
// later lazy expansion knows not to re-walk it.
func NewIndex(entries []Entry, files []string) *Index {
	idx := &Index{
		byKey:   make(map[string]Entry, len(entries)),
		scanned: make(map[string]bool, len(files)),
	}
	for _, entry := range entries {
		idx.byKey[entry.Key()] = entry
	}
	for _, file := range files {
		idx.scanned[file] = true
	}
	return idx
}

// Get returns the Entry registered under "<namespace>::<functionName>"
// if any, plus an ok flag.
func (idx *Index) Get(key string) (Entry, bool) {
	entry, ok := idx.byKey[key]
	return entry, ok
}

// Scanned reports whether filePath has already been walked. A true
// result means lazy expansion won't re-parse it.
func (idx *Index) Scanned(filePath string) bool {
	return idx.scanned[filePath]
}

// merge folds a single-file extraction result into the index. Dedup
// semantics mirror ExtractFromProgram: first occurrence wins. A
// mismatched bodyHash on the same key is silently shadowed here — the
// extractor's main pass surfaces PFE9004 collisions; the validation
// step intentionally doesn't double-author them for lazy-expanded
// files (the alternative would generate noise during incremental
// build flows).
func (idx *Index) merge(entries []Entry, filePath string) {
	for _, entry := range entries {
		if _, dup := idx.byKey[entry.Key()]; dup {
			continue
		}
		idx.byKey[entry.Key()] = entry
	}
	idx.scanned[filePath] = true
}

// ValidatePureFnDependencies cross-checks every dep recorded by RT
// walkers against idx. For deps whose registration is already in the
// index the check is an O(1) map lookup. For deps whose filePath was
// NOT part of the original program-wide scan, the file is parsed once
// (via lookup) and merged into idx — subsequent deps against the same
// path are then O(1). Already-scanned files are never re-parsed.
//
// Returns one PFE9012 diagnostic per unique missing key. Repeated
// references to the same missing key collapse to a single diagnostic
// — the RT compiler may register the same dep from multiple emitters
// and we don't want N copies of the same complaint in the editor's
// Problems panel.
//
// idx is mutated in-place when lazy expansion adds entries — the
// caller can keep using it afterwards (e.g. to inspect the now-larger
// scanned-files set).
func ValidatePureFnDependencies(typeChecker *checker.Checker, markerOpts marker.Options, deps []protocol.PureFnDep, idx *Index, lookup SourceFileLookup) []diag.Diagnostic {
	if idx == nil {
		return nil
	}
	var diagnostics []diag.Diagnostic
	seenMisses := make(map[string]bool, len(deps))
	for _, dep := range deps {
		key := dep.Namespace + "::" + dep.FunctionName
		if _, found := idx.Get(key); found {
			continue
		}
		// Maybe the dep references a file the main scan didn't cover.
		// Parse it once, merge, then re-check.
		if dep.FilePath != "" && !idx.Scanned(dep.FilePath) && lookup != nil {
			entries, _ := extractFromFile(typeChecker, markerOpts, lookup, dep.FilePath)
			idx.merge(entries, dep.FilePath)
			if _, found := idx.Get(key); found {
				continue
			}
		}
		if seenMisses[key] {
			continue
		}
		seenMisses[key] = true
		// Args: [key, expectedNamespace, expectedFunctionName, expectedFilePath].
		// The catalog template renders all four into the headline/detail.
		// File path may be empty when the dep was collected purely from a
		// RT walk with no source-level provenance.
		args := []string{key, dep.Namespace, dep.FunctionName, dep.FilePath}
		// No Site — the dep was collected from a RT walk, not a TS
		// source position. Future enhancement: have the rt walker
		// thread the source position of the utl.getPureFn(...) call
		// through to here.
		diagnostics = append(diagnostics, diag.New(
			diag.CodeMissingPureFnDep,
			diag.Site{},
			args...,
		))
	}
	return diagnostics
}
