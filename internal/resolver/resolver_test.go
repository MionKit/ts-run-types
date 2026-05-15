package resolver_test

import (
	"path/filepath"
	"testing"

	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

func fixturesDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs("../testfixtures")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

// setup builds a Resolver against the on-disk testfixtures/ directory via
// the tsconfig path. Retained for the file-loading regression tests
// (TestScanFile_F17) — the rest of the suite uses setupInline.
func setup(t *testing.T) *resolver.Resolver {
	t.Helper()
	p, err := program.New(program.Options{
		Cwd:            fixturesDir(t),
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
	})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

func typeByID(types []*protocol.Type, id string) *protocol.Type {
	for _, t := range types {
		if t.ID == id {
			return t
		}
	}
	return nil
}

// deref walks a single ref slot to the actual Type entry in `types`.
func deref(types []*protocol.Type, ref *protocol.Type) *protocol.Type {
	if ref == nil {
		return nil
	}
	if ref.Kind == protocol.KindRef {
		return typeByID(types, ref.ID)
	}
	return ref
}

func dump(r *resolver.Resolver) []*protocol.Type {
	return r.Dispatch(protocol.Request{Op: protocol.OpDump}).Types
}

// findMember walks an objectLiteral / class root and returns the named member.
func findMember(types []*protocol.Type, root *protocol.Type, name string) *protocol.Type {
	for _, ref := range root.Types {
		m := deref(types, ref)
		if m != nil && m.Name == name {
			return m
		}
	}
	return nil
}

// resolveFile drives scanFile on file and returns the Type entry for the
// first site. Used by both file-loading (setup) and inline (setupInline)
// flows — both end up with a relative file name reachable from the
// resolver's cwd.
func resolveFile(t *testing.T, r *resolver.Resolver, file string) *protocol.Type {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: file})
	if resp.Error != "" {
		t.Fatalf("scanFile %s: %s", file, resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("scanFile %s returned no sites", file)
	}
	id := resp.Sites[0].ID
	tn := typeByID(dump(r), id)
	if tn == nil {
		t.Fatalf("type %q missing", id)
	}
	return tn
}

// ---- F1 — annotation primitive -----------------------------------------------

func TestF1_AnnotationPrimitive(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const userName: string = 'mario';
getRuntypeId(userName);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
}

// ---- F2 — annotation object alias `User` -------------------------------------

func TestF2_AnnotationObject(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRuntypeId<User>(u);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	if root.TypeName != "User" {
		t.Fatalf("expected typeName=User, got %q", root.TypeName)
	}
	id := findMember(types, root, "id")
	name := findMember(types, root, "name")
	if id == nil || name == nil {
		t.Fatalf("missing id/name members; types=%+v", root.Types)
	}
	if id.Kind != protocol.KindPropertySignature || name.Kind != protocol.KindPropertySignature {
		t.Fatalf("expected propertySignature kind, got id=%d name=%d", id.Kind, name.Kind)
	}
	idT := deref(types, id.Type)
	nameT := deref(types, name.Type)
	if idT == nil || idT.Kind != protocol.KindNumber {
		t.Fatalf("id.type expected number, got %+v", idT)
	}
	if nameT == nil || nameT.Kind != protocol.KindString {
		t.Fatalf("name.type expected string, got %+v", nameT)
	}
}

// ---- F3 — discriminated union ------------------------------------------------

func TestF3_Union(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Result = {ok: true; value: number} | {ok: false; error: string};
declare const x: unknown;
getRuntypeId<Result>(x);
`
	_, root := resolveInline(t, code)
	if root.Kind != protocol.KindUnion {
		t.Fatalf("expected union, got %+v", root)
	}
	if len(root.Types) != 2 {
		t.Fatalf("expected 2 union members, got %d", len(root.Types))
	}
}

// ---- F4 — inferred literal (number) ------------------------------------------

func TestF4_InferredLiteral(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const x = 42;
getRuntypeId(x);
`
	_, tn := resolveInline(t, code)
	switch tn.Kind {
	case protocol.KindNumber:
		// widened
	case protocol.KindLiteral:
		// literal preserved — still acceptable
	default:
		t.Fatalf("expected number-ish, got kind=%d", tn.Kind)
	}
}

// ---- F5 — inferred function with inferred return -----------------------------

func TestF5_InferredFunction(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const add = (a: number, b: number) => a + b;
getRuntypeId(add);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindFunction {
		t.Fatalf("expected function, got %+v", root)
	}
	if len(root.Parameters) != 2 {
		t.Fatalf("expected 2 params, got %d", len(root.Parameters))
	}
	a := deref(types, root.Parameters[0])
	if a == nil || a.Kind != protocol.KindParameter || a.Name != "a" {
		t.Fatalf("first param expected parameter:a, got %+v", a)
	}
	aType := deref(types, a.Type)
	if aType == nil || aType.Kind != protocol.KindNumber {
		t.Fatalf("param a type expected number, got %+v", aType)
	}
	ret := deref(types, root.Return)
	if ret == nil || ret.Kind != protocol.KindNumber {
		t.Fatalf("return expected number, got %+v", ret)
	}
}

// ---- F6 — getRuntypeId(routes) inferred from generic R -----------------------

func TestF6_RouterInference(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
getRuntypeId(routes);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	sayHello := findMember(types, root, "sayHello")
	if sayHello == nil {
		t.Fatalf("missing sayHello member")
	}
	var fn *protocol.Type
	switch sayHello.Kind {
	case protocol.KindMethodSignature:
		fn = sayHello
	case protocol.KindPropertySignature:
		fn = deref(types, sayHello.Type)
	default:
		t.Fatalf("sayHello has unexpected kind %d", sayHello.Kind)
	}
	if fn == nil {
		t.Fatalf("sayHello has no function shape")
	}
	if len(fn.Parameters) != 1 {
		t.Fatalf("expected 1 param, got %d", len(fn.Parameters))
	}
	pname := deref(types, fn.Parameters[0])
	if pname == nil || pname.Name != "name" {
		t.Fatalf("expected param name=name, got %+v", pname)
	}
	pT := deref(types, pname.Type)
	if pT == nil || pT.Kind != protocol.KindString {
		t.Fatalf("name param expected string, got %+v", pT)
	}
	ret := deref(types, fn.Return)
	if ret == nil || ret.Kind != protocol.KindString {
		t.Fatalf("return expected string, got %+v", ret)
	}
}

// ---- F7 — inferred generic ---------------------------------------------------

func TestF7_InferredGeneric(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
function wrap<T>(x: T): T {
  return x;
}
getRuntypeId(wrap({a: 1, b: 'x'}));
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	a := findMember(types, root, "a")
	b := findMember(types, root, "b")
	if a == nil || b == nil {
		t.Fatalf("missing a/b properties")
	}
	if deref(types, a.Type).Kind != protocol.KindNumber {
		t.Fatalf("a expected number, got %+v", deref(types, a.Type))
	}
	if deref(types, b.Type).Kind != protocol.KindString {
		t.Fatalf("b expected string, got %+v", deref(types, b.Type))
	}
}

// ---- F8 — factory inference --------------------------------------------------

func TestF8_FactoryInference(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const makeUser = (id: number, name: string) => ({id, name});
const u = makeUser(1, 'm');
getRuntypeId(u);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	id := findMember(types, root, "id")
	name := findMember(types, root, "name")
	if id == nil || deref(types, id.Type).Kind != protocol.KindNumber {
		t.Fatalf("id expected number, got %+v", id)
	}
	if name == nil || deref(types, name.Type).Kind != protocol.KindString {
		t.Fatalf("name expected string, got %+v", name)
	}
}

// ---- Dedup -------------------------------------------------------------------

func TestDedupAcrossQueries(t *testing.T) {
	const primitive = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const userName: string = 'mario';
getRuntypeId(userName);
`
	const inferred = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const x = 42;
getRuntypeId(x);
`
	r := setupInline(t, map[string]string{
		"a.ts": primitive,
		"b.ts": inferred,
	})
	r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "a.ts"})
	r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "b.ts"})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFile, File: "a.ts"})
	if len(resp.Added) != 0 {
		t.Fatalf("expected no new types on dedup, got %d", len(resp.Added))
	}
}

// ---- F12 — array (`string[]`) ------------------------------------------------

func TestF12_Array(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const xs: string[] = ['a', 'b'];
getRuntypeId(xs);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindArray {
		t.Fatalf("expected array, got %+v", root)
	}
	elem := deref(types, root.Type)
	if elem == nil || elem.Kind != protocol.KindString {
		t.Fatalf("array element expected string, got %+v", elem)
	}
}

// ---- F13 — tuple (`[number, string?]`) ---------------------------------------

func TestF13_Tuple(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const tup: [number, string?] = [1];
getRuntypeId(tup);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindTuple {
		t.Fatalf("expected tuple, got %+v", root)
	}
	if len(root.Types) != 2 {
		t.Fatalf("expected 2 tuple members, got %d", len(root.Types))
	}
	first := deref(types, root.Types[0])
	second := deref(types, root.Types[1])
	if first == nil || first.Kind != protocol.KindTupleMember || deref(types, first.Type).Kind != protocol.KindNumber {
		t.Fatalf("first member expected tupleMember:number, got %+v", first)
	}
	if second == nil || second.Kind != protocol.KindTupleMember {
		t.Fatalf("second member expected tupleMember, got %+v", second)
	}
	if !second.Optional {
		t.Fatalf("second member expected optional=true")
	}
	if deref(types, second.Type).Kind != protocol.KindString {
		t.Fatalf("second member type expected string, got %+v", deref(types, second.Type))
	}
}

// ---- F14 — promise (`Promise<number>`) ---------------------------------------

func TestF14_Promise(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const p: Promise<number>;
getRuntypeId(p);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindPromise {
		t.Fatalf("expected promise, got %+v", root)
	}
	val := deref(types, root.Type)
	if val == nil || val.Kind != protocol.KindNumber {
		t.Fatalf("promise value expected number, got %+v", val)
	}
}

// ---- F15 — class -------------------------------------------------------------

func TestF15_Class(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
class User {
  id: number = 0;
  greet(): void {}
}
declare const u: User;
getRuntypeId<User>(u);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindClass {
		t.Fatalf("expected class, got %+v", root)
	}
	if root.TypeName != "User" {
		t.Fatalf("expected class typeName=User, got %q", root.TypeName)
	}
	id := findMember(types, root, "id")
	greet := findMember(types, root, "greet")
	if id == nil || id.Kind != protocol.KindProperty {
		t.Fatalf("id expected class property, got %+v", id)
	}
	if greet == nil || greet.Kind != protocol.KindMethod {
		t.Fatalf("greet expected class method, got %+v", greet)
	}
}

// ---- F16 — index signature ---------------------------------------------------

func TestF16_IndexSignature(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface M {
  [k: string]: number;
}
declare const m: M;
getRuntypeId<M>(m);
`
	r, root := resolveInline(t, code)
	types := dump(r)
	if root.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	var idx *protocol.Type
	for _, ref := range root.Types {
		m := deref(types, ref)
		if m != nil && m.Kind == protocol.KindIndexSignature {
			idx = m
			break
		}
	}
	if idx == nil {
		t.Fatalf("expected at least one indexSignature, got types=%+v", root.Types)
	}
	if deref(types, idx.Index).Kind != protocol.KindString {
		t.Fatalf("index expected string, got %+v", deref(types, idx.Index))
	}
	if deref(types, idx.Type).Kind != protocol.KindNumber {
		t.Fatalf("value expected number, got %+v", deref(types, idx.Type))
	}
}
