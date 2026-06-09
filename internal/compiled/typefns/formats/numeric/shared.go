// Package numeric holds the Go-side emitters for the numeric-format
// family — numberFormat (FormatNumber<P> + the int8/16/32 defaults) and
// bigintFormat (FormatBigInt<P> + the 64-bit defaults). Both live here
// because they share the same param surface (min/max/lt/gt/multipleOf)
// and the same error/literal helpers. Each format registers via init().
package numeric

import (
	"math/big"
	"strconv"
	"strings"
)

// 64-bit range bounds for the bigint binary optimization, parsed once.
// Mirror mion's BIGINT64_MIN/MAX + BIGUINT64_MIN/MAX
// (bigIntFormat.runtype.ts:27-31).
var (
	bigInt64Min  = mustBigInt("-9223372036854775808")
	bigInt64Max  = mustBigInt("9223372036854775807")
	bigUint64Min = mustBigInt("0")
	bigUint64Max = mustBigInt("18446744073709551615")
)

func mustBigInt(decimal string) *big.Int {
	value, _ := new(big.Int).SetString(decimal, 10)
	return value
}

// formatErrCall emits a statement that pushes the canonical nested
// RunTypeError — `{expected, path, format: {name, formatPath, val}}` —
// onto the errors array. Duplicated from formats/string/shared.go: the
// shape is shared but the helper is package-private there, and the
// numeric error `val` rendering differs (numbers / `true` / bigint
// literals rather than quoted strings). Emitted INLINE rather than via a
// pure fn for the same reason the string version is — the pf_formatErr
// pure fn isn't part of a consumer's program.
//
// paramValLiteral is the already-rendered JS value (an unquoted number,
// the literal `true`, or a `…n` bigint literal). expected is the base
// kind name ('number' | 'bigint'). pathExpr is the runtime path arg
// (`pth`); path is copied (`[...pth]`) so each pushed error owns its
// array. formatPath is `[paramName]`.
func formatErrCall(pathExpr, errorsArr, expected, fmtName, paramName, paramValLiteral string) string {
	path := pathExpr
	if path == "" {
		path = "pth"
	}
	return errorsArr + ".push({expected:'" + expected + "',path:[..." + path + "]," +
		"format:{name:'" + fmtName + "',formatPath:['" + paramName + "'],val:" + paramValLiteral + "}})"
}

// readNumberParam extracts a numeric param value, UNWRAPPING the
// `{val, errorMessage, desc}` meta-object shape first (mion's paramVal,
// utils.ts:12-14). Returns (0, false) when the key is absent or carries a
// non-numeric value. Accepts float64 (the canonical JSON-decoded form),
// int variants, and stringified numbers.
func readNumberParam(params map[string]any, key string) (float64, bool) {
	raw, ok := params[key]
	if !ok {
		return 0, false
	}
	if obj, isMap := raw.(map[string]any); isMap {
		raw = obj["val"]
	}
	switch typed := raw.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case string:
		if value, err := strconv.ParseFloat(typed, 64); err == nil {
			return value, true
		}
	}
	return 0, false
}

// boolParam reads a boolean param (integer / float), unwrapping the
// `{val, …}` meta-object. Returns (value, present); present is false when
// the key is absent or its (unwrapped) value isn't a bool.
func boolParam(params map[string]any, key string) (value, present bool) {
	raw, ok := params[key]
	if !ok {
		return false, false
	}
	if obj, isMap := raw.(map[string]any); isMap {
		raw = obj["val"]
	}
	boolVal, isBool := raw.(bool)
	if !isBool {
		return false, false
	}
	return boolVal, true
}

// formatNumber stringifies a float64 the way JSON does (`1` vs `1.0` both
// → "1"), so the emitted JS bound matches what tsgo saw at
// type-resolution time. Copy of formats/string/shared.go formatNumber.
func formatNumber(value float64) string {
	if value == float64(int64(value)) {
		return strconv.FormatInt(int64(value), 10)
	}
	return strconv.FormatFloat(value, 'g', -1, 64)
}

// bigIntRawString returns a bigint param's raw decimal digits (trailing
// `n` stripped), unwrapping the `{val, …}` meta object. Bigint params
// arrive as strings via tsgo's TypeToString — typically with a trailing
// `n` (e.g. "9223372036854775807n"); the strip is defensive so both
// "123n" and "123" work. Full precision is preserved (never via float64).
func bigIntRawString(params map[string]any, key string) (string, bool) {
	raw, ok := params[key]
	if !ok {
		return "", false
	}
	if obj, isMap := raw.(map[string]any); isMap {
		raw = obj["val"]
	}
	switch typed := raw.(type) {
	case string:
		return strings.TrimSuffix(typed, "n"), true
	case float64:
		// Defensive: a small bigint literal could arrive numeric.
		return strconv.FormatInt(int64(typed), 10), true
	}
	return "", false
}

// readBigIntParam parses a bigint param into a *big.Int — used ONLY for
// the 64-bit range decision (bigIntType). Returns (nil, false) when
// absent or unparseable.
func readBigIntParam(params map[string]any, key string) (*big.Int, bool) {
	rawString, ok := bigIntRawString(params, key)
	if !ok {
		return nil, false
	}
	value, ok := new(big.Int).SetString(rawString, 10)
	if !ok {
		return nil, false
	}
	return value, true
}

// bigIntLiteral renders a bigint param as a JS bigint literal (raw
// decimal + `n`) for emitted source — validate comparisons and error `val`.
// Keeps full precision; never round-trips through float64.
func bigIntLiteral(params map[string]any, key string) (string, bool) {
	rawString, ok := bigIntRawString(params, key)
	if !ok {
		return "", false
	}
	return rawString + "n", true
}
