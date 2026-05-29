package typefns

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// StringifyJsonEmitter implements the `stringifyJson` rt function —
// mion's single-pass JSON serialiser that builds the output string
// directly from the TYPE rather than mutating `v` in place and
// delegating to JSON.stringify. Extras are stripped by construction:
// the emit walks declared members only, so unknown keys never reach
// the output regardless of what's on `v`.
//
// Paired with RestoreFromJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(stringifyJson(v)))` must deep-equal v
// for every valid sample. Output is observably equivalent to
// `JSON.stringify(prepareForJson(v))` modulo property order (mion
// sorts optional members first; we keep declaration order — see
// docs/port-status.md "Intentional deviations from mion") and the
// no-mutation contract on `v`.
//
// Mirrors mion's per-kind switch in
// mion/packages/run-types/src/rtCompilers/json/stringifyJson.ts
// (`createStringifyCompiler`).
type StringifyJsonEmitter struct{}

// Args — same single-arg shape as prepareForJson; the value to
// stringify enters via `v`.
func (StringifyJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. Mirrors mion's
// stringifyJson which supports every reflection kind (some via
// emit-time throws — see Emit below). Function-shaped kinds at root
// throw at emit; function-shaped as object-property children get
// dropped at the parent loop.
func (StringifyJsonEmitter) Supports(rt *protocol.RunType) bool {
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
		return true
	case protocol.KindArray:
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
		return len(rt.Children) > 0
	case protocol.KindIntersection:
		return true
	case protocol.KindTemplateLiteral:
		return true
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		return true
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate, protocol.SubKindNone,
			protocol.SubKindMap, protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return true
		}
		return false
	case protocol.KindPromise:
		return true
	}
	return false
}

// AnyStringifyJsonSupported reports whether at least one runtype in
// the slice is supported by the StringifyJsonEmitter.
func AnyStringifyJsonSupported(runTypes []*protocol.RunType) bool {
	emitter := StringifyJsonEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsRTInlined delegates to DefaultIsRTInlined — same heuristics as
// prepareForJson.
func (StringifyJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// ReturnName is `v` — but the emit body returns a JSON string built
// from `v`, not `v` itself. The arg name is kept for parity with the
// other families.
func (StringifyJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors the body of
// mion's `createStringifyCompiler` switch
// (rtCompilers/json/stringifyJson.ts:41).
//
// Convention: every arm returns a JS expression (CodeE) that
// evaluates to a JSON-encoded string fragment. Root-frame arms
// produce a complete JSON document; nested arms produce a fragment
// the parent emit concatenates with `+`. `IsRoot()` distinguishes
// the two (mirrors mion's `comp.getNestLevel(runType) === 0`).
func (StringifyJsonEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown, protocol.KindObject:
		// mion:stringifyJson.ts:44-46, 100-101 — delegate to
		// JSON.stringify when the type carries no schema info.
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case protocol.KindString, protocol.KindTemplateLiteral:
		// mion:stringifyJson.ts:105-112 — string + template-literal
		// runtime values are plain strings.
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case protocol.KindBigInt:
		// mion:stringifyJson.ts:47-48 — manually-quoted decimal
		// string; matches `JSON.stringify(v.toString())` byte-for-byte
		// but skips one function call.
		return RTCode{Code: "'\"'+" + v + ".toString()+'\"'", Type: CodeE}

	case protocol.KindBoolean:
		// mion:stringifyJson.ts:49-50.
		return RTCode{Code: "(" + v + " ? 'true' : 'false')", Type: CodeE}

	case protocol.KindEnum:
		// mion:stringifyJson.ts:51-53 — number-indexed enums emit the
		// bare value (already a valid JSON number literal at any
		// position); string enums quote via JSON.stringify. The
		// serializer populates RunType.IndexT for every enum so we can
		// branch on the underlying numeric/string kind here.
		if rt.IndexT != nil {
			indexResolved := ctx.ResolveRef(rt.IndexT)
			if indexResolved != nil && indexResolved.Kind == protocol.KindNumber {
				return RTCode{Code: v, Type: CodeE}
			}
		}
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case protocol.KindLiteral:
		return emitLiteralStringifyJson(rt, ctx, v)

	case protocol.KindNever:
		// mion:stringifyJson.ts:90-91 — `Never type cannot be stringified.`
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindNull, protocol.KindNumber:
		// mion:stringifyJson.ts:92-99 — at root, `String(v)` wraps
		// the value into a JS string so the RT fn returns a
		// JSON-parseable result. At non-root, the bare `v` works
		// because the parent concatenates with `+` (auto-stringifies).
		if ctx.IsRoot() {
			return RTCode{Code: "String(" + v + ")", Type: CodeE}
		}
		return RTCode{Code: v, Type: CodeE}

	case protocol.KindRegexp:
		// mion:stringifyJson.ts:102-104.
		return RTCode{Code: "JSON.stringify(" + v + ".toString())", Type: CodeE}

	case protocol.KindSymbol:
		// Unsupported — see docs/UNSUPPORTED-KINDS.md FAQ.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindUndefined:
		// mion:stringifyJson.ts:113-118 — at root, emit `undefined`
		// so the RT fn returns the JS value undefined (top-level
		// undefined is not a valid JSON document). In an array
		// position, emit `'null'` so the slot is JSON-valid. Inside
		// an object, emit `null` (still JSON-valid; the property
		// emit logic handles the optional case separately).
		if ctx.IsRoot() {
			return RTCode{Code: "undefined", Type: CodeE}
		}
		if parentIsArrayLike(ctx) {
			return RTCode{Code: "'null'", Type: CodeE}
		}
		return RTCode{Code: "null", Type: CodeE}

	case protocol.KindVoid:
		// mion:stringifyJson.ts:120-121.
		return RTCode{Code: "undefined", Type: CodeE}

	case protocol.KindArray:
		return emitArrayStringifyJson(rt, ctx, v)

	case protocol.KindObjectLiteral, protocol.KindIntersection:
		return emitObjectStringifyJson(rt, ctx, v)

	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindDate:
			// mion:stringifyJson.ts:405-406 — manually quoted to skip
			// one JSON.stringify call.
			return RTCode{Code: "'\"'+" + v + ".toJSON()+'\"'", Type: CodeE}
		case protocol.SubKindNone:
			structural := emitObjectStringifyJson(rt, ctx, v)
			return wrapStringifyWithClassSerializer(rt, ctx, v, structural)
		case protocol.SubKindMap, protocol.SubKindSet:
			return emitNativeIterableStringifyJson(rt, ctx, v)
		case protocol.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		// mion:stringifyJson.ts:250-252.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyStringifyJson(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignatureStringifyJson(rt, ctx, v)

	case protocol.KindTuple:
		return emitTupleStringifyJson(rt, ctx, v)

	case protocol.KindTupleMember:
		return emitTupleMemberStringifyJson(rt, ctx, v)

	case protocol.KindUnion:
		// Emits JSON for the flat-union wire shape directly (see
		// union_flat.go).
		return emitUnionStringifyJsonFlat(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// mion:stringifyJson.ts:183-187 — function-shaped at root
		// throws; param-shaped is handled by function-param emit
		// (not reachable as a top-level RT fn).
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall mirrors PrepareForJsonEmitter's. stringifyJson
// is a pure read of `v` so the dep-call shape is a plain call —
// `<childHash>.fn(<v>)` returns the child's JSON-string contribution;
// the parent embeds that string into the surrounding JSON shape.
// Self-recursive calls drop the `.fn` indirection.
func (StringifyJsonEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	args := ctx.Vλl
	isSelf := ctx.walker != nil && childID == ctx.walker.RTFnHash
	if isSelf {
		return ctx.walker.FnName + "(" + args + ")"
	}
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getRT("+quoteJS(childID)+")")
	}
	return childID + ".fn(" + args + ")"
}

// Finalize wraps the emitted body in `return …` for expression
// bodies. CodeRB bodies already contain their own `return` statements
// (multi-line for-loop bodies that build a result via local vars).
//
// Atomic-noop kinds collapse to a JSON.stringify(v) noop — there's
// no "true identity" for stringifyJson because the input is a value
// and the output is a string. The skeleton's noop fallback runs
// JSON.stringify at call time.
func (StringifyJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" {
		return "return JSON.stringify(v)", true
	}
	return code, false
}

// emitLiteralStringifyJson — mion:stringifyJson.ts:56-89 defers
// literal kinds to their underlying primitive emit. We replicate
// the dispatch inline based on the literal's Flags / shape.
func emitLiteralStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	if flagSet["bigint"] {
		return RTCode{Code: "'\"'+" + v + ".toString()+'\"'", Type: CodeE}
	}
	if flagSet["symbol"] {
		return RTCode{Code: "JSON.stringify('Symbol:'+(" + v + ".description||''))", Type: CodeE}
	}
	if entry, isMap := rt.Literal.(map[string]any); isMap {
		if _, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			return RTCode{Code: "JSON.stringify(" + v + ".toString())", Type: CodeE}
		}
	}
	// Primitive literal (number / string / boolean / null) — defer
	// to JSON.stringify, which handles each shape correctly. This
	// matches mion's `JSON.stringify(${comp.vλl})` default branch.
	return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}
}

// emitArrayStringifyJson — mion:stringifyJson.ts:125-144. Builds
// the JSON array by mapping each element through the child emit and
// joining with ','.
func emitArrayStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "'[]'", Type: CodeE}
	}
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}
	}
	jsonItems := ctx.NextLocalVar("ls")
	resultVal := ctx.NextLocalVar("res")
	body := "const " + jsonItems + " = []; for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
		"const " + resultVal + " = " + childRT.Code + "; " + jsonItems + ".push(" + resultVal + ");}" +
		" return '[' + " + jsonItems + ".join(',') + ']'"
	return RTCode{Code: body, Type: CodeRB}
}

// emitObjectStringifyJson — mion:stringifyJson.ts:367-401
// (compileStringifyInterface / compileInterfaceIntoArray /
// compileStringifyClass). Two paths matching mion's perf split:
//
//  1. **At least one required child** — static `+` concat with
//     mion's optional-first sort + `skipCommas=true` on the last
//     iteration. Fast — pure string concatenation, no array
//     allocation, no runtime filtering. The optional-first sort
//     guarantees the last child is required (always emits a
//     non-empty fragment), so the trailing-comma logic stays
//     static.
//
//  2. **All children optional** — fallback array-join path mirroring
//     mion's `compileInterfaceIntoArray`. Each prop's emit
//     conditionally contributes (empty string when undefined); the
//     parent runs `[...emits].filter(Boolean).join(',')` to drop
//     gaps and rejoin. Slower (extra array + filter), but correct
//     when every child could be absent at runtime.
//
// Property declaration order within each "optional" group is
// preserved (stable sort).
func emitObjectStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	type pendingChild struct {
		ref      *protocol.RunType
		optional bool
	}
	var pending []pendingChild
	allOptional := true
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
		opt := resolved.Optional
		// Index signatures emit a for-in loop that may produce an
		// empty fragment when the object has no own keys. Treat them
		// as "optional-equivalent" for both the sort and the
		// all-optional check — mion's getJsonStringifySortedChildren
		// + compileInterfaceIntoArray do the same.
		if resolved.Kind == protocol.KindIndexSignature {
			opt = true
		}
		pending = append(pending, pendingChild{ref: child, optional: opt})
		if !opt {
			allOptional = false
		}
	}
	if len(pending) == 0 {
		return RTCode{Code: "'{}'", Type: CodeE}
	}
	// Stable sort, optional-first. Preserves declaration order
	// within each group. For the "at least one required" path the
	// sort guarantees the last iteration lands on a required
	// child — required children always emit a non-empty fragment,
	// so the `skipCommas=true` set on the final iteration cleanly
	// strips the trailing comma. For the "all optional" path the
	// sort has no effect (every child is optional) — the
	// filter-and-join wrap handles correctness regardless of order.
	for i := 1; i < len(pending); i++ {
		for j := i; j > 0; j-- {
			if pending[j-1].optional || !pending[j].optional {
				break
			}
			pending[j-1], pending[j] = pending[j], pending[j-1]
		}
	}

	if allOptional {
		// Array-join fallback — mion's compileInterfaceIntoArray. We
		// run each prop emit with skipCommas=true (no per-prop
		// trailing comma) so the prop returns a bare value fragment
		// or empty string. The outer wrap filters the empties out
		// and rejoins with `,`.
		parts := make([]string, 0, len(pending))
		setSkipCommas(ctx, true)
		for _, p := range pending {
			childRT := ctx.CompileChild(p.ref, CodeE)
			if childRT.Type == CodeNS {
				clearSkipCommas(ctx)
				return RTCode{Code: "", Type: CodeNS}
			}
			if childRT.Code == "" {
				continue
			}
			parts = append(parts, childRT.Code)
		}
		clearSkipCommas(ctx)
		if len(parts) == 0 {
			return RTCode{Code: "'{}'", Type: CodeE}
		}
		// `[a, b, ...].filter(Boolean).join(',')` — Boolean coerces
		// '' to false and any non-empty string to true, so empty
		// entries drop out. Equivalent to mion's `ns.push` + final
		// `ns.join(',')` shape (one allocation + one walk), inlined
		// without the IIFE so the caller still sees a CodeE result.
		return RTCode{Code: "'{'+[" + strings.Join(parts, ",") + "].filter(Boolean).join(',')+'}'", Type: CodeE}
	}

	// At-least-one-required path: static `+` concat. skipCommas set
	// on the last iteration so the trailing required prop omits the
	// comma; preceding props (required and optional alike) include
	// it.
	parts := make([]string, 0, len(pending))
	for i, p := range pending {
		isLast := i == len(pending)-1
		setSkipCommas(ctx, isLast)
		childRT := ctx.CompileChild(p.ref, CodeE)
		if childRT.Type == CodeNS {
			clearSkipCommas(ctx)
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}
	clearSkipCommas(ctx)
	if len(parts) == 0 {
		return RTCode{Code: "'{}'", Type: CodeE}
	}
	return RTCode{Code: "'{'+" + strings.Join(parts, "+") + "+'}'", Type: CodeE}
}

// emitPropertyStringifyJson — mion:stringifyJson.ts:199-216.
// Renders one property as `'"name":' + childCode + ','` (or without
// the trailing comma when the parent flagged skipCommas).
//
// Optional properties: when `v.name` is undefined, the entire
// fragment collapses to the empty string so the JSON object doesn't
// carry a `"name":undefined` slot (invalid JSON) or a dangling
// comma.
func emitPropertyStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, rt.Name)
		return RTCode{Code: "", Type: CodeE}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// Absorb at property — see docs/UNSUPPORTED-KINDS.md.
		if leafCode := ctx.DiagCodeForLeaf(ctx.walker.UnsupportedLeaf); leafCode != "" {
			ctx.walker.EmitDiagnostic(leafCode, rt.Name)
		}
		ctx.walker.AbsorbUnsupported()
		return RTCode{Code: "", Type: CodeE}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	// `"name":` prefix as a JS string literal — double-quoted so the
	// emitted JSON output uses double quotes around the property
	// name (the JSON spec requires them).
	propPrefix := "'" + jsonPropPrefix(rt.Name, rt.IsSafeName) + "'"
	sepCode := "','"
	if getSkipCommas(ctx) {
		sepCode = "''"
	}
	if rt.Optional {
		// `accessor === undefined ? '' : propPrefix + childCode + sep`
		return RTCode{Code: "(" + accessor + " === undefined ? '' : " + propPrefix + "+" + childRT.Code + "+" + sepCode + ")", Type: CodeE}
	}
	return RTCode{Code: propPrefix + "+" + childRT.Code + "+" + sepCode, Type: CodeE}
}

// jsonPropPrefix renders the JS string literal contents (without the
// outer single quotes — the caller wraps them) for one property's
// `"name":` prefix.
//
// Critical detail: the prefix needs to survive TWO levels of
// interpretation — JS parsing of the source literal AND the eventual
// JSON.parse over the emitted output. A property name like
// `weird name \n?` (with a literal newline char) must end up in the
// JSON output as `"weird name \n?"` (with the JSON escape sequence,
// NOT a literal newline — JSON.parse rejects literal control chars
// inside string literals).
//
// Approach:
//   1. JSON-marshal the name to get a valid JSON string literal —
//      `json.Marshal("weird name \n?")` → `"weird name \n?"` (with
//      backslash + n as text).
//   2. JS-escape the result for embedding in a single-quoted JS
//      literal — backslashes and single quotes get escaped.
//   3. Append the `:` separator inside the same JS literal.
//
// When JS evaluates the emitted literal, the result is the
// JSON-encoded property prefix (`"weird name \n?":` as a text
// string). Concatenated into the JSON output, it produces valid
// JSON; JSON.parse then interprets `\n` as a newline char in the
// returned object's key.
func jsonPropPrefix(name string, isSafeName bool) string {
	if isSafeName {
		// Identifier-safe name: emit `"<name>":` directly. No
		// escaping needed — safe names contain only ASCII identifier
		// chars.
		return `"` + name + `":`
	}
	// JSON-encode the name first to produce a valid JSON string
	// literal. Result is bytes like `"weird name \n?"` where the
	// backslash and `n` are SEPARATE characters in the byte stream.
	jsonEncoded, err := json.Marshal(name)
	if err != nil {
		// json.Marshal on a string can't fail under normal
		// circumstances; fall back to the unsafe-escape path on
		// error.
		jsonEncoded = []byte(`"` + name + `"`)
	}
	// Embed inside a single-quoted JS literal — escape backslashes
	// and single quotes so JS evaluates the literal to the original
	// JSON-encoded bytes verbatim.
	return jsEscapeForSingleQuote(string(jsonEncoded)) + ":"
}

// jsEscapeForSingleQuote escapes only the two characters that JS's
// single-quoted-string parser would interpret: backslash and
// single-quote. Mirrors the canonical approach for embedding
// JSON-encoded text inside a JS source literal — JS evaluates the
// literal to recover the original byte sequence, which is then a
// valid JSON fragment ready for concatenation into a larger JSON
// output.
func jsEscapeForSingleQuote(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 4)
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '\'':
			b.WriteString(`\'`)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// emitIndexSignatureStringifyJson — mion:stringifyJson.ts:145-170.
// for-in over the value's own keys, building `"key":value` pairs.
// Symbol-keyed sigs are skipped per the shared isSymbolKeyedIndexSig
// helper (mion's skipRT contract).
func emitIndexSignatureStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
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
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	arr := ctx.NextLocalVar("ls")
	// Separator suffix matches mion's `+","` when not skipping commas
	// after the last property. Index sig results don't know whether
	// they're "last" — mion's heuristic is: when the parent has other
	// children (named props), the index loop's output trails with
	// `,`; when it's the only producer, trailing comma is omitted by
	// the outer wrap. Use the parent's skipCommas flag (same as
	// emitPropertyStringifyJson).
	trailingSep := "+','"
	if getSkipCommas(ctx) {
		trailingSep = ""
	}
	body := "const " + arr + " = []; for (const " + keyVar + " in " + v + ") {" +
		"if (" + v + "[" + keyVar + "] !== undefined) " + arr + ".push(JSON.stringify(" + keyVar + ") + ':' + " + childRT.Code + ");" +
		"} if (!" + arr + ".length) return ''; return " + arr + ".join(',')" + trailingSep
	return RTCode{Code: body, Type: CodeRB}
}

// emitTupleStringifyJson — mion:stringifyJson.ts:269-279.
// `'[' + slotEmits.join('+') + ']'`. Empty tuple → `'[]'`.
func emitTupleStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "'[]'", Type: CodeE}
	}
	parts := make([]string, 0, len(rt.Children))
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
		return RTCode{Code: "'[]'", Type: CodeE}
	}
	return RTCode{Code: "'['+" + strings.Join(parts, "+") + "+']'", Type: CodeE}
}

// emitTupleMemberStringifyJson — mion:stringifyJson.ts:239-249 for
// non-rest slots, mion:stringifyJson.ts:217-238 (the KindRest case)
// for rest slots. Each non-rest slot emits its child code prefixed by
// a separator (`,` unless the slot is at index 0). Optional slots
// emit `'null'` when undefined. Rest slots emit a for-loop that
// builds a `,`-joined string of the trailing items, prefixed by the
// separator and an early-return for the empty-trailing case.
func emitTupleMemberStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if isRestTupleMember(rt) {
		return emitTupleRestStringifyJson(rt, ctx, v)
	}
	if rt.Child == nil {
		// Non-serializable / function-shaped slot — emit `'null'`.
		isFirst := positionInt(rt) == 0
		sep := "','+"
		if isFirst {
			sep = ""
		}
		return RTCode{Code: sep + "'null'", Type: CodeE}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		isFirst := positionInt(rt) == 0
		sep := "','+"
		if isFirst {
			sep = ""
		}
		return RTCode{Code: sep + "'null'", Type: CodeE}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS and the renderer surfaces an
	// alwaysThrow. Emitting bare `'null'` (the previous silent path)
	// produced a lossy stringifier.
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	childCode := childRT.Code
	if childCode == "" {
		childCode = "'null'"
	}
	isFirst := positionInt(rt) == 0
	sep := "','+"
	if isFirst {
		sep = ""
	}
	if rt.Optional {
		return RTCode{Code: "(" + accessor + " === undefined ? " + sep + "'null' : " + sep + childCode + ")", Type: CodeE}
	}
	return RTCode{Code: sep + childCode, Type: CodeE}
}

// emitTupleRestStringifyJson handles the trailing `...rest: T[]` slot
// of a tuple — mion:stringifyJson.ts:217-238 (the KindRest case).
// Emits a for-loop that walks v from the rest's start index, builds
// per-item JSON fragments, and joins with `,`. Early-returns the
// empty string when there are no trailing items. Prefixed with `,`
// when the rest slot is not at position 0.
func emitTupleRestStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	startPos := positionStr(rt)
	isFirst := positionInt(rt) == 0
	sep := "','+"
	if isFirst {
		sep = ""
	}
	if rt.Child == nil {
		// No element type — emit the empty tail.
		return RTCode{Code: sep + "''", Type: CodeE}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: sep + "''", Type: CodeE}
	}
	// Function-typed rest element falls through to CompileChild — the
	// function arm returns CodeNS and the renderer emits alwaysThrow.
	iVar := ctx.NextLocalVar("i")
	arrName := ctx.NextLocalVar("res")
	itemName := ctx.NextLocalVar("its")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	itemCodeStr := childRT.Code
	if itemCodeStr == "" {
		itemCodeStr = "JSON.stringify(" + v + "[" + iVar + "])"
	}
	body := "const " + arrName + " = []; for (let " + iVar + " = " + startPos + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
		"const " + itemName + " = " + itemCodeStr + "; if (" + itemName + ") " + arrName + ".push(" + itemName + ");" +
		"} if (!" + arrName + ".length) {return '';} else {return " + sep + arrName + ".join(',');}"
	return RTCode{Code: body, Type: CodeRB}
}

// emitNativeIterableStringifyJson handles Map / Set —
// mion:stringifyJson.ts:407-414 + createStringifyIterable lines 446-473.
// Both iterate `for (const entry of v)`, building per-entry fragments
// joined as a JSON array.
func emitNativeIterableStringifyJson(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == protocol.SubKindMap
	var innerTypes []*protocol.RunType
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		innerTypes = []*protocol.RunType{keyType, valueType}
	} else {
		innerTypes = []*protocol.RunType{setItemType(rt, ctx)}
	}
	entryVar := ctx.NextLocalVar("e")
	var childParts []string
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
			childParts = append(childParts, childRT.Code)
		}
	}
	if len(childParts) == 0 {
		// Fall back to JSON.stringify(Array.from(v)) — gives the
		// same `[[k,v],…]` / `[item,…]` shape mion produces when
		// every element is a JSON-noop type.
		return RTCode{Code: "JSON.stringify(Array.from(" + v + "))", Type: CodeE}
	}
	jsonItems := ctx.NextLocalVar("ls")
	resultVal := ctx.NextLocalVar("res")
	var childrenResult string
	if len(childParts) > 1 {
		// Map: emit `[key, value]` array per entry.
		childrenResult = "'['+" + strings.Join(childParts, "+','+") + "+']'"
	} else {
		// Set: emit the element directly per entry.
		childrenResult = childParts[0]
	}
	body := "const " + jsonItems + " = []; for (const " + entryVar + " of " + v + ") {" +
		"const " + resultVal + " = " + childrenResult + "; " + jsonItems + ".push(" + resultVal + ");}" +
		" return '[' + " + jsonItems + ".join(',') + ']'"
	return RTCode{Code: body, Type: CodeRB}
}

// --- Helpers ----------------------------------------------------------

// parentIsArrayLike — true when the closest stack frame above us is
// an array / tuple. Used by the undefined emit to choose between
// `'null'` (array slot — JSON requires a literal) and `null` (object
// property — the property emit's optional-guard handles wrapping).
func parentIsArrayLike(ctx *EmitContext) bool {
	if ctx.walker == nil || len(ctx.walker.Stack) < 2 {
		return false
	}
	parent := ctx.walker.Stack[len(ctx.walker.Stack)-2].RT
	if parent == nil {
		return false
	}
	switch parent.Kind {
	case protocol.KindArray, protocol.KindTuple, protocol.KindTupleMember:
		return true
	}
	return false
}

// skipCommas flag plumbing — set on the parent frame (via a
// context-item entry keyed on a known constant) so the child
// property emit can consume it before the parent's loop body
// continues.
const skipCommasKey = "__sj_skip_commas__"

func setSkipCommas(ctx *EmitContext, value bool) {
	if value {
		ctx.SetContextItem(skipCommasKey, "1")
	} else {
		// Reset the marker by clearing the context-item we stash on
		// it. Context items are appended-only at the walker level;
		// store the bit in the walker's nextLocalVar counters table
		// instead, keyed on the same constant.
		ctx.SetContextItem(skipCommasKey, "")
	}
}

func clearSkipCommas(ctx *EmitContext) {
	ctx.SetContextItem(skipCommasKey, "")
}

func getSkipCommas(ctx *EmitContext) bool {
	value, ok := ctx.GetContextItem(skipCommasKey)
	return ok && value == "1"
}

// positionInt — typed integer view of TupleMember.Position. Returns 0
// when Position is nil (defensive — every tuple member should carry
// a position from the serializer).
func positionInt(rt *protocol.RunType) int {
	if rt == nil || rt.Position == nil {
		return 0
	}
	return *rt.Position
}
