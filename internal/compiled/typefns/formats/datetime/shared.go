package datetime

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
)

// dateTimePureFnFilePath is the canonical source path the resolver
// registers the date/time pure fns under (cpf_isDateString_*,
// cpf_isTimeString_*, cpf_relativeNowMs, cpf_*StrToMs). Matches the file
// where the JS-side `registerPureFnFactory('mionFormats', …)` calls
// live — keep these in sync when either side moves. (The string-format
// pure fns stay at ../string/string-formats-pure-fns.ts; only the
// date/time ones moved here.)
const dateTimePureFnFilePath = "packages/ts-go-run-types/src/formats/datetime/dateTime-pure-fns.ts"

// pureFnAlias registers a pure-fn dependency in the `mionFormats`
// namespace, hoists the `const cpf_<fnName> = utl.getPureFn(...)`
// declaration into the factory prologue (deduped), and returns the alias
// the emitted body uses. Sibling of the string package's helper of the
// same name, but registers against dateTimePureFnFilePath.
func pureFnAlias(ctx formats.EmitContext, fnName string) string {
	ctx.AddPureFnDependency("mionFormats", fnName, dateTimePureFnFilePath)
	alias := "cpf_" + fnName
	if !ctx.HasContextItem(alias) {
		ctx.SetContextItem(alias, "const "+alias+" = utl.getPureFn('mionFormats::"+fnName+"')")
	}
	return alias
}

// formatErrCall emits a statement that pushes the canonical nested
// RunTypeError — `{expected, path, format: {name, formatPath, val}}` —
// onto the errors array. Mirrors the string package's helper exactly
// (kept local to avoid a cross-package export); see that copy for the
// full rationale on emitting inline rather than via a pure fn.
func formatErrCall(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral string) string {
	path := pathExpr
	if path == "" {
		path = "pth"
	}
	return errorsArr + ".push({expected:'" + expected + "',path:[..." + path + "]," +
		"format:{name:'" + fmtName + "',formatPath:['" + paramName + "'],val:" + paramValLiteral + "}})"
}
