package protocol

// Family classifies a RunType into one of four buckets: Atomic (A),
// Collection (C), Member (M), or Function (F). Mirrors mion's
// `RunTypeFamily` (run-types/src/types.ts:41) and the per-class
// `getFamily()` overrides in BaseRunType / AtomicRunType /
// CollectionRunType / MemberRunType / FunctionRunType.
//
// Used by the JIT compiler's inline-vs-dependent predicate
// (BaseRunType.isJitInlined treats named Collections as dependencies
// so their factories can be reused across reference sites — see
// run-types/src/lib/baseRunTypes.ts:52).
//
// Single-character string values match mion's wire form so JS-side
// consumers can compare without translation.
type Family string

const (
	// FamilyUnknown is the zero value — emitted as the empty string,
	// which `omitempty` strips from the JSON envelope. Refs
	// (KindRef sentinel) and reserved kinds (TypeParameter / Infer)
	// have no family classification.
	FamilyUnknown Family = ""
	// FamilyAtomic is mion's 'A'. Single-shape values that have no
	// children (string, number, null, literal, …) and inline cheaply.
	FamilyAtomic Family = "A"
	// FamilyCollection is mion's 'C'. Has children that compose into
	// the parent's emitted code (objectLiteral, class, union,
	// intersection, tuple, templateLiteral).
	FamilyCollection Family = "C"
	// FamilyMember is mion's 'M'. Wraps a single child with a parent-
	// relative accessor (property, parameter, array, rest,
	// indexSignature, tupleMember, promise).
	FamilyMember Family = "M"
	// FamilyFunction is mion's 'F'. Functions / methods /
	// call-signatures — anything with parameters + a return type.
	FamilyFunction Family = "F"
)

// FamilyOf returns the Family classification for a ReflectionKind.
// Single source of truth for the Kind→Family mapping; both the JIT
// compiler's inlining predicate and the wire-field populator route
// through here.
//
// Kinds with no family classification (KindRef, KindTypeParameter,
// KindInfer) return FamilyUnknown so the wire field stays empty and
// `omitempty` strips them.
//
// Stays in lockstep with the family-per-class declarations in
// mion's run-types/src/nodes/*/*.ts — see the spec files for which
// node class each ReflectionKind maps to.
func FamilyOf(kind ReflectionKind) Family {
	switch kind {
	// Atomic — run-types/src/nodes/atomic/*.ts.
	case KindAny, KindUnknown, KindNever, KindVoid,
		KindNull, KindUndefined,
		KindString, KindNumber, KindBoolean, KindBigInt, KindSymbol,
		KindObject, KindRegexp, KindLiteral,
		KindEnum, KindEnumMember:
		return FamilyAtomic

	// Collection — run-types/src/nodes/collection/*.ts. Note:
	// templateLiteral lives under collection/ in mion despite
	// "atomic" connotations — its emitted code composes a regex from
	// child segments, so it's a Collection family-wise.
	case KindObjectLiteral, KindClass,
		KindUnion, KindIntersection,
		KindTuple, KindTemplateLiteral:
		return FamilyCollection

	// Member — run-types/src/nodes/member/*.ts + native/promise.ts.
	// Each wraps a single child accessor. KindArray is a Member in
	// mion (member/array.ts) even though we name it "Array" — the
	// node wraps one element-type child via `Child`.
	case KindProperty, KindPropertySignature, KindParameter,
		KindArray, KindRest,
		KindIndexSignature, KindTupleMember,
		KindPromise:
		return FamilyMember

	// Function — run-types/src/nodes/function/function.ts +
	// member/method.ts + member/methodSignature.ts +
	// member/callSignature.ts. Despite living under member/ in
	// mion's directory layout, method / methodSignature /
	// callSignature all extend FunctionRunType and getFamily()
	// returns 'F'.
	case KindFunction, KindMethod, KindMethodSignature, KindCallSignature:
		return FamilyFunction
	}
	return FamilyUnknown
}

// PopulateFamily recursively walks a RunType and sets `Family` on
// every concrete node it visits. Called at cache-exit time
// (Cache.Dump and friends) so every wire-bound node carries its
// family before the JSON envelope is built.
//
// Idempotent — re-running on an already-populated tree is a no-op
// modulo the function-call overhead. Refs (KindRef) terminate the
// recursion because they're just pointers; their canonical node is
// populated separately when the same walk reaches it via cache.nodes.
func PopulateFamily(runType *RunType) {
	if runType == nil {
		return
	}
	runType.Family = FamilyOf(runType.Kind)

	for _, child := range runType.Children {
		PopulateFamily(child)
	}
	for _, typeArg := range runType.TypeArguments {
		PopulateFamily(typeArg)
	}
	for _, parameter := range runType.Parameters {
		PopulateFamily(parameter)
	}
	PopulateFamily(runType.Return)
	PopulateFamily(runType.Child)
	PopulateFamily(runType.Index)
	PopulateFamily(runType.IndexT)
	for _, decorator := range runType.Decorators {
		PopulateFamily(decorator)
	}
	for _, safeChild := range runType.SafeUnionChildren {
		PopulateFamily(safeChild)
	}
	for _, discriminator := range runType.UnionDiscriminators {
		PopulateFamily(discriminator)
	}
	for _, extendArg := range runType.ExtendsArguments {
		PopulateFamily(extendArg)
	}
	for _, impl := range runType.Implements {
		PopulateFamily(impl)
	}
	for _, argument := range runType.Arguments {
		PopulateFamily(argument)
	}
	for _, extend := range runType.Extends {
		PopulateFamily(extend)
	}
}
