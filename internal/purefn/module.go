package purefn

import (
	"io"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// PureFnsModule writes the JS source body for the pureFns cache
// module: the hand-authored skeleton at
// packages/ts-go-run-types/src/caches/pureFnsCache.ts with the marker
// line replaced by one `factory(<key>, <bodyHash>, <paramNames>, <code>,
// <pureFnDependencies>, <createPureFn>)` call per extracted entry.
//
// The createPureFn argument is an inline `function(utl){…}` literal
// whose body is the same `code` string templated in directly. The
// cache module is the canonical runtime home of every pure-fn body —
// the Vite plugin separately rewrites the user's
// `registerPureFnFactory(ns, fn, factory)` call to pass `null` as the
// factory argument so the body is not duplicated in the user bundle.
// See Replacements for the byte-range rewrite list that drives that
// substitution.
//
// Output is deterministic: entries are emitted in the order they
// appear in the input slice (ExtractFromProgram already sorts
// alphabetically by key).
func PureFnsModule(writer io.Writer, entries []ParsedFn) error {
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
		body.WriteByte(',')
		body.WriteString(depKeysJS(entry.PureFnDependencies))
		body.WriteByte(',')
		body.WriteString(createPureFnJS(entry.Code))
		body.WriteString(");\n")
	}
	out, err := cachetpl.Splice(cachetpl.SkeletonPureFns, body.String())
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, out)
	return err
}

// Replacements builds the wire-shaped byte-range rewrites that null
// out the third argument of every successfully-extracted
// `registerPureFnFactory(ns, fn, factory)` call. The Vite plugin
// applies these in `rewrite.ts` so the user's source ends up with
// `registerPureFnFactory('mion','foo', null)` instead of the original
// function literal.
//
// Entries without FactoryArgStart/End populated (e.g. a synthetic
// ParsedFn built by a test) are skipped — only real extraction
// results carry the byte offsets needed to rewrite source.
func Replacements(entries []ParsedFn) []protocol.Replacement {
	var out []protocol.Replacement
	for _, entry := range entries {
		if entry.FilePath == "" || entry.FactoryArgEnd <= entry.FactoryArgStart {
			continue
		}
		out = append(out, protocol.Replacement{
			File:  entry.FilePath,
			Start: entry.FactoryArgStart,
			End:   entry.FactoryArgEnd,
			Text:  "null",
		})
	}
	return out
}

// createPureFnJS templates the type-stripped factory body into a
// `function(utl){<code>}` expression. The body is wrapped in parens so
// it parses as a function expression when emitted as a call argument.
func createPureFnJS(code string) string {
	var b strings.Builder
	b.Grow(len(code) + 20)
	b.WriteString("function(utl){")
	b.WriteString(code)
	b.WriteByte('}')
	return b.String()
}

// depKeysJS renders a `["a::b","c::d"]` JS array literal of quoted dep
// keys. Empty/nil slices become `[]` so consumers can always treat the
// field as iterable.
func depKeysJS(keys []string) string {
	if len(keys) == 0 {
		return "[]"
	}
	parts := make([]string, len(keys))
	for i, key := range keys {
		parts[i] = quoteJS(key)
	}
	return "[" + strings.Join(parts, ",") + "]"
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
