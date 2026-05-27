package diag

import (
	"fmt"
	"strings"
)

// FormatTsc renders a Diagnostic in the canonical `tsc --pretty=false`
// line format:
//
//	<absPath>(<line>,<col>): <severity> <code>: <message>
//	  Related: <absPath>(<line>,<col>): <message>
//
// VS Code's built-in $tsc problem matcher parses this regex out of build
// task output and surfaces it in the Problems panel.
func FormatTsc(diagnostic Diagnostic) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "%s(%d,%d): %s %s: %s",
		diagnostic.Site.FilePath,
		diagnostic.Site.StartLine,
		diagnostic.Site.StartCol,
		SeverityLabel(diagnostic.Severity),
		diagnostic.Code,
		diagnostic.Message,
	)
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
