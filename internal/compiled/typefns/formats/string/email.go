package string

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// emailEmitter implements the format named "email" — FormatEmail /
// FormatEmailStrict. Like domain it has two paths (mion
// EmailRunTypeFormat):
//
//   - pattern path: a single baked email regex (FormatEmail).
//   - decomposition path: split on the LAST '@' into localPart + domain
//     (FormatEmailStrict); localPart is validated as a sub-StringFormat
//     and domain as a sub-domain (which may itself decompose).
//
// validate emits an IIFE expression; validationErrors emits a statement block.
type emailEmitter struct{}

func init() {
	formats.Register(emailEmitter{})
}

func (emailEmitter) Name() string                  { return "email" }
func (emailEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (emailEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation != nil && emailHasParts(annotation.Params) {
		return emailValidateExprFor(ctx, annotation.Params, vλl)
	}
	return namedPatternValidate(ctx, annotation, vλl)
}

func (emailEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation != nil && emailHasParts(annotation.Params) {
		return emailErrorsBlockFor(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "email")
}

// emailHasParts reports whether the decomposition path applies — i.e.
// the params carry a localPart or domain sub-format (mion validateParams
// requires them together, but either signals decomposition).
func emailHasParts(params map[string]any) bool {
	if _, ok := params["localPart"].(map[string]any); ok {
		return true
	}
	_, ok := params["domain"].(map[string]any)
	return ok
}

// emailValidateExprFor builds the decomposition validate IIFE (mion
// email.runtype.ts:78-88): root length, split on the last '@', validate
// localPart and the domain half. The bound `e` and the locals are
// arrow-scoped, so fixed names are collision-free.
func emailValidateExprFor(ctx formats.EmitContext, params map[string]any, valExpr string) string {
	localPartParams, _ := params["localPart"].(map[string]any)
	domainParams, _ := params["domain"].(map[string]any)

	rootConds := strings.Join(stringConditions(ctx, params, "e"), " && ")
	localPartConds := strings.Join(stringConditions(ctx, localPartParams, "localPart"), " && ")

	var b strings.Builder
	b.WriteString("((e) => {")
	if rootConds != "" {
		b.WriteString("if (!(" + rootConds + ")) return false;")
	}
	b.WriteString("const atPos = e.lastIndexOf('@');")
	b.WriteString("if (atPos === -1) return false;")
	b.WriteString("const localPart = e.substring(0, atPos);")
	b.WriteString("const domain = e.substring(atPos + 1);")
	if localPartConds != "" {
		b.WriteString("if (!(" + localPartConds + ")) return false;")
	}
	if domainParams != nil {
		b.WriteString("if (!(" + domainSubCheckExpr(ctx, domainParams, "domain") + ")) return false;")
	}
	b.WriteString("return true;")
	b.WriteString("})(" + valExpr + ")")
	return b.String()
}

// emailErrorsBlockFor builds the decomposition validationErrors block (mion
// email.runtype.ts:109-117). When '@' is absent we push that error and
// skip the part checks (avoids spurious localPart/domain errors over the
// un-splittable value); otherwise both halves accumulate their errors.
func emailErrorsBlockFor(ctx formats.EmitContext, params map[string]any, valExpr, pathExpr, errorsArr string) string {
	localPartParams, _ := params["localPart"].(map[string]any)
	domainParams, _ := params["domain"].(map[string]any)

	rootErrs := strings.Join(stringErrorStatements(ctx, params, "e", pathExpr, errorsArr, "email"), ";")
	localPartErrs := strings.Join(stringErrorStatements(ctx, localPartParams, "localPart", pathExpr, errorsArr, "email"), ";")

	var b strings.Builder
	b.WriteString("{const e = " + valExpr + ";")
	if rootErrs != "" {
		b.WriteString(rootErrs + ";")
	}
	b.WriteString("const atPos = e.lastIndexOf('@');")
	b.WriteString("if (atPos === -1) " +
		formatErrCall(ctx, pathExpr, errorsArr, "string", "email", "@", "'Email missing @ symbol'") + ";")
	b.WriteString("else {")
	b.WriteString("const localPart = e.substring(0, atPos);")
	b.WriteString("const domain = e.substring(atPos + 1);")
	if localPartErrs != "" {
		b.WriteString(localPartErrs + ";")
	}
	if domainParams != nil {
		b.WriteString(domainSubErrorsStmts(ctx, domainParams, "domain", pathExpr, errorsArr) + ";")
	}
	b.WriteString("}")
	b.WriteString("}")
	return b.String()
}

// EmitFormatTransform lowercases the email (mion email.runtype.ts:148 —
// emails are case-insensitive, so the canonical form is lower case).
func (emailEmitter) EmitFormatTransform(_ *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}

// ValidateParams ports mion's EmailRunTypeFormat.validateParams
// (email.runtype.ts:152-187): pattern is mutually exclusive with the
// localPart/domain decomposition, and maxLength stays in range.
func (emailEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	_, hasLocalPart := params["localPart"].(map[string]any)
	_, hasDomain := params["domain"].(map[string]any)
	_, hasPattern := params["pattern"]
	if hasPattern && (hasLocalPart || hasDomain) {
		errs = append(errs, "FormatEmail: cannot combine `pattern` with `localPart`/`domain`")
	}
	if value, ok := readNumberParam(params, "maxLength"); ok && value > 254 {
		errs = append(errs, "FormatEmail: `maxLength` cannot be greater than 254")
	}
	return errs
}
