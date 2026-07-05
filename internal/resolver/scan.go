package resolver

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/compiler/builders"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/textpos"
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
		// Declaration files cannot contain call expressions, so scanning
		// them can never produce a site — but the lib .d.ts ASTs are by
		// far the largest in the Program, and the first dump used to walk
		// every one of them through forEachCallExpression for nothing.
		if sf.IsDeclarationFile {
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
// from commitPending, for calls whose analyzeCall pass matched the
// trailing slot as InjectRunTypeId). Type projection
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
//   - packages/runtypes-devtools/test/scope-bounded.test.ts
//
// The bench's compile-time measurements
// (scripts/export-{serialization,validation}-suite.mjs) depend on this
// invariant — they assume scanFiles' work scales with marker-reachable
// type complexity, NOT with the file's total declaration count.
func (resolver *Resolver) dispatchScanFiles(files []string) ([]protocol.Site, []diag.Diagnostic, error) {
	// Build the override map BEFORE any id is assigned: every structural id must
	// fold the `overrideX<T>(pureFn)` suffix, and the map is whole-program (an
	// override anywhere shifts ids everywhere). One-time per Program.
	resolver.ensureOverrides()
	if resolver.parallelScanEnabled() && len(files) > 1 {
		return resolver.dispatchScanFilesParallel(files)
	}
	return resolver.dispatchScanFilesSerial(files)
}

// parallelScanEnabled reports whether this resolver may take the parallel
// scan path at all. Parallel is the default; SingleThreaded implies serial
// (the pool holds a single checker, so there is nothing to fan out over).
func (resolver *Resolver) parallelScanEnabled() bool {
	return !resolver.opts.DisableParallelScan && !resolver.opts.SingleThreaded &&
		resolver.Program != nil && resolver.Program.TS != nil
}

// dispatchScanFilesSerial is the single-checker scan loop: every file is
// analyzed and committed inline under the session checker. Also the
// fallback the parallel path returns to on planning failures and
// single-group requests, so its semantics (including the partial-scan +
// error behavior on an unresolvable file) stay the contract for both.
func (resolver *Resolver) dispatchScanFilesSerial(files []string) ([]protocol.Site, []diag.Diagnostic, error) {
	var sites []protocol.Site
	var diagnostics []diag.Diagnostic
	state := resolver.scanStateFor(resolver.checker)
	for _, file := range files {
		sourceFile, err := resolver.sourceFile(file)
		if err != nil {
			return nil, nil, err
		}
		fileStart := len(sites)
		forEachCallExpression(sourceFile, func(call *ast.Node) bool {
			pending, diags, ok := state.analyzeCall(file, call)
			if len(diags) > 0 {
				diagnostics = append(diagnostics, diags...)
			}
			if ok {
				site := resolver.commitPending(pending)
				sites = append(sites, site)
				resolver.sites = append(resolver.sites, site)
			}
			return true
		})
		resolver.markFileScanned(file, sites[fileStart:])
	}
	return sites, diagnostics, nil
}

// markFileScanned runs the per-file post-scan bookkeeping: records the
// reached wire ids in the cache's per-file scope map and marks the file
// (in both relative and absolute form) as scanned. Shared by the serial
// loop above and the parallel commit phase.
func (resolver *Resolver) markFileScanned(file string, fileSites []protocol.Site) {
	resolver.recordFileIDs(file, fileSites)
	if resolver.scannedFiles == nil {
		return
	}
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

// scanState carries the checker-bound context for one scan pass: the
// checker that resolves this pass's files and that checker's
// marker-verdict memo. The serial path builds one for the session
// checker; the parallel path builds one per checker group.
type scanState struct {
	resolver    *Resolver
	scanChecker *checker.Checker
	verdicts    map[*checker.Type]markerVerdict
}

// scanStateFor builds the scanState for scanChecker, resolving the
// per-checker verdict memo once for the whole pass.
func (resolver *Resolver) scanStateFor(scanChecker *checker.Checker) scanState {
	return scanState{
		resolver:    resolver,
		scanChecker: scanChecker,
		verdicts:    resolver.verdictsFor(scanChecker),
	}
}

// detectMarker is marker.DetectAny memoized by parameter type pointer in
// the state's per-checker memo — see Resolver.verdictsByChecker.
func (state scanState) detectMarker(paramType *checker.Type) (marker.Kind, *checker.Type, bool) {
	if verdict, seen := state.verdicts[paramType]; seen {
		return verdict.kind, verdict.typeArg, verdict.matched
	}
	kind, typeArg, matched := marker.DetectAny(state.scanChecker, paramType, state.resolver.marker)
	if state.verdicts != nil {
		state.verdicts[paramType] = markerVerdict{kind: kind, typeArg: typeArg, matched: matched}
	}
	return kind, typeArg, matched
}

// pendingCall is the checker-bound analysis result for one injection
// call site — a complete Site minus the wire ID, plus the resolved type
// argument and the checker that materialized it. analyzeCall produces
// these; commitPending projects the type (the only cache mutation on
// the scan path) and mints the Site. The split exists so the analysis
// can run on pool checkers concurrently while projection stays serial.
type pendingCall struct {
	file       string
	pos        int
	paramIndex int
	argsCount  int
	fnId       string
	// fnIds is the full ordered fnId list for a MULTI-function marker site
	// (InjectTypeFnArgs<T, F1, F2, …>); nil for single-fn / reflection sites,
	// where fnId carries the lone value. The rewrite injects an array of entry
	// tuples at paramIndex when this is set.
	fnIds  []string
	demand []protocol.SiteDemand
	// trailingComma is true when the call's own argument list already ends
	// with a comma (e.g. a formatter-wrapped `createValidate(\n  schema,\n)`).
	// The TS-side injector reads it to splice the binding WITHOUT a leading
	// comma — otherwise the pre-existing comma plus the injected `, …` yield
	// an empty argument `f(a, , …)`, which is invalid JS.
	trailingComma bool
	typeArgument  *checker.Type
	// owner is the checker that materialized typeArgument. Projection
	// must run under it — types from different checkers never mix
	// (upstream contract on Program.GetTypeCheckerForFile).
	owner *checker.Checker
}

// commitPending projects the pending call's type argument into the cache
// and returns the finished Site. Serial-only: the cache is not safe for
// concurrent use. Projection runs under the checker that materialized the
// type (a fast no-swap path when that is the session checker, i.e. always
// on the serial scan path).
func (resolver *Resolver) commitPending(pending pendingCall) protocol.Site {
	id := resolver.cache.AssignIDUnder(pending.owner, pending.typeArgument)
	return protocol.Site{
		File:          pending.file,
		Pos:           pending.pos,
		ID:            id,
		ParamIndex:    pending.paramIndex,
		ArgsCount:     pending.argsCount,
		FnId:          pending.fnId,
		FnIds:         pending.fnIds,
		Demand:        pending.demand,
		TrailingComma: pending.trailingComma,
	}
}

// analyzeCall inspects one call expression — the checker-bound analysis
// half of the scan. The flow is:
//
//  1. Walk every parameter of the resolved signature and detect any
//     marker brand via `marker.DetectAny`. CompTimeArgs / PureFunction
//     validation happens here regardless of whether the call also
//     carries an injection marker — the marker IS the contract, not
//     the function name or position.
//  2. If the trailing parameter carries `InjectRunTypeId<T>`, run the
//     injection-specific logic (free-type-parameter gate, reflect-form
//     checks, options extraction) and emit a pendingCall for the commit
//     phase (which assigns the id and mints the Site).
//  3. Otherwise return any accumulated diagnostics with no pendingCall.
//
// Diagnostics always flow — they're independent of Site emission. Every
// checker read in here goes through state.scanChecker, so the analysis
// can run on any pool checker; only commitPending touches the cache.
func (state scanState) analyzeCall(file string, call *ast.Node) (pendingCall, []diag.Diagnostic, bool) {
	signature := checker.Checker_getResolvedSignature(state.scanChecker, call, nil, 0)
	if signature == nil {
		return pendingCall{}, nil, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return pendingCall{}, nil, false
	}
	lastIndex := len(parameters) - 1
	callExpression := call.AsCallExpression()
	argsCount := 0
	trailingComma := false
	if callExpression != nil && callExpression.Arguments != nil {
		argsCount = len(callExpression.Arguments.Nodes)
		// Robust signal for the TS-side injector: the AST records whether the
		// argument list was written with a trailing comma (survives comments /
		// whitespace), so the injector never has to scan source bytes backward.
		trailingComma = callExpression.Arguments.HasTrailingComma()
	}
	// Walk every parameter and dispatch per marker Kind. CompTimeArgs /
	// PureFunction validation runs regardless of whether the trailing
	// slot is InjectRunTypeId — registerPureFnFactory and any other
	// non-injection branded function must be validated too.
	var diagnostics []diag.Diagnostic
	var injectionTypeArgument *checker.Type
	var injectionMatched bool
	var injectionFnKeys []string
	for paramIndex := 0; paramIndex <= lastIndex; paramIndex++ {
		paramSymbol := parameters[paramIndex]
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(state.scanChecker, paramSymbol)
		kind, typeArg, matched := state.detectMarker(paramType)
		if !matched && comptimeargs.IsCompTimeArgsParamNode(state.scanChecker, paramSymbol, state.resolver.marker) {
			// CompTimeArgs is the zero-cost identity marker (markers.ts): its
			// resolved type carries no alias/brand for DetectAny, so it's
			// recognised off the parameter's `CompTimeArgs<…>` annotation node.
			kind, matched = marker.KindCompTimeArgs, true
		}
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
				// A multi-function marker (InjectTypeFnArgs<T,'val','verr'>) names
				// several families; the scanner computes one fnId + demand per key
				// below and the rewrite injects an array of entry tuples at this slot.
				if fnKeys, fnOK := marker.FnKeysForInjectTypeFnArgs(state.scanChecker, paramType, state.resolver.marker); fnOK {
					injectionFnKeys = fnKeys
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
			if diagnostic, ok := state.checkCompTimeArgs(file, argumentNode); ok {
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
			diagnostics = append(diagnostics, state.checkPureFunction(file, argumentNode)...)
		}
	}
	if !injectionMatched {
		return pendingCall{}, diagnostics, false
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
	if state.enclosedByInjectionMarker(call) {
		return pendingCall{}, diagnostics, false
	}
	// Guard against a `Temporal.*` type that silently resolved to `any`
	// because the consumer's tsconfig lib doesn't load the Temporal
	// namespace — otherwise the emitted validator accepts anything. Emitted
	// for the injection call regardless of what the type argument resolved
	// to (it inspects the written syntax, not the resolved type).
	diagnostics = append(diagnostics, detectTemporalNotLoaded(state.scanChecker, file, call)...)
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
			return pendingCall{}, diagnostics, false
		}
		diagnostics = append(diagnostics, diag.New(
			diag.CodeMarkerFreeTypeParameter,
			textpos.NodeSite(file, sourceFile, call),
		))
		return pendingCall{}, diagnostics, false
	}
	// Caller has already placed an argument at (or past) the id slot.
	// Never override an explicit pass-through — leave the call untouched.
	if argsCount > lastIndex {
		return pendingCall{}, diagnostics, false
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
		// as the reflect-form value (`createValidate(getX())`) invokes the
		// function at runtime purely for type inference — side effects,
		// exceptions, async work, all fire for nothing. The validator
		// still works (T comes from the inferred return type), but the
		// recommended replacement is the static form using `ReturnType<
		// typeof fn>`. Emit a build warning to nudge the user toward it.
		//
		// EXCEPT a value-first schema-builder call (`object({…})`, `circular(…)`,
		// `array(…)`, …) IS the intended reflect-form value — it's pure
		// construction, not a side-effectful user function — so it must not warn.
		if argZero != nil && argZero.Kind == ast.KindCallExpression &&
			!builders.IsSchemaLeafCall(state.scanChecker, state.resolver.markerModule(), argZero, state.resolver.marker.FS) {
			if diagnostic, ok := state.resolver.markerDiagFunctionCallArg(file, argZero); ok {
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
		// `const v: T = literal; createValidate(v);` idiom. Non-identifier
		// reflect-form args (property access, function calls, element
		// access) don't go through const-binding CFA and don't exhibit
		// the trap, so they fall through to the apparent-type path.
		// Skip annotation honoring for the SCHEMA overload: when argZero is a
		// RunType-typed const (`createValidate(schemaConst)` where
		// `const schemaConst: RunType<T> = …`), the declared type is `RunType<T>`,
		// but the injection's typeArgument is already the UNWRAPPED `T` (inferred
		// from the schema overload's `RunType<T>` param). Overriding it with
		// `RunType<T>` would validate against RunType's own shape, not `T` — and
		// break recursive schemas bound to an annotated const.
		if annotated, ok := state.declaredTypeFromIdentifier(argZero); ok && !builders.IsRunType(annotated, state.resolver.markerModule(), state.resolver.marker.FS) {
			typeArgument = annotated
		}
	}
	options := extractValidateOptions(state.scanChecker, call, lastIndex, argsCount)
	// No-op ValidateOptions diagnostics — warn the user when an option is
	// requested but provably has no effect on the resolved type. The
	// emitter still produces the variant factory (always-emit
	// invariant) so the call site keeps working; this warning is the
	// only signal the option is redundant. Anchored at the options
	// literal when present, falling back to the whole call.
	if options.Any() {
		resolvedKind := typeid.KindOf(state.scanChecker, typeArgument)
		if options.Has("noLiterals") && resolvedKind != protocol.KindLiteral {
			if diagnostic, ok := state.resolver.noopValidateOptionDiag(file, call, lastIndex, argsCount, diag.CodeValidateOptionsNoLiteralsNoop); ok {
				diagnostics = append(diagnostics, diagnostic)
			}
		}
		if options.Has("noIsArrayCheck") && resolvedKind != protocol.KindArray {
			if diagnostic, ok := state.resolver.noopValidateOptionDiag(file, call, lastIndex, argsCount, diag.CodeValidateOptionsNoArrayNoop); ok {
				diagnostics = append(diagnostics, diagnostic)
			}
		}
	}
	// Structural id resolution happens in commitPending and is purely a
	// function of the resolved TS type. `ValidateOptions` (`noLiterals` /
	// `noIsArrayCheck`) does NOT fold into the id; instead, the option set
	// folds into the injected `fnId` variant suffix below (e.g. `itNL`,
	// `valNA`) and the emitter renders one factory per (typeid, fnId) pair
	// under the canonical variant cache key (e.g. `itNL_<id>`, `valNA_<id>`).
	// Same invariant the encoder strategy / decoder strategy already honour.
	// See createRTFunctions.ts's `createJsonEncoder` dispatch + the
	// `ValidateVariantSuffix` helper in internal/constants. RegExp has no
	// literal type in TS (`/abc/i` widens to `RegExp` even under `as const`),
	// so `typeof /abc/i`, `typeof /xyz/`, and `RegExp` all resolve to the
	// same KindRegexp id — id stays ≡ f(T).
	//
	// Compute the precise fnId for InjectTypeFnArgs sites — the function's base
	// tag refined by the call-site compile-time options (ValidateOptions variant
	// suffix for it/te, the strategy token for the JSON families) — plus the
	// structured emit-demand (the forward replacement for reverse-parsing fnId,
	// which an opaque hash can't support). Reflection sites (InjectRunTypeId)
	// leave injectionFnKeys empty → no FnId, no function demand.
	// One fnId + demand per named family (one for a plain createX; two for a
	// multi-function marker like createStandardSchema's <T,'val','verr'>). The
	// comptime options/strategy are SHARED across every family. Reflection sites
	// (InjectRunTypeId, empty injectionFnKeys) yield no fnId and no demand.
	var fnIds []string
	var demand []protocol.SiteDemand
	for _, fnKey := range injectionFnKeys {
		fnId, fnDemand := computeSiteFn(state.scanChecker, fnKey, options, call, lastIndex, argsCount)
		fnIds = append(fnIds, fnId)
		demand = append(demand, fnDemand...)
	}
	// FnId stays the scalar single-fn wire (mirrors fnIds[0]); FnIds is set only
	// for multi-function sites so single-fn / reflection sites stay byte-stable.
	fnId := ""
	if len(fnIds) > 0 {
		fnId = fnIds[0]
	}
	var multiFnIds []string
	if len(fnIds) > 1 {
		multiFnIds = fnIds
	}
	return pendingCall{
		file: file,
		// call.End() is exclusive (one past the closing `)`). Pos at End()-1 is
		// the closing-paren offset where the TS-side patcher inserts.
		pos:           call.End() - 1,
		paramIndex:    lastIndex,
		argsCount:     argsCount,
		fnId:          fnId,
		fnIds:         multiFnIds,
		demand:        demand,
		trailingComma: trailingComma,
		typeArgument:  typeArgument,
		owner:         state.scanChecker,
	}, diagnostics, true
}

// computeSiteFn resolves both injection payloads for a createX call site in
// one registry pass: the opaque fnId the transformer injects as the 2nd tuple
// element, and the structured cache-entry demand the emitter must render.
// Routed through operations.FnHashFor so the scanner and the emitter compute
// the SAME hash: for a JSON family the COMPOSITE fnHash (the per-strategy
// jsonEncoder/jsonDecoder entry the runtime looks up); for it/te the
// ValidateOptions variant fnHash; for a leaf/binary family the plain fnHash.
// operations.Canonical reads only the axis-relevant input (strategy for JSON,
// option names for it/te, neither otherwise), so one call covers every axis.
// Empty fnKey (a reflection-only InjectRunTypeId site) yields ("", nil).
func computeSiteFn(typeChecker *checker.Checker, fnKey string, options validateOptions, call *ast.Node, lastIndex, argsCount int) (string, []protocol.SiteDemand) {
	if fnKey == "" {
		return "", nil
	}
	op, known := operations.ByFnKey(fnKey)
	if !known {
		return "", nil
	}
	var optionNames []string
	var strategy string
	switch op.Axis {
	case operations.AxisJsonStrategy:
		strategy = extractStrategyOption(typeChecker, call, lastIndex, argsCount)
	case operations.AxisValidateOptions:
		optionNames = options.Names()
	}
	fnId := operations.FnHashFor(op, options.Names(), strategy)
	demands := operations.DemandFor(fnKey, optionNames, strategy)
	if len(demands) == 0 {
		return fnId, nil
	}
	out := make([]protocol.SiteDemand, len(demands))
	for index, demand := range demands {
		out[index] = protocol.SiteDemand{
			FamilyTag:     demand.FamilyTag,
			VariantSuffix: demand.VariantSuffix,
			Options:       demand.Options,
			FnHash:        demand.FnHash,
		}
	}
	return fnId, out
}

// optionsArgumentAt returns the AST node at the compile-time options slot —
// the slot immediately before the trailing id slot — or nil when the call
// doesn't fill it. Layout convention: options always lives at (lastIndex-1);
// for `createValidate<T>(val?, options?, id?)` that's slot 1. Marker
// functions without an options param (`getRunTypeId<T>(_value?, id?)`) are
// inherently safe — slot 0 holds a value, which may be an object literal
// but won't carry known option keys.
// Shared by the ValidateOptions / strategy extractors and the noop-option
// diagnostic anchor.
func optionsArgumentAt(call *ast.Node, lastIndex, argsCount int) *ast.Node {
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

// eachOptionProperty visits every named PropertyAssignment of the options
// object literal at the options slot as a (name, initializer) pair, descending
// into object-spread fragments (see eachOptionPropertyOf). No-op when the slot
// is unfilled or isn't an object literal — the resolver runs at build time and
// can't evaluate non-literal expressions, so a variable reference / call (or a
// spread whose operand isn't a resolvable object-literal fragment) silently
// yields zero options. This matches the compile-time-baked options model
// (baseRunTypes.ts:82-86 hashes options into the RT cache key).
func eachOptionProperty(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int, visit func(name string, initializer *ast.Node)) {
	// Unwrap `as const` / parens / `satisfies` so extraction accepts
	// exactly what the slot's CompTimeFnArgs validation accepted.
	candidate := comptimeargs.UnwrapWrappers(optionsArgumentAt(call, lastIndex, argsCount))
	if candidate == nil {
		return
	}
	// A whole-const options bag (`createX(undefined, importedPreset)`) resolves
	// cross-module to its `const` object literal — mirroring the spread trace, so
	// a whole-const preset selects the same fn variant as the inlined form. The
	// CompTimeFnArgs validation already accepted it (and enforced `as const`), so
	// the values read here match the type the call resolved against.
	if candidate.Kind == ast.KindIdentifier {
		if container, ok := comptimeargs.ResolveSpreadContainer(typeChecker, candidate); ok && container.Kind == ast.KindObjectLiteralExpression {
			candidate = container
		}
	}
	if candidate.Kind != ast.KindObjectLiteralExpression {
		return
	}
	eachOptionPropertyOf(typeChecker, candidate, 0, visit)
}

// eachOptionPropertyOf visits the named PropertyAssignments of an options
// object literal in SOURCE ORDER, descending into object-spread fragments
// (`{...preset, strategy: 'mutate'}`) at the position the spread appears. The
// source order is load-bearing: the callers are last-write-wins, so a later
// inline key — or a later spread — overrides an earlier spread's value, the
// same merge semantics TypeScript applies to the type-level spread the
// CompTimeFnArgs validation already accepted. This keeps the read in lockstep
// with the relaxed comptimeargs validator: anything Part A accepts as a spread
// is merged here, so an accepted preset can never silently drop its options
// and select the wrong fn-hash variant. A spread whose operand doesn't resolve
// to an object literal is skipped (it never passed validation). Depth-bounded
// against pathological const chains.
func eachOptionPropertyOf(typeChecker *checker.Checker, objectLiteralNode *ast.Node, depth int, visit func(name string, initializer *ast.Node)) {
	if depth > comptimeargs.DepthCap {
		return
	}
	objectLiteral := objectLiteralNode.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil {
			continue
		}
		switch property.Kind {
		case ast.KindPropertyAssignment:
			propertyAssignment := property.AsPropertyAssignment()
			if propertyAssignment == nil {
				continue
			}
			name := propertyAssignment.Name()
			if name == nil || propertyAssignment.Initializer == nil {
				continue
			}
			visit(name.Text(), propertyAssignment.Initializer)
		case ast.KindSpreadAssignment:
			spread := property.AsSpreadAssignment()
			if spread == nil || spread.Expression == nil {
				continue
			}
			container, ok := comptimeargs.ResolveSpreadContainer(typeChecker, spread.Expression)
			if !ok || container.Kind != ast.KindObjectLiteralExpression {
				continue
			}
			eachOptionPropertyOf(typeChecker, container, depth+1, visit)
		}
	}
}

// extractStrategyOption reads the `strategy` string property from the options
// slot — the JSON encoder/decoder compile-time selector. Returns "" when
// absent or not a string literal, so the caller falls back to the function's
// default strategy.
func extractStrategyOption(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) string {
	strategy := ""
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if name != "strategy" {
			return
		}
		// Last-write-wins: a later `strategy` (an inline override of a spread
		// preset, or a later spread) replaces an earlier one — matching the
		// merge semantics of `{...preset, strategy: '…'}`.
		if initializer.Kind == ast.KindStringLiteral || initializer.Kind == ast.KindNoSubstitutionTemplateLiteral {
			strategy = initializer.Text()
		}
	})
	return strategy
}

// enclosedByInjectionMarker reports whether call sits (transitively) inside the
// arguments of ANOTHER call whose resolved signature carries a trailing
// InjectRunTypeId<T> slot. Used to skip injecting an id for a value-first
// builder nested inside an enclosing marker (the enclosing marker reflects the
// whole shape; the nested id would be redundant). Walks the AST parent chain,
// resolving each ancestor CallExpression's signature and checking its trailing
// parameter — non-injection ancestor calls (plain helpers, `optional`, vitest's
// `expect`) are transparent, so the walk continues past them.
func (state scanState) enclosedByInjectionMarker(call *ast.Node) bool {
	for parent := call.Parent; parent != nil; parent = parent.Parent {
		if parent.Kind != ast.KindCallExpression {
			continue
		}
		signature := checker.Checker_getResolvedSignature(state.scanChecker, parent, nil, 0)
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
		paramType := checker.Checker_getTypeOfSymbol(state.scanChecker, lastParam)
		kind, _, matched := state.detectMarker(paramType)
		if matched && (kind == marker.KindInjectRunTypeId || kind == marker.KindInjectTypeFnArgs) {
			return true
		}
	}
	return false
}

// validateOptions carries the call-site `ValidateOptions` flags set to a
// literal `true`, keyed by their constants.ValidateOptions name. Mirrors
// the JS-side ValidateOptions interface
// (packages/ts-runtypes/src/createRTFunctions.ts). Table-driven off
// constants.ValidateOptions: a new option is extracted automatically once
// declared there — only its per-option semantics (e.g. a noop-diagnostic
// rule in analyzeCall) need teaching.
type validateOptions struct {
	enabled map[string]bool
}

// Any reports whether at least one option was set at the call site.
func (opts validateOptions) Any() bool { return len(opts.enabled) > 0 }

// Has reports whether the named option was set to a literal `true`.
func (opts validateOptions) Has(name string) bool { return opts.enabled[name] }

// Names returns the enabled option NAMES in the canonical declaration
// order from `constants.ValidateOptions` (the variant cache-key suffix
// order, e.g. `itNL`, `valNA`). Empty when no option is set.
func (opts validateOptions) Names() []string {
	if len(opts.enabled) == 0 {
		return nil
	}
	names := make([]string, 0, len(opts.enabled))
	for _, opt := range constants.ValidateOptions {
		if opts.enabled[opt.Name] {
			names = append(names, opt.Name)
		}
	}
	return names
}

// extractValidateOptions reads the literal `<option>: true` properties at
// the options slot for every option declared in constants.ValidateOptions.
func extractValidateOptions(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) validateOptions {
	var opts validateOptions
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		known := false
		for _, option := range constants.ValidateOptions {
			if option.Name == name {
				known = true
				break
			}
		}
		if !known {
			return
		}
		switch initializer.Kind {
		case ast.KindTrueKeyword:
			if opts.enabled == nil {
				opts.enabled = make(map[string]bool, len(constants.ValidateOptions))
			}
			opts.enabled[name] = true
		case ast.KindFalseKeyword:
			// Last-write-wins: an explicit `false` (an inline override of a
			// spread-in `true`, or a later spread) disables the option. A
			// no-op on an absent key, so the non-spread `{opt: false}` case
			// behaves exactly as before.
			delete(opts.enabled, name)
		}
	})
	return opts
}

// checkPureFunction validates that argumentNode is an inline arrow / function
// expression with no external handle, then runs the purity rules against the
// resolved function node. Shape failures map to PFN001 (not a literal) or PFN002
// (imported / exported — the literal is reachable as a value); purity violations
// emit PFE9006–PFE9011. Inline-shape failure short-circuits — there is nothing
// to walk for purity when the arg isn't a usable function literal.
func (state scanState) checkPureFunction(file string, argumentNode *ast.Node) []diag.Diagnostic {
	fnNode, shapeResult := comptimeargs.CheckLiteralFunction(state.scanChecker, argumentNode)
	if !shapeResult.Ok {
		failingNode := shapeResult.FailingNode
		if failingNode == nil {
			failingNode = argumentNode
		}
		sourceFile := ast.GetSourceFileOfNode(failingNode)
		if sourceFile == nil {
			return nil
		}
		code := diag.CodePureFunctionNotLiteral
		if shapeResult.Kind == comptimeargs.FailExternalHandle {
			code = diag.CodePureFunctionExternalHandle
		}
		return []diag.Diagnostic{diag.New(
			code,
			textpos.NodeSite(file, sourceFile, failingNode),
		)}
	}
	sourceFile := ast.GetSourceFileOfNode(fnNode)
	if sourceFile == nil {
		return nil
	}
	return purefunctions.CheckPurity(sourceFile, fnNode)
}

// checkCompTimeArgs validates the argument node passes the CompTimeArgs
// literal-only rules and returns a CTA0xx diagnostic when it doesn't.
// Returns (_, false) when validation succeeded.
func (state scanState) checkCompTimeArgs(file string, argumentNode *ast.Node) (diag.Diagnostic, bool) {
	result := comptimeargs.CheckLiteral(state.scanChecker, argumentNode, 0, state.isBuilderCallPredicate())
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
	site := textpos.NodeSite(file, sourceFile, failingNode)
	switch result.Kind {
	case comptimeargs.FailDepthExceeded:
		return diag.New(diag.CodeCompTimeArgsDepthExceeded, site), true
	case comptimeargs.FailForbiddenConstruct:
		return diag.New(diag.CodeCompTimeArgsForbiddenConstruct, site, result.Reason), true
	case comptimeargs.FailWidenedConst:
		return diag.New(diag.CodeCompTimeArgsWidenedConst, site, result.Reason), true
	default:
		return diag.New(diag.CodeCompTimeArgsNonLiteral, site), true
	}
}

// noopValidateOptionDiag builds a Warning diagnostic anchored at the
// options-literal node (slot lastIndex-1) when present, falling back
// to the whole call expression. Used by the no-op ValidateOption check
// to report MKR004 / MKR005 — the option survives downstream
// (always-emit invariant), so this is purely advisory.
func (resolver *Resolver) noopValidateOptionDiag(file string, call *ast.Node, lastIndex, argsCount int, code string) (diag.Diagnostic, bool) {
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return diag.Diagnostic{}, false
	}
	anchor := call
	if optionsNode := optionsArgumentAt(call, lastIndex, argsCount); optionsNode != nil {
		anchor = optionsNode
	}
	return diag.New(code, textpos.NodeSite(file, sourceFile, anchor)), true
}

// isBuilderCallPredicate returns the closure comptimeargs.CheckLiteral uses to
// recognize a static schema-construction call (a value-first builder OR an
// optional()/propMod() carrier) as a valid CompTimeArgs leaf — so a nested
// `string({…})` or `optional(number())` inside `object({…})` passes without
// recursing into it (each self-validates on its own scan visit).
func (state scanState) isBuilderCallPredicate() func(*ast.Node) bool {
	module := state.resolver.markerModule()
	return func(node *ast.Node) bool {
		return builders.IsSchemaLeafCall(state.scanChecker, module, node, state.resolver.marker.FS)
	}
}

// markerDiagFunctionCallArg builds an MKR001 diagnostic flagging a reflect-form
// marker call that received a function-call argument (`createValidate(getX())`).
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
	fnName := callExpressionName(callArg)
	return diag.New(
		diag.CodeMarkerFunctionCallArg,
		textpos.NodeSite(file, sourceFile, callArg),
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
func (state scanState) declaredTypeFromIdentifier(node *ast.Node) (*checker.Type, bool) {
	if node == nil || node.Kind != ast.KindIdentifier {
		return nil, false
	}
	typeNode, ok := comptimeargs.ConstTypeAnnotation(state.scanChecker, node)
	if !ok {
		return nil, false
	}
	return checker.Checker_getTypeFromTypeNode(state.scanChecker, typeNode), true
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
