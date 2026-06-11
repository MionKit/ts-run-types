package typefns

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/operations"
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
// emit no `val_<member>` cross-family edges, so they are absent from the
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
		tags:   []string{"jeCL", "jeMU", "jeDI"},
	}
	jsonDecoderFamily = jsonCompositeFamily{
		opName: "jsonDecoder",
		tags:   []string{"jdST", "jdPR"},
	}
)





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


