package typefns

import (
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Custom class-serializer plumbing shared by the JSON + binary emitter
// families. A plain user class (KindClass + SubKindNone) may have a custom
// serialize/deserialize pair registered at runtime via
// `registerClassSerializer(name, handler)`; the emitted factory looks the
// handler up by class name through `utl.getClassSerializer(name)` and
// routes (de)serialization through it when present, falling back to the
// structural object emit otherwise.
//
// The class name is `rt.TypeName`. Anonymous classes (TS gives them an
// internal symbol name beginning with the 0xFE InternalSymbolName prefix,
// e.g. "\xfeclass") carry no stable user-facing name, so they're never
// routed through the registry and never warned about — structural-only.
//
// Builtins (Date / Map / Set / RegExp / nonSerializable) are NOT handled
// here: each emitter dispatches those on SubKind before reaching the
// SubKindNone arm, so this helper only ever sees plain user classes.
//
// See docs/UNSUPPORTED-KINDS.md "Adding a new ... family" and the T7 design
// notes for the locked contract.

// userClassName returns the user-facing class name for a plain user class
// RunType, or "" when the class is anonymous (no stable name to key the
// registry on). The empty-string result signals callers to emit the
// structural shape with no registry branch and no warning.
func userClassName(rt *protocol.RunType) string {
	if rt == nil {
		return ""
	}
	name := rt.TypeName
	if name == "" {
		return ""
	}
	// TS synthesises internal symbol names (e.g. "\xfeclass",
	// "\xfeobject") for anonymous declarations; they all start with the
	// InternalSymbolName prefix byte 0xFE. Such a name isn't something a
	// user could pass to registerClassSerializer, so treat it as
	// anonymous.
	if name[0] == 0xFE {
		return ""
	}
	return name
}

// classSerializerLookup returns the local const name holding the custom
// serializer for className PLUS the inline declaration statement that binds
// it. The lookup is emitted INSIDE the returned function body (per-call),
// NOT in the closure prologue — so the registry is consulted on every
// (de)serialization, registration can happen anytime before a call, and
// `registerClassSerializer` / clearing takes effect immediately even for an
// already-materialized factory. Shape:
//
//	const cs_<name> = utl.getClassSerializer('<name>')
func classSerializerLookup(className string) (varName string, decl string) {
	varName = "cs_" + sanitizeIdent(className)
	decl = "const " + varName + " = utl.getClassSerializer(" + quoteJS(className) + ")"
	return varName, decl
}

// emitClassSerializerWarning surfaces the build-time CLS001 Warning telling
// the user the named class is serialized structurally and that they can
// register a custom serializer. Deduped by code per walk (one warning per
// compilation). No-op for anonymous classes (className == "").
func emitClassSerializerWarning(className string, ctx *EmitContext) {
	if className == "" {
		return
	}
	ctx.walker.EmitDiagnostic(diag.CodeCLSStructuralFallback, className)
}

// wrapPrepareWithClassSerializer wraps the structural prepareForJson body
// (the mutate-in-place `pj` family) of a plain user class in a runtime
// registry branch:
//
//	if (cs_<name>) { v = cs_<name>.serialize(v) } else { <structural> }
//
// Anonymous classes (className == "") skip the registry entirely and return
// the structural body unchanged with no warning. Named classes emit the
// CLS001 advisory. Propagates CodeNS unchanged (an unsupported descendant
// short-circuits the whole entry — the registry can't rescue a structurally
// un-encodable shape, matching the locked contract that the fallback is the
// *existing* structural behaviour).
func wrapPrepareWithClassSerializer(rt *protocol.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(className)
	elseBody := structural.Code
	branch := decl + ";if (" + csVar + ") {" + v + " = " + csVar + ".serialize(" + v + ")}"
	if elseBody != "" {
		branch += " else {" + elseBody + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapSafeWithClassSerializer wraps the structural prepareForJsonSafe /
// prepareForJsonSafePreserve body (the non-mutating `pjs` / `pjsp` clone
// families) of a plain user class in a runtime registry branch. The
// structural emit produces a NEW value (CodeE expression or CodeRB
// self-returning block); the registry branch replaces the cloned value
// with `cs_<name>.serialize(v)`:
//
//	if (cs_<name>) return cs_<name>.serialize(v); <structural-returning-body>
//
// Anonymous classes return the structural body unchanged (no branch, no
// warning). CodeNS propagates unchanged.
func wrapSafeWithClassSerializer(rt *protocol.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(className)
	// Normalise the structural value to a self-returning statement so the
	// whole thing is one CodeRB block. CodeRB already returns; CodeE /
	// empty become `return <expr>` (empty clone == identity == `return v`).
	structuralReturn := structural.Code
	if structural.Type != CodeRB {
		expr := structural.Code
		if expr == "" {
			expr = v
		}
		structuralReturn = "return " + expr
	}
	body := decl + ";if (" + csVar + ") return " + csVar + ".serialize(" + v + "); " + structuralReturn
	return RTCode{Code: body, Type: CodeRB}
}

// wrapStringifyWithClassSerializer wraps the structural stringifyJson body
// (`sj` family — produces a JSON string fragment) of a plain user class in
// a runtime registry branch. Registered → the fragment is
// `JSON.stringify(cs_<name>.serialize(v))`; else the existing structural
// stringify:
//
//	if (cs_<name>) return JSON.stringify(cs_<name>.serialize(v)); <structural>
//
// Anonymous classes return the structural body unchanged. CodeNS propagates.
func wrapStringifyWithClassSerializer(rt *protocol.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(className)
	structuralReturn := structural.Code
	if structural.Type != CodeRB {
		expr := structural.Code
		if expr == "" {
			// Empty structural fragment never happens for an object emit
			// (it always returns at least `'{}'`), but stay defensive.
			expr = "JSON.stringify(" + v + ")"
		}
		structuralReturn = "return " + expr
	}
	body := decl + ";if (" + csVar + ") return JSON.stringify(" + csVar + ".serialize(" + v + ")); " + structuralReturn
	return RTCode{Code: body, Type: CodeRB}
}

// wrapRestoreWithClassSerializer wraps the structural restoreFromJson body
// (`rj` family — mutates / rebinds `v` to the reconstructed value) of a
// plain user class in a runtime registry branch. Registered →
// `v = cs_<name>.deserialize(v)`; else the existing structural restore
// (which decodes to a prototype-less plain object):
//
//	if (cs_<name>) { v = cs_<name>.deserialize(v) } else { <structural> }
//
// Anonymous classes return the structural body unchanged. CodeNS propagates.
func wrapRestoreWithClassSerializer(rt *protocol.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(className)
	elseBody := structural.Code
	branch := decl + ";if (" + csVar + ") {" + v + " = " + csVar + ".deserialize(" + v + ")}"
	if elseBody != "" {
		branch += " else {" + elseBody + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapToBinaryWithClassSerializer wraps the structural toBinary body (`tb`
// family — writes bytes to the serializer `ser`) of a plain user class in a
// runtime registry branch. Registered → JSON-stringify the custom
// serialize() result and write it via the existing string binary-encoder
// (`ser.serString`); else the existing structural binary encode:
//
//	if (cs_<name>) { Ser.serString(JSON.stringify(cs_<name>.serialize(v))) }
//	else { <structural> }
//
// The string wire shape (uint32 length + utf8 bytes) is exactly what the
// `fb` side decodes. Anonymous classes return structural unchanged. CodeNS
// propagates.
func wrapToBinaryWithClassSerializer(rt *protocol.RunType, ctx *EmitContext, v, ser string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(className)
	registered := ser + ".serString(JSON.stringify(" + csVar + ".serialize(" + v + ")))"
	branch := decl + ";if (" + csVar + ") {" + registered + "}"
	if structural.Code != "" {
		branch += " else {" + structural.Code + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapFromBinaryWithClassSerializer wraps the structural fromBinary body
// (`fb` family — assigns the decoded value to `ret`) of a plain user class
// in a runtime registry branch. Registered → string binary-decode →
// JSON.parse → custom deserialize(); else the existing structural decode
// (prototype-less plain object):
//
//	if (cs_<name>) { ret = cs_<name>.deserialize(JSON.parse(Des.desString())) }
//	else { <structural> }
//
// Byte-symmetric with wrapToBinaryWithClassSerializer. Anonymous classes
// return structural unchanged. CodeNS propagates.
func wrapFromBinaryWithClassSerializer(rt *protocol.RunType, ctx *EmitContext, ret, des string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(className)
	registered := ret + " = " + csVar + ".deserialize(JSON.parse(" + des + ".desString()))"
	branch := decl + ";if (" + csVar + ") {" + registered + "}"
	if structural.Code != "" {
		branch += " else {" + structural.Code + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// sanitizeIdent maps an arbitrary class name to a JS-identifier-safe token
// for use in a generated local variable name. Non-identifier characters
// collapse to "_". Class names are almost always plain identifiers, but a
// declaration-merged / weird-cased name shouldn't produce invalid JS.
func sanitizeIdent(name string) string {
	out := make([]byte, 0, len(name))
	for i := 0; i < len(name); i++ {
		c := name[i]
		isAlpha := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '$'
		isDigit := c >= '0' && c <= '9'
		if isAlpha || (isDigit && i > 0) {
			out = append(out, c)
		} else {
			out = append(out, '_')
		}
	}
	if len(out) == 0 {
		return "_"
	}
	return string(out)
}
