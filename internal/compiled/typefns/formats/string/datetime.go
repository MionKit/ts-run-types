package string

import (
	"strconv"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// dateTimeEmitter implements the format named "dateTime" —
// FormatStringDateTime<P>. Composes the date + time validators: the
// value is split on `splitChar` (default 'T'), the left part is
// validated as a date and the right part as a time. Mirrors mion's
// DateTimeRunTypeFormat (packages/type-formats/src/string/dateTime.runtype.ts),
// which delegates to the same date/time pure fns rather than
// re-implementing the parsing.
//
// isType emits an IIFE expression so it can splice into the host
// emitter's CodeE chain; typeErrors emits a statement block guarded
// by the base-kind check. Both reuse the already-registered
// cpf_isDateString_* / cpf_isTimeString_* pure fns — no DateTime-
// specific pure fn is needed.
type dateTimeEmitter struct{}

func init() {
	formats.Register(dateTimeEmitter{})
}

func (dateTimeEmitter) Name() string                  { return "dateTime" }
func (dateTimeEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

// dateTimeParts resolves the date pure-fn, time pure-fn, and split
// char from a dateTime params object. Returns ok=false when either
// nested format is unrecognised — the emitter then no-ops.
func dateTimeParts(params map[string]any) (dateFn, timeFn, splitChar string, ok bool) {
	splitChar = "T"
	if raw, present := params["splitChar"]; present {
		if value, isString := raw.(string); isString && value != "" {
			splitChar = value
		}
	}
	dateFormat := nestedFormat(params, "date", "ISO")
	timeFormat := nestedFormat(params, "time", "ISO")
	dateFn, dok := dateFormatPureFn(dateFormat)
	timeFn, tok := timeFormatPureFn(timeFormat)
	if !dok || !tok {
		return "", "", "", false
	}
	return dateFn, timeFn, splitChar, true
}

// nestedFormat reads params[key].format, defaulting to `fallback`
// when the nested object or its format field is absent.
func nestedFormat(params map[string]any, key, fallback string) string {
	raw, ok := params[key]
	if !ok {
		return fallback
	}
	nested, ok := raw.(map[string]any)
	if !ok {
		return fallback
	}
	value, ok := nested["format"]
	if !ok {
		return fallback
	}
	if str, isString := value.(string); isString {
		return str
	}
	return fallback
}

func (dateTimeEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	dateFn, timeFn, splitChar, ok := dateTimeParts(annotation.Params)
	if !ok {
		return ""
	}
	dateAlias := pureFnAlias(ctx, dateFn)
	timeAlias := pureFnAlias(ctx, timeFn)
	split := strconv.Quote(splitChar)
	// IIFE: bind the split position once, bail on -1, then AND the two
	// sub-validators over the substrings. `dtp` is arrow-param scoped
	// so it can't collide with surrounding factory locals.
	return "((dtp) => dtp !== -1 && " +
		dateAlias + "(" + vλl + ".substring(0,dtp)) && " +
		timeAlias + "(" + vλl + ".substring(dtp+1)))(" + vλl + ".indexOf(" + split + "))"
}

func (dateTimeEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	dateFn, timeFn, splitChar, ok := dateTimeParts(annotation.Params)
	if !ok {
		return ""
	}
	dateAlias := pureFnAlias(ctx, dateFn)
	timeAlias := pureFnAlias(ctx, timeFn)
	split := strconv.Quote(splitChar)
	pathOf := func(segment string) string {
		if pathExpr == "" {
			return "['" + segment + "']"
		}
		return "[..." + pathExpr + ",'" + segment + "']"
	}
	// Statement block: locate the split, error on absence, else validate
	// each half independently so a bad date AND a bad time both surface.
	return "const dtSplit=" + vλl + ".indexOf(" + split + ");" +
		"if (dtSplit===-1) " + errorsArr + ".push({name:'dateTime',formatPath:" + pathOf("splitChar") + ",val:" + split + "});" +
		"else {" +
		"if (!(" + dateAlias + "(" + vλl + ".substring(0,dtSplit)))) " + errorsArr + ".push({name:'dateTime',formatPath:" + pathOf("date") + ",val:" + split + "});" +
		"if (!(" + timeAlias + "(" + vλl + ".substring(dtSplit+1)))) " + errorsArr + ".push({name:'dateTime',formatPath:" + pathOf("time") + ",val:" + split + "});" +
		"}"
}
