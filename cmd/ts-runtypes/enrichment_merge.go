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

// mergeCtx threads the reconcile's per-merge state through the recursive walk:
// the family reserved-key set, the current dotted PATH PREFIX (for @rtIds
// lookups in nested objects), and the existing + desired @rtIds child-id maps
// (Tier-2 rename identity). The two child-id maps are the const's full @rtIds
// (existing-side parsed from the marker, desired-side from named.ChildIDs),
// keyed by full dotted path.
type mergeCtx struct {
	metaKeys      map[string]bool
	pathPrefix    string
	existingChild map[string]string
	desiredChild  map[string]string
}

// childPath joins the ctx prefix with a field key (root prefix is "").
func (ctx mergeCtx) childPath(key string) string {
	if ctx.pathPrefix == "" {
		return key
	}
	return ctx.pathPrefix + "." + key
}

// descend returns a child ctx for a nested object field, extending the path.
func (ctx mergeCtx) descend(key string) mergeCtx {
	child := ctx
	child.pathPrefix = ctx.childPath(key)
	return child
}

// mergeObject merges one desired object view INTO one existing object view,
// appending splice ops against the existing file bytes. It is recursive: the
// rename pass runs FIRST over the raw drop/add sets (pairing a uniquely-matched
// drop↔add by child identity → a key-only splice that carries the old value);
// then a field present in both AS OBJECTS recurses, a field present in both as
// leaves is left byte-identical (the author's value survives), a desired-only
// field is ADDED (inserted skeleton), and an existing-only field is ORPHANED
// (commented out with @rtOrphanChild).
func mergeObject(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	existingFields := keySet(existing.fieldKeys(ctx.metaKeys))
	desiredFields := keySet(desired.fieldKeys(ctx.metaKeys))

	// RENAME pass: pair an existing-only DROP with a desired-only ADD that share a
	// unique child identity. A matched pair becomes a key-only splice (old value
	// bytes untouched) and both keys leave the drop/add sets.
	renamePairs := computeRenames(existing, desired, existingFields, desiredFields, ctx)
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
			mergeObject(ops, childExisting, childDesired, ctx.descend(key))
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
	// Separator guard: each added field carries a TRAILING comma, so it relies on
	// the previous property already ending in one. A Prettier-collapsed single-line
	// object (`{$label: '', name: {…}}`) drops the trailing comma on its last
	// property, so scan back over whitespace to the previous non-space byte — if it
	// is neither `,` (already separated) nor `{` (the object is empty, no separator
	// needed), prepend a leading comma so the inserted block stays valid.
	if needsLeadingSeparator(existing.text, anchor) {
		b.WriteString(",")
	}
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

// needsLeadingSeparator reports whether an insertion at anchor must be prefixed
// with a separator comma: it scans backwards over whitespace from anchor to the
// previous non-space byte. A `,` means the last property is already comma-
// terminated (no separator needed); a `{` means the object is empty (no separator
// needed); anything else (e.g. a `}` ending the last property's value, or a
// string-literal quote) means the last property has NO trailing comma, so the
// inserted block must lead with one to stay valid.
func needsLeadingSeparator(text string, anchor int) bool {
	cursor := anchor - 1
	for cursor >= 0 && isSpaceByte(text[cursor]) {
		cursor--
	}
	if cursor < 0 {
		return false // nothing before the anchor — degenerate, no separator
	}
	prev := text[cursor]
	return prev != ',' && prev != '{'
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

// unsanitizeFromComment reverses sanitizeForComment, restoring `* /` to `*/`
// when an @rtOrphan / @rtOrphanChild carcass is restored, so the recovered text
// is byte-identical to the pre-orphan original.
func unsanitizeFromComment(sanitized string) string {
	return strings.ReplaceAll(sanitized, "* /", "*/")
}

// computeRenames pairs an existing-only DROP field with a desired-only ADD field
// that share a UNIQUE child identity, returning oldKey → newKey for each match.
// Child identity is two-tier:
//
//   - Tier 1 — the field's VALUE is a `friendly*/mock*` const reference
//     (named-type field): identity is that reference name. No marker needed.
//   - Tier 2 — otherwise (primitive / inline field): identity is the field's
//     @rtIds child id (existing-side from the existing const's parsed @rtIds,
//     desired-side from the desired const's ChildIDs), keyed by full dotted path.
//
// A pairing is made only when an identity maps to EXACTLY ONE drop and EXACTLY
// ONE add (unique match). An identity shared by >1 drop or >1 add is ambiguous —
// no rename; those fields fall through to orphan-child / insert.
func computeRenames(existing, desired *objectView, existingFields, desiredFields map[string]bool, ctx mergeCtx) map[string]string {
	drops := dropOnlyKeys(existingFields, desiredFields)
	adds := dropOnlyKeys(desiredFields, existingFields)
	if len(drops) == 0 || len(adds) == 0 {
		return nil
	}

	// Bucket drops + adds by identity; only singleton↔singleton buckets pair.
	dropByIdentity := map[string][]string{}
	for _, key := range drops {
		identity := fieldIdentity(existing, existing.props[key], ctx.childPath(key), ctx.existingChild)
		if identity != "" {
			dropByIdentity[identity] = append(dropByIdentity[identity], key)
		}
	}
	addByIdentity := map[string][]string{}
	for _, key := range adds {
		identity := fieldIdentity(desired, desired.props[key], ctx.childPath(key), ctx.desiredChild)
		if identity != "" {
			addByIdentity[identity] = append(addByIdentity[identity], key)
		}
	}

	var renames map[string]string
	for identity, dropKeys := range dropByIdentity {
		addKeys := addByIdentity[identity]
		if len(dropKeys) != 1 || len(addKeys) != 1 {
			continue // ambiguous (shared by >1 drop or >1 add) — no rename
		}
		if renames == nil {
			renames = map[string]string{}
		}
		renames[dropKeys[0]] = addKeys[0]
	}
	return renames
}

// fieldIdentity computes a field's rename identity: Tier 1 (the field value's
// `friendly*/mock*` reference name) when the value is such a bare identifier,
// else Tier 2 (the @rtIds child id at fullPath). Returns "" when neither is
// available (the field cannot participate in a rename).
func fieldIdentity(view *objectView, prop *propView, fullPath string, childIDs map[string]string) string {
	if prop != nil && prop.value != nil && prop.value.Kind == ast.KindIdentifier {
		name := prop.value.Text()
		if isFriendlyVar(name) || isMockVar(name) {
			return "ref:" + name // Tier 1
		}
	}
	if id, ok := childIDs[fullPath]; ok && id != "" {
		return "id:" + id // Tier 2
	}
	return ""
}

// dropOnlyKeys returns the keys present in `from` but not in `other`.
func dropOnlyKeys(from, other map[string]bool) []string {
	var out []string
	for key := range from {
		if !other[key] {
			out = append(out, key)
		}
	}
	return out
}
