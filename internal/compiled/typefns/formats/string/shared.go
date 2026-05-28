package string

import (
	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
)

// pureFnAlias registers a pure-fn dependency in the `mionFormats`
// namespace, hoists the `const cpf_<fnName> = utl.getPureFn(...)`
// declaration into the factory prologue (deduped), and returns the
// alias the emitted body uses. Shared by every string-format emitter
// that dispatches to a pure fn (uuid / date / time / ip / domain /
// email / url). Transitive deps the wrapper fn calls internally are
// picked up by the JS-side pure-fn extractor, not declared here.
func pureFnAlias(ctx formats.EmitContext, fnName string) string {
	ctx.AddPureFnDependency("mionFormats", fnName, typeFormatsPureFnFilePath)
	alias := "cpf_" + fnName
	if !ctx.HasContextItem(alias) {
		ctx.SetContextItem(alias, "const "+alias+" = utl.getPureFn('mionFormats::"+fnName+"')")
	}
	return alias
}
