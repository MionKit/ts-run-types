package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// urlEmitter implements the format named "url" — FormatUrl /
// FormatUrlHttp / FormatUrlFile. Pure pattern format; see domain.go.
type urlEmitter struct{}

func init() {
	formats.Register(urlEmitter{})
}

func (urlEmitter) Name() string                  { return "url" }
func (urlEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (urlEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	return namedPatternIsType(ctx, annotation, vλl)
}

func (urlEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "url")
}
