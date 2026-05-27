package diag

import (
	"fmt"
	"strings"
)

// FormatDebug renders a Diagnostic in a compact code+args+location form
// suitable for Go-side debug logs and test assertions. NOT the user-
// facing message — the JS-side catalog
// (packages/ts-go-run-types/src/jit/diagnosticCatalog.ts) owns user
// wording; the Vite plugin renders the final tsc-style line.
//
//	<absPath>(<line>,<col>): <severity> <code>(<arg0>, <arg1>, …)
//	  Related: <absPath>(<line>,<col>): <message>
func FormatDebug(diagnostic Diagnostic) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "%s(%d,%d): %s %s",
		diagnostic.Site.FilePath,
		diagnostic.Site.StartLine,
		diagnostic.Site.StartCol,
		SeverityLabel(diagnostic.Severity),
		diagnostic.Code,
	)
	if len(diagnostic.Args) > 0 {
		fmt.Fprintf(&builder, "(%s)", strings.Join(diagnostic.Args, ", "))
	}
	for _, related := range diagnostic.Related {
		fmt.Fprintf(&builder, "\n  Related: %s(%d,%d): %s",
			related.FilePath,
			related.StartLine,
			related.StartCol,
			related.Message,
		)
	}
	return builder.String()
}
