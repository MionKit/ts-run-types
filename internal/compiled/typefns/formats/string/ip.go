package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// ipEmitter implements the format named "ip" — FormatIP / FormatIPv4 /
// FormatIPv6 / *WithPort in `@mionjs/ts-go-type-formats`. Dispatches
// to cpf_isIPV4 / cpf_isIPV6 based on the `version` param (4, 6, or
// 'any' → OR of both), passing the whole params object so the pure fn
// can honour allowLocalHost / allowPort. Mirrors mion's IPRunTypeFormat
// (packages/type-formats/src/string/ip.runtype.ts).
type ipEmitter struct{}

func init() {
	formats.Register(ipEmitter{})
}

func (ipEmitter) Name() string                  { return "ip" }
func (ipEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

// ipVersion reads the `version` param. Accepts 4 / 6 (numeric) and
// 'any' (string). Defaults to "any" when absent — matches mion's
// DEFAULT_IP_PARAMS.
func ipVersion(params map[string]any) string {
	raw, ok := params["version"]
	if !ok {
		return "any"
	}
	switch typed := raw.(type) {
	case string:
		return typed
	case float64:
		if typed == 4 {
			return "4"
		}
		if typed == 6 {
			return "6"
		}
	}
	return "any"
}

// ipCheckExpr builds the boolean isType expression for the resolved
// version. v4/v6 emit a single call; 'any' ORs both.
func ipCheckExpr(params map[string]any, vλl string, ctx formats.EmitContext) string {
	literal := jsParamsLiteral(params)
	switch ipVersion(params) {
	case "4":
		return pureFnAlias(ctx, "isIPV4") + "(" + vλl + "," + literal + ")"
	case "6":
		return pureFnAlias(ctx, "isIPV6") + "(" + vλl + "," + literal + ")"
	default:
		v4 := pureFnAlias(ctx, "isIPV4") + "(" + vλl + "," + literal + ")"
		v6 := pureFnAlias(ctx, "isIPV6") + "(" + vλl + "," + literal + ")"
		return "(" + v4 + " || " + v6 + ")"
	}
}

func (ipEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return ipCheckExpr(annotation.Params, vλl, ctx)
}

func (ipEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	check := ipCheckExpr(annotation.Params, vλl, ctx)
	version := ipVersion(annotation.Params)
	versionLiteral := "'" + version + "'"
	if version == "4" || version == "6" {
		versionLiteral = version
	}
	return "if (!(" + check + ")) " +
		formatErrCall(ctx, pathExpr, errorsArr, "string", "ip", "version", versionLiteral)
}

// EmitFormatTransform lowercases the IP (mion ip.runtype.ts:44 —
// canonicalises IPv6 hex digits to lower case; a no-op for IPv4).
func (ipEmitter) EmitFormatTransform(_ *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}
