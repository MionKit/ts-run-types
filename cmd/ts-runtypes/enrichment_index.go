package main

import (
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// mirrorIndex is the parsed view of an existing committed mirror file the
// reconcile (gen --update) algorithm matches the freshly-regenerated desired
// set against. It is built by parseMirror over the file's AST; byte ranges are
// raw offsets into the ORIGINAL file bytes (AST Pos/End are byte offsets), so a
// splice slices them directly with no char conversion.
type mirrorIndex struct {
	// raw is the original file bytes (the splice base).
	raw []byte
	// sourceFile is the parsed AST (the scanner needs it for trivia-trimmed
	// statement starts).
	sourceFile *ast.SourceFile
	// consts lists every indexed friendly*/mock* const in declaration order.
	consts []*constEntry
	// byTypeForm maps `<form>:<typeID>` (form = "f"/"m") → entry, so the friendly
	// and mock const of one type — which SHARE a structural id — never collide.
	// Only consts that carry an @rtType marker appear here.
	byTypeForm map[string]*constEntry
	// byVar maps a const's var name → entry (the fallback match when no marker,
	// or after a structural-id change renders the @rtType stale).
	byVar map[string]*constEntry
	// breadcrumb is the `import type { … } from '<src>'` source breadcrumb, or
	// nil when the file has none.
	breadcrumb *importEntry
	// dslImport is the `import type { FriendlyType, MockData } from 'ts-runtypes'`
	// DSL-types import, or nil when absent.
	dslImport *importEntry
	// valueImports are the cross-file `import { friendly*/mock* } from '<rel>'`
	// value-import lines, in declaration order.
	valueImports []*importEntry
}

// typeFormKey builds the byTypeForm composite key for a (typeID, isFriendly)
// pair so a type's friendly and mock consts index distinctly despite sharing the
// structural id.
func typeFormKey(typeID string, isFriendly bool) string {
	if isFriendly {
		return "f:" + typeID
	}
	return "m:" + typeID
}

// constEntry is one indexed `export const friendly*/mock* : Wrapper<T> = {…};`
// declaration. tokenStart is the trivia-trimmed start (so a leading JSDoc /
// comment above the const is NOT swallowed by a whole-const replace); fullStart
// is the leading-trivia start (Pos), used only to read the leading comment block
// that carries the markers.
type constEntry struct {
	varName    string            // the const identifier, e.g. "friendlyUser"
	isFriendly bool              // friendly* (true) vs mock* (false)
	typeID     string            // the @rtType id, or "" when no marker (matched by var name)
	childIDs   map[string]string // @rtIds dotted-field-path → child type id
	fullStart  int               // node.Pos() — start of leading trivia (the JSDoc)
	tokenStart int               // trivia-trimmed start (the `export` keyword)
	end        int               // node.End()
	body       *ast.Node         // the object-literal initializer (nil when not an object literal)
	// markerStart / markerEnd bound the existing `@rtType`-bearing JSDoc block
	// (absolute byte offsets), so a stale marker can be replaced surgically. Both
	// zero when the const has no marker block (insert before tokenStart instead).
	markerStart int
	markerEnd   int
}

// importEntry is one indexed import statement: its declared names + the byte
// range of the whole statement (trivia-trimmed start → End) plus the byte range
// of the `{ … }` named-bindings clause (for surgical breadcrumb-name edits).
type importEntry struct {
	names      []string
	specifier  string
	tokenStart int
	end        int
	// clauseStart / clauseEnd bound the INSIDE of the `{ … }` named-bindings list
	// (after `{`, before `}`), so the reconcile can rewrite only the names and
	// keep `from '<src>'` byte-identical. Zero when there are no named bindings.
	clauseStart int
	clauseEnd   int
}

// rtTypePattern matches the `@rtType <Name>#<id>` marker (or a bare `@rtType
// <id>`). Group 1 is the optional readable name, group 2 the id.
var rtTypePattern = regexp.MustCompile(`@rtType\s+(?:(\w+)#)?(\w+)`)

// rtIdsPattern matches the `@rtIds { … }` block; group 1 is the body between the
// braces.
var rtIdsPattern = regexp.MustCompile(`@rtIds\s*\{([^}]*)\}`)

// rtIdsEntryPattern matches one `field: <ref>#<id>` (or `field: <id>`) entry
// inside an @rtIds block. Group 1 is the dotted field path, group 3 the id.
var rtIdsEntryPattern = regexp.MustCompile(`([\w.$]+)\s*:\s*(?:([\w$]+)#)?(\w+)`)

// parseMirror parses mirrorBytes as a standalone TypeScript source file and
// indexes its consts + imports. It is FATAL when the parse reports any
// diagnostic (a syntax error) — we never silently append to or overwrite a file
// we cannot parse. A nil sourceFile never happens on a syntax error (the parser
// returns a node with Diagnostics populated), so the Diagnostics gate is the
// real check.
func parseMirror(mirrorPath string, mirrorBytes []byte) *mirrorIndex {
	text := string(mirrorBytes)
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: mirrorPath, Path: tspath.Path(mirrorPath)},
		text,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		fatal("gen --update: cannot parse mirror %s; fix or delete it", mirrorPath)
	}
	if diagnostics := sourceFile.Diagnostics(); len(diagnostics) > 0 {
		fatal("gen --update: cannot parse mirror %s (%d syntax error(s)); fix or delete it: %s",
			mirrorPath, len(diagnostics), firstDiagnosticMessage(diagnostics))
	}

	index := &mirrorIndex{
		raw:        mirrorBytes,
		sourceFile: sourceFile,
		byTypeForm: map[string]*constEntry{},
		byVar:      map[string]*constEntry{},
	}

	root := sourceFile.AsNode()
	if root == nil {
		return index
	}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsImportDeclaration(statement):
			index.indexImport(text, statement)
		case ast.IsVariableStatement(statement):
			index.indexVariableStatement(text, statement)
		}
	}
	return index
}

// firstDiagnosticMessage returns the rendered text of the first diagnostic, for
// the fatal-on-parse-error report.
func firstDiagnosticMessage(diagnostics []*ast.Diagnostic) string {
	if len(diagnostics) == 0 {
		return ""
	}
	return diagnostics[0].String()
}

// indexVariableStatement records every `export const friendly*/mock*` the
// statement declares, keyed by its @rtType id (fallback: var name).
func (index *mirrorIndex) indexVariableStatement(text string, statement *ast.Node) {
	tokenStart := scanner.GetTokenPosOfNode(statement, index.sourceFile, false)
	leadingComment := text[statement.Pos():tokenStart]

	for _, declaration := range variableDeclarations(statement) {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		nameNode := declaration.Name()
		if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
			continue
		}
		varName := nameNode.Text()
		isFriendly, isMock := isFriendlyVar(varName), isMockVar(varName)
		if !isFriendly && !isMock {
			continue
		}
		typeID, childIDs := parseConstMarkers(leadingComment)

		var body *ast.Node
		if initializer := declaration.AsVariableDeclaration().Initializer; initializer != nil && ast.IsObjectLiteralExpression(initializer) {
			body = initializer
		}

		markerStart, markerEnd := markerBlockRange(text, statement.Pos(), tokenStart)
		entry := &constEntry{
			varName:     varName,
			isFriendly:  isFriendly,
			typeID:      typeID,
			childIDs:    childIDs,
			fullStart:   statement.Pos(),
			tokenStart:  tokenStart,
			end:         statement.End(),
			body:        body,
			markerStart: markerStart,
			markerEnd:   markerEnd,
		}
		index.consts = append(index.consts, entry)
		index.byVar[varName] = entry
		if typeID != "" {
			index.byTypeForm[typeFormKey(typeID, isFriendly)] = entry
		}
	}
}

// indexImport records one import statement: the source breadcrumb, the
// ts-runtypes DSL import, or a cross-file value import.
func (index *mirrorIndex) indexImport(text string, statement *ast.Node) {
	importDecl := statement.AsImportDeclaration()
	if importDecl == nil || importDecl.ModuleSpecifier == nil {
		return
	}
	specifier := importDecl.ModuleSpecifier.Text()
	tokenStart := scanner.GetTokenPosOfNode(statement, index.sourceFile, false)

	names, clauseStart, clauseEnd := importedNames(text, importDecl)
	entry := &importEntry{
		names:       names,
		specifier:   specifier,
		tokenStart:  tokenStart,
		end:         statement.End(),
		clauseStart: clauseStart,
		clauseEnd:   clauseEnd,
	}

	isTypeOnly := importDecl.ImportClause != nil && importDecl.ImportClause.AsImportClause() != nil &&
		importDecl.ImportClause.AsImportClause().PhaseModifier == ast.KindTypeKeyword
	switch {
	case specifier == "ts-runtypes" && isTypeOnly:
		index.dslImport = entry
	case isTypeOnly:
		// First `import type { … } from '<non-ts-runtypes>'` is the source breadcrumb.
		if index.breadcrumb == nil {
			index.breadcrumb = entry
		}
	default:
		// A value import — the cross-file friendly*/mock* references.
		index.valueImports = append(index.valueImports, entry)
	}
}

// importedNames returns the imported names of an import declaration (original
// name before any `as` alias) plus the byte range of the names list inside its
// `{ … }` named bindings — trimmed of surrounding trivia so a splice replaces
// EXACTLY `User, Post` (the surrounding `{ ` / ` }` stay byte-identical).
// clauseStart == 0 when there are no named bindings.
func importedNames(text string, importDecl *ast.ImportDeclaration) (names []string, clauseStart, clauseEnd int) {
	if importDecl.ImportClause == nil {
		return nil, 0, 0
	}
	clause := importDecl.ImportClause.AsImportClause()
	if clause == nil || clause.NamedBindings == nil {
		return nil, 0, 0
	}
	if !ast.IsNamedImports(clause.NamedBindings) {
		return nil, 0, 0
	}
	named := clause.NamedBindings.AsNamedImports()
	if named == nil || named.Elements == nil {
		return nil, 0, 0
	}
	for _, element := range named.Elements.Nodes {
		if element == nil || !ast.IsImportSpecifier(element) {
			continue
		}
		specifier := element.AsImportSpecifier()
		name := ""
		if specifier.PropertyName != nil {
			name = specifier.PropertyName.Text()
		} else if elementName := element.Name(); elementName != nil {
			name = elementName.Text()
		}
		if name != "" {
			names = append(names, name)
		}
	}
	// Trim the elements' span of surrounding trivia so the clause range covers
	// EXACTLY the names text (`User, Post`), leaving the braces + their padding
	// byte-identical when a reconcile rewrites only the names.
	clauseStart, clauseEnd = trimRange(text, named.Elements.Pos(), named.Elements.End())
	return names, clauseStart, clauseEnd
}

// trimRange shrinks [start, end) over text to exclude leading + trailing ASCII
// whitespace, so the returned range covers only the meaningful content.
func trimRange(text string, start, end int) (int, int) {
	for start < end && isSpaceByte(text[start]) {
		start++
	}
	for end > start && isSpaceByte(text[end-1]) {
		end--
	}
	return start, end
}

func isSpaceByte(b byte) bool {
	return b == ' ' || b == '\t' || b == '\r' || b == '\n'
}

// markerBlockRange locates the `@rtType`-bearing `/* … */` block in the
// const's leading-trivia span [fullStart, tokenStart) and returns its absolute
// byte range, EXTENDED to include a single trailing newline so a replace swaps
// the whole marker line cleanly. Returns (0,0) when no such block exists.
func markerBlockRange(text string, fullStart, tokenStart int) (int, int) {
	region := text[fullStart:tokenStart]
	open := strings.Index(region, "/*")
	for open >= 0 {
		close := strings.Index(region[open:], "*/")
		if close < 0 {
			break
		}
		blockEnd := open + close + 2 // past the closing `*/`
		block := region[open:blockEnd]
		if strings.Contains(block, "@rtType") {
			start := fullStart + open
			end := fullStart + blockEnd
			// Swallow a single trailing newline so the marker line is fully replaced.
			if end < len(text) && text[end] == '\n' {
				end++
			}
			return start, end
		}
		next := strings.Index(region[blockEnd:], "/*")
		if next < 0 {
			break
		}
		open = blockEnd + next
	}
	return 0, 0
}

// parseConstMarkers extracts the @rtType id and the @rtIds child-id map from a
// const's leading comment block. Returns ("", nil) when no markers are present.
func parseConstMarkers(comment string) (typeID string, childIDs map[string]string) {
	if match := rtTypePattern.FindStringSubmatch(comment); match != nil {
		typeID = match[2]
	}
	if match := rtIdsPattern.FindStringSubmatch(comment); match != nil {
		childIDs = map[string]string{}
		for _, entry := range rtIdsEntryPattern.FindAllStringSubmatch(match[1], -1) {
			field := entry[1]
			id := entry[3]
			if field != "" && id != "" {
				childIDs[field] = id
			}
		}
		if len(childIDs) == 0 {
			childIDs = nil
		}
	}
	return typeID, childIDs
}

// isFriendlyVar / isMockVar report whether a const identifier is one of our
// emitted enrichment vars (friendly<Name> / mock<Name> with a CamelCase suffix).
func isFriendlyVar(name string) bool {
	return hasCamelSuffix(name, "friendly")
}

func isMockVar(name string) bool {
	return hasCamelSuffix(name, "mock")
}

// hasCamelSuffix reports whether name is prefix + a CamelCase suffix (first
// suffix rune upper-case), e.g. "friendlyUser" but not "friendly" or "friendlyx".
func hasCamelSuffix(name, prefix string) bool {
	if !strings.HasPrefix(name, prefix) || len(name) <= len(prefix) {
		return false
	}
	next := name[len(prefix)]
	return next >= 'A' && next <= 'Z'
}
