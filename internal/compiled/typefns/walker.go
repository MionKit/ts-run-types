package typefns

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// debugInlineEnv resolves mion's `getENV('DEBUG_JIT') === 'INLINED'`
// branch once per process. Cheap (env vars are cached at runtime
// startup); a package-level var matches mion's process-wide
// resolution and avoids threading the lookup through every Walker.
var debugInlineEnv = os.Getenv("DEBUG_JIT") == "INLINED"

// StackItem mirrors mion's StackItem (jitFnCompiler.ts:33). One frame
// per RunType the walker is currently inside. Vλl is snapshotted on
// push so popStack can restore the parent's accessor.
//
// ChildAccessor is the JS expression the NEXT pushStack should adopt
// as the child's Vλl. Collection emitters (Array, Object, Tuple, …)
// set it before each CompileChild call so the child frame inherits
// the correct subscript / property expression. Mirrors mion's
// `getChildVλl()` (jitFnCompiler.ts:734) which queries the parent's
// `useArrayAccessor()` + `getChildLiteral()` to assemble the
// expression — our Go port hands the assembled expression directly.
//
// ChildPathLiteral is the same idea but for typeErrors path tracking:
// the JS expression (string literal or variable reference) the NEXT
// pushed frame contributes to the static access-path array used when
// building a RunTypeError. Symmetric with ChildAccessor — set by the
// parent emit before CompileChild, consumed at pushStack and stored
// on the child frame as PathLiteral. Empty for kinds that don't
// contribute to the path (atomic, tuple wrapper, …).
//
// PathLiteral is the snapshot of the parent's ChildPathLiteral at
// pushStack time. AccessPathLiteral walks every stack frame and joins
// non-empty PathLiterals into a `[seg1, seg2, …]` array literal.
// Mirrors mion's getAccessPath (jitFnCompiler.ts:753) where each
// frame's `getStaticPathLiteral()` or `getChildLiteral()` contributes.
type StackItem struct {
	Vλl              string
	RT               *protocol.RunType
	ChildAccessor    string
	ChildPathLiteral string
	PathLiteral      string
}

// orderedItems maintains insertion order for context items so the
// emitted JS source is deterministic across runs. Mirrors mion's
// `contextCodeItems = new Map<string, string>()` (jitFnCompiler.ts:96):
// JS Maps preserve insertion order; Go's built-in maps don't, so we
// keep an explicit slice of keys.
type orderedItems struct {
	keys   []string
	values map[string]string
}

func newOrderedItems() *orderedItems {
	return &orderedItems{values: map[string]string{}}
}

func (o *orderedItems) set(key, value string) {
	if _, exists := o.values[key]; !exists {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

func (o *orderedItems) has(key string) bool { _, ok := o.values[key]; return ok }

func (o *orderedItems) get(key string) (string, bool) { v, ok := o.values[key]; return v, ok }

func (o *orderedItems) ordered() []string {
	out := make([]string, len(o.keys))
	for i, key := range o.keys {
		out[i] = o.values[key]
	}
	return out
}

// Walker is the Go-side port of mion's BaseFnCompiler
// (jitFnCompiler.ts:49), minus the per-fn specifics. Walks a RunType
// graph, dispatches each node through the supplied Emitter, reconciles
// child code types with parent expectations, and assembles the final
// closure body.
//
// One Walker per emitted jit function instance. The Walker owns
// traversal state (Stack, Vλl, Code, ContextItems, deps); the Emitter
// owns the per-fn switch and finalize logic. Adding a new fn = one
// new Emitter implementation; the Walker stays untouched.
type Walker struct {
	// RootType is the entry-point RunType for this jit function.
	RootType *protocol.RunType
	// FnName is the inner function name (e.g. "isType_<hash>") that
	// lands in the emitted `function <FnName>(<args>){…}`.
	FnName string
	// JitFnHash is the namespaced cache key (e.g. "isType_abc123",
	// "typeErrors_abc123") the renderer uses as the JS-side cache
	// key. Namespaced so the same runtype ID can have a distinct
	// entry per jit fn (isType + typeErrors + …) without colliding
	// in the global jitFnsCache. Required by EmitDependencyCall to
	// detect self-recursive calls (childID == JitFnHash → emit
	// `<hash>(args)` without the `.fn` indirection, mirroring mion's
	// `isSelf` branch).
	JitFnHash string
	// InnerPrefix is the namespacing prefix the current emitter uses
	// (e.g. "isType_", "typeErrors_"). Set by the renderer after
	// NewWalker so dispatch can compose namespaced childIDs and the
	// renderer's dep tracking is consistent with the factory keys.
	InnerPrefix string
	// RefTable resolves KindRef sentinels to their real RunType.
	// Per `internal/protocol/protocol.go`, all Child / Children /
	// Parameters slots in the JSON wire form carry refs
	// (`{kind: -1, id: "<hash>"}`); the consumer side re-knots by
	// indexing into the cache. The walker uses this map at descent
	// time so the per-kind switch always sees the resolved kind.
	// May be nil when the input graph is fully knotted (e.g. unit
	// tests that hand-construct RunType structs with child Kinds
	// already inlined).
	RefTable map[string]*protocol.RunType
	// Emitter supplies the per-fn args, dispatch, and finalize logic.
	Emitter Emitter
	// PreserveExtras is set by NewWalker when the emitter is the
	// clone+preserve variant (PrepareForJsonSafePreserveEmitter) — read
	// by buildSafeObjectLiteral to spread `...v` into the cloned object
	// literal so undeclared keys survive the clone.
	PreserveExtras bool
	// Vλl is the current value-accessor expression. Recomputed on
	// every pushStack from the live stack of frames. For an atomic
	// root it equals the first arg's Name (e.g. "v"); for a member
	// frame future kinds will extend it (e.g. "v.foo", "v[i0]").
	Vλl string
	// Stack is the live traversal stack. The Walker pushes the root
	// on Compile entry; emitters indirectly push more frames by
	// calling EmitContext.CompileChild.
	Stack []StackItem
	// localVarCounters assigns unique names to each emitter-local
	// variable allocated via EmitContext.NextLocalVar, partitioned
	// by prefix. Mirrors mion's getLocalVarName (jitFnCompiler.ts:236)
	// which keys the counter on (prefix × RT identity) — our flat
	// per-prefix counter is equivalent for the access pattern where
	// each Emit allocates a fixed number of names once.
	localVarCounters map[string]int
	// Code is the assembled function body. The Walker stores the
	// most recent root-level emitted code here; Finalize normalises
	// it on exit.
	Code string
	// ContextItems is an ordered set of `const xyz = …;` declarations
	// that WrapClosure emits before the inner function returns.
	ContextItems *orderedItems
	// JitDependencies / PureFnDependencies track which other jit and
	// pure functions this function reaches via dependency calls.
	// PureFnDependencies carries the full (namespace, fnName, filePath)
	// triple for the Go-side integrity check; at emission time the
	// emitter projects each entry to "<namespace>::<fnName>" so the
	// JS wire shape is unchanged.
	JitDependencies    []string
	PureFnDependencies []protocol.PureFnDep
	// IsUnsupported flips to true the first time compileNode sees a
	// CodeNS sentinel anywhere in the traversal. Once set it stays
	// true — the rest of the compile becomes a no-op (compileNode
	// short-circuits without descending) and the renderer skips
	// emitting a factory for this RunType. Replaces the per-entry
	// `subtreeFullySupported` pre-walk that used to live in
	// module.go: instead of walking each subtree TWICE (once to
	// check, once to compile), the single compile pass detects
	// unsupported leaves and bubbles the signal up via CodeNS.
	IsUnsupported bool
	// ThrowMessage carries the JIT-compile-time error message when a
	// CodeNS leaf was tagged with one (via JitThrow). Once captured,
	// the renderer emits a throw-factory rather than silently skipping
	// the entry — matching mion's per-runtype throws (never, Promise,
	// NonSerializableRunType, the array.ts symbol[]/function[] check).
	// First message wins; subsequent CodeNS leaves don't overwrite.
	ThrowMessage string

	// DiagSink is the destination for compile-time diagnostics this
	// walker emits via EmitDiagnostic. Nil when the caller doesn't want
	// diagnostics surfaced (e.g. unit tests that exercise the walker
	// without provenance threading). The renderer sets it from
	// RenderOpts.DiagSink so the dispatcher can collect everything in
	// a single response.Diagnostics slice.
	DiagSink *[]diag.Diagnostic
	// rootProvenance is the list of marker call sites that reference
	// the root RunType being walked. EmitDiagnostic fans out one
	// Diagnostic per site so the user gets one entry per actionable
	// call (per user direction: dedup is one-per-call-site, not
	// one-per-typeid).
	rootProvenance []diag.Site
	// diagSeen prevents a single walk from emitting the same diagnostic
	// code twice — without this, a deep tree with multiple unsupported
	// leaves of the same kind would surface duplicate diagnostics for
	// the same call site.
	diagSeen map[string]bool
}

// EmitDiagnostic records a compile-time diagnostic against every call
// site that references the root RunType being walked. No-op when DiagSink
// is unwired, the code has already fired for this walk, or no provenance
// sites are known. The diagnostic message can be either the static
// Definition.Template (when args is empty) or a printf-style format
// against args.
func (w *Walker) EmitDiagnostic(code, message string) {
	if w.DiagSink == nil {
		return
	}
	if w.diagSeen[code] {
		return
	}
	if w.diagSeen == nil {
		w.diagSeen = map[string]bool{}
	}
	w.diagSeen[code] = true
	if len(w.rootProvenance) == 0 {
		// No call sites known — skip rather than emit a Diagnostic
		// without provenance (would render as filePath="" in the
		// canonical line, useless to the user).
		return
	}
	for _, site := range w.rootProvenance {
		*w.DiagSink = append(*w.DiagSink, diag.New(code, site, message))
	}
}

// NewWalker primes a Walker for the given RunType + Emitter pair.
// The Vλl starts at the first arg's Name (the base value accessor);
// pushStack will refresh it on every descent.
func NewWalker(rt *protocol.RunType, fnName string, emitter Emitter) *Walker {
	args := emitter.Args()
	if len(args) == 0 {
		panic("typefns: emitter returned empty Args()")
	}
	// fnName is `<innerPrefix><rt.ID>` (e.g. "isType_abc123"); use it
	// directly as the namespaced JitFnHash so the cache key matches
	// the factory registration site. Renderer also sets InnerPrefix
	// explicitly (so dispatch can build namespaced childIDs for
	// non-root nodes too).
	jitFnHash := ""
	if rt != nil {
		jitFnHash = fnName
	}
	_, preserveExtras := emitter.(PrepareForJsonSafePreserveEmitter)
	return &Walker{
		RootType:           rt,
		FnName:             fnName,
		JitFnHash:          jitFnHash,
		Emitter:            emitter,
		PreserveExtras:     preserveExtras,
		Vλl:                args[0].Name,
		ContextItems:       newOrderedItems(),
		JitDependencies:    []string{},
		PureFnDependencies: []protocol.PureFnDep{},
		localVarCounters:   map[string]int{},
	}
}

// nextLocalVar hands out a fresh local-variable name (e.g. "i0",
// "res0", "i1", "res1"). Mirrors mion's getLocalVarName (per-prefix
// counter) — each prefix has its own numbering so a single Emit can
// allocate `i0` + `res0` without the second name colliding with the
// first.
func (w *Walker) nextLocalVar(prefix string) string {
	count := w.localVarCounters[prefix]
	w.localVarCounters[prefix] = count + 1
	return prefix + strconv.Itoa(count)
}

// setChildAccessor records the accessor for the next pushStack. The
// caller is the current top-of-stack emit; the value persists on
// that frame until the next setChildAccessor call (so a parent can
// iterate children, setting the accessor before each CompileChild).
func (w *Walker) setChildAccessor(accessor string) {
	if len(w.Stack) == 0 {
		return
	}
	w.Stack[len(w.Stack)-1].ChildAccessor = accessor
}

// setChildPathLiteral records the path-literal contribution for the
// next pushStack. Symmetric with setChildAccessor — collection
// emitters (Array, Object, Tuple, IndexSignature, …) set it before
// each CompileChild so the child frame's PathLiteral on push reflects
// the property name, tuple index, or loop counter the child sits at
// relative to the parent.
func (w *Walker) setChildPathLiteral(literal string) {
	if len(w.Stack) == 0 {
		return
	}
	w.Stack[len(w.Stack)-1].ChildPathLiteral = literal
}

// accessPath returns the non-empty PathLiteral segments from the
// current stack in push order. Used by typeerrors emitters to build
// the static access-path argument when calling cpf_newRunTypeErr.
// Returns the literals as raw JS expressions (e.g. ["'name'", "i0",
// "0"]) so callers can fold in extra trailing segments before joining.
func (w *Walker) accessPath() []string {
	out := make([]string, 0, len(w.Stack))
	for i := range w.Stack {
		lit := w.Stack[i].PathLiteral
		if lit != "" {
			out = append(out, lit)
		}
	}
	return out
}

// AddPureFnDependency records a (namespace, fnName, filePath) triple
// that the emitted JIT function will reach via `utl.getPureFn(<ns>,
// <fn>)`. Idempotent on the full triple.
//
// No source-file walk happens here — validation is deferred to
// end-of-compilation in the resolver. The resolver builds a single
// *purefns.Index from the program-wide extraction and runs
// purefns.ValidatePureFnDependencies(deps, idx, lookup) which checks
// every dep against the index in O(1) and lazily expands the index by
// parsing any dep filePath not yet scanned. See
// internal/purefns/index.go for the validation surface.
func (w *Walker) AddPureFnDependency(namespace, fnName, filePath string) {
	for _, dep := range w.PureFnDependencies {
		if dep.Namespace == namespace && dep.FunctionName == fnName && dep.FilePath == filePath {
			return
		}
	}
	w.PureFnDependencies = append(w.PureFnDependencies, protocol.PureFnDep{
		Namespace:    namespace,
		FunctionName: fnName,
		FilePath:     filePath,
	})
}

// UpdateDependencies records childHash as a jit dependency unless it's
// a noop or already tracked. Called from the walker's dispatch site
// whenever a composite emit fires a dependency-call into a non-inlined
// child; the parent's `jitDependencies` slot on the rendered
// JitCompiledFn entry then reflects every nested validator the body
// reaches via `utl.getJIT(<hash>)(…)`. Mirrors mion's
// BaseFnCompiler.updateDependencies (jitFnCompiler.ts:222).
func (w *Walker) UpdateDependencies(childHash string, childIsNoop bool) {
	if childIsNoop {
		return
	}
	for _, existing := range w.JitDependencies {
		if existing == childHash {
			return
		}
	}
	w.JitDependencies = append(w.JitDependencies, childHash)
}

// Compile walks RootType, drives the Emitter, finalizes, and returns
// the inner function declaration `function <FnName>(<args>){<body>}`
// ready for WrapClosure. isNoop reports whether the body was a noop
// (renderer skips noop factories). isUnsupported reports whether the
// compile reached a kind with no emit implementation — when true,
// the renderer skips this RunType entirely (no factory at all);
// the runtime cache miss is caught by createIsType's
// hasRunType-but-no-jit fallback.
//
// Mirrors mion's BaseFnCompiler.compile (jitFnCompiler.ts:279) +
// createJitFunction (jitFnCompiler.ts:175) + getJitFnCode helper
// (createJitFunction.ts:71).
func (w *Walker) Compile() (innerFnDecl string, isNoop bool, isUnsupported bool) {
	w.compileNode(w.RootType, CodeE)
	if w.IsUnsupported {
		return "", false, true
	}
	finalCode, noop := w.Emitter.Finalize(w.Code)
	w.Code = finalCode
	innerFnDecl = fmt.Sprintf("function %s(%s){%s}", w.FnName, w.argsList(true), w.Code)
	return innerFnDecl, noop, false
}

// ContextLines returns the `const xyz = …` declarations in insertion
// order, joined with `;\n` so WrapClosure's prologue can embed them
// verbatim. Empty when no emitter has registered any context item
// (the v1 KindString path).
func (w *Walker) ContextLines() string {
	return strings.Join(w.ContextItems.ordered(), ";\n")
}

// compileNode is the recursive entry point. The Walker pushes the
// frame, dispatches through the Emitter, reconciles the result
// against the parent's expected code type, then pops.
//
// KindRef sentinels are transparently resolved against w.RefTable
// before pushStack — the per-kind switch always sees the real
// RunType, never the ref placeholder.
//
// Short-circuits when w.IsUnsupported is already true: the rest of
// the traversal becomes a no-op. Returns CodeNS so any caller in
// the recursion chain (a compound parent's emit calling
// CompileChild) sees the sentinel and propagates it without
// emitting its own code. This is the "don't traverse children of
// an unsupported node" optimization — once one descendant fails,
// no further work happens in the subtree.
func (w *Walker) compileNode(rt *protocol.RunType, expectedCType CodeType) JitCode {
	if w.IsUnsupported {
		return JitCode{Code: "", Type: CodeNS}
	}
	if rt == nil {
		return JitCode{Code: "", Type: expectedCType}
	}
	rt = w.resolveRef(rt)
	if rt == nil {
		return JitCode{Code: "", Type: expectedCType}
	}
	w.pushStack(rt)
	jc := w.dispatch(rt, expectedCType)
	if jc.Type == CodeNS {
		// First throw message wins — capture before latching so the
		// renderer can emit a throw-factory rather than silently
		// skipping. Plain CodeNS (no message) preserves the existing
		// "drop the factory" behaviour for kinds without an emit.
		if jc.ErrorMessage != "" && w.ThrowMessage == "" {
			w.ThrowMessage = jc.ErrorMessage
		}
		// Latch the walker-level signal. Subsequent CompileChild
		// calls (from parent compound emits iterating siblings)
		// short-circuit at the top of this function.
		w.IsUnsupported = true
		w.popStack(jc)
		return jc
	}
	if jc.Code != "" {
		jc.Code = w.handleCodeInterpolation(rt, jc, expectedCType)
	}
	w.popStack(jc)
	return jc
}

// resolveRef dereferences KindRef sentinels via the walker's RefTable.
// Non-ref inputs pass through unchanged. A ref with no matching entry
// in the table returns nil so the caller can short-circuit; this
// scenario indicates a dangling cache reference and is treated as a
// noop here (the caller is responsible for surfacing that as an error
// at a higher level if needed).
func (w *Walker) resolveRef(rt *protocol.RunType) *protocol.RunType {
	if rt == nil || rt.Kind != protocol.KindRef {
		return rt
	}
	if w.RefTable == nil {
		return nil
	}
	return w.RefTable[rt.ID]
}

// dispatch decides between inline emission and a dependency call.
// Mirrors mion's BaseFnCompiler.shouldCallDependency
// (jitFnCompiler.ts:218–221): a dependency call happens only when
// BOTH (a) the predicate says the node is NOT inline-cheap AND
// (b) the walker is past depth 1 — the root always inlines so the
// top-level factory has a body. The dependency branch invokes the
// emitter's EmitDependencyCall, records the child hash on the
// walker's jitDependencies, and returns the call expression. The
// child's compile is deferred until that child gets its own
// top-level render pass.
//
// `childIsNoop` is passed as false at the dispatch site — the
// child's noop status isn't known here (the child hasn't been
// compiled yet on this code path). The renderer's later
// dangling-dep cascade in module.go drops any parent whose
// recorded deps don't have a matching emitted factory, so this
// over-recording can't cause runtime breakage.
func (w *Walker) dispatch(rt *protocol.RunType, expectedCType CodeType) JitCode {
	inlineCtx := &InlineContext{
		RT:          rt,
		DebugInline: debugInlineEnv,
		walker:      w,
	}
	shouldDepend := !w.Emitter.IsJitInlined(inlineCtx) && len(w.Stack) > 1
	if shouldDepend {
		// If the child kind isn't supported by this emitter, the
		// renderer's outer loop won't emit a factory for it. Emitting
		// a dependency call that references a non-existent factory
		// would cascade-remove the parent at the dangling-dep stage.
		// Treat unsupported non-inlined children as inline-noop
		// (return empty code) so the parent's emit can compose
		// around them — for serializer pairs, this matches the
		// "skip the slot, let identity restore the original" semantic
		// the JS-side createPrepareForJson fallback already uses for
		// missing entries.
		if !w.Emitter.Supports(rt) {
			return JitCode{Code: "", Type: expectedCType}
		}
		// Namespaced childID — matches the factory registration key
		// (the parent emit looks the child up via utl.getJIT(childID)
		// and the JS-side cache stores entries under the namespaced
		// hash). InnerPrefix is empty for hand-constructed walkers
		// (unit tests), in which case childID stays bare.
		childID := w.InnerPrefix + rt.ID
		emitCtx := &EmitContext{Vλl: w.Vλl, walker: w}
		callCode := w.Emitter.EmitDependencyCall(rt, childID, emitCtx)
		// Mirror mion's updateDependencies (jitFnCompiler.ts:222):
		// record the child hash on the walker (dedup is internal).
		// Noop-skip is handled inside UpdateDependencies; without
		// the compiled noop bit at dispatch time we pass false so
		// the dep IS recorded — mion's own behaviour for any
		// non-noop child.
		w.UpdateDependencies(childID, false)
		return JitCode{Code: callCode, Type: CodeE}
	}
	emitCtx := &EmitContext{Vλl: w.Vλl, walker: w}
	return w.Emitter.Emit(rt, emitCtx, expectedCType)
}

// pushStack snapshots the current Vλl onto a new stack frame.
// getStackVλl computes the descendant accessor from the (pre-push)
// stack; for atomic-root that's just the function's first argument.
// Mirrors jitFnCompiler.ts:148.
func (w *Walker) pushStack(newChild *protocol.RunType) {
	if len(w.Stack) == 0 && newChild != w.RootType {
		panic("typefns: rootType must be the first item pushed onto the stack")
	}
	w.Vλl = w.getStackVλl()
	pathLit := ""
	if len(w.Stack) > 0 {
		pathLit = w.Stack[len(w.Stack)-1].ChildPathLiteral
	}
	w.Stack = append(w.Stack, StackItem{Vλl: w.Vλl, RT: newChild, PathLiteral: pathLit})
}

// popStack mirrors jitFnCompiler.ts:161. Stores the emitted code on
// the Walker (so the root frame's code survives as w.Code at the end)
// and restores Vλl to the parent frame's snapshot.
func (w *Walker) popStack(result JitCode) {
	if result.Code != "" {
		w.Code = result.Code
	}
	if len(w.Stack) == 0 {
		return
	}
	w.Stack = w.Stack[:len(w.Stack)-1]
	if parent := w.peekStack(); parent != nil {
		w.Vλl = parent.Vλl
	} else {
		w.Vλl = w.Emitter.Args()[0].Name
	}
}

func (w *Walker) peekStack() *StackItem {
	if len(w.Stack) == 0 {
		return nil
	}
	return &w.Stack[len(w.Stack)-1]
}

// getStackVλl computes the child accessor for the next pushStack.
// Reads the parent frame's ChildAccessor when set (member kinds —
// array, object, tuple — register it before calling CompileChild),
// otherwise falls back to the parent's own Vλl. With an empty stack
// the function's first arg name is the base accessor. Mirrors mion's
// jitFnCompiler.ts:734 — the parent's `useArrayAccessor()` /
// `getChildVarName()` are folded into the precomputed accessor
// string the parent emit pushes.
func (w *Walker) getStackVλl() string {
	if len(w.Stack) == 0 {
		return w.Emitter.Args()[0].Name
	}
	parent := &w.Stack[len(w.Stack)-1]
	if parent.ChildAccessor != "" {
		return parent.ChildAccessor
	}
	return parent.Vλl
}

// argsList renders the function's parameter list. With
// includeDefaults=true the output mirrors mion's getJitFnArgs
// (createJitFunction.ts:79): each parameter is `name` when it has no
// default, or `name=defaultValue` when it does.
func (w *Walker) argsList(includeDefaults bool) string {
	args := w.Emitter.Args()
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		if includeDefaults && arg.Default != "" {
			parts = append(parts, arg.Name+"="+arg.Default)
		} else {
			parts = append(parts, arg.Name)
		}
	}
	return strings.Join(parts, ",")
}

// handleCodeInterpolation reconciles a child emitter's CodeType with
// the expected parent CodeType. Mirrors jitFnCompiler.ts:452. For an
// atomic root with a JS expression the wrapping logic produces
// `return <expression>`; statement/return-block roots get the
// matching wrap. Non-root branches handle the cross-product of
// parent and child code types so composite emits can compose
// CodeE / CodeS / CodeRB children without surprises.
func (w *Walker) handleCodeInterpolation(rt *protocol.RunType, child JitCode, parentCT CodeType) string {
	code := child.Code
	childCT := child.Type
	isRoot := len(w.Stack) == 1
	if isRoot {
		switch childCT {
		case CodeE:
			return "return " + code
		case CodeS:
			return addFullStop(code) + " return " + w.returnName()
		case CodeRB:
			return code
		}
	}
	switch {
	case parentCT == CodeE && childCT == CodeE:
		return code
	case parentCT == CodeE && childCT == CodeS,
		parentCT == CodeE && childCT == CodeRB:
		return callSelfInvoking(child)
	case parentCT == CodeS && childCT == CodeE:
		return code
	case parentCT == CodeS && childCT == CodeS:
		return addFullStop(code)
	case parentCT == CodeS && childCT == CodeRB:
		return callSelfInvoking(child)
	case parentCT == CodeRB && childCT == CodeE:
		panic("typefns: expected block but got expression — would emit useless code")
	case parentCT == CodeRB && childCT == CodeS:
		return addFullStop(code)
	case parentCT == CodeRB && childCT == CodeRB:
		return addFullStop(code) + " return " + w.returnName()
	}
	panic(fmt.Sprintf("typefns: unexpected code type (parent=%s child=%s)", parentCT, childCT))
}

// returnName is the JS identifier to return when a statement-shaped
// body needs an explicit `return …` appended. Delegates to the
// emitter's ReturnName() so per-fn divergence stays inside the per-fn
// file — isType / prepareForJson / format / mock return their first
// arg (`v`), typeErrors returns its accumulator (`er`).
func (w *Walker) returnName() string {
	return w.Emitter.ReturnName()
}

// normaliseWhitespace mirrors jitFnCompiler.ts:417 — collapse runs of
// spaces/tabs to one and collapse repeated `;` to a single `;`.
// Newlines are preserved (template literals in future emitters may
// rely on them being significant).
func normaliseWhitespace(code string) string {
	var builder strings.Builder
	builder.Grow(len(code))
	prevSpace := false
	prevSemicolon := false
	for _, r := range code {
		switch {
		case r == ' ' || r == '\t':
			if !prevSpace {
				builder.WriteRune(' ')
			}
			prevSpace = true
			prevSemicolon = false
		case r == ';':
			if !prevSemicolon {
				builder.WriteRune(';')
			}
			prevSpace = false
			prevSemicolon = true
		default:
			builder.WriteRune(r)
			prevSpace = false
			prevSemicolon = false
		}
	}
	return builder.String()
}

// addFullStop ensures a snippet ends with a `;` so the next statement
// can concatenate without ambiguity. Mirrors jitFnCompiler.ts:395.
func addFullStop(code string) string {
	if code == "" {
		return code
	}
	last := code[len(code)-1]
	if last == ';' || last == '}' {
		return code
	}
	return code + ";"
}

// callSelfInvoking wraps a statement/block in an IIFE so a parent
// expression context can embed it. Mirrors jitFnCompiler.ts:496.
func callSelfInvoking(child JitCode) string {
	code := strings.TrimSpace(child.Code)
	if code == "" {
		return ""
	}
	if strings.HasPrefix(code, "(function()") && strings.HasSuffix(code, ")()") {
		return code
	}
	prefix := ""
	if child.Type != CodeRB {
		prefix = "return "
	}
	return "(function(){" + prefix + child.Code + "})()"
}
