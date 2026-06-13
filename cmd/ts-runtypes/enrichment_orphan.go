package main

import (
	"os"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// findCarcass returns the @rtOrphan carcass for a reappearing desired const
// (matched by id + friendly/mock form), or nil. A restore un-comments it,
// recovering the author's preserved value.
func findCarcass(index *mirrorIndex, named enrichment.NamedConst, friendly bool) *carcassEntry {
	if named.TypeID == "" {
		return nil
	}
	return index.orphanCarcasses[typeFormKey(named.TypeID, friendly)]
}

// orphanConsts wraps each existing OWNED const that is no longer wanted in an
// `/* @rtOrphan … */` block, and returns the set of source type names that were
// orphaned (for the breadcrumb-clause recompute). The rule is CONSERVATIVE: a
// const is orphaned only when it is BOTH (a) absent from the desired set AND
// (b) its source type is no longer declared by the resolved breadcrumb source.
// Condition (b) is what distinguishes a genuinely-deleted type from one simply
// not in this gen invocation's closure (another type in the same mirror file) —
// the latter is left untouched.
func orphanConsts(ops *[]spliceOp, index *mirrorIndex, spec mirrorWrite) map[string]bool {
	orphanedTypeNames := map[string]bool{}
	if index.breadcrumb == nil {
		return orphanedTypeNames // no source link → can't safely judge declaration
	}
	resolvedSource := resolveBreadcrumb(spec.mirrorPath, index.breadcrumb.specifier)
	sourceText, err := readFileString(resolvedSource)
	if err != nil {
		return orphanedTypeNames // source unreadable → be conservative, orphan nothing
	}

	desiredVars := desiredVarSet(spec)
	for _, entry := range index.consts {
		if desiredVars[entry.varName] {
			continue // still wanted
		}
		typeName := entry.typeName
		if typeName == "" {
			continue // can't judge without a type name
		}
		if sourceDeclaresType(sourceText, typeName) {
			continue // the type still exists — not an orphan (just not in this closure)
		}
		// Orphan it: wrap the whole const (from its marker/keyword start to End) in
		// an @rtOrphan block, preserving the original text verbatim for restore.
		*ops = append(*ops, orphanConstOp(index.raw, entry))
		orphanedTypeNames[typeName] = true
	}
	return orphanedTypeNames
}

// orphanConstOp builds the splice that comments out a whole const as an
// @rtOrphan carcass. The range starts at the marker block (so the marker is
// preserved inside the carcass, carrying the id for a later restore) or the
// keyword when there is none, and runs to the statement End (plus a trailing
// newline). The preserved text keeps the const restorable verbatim.
func orphanConstOp(raw []byte, entry *constEntry) spliceOp {
	start := entry.tokenStart
	if entry.markerStart != entry.markerEnd {
		start = entry.markerStart
	}
	end := entry.end
	original := strings.TrimRight(string(raw[start:end]), "\n")
	replacement := "/* @rtOrphan " + sanitizeForComment(original) + " */"
	// Swallow a trailing newline so the carcass occupies the const's line cleanly.
	if end < len(raw) && raw[end] == '\n' {
		end++
		replacement += "\n"
	}
	return spliceOp{start: start, end: end, text: replacement}
}

// syncBreadcrumbClause recomputes the source breadcrumb's `{ … }` type-name
// clause from the surviving consts and replaces ONLY the clause (the
// `from '<src>'` specifier stays byte-identical). Surviving names = existing
// const type names (minus orphaned) ∪ DESIRED const type names that are declared
// in THIS mirror's source file (covers added AND restored consts). No-op when
// the recomputed clause equals the current one (idempotent).
func syncBreadcrumbClause(ops *[]spliceOp, index *mirrorIndex, spec mirrorWrite, orphanedTypeNames map[string]bool) {
	if index.breadcrumb == nil || index.breadcrumb.clauseStart == 0 {
		return
	}

	names := map[string]bool{}
	// Existing consts' type names, minus orphaned ones.
	for _, entry := range index.consts {
		if entry.typeName == "" || orphanedTypeNames[entry.typeName] {
			continue
		}
		names[entry.typeName] = true
	}
	// Every desired const whose type is declared in THIS source file — added,
	// restored, or property-merged in place.
	thisSource := tspath.NormalizePath(spec.sourceFile)
	for _, named := range spec.consts {
		declFile := named.DeclFile
		if declFile == "" {
			declFile = spec.sourceFile
		}
		if tspath.NormalizePath(declFile) == thisSource && named.TypeName != "" {
			names[named.TypeName] = true
		}
	}

	if len(names) == 0 {
		return // never empty the breadcrumb clause (would break the import)
	}
	sortedNames := make([]string, 0, len(names))
	for name := range names {
		sortedNames = append(sortedNames, name)
	}
	sort.Strings(sortedNames)
	newClause := strings.Join(sortedNames, ", ")

	current := string(index.raw[index.breadcrumb.clauseStart:index.breadcrumb.clauseEnd])
	if current == newClause {
		return // unchanged
	}
	*ops = append(*ops, spliceOp{start: index.breadcrumb.clauseStart, end: index.breadcrumb.clauseEnd, text: newClause})
}

// ensureCrossFileImports adds an `import { friendly*/mock* } from '<rel>'` line
// for each cross-file var the new const bodies reference whose home mirror file
// differs from this one AND which is not already imported. The new lines are
// inserted right after the existing import block (after the DSL import, or the
// breadcrumb). Returns merged unchanged when nothing is needed.
func ensureCrossFileImports(merged []byte, spec mirrorWrite, index *mirrorIndex, body string) []byte {
	if spec.out != "" {
		return merged // single-file --out: every const lives in one file, no imports
	}
	alreadyImported := map[string]bool{}
	for _, valueImport := range index.valueImports {
		for _, name := range valueImport.names {
			alreadyImported[name] = true
		}
	}

	thisSource := tspath.NormalizePath(spec.sourceFile)
	importsByMirror := map[string]map[string]bool{}
	for _, varName := range referencedVars(body) {
		if alreadyImported[varName] {
			continue
		}
		declFile, ok := spec.varDeclFile[varName]
		if !ok || tspath.NormalizePath(declFile) == thisSource {
			continue // intra-file or unknown — no import
		}
		targetMirror := spec.config.mirrorPath(declFile)
		if importsByMirror[targetMirror] == nil {
			importsByMirror[targetMirror] = map[string]bool{}
		}
		importsByMirror[targetMirror][varName] = true
	}
	if len(importsByMirror) == 0 {
		return merged
	}

	var newLines strings.Builder
	for _, line := range crossFileImportLines(spec.mirrorPath, importsByMirror) {
		newLines.WriteString(line)
	}

	insertAt := importBlockEnd(index)
	return []byte(string(merged[:insertAt]) + newLines.String() + string(merged[insertAt:]))
}

// importBlockEnd returns the byte offset just after the last import statement
// (DSL import, breadcrumb, or value imports — whichever ends latest), where new
// cross-file imports are inserted. Falls back to 0 when there are no imports.
func importBlockEnd(index *mirrorIndex) int {
	end := 0
	for _, entry := range []*importEntry{index.breadcrumb, index.dslImport} {
		if entry != nil && entry.end > end {
			end = entry.end
		}
	}
	for _, entry := range index.valueImports {
		if entry.end > end {
			end = entry.end
		}
	}
	// Advance past the import statement's trailing newline.
	if end > 0 && end < len(index.raw) && index.raw[end] == '\n' {
		end++
	}
	return end
}

// desiredVarSet collects the friendly + mock var names of the desired const set,
// honoring the wantFriendly / wantMock flags.
func desiredVarSet(spec mirrorWrite) map[string]bool {
	out := map[string]bool{}
	for _, named := range spec.consts {
		if spec.wantFriendly {
			out[named.FriendlyVar] = true
		}
		if spec.wantMock {
			out[named.MockVar] = true
		}
	}
	return out
}

// readFileString reads a file into a string, returning the error from os.
func readFileString(path string) (string, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}
