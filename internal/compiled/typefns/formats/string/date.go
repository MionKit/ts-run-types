package string

import (
	"strconv"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// dateEmitter implements the format named "date" — FormatStringDate<P>
// in `@mionjs/ts-go-type-formats`. The `format` param selects one of
// six date-parsing pure fns (cpf_isDateString_YMD / _DMY / _MDY / _YM
// / _MD / _DM). Mirrors mion's DateStringRunTypeFormat.getFormatPureFn
// dispatch (packages/type-formats/src/string/date.runtype.ts).
type dateEmitter struct{}

func init() {
	formats.Register(dateEmitter{})
}

func (dateEmitter) Name() string                  { return "date" }
func (dateEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

// dateFormatPureFn maps a `format` param value to the pure-fn name
// that validates it. Returns ("", false) for an unrecognised format —
// the emitter then no-ops and the JS-side validateParams surfaces the
// misconfiguration at build time.
func dateFormatPureFn(format string) (string, bool) {
	switch format {
	case "ISO", "YYYY-MM-DD":
		return "isDateString_YMD", true
	case "DD-MM-YYYY":
		return "isDateString_DMY", true
	case "MM-DD-YYYY":
		return "isDateString_MDY", true
	case "YYYY-MM":
		return "isDateString_YM", true
	case "MM-DD":
		return "isDateString_MD", true
	case "DD-MM":
		return "isDateString_DM", true
	}
	return "", false
}

// readFormat extracts the `format` string param, defaulting to "ISO"
// when absent (mion's DEFAULT_DATE_PARAMS). Returns ("", false) only
// when the param is present but non-string.
func readFormat(params map[string]any) (string, bool) {
	raw, ok := params["format"]
	if !ok {
		return "ISO", true
	}
	if value, isString := raw.(string); isString {
		return value, true
	}
	return "", false
}

func (dateEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnName, ok := dateFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	return alias + "(" + vλl + ")"
}

func (dateEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnName, ok := dateFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	call := alias + "(" + vλl + ")"
	return "if (!(" + call + ")) " +
		formatErrCall(ctx, pathExpr, errorsArr, "string", "date", "format", strconv.Quote(format))
}
