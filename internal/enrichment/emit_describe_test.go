package enrichment

import (
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
	want := `export const userFriendly: FriendlyType<User> = {
  $label: '',
  name: {$label: '', $errors: {type: '', maxLength: '', minLength: ''}},
  age: {$label: '', $errors: {type: '', max: '', min: ''}},
  isActive: {$label: ''},
  tags: {$label: '', $items: {$label: ''}},
  profile: {
    $label: '',
    email: {$label: '', $errors: {type: ''}},
    score: {$label: '', $errors: {type: '', max: '', min: ''}},
  },
};
`
	if got != want {
		t.Errorf("EmitFriendly mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestEmitMock(t *testing.T) {
	got := EmitMock(userFixture(), EmitOptions{VarName: "userMock", TypeName: "User"})
	want := `export const userMock: MockData<User> = {
  name: {pool: []},
  age: {pool: []},
  isActive: {pool: []},
  tags: {$items: {pool: []}, $length: [1, 3]},
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
