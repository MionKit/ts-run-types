package mirror

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-runtypes/internal/enrich"
)

// TranslationConsts builds the DESIRED const set for one target locale from a
// parsed friendly SOURCE MIRROR: one NamedConst per source friendly const,
// carrying the SAME @rtType/@rtIds ids (so a source rename carries across
// locales) plus the @rtI18n breadcrumb, its body BLANKED:
//
//   - every `$label` and string template → `”` (a @todo blank — NEVER the
//     source text copied as if translated);
//   - every plural object under `$errors` → a blank object reseeded with the
//     TARGET locale's CLDR arms (the source's arm set is irrelevant — arms are
//     locale-owned);
//   - function-form `$errors` → copied VERBATIM (opaque escape hatch; keeps
//     the const type-checking);
//   - a `friendly<Name>` const reference → its translation sibling
//     (`<locale>_friendly<Name>`), so cross-const links stay locale-internal;
//   - `__rt_typeName` and any non-template value → verbatim.
//
// sourceMirrorSpec is the module specifier of the source mirror relative to
// the TRANSLATION file (the @rtI18n clause); declFile anchors each const's
// breadcrumb grouping (the .ts source the type names import from).
func (index *Index) TranslationConsts(locale string, targetArms []string, sourceMirrorSpec, declFile string) []enrich.NamedConst {
	var consts []enrich.NamedConst
	for _, entry := range index.consts {
		if !entry.isFriendly || isTranslationVar(entry.varName) {
			continue // mock consts and already-translated consts are never sources
		}
		if entry.body == nil {
			continue // no object-literal body — nothing translatable
		}
		blanker := &translationBlanker{text: string(index.raw), locale: locale, arms: targetArms}
		consts = append(consts, enrich.NamedConst{
			TypeName:       entry.typeName,
			DeclFile:       declFile,
			FriendlyVar:    TranslationVarName(locale, entry.varName),
			Friendly:       blanker.blankNode(entry.body, 0),
			TypeID:         entry.typeID,
			ChildIDs:       entry.childIDs,
			I18nLocale:     locale,
			I18nSourceSpec: sourceMirrorSpec,
		})
	}
	return consts
}

// translationBlanker renders a friendly const body with every translatable
// leaf blanked. Layout mirrors the scaffold emitter: an object with data
// fields goes multi-line, a meta-only leaf stays single-line.
type translationBlanker struct {
	text   string
	locale string
	arms   []string
}

// blankNode renders one friendly NODE ($label/$errors meta + children).
func (blanker *translationBlanker) blankNode(node *ast.Node, depth int) string {
	if node == nil {
		return "{}"
	}
	if !ast.IsObjectLiteralExpression(node) {
		return blanker.blankFieldValue(node, depth)
	}
	properties := objectProperties(node)
	multiline := hasDataField(properties)

	var parts []string
	for _, property := range properties {
		key, value := propertyKeyValue(property)
		if value == nil {
			parts = append(parts, blanker.verbatim(property))
			continue
		}
		var rendered string
		switch {
		case key == "$label":
			rendered = "''"
		case key == "$errors":
			rendered = blanker.blankErrors(value)
		case key == "__rt_typeName":
			rendered = blanker.verbatim(value)
		case key == "$slots":
			rendered = blanker.blankSlots(value, depth+1)
		case strings.HasPrefix(key, "$"): // $items / $keys / $values — nested nodes
			rendered = blanker.blankNode(value, depth+1)
		default:
			rendered = blanker.blankFieldValue(value, depth+1)
		}
		parts = append(parts, renderKey(key)+": "+rendered)
	}

	if !multiline {
		return "{" + strings.Join(parts, ", ") + "}"
	}
	inner := strings.Repeat("  ", depth+1)
	var b strings.Builder
	b.WriteString("{\n")
	for _, part := range parts {
		b.WriteString(inner)
		b.WriteString(part)
		b.WriteString(",\n")
	}
	b.WriteString(strings.Repeat("  ", depth))
	b.WriteString("}")
	return b.String()
}

// blankFieldValue renders a data field's value: a nested node recurses, a
// `friendly<Name>` reference renames to its translation sibling, anything else
// is kept verbatim.
func (blanker *translationBlanker) blankFieldValue(value *ast.Node, depth int) string {
	if ast.IsObjectLiteralExpression(value) {
		return blanker.blankNode(value, depth)
	}
	if value.Kind == ast.KindIdentifier {
		name := value.Text()
		if isFriendlyVar(name) && !isTranslationVar(name) {
			return TranslationVarName(blanker.locale, name)
		}
	}
	return blanker.verbatim(value)
}

// blankErrors renders an `$errors` value: the record form blanks each template
// (string → ”, plural object → the TARGET locale's blank arms); any other
// form (the function-form arrow) is copied verbatim.
func (blanker *translationBlanker) blankErrors(value *ast.Node) string {
	if !ast.IsObjectLiteralExpression(value) {
		return blanker.verbatim(value) // function-form — opaque, carried as-is
	}
	var parts []string
	for _, property := range objectProperties(value) {
		key, templateValue := propertyKeyValue(property)
		if templateValue == nil {
			parts = append(parts, blanker.verbatim(property))
			continue
		}
		if ast.IsObjectLiteralExpression(templateValue) {
			parts = append(parts, renderKey(key)+": "+blanker.blankPlural())
			continue
		}
		parts = append(parts, renderKey(key)+": ''")
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

// blankPlural renders a blank plural object seeded with the TARGET locale's
// CLDR arms — the source's arms never survive into a translation scaffold.
func (blanker *translationBlanker) blankPlural() string {
	var b strings.Builder
	b.WriteString("{")
	for i, arm := range blanker.arms {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(arm)
		b.WriteString(": ''")
	}
	b.WriteString("}")
	return b.String()
}

// blankSlots renders a tuple's `$slots` array with each slot node blanked.
func (blanker *translationBlanker) blankSlots(value *ast.Node, depth int) string {
	elements := arrayElementNodes(value)
	if elements == nil {
		return blanker.verbatim(value)
	}
	parts := make([]string, 0, len(elements))
	for _, element := range elements {
		if element == nil {
			continue
		}
		if ast.IsObjectLiteralExpression(element) {
			parts = append(parts, blanker.blankNode(element, depth))
		} else {
			parts = append(parts, blanker.verbatim(element))
		}
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// verbatim slices a node's own text (leading trivia trimmed).
func (blanker *translationBlanker) verbatim(node *ast.Node) string {
	return strings.TrimSpace(blanker.text[node.Pos():node.End()])
}

// objectProperties returns an object literal's property-assignment nodes.
func objectProperties(node *ast.Node) []*ast.Node {
	var out []*ast.Node
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if property != nil {
			out = append(out, property)
		}
	}
	return out
}

// propertyKeyValue returns a property assignment's key text + initializer;
// value is nil for anything that is not a plain `key: value` assignment
// (spread, shorthand, method) — the caller copies those verbatim.
func propertyKeyValue(property *ast.Node) (string, *ast.Node) {
	if !ast.IsPropertyAssignment(property) {
		return "", nil
	}
	assignment := property.AsPropertyAssignment()
	nameNode := property.Name()
	if nameNode == nil || assignment.Initializer == nil {
		return "", nil
	}
	return nameNode.Text(), assignment.Initializer
}

// hasDataField reports whether any property is a data field (not `$`-meta and
// not the `__rt_typeName` display meta) — the multi-line layout trigger.
func hasDataField(properties []*ast.Node) bool {
	for _, property := range properties {
		key, value := propertyKeyValue(property)
		if value == nil {
			continue
		}
		if !strings.HasPrefix(key, "$") && key != "__rt_typeName" {
			return true
		}
	}
	return false
}
