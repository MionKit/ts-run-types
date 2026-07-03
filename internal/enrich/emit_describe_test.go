package enrich

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// prop builds a property-signature member named name with value type child.
func prop(name string, child *protocol.RunType) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindPropertySignature, Name: name, IsSafeName: true, Child: child}
}

func leaf(kind protocol.ReflectionKind) *protocol.RunType {
	return &protocol.RunType{Kind: kind}
}

// fmtLeaf builds a format-branded leaf (string/number) with a FormatAnnotation.
func fmtLeaf(kind protocol.ReflectionKind, name string, params map[string]any) *protocol.RunType {
	return &protocol.RunType{Kind: kind, FormatAnnotation: &protocol.FormatAnnotation{Name: name, Params: params}}
}

// userFixture mirrors:
//
//	interface User {
//	  name: FormatString<{minLength:2; maxLength:60}>;
//	  age: FormatNumber<{min:0; max:120}>;
//	  isActive: boolean;
//	  tags: string[];
//	  profile: { email: FormatEmail; score: FormatNumber<{min:0; max:100}> };
//	}
func userFixture() *protocol.RunType {
	return &protocol.RunType{
		ID: "user", Kind: protocol.KindObjectLiteral, TypeName: "User",
		Children: []*protocol.RunType{
			prop("name", fmtLeaf(protocol.KindString, "stringFormat", map[string]any{"minLength": 2, "maxLength": 60})),
			prop("age", fmtLeaf(protocol.KindNumber, "numberFormat", map[string]any{"min": 0, "max": 120})),
			prop("isActive", leaf(protocol.KindBoolean)),
			prop("tags", &protocol.RunType{ID: "tags", Kind: protocol.KindArray, Child: leaf(protocol.KindString)}),
			prop("profile", &protocol.RunType{
				ID: "profile", Kind: protocol.KindObjectLiteral,
				Children: []*protocol.RunType{
					prop("email", fmtLeaf(protocol.KindString, "email", nil)),
					prop("score", fmtLeaf(protocol.KindNumber, "numberFormat", map[string]any{"min": 0, "max": 100})),
				},
			}),
		},
	}
}

func TestEmitFriendly(t *testing.T) {
	got := EmitFriendly(userFixture(), EmitOptions{VarName: "userFriendly", TypeName: "User"})
	// Count-bearing constraints (minLength/maxLength/min/max) scaffold a plural
	// OBJECT with the source locale's arms (default en: one/other); the rest
	// stay plain strings.
	want := `export const userFriendly: FriendlyType<User> = {
  rt$label: '',
  rt$errors: {type: ''},
  name: {rt$label: '', rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}}},
  age: {rt$label: '', rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}}},
  isActive: {rt$label: '', rt$errors: {type: ''}},
  tags: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
  profile: {
    rt$label: '',
    rt$errors: {type: ''},
    email: {rt$label: '', rt$errors: {type: ''}},
    score: {rt$label: '', rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}}},
  },
};
`
	if got != want {
		t.Errorf("EmitFriendly mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitFriendly_SourceLocaleArms: the plural arm set follows the source
// locale — Polish scaffolds one/few/many/other, Japanese other-only, an
// unknown locale all six.
func TestEmitFriendly_SourceLocaleArms(t *testing.T) {
	fixture := &protocol.RunType{
		ID: "box", Kind: protocol.KindObjectLiteral, TypeName: "Box",
		Children: []*protocol.RunType{
			prop("name", fmtLeaf(protocol.KindString, "stringFormat", map[string]any{"minLength": 2})),
		},
	}
	tests := []struct {
		locale string
		want   string
	}{
		{"pl", "minLength: {one: '', few: '', many: '', other: ''}"},
		{"ja", "minLength: {other: ''}"},
		{"pt-BR", "minLength: {one: '', many: '', other: ''}"},
		{"xx", "minLength: {zero: '', one: '', two: '', few: '', many: '', other: ''}"},
	}
	for _, test := range tests {
		t.Run(test.locale, func(t *testing.T) {
			got := EmitFriendly(fixture, EmitOptions{VarName: "boxFriendly", TypeName: "Box", SourceLocale: test.locale})
			if !strings.Contains(got, test.want) {
				t.Errorf("EmitFriendly(%s) missing %q:\n%s", test.locale, test.want, got)
			}
		})
	}
}

func TestEmitMock(t *testing.T) {
	got := EmitMock(userFixture(), EmitOptions{VarName: "userMock", TypeName: "User"})
	want := `export const userMock: MockData<User> = {
  name: {pool: []},
  age: {pool: []},
  isActive: {pool: []},
  tags: {rt$items: {pool: []}, rt$length: [1, 3]},
  profile: {
    email: {pool: []},
    score: {pool: []},
  },
};
`
	if got != want {
		t.Errorf("EmitMock mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestDescribe(t *testing.T) {
	got := Describe(userFixture(), DescribeOptions{TypeName: "User"})
	want := `User: object
  name: string (stringFormat: maxLength=60, minLength=2)
  age: number (numberFormat: max=120, min=0)
  isActive: boolean
  tags: string[]
  profile: object
    email: string (email)
    score: number (numberFormat: max=100, min=0)
`
	if got != want {
		t.Errorf("Describe mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// tupleMember wraps a slot type in a KindTupleMember node (the shape the tuple
// walker reads via member.Child).
func tupleMember(child *protocol.RunType) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindTupleMember, Child: child}
}

// mapArg / setArg wrap a type in the synthetic KindParameter slot the Map/Set
// projection stores in rt.Arguments (the underlying type rides on .Child).
func mapArg(subKind protocol.ReflectionSubKind, child *protocol.RunType) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindParameter, SubKind: subKind, Child: child}
}

// tupleFixture mirrors `[string, number]`.
func tupleFixture() *protocol.RunType {
	return &protocol.RunType{
		ID: "tuple", Kind: protocol.KindTuple,
		Children: []*protocol.RunType{
			tupleMember(leaf(protocol.KindString)),
			tupleMember(leaf(protocol.KindNumber)),
		},
	}
}

// mapFixture mirrors `Map<string, number>`.
func mapFixture() *protocol.RunType {
	return &protocol.RunType{
		ID: "map", Kind: protocol.KindClass, SubKind: protocol.SubKindMap, TypeName: "Map",
		Arguments: []*protocol.RunType{
			mapArg(protocol.SubKindMapKey, leaf(protocol.KindString)),
			mapArg(protocol.SubKindMapValue, leaf(protocol.KindNumber)),
		},
	}
}

// setFixture mirrors `Set<string>`.
func setFixture() *protocol.RunType {
	return &protocol.RunType{
		ID: "set", Kind: protocol.KindClass, SubKind: protocol.SubKindSet, TypeName: "Set",
		Arguments: []*protocol.RunType{
			mapArg(protocol.SubKindSetItem, leaf(protocol.KindString)),
		},
	}
}

// TestEmitFriendlyTuple pins the structural `rt$slots` shape (solution A).
func TestEmitFriendlyTuple(t *testing.T) {
	got := EmitFriendly(tupleFixture(), EmitOptions{VarName: "tupleFriendly", TypeName: "Target"})
	want := "export const tupleFriendly: FriendlyType<Target> = {rt$label: '', rt$errors: {type: ''}, rt$slots: [{rt$label: '', rt$errors: {type: ''}}, {rt$label: '', rt$errors: {type: ''}}]};\n"
	if got != want {
		t.Errorf("EmitFriendly(tuple) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitMockTuple pins the structural `rt$slots` shape (fixed length, no rt$length).
func TestEmitMockTuple(t *testing.T) {
	got := EmitMock(tupleFixture(), EmitOptions{VarName: "tupleMock", TypeName: "Target"})
	want := "export const tupleMock: MockData<Target> = {rt$slots: [{pool: []}, {pool: []}]};\n"
	if got != want {
		t.Errorf("EmitMock(tuple) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitMockEmptyTuple confirms an empty tuple yields an empty rt$slots array.
func TestEmitMockEmptyTuple(t *testing.T) {
	empty := &protocol.RunType{ID: "empty", Kind: protocol.KindTuple}
	got := MockSkeleton(empty, nil)
	if got != "{rt$slots: []}" {
		t.Errorf("MockSkeleton(empty tuple) = %q, want %q", got, "{rt$slots: []}")
	}
}

// TestEmitVariadicTuple confirms a rest/variadic tuple (`[number, ...string[]]`)
// routes through the ARRAY shape (rt$items/rt$length), matching the Phase-A type's
// `number extends T['length']` branch — NOT the fixed `rt$slots`.
func TestEmitVariadicTuple(t *testing.T) {
	rest := &protocol.RunType{Kind: protocol.KindTupleMember, Flags: []string{"rest"}, Child: leaf(protocol.KindString)}
	tuple := &protocol.RunType{
		ID: "vtuple", Kind: protocol.KindTuple,
		Children: []*protocol.RunType{tupleMember(leaf(protocol.KindNumber)), rest},
	}
	gotFriendly := FriendlySkeleton(tuple, nil)
	if gotFriendly != "{rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}}" {
		t.Errorf("FriendlySkeleton(variadic tuple) = %q", gotFriendly)
	}
	gotMock := MockSkeleton(tuple, nil)
	if gotMock != "{rt$items: {pool: []}, rt$length: [1, 3]}" {
		t.Errorf("MockSkeleton(variadic tuple) = %q", gotMock)
	}
}

// TestEmitFriendlyMap pins the structural `rt$keys`/`rt$values` shape.
func TestEmitFriendlyMap(t *testing.T) {
	got := EmitFriendly(mapFixture(), EmitOptions{VarName: "mapFriendly", TypeName: "Target"})
	want := "export const mapFriendly: FriendlyType<Target> = {rt$label: '', rt$errors: {type: ''}, rt$keys: {rt$label: '', rt$errors: {type: ''}}, rt$values: {rt$label: '', rt$errors: {type: ''}}};\n"
	if got != want {
		t.Errorf("EmitFriendly(map) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitMockMap pins the structural `rt$keys`/`rt$values` shape (no rt$size emitted).
func TestEmitMockMap(t *testing.T) {
	got := EmitMock(mapFixture(), EmitOptions{VarName: "mapMock", TypeName: "Target"})
	want := "export const mapMock: MockData<Target> = {rt$keys: {pool: []}, rt$values: {pool: []}};\n"
	if got != want {
		t.Errorf("EmitMock(map) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitSet pins the structural `rt$values` shape for both emitters.
func TestEmitSet(t *testing.T) {
	gotFriendly := EmitFriendly(setFixture(), EmitOptions{VarName: "setFriendly", TypeName: "Target"})
	wantFriendly := "export const setFriendly: FriendlyType<Target> = {rt$label: '', rt$errors: {type: ''}, rt$values: {rt$label: '', rt$errors: {type: ''}}};\n"
	if gotFriendly != wantFriendly {
		t.Errorf("EmitFriendly(set) mismatch:\n--- got ---\n%s\n--- want ---\n%s", gotFriendly, wantFriendly)
	}
	gotMock := EmitMock(setFixture(), EmitOptions{VarName: "setMock", TypeName: "Target"})
	wantMock := "export const setMock: MockData<Target> = {rt$values: {pool: []}};\n"
	if gotMock != wantMock {
		t.Errorf("EmitMock(set) mismatch:\n--- got ---\n%s\n--- want ---\n%s", gotMock, wantMock)
	}
}

// TestEmitFriendlyCyclic confirms the seen-guard breaks a self-referential graph
// instead of recursing forever.
func TestEmitFriendlyCyclic(t *testing.T) {
	node := &protocol.RunType{ID: "node", Kind: protocol.KindObjectLiteral, TypeName: "Node"}
	node.Children = []*protocol.RunType{
		prop("value", leaf(protocol.KindString)),
		prop("next", node), // self-reference
	}
	got := EmitFriendly(node, EmitOptions{VarName: "nodeFriendly", TypeName: "Node"})
	if got == "" || len(got) > 4096 {
		t.Fatalf("expected a bounded non-empty emit for a cyclic type, got %d bytes", len(got))
	}
}
