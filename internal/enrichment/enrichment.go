// Package enrichment is the Go-side, build-time-only codegen + analysis for the
// AI-enrichment artifacts FriendlyType<T> and MockData<T> (see
// docs/AI_ENRICHMENT.md). It is deliberately SEPARATE from the existing
// resolver/typefns/emitter pipeline: it consumes the shared data model
// (protocol.RunType) as a library and adds nothing to the hot scan/render path.
//
// Every walker here follows the repo's emitter convention — a single switch over
// protocol.ReflectionKind, where the per-node output depends on the current node
// (the same shape as compiled/runtype/serialize.go and the typefns families):
//
//   - emit.go     — walks a RunType to EMIT a `.rt.ts` FriendlyType/MockData
//     skeleton (the `gen` command's codegen).
//   - describe.go — walks a RunType to a human/JSON description (the `describe`
//     command's prompt context).
//   - validate.go — (paired walk, added later) checks an authored literal against
//     the RunType and yields Findings (the `check` command).
//
// Nothing here is wired into the Vite build; the commands are out-of-band CLI
// modes (driven by argv), so the resolver process that the plugin spawns is
// untouched and still emits no `.rt.ts`.
package enrichment

import (
	"sort"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// maxWalkDepth bounds recursion so a pathological / mis-resolved graph cannot
// spin forever. Real data shapes are far shallower; the per-node `seen` guard
// handles genuine cycles, this is the backstop.
const maxWalkDepth = 64

// walkCtx threads the bits a kind-switch walk needs: ref resolution (canonical
// nodes ride as `{kind:-1, id}` sentinels and must be looked up in the type
// table) and a cycle guard keyed by node identity. A nil Resolve means the graph
// is fully inlined (the unit-test shape); the CLI bridge supplies a table lookup.
type walkCtx struct {
	resolve func(id string) *protocol.RunType
	seen    map[*protocol.RunType]bool
}

func newWalkCtx(resolve func(id string) *protocol.RunType) *walkCtx {
	return &walkCtx{resolve: resolve, seen: map[*protocol.RunType]bool{}}
}

// deref follows a KindRef sentinel to its canonical node when a resolver is
// available; otherwise (or when the id is unknown) it returns the node as-is.
func (ctx *walkCtx) deref(rt *protocol.RunType) *protocol.RunType {
	if rt == nil || rt.Kind != protocol.KindRef || ctx.resolve == nil {
		return rt
	}
	if resolved := ctx.resolve(rt.ID); resolved != nil {
		return resolved
	}
	return rt
}

// propertyChildren returns the data-bearing object members of rt (Property /
// PropertySignature), skipping methods, index signatures, call signatures, and
// any node the emitters treat as non-data. Order is declaration order.
func propertyChildren(rt *protocol.RunType) []*protocol.RunType {
	out := make([]*protocol.RunType, 0, len(rt.Children))
	for _, child := range rt.Children {
		if child == nil || child.NotSupported {
			continue
		}
		switch child.Kind {
		case protocol.KindProperty, protocol.KindPropertySignature:
			out = append(out, child)
		}
	}
	return out
}

// isObjectLike reports whether rt should be walked as a record of named fields:
// object literals, interfaces, intersections, and USER classes (which carry
// property children). Builtin classes (Date/Map/Set/RegExp/Temporal) have a
// SubKind and no property members, so they fall through to leaf handling.
func isObjectLike(rt *protocol.RunType) bool {
	switch rt.Kind {
	case protocol.KindObjectLiteral, protocol.KindIntersection:
		return true
	case protocol.KindClass:
		return len(propertyChildren(rt)) > 0
	default:
		return false
	}
}

// arrayElement returns the element node for an array (or nil if absent).
func arrayElement(rt *protocol.RunType) *protocol.RunType {
	if rt.Kind == protocol.KindArray {
		return rt.Child
	}
	return nil
}

// isMap / isSet report whether rt is a builtin Map / Set class (KindClass +
// the registry subKind). The structural-node arms run BEFORE isObjectLike so a
// Map/Set never falls through to the object/leaf arms.
func isMap(rt *protocol.RunType) bool {
	return rt.Kind == protocol.KindClass && rt.SubKind == protocol.SubKindMap
}

func isSet(rt *protocol.RunType) bool {
	return rt.Kind == protocol.KindClass && rt.SubKind == protocol.SubKindSet
}

// tupleSlots returns the per-slot value nodes of a tuple: each KindTupleMember
// child's `.Child` (the slot type). Non-tuple-member children are skipped.
// Order is declaration order; an empty tuple yields an empty slice.
func tupleSlots(ctx *walkCtx, rt *protocol.RunType) []*protocol.RunType {
	out := make([]*protocol.RunType, 0, len(rt.Children))
	for _, member := range rt.Children {
		member = ctx.deref(member)
		if member == nil {
			continue
		}
		out = append(out, member.Child)
	}
	return out
}

// isVariadicTuple reports whether the tuple carries a rest / variadic member
// (`[A, ...B[]]`). Such a tuple has a broad `length: number`, so the
// FriendlyType / MockData mapped types route it through the ARRAY branch
// (`number extends T['length']`), NOT the fixed `$slots` branch. The emitter
// mirrors that: a variadic tuple emits the array shape (`$items`/`$length`) so
// the skeleton stays assignable to the Phase-A type. A member is flagged "rest"
// or "variadic" by the serializer (serialize.go projectTuple).
func isVariadicTuple(ctx *walkCtx, rt *protocol.RunType) bool {
	for _, member := range rt.Children {
		member = ctx.deref(member)
		if member == nil {
			continue
		}
		for _, flag := range member.Flags {
			if flag == "rest" || flag == "variadic" {
				return true
			}
		}
	}
	return false
}

// mapKeyValue returns the (key, value) slot nodes of a Map<K,V>. The wire stores
// them as KindParameter wrappers in rt.Arguments (Arguments[0]=key wrapper,
// Arguments[1]=value wrapper); the underlying type rides on each wrapper's
// `.Child`. Wrappers are ref sentinels (Arguments isn't inlined by the bridge),
// so deref each before reading its Child. Either may be nil for a malformed node.
func mapKeyValue(ctx *walkCtx, rt *protocol.RunType) (keyType, valueType *protocol.RunType) {
	keyType = argumentChild(ctx, rt, 0)
	valueType = argumentChild(ctx, rt, 1)
	return keyType, valueType
}

// setElement returns the element slot node of a Set<U> — Arguments[0]'s
// KindParameter wrapper's `.Child`. Nil for a malformed node.
func setElement(ctx *walkCtx, rt *protocol.RunType) *protocol.RunType {
	return argumentChild(ctx, rt, 0)
}

// argumentChild derefs rt.Arguments[index] (a KindParameter wrapper ref) and
// returns its `.Child` (the wrapped type). Nil when the slot is absent.
func argumentChild(ctx *walkCtx, rt *protocol.RunType, index int) *protocol.RunType {
	if index < 0 || index >= len(rt.Arguments) {
		return nil
	}
	wrapper := ctx.deref(rt.Arguments[index])
	if wrapper == nil {
		return nil
	}
	return wrapper.Child
}

// formatConstraintKeys returns the candidate failed-constraint keys for a
// format-carrying node — the param names the type declares (minLength, max,
// pattern, version, …), sorted for deterministic output. These are exactly the
// `$errors` template keys the renderer can match (the (format.name,
// formatPath-tail) discriminator). Transformer-only params may appear too; this
// is a starting scaffold the author prunes (refined when the noop predicate is
// shared). Always-present base failure `type` is added by the caller.
func formatConstraintKeys(fa *protocol.FormatAnnotation) []string {
	if fa == nil || len(fa.Params) == 0 {
		return nil
	}
	keys := make([]string, 0, len(fa.Params))
	for key := range fa.Params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
