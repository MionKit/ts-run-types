package string

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
)

// pureFnAlias registers a pure-fn dependency in the `mionFormats`
// namespace, hoists the `const cpf_<fnName> = utl.getPureFn(...)`
// declaration into the factory prologue (deduped), and returns the
// alias the emitted body uses. Shared by every string-format emitter
// that dispatches to a pure fn (uuid / date / time / ip / domain /
// email / url). Transitive deps the wrapper fn calls internally are
// picked up by the JS-side pure-fn extractor, not declared here.
func pureFnAlias(ctx formats.EmitContext, fnName string) string {
	ctx.AddPureFnDependency("mionFormats", fnName, typeFormatsPureFnFilePath)
	alias := "cpf_" + fnName
	if !ctx.HasContextItem(alias) {
		ctx.SetContextItem(alias, "const "+alias+" = utl.getPureFn('mionFormats::"+fnName+"')")
	}
	return alias
}

// formatErrCall emits a statement that pushes the canonical nested
// RunTypeError — `{expected, path, format: {name, formatPath, val}}` —
// onto the errors array. This is the shape the base typeErrors path
// (cpf_newRunTypeErr) and consumers expect (mirrors mion's cpf_formatErr
// output); a bare `{name, formatPath, val}` push would not conform to
// RunTypeError and is invisible to consumers reading `.path`/`.format`.
//
// Emitted INLINE rather than via a pure fn: the cpf_formatErr pure fn
// lives in the marker package's run-types-pure-fns.ts, which isn't part
// of a consumer's program (nothing imports it), so a getPureFn lookup
// would resolve to undefined at runtime. The inline object literal has
// no such dependency.
//
// paramValLiteral is the already-rendered JS value (an unquoted number,
// or a quoted string). pathExpr is the runtime path arg (`pth`); path is
// copied (`[...pth]`) so each pushed error owns its array. formatPath is
// `[paramName]`.
func formatErrCall(_ formats.EmitContext, pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral string) string {
	path := pathExpr
	if path == "" {
		path = "pth"
	}
	return errorsArr + ".push({expected:'" + expected + "',path:[..." + path + "]," +
		"format:{name:'" + fmtName + "',formatPath:['" + paramName + "'],val:" + paramValLiteral + "}})"
}

// regexpEscape mirrors mion's utils.ts regexpEscape exactly —
// `val.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')` — escaping the precise
// set the char-class / value-set regex sources need so a literal char
// (`.`, `-`, `|`, …) matches verbatim instead of acting as a metachar.
// NOT regexp.QuoteMeta: that escapes a different set and would diverge
// from both mion's emitted regex and the JS runtime engine.
func regexpEscape(val string) string {
	var builder strings.Builder
	builder.Grow(len(val))
	for _, r := range val {
		switch r {
		case '/', '-', '\\', '^', '$', '*', '+', '?', '.', '(', ')', '|', '[', ']', '{', '}':
			builder.WriteByte('\\')
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

// defaultFormatMessages is mion's getDefaultMessage table
// (stringFormat.runtype.ts:15-21): the error `val` used for a complex
// (pattern / char-class / value-set) param when it carries no custom
// errorMessage.
var defaultFormatMessages = map[string]string{
	"allowedChars":     "Invalid characters",
	"disallowedChars":  "Invalid characters",
	"allowedValues":    "Invalid value",
	"disallowedValues": "Invalid value",
	"pattern":          "Invalid pattern",
}

// messageLiteral resolves the error `val` for a complex param as a
// quoted JS string literal: the param's custom `errorMessage` when set,
// else mion's per-param default. `errorMessage` is part of the
// structural key (typeid.structuralKeyIgnoredParams excludes only
// mockSamples/message), so a custom message yields a distinct cache
// entry — never a collision. `pattern` is special-cased: its custom
// message lives under the key-excluded `message` field, so we emit only
// the static default to keep cache identity correct.
func messageLiteral(params map[string]any, name string) string {
	if name != "pattern" {
		if obj, ok := params[name].(map[string]any); ok {
			if msg, ok := obj["errorMessage"].(string); ok && msg != "" {
				return quoteJSDoubleLocal(msg)
			}
		}
	}
	return quoteJSDoubleLocal(defaultFormatMessages[name])
}

// jsParamsLiteral renders a params map as a deterministic JS object
// literal (keys sorted for stable output). Used by emitters that pass
// the whole params object to a pure fn at the call site (ip, …).
// Supported value shapes mirror what the typeid scanner extracts:
// string, bool, float64 (numbers), nested maps, and []any arrays.
func jsParamsLiteral(params map[string]any) string {
	if len(params) == 0 {
		return "{}"
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var builder strings.Builder
	builder.WriteByte('{')
	for i, key := range keys {
		if i > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.Quote(key))
		builder.WriteByte(':')
		builder.WriteString(jsValueLiteral(params[key]))
	}
	builder.WriteByte('}')
	return builder.String()
}

func jsValueLiteral(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case string:
		return strconv.Quote(typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}
		return strconv.FormatFloat(typed, 'g', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case map[string]any:
		return jsParamsLiteral(typed)
	case []any:
		var builder strings.Builder
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(jsValueLiteral(item))
		}
		builder.WriteByte(']')
		return builder.String()
	default:
		return strconv.Quote("")
	}
}
