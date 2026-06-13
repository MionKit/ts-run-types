package enrichment

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// EmitOptions configures a `.rt.ts` skeleton emit.
type EmitOptions struct {
	// VarName is the exported const name, e.g. "userFriendly".
	VarName string
	// TypeName is the type the map is for, e.g. "User".
	TypeName string
	// Resolve looks up a KindRef sentinel's canonical node by id; nil means the
	// graph is fully inlined (no refs to follow).
	Resolve func(id string) *protocol.RunType
}

// EmitFriendly renders an `export const <VarName>: FriendlyType<<TypeName>> = {…};`
// skeleton for rt: one entry per data field, every node seeded with `$label: ”`,
// and `$errors` pre-keyed with `type` plus the field's declared format
// constraints (minLength / max / pattern / …). A starting scaffold for the
// author or agent to fill in.
func EmitFriendly(rt *protocol.RunType, opts EmitOptions) string {
	ctx := newWalkCtx(opts.Resolve)
	var b strings.Builder
	b.WriteString("export const ")
	b.WriteString(opts.VarName)
	b.WriteString(": FriendlyType<")
	b.WriteString(opts.TypeName)
	b.WriteString("> = ")
	emitFriendlyNode(&b, ctx, rt, 0)
	b.WriteString(";\n")
	return b.String()
}

// EmitMock renders an `export const <VarName>: MockData<<TypeName>> = {…};`
// skeleton: one entry per data field, leaves seeded with an empty `pool`, arrays
// with `$items` + `$length`. The author fills the pools with realistic values.
func EmitMock(rt *protocol.RunType, opts EmitOptions) string {
	ctx := newWalkCtx(opts.Resolve)
	var b strings.Builder
	b.WriteString("export const ")
	b.WriteString(opts.VarName)
	b.WriteString(": MockData<")
	b.WriteString(opts.TypeName)
	b.WriteString("> = ")
	emitMockNode(&b, ctx, rt, 0)
	b.WriteString(";\n")
	return b.String()
}

// FriendlySkeleton renders ONLY the FriendlyType object-literal skeleton for rt
// (no `export const … =` wrapper, no trailing `;`) — the value the batch/stdout
// `gen` mode returns so the test harness compares against a case's initializer.
func FriendlySkeleton(rt *protocol.RunType, resolve func(id string) *protocol.RunType) string {
	var b strings.Builder
	emitFriendlyNode(&b, newWalkCtx(resolve), rt, 0)
	return b.String()
}

// MockSkeleton renders ONLY the MockData object-literal skeleton for rt.
func MockSkeleton(rt *protocol.RunType, resolve func(id string) *protocol.RunType) string {
	var b strings.Builder
	emitMockNode(&b, newWalkCtx(resolve), rt, 0)
	return b.String()
}

func emitFriendlyNode(b *strings.Builder, ctx *walkCtx, rt *protocol.RunType, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		b.WriteString("{$label: ''}")
		return
	}
	// Structural composite kinds (solution A) — emitted BEFORE the object/leaf
	// arms (most-specific first). Map/Set are KindClass without property
	// children, so they must be caught here ahead of isObjectLike (false for
	// them anyway) and the leaf fallthrough.
	if rt.Kind == protocol.KindTuple {
		ctx.seen[rt] = true
		// A variadic tuple (`[A, ...B[]]`) has a broad `length`, so the Phase-A
		// type treats it as an ARRAY (`$items`); a fixed tuple gets `$slots`.
		if isVariadicTuple(ctx, rt) {
			b.WriteString("{$label: '', $items: {$label: ''}}")
		} else {
			b.WriteString("{$label: '', $slots: [")
			for i, slot := range tupleSlots(ctx, rt) {
				if i > 0 {
					b.WriteString(", ")
				}
				emitFriendlyNode(b, ctx, slot, depth+1)
			}
			b.WriteString("]}")
		}
		delete(ctx.seen, rt)
		return
	}
	if isMap(rt) {
		ctx.seen[rt] = true
		keyType, valueType := mapKeyValue(ctx, rt)
		b.WriteString("{$label: '', $keys: ")
		emitFriendlyNode(b, ctx, keyType, depth+1)
		b.WriteString(", $values: ")
		emitFriendlyNode(b, ctx, valueType, depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isSet(rt) {
		ctx.seen[rt] = true
		b.WriteString("{$label: '', $values: ")
		emitFriendlyNode(b, ctx, setElement(ctx, rt), depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isObjectLike(rt) {
		ctx.seen[rt] = true
		emitFriendlyObject(b, ctx, rt, depth)
		delete(ctx.seen, rt)
		return
	}
	if element := arrayElement(rt); element != nil {
		b.WriteString("{$label: '', $items: ")
		emitFriendlyNode(b, ctx, element, depth+1)
		b.WriteString("}")
		return
	}
	if rt.FormatAnnotation != nil {
		b.WriteString("{$label: '', $errors: {type: ''")
		for _, key := range formatConstraintKeys(rt.FormatAnnotation) {
			b.WriteString(", ")
			b.WriteString(key)
			b.WriteString(": ''")
		}
		b.WriteString("}}")
		return
	}
	b.WriteString("{$label: ''}")
}

func emitFriendlyObject(b *strings.Builder, ctx *walkCtx, rt *protocol.RunType, depth int) {
	props := propertyChildren(rt)
	if len(props) == 0 {
		b.WriteString("{$label: ''}")
		return
	}
	inner := strings.Repeat("  ", depth+1)
	b.WriteString("{\n")
	b.WriteString(inner)
	b.WriteString("$label: '',\n")
	for _, prop := range props {
		b.WriteString(inner)
		b.WriteString(propKey(prop))
		b.WriteString(": ")
		emitFriendlyNode(b, ctx, prop.Child, depth+1)
		b.WriteString(",\n")
	}
	b.WriteString(strings.Repeat("  ", depth))
	b.WriteString("}")
}

func emitMockNode(b *strings.Builder, ctx *walkCtx, rt *protocol.RunType, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		b.WriteString("{pool: []}")
		return
	}
	// Structural composite kinds (solution A) — emitted BEFORE the object/leaf
	// arms. Tuples get a fixed-length `$slots` (no `$length`); Map/Set get
	// `$keys`/`$values` (the optional `$size` is left for the author to add).
	if rt.Kind == protocol.KindTuple {
		ctx.seen[rt] = true
		// A variadic tuple (`[A, ...B[]]`) has a broad `length`, so the Phase-A
		// type treats it as an ARRAY (`$items`/`$length`); a fixed tuple gets
		// the fixed-length `$slots`.
		if isVariadicTuple(ctx, rt) {
			b.WriteString("{$items: {pool: []}, $length: [1, 3]}")
		} else {
			b.WriteString("{$slots: [")
			for i, slot := range tupleSlots(ctx, rt) {
				if i > 0 {
					b.WriteString(", ")
				}
				emitMockNode(b, ctx, slot, depth+1)
			}
			b.WriteString("]}")
		}
		delete(ctx.seen, rt)
		return
	}
	if isMap(rt) {
		ctx.seen[rt] = true
		keyType, valueType := mapKeyValue(ctx, rt)
		b.WriteString("{$keys: ")
		emitMockNode(b, ctx, keyType, depth+1)
		b.WriteString(", $values: ")
		emitMockNode(b, ctx, valueType, depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isSet(rt) {
		ctx.seen[rt] = true
		b.WriteString("{$values: ")
		emitMockNode(b, ctx, setElement(ctx, rt), depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isObjectLike(rt) {
		ctx.seen[rt] = true
		emitMockObject(b, ctx, rt, depth)
		delete(ctx.seen, rt)
		return
	}
	if element := arrayElement(rt); element != nil {
		b.WriteString("{$items: ")
		emitMockNode(b, ctx, element, depth+1)
		b.WriteString(", $length: [1, 3]}")
		return
	}
	b.WriteString("{pool: []}")
}

func emitMockObject(b *strings.Builder, ctx *walkCtx, rt *protocol.RunType, depth int) {
	props := propertyChildren(rt)
	if len(props) == 0 {
		b.WriteString("{}")
		return
	}
	inner := strings.Repeat("  ", depth+1)
	b.WriteString("{\n")
	for _, prop := range props {
		b.WriteString(inner)
		b.WriteString(propKey(prop))
		b.WriteString(": ")
		emitMockNode(b, ctx, prop.Child, depth+1)
		b.WriteString(",\n")
	}
	b.WriteString(strings.Repeat("  ", depth))
	b.WriteString("}")
}

// propKey renders a property's object-literal key: a bare identifier when the
// name is dot-access safe, else single-quoted.
func propKey(prop *protocol.RunType) string {
	if prop.IsSafeName {
		return prop.Name
	}
	return "'" + strings.ReplaceAll(prop.Name, "'", "\\'") + "'"
}
