package resolver

import (
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/enrich"
	"github.com/mionkit/ts-runtypes/internal/enrich/astcheck"
	"github.com/mionkit/ts-runtypes/internal/enrich/mirror"
)

// checkEnrichFiles is the Request.CheckEnrich pass of OpScanFiles: the
// enrichment-health diagnostics (FamilyEnrich) for every requested file that
// looks like an enrichment mirror. Three groups per file, one text read:
//
//   - tag hygiene (FT020–FT022 / MD020–MD022, per the mirror's family) — pure
//     text scan over the Program's view of the file (mirror.ScanDirtyTags), so
//     unsaved overlay text is honored;
//   - FriendlyText / MockData content validity (FT/MD codes) — the shared
//     astcheck walk against this resolver's checker + runtype cache;
//   - breadcrumb drift (GE002/GE003) — the mirror's source link, read from
//     disk (mirrors track on-disk sources).
//
// Non-enrichment files and files the Program doesn't carry contribute
// nothing; the pass never fails the op. Sites echo the REQUESTED path,
// matching the marker scanner's convention, so the consumer can key
// diagnostics back to the file it asked about.
func (resolver *Resolver) checkEnrichFiles(files []string) []diag.Diagnostic {
	var out []diag.Diagnostic
	if resolver.Program == nil {
		return out
	}
	for _, file := range files {
		sourceFile, err := resolver.sourceFile(file)
		if err != nil || sourceFile == nil {
			continue
		}
		text := sourceFile.Text()
		if !mirror.IsEnrichmentFile(text) {
			continue
		}

		lineIndex := mirror.NewLineIndex(text)
		classifier := mirror.NewFamilyClassifier(text)
		for _, tag := range mirror.ScanDirtyTags(text) {
			out = append(out, diag.New(tagCode(tag.Kind, classifier.FamilyFor(tag)), tagSite(file, lineIndex, tag)))
		}

		for _, finding := range astcheck.CheckSourceFile(sourceFile, resolver.checker, resolver.cache, resolver.Program.FS, file) {
			out = append(out, enrichDiagnostic(finding.Code, finding.Severity, finding.Args, finding.Site))
		}

		// Drift only applies to GENERATED mirrors (marker emit form present as
		// a real comment): a hand-written file that merely annotates consts
		// with FriendlyText / MockData has ordinary relative imports, not a
		// breadcrumb. `check` and `gen --check` — where the user explicitly
		// targets enrichment files — stay ungated.
		if mirror.HasMarkerComment(text) {
			absolutePath := tspath.ResolvePath(resolver.Program.TS.GetCurrentDirectory(), file)
			for _, drift := range mirror.CheckBreadcrumbDrift(absolutePath, text, resolver.Program.FS) {
				out = append(out, diag.New(drift.Code, tagSite(file, lineIndex, mirror.TagFinding{Start: drift.Start, End: drift.End}), drift.Args...))
			}
		}
	}
	return out
}

// enrichDiagnostic builds the wire diagnostic for one content finding. Known
// codes go through diag.New (severity owned by the catalog); an UNREGISTERED
// code — a checker code that landed without a codes_friendly.go /
// codes_mock.go entry — must not panic the resolver mid-lint, so it is built
// manually with the finding's own severity. The JS side renders unknown codes with its own fallback, so
// the finding still reaches the user either way.
func enrichDiagnostic(code string, severity enrich.Severity, args []string, site diag.Site) diag.Diagnostic {
	if _, known := diag.Definitions[code]; known {
		return diag.New(code, site, args...)
	}
	diagnostic := diag.Diagnostic{Code: code, Family: diag.FamilyEnrich, Severity: diagSeverityFor(severity), Site: site}
	if len(args) > 0 {
		diagnostic.Args = args
	}
	return diagnostic
}

// diagSeverityFor maps an enrich.Severity onto the wire severity scheme.
func diagSeverityFor(severity enrich.Severity) diag.Severity {
	switch severity {
	case enrich.Error:
		return diag.SeverityError
	case enrich.Warning:
		return diag.SeverityWarning
	default:
		return diag.SeverityInfo
	}
}

// tagCode maps a hygiene TagKind + the finding's mirror family to its diag
// code. Since the per-family file split every hygiene code is family-specific
// (FT02x in a FriendlyText mirror, MD02x in a MockData mirror); an
// unattributable finding (no annotation, no DSL import — only possible in a
// degenerate hand-edited file) reports under the friendly code and the file
// path in the site tells the user the rest.
func tagCode(kind mirror.TagKind, family mirror.MirrorFamily) string {
	if family == mirror.FamilyMock {
		switch kind {
		case mirror.TagOrphan:
			return diag.CodeMockOrphanConst
		case mirror.TagOrphanChild:
			return diag.CodeMockOrphanField
		default:
			return diag.CodeMockTodo
		}
	}
	switch kind {
	case mirror.TagOrphan:
		return diag.CodeFriendlyOrphanConst
	case mirror.TagOrphanChild:
		return diag.CodeFriendlyOrphanField
	default:
		return diag.CodeFriendlyTodo
	}
}

// tagSite converts a byte-offset finding to a 1-based diag.Site on the
// requested file path.
func tagSite(file string, lineIndex *mirror.LineIndex, tag mirror.TagFinding) diag.Site {
	startLine, startCol := lineIndex.At(tag.Start)
	endLine, endCol := lineIndex.At(tag.End)
	return diag.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}
