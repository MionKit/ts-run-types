// Package cachetpl owns the hand-authored cache-module skeletons and the
// splice helper that merges Go-generated factory calls into them.
//
// The canonical skeletons live under
// packages/ts-go-run-types/src/caches/*.ts so devs see the cache shape
// next to the rest of the package source. The copies under
// skeletons/ here mirror them for `go:embed` (Go cannot embed files
// outside the module root). The scripts/sync-cache-skeletons.sh script
// (run via `pnpm run gen:cache-skeletons`, or as part of pre-commit /
// CI) keeps the two in sync.
package cachetpl

import (
	"embed"
	"errors"
	"fmt"
	"strings"
)

//go:embed skeletons/runTypesCache.ts skeletons/isTypeCache.ts skeletons/parsedFnsCache.ts
var skeletons embed.FS

// MarkerLine is the comment text the splice helper looks for in each
// skeleton. The exact spelling must match the marker comment in the
// hand-authored files under packages/ts-go-run-types/src/caches/.
//
// Whitespace before and after the marker on the matched line is
// preserved so the generated region keeps the surrounding indentation
// readable.
const MarkerLine = "// #### REPLACE HERE ####"

// Skeleton names — match the file names under skeletons/.
const (
	SkeletonRunTypes  = "runTypesCache.ts"
	SkeletonIsType    = "isTypeCache.ts"
	SkeletonParsedFns = "parsedFnsCache.ts"
)

// Splice loads the named skeleton, replaces the single MarkerLine line
// with the supplied generated body, and returns the assembled module
// text. The generated body is inserted verbatim (newline-terminated when
// non-empty) — the caller controls the indentation of every emitted
// line.
//
// Returns an error if the skeleton can't be loaded or the marker is
// missing / appears more than once. The exact-one-marker check guards
// against silent drift: if a future edit removes or duplicates the
// marker, every renderer fails loudly instead of producing a malformed
// module body.
func Splice(name string, body string) (string, error) {
	skeleton, err := skeletons.ReadFile("skeletons/" + name)
	if err != nil {
		return "", fmt.Errorf("cachetpl.Splice: load skeleton %q: %w", name, err)
	}
	return spliceInto(string(skeleton), body)
}

// spliceInto is the splice routine factored out for testing without
// touching the embedded FS.
func spliceInto(skeleton string, body string) (string, error) {
	matches := strings.Count(skeleton, MarkerLine)
	if matches == 0 {
		return "", errors.New("cachetpl.Splice: marker comment not found in skeleton")
	}
	if matches > 1 {
		return "", fmt.Errorf("cachetpl.Splice: marker comment appears %d times; expected exactly one", matches)
	}
	// Replace the entire marker LINE (leading indent + trailing newline)
	// so the generated body lands at column 0 unless the body itself
	// supplies leading whitespace. The marker is a single line — find
	// its line bounds and swap.
	idx := strings.Index(skeleton, MarkerLine)
	lineStart := idx
	for lineStart > 0 && skeleton[lineStart-1] != '\n' {
		lineStart--
	}
	lineEnd := idx + len(MarkerLine)
	for lineEnd < len(skeleton) && skeleton[lineEnd] != '\n' {
		lineEnd++
	}
	// Drop the trailing newline (if any) so the body terminates with its
	// own newline cadence.
	if lineEnd < len(skeleton) && skeleton[lineEnd] == '\n' {
		lineEnd++
	}
	body = ensureTrailingNewline(body)
	return skeleton[:lineStart] + body + skeleton[lineEnd:], nil
}

// ensureTrailingNewline appends `\n` when body is non-empty and does not
// already end with one. Keeps the spliced text consistent regardless of
// the caller's last-line termination.
func ensureTrailingNewline(body string) string {
	if body == "" {
		return ""
	}
	if strings.HasSuffix(body, "\n") {
		return body
	}
	return body + "\n"
}
