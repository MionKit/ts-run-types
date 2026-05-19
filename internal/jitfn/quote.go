package jitfn

import "strings"

// quoteJS produces a single-quoted JS string literal, escaping the
// characters single-quote JS evaluation cares about. Single quotes are
// chosen so the surrounding JSON envelope (when this output is embedded
// in a serialized cache) keeps its escape budget small — same rationale
// as internal/emit/runtypes_module.go's quoteJS.
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

// stringSliceJS renders xs as a JS array literal of quoted strings.
// Empty/nil slices become `[]` (not `null`) so the rendered J(...) arg
// matches mion's `jitDependencies: []` / `pureFnDependencies: []`
// invariant on every entry.
func stringSliceJS(xs []string) string {
	if len(xs) == 0 {
		return "[]"
	}
	parts := make([]string, len(xs))
	for i, x := range xs {
		parts[i] = quoteJS(x)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
