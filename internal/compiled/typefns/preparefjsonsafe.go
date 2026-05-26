package typefns

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// PrepareForJsonSafeEmitter — non-mutating sibling of
// PrepareForJsonEmitter. Returns a NEW value containing only the
// declared keys and the transformed leaves; the original input is
// never touched. Pairs with the existing RestoreFromJsonEmitter
// because the wire shape (Date→ISO string, bigint→decimal string,
// flat-union object branch `[-1, merged]`, atomic branch
// `[memberIndex, value]` or untagged per atomicBranchNeedsTuple) is
// byte-for-byte identical to `prepareForJson + JSON.stringify`.
//
// Cost model: one object/array allocation per nested object literal
// in the input. Sub-values for noop leaves (string, number, …) are
// shared by reference between input and output, so the allocation
// footprint is the schema's node count, not the input's value size.
// Compare to the existing `stringifyJson` family which handcrafts
// the JSON string in JS and is ~10× slower than native JSON.stringify;
// this emitter builds a new value and lets native JSON.stringify
// serialise it.
//
// Approach 3 fastpath: when the whole subtree is JSON-compatible
// (`isJsonCompatible` in jsoncompat.go) AND every property is required
// (no `?:` declarations), the object emit gates a runtime
// `Object.keys(v).length === N` check that returns `v` unchanged when
// the input has exactly the declared key count. Mixed-optionality
// shapes always build the clone — the fastpath check would be too
// expensive to short-circuit safely.
type PrepareForJsonSafeEmitter struct{}

func (PrepareForJsonSafeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors PrepareForJsonEmitter.Supports — same set of kinds
// the non-safe sibling handles. The wire format is identical so the
// supported surface stays in lockstep.
func (PrepareForJsonSafeEmitter) Supports(rt *protocol.RunType) bool {
	return PrepareForJsonEmitter{}.Supports(rt)
}

// AnyPrepareForJsonSafeSupported reports whether at least one runtype
// in the slice is supported by the PrepareForJsonSafeEmitter. Used by
// the resolver to set AddedPrepareForJsonSafe independently of
// AddedRunTypes.
func AnyPrepareForJsonSafeSupported(runTypes []*protocol.RunType) bool {
	emitter := PrepareForJsonSafeEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (PrepareForJsonSafeEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// ReturnName is `v` for compatibility with the walker's tail-wrap, but
// most Safe emits return CodeE or CodeRB (their own `return ...`) so
// the walker doesn't actually use this. Noop bodies fall through
// Finalize's `return v` path.
func (PrepareForJsonSafeEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall returns a CodeE-style expression invoking the
// child's precompiled safe-form factory. Differs from
// PrepareForJsonEmitter's version which emits a MUTATION statement
// (`v = <hash>.fn(v)`): Safe emits MUST NEVER mutate the input, so
// the dep-call returns just the value-producing expression
// (`<hash>.fn(v)`). The parent's safe-form composition consumes it
// as an expression slot (e.g. `{inner: <hash>.fn(v.inner)}`).
func (PrepareForJsonSafeEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	args := ctx.Vλl
	isSelf := ctx.walker != nil && childID == ctx.walker.JitFnHash
	if isSelf {
		return ctx.walker.FnName + "(" + args + ")"
	}
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getJIT("+quoteJS(childID)+")")
	}
	return childID + ".fn(" + args + ")"
}

// Finalize mirrors PrepareForJsonEmitter's: empty/identity bodies are
// rewritten to `return v` + isNoop=true so the JS-side noop fastpath
// short-circuits dispatch.
func (PrepareForJsonSafeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

// Emit dispatches the per-kind switch. Each arm returns either:
//
//   - CodeE: a pure JS expression that evaluates to the safe-form of v.
//     The walker wraps with `return <expr>` at root.
//   - CodeRB: a self-returning block (handles its own `return`) used
//     for object literals / arrays / unions whose body needs locals
//     or conditional logic.
//   - Empty CodeS: noop. Finalize collapses to `return v` + isNoop.
//
// Composition rule: when a child emit returns empty Code, the parent
// uses the input accessor (`v.<name>` / `v[i]` / `_e`) directly — that
// expression IS the safe-form because no transform is needed. When the
// child returns CodeE, the parent uses that expression.
func (PrepareForJsonSafeEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		// Atomic JSON-compatible kinds — Finalize collapses to noop.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindNever:
		return JitThrow("Never type cannot be encoded to JSON.")

	case protocol.KindBigInt:
		return JitCode{Code: v + ".toString()", Type: CodeE}

	case protocol.KindSymbol:
		return JitCode{Code: "'Symbol:' + (" + v + ".description || '')", Type: CodeE}

	case protocol.KindRegexp:
		return JitCode{Code: v + ".toString()", Type: CodeE}

	case protocol.KindVoid:
		return JitCode{Code: "undefined", Type: CodeE}

	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate:
			return JitCode{Code: v + ".toISOString()", Type: CodeE}
		case protocol.SubKindNone:
			return emitObjectPrepareForJsonSafe(rt, ctx, v)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterablePrepareForJsonSafe(rt, ctx, v)
		case protocol.SubKindNonSerializable:
			return JitThrow("Jit compilation disabled for Non Serializable types.")
		}
		return JitCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		return JitThrow("Jit compilation disabled for Non Serializable types.")

	case protocol.KindObjectLiteral:
		return emitObjectPrepareForJsonSafe(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignaturePrepareForJsonSafe(rt, ctx, v)

	case protocol.KindTuple:
		return emitTuplePrepareForJsonSafe(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		return JitThrow("Compile function PrepareForJson not supported, call compileParams or compileReturn instead.")

	case protocol.KindUnion:
		return emitUnionPrepareForJsonSafe(rt, ctx, v)

	case protocol.KindIntersection:
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindTemplateLiteral:
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindLiteral:
		return emitLiteralPrepareForJsonSafe(rt, v)

	case protocol.KindArray:
		return emitArrayPrepareForJsonSafe(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		// Properties are normally consumed inline by their parent object
		// (emitObjectPrepareForJsonSafe iterates rt.Children and compiles
		// each property's .Child directly). This arm catches the rare case
		// of a Property reached at root — same noop emit as the non-safe
		// sibling.
		return JitCode{Code: "", Type: CodeS}

	case protocol.KindTupleMember:
		// Same as Property — tuple members are consumed inline by their
		// parent tuple (emitTuplePrepareForJsonSafe iterates and dispatches
		// per-member directly).
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJsonSafe — literal-flavoured atomic kinds:
// bigint / symbol / regexp literals carry a Flags marker and use the
// same transform as the bare kind. Primitive literals are noops.
func emitLiteralPrepareForJsonSafe(rt *protocol.RunType, v string) JitCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	if flagSet["bigint"] {
		return JitCode{Code: v + ".toString()", Type: CodeE}
	}
	if flagSet["symbol"] {
		return JitCode{Code: "'Symbol:' + (" + v + ".description || '')", Type: CodeE}
	}
	if entry, isMap := rt.Literal.(map[string]any); isMap {
		if _, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			return JitCode{Code: v + ".toString()", Type: CodeE}
		}
	}
	return JitCode{Code: "", Type: CodeS}
}

// safeChildExpr is the composition primitive: returns a JS expression
// that evaluates to the safe-form of `accessor`, by compiling the
// child ref with `accessor` set as the input. Empty child code means
// the child is noop — the safe-form IS the accessor.
func safeChildExpr(childRef *protocol.RunType, accessor string, ctx *EmitContext) (string, bool) {
	ctx.SetChildAccessor(accessor)
	childJit := ctx.CompileChild(childRef, CodeE)
	ctx.SetChildAccessor("")
	if childJit.Type == CodeNS {
		return "", false
	}
	if childJit.Code == "" {
		return accessor, true
	}
	// CodeRB / CodeS results need to be wrapped in an IIFE to fit an
	// expression slot. CompileChild already handles this via the walker's
	// handleCodeInterpolation when called with CodeE expected; defensive
	// catch here in case a child emit returns CodeRB at a level we don't
	// expect.
	if childJit.Type == CodeS || childJit.Type == CodeRB {
		return "(function(){" + childJit.Code + "})()", true
	}
	return childJit.Code, true
}

// safePropEmit captures one declared property's compiled safe-form
// expression plus the metadata the parent object emit needs to assemble
// the final clone (key name, isSafeName for bracket-vs-dot, optional
// flag, the input accessor for the undefined check).
type safePropEmit struct {
	name       string
	isSafeName bool
	optional   bool
	accessor   string // input accessor `v.<name>` for the undefined check
	expr       string // safe-form expression evaluated against `accessor`
}

// emitObjectPrepareForJsonSafe — Approach 1 + 3 implementation for
// ObjectLiteral / Class<None>. Builds a CodeRB block that returns a
// new object containing only declared keys with transformed leaves.
//
// Approach 3 fastpath: if every property is required AND every prop's
// child type is JSON-compatible, the body short-circuits to `return v`
// when `Object.keys(v).length === N`. Mixed-optionality / has-transform
// shapes always clone.
func emitObjectPrepareForJsonSafe(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	var props []safePropEmit
	var indexSigs []*protocol.RunType
	// `allExtraProof` is the stricter Approach-3 fastpath gate — a
	// nested object child might be `isJsonCompatible` per the TYPE but
	// could carry extras at runtime, so the outer's `return v` shortcut
	// would leak those nested extras. Restricting the fastpath to
	// extra-proof children (primitives, enums, arrays-of-primitives, …)
	// keeps the optimisation safe.
	allExtraProof := true
	allRequired := true
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			// Defer; emit a for-in tail below to copy non-declared keys
			// with the index sig's child transform applied.
			indexSigs = append(indexSigs, resolved)
			allExtraProof = false // index sig dynamic keys can't be passed through
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
		if isFunctionLikeKind(propResolved.Kind) {
			continue
		}
		accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			return JitCode{Code: "", Type: CodeNS}
		}
		if !isExtraProof(propResolved, ctx) {
			allExtraProof = false
		}
		if resolved.Optional {
			allRequired = false
		}
		props = append(props, safePropEmit{
			name:       resolved.Name,
			isSafeName: resolved.IsSafeName,
			optional:   resolved.Optional,
			accessor:   accessor,
			expr:       expr,
		})
	}

	// When there's an index signature, we must walk every key on v at
	// runtime — the fastpath / accumulator-only path doesn't apply.
	if len(indexSigs) > 0 {
		return buildSafeIndexSignatureObject(v, props, indexSigs, ctx)
	}

	if len(props) == 0 {
		// No serializable declared properties — the safe-form is `{}`
		// regardless of v's content (strips ALL extras).
		return JitCode{Code: "return {}", Type: CodeRB}
	}

	// Approach 3 fastpath: only applies when EVERY prop is required AND
	// every prop's value type is extra-proof (primitive or composite of
	// primitives — nested objects could carry runtime extras even
	// when their type says otherwise). In that case the declared-key
	// clone equals `v` whenever `Object.keys(v).length === N`, so we
	// skip the allocation on clean inputs.
	fastpath := allExtraProof && allRequired
	cloneExpr := buildSafeObjectLiteral(props, v, ctx.walker.PreserveExtras)
	if fastpath {
		body := "if (Object.keys(" + v + ").length === " + strconv.Itoa(len(props)) + ") return " + v + ";" +
			"return " + cloneExpr
		return JitCode{Code: body, Type: CodeRB}
	}
	return JitCode{Code: "return " + cloneExpr, Type: CodeRB}
}

// buildSafeIndexSignatureObject — emits a CodeRB block that builds a
// new object whose keys are: (a) every declared property the parent
// resolved, with its safe-form transform; (b) every OTHER key of v that
// matches at least one of the index signatures, with the matching index
// sig's child transform applied. Declared keys are NOT walked by the
// for-in loop (their assignments come AFTER and would otherwise be
// overridden by raw index-sig values).
func buildSafeIndexSignatureObject(v string, props []safePropEmit, indexSigs []*protocol.RunType, ctx *EmitContext) JitCode {
	var b strings.Builder
	b.WriteString("const _r = {};")
	// Build the per-index-sig arms inside one for-in over v.
	type sigArm struct {
		keyRegexVar string
		valueExpr   string
	}
	arms := make([]sigArm, 0, len(indexSigs))
	keyVar := ctx.NextLocalVar("k")
	for _, sig := range indexSigs {
		if isSymbolKeyedIndexSig(sig, ctx) {
			continue
		}
		resolved := ctx.ResolveRef(sig.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		keyRegexVar := ""
		if sig.Index != nil {
			indexResolved := ctx.ResolveRef(sig.Index)
			if indexResolved != nil && indexResolved.Kind == protocol.KindTemplateLiteral {
				if regex, ok := buildTemplateLiteralRegex(indexResolved); ok {
					keyRegexVar = ctx.NextLocalVar("reIdx")
					if !ctx.HasContextItem(keyRegexVar) {
						ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
					}
				}
			}
		}
		accessor := v + "[" + keyVar + "]"
		expr, ok := safeChildExpr(sig.Child, accessor, ctx)
		if !ok {
			return JitCode{Code: "", Type: CodeNS}
		}
		arms = append(arms, sigArm{keyRegexVar: keyRegexVar, valueExpr: expr})
	}
	if len(arms) > 0 {
		b.WriteString("for (const ")
		b.WriteString(keyVar)
		b.WriteString(" in ")
		b.WriteString(v)
		b.WriteString(") {")
		// Skip declared keys so the explicit declared-prop assignments
		// below own the slot (their transformed value wins).
		if len(props) > 0 {
			var declaredCheck strings.Builder
			declaredCheck.WriteString("if (")
			for i, p := range props {
				if i > 0 {
					declaredCheck.WriteString(" || ")
				}
				declaredCheck.WriteString(keyVar)
				declaredCheck.WriteString(" === ")
				declaredCheck.WriteString(quoteJS(p.name))
			}
			declaredCheck.WriteString(") continue;")
			b.WriteString(declaredCheck.String())
		}
		// Emit each sig's value assignment, gated by its key regex if any.
		for _, arm := range arms {
			if arm.keyRegexVar != "" {
				b.WriteString("if (")
				b.WriteString(arm.keyRegexVar)
				b.WriteString(".test(")
				b.WriteString(keyVar)
				b.WriteString(")) { _r[")
				b.WriteString(keyVar)
				b.WriteString("] = ")
				b.WriteString(arm.valueExpr)
				b.WriteString("; continue; }")
			} else {
				b.WriteString("_r[")
				b.WriteString(keyVar)
				b.WriteString("] = ")
				b.WriteString(arm.valueExpr)
				b.WriteString(";")
			}
		}
		b.WriteString("}")
	}
	// Emit declared-property assignments AFTER the for-in so they win
	// any conflict (the for-in already skips declared names via the
	// `if (k === 'a' || …) continue;` guard, but in case of an empty
	// arms list we still need the declared writes).
	for _, p := range props {
		if p.optional {
			b.WriteString("if (")
			b.WriteString(p.accessor)
			b.WriteString(" !== undefined) _r[")
			b.WriteString(quoteJS(p.name))
			b.WriteString("] = ")
			b.WriteString(p.expr)
			b.WriteString(";")
		} else {
			b.WriteString("_r[")
			b.WriteString(quoteJS(p.name))
			b.WriteString("] = ")
			b.WriteString(p.expr)
			b.WriteString(";")
		}
	}
	b.WriteString("return _r")
	return JitCode{Code: b.String(), Type: CodeRB}
}

// buildSafeObjectLiteral assembles the JS expression that clones the
// declared keys. For all-required shapes the result is an object
// literal `{a: <expr>, b: <expr>}`. For mixed-optionality shapes we
// build an accumulator IIFE so optional props can be conditionally
// included without per-optional object spreads (a spread allocates a
// temp object per optional, which is wasteful).
//
// Note: this helper assumes len(props) > 0; the parent emit gates
// the empty case separately.
func buildSafeObjectLiteral(props []safePropEmit, sourceV string, preserveExtras bool) string {
	hasOptional := false
	for _, p := range props {
		if p.optional {
			hasOptional = true
			break
		}
	}
	if !hasOptional {
		var b strings.Builder
		b.WriteString("{")
		if preserveExtras {
			b.WriteString("...")
			b.WriteString(sourceV)
			if len(props) > 0 {
				b.WriteString(",")
			}
		}
		for i, p := range props {
			if i > 0 {
				b.WriteString(",")
			}
			b.WriteString(jsonObjectKeyLiteral(p.name, p.isSafeName))
			b.WriteString(":")
			b.WriteString(p.expr)
		}
		b.WriteString("}")
		return b.String()
	}
	// Mixed-optionality — accumulator IIFE.
	var b strings.Builder
	b.WriteString("(function(){const _r={")
	if preserveExtras {
		b.WriteString("...")
		b.WriteString(sourceV)
	}
	first := !preserveExtras
	for _, p := range props {
		if p.optional {
			continue
		}
		if !first {
			b.WriteString(",")
		}
		first = false
		b.WriteString(jsonObjectKeyLiteral(p.name, p.isSafeName))
		b.WriteString(":")
		b.WriteString(p.expr)
	}
	b.WriteString("};")
	for _, p := range props {
		if !p.optional {
			continue
		}
		b.WriteString("if (")
		b.WriteString(p.accessor)
		b.WriteString(" !== undefined) _r[")
		b.WriteString(quoteJS(p.name))
		b.WriteString("]=")
		b.WriteString(p.expr)
		b.WriteString(";")
	}
	b.WriteString("return _r;})()")
	return b.String()
}

// jsonObjectKeyLiteral returns the JS object-literal key form for a
// property name. Safe identifiers (matching /^[a-zA-Z_$][\w$]*$/ per
// IsSafeName) emit as bare identifiers; everything else gets a quoted
// string. Mirrors propertyAccessor's safe-vs-quoted decision.
func jsonObjectKeyLiteral(name string, isSafeName bool) string {
	if isSafeName {
		return name
	}
	return quoteJS(name)
}

// isExtraProof reports whether values of `rt` are guaranteed to carry
// NO extras under any input — stricter than `isJsonCompatible`, which
// describes the TYPE's compatibility but not whether runtime values
// might have undeclared keys. Object literals and classes are never
// extra-proof (any JS object can carry extras at runtime). Arrays /
// tuples / unions are extra-proof iff their leaves are. Primitives,
// enums, literals, Date / bigint after transform, etc — extra-proof.
//
// Used by the Safe emitter to decide when a value can be passed through
// by reference (e.g. `string[]` → return v) vs always cloned
// (`{a: string}[]` → v.map(...) because each object element might
// carry an extra).
//
// Cycle-safe: re-entry on an in-progress ID returns false (a cycle
// always involves an object/class node so the conservative answer is
// "not extra-proof" — we'll clone, which is correct).
func isExtraProof(rt *protocol.RunType, ctx *EmitContext) bool {
	return extraProofRecursive(rt, ctx, make(map[string]struct{}))
}

func extraProofRecursive(rt *protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if _, seen := visited[rt.ID]; seen {
			return false
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {
	case protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindNull, protocol.KindEnum, protocol.KindTemplateLiteral,
		protocol.KindLiteral:
		return true
	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return extraProofRecursive(ctx.ResolveRef(rt.Child), ctx, visited)
	case protocol.KindTuple:
		for _, child := range rt.Children {
			if !extraProofRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true
	case protocol.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return extraProofRecursive(ctx.ResolveRef(rt.Child), ctx, visited)
	case protocol.KindUnion:
		children := rt.SafeUnionChildren
		if len(children) == 0 {
			children = rt.Children
		}
		for _, child := range children {
			if !extraProofRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true
	}
	return false
}

// emitArrayPrepareForJsonSafe — when the element type is extra-proof
// the whole array is noop: the input array can be shared by reference
// because JSON.stringify ignores non-index properties on arrays so
// there are no extras to strip at the array level itself, AND the
// elements are guaranteed not to carry extras either. Otherwise emit
// `v.map(function(_e){return <safeExpr>})`.
func emitArrayPrepareForJsonSafe(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	resolvedChild := ctx.ResolveRef(rt.Child)
	if resolvedChild != nil && isNonSerializableElementKind(resolvedChild.Kind) {
		return JitThrow("Arrays can not have non serializable types, ie: Symbol[], Function[], etc.")
	}
	if isExtraProof(resolvedChild, ctx) {
		return JitCode{Code: "", Type: CodeS}
	}
	elemVar := ctx.NextLocalVar("e")
	expr, ok := safeChildExpr(rt.Child, elemVar, ctx)
	if !ok {
		return JitCode{Code: "", Type: CodeNS}
	}
	return JitCode{Code: v + ".map(function(" + elemVar + "){return " + expr + "})", Type: CodeE}
}

// emitTuplePrepareForJsonSafe — fast noop when every member is
// extra-proof; otherwise emit a tuple literal with per-position safe
// expressions. Rest members emit a tail spread of mapped elements.
func emitTuplePrepareForJsonSafe(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if len(rt.Children) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	if isExtraProof(rt, ctx) {
		return JitCode{Code: "", Type: CodeS}
	}
	var parts []string
	restPart := ""
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind != protocol.KindTupleMember {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		propResolved := ctx.ResolveRef(resolved.Child)
		if propResolved == nil || isFunctionLikeKind(propResolved.Kind) {
			// Function-typed slot — emit `null` so the array length is
			// preserved on the wire (functions don't serialize).
			parts = append(parts, "null")
			continue
		}
		if isRestTupleMember(resolved) {
			// Rest tail: spread a mapped slice over the remaining elements.
			elemVar := ctx.NextLocalVar("e")
			expr, ok := safeChildExpr(resolved.Child, elemVar, ctx)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			start := positionStr(resolved)
			restPart = "..." + v + ".slice(" + start + ").map(function(" + elemVar + "){return " + expr + "})"
			break
		}
		idx := positionStr(resolved)
		accessor := v + "[" + idx + "]"
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			return JitCode{Code: "", Type: CodeNS}
		}
		if resolved.Optional {
			// Replace `undefined` slots with `null` so the JSON form
			// preserves the slot, matching mion's tuple semantic for
			// optionals at non-trailing positions.
			expr = "(" + accessor + " === undefined ? null : " + expr + ")"
		}
		parts = append(parts, expr)
	}
	if restPart != "" {
		parts = append(parts, restPart)
	}
	if len(parts) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}
	return JitCode{Code: "[" + strings.Join(parts, ",") + "]", Type: CodeE}
}

// emitIndexSignaturePrepareForJsonSafe — produces a new object whose
// keys are filtered by the (optional) template-literal key regex and
// whose values are the child's safe transform applied to the original
// value. Symbol-keyed sigs are dropped per mion's skipJit rule.
func emitIndexSignaturePrepareForJsonSafe(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	if rt.Child == nil {
		return JitCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return JitCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return JitCode{Code: "", Type: CodeS}
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
	accessor := v + "[" + keyVar + "]"
	expr, ok := safeChildExpr(rt.Child, accessor, ctx)
	if !ok {
		return JitCode{Code: "", Type: CodeNS}
	}
	body := "const _r = {};for (const " + keyVar + " in " + v + ") {"
	if keyRegexVar != "" {
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body += "_r[" + keyVar + "] = " + expr + ";}return _r"
	return JitCode{Code: body, Type: CodeRB}
}

// emitUnionPrepareForJsonSafe — cloning, non-mutating variant of
// emitUnionPrepareForJsonFlat. Produces the flat-union wire shape
// (object branch wraps as `[-1, mergedObject]`; atomic branch wraps
// as `[memberIndex, value]` when layout.AtomicNeedsTuple, raw
// otherwise) so the result decodes through the existing flat
// restoreFromJson. Each clause returns a NEW value built from
// safeChildExpr / buildSafeObjectLiteral; the input is never touched.
func emitUnionPrepareForJsonSafe(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	var clauses []string

	for _, m := range layout.AtomicMembers {
		memberExpr, ok := safeChildExpr(m.Ref, v, ctx)
		if !ok {
			return JitCode{Code: "", Type: CodeNS}
		}
		isTypeExpr := unionMemberIsTypeCheck(m.Resolved, ctx, v)
		guard := isTypeExpr
		if isObjectLikeKind(m.Resolved.Kind) {
			guard = "(typeof " + v + " === 'object' && " + v + " !== null && " + isTypeExpr + ")"
		}
		var resultExpr string
		if layout.AtomicNeedsTuple {
			resultExpr = "[" + strconv.Itoa(m.OriginalIndex) + "," + memberExpr + "]"
		} else {
			resultExpr = memberExpr
		}
		clauses = append(clauses, "if ("+guard+") return "+resultExpr+";")
	}

	if len(layout.ObjectMembers) > 0 {
		var props []safePropEmit
		for _, mp := range layout.MergedProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propExpr, ok := emitMergedPropPrepareSafe(mp, accessor, ctx)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			props = append(props, safePropEmit{
				name:       mp.Name,
				isSafeName: mp.IsSafeName,
				optional:   !mp.Required,
				accessor:   accessor,
				expr:       propExpr,
			})
		}
		objLit := buildSafeObjectLiteral(props, v, ctx.walker.PreserveExtras)
		guard := "(typeof " + v + " === 'object' && " + v + " !== null)"
		clauses = append(clauses, "if ("+guard+") return [-1, "+objLit+"];")
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	body := strings.Join(clauses, " ") + " throw new Error(" + errVar + ")"
	return JitCode{Code: body, Type: CodeRB}
}

// emitMergedPropPrepareSafe returns the safe-form EXPRESSION for one
// merged property's value (cloning analog of emitMergedPropPrepare).
// Single-candidate → safeChildExpr. Multi-candidate no-sub-wrap →
// identity (accessor). Multi-candidate with sub-wrap → IIFE that
// dispatches per candidate and returns `[subIdx, safeExpr]`.
func emitMergedPropPrepareSafe(mp FlatMergedProp, accessor string, ctx *EmitContext) (string, bool) {
	if len(mp.Candidates) == 1 {
		return safeChildExpr(mp.Candidates[0].ChildRef, accessor, ctx)
	}
	if !mp.NeedsSubWrap {
		return accessor, true
	}
	var arms []string
	for i, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		candExpr, ok := safeChildExpr(cand.ChildRef, accessor, ctx)
		if !ok {
			return "", false
		}
		isTypeExpr := unionMemberIsTypeCheck(cand.Resolved, ctx, accessor)
		guard := isTypeExpr
		if isObjectLikeKind(cand.Resolved.Kind) {
			guard = "(typeof " + accessor + " === 'object' && " + accessor + " !== null && " + isTypeExpr + ")"
		}
		arms = append(arms, "if ("+guard+") return ["+strconv.Itoa(i)+", "+candExpr+"];")
	}
	if len(arms) == 0 {
		return accessor, true
	}
	return "(function(){" + strings.Join(arms, " ") + "})()", true
}

// emitNativeIterablePrepareForJsonSafe handles Map / Set safely:
// returns a NEW array of safe-form entries (no mutation of v).
func emitNativeIterablePrepareForJsonSafe(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	isMap := rt.SubKind == protocol.SubKindMap
	var innerTypes []*protocol.RunType
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		innerTypes = []*protocol.RunType{keyType, valueType}
	} else {
		innerTypes = []*protocol.RunType{setItemType(rt, ctx)}
	}
	// Fast path: every inner type JSON-compatible → just Array.from(v).
	allCompat := true
	for _, t := range innerTypes {
		if t == nil {
			continue
		}
		if !isJsonCompatible(t, ctx) {
			allCompat = false
			break
		}
	}
	if allCompat {
		return JitCode{Code: "Array.from(" + v + ")", Type: CodeE}
	}
	entryVar := ctx.NextLocalVar("e")
	var entryParts []string
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
			return JitCode{Code: "", Type: CodeNS}
		}
		entryParts = append(entryParts, expr)
	}
	var perEntry string
	if isMap {
		perEntry = "[" + strings.Join(entryParts, ",") + "]"
	} else {
		perEntry = entryParts[0]
	}
	return JitCode{Code: "Array.from(" + v + ", function(" + entryVar + "){return " + perEntry + "})", Type: CodeE}
}
