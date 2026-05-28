package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// domainEmitter implements the format named "domain" — FormatDomain /
// FormatDomainUnicode / FormatDomainPunycode. A pure pattern format:
// the type carries the domain regex (as a string-literal source, .d.ts-
// safe) plus mockSamples. The emitter recovers the pattern, emits the
// regex test, and validates the samples at build time. Mirrors mion's
// DomainRunTypeFormat pattern path (the names/tld decomposition mion
// also supports is out of scope — see docs).
type domainEmitter struct{}

func init() {
	formats.Register(domainEmitter{})
}

func (domainEmitter) Name() string                  { return "domain" }
func (domainEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (domainEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	return namedPatternIsType(ctx, annotation, vλl)
}

func (domainEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "domain")
}
