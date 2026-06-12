package typefns

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// PrepareForJsonEmitter implements the `prepareForJson` rt function —
// transforms a runtime value into a JSON-serializable form (BigInts
// become decimal strings, Symbols become "Symbol:<desc>" strings, RegExps
// become their toString() form, etc.). The downstream JSON.stringify
// handles Dates via their built-in toJSON() contract.
//
// Paired with RestoreFromJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every valid sample.
//
// Mirrors mion's per-kind emitPrepareForJson methods under
// mion/packages/run-types/src/nodes/**.
type PrepareForJsonEmitter struct{}

// Args mirrors mion's `rtArgs.vλl = 'v'` + empty default in
// run-types/src/constants.functions.ts:45. Same single-arg shape as
// validate — prepareForJson mutates v in place and returns it.
func (PrepareForJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. Phase 1 covers every
// atomic kind whose mion node ships an emitPrepareForJson. Subsequent
// phases extend the set kind by kind.
//
// Kinds that throw at RT-compile time in mion (never, enumMember) are
// excluded — Supports false means no factory is emitted.
func (PrepareForJsonEmitter) Supports(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindVoid,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol,
		protocol.KindObject, protocol.KindRegexp,
		protocol.KindLiteral, protocol.KindEnum:
		return true
	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:20 — emitPrepareForJson throws
		// "Never type cannot be encoded to JSON.". We surface that
		// via a throw-factory; Supports() returns true so the
		// renderer compiles the entry (and the compile produces the
		// throw via RTThrow in Emit).
		return true
	case protocol.KindArray:
		// Gate on a non-nil child — a malformed RunType with KindArray
		// and Child=nil would reach Emit and panic.
		return rt.Child != nil
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindTuple:
		return true
	case protocol.KindTupleMember:
		return true
	case protocol.KindUnion:
		// Unions encode as `[memberIndex, transformedValue]` per mion's
		// nodes/collection/union.ts — see emitUnionPrepareForJson below
		// for the full implementation. The wrapping is per-member: a
		// noop-on-both-sides member doesn't tuple-encode (the decode's
		// shape check distinguishes encoded vs raw values).
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		// Intersection types are resolved by tsgo at the type-checker
		// layer (`A & B` → merged object literal, `string & number` →
		// `never`). Mion throws if its IntersectionRunType is ever
		// invoked. We support it as a defensive noop in case some
		// resolution path produces an unresolved intersection.
		return true
	case protocol.KindTemplateLiteral:
		// Template literals validate at compile time against a regex
		// (handled by validate). The value is always a string at runtime,
		// so prepareForJson / restoreFromJson are atomic-string-like
		// (noop). Same emit shape as KindString.
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Functions are non-serializable. Top-level support emits a
		// noop body (return v unchanged) — JSON.stringify already
		// drops function values. Object-property children of these
		// kinds are filtered out by the object emit.
		return true
	case protocol.KindClass:
		// Date is atomic in mion — its prepareForJson is a noop (Date
		// has its own toJSON()). User classes (SubKindNone) use the
		// object emit. Map / Set get their own arms that materialise
		// the iterable into an Array (JSON-encodable form).
		// NonSerializable IS supported so the renderer emits a
		// throw-factory (mion's NonSerializableRunType throws).
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone,
			protocol.SubKindMap, protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return true
		}
		return protocol.IsTemporalSubKind(rt.SubKind)
	case protocol.KindPromise:
		// mion:nodes/native/promise.ts:23 — emitPrepareForJson throws
		// "RT compilation disabled for Non Serializable types.".
		// Supports() returns true so the renderer compiles and surfaces
		// the throw via a runtime-throwing factory.
		return true
	}
	return false
}

// IsRTInlined delegates to DefaultIsRTInlined — same heuristics as
// validate / validationErrors. Mion shares the predicate across all rt fns
// via BaseRunType.isRTInlined.
func (PrepareForJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the walker's dispatch-time noop gate: external children whose
// prepare entry is the identity compose as empty code (no dep call, no
// import). See noop_types.go for the soundness contract.
func (PrepareForJsonEmitter) IsNoopType(rt *protocol.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJson(rt, ctx)
}

// ReturnName is `v` — prepareForJson mutates the input value (or
// rebinds via `v = …` for symbol/regexp/bigint), then returns it.
// Same as validate's return.
func (PrepareForJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors the body of
// the corresponding mion `emitPrepareForJson` method under
// mion/packages/run-types/src/nodes/atomic/<name>.ts.
//
// Most atomic kinds are noops (return CodeS with empty code). The
// non-noop atomics:
//   - bigint:  `v = v.toString()` (BigInt is not JSON-encodable; serialize as decimal string)
//   - symbol:  `v = 'Symbol:' + (v.description || ”)` (preserve description tag)
//   - regexp:  `v = v.toString()` (serialize as /source/flags string)
//   - void:    `v = undefined` (force the output to undefined)
//
// All non-noop atomics return CodeE so the walker's
// expression-in-statement-context wrap appends `;` before the
// `return v` tail. Mion uses bare expression form for the same
// emits (e.g. `${comp.vλl}.toString()`); we adopt the
// `v = <expression>` form so the walker's expression-shape handling
// produces well-formed JS that actually mutates v before returning.
//
// Unsupported kinds emit CodeNS — the walker latches IsUnsupported
// and the renderer skips this entry's factory.
func (PrepareForJsonEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		// mion: AtomicRunType default `{code: undefined, type: 'S'}`.
		// Finalize collapses empty bodies to `return v` + noop flag.
		return RTCode{Code: "", Type: CodeS}

	case protocol.KindNever:
		// Unsupported leaf — walker latches, renderer emits alwaysThrow
		// factory keyed by PJ001 (see docs/UNSUPPORTED-KINDS.md).
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindBigInt:
		// mion:nodes/atomic/bigInt.ts:20 — `v.toString()`.
		// Reassign so the mutated value is what gets returned.
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}

	case protocol.KindSymbol:
		// Unsupported — symbol identity does not survive a JSON
		// round-trip (Symbol("x") !== Symbol("x")), so the previous
		// "Symbol:" + description encoding was lossy by construction.
		// See docs/UNSUPPORTED-KINDS.md FAQ for the rationale.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:20 — `v.toString()` (e.g. "/abc/i").
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}

	case protocol.KindVoid:
		// mion:nodes/atomic/void.ts:20 — `v = undefined`.
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case protocol.KindClass:
		// Date prepareForJson is a noop (Date has its own toJSON()).
		// User classes (SubKindNone) flow through the object emit —
		// mion's class.ts extends InterfaceRunType, same emit body.
		// Map / Set materialise their iterable contents into an Array
		// so JSON.stringify has a serializable form. NonSerializable
		// (Int8Array, WeakMap, …) throws — mion's
		// NonSerializableRunType.emitPrepareForJson at
		// nodes/native/nonSerializable.ts:24 raises the same message.
		if protocol.IsTemporalSubKind(rt.SubKind) {
			// Like Date: no-op — JSON.stringify invokes the type's toJSON().
			return RTCode{Code: "", Type: CodeS}
		}
		switch rt.SubKind {
		case protocol.SubKindDate:
			return RTCode{Code: "", Type: CodeS}
		case protocol.SubKindNone:
			structural := emitObjectJsonChildren(rt, ctx)
			return wrapPrepareWithClassSerializer(rt, ctx, v, structural)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterablePrepareForJson(rt, ctx, v)
		case protocol.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		// Unsupported — async value, can't be sampled synchronously.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindObjectLiteral:
		return emitObjectJsonChildren(rt, ctx)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyPrepareForJson(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignaturePrepareForJson(rt, ctx, v)

	case protocol.KindTuple:
		return emitTuplePrepareForJson(rt, ctx, v)

	case protocol.KindTupleMember:
		return emitTupleMemberPrepareForJson(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:nodes/function/function.ts:83-85 —
		// `emitPrepareForJson(): RTCode { throw new Error('Compile
		// function PrepareForJson not supported, call compileParams
		// or compileReturn instead.'); }`. Functions as ROOT or as a
		// union member surface this throw; object/property children
		// of function type are filtered out by the parent emit (see
		// emitObjectPrepareForJson / emitPropertyPrepareForJson) and
		// never reach this arm. Tuple-member also filters via
		// isFunctionLikeKind.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindUnion:
		// Unions encode via the flat-union wire shape (see union_flat.go) —
		// object members merge into a `[-1, mergedObject]` envelope so
		// encode skips the per-member validate walk; atomic members keep
		// the `[memberIndex, value]` shape under an all-or-nothing wrap
		// rule. The non-flat per-member envelope was retired after
		// benchmarks showed flat wins on every union with object
		// members and ties everywhere else.
		return emitUnionPrepareForJsonFlat(rt, ctx, v)

	case protocol.KindIntersection:
		// Defensive noop — intersections should be pre-resolved by the
		// type checker. See Supports's comment for details.
		return RTCode{Code: "", Type: CodeS}

	case protocol.KindTemplateLiteral:
		// String-flavoured at runtime — noop.
		return RTCode{Code: "", Type: CodeS}

	case protocol.KindLiteral:
		// mion:nodes/atomic/literal.ts:77 — defers to the underlying
		// kind's emit (`getRunTypeForLiteral(comp).emitPrepareForJson(comp)`).
		// Inline the dispatch here: bigint / symbol / regexp literals
		// behave like the bare kind; primitive literals are noops.
		return emitLiteralPrepareForJson(rt, v)

	case protocol.KindArray:
		// mion:nodes/member/array.ts:emitPrepareForJson. Allocates an
		// index counter, sets the child accessor (`v[i0]`) so the
		// element's CompileChild adopts the subscript, then composes:
		//
		//   for (let i0 = 0; i0 < v.length; i0++) {<childCode>}
		//
		// The child's emit is responsible for the per-element mutation
		// (e.g. bigint child returns `v[i0] = v[i0].toString()`). Empty
		// child code collapses the whole loop to a noop. Non-serializable
		// element kinds (Symbol[] / Function[]) return CodeNS from
		// their own Emit arm — that propagates up here and the walker
		// latches the child as UnsupportedLeaf, so the renderer emits
		// alwaysThrow keyed off the child's kind.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		body := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJson mirrors mion's literal.ts:77 — defers to
// the base kind. The Go side knows the literal's primitive flavour via
// Flags ("bigint", "symbol") and Literal shape (regexp envelope vs
// primitive).
func emitLiteralPrepareForJson(rt *protocol.RunType, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}
	case litSymbol:
		return RTCode{Code: v + " = 'Symbol:' + (" + v + ".description || '')", Type: CodeE}
	}
	// Primitive literal (number / string / boolean / null) — noop.
	return RTCode{Code: "", Type: CodeS}
}

// emitObjectJsonChildren mirrors mion's
// nodes/collection/interface.ts:emitPrepareForJson — iterate non-skip
// children, collect each child's emit, join with `;`. Children that
// are method-shaped or static are dropped (mion's getRTChildren).
// A child returning CodeNS propagates upward (unsupported descendant
// short-circuits the whole entry). Shared verbatim by the restore side
// (mion's emitRestoreFromJson is the same walk — the per-property
// encode/decode difference lives in the child emits).
func emitObjectJsonChildren(rt *protocol.RunType, ctx *EmitContext) RTCode {
	var parts []string
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
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitPropertyPrepareForJson mirrors mion's
// nodes/member/property.ts:emitPrepareForJson. Sets the child
// accessor (`v.<name>` / `v["name"]`), recurses, optionally wraps
// with the undefined-guard for optional properties.
func emitPropertyPrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		// Fast-path: pre-descent skip for known function-shaped children.
		// Avoids the wasted walker descent + AbsorbUnsupported round-trip.
		ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, rt.Name)
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// Property absorbs any unsupported child — drops the slot from
		// the parent's chain, emits a per-family diagnostic naming the
		// excluded property + leaf kind, and clears the walker latch
		// so sibling properties can absorb their own. The rest of the
		// object's body still emits. See docs/UNSUPPORTED-KINDS.md
		// "How a parent absorbs".
		leafCode := ctx.DiagCodeForLeaf(ctx.walker.UnsupportedLeaf)
		if leafCode != "" {
			ctx.walker.EmitDiagnostic(leafCode, rt.Name)
		}
		ctx.walker.AbsorbUnsupported()
		return RTCode{Code: "", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{
			Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}",
			Type: CodeS,
		}
	}
	return childRT
}

// emitIndexSignaturePrepareForJson mirrors mion's
// nodes/member/indexProperty.ts:emitPrepareForJson — for-in over keys
// invoking the child's emit on each. Template-literal key constraints
// add a per-key regex.test skip; without one, every key is processed.
func emitIndexSignaturePrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Mion's IndexSignatureRunType.skipRT (indexProperty.ts:30-36)
	// drops symbol-keyed sigs from every RT fn except toJSCode.
	// for-in doesn't enumerate symbol keys anyway, so the loop body
	// would be dead, but matching mion's emit shape avoids
	// corrupting unrelated string/number keys when the symbol-keyed
	// value type is non-noop (e.g. `[k: symbol]: Date` running
	// `new Date(v[k])` over every enumerable key).
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	keyRegexVar := ""
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == protocol.KindTemplateLiteral {
			if regex, ok := buildTemplateLiteralRegex(indexResolved); ok {
				keyRegexVar = ctx.NextLocalVar("reIdx")
				if !ctx.HasContextItem(keyRegexVar) {
					ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
				}
			}
		}
	}
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (const " + keyVar + " in " + v + ") {"
	if keyRegexVar != "" {
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body += childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitTuplePrepareForJson mirrors mion's
// nodes/collection/tuple.ts:emitPrepareForJson — iterate tuple members,
// emit each one's code, join with `;`. Empty tuple → noop.
func emitTuplePrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitTupleMemberPrepareForJson mirrors mion's
// nodes/member/tupleMember.ts:emitPrepareForJson. Sets the element
// accessor `v[<position>]`, then composes:
//
//   - non-rest, non-optional: pass child code through unchanged
//   - non-rest, optional:
//     `if (v[i] === undefined) { if (v.length > i) v[i] = null } else { <childCode> }`
//     (replace undefined slots with null so the array survives JSON
//     without losing length — JSON.stringify renders [, , 1] as [null,
//     null, 1] in some engines and the inverse round-trip diverges)
//   - rest: for-loop iterating from position to v.length, applying
//     child emit on each element
func emitTupleMemberPrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS, the walker latches the leaf, and the
	// renderer surfaces an alwaysThrow factory. Tuple slots are
	// positional (no absorb), so dropping silently would emit a lossy
	// validator. See docs/UNSUPPORTED-KINDS.md.
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if rt.Optional {
		optionalCode := "if (" + accessor + " === undefined) {if (" + v + ".length > " + idxLit + ") " + accessor + " = null}"
		if childRT.Code == "" {
			return RTCode{Code: optionalCode, Type: CodeS}
		}
		return RTCode{Code: optionalCode + " else {" + childRT.Code + "}", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return childRT
}

// unionMemberValidateCheck returns a JS expression that checks whether
// the current value (`v`) satisfies `member`'s type. Mirrors mion's
// `getChildValidateWithLooseCheck` (union.ts:56) — the union's dispatch
// runs each member's validate in declaration order (or safe order),
// taking the first match.
//
// Uses a cross-fn lookup into the validate cache via context-item
// declaration. The `?.fn(v) ?? true` fallback handles noop kinds
// (any / unknown) whose validate factories don't exist — their runtime
// semantic is "always passes".
//
// For all-optional object members (weak types in TS), the bare validate
// would match ANY object (no required props to fail on), so an input
// like `{c: 1n}` against union `... | {d?: string}` would incorrectly
// dispatch to the {d?} arm. Mirror mion's getChildValidateWithLooseCheck
// (union.ts:56-78) by appending a property-presence gate from
// looseCheckGate — TypeScript's actual weak-type semantic requires
// at least one of the member's own props to be present, or the value
// to be an empty object.
func unionMemberValidateCheck(member *protocol.RunType, ctx *EmitContext, v string) string {
	validateHash := operations.PlainHash("validate") + "_" + member.ID
	ctx.registerRTLookup(validateHash)
	base := "(" + validateHash + "?.fn(" + v + ") ?? true)"
	gate := looseCheckGate(member, ctx, v)
	if gate == "" {
		return base
	}
	return "(" + base + " && " + gate + ")"
}

// looseCheckGate mirrors mion's getChildValidateWithLooseCheck
// (union.ts:56-78). Returns the additional property-presence gate
// when a union member is an all-optional object-like type with no
// index signature; returns "" when no gate is needed (member is not
// object-like, has at least one required prop, or carries an index
// signature). The gate shape is:
//
//	(("p1" in v) || ("p2" in v) || ... || Object.keys(v).length === 0)
//
// which encodes TS's weak-type rule: a value matches an all-optional
// shape only if at least one of its declared props is present OR the
// value is the empty object.
func looseCheckGate(member *protocol.RunType, ctx *EmitContext, v string) string {
	if member.Kind != protocol.KindObjectLiteral && member.Kind != protocol.KindClass {
		return ""
	}
	var propNames []string
	for _, childRef := range member.Children {
		child := ctx.ResolveRef(childRef)
		if child == nil {
			continue
		}
		// Index signatures absorb arbitrary keys — TS doesn't require
		// any specific prop to be present, so the loose-check doesn't
		// apply.
		if child.Kind == protocol.KindIndexSignature {
			return ""
		}
		if child.Kind != protocol.KindProperty && child.Kind != protocol.KindPropertySignature {
			continue
		}
		// One required prop means the bare validate already enforces
		// presence — no extra gate needed.
		if !child.Optional {
			return ""
		}
		propNames = append(propNames, child.Name)
	}
	if len(propNames) == 0 {
		return ""
	}
	parts := make([]string, 0, len(propNames)+1)
	for _, name := range propNames {
		parts = append(parts, "("+quoteJS(name)+" in "+v+")")
	}
	parts = append(parts, "Object.keys("+v+").length === 0")
	return "(" + strings.Join(parts, " || ") + ")"
}

// emitNativeIterablePrepareForJson handles Map / Set — mirrors mion's
// nodes/native/Iterable.ts:49-65 emitPrepareForJson. For each entry,
// the wrapped child types (KindParameter wrappers in rt.Arguments
// carrying SubKindMapKey / SubKindMapValue / SubKindSetItem) get
// their own transform applied. The collected per-entry result is
// staged into a fresh array and v is rebound at the end so
// JSON.stringify sees the array form.
//
// Shape (Map with non-noop value or key, or Set with non-noop element):
//
//	const ml0 = [];
//	for (let e0 of v) {
//	  <key/element transform>; <value transform>;
//	  ml0.push(e0);
//	}
//	v = ml0
//
// Accessors:
//   - Set: the loop binding e0 IS the element (mion's
//     SetKeyRunType.skipSettingAccessor() returns true)
//   - Map: e0 is the [k, v] tuple; accessors are e0[0] (key) and
//     e0[1] (value) — mirrors MapKeyRunType / MapValueRunType
//     useArrayAccessor with index 0 / 1
//
// When every wrapped child compiles to empty (atomic-noop elements
// like Set<string> / Map<string, number>), fall back to the original
// shape `v = Array.from(v)` so the no-loop fast path is preserved
// for already-passing tests.
func emitNativeIterablePrepareForJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == protocol.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)

	entryVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childCodes = append(childCodes, childRT.Code)
		}
	}

	if len(childCodes) == 0 {
		return RTCode{Code: v + " = Array.from(" + v + ")", Type: CodeS}
	}

	resVar := ctx.NextLocalVar("ml")
	body := "const " + resVar + " = []; for (let " + entryVar + " of " + v + ") {" +
		strings.Join(childCodes, ";") + ";" + resVar + ".push(" + entryVar + ")} " +
		v + " = " + resVar
	return RTCode{Code: body, Type: CodeS}
}

// EmitDependencyCall mirrors ValidateEmitter's, with one twist: a
// prepareForJson dependency call mutates v INSIDE the inner function
// (e.g. `return v = v.toString()`) so the outer caller must capture
// the return value to actually see the transformed shape — `v[i0]`
// in the parent's frame won't auto-update from the inner function's
// local rebind. We wrap the call site with the assignment:
//
//	<vλl> = <childHash>.fn(<vλl>)
//
// For nested compounds (Date[][] etc.) the inner function mutates its
// argument array in place AND returns the same reference, so the
// outer assignment is a same-ref no-op semantically — but it KEEPS
// the same shape as the atomic-leaf case (e.g. `v[i0] = childHash.fn(v[i0])`
// where the leaf emits `return v = new Date(v)`), which lets the
// array emit treat dependency-call children identically to inline
// atomic children. Self-recursive calls drop the `.fn` indirection.
func (PrepareForJsonEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize matches mion's handleFunctionReturn for the
// prepareForJson / restoreFromJson family (rtFnCompiler.ts:435):
// empty / identity bodies are rewritten to `return v` and the
// isNoop flag is set to true, but the factory is STILL emitted
// (mion's createRTFunction wraps the body unconditionally). The
// renderer keeps every supported entry as a live factory so
// dep-call chains from parents resolve cleanly — a parent's
// `<childHash>.fn(v[i])` must hit a real fn, even when that fn is
// the identity. Payload cost is ~30 bytes per noop factory.
//
// Mion's `00JsonOnly.spec.ts` asserts `isNoop === true` for shapes
// where no JSON transformation is required (interfaces of primitive
// strings/numbers, tuples of the same, etc.). The flag is exposed
// to consumers on the RTCompiledFn entry so they can short-circuit
// dispatch when round-tripping a noop value.
func (PrepareForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
