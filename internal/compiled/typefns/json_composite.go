package typefns

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cache/disk"
	"github.com/mionkit/ts-run-types/internal/compiled/entrymod"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// JSON composite codegen.
//
// `createJsonEncoder<T>()` / `createJsonDecoder<T>()` are the only RT families
// whose runtime work is COMPOSED from several primitives (prepareForJson +
// JSON.stringify, restoreFromJson + ukuWire + JSON.parse, …) selected by a
// compile-time `strategy`. Every other family is a single cache entry the
// runtime looks up by key. To make the JSON pair uniform with the rest, the
// composition lives here: one Go-emitted entry per (typeId, strategy) that wraps
// the underlying primitives with native JSON. The TS `createJsonEncoder` /
// `createJsonDecoder` then collapse to the same `resolveTupleEntry` lookup as
// binary.
//
// The composite entry is keyed by the strategy's composite fnHash
// (`operations.FnHashFor(jsonEncoder|jsonDecoder op, nil, strategy)`) and looks
// up its primitives by THEIR fnHash (`operations.PlainHash(primOp)+"_"+id`).
// Each composite's module Deps name exactly those primitive entries, so the
// per-entry import closure pulls the primitives (and their transitive child
// factories) whenever a composite is demanded — the scanner additionally
// records both in the site's demand (operations.DemandFor). Composites do NOT
// walk types and emit no `val_<member>` cross-family edges.
type jsonCompositeFamily struct {
	// opName is the composite operation ("jsonEncoder" / "jsonDecoder").
	opName string
	// tags is the set of per-strategy composite family tags to collect demand
	// for and render.
	tags []string
}

// jsonEncoderFamily / jsonDecoderFamily enumerate the per-strategy composite
// tags of each operation.
var (
	jsonEncoderFamily = jsonCompositeFamily{
		opName: "jsonEncoder",
		tags:   []string{"jeCL", "jeMU", "jeDI"},
	}
	jsonDecoderFamily = jsonCompositeFamily{
		opName: "jsonDecoder",
		tags:   []string{"jdST", "jdPR"},
	}
)

// CollectJsonCompositeEntries collects one entry per demanded (typeId,
// strategy) across both composite operations. Disk-cached per (id,
// compositeTag) so repeat builds skip re-rendering.
func CollectJsonCompositeEntries(dump protocol.Dump, opts RenderOpts) entrymod.Graph {
	graph := entrymod.Graph{}
	refTable := opts.RefTable
	if refTable == nil {
		refTable = make(map[string]*protocol.RunType, len(dump.RunTypes))
		for _, runType := range dump.RunTypes {
			if runType == nil || runType.ID == "" {
				continue
			}
			refTable[runType.ID] = runType
		}
	}
	for _, family := range []jsonCompositeFamily{jsonEncoderFamily, jsonDecoderFamily} {
		for _, tag := range family.tags {
			composite, ok := constants.JsonCompositeByTag(tag)
			if !ok {
				continue
			}
			// Demand for this composite tag: the scanner records one SiteDemand per
			// createJsonEncoder/Decoder site whose strategy maps to this tag. Dedup is
			// by id (the composite has no ValidateOptions-style sub-variant).
			demand := collectFamilyDemand(dump.Sites, tag)
			ids := make([]string, 0, len(demand))
			for id := range demand {
				ids = append(ids, id)
			}
			sort.Strings(ids)
			for _, id := range ids {
				runType := refTable[id]
				if runType == nil {
					continue
				}
				if entry := collectJsonCompositeEntry(runType, tag, composite, opts); entry != nil {
					graph.Add(entry)
				}
			}
		}
	}
	return graph
}

// collectJsonCompositeEntry renders (and disk-caches) one composite entry for
// a given runtype + strategy. The body is FIXED per strategy — it wraps the
// primitives addressed by their fnHash with native JSON — so there is no
// walker and no cross-family edges; the module Deps are the strategy's
// primitive entries for the same id.
func collectJsonCompositeEntry(runType *protocol.RunType, tag string, composite constants.JsonComposite, opts RenderOpts) *entrymod.Entry {
	op, ok := operations.ByName(composite.OpName)
	if !ok {
		return nil
	}
	entryKey := operations.FnHashFor(op, nil, composite.Strategy) + "_" + runType.ID

	// Primitive references are SOFT: the composite body resolves each via
	// `var e = utl.getRT(key); return e ? e.fn : <fallback>` — a collapsed
	// primitive degrades to the identity/stringify fallback, never a throw.
	deps := jsonCompositeDeps(composite, runType.ID)

	if cachedArgs, ok := tryReadCachedCompositeEntry(runType, tag, opts); ok {
		return &entrymod.Entry{Key: entryKey, Kind: entrymod.KindTypeFn, FamilyTag: tag, ArgsText: cachedArgs, SoftDeps: deps}
	}

	contextLines, innerFn := jsonCompositeBody(composite, runType.ID, entryKey)
	_, factoryBody := WrapClosure("g_"+entryKey, entryKey, innerFn, contextLines)
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
		"false", // isNoop — composites always emit a real body
		"[]",    // rtDependencies — primitive refs are resolved by fnHash, not same-family deps
		"[]",    // pureFnDependencies
		createRTFnArg,
	}, fnEntryArgDefaults)
	argsText := joinArgs(args)
	writeCachedCompositeEntry(runType, tag, argsText, opts)
	return &entrymod.Entry{Key: entryKey, Kind: entrymod.KindTypeFn, FamilyTag: tag, ArgsText: argsText, SoftDeps: deps}
}

// jsonCompositeDeps names the primitive entries a composite body resolves at
// materialise time — one `<plainFhash>_<id>` per family in the strategy's
// JsonStrategyFamilies row. These become the composite module's imports so the
// primitives (and their transitive child factories) always load with it.
func jsonCompositeDeps(composite constants.JsonComposite, id string) []string {
	tags := constants.JsonStrategyFamilies[composite.Strategy]
	deps := make([]string, 0, len(tags))
	for _, tag := range tags {
		primitive, ok := operations.ByFamilyTag(tag)
		if !ok {
			continue
		}
		deps = append(deps, operations.PlainHash(primitive.Name)+"_"+id)
	}
	return deps
}

// jsonCompositeBody returns (contextLines, innerFnDeclaration) for a composite
// strategy. The inner function name is the composite entry key so stack traces
// identify it; the body is a faithful Go-side copy of createRTFunctions.ts's
// pre-migration per-strategy composition, resolving each primitive to its fn
// (or an identity fallback when the primitive entry is absent — mirrors the
// registered-but-no-factory fallback).
func jsonCompositeBody(composite constants.JsonComposite, id string, entryKey string) (contextLines string, innerFn string) {
	// resolve emits a context-item const that binds `name` to the primitive's fn
	// (or `fallback` when the entry is missing) so a collapsed primitive
	// degrades gracefully instead of throwing on `undefined.fn`.
	var ctx []string
	resolve := func(name, primOp, fallback string) {
		key := operations.PlainHash(primOp) + "_" + id
		ctx = append(ctx, "const "+name+" = (function(){var e = utl.getRT("+quoteJS(key)+"); return e ? e.fn : "+fallback+";})()")
	}

	identity := "(function(x){return x;})"
	stringifyFallback := "(function(x){return JSON.stringify(x);})"

	var body string
	switch composite.OpName {
	case "jsonEncoder":
		switch composite.Strategy {
		case "direct":
			resolve("sjFn", "stringifyJson", stringifyFallback)
			body = "return sjFn(v);"
		case "clone":
			// Shape-derived clone (prepareForJsonSafe builds a NEW value from the
			// declared shape) — undeclared keys are dropped by construction, so the
			// clone is stripped without a separate strip pass.
			resolve("pjsFn", "prepareForJsonSafe", identity)
			body = "return JSON.stringify(pjsFn(v));"
		case "mutate":
			resolve("pjFn", "prepareForJson", identity)
			body = "return JSON.stringify(pjFn(v));"
		}
		innerFn = "function " + entryKey + "(v){" + body + "}"
	case "jsonDecoder":
		switch composite.Strategy {
		case "preserve":
			resolve("rjFn", "restoreFromJson", identity)
			body = "return rjFn(JSON.parse(s));"
		case "strip":
			resolve("rjFn", "restoreFromJson", identity)
			resolve("ukuwFn", "unknownKeysToUndefinedWire", identity)
			body = "return rjFn(ukuwFn(JSON.parse(s)));"
		}
		innerFn = "function " + entryKey + "(s){" + body + "}"
	}
	return strings.Join(ctx, ";\n"), innerFn
}

// tryReadCachedCompositeEntry loads a previously written composite arg text
// from the disk store. The composite references only entries sharing
// runType.ID, so the header structural-id check alone proves the baked
// fnHashes are still valid — no child/cross-family ref bookkeeping is needed.
func tryReadCachedCompositeEntry(runType *protocol.RunType, tag string, opts RenderOpts) (string, bool) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return "", false
	}
	expectedStructural := opts.Lookup.StructuralForHash(runType.ID)
	if expectedStructural == "" {
		return "", false
	}
	entry, ok, err := opts.Store.ReadRT(runType.ID, tag)
	if err != nil || !ok || entry == nil {
		return "", false
	}
	if entry.StructuralID != expectedStructural {
		return "", false
	}
	return entry.ArgsText, true
}

// writeCachedCompositeEntry persists a composite arg text under its
// per-strategy tag so repeat builds skip re-rendering. Best-effort — failures
// are swallowed (the shared writeCachedEntry already logs FS
// misconfigurations on the primitive path).
func writeCachedCompositeEntry(runType *protocol.RunType, tag string, argsText string, opts RenderOpts) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return
	}
	structural := opts.Lookup.StructuralForHash(runType.ID)
	if structural == "" {
		return
	}
	entry := disk.RTEntry{
		Format:       disk.FormatVersion,
		StructuralID: structural,
		ArgsText:     argsText,
	}
	_ = opts.Store.WriteRT(runType.ID, tag, entry)
}
