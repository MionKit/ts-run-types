package resolver

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/walker"
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
// `RuntypeId<T>` parameter (where T is concretely bound). Sites for every
// file are returned flat, each tagged with .File so callers can filter.
//
// After each per-file scan, recordFileIDs walks the sites' RunType graphs
// and notes the reached wire ids against that file in the cache's per-file
// scope map. The map drives the per-request projection that
// scopedDump uses for IncludeRunTypes / IncludeCacheSources.
func (resolver *Resolver) dispatchScanFiles(files []string) ([]protocol.Site, []protocol.MarkerDiagnostic, error) {
	var sites []protocol.Site
	var diagnostics []protocol.MarkerDiagnostic
	for _, file := range files {
		sourceFile, err := resolver.sourceFile(file)
		if err != nil {
			return nil, nil, err
		}
		fileStart := len(sites)
		walker.ForEachCallExpression(sourceFile, func(call *ast.Node) bool {
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

// scanCall inspects one call expression and returns a Site when its
// resolved signature opts into transformer injection via a trailing
// `RuntypeId<T>` parameter with a concretely-bound T. Also returns any
// non-fatal MarkerDiagnostics emitted for the call (e.g. the
// function-call-argument anti-pattern warning) — diagnostics are
// independent of site emission and may be returned with or without
// a site.
func (resolver *Resolver) scanCall(file string, call *ast.Node) (protocol.Site, []protocol.MarkerDiagnostic, bool) {
	signature := checker.Checker_getResolvedSignature(resolver.checker, call, nil, 0)
	if signature == nil {
		return protocol.Site{}, nil, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return protocol.Site{}, nil, false
	}
	lastIndex := len(parameters) - 1
	lastParam := parameters[lastIndex]
	if lastParam == nil {
		return protocol.Site{}, nil, false
	}
	paramType := checker.Checker_getTypeOfSymbol(resolver.checker, lastParam)
	typeArgument, matched := marker.Detect(paramType, resolver.marker)
	if !matched {
		return protocol.Site{}, nil, false
	}
	if marker.IsFreeTypeParameter(typeArgument) {
		// Call inside a generic wrapper body — `T` is the wrapper's own
		// free type parameter. Skip: no id to inject until the wrapper
		// is itself instantiated at its own call sites.
		return protocol.Site{}, nil, false
	}
	argsCount := 0
	if callExpression := call.AsCallExpression(); callExpression != nil && callExpression.Arguments != nil {
		argsCount = len(callExpression.Arguments.Nodes)
	}
	// Caller has already placed an argument at (or past) the id slot.
	// Never override an explicit pass-through — leave the call untouched.
	if argsCount > lastIndex {
		return protocol.Site{}, nil, false
	}
	// Diagnostics accumulated for this call. Emission is independent of
	// site emission — every diagnostic flows back regardless of whether
	// the call produces a Site at the end.
	var diagnostics []protocol.MarkerDiagnostic
	// REFLECT-FORM CHECKS: only fire when T was inferred from a value
	// argument (no explicit type-argument list) AND at least one value
	// arg is present.
	callExpression := call.AsCallExpression()
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
			if diag, ok := resolver.markerDiagFunctionCallArg(file, argZero); ok {
				diagnostics = append(diagnostics, diag)
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
		if annotated, ok := resolver.declaredTypeFromIdentifier(argZero); ok {
			typeArgument = annotated
		}
	}
	// Extract any literal RunTypeOptions object passed at a slot before
	// the id slot. Today only `noLiterals: true` is honored; other
	// fields are reserved (see createIsType.ts RunTypeOptions). Options
	// are folded into the id hash by swapping the resolved type below,
	// so `(T, {})` and `(T, {noLiterals: true})` resolve distinct ids.
	options := extractRunTypeOptions(call, lastIndex, argsCount)
	// noLiterals semantics (literal.ts:28-54): the literal node swaps to
	// its base-kind runtype for validation purposes. We mirror this at
	// resolver time by walking the literal type up to its base type
	// before assigning the id — the existing emit code then handles
	// the base kind unchanged, no per-arm noLiterals branching needed.
	//
	// Two escape hatches are needed because tsgo's
	// getBaseTypeOfLiteralType doesn't cover them:
	//   1. Unique ESSymbol → plain symbol (KindSymbol). tsgo returns
	//      the type unchanged for TypeFlagsUniqueESSymbol because
	//      there's no `c.esSymbolType` lookup in that switch arm.
	//   2. Regex-literal harvest is suppressed here so a `typeof reg`
	//      with `reg = /abc/i` resolves through the normal type-checker
	//      path to the generic RegExp class (KindRegexp).
	id := ""
	if options.NoLiterals {
		flags := checker.Type_flags(typeArgument)
		if flags&checker.TypeFlagsUniqueESSymbol != 0 {
			// Escape hatch #1.
			id = resolver.cache.SerializeAtomicKind(protocol.KindSymbol)
		} else {
			typeArgument = checker.Checker_getBaseTypeOfLiteralType(resolver.checker, typeArgument)
		}
	}
	if id == "" && !options.NoLiterals {
		// Regex-literal harvest — TS has no regex-literal type, so the
		// marker scanner reconstructs one from the AST when it can.
		if source, flags, ok := resolver.resolveRegexLiteralSource(call, lastIndex, argsCount); ok {
			id = resolver.cache.SerializeRegexLiteral(source, flags)
		}
	}
	if id == "" {
		id = resolver.cache.AssignID(typeArgument)
	}
	// noIsArrayCheck (mion's RunTypeOptions.noIsArrayCheck) lives on
	// the array node's emit, not on the type itself, so the resolver
	// forks a synthetic array RunType that carries the option as a
	// Flag and points at the same element child. Distinct id → distinct
	// JIT cache entry → distinct compiled validator with the
	// `Array.isArray` guard stripped (per istype.go's KindArray arm).
	// `string[]` and `string[] + {noIsArrayCheck: true}` therefore
	// hash to two different ids and compile to two different bodies,
	// matching mion's options-aware hash at baseRunTypes.ts:82-86.
	if options.NoIsArrayCheck {
		if wrapped, ok := resolver.cache.SerializeArrayWithFlags(id, []string{"noIsArrayCheck"}); ok {
			id = wrapped
		}
	}
	// call.End() is exclusive (one past the closing `)`). Pos at End()-1 is
	// the closing-paren offset where the TS-side patcher inserts.
	pos := call.End() - 1
	return protocol.Site{
		File:       file,
		Pos:        pos,
		ID:         id,
		ParamIndex: lastIndex,
		ArgsCount:  argsCount,
	}, diagnostics, true
}

// resolveRegexLiteralSource attempts to harvest a regex-literal source from
// the call's argument or type-argument expression. Returns (source, flags, true)
// when a regex literal is reachable; (_, _, false) otherwise — in which case
// the caller falls through to standard type-based resolution.
//
// Dispatch rule (signature-shape-agnostic — marker functions can have
// user-options slots between the value and the id):
//   - If TypeArguments has nodes → static form. Harvest from the first
//     type argument. Works for any signature whose user supplied <T>
//     explicitly, regardless of how many value args came before the id.
//   - Else if at least one user arg was supplied → reflect form. The
//     value for T lives at slot 0 by convention (the leading positional
//     parameter — `_value` for `reflectRuntypeId`, `val` for
//     `createIsType`). Harvest from Arguments[0]. If slot 0 is
//     `undefined` (the static-with-options shorthand
//     `createIsType<T>(undefined, {opts})`), the trace fails harmlessly
//     and we fall through to type-based resolution.
//
// The trace itself: unwrap `as` / parenthesised expressions, then either
// harvest a RegularExpressionLiteral directly, recurse through a TypeQuery,
// or resolve an Identifier to its const variable declaration's initializer.
func (resolver *Resolver) resolveRegexLiteralSource(call *ast.Node, paramIndex, argsCount int) (string, string, bool) {
	_ = paramIndex // retained for symmetry with extractRunTypeOptions
	callExpression := call.AsCallExpression()
	if callExpression == nil {
		return "", "", false
	}
	var node *ast.Node
	switch {
	case callExpression.TypeArguments != nil && len(callExpression.TypeArguments.Nodes) > 0:
		// Static form: user supplied <T> explicitly.
		node = callExpression.TypeArguments.Nodes[0]
	case argsCount > 0:
		// Reflect form: T inferred from the value at slot 0.
		if callExpression.Arguments != nil && len(callExpression.Arguments.Nodes) > 0 {
			node = callExpression.Arguments.Nodes[0]
		}
	}
	if node == nil {
		return "", "", false
	}
	return resolver.traceRegexLiteral(node, 0)
}

// runTypeOptions mirrors the JS-side RunTypeOptions interface
// (packages/ts-go-run-types/src/createIsType.ts). Resolver-side
// representation is a Go struct so the rest of the pipeline can read
// fields without re-walking the AST.
type runTypeOptions struct {
	NoLiterals     bool
	NoIsArrayCheck bool
}

// extractRunTypeOptions reads literal options from the argument slot
// immediately before the id slot, when the signature has a
// `RunTypeOptions` parameter there. The argument must be an object
// literal — variable references / spreads / function calls are ignored
// (return zero options) because the resolver runs at build time and
// can't evaluate arbitrary expressions. This matches mion's
// compile-time-baked options model (baseRunTypes.ts:82-86 hashes
// options into the JIT cache key).
//
// Layout convention: options always lives at slot (lastIndex - 1) — the
// slot immediately before id. For `createIsType<T>(val?, options?, id?)`
// that's slot 1; for any future function with `(options?, id?)` it
// would be slot 0. Marker functions without an options param
// (`getRuntypeId<T>(id?)`, `reflectRuntypeId(_value, id?)`) are
// inherently safe — `reflectRuntypeId`'s slot 0 holds a value, which
// is allowed to be an object literal but won't contain known option
// keys, so the lookup returns zero opts.
func extractRunTypeOptions(call *ast.Node, lastIndex, argsCount int) runTypeOptions {
	var opts runTypeOptions
	// Options live at the slot immediately before the id slot. If
	// lastIndex==0 the function has no slots before id at all
	// (e.g. getRuntypeId<T>(id?)).
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

// traceRegexLiteral walks through AST wrappers, typeof references, and const
// identifier bindings looking for a regex literal at the leaf. Depth-limited
// to defend against pathological inputs the type checker would otherwise
// reject (TS forbids self-referential initializers, but a defensive cap keeps
// the resolver predictable).
func (resolver *Resolver) traceRegexLiteral(node *ast.Node, depth int) (string, string, bool) {
	if node == nil || depth > 16 {
		return "", "", false
	}
	// Unwrap a single layer of `as T` / parens.
	for {
		switch node.Kind {
		case ast.KindAsExpression:
			asExpression := node.AsAsExpression()
			if asExpression == nil {
				return "", "", false
			}
			node = asExpression.Expression
		case ast.KindParenthesizedExpression:
			parenExpression := node.AsParenthesizedExpression()
			if parenExpression == nil {
				return "", "", false
			}
			node = parenExpression.Expression
		default:
			goto unwrapped
		}
		if node == nil {
			return "", "", false
		}
	}
unwrapped:
	switch node.Kind {
	case ast.KindRegularExpressionLiteral:
		literal := node.AsRegularExpressionLiteral()
		if literal == nil {
			return "", "", false
		}
		source, flags := splitRegexLiteralText(literal.Text)
		return source, flags, true
	case ast.KindTypeQuery:
		typeQuery := node.AsTypeQueryNode()
		if typeQuery == nil {
			return "", "", false
		}
		return resolver.traceRegexLiteral(typeQuery.ExprName, depth+1)
	case ast.KindIdentifier:
		symbol := resolver.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return "", "", false
		}
		for _, declaration := range symbol.Declarations {
			if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
				continue
			}
			// Only `const` bindings are traceable: `let`/`var` can be
			// reassigned, so the initializer no longer determines the value
			// at the call site.
			parent := declaration.Parent
			if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
				continue
			}
			variableDecl := declaration.AsVariableDeclaration()
			if variableDecl == nil || variableDecl.Initializer == nil {
				continue
			}
			return resolver.traceRegexLiteral(variableDecl.Initializer, depth+1)
		}
	}
	return "", "", false
}

// splitRegexLiteralText converts the raw RegExp literal text (e.g. "/abc/i")
// into its source ("abc") and flags ("i"). The text always starts with `/`,
// ends with `/<flags>`, and flags never contain `/`.
func splitRegexLiteralText(text string) (source, flags string) {
	if !strings.HasPrefix(text, "/") {
		return text, ""
	}
	body := text[1:]
	lastSlash := strings.LastIndex(body, "/")
	if lastSlash < 0 {
		return body, ""
	}
	return body[:lastSlash], body[lastSlash+1:]
}

// markerDiagFunctionCallArg builds a MarkerDiagnostic flagging a reflect-form
// marker call that received a function-call argument (`createIsType(getX())`).
// The function gets invoked at runtime purely so TypeScript can infer T from
// its return type, which can produce side effects, exceptions, or async work
// for no reason. The recommended replacement is the static form using
// `ReturnType<typeof fn>`. Returns (_, false) when the call's source file
// can't be located (defensive — shouldn't happen during scanFiles).
func (resolver *Resolver) markerDiagFunctionCallArg(file string, callArg *ast.Node) (protocol.MarkerDiagnostic, bool) {
	sourceFile := ast.GetSourceFileOfNode(callArg)
	if sourceFile == nil {
		return protocol.MarkerDiagnostic{}, false
	}
	startLine, startCol := scanLineCol(sourceFile, callArg.Pos())
	endLine, endCol := scanLineCol(sourceFile, callArg.End())
	fnName := callExpressionName(callArg)
	message := fmt.Sprintf(
		"Reflect-form marker call received a function-call result. The function `%s` is invoked at runtime purely to satisfy type inference, which can cause side effects, exceptions, or async work for no reason. Use the static form with `ReturnType<typeof fn>` instead — e.g. `createIsType<ReturnType<typeof %s>>()` — or pass a real value of the desired type.",
		fnName, fnName,
	)
	return protocol.MarkerDiagnostic{
		Code:     "marker/function-call-arg",
		Category: "warning",
		Message:  message,
		Site: protocol.PureFnDiagSite{
			FilePath:  file,
			StartLine: startLine,
			StartCol:  startCol,
			EndLine:   endLine,
			EndCol:    endCol,
		},
	}, true
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
// inside sourceFile. Mirrors purefn.lineCol — duplicated here to avoid a
// resolver→purefn import dependency for one helper.
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
//   - the binding is `let`/`var` (re-assignable; matches the same const-only
//     policy as traceRegexLiteral).
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
