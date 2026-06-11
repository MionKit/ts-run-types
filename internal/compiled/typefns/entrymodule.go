package typefns

import (
	"fmt"
	"strings"

	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Per-entry module renderer (module mode).
//
// One cache entry — `<fnHash>_<typeId>` for fn entries, `<strategyHash>_<typeId>`
// for JSON composites — becomes one ES module exporting a positional `entry`
// array the runtime registrar consumes:
//
//	'use strict';
//	const u = undefined;
//	export const entry = ['aB3x_Lrjx','val','User','<factory body>',false,['aB3x_pQ7w'],['mion::isEmail']];
//
// Slot order is the legacy skeleton init() arg list with the family tag
// inserted at slot 1 (the tag replaces what the per-family skeleton hardcoded —
// fnID, args shape, noop identity — so ONE registrar covers every family):
//
//	0 rtFnHash  1 familyTag  2 typeName  3 code  4 isNoop
//	5 rtDependencies  6 pureFnDependencies  7 createRTFn
//	8 alwaysThrowCode  9 alwaysThrowSite
//
// Trailing `u` slots are trimmed (same rule as the runType renderer's
// trimTrailingUndefined). Noop short form: ['<key>','<tag>','<name>',u,true].
//
// Unlike the legacy aggregate path, pureFnDependencies are emitted as FULL
// '<ns>::<fn>' strings — the `k_<alias>` consts only exist in the skeleton
// module scope, which a standalone module doesn't have.

// EntrySlots is the structured form of one compiled cache entry — the data
// behind the per-entry module array (and, transitionally, the same data the
// legacy init(...) line carries).
type EntrySlots struct {
	// Key is the namespaced cache key (`<fnHash>_<typeId>`), the module's
	// identity and the runtime registry slot.
	Key string
	// FamilyTag routes the runtime registrar to the family's fixed fields
	// (val, verr, …, jeCL…). Variants carry their BASE family tag — the
	// variant axis lives in the Key's fnHash, not in the registrar row.
	FamilyTag string
	TypeName  string
	// Code is the factory body for `new Function('utl', code)`. Empty for
	// noop and alwaysThrow entries.
	Code   string
	IsNoop bool
	// RTDeps is the namespaced same-family dependency keys (walker
	// RTDependencies). For JSON composites: the referenced primitive keys.
	RTDeps     []string
	PureFnDeps []protocol.PureFnDep
	// CreateRTFn is the full `function g_<key>(utl){…}` declaration, set only
	// under RenderOpts.EmitCreateRTFn.
	CreateRTFn string
	ThrowCode  string
	ThrowSite  string
	// CrossFamilyDeps is the foreign-family keys the body reaches
	// (e.g. `<valHash>_<member>` inside a decoder). Drives closure assembly;
	// not emitted into the array.
	CrossFamilyDeps []string
	// Skip marks an unsupported leaf with no per-family diag code — nothing
	// renderable. Callers drop the entry (and cascade its dependents out of
	// the closure).
	Skip bool
}

// compileEntry compiles one (RunType, variant) into its structured slots.
// Mirrors renderEntryWithDeps' walker pipeline WITHOUT the disk-cache
// read/write (the module path memoizes per dispatch in the closure assembler;
// disk persistence for the array format lands with the v5 format bump).
// Transitional duplication: the legacy line renderer is deleted with the
// aggregate path, at which point this is the only compile pipeline.
func compileEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, emitter Emitter, refTable map[string]*protocol.RunType, opts RenderOpts, variantSuffix string, variantOptions []string) EntrySlots {
	prefix := innerPrefix(settings)
	entryKey := variantKey(settings, variantSuffix, variantOptions, runType.ID)
	slots := EntrySlots{
		Key:       entryKey,
		FamilyTag: settings.Tag,
		TypeName:  rtTypeName(runType),
	}

	walker := NewWalker(runType, entryKey, emitter)
	walker.RefTable = refTable
	walker.facts = opts.Facts
	walker.InnerPrefix = prefix
	if len(variantOptions) > 0 {
		walker.VariantOptions = make(map[string]bool, len(variantOptions))
		for _, name := range variantOptions {
			walker.VariantOptions[name] = true
		}
	}
	walker.DiagSink = opts.DiagSink
	if opts.ProvenanceSites != nil {
		walker.rootProvenance = opts.ProvenanceSites[runType.ID]
	}
	innerFn, isNoop, isUnsupported := walker.Compile()
	if isUnsupported {
		// Same unified throw model as the legacy renderer: a propagating
		// unsupported leaf renders an alwaysThrow entry keyed by the leaf's
		// per-family diag code (surfaced as a build diagnostic too); a leaf
		// with no registered code is skipped entirely.
		if leafProvider, ok := emitter.(LeafDiagCodeProvider); ok && walker.UnsupportedLeaf != nil {
			if diagCode := leafProvider.DiagCodeForLeaf(walker.UnsupportedLeaf); diagCode != "" {
				walker.EmitDiagnostic(diagCode, leafKindLabel(walker.UnsupportedLeaf))
				slots.ThrowCode = diagCode
				slots.ThrowSite = firstCallSiteHint(walker.rootProvenance)
				return slots
			}
		}
		slots.Skip = true
		return slots
	}
	if isNoop {
		slots.IsNoop = true
		return slots
	}
	factoryName := variantFactoryName(settings, variantSuffix, variantOptions, runType.ID)
	createRTFn, factoryBody := WrapClosure(factoryName, innerFn, walker.ContextLines())
	slots.Code = factoryBody
	if opts.EmitCreateRTFn {
		slots.CreateRTFn = createRTFn
	}
	slots.RTDeps = append([]string(nil), walker.RTDependencies...)
	slots.PureFnDeps = append([]protocol.PureFnDep(nil), walker.PureFnDependencies...)
	slots.CrossFamilyDeps = append([]string(nil), walker.CrossFamilyDeps...)
	return slots
}

// CompileEntryModule compiles one (family, RunType, variant) into its
// structured slots — the resolver-facing wrapper over compileEntry.
// familyKey is the constants.CacheModules / operations.Name key
// (e.g. "validate"). Callers gate on `FamilyByKey(familyKey).Emitter.
// Supports(runType)` first; an unsupported root has no module.
func CompileEntryModule(familyKey string, runType *protocol.RunType, refTable map[string]*protocol.RunType, opts RenderOpts, variantSuffix string, variantOptions []string) EntrySlots {
	spec := FamilyByKey(familyKey)
	return compileEntry(runType, spec.Settings, spec.Emitter, refTable, opts, variantSuffix, variantOptions)
}

// CompileJsonCompositeModule is the resolver-facing wrapper over
// compileJsonCompositeSlots — one composite entry per (typeId, strategy tag).
func CompileJsonCompositeModule(runType *protocol.RunType, tag string, opts RenderOpts) (EntrySlots, bool) {
	return compileJsonCompositeSlots(runType, tag, opts)
}

// compileJsonCompositeSlots builds the slots for one JSON composite entry —
// the fixed per-strategy body that wraps the primitives with native JSON
// (see jsonCompositeBody). RTDeps carries the referenced primitive keys so
// closure assembly pulls them with one uniform rule; the body itself resolves
// them by fnHash with an identity fallback, exactly as the legacy fold-in.
func compileJsonCompositeSlots(runType *protocol.RunType, tag string, opts RenderOpts) (EntrySlots, bool) {
	composite, ok := constants.JsonCompositeByTag(tag)
	if !ok {
		return EntrySlots{}, false
	}
	op, ok := operations.ByName(composite.OpName)
	if !ok {
		return EntrySlots{}, false
	}
	entryKey := operations.FnHashFor(op, nil, composite.Strategy) + "_" + runType.ID
	contextLines, innerFn := jsonCompositeBody(composite, runType.ID, entryKey)
	createRTFn, factoryBody := WrapClosure("g_"+entryKey, innerFn, contextLines)
	slots := EntrySlots{
		Key:       entryKey,
		FamilyTag: tag,
		TypeName:  rtTypeName(runType),
		Code:      factoryBody,
		RTDeps:    compositePrimitiveKeys(composite.Strategy, runType.ID),
	}
	if opts.EmitCreateRTFn {
		slots.CreateRTFn = createRTFn
	}
	return slots, true
}

// compositePrimitiveKeys lists the primitive cache keys a composite strategy's
// body references — `<PlainHash(primitiveOp)>_<typeId>` per family tag in
// constants.JsonStrategyFamilies[strategy].
func compositePrimitiveKeys(strategy string, typeID string) []string {
	tags := constants.JsonStrategyFamilies[strategy]
	keys := make([]string, 0, len(tags))
	for _, tag := range tags {
		op, ok := operations.ByFamilyTag(tag)
		if !ok {
			continue
		}
		keys = append(keys, operations.PlainHash(op.Name)+"_"+typeID)
	}
	return keys
}

// FormatEntryArray renders slots as the positional JS array literal (without
// the module wrapper). Trailing `u` slots are trimmed; interior absent slots
// stay explicit `u`.
func FormatEntryArray(slots EntrySlots) string {
	codeArg := "u"
	if slots.Code != "" {
		codeArg = quoteJS(slots.Code)
	}
	typeNameArg := "u"
	if slots.TypeName != "" {
		typeNameArg = quoteJS(slots.TypeName)
	}
	createRTFnArg := "u"
	if slots.CreateRTFn != "" {
		createRTFnArg = slots.CreateRTFn
	}
	throwCodeArg := "u"
	throwSiteArg := "u"
	if slots.ThrowCode != "" {
		throwCodeArg = quoteJS(slots.ThrowCode)
		if slots.ThrowSite != "" {
			throwSiteArg = quoteJS(slots.ThrowSite)
		}
	}
	depsArg := "u"
	if len(slots.RTDeps) > 0 {
		depsArg = stringSliceJS(slots.RTDeps)
	}
	pureDepsArg := "u"
	if len(slots.PureFnDeps) > 0 {
		pureDepsArg = pureFnDepsJSFull(slots.PureFnDeps)
	}
	args := []string{
		quoteJS(slots.Key),
		quoteJS(slots.FamilyTag),
		typeNameArg,
		codeArg,
		boolJS(slots.IsNoop),
		depsArg,
		pureDepsArg,
		createRTFnArg,
		throwCodeArg,
		throwSiteArg,
	}
	end := len(args)
	for end > 2 && args[end-1] == "u" {
		end--
	}
	// `false` in the isNoop slot is trimmable too when nothing after it
	// survives — the registrar defaults absent isNoop to false.
	if end == 5 && args[4] == "false" {
		end = 4
	}
	return "[" + joinArgs(args[:end]) + "]"
}

// WrapEntryModule wraps an entry-array literal into the full ES-module source
// served as `virtual:runtypes/<key>.js`.
func WrapEntryModule(arrayLiteral string) string {
	return "'use strict';\nconst u = undefined;\nexport const entry = " + arrayLiteral + ";\n"
}

// pureFnDepsJSFull is the module-mode variant of pureFnDepsJS: every dep is a
// full quoted '<namespace>::<fnName>' string. The `k_<alias>` const indirection
// only exists inside the aggregate skeletons' module scope.
func pureFnDepsJSFull(deps []protocol.PureFnDep) string {
	if len(deps) == 0 {
		return "[]"
	}
	parts := make([]string, len(deps))
	for i, dep := range deps {
		parts[i] = quoteJS(dep.Namespace + "::" + dep.FunctionName)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// firstCallSiteHint mirrors formatCallSiteHint but returns the bare
// `file:line:col` string (empty when no provenance) instead of a JS literal.
func firstCallSiteHint(provenance []diag.Site) string {
	if len(provenance) == 0 {
		return ""
	}
	site := provenance[0]
	return fmt.Sprintf("%s:%d:%d", site.FilePath, site.StartLine, site.StartCol)
}
