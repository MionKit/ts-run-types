package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// CloneExactShapeEmitter — the clone-based replacement for the removed
// mutating strip family (stripUnknownKeys / unknownKeysToUndefined). Returns
// a NEW value of the DECLARED shape: unknown/undeclared keys are dropped by
// construction (the clone is built from the type, never `{...v}`), and the
// input is never mutated. Runtime types are preserved — a Map stays a Map, a
// Set stays a Set, a class instance keeps its prototype (see the object arm).
//
// Contract (the strip guarantee, not full isolation): the RESULT carries no
// undeclared keys and the INPUT is untouched; interior subtrees that can
// never carry undeclared keys (primitives, Dates, arrays of atomics,
// Map<string, number>, …) are shared by REFERENCE with the input — the same
// composition rule prepareForJsonSafe uses. Callers that need full mutation
// isolation should structuredClone instead.
//
// Deliberately NO key-count gates and NO nested-reuse shortcuts (the
// prepareForJsonSafe Approach-3 fastpath): measured on V8, checking
// `Object.keys(x).length === N` to skip a small-object rebuild costs MORE
// than the rebuild itself (1.6x slower for a 7+3-prop shape) — see
// docs/todos/unknown-keys-aftervalidation-and-clone-exact-shape.md.
//
// Intended use is stripping validated parse output:
//
//	if (!validate(data)) throw ...;
//	return cloneExact(data);   // fresh value, exactly the declared shape
type CloneExactShapeEmitter struct{}

func (CloneExactShapeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the unknown-keys family gate — this IS an unknown-keys
// family member (the strip replacement), so atomics / functions / symbols /
// promises are supported-as-noop exactly like the removed strip, NOT
// rejected like the JSON serializers.
func (CloneExactShapeEmitter) Supports(rt *protocol.RunType) bool {
	return unknownKeysSupports(rt)
}

func (CloneExactShapeEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — noop exactly when the type graph has no key-carrying
// positions (same predicate lane the strip family used): nothing can be
// stripped, so the identity is the correct clone-exact-shape.
func (CloneExactShapeEmitter) IsNoopType(rt *protocol.RunType, ctx *EmitContext) bool {
	return isNoopForUnknownKeys(rt, ctx, cloneExactShapeNoopSpec)
}

// NoopChildComposesAround — a child that can never carry undeclared keys is
// shared by reference (the accessor IS its clone); empty code composes.
func (CloneExactShapeEmitter) NoopChildComposesAround() {}

func (CloneExactShapeEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall — expression shape (`<hash>.fn(v)`), never a mutation
// statement: the child factory RETURNS the cloned value and the parent
// composes it into an expression slot, mirroring PrepareForJsonSafeEmitter.
func (CloneExactShapeEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize: empty/identity bodies collapse to `return v` + isNoop so the
// JS-side noop fastpath short-circuits dispatch.
func (CloneExactShapeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

// Emit dispatches the per-kind switch. Arms return CodeE (expression
// evaluating to the clone), CodeRB (self-returning block), or empty CodeS
// (noop — the accessor is shared by reference). Composition rule identical
// to prepareForJsonSafe: an empty child emit means the child's clone IS its
// input accessor.
func (CloneExactShapeEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindObjectLiteral:
		return emitObjectCloneExactShape(rt, ctx, v, false)

	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindNone:
			// Plain user class: prototype-preserving rebuild (see the object
			// arm) so `instanceof` survives the clone. Custom serializer
			// registrations are a JSON-wire concern and don't apply to a
			// value-level clone.
			return emitObjectCloneExactShape(rt, ctx, v, true)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableCloneExactShape(rt, ctx, v)
		}
		// Date / Temporal / RegExp / non-serializable natives carry no
		// undeclared keys the family tracks — shared by reference, exactly
		// like the removed strip family's noop arm.
		return RTCode{Code: "", Type: CodeS}

	case protocol.KindArray:
		return emitArrayCloneExactShape(rt, ctx, v)

	case protocol.KindTuple:
		return emitTupleCloneExactShape(rt, ctx, v)

	case protocol.KindIndexSignature:
		// Reuses the safe-clone index-signature builder — its child
		// compilation dispatches through THIS walker's emitter, so the
		// copied values are exact-shape clones, not JSON projections.
		return emitIndexSignatureCloneExactShape(rt, ctx, v)

	case protocol.KindUnion:
		return emitUnionCloneExactShape(rt, ctx)

	// Atomic and non-key-carrying kinds — including bigint (no `.toString()`
	// here: this is a value-level clone, not a JSON projection), symbols,
	// functions, and promises (parity with the removed strip's noop arms).
	default:
		return RTCode{Code: "", Type: CodeS}
	}
}

// emitObjectCloneExactShape builds the declared-shape clone of an object
// literal / plain class instance. Mirrors emitObjectPrepareForJsonSafe's
// property collection (static/method drops, DataOnly-stripped drops,
// enumerability guards) WITHOUT the Approach-3 fastpath — the clone is
// always built (measured cheaper than gating for small objects; see the
// emitter doc comment).
//
// asClass selects the prototype-preserving accumulator form:
//
//	const _r = Object.create(Object.getPrototypeOf(v)); _r.a = v.a; …
//
// so a class instance clone keeps its prototype chain (`instanceof` holds).
// Plain objects use the object-literal / accumulator forms from
// buildSafeObjectClone.
func emitObjectCloneExactShape(rt *protocol.RunType, ctx *EmitContext, v string, asClass bool) RTCode {
	// A callable interface is function-like (DataOnly = never); same NS
	// stance as the JSON families — the diag maps it to the function code.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	var props []safePropEmit
	var indexSigs []*protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			if cloneIndexSigContributes(resolved, ctx) {
				indexSigs = append(indexSigs, resolved)
			}
			continue
		}
		if resolved.Kind != protocol.KindProperty && resolved.Kind != protocol.KindPropertySignature {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		propResolved := ctx.ResolveRef(resolved.Child)
		if propResolved == nil {
			continue
		}
		if strippedPropertyDrop(propResolved, resolved.Name, ctx) {
			// Directly DataOnly-stripped value (symbol / function / Promise /
			// never / non-serializable native) — drop the property so the
			// clone omits it, matching `DataOnly<{a: symbol}>` = `{}`.
			continue
		}
		accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			continue
		}
		prop := safePropEmit{
			name:       resolved.Name,
			isSafeName: resolved.IsSafeName,
			optional:   resolved.Optional,
			accessor:   accessor,
			expr:       expr,
		}
		if isEnumerabilityGuarded(resolved) {
			prop.presenceGuard = propertyIsEnumerableGuard(v, resolved.Name)
		}
		props = append(props, prop)
	}

	if len(indexSigs) > 0 {
		// The for-in copy walk (skip declared names, copy pattern-matching
		// keys with the child clone applied). Shared with the safe-clone
		// family — child compiles dispatch through this walker.
		return buildSafeIndexSignatureObject(v, props, collectSiblingNamedKeys(rt, ctx), indexSigs, ctx)
	}

	if len(props) == 0 {
		if objectHasIndexSignatureChild(rt, ctx) {
			// Only non-contributing index sigs (atomic values, no key
			// pattern): every key is "known", nothing to strip — noop,
			// matching the unknown-keys noop predicate and the removed
			// strip family's arm.
			return RTCode{Code: "", Type: CodeS}
		}
		// No clonable declared properties — the exact shape is `{}`
		// regardless of v's content (strips ALL extras).
		return RTCode{Code: "return {}", Type: CodeRB}
	}

	if asClass {
		return buildClassCloneExactShape(v, props)
	}

	clone := buildSafeObjectClone(props, ctx)
	if clone.Type == CodeRB {
		// Mixed-optionality accumulator: the block self-returns; splice it
		// directly as the body (the walker hoists at expression slots).
		return clone
	}
	return RTCode{Code: "return " + clone.Code, Type: CodeRB}
}

// buildClassCloneExactShape assembles the prototype-preserving accumulator
// for a plain class instance:
//
//	const _r = Object.create(Object.getPrototypeOf(v));
//	_r.a = <expr>; if (v.opt !== undefined) _r.opt = <expr>; …
//	return _r
//
// The fresh object shares the input's prototype (methods / instanceof keep
// working) while own enumerable data is rebuilt from the declared shape, so
// undeclared own keys are dropped. Prototype accessors are an accepted edge:
// assignment goes through a setter if one exists (classes-as-data carry
// plain fields).
func buildClassCloneExactShape(v string, props []safePropEmit) RTCode {
	var b strings.Builder
	b.WriteString("const _r = Object.create(Object.getPrototypeOf(")
	b.WriteString(v)
	b.WriteString("));")
	for _, p := range props {
		if p.optional {
			b.WriteString("if (")
			b.WriteString(p.accessor)
			b.WriteString(" !== undefined")
			if p.presenceGuard != "" {
				b.WriteString(" && (")
				b.WriteString(p.presenceGuard)
				b.WriteString(")")
			}
			b.WriteString(") _r[")
			b.WriteString(quoteJS(p.name))
			b.WriteString("] = ")
			b.WriteString(p.expr)
			b.WriteString(";")
			continue
		}
		b.WriteString("_r[")
		b.WriteString(quoteJS(p.name))
		b.WriteString("] = ")
		b.WriteString(p.expr)
		b.WriteString(";")
	}
	b.WriteString("return _r")
	return RTCode{Code: b.String(), Type: CodeRB}
}

// emitArrayCloneExactShape — noop (share by reference) when the element can
// never carry undeclared keys; otherwise rebuild via `.map` with the
// element's exact-shape clone.
func emitArrayCloneExactShape(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	elemVar := ctx.NextLocalVar("e")
	expr, ok := safeChildExpr(rt.Child, elemVar, ctx)
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	if expr == elemVar {
		// Element clone is the identity — nothing strippable below; the
		// array itself carries no tracked keys (parity with the removed
		// strip family), so share the array by reference.
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: v + ".map(function(" + elemVar + "){return " + expr + "})", Type: CodeE}
}

// emitTupleCloneExactShape — positional rebuild when any member has a
// non-identity clone; noop otherwise. Optional members preserve `undefined`
// (a value-level clone has no JSON `null` placeholder concern).
func emitTupleCloneExactShape(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	var parts []string
	restPart := ""
	anyTransform := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != protocol.KindTupleMember || resolved.Child == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			elemVar := ctx.NextLocalVar("e")
			expr, ok := safeChildExpr(resolved.Child, elemVar, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			if expr != elemVar {
				anyTransform = true
			}
			start := positionStr(resolved)
			restPart = "..." + v + ".slice(" + start + ").map(function(" + elemVar + "){return " + expr + "})"
			break
		}
		idx := positionStr(resolved)
		accessor := v + "[" + idx + "]"
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr != accessor {
			anyTransform = true
			if resolved.Optional {
				expr = "(" + accessor + " === undefined ? undefined : " + expr + ")"
			}
		}
		parts = append(parts, expr)
	}
	if !anyTransform {
		// Every slot clones to itself — the tuple array carries no tracked
		// keys; share by reference.
		return RTCode{Code: "", Type: CodeS}
	}
	if restPart != "" {
		parts = append(parts, restPart)
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: "[" + strings.Join(parts, ",") + "]", Type: CodeE}
}

// cloneIndexSigContributes reports whether an index signature has anything to
// clone/strip: symbol-keyed and function-valued sigs are dropped (skipRT
// parity), and an ATOMIC value type with NO template-literal key pattern
// means every key is "known" and every value clones to itself — nothing to
// do (the removed strip family's gate, and the noop predicate's arm).
func cloneIndexSigContributes(rt *protocol.RunType, ctx *EmitContext) bool {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return false
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return false
	}
	hasPattern := false
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == protocol.KindTemplateLiteral {
			if _, ok := buildTemplateLiteralRegex(indexResolved); ok {
				hasPattern = true
			}
		}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic && !hasPattern {
		return false
	}
	return true
}

// emitIndexSignatureCloneExactShape — a bare index signature at a non-object
// position (root reach-in): the object arm normally consumes index sigs via
// buildSafeIndexSignatureObject; this arm covers the direct dispatch with a
// single-sig copy walk over a fresh object.
func emitIndexSignatureCloneExactShape(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if !cloneIndexSigContributes(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	return buildSafeIndexSignatureObject(v, nil, nil, []*protocol.RunType{rt}, ctx)
}

// emitUnionCloneExactShape — v1 stance: a union with OBJECT members is
// unsupported (CodeNS → alwaysThrow + build diagnostic). Without runtime arm
// discrimination the emitter cannot know WHICH declared shape to rebuild, and
// a clone that silently keeps unknown keys would be a security bug, not a
// fallback. Unions of atomics carry no key-tracked positions — noop, shared
// by reference (parity with the removed strip, which only acted on object
// members).
func emitUnionCloneExactShape(rt *protocol.RunType, ctx *EmitContext) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.ObjectMembers) > 0 {
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: "", Type: CodeS}
}

// emitNativeIterableCloneExactShape — Map / Set rebuild. When every inner
// type clones to itself the whole iterable is shared by reference (nothing
// strippable inside; Map/Set entries are data, not schema keys). Otherwise a
// NEW Map/Set is built with per-entry exact-shape clones.
func emitNativeIterableCloneExactShape(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == protocol.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("e")
	var entryParts []string
	anyTransform := false
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		expr, ok := safeChildExpr(innerType, accessor, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr != accessor {
			anyTransform = true
		}
		entryParts = append(entryParts, expr)
	}
	if !anyTransform || len(entryParts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	ctor := "Set"
	perEntry := entryParts[0]
	if isMap {
		ctor = "Map"
		perEntry = "[" + strings.Join(entryParts, ",") + "]"
	}
	return RTCode{
		Code: "new " + ctor + "(Array.from(" + v + ", function(" + entryVar + "){return " + perEntry + "}))",
		Type: CodeE,
	}
}
