package datetime

import (
	"strconv"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// nativeDateEmitter implements the format named "nativeDate" —
// FormatDate<P>, which brands the native JS `Date` object (not a string).
// It reuses the shared bounds logic: min/max are an absolute literal OR a
// relative now±P spec, with both date AND time duration components allowed
// (a Date carries both). Validation is added on top of the base-kind Date
// check (instanceof + non-NaN); no serialisation work — Date serialises
// through the existing default serialisers.
//
// Kind is KindClass: the scanner lifts the format brand off the
// `Date & {brand}` intersection (see splitBuiltinClassBrand in
// internal/compiled/runtype/intersection_collapse.go) onto a KindClass /
// SubKindDate node, and the host istype/typeerrors class arm dispatches
// here via formats.LookupForRunType keyed on (KindClass, "nativeDate").
type nativeDateEmitter struct{}

func init() {
	formats.Register(nativeDateEmitter{})
}

func (nativeDateEmitter) Name() string                  { return "nativeDate" }
func (nativeDateEmitter) Kind() protocol.ReflectionKind { return protocol.KindClass }

// ValidateParams validates the optional min/max bounds with dateTimeKind
// (both component groups allowed). The layout key is "T" — only used by
// the best-effort static ordering parse for absolute dateTime literals.
func (nativeDateEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return validateMinMax(annotation.Params, dateTimeKind, "T")
}

// EmitIsTypeCheck returns the bound comparison expression. The base-kind
// Date check (instanceof Date && !isNaN(getTime())) is emitted by the host
// class arm; this only adds the min/max guard. The value's comparison key
// is the Date's epoch ms directly (no string parsing), compared against a
// baked absolute epoch or cpf_relativeNowKey for a relative bound.
func (nativeDateEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return nativeDateBoundChecks(ctx, annotation.Params, vλl)
}

func (nativeDateEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	minExpr, hasMin := boundExpr(ctx, annotation.Params, "min", dateTimeKind, "T")
	maxExpr, hasMax := boundExpr(ctx, annotation.Params, "max", dateTimeKind, "T")
	if !hasMin && !hasMax {
		return ""
	}
	valueKey := vλl + ".getTime()"
	var stmts string
	appendStmt := func(s string) {
		if stmts == "" {
			stmts = s
		} else {
			stmts = stmts + ";" + s
		}
	}
	if hasMin {
		minVal, _ := stringParam(annotation.Params, "min")
		appendStmt("if (!(" + valueKey + " >= " + minExpr + ")) " +
			formatErrCall(pathExpr, errorsArr, "Date", "nativeDate", "min", strconv.Quote(minVal)))
	}
	if hasMax {
		maxVal, _ := stringParam(annotation.Params, "max")
		appendStmt("if (!(" + valueKey + " <= " + maxExpr + ")) " +
			formatErrCall(pathExpr, errorsArr, "Date", "nativeDate", "max", strconv.Quote(maxVal)))
	}
	return stmts
}

// nativeDateBoundChecks builds the AND-able min/max expression over a
// Date value's getTime(). Returns "" when no bound is set.
func nativeDateBoundChecks(ctx formats.EmitContext, params map[string]any, vλl string) string {
	minExpr, hasMin := boundExpr(ctx, params, "min", dateTimeKind, "T")
	maxExpr, hasMax := boundExpr(ctx, params, "max", dateTimeKind, "T")
	if !hasMin && !hasMax {
		return ""
	}
	valueKey := vλl + ".getTime()"
	var checks string
	if hasMin {
		checks = "(" + valueKey + " >= " + minExpr + ")"
	}
	if hasMax {
		maxCheck := "(" + valueKey + " <= " + maxExpr + ")"
		if checks == "" {
			checks = maxCheck
		} else {
			checks = checks + " && " + maxCheck
		}
	}
	return checks
}
