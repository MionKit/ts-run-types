package typefns

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// union_unknownkeys.go owns the union-arm emit for every member of the
// unknown-keys JIT family — stripUnknownKeys, unknownKeysToUndefined,
// hasUnknownKeys, unknownKeyErrors. The legacy per-family code each
// re-derived "what counts as a declared key on a union" inline; this
// helper consolidates the decision onto FlatLayout's MergedProps.
//
// Semantic — "loose" merged allowlist:
//   For a union of object members, the declared key set is the UNION of
//   every object member's declared property names. A key present in
//   member A but absent in member B is still "declared" from the union's
//   perspective. This matches the flat encoder's structural identity
//   (the wire merges member properties), and avoids a per-member isType
//   walk on every cleanup call. Trade-off documented on the JS-side
//   doc comments of the public createXxx APIs.
//
// Index-signature carve-out:
//   When the union contains ANY member with an index signature (which
//   FlatLayout buckets into AtomicMembers), the emit is a no-op for the
//   WHOLE family. The runtime value might match the indexed member,
//   where "every key" is declared via the index pattern; applying the
//   merged allowlist would falsely strip valid keys.

// UnknownKeysOpts parameterises the per-family behaviour. Each family's
// KindUnion arm builds an opts struct and calls
// emitUnionUnknownKeysMerged.
type UnknownKeysOpts struct {
	// Snippet is the JS statement run for each undeclared key.
	// `accessor` is the JS expression for the target object (`v` for
	// runtime-shape inputs, `v[1]` for the wire-format reach-in);
	// `keyVar` is the loop variable holding the key name string.
	Snippet func(ctx *EmitContext, accessor, keyVar string) string
	// CodeShape is the resulting JitCode.Type. CodeS for strip/uku/uke
	// (emit statements); CodeE for hasUnknownKeys (the for-loop is
	// wrapped in an IIFE expression that returns `true` on the first
	// undeclared key, `false` after the loop completes).
	CodeShape CodeType
	// JsonWireFormat — true only for ukuWire (the decoder-internal
	// emitter). Prepends `if (Array.isArray(v) && v.length === 2 &&
	// v[0] === -1)` and walks `v[1]` instead of `v`. Always false for
	// the four public-API emitters.
	JsonWireFormat bool
}

// emitUnionUnknownKeysMerged is the consolidated union-arm emit. Reads
// the FlatLayout for the union and produces the per-family for-loop +
// merged-allowlist guard. Returns empty JitCode when there's no work
// to do (atomic-only union, all-index-sig union, …).
func emitUnionUnknownKeysMerged(rt *protocol.RunType, ctx *EmitContext, opts UnknownKeysOpts) JitCode {
	layout := buildFlatLayout(rt, ctx)

	// Index-sig carve-out — any indexed member kills the merged-allowlist
	// approach for the whole union (the runtime value might match the
	// indexed branch, where every key is declared via the pattern).
	for _, atomic := range layout.AtomicMembers {
		if atomic.Resolved == nil {
			continue
		}
		if isObjectLikeKind(atomic.Resolved.Kind) && objectHasIndexSignatureChild(atomic.Resolved, ctx) {
			return JitCode{Code: "", Type: opts.CodeShape}
		}
	}

	// Atomic-only union — atomic primitives carry no keys; the family
	// has nothing to do.
	if len(layout.ObjectMembers) == 0 {
		return JitCode{Code: "", Type: opts.CodeShape}
	}
	if len(layout.MergedProps) == 0 {
		return JitCode{Code: "", Type: opts.CodeShape}
	}

	target := ctx.Vλl
	if opts.JsonWireFormat {
		target = ctx.Vλl + "[1]"
	}

	keyVar := ctx.NextLocalVar("uk")
	allowlist := buildAllowlistGuard(layout.MergedProps, keyVar)
	snippet := opts.Snippet(ctx, target, keyVar)
	body := "for (const " + keyVar + " in " + target + ") { if (!(" + allowlist + ")) { " + snippet + "; } }"

	switch opts.CodeShape {
	case CodeE:
		// hasUnknownKeys wraps the loop in an IIFE: snippet emits
		// `return true` inside the loop; the IIFE returns `false`
		// after the loop terminates with no hit. The whole IIFE is
		// a single CodeE expression.
		iife := "(function(){ " + body + " return false; })()"
		if opts.JsonWireFormat {
			gate := "if (Array.isArray(" + ctx.Vλl + ") && " + ctx.Vλl + ".length === 2 && " + ctx.Vλl + "[0] === -1) return " + iife + "; return false;"
			return JitCode{Code: "(function(){ " + gate + " })()", Type: CodeE}
		}
		return JitCode{Code: iife, Type: CodeE}
	default:
		if opts.JsonWireFormat {
			gated := "if (Array.isArray(" + ctx.Vλl + ") && " + ctx.Vλl + ".length === 2 && " + ctx.Vλl + "[0] === -1) { " + body + " }"
			return JitCode{Code: gated, Type: CodeS}
		}
		return JitCode{Code: body, Type: CodeS}
	}
}

// buildAllowlistGuard renders the JS expression that's true when keyVar
// matches one of the merged property names. Inline disjunction over a
// Set.has lookup — for typical 2-6 property counts the cost is
// negligible and avoids the Set allocation.
func buildAllowlistGuard(props []FlatMergedProp, keyVar string) string {
	if len(props) == 0 {
		return "false"
	}
	parts := make([]string, 0, len(props))
	for _, mp := range props {
		parts = append(parts, keyVar+" === "+quoteJS(mp.Name))
	}
	return strings.Join(parts, " || ")
}
