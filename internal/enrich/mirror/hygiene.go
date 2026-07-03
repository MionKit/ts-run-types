package mirror

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// hygiene.go detects the DIRTY enrichment tags this package's emitters write —
// the `@todo` scaffold flag and the `@rtOrphan` / `@rtOrphanChild` carcasses —
// so lint surfaces (the resolver's checkEnrich pass, `ts-runtypes check`, and
// the runtypes-devtools OXlint plugin behind them) can enforce clean, finished
// enrichment files on every commit. A clean file has NEITHER; the `@rtType` /
// `@rtIds` reconcile markers are legitimate on every generated const and are
// never reported. Detection derives from the same tags.go constants the
// emitters use, so emitter and detector cannot drift.

// TagKind identifies which dirty tag a hygiene finding matched.
type TagKind int

const (
	// TagTodo is an unfilled `@todo` scaffold flag (any @todo comment token,
	// not just the exact generated line — enrichment files are generated
	// artifacts; hand-parked todos don't belong there either).
	TagTodo TagKind = iota + 1
	// TagOrphan is a whole-const `/* @rtOrphan … */` carcass.
	TagOrphan
	// TagOrphanChild is a single-field `/* @rtOrphanChild … */` carcass.
	TagOrphanChild
)

// TagFinding is one dirty-tag occurrence. Start/End are byte offsets of the
// tag TOKEN itself (never the whole carcass block) so editor squiggles stay
// tight even when a carcass spans many lines.
type TagFinding struct {
	Kind  TagKind
	Start int
	End   int
}

// IsEnrichmentFile is the scoping guard (defense in depth under the consumer's
// lint glob): hygiene only applies to files that look like enrichment mirrors —
// a reconcile marker in its EMIT form (`/** @rtType …`), or a
// `: FriendlyType<` / `: MockData<` ANNOTATION (which covers a freshly-
// scaffolded const whose unresolved root got no marker). Both signals require
// the concrete generated shape — a bare "@rtType" in a string or comment, or
// the DSL package's own `export type FriendlyType<…>` declarations and prose
// (which may carry `@todo`), never match — so an accidentally broad lint glob
// cannot flag arbitrary code.
func IsEnrichmentFile(text string) bool {
	if strings.Contains(text, MarkerCommentPrefix) {
		return true
	}
	return hasEnrichAnnotation(text, enrich.FriendlyTypeName) || hasEnrichAnnotation(text, enrich.MockDataName)
}

// hasEnrichAnnotation reports whether text contains `: <name><` — the type
// ANNOTATION form (`const x: FriendlyType<T>`), tolerating whitespace between
// the colon and the name. A declaration (`export type FriendlyType<T>`) or a
// prose mention has no colon introducer and never matches.
func hasEnrichAnnotation(text, name string) bool {
	needle := name + "<"
	from := 0
	for {
		idx := strings.Index(text[from:], needle)
		if idx < 0 {
			return false
		}
		pos := from + idx
		from = pos + 1
		cursor := pos - 1
		for cursor >= 0 && isSpaceByte(text[cursor]) {
			cursor--
		}
		if cursor >= 0 && text[cursor] == ':' {
			return true
		}
	}
}

// ScanDirtyTags returns every dirty-tag occurrence in text, ordered by Start.
//
//   - Orphan carcasses are matched with the SAME pattern `gen --prune` removes
//     (orphanBlockPattern), so the rule reports exactly what prune would fix.
//   - `@todo` is matched as a comment token (line or block comment; string
//     literals don't count) with an identifier boundary after it, so `@todos`
//     or a pool string containing "@todo" never fire.
//   - A `@todo` INSIDE an orphan carcass is part of the preserved const text —
//     prune removes it with the block — so it is not reported separately.
func ScanDirtyTags(text string) []TagFinding {
	var findings []TagFinding
	var carcasses [][2]int
	for _, match := range orphanBlockPattern.FindAllStringIndex(text, -1) {
		start, end := match[0], match[1]
		kind, tag := TagOrphan, OrphanTag
		if strings.HasPrefix(text[start:], "/* "+OrphanChildTag) {
			kind, tag = TagOrphanChild, OrphanChildTag
		}
		tagStart := start + len("/* ")
		findings = append(findings, TagFinding{Kind: kind, Start: tagStart, End: tagStart + len(tag)})
		carcasses = append(carcasses, [2]int{start, end})
	}

	for _, comment := range commentSpans(text) {
		body := text[comment.start:comment.end]
		from := 0
		for {
			idx := strings.Index(body[from:], TodoTag)
			if idx < 0 {
				break
			}
			offset := comment.start + from + idx
			from += idx + len(TodoTag)
			after := offset + len(TodoTag)
			if after < len(text) && isIdentByte(text[after]) {
				continue // @todoSomething — not the tag
			}
			if insideRanges(carcasses, offset) {
				continue // preserved carcass text — the carcass finding covers it
			}
			findings = append(findings, TagFinding{Kind: TagTodo, Start: offset, End: after})
		}
	}

	sort.Slice(findings, func(left, right int) bool { return findings[left].Start < findings[right].Start })
	return findings
}

// commentSpan is a half-open [start, end) byte range covering one `//` line
// comment (through end of line) or one `/* … */` block comment (including its
// delimiters).
type commentSpan struct {
	start, end int
}

// commentSpans scans text once and returns every comment range, skipping
// string and template literals so a tag inside data never counts as a comment.
// Template `${…}` interpolations are treated as part of the string (a comment
// inside an interpolation is missed — the safe, under-reporting direction for
// generated data files).
func commentSpans(text string) []commentSpan {
	var spans []commentSpan
	i, n := 0, len(text)
	for i < n {
		switch text[i] {
		case '/':
			if i+1 < n && text[i+1] == '/' {
				start := i
				for i < n && text[i] != '\n' {
					i++
				}
				spans = append(spans, commentSpan{start, i})
				continue
			}
			if i+1 < n && text[i+1] == '*' {
				start := i
				i += 2
				for i+1 < n && !(text[i] == '*' && text[i+1] == '/') {
					i++
				}
				if i+1 < n {
					i += 2
				} else {
					i = n
				}
				spans = append(spans, commentSpan{start, i})
				continue
			}
			i++
		case '\'', '"':
			quote := text[i]
			i++
			for i < n && text[i] != quote && text[i] != '\n' {
				if text[i] == '\\' {
					i++
				}
				i++
			}
			if i < n {
				i++
			}
		case '`':
			i++
			for i < n && text[i] != '`' {
				if text[i] == '\\' {
					i++
				}
				i++
			}
			if i < n {
				i++
			}
		default:
			i++
		}
	}
	return spans
}

// insideRanges reports whether offset falls inside any half-open range.
func insideRanges(ranges [][2]int, offset int) bool {
	for _, r := range ranges {
		if offset >= r[0] && offset < r[1] {
			return true
		}
	}
	return false
}

// LineIndex converts byte offsets in a raw text (no AST required) to 1-based
// line/column pairs — the convention diag.Site and textpos share. Columns are
// byte columns; every tag this package emits is pure ASCII and sits before any
// non-ASCII text on its line, so tag columns are stable across encodings.
type LineIndex struct {
	starts  []int
	textLen int
}

// NewLineIndex builds the line-start table for text in one pass.
func NewLineIndex(text string) *LineIndex {
	starts := []int{0}
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			starts = append(starts, i+1)
		}
	}
	return &LineIndex{starts: starts, textLen: len(text)}
}

// At returns the 1-based (line, column) for a byte offset, clamped to the text.
func (index *LineIndex) At(offset int) (int, int) {
	if offset < 0 {
		offset = 0
	}
	if offset > index.textLen {
		offset = index.textLen
	}
	// Greatest line start <= offset.
	line := sort.Search(len(index.starts), func(i int) bool { return index.starts[i] > offset }) - 1
	return line + 1, offset - index.starts[line] + 1
}
