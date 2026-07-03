package mirror

import (
	"regexp"
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
// tight even when a carcass spans many lines. BlockStart/BlockEnd bound the
// whole carcass for the orphan kinds (equal to Start/End for a @todo) — the
// family attribution reads the preserved const's annotation out of it.
type TagFinding struct {
	Kind       TagKind
	Start      int
	End        int
	BlockStart int
	BlockEnd   int
}

// MirrorFamily says which per-family mirror a file (or one finding in it)
// belongs to since the friendly/mock file split. Unknown means no signal —
// consumers fall back to the friendly-family code and the file path tells
// the user the rest.
type MirrorFamily int

const (
	FamilyUnknown MirrorFamily = iota
	FamilyFriendly
	FamilyMock
)

// IsEnrichmentFile is the scoping guard (defense in depth under the consumer's
// lint glob): hygiene only applies to files that look like enrichment mirrors —
// a reconcile marker in its EMIT form (`/** @rtType …`), or a CONST
// declaration annotated with the DSL types (`export const x: FriendlyType<…>`,
// the shape every scaffold emits — covering a freshly-scaffolded const whose
// unresolved root got no marker). The const annotation is matched with
// comments MASKED OUT, so neither the DSL package's own sources (declarations,
// `(map: FriendlyType<T>)` parameter annotations, prose with `@todo`) nor a
// JSDoc code example can make ordinary source read as a mirror.
func IsEnrichmentFile(text string) bool {
	if HasMarkerComment(text) {
		return true
	}
	masked := maskComments(text)
	return enrichConstAnnotationPattern.MatchString(masked)
}

// HasMarkerComment reports whether text carries a reconcile marker in its
// EMIT form — a comment that actually STARTS with `/** @rtType ` — as opposed
// to the prefix merely appearing inside a string literal (the generated
// diagnostic catalog embeds it in message text) or mid-comment prose. This is
// the guard signal for "generated mirror": IsEnrichmentFile's first branch
// and the resolver's breadcrumb-drift gate both key on it.
func HasMarkerComment(text string) bool {
	for _, span := range commentSpans(text) {
		if strings.HasPrefix(text[span.start:], MarkerCommentPrefix) {
			return true
		}
	}
	return false
}

// enrichConstAnnotationPattern matches a (possibly exported) const declaration
// annotated `: FriendlyType<` / `: MockData<` at the start of a line — the
// exact shape ConstBlock emits. `\s*` after the colon tolerates a formatter
// wrapping the annotation onto the next line.
var enrichConstAnnotationPattern = regexp.MustCompile(
	`(?m)^[ \t]*(?:export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(?:` +
		enrich.FriendlyTypeName + `|` + enrich.MockDataName + `)[ \t]*<`)

// maskComments blanks every comment byte (newlines preserved) so structural
// probes never match inside doc prose or JSDoc code examples.
func maskComments(text string) string {
	spans := commentSpans(text)
	if len(spans) == 0 {
		return text
	}
	masked := []byte(text)
	for _, span := range spans {
		for i := span.start; i < span.end && i < len(masked); i++ {
			if masked[i] != '\n' {
				masked[i] = ' '
			}
		}
	}
	return string(masked)
}

// ScanDirtyTags returns every dirty-tag occurrence in text, ordered by Start.
//
//   - Orphan carcasses are matched with the SAME pattern `gen --prune` removes
//     (orphanBlockPattern), so the rule reports exactly what prune would fix —
//     restricted to matches that START a real block comment, so the pattern
//     appearing inside a string literal (e.g. the generated diagnostic
//     catalog's own message text) or nested in JSDoc prose never fires.
//   - `@todo` is matched as a comment token (line or block comment; string
//     literals don't count) with an identifier boundary after it, so `@todos`
//     or a pool string containing "@todo" never fire.
//   - A `@todo` INSIDE an orphan carcass is part of the preserved const text —
//     prune removes it with the block — so it is not reported separately.
func ScanDirtyTags(text string) []TagFinding {
	commentStarts := map[int]bool{}
	for _, span := range commentSpans(text) {
		commentStarts[span.start] = true
	}

	var findings []TagFinding
	var carcasses [][2]int
	for _, match := range orphanBlockPattern.FindAllStringIndex(text, -1) {
		start, end := match[0], match[1]
		if !commentStarts[start] {
			continue // pattern bytes inside a string / another comment — not a carcass
		}
		kind, tag := TagOrphan, OrphanTag
		if strings.HasPrefix(text[start:], "/* "+OrphanChildTag) {
			kind, tag = TagOrphanChild, OrphanChildTag
		}
		tagStart := start + len("/* ")
		findings = append(findings, TagFinding{Kind: kind, Start: tagStart, End: tagStart + len(tag), BlockStart: start, BlockEnd: end})
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
			findings = append(findings, TagFinding{Kind: TagTodo, Start: offset, End: after, BlockStart: offset, BlockEnd: after})
		}
	}

	sort.Slice(findings, func(left, right int) bool { return findings[left].Start < findings[right].Start })
	return findings
}

// annotationFamilyPattern is the family-capturing twin of
// enrichConstAnnotationPattern; group 1 is the DSL type name.
var annotationFamilyPattern = regexp.MustCompile(
	`(?m)^[ \t]*(?:export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(` +
		enrich.FriendlyTypeName + `|` + enrich.MockDataName + `)[ \t]*<`)

// carcassAnnotationPattern reads the preserved const's annotation INSIDE an
// orphan carcass (comment text, so the anchored pattern cannot apply).
var carcassAnnotationPattern = regexp.MustCompile(
	`const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(` + enrich.FriendlyTypeName + `|` + enrich.MockDataName + `)[ \t]*<`)

// dslImportPattern captures the `import type { … } from 'ts-runtypes'` clause
// body — a per-family mirror imports exactly its own DSL type.
var dslImportPattern = regexp.MustCompile(`import[ \t]+type[ \t]*\{([^}]*)\}[ \t]*from[ \t]*['"]ts-runtypes['"]`)

// FamilyClassifier attributes findings in one mirror text to a MirrorFamily.
// Since the per-family split a generated mirror carries ONE family, read off
// its const annotations or its DSL import; per-finding attribution (nearest
// annotation, carcass-preserved annotation) keeps a transitional pre-split
// COMBINED file honest too.
type FamilyClassifier struct {
	text string
	// annotations are (offset, family) pairs of every live (non-comment)
	// DSL const annotation, in text order.
	offsets  []int
	families []MirrorFamily
	fallback MirrorFamily
}

// NewFamilyClassifier scans text once (comments masked, like the guard).
func NewFamilyClassifier(text string) *FamilyClassifier {
	classifier := &FamilyClassifier{text: text}
	masked := maskComments(text)
	for _, match := range annotationFamilyPattern.FindAllStringSubmatchIndex(masked, -1) {
		classifier.offsets = append(classifier.offsets, match[0])
		classifier.families = append(classifier.families, familyForName(masked[match[2]:match[3]]))
	}
	classifier.fallback = dslImportFamily(masked)
	return classifier
}

// FamilyFor attributes one dirty-tag finding: an orphan carcass by the
// annotation preserved INSIDE it, otherwise the nearest live annotation at or
// after the tag (a `@todo` sits right above its const), else the nearest one
// before it, else the file's DSL import, else Unknown.
func (classifier *FamilyClassifier) FamilyFor(finding TagFinding) MirrorFamily {
	if finding.Kind == TagOrphan || finding.Kind == TagOrphanChild {
		block := classifier.text[finding.BlockStart:min(finding.BlockEnd, len(classifier.text))]
		if match := carcassAnnotationPattern.FindStringSubmatch(block); match != nil {
			return familyForName(match[1])
		}
	}
	for i, offset := range classifier.offsets {
		if offset >= finding.Start {
			return classifier.families[i]
		}
	}
	if n := len(classifier.offsets); n > 0 {
		return classifier.families[n-1]
	}
	return classifier.fallback
}

// familyForName maps a DSL type name to its family.
func familyForName(name string) MirrorFamily {
	if name == enrich.MockDataName {
		return FamilyMock
	}
	return FamilyFriendly
}

// dslImportFamily reads the file-level fallback signal off the ts-runtypes
// DSL import clause: exactly one family's type imported → that family; both
// or neither → Unknown.
func dslImportFamily(text string) MirrorFamily {
	match := dslImportPattern.FindStringSubmatch(text)
	if match == nil {
		return FamilyUnknown
	}
	clause := match[1]
	hasFriendly := strings.Contains(clause, enrich.FriendlyTypeName)
	hasMock := strings.Contains(clause, enrich.MockDataName)
	switch {
	case hasFriendly && !hasMock:
		return FamilyFriendly
	case hasMock && !hasFriendly:
		return FamilyMock
	default:
		return FamilyUnknown
	}
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
