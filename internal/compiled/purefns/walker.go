package purefns

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/marker"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// Entry is the in-Go shape that mirrors TS-side `Entry`.
// Code is the JS-stripped factory body; BodyHash is mion-byte-compatible.
//
// sourceFile/callPos are unexported origin-tracking fields used internally
// by ExtractFromProgram to build cross-file collision diagnostics. They're
// elided from JSON serialisation (unexported) and from the module render
// (the module emitter reads only Key()/ParamNames/Code/BodyHash).
type Entry struct {
	Namespace    string
	FunctionName string
	ParamNames   []string
	Code         string
	BodyHash     string
	// PureFnDependencies is the sorted, deduped list of
	// `"<namespace>::<fnName>"` keys this pure-fn factory accesses via
	// `utl.getPureFn` / `usePureFn` / `getCompiledPureFn` /
	// `findCompiledPureFn` calls. Statically extracted by extractDeps
	// during the same purity walk; absent when the factory has no first
	// parameter to identify utl through.
	PureFnDependencies []string
	// FactoryArgStart / FactoryArgEnd are the byte offsets of the user's
	// factory argument expression in the `registerPureFnFactory(ns, fn,
	// factory)` call. Used by the Vite plugin to replace that span with
	// `null` so the canonical fn body lives only in the emitted pureFns
	// cache module.
	FactoryArgStart int
	FactoryArgEnd   int
	// FilePath is the absolute source path the entry was extracted from.
	// Stable across requests for one Program. Used by the emitter when
	// the wire `Replacement.File` field needs to be populated.
	FilePath string

	sourceFile *ast.SourceFile
	callPos    int
}

// Key returns the cache key the virtual module uses to look up this entry.
func (p Entry) Key() string {
	return p.Namespace + "::" + p.FunctionName
}

// SourceFileLookup is the narrow program-side surface ExtractFromProgram
// needs. *program.Program satisfies it.
type SourceFileLookup interface {
	SourceFile(absPath string) *ast.SourceFile
}

// FileCache memoizes per-file extraction results for the lifetime of ONE
// Program — source files are immutable within a Program, so a file's raw
// entries/diagnostics never change between requests. Only the per-file AST
// walk + purity checks are cached; the cross-file fold (dedup + PFE9004
// collision detection) is set-dependent and re-runs cheaply on every call.
// The resolver owns one instance and drops it on Program swap / reset.
// Not safe for concurrent use (same constraint as the package).
type FileCache struct {
	entries map[string][]Entry
	diags   map[string][]diag.Diagnostic
}

// NewFileCache returns an empty per-Program extraction memo.
func NewFileCache() *FileCache {
	return &FileCache{entries: map[string][]Entry{}, diags: map[string][]diag.Diagnostic{}}
}

func (cache *FileCache) get(filePath string) ([]Entry, []diag.Diagnostic, bool) {
	if cache == nil {
		return nil, nil, false
	}
	entries, ok := cache.entries[filePath]
	if !ok {
		return nil, nil, false
	}
	return entries, cache.diags[filePath], true
}

func (cache *FileCache) put(filePath string, entries []Entry, diagnostics []diag.Diagnostic) {
	if cache == nil {
		return
	}
	cache.entries[filePath] = entries
	cache.diags[filePath] = diagnostics
}

// ExtractFromProgram walks every file in `files`, finds calls to
// `registerPureFnFactory(...)` whose resolved signature carries the
// expected marker brands (CompTimeArgs<string> × 2 + PureFunction<F>
// on slots 0, 1, 2), and returns (deduped entries, diagnostics).
//
// Discovery is two-layered: a cheap callee-name filter
// (`pureFnFactoryCalleeName`) rules out unrelated calls without paying
// for signature resolution, then a brand check on the resolved
// signature verifies the call is the real, branded
// `registerPureFnFactory` from the marker package (not a user's
// same-named local function). The brands are the correctness contract;
// the name is a fast-path filter only.
//
// Diagnostics never block compilation — they're surfaced via the Vite
// plugin's `this.warn` channel using the canonical tsc-compatible
// format. Note: marker-shape diagnostics (non-literal namespace / fnId
// / factory) are emitted by `resolver.scanCall` via CTA001 / PFN001,
// NOT here. This pass emits only purefn-specific diagnostics:
// PFE9004 (cross-file collision), PFE9005 (destructured factory
// param), PFE9006-9011 (purity), PFE9012-9013 (deps).
//
// Dedup semantics (per plan):
//
//	Key not seen          → add to entries
//	Key seen, same hash   → silently skip (idempotent re-registration)
//	Key seen, different   → append PFE9004 diagnostic with Related = winner;
//	                         first occurrence kept in entries
//
// Order: entries sorted by Key (alphabetical); diagnostics sorted by Site
// (filepath, line, col) — both deterministic for stable test fixtures.
func ExtractFromProgram(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, files []string) ([]Entry, []diag.Diagnostic) {
	return ExtractFromProgramCached(typeChecker, markerOpts, lookup, files, nil)
}

// ExtractFromProgramCached is ExtractFromProgram with an optional per-Program
// FileCache: cached files skip the AST walk + purity checks entirely, fresh
// files are extracted and stored. A nil cache degrades to the uncached path.
func ExtractFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, files []string, cache *FileCache) ([]Entry, []diag.Diagnostic) {
	var entries []Entry
	var diagnostics []diag.Diagnostic
	seen := map[string]int{} // key → index in entries (the winner)

	for _, filePath := range files {
		fileEntries, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileEntries, fileDiags = extractFromSourceFile(typeChecker, markerOpts, sourceFile)
			cache.put(filePath, fileEntries, fileDiags)
		}
		diagnostics = append(diagnostics, fileDiags...)
		for _, entry := range fileEntries {
			if winnerIdx, dup := seen[entry.Key()]; dup {
				winner := entries[winnerIdx]
				if winner.BodyHash == entry.BodyHash {
					continue // idempotent re-registration
				}
				diagnostics = append(diagnostics, diag.NewWithRelated(
					diag.CodeBodyHashCollision,
					siteFromFile(entry.sourceFile, entry.callPos),
					[]string{entry.Key()},
					diag.Related{
						Site:    siteFromFile(winner.sourceFile, winner.callPos),
						Message: "First registered here with bodyHash=" + winner.BodyHash,
					},
				))
				continue
			}
			seen[entry.Key()] = len(entries)
			entries = append(entries, entry)
		}
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return entries[i].Key() < entries[j].Key()
	})
	sort.SliceStable(diagnostics, func(i, j int) bool {
		a, b := diagnostics[i].Site, diagnostics[j].Site
		if a.FilePath != b.FilePath {
			return a.FilePath < b.FilePath
		}
		if a.StartLine != b.StartLine {
			return a.StartLine < b.StartLine
		}
		return a.StartCol < b.StartCol
	})
	return entries, diagnostics
}

// extractFromFile walks a single source file resolved from lookup and
// returns its pure-fn entries + extractor-side diagnostics (PFE9005 +
// purity violations + dep diagnostics). Called both by
// ExtractFromProgram in the main pass and by index lazy-expansion when
// a recorded rt dep points at an unscanned file.
//
// Does NOT perform cross-file collision detection (PFE9004) — the
// caller folds entries into a shared map and surfaces collisions there.
// A nil/missing source file yields (nil, nil); the caller decides
// whether that is an error.
func extractFromFile(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, filePath string) ([]Entry, []diag.Diagnostic) {
	sourceFile := lookup.SourceFile(filePath)
	if sourceFile == nil {
		return nil, nil
	}
	return extractFromSourceFile(typeChecker, markerOpts, sourceFile)
}

// extractFromSourceFile is the per-file extraction core: build symbol
// table, walk every CallExpression, dispatch to extractOne. Shared by
// the lookup-driven helper above and the original ExtractFromProgram
// loop body (which already holds a *SourceFile in hand).
func extractFromSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) ([]Entry, []diag.Diagnostic) {
	var entries []Entry
	var diagnostics []diag.Diagnostic
	findCalls(sourceFile, func(call *ast.Node) {
		entry, diags := extractOne(typeChecker, markerOpts, sourceFile, call)
		diagnostics = append(diagnostics, diags...)
		if entry != nil {
			entries = append(entries, *entry)
		}
	})
	return entries, diagnostics
}

// findCalls invokes cb for every CallExpression in sourceFile.
func findCalls(sourceFile *ast.SourceFile, cb func(*ast.Node)) {
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			cb(node)
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
}

// pureFnFactoryCalleeName is the well-known identifier the walker uses
// as a cheap pre-filter before resolving signatures. tsgo's signature
// resolution is one of its heaviest operations; running it for every
// CallExpression in every file (most of which are unrelated to
// purefns) is wasteful when a string compare on the callee identifier
// rules out 99% of calls immediately.
//
// The name is NOT the contract — the marker brands are. After the
// pre-filter the brand check via `isPureFnFactoryCall` still runs and
// verifies the call's signature really matches `(CompTimeArgs<string>,
// CompTimeArgs<string>, PureFunction<F> | null)`. A user's own
// `function registerPureFnFactory()` declared elsewhere is rejected by
// the brand check even if it passes the name filter; the real
// `registerPureFnFactory` imported under an alias is missed, but the
// inner call inside any typed wrapper still gets found, and the cache
// entry that comes out is the same.
//
// Compile-time validation (CTA001 / PFN001 on bad args) is a separate
// concern handled by `resolver.scanCall`, which walks every call
// regardless of name and emits diagnostics from the brand alone. So
// the name filter here only short-circuits the EXTRACTION pass — the
// user-facing type-checking guarantees come from the brands either
// way.
const pureFnFactoryCalleeName = "registerPureFnFactory"

// isPureFnFactoryCall reports whether call is a purefn-factory
// registration that should be extracted. Two-layer check:
//
//  1. Cheap: the callee is an identifier whose text equals the
//     well-known `registerPureFnFactory` name. Avoids signature
//     resolution on unrelated calls.
//  2. Brand verify: the resolved signature has ≥3 parameters where
//     slots 0+1 carry `CompTimeArgs<string>` and slot 2 carries
//     `PureFunction<F>`. Module-of-origin is implicit in the brand
//     check (markers only match aliases declared in the
//     `ts-runtypes` package), so a user's own
//     `function registerPureFnFactory()` is rejected here even if it
//     passes the name filter.
func isPureFnFactoryCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) bool {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindIdentifier || callee.Text() != pureFnFactoryCalleeName {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) < 3 {
		return false
	}
	return paramHasMarker(typeChecker, markerOpts, parameters[0], marker.KindCompTimeArgs) &&
		paramHasMarker(typeChecker, markerOpts, parameters[1], marker.KindCompTimeArgs) &&
		paramHasMarker(typeChecker, markerOpts, parameters[2], marker.KindPureFunction)
}

// paramHasMarker reports whether the parameter's resolved type carries
// the specified marker brand. Wraps marker.DetectAny with the kind
// filter.
func paramHasMarker(typeChecker *checker.Checker, markerOpts marker.Options, paramSymbol *ast.Symbol, want marker.Kind) bool {
	if paramSymbol == nil {
		return false
	}
	paramType := checker.Checker_getTypeOfSymbol(typeChecker, paramSymbol)
	if kind, _, matched := marker.DetectAny(typeChecker, paramType, markerOpts); matched {
		return kind == want
	}
	// CompTimeArgs is the zero-cost identity marker (markers.ts) — invisible to
	// DetectAny on the resolved type, so recognise it off the parameter's
	// `CompTimeArgs<…>` annotation node (matches the resolver's scan path).
	return want == marker.KindCompTimeArgs && comptimeargs.IsCompTimeArgsParamNode(typeChecker, paramSymbol, markerOpts)
}

// extractOne processes a single CallExpression. Returns (nil, nil)
// when the call isn't a `registerPureFnFactory(...)` invocation (the
// callee name + brand shape both have to match — see
// `isPureFnFactoryCall`), or when any of the three args can't be
// resolved to its literal form.
//
// Marker-shape validation (non-literal namespace / fnId / factory) is
// emitted as CTA001 / PFN001 by `resolver.scanCall` — this function
// does NOT double-report. Only purefn-specific diagnostics are
// emitted here (PFE9005, PFE9006-9011, PFE9012-9013).
//
// The returned Entry carries internal-only fields (sourceFile, callPos)
// that the caller uses for cross-file collision reporting; these never
// reach the wire.
func extractOne(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node) (*Entry, []diag.Diagnostic) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, nil
	}
	if !isPureFnFactoryCall(typeChecker, markerOpts, call) {
		return nil, nil
	}
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) < 3 {
		return nil, nil
	}
	args := callExpr.Arguments.Nodes
	// Post-rewrite calls carry `null` as the factory argument — the
	// Vite plugin nulls out the inline factory once the original
	// extraction has produced a cache entry. Re-scanning the
	// rewritten source must be a quiet no-op: no entry, no
	// replacement, no diagnostic.
	if args[2].Kind == ast.KindNullKeyword {
		return nil, nil
	}
	var diags []diag.Diagnostic

	nsLit, nsResult := comptimeargs.ResolveLiteralString(typeChecker, args[0])
	fnNameLit, fnNameResult := comptimeargs.ResolveLiteralString(typeChecker, args[1])
	factoryFn, factoryResult := comptimeargs.CheckLiteralFunction(typeChecker, args[2])

	// Marker layer (resolver.scanCall) emits CTA001 / PFN001 for these
	// failures. Silently bail without an entry — duplicate diagnostics
	// would be noise.
	if !nsResult.Ok || !fnNameResult.Ok || !factoryResult.Ok {
		return nil, nil
	}

	namespace := nsLit.Text()
	functionName := fnNameLit.Text()

	// Param-name extraction + destructuring guard.
	fnLike := factoryFn.FunctionLikeData()
	if fnLike == nil || fnLike.Parameters == nil {
		return nil, diags
	}
	paramNames := make([]string, 0, len(fnLike.Parameters.Nodes))
	for _, paramNode := range fnLike.Parameters.Nodes {
		paramDecl := paramNode.AsParameterDeclaration()
		nameNode := paramDecl.Name()
		if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
			diags = append(diags, diag.New(
				diag.CodeDestructuredParam,
				siteFromNode(sourceFile, paramNode),
				namespace+"::"+functionName,
			))
			return nil, diags
		}
		paramNames = append(paramNames, nameNode.Text())
	}

	body := factoryFn.Body()
	if body == nil {
		return nil, diags
	}

	// Purity validation — port of mion's eslint-plugin-mion
	// `pure-functions.ts` rule. Emits PFE9006-PFE9011 diagnostics for
	// this/await/yield, dynamic import, forbidden identifiers, and
	// closure-variable references. Build never fails; the entry still
	// emits even when violations exist (same posture as PFE9005).
	diags = append(diags, checkPurity(sourceFile, factoryFn)...)

	// Static dep extraction — walk the factory body for calls like
	// `<utlName>.getPureFn('ns::fn')` and collect the literal keys as
	// the entry's pureFnDependencies. Replaces the old runtime
	// tracking-proxy approach in pureFn.ts.
	utlName := ""
	if len(fnLike.Parameters.Nodes) > 0 {
		firstParamDecl := fnLike.Parameters.Nodes[0].AsParameterDeclaration()
		if firstParamDecl != nil {
			firstParamName := firstParamDecl.Name()
			if firstParamName != nil && firstParamName.Kind == ast.KindIdentifier {
				utlName = firstParamName.Text()
			}
		}
	}
	pureFnDependencies, depDiags := extractDeps(typeChecker, markerOpts, sourceFile, factoryFn, utlName)
	diags = append(diags, depDiags...)

	var code string
	if body.Kind == ast.KindBlock {
		code = stripTypesFromBlock(sourceFile, body)
	} else {
		code = stripTypesFromExpr(sourceFile, body)
	}

	entry := &Entry{
		Namespace:          namespace,
		FunctionName:       functionName,
		ParamNames:         paramNames,
		Code:               code,
		BodyHash:           BodyHash(namespace, functionName, code),
		PureFnDependencies: pureFnDependencies,
		FactoryArgStart:    args[2].Pos(),
		FactoryArgEnd:      args[2].End(),
		FilePath:           sourceFile.FileName(),
		sourceFile:         sourceFile,
		callPos:            call.Pos(),
	}
	return entry, diags
}

// siteFromNode builds a 1-based diag.Site for the node's start/end.
func siteFromNode(sourceFile *ast.SourceFile, node *ast.Node) diag.Site {
	return textpos.NodeSite(sourceFile.FileName(), sourceFile, node)
}

// siteFromCall is siteFromNode anchored at a CallExpression's callee position
// so the diagnostic points at `registerPureFnFactory` instead of the whole
// argument list.
func siteFromCall(sourceFile *ast.SourceFile, call *ast.Node) diag.Site {
	return siteFromNode(sourceFile, call)
}

// siteFromFile reproduces a site from a previously-captured file + pos pair,
// used when the winner of a collision lives in a different file from the
// duplicate.
func siteFromFile(sourceFile *ast.SourceFile, pos int) diag.Site {
	if sourceFile == nil {
		return diag.Site{}
	}
	line, col := textpos.LineCol(sourceFile, pos)
	return diag.Site{
		FilePath:  sourceFile.FileName(),
		StartLine: line,
		StartCol:  col,
		EndLine:   line,
		EndCol:    col,
	}
}
