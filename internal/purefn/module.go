package purefn

import (
	"io"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
)

// ParsedFnsModule writes the JS source body for the parsedFns cache
// module: the hand-authored skeleton at
// packages/ts-go-run-types/src/caches/parsedFnsCache.ts with the marker
// line replaced by one `factory('<ns>::<fn>', '<bodyHash>',
// [paramNames], '<code>');` call per extracted entry. The skeleton's
// `factory` closes over `jitUtils` from its enclosing
// `initCache(jitUtils)` parameter.
//
// Output is deterministic: entries are emitted in the order they appear
// in the input slice (ExtractFromProgram already sorts alphabetically
// by key).
func ParsedFnsModule(writer io.Writer, entries []ParsedFn) error {
	var body strings.Builder
	for _, entry := range entries {
		body.WriteString("factory(")
		body.WriteString(quoteJS(entry.Key()))
		body.WriteByte(',')
		body.WriteString(quoteJS(entry.BodyHash))
		body.WriteByte(',')
		body.WriteString(paramNamesJS(entry.ParamNames))
		body.WriteByte(',')
		body.WriteString(quoteJS(entry.Code))
		body.WriteString(");\n")
	}
	out, err := cachetpl.Splice(cachetpl.SkeletonParsedFns, body.String())
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, out)
	return err
}

// quoteJS renders s as a single-quoted JS string literal. Mirrors the same
// helper in internal/jitfn/quote.go (kept private to this package to avoid
// a cross-package edge for one tiny helper).
func quoteJS(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('\'')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '\'':
			b.WriteString(`\'`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('\'')
	return b.String()
}

func paramNamesJS(names []string) string {
	if len(names) == 0 {
		return "[]"
	}
	parts := make([]string, len(names))
	for i, name := range names {
		parts[i] = quoteJS(name)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
