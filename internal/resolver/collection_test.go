package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// Collection-shape tests. Each scenario has paired *_Static / *_Reflect
// tests per the marker test coverage rule (CLAUDE.md) and shares an
// assertion helper. Exercises the modifier-and-default fields populated
// by serialize.go's appendProperty / projectSignatureInto / projectTuple
// — readonly, visibility, abstract, static, isSafePropName, position,
// default — none of which had end-to-end coverage before.

// ---- F23 — object with optional / readonly / unsafe name ---------------------

func TestF23_ObjectShapes_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface O {
  readonly id: number;
  nick?: string;
  "weird name": boolean;
}
getRuntypeId<O>();
`
	r, root := resolveInline(t, code)
	assertF23ObjectShapes(t, r, root)
}

func TestF23_ObjectShapes_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface O {
  readonly id: number;
  nick?: string;
  "weird name": boolean;
}
declare const value: O;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF23ObjectShapes(t, r, root)
}

func assertF23ObjectShapes(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}

	idMember := findMember(types, root, "id")
	if idMember == nil {
		t.Fatalf("missing 'id' property; types=%+v", root.Children)
	}
	if !idMember.Readonly {
		t.Fatalf("id expected Readonly=true, got %+v", idMember)
	}
	if !idMember.IsSafePropName {
		t.Fatalf("id expected IsSafePropName=true, got %+v", idMember)
	}
	if idMember.Optional {
		t.Fatalf("id expected Optional=false, got %+v", idMember)
	}

	nickMember := findMember(types, root, "nick")
	if nickMember == nil {
		t.Fatalf("missing 'nick' property; types=%+v", root.Children)
	}
	if !nickMember.Optional {
		t.Fatalf("nick expected Optional=true, got %+v", nickMember)
	}
	if !nickMember.IsSafePropName {
		t.Fatalf("nick expected IsSafePropName=true, got %+v", nickMember)
	}
	if nickMember.Readonly {
		t.Fatalf("nick expected Readonly=false, got %+v", nickMember)
	}

	weirdMember := findMember(types, root, "weird name")
	if weirdMember == nil {
		t.Fatalf("missing 'weird name' property; types=%+v", root.Children)
	}
	if weirdMember.IsSafePropName {
		t.Fatalf("'weird name' expected IsSafePropName=false, got %+v", weirdMember)
	}
	if weirdMember.Name != "weird name" {
		t.Fatalf("expected Name='weird name', got %q", weirdMember.Name)
	}
}

// ---- F24 — class property modifiers -----------------------------------------

func TestF24_ClassPropertyModifiers_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
class U {
  public id = 0;
  private secret = "";
  protected hint = 0;
  readonly tag = "t";
  static count = 0;
}
getRuntypeId<U>();
`
	r, root := resolveInline(t, code)
	assertF24ClassPropertyModifiers(t, r, root)
}

func TestF24_ClassPropertyModifiers_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
class U {
  public id = 0;
  private secret = "";
  protected hint = 0;
  readonly tag = "t";
  static count = 0;
}
declare const value: U;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF24ClassPropertyModifiers(t, r, root)
}

func assertF24ClassPropertyModifiers(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %+v", root)
	}

	idMember := findMember(types, root, "id")
	if idMember == nil || idMember.Kind != protocol.KindProperty {
		t.Fatalf("id expected KindProperty, got %+v", idMember)
	}
	if idMember.Visibility == nil || *idMember.Visibility != 0 {
		t.Fatalf("id expected Visibility=public(0), got %+v", idMember.Visibility)
	}

	secretMember := findMember(types, root, "secret")
	if secretMember == nil || secretMember.Visibility == nil || *secretMember.Visibility != 2 {
		t.Fatalf("secret expected Visibility=private(2), got %+v", secretMember)
	}

	hintMember := findMember(types, root, "hint")
	if hintMember == nil || hintMember.Visibility == nil || *hintMember.Visibility != 1 {
		t.Fatalf("hint expected Visibility=protected(1), got %+v", hintMember)
	}

	tagMember := findMember(types, root, "tag")
	if tagMember == nil || !tagMember.Readonly {
		t.Fatalf("tag expected Readonly=true, got %+v", tagMember)
	}

	countMember := findMember(types, root, "count")
	if countMember == nil || !countMember.Static {
		t.Fatalf("count expected Static=true, got %+v", countMember)
	}
}

// ---- F25 — class method modifiers -------------------------------------------

func TestF25_ClassMethodModifiers_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
abstract class S {
  abstract greet(): void;
  static factory(): void {}
  private hidden(): void {}
}
getRuntypeId<S>();
`
	r, root := resolveInline(t, code)
	assertF25ClassMethodModifiers(t, r, root)
}

func TestF25_ClassMethodModifiers_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
abstract class S {
  abstract greet(): void;
  static factory(): void {}
  private hidden(): void {}
}
declare const value: S;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF25ClassMethodModifiers(t, r, root)
}

func assertF25ClassMethodModifiers(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %+v", root)
	}

	greetMember := findMember(types, root, "greet")
	if greetMember == nil || greetMember.Kind != protocol.KindMethod {
		t.Fatalf("greet expected KindMethod, got %+v", greetMember)
	}
	if !greetMember.Abstract {
		t.Fatalf("greet expected Abstract=true, got %+v", greetMember)
	}

	factoryMember := findMember(types, root, "factory")
	if factoryMember == nil || !factoryMember.Static {
		t.Fatalf("factory expected Static=true, got %+v", factoryMember)
	}

	hiddenMember := findMember(types, root, "hidden")
	if hiddenMember == nil || hiddenMember.Visibility == nil || *hiddenMember.Visibility != 2 {
		t.Fatalf("hidden expected Visibility=private(2), got %+v", hiddenMember)
	}
}

// ---- F26 — tuple labeled/rest/optional/position -----------------------------
//
// Direct labeled tuple. Members carry Position, Name (from label),
// Optional bit, and Flags=["rest"] on the variadic tail.

func TestF26_TupleLabeled_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<[a: number, b?: string, ...rest: boolean[]]>();
`
	r, root := resolveInline(t, code)
	assertF26TupleLabeled(t, r, root)
}

func TestF26_TupleLabeled_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const value: [a: number, b?: string, ...rest: boolean[]];
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF26TupleLabeled(t, r, root)
}

func assertF26TupleLabeled(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindTuple {
		t.Fatalf("expected KindTuple, got %+v", root)
	}
	if len(root.Children) != 3 {
		t.Fatalf("expected 3 tuple members, got %d", len(root.Children))
	}

	first := deref(types, root.Children[0])
	if first == nil || first.Kind != protocol.KindTupleMember {
		t.Fatalf("member[0] expected KindTupleMember, got %+v", first)
	}
	if first.Name != "a" {
		t.Fatalf("member[0].Name expected 'a', got %q", first.Name)
	}
	if first.Position == nil || *first.Position != 0 {
		t.Fatalf("member[0].Position expected 0, got %+v", first.Position)
	}

	second := deref(types, root.Children[1])
	if second == nil || !second.Optional {
		t.Fatalf("member[1] expected Optional=true, got %+v", second)
	}
	if second.Name != "b" {
		t.Fatalf("member[1].Name expected 'b', got %q", second.Name)
	}
	if second.Position == nil || *second.Position != 1 {
		t.Fatalf("member[1].Position expected 1, got %+v", second.Position)
	}

	third := deref(types, root.Children[2])
	if third == nil {
		t.Fatalf("member[2] missing")
	}
	if third.Position == nil || *third.Position != 2 {
		t.Fatalf("member[2].Position expected 2, got %+v", third.Position)
	}
	if !containsFlag(third.Flags, "rest") {
		t.Fatalf("member[2] expected flags to contain 'rest', got %+v", third.Flags)
	}
}

// ---- F27 — readonly index signature -----------------------------------------

func TestF27_ReadonlyIndexSignature_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface M {
  readonly [k: string]: number;
}
getRuntypeId<M>();
`
	r, root := resolveInline(t, code)
	assertF27ReadonlyIndexSignature(t, r, root)
}

func TestF27_ReadonlyIndexSignature_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface M {
  readonly [k: string]: number;
}
declare const value: M;
reflectRuntypeId(value);
`
	r, root := resolveInline(t, code)
	assertF27ReadonlyIndexSignature(t, r, root)
}

func assertF27ReadonlyIndexSignature(t *testing.T, r *resolver.Resolver, root *protocol.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}

	var idx *protocol.RunType
	for _, ref := range root.Children {
		member := deref(types, ref)
		if member != nil && member.Kind == protocol.KindIndexSignature {
			idx = member
			break
		}
	}
	if idx == nil {
		t.Fatalf("expected KindIndexSignature child; got children=%+v", root.Children)
	}
	if !idx.Readonly {
		t.Fatalf("index signature expected Readonly=true, got %+v", idx)
	}
	keyType := deref(types, idx.Index)
	if keyType == nil || keyType.Kind != protocol.KindString {
		t.Fatalf("index key expected KindString, got %+v", keyType)
	}
	valueType := deref(types, idx.Child)
	if valueType == nil || valueType.Kind != protocol.KindNumber {
		t.Fatalf("index value expected KindNumber, got %+v", valueType)
	}
}

// ---- F28 — parameter defaults + position ------------------------------------
//
// Exercises Parameter.Default (literal + nonLiteralDefault marker) and
// Parameter.Position through the function-type projection. The function
// is itself a KindFunction node (single call signature on an object
// literal triggers the function dispatch), so we walk root.Parameters.

func TestF28_ParameterDefaults_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Fn = (a: number, b?: string, c?: number, d?: number) => void;
getRuntypeId<Fn>();
`
	r, root := resolveInline(t, code)
	assertF28ParameterDefaults(t, r, root, false)
}

func TestF28_ParameterDefaults_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
function fn(a: number, b: string = "x", c: number = 5, d: number = (() => 7)()): void {}
reflectRuntypeId(fn);
`
	r, root := resolveInline(t, code)
	assertF28ParameterDefaults(t, r, root, true)
}

func assertF28ParameterDefaults(t *testing.T, r *resolver.Resolver, root *protocol.RunType, expectDefaults bool) {
	t.Helper()
	types := dump(r)
	if root.Kind != protocol.KindFunction {
		t.Fatalf("expected KindFunction, got %+v", root)
	}
	if len(root.Parameters) != 4 {
		t.Fatalf("expected 4 parameters, got %d", len(root.Parameters))
	}
	for i, ref := range root.Parameters {
		param := deref(types, ref)
		if param == nil || param.Kind != protocol.KindParameter {
			t.Fatalf("parameter[%d] expected KindParameter, got %+v", i, param)
		}
		if param.Position == nil || *param.Position != i {
			t.Fatalf("parameter[%d].Position expected %d, got %+v", i, i, param.Position)
		}
	}
	if !expectDefaults {
		// Static form has no runtime values — Default fields stay nil.
		return
	}
	paramA := deref(types, root.Parameters[0])
	if paramA.Default != nil {
		t.Fatalf("parameter[0] expected no default, got %v", paramA.Default)
	}
	paramB := deref(types, root.Parameters[1])
	if paramB.Default != "x" {
		t.Fatalf("parameter[1].Default expected 'x', got %v", paramB.Default)
	}
	paramC := deref(types, root.Parameters[2])
	if v, ok := paramC.Default.(int64); !ok || v != 5 {
		// parseNumberLiteral may produce int64 or float64 — accept either.
		if v, ok := paramC.Default.(float64); !ok || v != 5 {
			t.Fatalf("parameter[2].Default expected 5, got %v (%T)", paramC.Default, paramC.Default)
		}
	}
	paramD := deref(types, root.Parameters[3])
	if paramD.Default != nil {
		t.Fatalf("parameter[3] expected Default=nil for non-literal, got %v", paramD.Default)
	}
	if !containsFlag(paramD.Flags, "nonLiteralDefault") {
		t.Fatalf("parameter[3] expected flags to contain 'nonLiteralDefault', got %+v", paramD.Flags)
	}
}

func containsFlag(flags []string, want string) bool {
	for _, f := range flags {
		if f == want {
			return true
		}
	}
	return false
}
