package typefns

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cache/disk"
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
// composition moves here: one Go-emitted entry per (typeId, strategy) that wraps
// the underlying primitives with native JSON. The TS `createJsonEncoder` /
// `createJsonDecoder` then collapse to the same `resolveTupleEntry` lookup as
// binary.
//
// The composite entry is keyed by the strategy's composite fnHash
// (`operations.FnHashFor(jsonEncoder|jsonDecoder op, nil, strategy)`) and looks
// up its primitives by THEIR fnHash (`operations.PlainHash(primOp)+"_"+id`). The
// SCANNER pulls both the composite tag AND every referenced primitive into the
// site's demand (operations.DemandFor), so the composite body only references
// entries the primitive modules also render. Composites do NOT walk types and
// emit no `it_<member>` cross-family edges, so they are absent from the
// cross-family it-source list.
//
// Delivery: the composite `init(…)` lines are folded into the prepareForJson
// (encoder strategies) / restoreFromJson (decoder strategies) module bodies via
// RenderOpts.ExtraBodyLines — both modules are already loaded into rtUtils, so
// no new virtual module / cache-source field is needed. The skeleton's `init`
// accepts the same arg shape every per-fn entry uses.

// jsonCompositeFamily groups the composite family tags hosted by one delivery
// module. Encoder strategies ride prepareForJson; decoder strategies ride
// restoreFromJson.
type jsonCompositeFamily struct {
	// opName is the composite operation ("jsonEncoder" / "jsonDecoder").
	opName string
	// tags is the set of per-strategy composite family tags to collect demand
	// for and render.
	tags []string
}

// jsonEncoderFamily is the encoder composite set (rides the prepareForJson
// module body). jsonDecoderFamily is the decoder set (rides restoreFromJson).
var (
	jsonEncoderFamily = jsonCompositeFamily{
		opName: "jsonEncoder",
		tags:   []string{"jeCL", "jeSC", "jeMU", "jeSM", "jeDI"},
	}
	jsonDecoderFamily = jsonCompositeFamily{
		opName: "jsonDecoder",
		tags:   []string{"jdST", "jdPR"},
	}
)

// JsonEncoderModule renders the JSON-encoder composite `init(…)` lines for every
// demanded (typeId, strategy) and returns them as a single body fragment to fold
// into the prepareForJson module via RenderOpts.ExtraBodyLines. Returns "" when
// no createJsonEncoder site demands a composite.
func JsonEncoderModule(dump protocol.Dump, opts RenderOpts) string {
	return renderJsonCompositeLines(dump, opts, jsonEncoderFamily)
}

// JsonDecoderModule is the decoder sibling of JsonEncoderModule — folds into the
// restoreFromJson module body.
func JsonDecoderModule(dump protocol.Dump, opts RenderOpts) string {
	return renderJsonCompositeLines(dump, opts, jsonDecoderFamily)
}

// renderJsonCompositeLines collects each composite tag's per-id demand, renders
// one fixed `init(…)` line per (id, strategy), and joins them in a deterministic
// order. Disk-cached per (id, compositeTag) so repeat builds skip re-rendering.
func renderJsonCompositeLines(dump protocol.Dump, opts RenderOpts, family jsonCompositeFamily) string {
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
	var lines []string
	for _, tag := range family.tags {
		composite, ok := constants.JsonCompositeByTag(tag)
		if !ok {
			continue
		}
		// Demand for this composite tag: the scanner records one SiteDemand per
		// createJsonEncoder/Decoder site whose strategy maps to this tag. Dedup is
		// by id (the composite has no IsTypeOptions-style sub-variant).
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
			line := renderJsonCompositeEntry(runType, tag, composite, opts)
			if line != "" {
				lines = append(lines, line)
			}
		}
	}
	if len(lines) == 0 {
		return ""
	}
	return strings.Join(lines, "\n")
}

// renderJsonCompositeEntry renders (and disk-caches) one composite `init(…)`
// line for a given runtype + strategy. The body is FIXED per strategy — it wraps
// the primitives addressed by their fnHash with native JSON — so there is no
// walker, no same-family deps, and no cross-family edges to persist.
func renderJsonCompositeEntry(runType *protocol.RunType, tag string, composite constants.JsonComposite, opts RenderOpts) string {
	op, ok := operations.ByName(composite.OpName)
	if !ok {
		return ""
	}
	entryKey := operations.FnHashFor(op, nil, composite.Strategy) + "_" + runType.ID

	if cachedLine, ok := tryReadCachedCompositeEntry(runType, tag, opts); ok {
		return cachedLine
	}

	contextLines, innerFn := jsonCompositeBody(composite, runType.ID, entryKey)
	_, factoryBody := WrapClosure("g_"+entryKey, innerFn, contextLines)
	createRTFnArg := "u"
	if opts.EmitCreateRTFn {
		createRTFnArg = "function g_" + entryKey + "(utl){" + factoryBody + "}"
	}
	args := []string{
		quoteJS(entryKey),
		quoteJS(rtTypeName(runType)),
		quoteJS(factoryBody),
		"false", // isNoop — composites always emit a real body
		"[]",    // rtDependencies — primitive refs are resolved by fnHash, not same-family deps
		"[]",    // pureFnDependencies
		createRTFnArg,
	}
	line := "init(" + joinArgs(args) + ");"
	writeCachedCompositeEntry(runType, tag, line, opts)
	return line
}

// jsonCompositeBody returns (contextLines, innerFnDeclaration) for a composite
// strategy. The inner function name is the composite entry key so stack traces
// identify it; the body is a faithful Go-side copy of createRTFunctions.ts's
// per-strategy composition (lines 362-389 for the encoder, 421-429 for the
// decoder), resolving each primitive to its fn (or an identity fallback when the
// primitive entry is absent — mirrors lookupRTFn's registered-but-no-factory
// fallback).
func jsonCompositeBody(composite constants.JsonComposite, id string, entryKey string) (contextLines string, innerFn string) {
	// resolve emits a context-item const that binds `name` to the primitive's fn
	// (or `fallback` when the entry is missing). Mirrors lookupRTFn's identity
	// fallback so a collapsed primitive degrades gracefully instead of throwing
	// on `undefined.fn`.
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
		case "stripClone":
			resolve("pjsFn", "prepareForJsonSafe", identity)
			body = "return JSON.stringify(pjsFn(v));"
		case "clone":
			resolve("pjspFn", "prepareForJsonSafePreserve", identity)
			body = "return JSON.stringify(pjspFn(v));"
		case "mutate":
			resolve("pjFn", "prepareForJson", identity)
			body = "return JSON.stringify(pjFn(v));"
		case "stripMutate":
			resolve("ukuFn", "unknownKeysToUndefined", identity)
			resolve("pjFn", "prepareForJson", identity)
			body = "ukuFn(v); return JSON.stringify(pjFn(v));"
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

// tryReadCachedCompositeEntry loads a previously written composite line from the
// disk store. The composite references only entries sharing runType.ID, so the
// header structural-id check alone proves the baked fnHashes are still valid — no
// child/cross-family ref bookkeeping is needed.
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
	return entry.Line, true
}

// writeCachedCompositeEntry persists a composite line under its per-strategy tag
// so repeat builds skip re-rendering. Best-effort — failures are swallowed (the
// shared writeCachedEntry already logs FS misconfigurations on the primitive
// path).
func writeCachedCompositeEntry(runType *protocol.RunType, tag string, line string, opts RenderOpts) {
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
		Line:         line,
	}
	_ = opts.Store.WriteRT(runType.ID, tag, entry)
}
