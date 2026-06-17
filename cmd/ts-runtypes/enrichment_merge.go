package main

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// objectView is a parsed object-literal over some source text, giving the merge
// per-property access by key. text is the FULL source the node was parsed from
// (the existing file bytes, or the synthetic `const _ = <body>;` for a desired
// skeleton); byte offsets index into it.
type objectView struct {
	text       string
	node       *ast.Node // ObjectLiteralExpression
	sourceFile *ast.SourceFile
	props      map[string]*propView // field + meta properties by key
	order      []string             // property keys in declaration order
}

// propView is one property assignment inside an object literal.
type propView struct {
	key string
	// keyStart / keyEnd bound the key IDENTIFIER (trivia-trimmed), so a rename
	// splice replaces only the key and leaves the value bytes untouched.
	keyStart int
	keyEnd   int
	// propStart / propEnd bound the WHOLE property (trivia-trimmed key start →
	// initializer end), used to comment out a dropped field or slice an added
	// field's text.
	propStart int
	propEnd   int
	value     *ast.Node // the initializer expression
}

// isObject reports whether this property's value is itself an object literal
// (the merge recurses into it) rather than a leaf.
func (prop *propView) isObject() bool {
	return prop.value != nil && ast.IsObjectLiteralExpression(prop.value)
}

// newObjectView wraps an ObjectLiteralExpression node parsed from text. The
// caller supplies the sourceFile for trivia-trimmed key starts.
func newObjectView(text string, sourceFile *ast.SourceFile, node *ast.Node) *objectView {
	view := &objectView{text: text, node: node, sourceFile: sourceFile, props: map[string]*propView{}}
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return view
	}
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if property == nil || !ast.IsPropertyAssignment(property) {
			continue
		}
		assignment := property.AsPropertyAssignment()
		nameNode := property.Name()
		if nameNode == nil || assignment.Initializer == nil {
			continue
		}
		key := nameNode.Text()
		keyStart := scanner.GetTokenPosOfNode(nameNode, sourceFile, false)
		propStart := scanner.GetTokenPosOfNode(property, sourceFile, false)
		prop := &propView{
			key:       key,
			keyStart:  keyStart,
			keyEnd:    nameNode.End(),
			propStart: propStart,
			propEnd:   property.End(),
			value:     assignment.Initializer,
		}
		if _, seen := view.props[key]; !seen {
			view.order = append(view.order, key)
		}
		view.props[key] = prop
	}
	return view
}

// fieldKeys returns the DATA-field keys (non-meta) of an object view, in
// declaration order. Meta keys ($label, $errors, pool, …) belong to the node
// itself and are never merged as fields.
func (view *objectView) fieldKeys(metaKeys map[string]bool) []string {
	out := make([]string, 0, len(view.order))
	for _, key := range view.order {
		if metaKeys[key] || strings.HasPrefix(key, "$") {
			continue // a $-prefixed key is always meta, never a data field
		}
		out = append(out, key)
	}
	return out
}

// parseDesiredObject parses an emitted skeleton BODY (an object-literal text,
// no `export const … =` wrapper) into an objectView by wrapping it as
// `const _ = <body>;`. Returns nil when the body is not an object literal.
func parseDesiredObject(body string) *objectView {
	wrapped := "const _ = " + body + ";\n"
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: "/desired.ts", Path: tspath.Path("/desired.ts")},
		wrapped,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		return nil
	}
	node := desiredInitializer(sourceFile)
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return nil
	}
	return newObjectView(wrapped, sourceFile, node)
}

// desiredInitializer returns the initializer of the synthetic `const _ = …`.
func desiredInitializer(sourceFile *ast.SourceFile) *ast.Node {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range variableDeclarations(statement) {
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			if initializer := declaration.AsVariableDeclaration().Initializer; initializer != nil {
				return initializer
			}
		}
	}
	return nil
}

// mergeObject merges one desired object view INTO one existing object view,
// appending splice ops against the existing file bytes. It is recursive: a
// field present in both AS OBJECTS recurses; a field present in both as leaves
// is left byte-identical (the author's value survives); a desired-only field is
// ADDED (inserted skeleton); an existing-only field is ORPHANED (commented out
// with @rtOrphanChild). The rename pass (M6) runs first over the raw drop/add
// sets via mergeRename, pairing renamed fields before they fall through here.
//
// metaKeys is the family's reserved-key set (friendly vs mock); renamePairs maps
// an existing-only key → the desired-only key it was renamed to (a key-only
// splice), populated by the rename pass.
func mergeObject(ops *[]spliceOp, existing, desired *objectView, metaKeys map[string]bool, renamePairs map[string]string) {
	existingFields := keySet(existing.fieldKeys(metaKeys))
	desiredFields := keySet(desired.fieldKeys(metaKeys))

	// Apply renames first: an existing key renamed to a desired key gets a
	// key-only splice (value bytes untouched), and both keys drop out of the
	// drop/add sets below.
	renamedExisting := map[string]bool{}
	renamedDesired := map[string]bool{}
	for oldKey, newKey := range renamePairs {
		oldProp := existing.props[oldKey]
		if oldProp == nil {
			continue
		}
		*ops = append(*ops, spliceOp{start: oldProp.keyStart, end: oldProp.keyEnd, text: renderKey(newKey)})
		renamedExisting[oldKey] = true
		renamedDesired[newKey] = true
	}

	// KEEP / RECURSE for fields present in both (excluding renamed pairs, handled
	// above as a key swap with no recursion — a rename preserves the old value).
	for key := range existingFields {
		if renamedExisting[key] {
			continue
		}
		if !desiredFields[key] {
			continue
		}
		existingProp := existing.props[key]
		desiredProp := desired.props[key]
		if existingProp == nil || desiredProp == nil {
			continue
		}
		if existingProp.isObject() && desiredProp.isObject() {
			childExisting := newObjectView(existing.text, existing.sourceFile, existingProp.value)
			childDesired := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
			// Nested rename pairs are computed by the recursive driver
			// (reconcileConst); for the merge of a NESTED object we recompute them.
			childRenames := computeRenames(childExisting, childDesired, metaKeys, nil)
			mergeObject(ops, childExisting, childDesired, metaKeys, childRenames)
		}
		// Leaf-in-both: leave the existing bytes untouched (no splice).
	}

	// ADD: a desired-only field, inserted as a fresh skeleton property at the end
	// of the existing object (before its closing brace).
	var addKeys []string
	for key := range desiredFields {
		if existingFields[key] || renamedDesired[key] {
			continue
		}
		addKeys = append(addKeys, key)
	}
	sort.Strings(addKeys)
	if len(addKeys) > 0 {
		*ops = append(*ops, insertFieldsOp(existing, desired, addKeys))
	}

	// DROP: an existing-only field, commented out in place with @rtOrphanChild.
	var dropKeys []string
	for key := range existingFields {
		if desiredFields[key] || renamedExisting[key] {
			continue
		}
		dropKeys = append(dropKeys, key)
	}
	sort.Strings(dropKeys)
	for _, key := range dropKeys {
		*ops = append(*ops, orphanChildOp(existing, existing.props[key]))
	}
}

// insertFieldsOp builds one insertion op that appends every added field's fresh
// desired skeleton at the end of the existing object literal (just before the
// closing `}`). Indentation matches the existing object's first property; a
// trailing comma keeps the literal valid.
func insertFieldsOp(existing, desired *objectView, addKeys []string) spliceOp {
	indent := existingIndent(existing)
	anchor := insertionAnchor(existing)

	var b strings.Builder
	for _, key := range addKeys {
		desiredProp := desired.props[key]
		if desiredProp == nil {
			continue
		}
		valueText := strings.TrimSpace(desired.text[desiredProp.value.Pos():desiredProp.value.End()])
		b.WriteString("\n")
		b.WriteString(indent)
		b.WriteString(renderKey(key))
		b.WriteString(": ")
		b.WriteString(valueText)
		b.WriteString(",")
	}
	return spliceOp{start: anchor, end: anchor, text: b.String()}
}

// orphanChildOp comments out a dropped property in place, tagging it
// @rtOrphanChild and preserving its authored value (with its trailing comma)
// verbatim inside the block comment — so --prune can later remove it, or a
// reappearing field can restore it. The replace range SWALLOWS the property's
// trailing comma so no dangling `,` is left behind (which would be a syntax
// error); the comment then sits cleanly between the surviving siblings'
// separators.
func orphanChildOp(existing *objectView, prop *propView) spliceOp {
	if prop == nil {
		return spliceOp{}
	}
	end := prop.propEnd
	// Swallow a single trailing comma immediately after the property.
	for cursor := end; cursor < len(existing.text); cursor++ {
		if existing.text[cursor] == ',' {
			end = cursor + 1
			break
		}
		if !isSpaceByte(existing.text[cursor]) {
			break
		}
	}
	original := existing.text[prop.propStart:end]
	replacement := "/* @rtOrphanChild " + sanitizeForComment(original) + " */"
	return spliceOp{start: prop.propStart, end: end, text: replacement}
}

// existingIndent returns the leading-whitespace indent of the existing object's
// first property (so an inserted field lines up). Defaults to two spaces deeper
// than the object's own line when the object is empty.
func existingIndent(existing *objectView) string {
	if len(existing.order) > 0 {
		first := existing.props[existing.order[0]]
		if first != nil {
			return lineIndentAt(existing.text, first.propStart)
		}
	}
	// Empty object: indent two spaces past the `{`'s line indent.
	return lineIndentAt(existing.text, existing.node.Pos()) + "  "
}

// insertionAnchor returns the byte offset just AFTER the last property (and its
// trailing comma, if any) of the existing object — i.e. before the closing `}`.
// For an empty object it is just inside the braces.
func insertionAnchor(existing *objectView) int {
	if len(existing.order) == 0 {
		// Just after the `{`.
		return existing.node.Pos() + indexOfByte(existing.text[existing.node.Pos():existing.node.End()], '{') + 1
	}
	last := existing.props[existing.order[len(existing.order)-1]]
	anchor := last.propEnd
	// Swallow a trailing comma so the inserted block's own leading comma logic
	// (we use a trailing comma per field) stays valid.
	for anchor < len(existing.text) && existing.text[anchor] == ',' {
		anchor++
		break
	}
	return anchor
}

// renderKey renders a property key: a bare identifier when safe, else quoted.
func renderKey(key string) string {
	if isSafeIdentifier(key) {
		return key
	}
	return "'" + strings.ReplaceAll(key, "'", "\\'") + "'"
}

// isSafeIdentifier reports whether key is a dot-access-safe JS identifier
// (matches the emitter's IsSafeName convention closely enough for keys we emit).
func isSafeIdentifier(key string) bool {
	if key == "" {
		return false
	}
	for i := 0; i < len(key); i++ {
		c := key[i]
		isLetter := c == '_' || c == '$' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
		isDigit := c >= '0' && c <= '9'
		if i == 0 && !isLetter {
			return false
		}
		if i > 0 && !isLetter && !isDigit {
			return false
		}
	}
	return true
}

// keySet collects a slice into a presence set.
func keySet(keys []string) map[string]bool {
	out := make(map[string]bool, len(keys))
	for _, key := range keys {
		out[key] = true
	}
	return out
}

// lineIndentAt returns the leading whitespace of the line containing offset.
func lineIndentAt(text string, offset int) string {
	lineStart := offset
	for lineStart > 0 && text[lineStart-1] != '\n' {
		lineStart--
	}
	indent := lineStart
	for indent < len(text) && (text[indent] == ' ' || text[indent] == '\t') {
		indent++
	}
	return text[lineStart:indent]
}

// indexOfByte returns the index of the first b in s, or -1.
func indexOfByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

// sanitizeForComment makes original safe inside a `/* … */` block comment by
// neutralizing any nested `*/` terminator. Newlines are preserved so the
// orphaned value stays readable.
func sanitizeForComment(original string) string {
	return strings.ReplaceAll(original, "*/", "* /")
}

// computeRenames pairs an existing-only DROP with a desired-only ADD that share
// a unique child identity (the rename pass). Implemented in milestone M6; for M5
// it pairs nothing (every drop/add falls through to orphan-child / insert).
//
// existing/desired are the two object views at one level; metaKeys the family
// reserved set; childIDs the @rtIds map for THIS const (Tier-2 identity), or nil.
func computeRenames(existing, desired *objectView, metaKeys map[string]bool, childIDs map[string]string) map[string]string {
	_ = existing
	_ = desired
	_ = metaKeys
	_ = childIDs
	return nil
}
