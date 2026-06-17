package enrichment_test

import (
	"sort"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// fakeView is a hand-built enrichment.LiteralView for unit tests — no Program
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

func (view *fakeView) Child(key string) enrichment.LiteralView {
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

func findingCodes(findings []enrichment.Finding) []string {
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

	findings := enrichment.CheckFriendly(rt, view, nil)

	var ft002 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "FT002" {
			ft002 = &findings[i]
		}
	}
	if ft002 == nil {
		t.Fatalf("expected FT002 for unknown field; got %v", findingCodes(findings))
	}
	if ft002.Severity != enrichment.Error {
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

	findings := enrichment.CheckFriendly(rt, view, nil)

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

	findings := enrichment.CheckFriendly(rt, view, nil)
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

	findings := enrichment.CheckFriendly(rt, view, nil)

	var ft003 []enrichment.Finding
	for _, finding := range findings {
		if finding.Code == "FT003" {
			ft003 = append(ft003, finding)
		}
	}
	if len(ft003) != 1 {
		t.Fatalf("expected exactly one FT003 (maxLength); got %v", findings)
	}
	if ft003[0].Severity != enrichment.Warning {
		t.Errorf("FT003 severity = %v, want Warning", ft003[0].Severity)
	}
	if ft003[0].Path != "code.$errors.maxLength" {
		t.Errorf("FT003 path = %q, want %q", ft003[0].Path, "code.$errors.maxLength")
	}
}

func TestCheckFriendly_FunctionFormErrorsSkipped(t *testing.T) {
	// A function-form `$errors` is not an object literal, so Child("$errors")
	// returns nil and FT003/FT005 are skipped — no findings for the field.
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT()})
	view := newFakeView().obj("name", newFakeView().str("$errors", "(failed) => 'x'"))

	findings := enrichment.CheckFriendly(rt, view, nil)
	if len(findings) != 0 {
		t.Fatalf("function-form $errors should be skipped; got %v", findings)
	}
}

func TestCheckMock_MD001UnknownField(t *testing.T) {
	rt := objectRT(map[string]*protocol.RunType{"name": stringRT()})
	view := newFakeView().
		obj("name", newFakeView().str("pool", "ignored")).
		obj("ghost", newFakeView())

	findings := enrichment.CheckMock(rt, view, nil)

	var md001 *enrichment.Finding
	for i := range findings {
		if findings[i].Code == "MD001" {
			md001 = &findings[i]
		}
	}
	if md001 == nil {
		t.Fatalf("expected MD001 for unknown mock field; got %v", findingCodes(findings))
	}
	if md001.Severity != enrichment.Error {
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

	findings := enrichment.CheckMock(rt, view, nil)
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

	findings := enrichment.CheckFriendly(rt, view, nil)
	var ft002 *enrichment.Finding
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

	findings := enrichment.CheckFriendly(rt, view, nil)
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

func contains(haystack []string, needle string) bool {
	for _, item := range haystack {
		if item == needle {
			return true
		}
	}
	return false
}
