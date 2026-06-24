package typefns

import (
	"github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Compile-time buffer-size estimator for createBinaryEncoder. It walks a type
// graph and returns an estimated on-wire byte count, baked into the `tb` entry
// and used at runtime as the `dynamic` strategy's cold-start buffer size (in
// place of the flat defaultBufferSize fallback) until per-key history warms up.
//
// The walk mirrors the binary_to.go byte accounting — float64 numbers = 8
// bytes, packed numeric/bigint widths via the format BinarySizer (the SAME
// min/max logic EmitToBinary uses, so the two can't drift), 1-byte
// bool/null/void, varint framing, optional-property bitmaps, union
// discriminators, temporal layouts — and anchors unbounded variable parts
// (strings, collections) on the config defaults, interpolating min↔max by Bias.
//
// The result need NOT be exact: it is only a SEED. If it under-shoots, the
// dynamic serializer grows in place on the first encode; if it over-shoots,
// one cold buffer is a little large. So the walk favours a generous estimate
// (Bias defaults to 0.8) and is capped per subtree at cfg.MaxBytes.

// sizeEstimateDepthCap bounds recursion through ID-less inline nodes. ID-bearing
// nodes (the common case — cache children are KindRef sentinels resolving to
// canonical, interned types) are memoized instead, so the walk is O(distinct
// types); this cap only backstops the rare un-interned inline subtree.
const sizeEstimateDepthCap = 8

// binaryToFamilyTag is the family tag of createBinaryEncoder's cache entries —
// the only family carrying a cold-start size estimate. Mirrors
// constants.CacheModules["toBinary"].Tag (guarded below).
const binaryToFamilyTag = "tb"

func init() {
	if constants.CacheModules["toBinary"].Tag != binaryToFamilyTag {
		panic("typefns: binaryToFamilyTag out of sync with constants.CacheModules[\"toBinary\"].Tag")
	}
}

// binaryColdStartEstimate returns the cold-start buffer estimate to bake into a
// tb (binary-encoder) entry. It is 0 — meaning "no estimate slot" — for any
// other family, an option variant, or a nil type.
func binaryColdStartEstimate(settings constants.CacheModuleSettings, variantSuffix string, runType *protocol.RunType, refTable map[string]*protocol.RunType, cfg SizeEstimateConfig) int {
	if settings.Tag != binaryToFamilyTag || variantSuffix != "" || runType == nil {
		return 0
	}
	return EstimateBinarySize(runType, refTable, cfg)
}

// SizeEstimateConfig parameterises EstimateBinarySize. Invalid Items /
// StringBytes / MaxBytes fall back to the constants.DefaultSize* values; Bias is
// only clamped to [0,1] (0 is a valid "tightest" setting, so it is never bumped
// to the default — a zero-value config therefore estimates tightest, while the
// production CLI/plugin path passes constants.DefaultSizeBias).
type SizeEstimateConfig struct {
	Bias        float64
	Items       int
	StringBytes int
	MaxBytes    int
}

func (cfg SizeEstimateConfig) normalized() SizeEstimateConfig {
	if cfg.Bias < 0 {
		cfg.Bias = 0
	} else if cfg.Bias > 1 {
		cfg.Bias = 1
	}
	if cfg.Items <= 0 {
		cfg.Items = constants.DefaultSizeItems
	}
	if cfg.StringBytes <= 0 {
		cfg.StringBytes = constants.DefaultSizeStringBytes
	}
	if cfg.MaxBytes <= 0 {
		cfg.MaxBytes = constants.DefaultSizeMaxBytes
	}
	return cfg
}

// EstimateBinarySize returns the cold-start buffer estimate for rt's binary
// encoding. refTable resolves KindRef child sentinels (the full session cache,
// as renderEntryWithDeps holds). The result is clamped to [1, cfg.MaxBytes].
func EstimateBinarySize(rt *protocol.RunType, refTable map[string]*protocol.RunType, cfg SizeEstimateConfig) int {
	est := &sizeEstimator{
		refTable: refTable,
		cfg:      cfg.normalized(),
		memo:     map[string]int{},
		inflight: map[string]bool{},
	}
	n := est.estimate(rt, 0)
	if n < 1 {
		n = 1
	}
	return n
}

type sizeEstimator struct {
	refTable map[string]*protocol.RunType
	cfg      SizeEstimateConfig
	memo     map[string]int
	inflight map[string]bool
}

func (e *sizeEstimator) deref(rt *protocol.RunType) *protocol.RunType {
	if rt != nil && rt.Kind == protocol.KindRef {
		return e.refTable[rt.ID]
	}
	return rt
}

// estimate resolves refs, memoizes per type id, breaks cycles, clamps each
// subtree to cfg.MaxBytes, and dispatches to estimateRaw.
func (e *sizeEstimator) estimate(rt *protocol.RunType, depth int) int {
	rt = e.deref(rt)
	if rt == nil || depth > sizeEstimateDepthCap {
		return e.cfg.StringBytes
	}
	if rt.ID != "" {
		if v, ok := e.memo[rt.ID]; ok {
			return v
		}
		if e.inflight[rt.ID] {
			return e.cfg.StringBytes // cycle — rough placeholder, broken here
		}
		e.inflight[rt.ID] = true
	}
	n := e.estimateRaw(rt, depth)
	if n > e.cfg.MaxBytes {
		n = e.cfg.MaxBytes
	}
	if rt.ID != "" {
		delete(e.inflight, rt.ID)
		e.memo[rt.ID] = n
	}
	return n
}

func (e *sizeEstimator) estimateRaw(rt *protocol.RunType, depth int) int {
	switch rt.Kind {
	case protocol.KindBoolean, protocol.KindNull, protocol.KindUndefined, protocol.KindVoid:
		return 1
	case protocol.KindNumber:
		return e.numberBytes(rt)
	case protocol.KindBigInt:
		return e.bigintBytes(rt)
	case protocol.KindString, protocol.KindTemplateLiteral:
		return e.stringBytes(rt)
	case protocol.KindLiteral:
		return 0 // value restored from the type — no wire bytes
	case protocol.KindEnum:
		return 8 // serEnum: uint32 tag + (number | short string)
	case protocol.KindArray:
		return e.collectionBytes(rt, e.estimate(rt.Child, depth+1))
	case protocol.KindObjectLiteral, protocol.KindIntersection:
		return e.objectBytes(rt, depth)
	case protocol.KindTuple:
		return e.tupleBytes(rt, depth)
	case protocol.KindUnion:
		return e.unionBytes(rt, depth)
	case protocol.KindClass:
		return e.classBytes(rt, depth)
	case protocol.KindRegexp:
		// two strings (source + flags); flags are short.
		body := e.cfg.StringBytes
		return varintByteLen(body) + body + 2 + 1
	case protocol.KindAny, protocol.KindUnknown, protocol.KindObject:
		body := e.cfg.StringBytes // JSON.stringify fallback
		return varintByteLen(body) + body
	case protocol.KindProperty, protocol.KindPropertySignature, protocol.KindTupleMember, protocol.KindRest:
		return e.estimate(rt.Child, depth+1)
	default:
		return 0 // non-serializable (function / symbol / promise / …) or unknown
	}
}

// numberBytes — packed width from the format BinarySizer, else float64 (8).
func (e *sizeEstimator) numberBytes(rt *protocol.RunType) int {
	if w := e.formatFixed(rt); w > 0 {
		return w
	}
	return 8
}

// bigintBytes — 8 when a 64-bit format packs it, else the decimal-string
// fallback (a modest assumed width).
func (e *sizeEstimator) bigintBytes(rt *protocol.RunType) int {
	if w := e.formatFixed(rt); w > 0 {
		return w
	}
	const decimalDigits = 20
	return varintByteLen(decimalDigits) + decimalDigits
}

// formatFixed returns the format's fixed wire width via formats.BinarySizer, or
// 0 when the type carries no format or the format reports no fixed width.
func (e *sizeEstimator) formatFixed(rt *protocol.RunType) int {
	if rt.FormatAnnotation == nil {
		return 0
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return 0
	}
	sizer, ok := emitter.(formats.BinarySizer)
	if !ok {
		return 0
	}
	return sizer.BinarySize(rt.FormatAnnotation).Fixed
}

// stringBytes — varint length prefix + interpolated content bytes. A fixed- or
// max-length format bound tightens the content estimate; otherwise it anchors
// on cfg.StringBytes.
func (e *sizeEstimator) stringBytes(rt *protocol.RunType) int {
	min, max := e.stringContentBounds(rt)
	content := e.interpolate(min, max)
	return varintByteLen(content) + content
}

func (e *sizeEstimator) stringContentBounds(rt *protocol.RunType) (int, int) {
	minLen, maxLen := 0, e.cfg.StringBytes
	if rt.FormatAnnotation != nil {
		params := rt.FormatAnnotation.Params
		if v, ok := formats.ReadNumberParam(params, "length"); ok {
			length := int(v)
			return length, length // exact (e.g. a fixed-length string)
		}
		if v, ok := formats.ReadNumberParam(params, "maxLength"); ok {
			maxLen = int(v)
		}
		if v, ok := formats.ReadNumberParam(params, "minLength"); ok {
			minLen = int(v)
		}
	}
	if maxLen > e.cfg.MaxBytes {
		maxLen = e.cfg.MaxBytes
	}
	if minLen < 0 {
		minLen = 0
	}
	if minLen > maxLen {
		minLen = maxLen
	}
	return minLen, maxLen
}

// collectionBytes — varint count prefix + count·element, for arrays (and reused
// for tuple rest). count is cfg.Items, tightened by a length / maxItems bound.
func (e *sizeEstimator) collectionBytes(rt *protocol.RunType, elementBytes int) int {
	count := e.cfg.Items
	if rt != nil && rt.FormatAnnotation != nil {
		params := rt.FormatAnnotation.Params
		if v, ok := formats.ReadNumberParam(params, "length"); ok {
			count = int(v)
		} else if v, ok := formats.ReadNumberParam(params, "maxItems"); ok && int(v) < count {
			count = int(v)
		}
	}
	if count < 0 {
		count = 0
	}
	return varintByteLen(count) + count*elementBytes
}

// objectBytes — required fields in full + optional fields weighted by Bias +
// the optional-presence bitmap (ceil(N/8) bytes). Index signatures add their
// own count-prefixed key/value loop.
func (e *sizeEstimator) objectBytes(rt *protocol.RunType, depth int) int {
	total := 0
	optionalCount := 0
	for _, child := range rt.Children {
		member := e.deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		if member.Kind == protocol.KindIndexSignature {
			total += e.indexSigBytes(member, depth)
			continue
		}
		if member.Kind != protocol.KindProperty && member.Kind != protocol.KindPropertySignature {
			continue
		}
		if member.Child == nil {
			continue
		}
		fieldBytes := e.estimate(member.Child, depth+1)
		if member.Optional {
			optionalCount++
			total += e.weighOptional(fieldBytes)
		} else {
			total += fieldBytes
		}
	}
	total += (optionalCount + 7) / 8
	return total
}

// indexSigBytes — uint32 count (back-patched, 4 bytes) + count·(key + value).
func (e *sizeEstimator) indexSigBytes(rt *protocol.RunType, depth int) int {
	keyBytes := e.cfg.StringBytes
	if rt.Index != nil {
		keyBytes = e.estimate(rt.Index, depth+1)
	}
	valBytes := e.estimate(rt.Child, depth+1)
	return 4 + e.cfg.Items*(keyBytes+valBytes)
}

// tupleBytes — required members in full, optional members Bias-weighted plus the
// optional bitmap, a rest member as a count-prefixed collection.
func (e *sizeEstimator) tupleBytes(rt *protocol.RunType, depth int) int {
	total := 0
	optionalCount := 0
	for _, child := range rt.Children {
		member := e.deref(child)
		if member == nil {
			continue
		}
		if member.Kind == protocol.KindRest {
			total += e.collectionBytes(member, e.estimate(member.Child, depth+1))
			continue
		}
		memberType := member
		if member.Kind == protocol.KindTupleMember && member.Child != nil {
			memberType = member.Child
		}
		memberBytes := e.estimate(memberType, depth+1)
		if member.Optional {
			optionalCount++
			total += e.weighOptional(memberBytes)
		} else {
			total += memberBytes
		}
	}
	total += (optionalCount + 7) / 8
	return total
}

// unionBytes — the discriminator (1 byte, 2 above 255 members) plus the
// Bias-interpolated member footprint (smallest ↔ largest).
func (e *sizeEstimator) unionBytes(rt *protocol.RunType, depth int) int {
	members := rt.Children
	if len(members) == 0 {
		return 1
	}
	discriminator := 1
	if len(members) > 255 {
		discriminator = 2
	}
	minBytes, maxBytes := -1, 0
	for _, member := range members {
		b := e.estimate(member, depth+1)
		if minBytes < 0 || b < minBytes {
			minBytes = b
		}
		if b > maxBytes {
			maxBytes = b
		}
	}
	if minBytes < 0 {
		minBytes = 0
	}
	return discriminator + e.interpolate(minBytes, maxBytes)
}

// classBytes — the builtin classes pack to fixed layouts (Date, the compact
// Temporal types); Map/Set are count-prefixed element loops; everything else
// (user classes via a registered serializer, string-fallback Temporal) anchors
// on a string-ish default.
func (e *sizeEstimator) classBytes(rt *protocol.RunType, depth int) int {
	switch rt.SubKind {
	case protocol.SubKindDate:
		return 8
	case protocol.SubKindMap:
		key, val := e.mapElement(rt, depth)
		return varintByteLen(e.cfg.Items) + e.cfg.Items*(key+val)
	case protocol.SubKindSet:
		item := e.setElement(rt, depth)
		return varintByteLen(e.cfg.Items) + e.cfg.Items*item
	case protocol.SubKindTemporalInstant:
		return 12 // int64 seconds + int32 sub-second nanos
	case protocol.SubKindTemporalPlainTime:
		return 9 // hour/min/sec + ms/us/ns
	case protocol.SubKindTemporalPlainDate:
		return 7 // disc + i32 year + month + day
	case protocol.SubKindTemporalPlainDateTime:
		return 16 // disc + date(6) + time(9)
	case protocol.SubKindTemporalPlainYearMonth:
		return 6 // disc + i32 year + month
	case protocol.SubKindTemporalZonedDateTime, protocol.SubKindTemporalDuration, protocol.SubKindTemporalPlainMonthDay:
		body := e.cfg.StringBytes // lossless toJSON() string fallback
		return varintByteLen(body) + body
	case protocol.SubKindNonSerializable:
		return 0
	default:
		body := e.cfg.StringBytes // user class via a registered serializer
		return varintByteLen(body) + body
	}
}

// mapElement / setElement resolve the element types a Map / Set carries on its
// SubKind-tagged children, defaulting to a string-ish estimate when absent.
func (e *sizeEstimator) mapElement(rt *protocol.RunType, depth int) (key, val int) {
	key, val = e.cfg.StringBytes, e.cfg.StringBytes
	for _, child := range rt.Children {
		member := e.deref(child)
		if member == nil {
			continue
		}
		switch member.SubKind {
		case protocol.SubKindMapKey:
			key = e.estimate(member, depth+1)
		case protocol.SubKindMapValue:
			val = e.estimate(member, depth+1)
		}
	}
	return key, val
}

func (e *sizeEstimator) setElement(rt *protocol.RunType, depth int) int {
	item := e.cfg.StringBytes
	for _, child := range rt.Children {
		member := e.deref(child)
		if member != nil && member.SubKind == protocol.SubKindSetItem {
			item = e.estimate(member, depth+1)
		}
	}
	return item
}

// weighOptional scales an optional field's bytes by Bias (its assumed presence).
func (e *sizeEstimator) weighOptional(bytes int) int {
	return int(e.cfg.Bias*float64(bytes) + 0.5)
}

// interpolate returns min + Bias·(max − min).
func (e *sizeEstimator) interpolate(min, max int) int {
	if max <= min {
		return min
	}
	return min + int(e.cfg.Bias*float64(max-min)+0.5)
}

// varintByteLen is the Go mirror of dataView.ts's varintLen — the unsigned
// LEB128 width of n (n < 2**32).
func varintByteLen(n int) int {
	switch {
	case n < 0x80:
		return 1
	case n < 0x4000:
		return 2
	case n < 0x200000:
		return 3
	case n < 0x10000000:
		return 4
	default:
		return 5
	}
}
