package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// emailEmitter implements the format named "email" — FormatEmail /
// FormatEmailStrict / FormatEmailPunycode. Dispatches to cpf_isEmail,
// which bakes in the standard / punycode regexes (selected by the
// `variant` param) and applies the length bounds.
//
// AOT divergence from mion: mion's EmailRunTypeFormat decomposes the
// local part + domain and composes the domain validator. That
// decomposition rides on raw RegExp params that can't cross the wire,
// so we collapse onto the same variant-selected pure-fn shape used by
// domain. See cpf_isEmail in type-formats-pure-fns.ts.
type emailEmitter struct{}

func init() {
	formats.Register(emailEmitter{})
}

func (emailEmitter) Name() string                  { return "email" }
func (emailEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (emailEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	alias := pureFnAlias(ctx, "isEmail")
	return alias + "(" + vλl + "," + jsParamsLiteral(annotation.Params) + ")"
}

func (emailEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	alias := pureFnAlias(ctx, "isEmail")
	call := alias + "(" + vλl + "," + jsParamsLiteral(annotation.Params) + ")"
	pathLiteral := "['email']"
	if pathExpr != "" {
		pathLiteral = "[..." + pathExpr + ",'email']"
	}
	return "if (!(" + call + ")) " +
		errorsArr + ".push({name:'email',formatPath:" + pathLiteral + ",val:'email'});"
}
