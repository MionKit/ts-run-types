// Package diag is the centralised catalog of every non-fatal diagnostic the
// Go binary can emit. Every diagnostic the resolver, pure-fn extractor, and
// JIT compiler surface flows through one of the typed constructors in this
// package, so the full set of user-visible messages — codes, severities,
// templates — is auditable in one place.
//
// Wire format: severity and family are encoded as small unsigned integers
// (uint8) to minimise payload size; the TS side mirrors the same numeric
// values as `as const` literal-union enums. The full set of definitions is
// registered via the codes_*.go files via init() so consumers can look up
// any code's Family/Severity/Template at runtime.
package diag

import "fmt"

// Severity classifies a Diagnostic's impact. Numeric so the wire form stays
// compact (single digit) and the TS side maps trivially to a literal union.
//
// Severity is purely informational — it does not control runtime behavior.
// An Error-severity diagnostic still lets the build proceed; the runtime
// factory is still rendered (it may throw on first call, but that's the
// emitter's job, not the diagnostic's).
type Severity uint8

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
	SeverityInfo    Severity = 3
)

// SeverityLabel returns the canonical lowercase string used by `tsc
// --pretty=false` and VS Code's $tsc problem matcher.
func SeverityLabel(severity Severity) string {
	switch severity {
	case SeverityError:
		return "error"
	case SeverityWarning:
		return "warning"
	case SeverityInfo:
		return "info"
	}
	return "info"
}

// Family classifies a Diagnostic by which subsystem produced it. Same
// uint8-on-the-wire scheme as Severity. The TS-side reception loop
// branches on this when it needs subsystem-specific routing; today the
// Vite plugin just folds all families through `this.warn`.
type Family uint8

const (
	FamilyPureFn  Family = 1
	FamilyMarker  Family = 2
	FamilyRunType Family = 3
)

// Site is a 1-based source location. Start/End spans are populated by the
// scanner; runtype-family diagnostics (where the source location is the
// marker call site, not the type declaration) leave EndLine/EndCol zero —
// the wire shape preserves the fields for forward compatibility with
// range-aware diagnostics.
type Site struct {
	FilePath  string `json:"filePath"`
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine,omitempty"`
	EndCol    int    `json:"endCol,omitempty"`
}

// Related is a second source location attached to a Diagnostic, e.g. the
// "first registered here" pointer on a body-hash collision. Carries its
// own message because the relationship is asymmetric from the primary.
type Related struct {
	Site
	Message string `json:"message"`
}

// Diagnostic is the single wire shape for everything the Go binary
// emits. The Family discriminator carries which subsystem produced it
// (purefn extractor, marker scanner, runtype JIT compiler); the Code is
// the stable identifier (PFE9001, MKR001, IT010, SJ001, …) and Severity
// classifies impact.
type Diagnostic struct {
	Code     string    `json:"code"`
	Family   Family    `json:"family"`
	Severity Severity  `json:"severity"`
	Message  string    `json:"message"`
	Site     Site      `json:"site"`
	Related  []Related `json:"related,omitempty"`
}

// Definition is the catalog entry for a single diagnostic code. Title is
// the short headline used in tooling that wants to render a code list;
// Template is the message template (Go-style `%s` placeholders) the
// constructors substitute against. DocsAnchor is reserved for a future
// reference doc.
type Definition struct {
	Code       string
	Family     Family
	Severity   Severity
	Title      string
	Template   string
	DocsAnchor string
}

// Definitions holds every registered diagnostic code keyed by Code. The
// codes_*.go files register themselves via init(); the map is read-only
// after init completes.
var Definitions = map[string]Definition{}

func register(definition Definition) {
	if _, exists := Definitions[definition.Code]; exists {
		panic("diag: duplicate registration of code " + definition.Code)
	}
	Definitions[definition.Code] = definition
}

// New builds a Diagnostic by looking up the code's Family/Severity from
// the catalog. Panics if the code is unknown — every code MUST be
// registered before use, so an unknown code is a programmer error.
func New(code string, site Site, message string, related ...Related) Diagnostic {
	definition, ok := Definitions[code]
	if !ok {
		panic("diag: unknown code " + code)
	}
	out := Diagnostic{
		Code:     code,
		Family:   definition.Family,
		Severity: definition.Severity,
		Message:  message,
		Site:     site,
	}
	if len(related) > 0 {
		out.Related = related
	}
	return out
}

// Newf is the printf-style variant of New. Codes whose Definition.Template
// uses placeholders construct their message via this helper.
func Newf(code string, site Site, format string, args ...any) Diagnostic {
	return New(code, site, fmt.Sprintf(format, args...))
}
