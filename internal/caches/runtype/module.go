// Package runtype is the runType cache generator: it serializes resolved
// tsgo types into protocol.RunType records and renders the runtime
// `runTypesCache.ts` module that consumers import.
package runtype

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// RunTypesModule writes the runtime artifact: the hand-authored
// skeleton at packages/ts-go-run-types/src/caches/runTypesCache.ts with
// the marker comment replaced by:
//
//   - one `rt(id, …);` factory call per cached RunType, which
//     materialises an entry in the module-local `cache` table; and
//   - direct ref-assignment statements `cache['id'].child = cache['id2'];`
//     mirroring the previous emitter's footer block — only the accessor
//     changed (cache['id'] vs the legacy `t_<id>` const).
//
// Footer-only literals (bigint, symbol, regexp) and built-in classType
// references continue to land in the second pass exactly as before, so
// downstream consumers see equivalent runtime objects.
func RunTypesModule(writer io.Writer, dump protocol.Dump) error {
	var body strings.Builder
	body.WriteString("const u = undefined;\n")

	// Pass 1: one rt(…) call per entry. Mirrors the previous emitter's
	// `export const t_<hash> = RT(…)` line, modulo the entry storage.
	for _, runType := range dump.RunTypes {
		if runType == nil {
			continue
		}
		args := renderFactoryArgs(runType)
		body.WriteString(fmt.Sprintf("rt(%s);\n", strings.Join(args, ",")))
	}

	// Pass 2: ref assignments. Same special-cases the legacy footer
	// handled — built-in class refs, bigint / symbol / regexp literals,
	// and every ref-bearing slot.
	body.WriteString("// --- knot refs and runtime values ---\n")
	for _, runType := range dump.RunTypes {
		if runType == nil {
			continue
		}
		writeFooter(&body, runType)
	}

	out, err := cachetpl.Splice(cachetpl.SkeletonRunTypes, body.String())
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, out)
	return err
}

// renderFactoryArgs builds the positional-arg slice for one `rt(…)` call,
// then trims trailing `u` entries so the call stays compact. The first two
// args (`id`, `kind`) are always present.
func renderFactoryArgs(runType *protocol.RunType) []string {
	args := []string{
		quoteJS(runType.ID),             // 0: id
		strconv.Itoa(int(runType.Kind)), // 1: kind
		subKindArg(runType.SubKind),     // 2: subKind
		stringArg(runType.TypeName),     // 3: typeName
		stringArg(runType.Name),         // 4: name
		literalArg(runType),             // 5: literal
		boolArg(runType.Optional),       // 6: optional
		boolArg(runType.Readonly),       // 7: readonly
		boolArg(runType.IsAbstract),     // 8: isAbstract
		boolArg(runType.IsStatic),       // 9: isStatic
		intPtrArg(runType.Visibility),   // 10: visibility
		boolArg(runType.IsSafeName),     // 11: isSafeName
		intPtrArg(runType.Position),     // 12: position
		boolArg(runType.Inlined),        // 13: inlined
		flagsArg(runType.Flags),         // 14: flags
		stringArg(runType.Description),  // 15: description
		jsonArg(runType.DefaultVal),     // 16: defaultVal
		enumArg(runType.EnumVal),        // 17: enumVal
		valuesArg(runType.Values),       // 18: values
	}
	return trimTrailingUndefined(args)
}

// subKindArg renders a SubKind value or `u` when zero. Zero is the
// "not applicable" sentinel — only nodes that need a SubKind get one.
func subKindArg(value protocol.ReflectionSubKind) string {
	if value == protocol.SubKindNone {
		return "u"
	}
	return strconv.Itoa(int(value))
}

// stringArg returns the JS source for a string field — `u` when empty,
// otherwise a single-quoted JS string literal (see quoteJS for rationale).
func stringArg(value string) string {
	if value == "" {
		return "u"
	}
	return quoteJS(value)
}

// boolArg returns `"!0"` (the 2-char form of `true`) when set, otherwise
// `"u"`. False is treated as "absent" to keep the call site compact; the
// own-key still exists on the cache entry because the skeleton's factory
// pre-declares it.
func boolArg(value bool) string {
	if value {
		return "!0"
	}
	return "u"
}

// intPtrArg renders a *int as its decimal integer or `u` when nil. The
// pointer indirection matters — `Position == 0` is a meaningful value and
// must round-trip as `"0"`, not `"u"`.
func intPtrArg(value *int) string {
	if value == nil {
		return "u"
	}
	return strconv.Itoa(*value)
}

// literalArg renders the `literal` slot. Footer-special literals (bigint,
// symbol, regexp) are emitted by writeFooter, so the factory arg stays `u`
// for those — the footer assignment then patches the literal in place.
func literalArg(runType *protocol.RunType) string {
	if runType.Literal == nil {
		return "u"
	}
	if isFooterLiteral(runType) {
		return "u"
	}
	return mustJSLiteral(runType.Literal)
}

// jsonArg returns `u` for nil, otherwise the JS-literal encoding of value.
func jsonArg(value any) string {
	if value == nil {
		return "u"
	}
	return mustJSLiteral(value)
}

// flagsArg renders a []string as a JS array literal or `u` when empty.
func flagsArg(flags []string) string {
	if len(flags) == 0 {
		return "u"
	}
	return mustJSLiteral(flags)
}

// enumArg renders an enum map or `u` when empty/nil.
func enumArg(enum map[string]any) string {
	if len(enum) == 0 {
		return "u"
	}
	return mustJSLiteral(enum)
}

// valuesArg renders a []any or `u` when empty.
func valuesArg(values []any) string {
	if len(values) == 0 {
		return "u"
	}
	return mustJSLiteral(values)
}

// trimTrailingUndefined drops trailing `"u"` entries from the arg slice so
// `rt(…)` calls stay compact. The first two slots (id, kind) are always
// emitted; the minimum slice length is therefore 2.
func trimTrailingUndefined(args []string) []string {
	end := len(args)
	for end > 2 && args[end-1] == "u" {
		end--
	}
	return args[:end]
}

// cacheRef turns a hash id into the function-call expression the
// generated code uses to look up a cached RunType, e.g. `c('Lrjx')`.
// `c` is a short alias for `jitUtils.useRunType` declared inside the
// skeleton's `initCache(jitUtils)` body — both the `rt(...)` factory
// and the footer ref-assignment lines close over it.
func cacheRef(id string) string {
	return "c(" + quoteJS(id) + ")"
}

// isFooterLiteral reports whether runType.Literal needs special construction
// in the footer (bigint / symbol / regexp) rather than inline JSON.
func isFooterLiteral(runType *protocol.RunType) bool {
	if runType.Literal == nil {
		return false
	}
	for _, flag := range runType.Flags {
		if flag == "bigint" || flag == "symbol" {
			return true
		}
	}
	if literalMap, ok := runType.Literal.(map[string]any); ok {
		if _, hasRegexp := literalMap["regexp"]; hasRegexp {
			return true
		}
	}
	return false
}

// writeFooter fills runType's reference-bearing fields and runtime-special
// values into the module-local `cache` table.
func writeFooter(buffer *strings.Builder, runType *protocol.RunType) {
	name := cacheRef(runType.ID)
	if runType.Child != nil {
		buffer.WriteString(fmt.Sprintf("%s.child = %s;\n", name, derefExpr(runType.Child)))
	}
	if runType.Index != nil {
		buffer.WriteString(fmt.Sprintf("%s.index = %s;\n", name, derefExpr(runType.Index)))
	}
	if runType.Return != nil {
		buffer.WriteString(fmt.Sprintf("%s.return = %s;\n", name, derefExpr(runType.Return)))
	}
	if runType.IndexT != nil {
		buffer.WriteString(fmt.Sprintf("%s.indexType = %s;\n", name, derefExpr(runType.IndexT)))
	}
	if len(runType.Parameters) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.parameters = [%s];\n", name, joinRefs(runType.Parameters)))
	}
	if len(runType.Children) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.children = [%s];\n", name, joinRefs(runType.Children)))
	}
	// safeUnionChildren — same ref objects as Children, reordered so
	// superset shapes precede their subset equivalents.
	if len(runType.SafeUnionChildren) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.safeUnionChildren = [%s];\n", name, joinRefs(runType.SafeUnionChildren)))
	}
	// unionDiscriminators — parallel to safeUnionChildren; entry i is a
	// ref to the discriminator property within safeUnionChildren[i].
	if len(runType.UnionDiscriminators) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.unionDiscriminators = [%s];\n", name, joinRefs(runType.UnionDiscriminators)))
	}
	// decorators — surviving object-literal types from a collapsed
	// `primitive & {brand}` intersection.
	if len(runType.Decorators) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.decorators = [%s];\n", name, joinRefs(runType.Decorators)))
	}
	if len(runType.TypeArguments) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.typeArguments = [%s];\n", name, joinRefs(runType.TypeArguments)))
	}
	if len(runType.Arguments) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.arguments = [%s];\n", name, joinRefs(runType.Arguments)))
	}
	if len(runType.ExtendsArguments) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.extendsArguments = [%s];\n", name, joinRefs(runType.ExtendsArguments)))
	}
	if len(runType.Implements) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.implements = [%s];\n", name, joinRefs(runType.Implements)))
	}
	if len(runType.Extends) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.extends = [%s];\n", name, joinRefs(runType.Extends)))
	}

	// classType — built-in constructors looked up on globalThis so the
	// generated module needs zero runtime imports.
	if runType.ClassRef != nil && runType.ClassRef.Builtin != "" {
		buffer.WriteString(fmt.Sprintf("%s.classType = globalThis.%s;\n", name, runType.ClassRef.Builtin))
	}

	// Footer-only literals.
	if isFooterLiteral(runType) {
		buffer.WriteString(fmt.Sprintf("%s.literal = %s;\n", name, footerLiteralExpr(runType)))
	}
}

// footerLiteralExpr renders a runtime-special literal as a JS expression.
func footerLiteralExpr(runType *protocol.RunType) string {
	for _, flag := range runType.Flags {
		if flag == "bigint" {
			literalString, _ := runType.Literal.(string)
			return "BigInt(" + quoteJS(literalString) + ")"
		}
		if flag == "symbol" {
			if literalMap, ok := runType.Literal.(map[string]any); ok {
				if name, ok := literalMap["symbol"].(string); ok {
					return "Symbol(" + quoteJS(name) + ")"
				}
			}
			return "Symbol()"
		}
	}
	if literalMap, ok := runType.Literal.(map[string]any); ok {
		if regexpRaw, ok := literalMap["regexp"].(map[string]any); ok {
			source, _ := regexpRaw["source"].(string)
			flags, _ := regexpRaw["flags"].(string)
			return fmt.Sprintf("/%s/%s", source, flags)
		}
	}
	return mustJSLiteral(runType.Literal)
}

// derefExpr renders a single child slot. Refs become bare cache lookups;
// inline (non-ref) Types are round-tripped through JSON to land in the
// any-tree shape that mustJSLiteral understands.
func derefExpr(runType *protocol.RunType) string {
	if runType == nil {
		return "undefined"
	}
	if runType.Kind == protocol.KindRef {
		return cacheRef(runType.ID)
	}
	encoded, err := json.Marshal(runType)
	if err != nil {
		return fmt.Sprintf("/* json err: %v */ undefined", err)
	}
	var generic any
	if err := json.Unmarshal(encoded, &generic); err != nil {
		return fmt.Sprintf("/* json err: %v */ undefined", err)
	}
	return mustJSLiteral(generic)
}

func joinRefs(runTypes []*protocol.RunType) string {
	parts := make([]string, len(runTypes))
	for i, runType := range runTypes {
		parts[i] = derefExpr(runType)
	}
	return strings.Join(parts, ", ")
}

// quoteJS renders a Go string as a JS source-level **single-quoted** string
// literal. See the original docstring on the legacy emitter for the
// wire-size rationale (resolver protocol JSON-encodes the body, so every
// `"` costs an extra byte).
func quoteJS(value string) string {
	quoted := strconv.Quote(value)
	inner := quoted[1 : len(quoted)-1]
	inner = strings.ReplaceAll(inner, `\"`, `"`)
	inner = strings.ReplaceAll(inner, `'`, `\'`)
	return "'" + inner + "'"
}

// mustJSLiteral renders an arbitrary value as a JS source-level literal.
// Same wire-efficiency motivation as `quoteJS`.
func mustJSLiteral(value any) string {
	var builder strings.Builder
	writeJSLiteral(&builder, value)
	return builder.String()
}

func writeJSLiteral(builder *strings.Builder, value any) {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		if typed {
			builder.WriteString("!0")
		} else {
			builder.WriteString("!1")
		}
	case string:
		builder.WriteString(quoteJS(typed))
	case []any:
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			writeJSLiteral(builder, item)
		}
		builder.WriteByte(']')
	case []string:
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(quoteJS(item))
		}
		builder.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		builder.WriteByte('{')
		for i, key := range keys {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(quoteJS(key))
			builder.WriteByte(':')
			writeJSLiteral(builder, typed[key])
		}
		builder.WriteByte('}')
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			fmt.Fprintf(builder, "/* json err: %v */ undefined", err)
			return
		}
		builder.Write(encoded)
	}
}
