package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// emailEmitter implements the format named "email" — FormatEmail /
// FormatEmailPunycode / FormatEmailStrict. Pure pattern format; see
// domain.go for the shared shape.
type emailEmitter struct{}

func init() {
	formats.Register(emailEmitter{})
}

func (emailEmitter) Name() string                  { return "email" }
func (emailEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

func (emailEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	return namedPatternIsType(ctx, annotation, vλl)
}

func (emailEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "email")
}
