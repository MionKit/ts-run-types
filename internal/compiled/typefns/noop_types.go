package typefns

import "github.com/mionkit/ts-runtypes/internal/protocol"

// Semantic noop predicates — "would this family's entry for T be the family
// identity fn?" — decided over the TYPE GRAPH, not the emitted code shape.
//
// Finalize's shape check ("" / "return v") only sees what the walker INLINED;
// it cannot see through call boundaries. Three boundaries used to leak dead
// code: external dep-calls (every named type under the default name rule),
// circular types (always external, so a JSON-compatible circular type emitted
// a self-recursive traversal that walked the whole value doing nothing), and
// the JSON composites (bound their primitives unconditionally). The walker's
// dispatch gate consults these predicates before emitting a dep call, and the
// composite collector keys binding elision on the rendered entries' IsNoop
// flags — both collapse those boundaries.
//
// SOUNDNESS CONTRACT (one-directional): predicate true ⇒ the family's emitted
// body for T is the family identity. A false negative only costs bytes (the
// dep call stays); a false positive silently skips a real transform — data
// corruption. Every arm below therefore MIRRORS the corresponding emitter's
// per-kind dispatch (json_prepare.go / json_restore.go / json_prepare_safe.go
// / union_flat.go); when in doubt an arm returns false. The mirror is pinned
// mechanically by the resolver-level corpus test (noop_predicate_test.go),
// which asserts verdict=true ⇒ the gate-disabled fully-inlined compile
// collapses to a noop body, across every fixture type.
//
// Cycles: re-entry on an in-walk id is assumed noop (greatest fixpoint, the
// isJsonCompatible rule) — a cycle is identity unless some node on it (or off
// it) demands a transform, and any such node falsifies the walk on its own
// path. Memoization stores only COMPLETED top-level verdicts (an intermediate
// node's in-walk value can depend on the cycle-back assumption for an
// ancestor still on the stack), exactly like FactsTable's other predicates.

// NoopTypePredicate is the optional Emitter capability behind the walker's
// dispatch-time noop gate. Implement it only when the family has a sound
// type-graph characterization of "entry is the family identity" — families
// without it (sj / tb / fb always do real work; the unknown-keys group has no
// predicate yet) keep today's dep-call behavior.
type NoopTypePredicate interface {
	IsNoopType(rt *protocol.RunType, ctx *EmitContext) bool
}

// jsonNoopMode selects between the encode (prepareForJson) and decode
// (restoreFromJson) arm tables of the shared JSON-transform predicate. The
// two sides diverge exactly where the emitters do: Date/Temporal are noop on
// encode (native toJSON covers them) but rebuild on decode; `undefined` is
// noop on encode but force-rebinds on decode; unions always emit the
// guard-chain + mismatch-throw on encode but ride raw on decode when nothing
// wraps.
type jsonNoopMode int

const (
	noopModePrepare jsonNoopMode = iota
	noopModeRestore
)

func (mode jsonNoopMode) factKind() factKind {
	if mode == noopModePrepare {
		return factNoopPrepareJson
	}
	return factNoopRestoreJson
}

/** isNoopForPrepareJson reports whether the pj (mutate-encode) entry for rt is the identity. **/
func isNoopForPrepareJson(rt *protocol.RunType, ctx *EmitContext) bool {
	return jsonNoopTopLevel(rt, ctx, noopModePrepare)
}

/** isNoopForRestoreJson reports whether the rj (decode) entry for rt is the identity. **/
func isNoopForRestoreJson(rt *protocol.RunType, ctx *EmitContext) bool {
	return jsonNoopTopLevel(rt, ctx, noopModeRestore)
}

// jsonNoopTopLevel is the memo wrapper — same store-completed-walks-only
// discipline as isJsonCompatible (see the cycle note there).
func jsonNoopTopLevel(rt *protocol.RunType, ctx *EmitContext, mode jsonNoopMode) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(mode.factKind(), rt.ID); known {
			return verdict
		}
	}
	result := jsonNoopRecursive(rt, ctx, mode, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(mode.factKind(), rt.ID, result)
	}
	return result
}

func jsonNoopRecursive(rt *protocol.RunType, ctx *EmitContext, mode jsonNoopMode, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		// Mirrors the walker: nil / dangling children contribute no code.
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(mode.factKind(), rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		// Atomic JSON-compatible kinds — both emitters' "" arms.
		return true

	case protocol.KindTemplateLiteral, protocol.KindIntersection:
		// String-flavoured at runtime / defensive-noop arms in both emitters.
		return true

	case protocol.KindUndefined:
		// pj: "" (JSON.stringify drops it natively). rj: `v = undefined`
		// force-rebind — real code.
		return mode == noopModePrepare

	case protocol.KindLiteral:
		// Primitive literals are noop in both emitters; bigint / symbol
		// literals carry value transforms.
		return literalFlavour(rt) == litPrimitive

	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case protocol.KindTuple:
		for _, child := range rt.Children {
			if !jsonNoopRecursive(child, ctx, mode, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		// Optional tuple slots are never identity: emitTupleMember{PrepareFor,RestoreFrom}Json
		// normalize a present-but-undefined slot to `null` (arrays serialize a present
		// hole as null) even when the child is noop — unlike object properties, whose
		// absent optional is dropped natively by JSON.stringify. Object properties can
		// stay noop (emitPropertyPrepareForJson returns "" for a noop child regardless of
		// optionality); tuple members cannot.
		if rt.Optional {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil {
			return true
		}
		// Function-typed properties are dropped slots in both emitters
		// (emitPropertyPrepareForJson / emitPropertyRestoreFromJson).
		if isFunctionLikeKind(resolved.Kind) {
			return true
		}
		return jsonNoopRecursive(resolved, ctx, mode, visited)

	case protocol.KindIndexSignature:
		if rt.Child == nil {
			return true
		}
		// Symbol-keyed index signatures are skipped slots (skipRT).
		if isSymbolKeyedIndexSig(rt, ctx) {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case protocol.KindObjectLiteral:
		return jsonNoopObjectChildren(rt.Children, ctx, mode, visited)

	case protocol.KindClass:
		if protocol.IsTemporalSubKind(rt.SubKind) {
			// Encode rides the builtin toJSON(); decode rebuilds via
			// Temporal.<T>.from(v).
			return mode == noopModePrepare
		}
		switch rt.SubKind {
		case protocol.SubKindDate:
			// Encode rides Date#toJSON; decode rebuilds via new Date(v).
			return mode == noopModePrepare
		case protocol.SubKindMap, protocol.SubKindSet:
			// Iterable ↔ array-of-entries transforms on both halves.
			return false
		case protocol.SubKindNone:
			// Named user classes always emit the runtime class-serializer
			// registry branch (wrapPrepareWithClassSerializer /
			// wrapRestoreWithClassSerializer) — never identity. Anonymous
			// classes fall through to the structural object emit.
			if userClassName(rt) != "" {
				return false
			}
			return jsonNoopObjectChildren(rt.Children, ctx, mode, visited)
		}
		// SubKindNonSerializable and any future subkind: CodeNS arms.
		return false

	case protocol.KindUnion:
		return unionJsonNoop(rt, ctx, mode)
	}
	// Void (`v = undefined` on both halves), BigInt / Symbol / Regexp
	// (value transforms), Never / Promise / function kinds (CodeNS), and
	// any future kind: not noop.
	return false
}

// jsonNoopObjectChildren mirrors the object emits' member walk — static and
// function-like members are skipped slots; every surviving property must be
// noop. Same skip set as objectChildrenCompat (json_compat.go).
func jsonNoopObjectChildren(children []*protocol.RunType, ctx *EmitContext, mode jsonNoopMode, visited map[string]struct{}) bool {
	for _, childRef := range children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if !jsonNoopRecursive(resolved, ctx, mode, visited) {
			return false
		}
	}
	return true
}

// unionJsonNoop mirrors the flat-union emitters' top gates
// (emitUnionPrepareForJsonFlat / emitUnionRestoreFromJsonFlat + the
// buildFlatLayout bucketing they share, union_flat_layout.go):
//
//   - encode (pj): any resolvable member at all ⇒ the emit produces the
//     member guard chain ending in the union-mismatch throw — that throw is
//     load-bearing encode-time validation, so the entry is never identity.
//     Only the degenerate all-members-dangling layout emits nothing.
//   - decode (rj): the emit is "" exactly when AtomicNeedsTuple is false —
//     i.e. the union round-trips raw (roundTripsRaw): EVERY member, atomic
//     AND object/record bucket, is JSON-compatible, so nothing was enveloped
//     on encode and the decoder is identity. A member carrying a transform
//     (a non-JSON-compatible atomic OR a non-JSON-compatible object member)
//     forces the envelope, so its decoder does real unwrap work. Mirrors
//     union_flat_layout.go's AtomicNeedsTuple = !roundTripsRaw.
func unionJsonNoop(rt *protocol.RunType, ctx *EmitContext, mode jsonNoopMode) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	if mode == noopModePrepare {
		// Any resolvable member ⇒ guard chain + throw. Noop only for the
		// degenerate all-members-dangling layout (both emitters' early "").
		for _, ref := range children {
			if ctx.ResolveRef(ref) != nil {
				return false
			}
		}
		return true
	}
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil {
			continue
		}
		// buildFlatLayout bucketing: object-like members carrying an index
		// signature fall into the ATOMIC bucket (dynamic keys can't merge).
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			if !isJsonCompatible(resolved, ctx) {
				return false
			}
			continue
		}
		if resolved.Kind == protocol.KindObjectLiteral || resolved.Kind == protocol.KindClass {
			if resolved.Kind == protocol.KindClass && resolved.SubKind != protocol.SubKindNone {
				if !isJsonCompatible(resolved, ctx) {
					return false
				}
				continue
			}
			// Object bucket — merges into the [-1, merged] envelope ONLY when it
			// carries a transform. A fully JSON-compatible object/record member
			// round-trips raw (roundTripsRaw ⇒ AtomicNeedsTuple false ⇒ identity
			// decode), so it no longer forces non-noop.
			if !isJsonCompatible(resolved, ctx) {
				return false
			}
			continue
		}
		if !isJsonCompatible(resolved, ctx) {
			return false
		}
	}
	return true
}

/** isNoopForPrepareJsonSafe reports whether the pjs (clone-encode) entry for rt is the identity. **/
// Mirrors PrepareForJsonSafeEmitter.Emit's noop arms: atomic JSON kinds
// (incl. undefined — the clone feeds native JSON.stringify), primitive
// literals, the defensive intersection / template-literal arms, and the
// extra-proof pass-through gates on arrays and tuples
// (emitArrayPrepareForJsonSafe / emitTuplePrepareForJsonSafe — an
// extra-proof subtree is shared by reference, `return v`). Objects and
// classes ALWAYS clone (the clone is what strips undeclared keys), so they
// are never noop here even when JSON-compatible; unions keep their
// guard-chain + throw like pj. No memo: the arms are O(1) except the
// already-memoized isExtraProof.
func isNoopForPrepareJsonSafe(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum,
		protocol.KindTemplateLiteral, protocol.KindIntersection:
		return true
	case protocol.KindLiteral:
		return literalFlavour(rt) == litPrimitive
	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return isExtraProof(ctx.ResolveRef(rt.Child), ctx)
	case protocol.KindTuple:
		if len(rt.Children) == 0 {
			return true
		}
		return isExtraProof(rt, ctx)
	}
	return false
}

// NoopPredicateAgreement is the corpus-test surface: it returns the emitter
// predicate's verdict for rt alongside the GROUND-TRUTH noop flag obtained by
// compiling rt with the dispatch gate disabled and full inlining (allInternal
// — so nothing externalizes except true cycles, and Finalize's shape check
// sees the whole body). comparable=false when the emitter has no predicate or
// doesn't support rt. An unsupported compile reports groundTruth=false (an
// alwaysThrow entry is not the identity). Callers assert the soundness
// direction: verdict ⇒ groundTruth. Exported for internal/resolver's
// noop-predicate corpus test; not part of the render pipeline.
func NoopPredicateAgreement(emitter Emitter, rt *protocol.RunType, refTable map[string]*protocol.RunType, facts *FactsTable) (verdict bool, groundTruth bool, comparable bool) {
	predicate, hasPredicate := emitter.(NoopTypePredicate)
	if !hasPredicate || rt == nil || !emitter.Supports(rt) {
		return false, false, false
	}
	predicateWalker := NewWalker(rt, "agreement", emitter)
	predicateWalker.RefTable = refTable
	predicateWalker.facts = facts
	predicateCtx := predicateWalker.getEmitContext(predicateWalker.Vλl)
	verdict = predicate.IsNoopType(rt, predicateCtx)
	predicateWalker.putEmitContext(predicateCtx)

	groundTruthWalker := NewWalker(rt, "agreement", emitter)
	groundTruthWalker.RefTable = refTable
	groundTruthWalker.facts = facts
	groundTruthWalker.disableNoopElision = true
	groundTruthWalker.inlineCtx.InlineAllInternal = true
	_, groundTruth, isUnsupported := groundTruthWalker.Compile()
	if isUnsupported {
		groundTruth = false
	}
	return verdict, groundTruth, true
}
