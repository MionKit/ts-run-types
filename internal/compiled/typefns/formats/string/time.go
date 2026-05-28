package string

import (
	"strconv"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// timeEmitter implements the format named "time" — FormatStringTime<P>.
// The `format` param selects one of eight time-parsing pure fns.
// Mirrors mion's TimeStringRunTypeFormat.getFormatPureFn dispatch
// (packages/type-formats/src/string/time.runtype.ts).
type timeEmitter struct{}

func init() {
	formats.Register(timeEmitter{})
}

func (timeEmitter) Name() string                  { return "time" }
func (timeEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

// timeFormatPureFn maps a `format` param value to its validating pure
// fn. The ISO / [.mmm]TZ variants share the timezone-aware validator;
// the bare HH / mm / ss variants reuse the leaf segment validators.
func timeFormatPureFn(format string) (string, bool) {
	switch format {
	case "ISO", "HH:mm:ss[.mmm]TZ":
		return "isTimeString_ISO_TZ", true
	case "HH:mm:ss[.mmm]":
		return "isTimeString_ISO", true
	case "HH:mm:ss":
		return "isTimeString_HHmmss", true
	case "HH:mm":
		return "isTimeString_HHmm", true
	case "mm:ss":
		return "isTimeString_mmss", true
	case "HH":
		return "isHours", true
	case "mm":
		return "isMinutes", true
	case "ss":
		return "isSeconds", true
	}
	return "", false
}

func (timeEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnName, ok := timeFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	return alias + "(" + vλl + ")"
}

func (timeEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnName, ok := timeFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	call := alias + "(" + vλl + ")"
	return "if (!(" + call + ")) " +
		formatErrCall(ctx, pathExpr, errorsArr, "string", "time", "format", strconv.Quote(format))
}
