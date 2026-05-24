package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// urlEmitter implements the format named "url" — FormatUrl /
// FormatUrlHttp / FormatUrlFile. Dispatches to cpf_isUrl, which bakes
// in the scheme-specific regexes (selected by `variant`) and applies
// the length bounds.
//
// AOT divergence from mion: mion's URLRunTypeFormat decomposes the
// authority and composes the domain / ip validators over a raw RegExp
// param. That doesn't cross the wire, so we collapse onto the same
// variant-selected pure-fn shape as domain + email. The
// social-media variant (domain-allowlist) is out of scope for the
// AOT port — it relied on the names/tld decomposition.
type urlEmitter struct{}

func init() {
	formats.Register(urlEmitter{})
}

func (urlEmitter) Name() string                  { return "url" }
func (urlEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (urlEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	alias := pureFnAlias(ctx, "isUrl")
	return alias + "(" + vλl + "," + jsParamsLiteral(annotation.Params) + ")"
}

func (urlEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	alias := pureFnAlias(ctx, "isUrl")
	call := alias + "(" + vλl + "," + jsParamsLiteral(annotation.Params) + ")"
	pathLiteral := "['url']"
	if pathExpr != "" {
		pathLiteral = "[..." + pathExpr + ",'url']"
	}
	return "if (!(" + call + ")) " +
		errorsArr + ".push({name:'url',formatPath:" + pathLiteral + ",val:'url'});"
}
