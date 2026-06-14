package typefns

import (
	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/compiled/purefns"
	"github.com/mionkit/ts-runtypes/internal/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// overrideOpKeyForTag maps a simple (non-composite) family tag to the public
// operation FnKey RunType.Overrides is keyed by ("val" → "val", "tb" → "tb",
// …). Returns "" for tags with no public operation (the internal primitives,
// which are never user-overridable) so the override check is skipped for them.
// Composite JSON tags resolve their op key in json_composite.go.
func overrideOpKeyForTag(tag string) string {
	op, ok := operations.ByFamilyTag(tag)
	if !ok || !op.Public {
		return ""
	}
	return op.FnKey
}

// overrideHashForTag returns the cfn body hash an override registered for this
// (family tag, type), or "" when the type carries no override for that family.
func overrideHashForTag(runType *protocol.RunType, tag string) string {
	if runType == nil || len(runType.Overrides) == 0 {
		return ""
	}
	opKey := overrideOpKeyForTag(tag)
	if opKey == "" {
		return ""
	}
	return runType.Overrides[opKey]
}

// buildRedirectEntry renders the cfn-redirect entry for an overridden
// (family, type): a KindTypeFn entry whose factory returns the user's custom
// pure function instead of the Go-emitted structural body. The body is a
// one-liner — `return utl.usePureFn('cfn::<hash>')` — and the cfn module rides
// SoftDeps so initFromTuple registers it before the redirect materializes.
// usePureFn (not getPureFn) throws on a missing module, so an emitter bug fails
// loudly rather than silently degrading to the family identity.
//
// Mirrors collectJsonCompositeEntry's arg assembly; the redirect is never
// disk-cached (it is trivial to re-derive and the cfn key is content-addressed).
func buildRedirectEntry(entryKey string, tag string, runType *protocol.RunType, cfnHash string, opts RenderOpts) *entrymod.Entry {
	cfnKey := purefns.OverrideNamespace + "::" + cfnHash
	factoryBody := "return utl.usePureFn(" + quoteJS(cfnKey) + ")"
	codeArg := "undefined"
	if opts.EmitMode.EmitsCode() {
		codeArg = quoteJS(factoryBody)
	}
	createRTFnArg := "u"
	if opts.EmitMode.EmitsFactory() {
		createRTFnArg = "function g_" + entryKey + "(utl){" + factoryBody + "}"
	}
	args := trimArgsTail([]string{
		quoteJS(entryKey),
		quoteJS(rtTypeName(runType)),
		codeArg,
		"false",                     // isNoop — an override is never the family identity
		"[]",                        // rtDependencies — the redirect has no same-family children
		"[" + quoteJS(cfnKey) + "]", // pureFnDependencies — the cfn this entry redirects to
		createRTFnArg,
	}, fnEntryArgDefaults)
	return &entrymod.Entry{
		Key:       entryKey,
		Kind:      entrymod.KindTypeFn,
		FamilyTag: tag,
		ArgsText:  joinArgs(args),
		SoftDeps:  []string{cfnKey},
		IsNoop:    false,
	}
}
