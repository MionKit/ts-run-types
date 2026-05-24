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
