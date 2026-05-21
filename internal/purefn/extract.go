package purefn

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
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

// ExtractFromProgram walks every file in `files`, finds
// registerPureFnFactory(<ns>, <fnName>, <factory>) calls, and returns
// (deduped entries, diagnostics). Diagnostics never block compilation —
// they're surfaced via the Vite plugin's `this.warn` channel using the
// canonical tsc-compatible format.
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
func ExtractFromProgram(lookup SourceFileLookup, files []string) ([]Entry, []Diagnostic) {
	var entries []Entry
	var diagnostics []Diagnostic
	seen := map[string]int{} // key → index in entries (the winner)

	for _, filePath := range files {
		sourceFile := lookup.SourceFile(filePath)
		if sourceFile == nil {
			continue
		}
		fileEntries, fileDiags := extractFromSourceFile(sourceFile)
		diagnostics = append(diagnostics, fileDiags...)
		for _, entry := range fileEntries {
			if winnerIdx, dup := seen[entry.Key()]; dup {
				winner := entries[winnerIdx]
				if winner.BodyHash == entry.BodyHash {
					continue // idempotent re-registration
				}
				diagnostics = append(diagnostics, Diagnostic{
					Code:     CodeBodyHashCollision,
					Category: "error",
					Message:  "Duplicate registration of \"" + entry.Key() + "\" with mismatched bodyHash",
					Site:     siteFromFile(entry.sourceFile, entry.callPos),
					Related: []RelatedSite{{
						DiagnosticSite: siteFromFile(winner.sourceFile, winner.callPos),
						Message:        "First registered here with bodyHash=" + winner.BodyHash,
					}},
				})
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
// returns its pure-fn entries + extractor-side diagnostics (PFE9001-
// PFE9003 + PFE9005 + purity violations). Called both by
// ExtractFromProgram in the main pass and by index lazy-expansion when
// a recorded jit dep points at an unscanned file.
//
// Does NOT perform cross-file collision detection (PFE9004) — the
// caller folds entries into a shared map and surfaces collisions there.
// A nil/missing source file yields (nil, nil); the caller decides
// whether that is an error.
func extractFromFile(lookup SourceFileLookup, filePath string) ([]Entry, []Diagnostic) {
	sourceFile := lookup.SourceFile(filePath)
	if sourceFile == nil {
		return nil, nil
	}
	return extractFromSourceFile(sourceFile)
}

// extractFromSourceFile is the per-file extraction core: build symbol
// table, walk every CallExpression, dispatch to extractOne. Shared by
// the lookup-driven helper above and the original ExtractFromProgram
// loop body (which already holds a *SourceFile in hand).
func extractFromSourceFile(sourceFile *ast.SourceFile) ([]Entry, []Diagnostic) {
	var entries []Entry
	var diagnostics []Diagnostic
	table := buildSymbolTable(sourceFile)
	findCalls(sourceFile, func(call *ast.Node) {
		entry, diags := extractOne(sourceFile, table, call)
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

// extractOne processes a single CallExpression. Returns (nil, diagnostics)
// when the call isn't a registerPureFnFactory invocation, or when an arg
// can't be resolved. The returned Entry carries internal-only fields
// (sourceFile, callPos) that the caller uses for cross-file collision
// reporting; these never reach the wire.
func extractOne(sourceFile *ast.SourceFile, table symbolTable, call *ast.Node) (*Entry, []Diagnostic) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, nil
	}
	callee := callExpr.Expression
	if callee == nil || callee.Kind != ast.KindIdentifier || callee.Text() != "registerPureFnFactory" {
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
	// replacement, no diagnostic. Detection is intentionally narrow
	// — exactly `null` as the third arg.
	if args[2].Kind == ast.KindNullKeyword {
		return nil, nil
	}
	var diags []Diagnostic

	nsLit, nsReason := resolveStringArg(table, args[0])
	if nsLit == nil {
		diags = append(diags, Diagnostic{
			Code:     CodeNamespaceNotLiteral,
			Category: "error",
			Message:  "registerPureFnFactory namespace must be a string literal or a local const string in the same module (" + nsReason + ")",
			Site:     siteFromNode(sourceFile, args[0]),
		})
	}

	fnNameLit, fnNameReason := resolveStringArg(table, args[1])
	if fnNameLit == nil {
		diags = append(diags, Diagnostic{
			Code:     CodeFunctionIDNotLiteral,
			Category: "error",
			Message:  "registerPureFnFactory functionID must be a string literal or a local const string in the same module (" + fnNameReason + ")",
			Site:     siteFromNode(sourceFile, args[1]),
		})
	}

	factoryFn, factoryReason := resolveFactoryArg(table, args[2])
	if factoryFn == nil {
		diags = append(diags, Diagnostic{
			Code:     CodeFactoryNotInline,
			Category: "error",
			Message:  "registerPureFnFactory factory must be an inline function/arrow or a local function/const-assigned function in the same module (" + factoryReason + ")",
			Site:     siteFromNode(sourceFile, args[2]),
		})
	}

	if nsLit == nil || fnNameLit == nil || factoryFn == nil {
		return nil, diags
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
			diags = append(diags, Diagnostic{
				Code:     CodeDestructuredParam,
				Category: "error",
				Message:  "registerPureFnFactory factory at \"" + namespace + "::" + functionName + "\" uses destructured parameters — only simple identifier params are allowed",
				Site:     siteFromNode(sourceFile, paramNode),
			})
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
	// emits even when violations exist (same posture as PFE9001/9003).
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
	pureFnDependencies, depDiags := extractDeps(sourceFile, factoryFn, table, utlName)
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

// siteFromNode builds a 1-based DiagnosticSite for the node's start/end.
func siteFromNode(sourceFile *ast.SourceFile, node *ast.Node) DiagnosticSite {
	if node == nil {
		return DiagnosticSite{}
	}
	startLine, startCol := lineCol(sourceFile, node.Pos())
	endLine, endCol := lineCol(sourceFile, node.End())
	return DiagnosticSite{
		FilePath:  sourceFile.FileName(),
		StartLine: startLine,
		StartCol:  startCol,
		EndLine:   endLine,
		EndCol:    endCol,
	}
}

// siteFromCall is siteFromNode anchored at a CallExpression's callee position
// so the diagnostic points at `registerPureFnFactory` instead of the whole
// argument list.
func siteFromCall(sourceFile *ast.SourceFile, call *ast.Node) DiagnosticSite {
	return siteFromNode(sourceFile, call)
}

// siteFromFile reproduces a site from a previously-captured file + pos pair,
// used when the winner of a collision lives in a different file from the
// duplicate.
func siteFromFile(sourceFile *ast.SourceFile, pos int) DiagnosticSite {
	if sourceFile == nil {
		return DiagnosticSite{}
	}
	line, col := lineCol(sourceFile, pos)
	return DiagnosticSite{
		FilePath:  sourceFile.FileName(),
		StartLine: line,
		StartCol:  col,
		EndLine:   line,
		EndCol:    col,
	}
}

// lineCol returns (1-based line, 1-based column) for byte offset pos.
// Computed by scanning the source text — straightforward and avoids
// pulling in the scanner shim for one helper.
func lineCol(sourceFile *ast.SourceFile, pos int) (int, int) {
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

