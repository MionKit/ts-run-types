package typefns

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// HasUnknownKeysEmitter implements the `hasUnknownKeys` rt function —
// a boolean predicate that returns true if the value (or any nested
// child) carries property keys not declared in the schema. Ported from
// mion's emitHasUnknownKeys methods on InterfaceRunType, MemberRunType,
// IterableRunType, etc.
//
// Arg shape mirrors mion's `rtArgsWithOptions` (constants.functions.ts:49):
// the function takes (v, opts) where opts is a runtime options bag
// carrying `checkNonRTProps` — when true, the keys-list against which
// unknown is decided expands from RT children to ALL children (including
// function-typed / static / non-serialisable ones that the schema lists
// but the RT skipped). Default false: any key not in the RT-children
// list is unknown.
type HasUnknownKeysEmitter struct{}

// Args mirrors mion's rtArgsWithOptions = {vλl: 'v', θpts: 'opts'}.
// `opts` defaults to `{}` so callers can invoke `huk(v)` without
// explicitly passing the options bag.
func (HasUnknownKeysEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "θpts", Name: "opts", Default: "{}"},
	}
}

// Supports gates the renderer's top-level loop. Same set as the
// prepareForJson / validationErrors emitters in Phase 0 (every kind a
// real codegen pass will need to either handle or transparently
// no-op). Atomic kinds emit empty body via Emit and Finalize folds
// that to `return false` for the noop case.
func (HasUnknownKeysEmitter) Supports(rt *protocol.RunType) bool {
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
		protocol.KindLiteral, protocol.KindEnum,
		protocol.KindNever, protocol.KindTemplateLiteral:
		return true
	case protocol.KindObjectLiteral:
		return true
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone,
			protocol.SubKindMap, protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return true
		}
		return protocol.IsTemporalSubKind(rt.SubKind)
	case protocol.KindArray:
		return rt.Child != nil
	case protocol.KindTuple:
		return true
	case protocol.KindTupleMember:
		return true
	case protocol.KindProperty, protocol.KindPropertySignature:
		return true
	case protocol.KindIndexSignature:
		return true
	case protocol.KindUnion:
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		return true
	case protocol.KindPromise:
		// mion: Promise wraps don't track unknown keys (the value is a
		// then-able, not a plain object). Same noop stance as atomic.
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// Function values aren't objects with enumerable own keys to
		// check; mion's function emit is a noop. Same here.
		return true
	}
	return false
}

func (HasUnknownKeysEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// ReturnName is `v` — mion's hasUnknownKeys returns the value? No:
// `returnName: rtArgsWithOptions.vλl` (constants.functions.ts:153)
// means the SOURCE-LEVEL "what's returned by an empty body" is `v`,
// but the BODY itself returns booleans. Mion's Finalize for this
// family rewrites an empty body to `return false` — and the noop
// fast path on the JS side is `() => false`. We honour ReturnName
// as `v` for the walker's statement-shape return wrap, then
// Finalize translates `return v` → `return false`.
func (HasUnknownKeysEmitter) ReturnName() string {
	return "v"
}

// Emit is the per-kind switch. Phase 0 returns empty body for every
// supported kind so the cache module renders end-to-end. Phase 1
// implements the object/interface logic.
func (HasUnknownKeysEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	_ = ctx
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		return emitObjectHasUnknownKeys(rt, ctx)
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindNone:
			return emitObjectHasUnknownKeys(rt, ctx)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableHasUnknownKeys(rt, ctx, ctx.Vλl)
		}
		return RTCode{Code: "", Type: CodeS}
	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyHasUnknownKeys(rt, ctx)
	case protocol.KindArray:
		return emitArrayHasUnknownKeys(rt, ctx)
	case protocol.KindTuple:
		return emitTupleHasUnknownKeys(rt, ctx)
	case protocol.KindTupleMember:
		return emitTupleMemberHasUnknownKeys(rt, ctx)
	case protocol.KindIndexSignature:
		return emitIndexSignatureHasUnknownKeys(rt, ctx)
	case protocol.KindUnion:
		return emitUnionHasUnknownKeys(rt, ctx)
	}
	// All atomic / non-composite kinds — noop.
	return RTCode{Code: "", Type: CodeS}
}

// EmitDependencyCall — composite parents may need to invoke a child's
// hasUnknownKeys factory. The call shape mirrors mion's: pass v + opts
// through unchanged.
func (HasUnknownKeysEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	optsArg := ctx.ArgName("θpts")
	return ctx.emitDepCall(childID, ctx.Vλl+","+optsArg, "")
}

// Finalize matches mion's handleFunctionReturn for hasUnknownKeys:
// empty body → `return false`, noop=true. Other shapes wrap to
// `return <expr>` per the walker's CodeE → "return <expr>" handling.
func (HasUnknownKeysEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := trimWhitespace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return false", true
	}
	return code, false
}

// emitObjectHasUnknownKeys ports mion's
// InterfaceRunType.emitHasUnknownKeys (interface.ts:147-156). Two
// pieces combined with `||`:
//
//  1. Parent check: callCheckUnknownProperties evaluates whether THIS
//     object has any unknown keys (returns a JS expression). Suppressed
//     when an index-signature child is present (any key matching the
//     index pattern is "known").
//  2. Children check: each non-skip property's own hasUnknownKeys
//     (recursed via CompileChild). Atomic-typed children contribute
//     nothing.
//
// Phase 1 placeholder — full implementation follows.
func emitObjectHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	return emitInterfaceHasUnknownKeys(rt, ctx)
}

func emitInterfaceHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	parts, hasIndex := collectObjectHasUnknownKeysChildren(rt, ctx)
	parentExpr := ""
	if !hasIndex {
		parentExpr = callCheckUnknownPropertiesForHas(rt, ctx, false)
	}
	expressions := []string{}
	if parentExpr != "" {
		expressions = append(expressions, parentExpr)
	}
	expressions = append(expressions, parts...)
	if len(expressions) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}
	return RTCode{Code: joinOr(expressions), Type: CodeE}
}

// emitPropertyHasUnknownKeys handles KindProperty / KindPropertySignature.
// Sets the child accessor (`v.<name>`) and recurses. Optional properties
// guard the descent with `<accessor> !== undefined ? <childCode> : false`.
func emitPropertyHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
	}
	if resolved.IsStatic {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{Code: "(" + accessor + " !== undefined && (" + childRT.Code + "))", Type: CodeE}
	}
	return RTCode{Code: childRT.Code, Type: CodeE}
}

// emitArrayHasUnknownKeys ports mion's
// ArrayRunType.emitHasUnknownKeys (array.ts:94-114). Atomic element →
// noop. Otherwise iterate elements; if any reports true, return true.
//
// Returns CodeRB because the body is a `for + return false` block.
func emitArrayHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	// mion: `if (this.getMemberType().getFamily() === 'A') return undefined`
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	iVar := ctx.NextLocalVar("i")
	resVar := ctx.NextLocalVar("res")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	body := "if (!Array.isArray(" + v + ")) return false;" +
		"for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
		"const " + resVar + " = " + childRT.Code + ";" +
		"if (" + resVar + ") return true;" +
		"}" +
		"return false"
	return RTCode{Code: body, Type: CodeRB}
}

// emitTupleHasUnknownKeys mirrors CollectionRunType.emitHasUnknownKeys
// for tuples — each member's own emit, OR-joined.
func emitTupleHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}
	return RTCode{Code: joinOr(parts), Type: CodeE}
}

// emitTupleMemberHasUnknownKeys: descend into the wrapped child. Rest
// members iterate from the position; regular members use a single
// element accessor. Atomic-typed wrapped types contribute nothing.
func emitTupleMemberHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("res")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeE}
		}
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
			"const " + resVar + " = " + childRT.Code + ";" +
			"if (" + resVar + ") return true;}return false"
		return RTCode{Code: body, Type: CodeRB}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{Code: "(" + accessor + " !== undefined && (" + childRT.Code + "))", Type: CodeE}
	}
	return RTCode{Code: childRT.Code, Type: CodeE}
}

// emitIndexSignatureHasUnknownKeys ports mion's
// IndexSignatureRunType.emitHasUnknownKeys (indexProperty.ts:103-121).
// When the value type is atomic AND there's no key pattern, every key
// is "known" — emit nothing. Otherwise iterate `for (const k in v)`,
// checking the pattern (if any) and recursing into the value.
func emitIndexSignatureHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	// Symbol-keyed sigs are skipped from RT compilation per mion's
	// IndexSignatureRunType.skipRT (indexProperty.ts:30-36). Empty
	// CodeE drops the sig from the parent's OR chain; if this is the
	// root, Finalize collapses the empty body to `return false`.
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
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
	// Atomic value + no key pattern → every key is "known" already.
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic && keyRegexVar == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	prop := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + prop + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	patternCheck := ""
	if keyRegexVar != "" {
		patternCheck = "if (!" + keyRegexVar + ".test(" + prop + ")) return true;"
	}
	childCheck := ""
	if childRT.Code != "" {
		resVar := ctx.NextLocalVar("res")
		childCheck = "const " + resVar + " = " + childRT.Code + ";if (" + resVar + ") return true;"
	}
	if patternCheck == "" && childCheck == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternCheck + childCheck + "}return false"
	return RTCode{Code: body, Type: CodeRB}
}

// emitUnionHasUnknownKeys — walks the merged-allowlist via the shared
// helper. Returns CodeRB wrapping the loop in an IIFE that yields
// `true` on the first undeclared key, `false` otherwise. The legacy
// per-member dispatch (CompileChild + joinOr) silently mis-reported
// hits because each member's own emit ran against the entire value
// regardless of which union arm matched at runtime.
func emitUnionHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, _, _ string) string {
			return "return true"
		},
		CodeShape: CodeE,
	})
}

// emitNativeIterableHasUnknownKeys mirrors mion's
// IterableRunType.emitHasUnknownKeys (nodes/native/Iterable.ts:86-103).
// For each entry in the Map/Set, runs the wrapped child's
// hasUnknownKeys expression; returns true on the first hit. When every
// wrapped child compiles to a noop (e.g. Set<string>, Map<string, number>
// where neither key nor value carries an object with extras), the entire
// iteration is elided — Finalize folds the empty body into `return false`.
//
// Accessors:
//   - Set: the loop binding `e0` IS the element (no array unwrap)
//   - Map: `e0` is the `[key, value]` tuple; `e0[0]` is key, `e0[1]` is
//     value — matches the prepare/restore-side accessor convention used
//     elsewhere (mion's MapKeyRunType / MapValueRunType useArrayAccessor).
func emitNativeIterableHasUnknownKeys(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == protocol.SubKindMap
	ctorName := "Map"
	if !isMap {
		ctorName = "Set"
	}

	var innerTypes []*protocol.RunType
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		innerTypes = []*protocol.RunType{keyType, valueType}
	} else {
		innerTypes = []*protocol.RunType{setItemType(rt, ctx)}
	}

	entryVar := ctx.NextLocalVar("e")
	var childChecks []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childChecks = append(childChecks, "if ("+childRT.Code+") return true;")
		}
	}

	if len(childChecks) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}

	body := "if (!(" + v + " instanceof " + ctorName + ")) return false;" +
		"for (const " + entryVar + " of " + v + ") {" +
		strings.Join(childChecks, "") +
		"} return false"
	return RTCode{Code: body, Type: CodeRB}
}
