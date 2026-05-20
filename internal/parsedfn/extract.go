package parsedfn

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
)

// ParsedFn is the in-Go shape that mirrors TS-side `ParsedFactoryFn`.
// Code is the JS-stripped factory body; BodyHash is mion-byte-compatible.
//
// sourceFile/callPos are unexported origin-tracking fields used internally
// by ExtractFromProgram to build cross-file collision diagnostics. They're
// elided from JSON serialisation (unexported) and from the module render
// (the module emitter reads only Key()/ParamNames/Code/BodyHash).
type ParsedFn struct {
	Namespace    string
	FunctionName string
	ParamNames   []string
	Code         string
	BodyHash     string

	sourceFile *ast.SourceFile
	callPos    int
}

// Key returns the cache key the virtual module uses to look up this entry.
func (p ParsedFn) Key() string {
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
func ExtractFromProgram(lookup SourceFileLookup, files []string) ([]ParsedFn, []Diagnostic) {
	var entries []ParsedFn
	var diagnostics []Diagnostic
	seen := map[string]int{} // key → index in entries (the winner)

	for _, filePath := range files {
		sourceFile := lookup.SourceFile(filePath)
		if sourceFile == nil {
			continue
		}
		table := buildSymbolTable(sourceFile)
		findCalls(sourceFile, func(call *ast.Node) {
			entry, diags := extractOne(sourceFile, table, call)
			diagnostics = append(diagnostics, diags...)
			if entry == nil {
				return
			}
			if winnerIdx, dup := seen[entry.Key()]; dup {
				winner := entries[winnerIdx]
				if winner.BodyHash == entry.BodyHash {
					return // idempotent re-registration
				}
				diagnostics = append(diagnostics, Diagnostic{
					Code:     CodeBodyHashCollision,
					Category: "error",
					Message:  "Duplicate registration of \"" + entry.Key() + "\" with mismatched bodyHash",
					Site:     siteFromCall(sourceFile, call),
					Related: []RelatedSite{{
						DiagnosticSite: siteFromFile(winner.sourceFile, winner.callPos),
						Message:        "First registered here with bodyHash=" + winner.BodyHash,
					}},
				})
				return
			}
			seen[entry.Key()] = len(entries)
			entries = append(entries, *entry)
		})
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
// can't be resolved. The returned ParsedFn carries internal-only fields
// (sourceFile, callPos) that the caller uses for cross-file collision
// reporting; these never reach the wire.
func extractOne(sourceFile *ast.SourceFile, table symbolTable, call *ast.Node) (*ParsedFn, []Diagnostic) {
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
	var code string
	if body.Kind == ast.KindBlock {
		code = stripTypesFromBlock(sourceFile, body)
	} else {
		code = stripTypesFromExpr(sourceFile, body)
	}

	entry := &ParsedFn{
		Namespace:    namespace,
		FunctionName: functionName,
		ParamNames:   paramNames,
		Code:         code,
		BodyHash:     BodyHash(namespace, functionName, code),
		sourceFile:   sourceFile,
		callPos:      call.Pos(),
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

