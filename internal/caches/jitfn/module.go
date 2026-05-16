package jitfn

import (
	"io"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// isTypeInnerPrefix is the prefix for the INNER validator function
// inside each createJitFn closure — what mion calls `jitFnHash` (the
// name used for self-recursive calls inside the body). The skeleton's
// `factory` builds the outer entry; the inner closure name is the only
// place this prefix still surfaces in the emitted JS.
const isTypeInnerPrefix = "isType_"

// IsTypeModule writes the runtime artifact for the isType cache module:
// the hand-authored skeleton with the marker line replaced by one
// `factory(…);` call per cached RunType the IsTypeEmitter supports.
// The skeleton's `factory` closes over the surrounding `initCache(jitUtils)`
// parameter, so the per-entry call site doesn't repeat the argument.
//
// Thin wrapper over RenderFnModule: every per-fn module renderer is one
// line once the Emitter is implemented. Adding typeErrors later is a
// one-line `TypeErrorsModule` next to this one.
func IsTypeModule(writer io.Writer, dump protocol.Dump) error {
	return RenderFnModule(writer, dump, constants.CacheModules["isType"], IsTypeEmitter{}, isTypeInnerPrefix, cachetpl.SkeletonIsType)
}

// RenderFnModule is the fn-agnostic module renderer. Emits one
// `factory('hash', …);` line per supported RunType then splices the
// result into the named skeleton. The skeleton's `factory` closes over
// `jitUtils` from its enclosing `initCache(jitUtils)`, so call sites
// stay compact.
//
// Entries are emitted in **child-before-parent** order so each
// factory's `createJitFn(jitUtils)` invocation can resolve its
// `utl.getJIT('<childHash>')` context items against an already-
// populated cache. The order is derived from each entry's
// `jitDependencies` (discovered during compile) via a DFS post-order
// walk over the input set; entries with no deps keep their input
// position relative to each other (stable topo sort).
//
// Kinds the emitter's Supports gate doesn't accept are silently
// skipped — the alternative (panicking) would crash the whole module
// for the presence of one unsupported kind, making kind-by-kind
// rollout impossible. The acceptance test in
// packages/vite-plugin-runtypes/test/jit-isType.test.ts asserts on the
// KindString case; if dispatch regresses for KindString the test fails
// loudly there.
//
// Parameters:
//   - settings: which CacheModule the factory uses for inner-closure
//     names; the VarPrefix prefixes the outer factory's debug name
//     inside createJitFn.
//   - emitter: the per-fn dispatch + Args + Finalize implementation.
//   - innerPrefix: the prefix for the INNER validator function inside
//     each createJitFn closure.
//   - skeleton: the cachetpl skeleton name to splice into.
func RenderFnModule(writer io.Writer, dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, skeleton string) error {
	var body strings.Builder
	body.WriteString("const u = undefined;\n")

	// Single-pass id→RunType index used by the walker to deref
	// KindRef sentinels at descent time. Cache entries store every
	// child slot as a ref (`{kind: -1, id: …}`) per protocol.go;
	// without the table the walker would dispatch on the ref's
	// placeholder kind and panic.
	refTable := make(map[string]*protocol.RunType, len(dump.RunTypes))
	for _, runType := range dump.RunTypes {
		if runType == nil || runType.ID == "" {
			continue
		}
		refTable[runType.ID] = runType
	}

	type compiled struct {
		line string
		deps []string
	}
	entries := make(map[string]compiled, len(dump.RunTypes))
	order := make([]string, 0, len(dump.RunTypes))
	for _, runType := range dump.RunTypes {
		if runType == nil || !emitter.Supports(runType) {
			continue
		}
		// Composite kinds (Array today; Union / Tuple / Class when they
		// land) reach unsupported subtrees through CompileChild. The
		// Supports() check is a per-node gate — it doesn't know what's
		// downstream. Walk the subtree against the ref table once
		// before compile so an array whose element is e.g. a union can
		// be skipped cleanly instead of panicking inside Emit.
		if !subtreeFullySupported(runType, refTable, emitter, map[string]bool{}) {
			continue
		}
		line, deps := renderEntryWithDeps(runType, settings, emitter, innerPrefix, refTable)
		if line == "" {
			continue
		}
		if _, exists := entries[runType.ID]; exists {
			continue
		}
		entries[runType.ID] = compiled{line: line, deps: deps}
		order = append(order, runType.ID)
	}

	// DFS post-order from each input entry to produce a stable topo
	// sort: children land before parents. Deps pointing to entries
	// outside the rendered set (e.g. unsupported kinds) are skipped —
	// the runtime cache miss surfaces at validator-call time, which
	// is the right place for that failure mode to land.
	visited := make(map[string]bool, len(entries))
	var topo []string
	var visit func(id string)
	visit = func(id string) {
		if visited[id] {
			return
		}
		visited[id] = true
		entry, ok := entries[id]
		if !ok {
			return
		}
		for _, dep := range entry.deps {
			if _, ok := entries[dep]; ok {
				visit(dep)
			}
		}
		topo = append(topo, id)
	}
	for _, id := range order {
		visit(id)
	}

	for _, id := range topo {
		body.WriteString(entries[id].line)
		body.WriteByte('\n')
	}

	out, err := cachetpl.Splice(skeleton, body.String())
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, out)
	return err
}

// renderEntryWithDeps compiles one RunType into its `factory(…);` line
// and returns the discovered jit-dependency hashes alongside. Inner
// function name is `<innerPrefix><hash>` (e.g. "isType_abc123"); the
// outer factory's debug name (`<VarPrefix><hash>`, e.g.
// "get_isType_abc123") is used only as the closure's printed name so
// consumers see the same identity in stack traces. Noop bodies return
// an empty line so the renderer skips them; consumers default to a
// trivial fallback on the JS side.
func renderEntryWithDeps(runType *protocol.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, refTable map[string]*protocol.RunType) (string, []string) {
	factoryName := settings.VarPrefix + runType.ID
	innerName := innerPrefix + runType.ID
	walker := NewWalker(runType, innerName, emitter)
	walker.RefTable = refTable
	innerFn, isNoop := walker.Compile()
	if isNoop {
		return "", nil
	}
	createJitFn := WrapClosure(factoryName, innerFn, walker.ContextLines())
	args := []string{
		quoteJS(runType.ID),
		quoteJS(jitTypeName(runType)),
		quoteJS(walker.Code),
		boolJS(isNoop),
		stringSliceJS(walker.JitDependencies),
		pureFnDepsJS(walker.PureFnDependencies),
		createJitFn,
	}
	deps := append([]string(nil), walker.JitDependencies...)
	return "factory(" + joinArgs(args) + ");", deps
}

// jitTypeName resolves the `typeName` field for a JitCompiledFn entry.
// Mion uses the RunType's declared TypeName when present; for anonymous
// atomics it falls back to a name derived from the kind. Names mirror
// mion's ReflectionKindName table at
// mion-run-types:packages/run-types/src/constants.kind.ts.
func jitTypeName(runType *protocol.RunType) string {
	if runType.TypeName != "" {
		return runType.TypeName
	}
	if runType.Kind == protocol.KindClass {
		switch runType.SubKind {
		case protocol.SubKindDate:
			return "date"
		case protocol.SubKindMap:
			return "map"
		case protocol.SubKindSet:
			return "set"
		}
	}
	switch runType.Kind {
	case protocol.KindAny:
		return "any"
	case protocol.KindUnknown:
		return "unknown"
	case protocol.KindNever:
		return "never"
	case protocol.KindVoid:
		return "void"
	case protocol.KindNull:
		return "null"
	case protocol.KindUndefined:
		return "undefined"
	case protocol.KindString:
		return "string"
	case protocol.KindNumber:
		return "number"
	case protocol.KindBoolean:
		return "boolean"
	case protocol.KindBigInt:
		return "bigint"
	case protocol.KindSymbol:
		return "symbol"
	case protocol.KindObject:
		// mion's ReflectionKindName maps deepkit's KindObject (4) to
		// 'objectLiteral'; the atomic node lives at nodes/atomic/object.ts.
		return "objectLiteral"
	case protocol.KindRegexp:
		return "regexp"
	case protocol.KindLiteral:
		return "literal"
	case protocol.KindEnum:
		return "enum"
	case protocol.KindArray:
		return "array"
	case protocol.KindObjectLiteral:
		return "objectLiteral"
	case protocol.KindClass:
		return "class"
	case protocol.KindProperty:
		return "property"
	case protocol.KindPropertySignature:
		return "propertySignature"
	case protocol.KindIndexSignature:
		return "indexSignature"
	case protocol.KindFunction:
		return "function"
	case protocol.KindMethod:
		return "method"
	case protocol.KindMethodSignature:
		return "methodSignature"
	case protocol.KindCallSignature:
		return "callSignature"
	case protocol.KindTuple:
		return "tuple"
	case protocol.KindTupleMember:
		return "tupleMember"
	case protocol.KindUnion:
		return "union"
	case protocol.KindTemplateLiteral:
		return "templateLiteral"
	case protocol.KindPromise:
		return "promise"
	}
	return ""
}

// subtreeFullySupported recursively checks whether every node the
// walker would descend into when emitting rt is supported by emitter.
// Used as a renderer-level gate so composite kinds (Array etc.)
// referencing an unsupported child kind (e.g. Union before that
// emitter lands) are silently skipped instead of panicking when the
// dispatch reaches the child's Emit arm.
//
// **Per-kind recursion mirrors what IsTypeEmitter.Emit actually
// descends into** — not what the RunType *carries*. Date is a
// KindClass that carries every prototype-method as a Child, but the
// emit is `v instanceof Date && !isNaN(v.getTime())` and never
// recurses; checking those methods here would (incorrectly) reject
// Date as unsupported. Each kind's branch enumerates only the slots
// the emit visits.
//
// `seen` carries the ids walked so far so cyclic graphs (e.g.
// `type CA = CA[]`) terminate. A cyclic edge back to an already-
// seen id is treated as supported — the cycle is closed by the
// dependency-call layer at runtime, not by recursing further here.
func subtreeFullySupported(rt *protocol.RunType, refTable map[string]*protocol.RunType, emitter Emitter, seen map[string]bool) bool {
	if rt == nil {
		return true
	}
	if rt.Kind == protocol.KindRef {
		// Always recurse to the resolved node — let it own the `seen`
		// marking. The earlier shape that marked `seen[ref.ID]` here
		// before recursing was buggy: ref.ID equals the target's ID,
		// so the resolved-node arm's `if seen[rt.ID] { return true }`
		// would fire on first visit and skip the actual content check.
		if rt.ID == "" {
			return false
		}
		return subtreeFullySupported(refTable[rt.ID], refTable, emitter, seen)
	}
	if !emitter.Supports(rt) {
		return false
	}
	if rt.ID != "" {
		if seen[rt.ID] {
			return true
		}
		seen[rt.ID] = true
	}
	switch rt.Kind {
	case protocol.KindArray:
		// Mirrors istype.go KindArray Emit — descends only into Child.
		return subtreeFullySupported(rt.Child, refTable, emitter, seen)
	case protocol.KindPromise:
		// Promise emit is a thenable check; the wrapped T isn't
		// validated synchronously (mion semantics). No descent.
		return true
	case protocol.KindClass:
		// Map / Set reach through their KindParameter wrappers in
		// Arguments to validate key / value / item types. Walk those
		// wrapped children for supportability so an unrenderable
		// element type rejects the whole Map / Set silently.
		if rt.SubKind == protocol.SubKindMap || rt.SubKind == protocol.SubKindSet {
			for _, arg := range rt.Arguments {
				wrapper := resolveRefForSupport(arg, refTable)
				if wrapper == nil || wrapper.Child == nil {
					continue
				}
				if !subtreeFullySupported(wrapper.Child, refTable, emitter, seen) {
					return false
				}
			}
			return true
		}
		// Other class subkinds (Date is atomic; SubKindNone uses the
		// shared object emit) fall through to the ObjectLiteral arm
		// below.
		fallthrough
	case protocol.KindObjectLiteral:
		// Mirrors emitObjectIsType — walks Children, but with the same
		// skip rules the emit applies: static members and direct
		// method-shaped children never participate in the AND chain
		// and so don't block supportability. PropertySignature with a
		// function-typed inner is checked deeper in this recursion
		// (the Property arm below handles its own skip).
		for _, child := range rt.Children {
			resolved := resolveRefForSupport(child, refTable)
			if resolved == nil {
				continue
			}
			if resolved.IsStatic {
				continue
			}
			if isFunctionLikeKind(resolved.Kind) {
				continue
			}
			if !subtreeFullySupported(child, refTable, emitter, seen) {
				return false
			}
		}
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		// Mirrors emitPropertyIsType — function-typed inner is skipped
		// (returns empty code), so supportability of a function inner
		// doesn't block the parent object.
		if rt.Child == nil {
			return true
		}
		resolved := resolveRefForSupport(rt.Child, refTable)
		if resolved != nil && isFunctionLikeKind(resolved.Kind) {
			return true
		}
		return subtreeFullySupported(rt.Child, refTable, emitter, seen)
	case protocol.KindIndexSignature:
		if rt.Child == nil {
			return true
		}
		resolved := resolveRefForSupport(rt.Child, refTable)
		if resolved != nil && isFunctionLikeKind(resolved.Kind) {
			return true
		}
		return subtreeFullySupported(rt.Child, refTable, emitter, seen)
	case protocol.KindTuple:
		// Mirrors emitTupleIsType — walks every Children entry. A
		// tuple member with an unsupported child can't be validated,
		// so the whole tuple is skipped.
		for _, child := range rt.Children {
			if !subtreeFullySupported(child, refTable, emitter, seen) {
				return false
			}
		}
		return true
	case protocol.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		resolved := resolveRefForSupport(rt.Child, refTable)
		if resolved != nil && isFunctionLikeKind(resolved.Kind) {
			// Function-typed tuple element — emit handles via
			// `=== undefined` (no descent needed).
			return true
		}
		return subtreeFullySupported(rt.Child, refTable, emitter, seen)
	case protocol.KindUnion:
		// Every union member must be supported — there's no graceful
		// "skip unsupported member" path here without changing union
		// semantics.
		children := rt.SafeUnionChildren
		if len(children) == 0 {
			children = rt.Children
		}
		for _, child := range children {
			if !subtreeFullySupported(child, refTable, emitter, seen) {
				return false
			}
		}
		return true
	}
	// Atomic kinds (and KindClass+SubKindDate, KindFunction etc treated
	// as atomic by the emit) have no descent — supported as-is.
	return true
}

// resolveRefForSupport is the supportability-walker's lightweight ref
// dereference. Symmetric with walker.resolveRef but lives here as a
// free function so the renderer doesn't need to instantiate a Walker
// just to traverse the supportability gate.
func resolveRefForSupport(rt *protocol.RunType, refTable map[string]*protocol.RunType) *protocol.RunType {
	if rt == nil {
		return nil
	}
	if rt.Kind != protocol.KindRef {
		return rt
	}
	if rt.ID == "" {
		return nil
	}
	return refTable[rt.ID]
}

// boolJS emits the JS literal for b.
func boolJS(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// joinArgs concatenates positional args with bare commas. The
// createJitFn arg is multi-line; padding around commas would not align
// readably across long entries, so emit them flush.
func joinArgs(args []string) string {
	var b []byte
	for i, a := range args {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, a...)
	}
	return string(b)
}
