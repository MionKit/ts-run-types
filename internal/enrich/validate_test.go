package enrich_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// fakeView is a hand-built enrich.LiteralView for unit tests — no Program
// required. strings holds the string-literal-valued keys; objects holds the
// nested object-literal-valued keys. order preserves declaration order across
// both maps.
type fakeView struct {
	order   []string
	strings map[string]string
	objects map[string]*fakeView
}

func newFakeView() *fakeView {
	return &fakeView{strings: map[string]string{}, objects: map[string]*fakeView{}}
}

func (view *fakeView) str(key, value string) *fakeView {
	view.order = append(view.order, key)
	view.strings[key] = value
	return view
}

func (view *fakeView) obj(key string, child *fakeView) *fakeView {
	view.order = append(view.order, key)
	view.objects[key] = child
	return view
}

func (view *fakeView) Keys() []string { return view.order }

func (view *fakeView) Child(key string) enrich.LiteralView {
	child, ok := view.objects[key]
	if !ok || child == nil {
		return nil
	}
	return child
}

func (view *fakeView) StringValue(key string) (string, bool) {
	value, ok := view.strings[key]
	return value, ok
}

// objectRT builds an object-literal RunType from a set of named property
// children. Each child is a PropertySignature wrapping the given field node.
func objectRT(fields map[string]*protocol.RunType) *protocol.RunType {
	rt := &protocol.RunType{Kind: protocol.KindObjectLiteral}
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		rt.Children = append(rt.Children, &protocol.RunType{
			Kind:       protocol.KindPropertySignature,
			Name:       name,
			IsSafeName: true,
			Child:      fields[name],
		})
	}
	return rt
}

func stringRT() *protocol.RunType { return &protocol.RunType{Kind: protocol.KindString} }

func findingCodes(findings []enrich.Finding) []string {
	codes := make([]string, 0, len(findings))
	for _, finding := range findings {
		codes = append(codes, finding.Code)
	}
	return codes
}

func TestCheckFriendly_FT002UnknownField(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("$label", "Name")).
		obj("nope", newFakeView().str("$label", "Nope"))

	findings := enrich.CheckFriendly(rt, view, nil)

	var ft002 *enrich.Finding
	for i := range findings {
		if findings[i].Code == "FT002" {
			ft002 = &findings[i]
		}
	}
	if ft002 == nil {
		t.Fatalf("expected FT002 for unknown field; got %v", findingCodes(findings))
	}
	if ft002.Severity != enrich.Error {
		t.Errorf("FT002 severity = %v, want Error", ft002.Severity)
	}
	if ft002.Path != "nope" {
		t.Errorf("FT002 path = %q, want %q", ft002.Path, "nope")
	}
}

func TestCheckFriendly_FT005BadPlaceholder(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().
		obj("$errors", newFakeView().str("type", "must be a $[nope] for $[label]")))

	findings := enrich.CheckFriendly(rt, view, nil)

	codes := findingCodes(findings)
	if !contains(codes, "FT005") {
		t.Fatalf("expected FT005 for bad placeholder; got %v", codes)
	}
	// `$[label]` is valid — exactly one FT005 (for `$[nope]`).
	count := 0
	for _, code := range codes {
		if code == "FT005" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("FT005 count = %d, want 1 (only $[nope] is bad)", count)
	}
}

func TestCheckFriendly_Clean(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT(), "email": stringRT()})
	view := newFakeView().
		str("$label", "User").
		obj("name", newFakeView().
			str("$label", "Name").
			obj("$errors", newFakeView().str("type", "$[label] is required"))).
		obj("email", newFakeView().str("$label", "Email"))

	findings := enrich.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("clean map produced findings: %v", findings)
	}
}

func TestCheckFriendly_FT003UnknownConstraint(t *testing.T) {
	// A string field branded with a FormatString carrying a minLength param —
	// `type`, `$default`, and `minLength` are the only valid $errors keys.
	formatted := &protocol.RunType{
		Kind: protocol.KindString,
		FormatAnnotation: &protocol.FormatAnnotation{
			Name:   "stringFormat",
			Params: map[string]any{"minLength": 3},
		},
	}
	rt := objectRT(map[string]*protocol.RunType{"code": formatted})
	view := newFakeView().obj("code", newFakeView().
		obj("$errors", newFakeView().
			str("type", "bad type").
			str("minLength", "too short"). // declared constraint — OK
			str("maxLength", "too long"))) // NOT declared — FT003

	findings := enrich.CheckFriendly(rt, view, nil)

	var ft003 []enrich.Finding
	for _, finding := range findings {
		if finding.Code == "FT003" {
			ft003 = append(ft003, finding)
		}
	}
	if len(ft003) != 1 {
		t.Fatalf("expected exactly one FT003 (maxLength); got %v", findings)
	}
	if ft003[0].Severity != enrich.Warning {
		t.Errorf("FT003 severity = %v, want Warning", ft003[0].Severity)
	}
	if ft003[0].Path != "code.$errors.maxLength" {
		t.Errorf("FT003 path = %q, want %q", ft003[0].Path, "code.$errors.maxLength")
	}
}

// TestCheckFriendly_FT003PresentationParam pins the presentation-param carve
// out: `isCurrency` is the one number param with NO failable constraint, so it
// never becomes a valid `$errors` key — authoring one is flagged FT003 exactly
// like any other undeclared constraint.
func TestCheckFriendly_FT003PresentationParam(t *testing.T) {
	formatted := &protocol.RunType{
		Kind: protocol.KindNumber,
		FormatAnnotation: &protocol.FormatAnnotation{
			Name:   "numberFormat",
			Params: map[string]any{"max": 100, "isCurrency": true},
		},
	}
	rt := objectRT(map[string]*protocol.RunType{"price": formatted})
	view := newFakeView().obj("price", newFakeView().
		obj("$errors", newFakeView().
			str("type", "bad type").
			str("max", "too much").          // declared constraint — OK
			str("isCurrency", "not money"))) // presentation metadata — FT003

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft003 []enrich.Finding
	for _, finding := range findings {
		if finding.Code == "FT003" {
			ft003 = append(ft003, finding)
		}
	}
	if len(ft003) != 1 {
		t.Fatalf("expected exactly one FT003 (isCurrency); got %v", findings)
	}
	if ft003[0].Path != "price.$errors.isCurrency" {
		t.Errorf("FT003 path = %q, want %q", ft003[0].Path, "price.$errors.isCurrency")
	}
}

func TestCheckFriendly_FunctionFormErrorsSkipped(t *testing.T) {
	// A function-form `$errors` is not an object literal, so Child("$errors")
	// returns nil and FT003/FT005 are skipped — no findings for the field.
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().str("$errors", "(failed) => 'x'"))

	findings := enrich.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("function-form $errors should be skipped; got %v", findings)
	}
}

func TestCheckMock_MD001UnknownField(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("pool", "ignored")).
		obj("ghost", newFakeView())

	findings := enrich.CheckMock(rt, view, nil)

	var md001 *enrich.Finding
	for i := range findings {
		if findings[i].Code == "MD001" {
			md001 = &findings[i]
		}
	}
	if md001 == nil {
		t.Fatalf("expected MD001 for unknown mock field; got %v", findingCodes(findings))
	}
	if md001.Severity != enrich.Error {
		t.Errorf("MD001 severity = %v, want Error", md001.Severity)
	}
	if md001.Path != "ghost" {
		t.Errorf("MD001 path = %q, want %q", md001.Path, "ghost")
	}
}

func TestCheckMock_MetaKeysNotFlagged(t *testing.T) {
	// `pool`, `min`, `max`, `$optional` are reserved mock keys — never flagged
	// as unknown fields even though they aren't properties of the type.
	rt := objectRT(map[string]*protocol.RunType{"age": {Kind: protocol.KindNumber}})
	view := newFakeView().
		str("$optional", "1").
		obj("age", newFakeView().str("min", "0").str("max", "120").str("pool", "[]"))

	findings := enrich.CheckMock(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("reserved mock keys should not be flagged; got %v", findings)
	}
}

func TestCheckFriendly_NestedAndArray(t *testing.T) {
	// Nested object + array element: an unknown key at depth flags FT002 with a
	// dotted path through `$items`.
	inner := objectRT(map[string]*protocol.RunType{"city": stringRT()})
	addresses := &protocol.RunType{Kind: protocol.KindArray, Child: inner}
	rt := objectRT(map[string]*protocol.RunType{"addresses": addresses})

	view := newFakeView().obj("addresses", newFakeView().
		obj("$items", newFakeView().
			obj("city", newFakeView().str("$label", "City")).
			obj("zip", newFakeView().str("$label", "Zip")))) // zip not a property

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft002 *enrich.Finding
	for i := range findings {
		if findings[i].Code == "FT002" {
			ft002 = &findings[i]
		}
	}
	if ft002 == nil {
		t.Fatalf("expected FT002 in nested array element; got %v", findingCodes(findings))
	}
	if ft002.Path != "addresses.$items.zip" {
		t.Errorf("FT002 path = %q, want %q", ft002.Path, "addresses.$items.zip")
	}
}

func TestCheckFriendly_NestedObjectErrorsNotDoubled(t *testing.T) {
	// A nested-OBJECT field's own `$errors` must be checked exactly once — not
	// once by the parent and again when the object node is walked. One bad
	// placeholder in profile.$errors must yield exactly one FT005, never two.
	inner := objectRT(map[string]*protocol.RunType{"email": stringRT()})
	rt := objectRT(map[string]*protocol.RunType{"profile": inner})

	view := newFakeView().obj("profile", newFakeView().
		obj("$errors", newFakeView().str("type", "bad $[nope]")).
		obj("email", newFakeView().str("$label", "Email")))

	findings := enrich.CheckFriendly(rt, view, nil)
	count := 0
	for _, finding := range findings {
		if finding.Code == "FT005" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("nested-object $errors should yield exactly one FT005, got %d: %v", count, findings)
	}
}

// formatStringRT builds a string field branded with a FormatString carrying the
// given params — its declared constraint keys become valid $errors keys.
func formatStringRT(params map[string]any) *protocol.RunType {
	return &protocol.RunType{
		Kind:             protocol.KindString,
		FormatAnnotation: &protocol.FormatAnnotation{Name: "stringFormat", Params: params},
	}
}

func TestCheckFriendly_PluralLeafClean(t *testing.T) {
	// A plural object on a count-bearing constraint with valid CLDR arms and a
	// mandatory `other` is clean; per-arm placeholders are validated.
	rt := objectRT(map[string]*protocol.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("$errors", newFakeView().
			str("type", "must be text").
			obj("minLength", newFakeView().
				str("one", "at least $[val] character").
				str("other", "at least $[val] characters"))))

	findings := enrich.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("clean plural leaf produced findings: %v", findings)
	}
}

func TestCheckFriendly_FT006MissingOther(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("$errors", newFakeView().
			obj("minLength", newFakeView().str("one", "at least $[val]"))))

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft006 *enrich.Finding
	for i := range findings {
		if findings[i].Code == "FT006" {
			ft006 = &findings[i]
		}
	}
	if ft006 == nil {
		t.Fatalf("expected FT006 for a plural without `other`; got %v", findingCodes(findings))
	}
	if ft006.Severity != enrich.Error {
		t.Errorf("FT006 severity = %v, want Error", ft006.Severity)
	}
	if ft006.Path != "name.$errors.minLength" {
		t.Errorf("FT006 path = %q, want %q", ft006.Path, "name.$errors.minLength")
	}
}

func TestCheckFriendly_FT007UnknownArm(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("$errors", newFakeView().
			obj("minLength", newFakeView().
				str("other", "chars").
				str("lots", "way too many")))) // not a CLDR category

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft007 *enrich.Finding
	for i := range findings {
		if findings[i].Code == "FT007" {
			ft007 = &findings[i]
		}
	}
	if ft007 == nil {
		t.Fatalf("expected FT007 for a non-CLDR arm; got %v", findingCodes(findings))
	}
	if ft007.Severity != enrich.Warning {
		t.Errorf("FT007 severity = %v, want Warning", ft007.Severity)
	}
	if ft007.Path != "name.$errors.minLength.lots" {
		t.Errorf("FT007 path = %q, want %q", ft007.Path, "name.$errors.minLength.lots")
	}
}

func TestCheckFriendly_FT008PluralOnNonCountBearing(t *testing.T) {
	// `pattern` carries no count: a plural object there has dead arms.
	rt := objectRT(map[string]*protocol.RunType{"email": formatStringRT(map[string]any{"pattern": "x"})})
	view := newFakeView().obj("email", newFakeView().
		obj("$errors", newFakeView().
			obj("pattern", newFakeView().str("one", "x").str("other", "y"))))

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft008 *enrich.Finding
	for i := range findings {
		if findings[i].Code == "FT008" {
			ft008 = &findings[i]
		}
	}
	if ft008 == nil {
		t.Fatalf("expected FT008 for a plural on a non-count-bearing constraint; got %v", findingCodes(findings))
	}
	if ft008.Severity != enrich.Warning {
		t.Errorf("FT008 severity = %v, want Warning", ft008.Severity)
	}
}

func TestCheckFriendly_FT005InsidePluralArm(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": formatStringRT(map[string]any{"minLength": 2})})
	view := newFakeView().obj("name", newFakeView().
		obj("$errors", newFakeView().
			obj("minLength", newFakeView().
				str("one", "bad $[nope]").
				str("other", "fine $[val]"))))

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft005 []enrich.Finding
	for _, finding := range findings {
		if finding.Code == "FT005" {
			ft005 = append(ft005, finding)
		}
	}
	if len(ft005) != 1 {
		t.Fatalf("expected exactly one FT005 inside the plural arm; got %v", findings)
	}
	if ft005[0].Path != "name.$errors.minLength.one" {
		t.Errorf("FT005 path = %q, want %q", ft005[0].Path, "name.$errors.minLength.one")
	}
}

func TestCheckFriendly_FT005FormatTokens(t *testing.T) {
	// The colon-form `$[val:kind:name]` named-format tokens were REMOVED
	// (bounds render type-driven — Currency / date formats — with plain
	// `$[val]`): every leftover colon token flags FT005 so migrating templates
	// get a pointer, while a literal colon in prose (`ratio 3:1`) outside a
	// token never trips.
	rt := objectRT(map[string]*protocol.RunType{"price": formatStringRT(map[string]any{"max": 100})})
	view := newFakeView().obj("price", newFakeView().
		obj("$errors", newFakeView().
			str("type", "removed $[val:number:currency] but ratio 3:1 is prose").
			str("max", "removed $[label:number:currency] and $[val:nope:x], plain $[val] fine")))

	findings := enrich.CheckFriendly(rt, view, nil)
	var ft005 []enrich.Finding
	for _, finding := range findings {
		if finding.Code == "FT005" {
			ft005 = append(ft005, finding)
		}
	}
	if len(ft005) != 3 {
		t.Fatalf("expected three FT005 (every leftover colon token), got %v", findings)
	}
	for _, finding := range ft005 {
		if !strings.Contains(finding.Message, "no longer supported") {
			t.Errorf("FT005 message should point at the removal; got %q", finding.Message)
		}
	}
}

func contains(haystack []string, needle string) bool {
	for _, item := range haystack {
		if item == needle {
			return true
		}
	}
	return false
}
