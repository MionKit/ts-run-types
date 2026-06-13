package typefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// noopPredicateTypes builds the shared hand-built corpus for the predicate
// tables — same ref-table style as json_compat_test.go. Returns the ctx plus
// the types keyed by id for direct case lookups.
func noopPredicateTypes(t *testing.T) (*EmitContext, map[string]*protocol.RunType) {
	t.Helper()
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	undef := &protocol.RunType{ID: "und", Kind: protocol.KindUndefined}
	voidT := &protocol.RunType{ID: "vd", Kind: protocol.KindVoid}
	bigint := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	date := &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	mapT := &protocol.RunType{ID: "mp", Kind: protocol.KindClass, SubKind: protocol.SubKindMap}
	fn := &protocol.RunType{ID: "fn", Kind: protocol.KindFunction}

	propA := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propBig := &protocol.RunType{ID: "pbig", Kind: protocol.KindProperty, Name: "n", IsSafeName: true, Child: makeRef("big")}
	propDate := &protocol.RunType{ID: "pdat", Kind: protocol.KindProperty, Name: "at", IsSafeName: true, Child: makeRef("dat")}
	propFn := &protocol.RunType{ID: "pfn", Kind: protocol.KindProperty, Name: "onClick", IsSafeName: true, Child: makeRef("fn")}

	objCompat := &protocol.RunType{ID: "objCompat", Kind: protocol.KindObjectLiteral, TypeName: "Compat", Children: []*protocol.RunType{makeRef("pa")}}
	objBig := &protocol.RunType{ID: "objBig", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pbig")}}
	objDate := &protocol.RunType{ID: "objDate", Kind: protocol.KindObjectLiteral, TypeName: "Stamped", Children: []*protocol.RunType{makeRef("pa"), makeRef("pdat")}}
	objFnOnly := &protocol.RunType{ID: "objFn", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pfn")}}

	arrCompatObj := &protocol.RunType{ID: "arrCO", Kind: protocol.KindArray, Child: makeRef("objCompat")}
	arrStr := &protocol.RunType{ID: "arrStr", Kind: protocol.KindArray, Child: makeRef("str")}
	arrDate := &protocol.RunType{ID: "arrDat", Kind: protocol.KindArray, Child: makeRef("dat")}

	namedClass := &protocol.RunType{ID: "ncls", Kind: protocol.KindClass, SubKind: protocol.SubKindNone, TypeName: "User", Children: []*protocol.RunType{makeRef("pa")}}
	anonClass := &protocol.RunType{ID: "acls", Kind: protocol.KindClass, SubKind: protocol.SubKindNone, Children: []*protocol.RunType{makeRef("pa")}}

	unionAtomic := &protocol.RunType{ID: "uAt", Kind: protocol.KindUnion, Children: []*protocol.RunType{makeRef("str"), makeRef("num")}}
	unionDate := &protocol.RunType{ID: "uDat", Kind: protocol.KindUnion, Children: []*protocol.RunType{makeRef("str"), makeRef("dat")}}
	unionObjects := &protocol.RunType{ID: "uObj", Kind: protocol.KindUnion, Children: []*protocol.RunType{makeRef("objCompat"), makeRef("objBig")}}

	// The user-reported shape: circular JSON-compatible object —
	// `{a: string; d?: Self[]}` reached through an optional array prop.
	circArr := &protocol.RunType{ID: "circArr", Kind: protocol.KindArray, Child: makeRef("circ")}
	circProp := &protocol.RunType{ID: "circD", Kind: protocol.KindProperty, Name: "d", IsSafeName: true, Optional: true, Child: makeRef("circArr")}
	circ := &protocol.RunType{ID: "circ", Kind: protocol.KindObjectLiteral, TypeName: "ObjCircularArr", IsCircular: true, Children: []*protocol.RunType{makeRef("pa"), makeRef("circD")}}

	// Circular object that ALSO carries a Date — encode stays noop (Date
	// rides toJSON), decode must rebuild.
	circDArr := &protocol.RunType{ID: "circDArr", Kind: protocol.KindArray, Child: makeRef("circDat")}
	circDProp := &protocol.RunType{ID: "circDD", Kind: protocol.KindProperty, Name: "d", IsSafeName: true, Optional: true, Child: makeRef("circDArr")}
	circDat := &protocol.RunType{ID: "circDat", Kind: protocol.KindObjectLiteral, TypeName: "CircWithDate", IsCircular: true, Children: []*protocol.RunType{makeRef("pdat"), makeRef("circDD")}}

	all := []*protocol.RunType{
		str, num, undef, voidT, bigint, date, mapT, fn,
		propA, propBig, propDate, propFn,
		objCompat, objBig, objDate, objFnOnly,
		arrCompatObj, arrStr, arrDate,
		namedClass, anonClass,
		unionAtomic, unionDate, unionObjects,
		circArr, circProp, circ,
		circDArr, circDProp, circDat,
	}
	refTable := make(map[string]*protocol.RunType, len(all))
	byID := make(map[string]*protocol.RunType, len(all))
	for _, rt := range all {
		refTable[rt.ID] = rt
		byID[rt.ID] = rt
	}
	walker := &Walker{RefTable: refTable}
	return &EmitContext{walker: walker}, byID
}

// TestNoopType_PrepareVsRestore pins the per-kind arm tables of the two JSON
// transform predicates, including every spot where the encode and decode
// sides diverge (Date/Temporal/undefined noop on encode only; unions never
// noop on encode; object-member unions never noop on decode) and the
// cycle-as-noop fixpoint rule.
func TestNoopType_PrepareVsRestore(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id     string
		pjNoop bool
		rjNoop bool
	}{
		{"str", true, true},
		{"und", true, false},  // pj: JSON drops it natively; rj: `v = undefined` rebind
		{"vd", false, false},  // both halves rebind
		{"big", false, false}, // toString / BigInt()
		{"dat", true, false},  // encode rides toJSON; decode rebuilds new Date(v)
		{"mp", false, false},
		{"objCompat", true, true},
		{"objBig", false, false},
		{"objDate", true, false},
		{"objFn", true, true}, // function props are dropped slots on both halves
		{"arrCO", true, true},
		{"arrStr", true, true},
		{"arrDat", true, false},
		{"ncls", false, false}, // named class → class-serializer registry branch
		{"acls", true, true},   // anonymous class → structural walk
		{"uAt", false, true},   // encode guard-chain+throw; decode rides raw
		{"uDat", false, false}, // decode unwraps [idx, value] envelopes
		{"uObj", false, false}, // decode unwraps the [-1, merged] envelope
		{"circ", true, true},   // the user-reported shape — cycle is identity
		{"circDat", true, false},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForPrepareJson(types[c.id], ctx); got != c.pjNoop {
				t.Errorf("isNoopForPrepareJson(%s) = %v, want %v", c.id, got, c.pjNoop)
			}
			if got := isNoopForRestoreJson(types[c.id], ctx); got != c.rjNoop {
				t.Errorf("isNoopForRestoreJson(%s) = %v, want %v", c.id, got, c.rjNoop)
			}
		})
	}
}

// TestNoopType_PrepareJsonSafe pins the pjs arm table: atomics and
// extra-proof arrays pass through by reference; objects ALWAYS clone (the
// clone is the strip), unions keep their guard chain.
func TestNoopType_PrepareJsonSafe(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"str", true},
		{"und", true},
		{"arrStr", true},     // extra-proof element → shared by reference
		{"arrCO", false},     // object elements might carry extras → clone
		{"objCompat", false}, // clone is what strips undeclared keys
		{"ncls", false},
		{"uAt", false},
		{"dat", false}, // pjs eagerly emits toISOString()
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForPrepareJsonSafe(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForPrepareJsonSafe(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
}

// dumpFor wraps hand-built types into the no-sites Dump shape (the
// render-everything unit-test path of CollectFamilyEntries).
func dumpFor(types map[string]*protocol.RunType) protocol.Dump {
	all := make([]*protocol.RunType, 0, len(types))
	for _, rt := range types {
		all = append(all, rt)
	}
	return protocol.Dump{RunTypes: all}
}

// TestDispatchGate_CircularIdentityCollapses renders the user-reported shape
// (`{a: string; d?: Self[]}`, circular, fully JSON-compatible): pre-gate this
// emitted a self-recursive traversal that walked the whole value doing
// nothing (`for (…) {v.d[i0] = GkO(v.d[i0])} return v`, isNoop=false). The
// dispatch gate proves the cycle re-entry noop, the loop folds away, and the
// whole entry collapses to the short-form identity tuple.
func TestDispatchGate_CircularIdentityCollapses(t *testing.T) {
	_, types := noopPredicateTypes(t)
	dump := dumpFor(types)
	for _, familyKey := range []string{"prepareForJson", "restoreFromJson"} {
		graph := FamilyByKey(familyKey).Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
		key := operations.PlainHash(familyKey) + "_circ"
		entry := graph[key]
		if entry == nil {
			t.Fatalf("%s: no entry for circ", familyKey)
		}
		if !entry.IsNoop {
			t.Errorf("%s: circular JSON-compatible entry must collapse to noop, got body:\n%s", familyKey, entry.ArgsText)
		}
		if len(entry.Deps) != 0 {
			t.Errorf("%s: noop entry must carry no deps, got %v", familyKey, entry.Deps)
		}
	}
}

// TestDispatchGate_KeepsRealTransformDepCalls is the non-eliding control: a
// circular object carrying a Date still emits the real restore body — the
// self dep-call survives (predicate false), and so does the Date rebuild.
func TestDispatchGate_KeepsRealTransformDepCalls(t *testing.T) {
	_, types := noopPredicateTypes(t)
	dump := dumpFor(types)
	graph := FamilyByKey("restoreFromJson").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
	key := operations.PlainHash("restoreFromJson") + "_circDat"
	entry := graph[key]
	if entry == nil {
		t.Fatal("no rj entry for circDat")
	}
	if entry.IsNoop {
		t.Fatal("rj entry for a Date-carrying circular type must not be noop")
	}
	if !strings.Contains(entry.ArgsText, "new Date(") {
		t.Errorf("rj body must rebuild the Date:\n%s", entry.ArgsText)
	}
	if !strings.Contains(entry.ArgsText, key+"(") {
		t.Errorf("rj body must keep the self-recursive call for the live cycle:\n%s", entry.ArgsText)
	}
}

// TestDispatchGate_ElidesNoopExternalChild: an object holding a NAMED
// JSON-compatible child (external under the default name rule) used to emit
// `v.x = <dep>.fn(v.x); return v` plus the import edge. The gate composes
// around the child, the parent collapses to the short form, and no dep is
// recorded.
func TestDispatchGate_ElidesNoopExternalChild(t *testing.T) {
	_, types := noopPredicateTypes(t)
	propNamed := &protocol.RunType{ID: "pnc", Kind: protocol.KindProperty, Name: "x", IsSafeName: true, Child: makeRef("objCompat")}
	parent := &protocol.RunType{ID: "parent", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pnc")}}
	types["pnc"] = propNamed
	types["parent"] = parent
	dump := dumpFor(types)
	graph := FamilyByKey("restoreFromJson").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
	key := operations.PlainHash("restoreFromJson") + "_parent"
	entry := graph[key]
	if entry == nil {
		t.Fatal("no rj entry for parent")
	}
	if !entry.IsNoop {
		t.Errorf("parent of a noop external child must collapse to noop, got:\n%s", entry.ArgsText)
	}
	if len(entry.Deps) != 0 {
		t.Errorf("gated child must not be recorded as a dep, got %v", entry.Deps)
	}
}

// TestJsonComposite_ElidesNoopPrimitives: the composite reads its primitives'
// rendered IsNoop flags — identity primitives lose their binding, their call
// wrapper, and their import edge.
func TestJsonComposite_ElidesNoopPrimitives(t *testing.T) {
	rjKey := operations.PlainHash("restoreFromJson") + "_obj1"
	ukuwKey := operations.PlainHash("unknownKeysToUndefinedWire") + "_obj1"
	pjKey := operations.PlainHash("prepareForJson") + "_obj1"
	runType := &protocol.RunType{ID: "obj1", Kind: protocol.KindObjectLiteral}

	render := func(tag string, rendered entrymod.Graph) *entrymod.Entry {
		t.Helper()
		composite, ok := constants.JsonCompositeByTag(tag)
		if !ok {
			t.Fatalf("unknown composite tag %q", tag)
		}
		entry := collectJsonCompositeEntry(runType, tag, composite, RenderOpts{EmitMode: constants.EmitBoth}, rendered)
		if entry == nil {
			t.Fatalf("no composite entry for %q", tag)
		}
		return entry
	}
	noopGraph := entrymod.Graph{}
	noopGraph.Add(&entrymod.Entry{Key: rjKey, Kind: entrymod.KindTypeFn, FamilyTag: "rj", ArgsText: "'" + rjKey + "'", IsNoop: true})
	noopGraph.Add(&entrymod.Entry{Key: pjKey, Kind: entrymod.KindTypeFn, FamilyTag: "pj", ArgsText: "'" + pjKey + "'", IsNoop: true})
	noopGraph.Add(&entrymod.Entry{Key: ukuwKey, Kind: entrymod.KindTypeFn, FamilyTag: "ukuw", ArgsText: "'" + ukuwKey + "'"})

	// jdPR: rj noop → bare JSON.parse, no binding, no deps.
	entry := render("jdPR", noopGraph)
	if !strings.Contains(entry.ArgsText, "return JSON.parse(s);") || strings.Contains(entry.ArgsText, "rjFn") {
		t.Errorf("jdPR with noop rj must collapse to bare JSON.parse:\n%s", entry.ArgsText)
	}
	if len(entry.SoftDeps) != 0 {
		t.Errorf("jdPR with noop rj must carry no primitive deps, got %v", entry.SoftDeps)
	}

	// jdST: rj noop + ukuw live → only the ukuw binding survives.
	entry = render("jdST", noopGraph)
	if !strings.Contains(entry.ArgsText, "return ukuwFn(JSON.parse(s));") || strings.Contains(entry.ArgsText, "rjFn") {
		t.Errorf("jdST with noop rj must keep only the ukuw wrap:\n%s", entry.ArgsText)
	}
	if len(entry.SoftDeps) != 1 || entry.SoftDeps[0] != ukuwKey {
		t.Errorf("jdST deps must name only the live ukuw primitive, got %v", entry.SoftDeps)
	}

	// jeMU: pj noop → bare JSON.stringify.
	entry = render("jeMU", noopGraph)
	if !strings.Contains(entry.ArgsText, "return JSON.stringify(v);") || strings.Contains(entry.ArgsText, "pjFn") {
		t.Errorf("jeMU with noop pj must collapse to bare JSON.stringify:\n%s", entry.ArgsText)
	}

	// Control: a live (non-noop) rj keeps today's binding shape.
	liveGraph := entrymod.Graph{}
	liveGraph.Add(&entrymod.Entry{Key: rjKey, Kind: entrymod.KindTypeFn, FamilyTag: "rj", ArgsText: "'" + rjKey + "'"})
	entry = render("jdPR", liveGraph)
	if !strings.Contains(entry.ArgsText, "return rjFn(JSON.parse(s));") {
		t.Errorf("jdPR with live rj must keep the binding:\n%s", entry.ArgsText)
	}
	if len(entry.SoftDeps) != 1 || entry.SoftDeps[0] != rjKey {
		t.Errorf("jdPR deps must name the live rj primitive, got %v", entry.SoftDeps)
	}
}
