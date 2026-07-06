package enrichment

import (
	"fmt"
	"sort"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// DescribeOptions configures a human-readable type description (prompt context
// for the `describe` command).
type DescribeOptions struct {
	// TypeName labels the root, e.g. "User".
	TypeName string
	// Resolve looks up a KindRef's canonical node; nil means inlined.
	Resolve func(id string) *protocol.RunType
}

// Describe renders rt as an indented, human-readable tree — the LLM prompt
// context that tells an agent what fields a type has, their kinds, optionality,
// and declared format constraints. One node per line; object members indent.
func Describe(rt *protocol.RunType, opts DescribeOptions) string {
	ctx := newWalkCtx(opts.Resolve)
	var b strings.Builder
	name := opts.TypeName
	if name == "" {
		name = "type"
	}
	b.WriteString(name)
	b.WriteString(": ")
	describeNode(&b, ctx, rt, 0)
	return b.String()
}

func describeNode(b *strings.Builder, ctx *walkCtx, rt *protocol.RunType, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth {
		b.WriteString("unknown\n")
		return
	}
	b.WriteString(typeExpr(ctx, rt))
	if suffix := formatSuffix(rt); suffix != "" {
		b.WriteString(" ")
		b.WriteString(suffix)
	}
	b.WriteString("\n")
	if !isObjectLike(ctx, rt) || ctx.seen[rt] {
		return
	}
	ctx.seen[rt] = true
	defer delete(ctx.seen, rt)
	inner := strings.Repeat("  ", depth+1)
	for _, prop := range propertyChildren(ctx, rt) {
		b.WriteString(inner)
		b.WriteString(prop.Name)
		if prop.Optional {
			b.WriteString("?")
		}
		b.WriteString(": ")
		describeNode(b, ctx, prop.Child, depth+1)
	}
}

// typeExpr renders a node's one-line type expression (no trailing newline, no
// object members — those are listed by describeNode).
func typeExpr(ctx *walkCtx, rt *protocol.RunType) string {
	rt = ctx.deref(rt)
	if rt == nil {
		return "unknown"
	}
	switch rt.Kind {
	case protocol.KindString:
		return "string"
	case protocol.KindNumber:
		return "number"
	case protocol.KindBoolean:
		return "boolean"
	case protocol.KindBigInt:
		return "bigint"
	case protocol.KindSymbol:
		return "symbol"
	case protocol.KindNull:
		return "null"
	case protocol.KindUndefined:
		return "undefined"
	case protocol.KindAny:
		return "any"
	case protocol.KindUnknown:
		return "unknown"
	case protocol.KindVoid:
		return "void"
	case protocol.KindNever:
		return "never"
	case protocol.KindObject:
		return "object"
	case protocol.KindLiteral:
		return fmt.Sprintf("%v", rt.Literal)
	case protocol.KindEnum:
		return "enum"
	case protocol.KindArray:
		return typeExpr(ctx, rt.Child) + "[]"
	case protocol.KindObjectLiteral, protocol.KindIntersection:
		return "object"
	case protocol.KindClass:
		return classExpr(rt)
	case protocol.KindUnion:
		return unionExpr(ctx, rt)
	case protocol.KindTuple:
		return tupleExpr(ctx, rt)
	default:
		return "object"
	}
}

func classExpr(rt *protocol.RunType) string {
	if rt.ClassRef != nil {
		if rt.ClassRef.Builtin != "" {
			return rt.ClassRef.Builtin
		}
		if rt.ClassRef.Name != "" {
			return rt.ClassRef.Name
		}
	}
	if rt.TypeName != "" {
		return rt.TypeName
	}
	return "object"
}

func unionExpr(ctx *walkCtx, rt *protocol.RunType) string {
	parts := make([]string, 0, len(rt.Children))
	for _, member := range rt.Children {
		parts = append(parts, typeExpr(ctx, member))
	}
	if len(parts) == 0 {
		return "union"
	}
	return strings.Join(parts, " | ")
}

func tupleExpr(ctx *walkCtx, rt *protocol.RunType) string {
	parts := make([]string, 0, len(rt.Children))
	for _, member := range rt.Children {
		slot := member
		if member != nil && member.Kind == protocol.KindTupleMember && member.Child != nil {
			slot = member.Child
		}
		parts = append(parts, typeExpr(ctx, slot))
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// formatSuffix renders a node's FormatAnnotation as `(name: k=v, …)`, sorted, or
// "" when the node carries no format.
func formatSuffix(rt *protocol.RunType) string {
	fa := rt.FormatAnnotation
	if fa == nil {
		return ""
	}
	if len(fa.Params) == 0 {
		return "(" + fa.Name + ")"
	}
	keys := make([]string, 0, len(fa.Params))
	for key := range fa.Params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%v", key, fa.Params[key]))
	}
	return "(" + fa.Name + ": " + strings.Join(parts, ", ") + ")"
}
