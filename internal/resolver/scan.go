package resolver

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/builders"
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype/typeid"
	"github.com/mionkit/ts-run-types/internal/comptimeargs"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

func (resolver *Resolver) sourceFile(file string) (*ast.SourceFile, error) {
	absolutePath := tspath.ResolvePath(resolver.Program.TS.GetCurrentDirectory(), file)
	sourceFile := resolver.Program.SourceFile(absolutePath)
	if sourceFile == nil {
		return nil, fmt.Errorf("source file not in program: %s", absolutePath)
	}
	return sourceFile, nil
}

// scanAllProgramFiles invokes dispatchScanFiles on every source file in
// the Program that has not been scanned yet. Idempotent — scans are
// cheap on already-seen files because callExpression traversal is
// fast and the cache dedupes by structural id, so a re-scanned site
// resolves to an existing entry without growing the cache.
//
// Called from the OpDump path so a `dump()` triggered by the Vite
// plugin's cache module transform always sees the complete set of
// runtypes, even when the cache module is requested before any user
// source file has been transformed (and therefore scanned).
//
// Errors from individual file scans are skipped — a file the Program
// doesn't carry can't be scanned but shouldn't block other files'
// scans. This matches the loose-coupling between per-file marker
// emission and the dump's transitive walk.
func (resolver *Resolver) scanAllProgramFiles() {
	if resolver.Program == nil || resolver.Program.TS == nil {
		return
	}
	if resolver.scannedFiles == nil {
		resolver.scannedFiles = map[string]struct{}{}
	}
	sourceFiles := resolver.Program.TS.SourceFiles()
	files := make([]string, 0, len(sourceFiles))
	for _, sf := range sourceFiles {
		if sf == nil {
			continue
		}
		fileName := sf.FileName()
		if _, seen := resolver.scannedFiles[fileName]; seen {
			continue
		}
		files = append(files, fileName)
	}
	if len(files) == 0 {
		return
	}
	// Errors are non-fatal — keep scanning other files. The dump still
	// returns whatever was reachable from successful scans.
	_, _, _ = resolver.dispatchScanFiles(files)
}

// dispatchScanFiles walks every CallExpression in each requested file and
// returns one Site per call whose resolved signature has a trailing
// `InjectRunTypeId<T>` parameter (where T is concretely bound). Sites for every
// file are returned flat, each tagged with .File so callers can filter.
//
// After each per-file scan, recordFileIDs walks the sites' RunType graphs
// and notes the reached wire ids against that file in the cache's per-file
// scope map. The map drives the per-request projection that
// scopedDump uses for IncludeRunTypes / IncludeCacheSources.
//
// # BOUNDED-SCOPE INVARIANT
//
// The scanner walks CallExpression AST nodes ONLY and assigns typeids
// ONLY for marker call arguments (cache.AssignID is invoked exclusively
// from scanCall when marker.DetectAny matches the trailing slot as
// InjectRunTypeId). Type projection
// (cache.AssignID → cache.Serialize) is rooted at marker-referenced
// types and follows children transitively from there — it never
// reaches into the file's top-level declarations, exported type
// aliases, or any type unrelated to a marker call site.
//
// Concretely: a source file that declares `type Junk = {x: bigint}`
// but never passes Junk to a marker function leaves NO trace in the
// cache. Pinned by:
//   - internal/resolver/perfile_test.go:TestScope_UnreferencedTypesAreNotProjected
//   - internal/resolver/perfile_test.go:TestDump_OnlyMarkerReachableTypes
//   - packages/vite-plugin-runtypes/test/scope-bounded.test.ts
//
// The bench's compile-time measurements
// (scripts/export-{serialization,validation}-suite.mjs) depend on this
// invariant — they assume scanFiles' work scales with marker-reachable
// type complexity, NOT with the file's total declaration count.
func (resolver *Resolver) dispatchScanFiles(files []string) ([]protocol.Site, []diag.Diagnostic, error) {
	var sites []protocol.Site
	var diagnostics []diag.Diagnostic
	for _, file := range files {
		sourceFile, err := resolver.sourceFile(file)
		if err != nil {
			return nil, nil, err
		}
		fileStart := len(sites)
		forEachCallExpression(sourceFile, func(call *ast.Node) bool {
			site, diags, ok := resolver.scanCall(file, call)
			if len(diags) > 0 {
				diagnostics = append(diagnostics, diags...)
			}
			if ok {
				sites = append(sites, site)
				resolver.sites = append(resolver.sites, site)
			}
			return true
		})
		resolver.recordFileIDs(file, sites[fileStart:])
		if resolver.scannedFiles != nil {
			resolver.scannedFiles[file] = struct{}{}
			// File names from the Program's source list use absolute paths.
			// scanFiles callers (the Vite plugin) pass relative paths. Mark
			// both forms so scanAllProgramFiles's dedup check matches a
			// previously scanned per-request file regardless of which form
			// arrived first.
			if resolver.Program != nil && resolver.Program.TS != nil {
				absolutePath := tspath.ResolvePath(resolver.Program.TS.GetCurrentDirectory(), file)
				resolver.scannedFiles[absolutePath] = struct{}{}
			}
		}
	}
	return sites, diagnostics, nil
}

// scanCall inspects one call expression. The flow is:
//
//  1. Walk every parameter of the resolved signature and detect any
//     marker brand via `marker.DetectAny`. CompTimeArgs / PureFunction
//     validation happens here regardless of whether the call also
//     carries an injection marker — the marker IS the contract, not
//     the function name or position.
//  2. If the trailing parameter carries `InjectRunTypeId<T>`, run the
//     injection-specific logic (free-type-parameter gate, reflect-form
//     checks, options extraction, id assignment) and emit a Site.
//  3. Otherwise return any accumulated diagnostics with no Site.
//
// Diagnostics always flow — they're independent of Site emission.
func (resolver *Resolver) scanCall(file string, call *ast.Node) (protocol.Site, []diag.Diagnostic, bool) {
	signature := checker.Checker_getResolvedSignature(resolver.checker, call, nil, 0)
	if signature == nil {
		return protocol.Site{}, nil, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return protocol.Site{}, nil, false
	}
	lastIndex := len(parameters) - 1
	callExpression := call.AsCallExpression()
	argsCount := 0
	if callExpression != nil && callExpression.Arguments != nil {
		argsCount = len(callExpression.Arguments.Nodes)
	}
	// Walk every parameter and dispatch per marker Kind. CompTimeArgs /
	// PureFunction validation runs regardless of whether the trailing
	// slot is InjectRunTypeId — registerPureFnFactory and any other
	// non-injection branded function must be validated too.
	var diagnostics []diag.Diagnostic
	var injectionTypeArgument *checker.Type
	var injectionMatched bool
	var injectionFnKey string
	for paramIndex := 0; paramIndex <= lastIndex; paramIndex++ {
		paramSymbol := parameters[paramIndex]
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(resolver.checker, paramSymbol)
		kind, typeArg, matched := marker.DetectAny(resolver.checker, paramType, resolver.marker)
		if !matched {
			continue
		}
		switch kind {
		case marker.KindInjectRunTypeId:
			// Only the trailing slot is recognised for injection. A
			// non-trailing InjectRunTypeId is defensively ignored — the
			// injection codegen below assumes the id sits at lastIndex.
			if paramIndex == lastIndex {
				injectionTypeArgument = typeArg
				injectionMatched = true
			}
		case marker.KindInjectTypeFnArgs:
			// createX trailing-slot marker. Same injection contract as
			// InjectRunTypeId, plus the Fn type-arg naming the function family
			// so the backend can emit only the demanded cache. The fnId is
			// computed after the loop (it folds in the call-site options/strategy).
			if paramIndex == lastIndex {
				injectionTypeArgument = typeArg
				injectionMatched = true
				if fnKey, fnOK := marker.FnKeyForInjectTypeFnArgs(resolver.checker, paramType, resolver.marker); fnOK {
					injectionFnKey = fnKey
				}
			}
		case marker.KindCompTimeArgs, marker.KindCompTimeFnArgs:
			// Both validate the argument is fully literal (CTA0xx). CompTimeFnArgs
			// additionally marks the fn-selecting slot; the scanner reads its value
			// positionally in computeFnId for now (structured demand follows).
			if paramIndex >= argsCount {
				continue
			}
			argumentNode := callExpression.Arguments.Nodes[paramIndex]
			if argumentNode == nil {
				continue
			}
			if diagnostic, ok := resolver.checkCompTimeArgs(file, argumentNode); ok {
				diagnostics = append(diagnostics, diagnostic)
			}
		case marker.KindPureFunction:
			if paramIndex >= argsCount {
				continue
			}
			argumentNode := callExpression.Arguments.Nodes[paramIndex]
			if argumentNode == nil {
				continue
			}
			diagnostics = append(diagnostics, resolver.checkPureFunction(file, argumentNode)...)
		}
	}
	if !injectionMatched {
		return protocol.Site{}, diagnostics, false
	}
	// NESTED-BUILDER SKIP: a value-first builder call nested inside another
	// marker call (e.g. `string({...})` inside `object({...})`) is reflected by
	// the enclosing marker — the enclosing RunType already references this type
	// as a child, so the nested call's own id would be redundant. Skip it; at
	// runtime the nested builder returns a type-only carrier the enclosing
	// marker discards. Only trailing-slot injection markers count as
	// "enclosing" — wrappers without an InjectRunTypeId slot (`optional(...)`,
	// plain helpers, vitest's `expect`) are transparent, so the walk continues
	// past them and a `string()` inside `optional()` inside `object()` still
	// skips via the `object` ancestor.
	if resolver.enclosedByInjectionMarker(call) {
		return protocol.Site{}, diagnostics, false
	}
	// Guard against a `Temporal.*` type that silently resolved to `any`
	// because the consumer's tsconfig lib doesn't load the Temporal
	// namespace — otherwise the emitted validator accepts anything. Emitted
	// for the injection call regardless of what the type argument resolved
	// to (it inspects the written syntax, not the resolved type).
	diagnostics = append(diagnostics, resolver.detectTemporalNotLoaded(file, call)...)
	typeArgument := injectionTypeArgument
	if marker.IsFreeTypeParameter(typeArgument) {
		// Call inside a generic wrapper body — `T` is the wrapper's own
		// free type parameter. Skip: no id to inject until the wrapper
		// is itself instantiated at its own call sites. Emit MKR003 so
		// the user knows why the rewrite was skipped — otherwise they
		// hit the runtime "no id injected" throw with no build-time
		// breadcrumb.
		sourceFile := ast.GetSourceFileOfNode(call)
		if sourceFile == nil {
			return protocol.Site{}, diagnostics, false
		}
		startLine, startCol := scanLineCol(sourceFile, call.Pos())
		endLine, endCol := scanLineCol(sourceFile, call.End())
		diagnostics = append(diagnostics, diag.New(
			diag.CodeMarkerFreeTypeParameter,
			diag.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol},
		))
		return protocol.Site{}, diagnostics, false
	}
	// Caller has already placed an argument at (or past) the id slot.
	// Never override an explicit pass-through — leave the call untouched.
	if argsCount > lastIndex {
		return protocol.Site{}, diagnostics, false
	}
	// REFLECT-FORM CHECKS: only fire when T was inferred from a value
	// argument (no explicit type-argument list) AND at least one value
	// arg is present.
	inReflectForm := callExpression != nil &&
		(callExpression.TypeArguments == nil || len(callExpression.TypeArguments.Nodes) == 0) &&
		argsCount > 0 && callExpression.Arguments != nil &&
		len(callExpression.Arguments.Nodes) > 0
	if inReflectForm {
		argZero := callExpression.Arguments.Nodes[0]
		// FUNCTION-CALL-ARGUMENT ANTI-PATTERN: passing a call expression
		// as the reflect-form value (`createIsType(getX())`) invokes the
		// function at runtime purely for type inference — side effects,
		// exceptions, async work, all fire for nothing. The validator
		// still works (T comes from the inferred return type), but the
		// recommended replacement is the static form using `ReturnType<
		// typeof fn>`. Emit a build warning to nudge the user toward it.
		if argZero != nil && argZero.Kind == ast.KindCallExpression {
			if diagnostic, ok := resolver.markerDiagFunctionCallArg(file, argZero); ok {
				diagnostics = append(diagnostics, diagnostic)
			}
		}
		// REFLECT-FORM ANNOTATION HONORING: when the argument is a
		// const-bound identifier with a written type annotation, prefer
		// the annotation's type over the binding's CFA-narrowed apparent
		// type. Fixes the enum-annotation / union-narrowing reflect-form
		// traps — TypeScript's control-flow analysis tracks `const v: T
		// = literal` bindings by their initializer's narrowest type, so
		// the apparent type at the call site is `typeof literal`, not the
		// declared union/enum. Reading the annotation directly makes the
		// reflect-form hash equal to the static-form hash for the natural
		// `const v: T = literal; createIsType(v);` idiom. Non-identifier
		// reflect-form args (property access, function calls, element
		// access) don't go through const-binding CFA and don't exhibit
		// the trap, so they fall through to the apparent-type path.
		// Skip annotation honoring for the SCHEMA overload: when argZero is a
		// RunType-typed const (`createIsType(schemaConst)` where
		// `const schemaConst: RunType<T> = …`), the declared type is `RunType<T>`,
		// but the injection's typeArgument is already the UNWRAPPED `T` (inferred
		// from the schema overload's `RunType<T>` param). Overriding it with
		// `RunType<T>` would validate against RunType's own shape, not `T` — and
		// break recursive schemas bound to an annotated const.
		if annotated, ok := resolver.declaredTypeFromIdentifier(argZero); ok && !builders.IsRunType(annotated, resolver.markerModule()) {
			typeArgument = annotated
		}
	}
	options := extractIsTypeOptions(call, lastIndex, argsCount)
	// No-op IsTypeOptions diagnostics — warn the user when an option is
	// requested but provably has no effect on the resolved type. The
	// emitter still produces the variant factory (always-emit
	// invariant) so the call site keeps working; this warning is the
	// only signal the option is redundant. Anchored at the options
	// literal when present, falling back to the whole call.
	if options.NoLiterals || options.NoIsArrayCheck {
		resolvedKind := typeid.KindOf(resolver.checker, typeArgument)
		if options.NoLiterals && resolvedKind != protocol.KindLiteral {
			if diagnostic, ok := resolver.noopIsTypeOptionDiag(file, call, lastIndex, argsCount, diag.CodeIsTypeOptionsNoLiteralsNoop); ok {
				diagnostics = append(diagnostics, diagnostic)
			}
		}
		if options.NoIsArrayCheck && resolvedKind != protocol.KindArray {
			if diagnostic, ok := resolver.noopIsTypeOptionDiag(file, call, lastIndex, argsCount, diag.CodeIsTypeOptionsNoArrayNoop); ok {
				diagnostics = append(diagnostics, diagnostic)
			}
		}
	}
	// Structural id resolution — purely a function of the resolved TS
	// type. `IsTypeOptions` (`noLiterals` / `noIsArrayCheck`) does NOT
	// fold into the id; instead, the option set folds into the injected
	// `fnId` variant suffix below (e.g. `itNL`, `itNA`) and the emitter
	// renders one factory per (typeid, fnId) pair under the canonical
	// variant cache key (e.g. `itNL_<id>`, `itNA_<id>`). Same invariant
	// the encoder strategy / decoder strategy already honour. See
	// createRTFunctions.ts's `createJsonEncoder` dispatch + the
	// `IsTypeVariantSuffix` helper in internal/constants.
	// Structural id — a pure function of the resolved TS type. RegExp has no
	// literal type in TS (`/abc/i` widens to `RegExp` even under `as const`), so
	// `typeof /abc/i`, `typeof /xyz/`, and `RegExp` all resolve to the same
	// KindRegexp id — id stays ≡ f(T).
	id := resolver.cache.AssignID(typeArgument)
	// Compute the precise fnId for InjectTypeFnArgs sites — the function's base
	// tag refined by the call-site compile-time options (IsTypeOptions variant
	// suffix for it/te, the strategy token for the JSON families). Reflection
	// sites (InjectRunTypeId) leave injectionFnKey empty → no FnId, no function
	// demand.
	fnId := computeFnId(injectionFnKey, options, call, lastIndex, argsCount)
	// call.End() is exclusive (one past the closing `)`). Pos at End()-1 is
	// the closing-paren offset where the TS-side patcher inserts.
	pos := call.End() - 1
	return protocol.Site{
		File:       file,
		Pos:        pos,
		ID:         id,
		ParamIndex: lastIndex,
		ArgsCount:  argsCount,
		FnId:       fnId,
	}, diagnostics, true
}

// computeFnId resolves the precise injected fnId token for a createX call site,
// dispatching on the function's compile-time option axis (see
// constants.CompFns). Empty fnKey (a reflection-only InjectRunTypeId site)
// yields "".
func computeFnId(fnKey string, options isTypeOptions, call *ast.Node, lastIndex, argsCount int) string {
	if fnKey == "" {
		return ""
	}
	fn, known := constants.CompFns[fnKey]
	if !known {
		return ""
	}
	switch fn.Axis {
	case constants.CompFnAxisJsonStrategy:
		strategy := extractStrategyOption(call, lastIndex, argsCount)
		fnId, _ := constants.ResolveFnId(fnKey, nil, strategy)
		return fnId
	case constants.CompFnAxisIsTypeOptions:
		fnId, _ := constants.ResolveFnId(fnKey, options.Names(), "")
		return fnId
	default:
		fnId, _ := constants.ResolveFnId(fnKey, nil, "")
		return fnId
	}
}

// extractStrategyOption reads the `strategy` string property from the options
// object literal at slot (lastIndex-1) — the JSON encoder/decoder compile-time
// selector. Returns "" when absent or not a string literal (the resolver runs
// at build time and can't evaluate non-literal expressions), so the caller
// falls back to the function's default strategy.
func extractStrategyOption(call *ast.Node, lastIndex, argsCount int) string {
	if lastIndex == 0 {
		return ""
	}
	optionsIndex := lastIndex - 1
	if argsCount <= optionsIndex {
		return ""
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		return ""
	}
	if len(callExpression.Arguments.Nodes) <= optionsIndex {
		return ""
	}
	candidate := callExpression.Arguments.Nodes[optionsIndex]
	if candidate == nil || candidate.Kind != ast.KindObjectLiteralExpression {
		return ""
	}
	objectLiteral := candidate.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return ""
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil || property.Kind != ast.KindPropertyAssignment {
			continue
		}
		propertyAssignment := property.AsPropertyAssignment()
		if propertyAssignment == nil {
			continue
		}
		name := propertyAssignment.Name()
		if name == nil || name.Text() != "strategy" {
			continue
		}
		initializer := propertyAssignment.Initializer
		if initializer == nil {
			continue
		}
		if initializer.Kind == ast.KindStringLiteral || initializer.Kind == ast.KindNoSubstitutionTemplateLiteral {
			return initializer.Text()
		}
	}
	return ""
}

// enclosedByInjectionMarker reports whether call sits (transitively) inside the
// arguments of ANOTHER call whose resolved signature carries a trailing
// InjectRunTypeId<T> slot. Used to skip injecting an id for a value-first
// builder nested inside an enclosing marker (the enclosing marker reflects the
// whole shape; the nested id would be redundant). Walks the AST parent chain,
// resolving each ancestor CallExpression's signature and checking its trailing
// parameter — non-injection ancestor calls (plain helpers, `optional`, vitest's
// `expect`) are transparent, so the walk continues past them.
func (resolver *Resolver) enclosedByInjectionMarker(call *ast.Node) bool {
	for parent := call.Parent; parent != nil; parent = parent.Parent {
		if parent.Kind != ast.KindCallExpression {
			continue
		}
		signature := checker.Checker_getResolvedSignature(resolver.checker, parent, nil, 0)
		if signature == nil {
			continue
		}
		parameters := checker.Signature_parameters(signature)
		if len(parameters) == 0 {
			continue
		}
		lastParam := parameters[len(parameters)-1]
		if lastParam == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(resolver.checker, lastParam)
		kind, _, matched := marker.DetectAny(resolver.checker, paramType, resolver.marker)
		if matched && (kind == marker.KindInjectRunTypeId || kind == marker.KindInjectTypeFnArgs) {
			return true
		}
	}
	return false
}

// isTypeOptions mirrors the JS-side IsTypeOptions interface
// (packages/ts-go-run-types/src/createRTFunctions.ts). Resolver-side
// representation is a Go struct so the rest of the pipeline can read
// fields without re-walking the AST.
type isTypeOptions struct {
	NoLiterals     bool
	NoIsArrayCheck bool
}

// Names returns the option NAMES whose value is true, in the canonical
// declaration order from `constants.IsTypeOptions`. computeFnId feeds the
// result to `constants.ResolveFnId` to build the injected fnId's variant
// cache-key suffix (e.g. `itNL`, `itNA`). Empty when no option is set.
func (opts isTypeOptions) Names() []string {
	if !opts.NoLiterals && !opts.NoIsArrayCheck {
		return nil
	}
	names := make([]string, 0, len(constants.IsTypeOptions))
	for _, opt := range constants.IsTypeOptions {
		switch opt.Name {
		case "noLiterals":
			if opts.NoLiterals {
				names = append(names, opt.Name)
			}
		case "noIsArrayCheck":
			if opts.NoIsArrayCheck {
				names = append(names, opt.Name)
			}
		}
	}
	return names
}

// extractIsTypeOptions reads literal options from the argument slot
// immediately before the id slot, when the signature has a
// `IsTypeOptions` parameter there. The argument must be an object
// literal — variable references / spreads / function calls are ignored
// (return zero options) because the resolver runs at build time and
// can't evaluate arbitrary expressions. This matches mion's
// compile-time-baked options model (baseRunTypes.ts:82-86 hashes
// options into the RT cache key).
//
// Layout convention: options always lives at slot (lastIndex - 1) — the
// slot immediately before id. For `createIsType<T>(val?, options?, id?)`
// that's slot 1; for any future function with `(options?, id?)` it
// would be slot 0. Marker functions without an options param
// (`getRunTypeId<T>(id?)`, `reflectRunTypeId(_value, id?)`) are
// inherently safe — `reflectRunTypeId`'s slot 0 holds a value, which
// is allowed to be an object literal but won't contain known option
// keys, so the lookup returns zero opts.
func extractIsTypeOptions(call *ast.Node, lastIndex, argsCount int) isTypeOptions {
	var opts isTypeOptions
	// Options live at the slot immediately before the id slot. If
	// lastIndex==0 the function has no slots before id at all
	// (e.g. getRunTypeId<T>(id?)).
	if lastIndex == 0 {
		return opts
	}
	optionsIndex := lastIndex - 1
	// User has to fill the options slot for us to harvest anything.
	if argsCount <= optionsIndex {
		return opts
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		return opts
	}
	if len(callExpression.Arguments.Nodes) <= optionsIndex {
		return opts
	}
	candidate := callExpression.Arguments.Nodes[optionsIndex]
	if candidate == nil || candidate.Kind != ast.KindObjectLiteralExpression {
		return opts
	}
	objectLiteral := candidate.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return opts
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil || property.Kind != ast.KindPropertyAssignment {
			continue
		}
		propertyAssignment := property.AsPropertyAssignment()
		if propertyAssignment == nil {
			continue
		}
		name := propertyAssignment.Name()
		if name == nil {
			continue
		}
		initializer := propertyAssignment.Initializer
		if initializer == nil {
			continue
		}
		switch name.Text() {
		case "noLiterals":
			if initializer.Kind == ast.KindTrueKeyword {
				opts.NoLiterals = true
			}
		case "noIsArrayCheck":
			if initializer.Kind == ast.KindTrueKeyword {
				opts.NoIsArrayCheck = true
			}
		}
	}
	return opts
}

// checkPureFunction validates that argumentNode is an inline
// arrow / function expression (emits PFN001 on failure) and then runs
// the purity rules against the resolved function node (emits any of
// PFE9006–PFE9011 on violation). Inline-shape failure short-circuits —
// there is nothing to walk for purity when the arg isn't a function.
func (resolver *Resolver) checkPureFunction(file string, argumentNode *ast.Node) []diag.Diagnostic {
	fnNode, shapeResult := comptimeargs.CheckLiteralFunction(resolver.checker, argumentNode)
	if !shapeResult.Ok {
		failingNode := shapeResult.FailingNode
		if failingNode == nil {
			failingNode = argumentNode
		}
		sourceFile := ast.GetSourceFileOfNode(failingNode)
		if sourceFile == nil {
			return nil
		}
		startLine, startCol := scanLineCol(sourceFile, failingNode.Pos())
		endLine, endCol := scanLineCol(sourceFile, failingNode.End())
		return []diag.Diagnostic{diag.New(
			diag.CodePureFunctionNotLiteral,
			diag.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol},
		)}
	}
	sourceFile := ast.GetSourceFileOfNode(fnNode)
	if sourceFile == nil {
		return nil
	}
	return purefns.CheckPurity(sourceFile, fnNode)
}

// checkCompTimeArgs validates the argument node passes the CompTimeArgs
// literal-only rules and returns a CTA0xx diagnostic when it doesn't.
// Returns (_, false) when validation succeeded.
func (resolver *Resolver) checkCompTimeArgs(file string, argumentNode *ast.Node) (diag.Diagnostic, bool) {
	result := comptimeargs.CheckLiteral(resolver.checker, argumentNode, 0, resolver.isBuilderCallPredicate())
	if result.Ok {
		return diag.Diagnostic{}, false
	}
	failingNode := result.FailingNode
	if failingNode == nil {
		failingNode = argumentNode
	}
	sourceFile := ast.GetSourceFileOfNode(failingNode)
	if sourceFile == nil {
		return diag.Diagnostic{}, false
	}
	startLine, startCol := scanLineCol(sourceFile, failingNode.Pos())
	endLine, endCol := scanLineCol(sourceFile, failingNode.End())
	site := diag.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
	switch result.Kind {
	case comptimeargs.FailDepthExceeded:
		return diag.New(diag.CodeCompTimeArgsDepthExceeded, site), true
	case comptimeargs.FailForbiddenConstruct:
		return diag.New(diag.CodeCompTimeArgsForbiddenConstruct, site, result.Reason), true
	default:
		return diag.New(diag.CodeCompTimeArgsNonLiteral, site), true
	}
}

// noopIsTypeOptionDiag builds a Warning diagnostic anchored at the
// options-literal node (slot lastIndex-1) when present, falling back
// to the whole call expression. Used by the no-op IsTypeOption check
// to report MKR004 / MKR005 — the option survives downstream
// (always-emit invariant), so this is purely advisory.
func (resolver *Resolver) noopIsTypeOptionDiag(file string, call *ast.Node, lastIndex, argsCount int, code string) (diag.Diagnostic, bool) {
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return diag.Diagnostic{}, false
	}
	anchor := call
	if optionsNode := extractIsTypeOptionsCandidate(call, lastIndex, argsCount); optionsNode != nil {
		anchor = optionsNode
	}
	startLine, startCol := scanLineCol(sourceFile, anchor.Pos())
	endLine, endCol := scanLineCol(sourceFile, anchor.End())
	return diag.New(
		code,
		diag.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol},
	), true
}

// extractIsTypeOptionsCandidate returns the AST node at the options
// slot (slot immediately before id), or nil. Retained for the options
// extractor below; the legacy MKR002 emit path it once fed has been
// replaced by scanSiblingMarkers + CompTimeArgs.
func extractIsTypeOptionsCandidate(call *ast.Node, lastIndex, argsCount int) *ast.Node {
	if lastIndex == 0 {
		return nil
	}
	optionsIndex := lastIndex - 1
	if argsCount <= optionsIndex {
		return nil
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		return nil
	}
	if len(callExpression.Arguments.Nodes) <= optionsIndex {
		return nil
	}
	return callExpression.Arguments.Nodes[optionsIndex]
}

// isBuilderCallPredicate returns the closure comptimeargs.CheckLiteral uses to
// recognize a static schema-construction call (a value-first builder OR an
// optional()/propMod() carrier) as a valid CompTimeArgs leaf — so a nested
// `string({…})` or `optional(number())` inside `object({…})` passes without
// recursing into it (each self-validates on its own scan visit).
func (resolver *Resolver) isBuilderCallPredicate() func(*ast.Node) bool {
	module := resolver.markerModule()
	return func(node *ast.Node) bool {
		return builders.IsSchemaLeafCall(resolver.checker, module, node)
	}
}

// markerDiagFunctionCallArg builds an MKR001 diagnostic flagging a reflect-form
// marker call that received a function-call argument (`createIsType(getX())`).
// The function gets invoked at runtime purely so TypeScript can infer T from
// its return type, which can produce side effects, exceptions, or async work
// for no reason. The recommended replacement is the static form using
// `ReturnType<typeof fn>`. Returns (_, false) when the call's source file
// can't be located (defensive — shouldn't happen during scanFiles).
func (resolver *Resolver) markerDiagFunctionCallArg(file string, callArg *ast.Node) (diag.Diagnostic, bool) {
	sourceFile := ast.GetSourceFileOfNode(callArg)
	if sourceFile == nil {
		return diag.Diagnostic{}, false
	}
	startLine, startCol := scanLineCol(sourceFile, callArg.Pos())
	endLine, endCol := scanLineCol(sourceFile, callArg.End())
	fnName := callExpressionName(callArg)
	return diag.New(
		diag.CodeMarkerFunctionCallArg,
		diag.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol},
		fnName,
	), true
}

// callExpressionName returns a short label for a CallExpression's callee —
// used in diagnostic messages. Handles Identifier callees (`fn()`), property
// accesses (`obj.fn()`), and falls back to `<anonymous>` for IIFEs and other
// expression-callee shapes.
func callExpressionName(callNode *ast.Node) string {
	if callNode == nil {
		return "<anonymous>"
	}
	callExpression := callNode.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return "<anonymous>"
	}
	callee := callExpression.Expression
	switch callee.Kind {
	case ast.KindIdentifier:
		return callee.Text()
	case ast.KindPropertyAccessExpression:
		propertyAccess := callee.AsPropertyAccessExpression()
		if propertyAccess == nil || propertyAccess.Name() == nil {
			return "<anonymous>"
		}
		return propertyAccess.Name().Text()
	}
	return "<anonymous>"
}

// scanLineCol returns (1-based line, 1-based column) for byte offset pos
// inside sourceFile. Mirrors purefns.lineCol — duplicated here to avoid a
// resolver→purefns import dependency for one helper.
func scanLineCol(sourceFile *ast.SourceFile, pos int) (int, int) {
	src := sourceFile.Text()
	if pos > len(src) {
		pos = len(src)
	}
	line, col := 1, 1
	for i := 0; i < pos; i++ {
		if src[i] == '\n' {
			line++
			col = 1
		} else {
			col++
		}
	}
	return line, col
}

// declaredTypeFromIdentifier returns the resolved type of the type annotation
// written on the identifier's const variable declaration. Used by scanCall in
// the reflect form to honor the user's written T over CFA's narrowed apparent
// type. Returns (nil, false) when:
//   - the node is not an Identifier (e.g. PropertyAccess, CallExpression),
//   - the binding's symbol has no const VariableDeclaration with an
//     annotation,
//   - the binding is `let`/`var` (re-assignable, so the annotation no
//     longer pins the type at the call site).
//
// Annotation ≥ apparent type by construction: TS enforces initializer
// assignability against the annotation, so honoring the annotation never
// produces a narrower validator than the apparent-type path.
func (resolver *Resolver) declaredTypeFromIdentifier(node *ast.Node) (*checker.Type, bool) {
	if node == nil || node.Kind != ast.KindIdentifier {
		return nil, false
	}
	symbol := resolver.checker.GetSymbolAtLocation(node)
	if symbol == nil {
		return nil, false
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
			continue
		}
		parent := declaration.Parent
		if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		variableDecl := declaration.AsVariableDeclaration()
		if variableDecl == nil || variableDecl.Type == nil {
			continue
		}
		return checker.Checker_getTypeFromTypeNode(resolver.checker, variableDecl.Type), true
	}
	return nil, false
}

// forEachCallExpression invokes cb for every CallExpression in sourceFile,
// in depth-first source order. cb is also called for nested calls (an outer
// call's arguments may contain inner calls — both visit). Stops descending
// into a node if cb returns false.
func forEachCallExpression(sourceFile *ast.SourceFile, cb func(*ast.Node) bool) {
	if sourceFile == nil {
		return
	}
	root := sourceFile.AsNode()
	if root == nil {
		return
	}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			if !cb(node) {
				return false
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
}
