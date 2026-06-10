package string

import (
	"regexp"
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// recoverPattern extracts a regex source+flags from a format's `pattern`
// param. The param is always a resolved literal object {source, flags,
// …} — produced either by registerFormatPattern (user formats, recovered
// from the call AST by the typeid scanner) or by an inline string-literal
// source (the built-in formats, .d.ts-safe). Returns ok=false when there
// is no usable pattern param.
func recoverPattern(params map[string]any) (source, flags string, ok bool) {
	raw, present := params["pattern"]
	if !present {
		return "", "", false
	}
	pattern, isMap := raw.(map[string]any)
	if !isMap {
		return "", "", false
	}
	src, isString := pattern["source"].(string)
	if !isString {
		return "", "", false
	}
	flagStr, _ := pattern["flags"].(string)
	return src, flagStr, true
}

// recoverSamples extracts the mockSamples as a list of strings. Looks
// inside the pattern object first (the FormatPattern form, where samples
// live with the regex they validate), then falls back to a top-level
// mockSamples (the built-in string-source form). Accepts both the array
// form and a single allowed-chars string.
func recoverSamples(params map[string]any) []string {
	if pattern, ok := params["pattern"].(map[string]any); ok {
		if samples := samplesFromValue(pattern["mockSamples"]); samples != nil {
			return samples
		}
	}
	return samplesFromValue(params["mockSamples"])
}

func samplesFromValue(raw any) []string {
	switch typed := raw.(type) {
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if str, ok := item.(string); ok {
				out = append(out, str)
			}
		}
		return out
	case string:
		return []string{typed}
	}
	return nil
}

// namedPatternValidate is the validate body for a pattern format (domain /
// email / url): the AND of any length bounds and the regex test, plus
// build-time mockSample validation. Empty when neither is present.
func namedPatternValidate(ctx formats.EmitContext, annotation *protocol.FormatAnnotation, vλl string) string {
	if annotation == nil {
		return ""
	}
	conditions := lengthConditions(annotation.Params, vλl)
	if source, flags, ok := recoverPattern(annotation.Params); ok {
		validateSamples(ctx, source, flags, recoverSamples(annotation.Params))
		conditions = append(conditions, emitPatternTest(ctx, source, flags, vλl))
	}
	return strings.Join(conditions, " && ")
}

// namedPatternErrors is the validationErrors body for a pattern format. One
// push per failing length bound, plus one for the pattern, each tagged
// with the format name.
func namedPatternErrors(ctx formats.EmitContext, annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr, name string) string {
	if annotation == nil {
		return ""
	}
	statements := lengthErrorStatements(ctx, annotation.Params, vλl, pathExpr, errorsArr, name)
	if source, flags, ok := recoverPattern(annotation.Params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "string", name, "pattern", "'pattern'"))
	}
	return strings.Join(statements, ";")
}

// emitPatternTest hoists `const re_N = new RegExp(source, flags)` into
// the factory prologue and returns the `re_N.test(vλl)` expression.
// Mirrors the template-literal validate emitter's hoist pattern so the
// regex compiles once per factory, not per validator call.
func emitPatternTest(ctx formats.EmitContext, source, flags, vλl string) string {
	reVar := ctx.NextLocalVar("reFmt")
	if !ctx.HasContextItem(reVar) {
		construct := "const " + reVar + " = new RegExp(" + quoteJSDoubleLocal(source) + ", " + quoteJSDoubleLocal(flags) + ")"
		ctx.SetContextItem(reVar, construct)
	}
	return reVar + ".test(" + vλl + ")"
}

// validateSamples compiles the pattern with Go's RE2 engine and checks
// every mockSample against it, emitting CodeFMTSampleMismatch for any
// that fail. When the pattern uses JS-only regex features RE2 can't
// compile (lookarounds, backreferences) we skip validation rather than
// false-positive — RE2 is a best-effort build-time oracle, not the
// runtime engine.
func validateSamples(ctx formats.EmitContext, source, flags string, samples []string) {
	if len(samples) == 0 {
		return
	}
	compiled, err := regexp.Compile(re2Pattern(source, flags))
	if err != nil {
		return // RE2 can't represent this JS regex — skip rather than mis-report.
	}
	for _, sample := range samples {
		if !compiled.MatchString(sample) {
			ctx.EmitDiagnostic(diag.CodeFMTSampleMismatch, sample, source)
		}
	}
}

// re2Pattern translates a JS regex source+flags into an RE2 pattern
// string. JS `i`/`m`/`s` map to RE2 inline flags; `u`/`g`/`y`/`d` are
// irrelevant to a match test (RE2 is UTF-8 by default and `\p{…}` works
// without `u`).
func re2Pattern(source, flags string) string {
	var inline strings.Builder
	for _, flag := range flags {
		switch flag {
		case 'i', 'm', 's':
			inline.WriteRune(flag)
		}
	}
	if inline.Len() == 0 {
		return source
	}
	return "(?" + inline.String() + ")" + source
}

// quoteJSDoubleLocal is a package-local copy of typefns.quoteJSDouble —
// a double-quoted JS string encoder (double quotes keep backslash-dense
// regex sources readable). Kept here to avoid exporting the typefns
// helper across the package boundary.
func quoteJSDoubleLocal(value string) string {
	var builder strings.Builder
	builder.Grow(len(value) + 2)
	builder.WriteByte('"')
	for _, r := range value {
		switch r {
		case '\\':
			builder.WriteString(`\\`)
		case '"':
			builder.WriteString(`\"`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			builder.WriteRune(r)
		}
	}
	builder.WriteByte('"')
	return builder.String()
}
