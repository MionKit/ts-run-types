package typefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Per-entry compile assertions over CompileEntryModule (module mode). The
// old aggregate ValidateModule render is gone; body-shape coverage now reads
// EntrySlots directly — slots.Code carries the raw (un-escaped) factory body,
// so substring assertions stay readable. Aggregate-level topo ordering and
// the dangling-dep cascade are covered at the resolver layer
// (internal/resolver/modules_test.go).

// compileValidateSlots compiles the validate entry for rootID against the
// given runtype set. EmitCreateRTFn=true so CreateRTFn-shape tests can read
// the inline closure; body tests read slots.Code either way.
func compileValidateSlots(t *testing.T, runTypes []*protocol.RunType, rootID string) EntrySlots {
	t.Helper()
	refTable := buildRefTable(runTypes)
	root := refTable[rootID]
	if root == nil {
		t.Fatalf("rootID %q not present in fixture", rootID)
	}
	if !FamilyByKey("validate").Emitter.Supports(root) {
		t.Fatalf("validate emitter does not support root %q (kind %d)", rootID, root.Kind)
	}
	return CompileEntryModule("validate", root, refTable, RenderOpts{EmitCreateRTFn: true}, "", nil)
}

// TestCompileValidate_SingleEntrySlots pins the full slot set for a simple
// atomic entry, plus its FormatEntryArray wire form (EmitCreateRTFn=true:
// the createRTFn slot carries the inline `function g_<key>(utl){…}` closure).
func TestCompileValidate_SingleEntrySlots(t *testing.T) {
	slots := compileValidateSlots(t, []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}}, "abc123")
	key := valKey("abc123")
	if slots.Key != key {
		t.Errorf("Key: got %q want %q", slots.Key, key)
	}
	if slots.FamilyTag != "val" {
		t.Errorf("FamilyTag: got %q want %q", slots.FamilyTag, "val")
	}
	if slots.TypeName != "string" {
		t.Errorf("TypeName: got %q want %q", slots.TypeName, "string")
	}
	wantCode := "return function " + key + "(v){return typeof v === 'string'}"
	if slots.Code != wantCode {
		t.Errorf("Code:\ngot  %q\nwant %q", slots.Code, wantCode)
	}
	wantFactory := "function g_" + key + "(utl){" + wantCode + "}"
	if slots.CreateRTFn != wantFactory {
		t.Errorf("CreateRTFn:\ngot  %q\nwant %q", slots.CreateRTFn, wantFactory)
	}
	if slots.IsNoop || slots.Skip || slots.ThrowCode != "" {
		t.Errorf("atomic entry must be plain code-bearing, got %+v", slots)
	}
	if len(slots.RTDeps) != 0 || len(slots.PureFnDeps) != 0 {
		t.Errorf("atomic entry must have no deps, got %+v / %+v", slots.RTDeps, slots.PureFnDeps)
	}
	wantArray := "['" + key + "','val','string'," +
		`'return function ` + key + `(v){return typeof v === \'string\'}',` +
		"false,u,u," + wantFactory + "]"
	if got := FormatEntryArray(slots); got != wantArray {
		t.Errorf("entry array:\ngot  %s\nwant %s", got, wantArray)
	}
}

// TestCompileValidate_DefaultEmitOmitsCreateRTFn pins the production-default
// shape: the body lives only in Code; no inline factory closure is emitted
// (the JS-side materializeRTFn rebuilds it via `new Function('utl', code)`).
func TestCompileValidate_DefaultEmitOmitsCreateRTFn(t *testing.T) {
	runTypes := []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}}
	slots := CompileEntryModule("validate", runTypes[0], buildRefTable(runTypes), RenderOpts{}, "", nil)
	if slots.CreateRTFn != "" {
		t.Errorf("default emit must NOT inline the createRTFn closure, got %q", slots.CreateRTFn)
	}
	if got := FormatEntryArray(slots); strings.Contains(got, "function g_") {
		t.Errorf("default-emit entry array must not carry a g_ closure: %s", got)
	}
}

// TestCompileValidate_AtomicEmitBodies asserts the emit body for each atomic
// kind we ported from mion. One row per kind keeps the regression surface
// explicit — drift in any single arm of ValidateEmitter.Emit lands as a
// focused failure here. Bodies must match the corresponding mion node's
// emitIsType output (mion-run-types:packages/run-types/src/nodes/atomic/).
func TestCompileValidate_AtomicEmitBodies(t *testing.T) {
	rows := []struct {
		name string
		rt   *protocol.RunType
		body string // expected substring of slots.Code
		noop bool   // any/unknown — Finalize collapses to noop
	}{
		{"number", &protocol.RunType{ID: "num", Kind: protocol.KindNumber}, "return Number.isFinite(v)", false},
		{"boolean", &protocol.RunType{ID: "boo", Kind: protocol.KindBoolean}, "return typeof v === 'boolean'", false},
		{"bigint", &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}, "return typeof v === 'bigint'", false},
		{"null", &protocol.RunType{ID: "nul", Kind: protocol.KindNull}, "return v === null", false},
		{"undefined", &protocol.RunType{ID: "und", Kind: protocol.KindUndefined}, "return typeof v === 'undefined'", false},
		{"void", &protocol.RunType{ID: "voi", Kind: protocol.KindVoid}, "return v === undefined", false},
		{"never", &protocol.RunType{ID: "nev", Kind: protocol.KindNever}, "return false", false},
		{"any", &protocol.RunType{ID: "any", Kind: protocol.KindAny}, "", true},
		{"unknown", &protocol.RunType{ID: "unk", Kind: protocol.KindUnknown}, "", true},
		{"object", &protocol.RunType{ID: "obj", Kind: protocol.KindObject}, "return (typeof v === 'object' && v !== null)", false},
		{"regexp", &protocol.RunType{ID: "reg", Kind: protocol.KindRegexp}, "return (v instanceof RegExp)", false},
		{"date", &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}, "return (v instanceof Date && !isNaN(v.getTime()))", false},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			slots := compileValidateSlots(t, []*protocol.RunType{row.rt}, row.rt.ID)
			if row.noop {
				// Noop entries carry no body and no factory closure; the
				// runtime registrar pre-sets the family identity. Wire form
				// is the short array: ['<key>','val','<name>',u,true].
				if !slots.IsNoop {
					t.Fatalf("kind %s must compile to a noop entry, got %+v", row.name, slots)
				}
				if slots.Code != "" || slots.CreateRTFn != "" {
					t.Errorf("noop kind %s must carry no body/closure, got %+v", row.name, slots)
				}
				wantArray := "['" + valKey(row.rt.ID) + "','val','" + slots.TypeName + "',u,true]"
				if got := FormatEntryArray(slots); got != wantArray {
					t.Errorf("noop entry array: got %s want %s", got, wantArray)
				}
				return
			}
			if slots.IsNoop {
				t.Fatalf("kind %s unexpectedly noop", row.name)
			}
			if !strings.Contains(slots.Code, row.body) {
				t.Errorf("expected body %q for kind %s in:\n%s", row.body, row.name, slots.Code)
			}
		})
	}
}

// TestCompileValidate_SymbolRootAlwaysThrows — KindSymbol is unsupported at
// root (see docs/UNSUPPORTED-KINDS.md FAQ): the compile yields an alwaysThrow
// entry keyed by VL002, not a body-bearing validator.
func TestCompileValidate_SymbolRootAlwaysThrows(t *testing.T) {
	slots := compileValidateSlots(t, []*protocol.RunType{{ID: "sym", Kind: protocol.KindSymbol}}, "sym")
	if slots.ThrowCode != "VL002" {
		t.Fatalf("symbol root must throw with VL002, got %+v", slots)
	}
	if slots.Code != "" || slots.IsNoop || slots.Skip {
		t.Errorf("alwaysThrow entry must carry no body and not be noop/skip, got %+v", slots)
	}
	wantArray := "['" + valKey("sym") + "','val','symbol',u,false,u,u,u,'VL002']"
	if got := FormatEntryArray(slots); got != wantArray {
		t.Errorf("alwaysThrow entry array: got %s want %s", got, wantArray)
	}
}

// TestCompileValidate_LiteralEmitBodies covers the literal sub-cases
// (mion:literal.ts:88-105): string, number, boolean, bigint (via Flags),
// symbol (via Flags + map).
func TestCompileValidate_LiteralEmitBodies(t *testing.T) {
	rows := []struct {
		name string
		rt   *protocol.RunType
		body string
	}{
		{
			"string", &protocol.RunType{ID: "ls", Kind: protocol.KindLiteral, Literal: "a"},
			"return v === 'a'",
		},
		{
			"number int", &protocol.RunType{ID: "li", Kind: protocol.KindLiteral, Literal: int64(2)},
			"return v === 2",
		},
		{
			"number float", &protocol.RunType{ID: "lf", Kind: protocol.KindLiteral, Literal: float64(1.5)},
			"return v === 1.5",
		},
		{
			"boolean", &protocol.RunType{ID: "lb", Kind: protocol.KindLiteral, Literal: true},
			"return v === true",
		},
		{
			"bigint", &protocol.RunType{ID: "lbi", Kind: protocol.KindLiteral, Literal: "1", Flags: []string{"bigint"}},
			"return v === 1n",
		},
		{
			"symbol", &protocol.RunType{ID: "lsy", Kind: protocol.KindLiteral, Literal: map[string]any{"symbol": "hello"}, Flags: []string{"symbol"}},
			"return typeof v === 'symbol' && v.description === 'hello'",
		},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			slots := compileValidateSlots(t, []*protocol.RunType{row.rt}, row.rt.ID)
			if !strings.Contains(slots.Code, row.body) {
				t.Errorf("expected body %q for literal %s in:\n%s", row.body, row.name, slots.Code)
			}
		})
	}
}

// TestCompileValidate_EnumEmitBody covers KindEnum's mixed-value chain
// (mion:nodes/atomic/enum.ts:14) with the Color enum from enum.spec.ts.
func TestCompileValidate_EnumEmitBody(t *testing.T) {
	enum := &protocol.RunType{
		ID:     "enm",
		Kind:   protocol.KindEnum,
		Values: []any{int64(0), "green", int64(2)},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{enum}, "enm")
	want := "return (v === 0 || v === 'green' || v === 2)"
	if !strings.Contains(slots.Code, want) {
		t.Errorf("expected enum body %q in:\n%s", want, slots.Code)
	}
}

// TestCompileValidate_ArrayEmitBody covers KindArray's canonical block
// (mion:nodes/member/array.ts:emitIsType): Array.isArray guard, numbered
// for-loop, inlined atomic child check.
func TestCompileValidate_ArrayEmitBody(t *testing.T) {
	array := &protocol.RunType{ID: "ar1", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}}
	slots := compileValidateSlots(t, []*protocol.RunType{array}, "ar1")
	for _, fragment := range []string{
		"if (!Array.isArray(v)) return false;",
		"for (let i0 = 0; i0 < v.length; i0++) {",
		"const res0 = typeof v[i0] === 'string';",
		"if (!(res0)) return false;",
		"return true",
	} {
		if !strings.Contains(slots.Code, fragment) {
			t.Errorf("expected array body fragment %q in:\n%s", fragment, slots.Code)
		}
	}
}

// TestCompileValidate_NestedArrayDependencyCall covers `string[][]` — the
// outer array's entry must carry the inner array as a same-family dep:
// RTDeps holds the inner key, the body's getRT prologue resolves it, and the
// element check calls `<innerKey>.fn(v[i0])`. (Closure ordering — inner
// before outer — is a resolver-layer concern; see modules_test.go.)
func TestCompileValidate_NestedArrayDependencyCall(t *testing.T) {
	inner := &protocol.RunType{
		ID:    "inn",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "str", Kind: protocol.KindString},
	}
	outer := &protocol.RunType{
		ID:    "out",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "inn", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{outer, inner}, "out")
	innerKey := valKey("inn")
	if len(slots.RTDeps) != 1 || slots.RTDeps[0] != innerKey {
		t.Errorf("outer RTDeps must be [%s], got %v", innerKey, slots.RTDeps)
	}
	if !strings.Contains(slots.Code, "const "+innerKey+" = utl.getRT('"+innerKey+"')") {
		t.Errorf("outer body must declare the getRT context item for the inner hash, got:\n%s", slots.Code)
	}
	if !strings.Contains(slots.Code, innerKey+".fn(v[i0])") {
		t.Errorf("outer body must call inner via `<hash>.fn(args)`, got:\n%s", slots.Code)
	}
}

// TestCompileValidate_ArrayNoIsArrayCheck — the `noIsArrayCheck`
// ValidateOptions variant compiles under its variant fnHash key with the
// leading Array.isArray guard stripped; the plain compile keeps the guard.
// Mirrors mion's `comp.opts.noIsArrayCheck` branch in array.ts:emitIsType.
func TestCompileValidate_ArrayNoIsArrayCheck(t *testing.T) {
	runTypes := []*protocol.RunType{{
		ID:    "an1",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "str", Kind: protocol.KindString},
	}}
	refTable := buildRefTable(runTypes)

	plain := CompileEntryModule("validate", refTable["an1"], refTable, RenderOpts{}, "", nil)
	if plain.Key != valKey("an1") {
		t.Errorf("plain key: got %q want %q", plain.Key, valKey("an1"))
	}
	if !strings.Contains(plain.Code, "Array.isArray") {
		t.Errorf("plain validate entry must keep the Array.isArray guard, got:\n%s", plain.Code)
	}

	variant := CompileEntryModule("validate", refTable["an1"], refTable, RenderOpts{}, "NA", []string{"noIsArrayCheck"})
	if variant.Key != itVariantKey([]string{"noIsArrayCheck"}, "an1") {
		t.Errorf("variant key: got %q want %q", variant.Key, itVariantKey([]string{"noIsArrayCheck"}, "an1"))
	}
	// Variants keep the BASE family tag — the variant axis lives in the key.
	if variant.FamilyTag != "val" {
		t.Errorf("variant FamilyTag: got %q want %q", variant.FamilyTag, "val")
	}
	if strings.Contains(variant.Code, "Array.isArray") {
		t.Errorf("valNA variant must omit the Array.isArray guard, got:\n%s", variant.Code)
	}
	if !strings.Contains(variant.Code, "for (let i0 = 0;") {
		t.Errorf("valNA variant must still emit the element loop, got:\n%s", variant.Code)
	}
}

// TestCompileValidate_InterfaceEmitBody covers KindObjectLiteral — the
// canonical object guard AND-chained with each PropertySignature child's
// check; atomic children inline through the RefTable deref.
func TestCompileValidate_InterfaceEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	propA := &protocol.RunType{ID: "pA", Kind: protocol.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propB := &protocol.RunType{ID: "pB", Kind: protocol.KindPropertySignature, Name: "b", IsSafeName: true, Child: makeRef("num")}
	iface := &protocol.RunType{
		ID:       "if1",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pA"), makeRef("pB")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{iface, propA, propB, stringRT, numberRT}, "if1")
	want := "(typeof v === 'object' && v !== null && typeof v.a === 'string' && Number.isFinite(v.b))"
	if !strings.Contains(slots.Code, want) {
		t.Errorf("expected interface body %q in:\n%s", want, slots.Code)
	}
}

// TestCompileValidate_OptionalPropertyEmitBody checks the optional guard
// wrap — `(v.<name> === undefined || <childCheck>)`.
func TestCompileValidate_OptionalPropertyEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	propA := &protocol.RunType{ID: "pA", Kind: protocol.KindPropertySignature, Name: "a", IsSafeName: true, Optional: true, Child: makeRef("str")}
	iface := &protocol.RunType{
		ID:       "if2",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pA")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{iface, propA, stringRT}, "if2")
	want := "(v.a === undefined || typeof v.a === 'string')"
	if !strings.Contains(slots.Code, want) {
		t.Errorf("expected optional-property body %q in:\n%s", want, slots.Code)
	}
}

// TestCompileValidate_FunctionPropertyDropped — function-flavoured
// properties are dropped from the parent's AND chain (mion's
// `getRTChild → undefined` short-circuit for methods).
func TestCompileValidate_FunctionPropertyDropped(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	fnRT := &protocol.RunType{ID: "fn", Kind: protocol.KindFunction}
	propName := &protocol.RunType{ID: "pN", Kind: protocol.KindPropertySignature, Name: "name", IsSafeName: true, Child: makeRef("str")}
	propMethod := &protocol.RunType{ID: "pM", Kind: protocol.KindPropertySignature, Name: "method", IsSafeName: true, Child: makeRef("fn")}
	iface := &protocol.RunType{
		ID:       "if3",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pN"), makeRef("pM")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{iface, propName, propMethod, stringRT, fnRT}, "if3")
	if strings.Contains(slots.Code, "v.method") {
		t.Errorf("function-typed property should be dropped from the AND chain, got:\n%s", slots.Code)
	}
	if !strings.Contains(slots.Code, "typeof v.name === 'string'") {
		t.Errorf("non-function sibling should still be checked, got:\n%s", slots.Code)
	}
}

// TestCompileValidate_IndexSignatureEmitBody covers KindIndexSignature — the
// for-in iteration with a value-type check.
func TestCompileValidate_IndexSignatureEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	index := &protocol.RunType{ID: "ix", Kind: protocol.KindIndexSignature, Child: makeRef("str")}
	iface := &protocol.RunType{
		ID:       "if4",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("ix")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{iface, index, stringRT}, "if4")
	for _, fragment := range []string{
		"for (const k0 in v)",
		"typeof v[k0] === 'string'",
		"return true",
	} {
		if !strings.Contains(slots.Code, fragment) {
			t.Errorf("expected index-signature fragment %q in:\n%s", fragment, slots.Code)
		}
	}
}

// TestCompileValidate_FunctionTopLevelEmitBody — a free-standing function
// runtype emits the bare typeof check.
func TestCompileValidate_FunctionTopLevelEmitBody(t *testing.T) {
	slots := compileValidateSlots(t, []*protocol.RunType{{ID: "fn1", Kind: protocol.KindFunction}}, "fn1")
	if !strings.Contains(slots.Code, "return typeof v === 'function'") {
		t.Errorf("expected function body in:\n%s", slots.Code)
	}
}

// TestCompileValidate_TupleEmitBody covers KindTuple: Array.isArray guard,
// length-bound guard (no rest member), per-member checks.
func TestCompileValidate_TupleEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	pos0 := 0
	pos1 := 1
	member0 := &protocol.RunType{ID: "m0", Kind: protocol.KindTupleMember, Position: &pos0, Child: makeRef("str")}
	member1 := &protocol.RunType{ID: "m1", Kind: protocol.KindTupleMember, Position: &pos1, Child: makeRef("num")}
	tuple := &protocol.RunType{
		ID:       "tp1",
		Kind:     protocol.KindTuple,
		Children: []*protocol.RunType{makeRef("m0"), makeRef("m1")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{tuple, member0, member1, stringRT, numberRT}, "tp1")
	for _, fragment := range []string{
		"if (!Array.isArray(v)) return false;",
		"if (v.length > 2) return false;",
		"(typeof v[0] === 'string')",
		"(Number.isFinite(v[1]))",
		"return true",
	} {
		if !strings.Contains(slots.Code, fragment) {
			t.Errorf("expected tuple fragment %q in:\n%s", fragment, slots.Code)
		}
	}
}

// TestCompileValidate_TupleOptionalMember — optional tuple element wraps
// with `(v[i] === undefined || (childCheck))`.
func TestCompileValidate_TupleOptionalMember(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	pos0 := 0
	member0 := &protocol.RunType{ID: "m0", Kind: protocol.KindTupleMember, Position: &pos0, Optional: true, Child: makeRef("str")}
	tuple := &protocol.RunType{
		ID:       "tp2",
		Kind:     protocol.KindTuple,
		Children: []*protocol.RunType{makeRef("m0")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{tuple, member0, stringRT}, "tp2")
	want := "(v[0] === undefined || (typeof v[0] === 'string'))"
	if !strings.Contains(slots.Code, want) {
		t.Errorf("expected optional tuple member %q in:\n%s", want, slots.Code)
	}
}

// TestCompileValidate_UnionAtomicEmitBody — union of atomic types produces
// an OR-chain.
func TestCompileValidate_UnionAtomicEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	union := &protocol.RunType{
		ID:       "un1",
		Kind:     protocol.KindUnion,
		Children: []*protocol.RunType{makeRef("str"), makeRef("num")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{union, stringRT, numberRT}, "un1")
	want := "(typeof v === 'string' || Number.isFinite(v))"
	if !strings.Contains(slots.Code, want) {
		t.Errorf("expected atomic union body %q in:\n%s", want, slots.Code)
	}
}

// TestCompileValidate_UnionObjectsShareNullGuard — object-like members lift
// the `typeof === 'object' && !== null` guard outside their OR-chain.
func TestCompileValidate_UnionObjectsShareNullGuard(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	propA := &protocol.RunType{ID: "pA", Kind: protocol.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	object := &protocol.RunType{
		ID:       "ob1",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pA")},
	}
	union := &protocol.RunType{
		ID:       "un2",
		Kind:     protocol.KindUnion,
		Children: []*protocol.RunType{makeRef("str"), makeRef("ob1")},
	}
	slots := compileValidateSlots(t, []*protocol.RunType{union, object, propA, stringRT}, "un2")
	if !strings.Contains(slots.Code, "typeof v === 'object' && v !== null") {
		t.Errorf("expected shared object-null guard in union body, got:\n%s", slots.Code)
	}
}

// TestCompileValidate_UnsupportedRootsGatedBySupports — KindIntersection
// stays unsupported (mion resolves intersections at compile time), and a
// KindUnion with no children degenerates to unsupported. Both are gated by
// Emitter.Supports — the resolver never calls CompileEntryModule for them,
// so no module exists. A supported sibling still compiles.
func TestCompileValidate_UnsupportedRootsGatedBySupports(t *testing.T) {
	validate := FamilyByKey("validate").Emitter
	if validate.Supports(&protocol.RunType{ID: "u1", Kind: protocol.KindUnion}) {
		t.Error("empty KindUnion must be unsupported")
	}
	if validate.Supports(&protocol.RunType{ID: "x1", Kind: protocol.KindIntersection}) {
		t.Error("KindIntersection must be unsupported")
	}
	slots := compileValidateSlots(t, []*protocol.RunType{{ID: "s1", Kind: protocol.KindString}}, "s1")
	if slots.Code == "" {
		t.Errorf("KindString must compile to a code-bearing entry, got %+v", slots)
	}
}

// TestCompileValidate_CodeNSPropagation covers the unsupported-leaf bubble-up
// semantics per node: a propagating unsupported leaf with no per-family diag
// code marks the entry Skip (the resolver's cascade then drops dependents);
// property positions absorb the leaf instead; a NonSerializable class root
// compiles to an alwaysThrow entry carrying VL001 on the wire.
func TestCompileValidate_CodeNSPropagation(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	// KindIntersection is unsupported at the leaf — a stand-in for "any
	// future kind without an emit".
	unsupportedLeaf := &protocol.RunType{ID: "uns", Kind: protocol.KindIntersection}

	t.Run("array_of_unsupported_skips", func(t *testing.T) {
		array := &protocol.RunType{ID: "ar1", Kind: protocol.KindArray, Child: makeRef("uns")}
		slots := compileValidateSlots(t, []*protocol.RunType{array, unsupportedLeaf, stringRT}, "ar1")
		if !slots.Skip {
			t.Errorf("array of unsupported leaf must compile to Skip, got %+v", slots)
		}
	})

	t.Run("object_with_one_unsupported_prop_renders_without_it", func(t *testing.T) {
		// v2: property positions ABSORB unsupported children. The object's
		// emit drops the unsupported property from its AND chain and still
		// renders for the supported siblings.
		propUns := &protocol.RunType{ID: "pU", Kind: protocol.KindPropertySignature, Name: "u", IsSafeName: true, Child: makeRef("uns")}
		propOk := &protocol.RunType{ID: "pO", Kind: protocol.KindPropertySignature, Name: "o", IsSafeName: true, Child: makeRef("str")}
		iface := &protocol.RunType{
			ID:       "if1",
			Kind:     protocol.KindObjectLiteral,
			Children: []*protocol.RunType{makeRef("pU"), makeRef("pO")},
		}
		slots := compileValidateSlots(t, []*protocol.RunType{iface, propUns, propOk, unsupportedLeaf, stringRT}, "if1")
		if slots.Skip || slots.Code == "" {
			t.Fatalf("object with one unsupported property must still render (absorption), got %+v", slots)
		}
		if strings.Contains(slots.Code, "v.u") {
			t.Errorf("rendered body should not reference dropped property 'u', got:\n%s", slots.Code)
		}
		if !strings.Contains(slots.Code, "v.o") {
			t.Errorf("rendered body should reference surviving property 'o', got:\n%s", slots.Code)
		}
	})

	t.Run("union_with_one_unsupported_member_skips", func(t *testing.T) {
		union := &protocol.RunType{
			ID:       "un1",
			Kind:     protocol.KindUnion,
			Children: []*protocol.RunType{makeRef("str"), makeRef("uns")},
		}
		slots := compileValidateSlots(t, []*protocol.RunType{union, unsupportedLeaf, stringRT}, "un1")
		if !slots.Skip {
			t.Errorf("union with one unsupported member must compile to Skip, got %+v", slots)
		}
	})

	t.Run("nested_array_of_unsupported_cascades_via_dep", func(t *testing.T) {
		// Outer Array[Array[Unsupported]]: the inner array is a non-inlined
		// composite, so the OUTER entry compiles to a dependency call on it
		// while the INNER entry itself Skips. The outer's removal is the
		// resolver cascade's job — its RTDeps edge to the skipped inner is
		// what the module-mode dangling-dep cascade keys on (see
		// internal/resolver/modules_test.go).
		innerArray := &protocol.RunType{ID: "ai", Kind: protocol.KindArray, Child: makeRef("uns")}
		outerArray := &protocol.RunType{ID: "ao", Kind: protocol.KindArray, Child: makeRef("ai")}
		runTypes := []*protocol.RunType{outerArray, innerArray, unsupportedLeaf}
		if slots := compileValidateSlots(t, runTypes, "ai"); !slots.Skip {
			t.Errorf("inner array of unsupported must Skip, got %+v", slots)
		}
		outer := compileValidateSlots(t, runTypes, "ao")
		if outer.Skip {
			t.Fatalf("outer array compiles as a dep call (cascade happens at the resolver), got Skip")
		}
		if len(outer.RTDeps) != 1 || outer.RTDeps[0] != valKey("ai") {
			t.Errorf("outer must carry the inner dep edge the cascade keys on, got %v", outer.RTDeps)
		}
	})

	t.Run("plain_user_class_with_nonserializable_subkind_throws", func(t *testing.T) {
		nonSerializable := &protocol.RunType{ID: "ns1", Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable}
		slots := compileValidateSlots(t, []*protocol.RunType{nonSerializable, stringRT}, "ns1")
		if slots.ThrowCode != "VL001" {
			t.Fatalf("KindClass+SubKindNonSerializable must compile to an alwaysThrow entry with VL001, got %+v", slots)
		}
		array := FormatEntryArray(slots)
		if !strings.Contains(array, "'VL001'") {
			t.Errorf("alwaysThrow entry array must carry the diag code, got: %s", array)
		}
		if strings.Contains(array, "throw new Error(") {
			t.Errorf("v2 wire format must not embed throw-body strings, got: %s", array)
		}
	})
}

// TestCompileValidate_Deterministic — compiling the same root twice yields
// identical slots and wire bytes.
func TestCompileValidate_Deterministic(t *testing.T) {
	runTypes := []*protocol.RunType{
		{ID: "a", Kind: protocol.KindString},
		{ID: "b", Kind: protocol.KindString},
	}
	first := compileValidateSlots(t, runTypes, "a")
	second := compileValidateSlots(t, runTypes, "a")
	if FormatEntryArray(first) != FormatEntryArray(second) {
		t.Errorf("compile is non-deterministic:\nfirst:  %s\nsecond: %s", FormatEntryArray(first), FormatEntryArray(second))
	}
}

// TestCompileValidate_TypeNameUsesDeclaredOverride — a declared TypeName
// lands in the typeName slot.
func TestCompileValidate_TypeNameUsesDeclaredOverride(t *testing.T) {
	slots := compileValidateSlots(t, []*protocol.RunType{{ID: "x", Kind: protocol.KindString, TypeName: "MyBrandedString"}}, "x")
	if slots.TypeName != "MyBrandedString" {
		t.Errorf("expected declared TypeName override, got %q", slots.TypeName)
	}
	if !strings.Contains(FormatEntryArray(slots), "'MyBrandedString'") {
		t.Errorf("entry array missing TypeName: %s", FormatEntryArray(slots))
	}
}

func TestQuoteJS_EscapesSpecialChars(t *testing.T) {
	cases := map[string]string{
		"hello":       "'hello'",
		"with'quote":  `'with\'quote'`,
		"back\\slash": `'back\\slash'`,
		"new\nline":   `'new\nline'`,
		"tab\there":   `'tab\there'`,
	}
	for in, want := range cases {
		if got := quoteJS(in); got != want {
			t.Errorf("quoteJS(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStringSliceJS_EmptyAndPopulated(t *testing.T) {
	if got := stringSliceJS(nil); got != "[]" {
		t.Errorf("nil → %q, want []", got)
	}
	if got := stringSliceJS([]string{}); got != "[]" {
		t.Errorf("empty → %q, want []", got)
	}
	if got := stringSliceJS([]string{"a", "b"}); got != "['a','b']" {
		t.Errorf("two → %q, want ['a','b']", got)
	}
}
