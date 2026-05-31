package typefns

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// JS accessor / string-literal helpers shared across the emitters. Relocated
// from istype.go.

// propertyAccessor builds the JS subscript expression for `parent.name`
// (safe identifier names) or `parent["name"]` (anything else). Mirrors
// mion's RunType `useArrayAccessor` / `getChildVarName` split applied
// to property names — protocol.IsSafeName captures the safe-name bit
// at resolver time so the emit doesn't repeat the regex.
func propertyAccessor(parent, name string, safe bool) string {
	if safe && name != "" {
		return parent + "." + name
	}
	return parent + "[" + quoteJS(name) + "]"
}

// quoteJSDouble produces a double-quoted JS string literal. Used for
// the regex-source string we pass to `new RegExp(...)` — double
// quotes avoid the escaping noise that single-quoting regex sources
// produces (regexes are dense with backslashes already).
func quoteJSDouble(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
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
	b.WriteByte('"')
	return b.String()
}

// positionStr returns the tuple element's index as a JS literal.
// Falls back to "0" when Position is nil (defensive — shouldn't
// happen for well-formed cache entries).
func positionStr(rt *protocol.RunType) string {
	if rt.Position == nil {
		return "0"
	}
	return strconv.Itoa(*rt.Position)
}

// joinAnd composes parts into a JS `a && b && c` chain, filtering
// empty entries the same way mion's `.filter(Boolean).join(' && ')`
// pattern does.
func joinAnd(parts []string) string {
	out := parts[:0]
	for _, part := range parts {
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return strings.Join(out, " && ")
}
