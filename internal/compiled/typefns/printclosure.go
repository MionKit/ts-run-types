package typefns

import "strings"

// WrapClosure produces the outer factory function that wraps a jit
// function's inner body with its context-item prologue. Returns both
// the full declaration (used as the live `createJitFn` arg in the
// rendered cache module) and the bare body (the contents between the
// `(utl){ … }` braces — what gets stored in `JitCompiledFnData.code`
// for `new Function('utl', body)` reconstruction on the consumer side).
//
// Shape mirrors mion's createJitFunction.ts:47 + printClosure
// (jitFnCompiler.ts:732):
//
//	function <factoryName>(utl){
//	  <contextItem1>;
//	  <contextItem2>;
//	  …
//	  return function <innerFnName>(<args>){<body>}
//	}
//
// `'use strict';` is NOT emitted per-factory — it lives at module top
// in the rendered virtual:runtypes-isType output (see module.go's
// isTypeFactoryPreambleLines). Strict mode propagates lexically into
// every nested closure, so the per-factory directive would be redundant
// and inflate the wire size of every entry.
//
// `factoryName` is the outer (exported) function name — e.g.
// "get_isType_<hash>". The caller owns the prefix convention (mion uses
// "get_" to disambiguate the outer factory from the inner validator;
// the same name is shared on the validator itself).
//
// `innerFnDeclaration` is the full `function <name>(<args>){<body>}`
// produced by Walker.Compile. contextLines is the joined context-items
// prologue produced by Walker.ContextLines (empty when there are no
// context items, as in the v1 KindString path).
func WrapClosure(factoryName string, innerFnDeclaration string, contextLines string) (decl, body string) {
	var b strings.Builder
	if contextLines != "" {
		b.WriteString(contextLines)
		b.WriteString(";")
	}
	b.WriteString("return ")
	b.WriteString(innerFnDeclaration)
	body = b.String()
	decl = "function " + factoryName + "(utl){" + body + "}"
	return decl, body
}
