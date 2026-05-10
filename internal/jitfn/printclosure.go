package jitfn

import "strings"

// WrapClosure produces the outer factory function that wraps a jit
// function's inner body with its context-item prologue.
//
// Shape mirrors mion's createJitFunction.ts:47 + printClosure
// (jitFnCompiler.ts:732):
//
//	function <factoryName>(utl){
//	  'use strict';
//	  <contextItem1>;
//	  <contextItem2>;
//	  …
//	  return function <innerFnName>(<args>){<body>}
//	}
//
// `'use strict';` matches mion's runtime path — the body is identical
// whether evaluated via `new Function('utl', fnBody)` (mion) or imported
// as a static ES module (this package).
//
// `factoryName` is the outer (exported) function name — e.g.
// "get_isType_<hash>". The caller owns the prefix convention (mion uses
// "get_" to disambiguate the outer factory from the inner validator;
// the same name is shared on the validator itself).
//
// `innerFnDeclaration` is the full `function <name>(<args>){<body>}`
// produced by Compiler.CreateJitFunction. contextLines is the joined
// context-items prologue produced by Compiler.ContextLines (empty when
// there are no context items, as in the v1 KindString path).
func WrapClosure(factoryName string, innerFnDeclaration string, contextLines string) string {
	var body strings.Builder
	body.WriteString("'use strict';")
	if contextLines != "" {
		body.WriteString(contextLines)
		body.WriteString(";")
	}
	body.WriteString("return ")
	body.WriteString(innerFnDeclaration)
	return "function " + factoryName + "(utl){" + body.String() + "}"
}
