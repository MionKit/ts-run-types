package datetime

import (
	"strconv"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
)

// boundcodegen.go emits the runtime min/max comparison for a validated
// date/time/dateTime/native-Date value. Absolute bounds are baked as a
// precomputed number on the runtime scale (epoch ms for date/dateTime/
// Date, ms-of-day for time); relative `now±P…` bounds emit a call to
// cpf_relativeNowKey(spec, scale) so JS owns the calendar arithmetic at
// check time. The value side uses cpf_dateStrToMs / cpf_timeStrToMs to
// convert the string to the same scale; the native-Date emitter passes
// the Date's getTime() directly (see nativeDate.go) and so does NOT use
// these string converters.

// scaleFor returns the relativeNowKey scale arg for a bound kind.
func scaleFor(kind boundKind) string {
	if kind == timeKind {
		return "'timeOfDay'"
	}
	return "'epoch'"
}

// boundExpr renders the JS expression a bound compares against: a baked
// number for an absolute literal, or cpf_relativeNowKey(spec, scale) for
// a relative spec. ok=false when the bound is absent.
func boundExpr(ctx formats.EmitContext, params map[string]any, key string, kind boundKind, layout string) (string, bool) {
	bound, present := stringParam(params, key)
	if !present || bound == "" {
		return "", false
	}
	if _, isRelative, relErr := parseRelative(bound); isRelative {
		if relErr != "" {
			return "", false // already reported by ValidateParams
		}
		alias := pureFnAlias(ctx, "relativeNowKey")
		return alias + "(" + strconv.Quote(bound) + "," + scaleFor(kind) + ")", true
	}
	keyVal, ok := comparableLiteral(bound, kind, layout)
	if !ok {
		return "", false
	}
	return strconv.FormatInt(int64(keyVal), 10), true
}

// valueKeyExpr renders the JS expression converting the (validated)
// value string to the comparison scale. For time → ms-of-day; for date
// → UTC epoch ms; for dateTime → date epoch ms + time ms-of-day, split on
// splitChar, mirroring the Go-side dateTimeEpochMs bake (NOT Date.parse,
// which would interpret a 'T'-joined value in local time and diverge from
// the UTC-baked absolute bounds).
func valueKeyExpr(ctx formats.EmitContext, vλl string, kind boundKind, layout string) string {
	if kind == timeKind {
		alias := pureFnAlias(ctx, "timeStrToMs")
		return alias + "(" + vλl + "," + strconv.Quote(layout) + ")"
	}
	if kind == dateKind {
		alias := pureFnAlias(ctx, "dateStrToMs")
		return alias + "(" + vλl + "," + strconv.Quote(layout) + ")"
	}
	// dateTime — layout here is the splitChar; nested layouts default to
	// ISO for the comparison (the static bake uses the same default).
	dateAlias := pureFnAlias(ctx, "dateStrToMs")
	timeAlias := pureFnAlias(ctx, "timeStrToMs")
	split := strconv.Quote(layout)
	return "((dtp) => " + dateAlias + "(" + vλl + ".substring(0,dtp),'ISO') + " +
		timeAlias + "(" + vλl + ".substring(dtp+1),'ISO'))(" + vλl + ".indexOf(" + split + "))"
}

// boundIsTypeChecks returns the AND-able expression for the min/max
// comparisons, or "" when neither bound is set. The value is converted
// once per comparison (cheap; the JS engine can CSE identical calls).
func boundIsTypeChecks(ctx formats.EmitContext, params map[string]any, vλl string, kind boundKind, layout string) string {
	minExpr, hasMin := boundExpr(ctx, params, "min", kind, layout)
	maxExpr, hasMax := boundExpr(ctx, params, "max", kind, layout)
	if !hasMin && !hasMax {
		return ""
	}
	valueKey := valueKeyExpr(ctx, vλl, kind, layout)
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

// boundTypeErrorChecks emits error-push statements (one per failed
// bound), tagging formatPath ['min'] / ['max'].
func boundTypeErrorChecks(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName string, kind boundKind, layout string) string {
	minExpr, hasMin := boundExpr(ctx, params, "min", kind, layout)
	maxExpr, hasMax := boundExpr(ctx, params, "max", kind, layout)
	if !hasMin && !hasMax {
		return ""
	}
	valueKey := valueKeyExpr(ctx, vλl, kind, layout)
	var stmts string
	appendStmt := func(s string) {
		if stmts == "" {
			stmts = s
		} else {
			stmts = stmts + ";" + s
		}
	}
	expected := "string"
	if kind == dateTimeKind && fmtName == "nativeDate" {
		expected = "Date"
	}
	if hasMin {
		minVal, _ := stringParam(params, "min")
		appendStmt("if (!(" + valueKey + " >= " + minExpr + ")) " +
			formatErrCall(pathExpr, errorsArr, expected, fmtName, "min", strconv.Quote(minVal)))
	}
	if hasMax {
		maxVal, _ := stringParam(params, "max")
		appendStmt("if (!(" + valueKey + " <= " + maxExpr + ")) " +
			formatErrCall(pathExpr, errorsArr, expected, fmtName, "max", strconv.Quote(maxVal)))
	}
	return stmts
}
