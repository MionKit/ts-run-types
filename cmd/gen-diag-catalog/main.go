// gen-diag-catalog dumps the authoritative diagnostic catalog as JSON.
//
// internal/diag is the single source of truth for which diagnostic codes
// exist and what severity each one carries. This program imports that
// package, reads diag.Definitions, and prints one JSON array of
// {code, family, severity, title} records (sorted by code) to stdout.
//
// The website docs generator (scripts/gen-diag-catalog.mjs) consumes this
// dump and joins it with the JS-side message templates
// (packages/runtypes-devtools/src/diagnosticCatalog.ts) to build the data
// the diagnostics page renders. Severity lives here, headlines live there,
// so the merge is the only place that sees both.
//
// Run via the pnpm script:
//
//	pnpm run gen:diag-catalog
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/mionkit/ts-runtypes/internal/diag"
)

// record is the per-code shape emitted to stdout. Family and severity are
// rendered as their lowercase string labels so the JS side never has to
// mirror the numeric enum values.
type record struct {
	Code     string `json:"code"`
	Family   string `json:"family"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
}

// familyLabel maps the numeric Family to a stable lowercase string.
func familyLabel(family diag.Family) string {
	switch family {
	case diag.FamilyPureFn:
		return "purefn"
	case diag.FamilyMarker:
		return "marker"
	case diag.FamilyRunType:
		return "runtype"
	}
	return "unknown"
}

func main() {
	records := make([]record, 0, len(diag.Definitions))
	for _, definition := range diag.Definitions {
		records = append(records, record{
			Code:     definition.Code,
			Family:   familyLabel(definition.Family),
			Severity: diag.SeverityLabel(definition.Severity),
			Title:    definition.Title,
		})
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].Code < records[right].Code
	})

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(records); err != nil {
		fmt.Fprintln(os.Stderr, "gen-diag-catalog:", err)
		os.Exit(1)
	}
}
