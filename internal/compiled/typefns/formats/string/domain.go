package string

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// domainEmitter implements the format named "domain" — FormatDomain /
// FormatDomainStrict. Two validation paths, mirroring mion's
// DomainRunTypeFormat:
//
//   - pattern path: the type carries the domain regex (FormatDomain) —
//     a single baked regex test + length bounds (namedPattern*).
//   - decomposition path: the type carries `names`/`tld` sub-formats
//     (FormatDomainStrict) — the value is split on '.', each label is
//     validated as a sub-StringFormat, label hyphen-edges are rejected,
//     and the segment count is bounded by maxParts/minParts.
//
// validate emits the decomposition as an IIFE expression (same splice
// shape as datetime.go) so it AND-chains after the base-kind check;
// validationErrors emits an error-accumulating statement block.
type domainEmitter struct{}

func init() {
	formats.Register(domainEmitter{})
}

func (domainEmitter) Name() string                  { return "domain" }
func (domainEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (domainEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation != nil && domainHasNames(annotation.Params) {
		return domainValidateExprFor(ctx, annotation.Params, vλl)
	}
	return namedPatternValidate(ctx, annotation, vλl)
}

func (domainEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation != nil && domainHasNames(annotation.Params) {
		return domainErrorsBlockFor(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "domain")
}

// EmitFormatTransform lowercases the domain (mion domain.runtype.ts:229
// — all domains are case-insensitive, canonicalised to lower case).
func (domainEmitter) EmitFormatTransform(_ *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}

// ValidateParams ports mion's DomainRunTypeFormat.validateParams
// (domain.runtype.ts:235-248): names/tld travel together, are mutually
// exclusive with pattern, and the length/part bounds stay in range.
func (domainEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	_, hasNames := params["names"].(map[string]any)
	_, hasTld := params["tld"].(map[string]any)
	_, hasPattern := params["pattern"]
	if hasNames != hasTld {
		errs = append(errs, "FormatDomain: `names` and `tld` must be used together")
	}
	if (hasNames || hasTld) && hasPattern {
		errs = append(errs, "FormatDomain: cannot combine `pattern` with `names`/`tld`")
	}
	if value, ok := readNumberParam(params, "maxLength"); ok && value > 253 {
		errs = append(errs, "FormatDomain: `maxLength` cannot be greater than 253")
	}
	if value, ok := readNumberParam(params, "maxParts"); ok && value < 2 {
		errs = append(errs, "FormatDomain: `maxParts` cannot be less than 2")
	}
	if value, ok := readNumberParam(params, "minParts"); ok && value < 2 {
		errs = append(errs, "FormatDomain: `minParts` cannot be less than 2")
	}
	return errs
}

// domainHasNames reports whether the decomposition path applies — i.e.
// the params carry a `names` sub-format object (names/tld come together,
// mion validateParams enforces it).
func domainHasNames(params map[string]any) bool {
	_, ok := params["names"].(map[string]any)
	return ok
}

// hasAllowedValues reports whether a sub-param map has an allowedValues
// param. mion skips the hyphen-edge label check when names is an
// enum (allowedValues) — the explicit value set already pins the labels.
func hasAllowedValues(params map[string]any) bool {
	if params == nil {
		return false
	}
	_, ok := params["allowedValues"].(map[string]any)
	return ok
}

// domainValidateExprFor builds the decomposition validate IIFE for a domain
// applied to valExpr (the whole value at the root, or the domain
// substring when reached from email). Mirrors mion domain.runtype.ts:
// 101-116. Returns an expression evaluating to true iff valExpr is a
// well-formed domain under params. The bound `s` plus the loop locals
// (count/start/pos/name/tld) are arrow-scoped, so fixed names can't
// collide across sibling or nested domain checks.
func domainValidateExprFor(ctx formats.EmitContext, params map[string]any, valExpr string) string {
	namesParams, _ := params["names"].(map[string]any)
	tldParams, _ := params["tld"].(map[string]any)

	rootConds := strings.Join(stringConditions(ctx, params, "s"), " && ")
	nameConds := strings.Join(stringConditions(ctx, namesParams, "name"), " && ")
	tldConds := strings.Join(stringConditions(ctx, tldParams, "tld"), " && ")

	var b strings.Builder
	b.WriteString("((s) => {")
	if rootConds != "" {
		b.WriteString("if (!(" + rootConds + ")) return false;")
	}
	b.WriteString("let count = 1, start = 0, pos, name;")
	b.WriteString("while ((pos = s.indexOf('.', start)) !== -1) {")
	b.WriteString("name = s.substring(start, pos);")
	if !hasAllowedValues(namesParams) {
		b.WriteString("if (name.startsWith('-') || name.endsWith('-')) return false;")
	}
	if nameConds != "" {
		b.WriteString("if (!(" + nameConds + ")) return false;")
	}
	b.WriteString("start = pos + 1; count++;")
	b.WriteString("}")
	if maxParts, ok := readNumberParam(params, "maxParts"); ok {
		b.WriteString("if (count > " + formats.FormatNumber(maxParts) + ") return false;")
	}
	if minParts, ok := readNumberParam(params, "minParts"); ok {
		b.WriteString("if (count < " + formats.FormatNumber(minParts) + ") return false;")
	}
	b.WriteString("const tld = s.substring(start);")
	if tldConds != "" {
		b.WriteString("if (!(" + tldConds + ")) return false;")
	}
	b.WriteString("return true;")
	b.WriteString("})(" + valExpr + ")")
	return b.String()
}

// domainErrorsBlockFor builds the decomposition validationErrors statement
// block (mion domain.runtype.ts:145-159). Error-accumulating (no early
// returns): every failing label / bound pushes onto errorsArr. count
// starts at 0 and is bumped once post-loop so it equals the segment
// count (labels + tld). Wrapped in its own `{ }` so the block locals
// stay scoped — safe under email nesting and sibling domain fields.
func domainErrorsBlockFor(ctx formats.EmitContext, params map[string]any, valExpr, pathExpr, errorsArr string) string {
	namesParams, _ := params["names"].(map[string]any)
	tldParams, _ := params["tld"].(map[string]any)

	rootErrs := strings.Join(stringErrorStatements(ctx, params, "s", pathExpr, errorsArr, "domain"), ";")
	nameErrs := strings.Join(stringErrorStatements(ctx, namesParams, "name", pathExpr, errorsArr, "domain"), ";")
	tldErrs := strings.Join(stringErrorStatements(ctx, tldParams, "tld", pathExpr, errorsArr, "domain"), ";")

	var b strings.Builder
	b.WriteString("{const s = " + valExpr + ";")
	if rootErrs != "" {
		b.WriteString(rootErrs + ";")
	}
	b.WriteString("let count = 0, start = 0, pos, name;")
	b.WriteString("while ((pos = s.indexOf('.', start)) !== -1) {")
	b.WriteString("name = s.substring(start, pos);")
	if !hasAllowedValues(namesParams) {
		b.WriteString("if (name.startsWith('-') || name.endsWith('-')) " +
			formats.FormatErrCall(pathExpr, errorsArr, "string", "domain", "hyphen", "'name'") + ";")
	}
	if nameErrs != "" {
		b.WriteString(nameErrs + ";")
	}
	b.WriteString("start = pos + 1; count++;")
	b.WriteString("}")
	b.WriteString("count++;")
	if maxParts, ok := readNumberParam(params, "maxParts"); ok {
		b.WriteString("if (count > " + formats.FormatNumber(maxParts) + ") " +
			formats.FormatErrCall(pathExpr, errorsArr, "string", "domain", "maxParts", formats.FormatNumber(maxParts)) + ";")
	}
	if minParts, ok := readNumberParam(params, "minParts"); ok {
		b.WriteString("if (count < " + formats.FormatNumber(minParts) + ") " +
			formats.FormatErrCall(pathExpr, errorsArr, "string", "domain", "minParts", formats.FormatNumber(minParts)) + ";")
	}
	b.WriteString("const tld = s.substring(start);")
	if tldErrs != "" {
		b.WriteString(tldErrs + ";")
	}
	b.WriteString("}")
	return b.String()
}

// domainSubCheckExpr returns a domain validate EXPRESSION over valExpr,
// dispatching on whether the domain params use the names/tld
// decomposition (IIFE) or the pattern/length path (AND of conditions).
// Used by the email emitter to validate the domain half of an address.
func domainSubCheckExpr(ctx formats.EmitContext, domainParams map[string]any, valExpr string) string {
	if domainHasNames(domainParams) {
		return domainValidateExprFor(ctx, domainParams, valExpr)
	}
	return strings.Join(stringConditions(ctx, domainParams, valExpr), " && ")
}

// domainSubErrorsStmts returns domain validationErrors STATEMENTS over
// valExpr, dispatching the same way as domainSubCheckExpr. Used by the
// email emitter.
func domainSubErrorsStmts(ctx formats.EmitContext, domainParams map[string]any, valExpr, pathExpr, errorsArr string) string {
	if domainHasNames(domainParams) {
		return domainErrorsBlockFor(ctx, domainParams, valExpr, pathExpr, errorsArr)
	}
	return strings.Join(stringErrorStatements(ctx, domainParams, valExpr, pathExpr, errorsArr, "domain"), ";")
}
