package enrichment

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Severity classifies a Finding's impact. Error fails the `check` command (exit
// 1); Warning / Info are advisory.
type Severity int

const (
	// Info is advisory only.
	Info Severity = iota
	// Warning is an authoring smell that does not fail the build.
	Warning
	// Error fails the `check` command.
	Error
)

// String renders a Severity for the text report.
func (severity Severity) String() string {
	switch severity {
	case Info:
		return "info"
	case Warning:
		return "warning"
	case Error:
		return "error"
	default:
		return "unknown"
	}
}

// MarshalJSON renders a Severity as its lowercase string so `--json` output is
// agent-readable ("error" / "warning" / "info") rather than a bare int.
func (severity Severity) MarshalJSON() ([]byte, error) {
	return json.Marshal(severity.String())
}

// Finding is one issue the paired walk found in an authored FriendlyType /
// MockData map. Code is the stable identifier (FT002, MD001, …); Path is the
// dotted field path inside the map (root is "").
type Finding struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	Path     string   `json:"path"`
	Message  string   `json:"message"`
}

// LiteralView is the minimal read-only view of an authored object-literal that
// the paired checkers walk. It is deliberately tiny so tests can fake it
// without a full Program; the CLI wraps the tsgo object-literal AST in an
// adapter (astLiteralView) that implements it.
//
//   - Keys lists the literal's property keys in declaration order.
//   - Child returns the nested object-literal view bound to key, or nil when
//     that key's value is not an object literal (a string, number, array,
//     arrow function, …). A nil return is how the checkers distinguish a
//     data-record `$errors` from a function-form `$errors`.
//   - StringValue returns the string-literal value bound to key (ok=false when
//     the key is absent or its value is not a string literal).
type LiteralView interface {
	Keys() []string
	Child(key string) LiteralView
	StringValue(key string) (string, bool)
}

// friendlyMetaKeys are the reserved `$`-meta keys a FriendlyType node may carry
// alongside its field children — never matched against the RunType's properties.
var friendlyMetaKeys = map[string]bool{
	"$label":  true,
	"$errors": true,
	"$items":  true,
}

// mockMetaKeys are the reserved keys a MockData node may carry alongside its
// field children — never matched against the RunType's properties.
var mockMetaKeys = map[string]bool{
	"$items":    true,
	"$length":   true,
	"$optional": true,
	"pool":      true,
	"min":       true,
	"max":       true,
}

// errorRecordReservedKeys are the always-valid keys inside an `$errors`
// data-record, regardless of the field's declared format constraints.
var errorRecordReservedKeys = map[string]bool{
	"type":     true,
	"$default": true,
}

// friendlyPlaceholders are the `$[…]` substitution names a friendly template
// string may reference.
var friendlyPlaceholders = map[string]bool{
	"label": true,
	"val":   true,
	"path":  true,
	"index": true,
}

// placeholderPattern matches `$[name]` placeholders in a friendly template.
var placeholderPattern = regexp.MustCompile(`\$\[(\w+)\]`)

// CheckFriendly walks an authored FriendlyType<T> map (literal) paired with the
// RunType T resolves to, collecting Findings. resolve follows KindRef sentinels
// in child slots; pass nil when the graph is fully inlined (the unit-test
// shape). See validate.go's package doc for the wired checks (FT002/FT003/FT005).
func CheckFriendly(rt *protocol.RunType, literal LiteralView, resolve func(id string) *protocol.RunType) []Finding {
	ctx := newWalkCtx(resolve)
	var findings []Finding
	checkFriendlyNode(&findings, ctx, rt, literal, "", 0)
	return findings
}

// CheckMock walks an authored MockData<T> map (literal) paired with the RunType
// T resolves to, collecting Findings (MD001 today).
func CheckMock(rt *protocol.RunType, literal LiteralView, resolve func(id string) *protocol.RunType) []Finding {
	ctx := newWalkCtx(resolve)
	var findings []Finding
	checkMockNode(&findings, ctx, rt, literal, "", 0)
	return findings
}

// TODO(refine): FT004 / MD002 (value-shape mismatch) are left to the TS type
// checker — the precise FriendlyType<T> / MockData<T> mapped types already
// reject a wrong-shaped value at the call site. MD003 (each pool value
// validates against the field) needs the runtime validator and is out of scope
// for this CLI pass. MD004 (min > max), FT010 / MD010 (authored-vs-current
// drift hash), and the always-on Vite-build integration (surfacing through the
// plugin Diagnostic channel) are deferred — `check` is CLI-only for now.

// childByName indexes a RunType's data-bearing property children by field name
// for O(1) pairing against literal keys.
func childByName(ctx *walkCtx, rt *protocol.RunType) map[string]*protocol.RunType {
	props := propertyChildren(ctx, rt)
	byName := make(map[string]*protocol.RunType, len(props))
	for _, prop := range props {
		byName[prop.Name] = prop
	}
	return byName
}

// joinPath appends segment to a dotted path (root path is "").
func joinPath(path, segment string) string {
	if path == "" {
		return segment
	}
	return path + "." + segment
}

func checkFriendlyNode(findings *[]Finding, ctx *walkCtx, rt *protocol.RunType, literal LiteralView, path string, depth int) {
	rt = ctx.deref(rt)
	if literal == nil || rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		return
	}

	// This node's own `$errors` describes failures OF THIS NODE — checked exactly
	// once, here, against this node's RunType (its declared format constraints, or
	// type/$default for an object). Leaf fields are handled here too: they return
	// at the `!isObjectLike` gate below without descending, so their `$errors` is
	// never re-visited (which is what previously double-counted nested objects).
	checkFriendlyErrors(findings, literal.Child("$errors"), rt, path)

	// An array node carries its child shape under `$items` — descend there
	// paired with the element RunType.
	if element := arrayElement(rt); element != nil {
		if items := literal.Child("$items"); items != nil {
			checkFriendlyNode(findings, ctx, element, items, joinPath(path, "$items"), depth+1)
		}
		return
	}

	if !isObjectLike(ctx, rt) {
		return
	}
	ctx.seen[rt] = true
	defer delete(ctx.seen, rt)

	byName := childByName(ctx, rt)
	for _, key := range literal.Keys() {
		if friendlyMetaKeys[key] {
			// $label / $errors / $items belong to the owning node, not a field —
			// $errors was handled above; $items only on arrays; $label is free text.
			continue
		}
		child, ok := byName[key]
		if !ok {
			// FT002: the map names a field T does not declare.
			*findings = append(*findings, Finding{
				Code:     "FT002",
				Severity: Error,
				Path:     joinPath(path, key),
				Message:  "unknown field '" + key + "' is not a property of the type",
			})
			continue
		}
		if nested := literal.Child(key); nested != nil {
			checkFriendlyNode(findings, ctx, child.Child, nested, joinPath(path, key), depth+1)
		}
	}
}

// checkFriendlyErrors validates a single `$errors` data-record (errorsView)
// against the field it belongs to. fieldNode is the field's RunType (nil at the
// object root, where `$errors` only describes the base `type` failure). A nil
// errorsView means the field used the function-form `$errors` (an arrow /
// function initializer, not an object literal) — skipped, opaque to us.
func checkFriendlyErrors(findings *[]Finding, errorsView LiteralView, fieldNode *protocol.RunType, path string) {
	if errorsView == nil {
		return
	}
	allowed := allowedErrorKeys(fieldNode)
	for _, key := range errorsView.Keys() {
		if !allowed[key] {
			// FT003: a constraint key that is neither type/$default nor one of the
			// field's declared format constraints.
			*findings = append(*findings, Finding{
				Code:     "FT003",
				Severity: Warning,
				Path:     joinPath(path, "$errors."+key),
				Message:  "error key '" + key + "' is not a declared constraint of this field",
			})
		}
		// FT005: scan the template string for bad `$[…]` placeholders.
		if template, ok := errorsView.StringValue(key); ok {
			checkPlaceholders(findings, template, joinPath(path, "$errors."+key))
		}
	}
}

// allowedErrorKeys returns the set of valid `$errors` record keys for a field:
// the always-valid type/$default plus the field's declared format constraints.
func allowedErrorKeys(fieldNode *protocol.RunType) map[string]bool {
	allowed := make(map[string]bool, len(errorRecordReservedKeys)+2)
	for key := range errorRecordReservedKeys {
		allowed[key] = true
	}
	if fieldNode != nil {
		for _, constraint := range formatConstraintKeys(fieldNode.FormatAnnotation) {
			allowed[constraint] = true
		}
	}
	return allowed
}

// checkPlaceholders emits FT005 for every `$[name]` in template whose name is
// not one of the recognised placeholders.
func checkPlaceholders(findings *[]Finding, template, path string) {
	for _, match := range placeholderPattern.FindAllStringSubmatch(template, -1) {
		name := match[1]
		if friendlyPlaceholders[name] {
			continue
		}
		*findings = append(*findings, Finding{
			Code:     "FT005",
			Severity: Warning,
			Path:     path,
			Message:  "unknown placeholder '$[" + name + "]' (expected one of label, val, path, index)",
		})
	}
}

func checkMockNode(findings *[]Finding, ctx *walkCtx, rt *protocol.RunType, literal LiteralView, path string, depth int) {
	rt = ctx.deref(rt)
	if literal == nil || rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		return
	}

	if element := arrayElement(rt); element != nil {
		if items := literal.Child("$items"); items != nil {
			checkMockNode(findings, ctx, element, items, joinPath(path, "$items"), depth+1)
		}
		return
	}

	if !isObjectLike(ctx, rt) {
		return
	}
	ctx.seen[rt] = true
	defer delete(ctx.seen, rt)

	byName := childByName(ctx, rt)
	for _, key := range literal.Keys() {
		if mockMetaKeys[key] {
			continue
		}
		child, ok := byName[key]
		if !ok {
			// MD001: the map names a field T does not declare.
			*findings = append(*findings, Finding{
				Code:     "MD001",
				Severity: Error,
				Path:     joinPath(path, key),
				Message:  "unknown field '" + key + "' is not a property of the type",
			})
			continue
		}
		if nested := literal.Child(key); nested != nil {
			checkMockNode(findings, ctx, child.Child, nested, joinPath(path, key), depth+1)
		}
	}
}

// SortFindings orders findings by (Path, Code) for deterministic reporting.
func SortFindings(findings []Finding) {
	sort.SliceStable(findings, func(left, right int) bool {
		if findings[left].Path != findings[right].Path {
			return findings[left].Path < findings[right].Path
		}
		return findings[left].Code < findings[right].Code
	})
}

// HasError reports whether any finding is Error severity.
func HasError(findings []Finding) bool {
	for _, finding := range findings {
		if finding.Severity == Error {
			return true
		}
	}
	return false
}

// FormatFinding renders one finding as the text-report line body
// `<path> [<CODE> <severity>] <message>` (the caller prefixes the file).
func FormatFinding(finding Finding) string {
	var b strings.Builder
	b.WriteString(finding.Path)
	b.WriteString(" [")
	b.WriteString(finding.Code)
	b.WriteString(" ")
	b.WriteString(finding.Severity.String())
	b.WriteString("] ")
	b.WriteString(finding.Message)
	return b.String()
}
