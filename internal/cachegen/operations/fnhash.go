package operations

import (
	"fmt"

	"github.com/mionkit/ts-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/ts-runtypes/internal/constants"
)

// FnHashLen is the fixed character length of every fnHash. The operation set is
// finite and closed, so a short length is safe; mustBeCollisionFree proves it at
// init. If a future operation collides, the build fails — bump this constant.
const FnHashLen = 3

// fnHashSalt namespaces operation hashes away from structural type-id hashes so
// the two never share a value by accident, and folds in the binary Version the
// same way type ids do (serialize.go) — so an fnHash is version-isolated exactly
// like a type id, and any on-disk cache keyed by it is auto-invalidated across
// binary versions.
func fnHashSalt(canonicalKey string) string {
	return constants.Version + "|op|" + canonicalKey
}

// Canonical returns the deterministic, property-order-independent hash input for
// an operation + its call-site compile-time args.
//
//   - AxisNone:          the bare Name ("prepareForJson").
//   - AxisValidateOptions: Name + "|" + the canonical ValidateOptions variant suffix
//     ("validate|", "validate|NL", "validate|NLA"). constants.ValidateVariantSuffix
//     emits letters in ValidateOptions DECLARATION order regardless of optionNames
//     order, so {noLiterals,noIsArrayCheck} and {noIsArrayCheck,noLiterals}
//     produce the same key (the sorted-props invariant — see CLAUDE.md / the
//     plan). The type-id side already enforces the same discipline via
//     memberIDs' sort (typeid.go).
//   - AxisJsonStrategy:  Name + "|" + strategy, defaulting an empty strategy to
//     the operation's DefaultStrategy.
//
// Any FUTURE axis that canonicalizes a raw object literal MUST recursively sort
// its keys here to preserve order-independence.
func Canonical(op Operation, optionNames []string, strategy string) string {
	switch op.Axis {
	case AxisValidateOptions:
		return op.Name + "|" + constants.ValidateVariantSuffix(optionNames)
	case AxisJsonStrategy:
		if strategy == "" {
			strategy = op.DefaultStrategy
		}
		return op.Name + "|" + strategy
	default:
		return op.Name
	}
}

// FnHash hashes a canonical key (from Canonical) into the opaque, fixed-length
// fnHash baked into emitted cache keys. PURE: same input → same output, no
// stateful dictionary — this value lives in emitted modules and the on-disk
// cache, so it must never depend on per-run insertion order (unlike the type-id
// hashid.Dict, which grows on collision).
func FnHash(canonicalKey string) string {
	return hashid.QuickHash(fnHashSalt(canonicalKey), FnHashLen, "")
}

// FnHashFor is the one-call convenience: Canonical + FnHash for an operation and
// its call-site args. The scanner uses this to compute the injected fnHash and
// the emitter to name entries.
func FnHashFor(op Operation, optionNames []string, strategy string) string {
	return FnHash(Canonical(op, optionNames, strategy))
}

// PlainHash returns the fnHash of an operation's DEFAULT variant (no options /
// default strategy), looked up by canonical name. Used for cross-family
// references that always target the plain form — e.g. the union-discriminator
// `validate` check (PlainHash("validate")) and a walker's own-family InnerPrefix.
// Panics on an unknown name (a programmer error, caught at first call / in tests).
func PlainHash(name string) string {
	op, ok := byName[name]
	if !ok {
		panic(fmt.Sprintf("operations.PlainHash: unknown operation %q", name))
	}
	return FnHashFor(op, nil, "")
}

// allCanonicalKeys enumerates every canonical key the registry can produce: each
// AxisNone op once, each AxisValidateOptions op over all ValidateOptions subsets, and
// each AxisJsonStrategy op over all its strategies. The collision guard hashes
// this whole set.
func allCanonicalKeys() []string {
	var keys []string
	for _, op := range registry {
		switch op.Axis {
		case AxisValidateOptions:
			for _, subset := range validateOptionSubsets() {
				keys = append(keys, Canonical(op, subset, ""))
			}
		case AxisJsonStrategy:
			for _, strategy := range op.Strategies {
				keys = append(keys, Canonical(op, nil, strategy))
			}
		default:
			keys = append(keys, Canonical(op, nil, ""))
		}
	}
	return keys
}

// validateOptionSubsets returns every subset of the ValidateOptions names (the power
// set), so the collision guard covers every variant an it/te call can request.
func validateOptionSubsets() [][]string {
	names := make([]string, 0, len(constants.ValidateOptions))
	for _, opt := range constants.ValidateOptions {
		names = append(names, opt.Name)
	}
	subsets := make([][]string, 0, 1<<len(names))
	for mask := 0; mask < (1 << len(names)); mask++ {
		var subset []string
		for i, name := range names {
			if mask&(1<<i) != 0 {
				subset = append(subset, name)
			}
		}
		subsets = append(subsets, subset)
	}
	return subsets
}

// mustBeCollisionFree panics if any two distinct canonical keys hash to the same
// fnHash at FnHashLen. Runs at package init so EVERY build / test trips it — the
// "closed system, fail-and-bump" guarantee. A collision is an INTERNAL BUG (the
// length isn't user-configurable and the operation set is ours): never fall back
// or auto-grow — fix it by bumping FnHashLen.
func mustBeCollisionFree() {
	owner := make(map[string]string)
	for _, key := range allCanonicalKeys() {
		hash := FnHash(key)
		if existing, taken := owner[hash]; taken && existing != key {
			panic(fmt.Sprintf(
				"operations: internal bug — fnHash collision at FnHashLen=%d: %q and %q both hash to %q; bump FnHashLen",
				FnHashLen, existing, key, hash,
			))
		}
		owner[hash] = key
	}
}
