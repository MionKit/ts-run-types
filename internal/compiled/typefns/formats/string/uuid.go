package string

import (
	"strconv"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// uuidEmitter implements the format named "uuid" — FormatUUIDv4 /
// FormatUUIDv7 in `@mionjs/ts-go-type-formats`. The validator
// dispatches to the `cpf_isUUID` pure fn that ships with the JS
// package, passing the version-pinned params at the call site.
//
// Why a pure fn rather than inline JS: the UUID character-class
// check runs a tight 36-character loop; inlining its body at every
// call site would explode the cache module's bytes. Mion's
// equivalent (packages/type-formats/src/string/uuid.runtype.ts)
// makes the same call out to cpf_isUUID for the same reason.
type uuidEmitter struct{}

// typeFormatsPureFnFilePath is the canonical source path the
// resolver registers cpf_isUUID under. Matches the file where the
// JS-side `registerPureFnFactory('mionFormats', 'isUUID', ...)` call
// lives — keep these in sync when either side moves.
const typeFormatsPureFnFilePath = "packages/ts-go-type-formats/src/type-formats-pure-fns.ts"

func init() {
	formats.Register(uuidEmitter{})
}

func (uuidEmitter) Name() string                  { return "uuid" }
func (uuidEmitter) Kind() protocol.ReflectionKind { return protocol.KindString }

// EmitIsTypeCheck returns `cpf_isUUID(v, {version: '<v>'})`. The
// `cpf_isUUID` const is hoisted into the factory prologue via a
// context item; the pure-fn dependency is recorded so the JS-side
// cache wires up the registered factory.
func (uuidEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	version, ok := readVersion(annotation.Params)
	if !ok {
		// Missing / unrecognised version param — fall back to no-op so
		// the base-kind validator still runs. The JS-side
		// validateParams catches misconfiguration at build time.
		return ""
	}
	aliasKey := pureFnAlias(ctx, "isUUID")
	return aliasKey + "(" + vλl + ",{version:" + strconv.Quote(version) + "})"
}

// EmitTypeErrorsCheck — UUID has a single, opaque "is or isn't a
// valid UUID" outcome. We push one TypeFormatError carrying the
// `version` param when the call fails. Path-relative is `pth`; the
// formatPath array gets a `'version'` trailing segment so consumers
// see which param drove the failure.
func (uuidEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	version, ok := readVersion(annotation.Params)
	if !ok {
		return ""
	}
	aliasKey := pureFnAlias(ctx, "isUUID")
	call := aliasKey + "(" + vλl + ",{version:" + strconv.Quote(version) + "})"
	return "if (!(" + call + ")) " +
		formatErrCall(ctx, pathExpr, errorsArr, "string", "uuid", "version", strconv.Quote(version))
}

// readVersion accepts a stringified or numeric version param and
// returns its string form. UUIDs ship with '4' / '7' but we keep the
// readers loose so future version additions don't require a Go
// release.
func readVersion(params map[string]any) (string, bool) {
	raw, ok := params["version"]
	if !ok {
		return "", false
	}
	switch typed := raw.(type) {
	case string:
		if typed == "" {
			return "", false
		}
		return typed, true
	case float64:
		return strconv.FormatInt(int64(typed), 10), true
	case int:
		return strconv.Itoa(typed), true
	}
	return "", false
}
