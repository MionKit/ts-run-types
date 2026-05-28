package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// domainEmitter implements the format named "domain" — FormatDomain /
// FormatDomainStrict / the unicode + punycode variants. Dispatches to
// cpf_isDomain, passing the params object so the pure fn picks the
// right baked-in regex (variant) and applies the length / part-count
// constraints.
//
// AOT divergence from mion: mion's DomainRunTypeFormat passes a raw
// RegExp in params.pattern and decomposes names/tld for the strict
// variant. Neither raw regexes nor that decomposition survive a TS
// type → wire round-trip, so we collapse the family onto a single
// variant-selected pure fn. See the cpf_isDomain comment in
// type-formats-pure-fns.ts.
type domainEmitter struct{}

func init() {
	formats.Register(domainEmitter{})
}

func (domainEmitter) Name() string                  { return "domain" }
func (domainEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (domainEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	alias := pureFnAlias(ctx, "isDomain")
	return alias + "(" + vλl + "," + jsParamsLiteral(annotation.Params) + ")"
}

func (domainEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	alias := pureFnAlias(ctx, "isDomain")
	call := alias + "(" + vλl + "," + jsParamsLiteral(annotation.Params) + ")"
	pathLiteral := "['domain']"
	if pathExpr != "" {
		pathLiteral = "[..." + pathExpr + ",'domain']"
	}
	return "if (!(" + call + ")) " +
		errorsArr + ".push({name:'domain',formatPath:" + pathLiteral + ",val:'domain'});"
}
