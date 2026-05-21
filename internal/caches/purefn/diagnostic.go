package purefn

import (
	"fmt"
	"strings"
)

// Diagnostic codes — private namespace PFE9xxx to avoid collision with
// anything TypeScript's compiler emits (TS2xxx/TS6xxx ranges are taken).
const (
	CodeNamespaceNotLiteral  = "PFE9001"
	CodeFunctionIDNotLiteral = "PFE9002"
	CodeFactoryNotInline     = "PFE9003"
	CodeBodyHashCollision    = "PFE9004"
	CodeDestructuredParam    = "PFE9005"

	// Purity-check codes — port of mion's eslint-plugin-mion
	// `pure-functions.ts` rule. Each violation maps to a separate code so
	// editors can show code-specific quick-fixes / docs links.
	CodePurityThis          = "PFE9006"
	CodePurityAwait         = "PFE9007"
	CodePurityYield         = "PFE9008"
	CodePurityDynamicImport = "PFE9009"
	CodePurityForbidden     = "PFE9010"
	CodePurityClosure       = "PFE9011"

	// CodeMissingPureFnDep surfaces when a JIT function recorded a
	// `utl.getPureFn(<ns>, <fn>)` dep that no scanned source file
	// satisfies. Authored by ValidatePureFnDependencies at the end of
	// compilation, after every contributing file has been indexed.
	CodeMissingPureFnDep = "PFE9012"

	// CodePurityDepNotLiteral surfaces when a pure-fn factory body
	// reaches `utl.getPureFn(...)` (or sibling) with an argument that
	// can't be resolved to a string literal at scan time. Static dep
	// extraction needs a literal so the dep graph is fully known before
	// the cache module is emitted.
	CodePurityDepNotLiteral = "PFE9013"
)

// Diagnostic is a single non-fatal extractor error. The Vite plugin re-emits
// each one via `this.warn(FormatTsc(diag))` so VS Code's `$tsc` problem
// matcher picks it up; the build never fails on these.
type Diagnostic struct {
	Code     string
	Category string // always "error" for now — see plan
	Message  string
	Site     DiagnosticSite
	Related  []RelatedSite
}

// DiagnosticSite is a 1-based source location.
type DiagnosticSite struct {
	FilePath  string
	StartLine int
	StartCol  int
	EndLine   int
	EndCol    int
}

type RelatedSite struct {
	DiagnosticSite
	Message string
}

// FormatTsc renders diag in the canonical `tsc --pretty=false` line format:
//
//	<absPath>(<line>,<col>): <category> <code>: <message>
//	  Related: <absPath>(<line>,<col>): <message>
//
// VS Code's built-in $tsc problem matcher parses this regex out of build-task
// output and surfaces it in the Problems panel.
func FormatTsc(diag Diagnostic) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s(%d,%d): %s %s: %s",
		diag.Site.FilePath, diag.Site.StartLine, diag.Site.StartCol,
		diag.Category, diag.Code, diag.Message)
	for _, related := range diag.Related {
		fmt.Fprintf(&b, "\n  Related: %s(%d,%d): %s",
			related.FilePath, related.StartLine, related.StartCol, related.Message)
	}
	return b.String()
}
