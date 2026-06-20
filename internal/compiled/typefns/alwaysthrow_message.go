package typefns

import "github.com/mionkit/ts-runtypes/internal/diag"

// Runtime alwaysThrow message wording.
//
// When a type is unsupported at a propagating/root position (never, a
// non-serializable class, a function, a symbol, …) the emitter renders an
// alwaysThrow entry whose runtime factory throws an Error. The Go emitter
// writes the COMPLETE message into the entry (see buildAlwaysThrowMessage),
// so the shipped marker package throws it WITHOUT carrying any diagnostic
// catalog of its own.
//
// This is the only user-facing diagnostic wording the Go binary owns, and it
// is intentionally tiny: the eight root-throw families share one formulaic
// headline, "Cannot <verb> `<kind>` <suffix>.". The full build-time
// diagnostic catalog (every code, headline + example, shown in the build log
// and IDE) lives once in the runtypes-devtools plugin; the Go↔plugin wire
// carries only the diagnostic code.

// rootThrowWording maps each root-throw diag code to the (verb, suffix) of its
// runtime throw headline. Only these codes ever become alwaysThrow entries —
// child-drop (010+), marker, and pure-fn codes are build-time-only diagnostics
// and never reach the runtime throw path.
var rootThrowWording = map[string][2]string{}

func registerRootThrow(verb, suffix string, codes ...string) {
	for _, code := range codes {
		rootThrowWording[code] = [2]string{verb, suffix}
	}
}

func init() {
	registerRootThrow("encode", "to JSON",
		diag.CodePJNeverRoot, diag.CodePJNonSerializableRoot, diag.CodePJFunctionRoot, diag.CodePJArrayElement, diag.CodePJSymbolRoot,
		diag.CodePJSNeverRoot, diag.CodePJSNonSerializableRoot, diag.CodePJSFunctionRoot, diag.CodePJSArrayElement, diag.CodePJSSymbolRoot)
	registerRootThrow("decode", "from JSON",
		diag.CodeRJNeverRoot, diag.CodeRJNonSerializableRoot, diag.CodeRJFunctionRoot, diag.CodeRJArrayElement, diag.CodeRJSymbolRoot)
	registerRootThrow("stringify", "to a JSON string",
		diag.CodeSJNeverRoot, diag.CodeSJNonSerializableRoot, diag.CodeSJFunctionRoot, diag.CodeSJArrayElement, diag.CodeSJSymbolRoot)
	registerRootThrow("serialise", "to binary",
		diag.CodeTBNeverRoot, diag.CodeTBNonSerializableRoot, diag.CodeTBFunctionRoot, diag.CodeTBArrayElement, diag.CodeTBNonSerializableElem, diag.CodeTBSymbolRoot)
	registerRootThrow("deserialise", "from binary",
		diag.CodeFBNeverRoot, diag.CodeFBNonSerializableRoot, diag.CodeFBFunctionRoot, diag.CodeFBArrayElement, diag.CodeFBNonSerializableElem, diag.CodeFBSymbolRoot)
	registerRootThrow("validate", "",
		diag.CodeVLNonSerializableRoot, diag.CodeVLSymbolRoot, diag.CodeVENonSerializableRoot, diag.CodeVESymbolRoot)
}

// rootThrowHeadline renders the runtime throw headline for a root-throw code:
// "Cannot <verb> `<kindLabel>` <suffix>.". The kind label (Never / Symbol /
// Function / NonSerializableClass / …) comes from leafKindLabel. Falls back to
// a generic line for an unmapped code — should never happen, every alwaysThrow
// code is registered above.
func rootThrowHeadline(code, kindLabel string) string {
	wording, ok := rootThrowWording[code]
	if !ok {
		return "Cannot process `" + kindLabel + "` here."
	}
	verb, suffix := wording[0], wording[1]
	if suffix == "" {
		return "Cannot " + verb + " `" + kindLabel + "`."
	}
	return "Cannot " + verb + " `" + kindLabel + "` " + suffix + "."
}
